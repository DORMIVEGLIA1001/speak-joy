import { describe, expect, it } from 'vitest';

import { splitTextForSpeech } from './speechChunks';

describe('splitTextForSpeech', () => {
  it('splits natural sentences while preserving punctuation', () => {
    expect(splitTextForSpeech('Hello Minh! Today we learn animals. Are you ready?')).toEqual([
      'Hello Minh!',
      'Today we learn animals.',
      'Are you ready?',
    ]);
  });

  it('does not split common abbreviations or decimals', () => {
    expect(splitTextForSpeech('Dr. Sunny has 3.5 stars. That is great!')).toEqual([
      'Dr. Sunny has 3.5 stars.',
      'That is great!',
    ]);
  });

  it('splits a long sentence at commas and hard word limits', () => {
    const chunks = splitTextForSpeech(
      'Today we will learn about elephants, their families and their homes, then we will practice a lovely sentence together.',
      { maxWords: 8 },
    );

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.split(/\s+/).length <= 8)).toBe(true);
    expect(chunks.join(' ')).toContain('elephants,');
  });

  it('merges very short trailing fragments', () => {
    expect(splitTextForSpeech('Try this sentence. Great!')).toEqual([
      'Try this sentence. Great!',
    ]);
  });

  it('returns no chunks for blank input', () => {
    expect(splitTextForSpeech('   \n ')).toEqual([]);
  });
});
