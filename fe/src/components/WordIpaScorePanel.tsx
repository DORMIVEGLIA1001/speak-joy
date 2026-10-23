import { Volume2 } from 'lucide-react';
import type { WordIpaScore } from '../lib/roleplayApi';

interface WordIpaScorePanelProps {
  overallScore: number;
  words: WordIpaScore[];
  spokenIpa?: string;
  globalLang: 'en' | 'vi';
  globalTheme: 'dark' | 'light';
  onHearWord?: (word: string) => void;
}

// Renders the audio→IPA scoring result as per-word chips: emerald = said well,
// amber = close, rose = needs work. Each chip shows the target IPA vs. what the
// child actually said so a parent can see which sound drifted (notes 14/7 · mục 3.4).
export default function WordIpaScorePanel({
  overallScore,
  words,
  spokenIpa,
  globalLang,
  globalTheme,
  onHearWord,
}: WordIpaScorePanelProps) {
  const isLight = globalTheme === 'light';

  const chipColors = (rating: WordIpaScore['rating']) => {
    if (rating === 'Good') {
      return isLight
        ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
        : 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300';
    }
    if (rating === 'Fair') {
      return isLight
        ? 'border-amber-300 bg-amber-50 text-amber-700'
        : 'border-amber-400/30 bg-amber-400/10 text-amber-300';
    }
    return isLight
      ? 'border-rose-300 bg-rose-50 text-rose-700'
      : 'border-rose-400/30 bg-rose-400/10 text-rose-300';
  };

  const overallColor =
    overallScore >= 80 ? 'text-emerald-500' : overallScore >= 55 ? 'text-amber-500' : 'text-rose-500';

  return (
    <div className={`rounded-[18px] border p-4 ${isLight ? 'border-slate-200 bg-white/90' : 'border-white/10 bg-black/20'}`}>
      <div className="flex items-center justify-between">
        <span className={`text-[10px] font-black uppercase tracking-[0.16em] ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
          {globalLang === 'en' ? 'Pronunciation score' : 'Điểm phát âm'}
        </span>
        <span className={`text-lg font-black ${overallColor}`}>
          {overallScore}
          <span className="text-[10px] font-bold opacity-70">/100</span>
        </span>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {words.map((word, index) => (
          <div
            key={`${word.word}_${index}`}
            className={`flex min-w-[78px] flex-col items-center gap-0.5 rounded-xl border px-2.5 py-2 ${chipColors(word.rating)}`}
          >
            <span className="text-sm font-black">{word.word}</span>
            {word.targetIpa && (
              <span className="font-mono text-[10px] opacity-80">/{word.targetIpa}/</span>
            )}
            {word.rating !== 'Good' && word.spokenIpa && (
              <span className="font-mono text-[9px] italic opacity-70">
                🗣️ /{word.spokenIpa}/
              </span>
            )}
            {onHearWord && (
              <button
                type="button"
                onClick={() => onHearWord(word.word)}
                className="mt-0.5 inline-flex items-center gap-0.5 text-[9px] font-bold opacity-80 hover:opacity-100"
              >
                <Volume2 className="h-3 w-3" />
                {globalLang === 'en' ? 'Hear' : 'Nghe'}
              </button>
            )}
          </div>
        ))}
      </div>

      {spokenIpa && (
        <div className={`mt-3 rounded-xl border px-3 py-2 ${isLight ? 'border-slate-200 bg-slate-50' : 'border-white/10 bg-white/5'}`}>
          <span className={`text-[9px] font-black uppercase tracking-[0.14em] ${isLight ? 'text-slate-400' : 'text-slate-500'}`}>
            {globalLang === 'en' ? 'What we heard' : 'Âm nghe được'}
          </span>
          <p className={`mt-0.5 font-mono text-xs ${isLight ? 'text-slate-600' : 'text-slate-300'}`}>/{spokenIpa}/</p>
        </div>
      )}
    </div>
  );
}
