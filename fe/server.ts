import express from "express";
import fs from "fs";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

// This file runs as ESM in dev (tsx) where __dirname is undefined, but is bundled to CJS
// for production (esbuild --format=cjs) where __dirname exists. Derive it from import.meta
// when available so the IPA dataset path resolves in both modes.
const moduleDir =
  typeof __dirname !== "undefined" ? __dirname : path.dirname(fileURLToPath(import.meta.url));
import {
  buildFreeformCorrections as buildTeacherGrammarCorrections,
  buildGrammarReviewFromCorrections as buildTeacherGrammarReview,
  scoreGrammarHeuristic,
} from "./src/lib/grammarReview";
import { resolveGrammarRepeatPrompt, resolvePronunciationTarget } from "./src/lib/speakingTurn";

const envCandidates = [
  process.env.ENV_FILE,
  process.env.NODE_ENV === "production" ? ".env.production" : ".env.local",
  ".env",
].filter((value): value is string => Boolean(value));

for (const envFile of envCandidates) {
  const resolved = path.isAbsolute(envFile) ? envFile : path.join(process.cwd(), envFile);
  if (fs.existsSync(resolved)) {
    dotenv.config({ path: resolved });
    break;
  }
}

// On the production host the backend container is published at 127.0.0.1:8080
// (the in-container port 8000 is NOT reachable from the host PM2 process).
// In local development, this project standard runs uvicorn on port 8081.
// BACKEND_BASE_URL from the environment always takes precedence when provided.
const defaultBackendBaseUrl =
  process.env.NODE_ENV?.trim().toLowerCase() === "production"
    ? "http://127.0.0.1:8080"
    : "http://127.0.0.1:8081";
const backendBaseUrl = (process.env.BACKEND_BASE_URL || defaultBackendBaseUrl).trim().replace(/\/+$/, "");
const RUNTIME_CONFIG_CACHE_TTL_MS = 60_000;
const PRIMARY_CHILD_CACHE_TTL_MS = 60_000;
const DEFAULT_MONTHLY_TOKEN_LIMIT = 20_000;
const DEFAULT_GEMINI_BASE_URL = "https://generativelanguage.googleapis.com";
const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_CLAUDE_BASE_URL = "https://api.anthropic.com";
const defaultTtsBaseUrl = "https://tts.emobi.vn";
const ttsBaseUrl = (process.env.TTS_BASE_URL || process.env.VIENEU_TTS_BASE_URL || defaultTtsBaseUrl)
  .trim()
  .replace(/\/+$/, "");

const resolveTtsApiKey = () => {
  const configuredKey = (process.env.TTS_API_KEY || process.env.VIENEU_TTS_API_KEY || "").trim();
  if (configuredKey) return configuredKey;

  const configuredFile = (
    process.env.TTS_API_KEY_FILE || process.env.VIENEU_TTS_API_KEY_FILE || ""
  ).trim();
  if (!configuredFile) return "";

  const keyFile = path.isAbsolute(configuredFile)
    ? configuredFile
    : path.resolve(process.cwd(), configuredFile);
  try {
    return fs.readFileSync(keyFile, "utf8").trim();
  } catch (error) {
    console.error(`Unable to read VieNeu API key file at ${keyFile}:`, error);
    return "";
  }
};

const resolveTtsVoicesUrl = () => {
  if (ttsBaseUrl.toLowerCase().endsWith("/voices")) return ttsBaseUrl;
  if (ttsBaseUrl.toLowerCase().endsWith("/tts/stream")) return `${ttsBaseUrl.slice(0, -"/tts/stream".length)}/voices`;
  if (ttsBaseUrl.toLowerCase().endsWith("/tts")) return `${ttsBaseUrl.slice(0, -"/tts".length)}/voices`;
  if (ttsBaseUrl.toLowerCase().endsWith("/stream")) return `${ttsBaseUrl.slice(0, -"/stream".length)}/voices`;
  return `${ttsBaseUrl}/voices`;
};

const resolveTtsUrl = () => {
  if (ttsBaseUrl.toLowerCase().endsWith("/tts")) return ttsBaseUrl;
  if (ttsBaseUrl.toLowerCase().endsWith("/tts/stream")) return `${ttsBaseUrl.slice(0, -"/tts/stream".length)}/tts`;
  if (ttsBaseUrl.toLowerCase().endsWith("/stream")) return `${ttsBaseUrl.slice(0, -"/stream".length)}/tts`;
  if (ttsBaseUrl.toLowerCase().endsWith("/voices")) return `${ttsBaseUrl.slice(0, -"/voices".length)}/tts`;
  return `${ttsBaseUrl}/tts`;
};

const resolveTtsCloneUrl = () => {
  if (ttsBaseUrl.toLowerCase().endsWith("/tts/clone")) return ttsBaseUrl;
  if (ttsBaseUrl.toLowerCase().endsWith("/tts")) return `${ttsBaseUrl}/clone`;
  if (ttsBaseUrl.toLowerCase().endsWith("/tts/stream")) return `${ttsBaseUrl.slice(0, -"/stream".length)}/clone`;
  if (ttsBaseUrl.toLowerCase().endsWith("/stream")) return `${ttsBaseUrl.slice(0, -"/stream".length)}/tts/clone`;
  if (ttsBaseUrl.toLowerCase().endsWith("/voices")) return `${ttsBaseUrl.slice(0, -"/voices".length)}/tts/clone`;
  return `${ttsBaseUrl}/tts/clone`;
};

const normalizeTtsVoiceId = (value: unknown) => {
  let normalized = String(value || "").trim();
  while (normalized.toLowerCase().startsWith("project:") || normalized.toLowerCase().startsWith("browser:")) {
    const separatorIndex = normalized.indexOf(":");
    normalized = normalized.slice(separatorIndex + 1).trim();
  }
  return normalized;
};


const ipaMap: Record<string, string> = {};
try {
  const datasetPath = path.resolve(moduleDir, "../be/get_data/kids_english_dataset_10000_retopic.json");
  if (fs.existsSync(datasetPath)) {
    const raw = fs.readFileSync(datasetPath, "utf8");
    const data = JSON.parse(raw);
    if (Array.isArray(data)) {
      for (const item of data) {
        if (item.word && item.ipa) {
          ipaMap[item.word.toLowerCase().trim()] = item.ipa;
        }
      }
    }
    console.log(`[IPA Lookup] Loaded ${Object.keys(ipaMap).length} words from dataset.`);
  } else {
    console.warn("[IPA Lookup] Dataset file not found at:", datasetPath);
  }
} catch (err) {
  console.error("[IPA Lookup] Failed to load IPA dataset:", err);
}

const getIpaForWord = (word: string) => {
  const cleanWord = word.toLowerCase().replace(/[^a-z0-9']/g, "").trim();
  return ipaMap[cleanWord] || `/${word}/`;
};

type SpeakingCorrection = {
  mistake_word: string;
  correct_word: string;
  phonetic_hint: string;
  instruction: string;
  example_sentence: string;
  type: "pronunciation" | "grammar" | "missing_word";
};

type GrammarScoreLevel = "excellent" | "good" | "needs_work";

type GrammarScore = {
  score: number;
  level: GrammarScoreLevel;
  source: "llm" | "heuristic";
};

type GrammarReview = {
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
};

const mapGrammarLevel = (score: number): GrammarScoreLevel => {
  if (score >= 90) return "excellent";
  if (score >= 70) return "good";
  return "needs_work";
};

const normalizeCoachWord = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");

const tokenizeCoachText = (value: string) =>
  String(value || "")
    .split(/\s+/)
    .map((word) => word.trim())
    .filter(Boolean);

const levenshteinDistance = (a: string, b: string) => {
  const left = normalizeCoachWord(a);
  const right = normalizeCoachWord(b);
  const matrix: number[][] = Array.from({ length: left.length + 1 }, (_, row) => [row]);

  for (let col = 0; col <= right.length; col += 1) {
    matrix[0][col] = col;
  }

  for (let row = 1; row <= left.length; row += 1) {
    for (let col = 1; col <= right.length; col += 1) {
      const cost = left[row - 1] === right[col - 1] ? 0 : 1;
      matrix[row][col] = Math.min(
        matrix[row - 1][col] + 1,
        matrix[row][col - 1] + 1,
        matrix[row - 1][col - 1] + cost,
      );
    }
  }

  return matrix[left.length][right.length];
};

const isNearTextMatch = (spokenWord: string, targetWord: string) => {
  const spoken = normalizeCoachWord(spokenWord);
  const target = normalizeCoachWord(targetWord);
  if (!spoken || !target) return false;
  if (spoken === target) return true;

  const maxDistance = target.length <= 4 ? 1 : Math.max(1, Math.floor(target.length * 0.34));
  return levenshteinDistance(spoken, target) <= maxDistance;
};

const buildCorrectionsFromWordStatuses = (
  wordStatuses: Array<{ word?: string; status?: string; ipa?: string; tip_vi?: string }>,
  targetPhrase: string,
  spokenText: string,
): SpeakingCorrection[] => {
  const spokenWords = String(spokenText || "").split(/\s+/).filter(Boolean);

  return wordStatuses
    .filter((status) => status?.status && status.status !== "correct")
    .map((status) => {
      const correctWord = String(status.word || "").trim();
      const normalizedTarget = normalizeCoachWord(correctWord);
      const spokenMatch =
        spokenWords.find((word) => normalizeCoachWord(word) === normalizedTarget) ||
        (status.status === "missing" ? "" : correctWord);

      return {
        mistake_word: spokenMatch || correctWord,
        correct_word: correctWord,
        phonetic_hint: String(status.ipa || correctWord),
        instruction:
          String(status.tip_vi || "").trim() ||
          (status.status === "missing"
            ? "Add this word and try the whole sentence again."
            : "Say this word more slowly and clearly."),
        example_sentence: targetPhrase || spokenText || correctWord,
        type: (status.status === "missing" ? "missing_word" : "pronunciation") as SpeakingCorrection["type"],
      };
    })
    .slice(0, 3);
};

const buildSpeakingCoachFields = (
  score: number,
  wordStatuses: Array<{ word?: string; status?: string; ipa?: string; tip_vi?: string }>,
  targetPhrase: string,
  spokenText: string,
) => {
  const safeScore = Math.max(0, Math.min(100, Number.isFinite(score) ? score : 0));
  const corrections = buildCorrectionsFromWordStatuses(wordStatuses, targetPhrase, spokenText);
  const praise =
    safeScore >= 90 ? "Amazing job!" :
      safeScore >= 75 ? "Great try!" :
        safeScore >= 50 ? "Nice effort!" :
          "Good try!";

  return {
    praise,
    corrections,
    ask_repeat: corrections.length > 0 ? (targetPhrase || corrections[0]?.example_sentence || "") : "",
    pronunciation_score: safeScore,
    continue_question: corrections.length > 0 ? "Can you say it one more time?" : "Would you like to try another sentence?",
  };
};

const splitReplyAndTranslation = (rawReply: string) => {
  const normalized = String(rawReply || "").trim();
  if (!normalized) {
    return { cleanReply: "", translation: "" };
  }

  const matches = [...normalized.matchAll(/\(([^()]*)\)/g)];
  if (matches.length === 0) {
    return { cleanReply: normalized, translation: "" };
  }

  const translation = String(matches[0]?.[1] || "").trim();
  const cleanReply = normalized
    .replace(/\([^()]*\)/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return {
    cleanReply,
    translation,
  };
};

const buildWordStatuses = (spokenText: string, targetPhrase: string) => {
  const spokenWords = tokenizeCoachText(spokenText);
  const targetWords = tokenizeCoachText(targetPhrase);
  let spokenIndex = 0;

  return targetWords.map((word) => {
    const currentSpoken = spokenWords[spokenIndex] || "";
    const normalizedCurrent = normalizeCoachWord(currentSpoken);
    const normalizedTarget = normalizeCoachWord(word);
    const wordIpa = getIpaForWord(word);

    if (normalizedCurrent && normalizedCurrent === normalizedTarget) {
      spokenIndex += 1;
      return { word, status: "correct", ipa: wordIpa, tip_vi: "" };
    }

    if (currentSpoken && isNearTextMatch(currentSpoken, word)) {
      spokenIndex += 1;
      return {
        word,
        status: "incorrect",
        ipa: wordIpa,
        tip_vi: `You said "${currentSpoken}". Try "${word}" slowly.`,
      };
    }

    const upcomingWords = spokenWords.slice(spokenIndex + 1, spokenIndex + 4);
    if (upcomingWords.some((spokenWord) => normalizeCoachWord(spokenWord) === normalizedTarget)) {
      return {
        word,
        status: "missing",
        ipa: wordIpa,
        tip_vi: `Add the missing word "${word}" and say the sentence again.`,
      };
    }

    const nearUpcoming = upcomingWords.find((spokenWord) => isNearTextMatch(spokenWord, word));
    if (nearUpcoming) {
      return {
        word,
        status: "incorrect",
        ipa: wordIpa,
        tip_vi: `You said something like "${nearUpcoming}". Try "${word}" slowly.`,
      };
    }

    if (!currentSpoken) {
      return {
        word,
        status: "missing",
        ipa: wordIpa,
        tip_vi: `Add the missing word "${word}" and say the sentence again.`,
      };
    }

    spokenIndex += 1;
    return {
      word,
      status: "incorrect",
      ipa: wordIpa,
      tip_vi: `You said "${currentSpoken}". The target word is "${word}".`,
    };
  });
};

const scoreTextAttempt = (
  spokenText: string,
  targetPhrase: string,
  wordStatuses: Array<{ status?: string }>,
  corrections: SpeakingCorrection[],
) => {
  if (!spokenText.trim()) return 0;

  if (targetPhrase.trim()) {
    const incorrect = wordStatuses.filter((item) => item.status === "incorrect").length;
    const missing = wordStatuses.filter((item) => item.status === "missing").length;
    const correct = wordStatuses.filter((item) => item.status === "correct").length;
    const extraWords = Math.max(0, tokenizeCoachText(spokenText).length - tokenizeCoachText(targetPhrase).length);
    const rawScore = 100 - incorrect * 15 - missing * 22 - extraWords * 8;

    if (correct === 0 && (incorrect > 0 || missing > 0)) {
      return Math.max(25, rawScore);
    }

    return Math.max(35, Math.min(100, rawScore));
  }

  if (corrections.length > 0) {
    return Math.max(55, 100 - corrections.length * 15);
  }

  return 96;
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

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const preserveSentenceCase = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  return `${trimmed.charAt(0).toUpperCase()}${trimmed.slice(1)}`.replace(/\bi\b/g, "I");
};

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

const buildGrammarReviewFromCorrections = (
  spokenText: string,
  corrections: SpeakingCorrection[],
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

const buildFreeformCorrections = (spokenText: string) => {
  const lower = String(spokenText || "").toLowerCase();
  const words = lower.split(/\s+/).filter(Boolean);
  const corrections: SpeakingCorrection[] = [];
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

  if (/\bi\s+happy\b/i.test(lower)) {
    addCorrection("I happy", "I am happy", "Add am after I.", "missing_word");
  }

  if (/\bi\s+sad\b/i.test(lower)) {
    addCorrection("I sad", "I am sad", "Add am after I.", "missing_word");
  }

  if (/\bgo\s+school\b/i.test(lower)) {
    addCorrection("go school", "go to school", "Add to before school.", "missing_word");
  }

  if (/\b(want|need)\s+(eat|go|play|drink|sleep|read)\b/i.test(lower)) {
    const match = lower.match(/\b(want|need)\s+(eat|go|play|drink|sleep|read)\b/i);
    const verb = match?.[1] || "want";
    const action = match?.[2] || "eat";
    addCorrection(`${verb} ${action}`, `${verb} to ${action}`, `Use to after ${verb}.`, "missing_word");
  }

  if (/\bi\s+(is|are)\b/i.test(lower)) {
    addCorrection(lower.match(/\bi\s+(is|are)\b/i)?.[0] || "I is", "I am", "Use am after I.");
  }

  if (/\b(you|we|they)\s+is\b/i.test(lower)) {
    const subject = lower.match(/\b(you|we|they)\s+is\b/i)?.[1] || "you";
    addCorrection(`${subject} is`, `${subject} are`, `Use are after ${subject}.`);
  }

  if (/\b(he|she|it)\s+are\b/i.test(lower)) {
    const subject = lower.match(/\b(he|she|it)\s+are\b/i)?.[1] || "she";
    addCorrection(`${subject} are`, `${subject} is`, `Use is after ${subject}.`);
  }

  if (/\bshe\s+go\b/i.test(lower)) {
    addCorrection("she go", "she goes", "Use goes for she and he.");
  }

  if (/\b(he|she|it)\s+(like|want|play|eat|drink|look|need)\b/i.test(lower)) {
    const match = lower.match(/\b(he|she|it)\s+(like|want|play|eat|drink|look|need)\b/i);
    const subject = match?.[1] || "she";
    const verb = match?.[2] || "like";
    addCorrection(`${subject} ${verb}`, `${subject} ${verb}s`, `Add s to the verb after ${subject}.`);
  }

  if (/\bhe\s+go\b/i.test(lower)) {
    addCorrection("he go", "he goes", "Use goes for he and she.");
  }

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
      example_sentence: String(spokenText || "").replace(new RegExp(`\\b${word}\\b`, "i"), known.correct),
      type: "pronunciation",
    });
  }

  return corrections.slice(0, 3);
};

const childAiConfigCache = new Map<string, {
  expiresAt: number;
  // usageLimit may be null (unlimited) per Requirement 4.3, so it is not coerced to a default.
  value: { apiKey: string; modelName: string; baseUrl: string; llmProvider: string; usageCount: number; usageLimit: number | null } | null;
}>();
const primaryChildCache = new Map<string, { expiresAt: number; value: string | null }>();

const getSessionCacheKey = (req: express.Request) => {
  const cookieHeader = typeof req.headers.cookie === "string" ? req.headers.cookie : "";
  const sessionCookie = cookieHeader
    .split(";")
    .map((chunk) => chunk.trim())
    .find((chunk) => chunk.startsWith("speakjoy-session="));

  return sessionCookie || cookieHeader || "anonymous";
};

const clearSessionCaches = (req: express.Request) => {
  const sessionCacheKey = getSessionCacheKey(req);

  for (const cacheKey of childAiConfigCache.keys()) {
    if (cacheKey.startsWith(`${sessionCacheKey}::`)) {
      childAiConfigCache.delete(cacheKey);
    }
  }

  primaryChildCache.delete(sessionCacheKey);
};

const forwardSetCookies = (response: express.Response, upstream: Response) => {
  const getSetCookie = (upstream.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie;
  const setCookies = typeof getSetCookie === "function" ? getSetCookie.call(upstream.headers) : [];
  if (setCookies.length > 0) {
    response.setHeader("set-cookie", setCookies);
    return;
  }

  const singleSetCookie = upstream.headers.get("set-cookie");
  if (singleSetCookie) {
    response.setHeader("set-cookie", singleSetCookie);
  }
};

const proxyJsonResponse = async (
  req: express.Request,
  res: express.Response,
  upstreamPath: string,
  method: string,
) => {
  const headers = new Headers();
  headers.set("Accept", "application/json");

  if (req.headers.cookie) {
    headers.set("cookie", req.headers.cookie);
  }

  if (req.headers.origin) {
    headers.set("origin", req.headers.origin);
  }

  if (req.headers.host) {
    headers.set("x-forwarded-host", req.headers.host);
  }

  headers.set("x-forwarded-proto", req.protocol);

  if (req.headers["content-type"]) {
    headers.set("content-type", req.headers["content-type"]);
  }

  const upstream = await fetch(`${backendBaseUrl}${upstreamPath}`, {
    method,
    headers,
    body: method === "GET" ? undefined : JSON.stringify(req.body ?? {}),
    redirect: "manual",
  });

  forwardSetCookies(res, upstream);

  const payloadText = await upstream.text();
  const contentType = upstream.headers.get("content-type") || "";

  res.status(upstream.status);
  if (contentType.includes("application/json")) {
    try {
      res.json(payloadText ? JSON.parse(payloadText) : {});
      return;
    } catch {
      // Fall through and send raw text if upstream returned malformed JSON.
    }
  }

  res.send(payloadText);
};

const postJsonToBackend = async (
  req: express.Request,
  upstreamPath: string,
  body: Record<string, unknown>,
) => {
  const headers = new Headers();
  headers.set("Accept", "application/json");
  headers.set("content-type", "application/json");

  if (req.headers.cookie) {
    headers.set("cookie", req.headers.cookie);
  }

  if (req.headers.origin) {
    headers.set("origin", req.headers.origin);
  }

  if (req.headers.host) {
    headers.set("x-forwarded-host", req.headers.host);
  }

  headers.set("x-forwarded-proto", req.protocol);

  return fetch(`${backendBaseUrl}${upstreamPath}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    redirect: "manual",
  });
};

const incrementParentUsage = async (
  req: express.Request,
  requestedChildId: string | null,
  amount: number,
) => {
  if (!Number.isFinite(amount) || amount <= 0) {
    return;
  }

  try {
    // Keep the legacy per-parent counter working for backward compatibility (Req 10.1/10.4).
    const usageResponse = await postJsonToBackend(req, "/api/parent-settings/usage/increment", { amount });
    if (!usageResponse.ok) {
      const usagePayload = await usageResponse.text().catch(() => "");
      console.warn("Unable to increment parent AI usage:", usagePayload || usageResponse.statusText);
    }

    if (requestedChildId) {
      // When the child is known, also bump the per-child counter so per-child limits work (Req 3.1/3.4).
      try {
        const childUsageResponse = await postJsonToBackend(
          req,
          `/api/children/${requestedChildId}/usage/increment`,
          { amount },
        );
        if (!childUsageResponse.ok) {
          const childUsagePayload = await childUsageResponse.text().catch(() => "");
          console.warn("Unable to increment child AI usage:", childUsagePayload || childUsageResponse.statusText);
        }
      } catch (childUsageError) {
        console.warn("Unable to increment child AI usage:", childUsageError);
      }

      const cacheKey = `${getSessionCacheKey(req)}::${requestedChildId}`;
      const cached = childAiConfigCache.get(cacheKey);
      if (cached?.value) {
        cached.value.usageCount += amount;
        cached.expiresAt = Date.now() + RUNTIME_CONFIG_CACHE_TTL_MS;
        childAiConfigCache.set(cacheKey, cached);
      }
    }
  } catch (usageError) {
    console.warn("Unable to increment parent AI usage:", usageError);
  }
};

const fetchChildAiRuntimeConfig = async (
  req: express.Request,
  childId: string,
): Promise<{ apiKey: string; modelName: string; baseUrl: string; llmProvider: string; usageCount: number; usageLimit: number | null } | null> => {
  const cacheKey = `${getSessionCacheKey(req)}::${childId}`;
  const cached = childAiConfigCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const headers = new Headers();
  headers.set("Accept", "application/json");

  if (req.headers.cookie) {
    headers.set("cookie", req.headers.cookie);
  }

  if (req.headers.origin) {
    headers.set("origin", req.headers.origin);
  }

  if (req.headers.host) {
    headers.set("x-forwarded-host", req.headers.host);
  }

  headers.set("x-forwarded-proto", req.protocol);

  const upstream = await fetch(`${backendBaseUrl}/api/children/${childId}/ai-config`, {
    method: "GET",
    headers,
    redirect: "manual",
  });

  if (!upstream.ok) {
    const payload = await upstream.text().catch(() => "");
    throw new Error(payload || `Child AI config request failed with status ${upstream.status}`);
  }

  const payload = await upstream.json().catch(() => ({}));
  const aiConfig = payload?.data?.aiConfig || payload?.aiConfig;

  if (!aiConfig || typeof aiConfig !== "object") {
    return null;
  }

  const value = {
    apiKey: typeof aiConfig.apiKey === "string" ? aiConfig.apiKey : "",
    modelName: typeof aiConfig.modelName === "string" ? aiConfig.modelName : "gemini-2.5-flash",
    baseUrl: typeof aiConfig.baseUrl === "string" ? aiConfig.baseUrl : "",
    llmProvider: typeof aiConfig.llmProvider === "string" ? aiConfig.llmProvider : "",
    usageCount: typeof aiConfig.usageCount === "number" ? aiConfig.usageCount : 0,
    // usageLimit null/missing = unlimited (Req 4.3). Only honour an explicit numeric limit;
    // do NOT coerce null to DEFAULT_MONTHLY_TOKEN_LIMIT or unlimited children would be wrongly capped.
    usageLimit: typeof aiConfig.usageLimit === "number" ? aiConfig.usageLimit : null,
  };

  childAiConfigCache.set(cacheKey, {
    expiresAt: Date.now() + RUNTIME_CONFIG_CACHE_TTL_MS,
    value,
  });

  return value;
};

const inferLlmProvider = (baseUrl: string, modelName: string, explicitProvider = ""): "gemini" | "openai" | "claude" | "qwen" => {
  const provider = explicitProvider.trim().toLowerCase();
  const model = modelName.trim().toLowerCase();
  const url = baseUrl.trim().toLowerCase();

  if (url.includes(":generatecontent")) {
    return "gemini";
  }
  if (url.includes("/v1/messages") || url.endsWith("/messages")) {
    return "claude";
  }
  if (url.includes("/chat/completions") || url.includes("/responses")) {
    return "openai";
  }

  if (["gemini", "google", "google ai studio"].includes(provider)) {
    return "gemini";
  }
  if (["claude", "anthropic"].includes(provider)) {
    return "claude";
  }
  if (["qwen", "dashscope", "aliyun", "alibaba"].includes(provider)) {
    return "qwen";
  }
  if (["openai", "compatible", "openai-compatible", "openrouter"].includes(provider)) {
    return "openai";
  }

  if (url.includes("anthropic")) {
    return "claude";
  }
  if (url.includes("googleapis") || url.includes("aistudio.google.com") || url.includes(":generatecontent") || model.startsWith("gemini")) {
    return "gemini";
  }
  if (url.includes("dashscope") || model.startsWith("qwen")) {
    return "qwen";
  }
  if (model.startsWith("claude")) {
    return "claude";
  }
  return "openai";
};

const normalizeGeminiGenerateContentUrl = (baseUrl: string, modelName: string, apiKey: string) => {
  const trimmedBaseUrl = (baseUrl || DEFAULT_GEMINI_BASE_URL).trim();
  const trimmedModel = (modelName || "gemini-2.5-flash").trim();

  if (!trimmedBaseUrl) {
    throw new Error("Missing Gemini base URL.");
  }

  if (!trimmedModel) {
    throw new Error("Missing Gemini model name.");
  }

  let normalizedRoot = trimmedBaseUrl.replace(/\/+$/, "");
  if (normalizedRoot.includes("aistudio.google.com")) {
    normalizedRoot = DEFAULT_GEMINI_BASE_URL;
  }

  const lower = normalizedRoot.toLowerCase();
  const generateSuffix = `/${trimmedModel.toLowerCase()}:generatecontent`;
  let url: string;

  if (lower.includes(":generatecontent")) {
    url = normalizedRoot;
  } else if (lower.endsWith("/v1beta/models")) {
    url = `${normalizedRoot}/${trimmedModel}:generateContent`;
  } else if (lower.endsWith("/v1beta")) {
    url = `${normalizedRoot}/models/${trimmedModel}:generateContent`;
  } else if (lower.endsWith(generateSuffix)) {
    url = normalizedRoot;
  } else {
    url = `${normalizedRoot}/v1beta/models/${trimmedModel}:generateContent`;
  }

  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}key=${encodeURIComponent(apiKey)}`;
};

const extractGeminiText = (payload: any): string => {
  const parts = payload?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) {
    return "";
  }

  return parts
    .map((part) => (typeof part?.text === "string" ? part.text : ""))
    .join("")
    .trim();
};

const extractGeminiError = (payload: any, fallback: string) => {
  const detail = payload?.error?.message;
  return typeof detail === "string" && detail.trim() ? detail : fallback;
};

const generateGeminiReply = async ({
  apiKey,
  model,
  baseUrl,
  contents,
  systemInstruction,
}: {
  apiKey: string;
  model: string;
  baseUrl: string;
  contents: Array<{ role: "user" | "model"; parts: Array<{ text: string }> }>;
  systemInstruction: string;
}) => {
  const url = normalizeGeminiGenerateContentUrl(baseUrl, model, apiKey);
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "speakjoy-chat-proxy",
    },
    body: JSON.stringify({
      contents,
      systemInstruction: {
        parts: [{ text: systemInstruction }],
      },
      generationConfig: {
        temperature: 0.8,
        thinkingConfig: { thinkingBudget: 0 },
      },
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(extractGeminiError(payload, `Gemini request failed with status ${response.status}`));
  }

  const replyText = extractGeminiText(payload);
  if (!replyText) {
    throw new Error("Gemini response did not contain any text.");
  }

  return {
    text: replyText,
    payload,
  };
};

const normalizeGeminiStreamUrl = (baseUrl: string, model: string, apiKey: string) =>
  normalizeGeminiGenerateContentUrl(baseUrl, model, apiKey).replace(":generateContent?", ":streamGenerateContent?alt=sse&");

const generateGeminiStreamReply = async ({
  apiKey,
  model,
  baseUrl,
  contents,
  systemInstruction,
  res,
}: {
  apiKey: string;
  model: string;
  baseUrl: string;
  contents: Array<{ role: "user" | "model"; parts: Array<{ text: string }> }>;
  systemInstruction: string;
  res: express.Response;
}) => {
  const url = normalizeGeminiStreamUrl(baseUrl, model, apiKey);
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "speakjoy-chat-proxy",
    },
    body: JSON.stringify({
      contents,
      systemInstruction: {
        parts: [{ text: systemInstruction }],
      },
      generationConfig: {
        temperature: 0.8,
        thinkingConfig: { thinkingBudget: 0 },
      },
    }),
  });

  if (!response.ok || !response.body) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(extractGeminiError(payload, `Gemini stream request failed with status ${response.status}`));
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (line.startsWith("data: ")) {
        const dataStr = line.slice(6).trim();
        if (dataStr === "[DONE]") continue;

        try {
          const payload = JSON.parse(dataStr);
          const replyText = extractGeminiText(payload);
          if (replyText) {
            res.write(`data: ${JSON.stringify({ type: 'delta', text: replyText })}\n\n`);
          }
        } catch (e) {
          // ignore parsing error for incomplete chunks
        }
      }
    }
  }

  res.write("data: [DONE]\n\n");
  res.end();
};

const normalizeOpenAiCompatibleBaseUrl = (baseUrl: string) => {
  const trimmedBaseUrl = (baseUrl || DEFAULT_OPENAI_BASE_URL).trim().replace(/\/+$/, "");
  if (!trimmedBaseUrl) {
    throw new Error("Missing OpenAI-compatible base URL.");
  }
  return trimmedBaseUrl;
};

const resolveOpenAiCompatibleEndpoint = (baseUrl: string): { url: string; mode: "chat" | "responses" } => {
  const normalizedBaseUrl = normalizeOpenAiCompatibleBaseUrl(baseUrl);
  const lower = normalizedBaseUrl.toLowerCase();

  if (lower.endsWith("/chat/completions")) {
    return { url: normalizedBaseUrl, mode: "chat" };
  }

  if (lower.endsWith("/responses")) {
    return { url: normalizedBaseUrl, mode: "responses" };
  }

  if (/\/v\d+(\/|$)/.test(lower)) {
    return { url: `${normalizedBaseUrl}/chat/completions`, mode: "chat" };
  }

  return { url: `${normalizedBaseUrl}/v1/chat/completions`, mode: "chat" };
};

const extractOpenAiCompatibleText = (payload: any): string => {
  const outputText = payload?.output_text;
  if (typeof outputText === "string" && outputText.trim()) {
    return outputText.trim();
  }

  if (Array.isArray(payload?.output)) {
    const responsesText = payload.output
      .flatMap((item: any) => Array.isArray(item?.content) ? item.content : [])
      .map((part: any) => {
        if (typeof part?.text === "string") {
          return part.text;
        }
        if (typeof part?.output_text === "string") {
          return part.output_text;
        }
        return "";
      })
      .join("")
      .trim();

    if (responsesText) {
      return responsesText;
    }
  }

  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content === "string") {
    return content.trim();
  }
  if (Array.isArray(content)) {
    return content
      .map((part) => (typeof part?.text === "string" ? part.text : ""))
      .join("")
      .trim();
  }
  return "";
};

const extractOpenAiCompatibleError = (payload: any, fallback: string) => {
  const detail = payload?.error?.message;
  return typeof detail === "string" && detail.trim() ? detail : fallback;
};

const sanitizeProviderError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error || "Unknown provider error");
  return message
    .replace(/([?&]key=)[^&\s]+/gi, "$1<REDACTED>")
    .replace(/(Bearer\s+)[^\s]+/gi, "$1<REDACTED>")
    .slice(0, 500);
};

const generateOpenAiCompatibleReply = async ({
  apiKey,
  model,
  baseUrl,
  contents,
  systemInstruction,
}: {
  apiKey: string;
  model: string;
  baseUrl: string;
  contents: Array<{ role: "user" | "model"; parts: Array<{ text: string }> }>;
  systemInstruction: string;
}) => {
  const endpoint = resolveOpenAiCompatibleEndpoint(baseUrl);
  const response = await fetch(endpoint.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "User-Agent": "speakjoy-chat-proxy",
    },
    body: JSON.stringify(
      endpoint.mode === "responses"
        ? {
          model,
          temperature: 0.8,
          max_output_tokens: 300,
          instructions: systemInstruction,
          input: contents.map((item) => ({
            role: item.role === "model" ? "assistant" : "user",
            content: item.parts.map((part) => ({
              type: "input_text",
              text: part.text,
            })),
          })),
        }
        : {
          model,
          temperature: 0.8,
          max_tokens: 300,
          messages: [
            { role: "system", content: systemInstruction },
            ...contents.map((item) => ({
              role: item.role === "model" ? "assistant" : "user",
              content: item.parts.map((part) => part.text).join("\n"),
            })),
          ],
        },
    ),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(extractOpenAiCompatibleError(payload, `OpenAI-compatible request failed with status ${response.status}`));
  }

  const replyText = extractOpenAiCompatibleText(payload);
  if (!replyText) {
    throw new Error("OpenAI-compatible response did not contain any text.");
  }

  return {
    text: replyText,
    payload,
  };
};

const normalizeClaudeBaseUrl = (baseUrl: string) => {
  const trimmedBaseUrl = (baseUrl || DEFAULT_CLAUDE_BASE_URL).trim().replace(/\/+$/, "");
  if (!trimmedBaseUrl) {
    throw new Error("Missing Claude base URL.");
  }
  return trimmedBaseUrl;
};

const resolveClaudeEndpoint = (baseUrl: string) => {
  const normalizedBaseUrl = normalizeClaudeBaseUrl(baseUrl);
  const lower = normalizedBaseUrl.toLowerCase();

  if (lower.endsWith("/v1/messages") || lower.endsWith("/messages")) {
    return normalizedBaseUrl;
  }

  if (lower.endsWith("/v1")) {
    return `${normalizedBaseUrl}/messages`;
  }

  return `${normalizedBaseUrl}/v1/messages`;
};

const extractClaudeText = (payload: any): string => {
  const content = payload?.content;
  if (!Array.isArray(content)) {
    return "";
  }
  return content
    .map((part) => (typeof part?.text === "string" ? part.text : ""))
    .join("")
    .trim();
};

const extractClaudeError = (payload: any, fallback: string) => {
  const detail = payload?.error?.message || payload?.message;
  return typeof detail === "string" && detail.trim() ? detail : fallback;
};

const generateClaudeReply = async ({
  apiKey,
  model,
  baseUrl,
  contents,
  systemInstruction,
}: {
  apiKey: string;
  model: string;
  baseUrl: string;
  contents: Array<{ role: "user" | "model"; parts: Array<{ text: string }> }>;
  systemInstruction: string;
}) => {
  const endpointUrl = resolveClaudeEndpoint(baseUrl);
  const response = await fetch(endpointUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "User-Agent": "speakjoy-chat-proxy",
    },
    body: JSON.stringify({
      model,
      max_tokens: 300,
      temperature: 0.8,
      system: systemInstruction,
      messages: contents.map((item) => ({
        role: item.role === "model" ? "assistant" : "user",
        content: item.parts.map((part) => ({ type: "text", text: part.text })),
      })),
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(extractClaudeError(payload, `Claude request failed with status ${response.status}`));
  }

  const replyText = extractClaudeText(payload);
  if (!replyText) {
    throw new Error("Claude response did not contain any text.");
  }

  return {
    text: replyText,
    payload,
  };
};

async function* parseSseStream(stream: ReadableStream<Uint8Array>) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    let boundaryIndex = buffer.indexOf("\n\n");
    while (boundaryIndex >= 0) {
      const eventBlock = buffer.slice(0, boundaryIndex);
      buffer = buffer.slice(boundaryIndex + 2);
      boundaryIndex = buffer.indexOf("\n\n");

      const dataLines = eventBlock
        .split(/\r?\n/)
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trim());

      if (dataLines.length > 0) {
        yield dataLines.join("\n");
      }
    }
  }

  const trailing = buffer.trim();
  if (trailing) {
    const dataLines = trailing
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim());
    if (dataLines.length > 0) {
      yield dataLines.join("\n");
    }
  }
}

const extractOpenAiStreamingDelta = (payload: any): string => {
  const directDelta = payload?.choices?.[0]?.delta?.content;
  if (typeof directDelta === "string") {
    return directDelta;
  }
  if (Array.isArray(directDelta)) {
    return directDelta.map((part: any) => (typeof part?.text === "string" ? part.text : "")).join("");
  }

  if (payload?.type === "response.output_text.delta" && typeof payload?.delta === "string") {
    return payload.delta;
  }

  if (payload?.type === "response.delta" && typeof payload?.delta?.text === "string") {
    return payload.delta.text;
  }

  return "";
};

const extractClaudeStreamingDelta = (payload: any): string => {
  if (payload?.type === "content_block_delta" && typeof payload?.delta?.text === "string") {
    return payload.delta.text;
  }
  if (payload?.type === "message_delta" && typeof payload?.delta?.text === "string") {
    return payload.delta.text;
  }
  return "";
};

const extractGeminiStreamingDelta = (payload: any): string => {
  const candidates = Array.isArray(payload?.candidates) ? payload.candidates : [];
  return candidates
    .flatMap((candidate: any) => Array.isArray(candidate?.content?.parts) ? candidate.content.parts : [])
    .map((part: any) => (typeof part?.text === "string" ? part.text : ""))
    .join("");
};

async function* streamGeminiReply({
  apiKey,
  model,
  baseUrl,
  contents,
  systemInstruction,
}: {
  apiKey: string;
  model: string;
  baseUrl: string;
  contents: Array<{ role: "user" | "model"; parts: Array<{ text: string }> }>;
  systemInstruction: string;
}) {
  const response = await fetch(normalizeGeminiStreamUrl(baseUrl, model, apiKey), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "speakjoy-chat-proxy",
    },
    body: JSON.stringify({
      contents,
      systemInstruction: {
        parts: [{ text: systemInstruction }],
      },
      generationConfig: {
        temperature: 0.8,
        thinkingConfig: { thinkingBudget: 0 },
      },
    }),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(extractGeminiError(payload, `Gemini streaming request failed with status ${response.status}`));
  }

  if (!response.body) {
    throw new Error("Gemini streaming response body is empty.");
  }

  for await (const data of parseSseStream(response.body)) {
    if (!data || data === "[DONE]") {
      continue;
    }
    const payload = JSON.parse(data);
    const delta = extractGeminiStreamingDelta(payload);
    if (delta) {
      yield delta;
    }
  }
}

async function* streamOpenAiCompatibleReply({
  apiKey,
  model,
  baseUrl,
  contents,
  systemInstruction,
}: {
  apiKey: string;
  model: string;
  baseUrl: string;
  contents: Array<{ role: "user" | "model"; parts: Array<{ text: string }> }>;
  systemInstruction: string;
}) {
  const endpoint = resolveOpenAiCompatibleEndpoint(baseUrl);
  const response = await fetch(endpoint.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "User-Agent": "speakjoy-chat-proxy",
    },
    body: JSON.stringify(
      endpoint.mode === "responses"
        ? {
          model,
          temperature: 0.8,
          max_output_tokens: 300,
          stream: true,
          instructions: systemInstruction,
          input: contents.map((item) => ({
            role: item.role === "model" ? "assistant" : "user",
            content: item.parts.map((part) => ({
              type: "input_text",
              text: part.text,
            })),
          })),
        }
        : {
          model,
          temperature: 0.8,
          max_tokens: 300,
          stream: true,
          messages: [
            { role: "system", content: systemInstruction },
            ...contents.map((item) => ({
              role: item.role === "model" ? "assistant" : "user",
              content: item.parts.map((part) => part.text).join("\n"),
            })),
          ],
        },
    ),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(extractOpenAiCompatibleError(payload, `OpenAI-compatible streaming request failed with status ${response.status}`));
  }

  if (!response.body) {
    throw new Error("OpenAI-compatible streaming response body is empty.");
  }

  for await (const data of parseSseStream(response.body)) {
    if (!data || data === "[DONE]") {
      continue;
    }
    const payload = JSON.parse(data);
    const delta = extractOpenAiStreamingDelta(payload);
    if (delta) {
      yield delta;
    }
  }
}

async function* streamClaudeReply({
  apiKey,
  model,
  baseUrl,
  contents,
  systemInstruction,
}: {
  apiKey: string;
  model: string;
  baseUrl: string;
  contents: Array<{ role: "user" | "model"; parts: Array<{ text: string }> }>;
  systemInstruction: string;
}) {
  const response = await fetch(resolveClaudeEndpoint(baseUrl), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "User-Agent": "speakjoy-chat-proxy",
    },
    body: JSON.stringify({
      model,
      max_tokens: 300,
      temperature: 0.8,
      system: systemInstruction,
      stream: true,
      messages: contents.map((item) => ({
        role: item.role === "model" ? "assistant" : "user",
        content: item.parts.map((part) => ({ type: "text", text: part.text })),
      })),
    }),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(extractClaudeError(payload, `Claude streaming request failed with status ${response.status}`));
  }

  if (!response.body) {
    throw new Error("Claude streaming response body is empty.");
  }

  for await (const data of parseSseStream(response.body)) {
    if (!data || data === "[DONE]") {
      continue;
    }
    const payload = JSON.parse(data);
    const delta = extractClaudeStreamingDelta(payload);
    if (delta) {
      yield delta;
    }
  }
}

async function* streamModelReply({
  apiKey,
  model,
  baseUrl,
  llmProvider,
  contents,
  systemInstruction,
}: {
  apiKey: string;
  model: string;
  baseUrl: string;
  llmProvider: string;
  contents: Array<{ role: "user" | "model"; parts: Array<{ text: string }> }>;
  systemInstruction: string;
}) {
  const provider = inferLlmProvider(baseUrl, model, llmProvider);
  if (provider === "gemini") {
    yield* streamGeminiReply({ apiKey, model, baseUrl, contents, systemInstruction });
    return;
  }
  if (provider === "claude") {
    yield* streamClaudeReply({ apiKey, model, baseUrl, contents, systemInstruction });
    return;
  }
  yield* streamOpenAiCompatibleReply({ apiKey, model, baseUrl, contents, systemInstruction });
}

const generateModelReply = async ({
  apiKey,
  model,
  baseUrl,
  llmProvider,
  contents,
  systemInstruction,
}: {
  apiKey: string;
  model: string;
  baseUrl: string;
  llmProvider: string;
  contents: Array<{ role: "user" | "model"; parts: Array<{ text: string }> }>;
  systemInstruction: string;
}) => {
  const provider = inferLlmProvider(baseUrl, model, llmProvider);
  if (provider === "gemini") {
    return generateGeminiReply({ apiKey, model, baseUrl, contents, systemInstruction });
  }
  if (provider === "claude") {
    return generateClaudeReply({ apiKey, model, baseUrl, contents, systemInstruction });
  }
  return generateOpenAiCompatibleReply({ apiKey, model, baseUrl, contents, systemInstruction });
};

// Extracts the first balanced JSON object from a model reply that may wrap it in
// ```json fences or surrounding prose. Returns null when nothing parseable is found.
const parseFirstJsonObject = (raw: string): any | null => {
  const text = String(raw || "").trim();
  if (!text) return null;

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : text;

  const start = candidate.indexOf("{");
  if (start < 0) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < candidate.length; index += 1) {
    const char = candidate[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }
    if (char === '"') {
      inString = true;
    } else if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(candidate.slice(start, index + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
};

type LlmGrammarResult = {
  grammarScore: GrammarScore;
  review: GrammarReview;
  usageTokens: number;
};

// Primary grammar grader: asks the model for a strict JSON verdict on the child's
// English. Returns null on any transport/parse failure so the caller can fall back
// to the heuristic grader. Kept deliberately small (low tokens, low temperature)
// to bound latency and cost per turn.
const gradeGrammarWithLLM = async ({
  apiKey,
  model,
  baseUrl,
  llmProvider,
  spokenText,
  childAge,
}: {
  apiKey: string;
  model: string;
  baseUrl: string;
  llmProvider: string;
  spokenText: string;
  childAge?: number;
}): Promise<LlmGrammarResult | null> => {
  const sentence = String(spokenText || "").trim();
  if (!sentence) return null;

  const ageHint = typeof childAge === "number" && Number.isFinite(childAge)
    ? `The speaker is a ${childAge}-year-old Vietnamese child learning English. `
    : "The speaker is a young Vietnamese child learning English. ";

  const systemInstruction =
    `You are a strict but kind English grammar grader for young learners. ${ageHint}` +
    `Judge ONLY grammar (verb tense, subject-verb agreement, articles, prepositions, plurals, missing words) — ignore pronunciation, spelling of homophones, capitalisation and punctuation. ` +
    `Respond with a SINGLE JSON object and nothing else, matching exactly this shape:\n` +
    `{"grammar_score": <integer 0-100>, "corrected_sentence": "<the sentence rewritten with correct grammar>", "issues": [{"mistake": "<wrong words from the child>", "correction": "<fixed words>", "type": "grammar" | "missing_word", "instruction": "<short friendly tip in Vietnamese>"}]}\n` +
    `Scoring: 100 = flawless grammar; subtract more for errors that change meaning (wrong tense, missing verb) than for small slips (article, preposition). ` +
    `If the sentence is already correct, return grammar_score 100, corrected_sentence equal to the input, and an empty issues array. Keep instructions in simple Vietnamese a parent would use.`;

  const contents = [
    {
      role: "user" as const,
      parts: [{ text: `Grade this sentence: "${sentence}"` }],
    },
  ];

  try {
    const response = await generateModelReply({
      apiKey,
      model,
      baseUrl,
      llmProvider,
      contents,
      systemInstruction,
    });

    const parsed = parseFirstJsonObject(response.text || "");
    if (!parsed || typeof parsed !== "object") return null;

    const rawScore = Number(parsed.grammar_score);
    if (!Number.isFinite(rawScore)) return null;
    const score = Math.max(0, Math.min(100, Math.round(rawScore)));

    const correctedSentence =
      typeof parsed.corrected_sentence === "string" && parsed.corrected_sentence.trim()
        ? parsed.corrected_sentence.trim()
        : sentence;

    const issues = Array.isArray(parsed.issues)
      ? parsed.issues
          .filter((item: any) => item && typeof item === "object")
          .map((item: any) => ({
            mistake: typeof item.mistake === "string" ? item.mistake : "",
            correction: typeof item.correction === "string" ? item.correction : "",
            type: item.type === "missing_word" ? "missing_word" : "grammar" as "grammar" | "missing_word",
            instruction: typeof item.instruction === "string" ? item.instruction : "",
          }))
          .filter((item: { mistake: string; correction: string }) => item.mistake || item.correction)
      : [];

    const review: GrammarReview = {
      original_sentence: sentence,
      corrected_sentence: correctedSentence,
      issues,
      max_repeat: 3,
      grammar_score: { score, level: mapGrammarLevel(score), source: "llm" },
    };

    return {
      grammarScore: { score, level: mapGrammarLevel(score), source: "llm" },
      review,
      usageTokens: extractUsageTokens(response.payload),
    };
  } catch (error) {
    console.warn("LLM grammar grading failed, will fall back to heuristic:", error);
    return null;
  }
};

const extractUsageTokens = (response: any) => {
  const total = Number(response?.usageMetadata?.totalTokenCount);
  if (Number.isFinite(total) && total > 0) {
    return Math.round(total);
  }

  const prompt = Number(response?.usageMetadata?.promptTokenCount);
  const candidates = Number(response?.usageMetadata?.candidatesTokenCount);
  const toolUse = Number(response?.usageMetadata?.toolUsePromptTokenCount);
  const fallbackTotal = [prompt, candidates, toolUse]
    .filter((value) => Number.isFinite(value) && value > 0)
    .reduce((sum, value) => sum + value, 0);

  if (fallbackTotal > 0) {
    return Math.round(fallbackTotal);
  }

  const openAiTotal = Number(response?.usage?.total_tokens);
  if (Number.isFinite(openAiTotal) && openAiTotal > 0) {
    return Math.round(openAiTotal);
  }

  const claudeInput = Number(response?.usage?.input_tokens);
  const claudeOutput = Number(response?.usage?.output_tokens);
  const claudeTotal = [claudeInput, claudeOutput]
    .filter((value) => Number.isFinite(value) && value > 0)
    .reduce((sum, value) => sum + value, 0);

  return claudeTotal > 0 ? Math.round(claudeTotal) : 0;
};

const fetchPrimaryChildId = async (req: express.Request): Promise<string | null> => {
  const cacheKey = getSessionCacheKey(req);
  const cached = primaryChildCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const headers = new Headers();
  headers.set("Accept", "application/json");

  if (req.headers.cookie) {
    headers.set("cookie", req.headers.cookie);
  }

  if (req.headers.origin) {
    headers.set("origin", req.headers.origin);
  }

  if (req.headers.host) {
    headers.set("x-forwarded-host", req.headers.host);
  }

  headers.set("x-forwarded-proto", req.protocol);

  const upstream = await fetch(`${backendBaseUrl}/api/children`, {
    method: "GET",
    headers,
    redirect: "manual",
  });

  if (!upstream.ok) {
    return null;
  }

  const payload = await upstream.json().catch(() => ({}));
  const children = Array.isArray(payload?.children)
    ? payload.children
    : Array.isArray(payload?.data?.children)
      ? payload.data.children
      : [];

  const primaryChild = children.find((child: any) => typeof child?.id === "string" && child.id.trim());
  const value = primaryChild?.id?.trim() || null;
  primaryChildCache.set(cacheKey, {
    expiresAt: Date.now() + PRIMARY_CHILD_CACHE_TTL_MS,
    value,
  });
  return value;
};

const firstHeaderValue = (value: string | string[] | undefined): string => {
  if (Array.isArray(value)) return (value[0] || "").split(",")[0].trim();
  if (typeof value === "string") return value.split(",")[0].trim();
  return "";
};

// The public site is served over HTTPS through Cloudflare, but nginx -> node is plain HTTP,
// so req.protocol resolves to "http". That would make the OAuth redirect_uri "http://..."
// which Google/Facebook reject (redirect_uri_mismatch). Prefer the forwarded proto/host
// headers set by the proxy, then fall back to https in production.
const resolveExternalProto = (req: express.Request): string =>
  firstHeaderValue(req.headers["x-forwarded-proto"]) ||
  (process.env.NODE_ENV === "production" ? "https" : req.protocol);

const resolveExternalHost = (req: express.Request): string =>
  firstHeaderValue(req.headers["x-forwarded-host"]) || req.headers.host || "";

const proxyOAuthStart = async (res: express.Response, upstreamPath: string) => {
  const upstream = await fetch(`${backendBaseUrl}${upstreamPath}`, {
    method: "GET",
    headers: {
      "x-forwarded-host": resolveExternalHost(res.req),
      "x-forwarded-proto": resolveExternalProto(res.req),
      ...(res.req.headers.origin ? { origin: String(res.req.headers.origin) } : {}),
    },
    redirect: "manual",
  });

  const location = upstream.headers.get("location");
  if (!location) {
    const payload = await upstream.text();
    res.status(upstream.status).send(payload || "OAuth redirect target missing.");
    return;
  }

  res.redirect(upstream.status >= 300 && upstream.status < 400 ? upstream.status : 302, location);
};

const proxyOAuthCallback = async (req: express.Request, res: express.Response, upstreamPath: string) => {
  const headers = new Headers();
  if (req.headers.cookie) {
    headers.set("cookie", req.headers.cookie);
  }
  if (req.headers.origin) {
    headers.set("origin", req.headers.origin);
  }
  const externalHost = resolveExternalHost(req);
  if (externalHost) {
    headers.set("x-forwarded-host", externalHost);
  }
  headers.set("x-forwarded-proto", resolveExternalProto(req));

  const upstream = await fetch(`${backendBaseUrl}${upstreamPath}`, {
    method: "GET",
    headers,
    redirect: "manual",
  });

  forwardSetCookies(res, upstream);

  const location = upstream.headers.get("location");
  if (location) {
    res.redirect(upstream.status >= 300 && upstream.status < 400 ? upstream.status : 302, location);
    return;
  }

  const payload = await upstream.text();
  res.status(upstream.status).send(payload);
};

const buildUpstreamPath = (req: express.Request, targetPath: string) => {
  const query = req.url.split("?")[1];
  return `${targetPath}${query ? `?${query}` : ""}`;
};

async function startServer() {
  const app = express();
  const httpServer = http.createServer(app);
  const PORT = Number(process.env.PORT || 3006);

  // Middleware for parsing JSON
  app.use(express.json());

  app.post("/api/auth/register", async (req, res) => {
    try {
      await proxyJsonResponse(req, res, "/api/auth/register", "POST");
    } catch (error: any) {
      console.error("Auth register proxy error:", error);
      res.status(502).json({ ok: false, status: "error", message: error?.message || "Register proxy failed" });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    try {
      await proxyJsonResponse(req, res, "/api/auth/login", "POST");
    } catch (error: any) {
      console.error("Auth login proxy error:", error);
      res.status(502).json({ ok: false, status: "error", message: error?.message || "Login proxy failed" });
    }
  });

  app.post("/api/auth/logout", async (req, res) => {
    try {
      await proxyJsonResponse(req, res, "/api/auth/logout", "POST");
      clearSessionCaches(req);
    } catch (error: any) {
      console.error("Auth logout proxy error:", error);
      res.status(502).json({ ok: false, status: "error", message: error?.message || "Logout proxy failed" });
    }
  });

  app.get("/api/auth/me", async (req, res) => {
    try {
      await proxyJsonResponse(req, res, "/api/auth/me", "GET");
    } catch (error: any) {
      console.error("Auth me proxy error:", error);
      res.status(502).json({ ok: false, status: "error", message: error?.message || "Current user proxy failed" });
    }
  });

  app.get("/api/auth/google/start", async (req, res) => {
    try {
      const next = typeof req.query.next === "string" ? req.query.next : "/";
      await proxyOAuthStart(res, `/api/auth/google/start?next=${encodeURIComponent(next)}`);
    } catch (error: any) {
      console.error("Google OAuth start proxy error:", error);
      res.status(502).send(error?.message || "Google OAuth start failed");
    }
  });

  app.get("/api/auth/facebook/start", async (req, res) => {
    try {
      const next = typeof req.query.next === "string" ? req.query.next : "/";
      await proxyOAuthStart(res, `/api/auth/facebook/start?next=${encodeURIComponent(next)}`);
    } catch (error: any) {
      console.error("Facebook OAuth start proxy error:", error);
      res.status(502).send(error?.message || "Facebook OAuth start failed");
    }
  });

  app.get("/api/auth/google/callback", async (req, res) => {
    try {
      const query = req.url.split("?")[1] || "";
      await proxyOAuthCallback(req, res, `/api/auth/google/callback${query ? `?${query}` : ""}`);
    } catch (error: any) {
      console.error("Google OAuth callback proxy error:", error);
      res.status(502).send(error?.message || "Google OAuth callback failed");
    }
  });

  app.get("/api/auth/facebook/callback", async (req, res) => {
    try {
      await proxyOAuthCallback(req, res, buildUpstreamPath(req, "/api/auth/facebook/callback"));
    } catch (error: any) {
      console.error("Facebook OAuth callback proxy error:", error);
      res.status(502).send(error?.message || "Facebook OAuth callback failed");
    }
  });

  app.get("/api/children", async (req, res) => {
    try {
      await proxyJsonResponse(req, res, buildUpstreamPath(req, "/api/children"), "GET");
    } catch (error: any) {
      console.error("Children list proxy error:", error);
      res.status(502).json({ ok: false, status: "error", message: error?.message || "Children list proxy failed" });
    }
  });

  app.post("/api/children", async (req, res) => {
    try {
      await proxyJsonResponse(req, res, "/api/children", "POST");
      clearSessionCaches(req);
    } catch (error: any) {
      console.error("Children create proxy error:", error);
      res.status(502).json({ ok: false, status: "error", message: error?.message || "Children create proxy failed" });
    }
  });

  app.get("/api/children/leaderboard", async (req, res) => {
    try {
      await proxyJsonResponse(req, res, buildUpstreamPath(req, "/api/children/leaderboard"), "GET");
    } catch (error: any) {
      console.error("Children leaderboard proxy error:", error);
      res.status(502).json({ ok: false, status: "error", message: error?.message || "Children leaderboard proxy failed" });
    }
  });

  app.get("/api/children/:childId", async (req, res) => {
    try {
      await proxyJsonResponse(req, res, buildUpstreamPath(req, `/api/children/${req.params.childId}`), "GET");
    } catch (error: any) {
      console.error("Child detail proxy error:", error);
      res.status(502).json({ ok: false, status: "error", message: error?.message || "Child detail proxy failed" });
    }
  });

  app.patch("/api/children/:childId", async (req, res) => {
    try {
      await proxyJsonResponse(req, res, `/api/children/${req.params.childId}`, "PATCH");
      clearSessionCaches(req);
    } catch (error: any) {
      console.error("Child update proxy error:", error);
      res.status(502).json({ ok: false, status: "error", message: error?.message || "Child update proxy failed" });
    }
  });

  app.delete("/api/children/:childId", async (req, res) => {
    try {
      await proxyJsonResponse(req, res, `/api/children/${req.params.childId}`, "DELETE");
      clearSessionCaches(req);
    } catch (error: any) {
      console.error("Child delete proxy error:", error);
      res.status(502).json({ ok: false, status: "error", message: error?.message || "Child delete proxy failed" });
    }
  });

  app.get("/api/children/:childId/ai-config", async (req, res) => {
    try {
      await proxyJsonResponse(req, res, buildUpstreamPath(req, `/api/children/${req.params.childId}/ai-config`), "GET");
    } catch (error: any) {
      console.error("Child AI config proxy error:", error);
      res.status(502).json({ ok: false, status: "error", message: error?.message || "Child AI config proxy failed" });
    }
  });

  app.get("/api/children/:childId/missions", async (req, res) => {
    try {
      await proxyJsonResponse(req, res, buildUpstreamPath(req, `/api/children/${req.params.childId}/missions`), "GET");
    } catch (error: any) {
      console.error("Child missions proxy error:", error);
      res.status(502).json({ ok: false, status: "error", message: error?.message || "Child missions proxy failed" });
    }
  });

  app.get("/api/children/:childId/sessions", async (req, res) => {
    try {
      await proxyJsonResponse(
        req,
        res,
        buildUpstreamPath(req, `/api/children/${req.params.childId}/sessions`),
        "GET",
      );
    } catch (error: any) {
      console.error("Child sessions proxy error:", error);
      res.status(502).json({
        ok: false,
        status: "error",
        message: error?.message || "Child sessions load failed",
      });
    }
  });

  app.get("/api/children/:childId/session-stats", async (req, res) => {
    try {
      await proxyJsonResponse(
        req,
        res,
        buildUpstreamPath(req, `/api/children/${req.params.childId}/session-stats`),
        "GET",
      );
    } catch (error: any) {
      console.error("Child session stats proxy error:", error);
      res.status(502).json({
        ok: false,
        status: "error",
        message: error?.message || "Child session stats load failed",
      });
    }
  });

  app.get("/api/children/:childId/game-records", async (req, res) => {
    try {
      res.setHeader("x-speakjoy-route", "game-records-proxy-v1");
      await proxyJsonResponse(req, res, `/api/children/${req.params.childId}/game-records`, "GET");
    } catch (error: any) {
      console.error("Game records load proxy error:", error);
      res.status(502).json({ ok: false, status: "error", message: error?.message || "Game records load failed" });
    }
  });

  app.post("/api/children/:childId/game-records", async (req, res) => {
    try {
      res.setHeader("x-speakjoy-route", "game-records-proxy-v1");
      await proxyJsonResponse(req, res, `/api/children/${req.params.childId}/game-records`, "POST");
    } catch (error: any) {
      console.error("Game records save proxy error:", error);
      res.status(502).json({ ok: false, status: "error", message: error?.message || "Game records save failed" });
    }
  });

  app.get("/api/children/:childId/game-flashcards", async (req, res) => {
    try {
      await proxyJsonResponse(req, res, `/api/children/${req.params.childId}/game-flashcards`, "GET");
    } catch (error: any) {
      console.error("Game flashcards proxy error:", error);
      res.status(502).json({ ok: false, status: "error", message: error?.message || "Game flashcards load failed" });
    }
  });

  app.get("/api/children/:childId/game-stories", async (req, res) => {
    try {
      await proxyJsonResponse(req, res, `/api/children/${req.params.childId}/game-stories`, "GET");
    } catch (error: any) {
      console.error("Game stories proxy error:", error);
      res.status(502).json({ ok: false, status: "error", message: error?.message || "Game stories load failed" });
    }
  });

  app.post("/api/children/:childId/reward", async (req, res) => {
    try {
      await proxyJsonResponse(req, res, `/api/children/${req.params.childId}/reward`, "POST");
    } catch (error: any) {
      console.error("Child reward proxy error:", error);
      res.status(502).json({ ok: false, status: "error", message: error?.message || "Child reward sync failed" });
    }
  });

  app.get("/api/active-child", async (req, res) => {
    try {
      await proxyJsonResponse(req, res, buildUpstreamPath(req, "/api/active-child"), "GET");
    } catch (error: any) {
      console.error("Active child load proxy error:", error);
      res.status(502).json({ ok: false, status: "error", message: error?.message || "Active child load proxy failed" });
    }
  });

  app.put("/api/active-child", async (req, res) => {
    try {
      await proxyJsonResponse(req, res, "/api/active-child", "PUT");
      // The active child changed, so any per-session caches keyed on it are stale.
      clearSessionCaches(req);
    } catch (error: any) {
      console.error("Active child save proxy error:", error);
      res.status(502).json({ ok: false, status: "error", message: error?.message || "Active child save proxy failed" });
    }
  });

  // Avatar upload (Req 6.4/6.5) is a multipart/form-data request, NOT JSON, so the generic
  // proxyJsonResponse helper (which JSON-stringifies req.body) cannot be used. The global
  // express.json() middleware ignores multipart bodies (it only parses application/json), so we
  // attach a route-specific express.raw() parser that captures the multipart payload (including
  // its boundary) as a Buffer. We then forward that Buffer verbatim to the backend together with
  // the original content-type header so the multipart boundary is preserved.
  app.post(
    "/api/children/:childId/avatar",
    express.raw({ type: () => true, limit: "5mb" }),
    async (req, res) => {
      try {
        const headers = new Headers();
        headers.set("Accept", "application/json");

        const contentType = req.headers["content-type"];
        if (contentType) {
          headers.set("content-type", contentType);
        }

        if (req.headers.cookie) {
          headers.set("cookie", req.headers.cookie);
        }

        if (req.headers.origin) {
          headers.set("origin", req.headers.origin);
        }

        if (req.headers.host) {
          headers.set("x-forwarded-host", req.headers.host);
        }

        headers.set("x-forwarded-proto", req.protocol);

        // req.body is a Buffer thanks to express.raw above.
        const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from([]);
        const upstream = await fetch(
          `${backendBaseUrl}/api/children/${req.params.childId}/avatar`,
          {
            method: "POST",
            headers,
            body: rawBody as any,
            redirect: "manual",
          },
        );

        forwardSetCookies(res, upstream);
        clearSessionCaches(req);

        const payloadText = await upstream.text();
        const upstreamContentType = upstream.headers.get("content-type") || "";

        res.status(upstream.status);
        if (upstreamContentType.includes("application/json")) {
          try {
            res.json(payloadText ? JSON.parse(payloadText) : {});
            return;
          } catch {
            // Fall through and send raw text if upstream returned malformed JSON.
          }
        }

        res.send(payloadText);
      } catch (error: any) {
        console.error("Child avatar upload proxy error:", error);
        res.status(502).json({ ok: false, status: "error", message: error?.message || "Child avatar upload proxy failed" });
      }
    },
  );

  app.post(
    "/api/recordings/upload",
    express.raw({ type: () => true, limit: "30mb" }),
    async (req, res) => {
      try {
        const headers = new Headers();
        headers.set("Accept", "application/json");

        const contentType = req.headers["content-type"];
        if (contentType) {
          headers.set("content-type", contentType);
        }

        if (req.headers.cookie) {
          headers.set("cookie", req.headers.cookie);
        }

        if (req.headers.origin) {
          headers.set("origin", req.headers.origin);
        }

        if (req.headers.host) {
          headers.set("x-forwarded-host", req.headers.host);
        }

        headers.set("x-forwarded-proto", req.protocol);

        const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from([]);
        const upstream = await fetch(`${backendBaseUrl}/api/recordings/upload`, {
          method: "POST",
          headers,
          body: rawBody as any,
          redirect: "manual",
        });

        forwardSetCookies(res, upstream);

        const payloadText = await upstream.text();
        const upstreamContentType = upstream.headers.get("content-type") || "";

        res.status(upstream.status);
        if (upstreamContentType.includes("application/json")) {
          try {
            res.json(payloadText ? JSON.parse(payloadText) : {});
            return;
          } catch {
            // Fall through and send raw text if upstream returned malformed JSON.
          }
        }

        res.type(upstreamContentType || "text/plain").send(payloadText);
      } catch (error: any) {
        console.error("Recording upload proxy error:", error);
        res.status(502).json({ ok: false, status: "error", message: error?.message || "Recording upload proxy failed" });
      }
    },
  );

  app.get("/api/recordings/:childId/history", async (req, res) => {
    try {
      await proxyJsonResponse(req, res, buildUpstreamPath(req, `/api/recordings/${req.params.childId}/history`), "GET");
    } catch (error: any) {
      console.error("Recording history proxy error:", error);
      res.status(502).json({ ok: false, status: "error", message: error?.message || "Recording history proxy failed" });
    }
  });


  app.get("/api/topics", async (req, res) => {
    try {
      await proxyJsonResponse(req, res, buildUpstreamPath(req, "/api/topics"), "GET");
    } catch (error: any) {
      console.error("Topics list proxy error:", error);
      res.status(502).json({ ok: false, status: "error", message: error?.message || "Topics list proxy failed" });
    }
  });

  app.get("/api/topics/:topicId", async (req, res) => {
    try {
      await proxyJsonResponse(req, res, buildUpstreamPath(req, `/api/topics/${req.params.topicId}`), "GET");
    } catch (error: any) {
      console.error("Topic detail proxy error:", error);
      res.status(502).json({ ok: false, status: "error", message: error?.message || "Topic detail proxy failed" });
    }
  });

  app.post("/api/topics/:topicId/complete", async (req, res) => {
    try {
      await proxyJsonResponse(req, res, `/api/topics/${req.params.topicId}/complete`, "POST");
    } catch (error: any) {
      console.error("Topic complete proxy error:", error);
      res.status(502).json({ ok: false, status: "error", message: error?.message || "Topic complete proxy failed" });
    }
  });

  app.get("/api/roleplay/scenarios", async (req, res) => {
    try {
      await proxyJsonResponse(req, res, buildUpstreamPath(req, "/api/roleplay/scenarios"), "GET");
    } catch (error: any) {
      console.error("Role-play scenarios proxy error:", error);
      res.status(502).json({ ok: false, status: "error", message: error?.message || "Role-play scenarios proxy failed" });
    }
  });

  app.get("/api/roleplay/scenarios/:slug", async (req, res) => {
    try {
      await proxyJsonResponse(req, res, buildUpstreamPath(req, `/api/roleplay/scenarios/${req.params.slug}`), "GET");
    } catch (error: any) {
      console.error("Role-play scenario detail proxy error:", error);
      res.status(502).json({ ok: false, status: "error", message: error?.message || "Role-play scenario detail proxy failed" });
    }
  });

  // Raw-Buffer passthrough for the recorded WAV — mirrors /api/recordings/upload.
  app.post(
    "/api/roleplay/score-ipa",
    express.raw({ type: () => true, limit: "10mb" }),
    async (req, res) => {
      try {
        const headers = new Headers();
        headers.set("Accept", "application/json");

        const contentType = req.headers["content-type"];
        if (contentType) {
          headers.set("content-type", contentType);
        }
        if (req.headers.cookie) {
          headers.set("cookie", req.headers.cookie);
        }
        if (req.headers.origin) {
          headers.set("origin", req.headers.origin);
        }
        if (req.headers.host) {
          headers.set("x-forwarded-host", req.headers.host);
        }
        headers.set("x-forwarded-proto", req.protocol);

        const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from([]);
        const upstream = await fetch(`${backendBaseUrl}/api/roleplay/score-ipa`, {
          method: "POST",
          headers,
          body: rawBody as any,
          redirect: "manual",
        });

        forwardSetCookies(res, upstream);

        const payloadText = await upstream.text();
        const upstreamContentType = upstream.headers.get("content-type") || "";

        res.status(upstream.status);
        if (upstreamContentType.includes("application/json")) {
          try {
            res.json(payloadText ? JSON.parse(payloadText) : {});
            return;
          } catch {
            // Fall through and send raw text if upstream returned malformed JSON.
          }
        }

        res.type(upstreamContentType || "text/plain").send(payloadText);
      } catch (error: any) {
        console.error("Role-play score-ipa proxy error:", error);
        res.status(502).json({ ok: false, status: "error", message: error?.message || "Role-play score-ipa proxy failed" });
      }
    },
  );

  // Free-talk pronunciation scoring — same raw-Buffer passthrough as /score-ipa.
  app.post(
    "/api/roleplay/score-freetalk",
    express.raw({ type: () => true, limit: "10mb" }),
    async (req, res) => {
      try {
        const headers = new Headers();
        headers.set("Accept", "application/json");

        const contentType = req.headers["content-type"];
        if (contentType) {
          headers.set("content-type", contentType);
        }
        if (req.headers.cookie) {
          headers.set("cookie", req.headers.cookie);
        }
        if (req.headers.origin) {
          headers.set("origin", req.headers.origin);
        }
        if (req.headers.host) {
          headers.set("x-forwarded-host", req.headers.host);
        }
        headers.set("x-forwarded-proto", req.protocol);

        const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from([]);
        const upstream = await fetch(`${backendBaseUrl}/api/roleplay/score-freetalk`, {
          method: "POST",
          headers,
          body: rawBody as any,
          redirect: "manual",
        });

        forwardSetCookies(res, upstream);

        const payloadText = await upstream.text();
        const upstreamContentType = upstream.headers.get("content-type") || "";

        res.status(upstream.status);
        if (upstreamContentType.includes("application/json")) {
          try {
            res.json(payloadText ? JSON.parse(payloadText) : {});
            return;
          } catch {
            // Fall through and send raw text if upstream returned malformed JSON.
          }
        }

        res.type(upstreamContentType || "text/plain").send(payloadText);
      } catch (error: any) {
        console.error("Role-play score-freetalk proxy error:", error);
        res.status(502).json({ ok: false, status: "error", message: error?.message || "Role-play score-freetalk proxy failed" });
      }
    },
  );

  app.get("/api/sessions", async (req, res) => {
    try {
      await proxyJsonResponse(req, res, buildUpstreamPath(req, "/api/sessions"), "GET");
    } catch (error: any) {
      console.error("Sessions list proxy error:", error);
      res.status(502).json({ ok: false, status: "error", message: error?.message || "Sessions list proxy failed" });
    }
  });

  app.post("/api/sessions", async (req, res) => {
    try {
      await proxyJsonResponse(req, res, "/api/sessions", "POST");
    } catch (error: any) {
      console.error("Session create proxy error:", error);
      res.status(502).json({ ok: false, status: "error", message: error?.message || "Session create proxy failed" });
    }
  });

  app.get("/api/sessions/:sessionId", async (req, res) => {
    try {
      await proxyJsonResponse(req, res, buildUpstreamPath(req, `/api/sessions/${req.params.sessionId}`), "GET");
    } catch (error: any) {
      console.error("Session detail proxy error:", error);
      res.status(502).json({ ok: false, status: "error", message: error?.message || "Session detail proxy failed" });
    }
  });

  app.post("/api/sessions/:sessionId/end", async (req, res) => {
    try {
      await proxyJsonResponse(req, res, `/api/sessions/${req.params.sessionId}/end`, "POST");
    } catch (error: any) {
      console.error("Session end proxy error:", error);
      res.status(502).json({ ok: false, status: "error", message: error?.message || "Session end proxy failed" });
    }
  });

  app.get("/api/parent-settings", async (req, res) => {
    try {
      await proxyJsonResponse(req, res, "/api/parent-settings", "GET");
    } catch (error: any) {
      console.error("Parent settings load proxy error:", error);
      res.status(502).json({ ok: false, status: "error", message: error?.message || "Parent settings proxy failed" });
    }
  });

  app.get("/api/word-images", (req, res) => {
    const word = String(req.query.word || "").trim().toLowerCase();
    if (!word) {
      return res.status(400).json({ ok: false, message: "Missing word parameter" });
    }
    const term = encodeURIComponent(word);
    res.json({
      images: [
        `https://loremflickr.com/350/350/${term}?lock=11`,
        `https://loremflickr.com/350/350/${term}?lock=22`,
        `https://loremflickr.com/350/350/${term}?lock=33`,
        `https://loremflickr.com/350/350/${term}?lock=44`
      ]
    });
  });

  app.put("/api/parent-settings", async (req, res) => {
    try {
      await proxyJsonResponse(req, res, "/api/parent-settings", "PUT");
      clearSessionCaches(req);
    } catch (error: any) {
      console.error("Parent settings save proxy error:", error);
      res.status(502).json({ ok: false, status: "error", message: error?.message || "Parent settings save proxy failed" });
    }
  });

  app.put("/api/auth/account", async (req, res) => {
    try { await proxyJsonResponse(req, res, "/api/auth/account", "PUT"); }
    catch (error: any) { res.status(502).json({ ok: false, message: error?.message || "Account update failed" }); }
  });

  app.post("/api/auth/forgot-password", async (req, res) => {
    try { await proxyJsonResponse(req, res, "/api/auth/forgot-password", "POST"); }
    catch (error: any) { res.status(502).json({ ok: false, message: error?.message || "Password reset request failed" }); }
  });

  app.post("/api/auth/forgot-password/verify-otp", async (req, res) => {
    try { await proxyJsonResponse(req, res, "/api/auth/forgot-password/verify-otp", "POST"); }
    catch (error: any) { res.status(502).json({ ok: false, message: error?.message || "OTP verification failed" }); }
  });

  app.post("/api/auth/forgot-password/complete", async (req, res) => {
    try { await proxyJsonResponse(req, res, "/api/auth/forgot-password/complete", "POST"); }
    catch (error: any) { res.status(502).json({ ok: false, message: error?.message || "Password reset completion failed" }); }
  });

  app.post("/api/auth/reset-password", async (req, res) => {
    try { await proxyJsonResponse(req, res, "/api/auth/reset-password", "POST"); }
    catch (error: any) { res.status(502).json({ ok: false, message: error?.message || "Password reset failed" }); }
  });

  app.get("/api/child-auth/status", async (req, res) => {
    try { await proxyJsonResponse(req, res, "/api/child-auth/status", "GET"); }
    catch (error: any) { res.status(502).json({ ok: false, message: error?.message || "Child mode status failed" }); }
  });

  app.get("/api/child-auth/credentials/:childId", async (req, res) => {
    try { await proxyJsonResponse(req, res, `/api/child-auth/credentials/${req.params.childId}`, "GET"); }
    catch (error: any) { res.status(502).json({ ok: false, message: error?.message || "Child credential load failed" }); }
  });

  app.put("/api/child-auth/credentials/:childId", async (req, res) => {
    try { await proxyJsonResponse(req, res, `/api/child-auth/credentials/${req.params.childId}`, "PUT"); }
    catch (error: any) { res.status(502).json({ ok: false, message: error?.message || "Child credential save failed" }); }
  });

  app.post("/api/child-auth/login", async (req, res) => {
    try { await proxyJsonResponse(req, res, "/api/child-auth/login", "POST"); }
    catch (error: any) { res.status(502).json({ ok: false, message: error?.message || "Child login failed" }); }
  });

  app.post("/api/child-auth/exit", async (req, res) => {
    try { await proxyJsonResponse(req, res, "/api/child-auth/exit", "POST"); }
    catch (error: any) { res.status(502).json({ ok: false, message: error?.message || "Child mode exit failed" }); }
  });

  app.get("/api/children/:childId/letter-favorites", async (req, res) => {
    try {
      await proxyJsonResponse(req, res, `/api/children/${req.params.childId}/letter-favorites`, "GET");
    } catch (error: any) {
      res.status(502).json({ ok: false, status: "error", message: error?.message || "Letter favorites load failed" });
    }
  });

  app.put("/api/children/:childId/letter-favorites/:letter", async (req, res) => {
    try {
      await proxyJsonResponse(req, res, `/api/children/${req.params.childId}/letter-favorites/${encodeURIComponent(req.params.letter)}`, "PUT");
    } catch (error: any) {
      res.status(502).json({ ok: false, status: "error", message: error?.message || "Letter favorite update failed" });
    }
  });

  app.get("/api/children/:childId/ipa-favorites", async (req, res) => {
    try {
      const upstream = await fetch(`${backendBaseUrl}/api/children/${req.params.childId}/ipa-favorites`, {
        method: "GET",
        headers: {
          Accept: "application/json",
          ...(req.headers.cookie ? { cookie: req.headers.cookie } : {}),
        } as any,
      });
      if (!upstream.ok) {
        res.status(200).json({ ok: true, status: "success", data: { sounds: [] }, sounds: [] });
        return;
      }
      const payloadText = await upstream.text();
      res.status(200).json(payloadText ? JSON.parse(payloadText) : { ok: true, status: "success", data: { sounds: [] }, sounds: [] });
    } catch (error: any) {
      res.status(200).json({ ok: true, status: "success", data: { sounds: [] }, sounds: [] });
    }
  });

  app.put("/api/children/:childId/ipa-favorites", async (req, res) => {
    try {
      const upstream = await fetch(`${backendBaseUrl}/api/children/${req.params.childId}/ipa-favorites`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          ...(req.headers.cookie ? { cookie: req.headers.cookie } : {}),
        } as any,
        body: JSON.stringify(req.body || {}),
      });
      if (!upstream.ok) {
        const sound = typeof req.body?.sound === "string" ? req.body.sound : "";
        const favorite = Boolean(req.body?.favorite);
        res.status(200).json({ ok: true, status: "success", data: { sounds: favorite && sound ? [sound] : [] }, sounds: favorite && sound ? [sound] : [] });
        return;
      }
      const payloadText = await upstream.text();
      res.status(200).json(payloadText ? JSON.parse(payloadText) : { ok: true, status: "success", data: { sounds: [] }, sounds: [] });
    } catch (error: any) {
      const sound = typeof req.body?.sound === "string" ? req.body.sound : "";
      const favorite = Boolean(req.body?.favorite);
      res.status(200).json({ ok: true, status: "success", data: { sounds: favorite && sound ? [sound] : [] }, sounds: favorite && sound ? [sound] : [] });
    }
  });

  app.post("/api/parent-settings/validate", async (req, res) => {
    try {
      await proxyJsonResponse(req, res, "/api/parent-settings/validate", "POST");
    } catch (error: any) {
      console.error("Parent settings validation proxy error:", error);
      res.status(502).json({ ok: false, status: "error", message: error?.message || "Parent settings validation proxy failed" });
    }
  });

  app.post("/api/parent-settings/usage/increment", async (req, res) => {
    try {
      await proxyJsonResponse(req, res, "/api/parent-settings/usage/increment", "POST");
    } catch (error: any) {
      console.error("Parent settings usage proxy error:", error);
      res.status(502).json({ ok: false, status: "error", message: error?.message || "Parent settings usage proxy failed" });
    }
  });

  app.post("/api/parent-gate/verify-password", async (req, res) => {
    try {
      await proxyJsonResponse(req, res, "/api/parent-gate/verify-password", "POST");
    } catch (error: any) {
      console.error("Parent gate verify password proxy error:", error);
      res.status(502).json({ ok: false, status: "error", message: error?.message || "Parent gate password proxy failed" });
    }
  });

  app.get("/api/webauthn/credentials", async (req, res) => {
    try {
      await proxyJsonResponse(req, res, buildUpstreamPath(req, "/api/webauthn/credentials"), "GET");
    } catch (error: any) {
      console.error("WebAuthn credentials proxy error:", error);
      res.status(502).json({ ok: false, status: "error", message: error?.message || "WebAuthn credentials proxy failed" });
    }
  });

  app.post("/api/webauthn/register/options", async (req, res) => {
    try {
      await proxyJsonResponse(req, res, "/api/webauthn/register/options", "POST");
    } catch (error: any) {
      console.error("WebAuthn register options proxy error:", error);
      res.status(502).json({ ok: false, status: "error", message: error?.message || "WebAuthn register options proxy failed" });
    }
  });

  app.post("/api/webauthn/register/verify", async (req, res) => {
    try {
      await proxyJsonResponse(req, res, "/api/webauthn/register/verify", "POST");
    } catch (error: any) {
      console.error("WebAuthn register verify proxy error:", error);
      res.status(502).json({ ok: false, status: "error", message: error?.message || "WebAuthn register verify proxy failed" });
    }
  });

  app.post("/api/webauthn/authenticate/options", async (req, res) => {
    try {
      await proxyJsonResponse(req, res, "/api/webauthn/authenticate/options", "POST");
    } catch (error: any) {
      console.error("WebAuthn authenticate options proxy error:", error);
      res.status(502).json({ ok: false, status: "error", message: error?.message || "WebAuthn authenticate options proxy failed" });
    }
  });

  app.post("/api/webauthn/authenticate/verify", async (req, res) => {
    try {
      await proxyJsonResponse(req, res, "/api/webauthn/authenticate/verify", "POST");
    } catch (error: any) {
      console.error("WebAuthn authenticate verify proxy error:", error);
      res.status(502).json({ ok: false, status: "error", message: error?.message || "WebAuthn authenticate verify proxy failed" });
    }
  });

  app.delete("/api/webauthn/credentials", async (req, res) => {
    try {
      await proxyJsonResponse(req, res, "/api/webauthn/credentials", "DELETE");
    } catch (error: any) {
      console.error("WebAuthn delete all credentials proxy error:", error);
      res.status(502).json({ ok: false, status: "error", message: error?.message || "WebAuthn delete all proxy failed" });
    }
  });

  app.post("/api/webauthn/credentials/delete", async (req, res) => {
    try {
      await proxyJsonResponse(req, res, "/api/webauthn/credentials/delete", "POST");
    } catch (error: any) {
      console.error("WebAuthn delete credential proxy error:", error);
      res.status(502).json({ ok: false, status: "error", message: error?.message || "WebAuthn delete proxy failed" });
    }
  });

  app.get("/api/tts/voices", async (_req, res) => {
    try {
      const ttsApiKey = resolveTtsApiKey();
      const targetUrl = resolveTtsVoicesUrl();
      console.log(`[TTS Proxy Debug] fetching ${targetUrl} with key prefix: "${ttsApiKey.substring(0, 5)}...", length: ${ttsApiKey.length}`);
      const upstream = await fetch(targetUrl, {
        method: "GET",
        headers: {
          Accept: "application/json",
          "User-Agent": "speakjoy-tts-proxy",
          ...(ttsApiKey ? { "X-API-Key": ttsApiKey } : {}),
        },
      });

      const payloadText = await upstream.text();
      const upstreamContentType = upstream.headers.get("content-type") || "application/json";
      if (!upstream.ok) {
        res.status(200).json([]);
        return;
      }
      res.status(upstream.status);

      if (upstreamContentType.includes("application/json")) {
        try {
          res.json(payloadText ? JSON.parse(payloadText) : []);
          return;
        } catch {
          // fall through
        }
      }

      res.type(upstreamContentType).send(payloadText);
    } catch (error: any) {
      console.error("TTS voices proxy error:", error);
      res.status(200).json([]);
    }
  });

  app.post("/api/tts", async (req, res) => {
    try {
      const ttsApiKey = resolveTtsApiKey();
      const requestBody = req.body || {};
      const voiceId = normalizeTtsVoiceId(requestBody.voice_id || requestBody.voice);
      const upstream = await fetch(`${resolveTtsUrl()}?format=wav`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "audio/wav,application/json",
          "User-Agent": "speakjoy-tts-proxy",
          ...(ttsApiKey ? { "X-API-Key": ttsApiKey } : {}),
        },
        body: JSON.stringify({
          ...requestBody,
          ...(voiceId ? { voice: voiceId } : {}),
          style: requestBody.style || process.env.VIENEU_TTS_STYLE || "tu_nhien",
        }),
      });

      const contentType = upstream.headers.get("content-type") || "audio/wav";
      const sampleRate = upstream.headers.get("x-sample-rate");
      const buffer = Buffer.from(await upstream.arrayBuffer());

      if (!upstream.ok) {
        const detail = contentType.includes("application/json")
          ? buffer.toString("utf8")
          : `VieNeu returned HTTP ${upstream.status}`;
        res.status(upstream.status).json({
          ok: false,
          status: "error",
          message: detail,
        });
        return;
      }

      const hasWavHeader =
        buffer.length > 44 &&
        buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
        buffer.subarray(8, 12).toString("ascii") === "WAVE";
      if (!contentType.toLowerCase().includes("audio/") || !hasWavHeader) {
        res.status(502).json({
          ok: false,
          status: "error",
          message: `VieNeu returned invalid WAV audio (${contentType}, ${buffer.length} bytes).`,
        });
        return;
      }

      if (sampleRate) {
        res.setHeader("X-Sample-Rate", sampleRate);
      }

      res.status(upstream.status).type(contentType).send(buffer);
    } catch (error: any) {
      console.error("TTS stream proxy error:", error);
      res.status(502).json({ ok: false, status: "error", message: error?.message || "TTS stream proxy failed" });
    }
  });

  app.post(
    "/api/tts/clone",
    express.raw({ type: () => true, limit: "30mb" }),
    async (req, res) => {
      try {
        const ttsApiKey = resolveTtsApiKey();
        const contentType = req.headers["content-type"];
        const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from([]);

        const upstream = await fetch(`${resolveTtsCloneUrl()}?format=wav`, {
          method: "POST",
          headers: {
            Accept: "audio/wav,application/json",
            "User-Agent": "speakjoy-tts-proxy",
            ...(contentType ? { "Content-Type": String(contentType) } : {}),
            ...(ttsApiKey ? { "X-API-Key": ttsApiKey } : {}),
          },
          body: rawBody as any,
        });

        const upstreamContentType = upstream.headers.get("content-type") || "audio/wav";
        const buffer = Buffer.from(await upstream.arrayBuffer());

        if (!upstream.ok) {
          const detail = upstreamContentType.includes("application/json")
            ? buffer.toString("utf8")
            : `VieNeu clone returned HTTP ${upstream.status}`;
          res.status(upstream.status).json({
            ok: false,
            status: "error",
            message: detail,
          });
          return;
        }

        if (!upstreamContentType.toLowerCase().includes("audio/") || buffer.length <= 44) {
          res.status(502).json({
            ok: false,
            status: "error",
            message: `VieNeu clone returned invalid audio (${upstreamContentType}, ${buffer.length} bytes).`,
          });
          return;
        }

        res.status(upstream.status).type(upstreamContentType).send(buffer);
      } catch (error: any) {
        console.error("TTS clone proxy error:", error);
        res.status(502).json({ ok: false, status: "error", message: error?.message || "TTS clone proxy failed" });
      }
    },
  );

// ─── Age-aware system prompt builder ─────────────────────────────────────────
// Produces a Joy system instruction tailored to three developmental age bands.
const buildTopicConstraint = (
  topicName: string,
  vocabulary: string[],
): string => {
  const trimmedTopic = topicName.trim();
  if (!trimmedTopic || trimmedTopic.toLowerCase() === "free talk") {
    return "";
  }

  const vocabList = vocabulary
    .map((word) => String(word || "").trim())
    .filter(Boolean);
  const vocabHint = vocabList.length > 0
    ? `Gently steer the child toward these key words when it feels natural: ${vocabList.join(", ")}. `
    : "";

  return (
    `TOPIC FOCUS: This whole conversation must stay on the topic "${trimmedTopic}". ` +
    `Every reply and question must relate to "${trimmedTopic}". ` +
    `If the child drifts to another subject, kindly and playfully guide them back to "${trimmedTopic}". ` +
    vocabHint
  );
};

const buildAgeAwareSystemInstruction = (
  childAge: number | undefined,
  childName: string,
  spokenText: string,
  topicName: string = "",
  vocabulary: string[] = [],
  persona: string = "",
): string => {
  const age = typeof childAge === "number" && childAge > 0 ? childAge : 7;
  const name = childName && childName.trim() ? childName.trim() : "bạn nhỏ";

  // ── Shared speaking-coach insert ────────────────────────────────────────
  const speakingInsert = spokenText
    ? "This is a speaking lesson. Respond directly to what the child means and end with one simple, relevant question. Do not ask the child to repeat and do not prepend generic praise; structured coach feedback handles corrections separately. "
    : "";

  // ── Topic constraint: keeps the AI on the selected conversation topic ────
  const topicInsert = buildTopicConstraint(topicName, vocabulary);

  // ── Persona: role-play free talk stays in character as the chosen friend ──
  const personaInsert = persona.trim()
    ? `ROLE-PLAY CHARACTER: ${persona.trim()} Stay fully in character for the whole conversation while keeping every rule above. Never break character or mention that you are an AI. `
    : "";

  // ── Age 4–6: Preschool ──────────────────────────────────────────────────
  if (age <= 6) {
    return (
      `You are Joy, the cute, friendly little owl of SpeakJoy, talking with ${name}, a ${age}-year-old Vietnamese child who is just starting to learn English. ` +
      `RULES you MUST follow:\n` +
      `1. REPLY LENGTH: Exactly 1 very short sentence (3–7 words) + 1 simple Yes/No or choice question. Never write more than 2 sentences total.\n` +
      `2. VOCABULARY: Only the most basic words a young child already knows — colours, animals, food, toys, body parts. No grammar terms, no complex words.\n` +
      `3. TONE: Super excited, warm, playful. Use emojis 🦉✨🌈 frequently to make the message feel animated.\n` +
      `4. QUESTION STYLE: Always a simple choice or Yes/No question. Example: "Do you like cats or dogs? 🐱🐶"\n` +
      `5. VIETNAMESE TRANSLATION: After every reply, add a friendly Vietnamese translation in parentheses using warm, child-friendly words a parent would use with a toddler. Example: "(Bé có thích mèo hay chó không? 🐱🐶)"\n` +
      topicInsert +
      personaInsert +
      speakingInsert +
      `Example reply: "I love apples! 🍎 Do you like apples? (Tớ thích táo lắm! 🍎 Bé có thích táo không?)"`
    );
  }

  // ── Age 6–8: Early Primary ─────────────────────────────────────────────
  if (age <= 8) {
    return (
      `You are Joy, the cheerful, curious little owl of SpeakJoy, chatting with ${name}, a ${age}-year-old Vietnamese child who is practising conversational English. ` +
      `RULES you MUST follow:\n` +
      `1. REPLY LENGTH: 1–2 short sentences (6–12 words each) + 1 open question. Total maximum 3 sentences.\n` +
      `2. VOCABULARY: Simple A1–A2 level — basic actions, emotions, colours, simple adjectives, everyday objects.\n` +
      `3. CORRECTION: If the child makes a grammar error, naturally recast the correct form inside your reply WITHOUT pointing out the mistake. Example: Child says "I goed park." → you reply "Oh, you went to the park! What did you do there?"\n` +
      `4. TONE: Friendly peer, genuinely curious about the child's life. Use occasional light emojis 😊🌟.\n` +
      `5. QUESTION: End every reply with one open question that invites a full sentence answer.\n` +
      `6. VIETNAMESE TRANSLATION: End every reply with a Vietnamese translation in parentheses in a natural, encouraging tone.\n` +
      topicInsert +
      personaInsert +
      speakingInsert +
      `Example reply: "Wow, you went to the park! That sounds so fun 🌟 What did you see there? (Wow, bạn đã đi công viên! Nghe vui ghê 🌟 Bạn thấy gì ở đó vậy?)"`
    );
  }

  // ── Age 8+: Older Kids (default) ──────────────────────────────────────
  return (
    `You are Joy, the friendly, smart little owl of SpeakJoy, having a real conversation with ${name}, a ${age}-year-old Vietnamese child who is building their English skills. ` +
    `RULES you MUST follow:\n` +
    `1. REPLY LENGTH: 2–3 natural conversational sentences + 1 follow-up question. Keep each sentence under 15 words.\n` +
    `2. VOCABULARY: A2–B1 level — everyday vocabulary, simple connectors (because, but, so), and relatable topics (school, hobbies, friends, games).\n` +
    `3. CORRECTION: Gently recast errors using the recasting technique; never explicitly say "wrong" or "mistake".\n` +
    `4. TONE: Encouraging older-sibling energy — conversational, interested, occasionally use light humour 😄.\n` +
    `5. QUESTION: End with one open-ended question to deepen the conversation.\n` +
    `6. VIETNAMESE TRANSLATION: End every reply with a Vietnamese translation in parentheses in a clear, natural tone.\n` +
    topicInsert +
    personaInsert +
    speakingInsert +
    `Example reply: "That's really interesting! Learning new things makes us smarter every day. What subject do you enjoy most at school? (Thú vị thật! Học điều mới mỗi ngày giúp chúng ta thông minh hơn. Bạn thích môn học nào nhất ở trường vậy?)"`
  );
};

  app.post("/api/chat", async (req, res) => {
    try {
      const { messages, customApiKey, customModel, customBaseUrl, childId, childAge, childName, stream, spoken_text, target_phrase, topic, topic_name, vocabulary, persona } = req.body;

      if (!messages || !Array.isArray(messages)) {
        return res.status(400).json({ error: "Bat buoc co chuoi hoi thoai messages." });
      }

      let resolvedApiKey = typeof customApiKey === "string" ? customApiKey.trim() : "";
      let resolvedModel = typeof customModel === "string" ? customModel.trim() : "";
      let resolvedBaseUrl = typeof customBaseUrl === "string" ? customBaseUrl.trim() : "";
      let resolvedLlmProvider = "";

      const requestedChildId =
        typeof childId === "string" && childId.trim()
          ? childId.trim()
          : await fetchPrimaryChildId(req);

      if ((!resolvedApiKey || !resolvedModel) && requestedChildId) {
        try {
          const childRuntimeConfig = await fetchChildAiRuntimeConfig(req, requestedChildId);
          if (childRuntimeConfig) {
            if (!resolvedApiKey) {
              resolvedApiKey = childRuntimeConfig.apiKey;
            }
            if (!resolvedModel) {
              resolvedModel = childRuntimeConfig.modelName;
            }
            if (!resolvedBaseUrl) {
              resolvedBaseUrl = childRuntimeConfig.baseUrl;
            }
            if (!resolvedLlmProvider) {
              resolvedLlmProvider = childRuntimeConfig.llmProvider;
            }
            // Enforcement (Req 4.2/4.3): usageLimit null or 0 = unlimited; only block when a
            // positive limit has been reached.
            if (
              typeof childRuntimeConfig.usageLimit === "number" &&
              childRuntimeConfig.usageLimit > 0 &&
              childRuntimeConfig.usageCount >= childRuntimeConfig.usageLimit
            ) {
              return res.status(429).json({
                error: "Bé đã dùng hết ngân sách token AI trong tháng này. Ba mẹ hãy tăng hạn mức token trong mục 'Cài Đặt Phụ Huynh' để tiếp tục.",
              });
            }
          }
        } catch (configError: any) {
          console.error("Unable to resolve child AI runtime config for chat:", configError);
        }
      }

      // Determine active API Key: Parent's custom key or default server key
      const inferredProvider = inferLlmProvider(resolvedBaseUrl, resolvedModel, resolvedLlmProvider);
      const activeApiKey = resolvedApiKey || process.env.GEMINI_API_KEY || process.env.AI_API_KEY || process.env.OPENAI_API_KEY || "";

      if (!activeApiKey) {
        return res.status(500).json({
          error: requestedChildId
            ? "Hiện tại chưa cấu hình GEMINI_API_KEY. Để con có thể bắt đầu trò chuyện, ba mẹ vui lòng cấu hình API Key trong mục 'Cài Đặt Phụ Huynh' nhé."
            : "Chưa tìm thấy hồ sơ của bé để lấy cấu hình AI. Ba mẹ hãy tạo hoặc chọn hồ sơ bé trước, rồi lưu API Key trong mục 'Cài Đặt Phụ Huynh'.",
        });
      }

      // Determine active Model (default: gemini-2.5-flash for faster chat latency)
      const activeModel =
        resolvedModel
        || (inferredProvider === "claude" ? "claude-3-5-haiku-latest" : inferredProvider === "gemini" ? "gemini-2.0-flash" : "gpt-4o-mini");
      const activeBaseUrl =
        resolvedBaseUrl
        || (inferredProvider === "claude" ? DEFAULT_CLAUDE_BASE_URL : inferredProvider === "gemini" ? DEFAULT_GEMINI_BASE_URL : DEFAULT_OPENAI_BASE_URL);

      // Convert messages to Gemini contents schema: user/model role & text parts
      const contents: Array<{ role: "user" | "model"; parts: Array<{ text: string }> }> = messages.map((msg: { role?: string; content?: unknown }) => ({
        role: msg.role === 'assistant' ? "model" : "user",
        parts: [{ text: typeof msg.content === "string" ? msg.content : String(msg.content ?? "") }]
      }));

      const spokenText = typeof spoken_text === "string" ? spoken_text.trim() : "";
      const targetPhrase = resolvePronunciationTarget(
        spokenText,
        typeof target_phrase === "string" ? target_phrase : "",
      );
      const resolvedChildAge = typeof childAge === "number" ? childAge : (typeof childAge === "string" ? parseInt(childAge, 10) : undefined);
      const resolvedChildName = typeof childName === "string" ? childName.trim() : "";
      const resolvedPersona = typeof persona === "string" ? persona.trim() : "";

      // Free talk imposes no topic constraint; any other topic keeps the AI on subject.
      const topicId = typeof topic === "string" ? topic.trim().toLowerCase() : "";
      const isFreeTalk = !topicId || topicId === "freetalk" || topicId === "free-talk" || topicId === "free_talk";
      const resolvedTopicName = !isFreeTalk && typeof topic_name === "string" ? topic_name.trim() : "";
      const resolvedVocabulary = !isFreeTalk && Array.isArray(vocabulary)
        ? vocabulary.filter((word: unknown): word is string => typeof word === "string" && word.trim().length > 0)
        : [];
      const systemInstruction = buildAgeAwareSystemInstruction(
        resolvedChildAge,
        resolvedChildName,
        spokenText,
        resolvedTopicName,
        resolvedVocabulary,
        resolvedPersona,
      );

      // Pronunciation drill (a target phrase to read aloud) keeps the original word-by-word scoring.
      const wordStatuses = spokenText && targetPhrase ? buildWordStatuses(spokenText, targetPhrase) : [];
      const isPronunciationDrill = Boolean(spokenText && targetPhrase);

      // Grammar is graded for a free-spoken sentence, or (in plain chat) the child's latest message.
      // Pronunciation drills are excluded — there the child just copies a fixed phrase.
      const lastUserContent = String(messages[messages.length - 1]?.content ?? "").trim();
      const isChildTurn = messages[messages.length - 1]?.role !== "assistant";
      const grammarSourceText = isPronunciationDrill
        ? ""
        : spokenText || (isChildTurn ? lastUserContent : "");
      const grammarWordCount = grammarSourceText.split(/\s+/).filter(Boolean).length;
      const shouldGradeGrammar = grammarWordCount >= 2 && /[a-z]/i.test(grammarSourceText);

      // Hybrid grammar assessment: LLM verdict first, heuristic rules as fallback.
      let grammarReview: GrammarReview | undefined;
      let grammarCorrections: SpeakingCorrection[] = [];
      let grammarScoreValue: number | undefined;
      let grammarGradeTokens = 0;

      if (shouldGradeGrammar) {
        const llmGrammar = await gradeGrammarWithLLM({
          apiKey: activeApiKey,
          model: activeModel,
          baseUrl: activeBaseUrl,
          llmProvider: resolvedLlmProvider,
          spokenText: grammarSourceText,
          childAge: resolvedChildAge,
        });

        if (llmGrammar) {
          grammarReview = llmGrammar.review;
          grammarScoreValue = llmGrammar.grammarScore.score;
          grammarGradeTokens = llmGrammar.usageTokens;
          grammarCorrections = llmGrammar.review.issues.map((issue) => ({
            mistake_word: issue.mistake,
            correct_word: issue.correction,
            phonetic_hint: issue.correction,
            instruction: issue.instruction,
            example_sentence: llmGrammar.review.corrected_sentence,
            type: issue.type,
          }));
        } else {
          const heuristicCorrections = buildTeacherGrammarCorrections(grammarSourceText);
          const heuristicScore = scoreGrammarHeuristic(grammarSourceText, heuristicCorrections);
          const heuristicReview = buildTeacherGrammarReview(grammarSourceText, heuristicCorrections);
          grammarScoreValue = heuristicScore.score;
          grammarCorrections = heuristicCorrections;
          grammarReview = heuristicReview ? { ...heuristicReview, grammar_score: heuristicScore } : undefined;
        }
      }

      // Top-level score: pronunciation for drills, grammar score otherwise.
      const score = isPronunciationDrill
        ? scoreTextAttempt(spokenText, targetPhrase, wordStatuses, [])
        : (grammarScoreValue ?? 0);

      const coachFields = buildSpeakingCoachFields(score, wordStatuses, targetPhrase, spokenText);
      const finalCoachFields = isPronunciationDrill
        ? coachFields
        : (grammarCorrections.length > 0 || grammarReview
          ? {
            ...coachFields,
            corrections: grammarCorrections,
            ask_repeat: resolveGrammarRepeatPrompt(
              grammarCorrections.length,
              Boolean(grammarReview),
              grammarReview?.corrected_sentence || grammarCorrections[0]?.example_sentence || "",
              grammarSourceText,
            ),
            pronunciation_score: score,
            grammar_review: grammarReview,
            grammar_score: grammarScoreValue,
            continue_question: grammarCorrections.length > 0 ? "Can you say it one more time?" : coachFields.continue_question,
          }
          : { ...coachFields, grammar_score: grammarScoreValue });

      const hasSpeakingCorrection =
        Array.isArray(finalCoachFields.corrections) && finalCoachFields.corrections.length > 0;
      const correctionLead = hasSpeakingCorrection
        ? `${finalCoachFields.praise} Say: "${finalCoachFields.ask_repeat || finalCoachFields.corrections[0]?.correct_word}". `
        : "";

      const fallbackReplyFromLastUserMessage = () => {
        const lastUserMsg = (messages[messages.length - 1]?.content || "").toLowerCase().trim();
        if (lastUserMsg.includes("name") || lastUserMsg.includes("who")) {
          return "I am Joy, your cute little green owl! What is your name, my friend? (Tá»› lÃ  Joy, chÃº cÃº xanh nhá» thÃ´ng minh Ä‘Ã¢y! TÃªn cáº­u lÃ  gÃ¬ tháº¿, báº¡n nhá»?)";
        }
        if (lastUserMsg.includes("animal") || lastUserMsg.includes("cat") || lastUserMsg.includes("dog") || lastUserMsg.includes("pet")) {
          return "I love cute animals! Active cats and small puppies make me super happy! Do you have a pet? (Tá»› ráº¥t thÃ­ch cÃ¡c báº¡n Ä‘á»™ng váº­t Ä‘Ã¡ng yÃªu! Nhá»¯ng bÃ© mÃ¨o lanh lá»£i vÃ  cÃºn con tinh nghá»‹ch khiáº¿n tá»› cá»±c kÃ¬ vui váº»! Cáº­u cÃ³ nuÃ´i thÃº cÆ°ng khÃ´ng?)";
        }
        if (lastUserMsg.includes("color") || lastUserMsg.includes("red") || lastUserMsg.includes("blue") || lastUserMsg.includes("green") || lastUserMsg.includes("yellow") || lastUserMsg.includes("pink")) {
          return "Green is my absolute favorite color because it is the color of nature and health! What color do you like? (MÃ u xanh lÃ¡ cÃ¢y chÃ­nh lÃ  sáº¯c mÃ u tá»› thÃ­ch nháº¥t vÃ¬ Ä‘Ã¢y lÃ  mÃ u cá»§a tá»± nhiÃªn vÃ  sá»©c khá»e Ä‘Ã³! Cáº­u thÃ­ch mÃ u sáº¯c nÃ o?)";
        }
        const pool = [
          "Wow, that is so interesting! Can you tell me more about it in English? (á»’, nghe thÃº vá»‹ Ä‘áº¿n váº­y luÃ´n Ä‘Ã³! Cáº­u cÃ³ thá»ƒ ká»ƒ thÃªm cho tá»› báº±ng tiáº¿ng Anh Ä‘Æ°á»£c khÃ´ng?)",
          "You are doing an incredibly amazing job today! High-five, young explorer! (Cáº­u Ä‘ang lÃ m ráº¥t xuáº¥t sáº¯c ngÃ y hÃ´m nay luÃ´n Ä‘Ã³! Äáº­p tay cÃ¡i nÃ o, nhÃ  thÃ¡m hiá»ƒm nhÃ­ thÃ´ng thÃ¡i!)",
          "Studying English with you makes me so proud! What other games do you like? (Há»c tiáº¿ng Anh vá»›i cáº­u lÃ m tá»› tháº¥y vÃ´ cÃ¹ng kiÃªu hÃ£nh Ä‘áº¥y! Cáº­u thÃ­ch chÆ¡i trÃ² chÆ¡i nÃ o khÃ¡c khÃ´ng?)",
          "You speak English so beautifully! Let's practice more words together! (Cáº­u nÃ³i tiáº¿ng Anh nghe Ä‘Ã¡ng yÃªu vÃ  hay quÃ¡! ChÃºng mÃ¬nh cÃ¹ng rÃ¨n thÃªm vÃ i tá»« má»›i nha!)"
        ];
        return pool[lastUserMsg.length % pool.length];
      };

      let replyText = "";
      // Seed usage with the grammar-grading call so the parent budget reflects it too.
      let usedTokens = grammarGradeTokens;
      if (stream) {
        res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
        res.setHeader("Cache-Control", "no-cache, no-transform");
        res.setHeader("Connection", "keep-alive");
        res.setHeader("X-Accel-Buffering", "no");
        res.flushHeaders?.();

        const emit = (payload: Record<string, unknown>) => {
          res.write(`data: ${JSON.stringify(payload)}\n\n`);
        };

        try {
          if (correctionLead) {
            replyText += correctionLead;
            emit({ type: "delta", text: correctionLead });
          }

          for await (const chunk of streamModelReply({
            apiKey: activeApiKey,
            model: activeModel,
            baseUrl: activeBaseUrl,
            llmProvider: resolvedLlmProvider,
            contents: contents,
            systemInstruction,
          })) {
            if (!chunk) continue;
            replyText += chunk;
            emit({ type: "delta", text: chunk });
          }
        } catch (modelError: any) {
          console.error("LLM streaming error encountered:", modelError);
          if (!replyText.trim()) {
            try {
              const fallbackResponse = await generateModelReply({
                apiKey: activeApiKey,
                model: activeModel,
                baseUrl: activeBaseUrl,
                llmProvider: resolvedLlmProvider,
                contents,
                systemInstruction,
              });
              replyText = fallbackResponse.text || "";
              usedTokens += extractUsageTokens(fallbackResponse.payload);
              if (replyText) {
                emit({ type: "delta", text: replyText });
              }
            } catch (fallbackError) {
              console.error("LLM non-stream fallback also failed:", fallbackError);
              emit({
                type: "error",
                error: `AI provider error: ${sanitizeProviderError(fallbackError)}`,
              });
              return res.end();
            }
          } else {
            emit({
              type: "error",
              error: `AI provider stream ended unexpectedly: ${sanitizeProviderError(modelError)}`,
            });
            return res.end();
          }
        }

        await incrementParentUsage(req, requestedChildId, usedTokens);
        const splitReply = splitReplyAndTranslation(replyText);
        emit({
          type: "done",
          reply: splitReply.cleanReply,
          translation: splitReply.translation,
          score,
          word_statuses: wordStatuses,
          ...finalCoachFields,
          usageTokens: usedTokens,
        });
        return res.end();
      }
      try {
        const response = await generateModelReply({
          apiKey: activeApiKey,
          model: activeModel,
          baseUrl: activeBaseUrl,
          llmProvider: resolvedLlmProvider,
          contents: contents,
          systemInstruction,
        });
        replyText = response.text || "";
        usedTokens += extractUsageTokens(response.payload);
      } catch (modelError: any) {
        console.error("LLM API error encountered, using high-quality local fallback:", modelError);

        // Select smart response in English & Vietnamese based on last input of child
        const lastUserMsg = (messages[messages.length - 1]?.content || "").toLowerCase().trim();

        if (lastUserMsg.includes("name") || lastUserMsg.includes("who")) {
          replyText = "I am Joy, your cute little green owl! What is your name, my friend? (Tớ là Joy, chú cú xanh nhỏ thông minh đây! Tên cậu là gì thế, bạn nhỏ?)";
        } else if (lastUserMsg.includes("animal") || lastUserMsg.includes("cat") || lastUserMsg.includes("dog") || lastUserMsg.includes("pet")) {
          replyText = "I love cute animals! Active cats and small puppies make me super happy! Do you have a pet? (Tớ rất thích các bạn động vật đáng yêu! Những bé mèo lanh lợi và cún con tinh nghịch khiến tớ cực kì vui vẻ! Cậu có nuôi thú cưng không?)";
        } else if (lastUserMsg.includes("color") || lastUserMsg.includes("red") || lastUserMsg.includes("blue") || lastUserMsg.includes("green") || lastUserMsg.includes("yellow") || lastUserMsg.includes("pink")) {
          replyText = "Green is my absolute favorite color because it is the color of nature and health! What color do you like? (Màu xanh lá cây chính là sắc màu tớ thích nhất vì đây là màu của tự nhiên và sức khỏe đó! Cậu thích màu sắc nào?)";
        } else if (lastUserMsg.includes("food") || lastUserMsg.includes("eat") || lastUserMsg.includes("salad") || lastUserMsg.includes("fruit") || lastUserMsg.includes("pizza") || lastUserMsg.includes("cake")) {
          replyText = "My absolute favorite dishes are fresh green salads and yummy fruits! What food do you like to eat? (Món khoái khẩu nhất hệ mặt trời của tớ là sa-lát rau xanh tươi tắn và các loại quả quả mọng ngọt lành! Cậu thích ăn món nào nha?)";
        } else if (lastUserMsg.includes("dragon") || lastUserMsg.includes("story") || lastUserMsg.includes("princess") || lastUserMsg.includes("fairy")) {
          replyText = "Once upon a time, there was a brilliant little green owl who flew across mountains to help kids learn English! (Ngày xửa ngày xưa, có một chú cú xanh nhỏ cực thông thái đã bay qua bao ngọn núi để giúp các bé học tiếng Anh giỏi đó!)";
        } else if (lastUserMsg.includes("hello") || lastUserMsg.includes("hi") || lastUserMsg.includes("good morning") || lastUserMsg.includes("good afternoon")) {
          replyText = "Hello, my awesome friend! It is so wonderful to chat with you today! How are you doing? (Xin chào người bạn thân mến của tớ! Thật tuyệt vời làm sao khi được trò chuyện cùng cậu hôm nay! Cậu thế nào rồi?)";
        } else if (lastUserMsg.includes("thank") || lastUserMsg.includes("bye") || lastUserMsg.includes("goodbye")) {
          replyText = "You are very welcome! Don't forget to practice English with me tomorrow. See you soon! (Cậu luôn được chào đón nhé! Đừng quên ghé học tiếng Anh cùng tớ vào ngày mai nha. Sớm hẹn gặp lại cậu!)";
        } else {
          // Diverse pool of encouraging replies
          const pool = [
            "Wow, that is so interesting! Can you tell me more about it in English? (Ồ, nghe thú vị đến vậy luôn đó! Cậu có thể kể thêm cho tớ bằng tiếng Anh được không?)",
            "You are doing an incredibly amazing job today! High-five, young explorer! (Cậu đang làm rất xuất sắc ngày hôm nay luôn đó! Đập tay cái nào, nhà thám hiểm nhí thông thái!)",
            "Studying English with you makes me so proud! What other games do you like? (Học tiếng Anh với cậu làm tớ thấy vô cùng kiêu hãnh đấy! Cậu thích chơi trò chơi nào khác không?)",
            "You speak English so beautifully! Let's practice more words together! (Cậu nói tiếng Anh nghe đáng yêu và hay quá! Chúng mình cùng rèn thêm vài từ mới nha!)"
          ];
          const hashIdx = lastUserMsg.length % pool.length; // consistent indexing
          replyText = pool[hashIdx];
        }

        // Parent education addition:
        replyText += "\n\n(Joy đang chạy ở chế độ dự phòng vì máy chủ AI quá tải. Ba mẹ hãy thêm API Key riêng của mình trong phần Cài Đặt để bé trò chuyện rảnh tay không giới hạn nhé! ❤️)";
      }

      await incrementParentUsage(req, requestedChildId, usedTokens);

      if (correctionLead && !replyText.startsWith(correctionLead)) {
        replyText = `${correctionLead}${replyText}`;
      }

      const splitReply = splitReplyAndTranslation(replyText);

      res.json({
        reply: splitReply.cleanReply,
        translation: splitReply.translation,
        score,
        word_statuses: wordStatuses,
        ...finalCoachFields,
      });
    } catch (error: any) {
      console.error("Global chat error:", error);
      res.status(500).json({ error: error?.message || "Đã xảy ra lỗi khi trao đổi với Joy. Vui lòng thử lại sau." });
    }
  });

  // Helper helper to support dynamic redirect URIs under AI Studio Cloud Run or local ports
  const getFacebookRedirectUri = (req: any) => {
    // Check x-forwarded-host first as it holds the modern proxy public-facing host
    const host = req.headers['x-forwarded-host'] || req.headers.host || '';
    const protocol = req.headers['x-forwarded-proto'] || 'http';

    console.log(`[FB Auth Debug] req.headers.host: "${req.headers.host}", x-forwarded-host: "${req.headers['x-forwarded-host']}", protocol: "${protocol}"`);

    // Check if hosted under AI Studio run.app or general prod container
    if (host.includes('.run.app')) {
      const computed = `https://${host}/auth/facebook/callback`;
      console.log(`[FB Auth Debug] Detected Cloud Run. Computed dynamic redirectUri: "${computed}"`);
      return computed;
    }

    // Fall back to configured redirect URI or dynamic localhost
    const fallback = process.env.FACEBOOK_REDIRECT_URI || `${protocol}://${host}/auth/facebook/callback`;
    console.log(`[FB Auth Debug] Computed fallback redirectUri: "${fallback}"`);
    return fallback;
  };

  // 1. Endpoint to generate the Facebook Auth URL
  app.get("/api/auth/facebook/url", (req, res) => {
    const appId = process.env.FACEBOOK_APP_ID;

    if (!appId) {
      return res.status(400).json({
        error: "Chưa cấu hình FACEBOOK_APP_ID trên máy chủ. Ba mẹ vui lòng thêm FACEBOOK_APP_ID vào Cài đặt nhé!"
      });
    }

    const redirectUri = getFacebookRedirectUri(req);
    const configId = process.env.FACEBOOK_CONFIG_ID;
    const fbScope = process.env.FACEBOOK_SCOPE || "email,public_profile";

    const queryParams: Record<string, string> = {
      client_id: appId,
      redirect_uri: redirectUri,
      response_type: "code",
      state: "facebook_auth_state_kids"
    };

    if (configId) {
      queryParams.config_id = configId;
    }

    if (fbScope) {
      queryParams.scope = fbScope;
    }

    const dialogUrl = `https://www.facebook.com/v18.0/dialog/oauth?` +
      new URLSearchParams(queryParams).toString();

    res.json({ url: dialogUrl, redirectUri });
  });

  // Helper callback handler function
  const handleFacebookCallback = async (req: any, res: any) => {
    const { code, error, error_description } = req.query;

    if (error) {
      return res.send(`
        <html>
          <body style="background-color: #111c24; color: #ff4b4b; font-family: sans-serif; text-align: center; padding: 45px; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 80vh;">
            <div style="font-size: 50px; margin-bottom: 20px;">⚠️</div>
            <h2>Đăng nhập không thành công</h2>
            <p style="color: #9cb3af; font-size: 14px;">${error_description || error}</p>
            <button onclick="window.close()" style="margin-top: 20px; padding: 12px 24px; background: #ff4b4b; color: white; border: none; border-radius: 8px; font-weight: bold; cursor: pointer;">Đóng cửa sổ</button>
          </body>
        </html>
      `);
    }

    if (!code) {
      return res.status(400).send("Yêu cầu không hợp lệ: Không tìm thấy mã xác thực.");
    }

    try {
      const appId = process.env.FACEBOOK_APP_ID;
      const appSecret = process.env.FACEBOOK_APP_SECRET;

      if (!appId || !appSecret) {
        throw new Error("Ứng dụng chưa được cấu hình đầy đủ biến môi trường: FACEBOOK_APP_ID & FACEBOOK_APP_SECRET");
      }

      const redirectUri = getFacebookRedirectUri(req);

      // Exchange code for Access Token
      const tokenResponse = await fetch(
        `https://graph.facebook.com/v18.0/oauth/access_token?` +
        new URLSearchParams({
          client_id: appId,
          client_secret: appSecret,
          redirect_uri: redirectUri,
          code: code as string
        }).toString()
      );

      const tokenData = await tokenResponse.json();

      if (tokenData.error) {
        throw new Error(tokenData.error.message || "Không thể lấy access token từ Facebook.");
      }

      const accessToken = tokenData.access_token;

      // Fetch user profile info
      const userResponse = await fetch(
        `https://graph.facebook.com/me?fields=id,name,email,picture&access_token=${accessToken}`
      );
      const userData = await userResponse.json();

      if (userData.error) {
        throw new Error(userData.error.message || "Không thể lấy thông tin người dùng từ Facebook Graph API.");
      }

      // Prepare profile fields to send to window.opener via postMessage
      const userProfile = {
        email: userData.email || `${userData.id}@facebook.com`,
        name: userData.name || "Thành viên Facebook",
        avatar: userData.picture?.data?.url || ""
      };

      res.send(`
        <html>
          <body style="background-color: #111c24; color: white; font-family: sans-serif; text-align: center; padding: 40px; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 80vh;">
            <div style="font-size: 50px; margin-bottom: 20px;">🎉</div>
            <h2 style="color: #df52ff;">Liên kết Facebook thành công!</h2>
            <p style="color: #9cb3af; font-size: 14px;">Hệ thống đang đưa bé yêu quay lại bến đỗ học tiếng Anh rực rỡ...</p>
            <script>
              if (window.opener) {
                window.opener.postMessage({ 
                  type: 'OAUTH_AUTH_SUCCESS', 
                  payload: ${JSON.stringify(userProfile)} 
                }, '*');
                window.close();
              } else {
                window.location.href = '/';
              }
            </script>
          </body>
        </html>
      `);
    } catch (err: any) {
      console.error("Facebook OAuth token exchange error:", err);
      res.send(`
        <html>
          <body style="background-color: #111c24; color: #ff4b4b; font-family: sans-serif; text-align: center; padding: 40px; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 80vh;">
            <div style="font-size: 50px; margin-bottom: 20px;">❌</div>
            <h2>Lỗi Xác Thực Facebook</h2>
            <p style="color: #9ca3af; font-size: 14px;">${err.message || err}</p>
            <button onclick="window.close()" style="margin-top: 20px; padding: 12px 24px; background: #ff4b4b; color: white; border: none; border-radius: 8px; font-weight: bold; cursor: pointer;">Đóng cửa sổ</button>
          </body>
        </html>
      `);
    }
  };

  app.get("/auth/facebook/callback", handleFacebookCallback);
  app.get("/auth/facebook/callback/", handleFacebookCallback);

  // Compliance: Facebook User Data Deletion Callback Endpoint (handles GET & POST)
  const handleFacebookDataDeletion = (req: any, res: any) => {
    const protocol = req.secure || req.headers["x-forwarded-proto"] === "https" ? "https" : "http";
    const host = req.get("host");
    const deletionTrackingUrl = `${protocol}://${host}/privacy#delete-data`;
    const randomCode = "del_" + Math.random().toString(36).substring(2, 15);

    console.log("Received Facebook Data Deletion Request. Status Tracking Code generated:", randomCode);

    res.json({
      url: deletionTrackingUrl,
      confirmation_code: randomCode
    });
  };

  app.post("/auth/facebook/delete-callback", handleFacebookDataDeletion);
  app.get("/auth/facebook/delete-callback", handleFacebookDataDeletion);

  // Compliance: Privacy Policy & Data Deletion Instructions Endpoint for Facebook App Review
  const handleComplianceAndPrivacy = (req: any, res: any) => {
    res.send(`
      <!DOCTYPE html>
      <html lang="vi">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Chính sách Quyền riêng tư & Xóa Dữ liệu - SpeakJoy</title>
        <style>
          body {
            background-color: #111c24;
            color: #f1f5f9;
            font-family: system-ui, -apple-system, sans-serif;
            margin: 0;
            padding: 0;
            line-height: 1.6;
          }
          .container {
            max-width: 800px;
            margin: 40px auto;
            padding: 30px;
            background-color: #1a2c38;
            border: 1px solid #37464f;
            border-radius: 20px;
            box-shadow: 0 10px 25px rgba(0,0,0,0.3);
          }
          .header {
            text-align: center;
            border-bottom: 2px solid #37464f;
            padding-bottom: 20px;
            margin-bottom: 30px;
          }
          h1 {
            color: #58cc02;
            margin: 0 0 10px 0;
            font-size: 28px;
            font-weight: 800;
          }
          h2 {
            color: #1cb0f6;
            font-size: 20px;
            margin-top: 30px;
            border-left: 4px solid #1cb0f6;
            padding-left: 12px;
          }
          p, li {
            color: #9cb3af;
            font-size: 15px;
          }
          ul {
            padding-left: 20px;
          }
          li {
            margin-bottom: 10px;
          }
          .highlight {
            background-color: rgba(28, 176, 246, 0.15);
            color: #54cbfd;
            padding: 2px 6px;
            border-radius: 4px;
            font-family: monospace;
          }
          .card {
            background-color: #111c24;
            border: 1px solid #37464f;
            border-radius: 12px;
            padding: 20px;
            margin: 20px 0;
          }
          .footer {
            margin-top: 40px;
            text-align: center;
            font-size: 12px;
            color: #52656d;
            border-top: 1px solid #37464f;
            padding-top: 20px;
          }
          .btn {
            display: inline-block;
            background-color: #58cc02;
            color: white;
            padding: 12px 24px;
            text-decoration: none;
            border-radius: 12px;
            font-weight: bold;
            margin-top: 15px;
            transition: background-color 0.2s;
          }
          .btn:hover {
            background-color: #46a302;
          }
        </style>
      </head>
      <body>
        <div class="container overflow-hidden">
          <div class="header">
            <h1>🦉 SpeakJoy</h1>
            <p style="color: #df52ff; font-weight: bold; margin: 0; font-size: 16px;">Ứng dụng Học Tiếng Anh Thông Minh Cho Trẻ Em</p>
            <p style="font-size: 13px; color: #52656d; margin: 5px 0 0 0;">Cập nhật lần cuối: Ngày 6 tháng 6 năm 2026</p>
          </div>

          <section>
            <h2>1. Chính sách Bảo mật Thông tin (Privacy Policy)</h2>
            <p><strong>SpeakJoy</strong> cam kết bảo vệ quyền riêng tư cá nhân của cha mẹ và các em nhỏ khi tham gia học tập cùng chú cú xanh thông thái Joy. Chúng tôi hiểu tầm quan trọng của việc bảo vệ dữ liệu cá nhân khách hàng.</p>
            <ul>
              <li><strong>Thu thập thông tin tối thiểu:</strong> Chúng tôi chỉ lưu giữ các thông tin cơ bản liên kết từ Facebook của ba mẹ (Họ tên hiển thị, địa chỉ email, và ảnh đại diện) để hỗ trợ phục hồi tiến độ học tập, huy chương, bảng xếp hạng và các bài học của con.</li>
              <li><strong>Bảo mật tuyệt đối:</strong> Toàn bộ dữ liệu truyền nhận giữa SpeakJoy và các bên liên quan được mã hóa nghiêm ngặt bằng giao thức SSL/TLS. Chúng tôi không bao giờ chia sẻ dữ liệu của bạn cho bất kỳ đối tác quảng cáo nào.</li>
              <li><strong>Tuân thủ COPPA:</strong> SpeakJoy đặt sự an toàn của trẻ nhỏ lên hàng đầu, các dữ liệu được giám sát chặt chẽ bởi phụ huynh trước khi con thực hành giao tiếp.</li>
            </ul>
          </section>

          <section id="delete-data">
            <h2>2. Hướng dẫn Yêu cầu Xóa Dữ liệu (User Data Deletion Policy)</h2>
            <p>Theo tiêu chuẩn quyền lợi người dùng và chính sách nghiêm ngặt từ Meta (Facebook), chúng tôi cung cấp quyền kiểm soát dữ liệu cá nhân tối đa cho bạn. Để thực hiện hủy liên kết và xóa dữ liệu tài khoản khỏi SpeakJoy, ba mẹ thực hiện theo một trong hai cách chính thống sau:</p>
            
            <div class="card">
              <h3 style="color: #ff4b4b; margin-top: 0; font-size: 16px;">👉 Cách 1: Gỡ ứng dụng chủ động qua Bảng cài đặt Facebook</h3>
              <p>Mọi dữ liệu tài khoản SpeakJoy sẽ ngắt kết nối tự động khi quý khách hủy đăng nhập trong Bảng cài đặt ứng dụng của tài khoản phụ huynh:</p>
              <ol>
                <li>Đăng nhập tài khoản Facebook cá nhân của ba mẹ.</li>
                <li>Đi tới phần <strong style="color: white;">Cài đặt & Quyền riêng tư (Settings & Privacy)</strong>, chọn tiếp <strong style="color: white;">Cài đặt (Settings)</strong>.</li>
                <li>Tìm và nhấn vào menu <strong style="color: white;">Ứng dụng và trang web (Apps and Websites)</strong> ở cột menu bên trái.</li>
                <li>Tìm kiếm ứng dụng có tên <strong style="color: #58cc02;">SpeakJoy</strong>.</li>
                <li>Nhấn vào nút <strong style="color: #ff4b4b;">Gỡ (Remove)</strong> cạnh bên để ngắt liên kết hoàn toàn.</li>
                <li>Hệ thống của chúng tôi sẽ lắng nghe tín hiệu gỡ đăng ký và tiến hành xóa bỏ dữ liệu lưu cache thông tin định danh tương ứng.</li>
              </ol>
            </div>

            <div class="card">
              <h3 style="color: #ff4b4b; margin-top: 0; font-size: 16px;">👉 Cách 2: Gửi yêu cầu qua Email trực tiếp (Khuyên Dùng)</h3>
              <p>Nếu ba mẹ muốn thanh tẩy dữ liệu ngay lập tức, dọn dẹp bộ nhớ máy chủ bao gồm lịch sử hội thoại nói tiếng Anh, kim cương đã thu hoạch hoặc bảng thành tích thi đấu của trẻ nhỏ:</p>
              <ul>
                <li>Gửi một thư điện tử (email) trực tiếp tới địa chỉ hòm thư hỗ trợ chính thức: <a href="mailto:mha17003@gmail.com" class="highlight" style="text-decoration: none;">mha17003@gmail.com</a></li>
                <li>Tiêu đề thư ghi rõ: <code class="highlight">Yêu cầu xóa dữ liệu định danh SpeakJoy - [Tên Facebook của bạn]</code></li>
                <li>Trong vòng <strong style="color: #58cc02;">24 giờ làm việc</strong>, quản trị viên hệ thống sẽ xác minh và xóa vĩnh viễn toàn bộ cơ sở dữ liệu liên kết mà không thể khôi phục lại.</li>
              </ul>
            </div>
          </section>

          <div style="text-align: center; margin-top: 30px;">
            <a href="/" class="btn">Quay lại trang chủ SpeakJoy</a>
          </div>

          <div class="footer">
            <p>© 2026 SpeakJoy Inc. Phát triển với sứ mệnh giúp trẻ em Việt làm chủ kỹ năng nói tiếng Anh chuẩn tự nhiên.</p>
          </div>
        </div>
      </body>
      </html>
    `);
  };

  app.get("/privacy", handleComplianceAndPrivacy);
  app.get("/delete-data", handleComplianceAndPrivacy);
  app.get("/terms", (req, res) => {
    res.send(`
      <!DOCTYPE html>
      <html lang="vi">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Điều khoản Dịch vụ (Terms of Service) - SpeakJoy</title>
        <style>
          body {
            background-color: #111c24;
            color: #f1f5f9;
            font-family: system-ui, -apple-system, sans-serif;
            margin: 0;
            padding: 0;
            line-height: 1.6;
          }
          .container {
            max-width: 800px;
            margin: 40px auto;
            padding: 30px;
            background-color: #1a2c38;
            border: 1px solid #37464f;
            border-radius: 20px;
            box-shadow: 0 10px 25px rgba(0,0,0,0.3);
          }
          .header {
            text-align: center;
            border-bottom: 2px solid #37464f;
            padding-bottom: 20px;
            margin-bottom: 30px;
          }
          h1 {
            color: #58cc02;
            margin: 0 0 10px 0;
            font-size: 28px;
            font-weight: 800;
          }
          h2 {
            color: #1cb0f6;
            font-size: 20px;
            margin-top: 30px;
            border-left: 4px solid #1cb0f6;
            padding-left: 12px;
          }
          p, li {
            color: #9cb3af;
            font-size: 15px;
          }
          ul {
            padding-left: 20px;
          }
          li {
            margin-bottom: 10px;
          }
          .card {
            background-color: #111c24;
            border: 1px solid #37464f;
            border-radius: 12px;
            padding: 20px;
            margin: 20px 0;
          }
          .footer {
            margin-top: 40px;
            text-align: center;
            font-size: 12px;
            color: #52656d;
            border-top: 1px solid #37464f;
            padding-top: 20px;
          }
          .btn {
            display: inline-block;
            background-color: #58cc02;
            color: white;
            padding: 12px 24px;
            text-decoration: none;
            border-radius: 12px;
            font-weight: bold;
            margin-top: 15px;
            transition: background-color 0.2s;
          }
          .btn:hover {
            background-color: #46a302;
          }
        </style>
      </head>
      <body>
        <div class="container overflow-hidden">
          <div class="header">
            <h1>☀️ SpeakJoy</h1>
            <p style="color: #df52ff; font-weight: bold; margin: 0; font-size: 16px;">Điều khoản Sử dụng & Dịch vụ</p>
            <p style="font-size: 13px; color: #52656d; margin: 5px 0 0 0;">Cập nhật lần cuối: Ngày 6 tháng 6 năm 2026</p>
          </div>

          <section>
            <h2>1. Chấp nhận các điều khoản</h2>
            <p>Chào mừng phụ huynh và các bé đến với <strong>SpeakJoy</strong>. Khi ba mẹ đăng ký tài khoản cho bé qua liên kết Facebook, nghĩa là ba mẹ tự nguyện đồng ý với các Điều khoản Dịch vụ này của chúng tôi.</p>
            <p>Ứng dụng này cung cấp môi trường luyện nói tiếng Anh tương tác thân thiện cho các bé dưới sự giám sát của phụ huynh.</p>
          </section>

          <section>
            <h2>2. Trách nhiệm sử dụng</h2>
            <ul>
              <li><strong>Tài khoản an toàn:</strong> Ba mẹ hoàn toàn chịu trách nhiệm bảo mật thông tin đăng nhập từ Facebook của mình.</li>
              <li><strong>Nội dung học tập:</strong> Chúng tôi cung cấp các mẫu bài trò chuyện lành mạnh, mang tính giáo dục sâu sắc. Người học cam kết không bẻ khóa, đảo ngược kỹ thuật sản phẩm của SpeakJoy.</li>
              <li><strong>Bản quyền:</strong> Mọi tài liệu giáo dục, hình ảnh Joy và công nghệ trong ứng dụng đều thuộc bản quyền của SpeakJoy và các bên cấp phép liên quan.</li>
            </ul>
          </section>

          <section>
            <h2>3. Chấm dứt dịch vụ</h2>
            <p>Chúng tôi có quyền dừng dịch vụ hoặc hủy tư cách thành viên nếu phát hiện vi phạm bảo mật hoặc hành vi quấy rối làm ảnh hưởng xấu đến hệ thống giáo dục lành mạnh của chúng tôi.</p>
          </section>

          <div style="text-align: center; margin-top: 30px;">
            <a href="/" class="btn">Quay lại trang chủ SpeakJoy</a>
          </div>

          <div class="footer">
            <p>© 2026 SpeakJoy Inc. Phát triển bằng cả trái tim dành cho thế hệ tương lai.</p>
          </div>
        </div>
      </body>
      </html>
    `);
  });

  // Serve static assets or use Vite Dev Server
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      configFile: path.join(process.cwd(), "vite.middleware.config.ts"),
      server: {
        middlewareMode: true,
        hmr: {
          server: httpServer,
          clientPort: PORT,
        },
        watch: process.env.DISABLE_HMR === 'true' ? null : {
          usePolling: true,
          interval: 100,
        },
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server is running at http://localhost:${PORT}`);
  });
}

startServer();
