// Feature: responsive-speaking-ui, Property 2: Body-text size is always clamped
// into the readable range.
//
// Validates: Requirements 9.1
//
// Property: for any requested font size in pixels (including out-of-range,
// fractional, very large, and non-finite values), clampFontSize
//   (a) always returns a value within the readable range [14, 24],
//   (b) returns any in-range input unchanged (pass-through), and
//   (c) is idempotent — clampFontSize(clampFontSize(px)) === clampFontSize(px).
//
// Generator: fc.double configured to include negatives, fractions, the
// boundaries 14 and 24, very large magnitudes, and non-finite values
// (NaN, +Infinity, -Infinity). 25 runs (numRuns: 25).

import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { clampFontSize, FONT_MIN_PX, FONT_MAX_PX } from './responsive';

describe('clampFontSize (Property 2: body-text size clamped into readable range)', () => {
  it('result ∈ [14,24], pass-through within range, and idempotent', () => {
    fc.assert(
      fc.property(
        // fc.double with NaN / ±Infinity enabled so degenerate inputs are exercised.
        fc.double({ noDefaultInfinity: false, noNaN: false }),
        (px) => {
          const result = clampFontSize(px);

          // (a) Range: result is always a finite value within [14, 24].
          expect(Number.isFinite(result)).toBe(true);
          expect(result).toBeGreaterThanOrEqual(FONT_MIN_PX);
          expect(result).toBeLessThanOrEqual(FONT_MAX_PX);

          // (b) Pass-through: finite values already within [14, 24] are returned
          // unchanged. Numeric equality (=== treats -0 and +0 as equal).
          if (Number.isFinite(px) && px >= FONT_MIN_PX && px <= FONT_MAX_PX) {
            expect(result === px).toBe(true);
          }

          // (c) Idempotence: clamping the clamped value yields the same result.
          expect(clampFontSize(result)).toBe(result);
        },
      ),
      { numRuns: 25 },
    );
  });
});
