import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { contrastRatio } from './contrast';

// Feature: responsive-speaking-ui, Property 5: Text/background token pairs meet WCAG AA contrast.
//
// For any foreground text color token paired with its background token from the
// set of color combinations actually used to render text, contrastRatio(text,
// background) SHALL be >= 4.5 for body-text pairs and >= 3.0 for large-text
// pairs, in both light and dark themes.
//
// Validates: Requirements 9.6

/** WCAG AA thresholds (Requirement 9.6). */
const BODY_TEXT_MIN_RATIO = 4.5;
const LARGE_TEXT_MIN_RATIO = 3.0;

/** Absolute path to the real stylesheet under test (fe/src/index.css). */
const CSS_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../index.css',
);

/**
 * Extract the body of a CSS rule block given its selector. The targeted theme
 * blocks (`:root`, `[data-theme='dark']`) contain no nested braces, so a
 * non-greedy match up to the first closing brace is correct.
 */
function extractBlock(css: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`${escaped}\\s*\\{([\\s\\S]*?)\\}`);
  const m = css.match(re);
  if (!m) {
    throw new Error(`Block for selector "${selector}" not found in index.css`);
  }
  return m[1];
}

/** Read a single `--token: #hexvalue;` declaration from a CSS block body. */
function getHexToken(block: string, name: string): string {
  const re = new RegExp(`${name}\\s*:\\s*(#[0-9a-fA-F]{3,8})`);
  const m = block.match(re);
  if (!m) {
    throw new Error(`Hex token ${name} not found in theme block`);
  }
  return m[1];
}

interface ThemeTokens {
  bg: string;
  bgAlt: string;
  surface: string;
  surfaceAlt: string;
  text: string;
  textMuted: string;
}

/** Parse the --app-* color tokens for one theme block. */
function parseTheme(block: string): ThemeTokens {
  return {
    bg: getHexToken(block, '--app-bg'),
    bgAlt: getHexToken(block, '--app-bg-alt'),
    surface: getHexToken(block, '--app-surface'),
    surfaceAlt: getHexToken(block, '--app-surface-alt'),
    text: getHexToken(block, '--app-text'),
    textMuted: getHexToken(block, '--app-text-muted'),
  };
}

interface Pair {
  theme: string;
  textName: string;
  text: string;
  bgName: string;
  background: string;
  minRatio: number;
}

/**
 * Enumerate the finite set of (text, background) token pairs actually used to
 * render text. App body text is driven by `--app-text` (set on `body`) and
 * muted text by `--app-text-muted`; both render over the page background
 * (`--app-bg` / `--app-bg-alt`) and over raised surfaces (`--app-surface` /
 * `--app-surface-alt`). These are all body-text pairs, so each must meet the
 * 4.5:1 body-text threshold.
 */
function enumeratePairs(themeName: string, t: ThemeTokens): Pair[] {
  const texts: Array<[string, string]> = [
    ['--app-text', t.text],
    ['--app-text-muted', t.textMuted],
  ];
  const backgrounds: Array<[string, string]> = [
    ['--app-bg', t.bg],
    ['--app-bg-alt', t.bgAlt],
    ['--app-surface', t.surface],
    ['--app-surface-alt', t.surfaceAlt],
  ];
  const pairs: Pair[] = [];
  for (const [textName, text] of texts) {
    for (const [bgName, background] of backgrounds) {
      pairs.push({
        theme: themeName,
        textName,
        text,
        bgName,
        background,
        minRatio: BODY_TEXT_MIN_RATIO,
      });
    }
  }
  return pairs;
}

const css = readFileSync(CSS_PATH, 'utf8');
const lightTokens = parseTheme(extractBlock(css, ':root'));
const darkTokens = parseTheme(extractBlock(css, "[data-theme='dark']"));

const allPairs: Pair[] = [
  ...enumeratePairs('light', lightTokens),
  ...enumeratePairs('dark', darkTokens),
];

describe('Property 5: Text/background token pairs meet WCAG AA contrast', () => {
  it('enumerates a non-empty set of used (text, background) pairs for both themes', () => {
    // Guard: the property below is only meaningful if pairs were discovered.
    expect(allPairs.length).toBeGreaterThan(0);
    expect(allPairs.some((p) => p.theme === 'light')).toBe(true);
    expect(allPairs.some((p) => p.theme === 'dark')).toBe(true);
  });

  it('every used token pair meets its WCAG AA threshold in light and dark themes', () => {
    fc.assert(
      fc.property(fc.constantFrom(...allPairs), (pair) => {
        const ratio = contrastRatio(pair.text, pair.background);
        expect(
          ratio,
          `${pair.theme}: ${pair.textName} (${pair.text}) on ${pair.bgName} ` +
            `(${pair.background}) = ${ratio.toFixed(2)}:1, needs >= ${pair.minRatio}:1`,
        ).toBeGreaterThanOrEqual(pair.minRatio);
      }),
      { numRuns: 25 },
    );
  });

  // Exhaustive companion to the fuzzed property above: directly assert every
  // enumerated pair so the full finite set is covered deterministically and
  // the large-text floor (3.0) holds for all pairs as well (Requirement 9.6).
  it.each(allPairs)(
    '$theme: $textName on $bgName meets body (>=4.5) and large-text (>=3.0) contrast',
    (pair) => {
      const ratio = contrastRatio(pair.text, pair.background);
      expect(ratio).toBeGreaterThanOrEqual(BODY_TEXT_MIN_RATIO);
      expect(ratio).toBeGreaterThanOrEqual(LARGE_TEXT_MIN_RATIO);
    },
  );
});
