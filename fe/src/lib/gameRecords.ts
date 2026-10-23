export type GameRecordType = 'tf' | 'wc' | 'fm' | 'st' | 'blocks' | 'blast';

export const buildGameRecordPatch = (type: GameRecordType, score: number) => {
  if (type === 'tf') return { trueFalseHighScore: score };
  if (type === 'wc') return { wordChainHighScore: score };
  if (type === 'fm') return { flashcardMatchBestTime: score };
  if (type === 'blocks') return { blocksHighScore: score };
  if (type === 'blast') return { blastHighScore: score };
  return { storiesCompletedCount: score };
};
