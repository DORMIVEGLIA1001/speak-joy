export type GrammarCorrectionType = "pronunciation" | "grammar" | "missing_word";

export interface GrammarCorrection {
  mistake_word: string;
  correct_word: string;
  phonetic_hint: string;
  instruction: string;
  example_sentence: string;
  type: GrammarCorrectionType;
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
  issues: Array<{
    mistake: string;
    correction: string;
    type: "grammar" | "missing_word";
    instruction: string;
  }>;
  max_repeat: number;
  grammar_score?: GrammarScore;
}

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const preserveSentenceCase = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  return `${trimmed.charAt(0).toUpperCase()}${trimmed.slice(1)}`.replace(/\bi\b/g, "I");
};

const normalizeCoachWord = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");

const pluralizeBasicNoun = (noun: string) => {
  const lower = noun.toLowerCase();
  if (lower.endsWith("s")) return noun;
  if (/(s|x|z|ch|sh)$/i.test(noun)) return `${noun}es`;
  if (/[^aeiou]y$/i.test(noun)) return `${noun.slice(0, -1)}ies`;
  return `${noun}s`;
};

const applyCorrectionToSentence = (sentence: string, mistake: string, correction: string) => {
  if (!mistake.trim() || !correction.trim()) return sentence;
  return sentence.replace(new RegExp(`\\b${escapeRegExp(mistake)}\\b`, "i"), correction);
};

const PRONUNCIATION_HINTS: Record<string, { correct: string; phonetic: string }> = {
  elepant: { correct: "elephant", phonetic: "EH-luh-fuhnt" },
  elefant: { correct: "elephant", phonetic: "EH-luh-fuhnt" },
  libary: { correct: "library", phonetic: "LY-brer-ee" },
  librery: { correct: "library", phonetic: "LY-brer-ee" },
  spagetti: { correct: "spaghetti", phonetic: "spuh-GET-ee" },
  pasgetti: { correct: "spaghetti", phonetic: "spuh-GET-ee" },
  freind: { correct: "friend", phonetic: "FREND" },
  frend: { correct: "friend", phonetic: "FREND" },
  tomarrow: { correct: "tomorrow", phonetic: "tuh-MOR-oh" },
  banna: { correct: "banana", phonetic: "buh-NA-nuh" },
  aple: { correct: "apple", phonetic: "AP-ul" },
  appel: { correct: "apple", phonetic: "AP-ul" },
};

export const buildGrammarReviewFromCorrections = (
  spokenText: string,
  corrections: GrammarCorrection[],
): GrammarReview | undefined => {
  const grammarCorrections = corrections.filter(
    (item) => item.type === "grammar" || item.type === "missing_word",
  );
  if (grammarCorrections.length === 0) return undefined;

  let correctedSentence = String(spokenText || "").trim();
  for (const correction of grammarCorrections) {
    correctedSentence = applyCorrectionToSentence(
      correctedSentence,
      correction.mistake_word,
      correction.correct_word,
    );
  }
  correctedSentence = preserveSentenceCase(correctedSentence);
  if (correctedSentence && !/[.!?]$/.test(correctedSentence)) {
    correctedSentence += ".";
  }

  return {
    original_sentence: String(spokenText || "").trim(),
    corrected_sentence: correctedSentence,
    issues: grammarCorrections.map((correction) => ({
      mistake: correction.mistake_word,
      correction: correction.correct_word,
      type: correction.type === "missing_word" ? "missing_word" : "grammar",
      instruction: correction.instruction,
    })),
    max_repeat: 3,
  };
};

export const mapGrammarLevel = (score: number): GrammarScoreLevel => {
  if (score >= 90) return "excellent";
  if (score >= 70) return "good";
  return "needs_work";
};

// Grammar-only score, independent of pronunciation. Weighs a missing/wrong verb
// (to-be, tense, missing "to") heavier than an article/preposition slip so the
// score reflects how much the meaning is affected. Scores the FULL correction
// list, not the display-capped subset.
export const scoreGrammarHeuristic = (
  spokenText: string,
  corrections: GrammarCorrection[],
): GrammarScore => {
  const trimmed = String(spokenText || "").trim();
  if (!trimmed) {
    return { score: 0, level: "needs_work", source: "heuristic" };
  }

  const grammarIssues = corrections.filter(
    (item) => item.type === "grammar" || item.type === "missing_word",
  );
  if (grammarIssues.length === 0) {
    return { score: 100, level: "excellent", source: "heuristic" };
  }

  const penalty = grammarIssues.reduce((sum, issue) => {
    return sum + (issue.type === "missing_word" ? 22 : 15);
  }, 0);

  const score = Math.max(30, Math.min(100, 100 - penalty));
  return { score, level: mapGrammarLevel(score), source: "heuristic" };
};

export const buildFreeformCorrections = (
  spokenText: string,
  limit: number = 3,
): GrammarCorrection[] => {
  const lower = String(spokenText || "").toLowerCase();
  const words = lower.split(/\s+/).filter(Boolean);
  const corrections: GrammarCorrection[] = [];
  const addCorrection = (
    mistake: string,
    correct: string,
    instruction: string,
    type: "grammar" | "missing_word" = "grammar",
  ) => {
    corrections.push({
      mistake_word: mistake,
      correct_word: correct,
      phonetic_hint: correct,
      instruction,
      example_sentence: applyCorrectionToSentence(String(spokenText || ""), mistake, correct),
      type,
    });
  };

  // Missing "to be" before a common adjective (e.g. "I happy", "he tired").
  const BE_BY_SUBJECT: Record<string, string> = {
    i: "am",
    you: "are",
    we: "are",
    they: "are",
    he: "is",
    she: "is",
    it: "is",
  };
  const beAdjectiveMatch = lower.match(
    /\b(i|you|we|they|he|she|it)\s+(happy|sad|hungry|thirsty|tired|angry|scared|sleepy|hot|cold|big|small|good|okay)\b/i,
  );
  if (beAdjectiveMatch) {
    const subject = beAdjectiveMatch[1];
    const adjective = beAdjectiveMatch[2];
    const be = BE_BY_SUBJECT[subject.toLowerCase()] || "am";
    const displaySubject = subject.toLowerCase() === "i" ? "I" : subject;
    addCorrection(
      `${subject} ${adjective}`,
      `${displaySubject} ${be} ${adjective}`,
      `Add ${be} after ${displaySubject}.`,
      "missing_word",
    );
  }

  if (/\bgo\s+school\b/i.test(lower)) addCorrection("go school", "go to school", "Add to before school.", "missing_word");

  if (/\b(want|need)\s+(eat|go|play|drink|sleep|read)\b/i.test(lower)) {
    const match = lower.match(/\b(want|need)\s+(eat|go|play|drink|sleep|read)\b/i);
    const verb = match?.[1] || "want";
    const action = match?.[2] || "eat";
    addCorrection(`${verb} ${action}`, `${verb} to ${action}`, `Use to after ${verb}.`, "missing_word");
  }

  if (/\bi\s+(is|are)\b/i.test(lower)) addCorrection(lower.match(/\bi\s+(is|are)\b/i)?.[0] || "I is", "I am", "Use am after I.");

  if (/\b(you|we|they)\s+is\b/i.test(lower)) {
    const subject = lower.match(/\b(you|we|they)\s+is\b/i)?.[1] || "you";
    addCorrection(`${subject} is`, `${subject} are`, `Use are after ${subject}.`);
  }

  if (/\b(he|she|it)\s+are\b/i.test(lower)) {
    const subject = lower.match(/\b(he|she|it)\s+are\b/i)?.[1] || "she";
    addCorrection(`${subject} are`, `${subject} is`, `Use is after ${subject}.`);
  }

  if (/\bshe\s+go\b/i.test(lower)) addCorrection("she go", "she goes", "Use goes for she and he.");

  if (/\b(he|she|it)\s+(like|want|play|eat|drink|look|need)\b/i.test(lower)) {
    const match = lower.match(/\b(he|she|it)\s+(like|want|play|eat|drink|look|need)\b/i);
    const subject = match?.[1] || "she";
    const verb = match?.[2] || "like";
    addCorrection(`${subject} ${verb}`, `${subject} ${verb}s`, `Add s to the verb after ${subject}.`);
  }

  if (/\bhe\s+go\b/i.test(lower)) addCorrection("he go", "he goes", "Use goes for he and she.");

  if (/\b(i|you|we|they)\s+has\b/i.test(lower)) {
    const subject = lower.match(/\b(i|you|we|they)\s+has\b/i)?.[1] || "I";
    const correctSubject = subject.toLowerCase() === "i" ? "I" : subject;
    addCorrection(`${correctSubject} has`, `${correctSubject} have`, `Use have after ${correctSubject}.`);
  }

  if (/\b(he|she|it)\s+have\b/i.test(lower)) {
    const subject = lower.match(/\b(he|she|it)\s+have\b/i)?.[1] || "she";
    addCorrection(`${subject} have`, `${subject} has`, `Use has after ${subject}.`);
  }

  if (/\ba\s+(apple|orange|elephant|ice cream|egg|umbrella)\b/i.test(lower)) {
    const noun = lower.match(/\ba\s+(apple|orange|elephant|ice cream|egg|umbrella)\b/i)?.[1] || "apple";
    addCorrection(`a ${noun}`, `an ${noun}`, "Use an before words that start with a vowel sound.");
  }

  const pluralMatch = lower.match(/\b(two|three|four|five|six|many|some|lots of)\s+([a-z]+)\b/i);
  if (pluralMatch) {
    const quantifier = pluralMatch[1];
    const noun = pluralMatch[2];
    const plural = pluralizeBasicNoun(noun);
    if (noun !== plural) {
      addCorrection(`${quantifier} ${noun}`, `${quantifier} ${plural}`, "Use a plural noun after numbers or words like many.");
    }
  }

  const yesterdayMatch = lower.match(/\byesterday\s+(i|you|we|they|he|she)\s+(go|play|eat|drink|see|do|watch)\b/i);
  if (yesterdayMatch) {
    const subject = yesterdayMatch[1];
    const verb = yesterdayMatch[2];
    const pastMap: Record<string, string> = {
      go: "went",
      play: "played",
      eat: "ate",
      drink: "drank",
      see: "saw",
      do: "did",
      watch: "watched",
    };
    addCorrection(
      `yesterday ${subject} ${verb}`,
      `yesterday ${subject} ${pastMap[verb] || `${verb}ed`}`,
      "Use the past tense after yesterday.",
    );
  }

  if (/\b(at|in)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.test(lower)) {
    const match = lower.match(/\b(at|in)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i);
    if (match) addCorrection(`${match[1]} ${match[2]}`, `on ${match[2]}`, "Use on with days of the week.");
  }

  if (/\b(in|on)\s+home\b/i.test(lower)) {
    const match = lower.match(/\b(in|on)\s+home\b/i);
    if (match) addCorrection(`${match[1]} home`, "at home", "Use at home.");
  }

  if (/\blisten\s+(music|song|teacher|sunny)\b/i.test(lower)) {
    const match = lower.match(/\blisten\s+(music|song|teacher|sunny)\b/i);
    if (match) addCorrection(`listen ${match[1]}`, `listen to ${match[1]}`, "Use listen to before the thing you hear.", "missing_word");
  }

  for (const word of words) {
    const clean = normalizeCoachWord(word);
    const known = PRONUNCIATION_HINTS[clean];
    if (!known) continue;
    corrections.push({
      mistake_word: word,
      correct_word: known.correct,
      phonetic_hint: known.phonetic,
      instruction: "Say this word slowly with Sunny.",
      example_sentence: String(spokenText || "").replace(new RegExp(`\\b${escapeRegExp(word)}\\b`, "i"), known.correct),
      type: "pronunciation",
    });
  }

  return corrections.slice(0, limit);
};
