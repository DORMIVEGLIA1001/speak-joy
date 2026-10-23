import React, { useRef, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Calendar, Camera, CheckCircle2, ChevronDown, ChevronUp, Gamepad2, Pencil, Plus, Shield, Trash2, Trophy, User, X, TrendingUp, Award } from 'lucide-react';

import { playAppSound } from '../data';
import { AppState } from '../types';

type AuthenticatedUser = {
  id: string;
  name: string;
  email: string;
};

type ChildProfile = {
  id: string;
  name: string;
  age: number;
  level: string;
  sessionsCompleted: number;
  topicsCompleted: number;
  streakDays: number;
  learningGoal: string;
  lastSessionAt: string;
  avatarUrl?: string | null;
  experiencePoints?: number;
  mouthCountTotal?: number;
  lastSessionMouthCount?: number;
  lastSessionEarnedXp?: number;
  activityDates?: string[];
};

interface ProfileTabProps {
  state: AppState;
  currentUser: AuthenticatedUser | null;
  currentChild: ChildProfile | null;
  children: ChildProfile[];
  isLoading: boolean;
  errorMessage: string | null;
  onSaveChild: (payload: { name: string; age: number; learningGoal: string; childId?: string | null }) => Promise<ChildProfile | void>;
  onClaimReward?: (questId: string, xpReward: number) => void;
  globalLang: 'en' | 'vi';
  globalTheme: 'dark' | 'light';
  onSelectChild?: (childId: string) => void;
  onDeleteChild?: (childId: string) => Promise<void>;
  onUploadAvatar?: (childId: string, file: File) => Promise<void>;
  onFetchSessionHistory?: (childId: string) => Promise<SessionHistoryItem[]>;
  onOverlayOpenChange?: (isOpen: boolean) => void;
}

type SessionHistoryItem = {
  id: string;
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

const makeChildUsername = (childName: string) =>
  childName
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.|\.$/g, '');

const STARTER_XP_MAX = 10000;
const MOVER_XP_MAX = 20000;
const EXPLORER_XP_MAX = 30000;

const getSpeakingProgressPct = (experiencePoints?: number) => {
  const xp = Math.max(0, experiencePoints || 0);

  if (xp < STARTER_XP_MAX) {
    return Math.round((xp / STARTER_XP_MAX) * 100);
  }

  if (xp < MOVER_XP_MAX) {
    return Math.round(((xp - STARTER_XP_MAX) / (MOVER_XP_MAX - STARTER_XP_MAX)) * 100);
  }

  if (xp < EXPLORER_XP_MAX) {
    return Math.round(((xp - MOVER_XP_MAX) / (EXPLORER_XP_MAX - MOVER_XP_MAX)) * 100);
  }

  return 100;
};

const getProgressXpLabel = (experiencePoints?: number) => {
  const xp = Math.max(0, experiencePoints || 0);
  if (xp < STARTER_XP_MAX) {
    return `${xp}/${STARTER_XP_MAX}`;
  }
  if (xp < MOVER_XP_MAX) {
    return `${xp}/${MOVER_XP_MAX}`;
  }
  return `${xp}/${EXPLORER_XP_MAX}`;
};

type ChildGameRecords = {
  trueFalseHighScore: number;
  wordChainHighScore: number;
  flashcardMatchBestTime: number;
  storiesCompletedCount: number;
  blocksHighScore: number;
  blastHighScore: number;
};

type RankedGameId = 'true_false' | 'word_chain' | 'flashcard_match' | 'storytelling' | 'blocks' | 'blast';

const EMPTY_GAME_RECORDS: ChildGameRecords = {
  trueFalseHighScore: 0,
  wordChainHighScore: 0,
  flashcardMatchBestTime: 0,
  storiesCompletedCount: 0,
  blocksHighScore: 0,
  blastHighScore: 0,
};

const normalizeGameRecords = (value: Partial<ChildGameRecords> | null | undefined): ChildGameRecords => ({
  trueFalseHighScore: Number(value?.trueFalseHighScore) || 0,
  wordChainHighScore: Number(value?.wordChainHighScore) || 0,
  flashcardMatchBestTime: Number(value?.flashcardMatchBestTime) || 0,
  storiesCompletedCount: Number(value?.storiesCompletedCount) || 0,
  blocksHighScore: Number(value?.blocksHighScore) || 0,
  blastHighScore: Number(value?.blastHighScore) || 0,
});



const StreakCalendar = ({
  child,
  isLight,
  isEnglish,
}: {
  child: ChildProfile;
  isLight: boolean;
  isEnglish: boolean;
}) => {
  const [currentMonth, setCurrentMonth] = useState<Date>(() => new Date());

  const handlePrevMonth = () => {
    setCurrentMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  };

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();

  const firstDay = new Date(year, month, 1);
  let startDayOfWeek = firstDay.getDay(); // 0 (Sun) - 6 (Sat)
  if (startDayOfWeek === 0) startDayOfWeek = 7; // Convert Sunday to 7 (week starts on Monday)
  const blankDays = startDayOfWeek - 1;

  const totalDays = new Date(year, month + 1, 0).getDate();

  const activeDatesSet = new Set<string>(child.activityDates || []);

  const weeks: Array<Array<{ dayNumber: number | null; dateString: string | null; isActive: boolean }>> = [];
  let currentWeek: Array<{ dayNumber: number | null; dateString: string | null; isActive: boolean }> = [];

  for (let i = 0; i < blankDays; i++) {
    currentWeek.push({ dayNumber: null, dateString: null, isActive: false });
  }

  for (let day = 1; day <= totalDays; day++) {
    const dateObj = new Date(year, month, day);
    const yearStr = dateObj.getFullYear();
    const monthStr = String(dateObj.getMonth() + 1).padStart(2, '0');
    const dayStr = String(dateObj.getDate()).padStart(2, '0');
    const dateString = `${yearStr}-${monthStr}-${dayStr}`;

    const isActive = activeDatesSet.has(dateString);

    currentWeek.push({ dayNumber: day, dateString, isActive });

    if (currentWeek.length === 7) {
      weeks.push(currentWeek);
      currentWeek = [];
    }
  }

  if (currentWeek.length > 0) {
    while (currentWeek.length < 7) {
      currentWeek.push({ dayNumber: null, dateString: null, isActive: false });
    }
    weeks.push(currentWeek);
  }

  const monthTitle = isEnglish
    ? currentMonth.toLocaleString('en-US', { month: 'long' }).toUpperCase() + ` ${year}`
    : `THÁNG ${month + 1} NĂM ${year}`;

  const daysOfWeek = isEnglish
    ? ['M', 'T', 'W', 'T', 'F', 'S', 'S']
    : ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

  const todayObj = new Date();
  const todayStr = `${todayObj.getFullYear()}-${String(todayObj.getMonth() + 1).padStart(2, '0')}-${String(todayObj.getDate()).padStart(2, '0')}`;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1.5 mt-2">
        <Calendar className="h-4 w-4 text-[#ff9600]" />
        <h4 className="text-xs font-bold uppercase text-[var(--app-text-muted)]">
          {isEnglish ? 'Learning Calendar' : 'Lịch'}
        </h4>
      </div>

      <div className={`rounded-2xl border p-4 max-w-[420px] mx-auto w-full ${isLight ? 'border-[var(--app-border)] bg-white/40' : 'border-[var(--app-border)] bg-[var(--app-bg-alt)]'}`}>
        <div className="flex items-center justify-between mb-4">
          <button
            type="button"
            onClick={handlePrevMonth}
            className={`p-1.5 rounded-lg border transition ${isLight ? 'border-gray-200 hover:bg-gray-100 text-slate-700' : 'border-[#37464f] hover:bg-[#1a2c38] text-slate-300'}`}
          >
            <svg className="h-4 w-4 fill-current" viewBox="0 0 24 24">
              <path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z" />
            </svg>
          </button>
          <span className="text-xs font-black tracking-wide text-[var(--app-text)]">
            {monthTitle}
          </span>
          <button
            type="button"
            onClick={handleNextMonth}
            className={`p-1.5 rounded-lg border transition ${isLight ? 'border-gray-200 hover:bg-gray-100 text-slate-700' : 'border-[#37464f] hover:bg-[#1a2c38] text-slate-300'}`}
          >
            <svg className="h-4 w-4 fill-current" viewBox="0 0 24 24">
              <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" />
            </svg>
          </button>
        </div>

        <div className="grid grid-cols-7 gap-y-2 gap-x-0 mb-2 justify-items-center">
          {daysOfWeek.map((dayName, idx) => (
            <span key={idx} className="text-[11px] font-black text-[var(--app-text-muted)] opacity-60 uppercase w-10 text-center">
              {dayName}
            </span>
          ))}
        </div>

        <div className="space-y-2">
          {weeks.map((week, weekIdx) => (
            <div key={weekIdx} className="grid grid-cols-7 gap-y-0 gap-x-0 justify-items-stretch items-center">
              {week.map((day, colIdx) => {
                if (day.dayNumber === null) {
                  return <div key={colIdx} className="h-10" />;
                }

                const prevActive = colIdx > 0 && week[colIdx - 1].isActive;
                const nextActive = colIdx < 6 && week[colIdx + 1].isActive;
                const isToday = day.dateString === todayStr;

                let dayClass = '';
                if (!day.isActive) {
                  dayClass = `h-10 w-10 mx-auto flex items-center justify-center rounded-full text-sm font-bold text-[var(--app-text-muted)] transition hover:bg-slate-100/40 dark:hover:bg-slate-800/40 ${isToday ? 'border-2 border-[#1cb0f6] font-black' : ''}`;
                } else {
                  const baseActive = `h-10 flex items-center justify-center text-sm font-black text-white bg-[#ff9600] relative transition-all`;
                  if (prevActive && nextActive) {
                    dayClass = `${baseActive} w-full rounded-none`;
                  } else if (prevActive) {
                    dayClass = `${baseActive} w-full rounded-r-full pr-1`;
                  } else if (nextActive) {
                    dayClass = `${baseActive} w-full rounded-l-full pl-1`;
                  } else {
                    dayClass = `${baseActive} w-10 h-10 mx-auto rounded-full`;
                  }
                }

                return (
                  <div key={colIdx} className="flex justify-center items-center h-10 w-full">
                    <div className={dayClass} title={day.dateString || undefined}>
                      {day.dayNumber}
                      {day.isActive && !prevActive && !nextActive && (
                        <span className="absolute bottom-1 right-1 text-[8px]">🔥</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// ── Child card (compact) ──────────────────────────────────────────────────────

interface ChildCardProps {
  child: ChildProfile;
  isActive: boolean;
  isEnglish: boolean;
  isLight: boolean;
  isExpanded: boolean;
  onSelect: () => void;
  onDelete: (() => Promise<void>) | undefined;
  onAvatarClick: (() => void) | undefined;
  isUploading: boolean;
  isDeleting: boolean;
}

const ChildCard: React.FC<ChildCardProps> = ({
  child,
  isActive,
  isEnglish,
  isLight,
  isExpanded,
  onSelect,
  onDelete,
  onAvatarClick,
  isUploading,
  isDeleting,
}) => {
  const progressPct = getSpeakingProgressPct(child.experiencePoints);
  const colorIndex = [...child.id].reduce((total, char) => total + char.charCodeAt(0), 0) % 5;
  const lightPalettes = [
    'border-sky-300 bg-sky-50/90 shadow-[0_5px_0_#bae6fd]',
    'border-emerald-300 bg-emerald-50/90 shadow-[0_5px_0_#a7f3d0]',
    'border-violet-300 bg-violet-50/90 shadow-[0_5px_0_#ddd6fe]',
    'border-amber-300 bg-amber-50/90 shadow-[0_5px_0_#fde68a]',
    'border-rose-300 bg-rose-50/90 shadow-[0_5px_0_#fecdd3]',
  ];
  const darkPalettes = [
    'border-sky-500/45 bg-sky-950/45',
    'border-emerald-500/45 bg-emerald-950/45',
    'border-violet-500/45 bg-violet-950/45',
    'border-amber-500/45 bg-amber-950/45',
    'border-rose-500/45 bg-rose-950/45',
  ];
  const cardPalette = isLight ? lightPalettes[colorIndex] : darkPalettes[colorIndex];

  return (
    <motion.div
      layout
      transition={{ layout: { duration: 0.28, ease: [0.22, 1, 0.36, 1] } }}
      className={`relative flex cursor-pointer items-center gap-3 rounded-[16px] border-2 border-b-4 p-3 outline-none focus:outline-none transition-all duration-200 select-none ${cardPalette} ${
        isActive
          ? 'brightness-[1.03] shadow-md'
          : 'hover:-translate-y-0.5 hover:brightness-[1.02]'
      }`}
      onClick={onSelect}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
      aria-expanded={isExpanded}
    >
      {/* Avatar */}
      <div className="relative flex-shrink-0">
        <div
          className={`flex h-12 w-12 items-center justify-center overflow-hidden rounded-full border-2 text-2xl shadow-md ${isActive ? 'border-[#1cb0f6]' : 'border-white/70'}`}
        >
          {child.avatarUrl ? (
            <img
              src={child.avatarUrl}
              alt={child.name}
              className="h-full w-full object-cover"
            />
          ) : (
            <span>👤</span>
          )}
        </div>

        {/* Camera button */}
        {onAvatarClick && (
          <button
            type="button"
            className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full border border-[var(--app-border)] bg-[#1cb0f6] text-white shadow transition hover:bg-sky-400"
            onClick={(e) => {
              e.stopPropagation();
              onAvatarClick();
            }}
            disabled={isUploading}
            aria-label={isEnglish ? 'Upload avatar' : 'Tải ảnh đại diện'}
            title={isEnglish ? 'Upload avatar' : 'Tải ảnh đại diện'}
          >
            {isUploading ? (
              <span className="h-3 w-3 animate-spin rounded-full border border-white border-t-transparent" />
            ) : (
              <Camera className="h-3 w-3" />
            )}
          </button>
        )}
      </div>

      {/* Info */}
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <span
            className="truncate text-sm font-bold text-[var(--app-text)]"
          >
            {child.name}
          </span>
        </div>

        {/* Compact progress bar */}
        <div className="flex items-center gap-2.5 pt-0.5">
          <div className={`relative h-5 min-w-0 flex-1 overflow-hidden rounded-full border-2 shadow-inner ${isLight ? 'border-sky-200 bg-sky-100' : 'border-slate-600 bg-slate-950'}`}>
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-[#22c55e] via-[#84e523] to-[#facc15] shadow-[0_0_12px_rgba(88,204,2,0.65)] transition-all duration-500"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <span className={`min-w-[112px] text-right font-mono text-[10px] font-black tabular-nums ${isLight ? 'text-rose-700' : 'text-amber-300'}`}>
            {getProgressXpLabel(child.experiencePoints)} XP ({progressPct}%)
          </span>
        </div>
      </div>

      {/* Delete button */}
      {onDelete && (
        <button
          type="button"
          className={`ml-1 flex-shrink-0 rounded-[8px] border p-1.5 transition disabled:cursor-not-allowed disabled:opacity-50 ${isLight ? 'border-red-200 bg-red-50 text-red-600 hover:bg-red-100' : 'border-red-800 bg-red-950/50 text-red-300 hover:bg-red-900/70'}`}
          onClick={(e) => {
            e.stopPropagation();
            void onDelete();
          }}
          disabled={isDeleting}
          aria-label={isEnglish ? `Delete ${child.name}` : `Xóa ${child.name}`}
          title={isEnglish ? `Delete ${child.name}` : `Xóa ${child.name}`}
        >
          {isDeleting ? (
            <span className="h-3.5 w-3.5 animate-spin rounded-full border border-red-400 border-t-transparent" />
          ) : (
            <Trash2 className="h-3.5 w-3.5" />
          )}
        </button>
      )}

      {/* Expand/collapse chevron */}
      <div className="ml-1 flex-shrink-0 text-[var(--app-text-muted)]">
        {isExpanded ? (
          <ChevronUp className="h-4 w-4" />
        ) : (
          <ChevronDown className="h-4 w-4" />
        )}
      </div>
    </motion.div>
  );
};

// ── Main component ────────────────────────────────────────────────────────────

export default function ProfileTab({
  state,
  currentUser,
  currentChild,
  children,
  isLoading,
  errorMessage,
  onSaveChild,
  globalLang,
  globalTheme,
  onSelectChild,
  onDeleteChild,
  onUploadAvatar,
  onFetchSessionHistory,
  onOverlayOpenChange,
}: ProfileTabProps) {
  const [name, setName] = useState('');
  const [age, setAge] = useState('6');
  const [learningGoal, setLearningGoal] = useState('');
  const [isSaved, setIsSaved] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string>(''); // Validation error for duplicate names
  // null = đang thêm mới; string = đang sửa bé có id này
  const [editingChildId, setEditingChildId] = useState<string | null | undefined>(currentChild?.id);
  const [isProfileFormOpen, setIsProfileFormOpen] = useState(false);
  const [pendingDeleteChild, setPendingDeleteChild] = useState<ChildProfile | null>(null);
  const [childPassword, setChildPassword] = useState('');
  const [initialChildUsername, setInitialChildUsername] = useState('');

  // Per-child upload/delete states keyed by child id
  const [uploadingIds, setUploadingIds] = useState<Set<string>>(new Set());
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Expand/collapse state for child cards
  const [expandedChildId, setExpandedChildId] = useState<string | null>(null);
  const [childSessionHistory, setChildSessionHistory] = useState<Record<string, SessionHistoryItem[]>>({});
  const [loadingSessionHistory, setLoadingSessionHistory] = useState<Record<string, boolean>>({});

  // Hidden file input ref for avatar upload
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingUploadChildId, setPendingUploadChildId] = useState<string | null>(null);
  const [profileViewMode, setProfileViewMode] = useState<'profile' | 'reports' | 'ranking'>('profile');
  const [selectedChildId, setSelectedChildId] = useState<string>(currentChild?.id || children[0]?.id || '');
  const [statsData, setStatsData] = useState<any>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState<string | null>(null);

  const fetchStatsData = async () => {
    if (!selectedChildId) return;
    try {
      setStatsLoading(true);
      setStatsError(null);
      const res = await fetch(`/api/children/${selectedChildId}/session-stats`, {
        credentials: 'include',
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.message || 'Failed to fetch stats');
      setStatsData(payload.data || null);
    } catch (err: any) {
      setStatsError(err.message || 'Error fetching stats');
    } finally {
      setStatsLoading(false);
    }
  };

  useEffect(() => {
    if (currentChild?.id) {
      setSelectedChildId(currentChild.id);
    } else if (children[0]?.id && !selectedChildId) {
      setSelectedChildId(children[0].id);
    }
  }, [currentChild, children]);

  useEffect(() => {
    if (profileViewMode === 'reports' && selectedChildId) {
      void fetchStatsData();
    }
  }, [profileViewMode, selectedChildId]);

  const [rankedGameId, setRankedGameId] = useState<RankedGameId>('true_false');
  const [gameRecordsByChild, setGameRecordsByChild] = useState<Record<string, ChildGameRecords>>({});
  const [isGameRankingLoading, setIsGameRankingLoading] = useState(false);

  const isEnglish = globalLang === 'en';
  const isLight = globalTheme === 'light';

  useEffect(() => {
    onOverlayOpenChange?.(isProfileFormOpen || pendingDeleteChild !== null);
  }, [isProfileFormOpen, onOverlayOpenChange, pendingDeleteChild]);

  useEffect(() => () => onOverlayOpenChange?.(false), [onOverlayOpenChange]);

  useEffect(() => {
    if (profileViewMode !== 'ranking' || children.length === 0) return;

    let isCancelled = false;
    setIsGameRankingLoading(true);
    Promise.all(
      children.map((child) =>
        fetch(`/api/children/${child.id}/game-records`, { credentials: 'include' })
          .then(async (response) => {
            const contentType = response.headers.get('content-type') || '';
            if (!contentType.includes('application/json')) {
              throw new Error(`Expected JSON but received ${contentType || 'an unknown response type'}`);
            }
            const payload = await response.json();
            if (!response.ok) {
              const detail = payload?.message || payload?.detail || response.statusText || 'Unknown error';
              throw new Error(`HTTP ${response.status}: ${detail}`);
            }
            return [child.id, normalizeGameRecords(payload?.data ?? payload), null] as const;
          })
          .catch((error) => [
            child.id,
            EMPTY_GAME_RECORDS,
            error instanceof Error ? error.message : 'Unknown error',
          ] as const)
      )
    ).then((entries) => {
      if (isCancelled) return;
      setGameRecordsByChild(Object.fromEntries(entries.map(([childId, records]) => [childId, records])));
      entries.forEach(([childId, , error]) => {
        if (error) console.warn(`Unable to load game records for child ${childId}: ${error}`);
      });
    }).finally(() => {
      if (!isCancelled) setIsGameRankingLoading(false);
    });

    return () => {
      isCancelled = true;
    };
  }, [profileViewMode, children.map((child) => child.id).join('|'), isEnglish]);

  useEffect(() => {
    // Chỉ sync form khi đang ở chế độ sửa (không phải thêm mới)
    // editingChildId === null nghĩa là user đang thêm mới, không override
    if (editingChildId === null) {
      return;
    }
    if (currentChild) {
      setEditingChildId(currentChild.id);
      setName(currentChild.name);
      setAge(String(currentChild.age));
      setLearningGoal(currentChild.learningGoal || '');
      return;
    }

    setEditingChildId(undefined);
    setName('');
    setAge('6');
    setLearningGoal('');
  }, [currentChild]); // eslint-disable-line react-hooks/exhaustive-deps

  // Validate child name for duplicates (case-insensitive)
  const validateChildName = (nameToCheck: string): boolean => {
    const trimmed = nameToCheck.trim();
    
    if (!trimmed) {
      setNameError(isEnglish ? 'Name is required' : 'Cần nhập tên bé');
      return false;
    }
    
    // Check for duplicate (case-insensitive)
    const duplicate = children.find(c => 
      c.id !== editingChildId && 
      c.name.trim().toLowerCase() === trimmed.toLowerCase()
    );
    
    if (duplicate) {
      setNameError(
        isEnglish 
          ? `A child named "${trimmed}" already exists. Please choose a different name.`
          : `Đã có bé tên "${trimmed}". Vui lòng chọn tên khác.`
      );
      return false;
    }
    
    setNameError('');
    return true;
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLocalError(null);
    setNameError('');

    const parsedAge = Number.parseInt(age, 10);
    if (!name.trim()) {
      setLocalError(isEnglish ? 'Please enter your child name.' : 'Vui lòng nhập tên của bé.');
      return;
    }

    // Validate name for duplicates
    if (!validateChildName(name)) {
      return;
    }

    if (!Number.isFinite(parsedAge) || parsedAge < 3 || parsedAge > 15) {
      setLocalError(isEnglish ? 'Valid age is from 3 to 15.' : 'Độ tuổi hợp lệ là từ 3 đến 15.');
      return;
    }

    try {
      setIsSubmitting(true);
      playAppSound(750, 'triangle', 0.12);
      const credentialUsername = editingChildId === null
        ? makeChildUsername(name)
        : initialChildUsername || makeChildUsername(name);

      if (editingChildId === null && (!credentialUsername || childPassword.length < 6)) {
        setLocalError(isEnglish ? 'Enter a child name and a password of at least 6 characters.' : 'Hãy nhập tên bé và mật khẩu ít nhất 6 ký tự.');
        return;
      }

      const savedChild = await onSaveChild({
        name: name.trim(),
        age: parsedAge,
        learningGoal: learningGoal.trim(),
        childId: editingChildId ?? null,
      });

      if (savedChild && credentialUsername && childPassword) {
        const credentialResponse = await fetch(`/api/child-auth/credentials/${savedChild.id}`, {
          method: 'PUT',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: credentialUsername, password: childPassword }),
        });
        const credentialPayload = await credentialResponse.json().catch(() => ({}));
        if (!credentialResponse.ok) {
          setEditingChildId(savedChild.id);
          throw new Error(credentialPayload?.message || (isEnglish ? 'The profile was saved, but the child login could not be saved.' : 'Đã lưu hồ sơ nhưng chưa thể lưu tài khoản đăng nhập của bé.'));
        }
      }
      setIsSaved(true);
      // Sau khi lưu thành công, reset về chế độ sửa (không còn thêm mới)
      setEditingChildId(undefined);
      setChildPassword('');
      setIsProfileFormOpen(false);
      window.setTimeout(() => setIsSaved(false), 3000);
    } catch (error) {
      // Check if error is about duplicate name
      const errorMessage = error instanceof Error ? error.message : '';
      if (errorMessage.toLowerCase().includes('already exists')) {
        setNameError(errorMessage);
      } else {
        setLocalError(
          error instanceof Error
            ? error.message
            : isEnglish
              ? 'Unable to save child profile.'
              : 'Không thể lưu hồ sơ của bé.',
        );
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddNew = () => {
    setEditingChildId(null);
    setName('');
    setAge('6');
    setLearningGoal('');
    setInitialChildUsername('');
    setChildPassword('');
    setLocalError(null);
    setNameError(''); // Clear name error
    setIsProfileFormOpen(true);
  };

  const handleSelectChild = (childId: string) => {
    if (onSelectChild) {
      onSelectChild(childId);
    }
  };

  const handleToggleExpand = async (childId: string) => {
    if (expandedChildId === childId) {
      // Collapse
      setExpandedChildId(null);
    } else {
      // Expand + select
      setExpandedChildId(childId);
      const asyncLoads: Promise<void>[] = [];

      if (onFetchSessionHistory && !childSessionHistory[childId]) {
        asyncLoads.push((async () => {
          setLoadingSessionHistory((prev) => ({ ...prev, [childId]: true }));
          try {
            const sessions = await onFetchSessionHistory(childId);
            setChildSessionHistory((prev) => ({ ...prev, [childId]: sessions }));
          } catch {
            setChildSessionHistory((prev) => ({ ...prev, [childId]: [] }));
          } finally {
            setLoadingSessionHistory((prev) => ({ ...prev, [childId]: false }));
          }
        })());
      }

      if (asyncLoads.length > 0) {
        await Promise.all(asyncLoads);
      }
    }
  };

  const handleDeleteChild = async (child: ChildProfile) => {
    setPendingDeleteChild(child);
  };

  const handleEditChild = async (child: ChildProfile) => {
    setEditingChildId(child.id);
    setName(child.name);
    setAge(String(child.age));
    setLearningGoal(child.learningGoal || '');
    setChildPassword('');
    setLocalError(null);
    const suggestedUsername = makeChildUsername(child.name);
    setInitialChildUsername(suggestedUsername);
    try {
      const response = await fetch(`/api/child-auth/credentials/${child.id}`, { credentials: 'include' });
      const payload = await response.json().catch(() => ({}));
      if (response.ok && payload?.credential?.username) {
        setInitialChildUsername(payload.credential.username);
      }
    } catch {
      // The profile can still be edited; a new login can be supplied in the same form.
    }
    setIsProfileFormOpen(true);
  };

  const confirmDeleteChild = async () => {
    const child = pendingDeleteChild;
    if (!child || !onDeleteChild) return;

    setDeleteError(null);
    setDeletingIds((prev) => new Set(prev).add(child.id));
    try {
      await onDeleteChild(child.id);
      setPendingDeleteChild(null);
    } catch (error) {
      setDeleteError(
        error instanceof Error
          ? error.message
          : isEnglish
            ? `Failed to delete ${child.name}.`
            : `Không thể xóa bé ${child.name}.`,
      );
    } finally {
      setDeletingIds((prev) => {
        const next = new Set(prev);
        next.delete(child.id);
        return next;
      });
    }
  };

  const handleAvatarClick = (childId: string) => {
    if (!onUploadAvatar) return;
    setPendingUploadChildId(childId);
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !pendingUploadChildId || !onUploadAvatar) return;

    // Reset input so the same file can be re-selected
    e.target.value = '';

    const childId = pendingUploadChildId;
    setPendingUploadChildId(null);

    setUploadingIds((prev) => new Set(prev).add(childId));
    try {
      await onUploadAvatar(childId, file);
    } catch {
      // Silently ignore; callers should surface errors if needed
    } finally {
      setUploadingIds((prev) => {
        const next = new Set(prev);
        next.delete(childId);
        return next;
      });
    }
  };

  const rankedChildren = [...children].sort((left, right) => {
    const xpDiff = (right.experiencePoints ?? 0) - (left.experiencePoints ?? 0);
    if (xpDiff !== 0) {
      return xpDiff;
    }

    const mouthDiff = (right.mouthCountTotal ?? 0) - (left.mouthCountTotal ?? 0);
    if (mouthDiff !== 0) {
      return mouthDiff;
    }

    return left.name.localeCompare(right.name);
  });
  const topRankedChild = rankedChildren[0] ?? null;
  const totalChildrenXp = children.reduce(
    (total, child) => total + Math.max(0, Number(child.experiencePoints) || 0),
    0,
  );
  const rankedGameOptions: Array<{ id: RankedGameId; labelEn: string; labelVi: string }> = [
    { id: 'true_false', labelEn: 'True / False', labelVi: 'Đúng / Sai' },
    { id: 'word_chain', labelEn: 'Word Chain', labelVi: 'Nối từ' },
    { id: 'flashcard_match', labelEn: 'Card Match', labelVi: 'Ghép thẻ' },
    { id: 'storytelling', labelEn: 'Storytelling', labelVi: 'Kể chuyện' },
    { id: 'blocks', labelEn: 'Vocabulary Blocks', labelVi: 'Khối từ vựng' },
    { id: 'blast', labelEn: 'Vocabulary Blast', labelVi: 'Bắn bong bóng' },
  ];
  const getRankedGameScore = (records: ChildGameRecords) => {
    if (rankedGameId === 'true_false') return records.trueFalseHighScore;
    if (rankedGameId === 'word_chain') return records.wordChainHighScore;
    if (rankedGameId === 'flashcard_match') return records.flashcardMatchBestTime;
    if (rankedGameId === 'blocks') return records.blocksHighScore;
    if (rankedGameId === 'blast') return records.blastHighScore;
    return records.storiesCompletedCount;
  };
  const rankedGameChildren = children
    .map((child) => ({ child, score: getRankedGameScore(gameRecordsByChild[child.id] || EMPTY_GAME_RECORDS) }))
    .sort((left, right) => {
      if (rankedGameId !== 'flashcard_match') return right.score - left.score;
      if (left.score === 0 && right.score > 0) return 1;
      if (right.score === 0 && left.score > 0) return -1;
      return left.score - right.score;
    });
  const formatRankedGameScore = (score: number) => {
    if (rankedGameId === 'flashcard_match') return score > 0 ? `${score}s` : '---';
    return score > 0 ? String(score) : '---';
  };
  const modePanelMotion = {
    initial: { opacity: 0, y: 18, filter: 'blur(8px)' },
    animate: { opacity: 1, y: 0, filter: 'blur(0px)' },
    exit: { opacity: 0, y: -12, filter: 'blur(6px)' },
    transition: { duration: 0.26, ease: [0.22, 1, 0.36, 1] as const },
  };

  if (!currentUser) {
    return (
      <div
        className={`space-y-4 rounded-[16px] border border-b-4 p-6 shadow-2xl ${isLight ? 'border-[var(--app-border)] bg-transparent text-[var(--app-text)]' : 'border-[var(--app-border)] bg-[var(--app-surface)] text-[var(--app-text)]'}`}
      >
        <div className="flex items-center gap-3">
          <User className="h-8 w-8 text-[#1cb0f6]" />
          <div>
            <h2 className="readable-block text-xl font-bold md:text-2xl">
              {isEnglish
                ? 'Sign in to create a child profile'
                : 'Đăng nhập để tạo hồ sơ cho bé'}
            </h2>
            <p className="text-xs leading-relaxed text-[var(--app-text-muted)]">
              {isEnglish
                ? 'The profile will connect to the backend after a parent signs in.'
                : 'Hồ sơ sẽ được kết nối với backend sau khi phụ huynh đăng nhập.'}
            </p>
          </div>
        </div>
        <div
          className={`rounded-[16px] border p-4 text-sm leading-relaxed ${isLight ? 'border-[var(--app-border)] bg-[var(--app-bg-alt)] text-[var(--app-text-muted)]' : 'border-[var(--app-border)] bg-[var(--app-bg-alt)] text-[var(--app-text-muted)]'}`}
        >
          {isEnglish
            ? 'Child profile and missions are loaded from the backend after authentication.'
            : 'Hồ sơ và nhiệm vụ của bé sẽ được tải từ backend sau khi đăng nhập.'}
        </div>
      </div>
    );
  }

  return (
    <div
      className={`space-y-6 rounded-[16px] border border-b-4 p-6 shadow-2xl ${isLight ? 'border-[var(--app-border)] bg-transparent text-[var(--app-text)]' : 'border-[var(--app-border)] bg-[var(--app-surface)] text-[var(--app-text)]'}`}
    >
      {/* Hidden file input for avatar upload */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => void handleFileChange(e)}
        aria-hidden="true"
      />

      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex items-center gap-3">
          <span className={`text-sm font-bold uppercase tracking-wider ${isLight ? 'text-slate-500' : 'text-[var(--app-text-muted)]'}`}>
            {isEnglish ? 'Profile mode:' : 'Chế độ hồ sơ:'}
          </span>
          <div
            className={`rounded-[16px] p-1.5 border flex gap-1.5 shadow-lg ${isLight ? 'bg-slate-100 border-gray-200' : 'bg-[var(--app-bg-alt)] border-[var(--app-border)]'}`}
          >
            <button
              type="button"
              onClick={() => setProfileViewMode('profile')}
              className={`px-4 py-2 text-xs font-black uppercase rounded-[12px] transition-all cursor-pointer ${profileViewMode === 'profile'
                ? 'bg-[#1cb0f6] text-white shadow-md scale-105'
                : isLight
                  ? 'text-gray-500 hover:text-gray-800'
                  : 'text-[var(--app-text-muted)] hover:text-[var(--app-text)]'
                }`}
            >
              {isEnglish ? 'Profile' : 'Hồ sơ'}
            </button>
            <button
              type="button"
              onClick={() => setProfileViewMode('reports')}
              className={`px-4 py-2 text-xs font-black uppercase rounded-[12px] transition-all cursor-pointer ${profileViewMode === 'reports'
                ? 'bg-[#1cb0f6] text-white shadow-md scale-105'
                : isLight
                  ? 'text-gray-500 hover:text-gray-800'
                  : 'text-[var(--app-text-muted)] hover:text-[var(--app-text)]'
                }`}
            >
              {isEnglish ? 'Reports' : 'Báo cáo'}
            </button>
            <button
              type="button"
              onClick={() => setProfileViewMode('ranking')}
              className={`px-4 py-2 text-xs font-black uppercase rounded-[12px] transition-all cursor-pointer ${profileViewMode === 'ranking'
                ? 'bg-[#df52ff] text-white shadow-md scale-105'
                : isLight
                  ? 'text-gray-500 hover:text-gray-800'
                  : 'text-[var(--app-text-muted)] hover:text-[var(--app-text)]'
                }`}
            >
              {isEnglish ? 'Ranking' : 'Xếp hạng'}
            </button>
          </div>
        </div>

        {topRankedChild && (
          <div className={`flex items-center gap-3 rounded-[16px] border px-4 py-3 ${isLight ? 'border-amber-200 bg-transparent' : 'border-amber-900/40 bg-amber-950/20'}`}>
            <div className="text-2xl">🏆</div>
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-500">
                {isEnglish ? 'Current leader' : 'Dẫn đầu hiện tại'}
              </div>
              <div className="text-sm font-black text-[var(--app-text)]">
                {topRankedChild.name} • {topRankedChild.experiencePoints ?? 0} XP
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Children list section ─────────────────────────────────────────── */}
      <AnimatePresence initial={false}>
        {profileViewMode === 'profile' && (
          <motion.section
            key="profile-children"
            {...modePanelMotion}
            className={`space-y-3 rounded-[16px] border border-b-4 p-5 ${isLight ? 'border-[var(--app-border)] bg-transparent' : 'border-[var(--app-border)] bg-[var(--app-bg-alt)]'}`}
          >
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-base font-bold text-[var(--app-text)]">
                {isEnglish ? 'Children' : 'Danh sách bé'}
              </h3>
              <button
                type="button"
                onClick={handleAddNew}
                className={`flex min-h-[40px] items-center gap-1.5 rounded-[10px] border px-3 py-1.5 text-xs font-bold transition ${isLight ? 'border-sky-300 bg-sky-50 text-sky-700 hover:bg-sky-100' : 'border-[#1cb0f6]/50 bg-[#1cb0f6]/15 text-sky-300 hover:bg-[#1cb0f6]/25'}`}
                aria-label={isEnglish ? 'Add new child' : 'Thêm bé mới'}
              >
                <Plus className="h-3.5 w-3.5" />
                {isEnglish ? 'Add child' : 'Thêm bé mới'}
              </button>
            </div>

            {/* Delete error */}
            {deleteError && (
              <div className="rounded-[12px] border border-red-900 bg-red-950/30 p-2.5 text-xs font-semibold text-red-300">
                {deleteError}
              </div>
            )}

            {children.length === 0 ? (
              <div
                className={`rounded-[12px] border p-4 text-center text-sm ${isLight ? 'border-[var(--app-border)] bg-[var(--app-surface)] text-[var(--app-text-muted)]' : 'border-[var(--app-border)] bg-[var(--app-surface)] text-[var(--app-text-muted)]'}`}
              >
                {isEnglish
                  ? 'No children yet. Add one below.'
                  : 'Chưa có bé nào. Hãy thêm bé ở bên dưới.'}
              </div>
            ) : (
              <motion.div layout className="space-y-2">
                {children.map((child) => {
                  const isExpanded = expandedChildId === child.id;
                  const sessions = childSessionHistory[child.id] ?? [];
                  const isFetchingSessions = loadingSessionHistory[child.id] ?? false;
                  const childRank =
                    rankedChildren.findIndex((rankedChild) => rankedChild.id === child.id) + 1;
                  return (
                    <motion.div
                      key={child.id}
                      layout
                      transition={{ layout: { duration: 0.3, ease: [0.22, 1, 0.36, 1] } }}
                    >
                      <ChildCard
                        child={child}
                        isActive={child.id === currentChild?.id}
                        isEnglish={isEnglish}
                        isLight={isLight}
                        isExpanded={isExpanded}
                        onSelect={() => {
                          handleSelectChild(child.id);
                          void handleToggleExpand(child.id);
                        }}
                        onDelete={onDeleteChild ? () => handleDeleteChild(child) : undefined}
                        onAvatarClick={
                          onUploadAvatar ? () => handleAvatarClick(child.id) : undefined
                        }
                        isUploading={uploadingIds.has(child.id)}
                        isDeleting={deletingIds.has(child.id)}
                      />

                      {/* Expanded detail panel */}
                      <AnimatePresence>
                        {isExpanded && (
                          <motion.div
                            key={`expand-${child.id}`}
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            layout
                            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                            className="overflow-hidden"
                          >
                            <div
                              className={`mt-1 space-y-4 rounded-[14px] border border-b-4 p-4 ${isLight ? 'border-[var(--app-border)] bg-transparent' : 'border-[var(--app-border)] bg-[var(--app-surface)]'}`}
                            >
                              {/* Child detail info (read-only) */}
                              <div className="space-y-3">
                                <div className="flex items-center justify-between gap-2">
                                  <h4 className="text-xs font-bold uppercase text-[var(--app-text-muted)]">
                                    {isEnglish ? 'Profile details' : 'Thông tin chi tiết'}
                                  </h4>
                                  <button
                                    type="button"
                                    onClick={() => void handleEditChild(child)}
                                    className={`flex min-h-[40px] items-center gap-1.5 rounded-lg border px-3 text-[10px] font-black uppercase transition ${isLight ? 'border-sky-300 bg-sky-50 text-sky-700 hover:bg-sky-100' : 'border-[#1cb0f6]/50 bg-[#1cb0f6]/15 text-sky-300 hover:bg-[#1cb0f6]/25'}`}
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                    {isEnglish ? 'Edit' : 'Chỉnh sửa'}
                                  </button>
                                </div>
                                <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                                  <div className={`flex flex-col gap-0.5 rounded-[10px] border p-2.5 ${isLight ? 'border-[var(--app-border)] bg-transparent' : 'border-[var(--app-border)] bg-[var(--app-bg-alt)]'}`}>
                                    <span className="font-bold uppercase text-[var(--app-text-muted)]">{isEnglish ? 'Age' : 'Tuổi'}</span>
                                    <span className="font-mono font-semibold text-[var(--app-text)]">{child.age}</span>
                                  </div>
                                  <div className={`flex flex-col gap-0.5 rounded-[10px] border p-2.5 ${isLight ? 'border-[var(--app-border)] bg-transparent' : 'border-[var(--app-border)] bg-[var(--app-bg-alt)]'}`}>
                                    <span className="font-bold uppercase text-[var(--app-text-muted)]">{isEnglish ? 'Level' : 'Cấp độ'}</span>
                                    <span className="font-mono font-semibold text-amber-400">{child.level}</span>
                                  </div>
                                  <div className={`flex flex-col gap-0.5 rounded-[10px] border p-2.5 ${isLight ? 'border-[var(--app-border)] bg-transparent' : 'border-[var(--app-border)] bg-[var(--app-bg-alt)]'}`}>
                                    <span className="font-bold uppercase text-[var(--app-text-muted)]">{isEnglish ? 'Streak' : 'Chuỗi ngày'}</span>
                                    <span className="font-mono font-semibold text-[#ff9600]">{child.streakDays}🔥</span>
                                  </div>
                                  <div className={`flex flex-col gap-0.5 rounded-[10px] border p-2.5 ${isLight ? 'border-[var(--app-border)] bg-transparent' : 'border-[var(--app-border)] bg-[var(--app-bg-alt)]'}`}>
                                    <span className="font-bold uppercase text-[var(--app-text-muted)]">{isEnglish ? 'Sessions' : 'Buổi học'}</span>
                                    <span className="font-mono font-semibold text-[#1cb0f6]">{child.sessionsCompleted}</span>
                                  </div>
                                  <div className={`flex flex-col gap-0.5 rounded-[10px] border p-2.5 ${isLight ? 'border-[var(--app-border)] bg-transparent' : 'border-[var(--app-border)] bg-[var(--app-bg-alt)]'}`}>
                                    <span className="font-bold uppercase text-[var(--app-text-muted)]">{isEnglish ? 'Rank' : 'Hạng'}</span>
                                    <span className="font-mono font-semibold text-[#df52ff]">#{childRank}</span>
                                  </div>
                                  <div className={`flex flex-col gap-0.5 rounded-[10px] border p-2.5 ${isLight ? 'border-[var(--app-border)] bg-transparent' : 'border-[var(--app-border)] bg-[var(--app-bg-alt)]'}`}>
                                    <span className="font-bold uppercase text-[var(--app-text-muted)]">XP</span>
                                    <span className="font-mono font-semibold text-[#58cc02]">{child.experiencePoints ?? 0}</span>
                                  </div>
                                  <div className={`flex flex-col gap-0.5 rounded-[10px] border p-2.5 ${isLight ? 'border-[var(--app-border)] bg-transparent' : 'border-[var(--app-border)] bg-[var(--app-bg-alt)]'}`}>
                                    <span className="font-bold uppercase text-[var(--app-text-muted)]">{isEnglish ? 'Mouth opens' : 'Số lần nói'}</span>
                                    <span className="font-mono font-semibold text-amber-400">{child.mouthCountTotal ?? 0}</span>
                                  </div>
                                </div>
                                {child.learningGoal && (
                                  <div className={`rounded-[10px] border p-2.5 text-xs ${isLight ? 'border-[var(--app-border)] bg-transparent text-[var(--app-text)]' : 'border-[var(--app-border)] bg-[var(--app-bg-alt)] text-[var(--app-text-muted)]'}`}>
                                    <span className="font-bold uppercase text-[var(--app-text-muted)]">{isEnglish ? 'Goal: ' : 'Mục tiêu: '}</span>
                                    {child.learningGoal}
                                  </div>
                                )}
                                <StreakCalendar child={child} isLight={isLight} isEnglish={isEnglish} />
                              </div>

                              <div className="space-y-2">
                                <div className="flex items-center gap-1.5">
                                  <Calendar className="h-4 w-4 text-[#1cb0f6]" />
                                  <h4 className="text-xs font-bold uppercase text-[var(--app-text-muted)]">
                                    {isEnglish ? 'Recent sessions' : 'Phiên học gần đây'}
                                  </h4>
                                </div>

                                {isFetchingSessions ? (
                                  <div className="flex items-center justify-center py-4">
                                    <span className="h-5 w-5 animate-spin rounded-full border-2 border-[#1cb0f6] border-t-transparent" />
                                  </div>
                                ) : sessions.length === 0 ? (
                                  <div className={`rounded-[10px] border p-3 text-center text-xs ${isLight ? 'border-[var(--app-border)] bg-[var(--app-bg-alt)] text-[var(--app-text-muted)]' : 'border-[var(--app-border)] bg-[var(--app-bg-alt)] text-[var(--app-text-muted)]'}`}>
                                    {isEnglish ? 'No session history yet.' : 'Chưa có lịch sử phiên học.'}
                                  </div>
                                ) : (
                                  <div className="space-y-2">
                                    {sessions.map((session) => {
                                      const transcriptPreview = session.conversationTranscript?.find((message) => message.role === 'user')?.content;
                                      const sessionDate = session.endedAt || session.startedAt;
                                      return (
                                        <div
                                          key={session.id}
                                          className={`rounded-[12px] border p-3 ${isLight ? 'border-[var(--app-border)] bg-[var(--app-bg-alt)]' : 'border-[var(--app-border)] bg-[var(--app-bg-alt)]'}`}
                                        >
                                          <div className="flex items-start justify-between gap-3">
                                            <div className="space-y-1">
                                              <div className="text-xs font-black text-[var(--app-text)]">
                                                {session.summary || (isEnglish ? 'Speaking practice session' : 'Phiên luyện nói')}
                                              </div>
                                              <div className="text-[10px] font-bold uppercase text-[var(--app-text-muted)]">
                                                {sessionDate
                                                  ? new Date(sessionDate).toLocaleString(isEnglish ? 'en-US' : 'vi-VN')
                                                  : child.lastSessionAt}
                                              </div>
                                            </div>
                                            <span className={`rounded-full px-2 py-1 text-[9px] font-black uppercase ${session.status === 'completed'
                                              ? 'bg-[#58cc02]/15 text-[#58cc02]'
                                              : 'bg-[#ff9600]/15 text-[#ff9600]'
                                              }`}>
                                              {session.status}
                                            </span>
                                          </div>

                                          <div className="mt-2 flex flex-wrap gap-2 text-[10px] font-bold uppercase text-[var(--app-text-muted)]">
                                            <span>{isEnglish ? 'Turns' : 'Lượt'}: {session.turnCount || 0}</span>
                                            {session.overallScore && (
                                              <span>{isEnglish ? 'Score' : 'Điểm'}: {session.overallScore}</span>
                                            )}
                                          </div>

                                          {transcriptPreview && (
                                            <div className={`mt-2 rounded-[10px] border px-2.5 py-2 text-xs ${isLight ? 'border-[var(--app-border)] bg-white text-[var(--app-text)]' : 'border-[var(--app-border)] bg-[var(--app-surface)] text-[var(--app-text)]'}`}>
                                              <span className="font-bold text-[var(--app-text-muted)]">{isEnglish ? 'Child said: ' : 'Bé đã nói: '}</span>
                                              <span className="italic">"{transcriptPreview}"</span>
                                            </div>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>

                              {/* Collapse button */}
                              <button
                                type="button"
                                onClick={() => setExpandedChildId(null)}
                                className={`flex w-full items-center justify-center gap-1.5 rounded-[10px] border py-2 text-xs font-bold transition ${isLight ? 'border-[var(--app-border)] bg-[var(--app-bg-alt)] text-[var(--app-text-muted)] hover:bg-[var(--app-border)]' : 'border-[var(--app-border)] bg-[var(--app-bg-alt)] text-[var(--app-text-muted)] hover:bg-[var(--app-border)]'}`}
                              >
                                <ChevronUp className="h-3.5 w-3.5" />
                                {isEnglish ? 'Collapse' : 'Thu gọn'}
                              </button>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  );
                })}
              </motion.div>
            )}
          </motion.section>
        )}
      </AnimatePresence>
      {/* ── End children list ─────────────────────────────────────────────── */}

      <AnimatePresence initial={false}>
        {profileViewMode === 'ranking' && (
          <motion.section
            key="profile-ranking"
            {...modePanelMotion}
            className={`space-y-5 overflow-hidden rounded-[24px] border border-b-4 p-0 ${isLight ? 'border-[var(--app-border)] bg-[var(--app-surface)]' : 'border-[var(--app-border)] bg-[var(--app-surface)]'}`}
          >
            <div className={`px-6 pt-6 pb-4 text-center ${isLight ? 'bg-white' : 'bg-[var(--app-surface)]'}`}>
              <div className="text-[11px] font-black uppercase tracking-[0.25em] text-[#ff4b2b]">
                {isEnglish ? 'Leaderboard' : 'Bảng xếp hạng'}
              </div>
              <h3 className="mt-2 text-3xl font-black tracking-tight text-[var(--app-text)]">
                {isEnglish ? 'Total XP earned by the kids' : 'Tổng kinh nghiệm các bé đã đạt'}
              </h3>
              <div className="mt-4 inline-block">
                <div className="rounded-[24px] bg-[linear-gradient(145deg,#FF416C_0%,#FF4B2B_100%)] px-10 py-4 text-white shadow-[0_16px_48px_rgba(255,65,108,0.32)]">
                  <div className="text-[10px] font-black uppercase tracking-[0.28em] text-white/75">
                    {isEnglish ? 'Total experience' : 'Tổng kinh nghiệm'}
                  </div>
                  <div className="text-5xl font-black leading-none">
                    {String(totalChildrenXp).padStart(2, '0')}
                  </div>
                  <div className="mt-1 text-sm font-extrabold text-white/85">
                    XP
                  </div>
                </div>
              </div>
            </div>

            <div className="relative overflow-hidden bg-[linear-gradient(145deg,#FF6B9D_0%,#FF3366_100%)] px-6 py-8">
              <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.3),transparent_70%)]" />
              <div className="relative mx-auto flex max-w-5xl flex-col items-center">
                <div className="grid w-full gap-3 md:grid-cols-3">
                  {rankedChildren.map((child, index) => (
                    <motion.div
                      key={`rank-${child.id}`}
                      layout
                      transition={{ layout: { duration: 0.28, ease: [0.22, 1, 0.36, 1] } }}
                      className={`rounded-[22px] border border-white/50 bg-white/95 p-4 shadow-[0_16px_30px_rgba(0,0,0,0.12)] ${child.id === currentChild?.id ? 'ring-2 ring-[#1cb0f6]/50' : ''
                        }`}
                    >
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-full border-2 border-[#ffc800] bg-[#fff4d6] text-xl">
                            {child.avatarUrl ? (
                              <img src={child.avatarUrl} alt={child.name} className="h-full w-full object-cover" />
                            ) : (
                              <span>🧒</span>
                            )}
                          </div>
                          <div>
                            <div className="text-sm font-black text-slate-900">{child.name}</div>
                            <div className={`font-black uppercase tracking-[0.12em] ${index === 0
                              ? 'text-base text-[#d99b00]'
                              : index === 1
                                ? 'text-[15px] text-slate-500'
                                : index === 2
                                  ? 'text-sm text-[#a85d25]'
                                  : 'text-[11px] tracking-[0.18em] text-slate-500'}`}
                            >
                              {isEnglish ? 'Rank' : 'Hạng'} #{index + 1}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {index < 3 && (
                            <div
                              className={`flex h-9 w-9 items-center justify-center rounded-full border bg-white shadow-sm ${index === 0
                                ? 'border-yellow-300 text-[#e5a900]'
                                : index === 1
                                  ? 'border-slate-300 text-slate-400'
                                  : 'border-orange-300 text-[#b66a2c]'}`}
                              title={`Top ${index + 1}`}
                            >
                              <Trophy className="h-5 w-5 fill-current" />
                            </div>
                          )}
                          <div className="rounded-full bg-[#58cc02]/15 px-3 py-1 text-[11px] font-black text-[#58cc02]">
                            {child.experiencePoints ?? 0} XP
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-xs text-slate-500">
                        <span>{isEnglish ? 'Mouth opens' : 'Số lần nói'}</span>
                        <span className="font-mono font-black text-amber-500">{child.mouthCountTotal ?? 0}</span>
                      </div>

                      {child.lastSessionEarnedXp ? (
                        <div className="mt-2 rounded-[14px] bg-[#fff5f0] px-3 py-2 text-[11px] font-bold text-[#ff4b2b]">
                          {isEnglish ? 'Latest session reward' : 'Phần thưởng phiên gần nhất'}: +{child.lastSessionEarnedXp} XP
                        </div>
                      ) : null}
                    </motion.div>
                  ))}
                </div>
              </div>
            </div>

            <div className={`border-t px-4 py-5 sm:px-6 sm:py-6 ${isLight ? 'border-slate-200 bg-white' : 'border-[var(--app-border)] bg-[var(--app-surface)]'
              }`}>
              <div className="mx-auto max-w-5xl">
                <div className="mb-4 flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-amber-500/15 text-amber-500">
                    <Gamepad2 className="h-5 w-5" />
                  </div>
                  <div>
                    <h4 className="text-base font-black text-[var(--app-text)]">
                      {isEnglish ? 'Game leaderboards' : 'Xếp hạng trò chơi'}
                    </h4>
                    <p className="text-[11px] font-bold text-[var(--app-text-muted)]">
                      {isEnglish ? 'Achievements for each game' : 'Thành tích riêng của từng trò chơi'}
                    </p>
                  </div>
                </div>

                <div className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar" role="tablist">
                  {rankedGameOptions.map((game) => (
                    <button
                      key={game.id}
                      type="button"
                      role="tab"
                      aria-selected={rankedGameId === game.id}
                      onClick={() => setRankedGameId(game.id)}
                      className={`min-h-[40px] shrink-0 rounded-[10px] border px-3 text-[11px] font-black transition ${rankedGameId === game.id
                        ? 'border-amber-500 bg-amber-500 text-white shadow-sm'
                        : isLight
                          ? 'border-slate-200 bg-slate-50 text-slate-700 hover:border-amber-300'
                          : 'border-[var(--app-border)] bg-[var(--app-bg-alt)] text-[var(--app-text-muted)] hover:border-amber-500/60'
                        }`}
                    >
                      {isEnglish ? game.labelEn : game.labelVi}
                    </button>
                  ))}
                </div>

                {isGameRankingLoading ? (
                  <div className="flex min-h-32 items-center justify-center text-xs font-bold text-[var(--app-text-muted)]">
                    {isEnglish ? 'Loading game records...' : 'Đang tải thành tích trò chơi...'}
                  </div>
                ) : (
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {rankedGameChildren.map(({ child, score }, index) => (
                      <div
                        key={`${rankedGameId}-${child.id}`}
                        className={`flex min-h-[64px] items-center justify-between gap-3 rounded-[12px] border px-3 py-2.5 ${child.id === currentChild?.id
                          ? 'border-sky-400 bg-sky-500/10 ring-1 ring-sky-400/20'
                          : isLight
                            ? 'border-slate-200 bg-slate-50'
                            : 'border-[var(--app-border)] bg-[var(--app-bg-alt)]'
                          }`}
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-black ${index === 0 && score > 0 ? 'bg-amber-500 text-white' : 'bg-slate-500/15 text-[var(--app-text-muted)]'
                            }`}>
                            {index === 0 && score > 0 ? <Trophy className="h-4 w-4" /> : `#${index + 1}`}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-black text-[var(--app-text)]">{child.name}</p>
                            <p className="text-[10px] font-bold text-[var(--app-text-muted)]">
                              {score === 0
                                ? (isEnglish ? 'Not played yet' : 'Chưa có lượt chơi')
                                : index === 0
                                  ? (isEnglish ? 'Leading' : 'Đang dẫn đầu')
                                  : (isEnglish ? `Rank #${index + 1}` : `Hạng #${index + 1}`)}
                            </p>
                          </div>
                        </div>
                        <div className="shrink-0 rounded-full bg-amber-500/15 px-3 py-1 text-xs font-black text-amber-600 dark:text-amber-400">
                          {formatRankedGameScore(score)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </motion.section>
        )}

        {profileViewMode === 'reports' && (
          <motion.section
            key="profile-reports"
            {...modePanelMotion}
            className={`space-y-6 rounded-[24px] border border-b-4 p-6 shadow-2xl ${isLight ? 'border-[var(--app-border)] bg-[var(--app-surface)]' : 'border-[var(--app-border)] bg-[var(--app-surface)]'}`}
          >
            {/* Header + Selector */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div>
                <h3 className="text-lg font-black flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-[#1cb0f6]" />
                  <span>{isEnglish ? 'Learning Reports' : 'Báo cáo học tập'}</span>
                </h3>
                <p className="text-xs text-[var(--app-text-muted)] mt-1">
                  {isEnglish ? "Track your child's speaking accomplishments and pronunciation stats." : 'Theo dõi kết quả luyện phát âm và hội thoại của con.'}
                </p>
              </div>

              {children.length > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold opacity-75">{isEnglish ? 'Select Child:' : 'Chọn Bé:'}</span>
                  <select
                    value={selectedChildId}
                    onChange={(e) => {
                      playAppSound(200, 'sine', 0.05);
                      setSelectedChildId(e.target.value);
                    }}
                    className={`text-xs font-bold px-3 py-2 rounded-xl border outline-none cursor-pointer ${isLight ? 'bg-slate-50 border-slate-200 text-slate-800' : 'bg-slate-900 border-white/[0.08] text-white'}`}
                  >
                    {children.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {statsLoading && (
              <div className="h-64 rounded-3xl animate-pulse flex items-center justify-center bg-slate-50/50 dark:bg-black/10 border border-slate-100 dark:border-white/[0.05]">
                <span className="text-xs font-bold opacity-60">{isEnglish ? 'Loading reports...' : 'Đang tải báo cáo...'}</span>
              </div>
            )}

            {statsError && (
              <p className="text-xs font-bold text-red-500 bg-red-500/10 p-3 rounded-xl">{statsError}</p>
            )}

            {!statsLoading && !statsError && statsData && (
              <>
                {/* Metric Summary Cards */}
                <div className="grid grid-cols-3 gap-3 md:gap-4">
                  <div className={`p-4 rounded-2xl border ${isLight ? 'bg-indigo-50/55 border-indigo-100 text-indigo-950' : 'bg-indigo-950/20 border-indigo-900/50 text-indigo-100'}`}>
                    <span className="text-[10px] font-black opacity-60 block">{isEnglish ? 'Total Sessions' : 'Tổng phiên học'}</span>
                    <span className="text-xl md:text-2xl font-black mt-1 block">{statsData.totalSessions}</span>
                  </div>
                  <div className={`p-4 rounded-2xl border ${isLight ? 'bg-purple-50/55 border-purple-100 text-purple-950' : 'bg-purple-950/20 border-purple-900/50 text-purple-100'}`}>
                    <span className="text-[10px] font-black opacity-60 block">{isEnglish ? 'Total Utterances' : 'Tổng số câu nói'}</span>
                    <span className="text-xl md:text-2xl font-black mt-1 block">{statsData.totalTurns}</span>
                  </div>
                  <div className={`p-4 rounded-2xl border ${isLight ? 'bg-amber-50/55 border-amber-100 text-amber-955' : 'bg-amber-950/20 border-amber-900/50 text-amber-100'}`}>
                    <span className="text-[10px] font-black opacity-60 block">{isEnglish ? 'Average Score' : 'Điểm phát âm TB'}</span>
                    <span className="text-xl md:text-2xl font-black mt-1 block">{statsData.averageScore.toFixed(1)}</span>
                  </div>
                </div>

                {/* Charts Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* SVG Bar Chart */}
                  <div className={`p-5 rounded-3xl border ${isLight ? 'bg-white border-slate-200' : 'bg-slate-900 border-white/[0.08]'}`}>
                    <h3 className="text-xs font-black uppercase tracking-wider mb-4 flex items-center gap-1.5 text-rose-500">
                      <TrendingUp className="w-4 h-4" />
                      {isEnglish ? 'Utterances per Day' : 'Số câu nói mỗi ngày'}
                    </h3>
                    {statsData.dailyStats.length === 0 ? (
                      <div className="h-44 flex items-center justify-center opacity-65 text-xs">
                        {isEnglish ? 'No active sessions yet.' : 'Chưa có hoạt động nào.'}
                      </div>
                    ) : (
                      <div className="w-full h-48">
                        <svg viewBox="0 0 400 200" className="w-full h-full">
                          <line x1="30" y1="20" x2="380" y2="20" stroke="rgba(128,128,128,0.15)" strokeWidth="1" />
                          <line x1="30" y1="65" x2="380" y2="65" stroke="rgba(128,128,128,0.15)" strokeWidth="1" />
                          <line x1="30" y1="110" x2="380" y2="110" stroke="rgba(128,128,128,0.15)" strokeWidth="1" />
                          <line x1="30" y1="155" x2="380" y2="155" stroke="rgba(128,128,128,0.15)" strokeWidth="1" />

                          {(() => {
                            const items = [...statsData.dailyStats].slice(0, 7).reverse();
                            const maxVal = Math.max(...items.map(x => x.turns), 5);
                            const barWidth = 26;
                            const gap = (350 - (items.length * barWidth)) / (items.length + 1);

                            return items.map((item, idx) => {
                              const val = item.turns;
                              const pct = val / maxVal;
                              const barHeight = pct * 135;
                              const x = 30 + gap + idx * (barWidth + gap);
                              const y = 155 - barHeight;

                              return (
                                <g key={`rep-bar-${idx}`}>
                                  <rect
                                    x={x}
                                    y={y}
                                    width={barWidth}
                                    height={barHeight}
                                    rx="3"
                                    fill="url(#rep-turns-grad)"
                                    className="transition-all duration-300 hover:opacity-80"
                                  />
                                  <text x={x + barWidth / 2} y={y - 6} textAnchor="middle" fontSize="9" fontWeight="bold" fill={isLight ? '#334155' : '#e2e8f0'}>
                                    {val}
                                  </text>
                                  <text x={x + barWidth / 2} y="175" textAnchor="middle" fontSize="8" fill={isLight ? '#64748b' : '#94a3b8'}>
                                    {item.date.slice(5)}
                                  </text>
                                </g>
                              );
                            });
                          })()}
                          <defs>
                            <linearGradient id="rep-turns-grad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#3b82f6" />
                              <stop offset="100%" stopColor="#93c5fd" />
                            </linearGradient>
                          </defs>
                        </svg>
                      </div>
                    )}
                  </div>

                  {/* SVG Line Chart */}
                  <div className={`p-5 rounded-3xl border ${isLight ? 'bg-white border-slate-200' : 'bg-slate-900 border-white/[0.08]'}`}>
                    <h3 className="text-xs font-black uppercase tracking-wider mb-4 flex items-center gap-1.5 text-indigo-500">
                      <Award className="w-4 h-4" />
                      {isEnglish ? 'Pronunciation Score Trend' : 'Xu hướng điểm phát âm'}
                    </h3>
                    {statsData.dailyStats.length === 0 ? (
                      <div className="h-44 flex items-center justify-center opacity-65 text-xs">
                        {isEnglish ? 'No active sessions yet.' : 'Chưa có hoạt động nào.'}
                      </div>
                    ) : (
                      <div className="w-full h-48">
                        <svg viewBox="0 0 400 200" className="w-full h-full">
                          <line x1="30" y1="20" x2="380" y2="20" stroke="rgba(128,128,128,0.15)" strokeWidth="1" />
                          <line x1="30" y1="65" x2="380" y2="65" stroke="rgba(128,128,128,0.15)" strokeWidth="1" />
                          <line x1="30" y1="110" x2="380" y2="110" stroke="rgba(128,128,128,0.15)" strokeWidth="1" />
                          <line x1="30" y1="155" x2="380" y2="155" stroke="rgba(128,128,128,0.15)" strokeWidth="1" />

                          {(() => {
                            const items = [...statsData.dailyStats].slice(0, 7).reverse();
                            const maxVal = 200.0;
                            const gap = 350 / (items.length + 1);

                            const coords = items.map((item, idx) => {
                              const val = item.score;
                              const pct = Math.min(1.0, val / maxVal);
                              const y = 155 - pct * 135;
                              const x = 30 + gap + idx * gap;
                              return { x, y, val, date: item.date };
                            });

                            const pathD = coords.reduce((acc, c, idx) => {
                              return acc + (idx === 0 ? `M ${c.x} ${c.y}` : ` L ${c.x} ${c.y}`);
                            }, '');

                            return (
                              <>
                                {pathD && (
                                  <path
                                    d={pathD}
                                    fill="none"
                                    stroke="#8b5cf6"
                                    strokeWidth="2.5"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  />
                                )}
                                {coords.map((c, idx) => (
                                  <g key={`rep-line-pt-${idx}`}>
                                    <circle cx={c.x} cy={c.y} r="4.5" fill="#7c3aed" stroke="#fff" strokeWidth="1.5" />
                                    <text x={c.x} y={c.y - 8} textAnchor="middle" fontSize="9" fontWeight="bold" fill={isLight ? '#334155' : '#e2e8f0'}>
                                      {Math.round(c.val)}
                                    </text>
                                    <text x={c.x} y="175" textAnchor="middle" fontSize="8" fill={isLight ? '#64748b' : '#94a3b8'}>
                                      {c.date.slice(5)}
                                    </text>
                                  </g>
                                ))}
                              </>
                            );
                          })()}
                        </svg>
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </motion.section>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {profileViewMode === 'profile' && isProfileFormOpen && (
          <motion.div
            key="profile-details"
            className="child-profile-overlay fixed inset-0 z-[400] flex items-start justify-center overflow-hidden px-0 pb-[env(safe-area-inset-bottom)] pt-[calc(4.75rem+env(safe-area-inset-top))] backdrop-blur-sm md:items-center md:p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setIsProfileFormOpen(false);
            }}
          >
            <div className="w-full max-w-2xl">
              <motion.section
                role="dialog"
                aria-modal="true"
                aria-labelledby="child-profile-form-title"
                className={`child-profile-dialog max-h-[calc(100dvh-4.75rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))] w-full space-y-4 overflow-y-auto rounded-t-[22px] border p-4 pb-0 shadow-2xl md:max-h-[90vh] md:rounded-[22px] md:p-6 ${isLight ? 'border-slate-200 text-slate-900' : 'border-[var(--app-border)] text-[var(--app-text)]'}`}
                initial={{ scale: 0.96, y: 12 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.96, y: 12 }}
              >
                <div className="flex items-center justify-between gap-3">
                  <h3 id="child-profile-form-title" className="text-lg font-black text-[var(--app-text)]">
                    {editingChildId === null
                      ? isEnglish ? 'Add new child' : 'Thêm bé mới'
                      : isEnglish ? 'Edit child profile' : 'Sửa hồ sơ của bé'}
                  </h3>
                  <button type="button" onClick={() => setIsProfileFormOpen(false)} className={`rounded-full border p-2 transition ${isLight ? 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100' : 'border-[var(--app-border)] bg-[var(--app-bg-alt)] text-gray-200 hover:bg-[var(--app-surface-alt)]'}`} aria-label={isEnglish ? 'Close' : 'Đóng'}><X className="h-5 w-5" /></button>
                </div>

                <form
                  onSubmit={(event) => void handleSubmit(event)}
                  className="space-y-4 pt-2 pb-24 md:pb-0"
                >
                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="space-y-1.5 lg:col-span-2">
                      <label
                        className={`block text-xs font-bold uppercase ${isLight ? 'text-[var(--app-text)]' : 'text-gray-400'}`}
                      >
                        {isEnglish ? 'Child name' : 'Tên bé'}
                      </label>
                      <input
                        type="text"
                        value={name}
                        onChange={(event) => {
                          setName(event.target.value);
                          setNameError(''); // Clear error on change
                        }}
                        onBlur={() => validateChildName(name)} // Validate on blur
                        name="child-profile-name"
                        autoComplete="off"
                        autoCapitalize="words"
                        spellCheck={false}
                        required
                        className={`w-full rounded-[12px] border px-4 py-3 text-sm font-semibold transition focus:border-[#1cb0f6] focus:outline-none ${
                          nameError 
                            ? 'border-red-500 focus:border-red-500' 
                            : isLight ? 'border-[var(--app-border)] bg-white text-[var(--app-text)] hover:border-slate-300' : 'border-[var(--app-border)] bg-[var(--app-surface)] text-[var(--app-text)] hover:border-gray-500'
                        }`}
                        placeholder={
                          isEnglish
                            ? 'Example: Bao Bao, Lisa, Tony'
                            : 'Ví dụ: Bảo Bảo, Lisa, Tony'
                        }
                      />
                      {nameError && (
                        <p className="text-xs text-red-500 mt-1 font-semibold">{nameError}</p>
                      )}
                    </div>

                    <div className="space-y-1.5 lg:col-span-2">
                      <label className={`block text-xs font-bold uppercase ${isLight ? 'text-[var(--app-text)]' : 'text-gray-400'}`}>
                        {editingChildId === null
                          ? isEnglish ? 'Password' : 'Mật khẩu'
                          : isEnglish ? 'New password' : 'Mật khẩu mới'}
                      </label>
                      <input
                        type="password"
                        value={childPassword}
                        onChange={(event) => setChildPassword(event.target.value)}
                        minLength={6}
                        maxLength={72}
                        required={editingChildId === null}
                        autoComplete="new-password"
                        className={`w-full rounded-[12px] border px-4 py-3 text-sm font-semibold normal-case transition focus:border-[#1cb0f6] focus:outline-none ${isLight ? 'border-[var(--app-border)] bg-white text-[var(--app-text)] hover:border-slate-300' : 'border-[var(--app-border)] bg-[var(--app-surface)] text-[var(--app-text)] hover:border-gray-500'}`}
                        placeholder={editingChildId === null
                          ? (isEnglish ? 'At least 6 characters' : 'Ít nhất 6 ký tự')
                          : (isEnglish ? 'Leave blank to keep current password' : 'Để trống nếu không muốn đổi')}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label
                        className={`block text-xs font-bold uppercase ${isLight ? 'text-[var(--app-text)]' : 'text-gray-400'}`}
                      >
                        {isEnglish ? 'Age' : 'Tuổi'}
                      </label>
                      <input
                        type="number"
                        min={3}
                        max={15}
                        value={age}
                        onChange={(event) => setAge(event.target.value)}
                        className={`w-full rounded-[12px] border px-4 py-3 text-sm font-semibold transition focus:border-[#1cb0f6] focus:outline-none ${isLight ? 'border-[var(--app-border)] bg-white text-[var(--app-text)] hover:border-slate-300' : 'border-[var(--app-border)] bg-[var(--app-surface)] text-[var(--app-text)] hover:border-gray-500'}`}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label
                        className={`block text-xs font-bold uppercase ${isLight ? 'text-[var(--app-text)]' : 'text-gray-400'}`}
                      >
                        {isEnglish ? 'Last lesson time' : 'Lần học gần nhất'}
                      </label>
                      <div
                        className={`child-profile-readonly w-full rounded-[12px] border px-4 py-3 text-sm font-semibold ${isLight ? 'border-[var(--app-border)] bg-white text-[var(--app-text-muted)]' : 'border-[var(--app-border)] bg-[var(--app-surface)] text-gray-300'}`}
                      >
                        {currentChild?.lastSessionAt || (isEnglish ? 'Not available yet' : 'Chưa có')}
                      </div>
                    </div>

                    <div className="space-y-1.5 lg:col-span-2">
                      <label
                        className={`block text-xs font-bold uppercase ${isLight ? 'text-[var(--app-text)]' : 'text-gray-400'}`}
                      >
                        {isEnglish ? 'Learning goal' : 'Mục tiêu học tập'}
                      </label>
                      <textarea
                        value={learningGoal}
                        onChange={(event) => setLearningGoal(event.target.value)}
                        rows={5}
                        className={`w-full resize-none rounded-[12px] border px-4 py-3 text-sm font-semibold transition focus:border-[#1cb0f6] focus:outline-none ${isLight ? 'border-[var(--app-border)] bg-white text-[var(--app-text)] hover:border-slate-300' : 'border-[var(--app-border)] bg-[var(--app-surface)] text-[var(--app-text)] hover:border-gray-500'}`}
                        placeholder={
                          isEnglish
                            ? 'A short daily English session to keep momentum.'
                            : 'Mỗi ngày một buổi học ngắn để giữ nhịp học.'
                        }
                      />
                    </div>
                  </div>

                  {(localError || errorMessage) && (
                    <div className={`rounded-[12px] border p-2.5 text-xs font-semibold ${isLight ? 'border-red-200 bg-red-50 text-red-700' : 'border-red-800 bg-red-950/40 text-red-200'}`}>
                      {localError || errorMessage}
                    </div>
                  )}

                  <div className={`child-profile-actions sticky bottom-0 z-10 -mx-4 flex flex-col gap-3 border-t px-4 py-3 shadow-[0_-8px_20px_rgba(0,0,0,0.08)] sm:flex-row sm:items-center sm:justify-between md:static md:mx-0 md:border-t-0 md:bg-transparent md:px-0 md:py-1 md:shadow-none ${isLight ? 'border-slate-200' : 'border-[var(--app-border)]'
                    }`}>
                    <div
                      className={`flex items-center gap-1 font-mono text-xs ${isLight ? 'text-[var(--app-text-muted)]' : 'text-gray-500'}`}
                    >
                      <Shield
                        className={`h-3.5 w-3.5 ${isLight ? 'text-[var(--app-text-muted)]' : 'text-gray-500'}`}
                      />
                      {isLoading
                        ? isEnglish
                          ? 'Syncing...'
                          : 'Đang đồng bộ...'
                        : isEnglish
                          ? 'Data is saved.'
                          : 'Dữ liệu đã được lưu.'}
                    </div>

                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setIsProfileFormOpen(false)}
                        className={`min-h-[56px] rounded-[12px] border px-4 py-2.5 text-xs font-extrabold uppercase transition active:scale-95 ${isLight ? 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100' : 'border-slate-600 bg-slate-800 text-slate-100 hover:bg-slate-700'}`}
                      >
                        {isEnglish ? 'Cancel' : 'Hủy'}
                      </button>
                      <button
                        type="submit"
                        disabled={isSubmitting}
                        className="duo-btn-green min-h-[56px] rounded-[12px] px-6 py-2.5 text-xs font-extrabold uppercase text-white disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {isSubmitting
                          ? isEnglish
                            ? 'Saving...'
                            : 'Đang lưu...'
                          : editingChildId === null
                            ? isEnglish ? 'Add child' : 'Thêm bé'
                            : isEnglish
                              ? 'Save changes'
                              : 'Lưu thay đổi'}
                      </button>
                    </div>
                  </div>

                  <AnimatePresence>
                    {isSaved && (
                      <motion.div
                        initial={{ opacity: 0, y: -5 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -5 }}
                        className="flex items-center gap-2 rounded-[12px] border border-violet-900 bg-violet-950/20 p-2.5 text-xs font-semibold text-[#df52ff]"
                      >
                        <CheckCircle2 className="h-4 w-4" />
                        {isEnglish
                          ? 'Child profile updated successfully.'
                          : 'Hồ sơ của bé đã được cập nhật thành công.'}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </form>
              </motion.section>
            </div>

          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {pendingDeleteChild && (
          <motion.div className="fixed inset-0 z-[400] flex items-center justify-center bg-slate-950/65 p-4 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div role="alertdialog" aria-modal="true" className="w-full max-w-md rounded-[22px] border border-rose-200 bg-[#fffaf8] p-6 text-slate-900 shadow-2xl" initial={{ scale: 0.96, y: 12 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.96, y: 12 }}>
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-500/15 text-red-500"><Trash2 className="h-6 w-6" /></div>
              <h3 className="text-lg font-black">{isEnglish ? `Delete ${pendingDeleteChild.name}?` : `Xóa bé ${pendingDeleteChild.name}?`}</h3>
              <p className="mt-2 text-sm font-medium text-rose-700">{isEnglish ? 'Learning progress and saved data for this child will be permanently removed.' : 'Tiến độ học và dữ liệu đã lưu của bé sẽ bị xóa vĩnh viễn.'}</p>
              <div className="mt-6 flex justify-end gap-3">
                <button type="button" onClick={() => setPendingDeleteChild(null)} className="min-h-[48px] rounded-xl border border-slate-300 bg-[#ffffff] px-5 text-xs font-black uppercase text-slate-700 transition hover:bg-slate-100">{isEnglish ? 'Cancel' : 'Hủy'}</button>
                <button type="button" disabled={deletingIds.has(pendingDeleteChild.id)} onClick={() => void confirmDeleteChild()} className="min-h-[48px] rounded-xl bg-red-500 px-5 text-xs font-black uppercase text-white disabled:opacity-60">{deletingIds.has(pendingDeleteChild.id) ? (isEnglish ? 'Deleting…' : 'Đang xóa…') : (isEnglish ? 'Delete child' : 'Xóa bé')}</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
