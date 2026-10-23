import React from 'react';
import type { SpeakingCorrection } from '../lib/speakingCoach';
import { normalizeWord } from '../lib/speakingCoach';

interface SpeakingTranscriptPanelProps {
  text: string;
  corrections?: SpeakingCorrection[];
  label: string;
  globalTheme: 'dark' | 'light';
}

export default function SpeakingTranscriptPanel({
  text,
  corrections = [],
  label,
  globalTheme,
}: SpeakingTranscriptPanelProps) {
  if (!text.trim()) {
    return null;
  }

  const isLight = globalTheme === 'light';
  const mistakeWords = new Set(corrections.map((item) => normalizeWord(item.mistake_word)).filter(Boolean));
  const words = text.split(/(\s+)/);

  return (
    <div className={`rounded-[18px] border p-4 ${isLight ? 'border-sky-200 bg-sky-50/80' : 'border-sky-400/20 bg-sky-400/10'}`}>
      <p className={`text-[10px] font-black uppercase tracking-[0.16em] ${isLight ? 'text-sky-700' : 'text-sky-300'}`}>
        {label}
      </p>
      <p className={`mt-2 text-sm font-bold leading-relaxed ${isLight ? 'text-slate-900' : 'text-white'}`}>
        {words.map((part, index) => {
          const clean = normalizeWord(part);
          if (!clean || !mistakeWords.has(clean)) {
            return <span key={`${part}_${index}`}>{part}</span>;
          }

          return (
            <span key={`${part}_${index}`} className="text-rose-500 underline decoration-2 decoration-wavy underline-offset-4">
              {part}
            </span>
          );
        })}
      </p>
    </div>
  );
}
