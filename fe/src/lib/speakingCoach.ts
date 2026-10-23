export type SpeakingCorrectionType = "pronunciation" | "grammar" | "missing_word";

export interface WordStatus {
  word: string;
  status: "correct" | "incorrect" | "missing";
  ipa: string;
  tip_vi: string;
}

export interface SpeakingCorrection {
  mistake_word: string;
  correct_word: string;
  phonetic_hint: string;
  instruction: string;
  example_sentence: string;
  type: SpeakingCorrectionType;
}

export interface GrammarReviewIssue {
  mistake: string;
  correction: string;
  type: "grammar" | "missing_word";
  instruction: string;
}

export type GrammarScoreLevel = "excellent" | "good" | "needs_work";

export interface GrammarScore {
  score: number;
  level: GrammarScoreLevel;
  source: "llm" | "heuristic";
}

export interface GrammarReview {
  original_sentence: string;
  corrected_sentence: string;
  issues: GrammarReviewIssue[];
  max_repeat: number;
  grammar_score?: GrammarScore;
}

export interface SpeakingCoachPayload {
  reply: string;
  translation: string;
  score: number;
  word_statuses: WordStatus[];
  praise: string;
  corrections: SpeakingCorrection[];
  ask_repeat: string;
  pronunciation_score: number;
  continue_question: string;
  grammar_review?: GrammarReview;
  grammar_score?: GrammarScore;
}

export interface ChatSilencePrompt {
  text: string;
  translate: string;
}

export const normalizeWord = (value: string): string =>
  value.toLowerCase().replace(/[^a-z0-9]/g, "");

export function buildSpeakingCorrectionsFromWordStatuses(
  wordStatuses: WordStatus[],
  targetPhrase: string,
  spokenText: string,
): SpeakingCorrection[] {
  if (!Array.isArray(wordStatuses) || wordStatuses.length === 0) {
    return [];
  }

  const targetWords = targetPhrase.split(/\s+/).filter(Boolean);
  const spokenWords = spokenText.split(/\s+/).filter(Boolean);

  return wordStatuses
    .filter((status) => status.status !== "correct")
    .map((status) => {
      const normalizedTarget = normalizeWord(status.word);
      const spokenMatch =
        spokenWords.find((word) => normalizeWord(word) === normalizedTarget) ||
        (status.status === "missing"
          ? ""
          : spokenWords.find((word) => normalizeWord(word).startsWith(normalizedTarget.slice(0, 2))) || status.word);

      const exampleSentence =
        targetPhrase ||
        targetWords.map((word) => (normalizeWord(word) === normalizedTarget ? status.word : word)).join(" ") ||
        spokenText ||
        status.word;

      return {
        mistake_word: spokenMatch || status.word,
        correct_word: status.word,
        phonetic_hint: status.ipa || status.word,
        instruction:
          status.tip_vi ||
          (status.status === "missing"
            ? "Add this word and try the full sentence again."
            : "Say this word slowly and clearly."),
        example_sentence: exampleSentence,
        type: status.status === "missing" ? "missing_word" : "pronunciation",
      } satisfies SpeakingCorrection;
    })
    .slice(0, 3);
}

const mapGrammarLevel = (score: number): GrammarScoreLevel => {
  if (score >= 90) return "excellent";
  if (score >= 70) return "good";
  return "needs_work";
};

// Accepts either a bare number (top-level grammar_score field) or an object
// ({score, level, source}) that the grammar_review may embed. Returns undefined
// when nothing usable is present so callers can hide the badge.
const parseGrammarScore = (raw: any): GrammarScore | undefined => {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    const score = Math.max(0, Math.min(100, Math.round(raw)));
    return { score, level: mapGrammarLevel(score), source: "heuristic" };
  }
  if (raw && typeof raw === "object" && Number.isFinite(Number(raw.score))) {
    const score = Math.max(0, Math.min(100, Math.round(Number(raw.score))));
    const level: GrammarScoreLevel =
      raw.level === "excellent" || raw.level === "good" || raw.level === "needs_work"
        ? raw.level
        : mapGrammarLevel(score);
    const source: GrammarScore["source"] = raw.source === "llm" ? "llm" : "heuristic";
    return { score, level, source };
  }
  return undefined;
};

export function normalizeSpeakingCoachPayload(
  rawData: any,
  spokenText: string,
  targetPhrase: string,
): SpeakingCoachPayload {
  const wordStatuses: WordStatus[] = Array.isArray(rawData?.word_statuses)
    ? rawData.word_statuses
        .filter((item: any) => item && typeof item === "object")
        .map((item: any) => ({
          word: typeof item.word === "string" ? item.word : "",
          status:
            item.status === "incorrect" || item.status === "missing" || item.status === "correct"
              ? item.status
              : "correct",
          ipa: typeof item.ipa === "string" ? item.ipa : "",
          tip_vi: typeof item.tip_vi === "string" ? item.tip_vi : "",
        }))
    : [];

  const explicitCorrections: SpeakingCorrection[] = Array.isArray(rawData?.corrections)
    ? rawData.corrections
        .filter((item: any) => item && typeof item === "object")
        .map((item: any) => ({
          mistake_word: typeof item.mistake_word === "string" ? item.mistake_word : "",
          correct_word: typeof item.correct_word === "string" ? item.correct_word : "",
          phonetic_hint: typeof item.phonetic_hint === "string" ? item.phonetic_hint : "",
          instruction: typeof item.instruction === "string" ? item.instruction : "",
          example_sentence: typeof item.example_sentence === "string" ? item.example_sentence : "",
          type:
            item.type === "grammar" || item.type === "missing_word" || item.type === "pronunciation"
              ? item.type
              : "pronunciation",
        }))
    : [];

  const grammarReview: GrammarReview | undefined =
    rawData?.grammar_review && typeof rawData.grammar_review === "object"
      ? {
          original_sentence:
            typeof rawData.grammar_review.original_sentence === "string"
              ? rawData.grammar_review.original_sentence
              : spokenText,
          corrected_sentence:
            typeof rawData.grammar_review.corrected_sentence === "string"
              ? rawData.grammar_review.corrected_sentence
              : "",
          issues: Array.isArray(rawData.grammar_review.issues)
            ? rawData.grammar_review.issues
                .filter((item: any) => item && typeof item === "object")
                .map((item: any) => ({
                  mistake: typeof item.mistake === "string" ? item.mistake : "",
                  correction: typeof item.correction === "string" ? item.correction : "",
                  type: item.type === "missing_word" ? "missing_word" : "grammar",
                  instruction: typeof item.instruction === "string" ? item.instruction : "",
                }))
                .filter((item: GrammarReviewIssue) => item.mistake || item.correction)
            : [],
          max_repeat:
            typeof rawData.grammar_review.max_repeat === "number"
              ? rawData.grammar_review.max_repeat
              : 3,
          grammar_score: parseGrammarScore(rawData.grammar_review.grammar_score),
        }
      : undefined;

  const fallbackCorrections = buildSpeakingCorrectionsFromWordStatuses(wordStatuses, targetPhrase, spokenText);
  const corrections = explicitCorrections.length > 0 ? explicitCorrections : fallbackCorrections;
  const baseScore = typeof rawData?.score === "number" ? rawData.score : 0;
  const pronunciationScore =
    typeof rawData?.pronunciation_score === "number" ? rawData.pronunciation_score : baseScore;
  const hasErrors = corrections.length > 0 || wordStatuses.some(w => w.status === 'incorrect' || w.status === 'missing');
  const askRepeat = (hasErrors)
    ? (typeof rawData?.ask_repeat === "string" && rawData.ask_repeat.trim()
        ? rawData.ask_repeat.trim()
        : corrections[0]?.example_sentence || targetPhrase || "")
    : "";
  const continueQuestion =
    typeof rawData?.continue_question === "string" ? rawData.continue_question : "";

  // Prefer the score embedded in grammar_review; fall back to a top-level
  // grammar_score field so both server response shapes surface a badge.
  const grammarScore =
    grammarReview?.grammar_score ?? parseGrammarScore(rawData?.grammar_score);

  return {
    reply: typeof rawData?.reply === "string" ? rawData.reply : "",
    translation: typeof rawData?.translation === "string" ? rawData.translation : "",
    score: baseScore,
    word_statuses: wordStatuses,
    praise: typeof rawData?.praise === "string" ? rawData.praise : "",
    corrections,
    ask_repeat: askRepeat,
    pronunciation_score: pronunciationScore,
    continue_question: continueQuestion,
    grammar_review: grammarReview?.corrected_sentence ? grammarReview : undefined,
    grammar_score: grammarScore,
  };
}

export function buildChatSilencePrompt(
  hintLevel: number,
  targetPhrase: string,
  fallbackPrompt?: ChatSilencePrompt | null,
): ChatSilencePrompt | null {
  const safeLevel = Math.max(1, Math.min(4, hintLevel));
  const trimmedTarget = targetPhrase.trim();

  if (!trimmedTarget) {
    return fallbackPrompt || null;
  }

  const firstWord = trimmedTarget.split(/\s+/)[0] || trimmedTarget;
  const firstLetter = firstWord.charAt(0).toUpperCase();
  const leadingSound = firstWord.slice(0, Math.min(3, firstWord.length)).toUpperCase();

  switch (safeLevel) {
    case 1:
      return {
        text: "You can do it. Try saying it slowly.",
        translate: "Bé làm được mà. Hãy thử nói chậm lại nhé.",
      };
    case 2:
      return {
        text: `The next word starts with ${firstLetter}...`,
        translate: `Từ tiếp theo bắt đầu với âm ${firstLetter}...`,
      };
    case 3:
      return {
        text: `Listen to the beginning sound: ${leadingSound}...`,
        translate: `Nghe phần đầu của từ nhé: ${leadingSound}...`,
      };
    default:
      return {
        text: trimmedTarget,
        translate: "Hãy nói lại đúng câu này nhé.",
      };
  }
}
