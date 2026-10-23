import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Check, HelpCircle, Volume2, ArrowRight } from 'lucide-react';
import { playAppSound, playCorrectSound, playIncorrectSound } from '../../data';
import { shuffleArray } from '../../lib/shuffle';

export interface FallbackWord {
  emoji: string;
  word: string;
  vietnamese: string;
  ipa?: string;
  category?: string;
}

interface FallbackChallengeProps {
  word: FallbackWord;
  wordPool: FallbackWord[];
  onSuccess: () => void;
  onSkip?: () => void;
  globalLang: 'en' | 'vi';
  isLight: boolean;
}

export default function FallbackChallenge({
  word,
  wordPool,
  onSuccess,
  onSkip,
  globalLang,
  isLight,
}: FallbackChallengeProps) {
  const isEnglish = globalLang === 'en';

  // Xác định sub-mode tự động
  // 1. Nếu từ dài hoặc là câu (chứa khoảng trắng): sắp xếp từ thành câu (sentence-sort)
  // 2. Nếu từ ngắn (<= 5 ký tự): sắp xếp chữ cái (letter-sort)
  // 3. Khác: chọn từ đúng (word-choice / image-choice)
  const isSentence = word.word.trim().includes(' ');
  const isShortWord = !isSentence && word.word.length <= 5;
  const initialMode = isSentence
    ? 'sentence-sort'
    : isShortWord
      ? 'letter-sort'
      : Math.random() > 0.5
        ? 'word-choice'
        : 'image-choice';

  const [mode] = useState<'word-choice' | 'image-choice' | 'letter-sort' | 'sentence-sort'>(initialMode);
  const [options, setOptions] = useState<string[]>([]);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [answerState, setAnswerState] = useState<'idle' | 'correct' | 'wrong'>('idle');

  // Cho letter-sort
  const [letterBlocks, setLetterBlocks] = useState<string[]>([]);
  const [letterAssembled, setLetterAssembled] = useState<string[]>([]);

  // Cho sentence-sort
  const [wordBlocks, setWordBlocks] = useState<string[]>([]);
  const [wordAssembled, setWordAssembled] = useState<string[]>([]);

  useEffect(() => {
    // Khởi tạo data dựa trên mode
    if (mode === 'word-choice') {
      // Bé chọn nghĩa tiếng Việt của từ tiếng Anh
      const distractors = shuffleArray(wordPool.filter((w) => w.word !== word.word))
        .slice(0, 3)
        .map((w) => w.vietnamese);
      const allChoices = shuffleArray([...new Set([word.vietnamese, ...distractors])]);
      setOptions(allChoices);
    } else if (mode === 'image-choice') {
      // Bé chọn hình ảnh (emoji) đúng cho từ tiếng Anh
      const distractors = shuffleArray(wordPool.filter((w) => w.word !== word.word))
        .slice(0, 3)
        .map((w) => w.emoji);
      const allChoices = shuffleArray([...new Set([word.emoji, ...distractors])]);
      setOptions(allChoices);
    } else if (mode === 'letter-sort') {
      // Trộn các chữ cái trong từ tiếng Anh
      const chars = word.word.toUpperCase().split('');
      const shuffled = shuffleArray(chars);
      setLetterBlocks(shuffled);
      setLetterAssembled([]);
    } else if (mode === 'sentence-sort') {
      // Trộn các từ trong câu tiếng Anh
      const words = word.word.split(/\s+/);
      const shuffled = shuffleArray(words);
      setWordBlocks(shuffled);
      setWordAssembled([]);
    }
    setSelectedOption(null);
    setAnswerState('idle');
  }, [word, mode, wordPool]);

  const speakWord = () => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(word.word);
      u.lang = 'en-US';
      u.rate = 0.85;
      window.speechSynthesis.speak(u);
    }
    playAppSound(450, 'sine', 0.05);
  };

  const handleSelectChoice = (choice: string) => {
    if (answerState !== 'idle') return;
    setSelectedOption(choice);
    const correct = mode === 'word-choice' ? word.vietnamese : word.emoji;
    if (choice === correct) {
      setAnswerState('correct');
      playCorrectSound();
      setTimeout(() => onSuccess(), 1100);
    } else {
      setAnswerState('wrong');
      playIncorrectSound();
      setTimeout(() => {
        setAnswerState('idle');
        setSelectedOption(null);
      }, 1200);
    }
  };

  // Kéo thả hoặc click cho letter-sort
  const handleLetterBlockClick = (index: number) => {
    if (answerState !== 'idle') return;
    const letter = letterBlocks[index];
    const newAssembled = [...letterAssembled, letter];
    setLetterAssembled(newAssembled);
    setLetterBlocks((prev) => prev.filter((_, i) => i !== index));

    // Kiểm tra nếu đã xếp đủ
    if (newAssembled.length === word.word.length) {
      const result = newAssembled.join('').toLowerCase();
      if (result === word.word.toLowerCase()) {
        setAnswerState('correct');
        playCorrectSound();
        setTimeout(() => onSuccess(), 1100);
      } else {
        setAnswerState('wrong');
        playIncorrectSound();
        setTimeout(() => {
          // Reset
          setLetterBlocks(shuffleArray(word.word.toUpperCase().split('')));
          setLetterAssembled([]);
          setAnswerState('idle');
        }, 1200);
      }
    } else {
      playAppSound(400, 'sine', 0.04);
    }
  };

  const handleRemoveLetterAssembled = (index: number) => {
    if (answerState !== 'idle') return;
    const letter = letterAssembled[index];
    setLetterBlocks((prev) => [...prev, letter]);
    setLetterAssembled((prev) => prev.filter((_, i) => i !== index));
    playAppSound(350, 'sine', 0.03);
  };

  // Kéo thả hoặc click cho sentence-sort
  const handleWordBlockClick = (index: number) => {
    if (answerState !== 'idle') return;
    const selectedWord = wordBlocks[index];
    const newAssembled = [...wordAssembled, selectedWord];
    setWordAssembled(newAssembled);
    setWordBlocks((prev) => prev.filter((_, i) => i !== index));

    const originalWords = word.word.split(/\s+/);
    if (newAssembled.length === originalWords.length) {
      const result = newAssembled.join(' ').toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?]/g, '');
      const target = word.word.toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?]/g, '');
      if (result === target) {
        setAnswerState('correct');
        playCorrectSound();
        setTimeout(() => onSuccess(), 1100);
      } else {
        setAnswerState('wrong');
        playIncorrectSound();
        setTimeout(() => {
          setWordBlocks(shuffleArray(word.word.split(/\s+/)));
          setWordAssembled([]);
          setAnswerState('idle');
        }, 1200);
      }
    } else {
      playAppSound(420, 'sine', 0.04);
    }
  };

  const handleRemoveWordAssembled = (index: number) => {
    if (answerState !== 'idle') return;
    const selectedWord = wordAssembled[index];
    setWordBlocks((prev) => [...prev, selectedWord]);
    setWordAssembled((prev) => prev.filter((_, i) => i !== index));
    playAppSound(370, 'sine', 0.03);
  };

  return (
    <div className={`p-5 rounded-3xl border-2 border-b-4 flex flex-col gap-4 shadow-xl select-none transition-all ${
      isLight ? 'bg-amber-50/95 border-amber-200 text-slate-800' : 'bg-slate-900/95 border-slate-700 text-slate-100'
    }`}>
      {/* Title */}
      <div className="flex items-center justify-between border-b pb-2">
        <span className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-amber-500">
          <HelpCircle className="w-4 h-4" />
          {isEnglish ? 'Word QuizFallback' : 'Bài học dự phòng'}
        </span>
        {onSkip && (
          <button
            onClick={onSkip}
            className={`px-3 py-1 rounded-xl text-xs font-bold border transition ${
              isLight ? 'bg-white hover:bg-slate-50 border-slate-200' : 'bg-slate-800 hover:bg-slate-700 border-slate-700'
            }`}
          >
            {isEnglish ? 'Skip' : 'Bỏ qua'}
          </button>
        )}
      </div>

      {/* Main card */}
      <div className="flex flex-col items-center justify-center p-4 rounded-2xl bg-white/70 dark:bg-white/[0.04] text-center gap-3">
        <div className="text-4.5xl">{word.emoji}</div>
        <div>
          <button
            onClick={speakWord}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-indigo-100 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 hover:scale-105 active:scale-95 transition"
          >
            <Volume2 className="w-3.5 h-3.5" />
            <span>{isEnglish ? 'Listen' : 'Nghe phát âm'}</span>
          </button>
        </div>
      </div>

      {/* RENDER MODES */}
      {mode === 'word-choice' && (
        <div className="space-y-3">
          <p className="text-xs font-black text-center text-slate-500 uppercase tracking-wider">
            {isEnglish ? 'Choose the correct Vietnamese meaning:' : 'Chọn nghĩa Tiếng Việt đúng:'}
          </p>
          <div className="grid grid-cols-2 gap-2">
            {options.map((choice) => {
              const isSelected = selectedOption === choice;
              return (
                <button
                  key={choice}
                  onClick={() => handleSelectChoice(choice)}
                  className={`min-h-[50px] px-4 py-2 rounded-2xl border-2 border-b-4 text-sm font-extrabold active:scale-95 transition ${
                    answerState === 'correct' && choice === word.vietnamese
                      ? 'bg-emerald-500 border-emerald-700 text-white'
                      : answerState === 'wrong' && isSelected
                        ? 'bg-rose-500 border-rose-700 text-white animate-shake'
                        : isSelected
                          ? 'bg-sky-400 border-sky-600 text-white'
                          : isLight ? 'bg-white hover:bg-slate-50 border-slate-200 text-slate-700' : 'bg-slate-800 hover:bg-slate-750 border-slate-700 text-slate-200'
                  }`}
                >
                  {choice}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {mode === 'image-choice' && (
        <div className="space-y-3">
          <p className="text-xs font-black text-center text-slate-500 uppercase tracking-wider">
            {isEnglish ? 'Match the word with correct picture:' : 'Chọn hình ảnh đúng cho từ:'}
          </p>
          <h3 className="text-center text-2xl font-black text-indigo-600 dark:text-indigo-400">{word.word}</h3>
          <div className="grid grid-cols-2 gap-2">
            {options.map((choice) => {
              const isSelected = selectedOption === choice;
              return (
                <button
                  key={choice}
                  onClick={() => handleSelectChoice(choice)}
                  className={`min-h-[70px] flex items-center justify-center rounded-2xl border-2 border-b-4 text-3xl active:scale-95 transition ${
                    answerState === 'correct' && choice === word.emoji
                      ? 'bg-emerald-500 border-emerald-700 text-white'
                      : answerState === 'wrong' && isSelected
                        ? 'bg-rose-500 border-rose-700 text-white animate-shake'
                        : isSelected
                          ? 'bg-sky-400 border-sky-600 text-white'
                          : isLight ? 'bg-white hover:bg-slate-50 border-slate-200' : 'bg-slate-800 hover:bg-slate-750 border-slate-700'
                  }`}
                >
                  {choice}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {mode === 'letter-sort' && (
        <div className="space-y-4">
          <p className="text-xs font-black text-center text-slate-500 uppercase tracking-wider">
            {isEnglish ? 'Spell the word by choosing letters:' : 'Sắp xếp chữ cái để ghép thành từ:'}
          </p>

          {/* Assembled Area */}
          <div className="min-h-[50px] flex flex-wrap items-center justify-center gap-1.5 p-2 rounded-xl bg-slate-100 dark:bg-slate-950/40 border border-dashed border-slate-300 dark:border-slate-800">
            {letterAssembled.map((letter, index) => (
              <button
                key={`${letter}-${index}`}
                onClick={() => handleRemoveLetterAssembled(index)}
                className={`w-9 h-9 rounded-lg font-black text-base flex items-center justify-center border-b-2 shadow-sm ${
                  answerState === 'correct'
                    ? 'bg-emerald-500 text-white border-emerald-700'
                    : answerState === 'wrong'
                      ? 'bg-rose-500 text-white border-rose-700'
                      : 'bg-indigo-500 text-white border-indigo-700'
                }`}
              >
                {letter}
              </button>
            ))}
          </div>

          {/* Blocks Area */}
          <div className="flex flex-wrap items-center justify-center gap-2">
            {letterBlocks.map((letter, index) => (
              <button
                key={`${letter}-${index}`}
                onClick={() => handleLetterBlockClick(index)}
                className={`w-10 h-10 rounded-xl font-black text-lg flex items-center justify-center border-2 border-b-4 ${
                  isLight ? 'bg-white hover:bg-slate-50 border-slate-200 text-slate-850' : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200'
                }`}
              >
                {letter}
              </button>
            ))}
          </div>
        </div>
      )}

      {mode === 'sentence-sort' && (
        <div className="space-y-4">
          <p className="text-xs font-black text-center text-slate-500 uppercase tracking-wider">
            {isEnglish ? 'Arrange the words to make a sentence:' : 'Sắp xếp các từ thành câu đúng:'}
          </p>
          <div className="text-center italic text-xs opacity-75">{word.vietnamese}</div>

          {/* Assembled Area */}
          <div className="min-h-[54px] flex flex-wrap items-center justify-center gap-2 p-2 rounded-xl bg-slate-100 dark:bg-slate-950/40 border border-dashed border-slate-300 dark:border-slate-800">
            {wordAssembled.map((w, index) => (
              <button
                key={`${w}-${index}`}
                onClick={() => handleRemoveWordAssembled(index)}
                className={`px-3 py-1.5 rounded-xl font-bold text-xs flex items-center justify-center border-b-2 shadow-sm ${
                  answerState === 'correct'
                    ? 'bg-emerald-500 text-white border-emerald-700'
                    : answerState === 'wrong'
                      ? 'bg-rose-500 text-white border-rose-700'
                      : 'bg-indigo-500 text-white border-indigo-700'
                }`}
              >
                {w}
              </button>
            ))}
          </div>

          {/* Blocks Area */}
          <div className="flex flex-wrap items-center justify-center gap-2">
            {wordBlocks.map((w, index) => (
              <button
                key={`${w}-${index}`}
                onClick={() => handleWordBlockClick(index)}
                className={`px-3 py-1.5 rounded-xl font-bold text-xs flex items-center justify-center border-2 border-b-4 ${
                  isLight ? 'bg-white hover:bg-slate-50 border-slate-200 text-slate-850' : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200'
                }`}
              >
                {w}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
