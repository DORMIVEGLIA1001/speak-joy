// Pure WCAG contrast helpers (spec: responsive-speaking-ui).
//
// These functions implement the WCAG 2.x relative-luminance and contrast-ratio
// math. They are deterministic, total, and side-effect free so the numeric
// rules can be verified in isolation (used by the Property 5 contrast test).
//
// Reference: https://www.w3.org/TR/WCAG21/#dfn-relative-luminance
//            https://www.w3.org/TR/WCAG21/#dfn-contrast-ratio

/** An [r, g, b] triple with each channel in the 0..255 range. */
export type Rgb = [number, number, number];

/**
 * Parse a CSS hex color (`#rgb`, `#rrggbb`, or `#rrggbbaa`) into an [r,g,b]
 * triple in 0..255. Any alpha channel is ignored. The leading `#` is optional.
 */
export function hexToRgb(hex: string): Rgb {
  let h = hex.trim().replace(/^#/, '');
  if (h.length === 3) {
    h = h
      .split('')
      .map((c) => c + c)
      .join('');
  }
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return [r, g, b];
}

/**
 * WCAG relative luminance for an [r,g,b] color (channels in 0..255).
 * Returns a value in [0, 1].
 */
export function relativeLuminance([r, g, b]: Rgb): number {
  const channel = (c: number) => {
    const cs = c / 255;
    return cs <= 0.03928 ? cs / 12.92 : Math.pow((cs + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/**
 * WCAG contrast ratio between two hex colors. The result is always >= 1,
 * symmetric in its arguments, and computed as
 * `(L_lighter + 0.05) / (L_darker + 0.05)`.
 */
export function contrastRatio(hexA: string, hexB: string): number {
  const la = relativeLuminance(hexToRgb(hexA));
  const lb = relativeLuminance(hexToRgb(hexB));
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}
