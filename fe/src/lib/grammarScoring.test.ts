import { describe, it, expect } from 'vitest';
import {
  mapGrammarLevel,
  scoreGrammarHeuristic,
  type GrammarCorrection,
} from './grammarReview';
import { normalizeSpeakingCoachPayload } from './speakingCoach';
import { promptLevelForAge, promptsForAge, type TopicPrompt } from './topicCatalog';

const grammarIssue = (type: 'grammar' | 'missing_word'): GrammarCorrection => ({
  mistake_word: 'x',
  correct_word: 'y',
  phonetic_hint: 'y',
  instruction: 'fix it',
  example_sentence: 'y',
  type,
});

describe('mapGrammarLevel', () => {
  it('maps score bands to levels', () => {
    expect(mapGrammarLevel(95)).toBe('excellent');
    expect(mapGrammarLevel(90)).toBe('excellent');
    expect(mapGrammarLevel(89)).toBe('good');
    expect(mapGrammarLevel(70)).toBe('good');
    expect(mapGrammarLevel(69)).toBe('needs_work');
    expect(mapGrammarLevel(0)).toBe('needs_work');
  });
});

describe('scoreGrammarHeuristic', () => {
  it('scores empty input as 0', () => {
    expect(scoreGrammarHeuristic('   ', [])).toEqual({
      score: 0,
      level: 'needs_work',
      source: 'heuristic',
    });
  });

  it('scores a clean sentence as perfect', () => {
    const result = scoreGrammarHeuristic('I am happy.', []);
    expect(result.score).toBe(100);
    expect(result.level).toBe('excellent');
    expect(result.source).toBe('heuristic');
  });

  it('ignores pronunciation-only corrections', () => {
    const corrections: GrammarCorrection[] = [
      { ...grammarIssue('grammar'), type: 'pronunciation' as GrammarCorrection['type'] },
    ];
    expect(scoreGrammarHeuristic('I am happy.', corrections).score).toBe(100);
  });

  it('penalizes a missing word more than a grammar slip', () => {
    const oneGrammar = scoreGrammarHeuristic('I happy', [grammarIssue('grammar')]);
    const oneMissing = scoreGrammarHeuristic('I happy', [grammarIssue('missing_word')]);
    expect(oneGrammar.score).toBe(85);
    expect(oneMissing.score).toBe(78);
    expect(oneMissing.score).toBeLessThan(oneGrammar.score);
  });

  it('never scores below the 30 floor', () => {
    const many = Array.from({ length: 10 }, () => grammarIssue('missing_word'));
    expect(scoreGrammarHeuristic('bad sentence', many).score).toBe(30);
  });
});

describe('promptLevelForAge', () => {
  it('bands ages into prompt levels', () => {
    expect(promptLevelForAge(5)).toBe(1);
    expect(promptLevelForAge(6)).toBe(1);
    expect(promptLevelForAge(7)).toBe(2);
    expect(promptLevelForAge(8)).toBe(2);
    expect(promptLevelForAge(9)).toBe(3);
    expect(promptLevelForAge(12)).toBe(3);
  });

  it('defaults to the highest level when age is missing or invalid', () => {
    expect(promptLevelForAge(undefined)).toBe(3);
    expect(promptLevelForAge(0)).toBe(3);
    expect(promptLevelForAge(NaN)).toBe(3);
  });
});

describe('promptsForAge', () => {
  const prompts: TopicPrompt[] = [
    { text: 'a', translate: 'a', level: 1 },
    { text: 'b', translate: 'b', level: 2 },
    { text: 'c', translate: 'c', level: 3 },
  ];

  it('shows only simple prompts to young children', () => {
    expect(promptsForAge(prompts, 5).map((p) => p.level)).toEqual([1]);
  });

  it('shows everything at or below the age band', () => {
    expect(promptsForAge(prompts, 7).map((p) => p.level)).toEqual([1, 2]);
    expect(promptsForAge(prompts, 10).map((p) => p.level)).toEqual([1, 2, 3]);
  });

  it('falls back to the full list when no prompt fits the band', () => {
    const onlyHard: TopicPrompt[] = [{ text: 'c', translate: 'c', level: 3 }];
    expect(promptsForAge(onlyHard, 5)).toEqual(onlyHard);
  });
});

describe('normalizeSpeakingCoachPayload grammar_score', () => {
  it('surfaces a top-level numeric grammar_score', () => {
    const payload = normalizeSpeakingCoachPayload(
      { reply: 'Nice!', grammar_score: 82 },
      'I like cats',
      '',
    );
    expect(payload.grammar_score).toEqual({
      score: 82,
      level: 'good',
      source: 'heuristic',
    });
  });

  it('prefers the grammar_review embedded score object', () => {
    const payload = normalizeSpeakingCoachPayload(
      {
        reply: 'Try again',
        grammar_review: {
          original_sentence: 'I happy',
          corrected_sentence: 'I am happy',
          issues: [{ mistake: 'I happy', correction: 'I am happy', type: 'missing_word', instruction: 'add am' }],
          grammar_score: { score: 78, level: 'good', source: 'llm' },
        },
      },
      'I happy',
      '',
    );
    expect(payload.grammar_score).toEqual({ score: 78, level: 'good', source: 'llm' });
    expect(payload.grammar_review?.grammar_score).toEqual({ score: 78, level: 'good', source: 'llm' });
  });

  it('clamps out-of-range scores', () => {
    const high = normalizeSpeakingCoachPayload({ grammar_score: 150 }, 'x', '');
    const low = normalizeSpeakingCoachPayload({ grammar_score: -20 }, 'x', '');
    expect(high.grammar_score?.score).toBe(100);
    expect(low.grammar_score?.score).toBe(0);
  });

  it('leaves grammar_score undefined when absent', () => {
    const payload = normalizeSpeakingCoachPayload({ reply: 'hi' }, 'x', '');
    expect(payload.grammar_score).toBeUndefined();
  });
});
