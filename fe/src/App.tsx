/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useBreakpoint } from './lib/ui/useBreakpoint';
import { useActiveChild } from './context/ActiveChildContext';
import { formatApiError } from './lib/apiError';
import { shuffleArray } from './lib/shuffle';

import { AppState, Lesson, Quest, Question } from './types';
import {
  INITIAL_LEADERBOARD,
  INITIAL_LESSONS,
  INITIAL_OUTFITS,
  INITIAL_QUESTS,
  playAppSound,
  playCoinSound,
  playCorrectSound,
} from './data';

import Sidebar from './components/Sidebar';
import PathMap from './components/PathMap';
import LessonModal from './components/LessonModal';
import AlphabetTab from './components/AlphabetTab';
import ProfileTab from './components/ProfileTab';
import ChildLoginTab from './components/ChildLoginTab';
import ResetPasswordModal from './components/ResetPasswordModal';
import HistoryTab from './components/HistoryTab';
import AiTalkTab from './components/AiTalkTab';
import SettingsTab from './components/SettingsTab';
import AuthModal from './components/AuthModal';
import ParentGateModal from './components/ParentGateModal';
import SunnyMascot from './components/SunnyMascot';
import GameZoneTab from './components/GameZoneTab';
import RolePlayHub from './components/RolePlayHub';
import { resolveInitialTheme } from './lib/ui/presentation';

type AuthenticatedUser = {
  id: string;
  name: string;
  email: string;
  username?: string | null;
  authProvider?: string;
};

type ChildProfile = {
  id: string;
  parentId: string;
  name: string;
  age: number;
  level: string;
  status: string;
  sessionsCompleted: number;
  latestScore: number;
  topicsCompleted: number;
  streakDays: number;
  weeklyGoal: number;
  weeklyCompleted: number;
  totalMinutes: number;
  badgesEarned: number;
  attendanceRate: number;
  lastSessionAt: string;
  learningGoal: string;
  nextFocus: string;
  avatarUrl?: string | null;
  experiencePoints?: number;
  mouthCountTotal?: number;
  lastSessionMouthCount?: number;
  lastSessionEarnedXp?: number;
  activityDates?: string[];
};

type ChildMission = {
  id: string;
  title: string;
  detail: string;
  progress: number;
  total: number;
  reward: string;
  status: 'done' | 'active' | 'locked';
};

type ChildSessionHistoryItem = {
  id: string;
  childId: string | null;
  status: string;
  startedAt: string;
  endedAt: string | null;
  turnCount: number;
  overallScore: string | null;
  summary: string | null;
  conversationTranscript?: Array<{
    role: 'user' | 'assistant';
    content: string;
  }> | null;
};

type TopicCard = {
  id: string;
  topicId: string;
  name: string;
  vietnameseName: string;
  slug: string;
  description: string;
  tone: string;
  lessonCount: number;
  completedLessons: number;
  totalLessons: number;
  progress: number;
};

type TopicDetail = TopicCard & {
  vocabularyItems: Array<{
    id: string;
    sourceId: string;
    word: string;
    ipa?: string;
    vietnamese?: string;
    example?: string;
    questions: Array<{
      id: string;
      order: number;
      questionEn: string;
      questionVi: string;
    }>;
  }>;
};

type VocabularyItem = TopicDetail['vocabularyItems'][number];

const ACTIVE_CHILD_STORAGE_KEY = 'active_child_id';
const LESSON_TOPIC_MAP: Record<string, { topicId: string; lessonKey: string }> = {
  lesson1: { topicId: 'family', lessonKey: 'family-lesson-1' },
  lesson3: { topicId: 'animals', lessonKey: 'animals-lesson-1' },
  lesson4: { topicId: 'colors', lessonKey: 'colors-lesson-1' },
  lesson5: { topicId: 'food', lessonKey: 'food-lesson-1' },
  lesson6: { topicId: 'family', lessonKey: 'family-lesson-2' },
  lesson2: { topicId: 'alphabet', lessonKey: 'alphabet-lesson-1' },
  lesson_alphabet2: { topicId: 'alphabet', lessonKey: 'alphabet-lesson-2' },
  lesson_alphabet3: { topicId: 'alphabet', lessonKey: 'alphabet-lesson-3' },
  // Thêm 2 state này vào App component của bạn

};

const normalizeForMatching = (value: string) =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const uniqNonEmpty = (items: Array<string | undefined | null>) =>
  Array.from(new Set(items.map((item) => (item || '').trim()).filter(Boolean)));

const pickDistractors = (
  pool: VocabularyItem[],
  currentItemId: string,
  selector: (item: VocabularyItem) => string | undefined,
  limit: number = 3
) =>
  uniqNonEmpty(
    shuffleArray(pool.filter((item) => item.id !== currentItemId))
      .map(selector)
      .slice(0, limit)
  );

const inferQuestionKind = (question?: { questionEn?: string; questionVi?: string }) => {
  const combined = normalizeForMatching(`${question?.questionEn || ''} ${question?.questionVi || ''}`);

  if (!combined) {
    return 'unknown';
  }

  if (
    combined.includes('say') ||
    combined.includes('speak') ||
    combined.includes('read aloud') ||
    combined.includes('pronounce') ||
    combined.includes('noi to') ||
    combined.includes('phat am') ||
    combined.includes('doc to')
  ) {
    return 'speak';
  }

  if (
    combined.includes('meaning') ||
    combined.includes('mean') ||
    combined.includes('translate') ||
    combined.includes('translation') ||
    combined.includes('nghia') ||
    combined.includes('dich')
  ) {
    return 'meaning';
  }

  if (
    combined.includes('which word') ||
    combined.includes('what word') ||
    combined.includes('choose the word') ||
    combined.includes('word matches') ||
    combined.includes('tu nao') ||
    combined.includes('chon tu')
  ) {
    return 'word';
  }

  return 'unknown';
};

const parseReward = (reward: string) => {
  const parsed = Number.parseInt(reward.replace(/[^\d]/g, ''), 10);
  return Number.isFinite(parsed) ? parsed : 0;
};

const mapMissionToQuest = (mission: ChildMission): Quest => ({
  id: mission.id,
  title: mission.title,
  target: mission.total,
  current: mission.progress,
  rewardGems: parseReward(mission.reward),
  rewardXp: parseReward(mission.reward),
  completed: mission.status === 'done',
});

const deriveXpFromChild = (child: ChildProfile) =>
  typeof child.experiencePoints === 'number'
    ? child.experiencePoints
    : child.sessionsCompleted * 10 + child.topicsCompleted * 20 + child.streakDays * 5;

const DAILY_PROGRESS_STORAGE_PREFIX = 'speakjoy_daily_progress';

type DailyProgressSnapshot = {
  totalXp: number;
  streak: number;
  lastActiveDate: string | null;
};

const getTodayStamp = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Saigon',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

const getProgressStorageKey = (childId: string) => `${DAILY_PROGRESS_STORAGE_PREFIX}:${childId}`;

const getStampFromIso = (value?: string | null) => {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Saigon',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
};

const isNextCalendarDay = (previousStamp: string, nextStamp: string) => {
  const previous = new Date(`${previousStamp}T00:00:00`);
  const next = new Date(`${nextStamp}T00:00:00`);
  const dayDiff = Math.round((next.getTime() - previous.getTime()) / 86_400_000);
  return dayDiff === 1;
};

// ── KidSwitcherBar ────────────────────────────────────────────────────────────
// Mini child-selector shown in the study toolbar. Mirrors the Sidebar Kid Status
// widget but lives inline so the user can switch kids without leaving the tab.
function KidSwitcherBar({
  children,
  currentChild,
  globalTheme,
  globalLang,
  onSelectChild,
}: {
  children: ChildProfile[];
  currentChild: ChildProfile | null;
  globalTheme: 'dark' | 'light';
  globalLang: 'en' | 'vi';
  onSelectChild: (child: ChildProfile) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const isLight = globalTheme === 'light';
  const others = children.filter((c) => c.id !== currentChild?.id);

  return (
    <div className="relative flex-shrink-0">
      <button
        type="button"
        onClick={() => children.length > 1 && setOpen((v) => !v)}
        className={`flex items-center gap-3 rounded-[14px] border px-3.5 py-2 text-xs font-bold transition active:scale-95 ${isLight
            ? 'border-gray-200 bg-slate-50 hover:bg-slate-100 text-slate-700'
            : 'border-[#37464f] bg-[#131f24] hover:bg-[#1a2c38] text-[var(--app-text)]'
          }`}
        title={globalLang === 'en' ? 'Switch child' : 'Chuyển bé'}
      >
        {/* Avatar / icon */}
        <div
          className={`flex h-7 w-7 flex-shrink-0 items-center justify-center overflow-hidden rounded-full border-2 text-base ${currentChild ? 'border-[#1cb0f6]' : 'border-[var(--app-border)]'
            }`}
        >
          {currentChild?.avatarUrl ? (
            <img src={currentChild.avatarUrl} alt={currentChild.name} className="h-full w-full object-cover" />
          ) : (
            <span>{currentChild ? '🧒' : '👤'}</span>
          )}
        </div>

        {/* Labels */}
        <div className="flex flex-col items-start leading-tight">
          <span className="text-[9px] uppercase tracking-wider text-[var(--app-text-muted)]">
            {globalLang === 'en' ? 'Kid' : 'Bé'}
          </span>
          <span className={`font-extrabold ${currentChild ? 'text-[#1cb0f6]' : 'text-[var(--app-text-muted)]'}`}>
            {currentChild ? currentChild.name : globalLang === 'en' ? 'No child' : 'Chưa chọn'}
          </span>
        </div>

        {/* Status dot */}
        {currentChild && (
          <span className="ml-1 flex h-2 w-2 flex-shrink-0 rounded-full bg-[#58cc02] shadow-[0_0_6px_#58cc02]" />
        )}

        {/* Chevron */}
        {children.length > 1 && (
          <svg
            className={`ml-0.5 h-3.5 w-3.5 flex-shrink-0 text-[var(--app-text-muted)] transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
            viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
          >
            <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>

      {/* Dropdown */}
      {open && others.length > 0 && (
        <div
          className={`absolute right-0 top-full z-50 mt-1.5 min-w-[160px] overflow-hidden rounded-[14px] border shadow-xl ${isLight
              ? 'border-gray-200 bg-white'
              : 'border-[#37464f] bg-[#131f24]'
            }`}
        >
          <div className="px-3 pt-2.5 pb-1 text-[9px] font-bold uppercase tracking-wider text-[var(--app-text-muted)]">
            {globalLang === 'en' ? 'Switch to' : 'Chuyển sang'}
          </div>
          {others.map((child) => (
            <button
              key={child.id}
              type="button"
              onClick={() => {
                onSelectChild(child);
                setOpen(false);
              }}
              className={`flex w-full items-center gap-2.5 px-3 py-2.5 text-xs font-bold transition-colors ${isLight
                  ? 'text-[var(--app-text)] hover:bg-slate-50'
                  : 'text-[var(--app-text)] hover:bg-[#1a2c38]'
                }`}
            >
              <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center overflow-hidden rounded-full border border-[var(--app-border)] text-sm">
                {child.avatarUrl ? (
                  <img src={child.avatarUrl} alt={child.name} className="h-full w-full object-cover" />
                ) : (
                  <span>🧒</span>
                )}
              </div>
              <span className="truncate">{child.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [state, setState] = useState<AppState>({
    currentTab: 'hoc',
    viewMode: 'app',
    gems: 100,
    streak: 0,
    hearts: 5,
    xp: 0,
    selectedOutfitId: 'original',
    outfits: INITIAL_OUTFITS,
    quests: INITIAL_QUESTS,
    lessons: INITIAL_LESSONS,
    leaderboard: INITIAL_LEADERBOARD,
    activeLessonId: null,
  });

  const [authModal, setAuthModal] = useState<'signup' | 'login' | null>(null);
  const [authErrorMessage, setAuthErrorMessage] = useState<string | null>(null);
  const [resetToken, setResetToken] = useState<string | null>(() => new URLSearchParams(window.location.search).get('resetToken'));
  const [currentUser, setCurrentUser] = useState<AuthenticatedUser | null>(null);
  const [hasResolvedAuth, setHasResolvedAuth] = useState(false);
  const [childMode, setChildMode] = useState<{ id: string; name: string; username: string } | null>(null);
  const [showChildExit, setShowChildExit] = useState(false);
  const [childExitPassword, setChildExitPassword] = useState('');
  const [childExitError, setChildExitError] = useState<string | null>(null);
  const [isExitingChildMode, setIsExitingChildMode] = useState(false);
  const [showParentLogout, setShowParentLogout] = useState(false);
  const [isParentLoggingOut, setIsParentLoggingOut] = useState(false);
  const [children, setChildren] = useState<ChildProfile[]>([]);
  const [settingsRefreshNonce, setSettingsRefreshNonce] = useState(0);
  const [currentChild, setCurrentChild] = useState<ChildProfile | null>(null);
  const [topics, setTopics] = useState<TopicCard[]>([]);
  const [activeDynamicLesson, setActiveDynamicLesson] = useState<Lesson | null>(null);
  const [activeTopicContext, setActiveTopicContext] = useState<{ topicId: string; lessonKey: string } | null>(null);
  const [isChildrenLoading, setIsChildrenLoading] = useState(false);
  const [isTopicsLoading, setIsTopicsLoading] = useState(false);
  const [childProfileError, setChildProfileError] = useState<string | null>(null);
  const [showCelebration, setShowCelebration] = useState<{ show: boolean; msg: string; gems: number } | null>(null);

  // Thêm 2 state này vào App component của bạn
  const [parentGateOpen, setParentGateOpen] = useState(false);
  const [isParentVerified, setIsParentVerified] = useState(false);

  const [hasAiConfigured, setHasAiConfigured] = useState(false);

  const [unmasteredCount, setUnmasteredCount] = useState(0);
  const [isAiSessionActive, setIsAiSessionActive] = useState(false);
  const [isHistorySessionActive, setIsHistorySessionActive] = useState(false);
  const [isGameActive, setIsGameActive] = useState(false);
  const [isParentOverlayOpen, setIsParentOverlayOpen] = useState(false);

  const [globalTheme, setGlobalTheme] = useState<'dark' | 'light'>(() =>
    resolveInitialTheme(localStorage.getItem('app_theme'))
  );

  const [globalLang, setGlobalLang] = useState<'en' | 'vi'>(() => {
    return (localStorage.getItem('app_lang') as 'en' | 'vi') || 'en';
  });

  const [studyTabMode, setStudyTabMode] = useState<'chat' | 'topic'>('chat');

  const { isMobile } = useBreakpoint();

  // ActiveChildContext: nguồn sự thật mới cho bé đang chọn (Req 7.5, 7.7).
  // Dùng hook ở đây để lấy activeChildId và setActiveChild từ context,
  // giúp đồng bộ giữa App.tsx (trạng thái cũ) và context (nguồn mới).
  const { activeChildId: ctxActiveChildId, setActiveChild: ctxSetActiveChild, seedChildren: ctxSeedChildren } = useActiveChild();

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', globalTheme);
    document.body.setAttribute('data-theme', globalTheme);
  }, [globalTheme]);

  useEffect(() => {
    const mainEl = document.querySelector('main');
    if (mainEl) {
      mainEl.scrollTop = 0;
    }
  }, [state.currentTab]);

  const requireAuth = (message: string) => {
    setAuthErrorMessage(message);
    setAuthModal('login');
  };

  const handleExpiredParentSession = (message?: string) => {
    setCurrentUser(null);
    setChildMode(null);
    setChildren([]);
    setCurrentChild(null);
    setTopics([]);
    setChildProfileError(null);
    setHasAiConfigured(false);
    setShowChildExit(false);
    setChildExitPassword('');
    setChildExitError(null);
    localStorage.removeItem('parent_account_name');
    localStorage.removeItem('parent_account_email');
    localStorage.removeItem('parent_account_pass');
    localStorage.removeItem(ACTIVE_CHILD_STORAGE_KEY);
    saveState((previous) => ({
      ...previous,
      currentTab: 'hoc',
    }));
    requireAuth(
      message ||
      (globalLang === 'en'
        ? 'Your parent session has expired. Please sign in again.'
        : 'Phiên phụ huynh đã hết hạn. Vui lòng đăng nhập lại.')
    );
  };

  const readDailyProgress = (childId: string): DailyProgressSnapshot | null => {
    try {
      const raw = localStorage.getItem(getProgressStorageKey(childId));
      if (!raw) {
        return null;
      }

      const parsed = JSON.parse(raw) as DailyProgressSnapshot;
      return {
        totalXp: Number(parsed.totalXp || 0),
        streak: Number(parsed.streak || 0),
        lastActiveDate: parsed.lastActiveDate || null,
      };
    } catch {
      return null;
    }
  };

  const writeDailyProgress = (childId: string, snapshot: DailyProgressSnapshot) => {
    try {
      localStorage.setItem(getProgressStorageKey(childId), JSON.stringify(snapshot));
    } catch {
      // noop
    }
  };

  const syncDailyProgressFromChild = (child: ChildProfile) => {
    const baseXp = deriveXpFromChild(child);
    const baseStreak = child.streakDays;
    const childLastActiveDate = getStampFromIso(child.lastSessionAt);
    const merged: DailyProgressSnapshot = {
      totalXp: baseXp,
      streak: baseStreak,
      lastActiveDate: childLastActiveDate,
    };

    writeDailyProgress(child.id, merged);
    return merged;
  };

  const getDailyRewardState = (xpDelta: number, gemDelta: number = 0) => {
    const safeXpDelta = Math.max(0, xpDelta);
    const safeGemDelta = Math.max(0, gemDelta);

    if (!currentChild) {
      return {
        xp: state.xp + safeXpDelta,
        streak: state.streak,
        gems: state.gems + safeGemDelta,
        leaderboard: state.leaderboard.map((entry) =>
          entry.isCurrentPlayer ? { ...entry, score: state.xp + safeXpDelta } : entry
        ),
      };
    }

    const today = getTodayStamp();
    const storedSnapshot = readDailyProgress(currentChild.id);
    const backendXp = deriveXpFromChild(currentChild);
    const backendStreak = currentChild.streakDays;
    const lastActiveDate = storedSnapshot?.lastActiveDate || getStampFromIso(currentChild.lastSessionAt);

    const nextStreak =
      lastActiveDate === today
        ? backendStreak
        : lastActiveDate && isNextCalendarDay(lastActiveDate, today)
          ? Math.max(1, backendStreak + 1)
          : 1;

    const nextSnapshot: DailyProgressSnapshot = {
      totalXp: backendXp + safeXpDelta,
      streak: nextStreak,
      lastActiveDate: today,
    };

    writeDailyProgress(currentChild.id, nextSnapshot);

    return {
      gems: state.gems + safeGemDelta,
      xp: nextSnapshot.totalXp,
      streak: nextSnapshot.streak,
      leaderboard: state.leaderboard.map((entry) =>
        entry.isCurrentPlayer ? { ...entry, score: nextSnapshot.totalXp } : entry
      ),
    };
  };

  const saveState = (next: AppState | ((previous: AppState) => AppState)) => {
    setState((previous) => {
      const updated = typeof next === 'function' ? next(previous) : next;
      try {
        localStorage.setItem(
          'duo_kids_state',
          JSON.stringify({
            currentTab: updated.currentTab,
            gems: updated.gems,
            streak: updated.streak,
            hearts: updated.hearts,
            xp: updated.xp,
            selectedOutfitId: updated.selectedOutfitId,
            outfits: updated.outfits,
            quests: updated.quests,
            lessons: updated.lessons,
            leaderboard: updated.leaderboard,
          })
        );
      } catch (error) {
        console.warn('LocalStorage save blocked or disabled:', error);
      }
      return updated;
    });
  };

  const buildDynamicLessonFromTopic = (topic: TopicDetail, lessonNumber: number): Lesson => {
    const vocabularyItems = topic.vocabularyItems || [];
    const currentIndex = Math.max(0, Math.min(vocabularyItems.length - 1, lessonNumber - 1));
    const currentItem = vocabularyItems[currentIndex];

    if (!currentItem) {
      throw new Error('Chủ đề này chưa có dữ liệu bài học.');
    }

    const englishOptions = shuffleArray(
      uniqNonEmpty([
        currentItem.word,
        ...pickDistractors(vocabularyItems, currentItem.id, (item) => item.word),
      ])
    );

    const vietnameseOptions = shuffleArray(
      uniqNonEmpty([
        currentItem.vietnamese || currentItem.word,
        ...pickDistractors(vocabularyItems, currentItem.id, (item) => item.vietnamese || item.word),
      ])
    );

    const fallbackQuestions: Question[] = [
      {
        id: `${currentItem.id}-word-choice`,
        type: 'multiple',
        prompt: `Which English word means "${currentItem.vietnamese || currentItem.word}"?`,
        vietnamesePrompt: `Chọn từ tiếng Anh đúng với nghĩa "${currentItem.vietnamese || currentItem.word}".`,
        options: englishOptions,
        correctAnswer: currentItem.word,
        vietnameseAnswerExplanation: `"${currentItem.word}" có nghĩa là "${currentItem.vietnamese || currentItem.word}".`,
      },
      {
        id: `${currentItem.id}-meaning-choice`,
        type: 'multiple',
        prompt: `What does "${currentItem.word}" mean in Vietnamese?`,
        vietnamesePrompt: `Từ "${currentItem.word}" nghĩa là gì trong tiếng Việt?`,
        options: vietnameseOptions,
        correctAnswer: currentItem.vietnamese || currentItem.word,
        vietnameseAnswerExplanation: `Đáp án đúng là "${currentItem.vietnamese || currentItem.word}".`,
      },
      {
        id: `${currentItem.id}-speak`,
        type: 'speak',
        prompt: currentItem.example || currentItem.word,
        vietnamesePrompt: currentItem.example
          ? `Đọc to câu mẫu để luyện nói với từ "${currentItem.word}".`
          : `Nói to từ "${currentItem.word}" để luyện phát âm.`,
        correctAnswer: currentItem.example || currentItem.word,
        spokenPhonetics: currentItem.ipa,
        vietnameseAnswerExplanation: currentItem.example
          ? `Bé hãy đọc trọn câu "${currentItem.example}" thật rõ ràng.`
          : `Bé hãy đọc lại "${currentItem.word}" thật rõ ràng.`,
      },
    ];

    const generatedQuestions: Question[] = (currentItem.questions || [])
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((itemQuestion, index) => {
        const kind = inferQuestionKind(itemQuestion);

        if (kind === 'speak') {
          return {
            id: `${currentItem.id}-speak-${index + 1}`,
            type: 'speak',
            prompt: currentItem.example || currentItem.word,
            vietnamesePrompt:
              itemQuestion.questionVi ||
              (currentItem.example
                ? `Đọc to câu "${currentItem.example}".`
                : `Phát âm to từ "${currentItem.word}".`),
            correctAnswer: currentItem.example || currentItem.word,
            spokenPhonetics: currentItem.ipa,
            vietnameseAnswerExplanation: currentItem.example
              ? `Bé đọc câu mẫu "${currentItem.example}" thật tự nhiên nhé.`
              : `Bé hãy phát âm rõ từ "${currentItem.word}".`,
          };
        }

        if (kind === 'meaning') {
          return {
            id: `${currentItem.id}-meaning-${index + 1}`,
            type: 'multiple',
            prompt: itemQuestion.questionEn || `What does "${currentItem.word}" mean?`,
            vietnamesePrompt:
              itemQuestion.questionVi || `Từ "${currentItem.word}" nghĩa là gì trong tiếng Việt?`,
            options: vietnameseOptions,
            correctAnswer: currentItem.vietnamese || currentItem.word,
            vietnameseAnswerExplanation: `"${currentItem.word}" có nghĩa là "${currentItem.vietnamese || currentItem.word}".`,
          };
        }

        return {
          id: `${currentItem.id}-word-${index + 1}`,
          type: 'multiple',
          prompt: itemQuestion.questionEn || `Which word matches "${currentItem.vietnamese || currentItem.word}"?`,
          vietnamesePrompt:
            itemQuestion.questionVi || `Chọn từ tiếng Anh đúng với nghĩa "${currentItem.vietnamese || currentItem.word}".`,
          options: englishOptions,
          correctAnswer: currentItem.word,
          vietnameseAnswerExplanation: `Đáp án đúng là "${currentItem.word}".`,
        };
      });

    const questions = [...generatedQuestions, ...fallbackQuestions]
      .filter((question, index, list) => list.findIndex((item) => item.id === question.id) === index)
      .slice(0, 3);

    return {
      id: `topic:${topic.slug}:${lessonNumber}`,
      title: topic.name,
      vietnameseTitle: `${topic.vietnameseName} - Bài ${lessonNumber}`,
      points: 10,
      completed: false,
      locked: false,
      type: 'lesson',
      questions,
    };
  };

  useEffect(() => {
    try {
      const cached = localStorage.getItem('duo_kids_state');
      if (cached) {
        const parsed = JSON.parse(cached);
        setState((prev) => ({
          ...prev,
          ...parsed,
          outfits: parsed.outfits || INITIAL_OUTFITS,
          quests: parsed.quests || INITIAL_QUESTS,
          lessons: parsed.lessons || INITIAL_LESSONS,
          leaderboard: parsed.leaderboard || INITIAL_LEADERBOARD,
        }));
      }
    } catch (error) {
      console.warn('LocalStorage load blocked or empty:', error);
    }
  }, []);

  const handleToggleTheme = () => {
    const nextTheme = globalTheme === 'dark' ? 'light' : 'dark';
    setGlobalTheme(nextTheme);
    try {
      localStorage.setItem('app_theme', nextTheme);
    } catch (error) {
      // Req 3.7: if persisting the theme fails (e.g. storage disabled/full),
      // keep the currently displayed theme and keep the app running instead of crashing.
      console.warn('Unable to persist theme preference:', error);
    }
    window.dispatchEvent(new CustomEvent('theme-changed', { detail: nextTheme }));
  };

  const handleToggleLang = () => {
    const nextLang = globalLang === 'en' ? 'vi' : 'en';
    setGlobalLang(nextLang);
    localStorage.setItem('app_lang', nextLang);
    window.dispatchEvent(new CustomEvent('lang-changed', { detail: nextLang }));
  };

  const refreshTopics = async (user: AuthenticatedUser | null, childId?: string | null) => {
    if (!user || !childId) {
      setTopics([]);
      return;
    }

    setIsTopicsLoading(true);

    try {
      const response = await fetch(`/api/topics?childId=${encodeURIComponent(childId)}`, {
        credentials: 'include',
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.message || 'Không thể tải danh sách chủ đề.');
      }

      const payload = await response.json().catch(() => ({}));
      setTopics((payload?.data?.topics || []) as TopicCard[]);
    } catch (error) {
      console.warn('Unable to refresh topics:', error);
    } finally {
      setIsTopicsLoading(false);
    }
  };

  const fetchChildMissions = async (childId: string) => {
    const response = await fetch(`/api/children/${childId}/missions`, {
      credentials: 'include',
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload?.message || 'Không thể tải nhiệm vụ của bé.');
    }

    const payload = await response.json().catch(() => ({}));
    return (payload?.missions || payload?.data?.missions || []) as ChildMission[];
  };

  const fetchChildSessions = async (childId: string) => {
    const response = await fetch(`/api/children/${childId}/sessions?limit=5`, {
      credentials: 'include',
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload?.message || 'Không thể tải lịch sử phiên học của bé.');
    }

    const payload = await response.json().catch(() => ({}));
    return (payload?.sessions || payload?.data?.sessions || []) as ChildSessionHistoryItem[];
  };

  const applyChildDataToState = (child: ChildProfile, missions: ChildMission[]) => {
    localStorage.setItem(ACTIVE_CHILD_STORAGE_KEY, child.id);
    setCurrentChild(child);

    const dailyProgress = syncDailyProgressFromChild(child);
    const nextXp = dailyProgress.totalXp;
    const nextQuests = missions.length > 0 ? missions.map(mapMissionToQuest) : INITIAL_QUESTS;

    saveState((previous) => ({
      ...previous,
      streak: dailyProgress.streak,
      xp: nextXp,
      quests: nextQuests,
      leaderboard: previous.leaderboard.map((entry) =>
        entry.isCurrentPlayer ? { ...entry, name: child.name, score: nextXp } : entry
      ),
    }));
  };

  const fetchLeaderboard = async (childId?: string) => {
    try {
      const response = await fetch('/api/children/leaderboard?limit=50', {
        credentials: 'include',
      });
      if (response.ok) {
        const payload = await response.json();
        const rawBoard = payload?.data?.leaderboard || payload?.leaderboard || [];

        const leaderboardData = rawBoard.map((entry: any) => ({
          ...entry,
          isCurrentPlayer: childId ? entry.id === childId : false,
        }));

        saveState((prev) => ({
          ...prev,
          leaderboard: leaderboardData.length > 0 ? leaderboardData : INITIAL_LEADERBOARD,
        }));
      }
    } catch (e) {
      console.warn('Unable to fetch leaderboard:', e);
    }
  };

  const refreshChildren = async (user: AuthenticatedUser | null, preferredChildOverride?: string | null) => {
    if (!user) {
      setChildren([]);
      setCurrentChild(null);
      setTopics([]);
      setChildProfileError(null);
      localStorage.removeItem(ACTIVE_CHILD_STORAGE_KEY);
      return;
    }

    setIsChildrenLoading(true);
    setChildProfileError(null);

    try {
      const response = await fetch('/api/children', {
        credentials: 'include',
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.message || 'Không thể tải hồ sơ của bé.');
      }

      const payload = await response.json().catch(() => ({}));
      const nextChildren = (payload?.children || payload?.data?.children || []) as ChildProfile[];
      setChildren(nextChildren);

      if (nextChildren.length === 0) {
        setCurrentChild(null);
        setTopics([]);
        localStorage.removeItem(ACTIVE_CHILD_STORAGE_KEY);
        // Thông báo cho context biết danh sách trống
        ctxSeedChildren([], null);
        return;
      }

      const preferredChildId = preferredChildOverride || ctxActiveChildId || localStorage.getItem(ACTIVE_CHILD_STORAGE_KEY);
      const activeChild = nextChildren.find((child) => child.id === preferredChildId) || nextChildren[0];
      // Fetch missions và topics song song thay vì tuần tự
      const [missions] = await Promise.all([
        fetchChildMissions(activeChild.id),
        refreshTopics(user, activeChild.id),
        fetchLeaderboard(activeChild.id),
      ]);
      applyChildDataToState(activeChild, missions);
      // Push danh sách bé vào context — tránh context tự fetch lại /api/children
      ctxSeedChildren(nextChildren, activeChild.id);
    } catch (error) {
      console.warn('Unable to refresh children:', error);
      setChildProfileError(error instanceof Error ? error.message : 'Không thể đồng bộ dữ liệu của bé.');
    } finally {
      setIsChildrenLoading(false);
    }
  };

  const syncTopicCompletion = async (lessonId: string, score: number) => {
    if (!currentUser || !currentChild) {
      return null;
    }

    const topicMapping = activeTopicContext || LESSON_TOPIC_MAP[lessonId];
    if (!topicMapping) {
      return null;
    }

    const response = await fetch(`/api/topics/${topicMapping.topicId}/complete`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        childId: currentChild.id,
        lessonKey: topicMapping.lessonKey,
        mouthCount: 1,
        score,
      }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload?.message || 'Không thể đồng bộ tiến độ bài học.');
    }

    await refreshTopics(currentUser, currentChild.id);
    const result = payload?.data || {};
    return {
      earnedXp: Math.max(0, Number(result.earnedXp) || 0),
      alreadyCompleted: Boolean(result.alreadyCompleted),
    };
  };

  const handleLogout = async () => {
    if (childMode) {
      setChildExitError(null);
      setChildExitPassword('');
      setShowChildExit(true);
      return;
    }
    setShowParentLogout(true);
  };

  const confirmParentLogout = async () => {
    setIsParentLoggingOut(true);
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
      });
    } catch (error) {
      console.warn('Unable to logout cleanly:', error);
    }

    setCurrentUser(null);
    setChildMode(null);
    setChildren([]);
    setCurrentChild(null);
    setTopics([]);
    setChildProfileError(null);
    setHasAiConfigured(false);
    localStorage.removeItem('parent_account_name');
    localStorage.removeItem('parent_account_email');
    localStorage.removeItem('parent_account_pass');
    localStorage.removeItem(ACTIVE_CHILD_STORAGE_KEY);

    saveState({
      ...state,
      currentTab: 'hoc',
      streak: 0,
      xp: 0,
      quests: INITIAL_QUESTS,
      leaderboard: INITIAL_LEADERBOARD,
    });
    setShowParentLogout(false);
    setIsParentLoggingOut(false);
  };

  const applyAuthenticatedUser = (user: AuthenticatedUser) => {
    const displayName = user.name || user.email;

    setCurrentUser(user);
    localStorage.setItem('parent_account_name', displayName);
    localStorage.setItem('parent_account_email', user.email);

    saveState((previous) => ({
      ...previous,
      leaderboard: previous.leaderboard.map((entry) =>
        entry.isCurrentPlayer ? { ...entry, name: displayName } : entry
      ),
    }));
  };

  const refreshCurrentUser = async () => {
    try {
      const response = await fetch('/api/auth/me', {
        credentials: 'include',
      });

      if (!response.ok) {
        setHasResolvedAuth(true);
        if (response.status === 401 || response.status === 403) {
          setCurrentUser(null);
          setHasAiConfigured(false);
          await refreshChildren(null);
          await refreshTopics(null, null);
        }
        return;
      }

      const payload = await response.json().catch(() => ({}));
      const user = (payload?.user || payload?.data?.user) as AuthenticatedUser | undefined;

      if (user?.email) {
        applyAuthenticatedUser(user);
        // A stale /login or /signup URL must not cover an already authenticated app.
        setAuthModal(null);
        setAuthErrorMessage(null);

        let activeChildMode: { id: string; name: string; username: string } | null = null;
        try {
          const childModeResponse = await fetch('/api/child-auth/status', { credentials: 'include' });
          const childModePayload = await childModeResponse.json().catch(() => ({}));
          activeChildMode = childModeResponse.ok && childModePayload?.active ? childModePayload.child : null;
        } catch (error) {
          // Parent authentication is still valid if the optional child-mode check
          // has a transient failure. Continue restoring profiles below.
          console.warn('Unable to restore child mode:', error);
        }

        setChildMode(activeChildMode);
        await refreshChildren(user, activeChildMode?.id);
        if (activeChildMode) {
          setHasAiConfigured(true);
          saveState((previous) => ({ ...previous, currentTab: 'hoc' }));
        } else {
          await refreshAiConfigured();
        }
        // Resolve startup only after user, child and settings state agree. This
        // prevents the sign-in and create-child screens flashing during restore.
        setHasResolvedAuth(true);
      } else {
        setHasResolvedAuth(true);
        setCurrentUser(null);
        setHasAiConfigured(false);
        await refreshChildren(null);
        await refreshTopics(null, null);
      }
    } catch (error) {
      console.warn('Unable to refresh current user session:', error);
      setHasResolvedAuth(true);
    }
  };

  const syncParentUsageView = () => {
    setSettingsRefreshNonce((value) => value + 1);
  };

  const refreshAiConfigured = async () => {
    try {
      const response = await fetch('/api/parent-settings', {
        credentials: 'include',
      });
      if (!response.ok) {
        return;
      }
      const payload = await response.json().catch(() => ({}));
      const aiSettings = payload?.aiSettings || payload?.data?.aiSettings;
      const hasApiKey = Boolean(aiSettings?.hasApiKey);
      setHasAiConfigured(hasApiKey);
    } catch {
      // ignore; leave hasAiConfigured as-is
    }
  };

  useEffect(() => {
    void refreshCurrentUser();
  }, []);

  useEffect(() => {
    localStorage.removeItem('parent_account_pass');
  }, []);

  useEffect(() => {
    if (state.currentTab === 'nhiemvu') {
      saveState((previous) => ({ ...previous, currentTab: 'hosor' }));
    }
  }, [state]);

  useEffect(() => {
    if (typeof window === 'undefined' || !hasResolvedAuth) {
      return;
    }

    const url = new URL(window.location.href);
    const normalizedPath = url.pathname.toLowerCase();
    const oauthError = url.searchParams.get('error');

    if (oauthError) {
      setAuthErrorMessage(oauthError);
      setAuthModal('login');
      url.pathname = '/';
      url.searchParams.delete('error');
      window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
      return;
    }

    if (normalizedPath === '/login' || normalizedPath === '/signup' || normalizedPath === '/home') {
      if (!currentUser && normalizedPath === '/login') {
        setAuthModal('login');
      }

      if (!currentUser && normalizedPath === '/signup') {
        setAuthModal('signup');
      }

      window.history.replaceState({}, '', '/');
    }
  }, [currentUser, hasResolvedAuth]);

  useEffect(() => {
    if (hasResolvedAuth && !currentUser && state.currentTab !== 'hoc') {
      saveState((previous) => ({ ...previous, currentTab: 'hoc' }));
    }
  }, [currentUser, hasResolvedAuth, state.currentTab]);

  useEffect(() => {
    if (!hasResolvedAuth || !currentUser) return;
    const allowed = childMode ? ['hoc', 'chucai', 'nhapvai', 'lichsu', 'trochoi'] : ['childlogin', 'hosor', 'cauhinh'];
    if (!allowed.includes(state.currentTab)) {
      saveState((previous) => ({ ...previous, currentTab: childMode ? 'hoc' : 'childlogin' }));
    }
  }, [childMode, currentUser, hasResolvedAuth, state.currentTab]);

  const handleTabChange = (tab: string) => {
    playAppSound(400, 'sine', 0.05);
    if (!currentUser) {
      requireAuth('Please sign in with a parent account before using lessons, progress, or settings.');
      return;
    }

    if (childMode && !['hoc', 'chucai', 'nhapvai', 'lichsu', 'trochoi'].includes(tab)) return;
    if (!childMode && ['hoc', 'chucai', 'nhapvai', 'lichsu', 'trochoi'].includes(tab)) {
      saveState({ ...state, currentTab: 'childlogin' });
      return;
    }

    if (tab === 'cauhinh') {
      const isSetupCompleted = localStorage.getItem('parent_gate_setup_completed') === 'true';
      if (isSetupCompleted && !isParentVerified) {
        setParentGateOpen(true);
        return;
      }
    } else {
      setIsParentVerified(false);
    }
    saveState({ ...state, currentTab: tab });
  };

  const handleToggleViewMode = () => {
    playAppSound(500, 'triangle', 0.1);
    saveState({
      ...state,
      viewMode: state.viewMode === 'app' ? 'docs' : 'app'
    });
  };

  const applyActiveChildReward = (
    rewardState: { xp: number; streak: number },
    earnedXp: number,
  ) => {
    if (!currentChild) return rewardState.streak;
    const today = getTodayStamp();
    const mergeActivityDates = (dates?: string[]) =>
      Array.from(new Set([...(dates || []), today])).sort((left, right) => right.localeCompare(left));
    const calculateStreak = (dates: string[]) => {
      const ordered = Array.from(new Set(dates)).sort((left, right) => right.localeCompare(left));
      if (ordered.length === 0) return 0;
      const toDayNumber = (stamp: string) => {
        const [year, month, day] = stamp.split('-').map(Number);
        return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
      };
      if (toDayNumber(today) - toDayNumber(ordered[0]) > 1) return 0;
      let streak = 1;
      for (let index = 1; index < ordered.length; index += 1) {
        if (toDayNumber(ordered[index - 1]) - toDayNumber(ordered[index]) !== 1) break;
        streak += 1;
      }
      return streak;
    };
    const activeDates = mergeActivityDates(currentChild.activityDates);
    const activeStreak = calculateStreak(activeDates);

    setChildren((previous) => previous.map((child) =>
      child.id === currentChild.id
        ? (() => {
          const activityDates = mergeActivityDates(child.activityDates);
          return {
          ...child,
          experiencePoints: rewardState.xp,
          streakDays: activeStreak,
          lastSessionEarnedXp: earnedXp,
          activityDates,
          };
        })()
        : child
    ));
    setCurrentChild((previous) => previous?.id === currentChild.id
      ? (() => {
        const activityDates = mergeActivityDates(previous.activityDates);
        return {
        ...previous,
        experiencePoints: rewardState.xp,
        streakDays: activeStreak,
        lastSessionEarnedXp: earnedXp,
        activityDates,
        };
      })()
      : previous);
    return activeStreak;
  };

  const handleAiStatsUpdate = (patch: Partial<AppState>) => {
    const xpDelta = typeof patch.xp === 'number' ? Math.max(0, patch.xp - state.xp) : 0;
    const gemDelta = typeof patch.gems === 'number' ? Math.max(0, patch.gems - state.gems) : 0;

    if (xpDelta > 0 || gemDelta > 0) {
      const rewardState = getDailyRewardState(xpDelta, gemDelta);
      const activeStreak = applyActiveChildReward(rewardState, xpDelta);
      saveState((previous) => ({
        ...previous,
        ...patch,
        xp: rewardState.xp,
        streak: activeStreak,
        gems: rewardState.gems,
        leaderboard: rewardState.leaderboard,
      }));
      return;
    }

    saveState((previous) => ({ ...previous, ...patch }));
  };


  const handleStartLesson = (lessonId: string) => {
    if (!currentUser) {
      requireAuth('Please sign in before starting a lesson.');
      return;
    }

    if (lessonId.startsWith('topic:')) {
      const [, topicId, lessonNumberRaw] = lessonId.split(':');
      const lessonNumber = Number.parseInt(lessonNumberRaw || '1', 10);

      void (async () => {
        try {
          const response = await fetch(`/api/topics/${topicId}`, {
            credentials: 'include',
          });

          const payload = await response.json().catch(() => ({}));
          if (!response.ok) {
            throw new Error(payload?.message || 'Không thể tải chi tiết chủ đề.');
          }

          const topic = payload?.data?.topic as TopicDetail;
          const dynamicLesson = buildDynamicLessonFromTopic(topic, lessonNumber);
          setActiveDynamicLesson(dynamicLesson);
          setActiveTopicContext({
            topicId,
            lessonKey: `${topicId}-lesson-${lessonNumber}`,
          });
          saveState({ ...state, activeLessonId: lessonId });
        } catch (error) {
          console.warn('Unable to start backend topic lesson:', error);
        }
      })();
      return;
    }

    if (state.hearts <= 0) {
      playAppSound(100, 'sawtooth', 0.2);
      alert('Bé đã hết năng lượng. Hãy nghỉ một chút rồi tiếp tục nhé.');
      return;
    }

    saveState({ ...state, activeLessonId: lessonId });
  };

  const handleFinishLesson = async (xpEarned: number, gemsEarned: number, failed: boolean) => {
    if (failed) {
      saveState({
        ...state,
        activeLessonId: null,
        hearts: 5,
      });
      return;
    }

    const completedLessonId = state.activeLessonId;
    let awardedXp = xpEarned;
    let awardedGems = gemsEarned;
    let alreadyCompleted = false;

    if (completedLessonId && (activeTopicContext || LESSON_TOPIC_MAP[completedLessonId])) {
      try {
        const completion = await syncTopicCompletion(completedLessonId, 100);
        if (completion) {
          awardedXp = completion.earnedXp;
          alreadyCompleted = completion.alreadyCompleted;
          awardedGems = completion.alreadyCompleted ? 0 : gemsEarned;
        }
      } catch (error) {
        console.warn('Unable to sync topic completion:', error);
        alert(globalLang === 'en'
          ? 'Unable to save this lesson yet. Please check the connection and try again.'
          : 'Chưa thể lưu bài học. Vui lòng kiểm tra kết nối và thử lại.');
        return;
      }
    }

    const updatedLessons = state.lessons.map((lesson) =>
      lesson.id === state.activeLessonId ? { ...lesson, completed: true } : lesson
    );

    const activeIndex = state.lessons.findIndex((lesson) => lesson.id === state.activeLessonId);
    if (activeIndex !== -1 && activeIndex + 1 < updatedLessons.length) {
      updatedLessons[activeIndex + 1].locked = false;
    }

    const updatedQuests = state.quests.map((quest) => {
      let currentVal = quest.current;
      if (quest.id === 'xp_quest') {
        currentVal = Math.min(quest.target, quest.current + awardedXp);
      } else if (!alreadyCompleted && (quest.id === 'pronounce_quest' || quest.id === 'daily-speaking')) {
        currentVal = Math.min(quest.target, quest.current + 1);
      } else if (!alreadyCompleted && (quest.id === 'perfect_lesson' || quest.id === 'complete-lesson' || quest.id === 'keep-streak')) {
        currentVal = Math.min(quest.target, quest.current + 1);
      }
      return { ...quest, current: currentVal };
    });

    const rewardState = getDailyRewardState(awardedXp, awardedGems);
    const activeStreak = applyActiveChildReward(rewardState, awardedXp);
    saveState({
      ...state,
      lessons: updatedLessons,
      gems: rewardState.gems,
      xp: rewardState.xp,
      streak: activeStreak,
      quests: updatedQuests,
      leaderboard: rewardState.leaderboard,
      activeLessonId: null,
    });

    playCorrectSound();

    setActiveDynamicLesson(null);
    setActiveTopicContext(null);
    setShowCelebration({
      show: true,
      msg: alreadyCompleted
        ? (globalLang === 'en' ? 'Lesson reviewed successfully. XP was already awarded earlier.' : 'Bé đã ôn lại bài thành công. XP của bài này đã được nhận trước đó.')
        : `Bé vừa hoàn thành bài học và nhận thêm ${awardedXp} XP.`,
      gems: awardedGems,
    });

    if (currentUser) {
      void refreshChildren(currentUser, currentChild?.id).catch((error) => {
        console.warn('Unable to refresh child progress after lesson completion:', error);
      });
    }
  };

  const handleClaimReward = (questId: string, xpReward: number) => {
    if (!currentUser) {
      requireAuth('Please sign in before claiming quest rewards.');
      return;
    }

    const updatedQuests = state.quests.map((quest) =>
      quest.id === questId ? { ...quest, completed: true } : quest
    );

    const rewardState = getDailyRewardState(xpReward, 0);
    saveState({
      ...state,
      quests: updatedQuests,
      xp: rewardState.xp,
      streak: rewardState.streak,
      gems: rewardState.gems,
      leaderboard: rewardState.leaderboard,
    });

    setShowCelebration({
      show: true,
      msg: `Bé vừa nhận thêm ${xpReward} kinh nghiệm từ nhiệm vụ.`,
      gems: 0,
    });
  };

  const handleBuyOutfit = (outfitId: string) => {
    if (!currentUser) {
      requireAuth('Please sign in before unlocking outfits.');
      return;
    }

    const updatedOutfits = state.outfits.map((outfit) =>
      outfit.id === outfitId ? { ...outfit, unlocked: true } : outfit
    );

    playCoinSound();
    saveState({
      ...state,
      outfits: updatedOutfits,
      selectedOutfitId: outfitId,
    });

    setShowCelebration({
      show: true,
      msg: 'Trang phục mới đã được mở khóa thành công.',
      gems: 0,
    });
  };

  const handleEquipOutfit = (outfitId: string) => {
    playAppSound(800, 'triangle', 0.1);
    saveState({ ...state, selectedOutfitId: outfitId });
  };

  const handleOpenChest = (nodeId: string) => {
    if (!currentUser) {
      requireAuth('Please sign in before opening rewards or trophies.');
      return;
    }

    const node = state.lessons.find((lesson) => lesson.id === nodeId);
    if (!node || node.locked) {
      playAppSound(150, 'sawtooth', 0.1);
      return;
    }

    const updatedLessons = state.lessons.map((lesson) =>
      lesson.id === nodeId ? { ...lesson, completed: true } : lesson
    );

    const activeIndex = state.lessons.findIndex((lesson) => lesson.id === nodeId);
    if (activeIndex !== -1 && activeIndex + 1 < updatedLessons.length) {
      updatedLessons[activeIndex + 1].locked = false;
    }

    const rewardXpVal = nodeId === 'trophy_node' ? 100 : 50;
    playCoinSound();

    const rewardState = getDailyRewardState(rewardXpVal, 0);
    saveState({
      ...state,
      xp: rewardState.xp,
      streak: rewardState.streak,
      gems: rewardState.gems,
      leaderboard: rewardState.leaderboard,
      lessons: updatedLessons,
    });

    setShowCelebration({
      show: true,
      msg:
        nodeId === 'trophy_node'
          ? `Bé đã chinh phục cúp chương và nhận ${rewardXpVal} XP.`
          : `Bé vừa mở rương thưởng và nhận ${rewardXpVal} XP.`,
      gems: 0,
    });
  };

  const handleAuthSubmit = async (data: { email: string; name?: string; pass: string; user?: AuthenticatedUser }) => {
    playAppSound(800, 'sine', 0.1);

    if (data.user) {
      applyAuthenticatedUser(data.user);
      await refreshChildren(data.user);
    } else if (data.name) {
      localStorage.setItem('parent_account_name', data.name);
      localStorage.setItem('parent_account_email', data.email);
    }

    setAuthErrorMessage(null);
    setAuthModal(null);
    setShowCelebration({
      show: true,
      msg:
        globalLang === 'en'
          ? 'Sign-in successful. The frontend is syncing real data from the backend.'
          : 'Đăng nhập thành công. Frontend đang đồng bộ dữ liệu thật từ backend.',
      gems: 10,
    });
  };

  const handleSaveChildProfile = async (payload: { name: string; age: number; learningGoal: string; childId?: string | null }) => {
    if (!currentUser) {
      setAuthModal('login');
      return;
    }

    setChildProfileError(null);
    // Dùng childId từ payload (do ProfileTab truyền lên) thay vì currentChild
    // để phân biệt đúng giữa thêm mới (childId = null/undefined) và sửa
    const targetChildId = payload.childId ?? null;
    const endpoint = targetChildId ? `/api/children/${targetChildId}` : '/api/children';
    const method = targetChildId ? 'PATCH' : 'POST';

    const { childId: _omit, ...bodyPayload } = payload;

    const response = await fetch(endpoint, {
      method,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(bodyPayload),
    });

    const responsePayload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(
        formatApiError(
          responsePayload,
          globalLang === 'en' ? 'Unable to save the child profile.' : 'Không thể lưu hồ sơ của bé.',
          globalLang === 'en',
        ),
      );
    }

    const savedChild = (responsePayload?.child || responsePayload?.data?.child) as ChildProfile;
    const missions = await fetchChildMissions(savedChild.id);

    setChildren((prevChildren) => {
      const remaining = prevChildren.filter((child) => child.id !== savedChild.id);
      return [...remaining, savedChild];
    });

    // Cập nhật context để Sidebar hiển thị bé mới ngay lập tức
    ctxSeedChildren(
      [...children.filter((c) => c.id !== savedChild.id), savedChild],
      savedChild.id,
    );

    applyChildDataToState(savedChild, missions);
    setShowCelebration({
      show: true,
      msg:
        globalLang === 'en'
          ? `${savedChild.name}'s profile was saved successfully.`
          : `Hồ sơ của ${savedChild.name} đã được lưu thành công.`,
      gems: 0,
    });
    return savedChild;
  };

  const handleSelectChildFromHome = async (child: ChildProfile) => {
    try {
      await fetch('/api/active-child', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ childId: child.id }),
      });
    } catch {
      // ignore — selection still applies locally
    }
    // Cập nhật context active child khi user chọn thủ công
    void ctxSetActiveChild(child.id);
    try {
      const missions = await fetchChildMissions(child.id);
      applyChildDataToState(child, missions);
    } catch (error) {
      console.warn('Unable to load missions for selected child:', error);
    }
  };

  const activeOutfit = state.outfits.find((outfit) => outfit.id === state.selectedOutfitId) || state.outfits[0];


  const currentActiveLessonObj =
    activeDynamicLesson || state.lessons.find((lesson) => lesson.id === state.activeLessonId);
  const isAuthenticated = Boolean(currentUser);
  const isPlayingGame = state.currentTab === 'trochoi' && isGameActive;
  const hideMobileBottomNav =
    isPlayingGame ||
    isParentOverlayOpen ||
    (state.currentTab === 'hoc' && studyTabMode === 'chat' && isAiSessionActive) ||
    (state.currentTab === 'lichsu' && isHistorySessionActive);

  return (
    <div className="relative h-dvh flex flex-col antialiased transition-colors duration-300 md:flex-row overflow-hidden overflow-x-hidden bg-[var(--app-bg)] text-[var(--app-text)]">
      {/* Dark-mode neon glow orbs — hidden in light mode */}
      {globalTheme === 'dark' && (
        <>
          <div
            aria-hidden="true"
            className="pointer-events-none absolute left-0 top-0 h-[480px] w-[480px] -translate-x-1/4 -translate-y-1/4 rounded-full bg-violet-600/10 blur-[120px] z-0"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute bottom-0 right-0 h-[480px] w-[480px] translate-x-1/4 translate-y-1/4 rounded-full bg-blue-600/10 blur-[120px] z-0"
          />
        </>
      )}
      <Sidebar
        state={state}
        onTabChange={handleTabChange}
        globalLang={globalLang}
        globalTheme={globalTheme}
        onToggleTheme={handleToggleTheme}
        onToggleLang={handleToggleLang}
        currentUser={currentUser ? { name: currentUser.name, email: currentUser.email } : null}
        currentChild={currentChild ? {
          id: currentChild.id,
          name: currentChild.name,
          experiencePoints: currentChild.experiencePoints,
          streakDays: currentChild.streakDays,
        } : null}
        onLogout={handleLogout}
        mode={childMode ? 'child' : 'parent'}
        unmasteredCount={unmasteredCount}
        hideBottomNav={hideMobileBottomNav}
      />

      <main className={`safe-inset relative z-10 flex-1 min-w-0 min-h-0 overflow-x-hidden h-0 md:h-full custom-scrollbar flex flex-col ${!hideMobileBottomNav ? 'mobile-nav-clearance' : ''} ${state.currentTab === 'hoc' && studyTabMode === 'chat' ? 'px-2 py-2 pb-2 md:px-6 md:py-6 md:pb-6 overflow-hidden' : isPlayingGame ? 'px-2 py-2 pb-2 md:px-6 md:py-6 md:pb-6 overflow-y-auto' : 'px-4 py-4 md:pb-6 md:px-6 md:py-6 overflow-y-auto'}`}>
        <div
          className={`${state.currentTab === 'chucai' || state.currentTab === 'hoc' || state.currentTab === 'cauhinh' || state.currentTab === 'hosor' || state.currentTab === 'lichsu' || state.currentTab === 'nhapvai'
            ? 'max-w-[1320px]'
            : state.currentTab === 'trochoi'
              ? 'max-w-[1120px]'
              : 'max-w-5xl'
            } mx-auto transition-all duration-300 ${state.currentTab !== 'hoc' ? (isPlayingGame ? 'pt-0' : 'pt-4') : ''} flex-1 w-full flex flex-col min-h-0 ${!hideMobileBottomNav ? 'mobile-layout-scrollable' : ''}`}
        >
          <div className={`w-full flex-1 flex flex-col min-h-0 ${!hideMobileBottomNav ? 'mobile-layout-scrollable' : ''}`}>
            <div
              className={`w-full flex-1 flex flex-col min-h-0 ${state.currentTab === 'chucai' || state.currentTab === 'hoc' || state.currentTab === 'cauhinh' || state.currentTab === 'hosor' || state.currentTab === 'lichsu' || state.currentTab === 'trochoi' || state.currentTab === 'nhapvai'
                ? 'max-w-none'
                : 'max-w-xl mx-auto'
                } ${!hideMobileBottomNav ? 'mobile-layout-scrollable' : ''}`}
            >
              {!hasResolvedAuth ? (
                <div className="flex flex-1 items-center justify-center py-20" role="status" aria-label={globalLang === 'en' ? 'Opening SpeakJoy' : 'Đang mở SpeakJoy'}>
                  <div className="flex flex-col items-center gap-4">
                    <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[#58cc02]/15 shadow-[0_8px_22px_rgba(251,191,36,0.18)]">
                      <div className="animate-spin" style={{ animationDuration: '3.5s' }}>
                        <SunnyMascot outfitId="normal" state="idle" sizeClassName="h-12 w-12" />
                      </div>
                    </div>
                    <p className="text-sm font-bold text-[var(--app-text-muted)]">
                      {globalLang === 'en' ? 'Opening your lessons…' : 'Đang mở bài học của bé…'}
                    </p>
                  </div>
                </div>
              ) : !isAuthenticated ? (
                <div
                  className={`rounded-[24px] border border-b-4 p-8 text-center shadow-xl ${globalTheme === 'light'
                      ? 'border-[var(--app-border)] bg-white/70 backdrop-blur-sm text-[var(--app-text)]'
                      : 'border-[var(--app-border)] bg-[var(--app-surface)] text-[var(--app-text)]'
                    }`}
                >
                  <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[#58cc02]/15 text-3xl">
                    🔒
                  </div>
                  <h2 className="readable-block text-2xl font-black tracking-tight md:text-3xl">
                    {globalLang === 'en' ? 'Sign in to unlock the learning app' : 'Đăng nhập để mở khóa toàn bộ ứng dụng học'}
                  </h2>
                  <p className="fluid-body readable-block mx-auto mt-3 max-w-xl text-[var(--app-text-muted)]">
                    {globalLang === 'en'
                      ? 'A parent account is required before starting lessons, earning daily XP, building streaks, opening rewards, saving profiles, or changing settings.'
                      : 'Cần có tài khoản phụ huynh trước khi bắt đầu bài học, nhận kinh nghiệm mỗi ngày, duy trì streak, mở thưởng, lưu hồ sơ, hoặc đổi cài đặt.'}
                  </p>
                  <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
                    <button
                      onClick={() => {
                        playAppSound(600, 'sine', 0.08);
                        setAuthErrorMessage(null);
                        setAuthModal('signup');
                      }}
                      className="duo-btn-green rounded-[14px] px-6 py-3 text-xs font-extrabold uppercase tracking-wider text-white"
                    >
                      {globalLang === 'en' ? 'Create parent account' : 'Tạo tài khoản phụ huynh'}
                    </button>
                    <button
                      onClick={() => {
                        playAppSound(600, 'sine', 0.08);
                        setAuthErrorMessage(null);
                        setAuthModal('login');
                      }}
                      className="duo-btn-blue rounded-[14px] px-6 py-3 text-xs font-extrabold uppercase tracking-wider text-white"
                    >
                      {globalLang === 'en' ? 'Sign in' : 'Đăng nhập'}
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  {state.currentTab === 'hoc' && isAuthenticated && (
                    <>
                      {isChildrenLoading ? (
                        /* Loading */
                        <div className="flex items-center justify-center py-16 pt-20">
                          <div className="flex flex-col items-center gap-3">
                            <div className="flex h-18 w-18 items-center justify-center rounded-full bg-[#58cc02]/15 shadow-[0_8px_22px_rgba(251,191,36,0.18)]">
                              <div className="animate-spin" style={{ animationDuration: '3.5s' }}>
                                <SunnyMascot outfitId="normal" state="idle" sizeClassName="h-11 w-11" />
                              </div>
                            </div>
                            <span className="text-sm font-bold text-[var(--app-text-muted)]">
                              {globalLang === 'en' ? 'Loading...' : 'Đang tải...'}
                            </span>
                          </div>
                        </div>
                      ) : children.length === 0 ? (
                        /* No children yet — show "Create first child" screen */
                        <div className="flex items-center justify-center pt-16 pb-8">
                          <div
                            className={`w-full max-w-md rounded-[28px] border border-b-4 p-10 text-center shadow-2xl ${globalTheme === 'light'
                                ? 'border-[var(--app-border)] bg-white/70 backdrop-blur-sm'
                                : 'border-[#37464f] bg-[#131f24]'
                              }`}
                          >
                            <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-[#58cc02]/15 text-4xl">
                              🧒
                            </div>
                            <h2 className="text-2xl font-black tracking-tight text-[var(--app-text)]">
                              {globalLang === 'en' ? 'Create your first child profile' : 'Tạo hồ sơ bé đầu tiên'}
                            </h2>
                            <p className="mt-3 text-sm text-[var(--app-text-muted)]">
                              {globalLang === 'en'
                                ? 'Add a child profile to get started with personalized learning.'
                                : 'Thêm hồ sơ bé để bắt đầu hành trình học tập cá nhân hóa.'}
                            </p>
                            <button
                              onClick={() => handleTabChange('hosor')}
                              className="mt-6 rounded-[14px] bg-[#58cc02] px-8 py-3.5 text-xs font-extrabold uppercase tracking-wider text-white shadow-md hover:brightness-110 active:brightness-95"
                            >
                              {globalLang === 'en' ? 'Add child profile' : 'Thêm hồ sơ bé'}
                            </button>
                          </div>
                        </div>
                      ) : !hasAiConfigured ? (
                        /* Has children, no AI key yet */
                        <div className="flex items-center justify-center pt-16 pb-8">
                          <div
                            className={`w-full max-w-md rounded-[28px] border border-b-4 p-10 text-center shadow-2xl ${globalTheme === 'light'
                                ? 'border-[var(--app-border)] bg-white/70 backdrop-blur-sm'
                                : 'border-[#37464f] bg-[#131f24]'
                              }`}
                          >
                            <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-[#df52ff]/15 text-4xl">
                              🔑
                            </div>
                            <h2 className="text-2xl font-black tracking-tight text-[var(--app-text)]">
                              {globalLang === 'en' ? 'Configure your AI API Key' : 'Cấu hình API Key AI'}
                            </h2>
                            <p className="mt-3 text-sm text-[var(--app-text-muted)]">
                              {globalLang === 'en'
                                ? 'Set up your AI API key in settings to unlock the speaking coach.'
                                : 'Thiết lập API Key AI trong cài đặt để mở khóa tính năng luyện nói.'}
                            </p>
                            <button
                              onClick={() => handleTabChange('cauhinh')}
                              className="mt-6 rounded-[14px] bg-[#df52ff] px-8 py-3.5 text-xs font-extrabold uppercase tracking-wider text-white shadow-md hover:brightness-110 active:brightness-95"
                            >
                              {globalLang === 'en' ? 'Go to settings' : 'Đi đến cài đặt'}
                            </button>
                          </div>
                        </div>
                      ) : (
                        /* Children + AI ready — go straight to the study interface */
                        studyTabMode === 'chat' ? (
                          <React.Fragment key={currentChild?.id || 'no-child'}>
                            <AiTalkTab
                              state={state}
                              onUpdateStats={handleAiStatsUpdate}
                              currentUser={currentUser}
                              currentChild={currentChild}
                              onProgressSync={() => refreshChildren(currentUser)}
                              onUsageSync={syncParentUsageView}
                              globalLang={globalLang}
                              globalTheme={globalTheme}
                              onActiveSessionChange={setIsAiSessionActive}
                            />
                          </React.Fragment>
                        ) : (
                          <PathMap
                            lessons={state.lessons}
                            activeOutfit={activeOutfit}
                            onStartLesson={handleStartLesson}
                            onOpenChest={handleOpenChest}
                            viewType={studyTabMode}
                            topicCards={topics}
                            isTopicsLoading={isTopicsLoading}
                            globalLang={globalLang}
                            globalTheme={globalTheme}
                          />
                        )
                      )}
                    </>
                  )}

                  {state.currentTab === 'childlogin' && !childMode && (
                    <ChildLoginTab
                      children={children}
                      globalLang={globalLang}
                      globalTheme={globalTheme}
                      onSuccess={(child) => {
                        setChildMode(child);
                        setHasAiConfigured(true);
                        const profile = children.find((item) => item.id === child.id);
                        if (profile) void handleSelectChildFromHome(profile);
                        saveState((previous) => ({ ...previous, currentTab: 'hoc' }));
                      }}
                    />
                  )}

                  {state.currentTab === 'chucai' && childMode && <AlphabetTab globalLang={globalLang} currentChild={currentChild} />}

                  {state.currentTab === 'lichsu' && childMode && (
                    <div className="flex-1 w-full h-full py-4 md:py-6">
                      <HistoryTab
                        globalLang={globalLang}
                        globalTheme={globalTheme}
                        currentChild={currentChild}
                        onUnmasteredCountChange={setUnmasteredCount}
                        onActiveSessionChange={setIsHistorySessionActive}
                      />
                    </div>
                  )}

                  {state.currentTab === 'trochoi' && childMode && (
                    <GameZoneTab
                      state={state}
                      onUpdateStats={handleAiStatsUpdate}
                      currentChild={currentChild}
                      children={children}
                      globalLang={globalLang}
                      globalTheme={globalTheme}
                      onActiveGameChange={setIsGameActive}
                    />
                  )}

                  {state.currentTab === 'nhapvai' && childMode && (
                    <RolePlayHub
                      state={state}
                      onUpdateStats={handleAiStatsUpdate}
                      currentChild={currentChild}
                      globalLang={globalLang}
                      globalTheme={globalTheme}
                      onActiveSessionChange={setIsAiSessionActive}
                    />
                  )}

                  {state.currentTab === 'hosor' && (
                    <ProfileTab
                      state={state}
                      currentUser={currentUser}
                      currentChild={currentChild}
                      children={children}
                      isLoading={isChildrenLoading}
                      errorMessage={childProfileError}
                      onSaveChild={handleSaveChildProfile}
                      globalLang={globalLang}
                      globalTheme={globalTheme}
                      onOverlayOpenChange={setIsParentOverlayOpen}
                      onSelectChild={(childId) => {
                        const child = children.find((c) => c.id === childId);
                        if (child) void handleSelectChildFromHome(child);
                      }}
                      onDeleteChild={async (childId) => {
                        const response = await fetch(`/api/children/${childId}`, {
                          method: 'DELETE',
                          credentials: 'include',
                        });
                        if (!response.ok) {
                          const payload = await response.json().catch(() => ({}));
                          throw new Error(payload?.message || 'Không thể xóa bé.');
                        }

                        // Update the profile list immediately. Missions/topics are refreshed
                        // in the background so the delete dialog does not wait on extra APIs.
                        const remainingChildren = children.filter((child) => child.id !== childId);
                        const deletedActiveChild = currentChild?.id === childId;
                        const nextActiveChild = deletedActiveChild
                          ? remainingChildren[0] ?? null
                          : currentChild;

                        setChildren(remainingChildren);
                        ctxSeedChildren(remainingChildren, nextActiveChild?.id ?? null);

                        if (deletedActiveChild) {
                          if (nextActiveChild) {
                            applyChildDataToState(nextActiveChild, []);
                          } else {
                            setCurrentChild(null);
                            setTopics([]);
                            localStorage.removeItem(ACTIVE_CHILD_STORAGE_KEY);
                          }
                        }

                        void refreshChildren(currentUser, nextActiveChild?.id ?? null);
                      }}
                      onUploadAvatar={async (childId, file) => {
                        const formData = new FormData();
                        formData.append('file', file);
                        const response = await fetch(`/api/children/${childId}/avatar`, {
                          method: 'POST',
                          credentials: 'include',
                          body: formData,
                        });
                        if (!response.ok) {
                          const payload = await response.json().catch(() => ({}));
                          throw new Error(payload?.message || 'Không thể tải ảnh đại diện.');
                        }
                        await refreshChildren(currentUser);
                      }}
                      onFetchSessionHistory={async (childId) => {
                        return await fetchChildSessions(childId);
                      }}
                    />
                  )}

                  {state.currentTab === 'cauhinh' && (
                    <SettingsTab
                      currentUser={currentUser}
                      onSessionRefresh={refreshCurrentUser}
                      globalLang={globalLang}
                      globalTheme={globalTheme}
                      onLogout={() => setShowParentLogout(true)}
                    />
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </main>

      <AnimatePresence>
        {state.activeLessonId && currentActiveLessonObj && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[500]">
            <LessonModal
              lesson={currentActiveLessonObj}
              globalLang={globalLang}
              onClose={() => {
                setActiveDynamicLesson(null);
                setActiveTopicContext(null);
                saveState({ ...state, activeLessonId: null });
              }}
              onFinish={handleFinishLesson}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showCelebration && (
          <div className="fixed inset-0 bg-black/85 flex items-center justify-center z-[1000] p-4 text-white">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-[#1f2d35] max-w-sm w-full rounded-md border border-[#37464f] p-6 text-center space-y-4 shadow-2xl relative"
            >
              <div className="text-5xl animate-bounce">*</div>
              <h3 className="text-xl font-bold text-[#58cc02]">{globalLang === 'en' ? 'Awesome' : 'Tuyệt vời'}</h3>
              <p className="text-xs text-gray-300 leading-relaxed">{showCelebration.msg}</p>
              <button
                onClick={() => {
                  playAppSound(500, 'triangle', 0.1);
                  setShowCelebration(null);
                }}
                className="w-full bg-[#1cb0f6] border-b-4 border-[#1899d6] text-white font-extrabold uppercase py-3 rounded-md text-xs tracking-wider cursor-pointer hover:brightness-110 active:brightness-95"
              >
                {globalLang === 'en' ? 'Continue' : 'Tiếp tục'}
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {authModal && (
          <AuthModal
            mode={authModal}
            initialErrorMessage={authErrorMessage}
            globalLang={globalLang}
            globalTheme={globalTheme}
            onClose={() => {
              setAuthErrorMessage(null);
              setAuthModal(null);
            }}
            onSwitchMode={(newMode) => {
              setAuthErrorMessage(null);
              setAuthModal(newMode);
            }}
            onSubmit={(data) => {
              void handleAuthSubmit(data);
            }}
            onSessionRefresh={refreshCurrentUser}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {parentGateOpen && (
          <ParentGateModal
            globalLang={globalLang}
            globalTheme={globalTheme}
            onClose={() => setParentGateOpen(false)}
            onSetupRequired={() => {
              localStorage.setItem('parent_gate_setup_completed', 'false');
              setIsParentVerified(false);
              setParentGateOpen(false);
              saveState({ ...state, currentTab: 'cauhinh' });
            }}
            onSuccess={() => {
              setIsParentVerified(true);
              setParentGateOpen(false);
              saveState({ ...state, currentTab: 'cauhinh' });
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {resetToken && (
          <ResetPasswordModal
            token={resetToken}
            globalLang={globalLang}
            globalTheme={globalTheme}
            onClose={() => {
              setResetToken(null);
              window.history.replaceState({}, '', window.location.pathname);
              setAuthModal('login');
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showParentLogout && (
          <motion.div className="fixed inset-0 z-[500] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div role="alertdialog" aria-modal="true" aria-labelledby="parent-logout-title" className={`w-full max-w-md rounded-[22px] border p-6 shadow-2xl backdrop-blur-xl ${
              globalTheme === 'light'
                ? 'border-amber-200/60 bg-amber-50/90 text-[var(--app-text)]'
                : 'border-[var(--app-border)] bg-[#131f24] text-white'
            }`} initial={{ y: 14, scale: 0.97 }} animate={{ y: 0, scale: 1 }} exit={{ y: 14, scale: 0.97 }}>
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-500/15 text-2xl">👋</div>
              <h2 id="parent-logout-title" className="text-xl font-black">{globalLang === 'en' ? 'Sign out?' : 'Đăng xuất tài khoản?'}</h2>
              <p className="mt-2 text-sm text-[var(--app-text-muted)]">{globalLang === 'en' ? 'You will need to sign in again to manage child profiles and settings.' : 'Bạn sẽ cần đăng nhập lại để quản lý hồ sơ bé và phần cài đặt.'}</p>
              <div className="mt-6 flex justify-end gap-3">
                <button type="button" disabled={isParentLoggingOut} onClick={() => setShowParentLogout(false)} className="min-h-[48px] rounded-xl border border-[var(--app-border)] px-5 text-xs font-black uppercase disabled:opacity-60">{globalLang === 'en' ? 'Cancel' : 'Hủy'}</button>
                <button type="button" disabled={isParentLoggingOut} onClick={() => void confirmParentLogout()} className="min-h-[48px] rounded-xl bg-red-500 px-5 text-xs font-black uppercase text-white disabled:opacity-60">{isParentLoggingOut ? (globalLang === 'en' ? 'Signing out…' : 'Đang đăng xuất…') : (globalLang === 'en' ? 'Sign out' : 'Đăng xuất')}</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showChildExit && (
          <motion.div className="fixed inset-0 z-[500] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.form
              onSubmit={async (event) => {
                event.preventDefault();
                setIsExitingChildMode(true);
                setChildExitError(null);
                try {
                  const isLocal = (currentUser?.authProvider || 'local') === 'local';
                  const response = await fetch('/api/child-auth/exit', {
                    method: 'POST',
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ password: isLocal ? childExitPassword : '' })
                  });
                  const payload = await response.json().catch(() => ({}));
                  if (!response.ok) {
                    if (response.status === 401) {
                      handleExpiredParentSession(
                        globalLang === 'en'
                          ? 'Your parent session has expired. Please sign in again to leave child mode.'
                          : 'Phiên phụ huynh đã hết hạn. Vui lòng đăng nhập lại để rời chế độ trẻ em.'
                      );
                      return;
                    }
                    throw new Error(payload?.message || 'Unable to exit child mode.');
                  }
                  setChildMode(null);
                  setShowChildExit(false);
                  setChildExitPassword('');
                  await refreshAiConfigured();
                  saveState((previous) => ({ ...previous, currentTab: 'childlogin' }));
                } catch (error) {
                  setChildExitError(error instanceof Error ? error.message : 'Unable to exit child mode.');
                } finally {
                  setIsExitingChildMode(false);
                }
              }}
              className={`w-full max-w-md rounded-[22px] border p-6 shadow-2xl backdrop-blur-xl ${globalTheme === 'light'
                  ? 'border-amber-200/60 bg-amber-50/90 text-[var(--app-text)]'
                  : 'border-[var(--app-border)] bg-[#131f24] text-white'
                }`}
              initial={{ y: 14, scale: 0.97 }} animate={{ y: 0, scale: 1 }} exit={{ y: 14, scale: 0.97 }}
            >
              <h2 className="text-xl font-black">{globalLang === 'en' ? 'Return to parent area' : 'Quay lại khu vực phụ huynh'}</h2>
              <p className="mt-2 text-sm text-[var(--app-text-muted)]">{(currentUser?.authProvider || 'local') === 'local' ? (globalLang === 'en' ? 'Enter the parent password to leave child mode.' : 'Nhập mật khẩu phụ huynh để rời chế độ trẻ em.') : (globalLang === 'en' ? 'Press continue to return to the parent profile area.' : 'Bấm tiếp tục để thoát khỏi chế độ trẻ em.')}</p>
              {(currentUser?.authProvider || 'local') === 'local' && <input autoFocus type="password" value={childExitPassword} onChange={(event) => setChildExitPassword(event.target.value)} className="mt-5 min-h-[52px] w-full rounded-xl border border-[var(--app-border)] bg-[var(--app-bg-alt)] px-4 font-bold outline-none focus:border-[#1cb0f6]" placeholder={globalLang === 'en' ? 'Parent password' : 'Mật khẩu phụ huynh'} required />}
              {childExitError && <p className="mt-3 rounded-xl bg-red-500/10 p-3 text-xs font-bold text-red-500">{childExitError}</p>}
              <div className="mt-5 flex justify-end gap-3"><button type="button" onClick={() => setShowChildExit(false)} className="min-h-[48px] rounded-xl border border-[var(--app-border)] px-5 text-xs font-black uppercase">{globalLang === 'en' ? 'Cancel' : 'Hủy'}</button><button disabled={isExitingChildMode} className="min-h-[48px] rounded-xl bg-[#1cb0f6] px-5 text-xs font-black uppercase text-white disabled:opacity-60">{isExitingChildMode ? (globalLang === 'en' ? 'Checking…' : 'Đang xử lý…') : (globalLang === 'en' ? 'Continue' : 'Tiếp tục')}</button></div>
            </motion.form>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

