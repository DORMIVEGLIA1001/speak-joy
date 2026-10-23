import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Unit tests for Color_Token HSL and WCAG contrast (Task 3.3).
// Reads the real fe/src/index.css and verifies:
//   - --color-duo-green: hue in [90,150], saturation >= 70%
//   - --color-text-tertiary: saturation <= 20%, contrast >= 4.5:1 on the light bg
//   - warm accent tokens: hue in [0,60] U [300,360], saturation >= 70%
// Validates: Requirements 2.1, 2.2, 2.3

// --- Locate and read index.css -------------------------------------------------
const here = path.dirname(fileURLToPath(import.meta.url));
// here = fe/src/lib/ui -> index.css is at fe/src/index.css
const cssPath = path.resolve(here, '../../index.css');
const css = readFileSync(cssPath, 'utf8');

// --- Helpers: parse hex tokens -------------------------------------------------
/**
 * Extract the hex value assigned to a CSS custom property from the raw CSS text.
 * Returns the first (definition) occurrence. Throws if not found.
 */
function getTokenHex(name: string): string {
  // Match e.g.  --color-duo-green: #58cc02;
  const re = new RegExp(`${name.replace(/[-]/g, '\\-')}\\s*:\\s*(#[0-9a-fA-F]{3,8})`);
  const m = css.match(re);
  if (!m) {
    throw new Error(`Token ${name} with a hex value not found in index.css`);
  }
  return m[1];
}

/** Parse a #rgb / #rrggbb hex string into [r,g,b] in 0..255. */
function hexToRgb(hex: string): [number, number, number] {
  let h = hex.replace('#', '');
  if (h.length === 3) {
    h = h.split('').map((c) => c + c).join('');
  }
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return [r, g, b];
}

/** Convert hex to HSL with h in [0,360), s/l in [0,100]. */
function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const [r255, g255, b255] = hexToRgb(hex);
  const r = r255 / 255;
  const g = g255 / 255;
  const b = b255 / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  const l = (max + min) / 2;

  let h = 0;
  let s = 0;
  if (delta !== 0) {
    s = delta / (1 - Math.abs(2 * l - 1));
    switch (max) {
      case r:
        h = ((g - b) / delta) % 6;
        break;
      case g:
        h = (b - r) / delta + 2;
        break;
      default:
        h = (r - g) / delta + 4;
        break;
    }
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: s * 100, l: l * 100 };
}

/** WCAG relative luminance for an [r,g,b] (0..255) color. */
function relativeLuminance([r255, g255, b255]: [number, number, number]): number {
  const channel = (c: number) => {
    const cs = c / 255;
    return cs <= 0.03928 ? cs / 12.92 : Math.pow((cs + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(r255) + 0.7152 * channel(g255) + 0.0722 * channel(b255);
}

/** WCAG contrast ratio between two hex colors. */
function contrastRatio(hexA: string, hexB: string): number {
  const la = relativeLuminance(hexToRgb(hexA));
  const lb = relativeLuminance(hexToRgb(hexB));
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Helper to check a hue lies within any of the allowed inclusive ranges. */
function hueInRanges(h: number, ranges: Array<[number, number]>): boolean {
  return ranges.some(([lo, hi]) => h >= lo && h <= hi);
}

// --- Tests ---------------------------------------------------------------------

describe('Color_Token HSL and contrast (Requirements 2.1, 2.2, 2.3)', () => {
  it('--color-duo-green is a green with hue in [90,150] and saturation >= 70% (Req 2.2)', () => {
    const hex = getTokenHex('--color-duo-green');
    const { h, s } = hexToHsl(hex);
    expect(h).toBeGreaterThanOrEqual(90);
    expect(h).toBeLessThanOrEqual(150);
    expect(s).toBeGreaterThanOrEqual(70);
  });

  it('--color-text-tertiary is neutral (sat <= 20%) with contrast >= 4.5:1 on the light bg (Req 2.3)', () => {
    const tertiary = getTokenHex('--color-text-tertiary');
    const { s } = hexToHsl(tertiary);
    expect(s).toBeLessThanOrEqual(20);

    // Light/default background is --app-bg in :root.
    const appBg = getTokenHex('--app-bg');
    const ratio = contrastRatio(tertiary, appBg);
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });

  it('warm accent tokens have hue in [0,60] U [300,360] and saturation >= 70% (Req 2.1)', () => {
    const warmTokens = [
      '--color-warm-coral',
      '--color-warm-amber',
      '--color-warm-pink',
      '--color-warm-magenta',
    ];
    const ranges: Array<[number, number]> = [
      [0, 60],
      [300, 360],
    ];

    for (const token of warmTokens) {
      const hex = getTokenHex(token);
      const { h, s } = hexToHsl(hex);
      expect(
        hueInRanges(h, ranges),
        `${token} (${hex}) hue ${h.toFixed(1)}deg should be in [0,60] U [300,360]`,
      ).toBe(true);
      expect(
        s,
        `${token} (${hex}) saturation ${s.toFixed(1)}% should be >= 70%`,
      ).toBeGreaterThanOrEqual(70);
    }
  });
});
