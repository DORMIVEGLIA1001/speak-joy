// Feature: kid-friendly-ui-improvements
// Pure presentation utilities for the SpeakJoy_Kids_App.
//
// These functions encapsulate presentation-only decisions (default theme/language
// resolution, content font-size clamping, kid-friendly label casing, progress
// clamping). They are side-effect free and operate solely on presentation values
// (label strings, px numbers, display percentages). They MUST NOT touch business
// state or change real XP/score values.
//
// NOTE: This file is the scaffold (task 1.2). Function bodies are placeholder
// stubs that will be fully implemented in task 2.1.

/** Theme identifiers handled by the Theme_Engine. */
export type Theme = 'light' | 'dark';

/** Display language identifiers. */
export type Lang = 'en' | 'vi';

/**
 * Design constants shared across the presentation layer.
 * Values are sourced from the "Hằng số thiết kế (Design constants)" table in design.md.
 */
export const DESIGN = {
  fontSize: { min: 14, max: 32 },        // Req 6.1, 6.2
  lineHeightMin: 1.4,                    // Req 6.5
  emphasisFontWeightMin: 600,            // Req 6.6
  touchTargetMin: 48,                    // Req 7.1, 10.5
  touchTargetGapMin: 8,                  // Req 7.6
  primaryScaleFactorMin: 1.2,            // Req 7.2 (lớn hơn ≥20%)
  tapFeedbackMaxMs: 100,                 // Req 7.4
  themeSwitchMaxMs: 1000,                // Req 3.4, 4.6, 5.7
  themeApplyMaxMs: 2000,                 // Req 3.1
  radius: { card: 16, button: 12 },      // Req 9.2 (đồng nhất theo nhóm)
  mascotMinFps: 24,
  mascotLoopGapMaxMs: 500,               // Req 8.2
  celebrationMinMs: 1000,
  celebrationMaxMs: 3000,                // Req 8.3, 8.4, 8.7
  confettiMinScreenCoverage: 0.5,        // Req 8.7
  contrast: { normalTextMin: 4.5, largeTextMin: 3.0, uiMin: 3.0 }, // Req 7.3, 9.3, 9.4, 10.1
} as const;

/**
 * Resolve the initial theme from a previously stored value.
 * Returns the stored value when it is exactly 'light' or 'dark'; otherwise
 * falls back to 'light' (default + safe fallback).
 *
 * Req 3.1, 3.2, 3.6 — implemented in task 2.1.
 */
export function resolveInitialTheme(stored: string | null | undefined): Theme {
  return stored === 'light' || stored === 'dark' ? stored : 'light';
}

/**
 * Resolve the display language from an arbitrary value.
 * Returns the value when it is exactly 'en' or 'vi'; otherwise falls back to 'vi'.
 *
 * Req 5.5, 5.6 — implemented in task 2.1.
 */
export function resolveLang(value: unknown): Lang {
  return value === 'en' || value === 'vi' ? value : 'vi';
}

/**
 * Clamp a content font size (px) into the valid range [14, 32].
 * Non-finite inputs (NaN/Infinity) resolve to the minimum (14).
 *
 * Req 6.1, 6.2 — implemented in task 2.1.
 */
export function enforceContentFontSize(px: number): number {
  // Non-finite inputs (NaN, +/-Infinity) resolve to the minimum.
  if (!Number.isFinite(px)) {
    return DESIGN.fontSize.min;
  }
  return Math.min(Math.max(px, DESIGN.fontSize.min), DESIGN.fontSize.max);
}

/**
 * Normalize a label so that no all-uppercase "word" longer than 3 characters
 * remains, converting such words to sentence-case. Idempotent.
 *
 * Req 6.4 — implemented in task 2.1.
 */
export function toKidCase(label: string): string {
  // Match maximal runs of letters (incl. combining marks for diacritics).
  // For each such "word" longer than 3 characters that is entirely uppercase,
  // convert it to sentence-case (first letter upper, rest lower). All other
  // tokens (punctuation, digits, spaces, short or mixed-case words) are left
  // untouched, which makes the transform idempotent.
  return label.replace(/[\p{L}\p{M}]+/gu, (word) => {
    const chars = Array.from(word);
    if (chars.length <= 3) {
      return word;
    }
    const isAllUpper = word === word.toUpperCase() && word !== word.toLowerCase();
    if (!isAllUpper) {
      return word;
    }
    const [first, ...rest] = chars;
    return first.toUpperCase() + rest.join('').toLowerCase();
  });
}

/**
 * Clamp a display progress value into [0, 100]. Identity within the range.
 * Non-finite inputs are handled explicitly.
 *
 * Req 9.5, 9.6 — implemented in task 2.1.
 */
export function clampProgress(value: number): number {
  // Treat NaN as 0; +/-Infinity are clamped to the nearest bound by Math.min/max.
  if (Number.isNaN(value)) {
    return 0;
  }
  return Math.min(Math.max(value, 0), 100);
}
