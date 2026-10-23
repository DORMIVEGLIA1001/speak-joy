import React from 'react';
import { Volume2 } from 'lucide-react';
import type { GrammarReview, GrammarScore, SpeakingCorrection } from '../lib/speakingCoach';

interface SpeakingCorrectionPanelProps {
  corrections: SpeakingCorrection[];
  grammarReview?: GrammarReview;
  grammarScore?: GrammarScore;
  askRepeat?: string;
  pronunciationScore?: number;
  globalTheme: 'dark' | 'light';
  globalLang: 'en' | 'vi';
  onHearWord?: (word: string) => void;
  onHearRepeat?: (text: string) => void;
}

const GRAMMAR_BADGE: Record<GrammarScore['level'], { emoji: string; en: string; vi: string; light: string; dark: string }> = {
  excellent: {
    emoji: '🌟', en: 'Great grammar', vi: 'Ngữ pháp tuyệt vời',
    light: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    dark: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300',
  },
  good: {
    emoji: '👍', en: 'Good grammar', vi: 'Ngữ pháp khá tốt',
    light: 'border-sky-200 bg-sky-50 text-sky-700',
    dark: 'border-sky-400/30 bg-sky-400/10 text-sky-300',
  },
  needs_work: {
    emoji: '💪', en: 'Keep practicing', vi: 'Cố lên nhé',
    light: 'border-amber-200 bg-amber-50 text-amber-700',
    dark: 'border-amber-400/30 bg-amber-400/10 text-amber-300',
  },
};

export default function SpeakingCorrectionPanel({
  corrections,
  grammarReview,
  grammarScore,
  askRepeat,
  globalTheme,
  globalLang,
  onHearWord,
  onHearRepeat,
}: SpeakingCorrectionPanelProps) {
  const resolvedGrammarScore = grammarScore || grammarReview?.grammar_score;
  if (corrections.length === 0 && !askRepeat && !grammarReview && !resolvedGrammarScore) {
    return null;
  }

  const isLight = globalTheme === 'light';
  const grammarIssues = grammarReview?.issues || [];
  const grammarBadge = resolvedGrammarScore ? GRAMMAR_BADGE[resolvedGrammarScore.level] : null;

  const renderHighlightedText = (
    text: string,
    phrases: string[],
    className: string,
  ) => {
    const parts: React.ReactNode[] = [];
    let remaining = text;
    let key = 0;
    const safePhrases = phrases
      .map((phrase) => phrase.trim())
      .filter(Boolean)
      .sort((a, b) => b.length - a.length);

    while (remaining) {
      const nextMatch = safePhrases
        .map((phrase) => {
          const index = remaining.toLowerCase().indexOf(phrase.toLowerCase());
          return index >= 0 ? { phrase, index } : null;
        })
        .filter((match): match is { phrase: string; index: number } => Boolean(match))
        .sort((a, b) => a.index - b.index || b.phrase.length - a.phrase.length)[0];

      if (!nextMatch) {
        parts.push(<span key={`plain_${key++}`}>{remaining}</span>);
        break;
      }

      if (nextMatch.index > 0) {
        parts.push(<span key={`plain_${key++}`}>{remaining.slice(0, nextMatch.index)}</span>);
      }
      parts.push(
        <span key={`mark_${key++}`} className={className}>
          {remaining.slice(nextMatch.index, nextMatch.index + nextMatch.phrase.length)}
        </span>,
      );
      remaining = remaining.slice(nextMatch.index + nextMatch.phrase.length);
    }

    return parts;
  };

  return (
    <div className={`rounded-[18px] border p-4 ${isLight ? 'border-amber-200 bg-amber-50/90' : 'border-amber-400/20 bg-amber-400/10'}`}>
      {resolvedGrammarScore && grammarBadge && (
        <div className={`mb-3 flex items-center justify-between gap-2 rounded-[14px] border px-3 py-2 ${isLight ? grammarBadge.light : grammarBadge.dark}`}>
          <span className="flex items-center gap-1.5 text-xs font-black uppercase tracking-[0.12em]">
            <span aria-hidden>{grammarBadge.emoji}</span>
            {globalLang === 'en' ? grammarBadge.en : grammarBadge.vi}
          </span>
          <span className="text-sm font-black">
            {resolvedGrammarScore.score}
            <span className="text-[10px] font-bold opacity-70">/100</span>
          </span>
        </div>
      )}
      {grammarReview && (
        <div className="space-y-3">
          <div className={`rounded-[14px] border px-3 py-3 ${isLight ? 'border-red-200 bg-white text-slate-900' : 'border-red-400/25 bg-red-950/20 text-slate-100'}`}>
            <div className="text-[10px] font-black uppercase tracking-[0.16em] text-red-500">
              {globalLang === 'en' ? 'Grammar to fix' : 'Câu cần sửa ngữ pháp'}
            </div>
            <p className="mt-2 text-sm font-black leading-relaxed">
              {renderHighlightedText(
                grammarReview.original_sentence,
                grammarIssues.map((issue) => issue.mistake),
                'text-red-600 underline decoration-2 decoration-wavy underline-offset-4',
              )}
            </p>
          </div>

          <div className={`rounded-[14px] border px-3 py-3 ${isLight ? 'border-emerald-200 bg-white text-slate-900' : 'border-emerald-400/25 bg-emerald-950/20 text-slate-100'}`}>
            <div className="text-[10px] font-black uppercase tracking-[0.16em] text-emerald-500">
              {globalLang === 'en' ? 'Teacher correction' : 'Giáo viên sửa thành'}
            </div>
            <p className="mt-2 text-sm font-black leading-relaxed">
              {renderHighlightedText(
                grammarReview.corrected_sentence,
                grammarIssues.map((issue) => issue.correction),
                'text-emerald-600 underline decoration-2 underline-offset-4',
              )}
            </p>
            {grammarIssues.length > 0 && (
              <div className={`mt-2 space-y-1 text-[11px] font-semibold leading-relaxed ${isLight ? 'text-slate-600' : 'text-slate-300'}`}>
                {grammarIssues.slice(0, 3).map((issue, index) => (
                  <div key={`${issue.mistake}_${index}`}>
                    {issue.instruction || `${issue.mistake} -> ${issue.correction}`}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {corrections.length > 0 && (
        <div className={`${grammarReview ? 'mt-3' : ''} space-y-2`}>
          {corrections.map((correction, index) => (
            <div
              key={`${correction.correct_word}_${index}`}
              className={`rounded-[14px] border px-3 py-3 ${isLight ? 'border-white bg-white/90 text-slate-800' : 'border-white/10 bg-black/15 text-slate-100'}`}
            >
              <div className="flex flex-wrap items-center gap-2 text-xs font-black">
                <span className="text-rose-500">{correction.mistake_word || '...'}</span>
                <span className={isLight ? 'text-slate-400' : 'text-slate-500'}>-&gt;</span>
                <span className="text-emerald-500">{correction.correct_word}</span>
              </div>
              <div className="mt-1 text-[11px] font-semibold text-pink-500">{correction.phonetic_hint}</div>
              <div className={`mt-1 text-[11px] leading-relaxed ${isLight ? 'text-slate-600' : 'text-slate-300'}`}>
                {correction.instruction}
              </div>
              {onHearWord && (
                <button
                  type="button"
                  onClick={() => onHearWord(correction.correct_word)}
                  className={`mt-2 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] ${isLight ? 'bg-sky-100 text-sky-700 hover:bg-sky-200' : 'bg-sky-400/15 text-sky-300 hover:bg-sky-400/25'}`}
                >
                  <Volume2 className="h-3 w-3" />
                  {globalLang === 'en' ? 'Hear word' : 'Nghe từ'}
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {askRepeat && (
        <div className={`mt-3 rounded-[14px] border px-3 py-3 ${isLight ? 'border-amber-200 bg-white/90' : 'border-amber-300/15 bg-black/15'}`}>
          <div className={`text-[10px] font-black uppercase tracking-[0.16em] ${isLight ? 'text-amber-700' : 'text-amber-300'}`}>
            {globalLang === 'en' ? 'Repeat after Sunny' : 'Lặp lại theo Sunny'}
          </div>
          <p className={`mt-1 text-sm font-black ${isLight ? 'text-slate-900' : 'text-white'}`}>
            {askRepeat}
          </p>
          {onHearRepeat && (
            <button
              type="button"
              onClick={() => onHearRepeat(askRepeat)}
              className={`mt-2 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] ${isLight ? 'bg-amber-100 text-amber-700 hover:bg-amber-200' : 'bg-amber-400/15 text-amber-200 hover:bg-amber-400/25'}`}
            >
              <Volume2 className="h-3 w-3" />
              {globalLang === 'en' ? 'Hear sentence' : 'Nghe câu'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
