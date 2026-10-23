import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { resolveInitialTheme } from './presentation';

// Feature: kid-friendly-ui-improvements, Property 1: Giải quyết theme khởi tạo an toàn.
// For any stored value (arbitrary string, null, or undefined), resolveInitialTheme
// returns 'light' or 'dark'; it returns the value itself if and only if it is in
// {'light','dark'}, otherwise it always returns 'light' (default + fallback).
// Validates: Requirements 3.1, 3.2, 3.6
describe('resolveInitialTheme — Property 1: safe initial theme resolution', () => {
  it('always returns a valid theme and only echoes valid stored values', () => {
    const validThemes = fc.constantFrom('light', 'dark');
    const garbage = fc.oneof(
      fc.string(),
      fc.constant(''),
      fc.constant(null),
      fc.constant(undefined),
    );
    const storedArb = fc.oneof(validThemes, garbage);

    fc.assert(
      fc.property(storedArb, (stored) => {
        const result = resolveInitialTheme(stored as string | null | undefined);

        // Result is always one of the two valid themes.
        expect(result === 'light' || result === 'dark').toBe(true);

        if (stored === 'light' || stored === 'dark') {
          // Returns the value itself iff it is a valid theme.
          expect(result).toBe(stored);
        } else {
          // Otherwise always falls back to 'light'.
          expect(result).toBe('light');
        }
      }),
      { numRuns: 100 },
    );
  });
});
