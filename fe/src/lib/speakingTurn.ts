export const resolvePronunciationTarget = (_spokenText: string, requestedTarget: string) =>
  requestedTarget.trim();

export const resolveGrammarRepeatPrompt = (
  correctionCount: number,
  _hasGrammarReview: boolean,
  correctedSentence: string,
  fallbackSentence: string,
) => (correctionCount > 0 ? correctedSentence.trim() || fallbackSentence.trim() : '');
