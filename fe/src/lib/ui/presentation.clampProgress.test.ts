// Feature: kid-friendly-ui-improvements, Property 5: Kẹp giá trị tiến độ hiển thị
// (clamp display progress value).
//
// Validates: Requirements 9.5, 9.6
//
// Property: for any numeric input, clampProgress
//   (a) always returns a value within the display range [0, 100],
//   (b) is the identity for any finite value already within [0, 100], and
//   (c) is idempotent — clamping an already-clamped value yields the same result.
//
// Generator: fc.double configured to include negatives, 0, the upper boundary 100,
// very large magnitudes, and non-finite values (NaN, +Infinity, -Infinity).
// Minimum 100 runs (numRuns: 100).

import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { clampProgress } from './presentation';

describe('clampProgress (Property 5: clamp display progress value)', () => {
  it('result ∈ [0,100], identity within range, and idempotent', () => {
    fc.assert(
      fc.property(
        // fc.double with noNaN disabled so NaN / ±Infinity are exercised.
        fc.double({ noDefaultInfinity: false, noNaN: false }),
        (value) => {
          const result = clampProgress(value);

          // (a) Range: result is always a finite value within [0, 100].
          expect(Number.isFinite(result)).toBe(true);
          expect(result).toBeGreaterThanOrEqual(0);
          expect(result).toBeLessThanOrEqual(100);

          // (b) Identity: finite values already within [0, 100] are returned unchanged.
          // Compared with numeric equality (=== treats -0 and +0 as equal) since the
          // property concerns the displayed progress value, not its signed-zero bit.
          if (Number.isFinite(value) && value >= 0 && value <= 100) {
            expect(result === value).toBe(true);
          }

          // (c) Idempotence: clamping the clamped value yields the same result.
          expect(clampProgress(result)).toBe(result);
        },
      ),
      { numRuns: 100 },
    );
  });
});
