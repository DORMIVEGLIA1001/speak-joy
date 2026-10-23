import React, { useState, useEffect, useRef } from 'react';
import { Type, Volume2, Smile, Sparkles, BookOpen, Star, X, CheckCircle2, RotateCcw, Mic, MicOff } from 'lucide-react';
import { playAppSound, playCorrectSound, playIncorrectSound } from '../data';
import { cacheTtsAudio, prefetchStaticVocabAudio, readCachedTtsAudio } from '../lib/ttsCache';
import FallbackChallenge from './games/FallbackChallenge';
import { recordWordAnswer, loadSrsStore } from '../lib/spaceRepetition';
import { ALPHABET_DATA } from '../lib/alphabetData';
import { shuffleArray } from '../lib/shuffle';

interface AlphabetCard {
  letter: string;
  letterIPA: string;
  word: string;
  vietnamese: string;
  emoji: string;
  phonics: string; // IPA of the word
}

interface IPACard {
  ipa: string;                // Sound symbol, e.g. "/i:/"
  type: 'vowel' | 'diphthong' | 'consonant';
  categoryName: string;       // Category description, e.g. "Nguyên âm dài"
  soundTrigger: string;       // Best representation for high-fidelity TTS phonic synthesis
  word: string;               // Illustrative word, e.g. "Sheep"
  vietnamese: string;         // Vietnamese word, e.g. "Con cừu"
  emoji: string;              // Cute cartoon emoji, e.g. "🐑"
  wordPhonics: string;        // IPA of the word, e.g. "/ʃiːp/"
  mouthTip: string;           // Mouth shape tip in Vietnamese
}

type FlashDeck = 'alphabet' | 'ipa' | 'words';
type WordLevel = 'kids' | 'A1' | 'A2' | 'B1' | 'B2';

interface VocabularyWordCard {
  id: string;
  word: string;
  vietnamese: string;
  ipa: string;
  emoji: string;
  category: string;
  level: WordLevel;
  definition?: string;
  example?: string;
  exampleTranslation?: string;
}

interface AlphabetTabProps {
  globalLang: 'en' | 'vi';
  currentChild?: { id: string; name: string; age?: number } | null;
}

export default function AlphabetTab({ globalLang, currentChild = null }: AlphabetTabProps) {
  const [activeTabMode, setActiveTabMode] = useState<'alphabet' | 'ipa' | 'flashcard' | 'voice-practice'>('alphabet');
  const [practiceIndex, setPracticeIndex] = useState(0);
  const [practiceStatus, setPracticeStatus] = useState<'idle' | 'listening' | 'correct' | 'wrong' | 'fallback'>('idle');
  const [practiceAttempts, setPracticeAttempts] = useState(0);
  const [practiceHeardText, setPracticeHeardText] = useState('');
  const practiceRecognitionRef = useRef<any>(null);
  const [activeLetter, setActiveLetter] = useState<string | null>(null);
  const [detailLetter, setDetailLetter] = useState<string | null>(null);
  const [activePhoneme, setActivePhoneme] = useState<string | null>(null);
  const [ipaFilter, setIpaFilter] = useState<'all' | 'vowel' | 'diphthong' | 'consonant'>('all');
  const [favoriteLetters, setFavoriteLetters] = useState<Set<string>>(new Set());
  const [favoriteSounds, setFavoriteSounds] = useState<Set<string>>(new Set());
  const [reviewFavoritesOnly, setReviewFavoritesOnly] = useState(false);
  const [reviewLetters, setReviewLetters] = useState<string[]>([]);
  const [reviewIndex, setReviewIndex] = useState(0);
  const [reviewDraft, setReviewDraft] = useState<string | null>(null);
  const [reviewAnswer, setReviewAnswer] = useState<string | null>(null);
  const [reviewScore, setReviewScore] = useState(0);
  const [reviewFinished, setReviewFinished] = useState(false);
  const [reviewIpaFavoritesOnly, setReviewIpaFavoritesOnly] = useState(false);
  const [reviewSounds, setReviewSounds] = useState<string[]>([]);
  const [reviewIpaIndex, setReviewIpaIndex] = useState(0);
  const [reviewIpaDraft, setReviewIpaDraft] = useState<string | null>(null);
  const [reviewIpaAnswer, setReviewIpaAnswer] = useState<string | null>(null);
  const [reviewIpaScore, setReviewIpaScore] = useState(0);
  const [reviewIpaFinished, setReviewIpaFinished] = useState(false);
  const [favoritesError, setFavoritesError] = useState<string | null>(null);
  const [ipaFavoritesError, setIpaFavoritesError] = useState<string | null>(null);
  // --- Flashcard (Quizlet-style) mode state ---
  const [flashDeck, setFlashDeck] = useState<FlashDeck>('alphabet');
  const [flashWordLevel, setFlashWordLevel] = useState<WordLevel>('A1');
  const [vocabularyWords, setVocabularyWords] = useState<VocabularyWordCard[]>([]);
  const [vocabularyLoading, setVocabularyLoading] = useState(false);
  const [vocabularyError, setVocabularyError] = useState<string | null>(null);
  const [kidsWordsCompleted, setKidsWordsCompleted] = useState(false);
  const [flashOrder, setFlashOrder] = useState<number[]>([]);
  const [flashPos, setFlashPos] = useState(0);
  const [flashFlipped, setFlashFlipped] = useState(false);
  const [flashKnown, setFlashKnown] = useState<Set<number>>(new Set());
  const [flashLearning, setFlashLearning] = useState<Set<number>>(new Set());
  const [flashFinished, setFlashFinished] = useState(false);
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    return (localStorage.getItem('app_theme') as 'dark' | 'light') || 'dark';
  });

  useEffect(() => {
    const handleThemeChange = () => {
      setTheme((localStorage.getItem('app_theme') as 'dark' | 'light') || 'dark');
    };
    window.addEventListener('theme-changed', handleThemeChange);
    window.addEventListener('storage', handleThemeChange);
    return () => {
      window.removeEventListener('theme-changed', handleThemeChange);
      window.removeEventListener('storage', handleThemeChange);
    };
  }, []);

  const isLight = theme === 'light';
  const childAge = Number(currentChild?.age || 0);
  const isKidsIntroAge = childAge >= 4 && childAge < 6;
  const isAgeSix = childAge === 6;
  const kidsWordsCompletedStorageKey = `speakjoy_kids_words_completed_${currentChild?.id || 'guest'}`;
  const ipaFavoritesStorageKey = `ipa_favorites_${currentChild?.id || 'guest'}`;


  useEffect(() => {
    const completed = localStorage.getItem(kidsWordsCompletedStorageKey) === 'true';
    setKidsWordsCompleted(completed);
    if (isKidsIntroAge) {
      setFlashWordLevel(completed ? 'A1' : 'kids');
    }
  }, [currentChild?.id, isKidsIntroAge, kidsWordsCompletedStorageKey]);
  useEffect(() => {
    setReviewFavoritesOnly(false);
    setFavoritesError(null);
    if (!currentChild) {
      setFavoriteLetters(new Set());
      return;
    }
    let cancelled = false;
    void fetch(`/api/children/${currentChild.id}/letter-favorites`, { credentials: 'include' })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload?.message || 'Unable to load favorite letters.');
        if (!cancelled) setFavoriteLetters(new Set(payload?.data?.letters || payload?.letters || []));
      })
      .catch((error) => {
        if (!cancelled) setFavoritesError(error instanceof Error ? error.message : 'Unable to load favorite letters.');
      });
    return () => { cancelled = true; };
  }, [currentChild?.id]);

  useEffect(() => {
    setReviewIpaFavoritesOnly(false);
    setIpaFavoritesError(null);
    if (!currentChild) {
      setFavoriteSounds(new Set());
      return;
    }
    let cancelled = false;
    void fetch(`/api/children/${currentChild.id}/ipa-favorites`, { credentials: 'include' })
      .then(async (response) => {
        if (!response.ok) {
          const cached = JSON.parse(localStorage.getItem(ipaFavoritesStorageKey) || '[]');
          if (!cancelled) setFavoriteSounds(new Set(Array.isArray(cached) ? cached : []));
          return;
        }
        const payload = await response.json().catch(() => ({}));
        if (!cancelled) setFavoriteSounds(new Set(payload?.data?.sounds || payload?.sounds || []));
      })
      .catch((error) => {
        const cached = JSON.parse(localStorage.getItem(ipaFavoritesStorageKey) || '[]');
        if (!cancelled) {
          setFavoriteSounds(new Set(Array.isArray(cached) ? cached : []));
          setIpaFavoritesError(null);
        }
      });
    return () => { cancelled = true; };
  }, [currentChild?.id, ipaFavoritesStorageKey]);

  const toggleFavoriteLetter = async (letter: string) => {
    if (!currentChild) {
      setFavoritesError(isEnglish ? 'Select a child before saving letters.' : 'Hãy chọn bé trước khi lưu chữ cái.');
      return;
    }
    const wasFavorite = favoriteLetters.has(letter);
    setFavoriteLetters((current) => {
      const next = new Set(current);
      wasFavorite ? next.delete(letter) : next.add(letter);
      return next;
    });
    setFavoritesError(null);
    try {
      const response = await fetch(`/api/children/${currentChild.id}/letter-favorites/${letter}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ favorite: !wasFavorite }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.message || 'Unable to update favorite letter.');
      setFavoriteLetters(new Set(payload?.data?.letters || payload?.letters || []));
    } catch (error) {
      setFavoriteLetters((current) => {
        const next = new Set(current);
        wasFavorite ? next.add(letter) : next.delete(letter);
        return next;
      });
      setFavoritesError(error instanceof Error ? error.message : 'Unable to update favorite letter.');
    }
  };
  const isEnglish = globalLang === 'en';

  const normalizeWordLevel = (value: unknown): WordLevel => {
    const normalized = String(value || 'A1').trim().toUpperCase();
    if (normalized === 'KIDS') return 'kids';
    return normalized === 'A2' || normalized === 'B1' || normalized === 'B2' ? normalized : 'A1';
  };

  const normalizeVocabularyWord = (value: any): VocabularyWordCard | null => {
    const word = String(value?.word || '').trim();
    const vietnamese = String(value?.vietnamese || '').trim();
    if (!word || !vietnamese) return null;
    return {
      id: String(value?.id || `${word}-${value?.category || 'General'}`),
      word,
      vietnamese,
      ipa: String(value?.ipa || ''),
      emoji: String(value?.emoji || value?.icon || '📘'),
      category: String(value?.category || 'General'),
      level: normalizeWordLevel(value?.level),
      definition: value?.definition ? String(value.definition) : undefined,
      example: value?.example ? String(value.example) : undefined,
      exampleTranslation: value?.exampleTranslation || value?.example_translation ? String(value.exampleTranslation || value.example_translation) : undefined,
    };
  };

  useEffect(() => {
    if (!currentChild?.id) {
      setVocabularyWords([]);
      setVocabularyError(null);
      setVocabularyLoading(false);
      return;
    }
    let cancelled = false;
    setVocabularyLoading(true);
    setVocabularyError(null);
    void fetch(`/api/children/${currentChild.id}/game-flashcards`, { credentials: 'include' })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload?.message || 'Unable to load vocabulary words.');
        const rawWords = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : [];
        const normalizedWords = rawWords
          .map(normalizeVocabularyWord)
          .filter((word): word is VocabularyWordCard => Boolean(word));
        if (!cancelled) {
          setVocabularyWords(normalizedWords);
          setVocabularyError(null);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setVocabularyWords([]);
          setVocabularyError(error instanceof Error ? error.message : 'Unable to load vocabulary words.');
        }
      })
      .finally(() => {
        if (!cancelled) setVocabularyLoading(false);
      });
    return () => { cancelled = true; };
  }, [currentChild?.id]);

  const toggleFavoriteSound = async (sound: string) => {
    if (!currentChild) {
      setIpaFavoritesError(isEnglish ? 'Select a child before saving IPA sounds.' : 'Hãy chọn bé trước khi lưu âm IPA.');
      return;
    }
    const wasFavorite = favoriteSounds.has(sound);
    setFavoriteSounds((current) => {
      const next = new Set(current);
      wasFavorite ? next.delete(sound) : next.add(sound);
      localStorage.setItem(ipaFavoritesStorageKey, JSON.stringify([...next]));
      return next;
    });
    setIpaFavoritesError(null);
    try {
      const response = await fetch(`/api/children/${currentChild.id}/ipa-favorites`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sound, favorite: !wasFavorite }),
      });
      if (!response.ok) {
        return;
      }
      const payload = await response.json().catch(() => ({}));
      setFavoriteSounds(new Set(payload?.data?.sounds || payload?.sounds || []));
      localStorage.setItem(ipaFavoritesStorageKey, JSON.stringify(payload?.data?.sounds || payload?.sounds || []));
    } catch (error) {
      setIpaFavoritesError(null);
    }
  };

  // Complete Alphabet database (A-Z)
  const alphabet: AlphabetCard[] = [
    { letter: 'A', letterIPA: '/eɪ/', word: 'Apple', vietnamese: 'Quả táo', emoji: '🍎', phonics: '/ˈæpl/' },
    { letter: 'B', letterIPA: '/biː/', word: 'Bear', vietnamese: 'Con gấu', emoji: '🐻', phonics: '/beər/' },
    { letter: 'C', letterIPA: '/siː/', word: 'Cat', vietnamese: 'Con mèo', emoji: '🐱', phonics: '/kæt/' },
    { letter: 'D', letterIPA: '/diː/', word: 'Dog', vietnamese: 'Con chó', emoji: '🐶', phonics: '/dɒɡ/' },
    { letter: 'E', letterIPA: '/iː/', word: 'Elephant', vietnamese: 'Con voi', emoji: '🐘', phonics: '/ˈelɪfənt/' },
    { letter: 'F', letterIPA: '/ef/', word: 'Flower', vietnamese: 'Bông hoa', emoji: '🌸', phonics: '/ˈflaʊər/' },
    { letter: 'G', letterIPA: '/dʒiː/', word: 'Giraffe', vietnamese: 'Hươu cao cổ', emoji: '🦒', phonics: '/dʒɪˈrɑːf/' },
    { letter: 'H', letterIPA: '/eɪtʃ/', word: 'House', vietnamese: 'Ngôi nhà', emoji: '🏠', phonics: '/haʊs/' },
    { letter: 'I', letterIPA: '/aɪ/', word: 'Ice cream', vietnamese: 'Kem ly', emoji: '🍦', phonics: '/ˈaɪs kriːm/' },
    { letter: 'J', letterIPA: '/dʒeɪ/', word: 'Jellyfish', vietnamese: 'Con sứa', emoji: '🪼', phonics: '/ˈdʒelɪfɪʃ/' },
    { letter: 'K', letterIPA: '/keɪ/', word: 'Koala', vietnamese: 'Gấu Koala', emoji: '🐨', phonics: '/kəʊˈɑːlə/' },
    { letter: 'L', letterIPA: '/el/', word: 'Lion', vietnamese: 'Sư tử', emoji: '🦁', phonics: '/ˈlaɪən/' },
    { letter: 'M', letterIPA: '/em/', word: 'Monkey', vietnamese: 'Con khỉ', emoji: '🐒', phonics: '/ˈmʌŋki/' },
    { letter: 'N', letterIPA: '/en/', word: 'Nest', vietnamese: 'Tổ chim', emoji: '🪹', phonics: '/nest/' },
    { letter: 'O', letterIPA: '/əʊ/', word: 'Owl', vietnamese: 'Con cú', emoji: '🦉', phonics: '/aʊl/' },
    { letter: 'P', letterIPA: '/piː/', word: 'Penguin', vietnamese: 'Chim cánh cụt', emoji: '🐧', phonics: '/ˈpeŋɡwɪn/' },
    { letter: 'Q', letterIPA: '/kjuː/', word: 'Queen', vietnamese: 'Nữ hoàng', emoji: '👸', phonics: '/kwiːn/' },
    { letter: 'R', letterIPA: '/ɑːr/', word: 'Rabbit', vietnamese: 'Con thỏ', emoji: '🐰', phonics: '/ˈræbɪt/' },
    { letter: 'S', letterIPA: '/es/', word: 'Sun', vietnamese: 'Mặt trời', emoji: '☀️', phonics: '/sʌn/' },
    { letter: 'T', letterIPA: '/tiː/', word: 'Tiger', vietnamese: 'Con hổ', emoji: '🐯', phonics: '/ˈtaɪɡər/' },
    { letter: 'U', letterIPA: '/juː/', word: 'Umbrella', vietnamese: 'Cái ô (dù)', emoji: '☂️', phonics: '/ʌmˈbrelə/' },
    { letter: 'V', letterIPA: '/viː/', word: 'Violin', vietnamese: 'Đàn vĩ cầm', emoji: '🎻', phonics: '/ˌvaɪəˈlɪn/' },
    { letter: 'W', letterIPA: '/ˈdʌbljuː/', word: 'Whale', vietnamese: 'Cá voi', emoji: '🐳', phonics: '/weɪl/' },
    { letter: 'X', letterIPA: '/eks/', word: 'Xylophone', vietnamese: 'Đàn mộc cầm', emoji: '🎹', phonics: '/ˈzaɪləfəʊn/' },
    { letter: 'Y', letterIPA: '/waɪ/', word: 'Yo-yo', vietnamese: 'Yo-yo', emoji: '🪀', phonics: '/ˈjəʊ jəʊ/' },
    { letter: 'Z', letterIPA: '/zed/', word: 'Zebra', vietnamese: 'Ngựa vằn', emoji: '🦓', phonics: '/ˈzebrə/' }
  ];

  const startFavoriteReview = () => {
    if (favoriteLetters.size === 0) return;
    setReviewLetters(shuffleArray([...favoriteLetters]));
    setReviewIndex(0);
    setReviewDraft(null);
    setReviewAnswer(null);
    setReviewScore(0);
    setReviewFinished(false);
    setReviewFavoritesOnly(true);
  };

  const closeFavoriteReview = () => {
    setReviewFavoritesOnly(false);
    setReviewDraft(null);
    setReviewAnswer(null);
    setReviewFinished(false);
  };

  const currentReviewCard = alphabet.find((item) => item.letter === reviewLetters[reviewIndex]) ?? null;
  const reviewOptions = currentReviewCard
    ? Array.from(new Set([
      currentReviewCard.letter,
      alphabet[(alphabet.findIndex((item) => item.letter === currentReviewCard.letter) + 7) % alphabet.length].letter,
      alphabet[(alphabet.findIndex((item) => item.letter === currentReviewCard.letter) + 13) % alphabet.length].letter,
      alphabet[(alphabet.findIndex((item) => item.letter === currentReviewCard.letter) + 19) % alphabet.length].letter,
    ])).sort()
    : [];

  const previewFavoriteReview = (letter: string) => {
    if (!currentReviewCard || reviewAnswer) return;
    setReviewDraft(letter);
    speakAlphabetPhonics(letter, alphabet.find((item) => item.letter === letter)?.word || currentReviewCard.word);
  };

  const confirmFavoriteReview = () => {
    if (!currentReviewCard || reviewAnswer || !reviewDraft) return;
    setReviewAnswer(reviewDraft);
    if (reviewDraft === currentReviewCard.letter) setReviewScore((score) => score + 1);
  };

  const nextFavoriteReviewQuestion = () => {
    if (reviewIndex >= reviewLetters.length - 1) {
      setReviewFinished(true);
      return;
    }
    setReviewIndex((index) => index + 1);
    setReviewDraft(null);
    setReviewAnswer(null);
  };

  const startFavoriteIpaReview = () => {
    if (favoriteSounds.size === 0) return;
    setReviewSounds(shuffleArray([...favoriteSounds]));
    setReviewIpaIndex(0);
    setReviewIpaDraft(null);
    setReviewIpaAnswer(null);
    setReviewIpaScore(0);
    setReviewIpaFinished(false);
    setReviewIpaFavoritesOnly(true);
  };

  const closeFavoriteIpaReview = () => {
    setReviewIpaFavoritesOnly(false);
    setReviewIpaDraft(null);
    setReviewIpaAnswer(null);
    setReviewIpaFinished(false);
  };

  // Comprehensive IPA Phonics guidelines database (Vowels, Diphthongs, Consonants)
  const ipaDatabase: IPACard[] = [
    // --- VOWELS (NGUYÊN ÂM ĐƠN) ---
    {
      ipa: '/i:/',
      type: 'vowel',
      categoryName: 'Nguyên âm dài',
      soundTrigger: 'ee',
      word: 'Sheep',
      vietnamese: 'Con cừu',
      emoji: '🐑',
      wordPhonics: '/ʃiːp/',
      mouthTip: 'Khẩu hình mở như đang cười tươi, môi kéo rộng sang hai bên, phát âm âm "I" kéo dài hơi.'
    },
    {
      ipa: '/ɪ/',
      type: 'vowel',
      categoryName: 'Nguyên âm ngắn',
      soundTrigger: 'ih',
      word: 'Ship',
      vietnamese: 'Tàu thuỷ',
      emoji: '🚢',
      wordPhonics: '/ʃɪp/',
      mouthTip: 'Khẩu hình tự nhiên hơn, môi hơi mở nhẹ, phát âm âm "I" thật nhanh và dứt khoát.'
    },
    {
      ipa: '/u:/',
      type: 'vowel',
      categoryName: 'Nguyên âm dài',
      soundTrigger: 'oo',
      word: 'Shoot',
      vietnamese: 'Bắn súng/Sút bóng',
      emoji: '⚽',
      wordPhonics: '/ʃuːt/',
      mouthTip: 'Môi tròn căng và chu ra phía trước, phát âm âm "U" hơi kéo dài và trầm sâu.'
    },
    {
      ipa: '/ʊ/',
      type: 'vowel',
      categoryName: 'Nguyên âm ngắn',
      soundTrigger: 'u',
      word: 'Book',
      vietnamese: 'Sách đọc',
      emoji: '📖',
      wordPhonics: '/bʊk/',
      mouthTip: 'Khẩu hình thả lỏng, môi hơi tròn, phát âm âm "U" cực kỳ nhanh, dứt khoát dồn hơi bụng.'
    },
    {
      ipa: '/e/',
      type: 'vowel',
      categoryName: 'Nguyên âm ngắn',
      soundTrigger: 'eh',
      word: 'Bed',
      vietnamese: 'Cái giường',
      emoji: '🛏️',
      wordPhonics: '/bed/',
      mouthTip: 'Khẩu hình mở rộng hơn so với âm /ɪ/, khóe môi cười nhẹ, phát âm âm "E" dứt khoát.'
    },
    {
      ipa: '/ə/',
      type: 'vowel',
      categoryName: 'Nguyên âm ngắn (Âm lướt)',
      soundTrigger: 'uh',
      word: 'Banana',
      vietnamese: 'Quả chuối',
      emoji: '🍌',
      wordPhonics: '/bəˈnɑːnə/',
      mouthTip: 'Âm phổ biến nhất! Thả lỏng toàn bộ cơ miệng, lưỡi ở vị trí tự nhiên, phát âm nhẹ nửa âm "Ơ".'
    },
    {
      ipa: '/ɜ:/',
      type: 'vowel',
      categoryName: 'Nguyên âm dài',
      soundTrigger: 'err',
      word: 'Bird',
      vietnamese: 'Con chim',
      emoji: '🐦',
      wordPhonics: '/bɜːd/',
      mouthTip: 'Môi hơi hé mở tròn, lưỡi rụt nhẹ và cong lên về sau, phát âm âm "Ơ" rung trong cổ họng.'
    },
    {
      ipa: '/ɔ:/',
      type: 'vowel',
      categoryName: 'Nguyên âm dài',
      soundTrigger: 'aw',
      word: 'Door',
      vietnamese: 'Cửa ra vào',
      emoji: '🚪',
      wordPhonics: '/dɔːr/',
      mouthTip: 'Tròn môi hết cỡ, hàm dưới hơi hạ, lưỡi lùi về sau, phát âm âm "O" kéo dài thong thả.'
    },
    {
      ipa: '/æ/',
      type: 'vowel',
      categoryName: 'Nguyên âm bẹt (A bẹt)',
      soundTrigger: 'aa',
      word: 'Cat',
      vietnamese: 'Con mèo',
      emoji: '🐱',
      wordPhonics: '/kæt/',
      mouthTip: 'Mở rộng miệng cả chiều dọc lẫn chiều ngang. Lưỡi đặt thấp xuống đáy, phát âm lai "A" và "E".'
    },
    {
      ipa: '/ʌ/',
      type: 'vowel',
      categoryName: 'Nguyên âm ngắn',
      soundTrigger: 'uh',
      word: 'Cup',
      vietnamese: 'Cái cốc tròn',
      emoji: '🥛',
      wordPhonics: '/kʌp/',
      mouthTip: 'Miệng hé tự nhiên, phát âm dứt khoát hơi hóp bụng gần giống chữ "Á" trong Tiếng Việt.'
    },
    {
      ipa: '/ɑ:/',
      type: 'vowel',
      categoryName: 'Nguyên âm dài',
      soundTrigger: 'ah',
      word: 'Car',
      vietnamese: 'Xe ô tô',
      emoji: '🚗',
      wordPhonics: '/kɑːr/',
      mouthTip: 'Khẩu hình tròn mở rộng hơi giống bác sĩ khám họng, hạ giọng trầm ấm, phát âm âm "A" kéo dài.'
    },
    {
      ipa: '/ɒ/',
      type: 'vowel',
      categoryName: 'Nguyên âm ngắn',
      soundTrigger: 'ah',
      word: 'Sock',
      vietnamese: 'Đôi tất chân',
      emoji: '🧦',
      wordPhonics: '/sɒk/',
      mouthTip: 'Tròn môi nhẹ đẩy về trước, lưỡi hạ thấp phát âm âm "O" dứt khoát nhanh gọn.'
    },

    // --- DIPHTHONGS (NGUYÊN ÂM ĐÔI) ---
    {
      ipa: '/ɪə/',
      type: 'diphthong',
      categoryName: 'Nguyên âm đôi',
      soundTrigger: 'ear',
      word: 'Ear',
      vietnamese: 'Cái tai nghe',
      emoji: '👂',
      wordPhonics: '/ɪər/',
      mouthTip: 'Bắt đầu từ âm ngắn /ɪ/ chuyển dần mềm mại sang âm lướt nhẹ /ə/, giống âm "ia".'
    },
    {
      ipa: '/eɪ/',
      type: 'diphthong',
      categoryName: 'Nguyên âm đôi',
      soundTrigger: 'ay',
      word: 'Cake',
      vietnamese: 'Chiếc bánh kem',
      emoji: '🍰',
      wordPhonics: '/keɪk/',
      mouthTip: 'Bắt đầu từ âm /e/, sau đó khép miệng dần kéo khóe môi sang hai bên để lướt sang /ɪ/.'
    },
    {
      ipa: '/ɔɪ/',
      type: 'diphthong',
      categoryName: 'Nguyên âm đôi',
      soundTrigger: 'oy',
      word: 'Toy',
      vietnamese: 'Đồ chơi em bé',
      emoji: '🧸',
      wordPhonics: '/tɔɪ/',
      mouthTip: 'Tròn môi phát âm /ɔ:/ dồn lực lướt dần sang khép khóe môi tạo âm kết thúc /ɪ/.'
    },
    {
      ipa: '/aɪ/',
      type: 'diphthong',
      categoryName: 'Nguyên âm đôi',
      soundTrigger: 'eye',
      word: 'Kite',
      vietnamese: 'Cánh diều',
      emoji: '🪁',
      wordPhonics: '/kaɪt/',
      mouthTip: 'Mở rộng miệng phát âm /ɑ:/ hạ thấp lưỡi rồi thu dần khóe môi lướt sang kết thúc ở âm /ɪ/.'
    },
    {
      ipa: '/əʊ/',
      type: 'diphthong',
      categoryName: 'Nguyên âm đôi',
      soundTrigger: 'oh',
      word: 'Boat',
      vietnamese: 'Thuyền buồm',
      emoji: '⛵',
      wordPhonics: '/bəʊt/',
      mouthTip: 'Bắt đầu từ âm thả lỏng /ə/ rồi khép dần môi chu tròn tinh nghịch để hướng sang /ʊ/.'
    },
    {
      ipa: '/eə/',
      type: 'diphthong',
      categoryName: 'Nguyên âm đôi',
      soundTrigger: 'air',
      word: 'Bear',
      vietnamese: 'Con gấu',
      emoji: '🐻',
      wordPhonics: '/beər/',
      mouthTip: 'Mở môi nhẹ phát âm /e/ sau đó thả lỏng toàn bộ cơ miệng chuyển dần cực nhẹ về /ə/.'
    },
    {
      ipa: '/aʊ/',
      type: 'diphthong',
      categoryName: 'Nguyên âm đôi',
      soundTrigger: 'ow',
      word: 'Cow',
      vietnamese: 'Con bò sữa',
      emoji: '🐄',
      wordPhonics: '/kaʊ/',
      mouthTip: 'Mở miệng phát âm âm /ɑ:/ rộng sau đó thu môi chu tròn dứt khoát lướt nhẹ sang âm /ʊ/.'
    },

    // --- CONSONANTS (PHỤ ÂM QUAN TRỌNG) ---
    {
      ipa: '/p/',
      type: 'consonant',
      categoryName: 'Phụ âm bật hơi vô thanh',
      soundTrigger: 'p',
      word: 'Pen',
      vietnamese: 'Bút mực',
      emoji: '🖋️',
      wordPhonics: '/pen/',
      mouthTip: 'Hai môi mím chặt, nén hơi trong khoang miệng rồi bật mạnh ra hơi gió "p", không rung cổ họng.'
    },
    {
      ipa: '/b/',
      type: 'consonant',
      categoryName: 'Phụ âm hữu thanh',
      soundTrigger: 'b',
      word: 'Ball',
      vietnamese: 'Quả bóng tròn',
      emoji: '⚽',
      wordPhonics: '/bɔːl/',
      mouthTip: 'Mím môi chặt giữ hơi nhẹ rồi bật mạnh hơi dứt khoát chữ "B" có rung dây thanh quản.'
    },
    {
      ipa: '/f/',
      type: 'consonant',
      categoryName: 'Phụ âm xát gió',
      soundTrigger: 'fff',
      word: 'Fish',
      vietnamese: 'Con cá bơi',
      emoji: '🐟',
      wordPhonics: '/fɪʃ/',
      mouthTip: 'Răng cửa hàm trên chạm nhẹ lên môi dưới, thổi luồng hơi mát qua kẽ răng không rung cổ họng.'
    },
    {
      ipa: '/v/',
      type: 'consonant',
      categoryName: 'Phụ âm xát hữu thanh',
      soundTrigger: 'vvv',
      word: 'Van',
      vietnamese: 'Xe tải nhỏ',
      emoji: '🚐',
      wordPhonics: '/væn/',
      mouthTip: 'Vị trí răng chạm môi tương tự âm /f/, thỏi hơi gió mượt mà nhưng rung mạnh dây thanh quản.'
    },
    {
      ipa: '/θ/',
      type: 'consonant',
      categoryName: 'Phụ âm răng-lưỡi (vô thanh)',
      soundTrigger: 'th',
      word: 'Three',
      vietnamese: 'Số ba may mắn',
      emoji: '3️⃣',
      wordPhonics: '/θriː/',
      mouthTip: 'Đặt đầu lưỡi nhẹ nhàng giữa răng cửa hàm trên và dưới, đẩy hơi gió mượt mà không rung cổ họng.'
    },
    {
      ipa: '/ð/',
      type: 'consonant',
      categoryName: 'Phụ âm răng-lưỡi (hữu thanh)',
      soundTrigger: 'the',
      word: 'Mother',
      vietnamese: 'Mẹ yêu kính',
      emoji: '👩',
      wordPhonics: '/ˈmʌðər/',
      mouthTip: 'Vị trí đặt lưỡi giữa khe răng giống âm /θ/ nhưng thổi hơi gió cùng độ rung mạnh ở cổ họng.'
    },
    {
      ipa: '/ʃ/',
      type: 'consonant',
      categoryName: 'Phụ âm xuýt vô thanh',
      soundTrigger: 'shh',
      word: 'Sheep',
      vietnamese: 'Con cừu',
      emoji: '🐑',
      wordPhonics: '/ʃiːp/',
      mouthTip: 'Chu tròn môi hết cỡ đẩy ra trước, thổi luồng hơi gió thật mạnh như đang ra hiệu "Suỵt xì!".'
    },
    {
      ipa: '/ʒ/',
      type: 'consonant',
      categoryName: 'Phụ âm xuýt hữu thanh',
      soundTrigger: 'zh',
      word: 'Television',
      vietnamese: 'Tivi thông minh',
      emoji: '📺',
      wordPhonics: '/ˈtelɪvɪʒn/',
      mouthTip: 'Vị trí chu môi giống âm /ʃ/ nhưng thổi hơi gió đồng thời rung cổ họng thật to và giòn.'
    },
    {
      ipa: '/tʃ/',
      type: 'consonant',
      categoryName: 'Phụ âm bật vô thanh',
      soundTrigger: 'ch',
      word: 'Chair',
      vietnamese: 'Cái ghế gỗ',
      emoji: '🪑',
      wordPhonics: '/tʃeər/',
      mouthTip: 'Chu môi tròn nhẹ hơi nhếch lên, tạo lực bật mạnh dứt khoát tống luồng hơi gió tựa giống "Chờ".'
    },
    {
      ipa: '/dʒ/',
      type: 'consonant',
      categoryName: 'Phụ âm bật hữu thanh',
      soundTrigger: 'j',
      word: 'Juice',
      vietnamese: 'Nước ép trái cây',
      emoji: '🧃',
      wordPhonics: '/dʒuːs/',
      mouthTip: 'Khẩu hình bật hơi giống âm /tʃ/ nhưng hạ sâu quai hàm nhẹ để rung mạnh dây thanh quản cực lớn.'
    },
    {
      ipa: '/k/',
      type: 'consonant',
      categoryName: 'Phụ âm khạc vô thanh',
      soundTrigger: 'k',
      word: 'Key',
      vietnamese: 'Chìa khoá vàng',
      emoji: '🔑',
      wordPhonics: '/kiː/',
      mouthTip: 'Nâng cuống lưỡi chạm ngạc mềm chặn hơi, bật luồng hơi gió ho khạc dứt khoát từ sâu cổ họng.'
    },
    {
      ipa: '/g/',
      type: 'consonant',
      categoryName: 'Phụ âm bật hữu thanh',
      soundTrigger: 'g',
      word: 'Grape',
      vietnamese: 'Chùm nho ngọt',
      emoji: '🍇',
      wordPhonics: '/ɡreɪp/',
      mouthTip: 'Chặn hơi sâu cổ họng tương tự âm /k/ nhưng bật ra tiếng kêu rung dứt khoát giống âm "gờ".'
    }
  ];

  // Alphabet Speech trigger
  const speakAlphabetPhonics = (letter: string, word: string) => {
    setActiveLetter(letter);
    playAppSound(600, 'sine', 0.08);

    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(`${letter}. ${word}`);
      utterance.lang = 'en-US';
      utterance.rate = 0.65;
      window.speechSynthesis.speak(utterance);
    }
  };

  // Speak any word or full sentence at a gentle, kid-friendly rate.
  const speakEnglishText = (text: string) => {
    const trimmed = String(text || '').trim();
    if (!trimmed) return;
    playAppSound(600, 'sine', 0.08);
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(trimmed);
      utterance.lang = 'en-US';
      utterance.rate = 0.7;
      window.speechSynthesis.speak(utterance);
    }
  };

  // Open the rich per-letter detail (words, examples, practice sentences).
  const openLetterDetail = (letter: string) => {
    setDetailLetter(letter);
    setActiveLetter(letter);
    playAppSound(660, 'sine', 0.08);
  };

  const detailLetterData = detailLetter
    ? ALPHABET_DATA.find((entry) => entry.letter === detailLetter) || null
    : null;

  // IPA Phonics teacher logic
  const speakIPASound = (card: IPACard) => {
    setActivePhoneme(card.ipa);
    playAppSound(550, 'triangle', 0.08);

    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();

      const phonemeUtterance = new SpeechSynthesisUtterance(card.soundTrigger);
      phonemeUtterance.lang = 'en-US';
      phonemeUtterance.rate = 0.50;

      window.speechSynthesis.speak(phonemeUtterance);
    }
  };

  const filteredIpaList = ipaDatabase.filter((item) => {
    if (ipaFilter === 'all') return true;
    return item.type === ipaFilter;
  });

  const currentIpaReviewCard = ipaDatabase.find((item) => item.ipa === reviewSounds[reviewIpaIndex]) ?? null;
  const reviewIpaOptions = currentIpaReviewCard
    ? Array.from(new Set([
      currentIpaReviewCard.ipa,
      ipaDatabase[(ipaDatabase.findIndex((item) => item.ipa === currentIpaReviewCard.ipa) + 5) % ipaDatabase.length].ipa,
      ipaDatabase[(ipaDatabase.findIndex((item) => item.ipa === currentIpaReviewCard.ipa) + 11) % ipaDatabase.length].ipa,
      ipaDatabase[(ipaDatabase.findIndex((item) => item.ipa === currentIpaReviewCard.ipa) + 17) % ipaDatabase.length].ipa,
    ])).sort()
    : [];

  const previewFavoriteIpaReview = (ipa: string) => {
    if (reviewIpaAnswer) return;
    setReviewIpaDraft(ipa);
    const selectedCard = ipaDatabase.find((item) => item.ipa === ipa);
    if (selectedCard) {
      speakIPASound(selectedCard);
    }
  };

  const confirmFavoriteIpaReview = () => {
    if (!currentIpaReviewCard || reviewIpaAnswer || !reviewIpaDraft) return;
    setReviewIpaAnswer(reviewIpaDraft);
    if (reviewIpaDraft === currentIpaReviewCard.ipa) setReviewIpaScore((score) => score + 1);
  };

  const nextFavoriteIpaReviewQuestion = () => {
    if (reviewIpaIndex >= reviewSounds.length - 1) {
      setReviewIpaFinished(true);
      return;
    }
    setReviewIpaIndex((index) => index + 1);
    setReviewIpaDraft(null);
    setReviewIpaAnswer(null);
  };

  useEffect(() => {
    if (!reviewIpaFavoritesOnly || !currentIpaReviewCard || reviewIpaFinished) return;
    const timer = window.setTimeout(() => {
      speakIPASound(currentIpaReviewCard);
    }, 180);
    return () => window.clearTimeout(timer);
  }, [reviewIpaFavoritesOnly, reviewIpaIndex, reviewIpaFinished]);

  const filterLabelMap = {
    all: isEnglish ? `All (${ipaDatabase.length})` : `Tất cả (${ipaDatabase.length})`,
    vowel: isEnglish ? 'Monophthongs' : 'Nguyên âm đơn',
    diphthong: isEnglish ? 'Diphthongs' : 'Nguyên âm đôi',
    consonant: isEnglish ? 'Consonants' : 'Phụ âm',
  };

  // --- Flashcard (Quizlet-style) derived data + handlers ---
  const availableFlashWordLevels: WordLevel[] = isKidsIntroAge
    ? (kidsWordsCompleted ? ['kids', 'A1'] : ['kids'])
    : ['A1', 'A2', 'B1', 'B2'];
  const flashVocabularyCards = vocabularyWords.filter((word) => {
    if (flashWordLevel === 'A1' && isAgeSix) return word.level === 'A1' || word.level === 'kids';
    return word.level === flashWordLevel;
  });
  const currentFlashDeckSize = flashDeck === 'alphabet'
    ? alphabet.length
    : flashDeck === 'ipa'
      ? ipaDatabase.length
      : flashVocabularyCards.length;

  const buildFlashOrder = (deck: FlashDeck, shuffle: boolean) => {
    const size = deck === 'alphabet'
      ? alphabet.length
      : deck === 'ipa'
        ? ipaDatabase.length
        : flashVocabularyCards.length;
    const order = Array.from({ length: size }, (_, index) => index);
    return shuffle ? shuffleArray(order) : order;
  };

  const resetFlashSession = (deck: FlashDeck, shuffle = false) => {
    setFlashOrder(buildFlashOrder(deck, shuffle));
    setFlashPos(0);
    setFlashFlipped(false);
    setFlashKnown(new Set());
    setFlashLearning(new Set());
    setFlashFinished(false);
  };

  const flashCardIndex = flashOrder[flashPos] ?? 0;
  const flashAlphabetCard = flashDeck === 'alphabet' ? alphabet[flashCardIndex] : null;
  const flashIpaCard = flashDeck === 'ipa' ? ipaDatabase[flashCardIndex] : null;
  const flashVocabularyCard = flashDeck === 'words' ? flashVocabularyCards[flashCardIndex] : null;

  const speakVocabularyWord = (card: VocabularyWordCard) => {
    playAppSound(620, 'sine', 0.04);
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(card.word);
      utterance.lang = 'en-US';
      utterance.rate = 0.82;
      utterance.pitch = 1.08;
      window.speechSynthesis.speak(utterance);
    }
  };

  const speakFlashCard = () => {
    if (flashAlphabetCard) {
      speakAlphabetPhonics(flashAlphabetCard.letter, flashAlphabetCard.word);
    } else if (flashIpaCard) {
      speakIPASound(flashIpaCard);
    } else if (flashVocabularyCard) {
      speakVocabularyWord(flashVocabularyCard);
    }
  };

  const flipFlashCard = () => {
    playAppSound(500, 'sine', 0.06);
    setFlashFlipped((flipped) => !flipped);
  };

  const advanceFlashCard = () => {
    if (flashPos >= flashOrder.length - 1) {
      setFlashFinished(true);
      return;
    }
    setFlashPos((pos) => pos + 1);
    setFlashFlipped(false);
  };

  const previousFlashCard = () => {
    if (flashPos <= 0) return;
    setFlashPos((pos) => pos - 1);
    setFlashFlipped(false);
  };

  const markFlashCard = (result: 'known' | 'learning') => {
    if (result === 'known') {
      playCorrectSound();
      setFlashKnown((current) => {
        const next = new Set(current).add(flashCardIndex);
        if (flashDeck === 'words' && flashWordLevel === 'kids' && flashVocabularyCards.length > 0 && next.size >= flashVocabularyCards.length) {
          localStorage.setItem(kidsWordsCompletedStorageKey, 'true');
          setKidsWordsCompleted(true);
        }
        return next;
      });
      setFlashLearning((current) => {
        const next = new Set(current);
        next.delete(flashCardIndex);
        return next;
      });
    } else {
      playIncorrectSound();
      setFlashLearning((current) => new Set(current).add(flashCardIndex));
      setFlashKnown((current) => {
        const next = new Set(current);
        next.delete(flashCardIndex);
        return next;
      });
    }
    advanceFlashCard();
  };

  const switchFlashDeck = (deck: FlashDeck) => {
    playAppSound(400, 'sine', 0.08);
    setFlashDeck(deck);
    resetFlashSession(deck, false);
  };

  const switchFlashWordLevel = (level: WordLevel) => {
    playAppSound(420, 'sine', 0.06);
    setFlashWordLevel(level);
    if (flashDeck === 'words') {
      setFlashPos(0);
      setFlashFlipped(false);
      setFlashKnown(new Set());
      setFlashLearning(new Set());
      setFlashFinished(false);
    }
  };

  // Initialize / auto-play whenever the visible flashcard changes
  useEffect(() => {
    if (activeTabMode !== 'flashcard') return;
    if (flashOrder.length === 0) {
      resetFlashSession(flashDeck, false);
    }
  }, [activeTabMode]);

  useEffect(() => {
    if (activeTabMode !== 'flashcard' || flashDeck !== 'words') return;
    resetFlashSession('words', false);
  }, [flashWordLevel, vocabularyWords.length]);

  useEffect(() => {
    if (activeTabMode !== 'flashcard' || flashFinished) return;
    if (!flashAlphabetCard && !flashIpaCard && !flashVocabularyCard) return;
    const timer = window.setTimeout(() => speakFlashCard(), 160);
    return () => window.clearTimeout(timer);
  }, [activeTabMode, flashDeck, flashPos, flashFinished, flashWordLevel, vocabularyWords.length]);

  // Keyboard shortcuts (Space flip, arrows navigate/mark)
  useEffect(() => {
    if (activeTabMode !== 'flashcard' || flashFinished) return;
    const handleKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA'].includes(target.tagName)) return;
      if (event.key === ' ' || event.key === 'Spacebar') {
        event.preventDefault();
        flipFlashCard();
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        flashFlipped ? markFlashCard('known') : advanceFlashCard();
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        flashFlipped ? markFlashCard('learning') : previousFlashCard();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [activeTabMode, flashFinished, flashFlipped, flashPos, flashOrder.length, flashCardIndex, flashDeck, flashWordLevel]);

  const speakPracticePrompt = (index: number) => {
    const card = alphabet[index];
    if (!card) return;
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(`Can you say the letter ${card.letter}?`);
      utterance.lang = 'en-US';
      utterance.rate = 0.85;
      window.speechSynthesis.speak(utterance);
    }
  };

  const startPracticeSpeechRecognition = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    if (practiceRecognitionRef.current) {
      try { practiceRecognitionRef.current.abort(); } catch (e) { }
    }

    const rec = new SpeechRecognition();
    rec.continuous = false;
    rec.lang = 'en-US';
    rec.interimResults = false;

    const card = alphabet[practiceIndex];

    rec.onstart = () => {
      setPracticeStatus('listening');
      setPracticeHeardText('');
    };

    rec.onresult = (event: any) => {
      const heard = String(event.results[0][0].transcript || '').toLowerCase().trim().replace(/[^a-z]/g, '');
      setPracticeHeardText(event.results[0][0].transcript);

      const targetLetter = card.letter.toLowerCase();
      const targetWord = card.word.toLowerCase();

      const isMatch = heard === targetLetter || heard === targetWord || heard.includes(targetLetter) || heard.includes(targetWord);

      if (isMatch) {
        setPracticeStatus('correct');
        playCorrectSound();
        if (currentChild?.id) {
          recordWordAnswer(currentChild.id, targetLetter, 5);
        }
        setTimeout(() => {
          setPracticeIndex((prev) => (prev + 1) % alphabet.length);
          setPracticeStatus('idle');
          setPracticeAttempts(0);
          setPracticeHeardText('');
        }, 2000);
      } else {
        playIncorrectSound();
        const nextAttempts = practiceAttempts + 1;
        setPracticeAttempts(nextAttempts);
        setPracticeStatus('wrong');
        if (nextAttempts >= 3) {
          if (currentChild?.id) {
            recordWordAnswer(currentChild.id, targetLetter, 1);
          }
          setPracticeStatus('fallback');
        } else {
          setTimeout(() => {
            setPracticeStatus('idle');
          }, 1500);
        }
      }
    };

    rec.onerror = () => {
      setPracticeStatus('idle');
    };
    rec.onend = () => {
      setPracticeStatus((s) => s === 'listening' ? 'idle' : s);
    };

    practiceRecognitionRef.current = rec;
    rec.start();
  };

  useEffect(() => {
    if (activeTabMode === 'voice-practice') {
      speakPracticePrompt(practiceIndex);
    }
    return () => {
      if (practiceRecognitionRef.current) {
        try { practiceRecognitionRef.current.abort(); } catch (e) { }
      }
    };
  }, [activeTabMode, practiceIndex]);

  return (
    <div id="alphabet-tab-container" className={`w-full space-y-8 transition-all duration-500 ${isLight ? 'text-slate-800' : 'text-slate-100'
      }`}>

      {/* Header section with high premium branding - completely different from Duolingo */}
      <div className={`flex flex-col md:flex-row md:items-center md:justify-between border-b pb-6 gap-6 ${isLight ? 'border-indigo-100' : 'border-slate-800/60'
        }`}>
        <div className="flex items-start gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className={`text-[10px] font-bold uppercase tracking-widest px-2.5 py-0.5 rounded-full ${isLight ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-800 text-indigo-400'
                }`}>
                {isEnglish ? 'Pronunciation lab' : 'Phát âm tinh hoa'}
              </span>
              <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-ping" />
            </div>
            <h2 className={`readable-block mt-1 text-2xl font-black tracking-tight md:text-3xl ${
              isLight
                ? 'text-slate-900'
                : 'bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 bg-clip-text text-transparent'
            }`}>
              {isEnglish ? 'Master English pronunciation' : 'Học phát âm tiếng Anh chuẩn'}
            </h2>

          </div>
        </div>

        {/* Action controls */}
        <div className="w-full md:w-auto flex items-center justify-start md:justify-end gap-3 flex-row">
          {/* Advanced Luxury pill switch */}
          <div className={`flex gap-1 md:gap-2 p-0.5 md:p-1 rounded-xl md:rounded-2xl border w-full md:w-auto justify-between ${isLight ? 'bg-slate-100 border-slate-200' : 'bg-[var(--app-surface-alt,#fffdf8)] border-slate-800'
            }`}>
            <button
              onClick={() => {
                playAppSound(400, 'sine', 0.08);
                setActiveTabMode('alphabet');
              }}
              className={`min-h-[36px] md:min-h-[48px] flex-1 md:flex-initial px-2 md:px-4.5 py-1 md:py-2 rounded-lg md:rounded-xl text-[10px] md:text-xs font-bold transition-all duration-100 cursor-pointer tracking-wide active:scale-95 ${activeTabMode === 'alphabet'
                ? 'bg-gradient-to-r from-indigo-600 to-indigo-700 text-white shadow-lg'
                : isLight
                  ? 'text-slate-500 hover:text-slate-900'
                  : 'text-slate-400 hover:text-white'
                }`}
            >
              {isEnglish ? 'Alphabet' : 'Chữ cái'}
            </button>
            <button
              onClick={() => {
                playAppSound(400, 'sine', 0.08);
                setActiveTabMode('ipa');
              }}
              className={`min-h-[36px] md:min-h-[48px] flex-1 md:flex-initial px-2 md:px-4.5 py-1 md:py-2 rounded-lg md:rounded-xl text-[10px] md:text-xs font-bold transition-all duration-100 cursor-pointer tracking-wide active:scale-95 ${activeTabMode === 'ipa'
                ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-lg'
                : isLight
                  ? 'text-slate-500 hover:text-slate-900'
                  : 'text-slate-400 hover:text-white'
                }`}
            >
              {isEnglish ? 'IPA' : 'Âm IPA'}
            </button>
            <button
              onClick={() => {
                playAppSound(400, 'sine', 0.08);
                setActiveTabMode('flashcard');
              }}
              className={`min-h-[36px] md:min-h-[48px] flex-1 md:flex-initial px-2 md:px-4.5 py-1 md:py-2 rounded-lg md:rounded-xl text-[10px] md:text-xs font-bold transition-all duration-100 cursor-pointer tracking-wide active:scale-95 ${activeTabMode === 'flashcard'
                ? 'bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-lg'
                : isLight
                  ? 'text-slate-500 hover:text-slate-900'
                  : 'text-slate-400 hover:text-white'
                }`}
            >
              {isEnglish ? 'Flashcards' : 'Thẻ ghi nhớ'}
            </button>
            <button
              onClick={() => {
                playAppSound(400, 'sine', 0.08);
                setActiveTabMode('voice-practice');
                setPracticeIndex(0);
                setPracticeStatus('idle');
                setPracticeAttempts(0);
                setPracticeHeardText('');
              }}
              className={`min-h-[36px] md:min-h-[48px] flex-1 md:flex-initial px-2 md:px-4.5 py-1 md:py-2 rounded-lg md:rounded-xl text-[10px] md:text-xs font-bold transition-all duration-100 cursor-pointer tracking-wide active:scale-95 ${activeTabMode === 'voice-practice'
                ? 'bg-gradient-to-r from-amber-500 to-orange-600 text-white shadow-lg'
                : isLight
                  ? 'text-slate-500 hover:text-slate-900'
                  : 'text-slate-400 hover:text-white'
                }`}
            >
              {isEnglish ? 'Practice Voice' : 'Luyện nói'}
            </button>
          </div>

        </div>
      </div>

      {/* RENDER MODE 1: ALPHABET CARDS GRID - GORGEOUS FLAT GLOW TILES */}
      {activeTabMode === 'alphabet' && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={startFavoriteReview}
              disabled={favoriteLetters.size === 0}
              className={`min-h-[48px] rounded-xl border px-4 py-2 text-xs font-black transition disabled:cursor-not-allowed disabled:opacity-50 ${isLight ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-amber-700/50 bg-amber-950/20 text-amber-300'}`}
            >
              <Star className="mr-2 inline h-4 w-4 fill-current" />
              {isEnglish ? `Review saved letters (${favoriteLetters.size})` : `Ôn chữ đã lưu (${favoriteLetters.size})`}
            </button>
            {favoritesError && <p className="text-xs font-bold text-red-500">{favoritesError}</p>}
          </div>

          <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-5 lg:grid-cols-6 gap-2 md:gap-4">
            {alphabet.map((item) => {
              const isActive = activeLetter === item.letter;
              const isFavorite = favoriteLetters.has(item.letter);
              return (
                <button
                  id={`letter-btn-${item.letter.toLowerCase()}`}
                  key={item.letter}
                  onClick={() => speakAlphabetPhonics(item.letter, item.word)}
                  className={`p-3 md:p-5 rounded-2xl border text-center relative transition-all duration-300 group cursor-pointer active:scale-95 active:duration-75 ${isActive
                    ? `border-[5px] scale-[1.05] ` +
                      (isLight
                        ? 'border-[var(--color-duo-orange,#ff9600)] bg-gradient-to-b from-amber-100 via-amber-50 to-orange-100 text-orange-950 font-bold shadow-[0_20px_40px_rgba(255,150,0,0.28)]'
                        : 'border-[var(--color-duo-violet,#84d8ff)] bg-gradient-to-b from-indigo-900 via-indigo-950 to-purple-900 text-white font-bold shadow-[0_20px_40px_rgba(132,216,255,0.32)]')
                    : isLight
                      ? 'bg-gradient-to-b from-lime-50 via-emerald-50 to-green-100/70 border-emerald-200 shadow-[0_10px_26px_rgba(34,197,94,0.10)] hover:-translate-y-0.5 hover:border-emerald-400 hover:shadow-[0_16px_30px_rgba(34,197,94,0.16)] text-slate-800'
                      : 'bg-[var(--app-surface,#ffffff)] border-slate-800/80 hover:border-indigo-500/80 hover:bg-[var(--app-surface-alt,#fffdf8)] hover:shadow-[0_12px_24px_rgba(0,0,0,0.4)]'
                    }`}
                >
                  {/* Subtle active stars */}
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(event) => { event.stopPropagation(); void toggleFavoriteLetter(item.letter); }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        event.stopPropagation();
                        void toggleFavoriteLetter(item.letter);
                      }
                    }}
                    className={`absolute right-1.5 top-1.5 md:right-3 md:top-3 z-10 rounded-full p-1 md:p-2 transition ${isFavorite ? 'bg-amber-300 text-amber-800 border-2 border-amber-500 shadow-sm' : isLight ? 'bg-white text-emerald-700 shadow-sm ring-2 ring-emerald-300 border border-emerald-400 hover:text-amber-700' : 'bg-slate-800 text-slate-500 hover:text-amber-400'}`}
                    aria-label={isFavorite ? (isEnglish ? `Remove ${item.letter} from saved letters` : `Bỏ lưu chữ ${item.letter}`) : (isEnglish ? `Save letter ${item.letter}` : `Lưu chữ ${item.letter}`)}
                  >
                    <Star className={`h-3 w-3 md:h-4 md:w-4 ${isFavorite ? 'fill-current' : ''}`} />
                  </span>

                  {/* Giant Clean Modern Letter & IPA badge */}
                  <div className="flex flex-col items-center justify-center gap-1">
                    <span className="text-3xl md:text-5xl font-black bg-gradient-to-b from-[#4f46e5] to-indigo-600 dark:from-indigo-400 dark:to-indigo-500 bg-clip-text text-transparent group-hover:scale-105 transition-transform duration-300">
                      {item.letter}
                    </span>
                    <span className={`text-[10px] font-bold font-mono px-2 py-0.5 rounded-full select-none ${isActive
                      ? 'bg-emerald-600/15 text-emerald-700 dark:bg-indigo-500/20 dark:text-indigo-300'
                      : isLight
                        ? 'bg-white/80 text-emerald-700 ring-1 ring-emerald-100'
                        : 'bg-[var(--app-surface-alt,#fffdf8)] text-slate-300'
                      }`}>
                      {item.letterIPA}
                    </span>
                  </div>

                  {/* Clean Vector-like Comic Illustration */}
                  <div className="hidden md:block text-3xl md:text-4.5xl my-2 md:my-4 text-center transform group-hover:scale-115 group-hover:rotate-6 transition-transform duration-300 select-none">
                    {item.emoji}
                  </div>

                  {/* English Word & Word Phonic representation */}
                  <div className="hidden md:block space-y-1 pb-1">
                    <div className={`font-black text-xs md:text-sm tracking-tight ${isLight ? 'text-emerald-950' : 'text-slate-100'}`}>
                      {item.word}
                    </div>
                    <div className={`text-[9px] md:text-[10px] font-bold font-mono transition ${isActive
                      ? 'text-emerald-700 dark:text-indigo-400'
                      : isLight
                        ? 'text-emerald-600/80'
                        : 'text-slate-500'
                      }`}>
                      {item.phonics}
                    </div>
                  </div>

                  {/* Translucent premium Vietnamese divider and gloss */}
                  <div className={`hidden md:block text-[10px] md:text-xs font-semibold border-t pt-1.5 mt-1 md:pt-2 md:mt-1.5 ${isLight ? 'text-emerald-700 border-emerald-100' : 'text-slate-400 border-slate-800/40'
                    }`}>
                    {item.vietnamese}
                  </div>

                  {/* Speaker subtle icon */}
                  <div className={`absolute bottom-1.5 right-1.5 md:bottom-3 md:right-3 p-0.5 md:p-1 rounded-lg transition-all duration-300 ${isActive
                    ? 'opacity-100 bg-indigo-600 text-white'
                    : 'opacity-0 scale-90 group-hover:opacity-100 group-hover:scale-100 bg-white dark:bg-[var(--app-surface-alt,#fffdf8)] text-emerald-600 shadow-sm ring-1 ring-emerald-100'
                    }`}>
                    <Volume2 className="w-3 h-3 md:w-3.5 md:h-3.5" />
                  </div>

                  {/* Open the rich per-letter word list (notes 14/7 · mục 1) */}
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(event: React.MouseEvent) => { event.stopPropagation(); openLetterDetail(item.letter); }}
                    onKeyDown={(event: React.KeyboardEvent) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        event.stopPropagation();
                        openLetterDetail(item.letter);
                      }
                    }}
                    className={`absolute bottom-1.5 left-1.5 md:bottom-3 md:left-3 flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] md:text-[10px] font-black transition ${isLight
                      ? 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200'
                      : 'bg-indigo-500/20 text-indigo-300 hover:bg-indigo-500/30'
                      }`}
                    aria-label={isEnglish ? `Learn words for ${item.letter}` : `Học từ với chữ ${item.letter}`}
                  >
                    <BookOpen className="h-3 w-3" />
                    <span className="hidden md:inline">{isEnglish ? 'Words' : 'Học từ'}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Per-letter detail: words + examples + compound practice sentences (notes 14/7 · mục 1) */}
      {detailLetterData && (
        <div className="fixed inset-0 z-[600] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-md" onClick={() => setDetailLetter(null)}>
          <section
            role="dialog"
            aria-modal="true"
            aria-label={isEnglish ? `Words starting with ${detailLetterData.letter}` : `Từ bắt đầu bằng chữ ${detailLetterData.letter}`}
            onClick={(event: React.MouseEvent) => event.stopPropagation()}
            className={`custom-scrollbar w-full max-w-2xl max-h-[88vh] overflow-y-auto rounded-[26px] border-2 border-b-4 p-5 shadow-[0_24px_70px_rgba(0,0,0,0.35)] md:p-6 ${isLight ? 'border-emerald-200 bg-white text-slate-800' : 'border-slate-700 bg-[var(--app-surface,#131f24)] text-slate-100'}`}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="text-4xl font-black bg-gradient-to-b from-[#4f46e5] to-indigo-600 bg-clip-text text-transparent md:text-5xl">
                  {detailLetterData.letter}
                </span>
                <div>
                  <div className="font-mono text-xs font-bold text-emerald-600 dark:text-indigo-300">{detailLetterData.letterIPA}</div>
                  <div className="text-[11px] font-semibold text-[var(--app-text-muted,#64748b)]">
                    {isEnglish ? 'Sound' : 'Âm'}: <span className="font-mono">{detailLetterData.phonicsSound}</span>
                  </div>
                </div>
              </div>
              <button type="button" onClick={() => setDetailLetter(null)} className="rounded-full p-2 transition hover:bg-black/10 dark:hover:bg-white/10" aria-label={isEnglish ? 'Close' : 'Đóng'}>
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 space-y-3">
              {detailLetterData.words.map((wordItem) => (
                <div key={wordItem.word} className={`rounded-2xl border p-3 ${isLight ? 'border-emerald-100 bg-emerald-50/50' : 'border-slate-700 bg-black/20'}`}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className="text-3xl select-none">{wordItem.emoji}</span>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-base font-black">{wordItem.word}</span>
                          <span className="font-mono text-[10px] font-bold text-emerald-600 dark:text-indigo-300">{wordItem.ipa}</span>
                        </div>
                        <div className="text-xs font-semibold text-[var(--app-text-muted,#64748b)]">{wordItem.vietnamese}</div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => speakEnglishText(wordItem.word)}
                      className={`shrink-0 rounded-full p-2 transition ${isLight ? 'bg-white text-emerald-600 shadow-sm ring-1 ring-emerald-200 hover:bg-emerald-50' : 'bg-slate-800 text-indigo-300 hover:bg-slate-700'}`}
                      aria-label={isEnglish ? `Hear ${wordItem.word}` : `Nghe từ ${wordItem.word}`}
                    >
                      <Volume2 className="h-4 w-4" />
                    </button>
                  </div>

                  {wordItem.examples.length > 0 && (
                    <div className="mt-2 space-y-1.5 border-t pt-2 border-black/5 dark:border-white/5">
                      {wordItem.examples.map((example, exampleIndex) => (
                        <div key={exampleIndex} className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-xs font-bold">{example.en}</div>
                            <div className="text-[11px] italic text-[var(--app-text-muted,#64748b)]">{example.vi}</div>
                          </div>
                          <button
                            type="button"
                            onClick={() => speakEnglishText(example.en)}
                            className="shrink-0 rounded-full p-1.5 text-emerald-600 transition hover:bg-emerald-100 dark:text-indigo-300 dark:hover:bg-white/10"
                            aria-label={isEnglish ? 'Hear sentence' : 'Nghe câu'}
                          >
                            <Volume2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {detailLetterData.practiceSentences.length > 0 && (
              <div className={`mt-4 rounded-2xl border p-3 ${isLight ? 'border-amber-200 bg-amber-50' : 'border-amber-400/25 bg-amber-400/10'}`}>
                <div className="text-[10px] font-black uppercase tracking-[0.16em] text-amber-600 dark:text-amber-400">
                  {isEnglish ? 'Practice sentences' : 'Câu luyện phát âm'}
                </div>
                <div className="mt-2 space-y-1.5">
                  {detailLetterData.practiceSentences.map((sentence, sentenceIndex) => (
                    <div key={sentenceIndex} className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-xs font-bold">{sentence.en}</div>
                        <div className="text-[11px] italic text-[var(--app-text-muted,#64748b)]">{sentence.vi}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => speakEnglishText(sentence.en)}
                        className="shrink-0 rounded-full p-1.5 text-amber-600 transition hover:bg-amber-100 dark:text-amber-400 dark:hover:bg-white/10"
                        aria-label={isEnglish ? 'Hear sentence' : 'Nghe câu'}
                      >
                        <Volume2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        </div>
      )}

      {reviewFavoritesOnly && currentReviewCard && (
        <div className="fixed inset-0 z-[600] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-md">
          <section role="dialog" aria-modal="true" aria-label={isEnglish ? 'Saved letter practice' : 'Luyện chữ đã lưu'} className="custom-scrollbar w-full max-w-xl max-h-[88vh] overflow-y-auto rounded-[26px] border-2 border-b-4 border-amber-200 bg-[#fff8e8] p-4 text-[#4a1424] shadow-[0_24px_70px_rgba(74,20,36,0.32)] md:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-500">{isEnglish ? 'Saved letter practice' : 'Luyện chữ đã lưu'}</div>
                <h2 className="mt-1 text-xl font-black text-[#4a1424]">{reviewFinished ? (isEnglish ? 'Practice complete!' : 'Hoàn thành luyện tập!') : (isEnglish ? 'Which letter is this?' : 'Đây là chữ cái nào?')}</h2>
              </div>
              <button type="button" onClick={closeFavoriteReview} className="rounded-full p-2 text-[#4a1424] transition hover:bg-amber-100" aria-label={isEnglish ? 'Close practice' : 'Đóng bài luyện'}><X className="h-5 w-5" /></button>
            </div>

            {reviewFinished ? (
              <div className="py-8 text-center">
                <CheckCircle2 className="mx-auto h-16 w-16 text-[#58cc02]" />
                <div className="mt-4 text-4xl font-black text-[#58cc02]">{reviewScore}/{reviewLetters.length}</div>
                <p className="mt-2 text-sm font-semibold text-[#8a3a45]">{isEnglish ? 'Great work reviewing your saved letters.' : 'Bé đã ôn tập rất tốt các chữ đã lưu.'}</p>
                <div className="mt-6 flex justify-center gap-3">
                  <button type="button" onClick={closeFavoriteReview} className="min-h-[48px] rounded-xl border border-amber-200 bg-[#fffaf0] px-5 text-xs font-black uppercase text-[#4a1424] transition hover:bg-amber-50">{isEnglish ? 'Close' : 'Đóng'}</button>
                  <button type="button" onClick={startFavoriteReview} className="duo-btn-green min-h-[48px] rounded-xl px-5 text-xs font-black uppercase text-white"><RotateCcw className="mr-2 inline h-4 w-4" />{isEnglish ? 'Practice again' : 'Luyện lại'}</button>
                </div>
              </div>
            ) : (
              <>
                <div className="mt-3 h-3 overflow-hidden rounded-full bg-[#eadfca] md:mt-5"><div className="h-full rounded-full bg-[#58cc02] transition-all" style={{ width: `${((reviewIndex + 1) / reviewLetters.length) * 100}%` }} /></div>
                <div className="mt-4 rounded-2xl border border-indigo-100 bg-[#f5f7ff] p-4 text-center text-[#16213a] shadow-sm md:p-6">
                  <div className="text-4xl md:text-6xl">{currentReviewCard.emoji}</div>
                  <div className="mt-3 text-xl font-black">{currentReviewCard.word}</div>
                  <div className="mt-1 font-mono text-sm font-bold text-indigo-700">{currentReviewCard.phonics}</div>
                  <button
                    type="button"
                    onClick={() => speakAlphabetPhonics(currentReviewCard.letter, currentReviewCard.word)}
                    className="mt-3 inline-flex min-h-[48px] items-center justify-center gap-2 rounded-2xl border border-indigo-200 bg-white px-4 py-2 text-xs font-black uppercase text-indigo-700 shadow-sm transition hover:bg-indigo-50"
                  >
                    <Volume2 className="h-4 w-4" />
                    {isEnglish ? 'Hear question again' : 'Nghe lại câu hỏi'}
                  </button>
                </div>
                <div className="mt-3 md:mt-5 grid grid-cols-2 gap-2 md:gap-3">
                  {reviewOptions.map((letter) => {
                    const isCorrect = letter === currentReviewCard.letter;
                    const isSelected = reviewDraft === letter;
                    const isConfirmed = reviewAnswer === letter;
                    return (
                      <button
                        key={letter}
                        type="button"
                        disabled={Boolean(reviewAnswer)}
                        onClick={() => previewFavoriteReview(letter)}
                        className={`min-h-[52px] md:min-h-[64px] rounded-2xl border border-b-4 text-2xl font-black transition ${
                          reviewAnswer && isCorrect
                            ? 'border-[#46a302] bg-[#58cc02]/15 text-[#46a302]'
                            : reviewAnswer && isConfirmed && !isCorrect
                              ? 'border-red-500 bg-red-500/10 text-red-500'
                              : isSelected
                                ? 'border-[#1cb0f6] bg-sky-50 text-sky-700'
                                : 'border-[#d7c7b7] bg-[#fffaf0] text-[#24324a] hover:border-[#1cb0f6] hover:bg-sky-50'
                        }`}
                      >
                        {letter}
                      </button>
                    );
                  })}
                </div>
                {!reviewAnswer && (
                  <button
                    type="button"
                    disabled={!reviewDraft}
                    onClick={confirmFavoriteReview}
                    className="mt-3 min-h-[46px] w-full rounded-xl border-b-4 border-[#169ad9] bg-[#1cb0f6] text-xs font-black uppercase text-white shadow-sm transition hover:bg-[#159de0] disabled:cursor-not-allowed disabled:border-[#9b7628] disabled:bg-[#c89f38] disabled:text-white/70 md:mt-5 md:min-h-[52px]"
                  >
                    {isEnglish ? 'Confirm answer' : 'Xác nhận đáp án'}
                  </button>
                )}
                {reviewAnswer && <button type="button" onClick={nextFavoriteReviewQuestion} className="duo-btn-green mt-3 md:mt-5 min-h-[46px] md:min-h-[52px] w-full rounded-xl text-xs font-black uppercase text-white">{reviewIndex >= reviewLetters.length - 1 ? (isEnglish ? 'See result' : 'Xem kết quả') : (isEnglish ? 'Next question' : 'Câu tiếp theo')}</button>}
              </>
            )}
          </section>
        </div>
      )}

      {/* RENDER MODE 2: LUXURIOUS IPA GRID WITHOUT CHUNKY CARTOON 3D BORDERS */}
      {activeTabMode === 'ipa' && (
        <div className="space-y-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={startFavoriteIpaReview}
              disabled={favoriteSounds.size === 0}
              className={`min-h-[48px] rounded-xl border px-4 py-2 text-xs font-black transition disabled:cursor-not-allowed disabled:opacity-50 ${isLight ? 'border-purple-200 bg-purple-50 text-purple-700' : 'border-purple-700/50 bg-purple-950/20 text-purple-300'}`}
            >
              <Star className="mr-2 inline h-4 w-4 fill-current" />
              {isEnglish ? `Review saved sounds (${favoriteSounds.size})` : `Ôn âm đã lưu (${favoriteSounds.size})`}
            </button>
            {ipaFavoritesError && <p className="text-xs font-bold text-red-500">{ipaFavoritesError}</p>}
          </div>

          {/* Premium Filter row with glowing select styles */}
          <div className="flex flex-wrap gap-2 items-center justify-start pb-2">
            <span className={`text-[11px] font-extrabold tracking-widest mr-2 ${isLight ? 'text-slate-700' : 'text-slate-500'}`}>
              {isEnglish ? '📁 Sound groups:' : '📁 Phân nhóm âm:'}
            </span>
            <button
              onClick={() => { playAppSound(300, 'sine', 0.05); setIpaFilter('all'); }}
              className={`min-h-[48px] px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer active:scale-95 active:duration-75 ${ipaFilter === 'all'
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/15'
                : isLight ? 'bg-white border-2 border-slate-300 text-slate-800 shadow-sm hover:bg-slate-50 hover:border-indigo-300' : 'bg-[var(--app-surface-alt,#fffdf8)] border border-slate-800 text-slate-300 hover:bg-[var(--app-surface,#ffffff)]'
                }`}
            >
              {filterLabelMap.all}
            </button>
            <button
              onClick={() => { playAppSound(300, 'sine', 0.05); setIpaFilter('vowel'); }}
              className={`min-h-[48px] px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer active:scale-95 active:duration-75 ${ipaFilter === 'vowel'
                ? 'bg-pink-600 text-white shadow-lg shadow-pink-600/15'
                : isLight ? 'bg-white border-2 border-pink-200 text-pink-800 shadow-sm hover:bg-pink-50 hover:border-pink-300' : 'bg-[var(--app-surface-alt,#fffdf8)] border border-slate-800 text-slate-300 hover:bg-[var(--app-surface,#ffffff)]'
                }`}
            >
              {filterLabelMap.vowel}
            </button>
            <button
              onClick={() => { playAppSound(300, 'sine', 0.05); setIpaFilter('diphthong'); }}
              className={`min-h-[48px] px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer active:scale-95 active:duration-75 ${ipaFilter === 'diphthong'
                ? 'bg-amber-500 text-white shadow-lg shadow-amber-500/15'
                : isLight ? 'bg-white border-2 border-amber-200 text-amber-800 shadow-sm hover:bg-amber-50 hover:border-amber-300' : 'bg-[var(--app-surface-alt,#fffdf8)] border border-slate-800 text-slate-300 hover:bg-[var(--app-surface,#ffffff)]'
                }`}
            >
              {filterLabelMap.diphthong}
            </button>
            <button
              onClick={() => { playAppSound(300, 'sine', 0.05); setIpaFilter('consonant'); }}
              className={`min-h-[48px] px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer active:scale-95 active:duration-75 ${ipaFilter === 'consonant'
                ? 'bg-teal-600 text-white shadow-lg shadow-teal-600/15'
                : isLight ? 'bg-white border-2 border-teal-200 text-teal-800 shadow-sm hover:bg-teal-50 hover:border-teal-300' : 'bg-[var(--app-surface-alt,#fffdf8)] border border-slate-800 text-slate-300 hover:bg-[var(--app-surface,#ffffff)]'
                }`}
            >
              {filterLabelMap.consonant}
            </button>
          </div>

          {/* Luxury IPA Card Grid */}
          {/* Luxury IPA Card Grid */}
          {/* Luxury IPA Card Grid */}
          <div className="grid grid-cols-3 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 gap-2 md:gap-5">
            {filteredIpaList.map((card) => {
              const isPhonemeActive = activePhoneme === card.ipa;
              const isFavorite = favoriteSounds.has(card.ipa);

              // Abstract sophisticated color schemes
              const typeStyle = isLight
                ? card.type === 'vowel'
                  ? 'text-pink-950 bg-pink-100/90 border border-pink-400 font-extrabold shadow-[0_2px_6px_rgba(236,72,153,0.1)]'
                  : card.type === 'diphthong'
                    ? 'text-amber-950 bg-amber-100/90 border border-amber-400 font-extrabold shadow-[0_2px_6px_rgba(245,158,11,0.1)]'
                    : 'text-teal-950 bg-teal-100/90 border border-teal-400 font-extrabold shadow-[0_2px_6px_rgba(20,184,166,0.1)]'
                : card.type === 'vowel'
                  ? 'text-pink-300 bg-pink-950/40 border border-pink-500/60 shadow-[0_4px_10px_rgba(236,72,153,0.16)]'
                  : card.type === 'diphthong'
                    ? 'text-amber-300 bg-amber-950/40 border border-amber-500/60 shadow-[0_4px_10px_rgba(245,158,11,0.16)]'
                    : 'text-teal-300 bg-teal-950/40 border border-teal-500/60 shadow-[0_4px_10px_rgba(20,184,166,0.16)]';

              return (
                <button
                  type="button"
                  key={card.ipa}
                  id={`ipa-card-${card.ipa.replace(/[:\/]/g, '')}`}
                  onClick={() => speakIPASound(card)}
                  aria-label={`${isEnglish ? 'Play' : 'Phát âm'} ${card.ipa} - ${card.word}`}
                  className={`w-full p-3.5 md:p-5 rounded-2xl border flex flex-col justify-between space-y-2 md:space-y-4 text-left cursor-pointer active:scale-[0.99] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-indigo-500/30 transition-all duration-300 relative ${isPhonemeActive
                    ? `border-[5px] scale-[1.05] ` +
                      (isLight
                        ? 'border-[var(--color-duo-orange,#ff9600)] bg-gradient-to-b from-amber-100 via-amber-50 to-orange-100 text-orange-950 font-bold shadow-[0_20px_40px_rgba(255,150,0,0.28)]'
                        : 'border-[var(--color-duo-violet,#84d8ff)] bg-gradient-to-b from-indigo-900 via-indigo-950 to-purple-900 text-white font-bold shadow-[0_20px_40px_rgba(132,216,255,0.32)]')
                    : isLight
                      ? 'bg-white border-2 border-slate-300 hover:border-indigo-400 hover:shadow-[0_10px_25px_-5px_rgba(99,102,241,0.12)]'
                      : 'bg-[var(--app-surface,#ffffff)] border-slate-800/80 hover:border-indigo-500/50 hover:bg-[var(--app-surface-alt,#fffdf8)]'
                    }`}
                >
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(event) => { event.stopPropagation(); void toggleFavoriteSound(card.ipa); }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        event.stopPropagation();
                        void toggleFavoriteSound(card.ipa);
                      }
                    }}
                    className={`absolute right-1.5 top-1.5 md:right-3 md:top-3 z-10 rounded-full p-1 md:p-2 transition ${isFavorite ? 'bg-amber-300 text-amber-800 border-2 border-amber-500 shadow-sm' : isLight ? 'bg-white text-indigo-700 shadow-sm ring-2 ring-indigo-300 border border-indigo-400 hover:text-amber-700' : 'bg-slate-800 text-slate-500 hover:text-amber-400'}`}
                    aria-label={isFavorite ? (isEnglish ? `Remove ${card.ipa} from saved sounds` : `Bỏ lưu âm ${card.ipa}`) : (isEnglish ? `Save sound ${card.ipa}` : `Lưu âm ${card.ipa}`)}
                  >
                    <Star className={`h-3.5 w-3.5 md:h-4 md:w-4 ${isFavorite ? 'fill-current' : ''}`} />
                  </span>

                  {/* Category Pill */}
                  <div className="hidden md:flex items-center justify-between pr-8 md:pr-11">
                    <span className={`text-[9px] md:text-[10px] font-extrabold px-2 md:px-2.5 py-0.5 md:py-1 rounded-lg uppercase tracking-wider select-none ${typeStyle}`}>
                      {card.categoryName}
                    </span>
                    <span className={`w-2.5 h-2.5 rounded-full transition ${isPhonemeActive ? 'bg-indigo-600 shadow-[0_0_10px_rgba(99,102,241,0.45)]' : 'bg-slate-500 dark:bg-slate-700'}`} />
                  </div>

                  {/* IPA headline */}
                  <div className="flex items-center gap-3">
                    <span
                      className={`hidden md:flex items-center justify-center transition-all text-white cursor-pointer active:scale-95 flex-shrink-0 group relative`}
                    >
                      <span className="text-2xl md:text-4xl group-hover:scale-115 transition-transform duration-300 select-none">
                        {card.emoji}
                      </span>
                    </span>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="text-xl md:text-3xl font-black text-indigo-700 dark:text-indigo-400 leading-none tracking-tight">
                          {card.ipa}
                        </h3>
                        <Volume2 className="w-3.5 h-3.5 md:w-4 md:h-4 text-indigo-700" />
                      </div>
                      <span
                        className={`hidden md:inline-flex text-[10px] font-bold mt-2 min-h-[48px] items-center transition-colors cursor-pointer ${isLight ? 'text-slate-700 hover:text-indigo-700' : 'text-slate-500 hover:text-indigo-500'} active:scale-95 active:duration-75`}
                      >
                        {isEnglish ? 'Play sample 🔊' : 'Nghe âm mẫu 🔊'}
                      </span>
                    </div>
                  </div>

                  {/* Mouth Shape Tutorial Box */}
                  <div className={`hidden md:block p-2 md:p-3 rounded-xl text-[10.5px] md:text-xs leading-relaxed text-left border ${isLight
                    ? 'bg-slate-100 border-slate-300 text-slate-800'
                    : 'bg-[var(--app-surface-alt,#fffdf8)]/50 border-slate-850/60 text-slate-300'
                    }`}>
                    <div className="font-bold text-[8.5px] md:text-[9.5px] uppercase tracking-wide text-amber-500 dark:text-amber-400 flex items-center gap-1 mb-1 select-none">
                      <Smile className="w-3 h-3 md:w-3.5 md:h-3.5" />
                      <span>{isEnglish ? 'Pronunciation tip:' : 'Cách phát âm đúng:'}</span>
                    </div>
                    {card.mouthTip}
                  </div>

                  {/* Bottom Vocabulary Linkage Row */}
                  <div className={`hidden md:flex pt-2 md:pt-3 border-t flex items-center justify-between gap-2 md:gap-3 ${isLight ? 'border-slate-100' : 'border-slate-800/40'
                    }`}>
                    <div className="flex items-center gap-2 text-left">
                      <div className={`p-1.5 rounded-lg ${isLight ? 'bg-indigo-100 text-indigo-700' : 'bg-indigo-950/40 text-indigo-400'
                        }`}>
                        <BookOpen className="w-3 h-3 md:w-3.5 md:h-3.5" />
                      </div>
                      <div>
                        <div className={`text-[10.5px] md:text-xs font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>
                          {card.word}
                        </div>
                        <div className={`text-[9px] md:text-[10.5px] font-semibold font-mono ${isLight ? 'text-indigo-700' : 'text-indigo-400'}`}>
                          {card.wordPhonics}
                        </div>
                      </div>
                    </div>

                    <div className="text-right">
                      <span className={`text-[9px] md:text-[10px] font-bold px-2 md:px-2.5 py-0.5 md:py-1 rounded-lg ${isLight ? 'bg-indigo-100 text-indigo-800 border border-indigo-200' : 'bg-[var(--app-surface-alt,#fffdf8)] text-slate-300'
                        }`}>
                        {card.vietnamese}
                      </span>
                    </div>
                  </div>


                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* RENDER MODE 3: QUIZLET-STYLE FLASHCARDS */}
      {activeTabMode === 'flashcard' && (
        <div className="space-y-5">
          {/* Deck selector + counters */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className={`flex gap-1 rounded-2xl border p-1 ${isLight ? 'bg-slate-100 border-slate-200' : 'bg-[var(--app-surface-alt,#fffdf8)] border-slate-800'}`}>
              <button
                type="button"
                onClick={() => switchFlashDeck('alphabet')}
                className={`min-h-[40px] rounded-xl px-4 py-1.5 text-xs font-black transition ${flashDeck === 'alphabet' ? 'bg-gradient-to-r from-indigo-600 to-indigo-700 text-white shadow' : isLight ? 'text-slate-500 hover:text-slate-900' : 'text-slate-400 hover:text-white'}`}
              >
                {isEnglish ? `Alphabet (${alphabet.length})` : `Chữ cái (${alphabet.length})`}
              </button>
              <button
                type="button"
                onClick={() => switchFlashDeck('ipa')}
                className={`min-h-[40px] rounded-xl px-4 py-1.5 text-xs font-black transition ${flashDeck === 'ipa' ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow' : isLight ? 'text-slate-500 hover:text-slate-900' : 'text-slate-400 hover:text-white'}`}
              >
                {isEnglish ? `IPA (${ipaDatabase.length})` : `Âm IPA (${ipaDatabase.length})`}
              </button>
              <button
                type="button"
                onClick={() => switchFlashDeck('words')}
                className={`min-h-[40px] rounded-xl px-4 py-1.5 text-xs font-black transition ${flashDeck === 'words' ? 'bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow' : isLight ? 'text-slate-500 hover:text-slate-900' : 'text-slate-400 hover:text-white'}`}
              >
                {isEnglish ? `Words (${flashVocabularyCards.length})` : `T\u1eeb v\u1ef1ng (${flashVocabularyCards.length})`}
              </button>
            </div>
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1.5 text-xs font-black text-amber-500">
                <span className={`grid h-6 min-w-[24px] place-items-center rounded-full px-1.5 ${isLight ? 'bg-amber-100' : 'bg-amber-950/40'}`}>{flashLearning.size}</span>
                {isEnglish ? 'Still learning' : 'Đang học'}
              </span>
              <span className="flex items-center gap-1.5 text-xs font-black text-emerald-500">
                {isEnglish ? 'Know' : 'Đã thuộc'}
                <span className={`grid h-6 min-w-[24px] place-items-center rounded-full px-1.5 ${isLight ? 'bg-emerald-100' : 'bg-emerald-950/40'}`}>{flashKnown.size}</span>
              </span>
            </div>
          </div>

          {flashDeck === 'words' && (
            <div className={`rounded-[22px] border p-3 ${isLight ? 'border-emerald-100 bg-emerald-50/70' : 'border-emerald-700/40 bg-emerald-950/20'}`}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-500">
                    {isEnglish ? 'Vocabulary level' : 'C\u1ea5p \u0111\u1ed9 t\u1eeb v\u1ef1ng'}
                  </div>
                  <p className={`mt-1 text-xs font-semibold ${isLight ? 'text-emerald-800' : 'text-emerald-200'}`}>
                    {isEnglish ? 'Pick a level and learn words just like alphabet cards.' : 'Ch\u1ecdn A1, A2, B1, B2 r\u1ed3i h\u1ecdc t\u1eeb nh\u01b0 h\u1ecdc b\u1ea3ng ch\u1eef c\u00e1i.'}
                  </p>
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                  {availableFlashWordLevels.map((level) => (
                    <button
                      key={level}
                      type="button"
                      onClick={() => switchFlashWordLevel(level)}
                      className={`min-h-[38px] rounded-xl px-3 text-xs font-black transition active:scale-95 ${
                        flashWordLevel === level
                          ? 'bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow'
                          : isLight
                            ? 'bg-white text-emerald-700 hover:bg-emerald-100'
                            : 'bg-slate-900/70 text-emerald-200 hover:bg-emerald-900/40'
                      }`}
                    >
                      {level}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {flashDeck === 'words' && (vocabularyLoading || vocabularyError || currentFlashDeckSize === 0) ? (
            <div className={`rounded-[24px] border p-8 text-center ${isLight ? 'border-emerald-100 bg-white' : 'border-emerald-800/50 bg-[var(--app-surface)]'}`}>
              <BookOpen className="mx-auto h-14 w-14 text-emerald-500" />
              <div className="mt-4 text-xl font-black">
                {vocabularyLoading
                  ? (isEnglish ? 'Loading vocabulary...' : '\u0110ang t\u1ea3i t\u1eeb v\u1ef1ng...')
                  : vocabularyError
                    ? (isEnglish ? 'Cannot load vocabulary' : 'Ch\u01b0a t\u1ea3i \u0111\u01b0\u1ee3c t\u1eeb v\u1ef1ng')
                    : (isEnglish ? `No ${flashWordLevel} words yet` : `Ch\u01b0a c\u00f3 t\u1eeb ${flashWordLevel}`)}
              </div>
              <p className="mx-auto mt-2 max-w-md text-sm text-[var(--app-text-muted)]">
                {vocabularyError || (isEnglish ? 'Import words into the database, then open this deck again.' : 'H\u00e3y import t\u1eeb v\u00e0o database r\u1ed3i m\u1edf l\u1ea1i b\u1ed9 th\u1ebb n\u00e0y.')}
              </p>
            </div>
          ) : flashFinished ? (
            <div className={`rounded-[24px] border p-8 text-center ${isLight ? 'border-slate-200 bg-white' : 'border-[var(--app-border)] bg-[var(--app-surface)]'}`}>
              <CheckCircle2 className="mx-auto h-16 w-16 text-[#58cc02]" />
              <div className="mt-4 text-2xl font-black">{isEnglish ? 'Deck complete!' : 'Hoàn thành bộ thẻ!'}</div>
              <div className="mt-4 flex justify-center gap-6">
                <div>
                  <div className="text-3xl font-black text-emerald-500">{flashKnown.size}</div>
                  <div className="text-xs font-bold text-[var(--app-text-muted)]">{isEnglish ? 'Know' : 'Đã thuộc'}</div>
                </div>
                <div>
                  <div className="text-3xl font-black text-amber-500">{flashLearning.size}</div>
                  <div className="text-xs font-bold text-[var(--app-text-muted)]">{isEnglish ? 'Still learning' : 'Đang học'}</div>
                </div>
              </div>
              <div className="mt-6 flex justify-center gap-3">
                <button type="button" onClick={() => resetFlashSession(flashDeck, false)} className="min-h-[48px] rounded-xl border border-[var(--app-border)] px-5 text-xs font-black uppercase">
                  <RotateCcw className="mr-2 inline h-4 w-4" />{isEnglish ? 'Restart' : 'Học lại'}
                </button>
                <button type="button" onClick={() => resetFlashSession(flashDeck, true)} className="duo-btn-green min-h-[48px] rounded-xl px-5 text-xs font-black uppercase text-white">
                  {isEnglish ? 'Shuffle & restart' : 'Xáo trộn & học lại'}
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Progress bar */}
              <div className="h-2.5 overflow-hidden rounded-full bg-black/10">
                <div className="h-full rounded-full bg-[#58cc02] transition-all" style={{ width: `${((flashPos + 1) / Math.max(flashOrder.length, 1)) * 100}%` }} />
              </div>

              {/* The flip card (3D rotateY) */}
              <div
                role="button"
                tabIndex={0}
                onClick={flipFlashCard}
                onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); flipFlashCard(); } }}
                aria-label={isEnglish ? 'Flip card' : 'Lật thẻ'}
                className="relative min-h-[320px] w-full cursor-pointer select-none md:min-h-[400px] [perspective:1600px]"
              >
                <div
                  key={flashCardIndex}
                  className="relative h-full min-h-[320px] w-full transition-transform duration-500 ease-out [transform-style:preserve-3d] md:min-h-[400px]"
                  style={{ transform: flashFlipped ? 'rotateX(180deg)' : 'rotateX(0deg)' }}
                >
                  {/* FRONT FACE */}
                  <div
                    className={`absolute inset-0 flex flex-col items-center justify-center gap-4 rounded-[28px] border p-6 text-center [backface-visibility:hidden] ${isLight ? 'border-slate-200 bg-white shadow-[0_10px_40px_rgba(99,102,241,0.10)]' : 'border-[var(--app-border)] bg-[var(--app-surface)] shadow-[0_10px_40px_rgba(0,0,0,0.4)]'}`}
                  >
                    <div className="absolute inset-x-0 top-0 flex items-center justify-between p-4">
                      <span className="text-[10px] font-black uppercase tracking-widest text-[var(--app-text-muted)]">
                        {isEnglish ? 'Tap to flip' : 'Chạm để lật'}
                      </span>
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={(event) => { event.stopPropagation(); speakFlashCard(); }}
                        onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); speakFlashCard(); } }}
                        className={`rounded-full p-2 transition ${isLight ? 'text-indigo-600 hover:bg-indigo-50' : 'text-indigo-400 hover:bg-slate-800'}`}
                        aria-label={isEnglish ? 'Play sound' : 'Phát âm'}
                      >
                        <Volume2 className="h-5 w-5" />
                      </span>
                    </div>
                    {flashVocabularyCard ? (
                      <>
                        <span className="text-6xl md:text-7xl">{flashVocabularyCard.emoji}</span>
                        <span className="max-w-full bg-gradient-to-b from-emerald-500 to-teal-600 bg-clip-text text-4xl font-black text-transparent md:text-7xl">
                          {flashVocabularyCard.word}
                        </span>
                        {flashVocabularyCard.ipa && (
                          <span className={`font-mono text-base font-black md:text-2xl ${isLight ? 'text-emerald-700' : 'text-emerald-300'}`}>
                            {flashVocabularyCard.ipa}
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="bg-gradient-to-b from-[#4f46e5] to-indigo-600 bg-clip-text text-6xl font-black text-transparent dark:from-indigo-400 dark:to-indigo-500 md:text-8xl">
                        {flashAlphabetCard ? flashAlphabetCard.letter : flashIpaCard?.ipa}
                      </span>
                    )}
                  </div>

                  {/* BACK FACE */}
                  <div
                    className={`absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-[28px] border p-6 text-center [backface-visibility:hidden] [transform:rotateX(180deg)] ${isLight ? 'border-slate-200 bg-white shadow-[0_10px_40px_rgba(99,102,241,0.10)]' : 'border-[var(--app-border)] bg-[var(--app-surface)] shadow-[0_10px_40px_rgba(0,0,0,0.4)]'}`}
                  >
                    <div className="absolute inset-x-0 top-0 flex items-center justify-between p-4">
                      <span className="text-[10px] font-black uppercase tracking-widest text-[var(--app-text-muted)]">
                        {isEnglish ? 'Answer' : 'Đáp án'}
                      </span>
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={(event) => { event.stopPropagation(); speakFlashCard(); }}
                        onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); speakFlashCard(); } }}
                        className={`rounded-full p-2 transition ${isLight ? 'text-indigo-600 hover:bg-indigo-50' : 'text-indigo-400 hover:bg-slate-800'}`}
                        aria-label={isEnglish ? 'Play sound' : 'Phát âm'}
                      >
                        <Volume2 className="h-5 w-5" />
                      </span>
                    </div>
                    <span className="text-6xl md:text-7xl">{flashAlphabetCard ? flashAlphabetCard.emoji : flashIpaCard ? flashIpaCard.emoji : flashVocabularyCard?.emoji}</span>
                    {!flashVocabularyCard && (
                      <>
                        <span className="text-2xl font-black md:text-3xl">{flashAlphabetCard ? flashAlphabetCard.word : flashIpaCard?.word}</span>
                        <span className="font-mono text-sm text-[var(--app-text-muted)]">{flashAlphabetCard ? flashAlphabetCard.phonics : flashIpaCard?.wordPhonics}</span>
                      </>
                    )}
                    <span className={`rounded-full px-3 py-1 font-bold ${
                      flashVocabularyCard ? 'text-xl md:text-3xl' : 'text-sm'
                    } ${isLight ? 'bg-indigo-50 text-indigo-700' : 'bg-indigo-950/40 text-indigo-300'}`}>
                      {flashAlphabetCard ? flashAlphabetCard.vietnamese : flashIpaCard ? flashIpaCard.vietnamese : flashVocabularyCard?.vietnamese}
                    </span>
                    {flashVocabularyCard && (
                      <div className="mt-2 flex flex-col items-center gap-2">
                        <span className={`rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] ${isLight ? 'bg-emerald-50 text-emerald-700' : 'bg-emerald-950/40 text-emerald-300'}`}>
                          {flashVocabularyCard.level} · {flashVocabularyCard.category}
                        </span>
                      </div>
                    )}
                    {flashIpaCard && (
                      <p className={`mt-1 max-w-md text-xs leading-relaxed ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
                        {flashIpaCard.mouthTip}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <p className="text-center text-[11px] font-medium text-[var(--app-text-muted)]">
                {isEnglish ? 'Press Space to flip · ← Still learning · → Know' : 'Nhấn Space để lật · ← Đang học · → Đã thuộc'}
              </p>

              {/* Controls: prev · ✕ · ✓ · shuffle */}
              <div className="flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={previousFlashCard}
                  disabled={flashPos <= 0}
                  className={`grid h-12 w-12 place-items-center rounded-full border transition disabled:opacity-30 ${isLight ? 'border-slate-200 text-slate-600 hover:bg-slate-50' : 'border-slate-700 text-slate-300 hover:bg-slate-800'}`}
                  aria-label={isEnglish ? 'Previous card' : 'Thẻ trước'}
                >
                  <RotateCcw className="h-5 w-5" />
                </button>

                <div className="flex items-center gap-4">
                  <button
                    type="button"
                    onClick={() => markFlashCard('learning')}
                    className="grid h-16 w-16 place-items-center rounded-full border-2 border-amber-400 text-amber-500 transition hover:bg-amber-50 active:scale-95 dark:hover:bg-amber-950/30"
                    aria-label={isEnglish ? 'Still learning' : 'Đang học'}
                  >
                    <X className="h-7 w-7" />
                  </button>
                  <button
                    type="button"
                    onClick={() => markFlashCard('known')}
                    className="grid h-16 w-16 place-items-center rounded-full border-2 border-emerald-400 text-emerald-500 transition hover:bg-emerald-50 active:scale-95 dark:hover:bg-emerald-950/30"
                    aria-label={isEnglish ? 'Know' : 'Đã thuộc'}
                  >
                    <CheckCircle2 className="h-7 w-7" />
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => resetFlashSession(flashDeck, true)}
                  className={`grid h-12 w-12 place-items-center rounded-full border text-lg transition ${isLight ? 'border-slate-200 text-slate-600 hover:bg-slate-50' : 'border-slate-700 text-slate-300 hover:bg-slate-800'}`}
                  aria-label={isEnglish ? 'Shuffle' : 'Xáo trộn'}
                >
                  🔀
                </button>
              </div>

              <div className="text-center text-xs font-bold text-[var(--app-text-muted)]">
                {flashPos + 1} / {flashOrder.length}
              </div>
            </>
          )}
        </div>
      )}

      {activeTabMode === 'voice-practice' && (
        <div className="space-y-6 max-w-xl mx-auto">
          <div className={`p-6 rounded-3xl border text-center shadow-lg relative ${isLight ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'}`}>
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-500">
              {isEnglish ? 'Alphabet Voice Practice' : 'Luyện nói chữ cái'}
            </span>

            {practiceStatus === 'fallback' ? (
              <div className="mt-4">
                <FallbackChallenge
                  word={{
                    word: alphabet[practiceIndex].letter,
                    emoji: alphabet[practiceIndex].emoji,
                    vietnamese: alphabet[practiceIndex].vietnamese,
                    ipa: alphabet[practiceIndex].letterIPA
                  }}
                  wordPool={alphabet.map(x => ({ word: x.letter, emoji: x.emoji, vietnamese: x.vietnamese, ipa: x.letterIPA }))}
                  onSuccess={() => {
                    playCorrectSound();
                    setPracticeStatus('correct');
                    if (currentChild?.id) {
                      recordWordAnswer(currentChild.id, alphabet[practiceIndex].letter.toLowerCase(), 3);
                    }
                    setTimeout(() => {
                      setPracticeIndex((prev) => (prev + 1) % alphabet.length);
                      setPracticeStatus('idle');
                      setPracticeAttempts(0);
                      setPracticeHeardText('');
                    }, 2000);
                  }}
                  onSkip={() => {
                    setPracticeIndex((prev) => (prev + 1) % alphabet.length);
                    setPracticeStatus('idle');
                    setPracticeAttempts(0);
                    setPracticeHeardText('');
                  }}
                  globalLang={globalLang}
                  isLight={isLight}
                />
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-6 gap-4">
                <span className="bg-gradient-to-b from-[#4f46e5] to-indigo-600 bg-clip-text text-8xl font-black text-transparent dark:from-indigo-400 dark:to-indigo-500 md:text-9xl">
                  {alphabet[practiceIndex].letter}
                </span>
                <span className="text-4xl">{alphabet[practiceIndex].emoji}</span>
                <span className="text-xl font-bold">{alphabet[practiceIndex].word} - {alphabet[practiceIndex].vietnamese}</span>
                <span className="font-mono text-sm text-[var(--app-text-muted)]">{alphabet[practiceIndex].letterIPA} · {alphabet[practiceIndex].phonics}</span>

                <div className="flex items-center gap-3 mt-4">
                  <button
                    type="button"
                    onClick={() => speakPracticePrompt(practiceIndex)}
                    className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-50 dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 hover:scale-105 active:scale-95 transition"
                  >
                    <Volume2 className="h-5 w-5" />
                  </button>

                  <button
                    type="button"
                    onClick={startPracticeSpeechRecognition}
                    className={`flex h-16 w-16 items-center justify-center rounded-full border-b-4 text-white hover:scale-105 active:scale-95 transition ${practiceStatus === 'listening' ? 'border-rose-700 bg-rose-500' : 'border-emerald-700 bg-emerald-500'}`}
                  >
                    {practiceStatus === 'listening' ? <MicOff className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
                  </button>
                </div>

                {practiceHeardText && (
                  <p className="text-xs font-bold opacity-75 mt-2">
                    {isEnglish ? 'I heard:' : 'Sunny nghe thấy:'} "{practiceHeardText}"
                  </p>
                )}

                {practiceStatus === 'correct' && (
                  <p className="text-sm font-black text-emerald-500 mt-2">
                    {isEnglish ? 'Excellent! You got it right! 🎉' : 'Tuyệt vời! Bé phát âm đúng rồi! 🎉'}
                  </p>
                )}

                {practiceStatus === 'wrong' && (
                  <p className="text-sm font-black text-rose-500 mt-2">
                    {isEnglish ? 'Not quite! Try saying it again!' : 'Chưa đúng rồi! Bé thử nói lại xem!'}
                  </p>
                )}
              </div>
            )}

            {/* Navigation buttons */}
            <div className="flex items-center justify-between mt-6 pt-4 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => {
                  setPracticeIndex((prev) => (prev - 1 + alphabet.length) % alphabet.length);
                  setPracticeStatus('idle');
                  setPracticeAttempts(0);
                  setPracticeHeardText('');
                }}
                className={`px-4 py-2 rounded-xl border text-xs font-bold transition ${isLight ? 'border-slate-200 hover:bg-slate-50' : 'border-slate-700 hover:bg-slate-800'}`}
              >
                {isEnglish ? 'Back' : 'Trước'}
              </button>
              <span className="text-xs font-bold text-[var(--app-text-muted)]">
                {practiceIndex + 1} / {alphabet.length}
              </span>
              <button
                type="button"
                onClick={() => {
                  setPracticeIndex((prev) => (prev + 1) % alphabet.length);
                  setPracticeStatus('idle');
                  setPracticeAttempts(0);
                  setPracticeHeardText('');
                }}
                className={`px-4 py-2 rounded-xl border text-xs font-bold transition ${isLight ? 'border-slate-200 hover:bg-slate-50' : 'border-slate-700 hover:bg-slate-800'}`}
              >
                {isEnglish ? 'Skip' : 'Bỏ qua'}
              </button>
            </div>
          </div>
        </div>
      )}

      {reviewIpaFavoritesOnly && currentIpaReviewCard && (
        <div className="fixed inset-0 z-[600] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-md">
          <section role="dialog" aria-modal="true" aria-label={isEnglish ? 'Saved IPA practice' : 'Luyện âm IPA đã lưu'} className="custom-scrollbar w-full max-w-xl max-h-[88vh] overflow-y-auto rounded-[26px] border-2 border-b-4 border-amber-200 bg-[#fff8e8] p-4 text-[#4a1424] shadow-[0_24px_70px_rgba(74,20,36,0.32)] md:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.2em] text-purple-500">{isEnglish ? 'Saved IPA practice' : 'Luyện âm IPA đã lưu'}</div>
                <h2 className="mt-1 text-xl font-black text-[#4a1424]">{reviewIpaFinished ? (isEnglish ? 'Practice complete!' : 'Hoàn thành luyện tập!') : (isEnglish ? 'Which sound matches this word?' : 'Âm nào khớp với từ này?')}</h2>
              </div>
              <button type="button" onClick={closeFavoriteIpaReview} className="rounded-full p-2 text-[#4a1424] transition hover:bg-amber-100" aria-label={isEnglish ? 'Close practice' : 'Đóng bài luyện'}><X className="h-5 w-5" /></button>
            </div>

            {reviewIpaFinished ? (
              <div className="py-8 text-center">
                <CheckCircle2 className="mx-auto h-16 w-16 text-[#58cc02]" />
                <div className="mt-4 text-4xl font-black text-[#58cc02]">{reviewIpaScore}/{reviewSounds.length}</div>
                <p className="mt-2 text-sm font-semibold text-[#8a3a45]">{isEnglish ? 'Great work reviewing your saved IPA sounds.' : 'Bé đã ôn tập rất tốt các âm IPA đã lưu.'}</p>
                <div className="mt-6 flex justify-center gap-3">
                  <button type="button" onClick={closeFavoriteIpaReview} className="min-h-[48px] rounded-xl border border-amber-200 bg-[#fffaf0] px-5 text-xs font-black uppercase text-[#4a1424] transition hover:bg-amber-50">{isEnglish ? 'Close' : 'Đóng'}</button>
                  <button type="button" onClick={startFavoriteIpaReview} className="duo-btn-green min-h-[48px] rounded-xl px-5 text-xs font-black uppercase text-white"><RotateCcw className="mr-2 inline h-4 w-4" />{isEnglish ? 'Practice again' : 'Luyện lại'}</button>
                </div>
              </div>
            ) : (
              <>
                <div className="mt-3 h-3 overflow-hidden rounded-full bg-[#eadfca] md:mt-5"><div className="h-full rounded-full bg-[#58cc02] transition-all" style={{ width: `${((reviewIpaIndex + 1) / reviewSounds.length) * 100}%` }} /></div>
                <div className="mt-4 rounded-2xl border border-purple-100 bg-[#f8f1ff] p-4 text-center text-[#2b1745] shadow-sm md:p-6">
                  <div className="text-4xl md:text-6xl">{currentIpaReviewCard.emoji}</div>
                  <div className="mt-3 text-[11px] font-black uppercase tracking-[0.2em] text-purple-500">
                    {isEnglish ? 'Listen and choose the IPA' : 'Nghe và chọn âm IPA'}
                  </div>
                  <button
                    type="button"
                    onClick={() => speakIPASound(currentIpaReviewCard)}
                    className="mt-3 inline-flex min-h-[48px] items-center justify-center gap-2 rounded-2xl border border-purple-200 bg-white px-4 py-2 text-xs font-black uppercase text-purple-700 shadow-sm transition hover:bg-purple-50"
                  >
                    <Volume2 className="h-4 w-4" />
                    {isEnglish ? 'Play IPA sound' : 'Phát âm IPA'}
                  </button>
                  <div className="mt-4 text-sm font-black">{currentIpaReviewCard.word}</div>
                  <div className="mt-1 text-[11px] font-bold text-[#8a3a45]">{currentIpaReviewCard.vietnamese}</div>
                </div>
                <div className="mt-3 md:mt-5 grid grid-cols-2 gap-2 md:gap-3">
                  {reviewIpaOptions.map((ipa) => {
                    const isCorrect = ipa === currentIpaReviewCard.ipa;
                    const isSelected = reviewIpaDraft === ipa;
                    const isConfirmed = reviewIpaAnswer === ipa;
                    return (
                      <button
                        key={ipa}
                        type="button"
                        disabled={Boolean(reviewIpaAnswer)}
                        onClick={() => previewFavoriteIpaReview(ipa)}
                        className={`min-h-[52px] md:min-h-[64px] rounded-2xl border border-b-4 px-3 text-lg font-black transition ${
                          reviewIpaAnswer && isCorrect
                            ? 'border-[#46a302] bg-[#58cc02]/15 text-[#46a302]'
                            : reviewIpaAnswer && isConfirmed && !isCorrect
                              ? 'border-red-500 bg-red-500/10 text-red-500'
                              : isSelected
                                ? 'border-[#1cb0f6] bg-sky-50 text-sky-700'
                                : 'border-[#d7c7b7] bg-[#fffaf0] text-[#24324a] hover:border-[#1cb0f6] hover:bg-sky-50'
                        }`}
                      >
                        {ipa}
                      </button>
                    );
                  })}
                </div>
                {!reviewIpaAnswer && (
                  <div className="mt-3 md:mt-5 flex flex-col gap-2 md:gap-3 sm:flex-row">
                    <button
                      type="button"
                      onClick={() => speakIPASound(currentIpaReviewCard)}
                      className="min-h-[46px] flex-1 rounded-xl border border-purple-200 bg-white px-4 text-xs font-black uppercase text-purple-700 shadow-sm transition hover:bg-purple-50 md:min-h-[52px]"
                    >
                      {isEnglish ? 'Hear question again' : 'Nghe lại câu hỏi'}
                    </button>
                    <button
                      type="button"
                      disabled={!reviewIpaDraft}
                      onClick={confirmFavoriteIpaReview}
                      className="min-h-[46px] flex-1 rounded-xl border-b-4 border-[#169ad9] bg-[#1cb0f6] text-xs font-black uppercase text-white shadow-sm transition hover:bg-[#159de0] disabled:cursor-not-allowed disabled:border-[#9b7628] disabled:bg-[#c89f38] disabled:text-white/70 md:min-h-[52px]"
                    >
                      {isEnglish ? 'Confirm answer' : 'Xác nhận đáp án'}
                    </button>
                  </div>
                )}
                {reviewIpaAnswer && <button type="button" onClick={nextFavoriteIpaReviewQuestion} className="duo-btn-green mt-3 md:mt-5 min-h-[46px] md:min-h-[52px] w-full rounded-xl text-xs font-black uppercase text-white">{reviewIpaIndex >= reviewSounds.length - 1 ? (isEnglish ? 'See result' : 'Xem kết quả') : (isEnglish ? 'Next question' : 'Câu tiếp theo')}</button>}
              </>
            )}
          </section>
        </div>
      )}

      {/* Parental guide / banner - Premium Soft Card */}
      <div id="parental-guide" className={`p-5 rounded-2xl flex items-start sm:items-center gap-4 border transition duration-300 ${isLight
        ? 'bg-indigo-50/60 border-indigo-100/80 text-indigo-900/90'
        : 'bg-[var(--app-surface,#ffffff)] border-slate-800 text-slate-300'
        }`}>
        <Smile className="text-indigo-500 w-6 h-6 flex-shrink-0 mt-0.5 sm:mt-0 animate-bounce" />
        <p className="text-xs leading-relaxed text-left font-medium">
          {isEnglish ? (
            <>
              <strong>Parent pronunciation guide:</strong> The <strong>IPA (International Phonetic Alphabet)</strong> helps shape mouth opening, tongue position, and airflow. Daily listening practice with example words helps children build clearer, more confident English pronunciation.
            </>
          ) : (
            <>
              <strong>Cẩm nang phát âm tinh tế cho cha mẹ:</strong> Bảng ký tự phiên âm quốc tế <strong>IPA (International Phonetic Alphabet)</strong> giúp định hình cách mở khẩu hình, vị trí lưỡi và cột hơi của con. Mỗi ngày chạm nghe âm kết hợp từ vựng giúp xây dựng sự tự tin chuẩn hóa giọng tiếng Anh tự nhiên tựa như thiếu nhi bản xứ Mỹ!
            </>
          )}
        </p>
      </div>

    </div>
  );
}
