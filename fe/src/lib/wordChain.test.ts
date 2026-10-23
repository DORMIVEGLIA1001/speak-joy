import { describe, expect, it } from 'vitest';

import { buildWordHint, compareWordCharacters, selectSpokenWord } from './wordChain';

describe('word-chain helpers', () => {
  it('reveals one additional letter while preserving the word length', () => {
    expect(buildWordHint('leaf', 1)).toEqual(['l', '_', '_', '_']);
    expect(buildWordHint('leaf', 3)).toEqual(['l', 'e', 'a', '_']);
    expect(buildWordHint('leaf', 4)).toEqual(['l', 'e', 'a', 'f']);
  });

  it('selects a known chained word from a speech transcript', () => {
    const known = (word: string) => ['night', 'noon'].includes(word);
    expect(selectSpokenWord('I think night', 'n', known)).toBe('night');
    expect(selectSpokenWord('elbow', 'e', (word) => word === 'elbow')).toBe('elbow');
  });

  it('marks only mismatched or missing characters as incorrect', () => {
    expect(compareWordCharacters('leef', 'leaf')).toEqual([
      { character: 'l', matches: true },
      { character: 'e', matches: true },
      { character: 'e', matches: false },
      { character: 'f', matches: true },
    ]);
  });
});
