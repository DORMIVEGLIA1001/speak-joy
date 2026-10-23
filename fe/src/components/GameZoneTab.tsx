import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Gamepad2, Volume2, Mic, MicOff, Trophy, RefreshCw, X, Play,
  HelpCircle, ArrowRight, ArrowLeft, Clock, BookOpen, Star, CheckCircle,
  ChevronDown, Check
} from 'lucide-react';
import { AppState } from '../types';
import { playAppSound, playCorrectSound } from '../data';
import { buildWordHint, compareWordCharacters, extractTranscriptWords, findClosestAllowedWord, normalizeWord, selectSpokenWord } from '../lib/wordChain';
import { buildGameRecordPatch } from '../lib/gameRecords';
import { shuffleArray } from '../lib/shuffle';
import SunnyMascot from './SunnyMascot';
import UnoGame from './games/UnoGame';
import QuizletGames from './games/4pics1word';

interface GameZoneTabProps {
  state: AppState;
  onUpdateStats: (update: Partial<AppState>) => void;
  currentChild?: GameChildProfile | null;
  children?: GameChildProfile[];
  globalLang: 'en' | 'vi';
  globalTheme: 'dark' | 'light';
  onActiveGameChange?: (isActive: boolean) => void;
}

interface GameChildProfile {
  id: string;
  name: string;
  age?: number;
  avatarUrl?: string | null;
}

interface Flashcard {
  id?: string;
  emoji: string;
  word: string;
  ipa?: string;
  vietnamese: string;
  category?: string;
  level?: string;
}

interface ChildGameRecords {
  trueFalseHighScore: number;
  wordChainHighScore: number;
  flashcardMatchBestTime: number;
  storiesCompletedCount: number;
  blocksHighScore: number;
  blastHighScore: number;
}

type BlocksCell = string | null;
type BlocksShape = { id: string; cells: Array<[number, number]>; color: string };
type BlocksQuestion = { card: Flashcard; choices: string[] };

interface BlastBubble {
  id: string;
  word: Flashcard;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  isCorrect: boolean;
  isFlashingRed: boolean;
}

interface BlastBullet {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
}

interface BlastParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  size: number;
  alpha: number;
  life: number;
}

const BLOCKS_SIZE = 8;
const BLOCKS_SHAPES: Array<Array<[number, number]>> = [
  [[0, 0]],
  [[0, 0], [0, 1]],
  [[0, 0], [0, 1], [0, 2]],
  [[0, 0], [1, 0], [2, 0]],
  [[0, 0], [0, 1], [1, 0], [1, 1]],
  [[0, 0], [1, 0], [1, 1]],
  [[0, 1], [1, 0], [1, 1]],
  [[0, 0], [1, 0], [2, 0], [2, 1]],
  [[0, 0], [0, 1], [0, 2], [1, 1]],
];
const BLOCKS_COLORS = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ec4899'];

const createEmptyBlocksBoard = (): BlocksCell[][] =>
  Array.from({ length: BLOCKS_SIZE }, () => Array<BlocksCell>(BLOCKS_SIZE).fill(null));

const createBlocksPieces = (): BlocksShape[] =>
  Array.from({ length: 3 }, (_, index) => ({
    id: `${Date.now()}-${index}-${Math.random()}`,
    cells: BLOCKS_SHAPES[Math.floor(Math.random() * BLOCKS_SHAPES.length)],
    color: BLOCKS_COLORS[Math.floor(Math.random() * BLOCKS_COLORS.length)],
  }));

interface WordChainHint {
  word: string;
  ipa: string;
  vietnamese: string;
  revealedLetters: number;
}

interface WordChainAttempt {
  heard: string;
  target: string;
  isCorrect: boolean;
  ipa?: string;
  showAllIncorrect?: boolean;
  ruleMatched?: boolean;
}

interface LocalizedGameMessage {
  en: string;
  vi: string;
}

// Fallback vocabulary pool — used only when DB API is unavailable
const FLASHCARDS_POOL: Flashcard[] = [
  { emoji: '🍎', word: 'apple', vietnamese: 'quả táo', level: 'A1', category: 'Food' },
  { emoji: '🍌', word: 'banana', vietnamese: 'quả chuối', level: 'A1', category: 'Food' },
  { emoji: '🐱', word: 'cat', vietnamese: 'con mèo', level: 'A1', category: 'Animals' },
  { emoji: '🐶', word: 'dog', vietnamese: 'con chó', level: 'A1', category: 'Animals' },
  { emoji: '🦁', word: 'lion', vietnamese: 'sư tử', level: 'A1', category: 'Animals' },
  { emoji: '🐟', word: 'fish', vietnamese: 'con cá', level: 'A1', category: 'Animals' },
  { emoji: '🐻', word: 'bear', vietnamese: 'con gấu', level: 'A1', category: 'Animals' },
  { emoji: '🚗', word: 'car', vietnamese: 'xe ô tô', level: 'A1', category: 'Travel' },
  { emoji: '✈️', word: 'plane', vietnamese: 'máy bay', level: 'A1', category: 'Travel' },
  { emoji: '🚲', word: 'bicycle', vietnamese: 'xe đạp', level: 'A1', category: 'Travel' },
  { emoji: '☀️', word: 'sun', vietnamese: 'mặt trời', level: 'A1', category: 'Environment' },
  { emoji: '🌸', word: 'flower', vietnamese: 'bông hoa', level: 'A1', category: 'Environment' },
  { emoji: '🏠', word: 'house', vietnamese: 'ngôi nhà', level: 'A1', category: 'Daily Life' },
  { emoji: '📚', word: 'book', vietnamese: 'quyển sách', level: 'A1', category: 'Academic' },
  { emoji: '✏️', word: 'pencil', vietnamese: 'bút chì', level: 'A1', category: 'Academic' },
];

interface StoryBlank {
  index: number;
  word: string;
  vietnameseHint: string;
  ipa: string;
}

interface Story {
  id: string;
  titleEn: string;
  titleVi: string;
  textEn: string;
  textVi: string;
  blanks: StoryBlank[];
  template: string;
  storyType?: 'narrative' | 'dialogue';
  dialogue?: Array<{
    speaker: string;
    avatar: string;
    template: string;
  }>;
}

// Expanded Story Pool (6 items)
const STORIES_POOL: Story[] = [
  {
    id: 'ant_bird',
    titleEn: 'The Helpful Ant',
    titleVi: 'Chú kiến tốt bụng',
    textEn: 'A small ant fell into the water. A beautiful bird dropped a green leaf to save the ant. They were very happy.',
    textVi: 'Một chú kiến nhỏ bị ngã xuống nước. Một chú chim xinh đẹp đã thả một chiếc lá xanh xuống để cứu chú kiến. Họ đã rất vui vẻ.',
    template: 'A small {blank_0} fell into the {blank_1}. A beautiful {blank_2} dropped a green {blank_3} to save the ant. They were very {blank_4}.',
    blanks: [
      { index: 0, word: 'ant', vietnameseHint: 'con kiến', ipa: '/ænt/' },
      { index: 1, word: 'water', vietnameseHint: 'nước', ipa: '/ˈwɔː.tər/' },
      { index: 2, word: 'bird', vietnameseHint: 'con chim', ipa: '/bɜːd/' },
      { index: 3, word: 'leaf', vietnameseHint: 'chiếc lá', ipa: '/liːf/' },
      { index: 4, word: 'happy', vietnameseHint: 'vui vẻ', ipa: '/ˈhæp.i/' },
    ],
  },
  {
    id: 'fox_grapes',
    titleEn: 'The Hungry Fox',
    titleVi: 'Con cáo đói bụng',
    textEn: 'A hungry fox saw some sweet grapes. The grapes were high on the tree. The fox jumped but could not reach them.',
    textVi: 'Một con cáo đói bụng nhìn thấy những quả nho ngọt ngào. Chùm nho ở tít trên cao của cái cây. Con cáo đã nhảy lên nhưng không thể chạm tới.',
    template: 'A hungry {blank_0} saw some sweet {blank_1}. The grapes were high on the {blank_2}. The fox {blank_3} but could not reach them.',
    blanks: [
      { index: 0, word: 'fox', vietnameseHint: 'con cáo', ipa: '/fɒks/' },
      { index: 1, word: 'grapes', vietnameseHint: 'quả nho', ipa: '/ɡreɪps/' },
      { index: 2, word: 'tree', vietnameseHint: 'cái cây', ipa: '/triː/' },
      { index: 3, word: 'jumped', vietnameseHint: 'đã nhảy', ipa: '/dʒʌmpt/' },
    ],
  },
  {
    id: 'golden_fish',
    titleEn: 'The Golden Fish',
    titleVi: 'Chú cá vàng',
    textEn: 'A little boy found a golden fish in the sea. The fish said thank you and gave him a bright star.',
    textVi: 'Một cậu bé nhỏ tìm thấy một chú cá vàng dưới biển. Chú cá nói lời cảm ơn và tặng cậu một ngôi sao sáng lấp lánh.',
    template: 'A little {blank_0} found a golden {blank_1} in the {blank_2}. The fish said thank you and gave him a bright {blank_3}.',
    blanks: [
      { index: 0, word: 'boy', vietnameseHint: 'cậu bé', ipa: '/bɔɪ/' },
      { index: 1, word: 'fish', vietnameseHint: 'con cá', ipa: '/fɪʃ/' },
      { index: 2, word: 'sea', vietnameseHint: 'biển', ipa: '/siː/' },
      { index: 3, word: 'star', vietnameseHint: 'ngôi sao', ipa: '/stɑːr/' },
    ],
  },
  {
    id: 'sleepy_bear',
    titleEn: 'The Sleepy Bear',
    titleVi: 'Chú gấu buồn ngủ',
    textEn: 'A brown bear sat under a big tree. He ate sweet honey and wanted to sleep. A soft wind blew.',
    textVi: 'Một chú gấu nâu ngồi dưới một cái cây lớn. Chú ăn mật ong ngọt ngào và muốn đi ngủ. Một làn gió nhẹ thổi qua.',
    template: 'A brown {blank_0} sat under a big {blank_1}. He ate sweet {blank_2} and wanted to {blank_3}. A soft {blank_4} blew.',
    blanks: [
      { index: 0, word: 'bear', vietnameseHint: 'con gấu', ipa: '/beər/' },
      { index: 1, word: 'tree', vietnameseHint: 'cái cây', ipa: '/triː/' },
      { index: 2, word: 'honey', vietnameseHint: 'mật ong', ipa: '/ˈhʌn.i/' },
      { index: 3, word: 'sleep', vietnameseHint: 'đi ngủ', ipa: '/sliːp/' },
      { index: 4, word: 'wind', vietnameseHint: 'gió', ipa: '/wɪnd/' },
    ],
  },
  {
    id: 'magic_seed',
    titleEn: 'The Magic Tree',
    titleVi: 'Cây thần kì',
    textEn: 'A cute rabbit found a magic seed in the garden. She planted it in the dark soil. A tall tree grew.',
    textVi: 'Một chú thỏ dễ thương tìm thấy một hạt giống thần kì trong vườn. Chú gieo nó xuống đất tối. Một cái cây cao đã mọc lên.',
    template: 'A cute {blank_0} found a magic {blank_1} in the {blank_2}. She planted it in the dark {blank_3}. A tall {blank_4} grew.',
    blanks: [
      { index: 0, word: 'rabbit', vietnameseHint: 'con thỏ', ipa: '/ˈræb.ɪt/' },
      { index: 1, word: 'seed', vietnameseHint: 'hạt giống', ipa: '/siːd/' },
      { index: 2, word: 'garden', vietnameseHint: 'khu vườn', ipa: '/ˈɡɑː.dən/' },
      { index: 3, word: 'soil', vietnameseHint: 'đất', ipa: '/sɔɪl/' },
      { index: 4, word: 'tree', vietnameseHint: 'cái cây', ipa: '/triː/' },
    ],
  },
  {
    id: 'brave_turtle',
    titleEn: 'The Brave Turtle',
    titleVi: 'Chú rùa dũng cảm',
    textEn: 'A green turtle walked to the sunny beach. He saw a blue shell near the water. He was very proud.',
    textVi: 'Một chú rùa xanh đi bộ đến bãi biển đầy nắng. Chú thấy một chiếc vỏ ốc màu xanh lam ở gần nước. Chú đã rất tự hào.',
    template: 'A green {blank_0} walked to the sunny {blank_1}. He saw a blue {blank_2} near the {blank_3}. He was very {blank_4}.',
    blanks: [
      { index: 0, word: 'turtle', vietnameseHint: 'con rùa', ipa: '/ˈtɜː.təl/' },
      { index: 1, word: 'beach', vietnameseHint: 'bãi biển', ipa: '/biːtʃ/' },
      { index: 2, word: 'shell', vietnameseHint: 'vỏ ốc', ipa: '/ʃel/' },
      { index: 3, word: 'water', vietnameseHint: 'nước', ipa: '/ˈwɔː.tər/' },
      { index: 4, word: 'proud', vietnameseHint: 'tự hào', ipa: '/praʊd/' },
    ],
  },
  {
    id: 'friends_picnic_dialogue',
    titleEn: 'A Picnic with Friends',
    titleVi: 'Buổi dã ngoại cùng bạn bè',
    textEn: 'Mia: Hello, Ben! I brought some apples. Ben: Great! I have a blue kite. Lily: Let us play near the big tree.',
    textVi: 'Mia: Chào Ben! Tớ mang theo vài quả táo. Ben: Tuyệt! Tớ có một chiếc diều xanh. Lily: Chúng ta hãy chơi gần cái cây lớn.',
    template: 'Hello, {blank_0}! I brought some {blank_1}. Great! I have a blue {blank_2}. Let us play near the big {blank_3}.',
    storyType: 'dialogue',
    dialogue: [
      { speaker: 'Mia', avatar: '👧', template: 'Hello, {blank_0}! I brought some {blank_1}.' },
      { speaker: 'Ben', avatar: '👦', template: 'Great! I have a blue {blank_2}.' },
      { speaker: 'Lily', avatar: '🧒', template: 'Let us play near the big {blank_3}.' },
    ],
    blanks: [
      { index: 0, word: 'Ben', vietnameseHint: 'tên Ben', ipa: '/ben/' },
      { index: 1, word: 'apples', vietnameseHint: 'những quả táo', ipa: '/ˈæp.əlz/' },
      { index: 2, word: 'kite', vietnameseHint: 'chiếc diều', ipa: '/kaɪt/' },
      { index: 3, word: 'tree', vietnameseHint: 'cái cây', ipa: '/triː/' },
    ],
  },
];

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

interface MatchCard {
  id: string;
  conceptId: string;
  type: 'text' | 'pic';
  content: string;
  isMatched: boolean;
  isSelected: boolean;
}

export default function GameZoneTab({
  state,
  onUpdateStats,
  currentChild = null,
  children = [],
  globalLang,
  globalTheme,
  onActiveGameChange,
}: GameZoneTabProps) {
  const isLight = globalTheme === 'light';

  const awardGameXp = (xpReward: number) => {
    onUpdateStats({ xp: state.xp + xpReward });
    if (currentChild?.id) {
      void fetch(`/api/children/${currentChild.id}/reward`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          xp: xpReward,
          mouthCount: Math.max(1, Math.round(xpReward / 5)),
        }),
      }).catch((err) => {
        console.warn('Failed to sync game XP reward:', err);
      });
    }
  };

  // Game Mode: 'menu' | 'true_false' | 'word_chain' | 'flashcard_match' | 'storytelling' | 'blocks' | 'blast' | 'uno' | 'four_pics'
  const [activeGame, setActiveGame] = useState<'menu' | 'true_false' | 'word_chain' | 'flashcard_match' | 'storytelling' | 'blocks' | 'blast' | 'uno' | 'four_pics'>('menu');

  // Blast Game State
  const [blastStatus, setBlastStatus] = useState<'idle' | 'playing' | 'gameover'>('idle');
  const [blastScore, setBlastScore] = useState<number>(0);
  const [blastXp, setBlastXp] = useState<number>(0);
  const [blastLevel, setBlastLevel] = useState<number>(1);
  const [blastHighScore, setBlastHighScore] = useState<number>(0);
  const [blastTimeLeft, setBlastTimeLeft] = useState<number>(60);
  const [blastStreak, setBlastStreak] = useState<number>(0);
  const [blastTargetWord, setBlastTargetWord] = useState<Flashcard | null>(null);

  // Refs for tracking physics coordinate states (prevents React DOM re-renders for 60fps smoothness)
  const blastCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const blastBubblesRef = useRef<BlastBubble[]>([]);
  const blastBulletsRef = useRef<BlastBullet[]>([]);
  const blastParticlesRef = useRef<BlastParticle[]>([]);
  const blastMousePosRef = useRef({ x: 0, y: 0 });
  const blastCannonAngleRef = useRef<number>(-Math.PI / 2);

  // Refs for tracking animation frame, timer intervals and mouse pos
  const blastAnimFrameRef = useRef<number | null>(null);
  const blastTimerIntervalRef = useRef<any>(null);
  const blastArenaRef = useRef<HTMLDivElement | null>(null);
  const blastStatusRef = useRef<'idle' | 'playing' | 'gameover'>('idle');

  useEffect(() => {
    onActiveGameChange?.(activeGame !== 'menu');
  }, [activeGame, onActiveGameChange]);

  useEffect(() => () => onActiveGameChange?.(false), [onActiveGameChange]);

  useEffect(() => () => {
    if (blocksDragFrameRef.current !== null) {
      window.cancelAnimationFrame(blocksDragFrameRef.current);
    }
  }, []);

  // Age Filter for game MENU (which games to show): 'all' | 'preschool' | 'primary'
  const [ageFilter, setAgeFilter] = useState<'all' | 'preschool' | 'primary'>('all');

  // Pre-game selection phase: 'selecting' = show level/topic picker, 'ready' = game is active
  const [gameSelectPhase, setGameSelectPhase] = useState<'selecting' | 'ready'>('selecting');

  useEffect(() => {
    const mainEl = document.querySelector('main');
    if (mainEl) {
      mainEl.scrollTop = 0;
    }
  }, [activeGame, gameSelectPhase]);

  // Level and category filters for word pool within games
  const [selectedLevel, setSelectedLevel] = useState<string>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [categoryDropdownOpen, setCategoryDropdownOpen] = useState(false);

  // High Scores / Stats State
  const [tfHighScore, setTfHighScore] = useState<number>(0);
  const [wcHighScore, setWcHighScore] = useState<number>(0);
  const [fmBestTime, setFmBestTime] = useState<number>(0);
  const [stCompletedCount, setStCompletedCount] = useState<number>(0);
  const [blocksHighScore, setBlocksHighScore] = useState<number>(0);
  const [childGameRecords, setChildGameRecords] = useState<Record<string, ChildGameRecords>>({});
  const [blocksBoard, setBlocksBoard] = useState<BlocksCell[][]>(createEmptyBlocksBoard);
  const [blocksPieces, setBlocksPieces] = useState<BlocksShape[]>([]);
  const [blocksSelectedPieceId, setBlocksSelectedPieceId] = useState<string | null>(null);
  const [blocksScore, setBlocksScore] = useState(0);
  const [blocksStatus, setBlocksStatus] = useState<'placing' | 'clearing' | 'question' | 'gameover'>('placing');
  const [blocksQuestion, setBlocksQuestion] = useState<BlocksQuestion | null>(null);
  const [blocksFeedback, setBlocksFeedback] = useState<'correct' | 'wrong' | null>(null);
  const [blocksDraggingPieceId, setBlocksDraggingPieceId] = useState<string | null>(null);
  const [blocksDragPosition, setBlocksDragPosition] = useState<{ x: number; y: number } | null>(null);
  const [blocksHoverPlacement, setBlocksHoverPlacement] = useState<{ row: number; col: number; pieceId: string; valid: boolean } | null>(null);
  const [blocksClearingCells, setBlocksClearingCells] = useState<Set<string>>(new Set());
  const [blocksLastPlacedCells, setBlocksLastPlacedCells] = useState<Set<string>>(new Set());
  const blocksDragAnchorRef = useRef({ row: 0, col: 0 });
  const blocksBoardElementRef = useRef<HTMLDivElement>(null);
  const blocksDragFrameRef = useRef<number | null>(null);
  const blocksDragGhostRef = useRef<HTMLDivElement>(null);
  const blocksDraggingPieceIdRef = useRef<string | null>(null);
  const blocksLatestPointerRef = useRef({ x: 0, y: 0 });
  const blocksBoardBoundsRef = useRef<DOMRect | null>(null);
  const blocksHoverKeyRef = useRef('');
  const blocksPreviewCellsRef = useRef<HTMLElement[]>([]);
  const blocksCellRefs = useRef<Record<string, HTMLElement>>({});

  // Dynamic Content States from Database (with static fallbacks)
  const [flashcards, setFlashcards] = useState<Flashcard[]>(FLASHCARDS_POOL);
  const [stories, setStories] = useState<Story[]>(STORIES_POOL);

  const visibleChildren = children.length > 0 ? children : currentChild ? [currentChild] : [];

  const emptyGameRecords: ChildGameRecords = {
    trueFalseHighScore: 0,
    wordChainHighScore: 0,
    flashcardMatchBestTime: 0,
    storiesCompletedCount: 0,
    blocksHighScore: 0,
    blastHighScore: 0,
  };

  const normalizeGameRecords = (data: Partial<ChildGameRecords> | null | undefined): ChildGameRecords => ({
    trueFalseHighScore: Number(data?.trueFalseHighScore || 0),
    wordChainHighScore: Number(data?.wordChainHighScore || 0),
    flashcardMatchBestTime: Number(data?.flashcardMatchBestTime || 0),
    storiesCompletedCount: Number(data?.storiesCompletedCount || 0),
    blocksHighScore: Number(data?.blocksHighScore || 0),
    blastHighScore: Number(data?.blastHighScore || 0),
  });

  const getDailyRecordsStorageKey = (childId: string) => {
    const dateParts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Ho_Chi_Minh',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date());
    const getPart = (type: Intl.DateTimeFormatPartTypes) =>
      dateParts.find((part) => part.type === type)?.value || '';
    const today = `${getPart('year')}-${getPart('month')}-${getPart('day')}`;
    return `speakjoy_game_records_${childId}_${today}`;
  };

  // Persistent History Caching helpers to prevent quick repeats
  const getRecentHistory = (key: 'tf' | 'fm' | 'st'): string[] => {
    if (!currentChild?.id) return [];
    try {
      const saved = localStorage.getItem(`speakjoy_game_history_${currentChild.id}`);
      if (saved) {
        const parsed = JSON.parse(saved);
        return Array.isArray(parsed[key]) ? parsed[key] : [];
      }
    } catch (e) { }
    return [];
  };

  const saveRecentHistory = (key: 'tf' | 'fm' | 'st', itemId: string, maxItems: number = 10) => {
    if (!currentChild?.id) return;
    try {
      const saved = localStorage.getItem(`speakjoy_game_history_${currentChild.id}`);
      const parsed = saved ? JSON.parse(saved) : {};
      const currentList = Array.isArray(parsed[key]) ? parsed[key] : [];
      const nextList = [...currentList.filter((x: string) => x !== itemId), itemId].slice(-maxItems);
      localStorage.setItem(
        `speakjoy_game_history_${currentChild.id}`,
        JSON.stringify({ ...parsed, [key]: nextList })
      );
    } catch (e) { }
  };

  // Helper to check if a level is locked and how much XP is needed
  const getLevelUnlockStatus = (lvl: string) => {
    const age = currentChild?.age || 0;
    const currentXp = state.xp || 0;

    if (age >= 10) {
      return { isLocked: false, requiredXp: 0 };
    }

    if (age >= 8) {
      if (lvl === 'A1' || lvl === 'A2') {
        return { isLocked: false, requiredXp: 0 };
      }
      if (lvl === 'B1') {
        return { isLocked: currentXp < 50000, requiredXp: 50000 };
      }
      if (lvl === 'B2') {
        return { isLocked: currentXp < 100000, requiredXp: 100000 };
      }
      return { isLocked: false, requiredXp: 0 };
    }

    // Under 8 years old
    if (lvl === 'A1') {
      return { isLocked: false, requiredXp: 0 };
    }
    if (lvl === 'A2') {
      return { isLocked: currentXp < 50000, requiredXp: 50000 };
    }
    return { isLocked: true, requiredXp: 99999 };
  };

  const shouldShowAllLevels = () => {
    const age = currentChild?.age || 0;
    const currentXp = state.xp || 0;
    if (age >= 10) return true;
    if (age >= 8) return currentXp >= 100000; // Unlocked B2
    return currentXp >= 50000; // Unlocked A2
  };

  const getInitialDefaultLevel = () => {
    const age = currentChild?.age || 0;
    const currentXp = state.xp || 0;
    if (age >= 4 && age < 6) {
      const completedKidsWords = Boolean(
        currentChild?.id &&
        typeof window !== 'undefined' &&
        localStorage.getItem(`speakjoy_kids_words_completed_${currentChild.id}`) === 'true',
      );
      return completedKidsWords ? 'A1' : 'kids';
    }
    if (age === 6) return 'A1';
    if (age >= 10) return 'all';
    if (age >= 8) {
      return currentXp >= 100000 ? 'all' : 'A1';
    }
    return currentXp >= 50000 ? 'all' : 'A1';
  };

  // Set default filters based on child age & XP unlock status
  useEffect(() => {
    if (currentChild?.age) {
      if (currentChild.age < 8) {
        setAgeFilter('preschool');
      } else {
        setAgeFilter('primary');
      }
      setSelectedLevel(getInitialDefaultLevel());
    } else {
      setAgeFilter('all');
      setSelectedLevel('all');
    }
    setSelectedCategory('all');
  }, [currentChild?.id]);

  // Load stats, flashcards, and stories from backend database APIs
  useEffect(() => {
    if (currentChild?.id) {
      const childId = currentChild.id;
      let isCancelled = false;
      // Never carry another child's in-memory scores into this profile while
      // local/backend records are loading.
      setTfHighScore(0);
      setWcHighScore(0);
      setFmBestTime(0);
      setStCompletedCount(0);
      setBlocksHighScore(0);
      setBlastHighScore(0);

      // 1. Instant preview from localStorage
      const saved = localStorage.getItem(getDailyRecordsStorageKey(childId));
      if (saved) {
        try {
          const parsed = normalizeGameRecords(JSON.parse(saved));
          setTfHighScore(parsed.trueFalseHighScore);
          setWcHighScore(parsed.wordChainHighScore);
          setFmBestTime(parsed.flashcardMatchBestTime);
          setStCompletedCount(parsed.storiesCompletedCount);
          setBlocksHighScore(parsed.blocksHighScore);
          setBlastHighScore(parsed.blastHighScore);
          setChildGameRecords((previous) => ({ ...previous, [childId]: parsed }));
        } catch (e) { }
      }

      // 2. Fetch fresh stats from backend database
      fetch(`/api/children/${childId}/game-records`, { credentials: 'include' })
        .then((res) => res.json())
        .then((payload) => {
          if (isCancelled) return;
          if (payload.ok && payload.data) {
            const data = normalizeGameRecords(payload.data);
            setTfHighScore(data.trueFalseHighScore || 0);
            setWcHighScore(data.wordChainHighScore || 0);
            setFmBestTime(data.flashcardMatchBestTime || 0);
            setStCompletedCount(data.storiesCompletedCount || 0);
            setBlocksHighScore(data.blocksHighScore || 0);
            setBlastHighScore(data.blastHighScore || 0);
            setChildGameRecords((prev) => ({ ...prev, [childId]: data }));

            // Sync back to local storage
            localStorage.setItem(
              getDailyRecordsStorageKey(childId),
              JSON.stringify(data)
            );
          }
        })
        .catch((e) => console.warn('Failed to load game records from database:', e));

      // 3. Fetch flashcards from database API
      fetch(`/api/children/${childId}/game-flashcards`, { credentials: 'include' })
        .then((res) => res.json())
        .then((payload) => {
          if (isCancelled) return;
          if (payload.ok && Array.isArray(payload.data) && payload.data.length > 0) {
            setFlashcards(payload.data);
          }
        })
        .catch((e) => console.warn('Failed to load flashcards:', e));

      // 4. Fetch stories from database API
      fetch(`/api/children/${childId}/game-stories`, { credentials: 'include' })
        .then((res) => res.json())
        .then((payload) => {
          if (isCancelled) return;
          if (payload.ok && Array.isArray(payload.data) && payload.data.length > 0) {
            setStories(payload.data);
          }
        })
        .catch((e) => console.warn('Failed to load stories:', e));

      return () => {
        isCancelled = true;
      };
    }
  }, [currentChild?.id]);

  // Load per-child game records for family leaderboards.
  useEffect(() => {
    if (visibleChildren.length <= 1) {
      setChildGameRecords((prev) => {
        if (!currentChild?.id) return {};
        return {
          [currentChild.id]: prev[currentChild.id] || normalizeGameRecords({
            trueFalseHighScore: tfHighScore,
            wordChainHighScore: wcHighScore,
            flashcardMatchBestTime: fmBestTime,
            storiesCompletedCount: stCompletedCount,
            blocksHighScore,
            blastHighScore,
          }),
        };
      });
      return;
    }

    let isCancelled = false;
    Promise.all(
      visibleChildren.map((child) =>
        fetch(`/api/children/${child.id}/game-records`, { credentials: 'include' })
          .then((res) => res.json())
          .then((payload) => [child.id, normalizeGameRecords(payload?.ok ? payload.data : null)] as const)
          .catch(() => [child.id, emptyGameRecords] as const)
      )
    ).then((entries) => {
      if (isCancelled) return;
      setChildGameRecords(Object.fromEntries(entries));
    });

    return () => {
      isCancelled = true;
    };
  }, [visibleChildren.map((child) => child.id).join('|'), currentChild?.id]);

  // Save High Score to backend database with localStorage backup
  const saveHighScore = (type: 'tf' | 'wc' | 'fm' | 'st' | 'blocks' | 'blast', newScore: number) => {
    if (!currentChild?.id) return;

    const currentRecords = childGameRecords[currentChild.id] || emptyGameRecords;
    let nextTf = currentRecords.trueFalseHighScore;
    let nextWc = currentRecords.wordChainHighScore;
    let nextFm = currentRecords.flashcardMatchBestTime;
    let nextSt = currentRecords.storiesCompletedCount;
    let nextBlocks = currentRecords.blocksHighScore;
    let nextBlast = currentRecords.blastHighScore;

    if (type === 'tf') {
      nextTf = Math.max(nextTf, newScore);
      setTfHighScore(nextTf);
    } else if (type === 'wc') {
      nextWc = Math.max(nextWc, newScore);
      setWcHighScore(nextWc);
    } else if (type === 'fm') {
      if (nextFm === 0 || newScore < nextFm) {
        nextFm = newScore;
      }
      setFmBestTime(nextFm);
    } else if (type === 'st') {
      nextSt = newScore;
      setStCompletedCount(nextSt);
    } else if (type === 'blocks') {
      nextBlocks = Math.max(nextBlocks, newScore);
      setBlocksHighScore(nextBlocks);
    } else if (type === 'blast') {
      nextBlast = Math.max(nextBlast, newScore);
      setBlastHighScore(nextBlast);
    }

    const localRecords = {
      trueFalseHighScore: nextTf,
      wordChainHighScore: nextWc,
      flashcardMatchBestTime: nextFm,
      storiesCompletedCount: nextSt,
      blocksHighScore: nextBlocks,
      blastHighScore: nextBlast,
    };
    const payload = buildGameRecordPatch(type, newScore);


    // 1. Save to local storage
    localStorage.setItem(getDailyRecordsStorageKey(currentChild.id), JSON.stringify(localRecords));
    setChildGameRecords((prev) => ({ ...prev, [currentChild.id]: localRecords }));

    // 2. Save to backend database API
    void fetch(`/api/children/${currentChild.id}/game-records`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      credentials: 'include',
    })
      .then(async (res) => {
        const contentType = res.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) {
          throw new Error(`Expected JSON but received ${contentType || 'an unknown response type'}`);
        }
        const data = await res.json();
        if (!res.ok || data?.ok === false) {
          throw new Error(data?.message || `HTTP ${res.status}`);
        }
        return normalizeGameRecords(data?.data ?? data);
      })
      .then((savedRecords) => {
        setTfHighScore(savedRecords.trueFalseHighScore);
        setWcHighScore(savedRecords.wordChainHighScore);
        setFmBestTime(savedRecords.flashcardMatchBestTime);
        setStCompletedCount(savedRecords.storiesCompletedCount);
        setBlocksHighScore(savedRecords.blocksHighScore);
        setBlastHighScore(savedRecords.blastHighScore);
        setChildGameRecords((prev) => ({ ...prev, [currentChild.id]: savedRecords }));
        localStorage.setItem(getDailyRecordsStorageKey(currentChild.id), JSON.stringify(savedRecords));
      })
      .catch((err) => console.error('Unable to save game records to database:', err));
  };

  // Speech Synthesis Helper
  const speakText = (text: string) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'en-US';
      utterance.rate = 0.95;
      window.speechSynthesis.speak(utterance);
    }
  };

  // Available level options based on child age
  const childAge = Number(currentChild?.age || 0);
  const isKidsIntroAge = childAge >= 4 && childAge < 6;
  const isAgeSix = childAge === 6;
  const hasCompletedKidsWords = Boolean(currentChild?.id && typeof window !== 'undefined' && localStorage.getItem(`speakjoy_kids_words_completed_${currentChild.id}`) === 'true');
  const availableLevels: string[] = isKidsIntroAge
    ? (hasCompletedKidsWords ? ['kids', 'A1'] : ['kids'])
    : (currentChild?.age && currentChild.age < 8)
      ? ['A1', 'A2']
      : ['A1', 'A2', 'B1', 'B2'];

  const wordMatchesSelectedLevel = (card: Flashcard, level: string) => {
    if (level === 'A1' && isAgeSix) return card.level === 'A1' || card.level === 'kids';
    return card.level === level;
  };

  const getLevelFilteredWords = (allowFallback = true): Flashcard[] => {
    let pool = flashcards;
    if (selectedLevel !== 'all') {
      const levelPool = pool.filter(c => wordMatchesSelectedLevel(c, selectedLevel));
      return levelPool.length > 0 || !allowFallback ? levelPool : pool;
    }

    const age = currentChild?.age || 0;
    const currentXp = state.xp || 0;
    if (isKidsIntroAge) {
      const maxLevels = hasCompletedKidsWords ? ['A1'] : ['kids'];
      pool = pool.filter(c => maxLevels.includes(c.level || ''));
    } else if (isAgeSix) {
      const maxLevels = currentXp >= 50000 ? ['kids', 'A1', 'A2'] : ['kids', 'A1'];
      pool = pool.filter(c => maxLevels.includes(c.level || ''));
    } else if (age < 8) {
      const maxLevels = currentXp >= 50000 ? ['A1', 'A2'] : ['A1'];
      pool = pool.filter(c => maxLevels.includes(c.level || ''));
    } else if (age >= 8 && age < 10) {
      const maxLevels = ['A1', 'A2'];
      if (currentXp >= 50000) maxLevels.push('B1');
      if (currentXp >= 100000) maxLevels.push('B2');
      pool = pool.filter(c => maxLevels.includes(c.level || ''));
    }

    return pool.length > 0 || !allowFallback ? pool : flashcards;
  };

  // Available categories derived dynamically from the currently eligible word pool.
  const availableCategories: string[] = [...new Set(
    getLevelFilteredWords(false).map(f => f.category).filter(Boolean) as string[]
  )].sort();

  useEffect(() => {
    if (selectedCategory !== 'all' && !availableCategories.includes(selectedCategory)) {
      setSelectedCategory('all');
      setCategoryDropdownOpen(false);
    }
  }, [availableCategories, selectedCategory]);

  // Returns the filtered word pool based on current level + category selection
  const getFilteredWords = (minCount = 0): Flashcard[] => {
    let pool = getLevelFilteredWords();
    // Category filter
    if (selectedCategory !== 'all') {
      const cf = pool.filter(c => c.category === selectedCategory);
      if (cf.length >= Math.max(1, minCount)) pool = cf;
    }
    return pool;
  };

  const createBlocksQuestion = (): BlocksQuestion => {
    const pool = getFilteredWords(4);
    const safePool = pool.length >= 4 ? pool : flashcards;
    const card = safePool[Math.floor(Math.random() * safePool.length)] || FLASHCARDS_POOL[0];
    const distractors = shuffleArray<Flashcard>(
      safePool.filter((item) => item.word !== card.word && item.vietnamese !== card.vietnamese)
    )
      .slice(0, 3)
      .map((item) => item.vietnamese);
    const choices = [...new Set([card.vietnamese, ...distractors])];
    while (choices.length < 4) {
      const fallback = FLASHCARDS_POOL.find((item) => !choices.includes(item.vietnamese));
      if (!fallback) break;
      choices.push(fallback.vietnamese);
    }
    return { card, choices: shuffleArray(choices) };
  };

  const canPlaceBlocksShape = (board: BlocksCell[][], shape: BlocksShape, row: number, col: number) =>
    shape.cells.every(([dr, dc]) => {
      const targetRow = row + dr;
      const targetCol = col + dc;
      return targetRow >= 0 && targetRow < BLOCKS_SIZE && targetCol >= 0 && targetCol < BLOCKS_SIZE && !board[targetRow][targetCol];
    });

  const hasBlocksMove = (board: BlocksCell[][], pieces: BlocksShape[]) =>
    pieces.some((piece) =>
      board.some((row, rowIndex) => row.some((_cell, colIndex) => canPlaceBlocksShape(board, piece, rowIndex, colIndex))),
    );

  const startBlocksGame = () => {
    setBlocksBoard(createEmptyBlocksBoard());
    setBlocksPieces(createBlocksPieces());
    setBlocksSelectedPieceId(null);
    setBlocksScore(0);
    setBlocksQuestion(null);
    setBlocksFeedback(null);
    setBlocksDraggingPieceId(null);
    setBlocksDragPosition(null);
    setBlocksHoverPlacement(null);
    blocksDraggingPieceIdRef.current = null;
    blocksBoardBoundsRef.current = null;
    blocksHoverKeyRef.current = '';
    clearBlocksDomPreview();
    blocksBoardElementRef.current?.classList.remove('blocks-board-dragging');
    setBlocksClearingCells(new Set());
    setBlocksStatus('placing');
    setGameSelectPhase('ready');
  };

  const placeBlocksPiece = (row: number, col: number, requestedPieceId?: string) => {
    if (blocksStatus !== 'placing') return;
    const piece = blocksPieces.find((item) => item.id === (requestedPieceId || blocksSelectedPieceId));
    if (!piece || !canPlaceBlocksShape(blocksBoard, piece, row, col)) {
      playAppSound(180, 'sawtooth', 0.06);
      return;
    }

    const nextBoard = blocksBoard.map((line) => [...line]);
    const placedSet = new Set<string>();
    piece.cells.forEach(([dr, dc]) => {
      nextBoard[row + dr][col + dc] = piece.color;
      placedSet.add(`${row + dr}-${col + dc}`);
    });
    setBlocksLastPlacedCells(placedSet);
    window.setTimeout(() => setBlocksLastPlacedCells(new Set()), 300);

    const completeRows = nextBoard.map((line, index) => line.every(Boolean) ? index : -1).filter((index) => index >= 0);
    const completeCols = Array.from({ length: BLOCKS_SIZE }, (_, index) => index)
      .filter((column) => nextBoard.every((line) => Boolean(line[column])));
    const cleared = completeRows.length + completeCols.length;
    const nextScore = blocksScore;
    const remaining = blocksPieces.filter((item) => item.id !== piece.id);
    setBlocksBoard(nextBoard);
    setBlocksSelectedPieceId(null);
    setBlocksPieces(remaining);

    const continueTurn = (settledBoard: BlocksCell[][]) => {
      setBlocksBoard(settledBoard);
      setBlocksScore(nextScore);
      setBlocksClearingCells(new Set());
      if (remaining.length === 0) {
        setBlocksQuestion(createBlocksQuestion());
        setBlocksFeedback(null);
        setBlocksStatus('question');
      } else if (!hasBlocksMove(settledBoard, remaining)) {
        setBlocksStatus('gameover');
        saveHighScore('blocks', nextScore);
      } else {
        setBlocksStatus('placing');
      }
    };

    if (cleared > 0) {
      const flashingCells = new Set<string>();
      completeRows.forEach((line) => Array.from({ length: BLOCKS_SIZE }, (_, column) => flashingCells.add(`${line}-${column}`)));
      completeCols.forEach((column) => Array.from({ length: BLOCKS_SIZE }, (_, line) => flashingCells.add(`${line}-${column}`)));
      setBlocksClearingCells(flashingCells);
      setBlocksStatus('clearing');
      playBlocksBreakSound();
      window.setTimeout(() => {
        const clearedBoard = nextBoard.map((line) => [...line]);
        completeRows.forEach((line) => { clearedBoard[line] = Array<BlocksCell>(BLOCKS_SIZE).fill(null); });
        completeCols.forEach((column) => clearedBoard.forEach((line) => { line[column] = null; }));
        continueTurn(clearedBoard);
      }, 650);
    } else {
      playAppSound(420, 'sine', 0.08);
      continueTurn(nextBoard);
    }
  };

  const answerBlocksQuestion = (choice: string) => {
    if (!blocksQuestion || blocksFeedback === 'correct') return;
    if (choice !== blocksQuestion.card.vietnamese) {
      setBlocksFeedback('wrong');
      playAppSound(180, 'sawtooth', 0.08);
      return;
    }
    setBlocksFeedback('correct');
    playCorrectSound();
    awardGameXp(5);
    const nextScore = blocksScore + 1;
    setBlocksScore(nextScore);
    window.setTimeout(() => {
      const nextPieces = createBlocksPieces();
      setBlocksPieces(nextPieces);
      setBlocksQuestion(null);
      setBlocksFeedback(null);
      if (!hasBlocksMove(blocksBoard, nextPieces)) {
        setBlocksStatus('gameover');
        saveHighScore('blocks', nextScore);
      } else {
        setBlocksStatus('placing');
      }
    }, 500);
  };

  // ==========================================
  // GAME 6: VOCABULARY BLAST (quizlet style)
  // ==========================================
  const startBlastGame = () => {
    setBlastScore(0);
    setBlastXp(0);
    setBlastLevel(1);
    setBlastStreak(0);
    setBlastTimeLeft(60);
    blastStatusRef.current = 'playing';
    setBlastStatus('playing');
    setGameSelectPhase('ready');

    const pool = getFilteredWords(4);
    const safePool = pool.length >= 4 ? pool : flashcards;
    const firstWord = safePool[Math.floor(Math.random() * safePool.length)] || FLASHCARDS_POOL[0];
    setBlastTargetWord(firstWord);

    // Initialize physics arrays
    blastBulletsRef.current = [];
    blastParticlesRef.current = [];
    blastBubblesRef.current = [];

    if (blastTimerIntervalRef.current) clearInterval(blastTimerIntervalRef.current);
    blastTimerIntervalRef.current = setInterval(() => {
      setBlastTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(blastTimerIntervalRef.current);
          blastStatusRef.current = 'gameover';
          setBlastStatus('gameover');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const generateBlastBubbles = (targetCard: Flashcard, pool: Flashcard[]) => {
    const bubblesCount = 5;
    const width = blastCanvasRef.current?.width || 800;
    const radius = width < 480 ? 42 : width < 720 ? 48 : 55;
    const height = (blastCanvasRef.current?.height || 500) - 100;
    
    const distractors: Flashcard[] = [];
    const poolWithoutTarget = pool.filter(c => c.word !== targetCard.word);
    const shuffledPool = shuffleArray(poolWithoutTarget);
    
    for (let i = 0; i < bubblesCount - 1; i++) {
      const card = shuffledPool[i] || FLASHCARDS_POOL[(i + 1) % FLASHCARDS_POOL.length];
      distractors.push(card);
    }
    
    const selectedCards = shuffleArray([targetCard, ...distractors]);
    
    blastBubblesRef.current = selectedCards.map((card, idx) => {
      const sectorWidth = width / bubblesCount;
      const x = sectorWidth * idx + sectorWidth / 2 + (Math.random() * 20 - 10);
      const y = radius + Math.random() * (height - radius * 2 - 20);
      
      const angle = Math.random() * Math.PI * 2;
      const speed = 0.35 + Math.random() * 0.35; // gentle, natural float speed
      
      return {
        id: `bubble_${idx}_${Date.now()}`,
        word: card,
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        radius,
        isCorrect: card.word === targetCard.word,
        isFlashingRed: false,
      };
    });
  };

  const playBlastShotSound = () => {
    playAppSound(120, 'square', 0.1);
    playAppSound(360, 'sawtooth', 0.07);
    window.setTimeout(() => playAppSound(760, 'triangle', 0.08), 24);
  };

  const fireBlastBullet = (clientX: number, clientY: number) => {
    if (blastStatus !== 'playing') return;
    if (!blastCanvasRef.current) return;
    
    const canvas = blastCanvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const clickX = (clientX - rect.left) * dpr;
    const clickY = (clientY - rect.top) * dpr;
    
    const cannonX = canvas.width / 2;
    const cannonY = canvas.height - 30 * dpr;
    
    const dx = clickX - cannonX;
    const dy = clickY - cannonY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    if (distance === 0) return;
    
    const speed = 10 * dpr; // scale bullet speed with backbuffer dpr
    const vx = (dx / distance) * speed;
    const vy = (dy / distance) * speed;
    
    playBlastShotSound();
    
    blastBulletsRef.current.push({
      id: `bullet_${Date.now()}_${Math.random()}`,
      x: cannonX,
      y: cannonY,
      vx,
      vy,
      radius: 8 * dpr,
    });
  };

  const handleBlastMouseMove = (e: React.MouseEvent) => {
    if (blastStatus !== 'playing') return;
    if (!blastCanvasRef.current) return;
    
    const canvas = blastCanvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const mouseX = (e.clientX - rect.left) * dpr;
    const mouseY = (e.clientY - rect.top) * dpr;
    
    blastMousePosRef.current = { x: mouseX, y: mouseY };
    
    const cannonX = canvas.width / 2;
    const cannonY = canvas.height - 30 * dpr;
    
    const dx = mouseX - cannonX;
    const dy = mouseY - cannonY;
    
    blastCannonAngleRef.current = Math.atan2(dy, dx);
  };

  const handleBlastCorrectHit = (card: Flashcard, x: number, y: number) => {
    // Spawn pop particles
    const colors = ['#38bdf8', '#0ea5e9', '#06b6d4', '#22d3ee', '#3b82f6', '#f59e0b'];
    for (let i = 0; i < 22; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1.5 + Math.random() * 3.5;
      blastParticlesRef.current.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        color: colors[Math.floor(Math.random() * colors.length)],
        size: 3 + Math.random() * 4,
        alpha: 1.0,
        life: 45 + Math.floor(Math.random() * 20),
      });
    }

    setBlastScore((prev) => prev + 5);

    setBlastStreak((prevStreak) => {
      const nextStreak = prevStreak + 1;

      setBlastXp((prevXp) => {
        const xpEarned = nextStreak >= 3 ? 10 : 5;
        const nextXp = prevXp + xpEarned;

        let nextLevel = 1;
        if (nextXp >= 500) {
          nextLevel = 4;
        } else if (nextXp >= 200) {
          nextLevel = 3;
        } else if (nextXp >= 50) {
          nextLevel = 2;
        }

        setBlastLevel((prevLvl) => {
          if (nextLevel > prevLvl) {
            playAppSound(880, 'sine', 0.15);
          }
          return nextLevel;
        });

        return nextXp;
      });

      return nextStreak;
    });

    awardGameXp(1);

    const pool = getFilteredWords(4);
    const safePool = pool.length >= 4 ? pool : flashcards;
    
    const poolWithoutCurrent = safePool.filter(c => c.word !== card.word);
    const nextWord = (poolWithoutCurrent.length > 0 
      ? poolWithoutCurrent[Math.floor(Math.random() * poolWithoutCurrent.length)]
      : safePool[Math.floor(Math.random() * safePool.length)]) || FLASHCARDS_POOL[0];
      
    setBlastTargetWord(nextWord);
    generateBlastBubbles(nextWord, safePool);
  };

  const handleBlastIncorrectHit = (bubbleId: string) => {
    setBlastTimeLeft((prev) => Math.max(0, prev - 1));
    setBlastStreak(0);
    // Trigger red flash timing directly on the bubble ref
    const bubble = blastBubblesRef.current.find(b => b.id === bubbleId);
    if (bubble) {
      bubble.isFlashingRed = true;
      setTimeout(() => {
        const b = blastBubblesRef.current.find(item => item.id === bubbleId);
        if (b) b.isFlashingRed = false;
      }, 400);
    }
  };

  // Helper method to draw wrapped text elastically on canvas
  const drawBubbleText = (ctx: CanvasRenderingContext2D, text: string, ipa: string | undefined, x: number, y: number, radius: number, isLight: boolean) => {
    ctx.save();
    
    // Drop shadow configuration for maximum text readability over icons
    ctx.shadowColor = isLight ? 'rgba(255, 255, 255, 0.95)' : 'rgba(0, 0, 0, 0.9)';
    ctx.shadowBlur = isLight ? 3 : 4;
    ctx.shadowOffsetX = 1;
    ctx.shadowOffsetY = 1;
    
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    const textColor = isLight ? '#0c163a' : '#ffffff';
    const subColor = isLight ? 'rgba(12, 22, 58, 0.8)' : 'rgba(255, 255, 255, 0.9)';
    
    // 1. Draw IPA (formatted like Quizlet e.g. //insait//)
    ctx.font = `bold ${radius < 46 ? 9 : 11}px system-ui, sans-serif`;
    ctx.fillStyle = subColor;
    const normalizedIpa = ipa?.trim().replace(/^\/+|\/+$/g, '');
    const ipaText = normalizedIpa ? `/${normalizedIpa}/` : '';
    ctx.fillText(ipaText, x, y - 18);
    
    // 2. Draw Dash Divider
    ctx.font = `bold ${radius < 46 ? 9 : 11}px system-ui, sans-serif`;
    ctx.fillStyle = subColor;
    ctx.fillText('—', x, y - 5);
    
    // 3. Draw Wrapped Vietnamese Translation (Highly bold, bright white)
    ctx.font = `900 ${radius < 46 ? 11 : 13}px system-ui, sans-serif`;
    ctx.fillStyle = textColor;
    
    const words = text.split(' ');
    let line = '';
    const maxLineWidth = radius * 1.6;
    const lines: string[] = [];
    
    for (let n = 0; n < words.length; n++) {
      let testLine = line + words[n] + ' ';
      let metrics = ctx.measureText(testLine);
      if (metrics.width > maxLineWidth && n > 0) {
        lines.push(line.trim());
        line = words[n] + ' ';
      } else {
        line = testLine;
      }
    }
    lines.push(line.trim());
    
    const startY = y + (radius < 46 ? 8 : 10);
    lines.slice(0, 2).forEach((l, idx) => {
      ctx.fillText(l, x, startY + idx * (radius < 46 ? 12 : 14));
    });
    
    ctx.restore();
  };

  const updateBlastPhysics = (timestamp: number) => {
    if (blastStatusRef.current !== 'playing') return;
    if (!blastCanvasRef.current) {
      blastAnimFrameRef.current = requestAnimationFrame(updateBlastPhysics);
      return;
    }

    const canvas = blastCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      blastAnimFrameRef.current = requestAnimationFrame(updateBlastPhysics);
      return;
    }

    // Dynamic resize of canvas backbuffer to avoid blurring while capping resolution on mobile Retinas
    const rect = canvas.getBoundingClientRect();
    const displayWidth = Math.floor(rect.width);
    const displayHeight = Math.floor(rect.height);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const targetWidth = Math.floor(displayWidth * dpr);
    const targetHeight = Math.floor(displayHeight * dpr);
    if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
      canvas.width = targetWidth;
      canvas.height = targetHeight;
    }

    const width = canvas.width;
    const height = canvas.height;

    // Lazy-generate bubbles once canvas dimensions are laid out and non-zero
    if (blastBubblesRef.current.length === 0 && blastTargetWord && width > 100) {
      const pool = getFilteredWords(4);
      const safePool = pool.length >= 4 ? pool : flashcards;
      generateBlastBubbles(blastTargetWord, safePool);
    }

    // 1. Update Particles
    blastParticlesRef.current.forEach((p) => {
      p.x += p.vx;
      p.y += p.vy;
      p.vx *= 0.96;
      p.vy *= 0.96; // drag
      p.life--;
      p.alpha = Math.max(0, p.life / 60);
    });
    blastParticlesRef.current = blastParticlesRef.current.filter(p => p.life > 0);

    // 2. Update Bullets
    blastBulletsRef.current.forEach((b) => {
      b.x += b.vx;
      b.y += b.vy;
    });
    blastBulletsRef.current = blastBulletsRef.current.filter(
      b => b.x >= 0 && b.x <= width && b.y >= 0 && b.y <= height
    );

    // 3. Update & Sway Bubbles
    const sinOffset = timestamp * 0.0025;
    blastBubblesRef.current.forEach((bubble, idx) => {
      bubble.x += bubble.vx;
      bubble.y += bubble.vy;

      // Sinusoidal natural floating sway
      bubble.x += Math.sin(sinOffset + idx) * 0.12;
      bubble.y += Math.cos(sinOffset * 0.8 + idx) * 0.08;

      // Wall bounds bounce
      if (bubble.x - bubble.radius < 0) {
        bubble.vx = Math.abs(bubble.vx);
        bubble.x = bubble.radius;
      } else if (bubble.x + bubble.radius > width) {
        bubble.vx = -Math.abs(bubble.vx);
        bubble.x = width - bubble.radius;
      }

      if (bubble.y - bubble.radius < 0) {
        bubble.vy = Math.abs(bubble.vy);
        bubble.y = bubble.radius;
      } else if (bubble.y + bubble.radius > height - 80) {
        bubble.vy = -Math.abs(bubble.vy);
        bubble.y = height - 80 - bubble.radius;
      }
    });

    // Pairwise bubble-to-bubble elastic collision bounces
    for (let i = 0; i < blastBubblesRef.current.length; i++) {
      for (let j = i + 1; j < blastBubblesRef.current.length; j++) {
        const b1 = blastBubblesRef.current[i];
        const b2 = blastBubblesRef.current[j];
        const dx = b2.x - b1.x;
        const dy = b2.y - b1.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const minDist = b1.radius + b2.radius;

        if (dist < minDist && dist > 0) {
          const overlap = minDist - dist;
          const pushX = (dx / dist) * overlap * 0.5;
          const pushY = (dy / dist) * overlap * 0.5;

          b1.x -= pushX;
          b1.y -= pushY;
          b2.x += pushX;
          b2.y += pushY;

          // Swap velocities
          const tempVx = b1.vx;
          const tempVy = b1.vy;
          b1.vx = b2.vx;
          b1.vy = b2.vy;
          b2.vx = tempVx;
          b2.vy = tempVy;
        }
      }
    }

    // 4. Bullet Collision Detection
    let hitCorrect = false;
    let hitWrong = false;
    let correctCard: Flashcard | null = null;
    let flashBubbleId = '';
    let destroyedBulletId = '';
    let collisionX = 0;
    let collisionY = 0;

    for (const bullet of blastBulletsRef.current) {
      for (const bubble of blastBubblesRef.current) {
        const dx = bubble.x - bullet.x;
        const dy = bubble.y - bullet.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        if (dist < bubble.radius + bullet.radius) {
          destroyedBulletId = bullet.id;
          collisionX = bubble.x;
          collisionY = bubble.y;
          
          if (bubble.isCorrect) {
            hitCorrect = true;
            correctCard = bubble.word;
          } else {
            hitWrong = true;
            flashBubbleId = bubble.id;
          }
          break;
        }
      }
      if (destroyedBulletId) break;
    }

    if (destroyedBulletId) {
      blastBulletsRef.current = blastBulletsRef.current.filter(b => b.id !== destroyedBulletId);
    }

    if (hitCorrect && correctCard) {
      playCorrectSound();
      handleBlastCorrectHit(correctCard, collisionX, collisionY);
    } else if (hitWrong) {
      playAppSound(150, 'sawtooth', 0.15);
      handleBlastIncorrectHit(flashBubbleId);
    }

    // 5. Draw Canvas Frame
    ctx.clearRect(0, 0, width, height);

    // Animated deep-space backdrop. Everything stays deterministic per frame so it
    // does not flicker or compete with the answer bubbles.
    const spaceGradient = ctx.createLinearGradient(0, 0, 0, height);
    spaceGradient.addColorStop(0, isLight ? '#172554' : '#020617');
    spaceGradient.addColorStop(0.55, isLight ? '#1e1b4b' : '#0f172a');
    spaceGradient.addColorStop(1, isLight ? '#082f49' : '#071a2a');
    ctx.fillStyle = spaceGradient;
    ctx.fillRect(0, 0, width, height);

    for (let index = 0; index < 70; index++) {
      const starX = (index * 83 + 29) % Math.max(width, 1);
      const baseY = (index * 47 + 13) % Math.max(height, 1);
      const starY = (baseY + timestamp * (0.006 + (index % 3) * 0.003)) % Math.max(height, 1);
      const pulse = 0.45 + Math.sin(timestamp * 0.002 + index) * 0.3;
      const starRadius = index % 11 === 0 ? 1.8 : index % 4 === 0 ? 1.2 : 0.7;
      ctx.beginPath();
      ctx.arc(starX, starY, starRadius, 0, Math.PI * 2);
      ctx.fillStyle = index % 9 === 0 ? `rgba(125,211,252,${pulse})` : `rgba(255,255,255,${pulse})`;
      ctx.fill();
    }

    // Faint drifting asteroids provide depth without looking like clickable targets.
    for (let index = 0; index < 6; index++) {
      const asteroidRadius = 12 + (index % 3) * 5;
      const asteroidX = ((index * 181 + timestamp * (0.009 + index * 0.001)) % (width + 100)) - 50;
      const asteroidY = 45 + ((index * 97) % Math.max(height - 150, 80));
      ctx.save();
      ctx.translate(asteroidX, asteroidY);
      ctx.rotate(timestamp * 0.00015 * (index % 2 === 0 ? 1 : -1));
      ctx.globalAlpha = 0.28;
      ctx.beginPath();
      for (let point = 0; point < 9; point++) {
        const pointAngle = (point / 9) * Math.PI * 2;
        const unevenRadius = asteroidRadius * (0.78 + ((point * 7 + index) % 4) * 0.08);
        const pointX = Math.cos(pointAngle) * unevenRadius;
        const pointY = Math.sin(pointAngle) * unevenRadius;
        if (point === 0) ctx.moveTo(pointX, pointY);
        else ctx.lineTo(pointX, pointY);
      }
      ctx.closePath();
      const rockGradient = ctx.createRadialGradient(-5, -6, 1, 0, 0, asteroidRadius);
      rockGradient.addColorStop(0, '#94a3b8');
      rockGradient.addColorStop(0.55, '#475569');
      rockGradient.addColorStop(1, '#1e293b');
      ctx.fillStyle = rockGradient;
      ctx.fill();
      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(-asteroidRadius * 0.25, -asteroidRadius * 0.1, asteroidRadius * 0.2, 0, Math.PI * 2);
      ctx.fillStyle = '#334155';
      ctx.fill();
      ctx.restore();
    }

    // Draw Laser Aiming Guide Line (Neon color matching theme)
    ctx.beginPath();
    ctx.setLineDash([4, 6]);
    ctx.moveTo(width / 2, height - 30);
    ctx.lineTo(blastMousePosRef.current.x, blastMousePosRef.current.y);
    ctx.strokeStyle = isLight ? 'rgba(79, 70, 229, 0.4)' : 'rgba(56, 189, 248, 0.3)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw Pop Particles
    blastParticlesRef.current.forEach((p) => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.globalAlpha = p.alpha;
      ctx.shadowBlur = 6;
      ctx.shadowColor = p.color;
      ctx.fill();
      ctx.shadowBlur = 0; // reset
    });
    ctx.globalAlpha = 1.0;

    // Draw Bullets (Glowing Neon Yellow Balls)
    blastBulletsRef.current.forEach((b) => {
      const trailLength = 38;
      const trailGradient = ctx.createLinearGradient(
        b.x,
        b.y,
        b.x - (b.vx / 10) * trailLength,
        b.y - (b.vy / 10) * trailLength,
      );
      trailGradient.addColorStop(0, 'rgba(255,255,255,0.95)');
      trailGradient.addColorStop(0.35, 'rgba(251,191,36,0.75)');
      trailGradient.addColorStop(1, 'rgba(245,158,11,0)');
      ctx.beginPath();
      ctx.moveTo(b.x, b.y);
      ctx.lineTo(b.x - (b.vx / 10) * trailLength, b.y - (b.vy / 10) * trailLength);
      ctx.strokeStyle = trailGradient;
      ctx.lineWidth = 7;
      ctx.lineCap = 'round';
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(b.x, b.y, b.radius + 5, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.72)';
      ctx.lineWidth = 2;
      ctx.shadowBlur = 14;
      ctx.shadowColor = '#38bdf8';
      ctx.stroke();
      ctx.shadowBlur = 0;

      ctx.beginPath();
      ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
      const bulletGradient = ctx.createRadialGradient(b.x - 2, b.y - 2, 0, b.x, b.y, b.radius);
      bulletGradient.addColorStop(0, '#ffffff');
      bulletGradient.addColorStop(0.35, '#fde68a');
      bulletGradient.addColorStop(1, '#f59e0b');
      ctx.fillStyle = bulletGradient;
      ctx.shadowBlur = 16;
      ctx.shadowColor = '#f59e0b';
      ctx.fill();
      ctx.shadowBlur = 0;
    });

    // Draw Cannon (Sci-Fi spaceship turret)
    const cannonX = width / 2;
    const cannonY = height - 30;
    const angle = blastCannonAngleRef.current;
    const muzzleFlash = blastBulletsRef.current.some((bullet) => Math.hypot(bullet.x - cannonX, bullet.y - cannonY) < 72);

    // Draw a layered energy barrel that follows the aiming direction.
    ctx.save();
    ctx.translate(cannonX, cannonY);
    ctx.rotate(angle + Math.PI / 2);

    const barrelGrad = ctx.createLinearGradient(-16, -54, 16, 0);
    barrelGrad.addColorStop(0, '#0f172a');
    barrelGrad.addColorStop(0.24, '#64748b');
    barrelGrad.addColorStop(0.5, '#cbd5e1');
    barrelGrad.addColorStop(0.76, '#475569');
    barrelGrad.addColorStop(1, '#0f172a');
    ctx.fillStyle = barrelGrad;
    ctx.beginPath();
    ctx.roundRect(-15, -54, 30, 55, [8, 8, 5, 5]);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#38bdf8';
    ctx.stroke();

    ctx.fillStyle = '#082f49';
    ctx.beginPath();
    ctx.roundRect(-7, -49, 14, 44, 4);
    ctx.fill();

    const energyGrad = ctx.createLinearGradient(0, -49, 0, -5);
    energyGrad.addColorStop(0, '#fef08a');
    energyGrad.addColorStop(0.35, '#38bdf8');
    energyGrad.addColorStop(1, '#0ea5e9');
    ctx.fillStyle = energyGrad;
    ctx.shadowBlur = 12;
    ctx.shadowColor = '#38bdf8';
    ctx.beginPath();
    ctx.roundRect(-3, -48, 6, 41, 3);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Reinforced muzzle ring.
    ctx.fillStyle = '#e2e8f0';
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(-18, -59, 36, 10, 3);
    ctx.fill();
    ctx.stroke();

    if (muzzleFlash) {
      ctx.fillStyle = '#fef08a';
      ctx.shadowBlur = 22;
      ctx.shadowColor = '#f59e0b';
      ctx.beginPath();
      ctx.moveTo(0, -76);
      ctx.lineTo(8, -60);
      ctx.lineTo(0, -64);
      ctx.lineTo(-8, -60);
      ctx.closePath();
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    ctx.restore();

    // Armored base with an illuminated energy core.
    const baseGrad = ctx.createRadialGradient(cannonX, cannonY - 10, 2, cannonX, cannonY, 42);
    baseGrad.addColorStop(0, '#94a3b8');
    baseGrad.addColorStop(0.42, '#334155');
    baseGrad.addColorStop(1, '#020617');
    ctx.fillStyle = baseGrad;
    ctx.beginPath();
    ctx.arc(cannonX, cannonY, 42, 0, Math.PI, true);
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#38bdf8';
    ctx.stroke();

    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.roundRect(cannonX - 50, cannonY - 6, 100, 13, 6);
    ctx.fill();
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Cannon core glow.
    ctx.beginPath();
    ctx.arc(cannonX, cannonY - 10, 11, 0, Math.PI * 2);
    ctx.fillStyle = '#fbbf24';
    ctx.shadowBlur = 18;
    ctx.shadowColor = '#f59e0b';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#fef3c7';
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Give every answer the same visual weight so the correct bubble is never revealed by styling.
    const bubblePalettes = isLight
      ? [
          ['#ffffff', '#bfdbfe', '#2563eb'],
          ['#ffffff', '#99f6e4', '#0d9488'],
          ['#ffffff', '#fde68a', '#d97706'],
          ['#ffffff', '#e9d5ff', '#a855f7'],
          ['#ffffff', '#fecdd3', '#e11d48'],
        ]
      : [
          ['#3b82f6', '#1d4ed8', '#93c5fd'],
          ['#14b8a6', '#0f766e', '#5eead4'],
          ['#f59e0b', '#92400e', '#fde68a'],
          ['#a855f7', '#7e22ce', '#d8b4fe'],
          ['#f43f5e', '#be123c', '#fda4af'],
        ];

    blastBubblesRef.current.forEach((bubble, bubbleIndex) => {
      ctx.save();
      
      // Outer boundary path
      ctx.beginPath();
      ctx.arc(bubble.x, bubble.y, bubble.radius, 0, Math.PI * 2);

      const palette = bubblePalettes[bubbleIndex % bubblePalettes.length];
      const fillGrad = ctx.createRadialGradient(
        bubble.x - bubble.radius * 0.2, bubble.y - bubble.radius * 0.2, 0,
        bubble.x, bubble.y, bubble.radius
      );
      if (bubble.isFlashingRed) {
        if (isLight) {
          fillGrad.addColorStop(0, 'rgba(254, 226, 226, 0.85)');
          fillGrad.addColorStop(1, 'rgba(239, 68, 68, 0.85)');
        } else {
          fillGrad.addColorStop(0, 'rgba(239, 68, 68, 0.6)');
          fillGrad.addColorStop(1, 'rgba(153, 27, 27, 0.85)');
        }
      } else {
        fillGrad.addColorStop(0, palette[0]);
        fillGrad.addColorStop(1, palette[1]);
      }
      ctx.fillStyle = fillGrad;
      ctx.fill();

      ctx.lineWidth = 2.5;
      if (bubble.isFlashingRed) {
        ctx.strokeStyle = '#ef4444';
        ctx.shadowColor = '#ef4444';
      } else {
        ctx.strokeStyle = palette[2];
        ctx.shadowColor = palette[2];
      }
      ctx.shadowBlur = bubble.isFlashingRed ? 18 : 8;
      ctx.stroke();
      ctx.restore();

      // Faded background emoji (acts as the Quizlet background illustration)
      ctx.save();
      ctx.globalAlpha = isLight ? 0.36 : 0.42;
      ctx.font = `${bubble.radius < 46 ? 34 : 46}px "Segoe UI Emoji", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(bubble.word.emoji || '📝', bubble.x, bubble.y);
      ctx.restore();

      // Draw Wrapped Translation and IPA
      drawBubbleText(ctx, bubble.word.vietnamese, bubble.word.ipa, bubble.x, bubble.y, bubble.radius, isLight);
    });

    blastAnimFrameRef.current = requestAnimationFrame(updateBlastPhysics);
  };

  useEffect(() => {
    if (activeGame === 'blast' && blastStatus === 'playing') {
      blastAnimFrameRef.current = requestAnimationFrame(updateBlastPhysics);
    }
    return () => {
      if (blastAnimFrameRef.current) {
        cancelAnimationFrame(blastAnimFrameRef.current);
      }
    };
  }, [activeGame, blastStatus, blastTargetWord, isLight]);

  useEffect(() => {
    if (activeGame !== 'blast' || blastStatus !== 'playing' || !blastTargetWord) return;

    const frameId = window.requestAnimationFrame(() => {
      const canvas = blastCanvasRef.current;
      if (!canvas || blastBubblesRef.current.length > 0) return;
      const rect = canvas.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      canvas.width = Math.floor(rect.width);
      canvas.height = Math.floor(rect.height);
      const pool = getFilteredWords(4);
      generateBlastBubbles(blastTargetWord, pool.length >= 4 ? pool : flashcards);
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [activeGame, blastStatus, blastTargetWord]);

  useEffect(() => {
    if (blastStatus === 'gameover') {
      saveHighScore('blast', blastScore);
    }
  }, [blastStatus]);

  const getBlocksPreview = (row: number, col: number) => {
    if (!blocksHoverPlacement) return null;
    const piece = blocksPieces.find((item) => item.id === blocksHoverPlacement.pieceId);
    if (!piece || !piece.cells.some(([dr, dc]) => blocksHoverPlacement.row + dr === row && blocksHoverPlacement.col + dc === col)) {
      return null;
    }
    return {
      color: blocksHoverPlacement.valid ? piece.color : '#991b1b',
      valid: blocksHoverPlacement.valid,
    };
  };

  const getBlocksPlacementAtPoint = (piece: BlocksShape, clientX: number, clientY: number) => {
    const board = blocksBoardElementRef.current;
    if (!board) return null;
    const bounds = blocksBoardBoundsRef.current || board.getBoundingClientRect();
    const tolerance = 14;
    if (clientX < bounds.left - tolerance || clientX > bounds.right + tolerance || clientY < bounds.top - tolerance || clientY > bounds.bottom + tolerance) {
      return null;
    }
    const hoveredRow = Math.max(0, Math.min(BLOCKS_SIZE - 1, Math.floor(((clientY - bounds.top) / bounds.height) * BLOCKS_SIZE)));
    const hoveredCol = Math.max(0, Math.min(BLOCKS_SIZE - 1, Math.floor(((clientX - bounds.left) / bounds.width) * BLOCKS_SIZE)));
    const row = hoveredRow - blocksDragAnchorRef.current.row;
    const col = hoveredCol - blocksDragAnchorRef.current.col;
    return { row, col, valid: canPlaceBlocksShape(blocksBoard, piece, row, col) };
  };

  const clearBlocksDomPreview = () => {
    blocksPreviewCellsRef.current.forEach((cell) => {
      cell.classList.remove('blocks-drag-preview-valid', 'blocks-drag-preview-invalid');
      cell.style.removeProperty('--blocks-preview-color');
    });
    blocksPreviewCellsRef.current = [];
  };

  const updateBlocksDomPreview = (piece: BlocksShape, placement: { row: number; col: number; valid: boolean } | null) => {
    clearBlocksDomPreview();
    if (!placement) return;

    const previewCells: HTMLElement[] = [];
    piece.cells.forEach(([rowOffset, colOffset]) => {
      const row = placement.row + rowOffset;
      const col = placement.col + colOffset;
      const cell = blocksCellRefs.current[`${row}-${col}`];
      if (!cell) return;
      cell.style.setProperty('--blocks-preview-color', placement.valid ? piece.color : '#991b1b');
      cell.classList.add(placement.valid ? 'blocks-drag-preview-valid' : 'blocks-drag-preview-invalid');
      previewCells.push(cell);
    });
    blocksPreviewCellsRef.current = previewCells;
  };

  const moveBlocksDragGhost = (clientX: number, clientY: number) => {
    const ghost = blocksDragGhostRef.current;
    if (!ghost) return;
    const offsetX = -blocksDragAnchorRef.current.col * 28 - 15;
    const offsetY = -blocksDragAnchorRef.current.row * 28 - 15;
    ghost.style.transform = `translate3d(${clientX + offsetX}px, ${clientY + offsetY}px, 0)`;
  };

  const playBlocksBreakSound = () => {
    playAppSound(880, 'square', 0.08);
    window.setTimeout(() => playAppSound(620, 'triangle', 0.07), 90);
    window.setTimeout(() => playAppSound(360, 'sawtooth', 0.06), 180);
  };

  // Reusable pre-game Level + Topic selector UI
  const renderGameConfigSelector = (onStart: () => void, startBtnClasses: string) => {
    const selectorPool = getFilteredWords();
    const btnBase = 'py-3 px-3 rounded-2xl text-xs sm:text-sm font-extrabold border transition-all duration-150 cursor-pointer shadow-sm flex items-center justify-center gap-1.5 select-none active:scale-[0.97] text-center leading-normal';
    const activeCls = 'bg-amber-500 border-amber-600 text-white shadow-md font-black scale-[1.02]';
    const idleCls = isLight
      ? 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300'
      : 'bg-[#18282f] border-[#243e49] text-slate-300 hover:bg-[#20353f] hover:border-[#2f515e]';
    const topicLabel = selectedCategory === 'all'
      ? (globalLang === 'en' ? 'All Topics' : 'Tất cả chủ đề')
      : selectedCategory;
    const topicIcon = selectedCategory === 'all' ? '🌟' : getCategoryEmoji(selectedCategory);
    const topicOptions = [
      { id: 'all', label: globalLang === 'en' ? 'All Topics' : 'Tất cả chủ đề', icon: '🌟' },
      ...availableCategories.map((category) => ({
        id: category,
        label: category,
        icon: getCategoryEmoji(category),
      })),
    ];

    return (
      <div className="flex-1 flex flex-col gap-4 py-2 overflow-y-auto custom-scrollbar">
        {/* Level section */}
        <div className="space-y-2.5">
          <p className="text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1">
            <span>📊</span>
            <span>{globalLang === 'en' ? 'Select Level' : 'Chọn Cấp độ'}</span>
          </p>
          <div className="grid grid-cols-2 gap-2">
            {shouldShowAllLevels() && (
              <button
                onClick={() => { playAppSound(300, 'sine', 0.05); setSelectedLevel('all'); }}
                className={`col-span-2 ${btnBase} ${selectedLevel === 'all' ? activeCls : idleCls}`}
              >
                🌟{' '}
                {currentChild?.age && currentChild.age < 8
                  ? (globalLang === 'en' ? 'All Levels (A1 & A2)' : 'Tất cả cấp độ (A1 & A2)')
                  : currentChild?.age && currentChild.age < 10
                  ? (globalLang === 'en' ? 'All Levels (A1, A2, B1, B2)' : 'Tất cả cấp độ (A1, A2, B1, B2)')
                  : (globalLang === 'en' ? 'All Levels' : 'Tất cả cấp độ')}
              </button>
            )}
            {availableLevels.map(lvl => {
              const { isLocked, requiredXp } = getLevelUnlockStatus(lvl);
              const lockedCls = 'bg-slate-100/50 border-slate-200 text-slate-400 dark:bg-slate-900/30 dark:border-slate-800 dark:text-slate-500 cursor-not-allowed opacity-65 flex items-center justify-center gap-1.5 font-bold';
              return (
                <button
                  key={lvl}
                  disabled={isLocked}
                  onClick={() => {
                    if (!isLocked) {
                      playAppSound(300, 'sine', 0.05);
                      setSelectedLevel(lvl);
                    }
                  }}
                  className={`${btnBase} ${isLocked ? lockedCls : selectedLevel === lvl ? activeCls : idleCls}`}
                >
                  {isLocked ? (
                    <span className="flex items-center gap-1">
                      <span>🔒 {lvl}</span>
                      <span className="text-[9px] font-bold">({requiredXp} XP)</span>
                    </span>
                  ) : (
                    lvl
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Category section */}
        <div className="space-y-2.5">
          <p className="text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1">
            <span>🗂️</span>
            <span>{globalLang === 'en' ? 'Select Topic' : 'Chọn Chủ đề'}</span>
          </p>
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                playAppSound(categoryDropdownOpen ? 260 : 360, 'sine', 0.04);
                setCategoryDropdownOpen((open) => !open);
              }}
              className={`group flex w-full min-h-[54px] items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left shadow-lg transition-all duration-200 active:scale-[0.99] ${
                selectedCategory === 'all'
                  ? 'border-amber-500 bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-amber-500/20'
                  : isLight
                    ? 'border-emerald-200 bg-white text-slate-900 shadow-emerald-100/70 hover:border-emerald-300 hover:bg-emerald-50'
                    : 'border-emerald-500/30 bg-[#122d33] text-white shadow-black/20 hover:border-emerald-400/50 hover:bg-[#173942]'
              }`}
              aria-expanded={categoryDropdownOpen}
              aria-haspopup="listbox"
            >
              <span className="flex min-w-0 items-center gap-3">
                <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl text-lg ${
                  selectedCategory === 'all'
                    ? 'bg-white/20'
                    : isLight ? 'bg-emerald-100' : 'bg-emerald-400/10'
                }`}>
                  {topicIcon}
                </span>
                <span className="min-w-0">
                  <span className={`block text-[10px] font-black uppercase tracking-[0.18em] ${
                    selectedCategory === 'all'
                      ? 'text-white/75'
                      : isLight ? 'text-emerald-600' : 'text-emerald-300'
                  }`}>
                    {globalLang === 'en' ? 'Topic' : 'Chủ đề'}
                  </span>
                  <span className="block truncate text-sm font-black sm:text-base">{topicLabel}</span>
                </span>
              </span>
              <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl transition ${
                selectedCategory === 'all'
                  ? 'bg-white/20 text-white'
                  : isLight ? 'bg-slate-100 text-slate-600 group-hover:bg-emerald-100' : 'bg-white/10 text-emerald-200'
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
                      ? 'border-emerald-100 bg-white/95 shadow-emerald-900/10'
                      : 'border-emerald-500/25 bg-[#0f2228]/95 shadow-black/45'
                  } backdrop-blur-xl`}
                  role="listbox"
                >
                  <div className="max-h-72 overflow-y-auto p-2 custom-scrollbar">
                    {topicOptions.map((option) => {
                      const isSelected = selectedCategory === option.id;
                      return (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() => {
                            playAppSound(300, 'sine', 0.05);
                            setSelectedCategory(option.id);
                            setCategoryDropdownOpen(false);
                          }}
                          className={`flex min-h-[44px] w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left transition active:scale-[0.98] ${
                            isSelected
                              ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-md'
                              : isLight
                                ? 'text-slate-700 hover:bg-emerald-50 hover:text-emerald-800'
                                : 'text-slate-200 hover:bg-emerald-400/10 hover:text-white'
                          }`}
                          role="option"
                          aria-selected={isSelected}
                        >
                          <span className="flex min-w-0 items-center gap-2.5">
                            <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg text-base ${
                              isSelected ? 'bg-white/20' : isLight ? 'bg-slate-100' : 'bg-white/10'
                            }`}>
                              {option.icon}
                            </span>
                            <span className="truncate text-xs font-black sm:text-sm">{option.label}</span>
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

        {/* Word count indicator */}
        <p className={`text-center text-xs font-extrabold mt-1 ${selectorPool.length > 5 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
          {selectorPool.length > 0
            ? `✨ ${selectorPool.length} ${globalLang === 'en' ? 'words found!' : 'từ sẵn sàng học!'}`
            : `⚠️ ${globalLang === 'en' ? 'No words found — try other filters.' : 'Không tìm thấy từ nào — thử đổi bộ lọc.'}`}
        </p>

        {/* Start button */}
        <button
          onClick={selectorPool.length > 0 ? onStart : undefined}
          disabled={selectorPool.length === 0}
          className={`w-full min-h-[50px] sm:min-h-[54px] text-white rounded-2xl font-black text-xs sm:text-sm uppercase border-b-4 transition-all duration-150 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed hover:scale-[1.01] active:scale-[0.98] cursor-pointer ${startBtnClasses}`}
        >
          <Play className="w-4 h-4 fill-current" />
          {globalLang === 'en' ? 'Start Playing!' : 'Bắt Đầu Chơi!'}
        </button>
      </div>
    );
  };

  // ==========================================
  // GAME 1: TRUE/FALSE FLASHCARDS
  // ==========================================
  const [tfCard, setTfCard] = useState<Flashcard>(FLASHCARDS_POOL[0]);
  const [tfStatement, setTfStatement] = useState<string>('');
  const [tfIsCorrectMatch, setTfIsCorrectMatch] = useState<boolean>(true);
  const [tfScore, setTfScore] = useState<number>(0);
  const [tfState, setTfState] = useState<'playing' | 'answered' | 'speaking' | 'wrong' | 'done'>('playing');
  const [tfFeedback, setTfFeedback] = useState<string>('');
  const [tfIsRecording, setTfIsRecording] = useState<boolean>(false);
  const [tfInterimText, setTfInterimText] = useState<string>('');
  const tfRecognitionRef = useRef<any>(null);

  const initTfTurn = () => {
    let childCards = getFilteredWords(6);
    if (childCards.length === 0) {
      childCards = flashcards;
    }

    const recentTf = getRecentHistory('tf');
    let availableCards = childCards.filter(card => !recentTf.includes(card.word));
    if (availableCards.length === 0) {
      availableCards = childCards;
      try {
        const saved = localStorage.getItem(`speakjoy_game_history_${currentChild?.id}`);
        const parsed = saved ? JSON.parse(saved) : {};
        parsed.tf = [];
        localStorage.setItem(`speakjoy_game_history_${currentChild?.id}`, JSON.stringify(parsed));
      } catch (e) { }
    }

    const randomCard = availableCards[Math.floor(Math.random() * availableCards.length)] || childCards[0];
    if (randomCard) {
      saveRecentHistory('tf', randomCard.word, 15);
    }

    const isMatch = Math.random() > 0.5;
    let statement = '';

    if (isMatch) {
      statement = `This is a ${randomCard.word}.`;
    } else {
      let otherCard = randomCard;
      let attempts = 0;
      while ((!otherCard || otherCard.word === randomCard.word) && attempts < 10) {
        otherCard = childCards[Math.floor(Math.random() * childCards.length)];
        attempts++;
      }
      statement = `This is a ${otherCard ? otherCard.word : 'apple'}.`;
    }

    setTfCard(randomCard);
    setTfStatement(statement);
    setTfIsCorrectMatch(isMatch);
    setTfState('playing');
    setTfFeedback('');
    setTfInterimText('');
    setTfIsRecording(false);
  };


  const handleTfChoice = (choice: boolean) => {
    if (tfState !== 'playing') return;

    if (choice === tfIsCorrectMatch) {
      playCorrectSound();
      setTfState('speaking');
      setTfFeedback(globalLang === 'en' ? `Correct! Speak: "${tfCard.word}"` : `Chính xác! Bé hãy đọc to: "${tfCard.word}"`);
      speakText(`Correct. Now say ${tfCard.word}`);
      setTimeout(() => startTfSpeechRecognition(), 1200);
    } else {
      playAppSound(150, 'sawtooth', 0.2);
      setTfState('wrong');
      setTfFeedback(globalLang === 'en' ? `Not quite! Let's try another card.` : `Chưa đúng rồi! Chúng ta thử thẻ khác nhé.`);
    }
  };

  const startTfSpeechRecognition = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    if (tfRecognitionRef.current) {
      try { tfRecognitionRef.current.abort(); } catch (e) { }
    }

    const rec = new SpeechRecognition();
    rec.continuous = false;
    rec.lang = 'en-US';
    rec.interimResults = true;

    rec.onstart = () => {
      setTfIsRecording(true);
      setTfInterimText('');
    };

    rec.onresult = (event: any) => {
      const result = event.results[0][0].transcript.toLowerCase().trim().replace(/[^a-z]/g, '');
      setTfInterimText(result);
      if (event.results[0].isFinal) {
        const target = tfCard.word.toLowerCase().replace(/[^a-z]/g, '');
        if (result === target || result.includes(target) || target.includes(result)) {
          playCorrectSound();
          const nextScore = tfScore + 1;
          setTfScore(nextScore);
          saveHighScore('tf', nextScore);
          awardGameXp(5);

          setTfFeedback(globalLang === 'en' ? `Excellent! You said it right! 🎉` : `Tuyệt vời! Bé phát âm chuẩn rồi! 🎉`);
          setTfState('done');
          setTfIsRecording(false);
        } else {
          setTfFeedback(globalLang === 'en' ? `I heard "${result}". Try saying "${tfCard.word}" again!` : `Sunny nghe thành "${result}". Bé nói lại từ "${tfCard.word}" nhé!`);
          setTfInterimText('');
        }
      }
    };

    rec.onerror = () => { setTfIsRecording(false); };
    rec.onend = () => { setTfIsRecording(false); };

    tfRecognitionRef.current = rec;
    rec.start();
  };

  // ==========================================
  // GAME 2: WORD CHAIN
  // ==========================================
  const [wcChain, setWcChain] = useState<string[]>([]);
  const [wcNextLetter, setWcNextLetter] = useState<string>('a');
  const [wcFeedback, setWcFeedback] = useState<LocalizedGameMessage | null>(null);
  const [wcGameStatus, setWcGameStatus] = useState<'idle' | 'playing' | 'ended'>('idle');
  const [wcIsRecording, setWcIsRecording] = useState<boolean>(false);
  const [wcInterimText, setWcInterimText] = useState<string>('');
  const [wcHint, setWcHint] = useState<WordChainHint | null>(null);
  const [wcAttempt, setWcAttempt] = useState<WordChainAttempt | null>(null);
  const [wcRetryCount, setWcRetryCount] = useState(0);
  const wcRecognitionRef = useRef<any>(null);
  const wcHintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wcSunnyTurnTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wcHintGenerationRef = useRef(0);
  const wcHintRef = useRef<WordChainHint | null>(null);
  const wcLastStarterRef = useRef('');

  const WC_FALLBACK_HINTS: Record<string, Array<{ word: string; ipa: string }>> = {
    a: [{ word: 'apple', ipa: '/ˈæp.əl/' }], b: [{ word: 'ball', ipa: '/bɔːl/' }],
    c: [{ word: 'cat', ipa: '/kæt/' }], d: [{ word: 'dog', ipa: '/dɒɡ/' }],
    e: [{ word: 'egg', ipa: '/eɡ/' }, { word: 'elbow', ipa: '/ˈel.bəʊ/' }], f: [{ word: 'fish', ipa: '/fɪʃ/' }],
    g: [{ word: 'goat', ipa: '/ɡəʊt/' }], h: [{ word: 'hat', ipa: '/hæt/' }],
    i: [{ word: 'ice', ipa: '/aɪs/' }], j: [{ word: 'juice', ipa: '/dʒuːs/' }],
    k: [{ word: 'kite', ipa: '/kaɪt/' }], l: [{ word: 'leaf', ipa: '/liːf/' }],
    m: [{ word: 'moon', ipa: '/muːn/' }], n: [{ word: 'noon', ipa: '/nuːn/' }, { word: 'night', ipa: '/naɪt/' }],
    o: [{ word: 'owl', ipa: '/aʊl/' }], p: [{ word: 'pen', ipa: '/pen/' }],
    q: [{ word: 'queen', ipa: '/kwiːn/' }], r: [{ word: 'rain', ipa: '/reɪn/' }],
    s: [{ word: 'sun', ipa: '/sʌn/' }], t: [{ word: 'tree', ipa: '/triː/' }],
    u: [{ word: 'umbrella', ipa: '/ʌmˈbrel.ə/' }], v: [{ word: 'van', ipa: '/væn/' }],
    w: [{ word: 'water', ipa: '/ˈwɔː.tər/' }], x: [{ word: 'xylophone', ipa: '/ˈzaɪ.lə.fəʊn/' }],
    y: [{ word: 'yak', ipa: '/jæk/' }], z: [{ word: 'zoo', ipa: '/zuː/' }],
  };

  const WC_FALLBACK_MEANINGS: Record<string, string> = {
    apple: 'quả táo', ball: 'quả bóng', cat: 'con mèo', dog: 'con chó',
    egg: 'quả trứng', elbow: 'khuỷu tay', fish: 'con cá', goat: 'con dê',
    hat: 'cái mũ', ice: 'nước đá', juice: 'nước ép', kite: 'con diều',
    leaf: 'chiếc lá', moon: 'mặt trăng', noon: 'buổi trưa', night: 'ban đêm',
    owl: 'con cú', pen: 'bút mực', queen: 'nữ hoàng', rain: 'mưa',
    sun: 'mặt trời', tree: 'cái cây', umbrella: 'cái ô', van: 'xe tải nhỏ',
    water: 'nước', xylophone: 'đàn phiến gỗ', yak: 'bò Tây Tạng', zoo: 'sở thú',
  };

  const clearWcHintTimer = () => {
    wcHintGenerationRef.current += 1;
    if (wcHintTimerRef.current) {
      clearTimeout(wcHintTimerRef.current);
      wcHintTimerRef.current = null;
    }
  };

  const getWcHintCandidates = (letter: string) => {
    const normalizedLetter = letter.toLowerCase();
    // Get filtered word pool for current level selection
    const pool = getFilteredWords();
    const matchingCards = pool.filter((card) => normalizeWord(card.word).startsWith(normalizedLetter));
    const databaseWords = matchingCards.map((card) => ({
      word: normalizeWord(card.word),
      ipa: card.ipa || '',
      vietnamese: card.vietnamese || '',
    }));
    // Static fallback used only when DB is empty
    const fallbackWords = (WC_FALLBACK_HINTS[normalizedLetter] || []).map((entry) => ({
      ...entry,
      vietnamese: WC_FALLBACK_MEANINGS[entry.word] || '',
    }));
    const source = databaseWords.length > 0 ? databaseWords : fallbackWords;
    const unique = new Map<string, { word: string; ipa: string; vietnamese: string }>();
    source.forEach((entry) => {
      if (entry.word.length >= 2 && entry.word.startsWith(normalizedLetter) && !unique.has(entry.word)) {
        unique.set(entry.word, entry);
      }
    });
    return [...unique.values()];
  };

  const chooseWcHint = (letter: string, excludedWord = '') => {
    const candidates = getWcHintCandidates(letter).filter(
      (entry) => entry.word !== excludedWord && !wcChain.includes(entry.word)
    );
    const friendlyCandidates = candidates.slice(0, 6);
    return friendlyCandidates[Math.floor(Math.random() * Math.max(1, friendlyCandidates.length))]
      || getWcHintCandidates(letter)[0]
      || { word: `${letter}at`, ipa: '', vietnamese: '' };
  };

  const armWcHint = (target: { word: string; ipa: string; vietnamese: string }) => {
    clearWcHintTimer();
    const generation = wcHintGenerationRef.current;
    const initialHint = { ...target, revealedLetters: 0 };
    wcHintRef.current = initialHint;
    setWcHint(initialHint);

    const revealNextLetter = (revealedLetters: number) => {
      wcHintTimerRef.current = setTimeout(() => {
        if (wcHintGenerationRef.current !== generation) return;
        const nextCount = Math.min(target.word.length, revealedLetters + 1);
        const nextHint = { ...target, revealedLetters: nextCount };
        wcHintRef.current = nextHint;
        setWcHint(nextHint);
        if (nextCount < target.word.length) revealNextLetter(nextCount);
      }, 5000);
    };

    revealNextLetter(0);
  };

  const beginWcKidTurn = (letter: string, excludedWord = '') => {
    setWcRetryCount(0);
    setWcAttempt(null);
    armWcHint(chooseWcHint(letter, excludedWord));
  };

  const chooseWcStarter = () => {
    const candidates = 'abcdefghijklmnopqrstuvwxyz'
      .split('')
      .flatMap((letter) => getWcHintCandidates(letter).slice(0, 3))
      .filter((entry) => {
        const endingLetter = entry.word.slice(-1);
        return getWcHintCandidates(endingLetter).some((nextEntry) => nextEntry.word !== entry.word);
      });
    const freshCandidates = candidates.filter((entry) => entry.word !== wcLastStarterRef.current);
    const pool = freshCandidates.length > 0 ? freshCandidates : candidates;
    const starter = pool[Math.floor(Math.random() * Math.max(1, pool.length))]
      || { word: 'apple', ipa: '/ˈæp.əl/', vietnamese: 'quả táo' };
    wcLastStarterRef.current = starter.word;
    return starter;
  };

  const isKnownWcWord = (word: string) => {
    if (flashcards.some((card) => normalizeWord(card.word) === word)) return true;
    if (flashcards.length === 0 && Object.values(WC_FALLBACK_HINTS).flat().some((entry) => entry.word === word)) return true;
    return false;
  };

  const getAllowedWcWords = (letter: string) => (
    getWcHintCandidates(letter)
      .map((entry) => entry.word)
      .filter((word) => !wcChain.includes(word))
  );

  const isPlayableWcWord = (word: string) => (
    /^[a-z]+$/.test(word)
    && word.length >= 2
    && word.startsWith(wcNextLetter)
    && isKnownWcWord(word)
    && !wcChain.includes(word)
  );

  const getWcWordDetails = (word: string) => {
    const databaseWord = flashcards.find((card) => normalizeWord(card.word) === word);
    if (databaseWord) return { word, ipa: databaseWord.ipa || '' };
    return Object.values(WC_FALLBACK_HINTS).flat().find((entry) => entry.word === word)
      || { word, ipa: '' };
  };

  useEffect(() => () => {
    clearWcHintTimer();
    if (wcSunnyTurnTimerRef.current) clearTimeout(wcSunnyTurnTimerRef.current);
  }, []);

  useEffect(() => {
    if (activeGame === 'word_chain' && wcGameStatus === 'playing') return;
    clearWcHintTimer();
    if (wcSunnyTurnTimerRef.current) {
      clearTimeout(wcSunnyTurnTimerRef.current);
      wcSunnyTurnTimerRef.current = null;
    }
    wcHintRef.current = null;
    setWcHint(null);
  }, [activeGame, wcGameStatus]);

  const startWcGame = () => {
    playAppSound(500, 'sine', 0.1);
    if (wcSunnyTurnTimerRef.current) clearTimeout(wcSunnyTurnTimerRef.current);
    const starter = chooseWcStarter();
    const nextLetter = starter.word.slice(-1).toLowerCase();
    setWcChain([starter.word]);
    setWcNextLetter(nextLetter);
    setWcGameStatus('playing');
    setWcFeedback({
      en: `Sunny said: "${starter.word}". Your turn! Say a word starting with "${nextLetter.toUpperCase()}".`,
      vi: `Sunny nói: "${starter.word}". Đến lượt bé! Hãy nói một từ bắt đầu bằng chữ "${nextLetter.toUpperCase()}".`,
    });
    speakText(`${starter.word}. Your turn, say a word starting with ${nextLetter}.`);
    setWcInterimText('');
    setWcIsRecording(false);
    beginWcKidTurn(nextLetter, starter.word);
  };

  const triggerSunnyWcTurn = (kidWord: string) => {
    const lastChar = kidWord.slice(-1).toLowerCase();
    const wordPool = getWcHintCandidates(lastChar).slice(0, 6).map((entry) => entry.word);

    let chosenWord = wordPool[Math.floor(Math.random() * wordPool.length)] || 'apple';
    let attempts = 0;
    while (wcChain.includes(chosenWord) && attempts < 10) {
      chosenWord = wordPool[Math.floor(Math.random() * wordPool.length)];
      attempts++;
    }

    setWcChain((previous) => [...previous, chosenWord]);

    const sunnyNextChar = chosenWord.slice(-1).toLowerCase();
    setWcNextLetter(sunnyNextChar);

    setWcFeedback({
      en: `Sunny replied: "${chosenWord}". Your turn! Say a word starting with "${sunnyNextChar.toUpperCase()}".`,
      vi: `Sunny trả lời: "${chosenWord}". Đến lượt bé! Nói từ bắt đầu bằng chữ "${sunnyNextChar.toUpperCase()}".`,
    });
    speakText(`${chosenWord}. Your turn, say a word starting with ${sunnyNextChar}.`);
    beginWcKidTurn(sunnyNextChar, kidWord);
  };

  const triggerSunnyRescueTurn = (letter: string, excludedWord = '') => {
    clearWcHintTimer();
    wcHintRef.current = null;
    setWcHint(null);
    setWcAttempt(null);
    setWcRetryCount(0);

    const rescueWord = chooseWcHint(letter, excludedWord);
    setWcChain((previous) => [...previous, rescueWord.word]);

    const nextLetter = rescueWord.word.slice(-1).toLowerCase();
    setWcNextLetter(nextLetter);
    setWcFeedback({
      en: `Sunny helps with "${rescueWord.word}" so the game keeps moving. Your turn! Say a word starting with "${nextLetter.toUpperCase()}".`,
      vi: `Sunny đỡ lượt bằng từ "${rescueWord.word}" để trò chơi tiếp tục nhé. Đến lượt bé! Hãy nói một từ bắt đầu bằng chữ "${nextLetter.toUpperCase()}".`,
    });
    speakText(`${rescueWord.word}. Your turn, say a word starting with ${nextLetter}.`);
    beginWcKidTurn(nextLetter, rescueWord.word);
  };

  const registerWcMiss = (
    target: WordChainHint,
    attempt: WordChainAttempt,
    feedback: LocalizedGameMessage,
    excludedWord = '',
  ) => {
    const nextRetryCount = wcRetryCount + 1;

    if (nextRetryCount > 2) {
      triggerSunnyRescueTurn(wcNextLetter, excludedWord || target.word);
      return;
    }

    setWcRetryCount(nextRetryCount);
    setWcAttempt(attempt);
    setWcFeedback(feedback);
    armWcHint(target);
  };

  const handleWcSpeechInput = (spokenText: string, alternatives: string[] = []) => {
    const transcripts = alternatives.length > 0 ? alternatives : spokenText;
    const rawHeardWord = selectSpokenWord(
      transcripts,
      wcNextLetter,
      isKnownWcWord
    );
    const allowedWords = getAllowedWcWords(wcNextLetter);
    const correctedWord = findClosestAllowedWord(transcripts, wcNextLetter, allowedWords);
    const cleanWord = correctedWord || rawHeardWord;
    const target = wcHintRef.current || { ...chooseWcHint(wcNextLetter), revealedLetters: 0 };
    const isValidNewWord = isPlayableWcWord(cleanWord);

    if (isValidNewWord) {
      clearWcHintTimer();
      wcHintRef.current = null;
      setWcHint(null);
      setWcRetryCount(0);
      const acceptedWord = getWcWordDetails(cleanWord);
      setWcAttempt({ heard: rawHeardWord || cleanWord, target: cleanWord, isCorrect: true, ipa: acceptedWord.ipa });
      playCorrectSound();
      awardGameXp(5);
      setWcChain(prev => [...prev, cleanWord]);
      setWcFeedback({
        en: `Great! "${cleanWord}" is correct. Sunny is thinking...`,
        vi: `Chính xác! Từ "${cleanWord}" đúng rồi. Sunny đang suy nghĩ...`,
      });
      wcSunnyTurnTimerRef.current = setTimeout(() => {
        wcSunnyTurnTimerRef.current = null;
        triggerSunnyWcTurn(cleanWord);
      }, 3500);
      return;
    }

    const heardWord = rawHeardWord || extractTranscriptWords(transcripts)[0] || '_';

    if (!cleanWord || cleanWord.length < 2) {
      registerWcMiss(target, { heard: heardWord, target: target.word, isCorrect: false }, {
        en: `I need a full word. Try saying a word starting with "${wcNextLetter.toUpperCase()}".`,
        vi: `Sunny cần nghe trọn một từ. Bé thử nói một từ bắt đầu bằng chữ "${wcNextLetter.toUpperCase()}" nhé.`,
      });
      return;
    }

    if (!isKnownWcWord(cleanWord)) {
      // If the word correctly follows the game rule (right starting letter, not already used),
      // accept it even if it's not in our database yet
      if (cleanWord.startsWith(wcNextLetter) && !wcChain.includes(cleanWord)) {
        clearWcHintTimer();
        wcHintRef.current = null;
        setWcHint(null);
        setWcRetryCount(0);
        setWcAttempt({ heard: rawHeardWord || cleanWord, target: cleanWord, isCorrect: true, ipa: '' });
        playCorrectSound();
        awardGameXp(5);
        setWcChain(prev => [...prev, cleanWord]);
        setWcFeedback({
          en: `"${cleanWord}" follows the rule! 🎉 Great word! (We'll add it to our list soon!)`,
          vi: `Từ "${cleanWord}" đúng luật rồi! 🎉 Từ hay đấy! (Chúng ta sẽ thêm từ này vào danh sách sau nhé!)`,
        });
        wcSunnyTurnTimerRef.current = setTimeout(() => {
          wcSunnyTurnTimerRef.current = null;
          triggerSunnyWcTurn(cleanWord);
        }, 3500);
        return;
      }
      registerWcMiss(target, { heard: heardWord, target: target.word, isCorrect: false }, {
        en: `I heard "${heardWord}", but let's use a word starting with "${wcNextLetter.toUpperCase()}".`,
        vi: `Sunny nghe "${heardWord}", nhưng mình dùng một từ bắt đầu bằng chữ "${wcNextLetter.toUpperCase()}" nhé.`,
      });
      return;
    }

    if (!cleanWord.startsWith(wcNextLetter)) {
      const wordDetails = getWcWordDetails(cleanWord);
      registerWcMiss(target, {
        heard: cleanWord,
        target: cleanWord,
        isCorrect: true,
        ipa: wordDetails.ipa,
        ruleMatched: false,
      }, {
        en: `"${cleanWord}" is a real word and Sunny heard it clearly, but this turn needs a word starting with "${wcNextLetter.toUpperCase()}". Try the hint "${target.word}".`,
        vi: `"${cleanWord}" là một từ có thật và Sunny nghe khá rõ, nhưng lượt này cần một từ bắt đầu bằng chữ "${wcNextLetter.toUpperCase()}". Bé thử theo gợi ý "${target.word}" nhé.`,
      }, cleanWord);
      return;
    }

    if (wcChain.includes(cleanWord)) {
      const wordDetails = getWcWordDetails(cleanWord);
      registerWcMiss(target, {
        heard: cleanWord,
        target: cleanWord,
        isCorrect: true,
        ipa: wordDetails.ipa,
        ruleMatched: false,
      }, {
        en: `"${cleanWord}" was said clearly, but it was used already. Try the hint "${target.word}" or another word starting with "${wcNextLetter.toUpperCase()}".`,
        vi: `Bé nói khá rõ từ "${cleanWord}", nhưng từ này đã được dùng rồi. Bé thử gợi ý "${target.word}" hoặc một từ khác bắt đầu bằng chữ "${wcNextLetter.toUpperCase()}" nhé.`,
      }, cleanWord);
      return;
    }

    registerWcMiss(target, { heard: heardWord, target: target.word, isCorrect: false }, {
      en: `I heard "${cleanWord || '...'}". Try the hint "${target.word}" so we can follow the game rule.`,
      vi: `Sunny nghe là "${cleanWord || '...'}". Bé thử theo gợi ý "${target.word}" để mình đúng luật chơi nhé.`,
    });
  };

  const startWcSpeechRecognition = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    if (wcRecognitionRef.current) {
      try { wcRecognitionRef.current.abort(); } catch (e) { }
    }

    const rec = new SpeechRecognition();
    rec.continuous = false;
    rec.lang = 'en-US';
    rec.interimResults = true;

    rec.onstart = () => {
      clearWcHintTimer();
      setWcIsRecording(true);
      setWcInterimText('');
    };

    rec.onresult = (event: any) => {
      const alternatives = Array.from(event.results[0] || [])
        .map((entry: any) => String(entry?.transcript || '').toLowerCase().trim())
        .filter(Boolean);
      const primaryResult = alternatives[0] || '';
      setWcInterimText(primaryResult);
      if (event.results[0].isFinal) {
        handleWcSpeechInput(primaryResult, alternatives);
        setWcIsRecording(false);
      }
    };

    rec.onerror = () => {
      setWcIsRecording(false);
      if (wcHintRef.current) armWcHint(wcHintRef.current);
    };
    rec.onend = () => { setWcIsRecording(false); };

    wcRecognitionRef.current = rec;
    rec.start();
  };

  // ==========================================
  // GAME 3: FLASHCARD MATCHING (MEMORY MATCH)
  // ==========================================
  const [fmCards, setFmCards] = useState<MatchCard[]>([]);
  const [fmSelectedCards, setFmSelectedCards] = useState<MatchCard[]>([]);
  const [fmCardFeedback, setFmCardFeedback] = useState<Record<string, 'correct' | 'wrong'>>({});
  const [fmTimer, setFmTimer] = useState<number>(0);
  const fmTimerRef = useRef(0);
  const [fmIsTimerActive, setFmIsTimerActive] = useState<boolean>(false);
  const [fmGameStatus, setFmGameStatus] = useState<'idle' | 'playing' | 'completed'>('idle');
  const fmIntervalRef = useRef<any>(null);

  const startFmGame = () => {
    playAppSound(500, 'sine', 0.1);

    let childCards = getFilteredWords(6);
    if (childCards.length < 6) {
      childCards = flashcards.length >= 6 ? flashcards : FLASHCARDS_POOL;
    }

    const recentFm = getRecentHistory('fm');
    let availableConcepts = childCards.filter(c => !recentFm.includes(c.word));
    if (availableConcepts.length < 6) {
      availableConcepts = childCards;
      try {
        const saved = localStorage.getItem(`speakjoy_game_history_${currentChild?.id}`);
        const parsed = saved ? JSON.parse(saved) : {};
        parsed.fm = [];
        localStorage.setItem(`speakjoy_game_history_${currentChild?.id}`, JSON.stringify(parsed));
      } catch (e) { }
    }

    const shuffledConcepts = [...availableConcepts].sort(() => 0.5 - Math.random());
    const selectedConcepts = shuffledConcepts.slice(0, 6);

    selectedConcepts.forEach(c => saveRecentHistory('fm', c.word, 12));

    const cards: MatchCard[] = [];
    selectedConcepts.forEach((concept) => {
      cards.push({
        id: `${concept.word}_text`,
        conceptId: concept.word,
        type: 'text',
        content: `${concept.word} - ${concept.vietnamese}`,
        isMatched: false,
        isSelected: false,
      });
      cards.push({
        id: `${concept.word}_pic`,
        conceptId: concept.word,
        type: 'pic',
        content: `${concept.emoji} ${concept.ipa || ''}`,
        isMatched: false,
        isSelected: false,
      });
    });


    const shuffledCards = cards.sort(() => 0.5 - Math.random());
    setFmCards(shuffledCards);
    setFmSelectedCards([]);
    setFmCardFeedback({});
    setFmTimer(0);
    fmTimerRef.current = 0;
    setFmIsTimerActive(true);
    setFmGameStatus('playing');
  };

  useEffect(() => {
    if (fmIsTimerActive) {
      fmIntervalRef.current = setInterval(() => {
        setFmTimer((prev) => {
          const next = prev + 1;
          fmTimerRef.current = next;
          return next;
        });
      }, 1000);
    } else {
      if (fmIntervalRef.current) clearInterval(fmIntervalRef.current);
    }
    return () => {
      if (fmIntervalRef.current) clearInterval(fmIntervalRef.current);
    };
  }, [fmIsTimerActive]);

  const handleFmCardClick = (clickedCard: MatchCard) => {
    if (fmGameStatus !== 'playing' || clickedCard.isMatched || clickedCard.isSelected) return;
    if (fmSelectedCards.length >= 2) return;

    playAppSound(400, 'sine', 0.05);

    // Speak the concept word on card click
    speakText(clickedCard.conceptId);

    const updatedCards = fmCards.map((card) =>
      card.id === clickedCard.id ? { ...card, isSelected: true } : card
    );
    setFmCards(updatedCards);

    const newSelected = [...fmSelectedCards, clickedCard];
    setFmSelectedCards(newSelected);

    if (newSelected.length === 2) {
      const [first, second] = newSelected;
      if (first.conceptId === second.conceptId) {
        setFmCardFeedback({ [first.id]: 'correct', [second.id]: 'correct' });
        playCorrectSound();
        setTimeout(() => {
          const matchedCards = updatedCards.map((card) =>
            card.conceptId === first.conceptId ? { ...card, isMatched: true, isSelected: false } : card
          );
          setFmCards(matchedCards);
          setFmSelectedCards([]);
          setFmCardFeedback({});

          const allMatched = matchedCards.every((card) => card.isMatched);
          if (allMatched) {
            setFmIsTimerActive(false);
            setFmGameStatus('completed');
            saveHighScore('fm', Math.max(1, fmTimerRef.current));
            awardGameXp(10);
            speakText('Great job! You matched all flashcards.');
          }
        }, 700);
      } else {
        setFmCardFeedback({ [first.id]: 'wrong', [second.id]: 'wrong' });
        playAppSound(150, 'sawtooth', 0.2);
        setTimeout(() => {
          const resetCards = updatedCards.map((card) =>
            card.id === first.id || card.id === second.id ? { ...card, isSelected: false } : card
          );
          setFmCards(resetCards);
          setFmSelectedCards([]);
          setFmCardFeedback({});
        }, 850);
      }
    }
  };

  // ==========================================
  // GAME 4: AI STORYTELLING (FILL IN BLANKS)
  // ==========================================
  const [stStory, setStStory] = useState<Story>(STORIES_POOL[0]);
  const [stStoryMode, setStStoryMode] = useState<'narrative' | 'dialogue'>('narrative');
  const [stAnswers, setStAnswers] = useState<Record<number, string>>({});
  const [stSelectedBlank, setStSelectedBlank] = useState<number | null>(null);
  const [stGameStatus, setStGameStatus] = useState<'idle' | 'narrating' | 'playing' | 'completed'>('idle');
  const [stFeedback, setStFeedback] = useState<string>('');
  const [stIsRecording, setStIsRecording] = useState<boolean>(false);
  const [stInterimText, setStInterimText] = useState<string>('');
  const stRecognitionRef = useRef<any>(null);

  const startStStory = (story: Story) => {
    playAppSound(400, 'sine', 0.08);

    saveRecentHistory('st', story.id, 5);

    setStStory(story);
    setStAnswers({});
    setStSelectedBlank(null);
    setStFeedback('');
    setStInterimText('');
    setStIsRecording(false);
    setStGameStatus('narrating');

    speakText(`Let's listen to this story: ${story.titleEn}. ${story.textEn}`);
  };


  const skipStNarration = () => {
    window.speechSynthesis.cancel();
    setStGameStatus('playing');
    setStFeedback(
      globalLang === 'en'
        ? "Tap any blank word to record your speech!"
        : "Nhấn vào ô trống để bắt đầu nói từ còn thiếu!"
    );
  };

  const startStSpeechRecognition = (blankIndex: number, targetWord: string) => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    if (stRecognitionRef.current) {
      try { stRecognitionRef.current.abort(); } catch (e) { }
    }

    const rec = new SpeechRecognition();
    rec.continuous = false;
    rec.lang = 'en-US';
    rec.interimResults = true;

    rec.onstart = () => {
      setStIsRecording(true);
      setStInterimText('');
    };

    rec.onresult = (event: any) => {
      const result = event.results[0][0].transcript.toLowerCase().trim().replace(/[^a-z]/g, '');
      setStInterimText(result);
      if (event.results[0].isFinal) {
        const target = targetWord.toLowerCase().replace(/[^a-z]/g, '');
        if (result === target || result.includes(target) || target.includes(result)) {
          playCorrectSound();
          const nextAnswers = { ...stAnswers, [blankIndex]: targetWord };
          setStAnswers(nextAnswers);
          setStSelectedBlank(null);
          setStFeedback(
            globalLang === 'en'
              ? `Wonderful! You pronounced "${targetWord}" correctly!`
              : `Tuyệt vời! Bé đã phát âm chính xác từ "${targetWord}"!`
          );

          const allFilled = stStory.blanks.every((b) => nextAnswers[b.index]);
          if (allFilled) {
            setTimeout(() => {
              setStGameStatus('completed');
              const newCount = stCompletedCount + 1;
              saveHighScore('st', newCount);
              awardGameXp(15);
              speakText(`Success! The full story is: ${stStory.textEn}`);
            }, 1200);
          }
        } else {
          playAppSound(150, 'sawtooth', 0.2);
          const blankObj = stStory.blanks.find((b) => b.index === blankIndex);
          setStFeedback(
            globalLang === 'en'
              ? `I heard "${result}". Try saying "${targetWord}" again! Hint: ${blankObj?.ipa}`
              : `Sunny nghe thành "${result}". Bé hãy nói lại từ "${targetWord}" nhé! Gợi ý phát âm: ${blankObj?.ipa}`
          );
          setStInterimText('');
        }
        setStIsRecording(false);
      }
    };

    rec.onerror = () => { setStIsRecording(false); };
    rec.onend = () => { setStIsRecording(false); };

    stRecognitionRef.current = rec;
    rec.start();
  };

  const handleStMicToggle = (blankIndex: number, targetWord: string) => {
    if (stIsRecording) {
      if (stRecognitionRef.current) stRecognitionRef.current.stop();
    } else {
      startStSpeechRecognition(blankIndex, targetWord);
    }
  };

  const renderStTemplate = (template: string, keyPrefix: string) => (
    <div className={`flex flex-wrap items-center gap-x-1.5 gap-y-2 sm:gap-x-2 sm:gap-y-3 ${isLight ? 'text-slate-800' : 'text-slate-100'}`}>
      {template.split(' ').map((word, wordIndex) => {
        const match = word.match(/\{blank_(\d+)\}/);
        if (!match) return <span key={`${keyPrefix}_word_${wordIndex}`}>{word}</span>;

        const blankIndex = Number(match[1]);
        const blank = stStory.blanks.find((item) => item.index === blankIndex);
        const isCorrect = Boolean(stAnswers[blankIndex]);
        const isSelected = stSelectedBlank === blankIndex;
        const punctuation = word.replace(/\{blank_\d+\}/, '');

        return (
          <span key={`${keyPrefix}_blank_${wordIndex}`} className="inline-flex items-center gap-0.5">
            <button
              type="button"
              onClick={() => {
                playAppSound(300, 'sine', 0.05);
                if (!isCorrect && blank) {
                  setStSelectedBlank(blankIndex);
                  speakText(`Say ${blank.word}`);
                  setStFeedback(globalLang === 'en'
                    ? `Pronounce: "${blank.word}" (${blank.ipa} - ${blank.vietnameseHint})`
                    : `Hãy đọc từ: "${blank.word}" (${blank.ipa} - nghĩa là ${blank.vietnameseHint})`);
                }
              }}
              className={`rounded-xl border px-2.5 py-1 text-[10px] font-bold uppercase transition sm:px-3 sm:py-1.5 sm:text-xs ${isCorrect
                ? 'pointer-events-none border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                : isSelected
                  ? 'animate-pulse border-violet-500/80 bg-violet-500/20 text-violet-700 ring-2 ring-violet-500/30 dark:text-violet-400'
                  : 'cursor-pointer border-2 border-dashed border-slate-400 bg-slate-700/10 text-slate-600 hover:bg-slate-700/30 dark:border-slate-500 dark:text-slate-400'}`}
            >
              {isCorrect ? blank?.word : `[ ${blank?.vietnameseHint || '...'} ]`}
            </button>
            {punctuation && <span>{punctuation}</span>}
          </span>
        );
      })}
    </div>
  );

  // Filter games based on selected age category
  const getGamesList = () => {
    const list = [
      {
        id: 'true_false',
        icon: '🧐',
        titleEn: 'True or False?',
        titleVi: 'Đúng hay Sai?',
        descEn: 'Look at the card. Is the description correct? Answer Yes/No and speak the word!',
        descVi: 'Nhìn thẻ bài và đoán câu mô tả đúng hay sai, sau đó nói to từ vựng để vượt qua thẻ!',
        ageGroup: 'preschool',
        ageLabel: 'Ages 4-8',
        colorClass: 'emerald',
      },
      {
        id: 'flashcard_match',
        icon: '🎴',
        titleEn: 'Flashcard Match',
        titleVi: 'Ghép Thẻ Trí Nhớ',
        descEn: 'Match English cards with Vietnamese meanings & emojis! Test your speed.',
        descVi: 'Nối từ tiếng Anh với nghĩa tiếng Việt, hình ảnh và IPA tương ứng. Vừa chơi vừa ghi nhớ từ vựng!',
        ageGroup: 'preschool',
        ageLabel: 'Ages 4-8',
        colorClass: 'amber',
      },
      {
        id: 'word_chain',
        icon: '🔗',
        titleEn: 'Word Chain',
        titleVi: 'Nối Từ Tiếng Anh',
        descEn: "Say a word starting with the last letter of Sunny's word. Test your vocabulary chain!",
        descVi: 'Đấu nối từ tiếng Anh với Sunny dựa trên chữ cái kết thúc của từ trước. Thử thách từ vựng!',
        ageGroup: 'primary',
        ageLabel: 'Ages 8+',
        colorClass: 'indigo',
      },
      {
        id: 'storytelling',
        icon: '📖',
        titleEn: 'AI Storytelling',
        titleVi: 'Kể Chuyện Cùng AI',
        descEn: 'Listen to a short story and fill in missing words using your voice to finish the narrative.',
        descVi: 'Nghe AI kể chuyện, sau đó nói to những từ khóa còn thiếu để lắp đầy câu truyện và nâng cao khả năng nói!',
        ageGroup: 'primary',
        ageLabel: 'Ages 8+',
        colorClass: 'violet',
      },
      {
        id: 'blocks',
        icon: '🧱',
        titleEn: 'Vocabulary Blocks',
        titleVi: 'Khối Từ Vựng',
        descEn: 'Place blocks, clear lines, then answer a vocabulary question to continue.',
        descVi: 'Xếp khối, xóa hàng hoặc cột rồi trả lời đúng câu hỏi từ vựng để được xếp tiếp.',
        ageGroup: 'primary',
        ageLabel: 'Ages 8+',
        colorClass: 'rose',
      },
      {
        id: 'blast',
        icon: '💥',
        titleEn: 'Vocabulary Blast',
        titleVi: 'Bắn Bong Bóng',
        descEn: 'Aim and fire at the bubble containing the correct translation and IPA of the target word!',
        descVi: 'Nhắm bắn đạn nổ bóng chứa nghĩa tiếng Việt và IPA đúng của từ tiếng Anh hiển thị phía trên!',
        ageGroup: 'preschool',
        ageLabel: 'Ages 4-8',
        colorClass: 'sky',
      },
      {
        id: 'uno',
        icon: '🎴',
        titleEn: 'UNO Vocabulary',
        titleVi: 'UNO Từ Vựng',
        descEn: 'Play a kid-friendly UNO round. Special cards unlock after saying an English word.',
        descVi: 'Chơi UNO phiên bản từ vựng. Lá đặc biệt cần đọc đúng một từ tiếng Anh để mở khóa.',
        ageGroup: 'primary',
        ageLabel: 'Ages 8+',
        colorClass: 'red',
      },
      {
        id: 'four_pics',
        icon: '🎮',
        titleEn: '4 Pics 1 Word',
        titleVi: '4 Hình 1 Từ',
        descEn: 'Guess the hidden English word related to the 4 pictures. Deduce and spell it correctly!',
        descVi: 'Đoán từ tiếng Anh ẩn sau 4 hình ảnh liên quan. Suy luận logic và ghép từ chính xác!',
        ageGroup: 'preschool',
        ageLabel: 'Ages 4-8',
        colorClass: 'amber',
      },
    ];

    let filtered = list;
    if (ageFilter === 'preschool') {
      filtered = list.filter((game) => game.ageGroup === 'preschool');
    } else if (ageFilter === 'primary') {
      filtered = list.filter((game) => game.ageGroup === 'primary');
    }

    if (ageFilter === 'all' && currentChild?.age) {
      const targetGroup = currentChild.age <= 8 ? 'preschool' : 'primary';
      return [...filtered].sort((a, b) => {
        if (a.ageGroup === targetGroup && b.ageGroup !== targetGroup) return -1;
        if (a.ageGroup !== targetGroup && b.ageGroup === targetGroup) return 1;
        return 0;
      });
    }

    return filtered;
  };

  // Get stories list excluding the most recently played to ensure rotation
  const getFilteredStories = () => {
    const recentSt = getRecentHistory('st');
    let list = stories.filter(story => !recentSt.includes(story.id));
    if (list.length === 0) {
      list = stories;
    }
    return list;
  };

  const getActiveGameLabel = () => {
    if (activeGame === 'true_false') return globalLang === 'en' ? 'True/False' : 'Đúng/Sai';
    if (activeGame === 'word_chain') return globalLang === 'en' ? 'Word Chain' : 'Nối Từ';
    if (activeGame === 'flashcard_match') return globalLang === 'en' ? 'Flashcard Match' : 'Ghép Thẻ';
    if (activeGame === 'storytelling') return globalLang === 'en' ? 'Storytelling' : 'Kể Chuyện';
    if (activeGame === 'blocks') return globalLang === 'en' ? 'Vocabulary Blocks' : 'Khối Từ Vựng';
    if (activeGame === 'blast') return globalLang === 'en' ? 'Vocabulary Blast' : 'Bắn Bong Bóng';
    if (activeGame === 'uno') return globalLang === 'en' ? 'UNO Vocabulary' : 'UNO Từ Vựng';
    if (activeGame === 'four_pics') return '4 Pics 1 Word';
    return '';
  };

  const getGameScore = (records: ChildGameRecords) => {
    if (activeGame === 'true_false') return records.trueFalseHighScore;
    if (activeGame === 'word_chain') return records.wordChainHighScore;
    if (activeGame === 'flashcard_match') return records.flashcardMatchBestTime;
    if (activeGame === 'storytelling') return records.storiesCompletedCount;
    if (activeGame === 'blocks') return records.blocksHighScore;
    if (activeGame === 'blast') return records.blastHighScore;
    return 0;
  };

  const formatGameScore = (score: number) => {
    if (activeGame === 'flashcard_match') {
      return score > 0 ? `${score}s` : '---';
    }
    return String(score);
  };

  const familyGameRanking = visibleChildren
    .map((child) => {
      const fallbackForCurrent =
        child.id === currentChild?.id
          ? {
            trueFalseHighScore: tfHighScore,
            wordChainHighScore: wcHighScore,
            flashcardMatchBestTime: fmBestTime,
            storiesCompletedCount: stCompletedCount,
            blocksHighScore,
            blastHighScore,
          }
          : emptyGameRecords;
      const records = childGameRecords[child.id] || fallbackForCurrent;
      return { child, score: getGameScore(records) };
    })
    .sort((a, b) => {
      if (activeGame === 'flashcard_match') {
        if (a.score === 0 && b.score > 0) return 1;
        if (b.score === 0 && a.score > 0) return -1;
        return a.score - b.score;
      }
      return b.score - a.score;
    });

  const topGamePlayer = familyGameRanking[0];
  const draggingBlocksPiece = blocksPieces.find((piece) => piece.id === blocksDraggingPieceId) || null;


  return (
    <div className={`w-full max-w-full flex-1 flex flex-col min-h-0 relative ${isLight ? 'text-slate-900' : 'text-white'}`}>

      {/* HEADER SECTION */}
      <div className={`shrink-0 flex items-center justify-between gap-2 border-b pb-2 mb-2 sm:pb-3 sm:mb-4 ${isLight ? 'border-slate-200' : 'border-white/[0.08]'
        }`}>
        <div className="flex items-center gap-2">
          <div className="p-1.5 sm:p-2 rounded-xl bg-amber-500/10 text-amber-500">
            <Gamepad2 className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-sm sm:text-base md:text-lg font-black uppercase tracking-wide">
              {globalLang === 'en' ? 'Game Zone 🎮' : 'Khu Vui Chơi 🎮'}
            </h1>
            <p className="hidden min-[390px]:block text-[10px] sm:text-[11px] text-[var(--app-text-muted)]">
              {globalLang === 'en' ? 'Learn English through interactive games!' : 'Vừa chơi vừa học Tiếng Anh vui vẻ!'}
            </p>
          </div>
        </div>

        {activeGame !== 'menu' && (
          <button
            onClick={() => {
              playAppSound(300, 'sine', 0.08);
              if (activeGame === 'blocks' && blocksScore > 0) {
                saveHighScore('blocks', blocksScore);
              }
              if (activeGame === 'blast') {
                blastStatusRef.current = 'idle';
                if (blastScore > 0) {
                  saveHighScore('blast', blastScore);
                }
              }
              if (blastTimerIntervalRef.current) {
                clearInterval(blastTimerIntervalRef.current);
              }
              if (blastAnimFrameRef.current) {
                cancelAnimationFrame(blastAnimFrameRef.current);
              }
              setActiveGame('menu');
              setGameSelectPhase('selecting'); // reset so next game entry shows selector
              window.speechSynthesis.cancel();
              if (tfRecognitionRef.current) {
                try { tfRecognitionRef.current.abort(); } catch (e) { }
              }
              if (wcRecognitionRef.current) {
                try { wcRecognitionRef.current.abort(); } catch (e) { }
              }
              if (stRecognitionRef.current) {
                try { stRecognitionRef.current.abort(); } catch (e) { }
              }
              setFmIsTimerActive(false);
            }}
            className={`flex shrink-0 items-center gap-1 px-2.5 py-2 rounded-xl border text-[11px] sm:text-xs font-bold transition cursor-pointer hover:scale-105 active:scale-95 ${isLight ? 'bg-slate-200 border-slate-300 text-slate-800 hover:bg-slate-300' : 'bg-slate-800 border-[#37464f] text-slate-300 hover:bg-slate-700'
              }`}
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>{globalLang === 'en' ? 'Exit Game' : 'Thoát Game'}</span>
          </button>
        )}
      </div>

      {activeGame !== 'menu' && visibleChildren.length > 1 && topGamePlayer && (
        <div className={`shrink-0 mb-2 sm:mb-3 rounded-2xl border p-2 sm:p-3 ${isLight ? 'bg-white border-amber-300 shadow-sm' : 'bg-slate-900/70 border-white/[0.08]'
          }`}>
          <div className="flex flex-col gap-1.5 sm:gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-amber-500/15 text-amber-500 flex items-center justify-center shrink-0">
                <Trophy className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <p className={`text-[10px] font-black uppercase tracking-wider ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                  {globalLang === 'en' ? `${getActiveGameLabel()} leaderboard` : `Xếp hạng ${getActiveGameLabel()}`}
                </p>
                <p className={`text-xs sm:text-sm font-black truncate ${isLight ? 'text-slate-800' : 'text-white'}`}>
                  {globalLang === 'en' ? 'Top player:' : 'Đang dẫn đầu:'} {topGamePlayer.child.name}
                  <span className={`ml-1 ${isLight ? 'text-amber-600' : 'text-amber-400'}`}> · {formatGameScore(topGamePlayer.score)}</span>
                </p>
              </div>
            </div>
            <div className="flex gap-1 overflow-x-auto pb-0.5 custom-scrollbar sm:flex-wrap sm:gap-1.5">
              {familyGameRanking.slice(0, 4).map((entry, index) => (
                <div
                  key={entry.child.id}
                  className={`shrink-0 px-2 py-1 rounded-xl border text-[9px] sm:text-[10px] font-black flex items-center gap-1 ${entry.child.id === currentChild?.id
                      ? 'bg-[#1cb0f6]/10 border-[#1cb0f6]/40 text-[#147aa8]'
                      : isLight
                        ? 'bg-slate-50 border-slate-200 text-slate-700'
                        : 'bg-slate-800 border-slate-700 text-slate-300'
                    }`}
                >
                  <span>#{index + 1}</span>
                  <span className="max-w-[90px] truncate">{entry.child.name}</span>
                  <span className="text-amber-600 dark:text-amber-400">{formatGameScore(entry.score)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <AnimatePresence mode="wait">

        {/* GAME MENU */}
        {activeGame === 'menu' && (
          <motion.div
            key="menu"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            className="flex-1 flex flex-col justify-start space-y-4 pt-2"
          >


            {/* High score board - Contrast Optimized for Light Mode */}
            {currentChild && (
              <div className={`p-3 rounded-3xl border grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 text-center ${isLight ? 'bg-white border-amber-200/60 shadow-[0_8px_30px_rgb(0,0,0,0.02)]' : 'bg-slate-900/80 border-white/[0.08]'
                }`}>
                <div className={`flex flex-col items-center justify-center p-2 rounded-2xl border ${isLight ? 'bg-emerald-500/10 border-emerald-500/25' : 'bg-emerald-500/15 border-emerald-500/30'}`}>
                  <span className={`block text-[9px] uppercase font-black tracking-wider ${isLight ? 'text-slate-900 font-extrabold' : 'text-slate-400'}`}>
                    {globalLang === 'en' ? 'True/False Best' : 'Kỷ Lục Đúng/Sai'}
                  </span>
                  <span className="text-lg font-black text-emerald-600 dark:text-emerald-400 flex items-center gap-1 mt-1">
                    ⭐ {tfHighScore}
                  </span>
                </div>
                <div className={`flex flex-col items-center justify-center p-2 rounded-2xl border ${isLight ? 'bg-indigo-500/10 border-indigo-500/25' : 'bg-indigo-500/15 border-indigo-500/30'}`}>
                  <span className={`block text-[9px] uppercase font-black tracking-wider ${isLight ? 'text-slate-900 font-extrabold' : 'text-slate-400'}`}>
                    {globalLang === 'en' ? 'Word Chain Best' : 'Kỷ Lục Nối Từ'}
                  </span>
                  <span className="text-lg font-black text-indigo-600 dark:text-indigo-400 flex items-center gap-1 mt-1">
                    🔗 {wcHighScore}
                  </span>
                </div>
                <div className={`flex flex-col items-center justify-center p-2 rounded-2xl border ${isLight ? 'bg-amber-500/10 border-amber-500/25' : 'bg-amber-500/15 border-amber-500/30'}`}>
                  <span className={`block text-[9px] uppercase font-black tracking-wider ${isLight ? 'text-slate-900 font-extrabold' : 'text-slate-400'}`}>
                    {globalLang === 'en' ? 'Fastest Match' : 'Ghép Nhanh Nhất'}
                  </span>
                  <span className="text-lg font-black text-amber-600 dark:text-amber-500 flex items-center gap-1 mt-1">
                    ⏱️ {fmBestTime > 0 ? `${fmBestTime}s` : '---'}
                  </span>
                </div>
                <div className={`flex flex-col items-center justify-center p-2 rounded-2xl border ${isLight ? 'bg-violet-500/10 border-violet-500/25' : 'bg-violet-500/15 border-violet-500/30'}`}>
                  <span className={`block text-[9px] uppercase font-black tracking-wider ${isLight ? 'text-slate-900 font-extrabold' : 'text-slate-400'}`}>
                    {globalLang === 'en' ? 'Stories Completed' : 'Truyện Đã Kể'}
                  </span>
                  <span className="text-lg font-black text-violet-600 dark:text-violet-400 flex items-center gap-1 mt-1">
                    📖 {stCompletedCount}
                  </span>
                </div>
                <div className={`flex flex-col items-center justify-center rounded-2xl border p-2 ${isLight ? 'bg-rose-500/10 border-rose-500/25' : 'bg-rose-500/15 border-rose-500/30'}`}>
                  <span className={`block text-[9px] font-black uppercase tracking-wider ${isLight ? 'text-slate-900' : 'text-slate-400'}`}>
                    {globalLang === 'en' ? 'Blocks Best' : 'Kỷ lục Khối'}
                  </span>
                  <span className="mt-1 flex items-center gap-1 text-lg font-black text-rose-600 dark:text-rose-400">
                    🧱 {blocksHighScore}
                  </span>
                </div>
                <div className={`flex flex-col items-center justify-center rounded-2xl border p-2 ${isLight ? 'bg-sky-500/10 border-sky-500/25' : 'bg-sky-500/15 border-sky-500/30'}`}>
                  <span className={`block text-[9px] font-black uppercase tracking-wider ${isLight ? 'text-slate-900' : 'text-slate-400'}`}>
                    {globalLang === 'en' ? 'Blast Best' : 'Kỷ lục Bắn Bóng'}
                  </span>
                  <span className="mt-1 flex items-center gap-1 text-lg font-black text-sky-600 dark:text-sky-400">
                    💥 {blastHighScore}
                  </span>
                </div>
              </div>
            )}

            {/* Filter buttons - High Contrast for Light Mode */}
            {currentChild && (
              <div className={`flex gap-2 p-1 rounded-2xl max-w-md border ${isLight ? 'bg-amber-50/50 border-amber-200/80 shadow-sm' : 'bg-slate-900/20 dark:bg-black/35 border-white/5'
                }`}>
                <button
                  onClick={() => { playAppSound(300, 'sine', 0.05); setAgeFilter('all'); }}
                  className={`flex-1 py-2 px-3 rounded-xl text-xs font-black uppercase tracking-wider transition cursor-pointer ${ageFilter === 'all'
                      ? 'bg-amber-500 text-white shadow-sm'
                      : isLight
                        ? 'text-slate-800 hover:text-slate-950 hover:bg-amber-100/50 font-extrabold'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                    }`}
                >
                  {globalLang === 'en' ? 'All' : 'Tất cả'}
                </button>
                <button
                  onClick={() => { playAppSound(300, 'sine', 0.05); setAgeFilter('preschool'); }}
                  className={`flex-1 py-2 px-3 rounded-xl text-xs font-black uppercase tracking-wider transition cursor-pointer ${ageFilter === 'preschool'
                      ? 'bg-amber-500 text-white shadow-sm'
                      : isLight
                        ? 'text-slate-800 hover:text-slate-950 hover:bg-amber-100/50 font-extrabold'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                    }`}
                >
                  {globalLang === 'en' ? '4-8 Years' : 'Bé 4-8 tuổi'}
                </button>
                <button
                  onClick={() => { playAppSound(300, 'sine', 0.05); setAgeFilter('primary'); }}
                  className={`flex-1 py-2 px-3 rounded-xl text-xs font-black uppercase tracking-wider transition cursor-pointer ${ageFilter === 'primary'
                      ? 'bg-amber-500 text-white shadow-sm'
                      : isLight
                        ? 'text-slate-800 hover:text-slate-950 hover:bg-amber-100/50 font-extrabold'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                    }`}
                >
                  {globalLang === 'en' ? '8+ Years' : 'Bé 8+ tuổi'}
                </button>
              </div>
            )}


            {/* Menu Cards */}
            <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-3 gap-2.5 sm:gap-4">
              {getGamesList().map((game) => {
                let colorBorder = isLight ? 'border-emerald-500 shadow-[0_6px_0_#047857]' : 'border-[#243e49]';
                let colorTitle = 'text-emerald-600 dark:text-emerald-400';
                let cardBg = isLight
                  ? 'bg-gradient-to-br from-emerald-50 to-teal-50/50 hover:from-emerald-100 hover:to-teal-100 shadow-sm text-slate-800'
                  : 'bg-[#18282f] border-[#243e49] text-white';

                if (game.colorClass === 'amber') {
                  colorBorder = isLight ? 'border-amber-500 shadow-[0_6px_0_#b45309]' : 'border-[#3f3424]';
                  colorTitle = 'text-amber-600 dark:text-amber-500';
                  cardBg = isLight
                    ? 'bg-gradient-to-br from-amber-50 to-orange-50/50 hover:from-amber-100 hover:to-orange-100 shadow-sm text-slate-800'
                    : 'bg-[#292218] border-[#3f3424] text-white';
                } else if (game.colorClass === 'indigo') {
                  colorBorder = isLight ? 'border-indigo-500 shadow-[0_6px_0_#4338ca]' : 'border-[#242749]';
                  colorTitle = 'text-indigo-600 dark:text-indigo-400';
                  cardBg = isLight
                    ? 'bg-gradient-to-br from-indigo-50 to-blue-50/50 hover:from-indigo-100 hover:to-blue-100 shadow-sm text-slate-800'
                    : 'bg-[#181a2f] border-[#242749] text-white';
                } else if (game.colorClass === 'violet') {
                  colorBorder = isLight ? 'border-violet-500 shadow-[0_6px_0_#6d28d9]' : 'border-[#372449]';
                  colorTitle = 'text-violet-600 dark:text-violet-400';
                  cardBg = isLight
                    ? 'bg-gradient-to-br from-violet-50 to-purple-50/50 hover:from-violet-100 hover:to-purple-100 shadow-sm text-slate-800'
                    : 'bg-[#23182f] border-[#372449] text-white';
                } else if (game.colorClass === 'rose') {
                  colorBorder = isLight ? 'border-rose-500 shadow-[0_6px_0_#be123c]' : 'border-rose-500/30';
                  colorTitle = isLight ? 'text-rose-600' : 'text-rose-400';
                  cardBg = isLight
                    ? 'bg-gradient-to-br from-rose-50 to-sky-50/60 hover:from-rose-100 hover:to-sky-100 text-slate-800'
                    : 'bg-[#251726] text-white';
                } else if (game.colorClass === 'sky') {
                  colorBorder = isLight ? 'border-sky-500 shadow-[0_6px_0_#0369a1]' : 'border-sky-500/30';
                  colorTitle = isLight ? 'text-sky-600' : 'text-sky-400';
                  cardBg = isLight
                    ? 'bg-gradient-to-br from-sky-50 to-cyan-50/65 hover:from-sky-100 hover:to-cyan-100 text-slate-800 font-extrabold'
                    : 'bg-[#0f2129] text-white';
                } else if (game.colorClass === 'red') {
                  colorBorder = isLight ? 'border-red-500 shadow-[0_6px_0_#b91c1c]' : 'border-red-500/30';
                  colorTitle = isLight ? 'text-red-600' : 'text-red-400';
                  cardBg = isLight
                    ? 'bg-gradient-to-br from-red-50 to-yellow-50/65 hover:from-red-100 hover:to-yellow-100 text-slate-800 font-extrabold'
                    : 'bg-[#241215] text-white';
                }

                return (
                  <button
                    key={game.id}
                    onClick={() => {
                      playAppSound(400, 'sine', 0.08);
                      setGameSelectPhase('selecting'); // always show level/topic picker first
                      if (game.id === 'true_false') {
                        setActiveGame('true_false');
                        setTfScore(0);
                      } else if (game.id === 'word_chain') {
                        setActiveGame('word_chain');
                        setWcGameStatus('idle');
                        setWcFeedback(null);
                        setWcChain([]);
                      } else if (game.id === 'flashcard_match') {
                        setActiveGame('flashcard_match');
                        setFmGameStatus('idle');
                      } else if (game.id === 'storytelling') {
                        setActiveGame('storytelling');
                        setStStoryMode('narrative');
                        setStGameStatus('idle');
                        setStGameStatus('idle');
                      } else if (game.id === 'blocks') {
                        setActiveGame('blocks');
                        setGameSelectPhase('selecting');
                      } else if (game.id === 'blast') {
                        setActiveGame('blast');
                        setGameSelectPhase('selecting');
                      } else if (game.id === 'uno') {
                        setActiveGame('uno');
                        setGameSelectPhase('selecting');
                      } else if (game.id === 'four_pics') {
                        setActiveGame('four_pics');
                        setGameSelectPhase('ready'); // 4 Pics 1 Word starts directly or sets ready
                      }
                    }}
                    className={`p-3 sm:p-5 rounded-2xl sm:rounded-3xl border-2 border-b-[4px] sm:border-b-[6px] text-left transition duration-200 hover:-translate-y-1 hover:brightness-105 active:scale-[0.98] cursor-pointer flex flex-col justify-between min-h-[125px] sm:min-h-[190px] ${cardBg} ${colorBorder}`}
                  >
                    <div>
                      <div className="flex justify-between items-center">
                        <span className="text-xl sm:text-3xl">{game.icon}</span>
                        <span className={`text-[8px] sm:text-[10px] font-black uppercase px-1.5 py-0.5 sm:px-2.5 sm:py-1 rounded-full border shrink-0 ${game.ageGroup === 'preschool'
                            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
                            : 'bg-indigo-500/10 border-indigo-500/30 text-indigo-600 dark:text-indigo-400'
                          }`}>
                          {game.ageLabel}
                        </span>
                      </div>
                      <h2 className={`text-[11px] sm:text-base font-black uppercase tracking-wide mt-2 sm:mt-3 leading-tight ${colorTitle}`}>
                        {globalLang === 'en' ? game.titleEn : game.titleVi}
                      </h2>
                      <p className="hidden sm:block text-[11px] sm:text-xs text-slate-600 dark:text-[var(--app-text-muted)] mt-1.5 leading-relaxed line-clamp-2">
                        {globalLang === 'en' ? game.descEn : game.descVi}
                      </p>
                    </div>
                    <div className={`flex items-center gap-0.5 sm:gap-1 text-[9px] sm:text-[11px] font-black uppercase mt-2 sm:mt-4 ${colorTitle}`}>
                      <span>{globalLang === 'en' ? 'Play Now' : 'Chơi Ngay'}</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </div>
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}

        {activeGame === 'uno' && gameSelectPhase === 'selecting' && (
          <motion.div
            key="uno-config"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className={`flex-1 rounded-2xl border p-3 sm:p-5 ${isLight ? 'border-red-200 bg-white/75' : 'border-red-500/20 bg-[#171015]'}`}
          >
            {renderGameConfigSelector(
              () => { setGameSelectPhase('ready'); },
              'bg-red-500 border-red-700 text-white shadow-[0_4px_0_#991b1b] hover:bg-red-400',
            )}
          </motion.div>
        )}

        {activeGame === 'uno' && gameSelectPhase === 'ready' && (
          <motion.div
            key="uno"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            className="flex min-h-0 flex-1 flex-col"
          >
            <UnoGame
              globalLang={globalLang}
              isLight={isLight}
              wordPool={getFilteredWords(8).length > 0 ? getFilteredWords(8) : flashcards.length > 0 ? flashcards : FLASHCARDS_POOL}
              playerName={currentChild?.name || (globalLang === 'en' ? 'You' : 'Bé')}
              aiCount={currentChild?.age && currentChild.age >= 10 ? 3 : 2}
              onExit={() => setActiveGame('menu')}
              onWin={() => {
                onUpdateStats({ xp: (state.xp || 0) + 15 });
              }}
              speak={speakText}
              currentChild={currentChild}
            />
          </motion.div>
        )}

        {activeGame === 'blast' && gameSelectPhase === 'selecting' && (
          <motion.div
            key="blast-config"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className={`flex-1 rounded-2xl border p-3 sm:p-5 ${isLight ? 'border-sky-200 bg-white/75' : 'border-sky-500/20 bg-[#0c161d]'}`}
          >
            {renderGameConfigSelector(
              startBlastGame,
              'bg-sky-500 border-sky-600 text-white shadow-[0_4px_0_#0284c7] hover:bg-sky-400',
            )}
          </motion.div>
        )}

        {activeGame === 'blast' && gameSelectPhase === 'ready' && (
          <motion.div
            key="blast"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            className={`blast-game-shell flex min-h-[520px] flex-1 select-none flex-col overflow-hidden rounded-2xl border relative ${
              isLight ? 'border-sky-200 bg-[#f8fcff] shadow-[0_18px_50px_rgba(14,165,233,0.12)]' : 'border-sky-400/20 bg-[#07131a] shadow-[0_18px_60px_rgba(0,0,0,0.32)]'
            }`}
          >
            {/* Target word display bar at top */}
            {blastTargetWord && (
              <div className="relative z-10 w-full border-b-2 border-cyan-400 bg-[#081b2a] px-3 py-3 text-center text-white shadow-[0_6px_18px_rgba(14,165,233,0.22)]">
                <p className="inline-flex items-center gap-1 rounded-md bg-cyan-300 px-2.5 py-1 text-[10px] font-black uppercase text-slate-950 shadow-[0_0_14px_rgba(34,211,238,0.5)]">
                  <Star className="h-3 w-3 fill-current" />
                  {globalLang === 'en' ? 'Find the correct meaning' : 'Bắn vào nghĩa đúng'}
                </p>
                <div className="mt-1.5 flex flex-wrap items-center justify-center gap-2">
                  <span className="text-2xl font-black text-amber-300 drop-shadow-[0_2px_0_rgba(180,83,9,0.8)] sm:text-3xl">{blastTargetWord.word}</span>
                  {blastTargetWord.ipa && <span className="rounded-md border border-cyan-300/50 bg-cyan-300/10 px-2 py-1 text-sm font-black text-cyan-200">{blastTargetWord.ipa}</span>}
                </div>
              </div>
            )}

            {/* Main Interactive Arena Canvas */}
            <div className="relative min-h-[390px] w-full flex-1 overflow-hidden">
              <canvas
                ref={blastCanvasRef}
                onMouseMove={handleBlastMouseMove}
                onClick={(e) => fireBlastBullet(e.clientX, e.clientY)}
                className={`blast-arena absolute inset-0 block h-full w-full cursor-crosshair touch-manipulation ${isLight ? 'blast-arena-light' : 'blast-arena-dark'}`}
              />
              <div className="pointer-events-none absolute right-3 top-3 z-10 flex items-center gap-2">
                <div className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-black shadow-lg backdrop-blur-sm ${
                  isLight ? 'border-cyan-300 bg-cyan-50/90 text-slate-800' : 'border-cyan-400/40 bg-[#081b2a]/90 text-white'
                }`}>
                  <Clock className="h-4 w-4 text-amber-500" />
                  <span className={blastTimeLeft <= 10 ? 'animate-pulse text-rose-500' : ''}>{blastTimeLeft}s</span>
                </div>
                <div className={`flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs font-black text-amber-500 shadow-lg backdrop-blur-sm ${
                  isLight ? 'border-amber-300 bg-amber-50/90' : 'border-amber-400/40 bg-[#081b2a]/90'
                }`}>
                  <Star className="h-4 w-4 fill-current" />{blastScore}
                </div>
              </div>
            </div>

            {/* Bottom info stats bar (Lvl/XP left, Streak/Multiplier right) */}
            <div className={`z-10 flex shrink-0 items-center justify-between border-t p-3 text-xs ${isLight ? 'border-cyan-300 bg-[#dff7fb] text-slate-900 shadow-[inset_0_1px_0_rgba(14,165,233,0.16)]' : 'border-slate-800 bg-[#0b1b25] text-white'}`}>
              <div className="flex items-center gap-3 w-1/2 min-w-0">
                <span className="font-black text-[10px] md:text-xs text-sky-400 uppercase shrink-0">
                  Lvl {blastLevel}
                </span>
                <div className={`relative h-3 flex-1 overflow-hidden rounded-full border ${isLight ? 'border-cyan-300 bg-cyan-50' : 'border-slate-700 bg-slate-800'}`}>
                  <div 
                    className="h-full bg-gradient-to-r from-emerald-400 via-sky-400 to-violet-500 transition-all duration-300"
                    style={{
                      width: `${
                        blastLevel === 1 
                          ? Math.min(100, (blastXp / 50) * 100) 
                          : blastLevel === 2
                          ? Math.min(100, ((blastXp - 50) / 150) * 100)
                          : blastLevel === 3
                          ? Math.min(100, ((blastXp - 200) / 300) * 100)
                          : 100
                      }%`
                    }}
                  />
                  <span className="absolute inset-0 flex items-center justify-center text-[8px] font-black">
                    {blastLevel === 1 ? `${blastXp}/50` : blastLevel === 2 ? `${blastXp}/200` : blastLevel === 3 ? `${blastXp}/500` : `${blastXp} XP`}
                  </span>
                </div>
              </div>

              {/* Combo Streak section */}
              {blastStreak > 0 && (
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] font-black px-2 py-0.5 rounded bg-amber-500 text-slate-900 uppercase animate-bounce ${blastStreak >= 3 ? 'bg-rose-500 text-white font-black' : ''}`}>
                    {blastStreak >= 3 ? `Combo x2 🔥` : `Streak ${blastStreak}`}
                  </span>
                </div>
              )}
            </div>

            {/* Game Over Modal Screen */}
            {blastStatus === 'gameover' && (
              <div className="absolute inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex flex-col items-center justify-center text-center p-6 text-white animate-fadeIn">
                <div className="max-w-xs space-y-4">
                  <div className="w-16 h-16 rounded-full bg-amber-500 flex items-center justify-center text-3xl mx-auto shadow-lg animate-pulse">
                    🏆
                  </div>
                  <h2 className="text-2xl font-black uppercase text-amber-400">
                    {globalLang === 'en' ? 'Time Up!' : 'Hết giờ rồi!'}
                  </h2>
                  <p className="text-sm opacity-85 leading-relaxed">
                    {globalLang === 'en' ? `You finished with ${blastScore} points!` : `Chúc mừng bé đã đạt được ${blastScore} điểm!`}
                  </p>
                  <p className="text-xs text-sky-400 font-bold">
                    {globalLang === 'en' ? `Best Record: ${Math.max(blastHighScore, blastScore)}` : `Kỷ lục cũ: ${blastHighScore}`}
                  </p>
                  <div className="pt-2 flex flex-col gap-2">
                    <button
                      onClick={startBlastGame}
                      className="w-full py-3 bg-[#58cc02] border-b-4 border-[#47a302] hover:bg-[#4eb302] text-slate-950 font-black text-xs uppercase rounded-xl transition cursor-pointer active:scale-95"
                    >
                      {globalLang === 'en' ? 'Play Again' : 'Chơi Lại'}
                    </button>
                    <button
                      onClick={() => {
                        saveHighScore('blast', blastScore);
                        setActiveGame('menu');
                      }}
                      className="w-full py-2 bg-slate-800 border border-slate-700 hover:bg-slate-700 text-xs font-bold uppercase rounded-xl transition cursor-pointer"
                    >
                      {globalLang === 'en' ? 'Back to Menu' : 'Quay Lại Menu'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        )}

        {activeGame === 'blocks' && gameSelectPhase === 'selecting' && (
          <motion.div
            key="blocks-config"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className={`flex-1 rounded-2xl border p-3 sm:p-5 ${isLight ? 'border-rose-200 bg-white/75' : 'border-rose-500/20 bg-[#160f24]'}`}
          >
            {renderGameConfigSelector(
              startBlocksGame,
              'bg-rose-500 border-rose-600 text-white shadow-[0_4px_0_#be123c] hover:bg-rose-400',
            )}
          </motion.div>
        )}

        {activeGame === 'blocks' && gameSelectPhase === 'ready' && (
          <motion.div
            key="blocks"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            className={`flex-1 min-h-0 overflow-y-auto rounded-2xl border p-3 sm:p-5 custom-scrollbar ${
              isLight ? 'border-sky-200 bg-white/75' : 'border-white/10 bg-[#090a2a]'
            }`}
          >
            <div className="mx-auto grid w-full max-w-5xl gap-4 lg:grid-cols-[280px_minmax(0,1fr)] lg:items-center">
              <section className={`order-2 flex min-h-0 flex-col justify-center lg:order-1 lg:min-h-[190px] ${
                blocksStatus === 'question' || blocksStatus === 'gameover'
                  ? 'fixed inset-0 z-[500] items-center bg-slate-950/55 p-4 backdrop-blur-sm lg:static lg:items-stretch lg:bg-transparent lg:p-0 lg:backdrop-blur-none'
                  : `fixed inset-x-2 bottom-2 z-[350] rounded-2xl border p-2 shadow-2xl backdrop-blur-xl lg:static lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none lg:backdrop-blur-none ${isLight ? 'border-sky-200 bg-white/95' : 'border-white/15 bg-slate-950/95'}`
              }`}>
                {blocksStatus === 'question' && blocksQuestion ? (
                  <div className={`mx-auto w-full max-w-sm rounded-2xl border p-4 shadow-2xl lg:max-w-none lg:shadow-none ${isLight ? 'border-amber-200 bg-amber-50' : 'border-amber-400/25 bg-[#17142c]'}`}>
                    <div className="mb-3 flex items-center gap-3">
                      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-white text-3xl shadow-sm">
                        {blocksQuestion.card.emoji || '📝'}
                      </div>
                      <div className="min-w-0">
                        <p className="text-[10px] font-black uppercase text-amber-600">
                          {globalLang === 'en' ? 'Vocabulary gate' : 'Cửa ải từ vựng'}
                        </p>
                        <h2 className="truncate text-xl font-black text-[var(--app-text)]">{blocksQuestion.card.word}</h2>
                        {blocksQuestion.card.ipa && <p className="text-xs font-bold text-sky-600">{blocksQuestion.card.ipa}</p>}
                      </div>
                      <button type="button" onClick={() => speakText(blocksQuestion.card.word)} className="ml-auto flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-sky-500 text-white" title={globalLang === 'en' ? 'Listen' : 'Nghe từ'}>
                        <Volume2 className="h-5 w-5" />
                      </button>
                    </div>
                    <p className="mb-2 text-xs font-bold text-[var(--app-text-muted)]">
                      {globalLang === 'en' ? 'What does this word mean?' : 'Từ này có nghĩa là gì?'}
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      {blocksQuestion.choices.map((choice) => (
                        <button
                          key={choice}
                          type="button"
                          onClick={() => answerBlocksQuestion(choice)}
                          className={`min-h-12 rounded-xl border px-2 py-2 text-xs font-black transition active:scale-95 ${
                            blocksFeedback === 'correct' && choice === blocksQuestion.card.vietnamese
                              ? 'border-emerald-500 bg-emerald-500 text-white'
                              : blocksFeedback === 'wrong' && choice !== blocksQuestion.card.vietnamese
                                ? isLight ? 'border-slate-200 bg-white text-slate-700' : 'border-white/10 bg-white/5 text-white'
                                : isLight ? 'border-amber-200 bg-white text-slate-800 hover:border-amber-400' : 'border-white/10 bg-white/5 text-white hover:border-amber-400'
                          }`}
                        >
                          {choice}
                        </button>
                      ))}
                    </div>
                    {blocksFeedback === 'wrong' && (
                      <p className="mt-2 text-center text-xs font-bold text-rose-500">
                        {globalLang === 'en' ? 'Try again. You can do it!' : 'Thử lại nhé, bé làm được mà!'}
                      </p>
                    )}
                  </div>
                ) : blocksStatus === 'clearing' ? (
                  <div className="text-center text-sm font-black text-amber-500">
                    {globalLang === 'en' ? 'Line complete!' : 'Hoàn thành một hàng!' }
                  </div>
                ) : blocksStatus === 'gameover' ? (
                  <div className={`mx-auto w-full max-w-sm rounded-2xl border p-5 text-center shadow-2xl lg:max-w-none lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none ${isLight ? 'border-amber-200 bg-white' : 'border-white/15 bg-[#17142c]'}`}>
                    <Trophy className="mx-auto mb-2 h-12 w-12 text-amber-500" />
                    <h2 className="text-xl font-black">{globalLang === 'en' ? 'Great game!' : 'Bé chơi giỏi lắm!'}</h2>
                    <p className="mt-1 text-sm text-[var(--app-text-muted)]">{globalLang === 'en' ? 'Correct answers' : 'Câu trả lời đúng'}: {blocksScore}</p>
                    <button type="button" onClick={startBlocksGame} className="mt-4 rounded-xl bg-emerald-500 px-5 py-3 text-xs font-black uppercase text-white">
                      {globalLang === 'en' ? 'Play again' : 'Chơi lại'}
                    </button>
                  </div>
                ) : (
                  <div>
                    <p className="mb-1.5 text-center text-[10px] font-bold leading-tight text-[var(--app-text-muted)] sm:mb-3 sm:text-xs">
                      {globalLang === 'en' ? 'Choose a shape, then tap its top-left board position.' : 'Chọn một khối, sau đó chạm vị trí góc trên-trái trên bàn.'}
                    </p>
                    <div className="flex items-center justify-center gap-1.5 sm:gap-3">
                      {blocksPieces.map((piece) => {
                        const rows = Math.max(...piece.cells.map(([row]) => row)) + 1;
                        const cols = Math.max(...piece.cells.map(([, col]) => col)) + 1;
                        return (
                          <button
                            key={piece.id}
                            type="button"
                            onClick={() => setBlocksSelectedPieceId(piece.id)}
                            onPointerDown={(event) => {
                              if (event.pointerType === 'touch') return;
                              event.preventDefault();
                              event.currentTarget.setPointerCapture(event.pointerId);
                              const bounds = event.currentTarget.getBoundingClientRect();
                              const targetRow = Math.max(0, Math.min(rows - 1, Math.floor(((event.clientY - bounds.top) / bounds.height) * rows)));
                              const targetCol = Math.max(0, Math.min(cols - 1, Math.floor(((event.clientX - bounds.left) / bounds.width) * cols)));
                              const nearestCell = [...piece.cells].sort((left, right) =>
                                (Math.abs(left[0] - targetRow) + Math.abs(left[1] - targetCol))
                                - (Math.abs(right[0] - targetRow) + Math.abs(right[1] - targetCol)),
                              )[0] || [0, 0];
                              blocksDragAnchorRef.current = { row: nearestCell[0], col: nearestCell[1] };
                              blocksBoardBoundsRef.current = blocksBoardElementRef.current?.getBoundingClientRect() || null;
                              blocksBoardElementRef.current?.classList.add('blocks-board-dragging');
                              blocksLatestPointerRef.current = { x: event.clientX, y: event.clientY };
                              blocksDraggingPieceIdRef.current = piece.id;
                              blocksHoverKeyRef.current = '';
                              setBlocksSelectedPieceId(piece.id);
                              setBlocksDraggingPieceId(piece.id);
                              setBlocksDragPosition({ x: event.clientX, y: event.clientY });
                            }}
                            onPointerMove={(event) => {
                              if (event.pointerType === 'touch') return;
                              if (blocksDraggingPieceIdRef.current === piece.id) {
                                event.preventDefault();
                                const x = event.clientX;
                                const y = event.clientY;
                                blocksLatestPointerRef.current = { x, y };
                                
                                // Direct GPU translation for instant finger tracking (no coalescing delay, no RAF latency)
                                moveBlocksDragGhost(x, y);

                                if (blocksDragFrameRef.current === null) {
                                  blocksDragFrameRef.current = window.requestAnimationFrame(() => {
                                    const { x, y } = blocksLatestPointerRef.current;
                                    const placement = getBlocksPlacementAtPoint(piece, x, y);
                                    const hoverKey = placement
                                      ? `${placement.row}:${placement.col}:${placement.valid ? 1 : 0}:${piece.id}`
                                      : 'none';
                                    if (hoverKey !== blocksHoverKeyRef.current) {
                                      blocksHoverKeyRef.current = hoverKey;
                                      updateBlocksDomPreview(piece, placement);
                                    }
                                    blocksDragFrameRef.current = null;
                                  });
                                }
                              }
                            }}
                            onPointerUp={(event) => {
                              if (event.pointerType === 'touch') return;
                              if (blocksDragFrameRef.current !== null) {
                                window.cancelAnimationFrame(blocksDragFrameRef.current);
                                blocksDragFrameRef.current = null;
                              }
                              const placement = getBlocksPlacementAtPoint(piece, event.clientX, event.clientY);
                              blocksDraggingPieceIdRef.current = null;
                              blocksBoardBoundsRef.current = null;
                              blocksHoverKeyRef.current = '';
                              clearBlocksDomPreview();
                              blocksBoardElementRef.current?.classList.remove('blocks-board-dragging');
                              setBlocksDraggingPieceId(null);
                              setBlocksDragPosition(null);
                              if (placement) {
                                placeBlocksPiece(placement.row, placement.col, piece.id);
                              }
                            }}
                            onPointerCancel={(event) => {
                              if (event.pointerType === 'touch') return;
                              if (blocksDragFrameRef.current !== null) {
                                window.cancelAnimationFrame(blocksDragFrameRef.current);
                                blocksDragFrameRef.current = null;
                              }
                              blocksDraggingPieceIdRef.current = null;
                              blocksBoardBoundsRef.current = null;
                              blocksHoverKeyRef.current = '';
                              clearBlocksDomPreview();
                              blocksBoardElementRef.current?.classList.remove('blocks-board-dragging');
                              setBlocksDraggingPieceId(null);
                              setBlocksDragPosition(null);
                            }}
                            onTouchStart={(event) => {
                              const touch = event.touches[0];
                              if (!touch) return;
                              const bounds = event.currentTarget.getBoundingClientRect();
                              const targetRow = Math.max(0, Math.min(rows - 1, Math.floor(((touch.clientY - bounds.top) / bounds.height) * rows)));
                              const targetCol = Math.max(0, Math.min(cols - 1, Math.floor(((touch.clientX - bounds.left) / bounds.width) * cols)));
                              const nearestCell = [...piece.cells].sort((left, right) =>
                                (Math.abs(left[0] - targetRow) + Math.abs(left[1] - targetCol))
                                - (Math.abs(right[0] - targetRow) + Math.abs(right[1] - targetCol)),
                              )[0] || [0, 0];
                              blocksDragAnchorRef.current = { row: nearestCell[0], col: nearestCell[1] };
                              blocksBoardBoundsRef.current = blocksBoardElementRef.current?.getBoundingClientRect() || null;
                              blocksBoardElementRef.current?.classList.add('blocks-board-dragging');
                              blocksLatestPointerRef.current = { x: touch.clientX, y: touch.clientY };
                              blocksDraggingPieceIdRef.current = piece.id;
                              blocksHoverKeyRef.current = '';
                              setBlocksSelectedPieceId(piece.id);
                              setBlocksDraggingPieceId(piece.id);
                              setBlocksDragPosition({ x: touch.clientX, y: touch.clientY });
                            }}
                            onTouchMove={(event) => {
                              if (blocksDraggingPieceIdRef.current === piece.id) {
                                const touch = event.touches[0];
                                if (!touch) return;
                                const x = touch.clientX;
                                const y = touch.clientY;
                                blocksLatestPointerRef.current = { x, y };
                                
                                // Direct GPU translation (no TouchEvent translation layer lag)
                                moveBlocksDragGhost(x, y);

                                if (blocksDragFrameRef.current === null) {
                                  blocksDragFrameRef.current = window.requestAnimationFrame(() => {
                                    const { x, y } = blocksLatestPointerRef.current;
                                    const placement = getBlocksPlacementAtPoint(piece, x, y);
                                    const hoverKey = placement
                                      ? `${placement.row}:${placement.col}:${placement.valid ? 1 : 0}:${piece.id}`
                                      : 'none';
                                    if (hoverKey !== blocksHoverKeyRef.current) {
                                      blocksHoverKeyRef.current = hoverKey;
                                      updateBlocksDomPreview(piece, placement);
                                    }
                                    blocksDragFrameRef.current = null;
                                  });
                                }
                              }
                            }}
                            onTouchEnd={(event) => {
                              if (blocksDragFrameRef.current !== null) {
                                window.cancelAnimationFrame(blocksDragFrameRef.current);
                                blocksDragFrameRef.current = null;
                              }
                              const touch = event.changedTouches[0];
                              if (!touch) return;
                              const placement = getBlocksPlacementAtPoint(piece, touch.clientX, touch.clientY);
                              blocksDraggingPieceIdRef.current = null;
                              blocksBoardBoundsRef.current = null;
                              blocksHoverKeyRef.current = '';
                              clearBlocksDomPreview();
                              blocksBoardElementRef.current?.classList.remove('blocks-board-dragging');
                              setBlocksDraggingPieceId(null);
                              setBlocksDragPosition(null);
                              if (placement) {
                                placeBlocksPiece(placement.row, placement.col, piece.id);
                              }
                            }}
                            className={`flex h-16 w-16 touch-none items-center justify-center rounded-xl border transition sm:h-24 sm:w-24 ${blocksSelectedPieceId === piece.id ? 'border-sky-400 bg-sky-400/15 ring-2 ring-sky-400' : isLight ? 'border-slate-200 bg-slate-50' : 'border-white/10 bg-white/5'}`}
                          >
                            <span className="grid gap-0.5 sm:gap-1" style={{ gridTemplateColumns: `repeat(${cols}, 15px)`, gridTemplateRows: `repeat(${rows}, 15px)` }}>
                              {Array.from({ length: rows * cols }, (_, index) => {
                                const row = Math.floor(index / cols);
                                const col = index % cols;
                                const filled = piece.cells.some(([dr, dc]) => dr === row && dc === col);
                                return <span key={index} className="rounded-[4px]" style={{ background: filled ? piece.color : 'transparent' }} />;
                              })}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </section>

              <section className="order-1 lg:order-2">
                <div className="mb-2 flex items-center justify-between text-sm font-black">
                  <span>{globalLang === 'en' ? 'Correct' : 'Câu đúng'}: {blocksScore}</span>
                  <span className="text-amber-500"><Trophy className="mr-1 inline h-4 w-4" />{blocksHighScore}</span>
                </div>
                <div 
                  ref={blocksBoardElementRef} 
                  className={`mx-auto grid aspect-square w-full max-w-[264px] grid-cols-8 gap-0.5 rounded-xl p-1 min-[390px]:max-w-[288px] sm:max-w-[420px] sm:gap-1 sm:p-1.5 lg:max-w-[560px] touch-none select-none ${isLight ? 'bg-slate-200' : 'bg-[#050620]'}`}
                  style={{
                    willChange: 'transform',
                    transform: 'translate3d(0, 0, 0)',
                    WebkitTransform: 'translate3d(0, 0, 0)',
                  }}
                >
                  {blocksBoard.flatMap((line, row) => line.map((cell, col) => (
                    <button
                      key={`${row}-${col}`}
                      data-blocks-row={row}
                      data-blocks-col={col}
                      ref={(el) => {
                        if (el) {
                          blocksCellRefs.current[`${row}-${col}`] = el;
                        }
                      }}
                      type="button"
                      disabled={blocksStatus !== 'placing'}
                      onClick={() => placeBlocksPiece(row, col)}
                      aria-label={`${globalLang === 'en' ? 'Board cell' : 'Ô bàn cờ'} ${row + 1}-${col + 1}`}
                      className={`aspect-square min-h-0 rounded-[5px] border active:scale-90 touch-none select-none ${
                        blocksClearingCells.has(`${row}-${col}`)
                          ? 'blocks-cell-shatter z-10 border-white text-white'
                          : blocksLastPlacedCells.has(`${row}-${col}`)
                          ? 'blocks-cell-placed'
                          : getBlocksPreview(row, col)?.valid === false
                          ? 'scale-[0.92] border-red-950 shadow-[0_0_18px_rgba(220,38,38,1)]'
                          : getBlocksPreview(row, col)
                          ? 'scale-[0.94] border-white/80 shadow-[0_0_14px_rgba(255,255,255,0.7)]'
                          : cell
                          ? 'border-white/20 shadow-inner'
                          : isLight
                          ? 'border-slate-300 bg-white/80'
                          : 'border-white/5 bg-slate-700'
                      }`}
                      style={{
                        transitionProperty: 'transform, background-color, box-shadow',
                        transitionDuration: '150ms',
                        transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)',
                        willChange: 'transform, background-color, box-shadow',
                        ...(getBlocksPreview(row, col)
                          ? {
                              background: getBlocksPreview(row, col)?.color,
                              backgroundImage: `linear-gradient(135deg, ${getBlocksPreview(row, col)?.color} 0%, rgba(255,255,255,0.2) 8%, ${getBlocksPreview(row, col)?.color} 80%)`,
                              opacity: getBlocksPreview(row, col)?.valid ? 0.82 : 0.96,
                              boxShadow: getBlocksPreview(row, col)?.valid
                                ? 'inset 0 1.5px 3px rgba(255,255,255,0.3), 0 0 10px rgba(255,255,255,0.4)'
                                : '0 0 12px rgba(220,38,38,0.7)',
                            }
                          : cell
                          ? {
                              background: cell,
                              backgroundImage: `linear-gradient(135deg, ${cell} 0%, rgba(255,255,255,0.22) 8%, ${cell} 80%, rgba(0,0,0,0.2) 100%)`,
                              boxShadow: 'inset 0 1.5px 3px rgba(255,255,255,0.45), inset 0 -2px 3px rgba(0,0,0,0.25), 0 2px 4px rgba(0,0,0,0.15)',
                              borderColor: 'rgba(255,255,255,0.12)',
                            }
                          : {}),
                      }}
                    />
                  )))}
                </div>
              </section>
            </div>
            {draggingBlocksPiece && blocksDragPosition && (
              <div
                ref={blocksDragGhostRef}
                className="blocks-drag-ghost pointer-events-none fixed left-0 top-0 z-[600] grid gap-1 rounded-lg p-1.5 will-change-transform sm:shadow-xl touch-none select-none"
                style={{
                  gridTemplateColumns: `repeat(${Math.max(...draggingBlocksPiece.cells.map(([, col]) => col)) + 1}, 24px)`,
                  transform: `translate3d(${blocksDragPosition.x - blocksDragAnchorRef.current.col * 28 - 15}px, ${blocksDragPosition.y - blocksDragAnchorRef.current.row * 28 - 15}px, 0)`,
                  WebkitBackfaceVisibility: 'hidden',
                  backfaceVisibility: 'hidden',
                  WebkitTransformStyle: 'preserve-3d',
                  transformStyle: 'preserve-3d',
                }}
              >
                {Array.from({
                  length: (Math.max(...draggingBlocksPiece.cells.map(([row]) => row)) + 1)
                    * (Math.max(...draggingBlocksPiece.cells.map(([, col]) => col)) + 1),
                }, (_, index) => {
                  const cols = Math.max(...draggingBlocksPiece.cells.map(([, col]) => col)) + 1;
                  const row = Math.floor(index / cols);
                  const col = index % cols;
                  const filled = draggingBlocksPiece.cells.some(([dr, dc]) => dr === row && dc === col);
                  return <span key={index} className="h-6 w-6 rounded-[5px] border border-white/50 sm:shadow-md" style={{ background: filled ? draggingBlocksPiece.color : 'transparent', borderColor: filled ? 'rgba(255,255,255,.55)' : 'transparent' }} />;
                })}
              </div>
            )}
          </motion.div>
        )}

        {/* GAME 1: TRUE/FALSE FLASHCARDS */}
        {activeGame === 'true_false' && (
          <motion.div
            key="true_false"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            className={`flex-1 flex flex-col justify-between min-h-[420px] sm:min-h-0 space-y-2 sm:space-y-4 p-3 sm:p-6 rounded-2xl sm:rounded-3xl border ${isLight
                ? 'bg-gradient-to-br from-emerald-50 to-teal-50/30 border-emerald-100/70 text-slate-800'
                : 'bg-gradient-to-br from-emerald-950/20 to-teal-950/20 border-emerald-900/30 text-white'
              }`}
          >
            <div className={`flex items-center justify-between text-xs font-bold border-b pb-2 ${isLight ? 'border-emerald-100/80' : 'border-white/[0.04]'}`}>
              <div className="text-emerald-600 dark:text-emerald-500 font-extrabold flex items-center gap-1">
                ⭐ {globalLang === 'en' ? 'True / False' : 'Đúng / Sai'}
              </div>
              <div className={isLight ? 'text-slate-600' : 'text-slate-400'}>
                🏆 {globalLang === 'en' ? 'Best:' : 'Kỷ lục:'} {tfHighScore}
              </div>
            </div>

            {gameSelectPhase === 'selecting' ? (
              renderGameConfigSelector(
                () => { setGameSelectPhase('ready'); setTfScore(0); initTfTurn(); },
                'bg-emerald-500 hover:bg-emerald-400 border-emerald-700'
              )
            ) : (
              <>
                <div className="text-center">
                  <span className="text-emerald-600 dark:text-emerald-400 font-extrabold text-sm">
                    ⭐ {globalLang === 'en' ? 'Score:' : 'Điểm:'} {tfScore}
                  </span>
                </div>

                <div className="flex-1 flex flex-col items-center justify-center py-1 sm:py-4 gap-2 sm:gap-4">
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={tfCard.word}
                      initial={{ rotateY: -90, opacity: 0 }}
                      animate={{ rotateY: 0, opacity: 1 }}
                      exit={{ rotateY: 90, opacity: 0 }}
                      transition={{ duration: 0.3 }}
                      className={`w-36 h-36 min-[390px]:w-40 min-[390px]:h-44 sm:w-56 sm:h-64 rounded-3xl border-2 border-b-8 p-3 sm:p-4 flex items-center justify-center shadow-lg ${isLight ? 'bg-white border-slate-200' : 'bg-[#18282f] border-[#243e49]'}`}
                    >
                      <div className="text-6xl sm:text-8xl animate-bounce" style={{ animationDuration: '2.5s' }}>
                        {tfCard.emoji}
                      </div>
                    </motion.div>
                  </AnimatePresence>

                  <div className="w-full text-center space-y-1 sm:space-y-1.5 mt-2">
                    <span className="text-[10px] sm:text-[11px] font-black uppercase tracking-wider text-[#1cb0f6] block">
                      {tfState === 'playing'
                        ? globalLang === 'en' ? 'Question:' : 'Câu hỏi:'
                        : globalLang === 'en' ? 'Say this word:' : 'Bé đọc từ:'}
                    </span>
                    <div className={`inline-block px-5 py-2.5 rounded-2xl border text-sm sm:text-base font-black leading-tight shadow-md relative ${isLight ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-[#292218] border-[#3f3424] text-amber-400'}`}>
                      <div className={`absolute -top-1.5 left-1/2 -translate-x-1/2 w-3 h-3 rotate-45 border-t border-l ${isLight ? 'bg-amber-50 border-amber-200' : 'bg-[#292218] border-[#3f3424]'}`} />
                      "{tfState === 'playing' ? tfStatement : tfCard.word}"
                    </div>
                  </div>
                </div>

                {tfFeedback && (
                  <div className={`p-3 rounded-2xl text-center text-xs font-extrabold ${tfState === 'wrong'
                      ? 'bg-rose-500/10 text-rose-600 dark:text-rose-500'
                      : tfState === 'speaking'
                        ? 'bg-[#1cb0f6]/10 text-[#1483b8] dark:text-[#1cb0f6] animate-pulse'
                        : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-500'
                    }`}>
                    {tfFeedback}
                  </div>
                )}

                {tfIsRecording && (
                  <div className="flex justify-center items-center gap-1.5 py-1">
                    <span className="w-1.5 h-3 bg-[#1cb0f6] rounded-full animate-bounce" />
                    <span className="w-1.5 h-4.5 bg-[#1cb0f6] rounded-full animate-bounce delay-75" />
                    <span className="w-1.5 h-3 bg-[#1cb0f6] rounded-full animate-bounce delay-150" />
                    <span className="text-[10px] sm:text-[11px] font-black uppercase tracking-wider text-[#1483b8] dark:text-[#1cb0f6]">
                      {globalLang === 'en' ? 'Speak now...' : 'Hãy nói đi...'}
                    </span>
                  </div>
                )}

                <div className="flex flex-col items-center gap-3">
                  {tfState === 'playing' && (
                    <div className="flex gap-4 w-full">
                      <button onClick={() => handleTfChoice(true)} className="flex-1 min-h-[48px] sm:min-h-[56px] bg-emerald-500 hover:bg-emerald-400 text-white rounded-2xl font-black text-sm uppercase border-b-4 border-emerald-700 transition cursor-pointer">
                        {globalLang === 'en' ? 'YES 🟢' : 'ĐÚNG 🟢'}
                      </button>
                      <button onClick={() => handleTfChoice(false)} className="flex-1 min-h-[48px] sm:min-h-[56px] bg-rose-500 hover:bg-rose-400 text-white rounded-2xl font-black text-sm uppercase border-b-4 border-rose-700 transition cursor-pointer">
                        {globalLang === 'en' ? 'NO 🔴' : 'SAI 🔴'}
                      </button>
                    </div>
                  )}
                  {tfState === 'speaking' && (
                    <div className="flex flex-col items-center gap-2">
                      <button onClick={startTfSpeechRecognition} className={`w-14 h-14 sm:w-16 sm:h-16 rounded-full flex items-center justify-center text-white border-b-4 shadow-lg transition cursor-pointer ${tfIsRecording ? 'bg-rose-500 hover:bg-rose-400 border-rose-700 animate-pulse' : 'bg-[#1cb0f6] hover:bg-[#1599d8] border-[#138ec9]'}`}>
                        {tfIsRecording ? <MicOff className="w-5.5 h-5.5" /> : <Mic className="w-5.5 h-5.5" />}
                      </button>
                      <span className="text-[9px] sm:text-[10px] text-slate-500 dark:text-slate-400">{globalLang === 'en' ? 'Click mic to retry spelling' : 'Nhấn mic để phát âm lại'}</span>
                    </div>
                  )}
                  {tfState === 'wrong' && (
                    <button onClick={initTfTurn} className="w-full min-h-[48px] sm:min-h-[52px] bg-[#1cb0f6] hover:bg-[#1599d8] text-white rounded-2xl font-black text-xs uppercase border-b-4 border-[#138ec9] transition cursor-pointer flex items-center justify-center gap-1.5">
                      <RefreshCw className="w-4 h-4" /><span>{globalLang === 'en' ? 'Next Card' : 'Thẻ Tiếp Theo'}</span>
                    </button>
                  )}
                  {tfState === 'done' && (
                    <button onClick={initTfTurn} className="w-full min-h-[48px] sm:min-h-[52px] bg-[#58cc02] hover:bg-[#4eb302] text-white rounded-2xl font-black text-xs uppercase border-b-4 border-[#47a302] transition cursor-pointer flex items-center justify-center gap-1.5">
                      <Play className="w-4 h-4" /><span>{globalLang === 'en' ? 'Continue Play' : 'Chơi Tiếp'}</span>
                    </button>
                  )}
                </div>
              </>
            )}
          </motion.div>
        )}

        {/* GAME 2: WORD CHAIN */}
        {activeGame === 'word_chain' && (
          <motion.div
            key="word_chain"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            className={`flex-1 flex flex-col justify-between min-h-[420px] sm:min-h-0 space-y-2 sm:space-y-4 p-3 sm:p-6 rounded-2xl sm:rounded-3xl border ${isLight
                ? 'bg-gradient-to-br from-indigo-50 to-blue-50/30 border-indigo-100/70 text-slate-800'
                : 'bg-gradient-to-br from-indigo-950/20 to-blue-950/20 border-indigo-900/30 text-white'
              }`}
          >
            {gameSelectPhase === 'selecting' ? (
              renderGameConfigSelector(
                () => { setGameSelectPhase('ready'); startWcGame(); },
                'bg-indigo-500 hover:bg-indigo-400 border-indigo-700'
              )
            ) : (
              <>
                <div className={`flex items-center justify-between text-xs font-bold border-b pb-2 ${isLight ? 'border-indigo-100/80' : 'border-white/[0.04]'}`}>
                  <div className="text-indigo-600 dark:text-indigo-400 font-extrabold">
                    {globalLang === 'en' ? 'Word count:' : 'Số từ đã nối:'} 🔗 {Math.floor(wcChain.length / 2)}
                  </div>
                  <div className={isLight ? 'text-slate-600' : 'text-slate-400'}>
                    {globalLang === 'en' ? 'Next letter:' : 'Chữ cái tiếp theo:'} <span className="rounded bg-indigo-500 px-2 py-0.5 font-mono text-white font-extrabold">{wcNextLetter.toUpperCase()}</span>
                  </div>
                </div>

                {wcGameStatus === 'idle' ? (
                  <div className="flex-1 flex flex-col items-center justify-center text-center space-y-4 sm:space-y-5">
                    <div className="relative p-2 rounded-full border-4 border-indigo-500 overflow-hidden bg-slate-800">
                      <SunnyMascot outfitId={state.selectedOutfitId || 'normal'} state="idle" sizeClassName="w-28 h-28 sm:w-36 sm:h-36" />
                    </div>
                    <div className="space-y-1">
                      <h3 className="text-xs sm:text-sm font-bold uppercase text-indigo-600 dark:text-indigo-400">
                        {globalLang === 'en' ? 'Start Word Chaining with Sunny!' : 'Mở màn đấu nối từ với Sunny!'}
                      </h3>
                      <p className="text-[11px] sm:text-xs text-slate-600 dark:text-[var(--app-text-muted)] max-w-xs leading-relaxed">
                        {globalLang === 'en'
                          ? 'Sunny will open with a random friendly word. Continue from its final letter!'
                          : 'Sunny sẽ mở đầu bằng một từ thân thiện ngẫu nhiên. Bé nối tiếp bằng chữ cái cuối của từ đó nhé!'}
                      </p>
                    </div>
                    <button
                      onClick={startWcGame}
                      className="px-5 py-2.5 sm:px-6 sm:py-3 bg-[#58cc02] border-b-4 border-[#47a302] hover:bg-[#4eb302] text-white rounded-2xl font-black text-xs uppercase transition cursor-pointer"
                    >
                      {globalLang === 'en' ? 'Start Playing' : 'Bắt Đầu Chơi'}
                    </button>
                  </div>
                ) : (
                  <>
                    <div className={`flex-1 overflow-y-auto p-3 sm:p-4 rounded-3xl border space-y-3 custom-scrollbar ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/40 border-white/[0.04]'}`}>
                  <span className="block text-[8px] sm:text-[9px] font-black uppercase text-slate-500 tracking-wider">
                    {globalLang === 'en' ? 'WORD CHAIN HISTORY:' : 'LỊCH SỬ CHUỖI TỪ NỐI:'}
                  </span>

                  <div className="flex flex-wrap gap-1.5 sm:gap-2 items-center">
                    {wcChain.map((word, index) => {
                      const isSunnyWord = index % 2 === 0;
                      return (
                        <div key={`chain_${index}`} className="flex items-center gap-1 sm:gap-1.5">
                          <span className={`px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-full text-[11px] sm:text-xs font-black border-b-2 flex items-center gap-1 ${isSunnyWord
                              ? 'bg-amber-500/10 border-amber-600/30 text-amber-700 dark:text-amber-500'
                              : 'bg-indigo-500/10 border-indigo-600/30 text-indigo-700 dark:text-indigo-400'
                            }`}>
                            <span>{isSunnyWord ? '☀️' : '👶'}</span>
                            <span>{word}</span>
                          </span>
                          {index < wcChain.length - 1 && (
                            <span className="text-slate-400 dark:text-slate-500 text-[10px] sm:text-xs font-bold">➔</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                <AnimatePresence mode="wait">
                  {wcHint && wcHint.revealedLetters > 0 && (
                    <motion.div
                      key={`${wcHint.word}-${wcHint.revealedLetters}`}
                      initial={{ opacity: 0, scale: 0.94, y: 8 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.96 }}
                      className={`mx-auto w-full max-w-sm rounded-2xl border-2 p-4 text-center shadow-lg ${isLight ? 'border-indigo-200 bg-white' : 'border-indigo-500/40 bg-slate-900'
                        }`}
                    >
                      <div className="mb-2 flex items-center justify-center gap-1 text-[10px] font-black uppercase text-indigo-500">
                        <HelpCircle className="h-3.5 w-3.5" />
                        {globalLang === 'en' ? 'A little hint' : 'Gợi ý cho bé'}
                      </div>
                      <div className={`flex min-h-10 items-center justify-center gap-1 font-mono text-2xl font-black ${isLight ? 'text-indigo-700' : 'text-indigo-300'
                        }`}>
                        {buildWordHint(wcHint.word, wcHint.revealedLetters).map((letter, index) => (
                          <span key={`${wcHint.word}-${index}`} className="inline-flex w-5 justify-center border-b-2 border-indigo-300 pb-0.5">
                            {letter}
                          </span>
                        ))}
                      </div>
                      {wcHint.revealedLetters === wcHint.word.length && (
                        <div className={`mt-3 text-sm font-bold ${isLight ? 'text-slate-600' : 'text-slate-300'}`}>
                          <div className="flex items-center justify-center gap-2">
                            <span>
                              IPA: <span className={`font-mono ${isLight ? 'text-indigo-700' : 'text-indigo-300'}`}>{wcHint.ipa || '---'}</span>
                            </span>
                            <button
                              type="button"
                              onClick={() => speakText(wcHint.word)}
                              className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-500 text-white shadow-sm transition hover:bg-indigo-400 active:scale-95"
                              aria-label={globalLang === 'en' ? `Listen to ${wcHint.word}` : `Nghe từ ${wcHint.word}`}
                              title={globalLang === 'en' ? 'Listen and repeat' : 'Nghe và đọc theo'}
                            >
                              <Volume2 className="h-4 w-4" />
                            </button>
                          </div>
                          {wcHint.vietnamese && (
                            <div className={`mt-1.5 ${isLight ? 'text-emerald-700' : 'text-emerald-300'}`}>
                              Nghĩa: {wcHint.vietnamese}
                            </div>
                          )}
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>

                {wcAttempt && (
                  <div className={`mx-auto w-full max-w-sm rounded-2xl border p-3 text-center ${wcAttempt.isCorrect
                      ? 'border-emerald-300 bg-emerald-500/10'
                      : 'border-rose-300 bg-rose-500/10'
                    }`}>
                    <div className="mb-2 flex items-center justify-center">
                      <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${wcAttempt.isCorrect
                          ? (wcAttempt.ruleMatched === false
                            ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                            : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300')
                          : 'bg-rose-500/15 text-rose-700 dark:text-rose-300'
                        }`}>
                        {wcAttempt.isCorrect
                          ? (wcAttempt.ruleMatched === false
                            ? (globalLang === 'en' ? 'Right Word, Wrong Rule' : 'Đúng Từ, Sai Luật')
                            : (globalLang === 'en' ? 'Correct Word' : 'Từ Đúng'))
                          : (globalLang === 'en' ? 'Try The Hint' : 'Thử Theo Gợi Ý')}
                      </span>
                    </div>
                    <div className="mb-1 text-[10px] font-black uppercase text-slate-500">
                      {globalLang === 'en' ? 'Sunny heard' : 'Sunny nghe được'}
                    </div>
                    <div className="flex flex-wrap items-center justify-center gap-0.5 font-mono text-xl font-black">
                      {compareWordCharacters(wcAttempt.heard, wcAttempt.target, wcAttempt.isCorrect).map((result, index) => {
                        return (
                          <span
                            key={`heard-${index}`}
                            className={result.matches && !wcAttempt.showAllIncorrect
                              ? 'text-emerald-600'
                              : 'border-b-2 border-rose-500 text-rose-600'}
                          >
                            {result.character}
                          </span>
                        );
                      })}
                    </div>
                    <div className={`mt-2 text-[11px] font-bold leading-relaxed ${wcAttempt.isCorrect
                        ? (wcAttempt.ruleMatched === false
                          ? (isLight ? 'text-amber-700' : 'text-amber-300')
                          : (isLight ? 'text-emerald-700' : 'text-emerald-300'))
                        : (isLight ? 'text-rose-700' : 'text-rose-300')
                      }`}>
                      {wcAttempt.isCorrect
                        ? (wcAttempt.ruleMatched === false
                          ? (globalLang === 'en'
                            ? 'Sunny understood the word, but this turn still needs the hint rule.'
                            : 'Sunny hiểu từ bé nói, nhưng lượt này vẫn cần theo đúng luật của gợi ý.')
                          : (globalLang === 'en'
                            ? 'Nice pronunciation. The game can continue.'
                            : 'Phát âm tốt rồi. Trò chơi tiếp tục nhé.'))
                        : (globalLang === 'en'
                          ? 'Read the hint word so Sunny can follow your turn.'
                          : 'Bé đọc theo từ gợi ý để Sunny bắt được lượt này nhé.')}
                    </div>
                    {wcAttempt.isCorrect && (
                      <div className="mt-2 flex items-center justify-center gap-2">
                        {wcAttempt.ipa && (
                          <span className="font-mono text-xs font-bold text-emerald-700">
                            {wcAttempt.ipa}
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => speakText(wcAttempt.target)}
                          className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500 text-white shadow-sm transition hover:bg-emerald-400 active:scale-95"
                          aria-label={globalLang === 'en' ? `Listen to ${wcAttempt.target}` : `Nghe từ ${wcAttempt.target}`}
                          title={globalLang === 'en' ? 'Listen and repeat' : 'Nghe và đọc theo'}
                        >
                          <Volume2 className="h-4 w-4" />
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {wcFeedback && (
                  <div className="p-2.5 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-center text-xs font-bold text-indigo-700 dark:text-indigo-400">
                    {wcFeedback[globalLang]}
                  </div>
                )}

                <div className="flex flex-col items-center gap-3">
                  {wcGameStatus === 'playing' && (
                    <>
                      {wcIsRecording && (
                        <div className="flex justify-center items-center gap-1.5">
                          <span className="w-1.5 h-3 bg-indigo-500 rounded-full animate-bounce" />
                          <span className="w-1.5 h-4.5 bg-indigo-500 rounded-full animate-bounce delay-75" />
                          <span className="w-1.5 h-3 bg-indigo-500 rounded-full animate-bounce delay-150" />
                          <span className={`text-[10px] sm:text-[11px] font-black uppercase ${isLight ? 'text-indigo-700' : 'text-indigo-300'}`}>
                            {globalLang === 'en' ? 'Listening...' : 'Đang lắng nghe bé nói...'}
                          </span>
                        </div>
                      )}

                      {!wcIsRecording && wcInterimText && (
                        <div className={`text-xs font-bold ${isLight ? 'text-indigo-700' : 'text-indigo-300'}`}>
                          {globalLang === 'en' ? 'Heard:' : 'Đã nghe:'} {wcInterimText}
                        </div>
                      )}

                      <div className="flex items-center justify-center gap-4 w-full">
                        <button
                          onClick={startWcSpeechRecognition}
                          className={`w-14 h-14 sm:w-16 sm:h-16 rounded-full flex items-center justify-center text-white border-b-4 shadow-lg transition cursor-pointer ${wcIsRecording
                              ? 'bg-rose-500 hover:bg-rose-400 border-rose-700 animate-pulse'
                              : 'bg-indigo-500 hover:bg-indigo-400 border-indigo-700'
                            }`}
                        >
                          {wcIsRecording ? <MicOff className="w-5.5 h-5.5" /> : <Mic className="w-5.5 h-5.5" />}
                        </button>
                      </div>

                      <button
                        onClick={() => {
                          playAppSound(200, 'sine', 0.1);
                          clearWcHintTimer();
                          setWcGameStatus('ended');
                          const childWordsCount = Math.floor(wcChain.length / 2);
                          saveHighScore('wc', childWordsCount);
                          setWcFeedback({
                            en: `Game Over! You linked ${childWordsCount} words. Keep practicing!`,
                            vi: `Kết thúc cuộc chơi! Bé đã nối được ${childWordsCount} từ. Cố gắng thêm nhé!`,
                          });
                        }}
                        className="w-full min-h-[44px] sm:min-h-[50px] bg-rose-600 hover:bg-rose-500 text-white rounded-2xl font-black text-xs uppercase border-b-4 border-rose-800 transition cursor-pointer"
                      >
                        {globalLang === 'en' ? 'Give Up 🏳️' : 'Chịu Thua 🏳️'}
                      </button>
                    </>
                  )}

                  {wcGameStatus === 'ended' && (
                    <button
                      onClick={startWcGame}
                      className="w-full min-h-[44px] sm:min-h-[50px] bg-[#58cc02] hover:bg-[#4eb302] text-white rounded-2xl font-black text-xs uppercase border-b-4 border-[#47a302] transition cursor-pointer flex items-center justify-center gap-1.5"
                    >
                      <RefreshCw className="w-4 h-4" />
                      <span>{globalLang === 'en' ? 'Play Again' : 'Chơi Lại'}</span>
                    </button>
                  )}
                </div>
              </>
            )}
          </>
        )}
      </motion.div>
        )}

        {/* GAME 3: FLASHCARD MATCHING */}
        {activeGame === 'flashcard_match' && (
          <motion.div
            key="flashcard_match"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            className={`flex-1 flex flex-col justify-between min-h-[420px] sm:min-h-0 space-y-2 sm:space-y-4 p-3 sm:p-6 rounded-2xl sm:rounded-3xl border ${isLight
                ? 'bg-gradient-to-br from-amber-50 to-orange-50/30 border-amber-100/70 text-slate-800'
                : 'bg-gradient-to-br from-amber-950/20 to-orange-950/20 border-amber-900/30 text-white'
              }`}
          >
            <div className={`flex items-center justify-between text-xs font-bold border-b pb-2 ${isLight ? 'border-amber-100/80' : 'border-white/[0.04]'}`}>
              <div className="text-amber-600 dark:text-amber-500 font-extrabold flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                <span>{globalLang === 'en' ? 'Timer:' : 'Thời gian:'} {fmTimer}s</span>
              </div>
              <div className={isLight ? 'text-slate-600' : 'text-slate-400'}>
                {globalLang === 'en' ? 'Best Time:' : 'Ghép nhanh nhất:'} {fmBestTime > 0 ? `${fmBestTime}s` : '---'}
              </div>
            </div>


            {gameSelectPhase === 'selecting' ? (
              renderGameConfigSelector(
                () => { setGameSelectPhase('ready'); startFmGame(); },
                'bg-amber-500 hover:bg-amber-400 border-amber-600'
              )
            ) : (
              <>
                {fmGameStatus === 'idle' ? (
                  <div className="flex-1 flex flex-col items-center justify-center text-center space-y-3 py-2">
                    <div className="text-5xl sm:text-6xl animate-pulse">🎴</div>
                    <div className="space-y-1">
                      <h3 className="text-xs sm:text-sm font-bold uppercase text-amber-600 dark:text-amber-500">
                        {globalLang === 'en' ? 'Ready to Match!' : 'Sẵn sàng Ghép Thẻ!'}
                      </h3>
                      <p className="text-[11px] sm:text-xs text-slate-600 dark:text-[var(--app-text-muted)] max-w-xs leading-relaxed">
                        {globalLang === 'en'
                          ? 'Match 6 pairs of word + picture cards as fast as you can!'
                          : 'Ghép đúng 6 cặp thẻ chữ và hình ảnh nhanh nhất có thể!'}
                      </p>
                    </div>
                    <button
                      onClick={startFmGame}
                      className="px-5 py-2.5 sm:px-6 sm:py-3 bg-[#58cc02] border-b-4 border-[#47a302] hover:bg-[#4eb302] text-white rounded-2xl font-black text-xs uppercase transition cursor-pointer"
                    >
                      {globalLang === 'en' ? 'Start Matching' : 'Bắt Đầu Chép'}
                    </button>
                  </div>
                ) : fmGameStatus === 'playing' ? (
                  /* Responsive Card Grid with Optimized Sizing for Mobile screens */
                  <div className="flex-1 grid grid-cols-3 md:grid-cols-4 gap-2 sm:gap-4 py-1 sm:py-2">
                    {fmCards.map((card) => (
                      <button
                        key={card.id}
                        onClick={() => handleFmCardClick(card)}
                        className={`fm-match-card h-20 min-[390px]:h-24 sm:h-32 md:h-36 rounded-xl sm:rounded-2xl border-2 border-b-4 transition-all duration-200 flex flex-col items-center justify-center p-1 sm:p-3 text-center select-none cursor-pointer ${card.isMatched
                            ? 'opacity-0 scale-75 pointer-events-none'
                            : fmCardFeedback[card.id] === 'correct'
                              ? 'fm-card-correct border-emerald-400 bg-emerald-100 text-emerald-900'
                              : fmCardFeedback[card.id] === 'wrong'
                                ? 'fm-card-wrong border-rose-500 bg-rose-100 text-rose-900'
                            : card.isSelected
                              ? 'border-amber-400 bg-amber-100/80 scale-[1.04] shadow-[0_0_20px_rgba(251,191,36,0.45)]'
                              : isLight
                                ? 'border-slate-200 bg-white hover:-translate-y-1 hover:border-amber-300 hover:bg-amber-50 shadow-sm hover:shadow-lg'
                                : 'border-[#37464f] bg-slate-900/60 hover:-translate-y-1 hover:border-amber-500/60 hover:bg-slate-900/90 hover:shadow-lg'
                          }`}
                      >
                        {card.type === 'pic' ? (
                          <div className="flex flex-col items-center gap-1 sm:gap-1.5">
                            <span className="text-3xl sm:text-4xl md:text-5xl">{card.content.split(' ')[0]}</span>
                            <span className="text-[9px] sm:text-[10px] md:text-xs text-slate-500 dark:text-slate-400 font-mono tracking-tighter">
                              {card.content.split(' ')[1]}
                            </span>
                          </div>
                        ) : (
                          <div className="flex flex-col justify-center h-full">
                            <span className="text-[11px] sm:text-xs md:text-sm font-black uppercase text-amber-600 dark:text-amber-500">
                              {card.content.split(' - ')[0]}
                            </span>
                            <span className="text-[9px] sm:text-[10px] text-slate-500 dark:text-slate-400 mt-1 leading-none font-bold">
                              {card.content.split(' - ')[1]}
                            </span>
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center text-center space-y-5 sm:space-y-6">
                    <div className="relative p-2 rounded-full border-4 border-emerald-500 overflow-hidden bg-slate-800 animate-bounce">
                      <SunnyMascot outfitId={state.selectedOutfitId || 'normal'} state="idle" sizeClassName="w-28 h-28 sm:w-36 sm:h-36" />
                    </div>
                    <div className="space-y-1">
                      <h3 className="text-sm sm:text-base font-black uppercase text-emerald-600 dark:text-emerald-500">
                        {globalLang === 'en' ? 'Super Matching Skills! 🎉' : 'Bé ghép thẻ siêu quá! 🎉'}
                      </h3>
                      <p className="text-xs sm:text-sm text-slate-700 dark:text-[var(--app-text-muted)]">
                        {globalLang === 'en'
                          ? `Completed in ${fmTimer} seconds. Earned +10 XP!`
                          : `Bé hoàn thành trong ${fmTimer} giây. Nhận ngay +10 điểm Kinh Nghiệm (XP)!`}
                      </p>
                    </div>
                    <button
                      onClick={startFmGame}
                      className="px-5 py-2.5 sm:px-6 sm:py-3 bg-[#58cc02] border-b-4 border-[#47a302] hover:bg-[#4eb302] text-white rounded-2xl font-black text-xs uppercase transition cursor-pointer"
                    >
                      {globalLang === 'en' ? 'Play Again' : 'Chơi Lại'}
                    </button>
                  </div>
                )}
              </>
            )}
          </motion.div>
        )}

        {/* GAME 4: AI STORYTELLING */}
        {activeGame === 'storytelling' && (
          <motion.div
            key="storytelling"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            className={`flex-1 flex flex-col justify-between min-h-[420px] sm:min-h-0 space-y-2 sm:space-y-4 p-3 sm:p-6 rounded-2xl sm:rounded-3xl border ${isLight
                ? 'bg-gradient-to-br from-violet-50 to-purple-50/30 border-violet-100/70 text-slate-800'
                : 'bg-gradient-to-br from-violet-950/20 to-purple-950/20 border-violet-900/30 text-white'
              }`}
          >
            <div className={`flex items-center justify-between text-xs font-bold border-b pb-2 ${isLight ? 'border-violet-100/80' : 'border-white/[0.04]'}`}>
              <div className="text-violet-600 dark:text-violet-400 font-extrabold flex items-center gap-1">
                <BookOpen className="w-3.5 h-3.5" />
                <span>{globalLang === 'en' ? 'AI Storytelling' : 'Tập Đọc Kể Chuyện'}</span>
              </div>
              <div className={isLight ? 'text-slate-600' : 'text-slate-400'}>
                {globalLang === 'en' ? 'Stories Completed:' : 'Truyện Đã Xong:'} 🌟 {stCompletedCount}
              </div>
            </div>


            {stGameStatus === 'idle' ? (
              /* Non-repeating selection stories view */
              <div className="flex-1 flex flex-col justify-start space-y-3 overflow-y-auto custom-scrollbar py-1">
                <h3 className="text-xs font-black uppercase text-slate-500 dark:text-slate-400 tracking-wider">
                  {globalLang === 'en' ? 'Select a short story:' : 'Chọn một câu chuyện ngắn:'}
                </h3>
                <div className={`grid grid-cols-2 gap-1 rounded-xl border p-1 ${isLight ? 'border-violet-200 bg-violet-50' : 'border-violet-500/20 bg-slate-950/35'}`}>
                  <button
                    type="button"
                    onClick={() => setStStoryMode('narrative')}
                    className={`flex min-h-10 items-center justify-center gap-2 rounded-lg px-3 text-[11px] font-black uppercase transition ${stStoryMode === 'narrative'
                      ? 'bg-violet-600 text-white shadow-sm'
                      : isLight ? 'text-slate-600 hover:bg-white' : 'text-slate-300 hover:bg-white/5'}`}
                  >
                    <BookOpen className="h-4 w-4" />
                    {globalLang === 'en' ? 'Paragraph' : 'Đoạn văn'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setStStoryMode('dialogue')}
                    className={`flex min-h-10 items-center justify-center gap-2 rounded-lg px-3 text-[11px] font-black uppercase transition ${stStoryMode === 'dialogue'
                      ? 'bg-sky-500 text-white shadow-sm'
                      : isLight ? 'text-slate-600 hover:bg-white' : 'text-slate-300 hover:bg-white/5'}`}
                  >
                    <Mic className="h-4 w-4" />
                    {globalLang === 'en' ? 'Dialogue' : 'Hội thoại'}
                  </button>
                </div>
                <div className="grid grid-cols-1 gap-2.5">
                  {getFilteredStories()
                    .filter((story) => (story.storyType || 'narrative') === stStoryMode)
                    .map((story) => (
                    <button
                      key={story.id}
                      onClick={() => startStStory(story)}
                      className={`p-3.5 rounded-2xl border text-left flex items-start justify-between gap-3 hover:-translate-y-0.5 transition cursor-pointer ${isLight ? 'bg-white border-slate-200 hover:bg-slate-50 shadow-sm' : 'bg-slate-900/60 border-white/[0.06] hover:bg-slate-900/90'
                        }`}
                    >
                      <div className="space-y-1">
                        <h4 className="text-xs sm:text-sm font-black text-violet-600 dark:text-violet-400">
                          📖 {globalLang === 'en' ? story.titleEn : story.titleVi}
                        </h4>
                        <p className="text-[10px] sm:text-[11px] text-slate-500 dark:text-slate-400 italic line-clamp-1">
                          {story.textEn}
                        </p>
                      </div>
                      <ArrowRight className="w-4 h-4 text-violet-500 shrink-0 self-center" />
                    </button>
                  ))}
                </div>
              </div>
            ) : stGameStatus === 'narrating' ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center space-y-4 sm:space-y-5">
                <div className="relative p-2 rounded-full border-4 border-violet-500 overflow-hidden bg-slate-800 animate-pulse">
                  <SunnyMascot outfitId={state.selectedOutfitId || 'normal'} state="speaking" sizeClassName="w-28 h-28 sm:w-36 sm:h-36" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-xs sm:text-sm font-bold uppercase text-violet-600 dark:text-violet-400">
                    {globalLang === 'en' ? 'Listening to the story...' : 'Đang lắng nghe câu chuyện...'}
                  </h3>
                  <p className="text-[11px] sm:text-xs text-slate-700 dark:text-[var(--app-text-muted)] italic max-w-sm px-4">
                    "{stStory.textEn}"
                  </p>
                </div>
                <button
                  onClick={skipStNarration}
                  className="px-5 py-2 sm:px-6 sm:py-2.5 bg-violet-600 hover:bg-violet-500 text-white rounded-2xl font-black text-xs uppercase border-b-4 border-violet-800 transition cursor-pointer"
                >
                  {globalLang === 'en' ? 'Skip & Read Blanks' : 'Bỏ Qua & Bắt Đầu Đọc'}
                </button>
              </div>
            ) : stGameStatus === 'playing' ? (
              <>
                <div className={`flex-1 p-4 sm:p-5 rounded-3xl border leading-loose text-xs sm:text-sm md:text-base font-medium tracking-wide custom-scrollbar overflow-y-auto ${isLight ? 'bg-white border-slate-200' : 'bg-slate-900/40 border-white/[0.04]'
                  }`}>
                  <h3 className="text-[10px] sm:text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">
                    {globalLang === 'en' ? 'Story Text:' : 'Nội dung câu chuyện:'}
                  </h3>
                  {stStory.storyType === 'dialogue' && stStory.dialogue?.length ? (
                    <div className="space-y-3">
                      {stStory.dialogue.map((line, lineIndex) => {
                        const isLeft = lineIndex % 2 === 0;
                        return (
                          <div key={`${line.speaker}_${lineIndex}`} className={`flex items-end gap-2 ${isLeft ? 'justify-start' : 'flex-row-reverse'}`}>
                            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 text-xl shadow-sm ${isLeft ? 'border-sky-300 bg-sky-100' : 'border-amber-300 bg-amber-100'}`}>
                              {line.avatar}
                            </div>
                            <div className={`max-w-[82%] rounded-2xl border px-3 py-2.5 ${isLeft
                              ? isLight ? 'rounded-bl-sm border-sky-200 bg-sky-50' : 'rounded-bl-sm border-sky-500/30 bg-sky-950/45'
                              : isLight ? 'rounded-br-sm border-amber-200 bg-amber-50' : 'rounded-br-sm border-amber-500/30 bg-amber-950/35'}`}
                            >
                              <p className={`mb-1 text-[10px] font-black uppercase ${isLeft ? 'text-sky-600' : 'text-amber-600 dark:text-amber-400'}`}>{line.speaker}</p>
                              {renderStTemplate(line.template, `dialogue_${lineIndex}`)}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                  <>
                  {/* Flex Wrapping elements optimized for mobile screens */}
                  <div className={`flex flex-wrap gap-x-1.5 gap-y-2 sm:gap-x-2 sm:gap-y-3 items-center ${isLight ? 'text-slate-800' : 'text-slate-100'
                    }`}>
                    {stStory.template.split(' ').map((word, wIdx) => {
                      const match = word.match(/\{blank_(\d+)\}/);
                      if (match) {
                        const bIdx = parseInt(match[1]);
                        const blankObj = stStory.blanks.find((b) => b.index === bIdx);
                        const isCorrect = !!stAnswers[bIdx];
                        const isSelected = stSelectedBlank === bIdx;

                        return (
                          <button
                            key={`blank_${wIdx}`}
                            onClick={() => {
                              playAppSound(300, 'sine', 0.05);
                              if (!isCorrect) {
                                setStSelectedBlank(bIdx);
                                speakText(`Say ${blankObj?.word}`);
                                setStFeedback(
                                  globalLang === 'en'
                                    ? `Pronounce: "${blankObj?.word}" (${blankObj?.ipa} - ${blankObj?.vietnameseHint})`
                                    : `Hãy đọc từ: "${blankObj?.word}" (${blankObj?.ipa} - nghĩa là ${blankObj?.vietnameseHint})`
                                );
                              }
                            }}
                            className={`px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-xl border font-bold text-[10px] sm:text-xs uppercase transition duration-150 select-none cursor-pointer ${isCorrect
                                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400 pointer-events-none'
                                : isSelected
                                  ? 'bg-violet-500/20 border-violet-500/80 text-violet-700 dark:text-violet-400 ring-2 ring-violet-500/30 animate-pulse'
                                  : 'bg-slate-700/10 hover:bg-slate-700/30 border-dashed border-2 border-slate-400 dark:border-slate-500 text-slate-600 dark:text-slate-400'
                              }`}
                          >
                            {isCorrect ? blankObj?.word : `[ ${blankObj?.vietnameseHint} ]`}
                          </button>
                        );
                      }
                      return (
                        <span key={`word_${wIdx}`} className={isLight ? 'text-slate-800' : 'text-slate-100'}>
                          {word}
                        </span>
                      );
                    })}
                  </div>
                  </>
                  )}
                </div>

                {stFeedback && (
                  <div className="p-2.5 rounded-2xl bg-violet-500/10 border border-violet-500/20 text-center text-xs font-bold text-violet-700 dark:text-violet-400">
                    {stFeedback}
                  </div>
                )}

                <div className="flex flex-col items-center gap-2">
                  {stSelectedBlank !== null ? (
                    <>
                      {stIsRecording && (
                        <div className="flex justify-center items-center gap-1.5 py-1">
                          <span className="w-1.5 h-3 bg-violet-500 rounded-full animate-bounce" />
                          <span className="w-1.5 h-4.5 bg-violet-500 rounded-full animate-bounce delay-75" />
                          <span className="w-1.5 h-3 bg-violet-500 rounded-full animate-bounce delay-150" />
                          <span className="text-[10px] sm:text-[11px] font-black uppercase tracking-wider text-violet-600 dark:text-violet-400">
                            {globalLang === 'en' ? 'Recording speech...' : 'Đang thu âm giọng nói của bé...'}
                          </span>
                        </div>
                      )}

                      <button
                        onClick={() => {
                          const blankObj = stStory.blanks.find((b) => b.index === stSelectedBlank);
                          if (blankObj) handleStMicToggle(stSelectedBlank, blankObj.word);
                        }}
                        className={`w-12 h-12 sm:w-14 sm:h-14 rounded-full flex items-center justify-center text-white border-b-4 shadow-lg transition cursor-pointer ${stIsRecording
                            ? 'bg-rose-500 hover:bg-rose-400 border-rose-700 animate-pulse'
                            : 'bg-violet-500 hover:bg-violet-400 border-violet-700'
                          }`}
                      >
                        {stIsRecording ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                      </button>
                    </>
                  ) : (
                    <span className="text-[11px] sm:text-xs text-slate-500 dark:text-[var(--app-text-muted)] py-2">
                      {globalLang === 'en' ? 'Select an empty blank above to speak' : 'Hãy chạm vào ô trống để thực hiện bài nói'}
                    </span>
                  )}
                </div>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center space-y-5 sm:space-y-6">
                <div className="relative p-2 rounded-full border-4 border-emerald-500 overflow-hidden bg-slate-800 animate-bounce">
                  <SunnyMascot outfitId={state.selectedOutfitId || 'normal'} state="idle" sizeClassName="w-28 h-28 sm:w-36 sm:h-36" />
                </div>
                <div className="space-y-2">
                  <h3 className="text-sm sm:text-base font-black uppercase text-emerald-600 dark:text-emerald-500">
                    {globalLang === 'en' ? 'Story Complete! 🎭' : 'Con đã hoàn thành câu chuyện! 🎭'}
                  </h3>
                  <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 max-w-sm text-xs italic text-emerald-600 dark:text-emerald-500 leading-relaxed mx-auto">
                    "{stStory.textEn}"
                  </div>
                  <p className="text-[11px] sm:text-xs text-slate-600 dark:text-[var(--app-text-muted)] mt-1.5">
                    {globalLang === 'en'
                      ? 'Congratulations on reciting the story details. Earned +15 XP!'
                      : 'Chúc mừng bé đã luyện đọc trôi chảy câu chuyện ngắn. Nhận ngay +15 XP!'}
                  </p>
                </div>
                <button
                  onClick={() => setStGameStatus('idle')}
                  className="px-5 py-2.5 sm:px-6 sm:py-3 bg-[#58cc02] border-b-4 border-[#47a302] hover:bg-[#4eb302] text-white rounded-2xl font-black text-xs uppercase transition cursor-pointer flex items-center justify-center gap-1.5 mx-auto"
                >
                  <Star className="w-4 h-4" />
                  <span>{globalLang === 'en' ? 'Choose Another Story' : 'Chọn Câu Chuyện Khác'}</span>
                </button>
              </div>
            )}
          </motion.div>
        )}
        {activeGame === 'four_pics' && (
          <motion.div
            key="four_pics"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            className="flex min-h-0 flex-1 flex-col"
          >
            <QuizletGames
              words={flashcards}
              onBack={() => {
                setActiveGame('menu');
                setGameSelectPhase('selecting');
              }}
              isLight={isLight}
            />
          </motion.div>
        )}

      </AnimatePresence>

    </div>
  );
}
