export type WordCharacterResult = {
  character: string;
  matches: boolean;
};

export const normalizeWord = (value: string) => value.toLowerCase().replace(/[^a-z]/g, '');

export const extractTranscriptWords = (transcript: string | string[]) => {
  const transcripts = Array.isArray(transcript) ? transcript : [transcript];

  return transcripts
    .map((value) => value.toLowerCase())
    .join(' ')
    .split(/\s+/)
    .map(normalizeWord)
    .filter(Boolean);
};

const levenshteinDistance = (source: string, target: string) => {
  const rows = source.length + 1;
  const cols = target.length + 1;
  const matrix = Array.from({ length: rows }, () => Array(cols).fill(0));

  for (let row = 0; row < rows; row += 1) matrix[row][0] = row;
  for (let col = 0; col < cols; col += 1) matrix[0][col] = col;

  for (let row = 1; row < rows; row += 1) {
    for (let col = 1; col < cols; col += 1) {
      const cost = source[row - 1] === target[col - 1] ? 0 : 1;
      matrix[row][col] = Math.min(
        matrix[row - 1][col] + 1,
        matrix[row][col - 1] + 1,
        matrix[row - 1][col - 1] + cost,
      );
    }
  }

  return matrix[source.length][target.length];
};

export const findClosestAllowedWord = (
  transcript: string | string[],
  expectedLetter: string,
  allowedWords: string[],
) => {
  const words = extractTranscriptWords(transcript).filter((word) => word.startsWith(expectedLetter));
  const uniqueAllowedWords = [...new Set(allowedWords.map(normalizeWord).filter(Boolean))];

  for (const word of words) {
    if (uniqueAllowedWords.includes(word)) return word;
  }

  let bestMatch = '';
  let bestScore = Number.POSITIVE_INFINITY;

  for (const heardWord of words) {
    for (const candidate of uniqueAllowedWords) {
      const score = levenshteinDistance(heardWord, candidate);
      const maxDistance = Math.max(1, Math.floor(candidate.length / 3));
      if (score <= maxDistance && score < bestScore) {
        bestMatch = candidate;
        bestScore = score;
      }
    }
  }

  return bestMatch;
};

export const selectSpokenWord = (
  transcript: string | string[],
  expectedLetter: string,
  isKnownWord: (word: string) => boolean,
) => {
  const words = extractTranscriptWords(transcript);

  return words.find((word) => word.startsWith(expectedLetter) && isKnownWord(word))
    || words.find((word) => word.startsWith(expectedLetter))
    || words[words.length - 1]
    || '';
};

export const buildWordHint = (word: string, revealedLetters: number) =>
  word.split('').map((letter, index) => index < revealedLetters ? letter : '_');

export const compareWordCharacters = (heard: string, target: string, forceCorrect = false): WordCharacterResult[] =>
  Array.from({ length: Math.max(heard.length, target.length) }, (_, index) => {
    const character = heard[index] || '_';
    return {
      character,
      matches: forceCorrect || character === target[index],
    };
  });
