import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { enforceContentFontSize, DESIGN } from './presentation';

// Feature: kid-friendly-ui-improvements, Property 3: Kẹp cỡ chữ nội dung trong
// khoảng hợp lệ — For any số thực đầu vào, enforceContentFontSize trả về một giá
// trị luôn nằm trong khoảng [14, 32] (do đó luôn ≥ 14px), và là phép toán
// idempotent (enforceContentFontSize(enforceContentFontSize(x)) === enforceContentFontSize(x)).
// Validates: Requirements 6.1, 6.2
describe('enforceContentFontSize — Property 3: clamp content font size into [14,32] and idempotent', () => {
  it('always returns a value within [14, 32] and is idempotent', () => {
    const fontSizeArb = fc.oneof(
      // Broad coverage: negatives, 0, large numbers, fractions, non-finite values.
      fc.double({ noNaN: false }),
      // Explicit boundary and special values to ensure they are exercised.
      fc.constantFrom(
        DESIGN.fontSize.min, // 14
        DESIGN.fontSize.max, // 32
        DESIGN.fontSize.min - 0.0001,
        DESIGN.fontSize.max + 0.0001,
        0,
        -1,
        -1000,
        1000,
        Number.NaN,
        Number.POSITIVE_INFINITY,
        Number.NEGATIVE_INFINITY,
      ),
    );

    fc.assert(
      fc.property(fontSizeArb, (px) => {
        const result = enforceContentFontSize(px);

        // Result is always within the valid range [14, 32] (hence always >= 14).
        expect(result).toBeGreaterThanOrEqual(DESIGN.fontSize.min);
        expect(result).toBeLessThanOrEqual(DESIGN.fontSize.max);

        // Idempotent: applying again does not change the result.
        expect(enforceContentFontSize(result)).toBe(result);
      }),
      { numRuns: 100 },
    );
  });
});
