import type { GrammarReview, SpeakingCorrection, WordStatus } from './speakingCoach';

export interface HistoryTranscriptSourceMessage {
  role: string;
  content: string;
  translation?: string;
  score?: number;
  wordStatuses?: WordStatus[];
  corrections?: SpeakingCorrection[];
  askRepeat?: string;
  pronunciationScore?: number;
  grammarReview?: GrammarReview;
}

export interface HistoryTranscriptSessionLike {
  id: string;
  conversationTranscript?: HistoryTranscriptSourceMessage[] | null;
}

export interface NormalizedHistoryMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  translation?: string;
  wordStatuses?: WordStatus[];
  score?: number;
  corrections?: SpeakingCorrection[];
  askRepeat?: string;
  pronunciationScore?: number;
  grammarReview?: GrammarReview;
}

export const splitHistoryReplyForDisplay = (rawReply: string) => {
  const normalized = rawReply.trim();
  const matches = [...normalized.matchAll(/\(([^()]*)\)/g)];
  if (matches.length > 0) {
    return {
      cleanReply: normalized.replace(/\([^()]*\)/g, ' ').replace(/\s+/g, ' ').trim(),
      replyTranslation: (matches[0]?.[1] || '').trim(),
    };
  }

  return {
    cleanReply: normalized,
    replyTranslation: '',
  };
};

export const normalizeHistoryTranscript = (
  item: HistoryTranscriptSessionLike | null,
): NormalizedHistoryMessage[] => {
  if (!item || !Array.isArray(item.conversationTranscript)) {
    return [];
  }

  return item.conversationTranscript
    .filter(
      (message) =>
        message &&
        (message.role === 'user' || message.role === 'assistant') &&
        typeof message.content === 'string' &&
        message.content.trim(),
    )
    .map((message, index) => {
      let content = message.content.trim();
      let translation = typeof message.translation === 'string' ? message.translation.trim() : undefined;

      if (message.role === 'assistant') {
        const splitReply = splitHistoryReplyForDisplay(content);
        content = splitReply.cleanReply || content;
        if (!translation && splitReply.replyTranslation) {
          translation = splitReply.replyTranslation;
        }
      }

      return {
        id: `history_${item.id}_${index}`,
        role: message.role as 'user' | 'assistant',
        content,
        translation,
        wordStatuses: Array.isArray(message.wordStatuses) ? message.wordStatuses : undefined,
        score: typeof message.score === 'number' ? message.score : undefined,
        corrections: Array.isArray(message.corrections) ? message.corrections : undefined,
        askRepeat: typeof message.askRepeat === 'string' ? message.askRepeat : undefined,
        pronunciationScore: typeof message.pronunciationScore === 'number' ? message.pronunciationScore : undefined,
        grammarReview:
          message.grammarReview && typeof message.grammarReview === 'object'
            ? message.grammarReview
            : undefined,
      };
    });
};
