import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { resolveLang } from './presentation';

// Feature: kid-friendly-ui-improvements, Property 2: Giải quyết ngôn ngữ hiển thị an toàn.
// For any input value (string, null, undefined, or any non-string type), resolveLang
// returns 'en' or 'vi'; it returns the value itself if and only if it is in
// {'en','vi'}, otherwise it always returns 'vi' (default).
// Validates: Requirements 5.5, 5.6
describe('resolveLang — Property 2: safe display language resolution', () => {
  it('always returns a valid lang and only echoes valid inputs', () => {
    const validLangs = fc.constantFrom('en', 'vi');
    const garbage = fc.oneof(
      fc.string(),
      fc.constant(''),
      fc.constant(null),
      fc.constant(undefined),
      fc.integer(),
      fc.double(),
      fc.boolean(),
      fc.object(),
      fc.array(fc.string()),
    );
    const inputArb = fc.oneof(validLangs, garbage);

    fc.assert(
      fc.property(inputArb, (value) => {
        const result = resolveLang(value);

        // Result is always one of the two valid languages.
        expect(result === 'en' || result === 'vi').toBe(true);

        if (value === 'en' || value === 'vi') {
          // Returns the value itself iff it is a valid language.
          expect(result).toBe(value);
        } else {
          // Otherwise always falls back to 'vi'.
          expect(result).toBe('vi');
        }
      }),
      { numRuns: 100 },
    );
  });
});
