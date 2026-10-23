// Feature: responsive-speaking-ui, Property 4: Message bubble max width never
// exceeds 85% of its container.
//
// Validates: Requirements 7.4
//
// Property: for any non-negative container width (including 0, fractional, and
// very large values), messageBubbleMaxWidthPx
//   (a) equals exactly 0.85 * containerWidth, and
//   (b) is always <= containerWidth (a bubble never exceeds its container).
//
// Generator: fc.double constrained to finite, non-negative magnitudes (the
// valid input space for a CSS pixel container width). 25 runs (numRuns: 25).

import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { messageBubbleMaxWidthPx, BUBBLE_MAX_RATIO } from './responsive';

describe('messageBubbleMaxWidthPx (Property 4: bubble max width <= 85% of container)', () => {
  it('equals 0.85 * containerWidth and is <= containerWidth', () => {
    fc.assert(
      fc.property(
        // Finite, non-negative container widths: the valid input space for a
        // CSS pixel width. Includes 0, fractions, and very large values.
        fc.double({ min: 0, max: Number.MAX_SAFE_INTEGER, noDefaultInfinity: true, noNaN: true }),
        (containerWidth) => {
          const result = messageBubbleMaxWidthPx(containerWidth);

          // (a) Exact ratio: result is exactly 0.85 * containerWidth.
          expect(result).toBe(BUBBLE_MAX_RATIO * containerWidth);

          // (b) Bounded: a bubble never exceeds its container width.
          expect(result).toBeLessThanOrEqual(containerWidth);
        },
      ),
      { numRuns: 25 },
    );
  });
});
