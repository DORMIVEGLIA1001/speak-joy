// Feature: responsive-speaking-ui
// Pure responsive helper functions for the SpeakJoy Vite/React frontend.
//
// These functions encapsulate the few numeric responsive rules that cannot be
// expressed in CSS alone (breakpoint classification, fluid font-size clamping,
// mascot sizing, message-bubble max width). They are deterministic, total
// (defined for negative/fractional/large/non-finite inputs) and side-effect
// free. They MUST NOT touch business state, app behavior, fetch calls, sessions,
// speech recognition/synthesis, or scoring — they only feed className/style
// decisions in the presentation layer.

/** Layout classification derived from the current viewport width. */
export type Layout = 'mobile' | 'tablet' | 'desktop';

/**
 * Responsive breakpoint thresholds (CSS px). Single source of truth shared
 * with the `useBreakpoint` hook and Tailwind responsive prefixes.
 * - Mobile:  width < 768
 * - Tablet:  768 <= width <= 1024
 * - Desktop: width > 1024
 * (Requirements 2.1, 2.2, 2.3)
 */
export const BREAKPOINTS = { tablet: 768, desktop: 1024 } as const;

/** Minimum touch-target size in px (Requirements 3.3, 6.1, 10.5). */
export const TOUCH_TARGET_MIN_PX = 48;

/** Minimum gap between adjacent touch targets in px (Requirements 6.2, 10.5). */
export const TOUCH_TARGET_GAP_MIN_PX = 8;

/** Minimum body-text size in px (Requirement 9.1). */
export const FONT_MIN_PX = 14;

/** Maximum body-text size in px (Requirement 9.1). */
export const FONT_MAX_PX = 24;

/** Message-bubble max width as a ratio of its container (Requirement 7.4). */
export const BUBBLE_MAX_RATIO = 0.85;

/** Mobile mascot lower bound as a ratio of the viewport width (Requirement 5.1). */
export const MASCOT_MOBILE_MIN_RATIO = 0.40;

/** Mobile mascot upper bound as a ratio of the viewport width (Requirement 5.1). */
export const MASCOT_MOBILE_MAX_RATIO = 0.90;

/** Desktop mascot upper bound as a ratio of the viewport width (Requirement 5.2). */
export const MASCOT_DESKTOP_MAX_RATIO = 0.50;

/** Tablet mascot upper bound as a ratio of the viewport width (between mobile and desktop). */
export const MASCOT_TABLET_MAX_RATIO = 0.70;

/** Mascot width bounds in CSS pixels. */
export interface MascotSizing {
  minPx: number;
  maxPx: number;
}

/**
 * Classify a viewport width into exactly one {@link Layout}.
 * Boundary rules (honored exactly):
 *   767  -> 'mobile'
 *   768  -> 'tablet'
 *   1024 -> 'tablet'
 *   1025 -> 'desktop'
 * Non-finite inputs fall back to 'desktop' (the widest, safest default for SSR).
 *
 * (Requirements 2.1, 2.2, 2.3)
 */
export function classifyBreakpoint(width: number): Layout {
  if (!Number.isFinite(width)) {
    return 'desktop';
  }
  if (width < BREAKPOINTS.tablet) {
    return 'mobile';
  }
  if (width <= BREAKPOINTS.desktop) {
    return 'tablet';
  }
  return 'desktop';
}

/**
 * Clamp a requested font size (px) into the readable range [min, max]
 * (default [14, 24]). The function is idempotent and returns in-range inputs
 * unchanged. Non-finite inputs (NaN/Infinity) resolve to `min`.
 *
 * (Requirement 9.1)
 */
export function clampFontSize(px: number, min: number = FONT_MIN_PX, max: number = FONT_MAX_PX): number {
  if (!Number.isFinite(px)) {
    return min;
  }
  return Math.min(Math.max(px, min), max);
}

/**
 * Compute the allowed mascot width bounds (CSS px) for a given viewport width
 * and layout. Guarantees `minPx <= maxPx <= effectiveWidth` for any
 * non-negative finite width.
 *   - Mobile:  { minPx: 0.40 * vw, maxPx: 0.90 * vw }
 *   - Tablet:  { minPx: 0.40 * vw, maxPx: 0.70 * vw }
 *   - Desktop: { minPx: 0.40 * vw, maxPx: 0.50 * vw } — never smaller than the
 *     mobile-equivalent lower bound and never larger than half the viewport.
 * Negative or non-finite widths are treated as 0 so the result is always sane.
 *
 * (Requirements 5.1, 5.2)
 */
export function mascotWidthBounds(viewportWidth: number, layout: Layout): MascotSizing {
  const vw = Number.isFinite(viewportWidth) ? Math.max(0, viewportWidth) : 0;
  const minPx = MASCOT_MOBILE_MIN_RATIO * vw;

  switch (layout) {
    case 'mobile':
      return { minPx, maxPx: MASCOT_MOBILE_MAX_RATIO * vw };
    case 'tablet':
      return { minPx, maxPx: MASCOT_TABLET_MAX_RATIO * vw };
    case 'desktop':
    default:
      return { minPx, maxPx: MASCOT_DESKTOP_MAX_RATIO * vw };
  }
}

/**
 * Compute the maximum width (CSS px) of a chat message bubble as 85% of its
 * container width. Always `<= containerWidth` for non-negative inputs.
 *
 * (Requirement 7.4)
 */
export function messageBubbleMaxWidthPx(containerWidth: number): number {
  return BUBBLE_MAX_RATIO * containerWidth;
}
