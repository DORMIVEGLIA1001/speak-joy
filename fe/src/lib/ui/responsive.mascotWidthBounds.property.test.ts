import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  mascotWidthBounds,
  MASCOT_MOBILE_MIN_RATIO,
  MASCOT_MOBILE_MAX_RATIO,
  MASCOT_DESKTOP_MAX_RATIO,
  type Layout,
} from './responsive';

// Feature: responsive-speaking-ui, Property 3: Mascot width bounds stay within
// device-appropriate limits.
//
// For any viewport width and layout, mascotWidthBounds(width, layout) satisfies
// minPx <= maxPx and maxPx <= width. On Mobile, minPx === 0.40 * width and
// maxPx === 0.90 * width. On Desktop, maxPx <= 0.50 * width and minPx is >= the
// Mobile-equivalent lower bound for the same width, so the desktop mascot is
// never smaller than on mobile and never exceeds half the viewport.
//
// Validates: Requirements 5.1, 5.2

const LAYOUTS: Layout[] = ['mobile', 'tablet', 'desktop'];

/**
 * Non-negative finite viewport widths spanning the realistic device range and
 * beyond, including the degenerate width 0 and fractional values. The helper is
 * total for any number, but the device-appropriate ordering constraint
 * (maxPx <= width) is only meaningful for non-negative widths.
 */
const widthArb = fc.oneof(
  fc.double({ min: 0, max: 5000, noNaN: true }),
  // Emphasis on common real-device widths.
  fc.constantFrom(0, 320, 375, 414, 768, 1024, 1280, 1440, 1920),
);

const layoutArb = fc.constantFrom(...LAYOUTS);

describe('mascotWidthBounds — Property 3: device-appropriate bounds', () => {
  it('keeps minPx <= maxPx <= viewport width for any width and layout', () => {
    fc.assert(
      fc.property(widthArb, layoutArb, (width, layout) => {
        const { minPx, maxPx } = mascotWidthBounds(width, layout);

        expect(minPx).toBeLessThanOrEqual(maxPx);
        expect(maxPx).toBeLessThanOrEqual(width);
        expect(minPx).toBeGreaterThanOrEqual(0);
      }),
      { numRuns: 25 },
    );
  });

  it('uses exact mobile ratios (0.40 / 0.90) on Mobile', () => {
    fc.assert(
      fc.property(widthArb, (width) => {
        const { minPx, maxPx } = mascotWidthBounds(width, 'mobile');

        expect(minPx).toBe(MASCOT_MOBILE_MIN_RATIO * width);
        expect(maxPx).toBe(MASCOT_MOBILE_MAX_RATIO * width);
      }),
      { numRuns: 25 },
    );
  });

  it('caps Desktop maxPx at 50% of viewport and keeps minPx >= mobile-equivalent lower bound', () => {
    fc.assert(
      fc.property(widthArb, (width) => {
        const desktop = mascotWidthBounds(width, 'desktop');
        const mobile = mascotWidthBounds(width, 'mobile');

        // Desktop never exceeds half the viewport.
        expect(desktop.maxPx).toBeLessThanOrEqual(MASCOT_DESKTOP_MAX_RATIO * width);

        // Desktop mascot is never smaller than the mobile-equivalent lower bound.
        expect(desktop.minPx).toBeGreaterThanOrEqual(mobile.minPx);
      }),
      { numRuns: 25 },
    );
  });
});
