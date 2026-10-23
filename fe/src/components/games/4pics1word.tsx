import React, { useState, useEffect, useRef } from 'react';
import { shuffleArray } from '../../lib/shuffle';
export interface Word {
  id?: string;
  emoji?: string;
  word: string;
  ipa?: string;
  vietnamese: string;
  category?: string;
  level?: string;
  definition?: string;
  example?: string;
  exampleTranslation?: string;
}
import { motion, AnimatePresence } from 'motion/react';
import { 
  Gamepad2, Award, Sparkles, Trophy, Zap, ChevronRight, ChevronDown,
  ArrowLeft, Coins, RotateCcw, Volume2, Eye, Info, 
  Check, Play, ArrowRight, Star, X, Loader2, RefreshCw, Flame, HelpCircle
} from 'lucide-react';

const getCategoryEmoji = (category: string): string => {
  const map: Record<string, string> = {
    Animals: '🦁', Travel: '✈️', Technology: '💻', Social: '👥',
    Business: '💼', Academic: '📚', Medical: '🏥', Environment: '🌿',
    Psychology: '🧠', Communication: '💬', 'Daily Life': '🏠',
    Literature: '📖', Workplace: '🏢', Food: '🍎', Science: '🔬',
    Sports: '⚽', Arts: '🎨', History: '🏛️', Geography: '🗺️',
  };
  return map[category] || '📁';
};

interface QuizletGamesProps {
  words: Word[];
  onBack: () => void;
  isLight?: boolean;
}

interface LetterGuess {
  letter: string;
  poolId: number | null; // Track which keyboard letter is used to allow reverting
}

interface KeyboardItem {
  id: number;
  letter: string;
  used: boolean;
  hidden: boolean;
}

export default function QuizletGames({ words, onBack, isLight = false }: QuizletGamesProps) {
  // Game persistent states from localStorage
  const [coins, setCoins] = useState<number>(() => {
    const saved = localStorage.getItem('four_pics_coins');
    return saved ? parseInt(saved, 10) : 100;
  });
  const [score, setScore] = useState<number>(() => {
    const saved = localStorage.getItem('four_pics_score');
    return saved ? parseInt(saved, 10) : 0;
  });
  const [streak, setStreak] = useState<number>(() => {
    const saved = localStorage.getItem('four_pics_streak');
    return saved ? parseInt(saved, 10) : 0;
  });

  // Level config & active filters
  const [levelFilter, setLevelFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [categoryDropdownOpen, setCategoryDropdownOpen] = useState<boolean>(false);
  const [gameWords, setGameWords] = useState<Word[]>([]);
  const [currentWordIdx, setCurrentWordIdx] = useState<number>(0);
  const [gameState, setGameState] = useState<'setup' | 'playing' | 'completed'>('setup');

  // Current word play session states
  const [loadedImages, setLoadedImages] = useState<string[]>([]);
  const [imagesLoading, setImagesLoading] = useState<boolean>(false);
  const [userGuesses, setUserGuesses] = useState<LetterGuess[]>([]);
  const [keyboardPool, setKeyboardPool] = useState<KeyboardItem[]>([]);
  const [isCorrect, setIsCorrect] = useState<boolean>(false);
  const [isIncorrectShake, setIsIncorrectShake] = useState<boolean>(false);
  const [hasUsedClean, setHasUsedClean] = useState<boolean>(false);

  // Modal full-screen image preview
  const [activeZoomImage, setActiveZoomImage] = useState<string | null>(null);

  // Ref to track speaking
  const spokenRef = useRef<boolean>(false);

  // Derive list of unique categories and levels from available words
  const categories = ['all', ...Array.from(new Set(words.map(w => w.category).filter(Boolean)))];
  const levels = ['all', 'A1', 'A2', 'B1', 'B2'];

  // Update localStorage helper
  const updateCoins = (amount: number) => {
    setCoins(prev => {
      const next = prev + amount;
      localStorage.setItem('four_pics_coins', next.toString());
      return next;
    });
  };

  const updateScoreAndStreak = (points: number, isWin: boolean) => {
    setScore(prev => {
      const next = prev + points;
      localStorage.setItem('four_pics_score', next.toString());
      return next;
    });
    if (isWin) {
      setStreak(prev => {
        const next = prev + 1;
        localStorage.setItem('four_pics_streak', next.toString());
        return next;
      });
    } else {
      setStreak(0);
      localStorage.setItem('four_pics_streak', '0');
    }
  };

  // Sound pronunciation trigger
  const speakWord = (text: string) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'en-US';
      utterance.rate = 0.9;
      window.speechSynthesis.speak(utterance);
    }
  };

  // Helper shuffle
  const getEligibleWords = () => {
    let filtered = words.filter(w => {
      const clean = w.word.trim();
      return (
        !clean.includes(' ') &&
        !clean.includes('-') &&
        /^[a-zA-Z]+$/.test(clean) &&
        clean.length >= 3 &&
        clean.length <= 10
      );
    });
    if (levelFilter !== 'all') {
      filtered = filtered.filter(w => w.level === levelFilter);
    }
    if (categoryFilter !== 'all') {
      filtered = filtered.filter(w => w.category === categoryFilter);
    }
    return filtered;
  };
  const eligibleWordsCount = getEligibleWords().length;

  const handleStartGame = () => {
    const filtered = getEligibleWords();

    if (filtered.length === 0) {
      alert("Không tìm thấy từ vựng nào phù hợp với bộ lọc đã chọn. Vui lòng chọn bộ lọc khác!");
      return;
    }

    // Shuffle the selected game words
    const shuffledWords = shuffleArray(filtered);
    setGameWords(shuffledWords);
    setCurrentWordIdx(0);
    setGameState('playing');
  };

  const currentWord = gameWords[currentWordIdx];

  // Fetch images and prepare keyboard when currentWord changes
  useEffect(() => {
    if (gameState !== 'playing' || !currentWord) return;

    const targetWordStr = currentWord.word.toUpperCase();
    
    // Reset word session states
    setIsCorrect(false);
    setIsIncorrectShake(false);
    setHasUsedClean(false);
    spokenRef.current = false;
    setUserGuesses(Array(targetWordStr.length).fill(null).map(() => ({ letter: '', poolId: null })));

    // Fetch 4 Images
    setImagesLoading(true);
    fetch(`/api/word-images?word=${encodeURIComponent(currentWord.word.toLowerCase())}`)
      .then(res => {
        if (!res.ok) throw new Error("Fetch failed");
        return res.json();
      })
      .then(data => {
        setLoadedImages(data.images);
      })
      .catch(err => {
        console.warn("Could not get custom word images, loading stable fallbacks:", err);
        const term = currentWord.word.toLowerCase();
        setLoadedImages([
          `https://loremflickr.com/350/350/${encodeURIComponent(term)}?lock=11`,
          `https://loremflickr.com/350/350/${encodeURIComponent(term)}?lock=22`,
          `https://loremflickr.com/350/350/${encodeURIComponent(term)}?lock=33`,
          `https://loremflickr.com/350/350/${encodeURIComponent(term)}?lock=44`
        ]);
      })
      .finally(() => {
        setImagesLoading(false);
      });

    // Generate keyboard pool (12 items)
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const wordLetters = targetWordStr.split('');
    const poolSize = 12;
    const extrasCount = Math.max(poolSize - wordLetters.length, 3);
    const poolLetters = [...wordLetters];

    for (let i = 0; i < extrasCount; i++) {
      const randomLetter = alphabet[Math.floor(Math.random() * alphabet.length)];
      poolLetters.push(randomLetter);
    }

    const shuffledLetters = shuffleArray(poolLetters).slice(0, Math.max(poolSize, wordLetters.length + 2));
    const finalKeyboard: KeyboardItem[] = shuffledLetters.map((letter, idx) => ({
      id: idx,
      letter,
      used: false,
      hidden: false
    }));

    setKeyboardPool(finalKeyboard);

  }, [currentWordIdx, gameState, currentWord]);

  // Handle auto-checking of the word once guesses are fully entered
  useEffect(() => {
    if (gameState !== 'playing' || !currentWord || userGuesses.length === 0) return;

    const targetWordStr = currentWord.word.toUpperCase();
    const isFull = userGuesses.every(g => g.letter !== '');

    if (isFull) {
      const userWord = userGuesses.map(g => g.letter).join('');
      if (userWord === targetWordStr) {
        // CORRECT GUESS!
        setIsCorrect(true);
        updateCoins(15);
        updateScoreAndStreak(10, true);
        if (!spokenRef.current) {
          speakWord(currentWord.word);
          spokenRef.current = true;
        }
      } else {
        // INCORRECT GUESS!
        setIsIncorrectShake(true);
        setTimeout(() => {
          setIsIncorrectShake(false);
        }, 600);
      }
    }
  }, [userGuesses, currentWord, gameState]);

  // Click handler for letters in the Keyboard pool
  const handleSelectLetter = (item: KeyboardItem) => {
    if (isCorrect || item.used || item.hidden) return;

    // Find first empty blank slot
    const firstEmptyIdx = userGuesses.findIndex(g => g.letter === '');
    if (firstEmptyIdx === -1) return; // All blanks full

    const nextGuesses = [...userGuesses];
    nextGuesses[firstEmptyIdx] = { letter: item.letter, poolId: item.id };
    setUserGuesses(nextGuesses);

    setKeyboardPool(prev => prev.map(k => k.id === item.id ? { ...k, used: true } : k));
  };

  // Click handler to remove/revert a letter from the guess blanks
  const handleRemoveGuessLetter = (index: number) => {
    if (isCorrect) return;
    const targetGuess = userGuesses[index];
    if (!targetGuess.letter) return;

    const nextGuesses = [...userGuesses];
    nextGuesses[index] = { letter: '', poolId: null };
    setUserGuesses(nextGuesses);

    if (targetGuess.poolId !== null) {
      setKeyboardPool(prev => prev.map(k => k.id === targetGuess.poolId ? { ...k, used: false } : k));
    }
  };

  // Helper 1: HINT (Reveal next empty or incorrect letter)
  const handleUseHint = () => {
    if (isCorrect || coins < 10 || !currentWord) return;

    const targetWordStr = currentWord.word.toUpperCase();
    
    // Find first blank index that doesn't have the correct letter
    let targetIdx = -1;
    for (let i = 0; i < targetWordStr.length; i++) {
      if (userGuesses[i].letter !== targetWordStr[i]) {
        targetIdx = i;
        break;
      }
    }

    if (targetIdx === -1) return;

    const correctLetter = targetWordStr[targetIdx];

    // If there was a letter already guessed there, return it to the pool
    const existingGuess = userGuesses[targetIdx];
    if (existingGuess.poolId !== null) {
      setKeyboardPool(prev => prev.map(k => k.id === existingGuess.poolId ? { ...k, used: false } : k));
    }

    // Find a free letter in keyboard pool that matches the correct letter
    const poolItem = keyboardPool.find(k => k.letter === correctLetter && !k.used && !k.hidden);
    
    if (poolItem) {
      const nextGuesses = [...userGuesses];
      nextGuesses[targetIdx] = { letter: correctLetter, poolId: poolItem.id };
      setUserGuesses(nextGuesses);
      
      setKeyboardPool(prev => prev.map(k => k.id === poolItem.id ? { ...k, used: true } : k));
    } else {
      // Fallback: If no free letter matches, find any matching letter in the keyboard (even if used elsewhere)
      const anyPoolItem = keyboardPool.find(k => k.letter === correctLetter && !k.hidden);
      if (anyPoolItem) {
        // Revert any other slot currently using this pool item
        const otherGuessIdx = userGuesses.findIndex(g => g.poolId === anyPoolItem.id);
        const nextGuesses = [...userGuesses];
        if (otherGuessIdx !== -1) {
          nextGuesses[otherGuessIdx] = { letter: '', poolId: null };
        }
        
        nextGuesses[targetIdx] = { letter: correctLetter, poolId: anyPoolItem.id };
        setUserGuesses(nextGuesses);
        setKeyboardPool(prev => prev.map(k => k.id === anyPoolItem.id ? { ...k, used: true } : k));
      }
    }

    updateCoins(-10);
  };

  // Helper 2: CLEAN (Remove some incorrect distracting letters)
  const handleUseClean = () => {
    if (isCorrect || coins < 15 || hasUsedClean || !currentWord) return;

    const targetWordStr = currentWord.word.toUpperCase();
    const wordLettersSet = new Set(targetWordStr.split(''));

    // Find pool items that are NOT in the word, and hide them
    setKeyboardPool(prev => prev.map(k => {
      if (!wordLettersSet.has(k.letter) && !k.used && !k.hidden) {
        return { ...k, hidden: true };
      }
      return k;
    }));

    setHasUsedClean(true);
    updateCoins(-15);
  };

  // Helper 3: SKIP
  const handleSkipWord = () => {
    if (!currentWord) return;
    updateScoreAndStreak(0, false); // reset streak
    handleNextWord();
  };

  // Load next word
  const handleNextWord = () => {
    if (currentWordIdx + 1 < gameWords.length) {
      setCurrentWordIdx(prev => prev + 1);
    } else {
      // Loop or finish
      setGameState('completed');
    }
  };

  return (
    <div className="w-full max-w-5xl mx-auto py-1 space-y-6" id="four-pics-main">
      
      {/* Header bar */}
      {gameState === 'playing' && currentWord && (
        <div className={`flex flex-col sm:flex-row items-center justify-between gap-4 border p-4 rounded-2xl shrink-0 transition-all ${
          isLight ? 'bg-white border-slate-200 shadow-sm' : 'bg-slate-900/60 border-slate-800 shadow-xl'
        }`} id="four-pics-header">
          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              className={`flex items-center gap-1.5 text-xs font-bold transition py-1.5 px-3 border rounded-xl cursor-pointer ${
                isLight ? 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-105' : 'bg-slate-800 border-slate-700/60 text-slate-400 hover:text-white'
              }`}
            >
              <ArrowLeft size={13} />
              Trang chủ
            </button>
            
            <div className="flex items-center gap-1.5 px-3 py-1 bg-sky-500/10 border border-sky-500/20 text-sky-400 text-[11px] font-extrabold rounded-full uppercase tracking-wider">
              <Gamepad2 size={13} />
              <span>4 Pics 1 Word</span>
            </div>
          </div>

          {/* Stats Row */}
          <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-6">
            <div className={`flex items-center gap-1.5 py-1.5 px-3 rounded-xl border ${
              isLight ? 'bg-slate-50 border-slate-200 text-slate-800' : 'bg-slate-950/60 border-slate-800 text-white'
            }`}>
              <Trophy size={13} className="text-amber-400" />
              <span className={`text-[10px] font-bold uppercase tracking-wider ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>Điểm:</span>
              <span className={`text-xs font-mono font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>{score}</span>
            </div>

            <div className={`flex items-center gap-1.5 py-1.5 px-3 rounded-xl border ${
              isLight ? 'bg-slate-50 border-slate-200 text-slate-800' : 'bg-slate-950/60 border-slate-800 text-white'
            }`}>
              <Flame size={13} className="text-rose-500 animate-pulse" fill="currentColor" />
              <span className={`text-[10px] font-bold uppercase tracking-wider ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>Chuỗi:</span>
              <span className={`text-xs font-mono font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>{streak}</span>
            </div>

            <div className={`flex items-center gap-1.5 py-1.5 px-3 rounded-xl border ${
              isLight ? 'bg-slate-50 border-slate-200 text-slate-800' : 'bg-slate-950/60 border-slate-850'
            }`}>
              <Coins size={13} className="text-yellow-400 animate-spin" />
              <span className={`text-[10px] font-bold uppercase tracking-wider ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>Xu:</span>
              <span className="text-xs font-mono font-bold text-yellow-400">{coins} 🪙</span>
            </div>

            <div className="text-xs font-bold uppercase font-mono bg-sky-500/15 text-sky-300 py-1 px-2.5 rounded-lg border border-sky-500/20">
              Từ {currentWordIdx + 1}/{gameWords.length}
            </div>
          </div>
        </div>
      )}

      <AnimatePresence mode="wait">
         {gameState === 'setup' && (
          <motion.div
            key="setup-screen"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            className={`p-6 sm:p-8 rounded-3xl relative overflow-hidden text-center space-y-6 shadow-xl border transition-all ${
              isLight
                ? 'bg-gradient-to-br from-amber-50 to-orange-50/30 border-amber-100/70 text-slate-800 shadow-sm'
                : 'bg-slate-900/40 border-slate-800/80 text-white shadow-xl'
            }`}
          >
            {/* Back Button */}
            <button
              onClick={onBack}
              className={`absolute top-4 left-4 p-2 rounded-xl transition cursor-pointer z-50 ${
                isLight ? 'text-slate-550 hover:bg-amber-100/50' : 'text-slate-400 hover:bg-slate-800/50'
              }`}
            >
              <ArrowLeft size={16} />
            </button>

            {/* Ambient glows */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-sky-500/5 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute bottom-0 left-0 w-64 h-64 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />

            {/* Config Box */}
            <div className="max-w-2xl mx-auto flex flex-col gap-5 text-left w-full relative">
              
              {/* Difficulty/Level selection */}
              <div className="space-y-2.5">
                <p className={`text-[11px] font-black uppercase tracking-wider flex items-center gap-1.5 ${isLight ? 'text-slate-700' : 'text-slate-350'}`}>
                  <span>📊</span>
                  <span>Chọn Cấp độ (CEFR)</span>
                </p>
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    onClick={() => { setLevelFilter('all'); }}
                    className={`py-3 px-3 rounded-2xl text-xs sm:text-sm font-extrabold border transition-all duration-150 cursor-pointer shadow-sm flex items-center justify-center gap-1.5 select-none active:scale-[0.97] text-center leading-normal col-span-2 ${
                      levelFilter === 'all'
                        ? 'bg-amber-500 border-amber-600 text-white shadow-md font-black scale-[1.02]'
                        : isLight
                          ? 'bg-white border-slate-200 text-slate-755 hover:bg-slate-50 hover:border-slate-300'
                          : 'bg-[#18282f] border-[#243e49] text-slate-300 hover:bg-[#20353f] hover:border-[#2f515e]'
                    }`}
                  >
                    🌟 Tất cả cấp độ
                  </button>
                  {levels.filter(lvl => lvl !== 'all').map(lvl => (
                    <button
                      key={lvl}
                      onClick={() => { setLevelFilter(lvl); }}
                      className={`py-3 px-3 rounded-2xl text-xs sm:text-sm font-extrabold border transition-all duration-150 cursor-pointer shadow-sm flex items-center justify-center gap-1.5 select-none active:scale-[0.97] text-center leading-normal ${
                        levelFilter === lvl
                          ? 'bg-amber-500 border-amber-600 text-white shadow-md font-black scale-[1.02]'
                          : isLight
                            ? 'bg-white border-slate-200 text-slate-755 hover:bg-slate-50 hover:border-slate-300'
                            : 'bg-[#18282f] border-[#243e49] text-slate-300 hover:bg-[#20353f] hover:border-[#2f515e]'
                      }`}
                    >
                      {lvl}
                    </button>
                  ))}
                </div>
              </div>

              {/* Category selector */}
              <div className="space-y-2.5 relative z-30">
                <p className={`text-[11px] font-black uppercase tracking-wider flex items-center gap-1.5 ${isLight ? 'text-slate-700' : 'text-slate-350'}`}>
                  <span>🗂️</span>
                  <span>Chọn Chủ đề</span>
                </p>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => {
                      setCategoryDropdownOpen(open => !open);
                    }}
                    className={`group flex w-full min-h-[54px] items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left shadow-lg transition-all duration-200 active:scale-[0.99] cursor-pointer ${
                      categoryFilter === 'all'
                        ? 'border-amber-500 bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-amber-500/20 shadow-md'
                        : isLight
                          ? 'border-slate-200 bg-white text-slate-900 shadow-sm hover:border-amber-450 hover:bg-amber-50/20'
                          : 'border-amber-500/30 bg-[#1e2d33] text-white shadow-black/20 hover:border-amber-400/50 hover:bg-[#243941]'
                    }`}
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl text-lg ${
                        categoryFilter === 'all'
                          ? 'bg-white/20'
                          : isLight ? 'bg-amber-100 text-amber-700' : 'bg-amber-400/10 text-amber-400'
                      }`}>
                        {categoryFilter === 'all' ? '🌟' : getCategoryEmoji(categoryFilter)}
                      </span>
                      <span className="min-w-0">
                        <span className={`block text-[10px] font-black uppercase tracking-[0.18em] ${
                          categoryFilter === 'all'
                            ? 'text-white/75'
                            : isLight ? 'text-amber-600' : 'text-amber-400'
                        }`}>
                          Chủ đề
                        </span>
                        <span className="block truncate text-sm font-black sm:text-base">
                          {categoryFilter === 'all' ? 'Tất cả chủ đề' : categoryFilter}
                        </span>
                      </span>
                    </span>
                    <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl transition ${
                      categoryFilter === 'all'
                        ? 'bg-white/20 text-white'
                        : isLight ? 'bg-slate-100 text-slate-600 group-hover:bg-amber-100' : 'bg-white/10 text-amber-200'
                    }`}>
                      <ChevronDown className={`h-5 w-5 transition-transform duration-200 ${categoryDropdownOpen ? 'rotate-180' : ''}`} />
                    </span>
                  </button>

                  <AnimatePresence>
                    {categoryDropdownOpen && (
                      <motion.div
                        initial={{ opacity: 0, y: -8, scale: 0.98 }}
                        animate={{ opacity: 1, y: 8, scale: 1 }}
                        exit={{ opacity: 0, y: -8, scale: 0.98 }}
                        transition={{ duration: 0.18, ease: 'easeOut' }}
                        className={`absolute left-0 right-0 top-full z-40 overflow-hidden rounded-2xl border shadow-2xl ${
                          isLight
                            ? 'border-amber-100 bg-white/95 shadow-amber-900/10'
                            : 'border-amber-500/25 bg-[#0f2228]/95 shadow-black/45'
                        } backdrop-blur-xl`}
                        role="listbox"
                      >
                        <div className="max-h-56 overflow-y-auto p-2 custom-scrollbar">
                          {categories.map((cat) => {
                            const isSelected = categoryFilter === cat;
                            return (
                              <button
                                key={cat}
                                type="button"
                                onClick={() => {
                                  setCategoryFilter(cat);
                                  setCategoryDropdownOpen(false);
                                }}
                                className={`flex min-h-[44px] w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left transition active:scale-[0.98] cursor-pointer ${
                                  isSelected
                                    ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-md'
                                    : isLight
                                      ? 'text-slate-700 hover:bg-amber-50 hover:text-amber-800'
                                      : 'text-slate-200 hover:bg-amber-400/10 hover:text-white'
                                }`}
                              >
                                <span className="flex min-w-0 items-center gap-2.5">
                                  <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg text-base ${
                                    isSelected ? 'bg-white/20' : isLight ? 'bg-slate-100' : 'bg-white/10'
                                  }`}>
                                    {cat === 'all' ? '🌟' : getCategoryEmoji(cat)}
                                  </span>
                                  <span className="truncate text-xs font-black sm:text-sm">
                                    {cat === 'all' ? 'Tất cả chủ đề' : cat}
                                  </span>
                                </span>
                                {isSelected && <Check className="h-4 w-4 shrink-0" />}
                              </button>
                            );
                          })}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </div>

            {/* Word count indicator */}
            <p className={`text-center text-xs font-extrabold mt-1 ${eligibleWordsCount > 5 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
              {eligibleWordsCount > 0
                ? `✨ ${eligibleWordsCount} từ sẵn sàng học!`
                : `⚠️ Không tìm thấy từ nào — thử đổi bộ lọc.`}
            </p>

            {/* CTA Start */}
            <div className="pt-2">
              <button
                onClick={eligibleWordsCount > 0 ? handleStartGame : undefined}
                disabled={eligibleWordsCount === 0}
                className={`w-full min-h-[50px] sm:min-h-[54px] text-white rounded-2xl font-black text-xs sm:text-sm uppercase border-b-4 transition-all duration-150 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed hover:scale-[1.01] active:scale-[0.98] cursor-pointer bg-red-500 border-red-700 hover:bg-red-400`}
              >
                <Play size={14} className="fill-current" />
                Bắt đầu chơi!
              </button>
            </div>
          </motion.div>
        )}

        {/* ACTIVE GAMEPLAY SCREEN */}
        {gameState === 'playing' && currentWord && (
          <motion.div
            key="gameplay-screen"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="grid grid-cols-1 md:grid-cols-12 gap-6 items-stretch"
          >
            {/* Left 5 cols: The 4 square images grid */}
            <div className={`md:col-span-5 flex flex-col justify-between border rounded-3xl p-4 shadow-xl relative min-h-[380px] transition-all ${
              isLight ? 'bg-white border-slate-200' : 'bg-slate-950/60 border-slate-800'
            }`}>
              
              {imagesLoading ? (
                // Skeletons
                <div className="grid grid-cols-2 gap-3 aspect-square w-full">
                  {[1, 2, 3, 4].map(n => (
                    <div key={n} className={`border rounded-2xl animate-pulse flex items-center justify-center ${
                      isLight ? 'bg-slate-100 border-slate-200' : 'bg-slate-900 border-slate-800'
                    }`}>
                      <Loader2 className={`animate-spin ${isLight ? 'text-slate-400' : 'text-slate-700'}`} size={20} />
                    </div>
                  ))}
                </div>
              ) : (
                // Image Grid
                <div className="grid grid-cols-2 gap-3 aspect-square w-full">
                  {loadedImages.map((src, idx) => (
                    <motion.div
                      key={idx}
                      whileHover={{ scale: 1.02, rotate: idx % 2 === 0 ? 0.5 : -0.5 }}
                      onClick={() => setActiveZoomImage(src)}
                      className={`border rounded-2xl overflow-hidden cursor-pointer relative group shadow-md transition ${
                        isLight ? 'bg-slate-100 border-slate-200' : 'bg-slate-900 border-slate-800'
                      }`}
                    >
                      <img
                        src={src}
                        alt={`Pic ${idx + 1} for target word`}
                        referrerPolicy="no-referrer"
                        onError={(e) => {
                          e.currentTarget.onerror = null; // Prevent infinite fallback loops
                          // Try Flickr fallback if first one failed
                          e.currentTarget.src = `https://loremflickr.com/350/350/${encodeURIComponent(currentWord.word.toLowerCase())}?lock=${(idx + 1) * 33}`;
                        }}
                        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                      <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition duration-150 flex items-center justify-center">
                        <Eye size={18} className="text-white drop-shadow" />
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}

              {/* Tiny Instruction */}
              <div className="mt-3 text-center">
                <p className={`text-[10px] font-semibold ${isLight ? 'text-slate-500' : 'text-slate-500'}`}>
                  💡 Nhấn vào bất kỳ ảnh nào để phóng to xem chi tiết chi tiết hơn.
                </p>
              </div>
            </div>

            {/* Right 7 cols: Interactive game letters and guess blanks */}
            <div className={`md:col-span-7 flex flex-col justify-between border rounded-3xl p-6 shadow-xl min-h-[380px] transition-all ${
              isLight ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
            }`}>
              
              {/* Category & level pill info */}
              <div className={`flex items-center justify-between border-b pb-3 mb-4 ${
                isLight ? 'border-slate-150' : 'border-slate-850'
              }`}>
                <span className={`text-[10px] font-mono font-bold px-2.5 py-1 rounded-md border ${
                  isLight ? 'bg-slate-100 text-slate-700 border-slate-200' : 'bg-slate-950/60 text-slate-400 border-slate-850'
                }`}>
                  CHỦ ĐỀ: {currentWord.category.toUpperCase()}
                </span>
                <span className="text-[10px] font-mono text-emerald-650 dark:text-emerald-400 font-extrabold bg-emerald-500/10 px-2.5 py-1 rounded-md border border-emerald-500/20">
                  CEFR: {currentWord.level}
                </span>
              </div>

              {/* Guesses blanks row */}
              <div className="flex flex-col items-center justify-center space-y-6 py-6 my-auto">
                
                {/* Shake container for incorrect guesses */}
                <div 
                  className={`flex flex-wrap items-center justify-center gap-2 ${
                    isIncorrectShake ? 'animate-bounce border-red-500' : ''
                  }`}
                >
                  {userGuesses.map((guess, index) => {
                    const hasLetter = guess.letter !== '';
                    return (
                      <motion.button
                        key={index}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => handleRemoveGuessLetter(index)}
                        className={`w-10 h-10 md:w-12 md:h-12 rounded-xl text-sm md:text-base font-black flex items-center justify-center transition-all ${
                          isCorrect
                            ? 'bg-emerald-500 border-emerald-400 text-white shadow-lg shadow-emerald-500/20'
                            : isIncorrectShake
                            ? 'bg-rose-500/20 border-rose-500 text-rose-600 dark:text-rose-400 ring-2 ring-rose-500'
                            : hasLetter
                            ? isLight
                              ? 'bg-sky-50 border-sky-400 text-sky-600 shadow-sm'
                              : 'bg-slate-850 border-sky-400/80 text-sky-400 shadow-md shadow-sky-500/5'
                            : isLight
                            ? 'bg-slate-50 border-slate-250 text-slate-400 hover:border-slate-350'
                            : 'bg-slate-950/60 border-slate-800 text-slate-600 hover:border-slate-700'
                        } border-2 cursor-pointer`}
                      >
                        {guess.letter}
                      </motion.button>
                    );
                  })}
                </div>

                {isIncorrectShake && (
                  <p className="text-[11px] text-rose-550 dark:text-rose-400 font-extrabold uppercase tracking-wide animate-pulse">
                    ⚠️ Từ ghép chưa chính xác, hãy kiểm tra lại nhé!
                  </p>
                )}
              </div>

              {/* Helpers Row & Letters Keyboard Pool */}
              <div className="space-y-4">
                
                {/* Helper buttons */}
                {!isCorrect && (
                  <div className={`grid grid-cols-3 gap-2.5 border-t pt-4 ${isLight ? 'border-slate-150' : 'border-slate-850'}`}>
                    {/* HINT */}
                    <button
                      onClick={handleUseHint}
                      disabled={coins < 10}
                      className={`py-2 px-3 rounded-xl disabled:opacity-40 border text-[10px] font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                        isLight 
                          ? 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700 shadow-sm' 
                          : 'bg-slate-955 hover:bg-slate-850 border border-slate-800 text-slate-200'
                      }`}
                    >
                      <Sparkles size={11} className="text-yellow-500" />
                      Gợi ý (10 🪙)
                    </button>

                    {/* CLEAN */}
                    <button
                      onClick={handleUseClean}
                      disabled={coins < 15 || hasUsedClean}
                      className={`py-2 px-3 rounded-xl disabled:opacity-40 border text-[10px] font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                        isLight 
                          ? 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700 shadow-sm' 
                          : 'bg-slate-955 hover:bg-slate-850 border border-slate-800 text-slate-200'
                      }`}
                    >
                      <RotateCcw size={11} className="text-rose-500" />
                      Xóa chữ sai (15 🪙)
                    </button>

                    {/* SKIP */}
                    <button
                      onClick={handleSkipWord}
                      className={`py-2 px-3 rounded-xl border text-[10px] font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                        isLight 
                          ? 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-650' 
                          : 'bg-slate-955 hover:bg-slate-850 border border-slate-800 text-slate-400 hover:text-white'
                      }`}
                    >
                      <Zap size={11} className="text-sky-500" />
                      Bỏ qua (Free)
                    </button>
                  </div>
                )}

                {/* Shuffled letters Keyboard pool */}
                <div className="grid grid-cols-6 gap-2.5 pt-2" id="game-keyboard-pool">
                  <AnimatePresence>
                    {keyboardPool.map((item) => {
                      if (item.hidden) return null; // Cleaned letters hide
                      return (
                        <motion.button
                          key={item.id}
                          initial={{ scale: 0.8, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          exit={{ scale: 0.8, opacity: 0 }}
                          disabled={item.used || isCorrect}
                          onClick={() => handleSelectLetter(item)}
                          className={`h-10 rounded-xl text-xs font-bold transition-all uppercase ${
                            item.used
                              ? isLight
                                ? 'bg-slate-100 text-slate-300 border border-slate-200 pointer-events-none'
                                : 'bg-slate-950 text-slate-800 border border-slate-900 pointer-events-none opacity-20'
                              : isLight
                              ? 'bg-slate-50 hover:bg-slate-100 border border-slate-250 text-slate-800 shadow-sm cursor-pointer hover:border-slate-350'
                              : 'bg-slate-850 hover:bg-slate-750 border border-slate-800/80 text-slate-200 hover:text-white shadow-md cursor-pointer'
                          }`}
                        >
                          {item.letter}
                        </motion.button>
                      );
                    })}
                  </AnimatePresence>
                </div>

              </div>

            </div>
          </motion.div>
        )}

        {/* GAME COMPLETED PANEL */}
        {gameState === 'completed' && (
          <motion.div
            key="game-completed"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="bg-slate-900/60 border border-slate-850 p-8 rounded-3xl text-center space-y-6"
          >
            <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-2xl inline-block">
              <Trophy size={40} className="animate-bounce" />
            </div>

            <div className="space-y-1.5">
              <h1 className="text-xl md:text-2xl font-black text-white">CHÚC MỪNG BẠN ĐÃ HOÀN THÀNH BẢN ĐỒ!</h1>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                Bạn đã vượt qua xuất sắc toàn bộ kho từ vựng được chọn trong lượt chơi này của game 4 Hình 1 Từ. Hãy nhận thưởng và tiếp tục vòng đấu mới!
              </p>
            </div>

            {/* Score statistics box */}
            <div className="max-w-md mx-auto grid grid-cols-2 gap-4 bg-slate-950 p-5 rounded-2xl border border-slate-850">
              <div className="text-center">
                <span className="text-[10px] text-slate-500 font-extrabold uppercase tracking-widest block">Xu kiếm được:</span>
                <span className="text-xl font-bold font-mono text-yellow-400">+100 🪙</span>
              </div>
              <div className="text-center border-l border-slate-850">
                <span className="text-[10px] text-slate-500 font-extrabold uppercase tracking-widest block">Tổng điểm số:</span>
                <span className="text-xl font-bold font-mono text-white">{score} điểm</span>
              </div>
            </div>

            <div className="pt-2 flex justify-center gap-3">
              <button
                onClick={() => {
                  updateCoins(100);
                  setGameState('setup');
                }}
                className="py-3 px-8 bg-sky-500 hover:bg-sky-400 text-white rounded-xl text-xs font-bold transition shadow-lg shadow-sky-500/10 cursor-pointer"
              >
                Nhận thưởng & Chơi tiếp
              </button>
              <button
                onClick={onBack}
                className="py-3 px-8 bg-slate-850 hover:bg-slate-750 border border-slate-800 text-slate-300 rounded-xl text-xs font-bold transition cursor-pointer"
              >
                Quay lại Trang chủ
              </button>
            </div>
          </motion.div>
        )}

      </AnimatePresence>

      {/* CORRECT EXQUISITE MODAL OVERLAY IN-GAME (Vocabulary reinforcement) */}
      <AnimatePresence>
        {isCorrect && currentWord && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-950/90 flex items-center justify-center p-4 z-50 overflow-y-auto"
          >
            <motion.div
              initial={{ scale: 0.95, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 15 }}
              className="bg-slate-900 border border-slate-800 w-full max-w-xl p-6 rounded-3xl space-y-5 shadow-2xl relative"
            >
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-emerald-500 border-4 border-slate-900 px-4 py-1 rounded-full text-[10px] font-black text-white uppercase tracking-wider animate-pulse flex items-center gap-1 shadow-lg">
                <Check size={11} strokeWidth={3} />
                Chính xác! (+15 Xu 🪙)
              </div>

              {/* Dynamic decorative star rings */}
              <div className="text-center pt-2">
                <span className="text-3xl">🎉</span>
                <h2 className="text-2xl font-black text-white uppercase tracking-tight mt-1">{currentWord.word}</h2>
                {currentWord.ipa && (
                  <p className="text-xs font-mono text-sky-400 mt-1">{currentWord.ipa}</p>
                )}
              </div>

              {/* Word Details reinforcement card */}
              <div className="bg-slate-950/60 p-4.5 rounded-2xl border border-slate-850/80 space-y-3.5 text-left">
                <div className="flex items-center gap-2 border-b border-slate-850 pb-2">
                  <span className="p-1.5 bg-sky-500/10 text-sky-400 rounded-lg text-xs">
                    <Info size={14} />
                  </span>
                  <div>
                    <span className="text-[10px] text-slate-500 font-extrabold uppercase tracking-wider block">Nghĩa tiếng Việt:</span>
                    <p className="text-xs font-bold text-emerald-400">{currentWord.vietnamese}</p>
                  </div>
                </div>

                {currentWord.definition && (
                  <div className="space-y-1">
                    <span className="text-[10px] text-slate-500 font-extrabold uppercase tracking-wider block">Định nghĩa từ vựng:</span>
                    <p className="text-xs text-slate-300 leading-normal">{currentWord.definition}</p>
                  </div>
                )}

                {currentWord.example && (
                  <div className="space-y-1 bg-slate-900/40 p-3 rounded-xl border border-slate-850">
                    <span className="text-[10px] text-sky-400 font-extrabold uppercase tracking-wider block">Ví dụ minh họa:</span>
                    <p className="text-xs text-slate-200 italic">"{currentWord.example}"</p>
                    {currentWord.exampleTranslation && (
                      <p className="text-[11px] text-slate-400 mt-1">{currentWord.exampleTranslation}</p>
                    )}
                  </div>
                )}
              </div>

              {/* TTS Action */}
              <div className="flex items-center justify-between gap-4">
                <button
                  onClick={() => speakWord(currentWord.word)}
                  className="flex items-center gap-1.5 text-[11px] font-bold text-sky-400 hover:text-sky-300 transition-colors py-1.5 px-3 bg-slate-950/60 rounded-xl border border-slate-850"
                >
                  <Volume2 size={13} />
                  Phát âm chuẩn giọng Mỹ
                </button>

                <button
                  onClick={handleNextWord}
                  className="py-3 px-6 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white font-extrabold text-xs tracking-wider uppercase flex items-center gap-1 transition-all shadow-md shadow-emerald-500/10 active:scale-95 cursor-pointer"
                >
                  Tiếp tục
                  <ArrowRight size={13} />
                </button>
              </div>

            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* FULL SCREEN PHOTO ZOOM VIEWER */}
      <AnimatePresence>
        {activeZoomImage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setActiveZoomImage(null)}
            className="fixed inset-0 bg-slate-950/95 flex items-center justify-center p-4 z-50 cursor-zoom-out"
          >
            <button
              onClick={() => setActiveZoomImage(null)}
              className="absolute top-4 right-4 p-2 bg-slate-900 hover:bg-slate-800 text-white rounded-full border border-slate-800 transition"
            >
              <X size={18} />
            </button>
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              className="max-w-2xl max-h-[80vh] rounded-3xl overflow-hidden border border-slate-800"
            >
              <img
                src={activeZoomImage}
                alt="Full preview zoomed in"
                referrerPolicy="no-referrer"
                onError={(e) => {
                  e.currentTarget.onerror = null;
                  e.currentTarget.src = `https://loremflickr.com/350/350/${encodeURIComponent(currentWord?.word?.toLowerCase() || "word")}?lock=99`;
                }}
                className="w-full h-full object-contain"
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
