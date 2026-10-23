const DOT_TOKEN = '__SPEAKJOY_DOT__';
const COMMON_ABBREVIATIONS = [
  'Mr.', 'Mrs.', 'Ms.', 'Dr.', 'Prof.', 'St.', 'Jr.', 'Sr.',
  'e.g.', 'i.e.', 'a.m.', 'p.m.',
];

function protectSentenceDots(text: string): string {
  let protectedText = text.replace(/(\d)\.(\d)/g, `$1${DOT_TOKEN}$2`);
  for (const abbreviation of COMMON_ABBREVIATIONS) {
    const escaped = abbreviation.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    protectedText = protectedText.replace(
      new RegExp(`\\b${escaped}`, 'gi'),
      (match) => match.replaceAll('.', DOT_TOKEN),
    );
  }
  return protectedText;
}

function restoreSentenceDots(text: string): string {
  return text.replaceAll(DOT_TOKEN, '.');
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function splitLongSentence(sentence: string, maxWords: number): string[] {
  if (wordCount(sentence) <= maxWords) return [sentence.trim()];

  const commaParts = sentence
    .split(/(?<=,)/)
    .map((part) => part.trim())
    .filter(Boolean);
  const chunks: string[] = [];
  let current = '';

  for (const part of commaParts) {
    const candidate = current ? `${current} ${part}` : part;
    if (current && wordCount(candidate) > maxWords) {
      chunks.push(current);
      current = part;
    } else {
      current = candidate;
    }
  }
  if (current) chunks.push(current);

  return chunks.flatMap((chunk) => {
    if (wordCount(chunk) <= maxWords) return [chunk];
    const words = chunk.split(/\s+/);
    const hardChunks: string[] = [];
    for (let index = 0; index < words.length; index += maxWords) {
      hardChunks.push(words.slice(index, index + maxWords).join(' '));
    }
    return hardChunks;
  });
}

export function splitTextForSpeech(
  text: string,
  options: { maxWords?: number; minWords?: number } = {},
): string[] {
  const maxWords = Math.max(6, options.maxWords ?? 20);
  const minWords = Math.max(1, options.minWords ?? 3);
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return [];

  const protectedText = protectSentenceDots(normalized);
  const sentences = (protectedText.match(/[^.!?;]+(?:[.!?;]+|$)/g) || [protectedText])
    .map((sentence) => restoreSentenceDots(sentence.trim()))
    .filter(Boolean)
    .flatMap((sentence) => splitLongSentence(sentence, maxWords));

  const merged: string[] = [];
  for (const sentence of sentences) {
    if (merged.length > 0 && wordCount(sentence) < minWords) {
      merged[merged.length - 1] = `${merged[merged.length - 1]} ${sentence}`;
    } else {
      merged.push(sentence);
    }
  }

  return merged;
}
