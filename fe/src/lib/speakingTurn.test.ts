import { describe, expect, it } from 'vitest';

import { resolveGrammarRepeatPrompt, resolvePronunciationTarget } from './speakingTurn';

describe('speaking turn classification', () => {
  it('keeps free conversation out of pronunciation drill mode', () => {
    expect(resolvePronunciationTarget('I played football today.', '')).toBe('');
  });

  it('uses an explicitly requested phrase for pronunciation practice', () => {
    expect(resolvePronunciationTarget('I play football.', 'I played football.')).toBe('I played football.');
  });

  it('does not ask a child to repeat a grammatically correct sentence', () => {
    expect(resolveGrammarRepeatPrompt(0, true, 'I like cats.', 'I like cats.')).toBe('');
  });

  it('asks for one corrected repeat when a real correction exists', () => {
    expect(resolveGrammarRepeatPrompt(1, true, 'I went to school.', 'I goed to school.')).toBe('I went to school.');
  });
});
