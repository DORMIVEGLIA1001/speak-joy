import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { toKidCase } from './presentation';

// Feature: kid-friendly-ui-improvements, Property 4: Chuẩn hóa nhãn IN HOA về kiểu thân thiện trẻ em
// (normalize uppercase labels to kid-friendly case).
//
// For any input string, toKidCase must produce a result in which no "word" longer
// than 3 characters remains entirely uppercase, and the transform must be
// idempotent (applying it twice equals applying it once).
//
// A "word" uses the SAME definition as the implementation: a maximal run of
// Unicode letters and combining marks (/[\p{L}\p{M}]+/u), so Vietnamese diacritics
// are treated as part of a single word. "Length" counts code points via
// Array.from (matching the implementation), and "all-uppercase" means the word is
// unchanged by toUpperCase() and changed by toLowerCase() (i.e. it has cased
// letters and they are all upper-case).
//
// Validates: Requirements 6.4
describe('toKidCase — Property 4: normalize uppercase labels to kid-friendly case', () => {
  const WORD_RE = /[\p{L}\p{M}]+/gu;

  const isAllUpperLongWord = (word: string): boolean => {
    const length = Array.from(word).length;
    if (length <= 3) {
      return false;
    }
    return word === word.toUpperCase() && word !== word.toLowerCase();
  };

  const hasAllUpperLongWord = (s: string): boolean => {
    const matches = s.match(WORD_RE);
    if (!matches) {
      return false;
    }
    return matches.some(isAllUpperLongWord);
  };

  it('leaves no all-uppercase word longer than 3 chars and is idempotent', () => {
    // Generator: a base arbitrary string mixed with intentionally crafted
    // uppercase words (incl. Vietnamese diacritics) to reliably exercise the
    // transform, plus separators/punctuation/digits/short words.
    const upperWord = fc
      .stringOf(fc.constantFrom('A', 'B', 'C', 'D', 'E', 'X', 'Y', 'Z', 'Á', 'Ô', 'Đ', 'Ư', 'Ê'), {
        minLength: 1,
        maxLength: 8,
      });
    const mixedWord = fc.constantFrom('Hi', 'abc', 'Xin', 'chào', 'Bé', 'Học', 'ok', 'Go');
    const sep = fc.constantFrom(' ', '!', '?', '-', '_', '123', ', ', '. ', '');
    const token = fc.oneof(upperWord, mixedWord, sep, fc.string());

    const labelArb = fc.oneof(
      fc.constant(''),
      fc.string(),
      fc.array(token, { maxLength: 10 }).map((parts) => parts.join('')),
    );

    fc.assert(
      fc.property(labelArb, (label) => {
        const once = toKidCase(label);

        // No all-uppercase word longer than 3 chars remains.
        expect(hasAllUpperLongWord(once)).toBe(false);

        // Idempotent: applying the transform again changes nothing.
        const twice = toKidCase(once);
        expect(twice).toBe(once);
      }),
      { numRuns: 100 },
    );
  });
});
