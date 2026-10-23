import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Feature: kid-friendly-ui-improvements, Property 6: Tính duy nhất và không rỗng của Color_Token.
// For any Color_Token declared in fe/src/index.css, the token is defined exactly
// once and has a non-empty value (after parsing the @theme block).
// Validates: Requirements 2.5

/** Absolute path to the real stylesheet under test (fe/src/index.css). */
const CSS_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../index.css',
);

/**
 * Parse the `@theme { ... }` block from the real index.css and enumerate the
 * full set of Color_Token declarations (CSS custom properties named `--color-*`).
 * Returns, for each token name, the list of values declared for it so callers
 * can assert both uniqueness (exactly one declaration) and non-emptiness.
 */
function parseThemeColorTokens(css: string): Map<string, string[]> {
  // Extract the @theme block body. The @theme block contains no nested braces,
  // so a non-greedy match up to the first closing brace is correct.
  const themeMatch = css.match(/@theme\s*\{([\s\S]*?)\}/);
  if (!themeMatch) {
    throw new Error('No @theme block found in index.css');
  }

  // Strip CSS comments so commented-out declarations are not counted.
  const body = themeMatch[1].replace(/\/\*[\s\S]*?\*\//g, '');

  // Match every custom-property declaration: `--name: value;`.
  const declRe = /(--[\w-]+)\s*:\s*([^;]*);/g;
  const tokens = new Map<string, string[]>();
  let m: RegExpExecArray | null;
  while ((m = declRe.exec(body)) !== null) {
    const name = m[1];
    const value = m[2].trim();
    // Color_Token = CSS variables that define a color (the `--color-*` family).
    if (!name.startsWith('--color-')) {
      continue;
    }
    const existing = tokens.get(name);
    if (existing) {
      existing.push(value);
    } else {
      tokens.set(name, [value]);
    }
  }
  return tokens;
}

describe('Color_Token — Property 6: uniqueness and non-emptiness', () => {
  const css = fs.readFileSync(CSS_PATH, 'utf-8');
  const tokens = parseThemeColorTokens(css);
  const tokenNames = [...tokens.keys()];

  it('parses a non-empty set of color tokens from the real @theme block', () => {
    // Guard: the property below is only meaningful if tokens were actually found.
    expect(tokenNames.length).toBeGreaterThan(0);
  });

  it('defines every Color_Token exactly once with a non-empty value', () => {
    fc.assert(
      fc.property(fc.constantFrom(...tokenNames), (name) => {
        const values = tokens.get(name)!;

        // Uniqueness: the token is declared exactly once in the @theme block.
        expect(values).toHaveLength(1);

        // Non-emptiness: the single declared value is not blank.
        expect(values[0].length).toBeGreaterThan(0);
      }),
      { numRuns: 100 },
    );
  });
});
