import React, { useEffect, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  BookOpen, ChevronLeft, ChevronRight, Play, Check, Lock, X, Award,
  Volume2, Sparkles, LoaderCircle
} from 'lucide-react';
import { playAppSound } from '../data';

type VocabularyQuestion = {
  id: string;
  order: number;
  questionEn: string;
  questionVi: string;
};

type VocabularyItem = {
  id: string;
  sourceId: string;
  word: string;
  ipa?: string;
  vietnamese?: string;
  example?: string;
  questions: VocabularyQuestion[];
};

type TopicDetail = {
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
  vocabularyItems?: VocabularyItem[];
};

type TopicLessonFlowProps = {
  topicSlug: string;
  completedLessonsCount: number;
  globalLang: 'en' | 'vi';
  globalTheme: 'dark' | 'light';
  onStartLesson: (lessonId: string) => void;
  onClose: () => void;
};

const ITEMS_PER_PAGE = 3;

export default function TopicLessonFlow({
  topicSlug,
  completedLessonsCount,
  globalLang,
  globalTheme,
  onStartLesson,
  onClose,
}: TopicLessonFlowProps) {
  const isLight = globalTheme === 'light';
  const isEnglish = globalLang === 'en';

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [topicDetail, setTopicDetail] = useState<TopicDetail | null>(null);
  const [currentPage, setCurrentPage] = useState(0);

  // Fetch topic details
  useEffect(() => {
    const fetchTopic = async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch(`/api/topics/${topicSlug}`, {
          credentials: 'include',
        });
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(payload?.message || 'Failed to load topic details');
        setTopicDetail(payload.data?.topic || payload.topic || null);
      } catch (err: any) {
        setError(err.message || 'Error loading topic');
      } finally {
        setLoading(false);
      }
    };
    void fetchTopic();
  }, [topicSlug]);

  const speakText = (text: string) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'en-US';
      utterance.rate = 0.85;
      window.speechSynthesis.speak(utterance);
    }
  };

  const vocabularyItems = topicDetail?.vocabularyItems || [];
  const totalPages = Math.ceil(vocabularyItems.length / ITEMS_PER_PAGE);

  const paginatedItems = useMemo(() => {
    const start = currentPage * ITEMS_PER_PAGE;
    return vocabularyItems.slice(start, start + ITEMS_PER_PAGE);
  }, [vocabularyItems, currentPage]);

  return (
    <div className="fixed inset-0 z-[600] bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className={`w-full max-w-2xl rounded-[28px] border shadow-2xl overflow-hidden flex flex-col ${isLight ? 'border-slate-200 bg-white text-slate-800' : 'border-[#37464f] bg-[#15242c] text-white'}`}
      >
        {/* Header bar */}
        <div className="p-5 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-[14px] bg-[#58cc02]/20 border border-[#58cc02]/30 text-lg">
              📚
            </div>
            <div>
              <h2 className="text-base font-black uppercase tracking-tight">
                {loading ? (isEnglish ? 'Loading topic...' : 'Đang tải chủ đề...') : isEnglish ? topicDetail?.name : topicDetail?.vietnameseName}
              </h2>
              <p className="text-[10px] font-bold text-[#1cb0f6] uppercase tracking-wider">
                {isEnglish ? 'Paginated Lesson Selector' : 'Danh sách bài học phân trang'}
              </p>
            </div>
          </div>
          <button
            onClick={() => { playAppSound(200, 'triangle', 0.1); onClose(); }}
            className={`cursor-pointer rounded-full p-1.5 transition ${isLight ? 'bg-slate-100 text-slate-500 hover:bg-slate-200' : 'bg-black/20 text-gray-400 hover:bg-black/40 hover:text-white'}`}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content Box */}
        <div className="p-6 flex-1 min-h-[360px] flex flex-col justify-between">
          {loading && (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 py-20 text-center">
              <LoaderCircle className="h-8 w-8 animate-spin text-[#1cb0f6]" />
              <p className="text-xs text-gray-400">{isEnglish ? 'Loading lessons...' : 'Đang tải danh sách bài học...'}</p>
            </div>
          )}

          {error && (
            <div className="flex-1 flex items-center justify-center p-6 text-center text-rose-500 font-bold text-sm">
              ⚠️ {error}
            </div>
          )}

          {!loading && !error && topicDetail && (
            <>
              {/* Paginated list */}
              <div className="space-y-4">
                {paginatedItems.map((item, localIdx) => {
                  const globalIdx = currentPage * ITEMS_PER_PAGE + localIdx;
                  const isCompleted = globalIdx < completedLessonsCount;
                  const isUnlocked = globalIdx <= completedLessonsCount;
                  const lessonNumber = globalIdx + 1;
                  const launchLessonId = `topic:${topicDetail.slug}:${lessonNumber}`;

                  return (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: localIdx * 0.05 }}
                      key={item.id}
                      className={`p-4 rounded-2xl border flex items-center justify-between gap-4 transition-all ${
                        isUnlocked
                          ? isLight
                            ? 'bg-slate-50 hover:bg-slate-100/70 border-slate-200 shadow-sm'
                            : 'bg-black/15 hover:bg-black/25 border-white/[0.08] shadow'
                          : 'opacity-55 cursor-not-allowed border-dashed bg-black/5 border-white/[0.04]'
                      }`}
                    >
                      <div className="flex items-center gap-3.5">
                        {/* Status Icon */}
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black ${
                          isCompleted
                            ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-500'
                            : isUnlocked
                              ? 'bg-[#1cb0f6]/10 border border-[#1cb0f6]/30 text-[#1cb0f6]'
                              : 'bg-slate-500/10 border border-dashed border-slate-500/30 text-slate-500'
                        }`}>
                          {isCompleted ? <Check className="w-4 h-4 stroke-[3]" /> : isUnlocked ? <span>{lessonNumber}</span> : <Lock className="w-3.5 h-3.5" />}
                        </div>

                        {/* Word Details */}
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-extrabold text-sm">{item.word}</span>
                            {item.ipa && <span className="text-[10px] opacity-60 font-mono">{item.ipa}</span>}
                            <button
                              onClick={() => speakText(item.word)}
                              className="p-1 hover:bg-white/10 rounded text-violet-400 cursor-pointer"
                              title={isEnglish ? 'Pronounce' : 'Phát âm mẫu'}
                            >
                              <Volume2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          <p className="text-[11px] text-[var(--app-text-muted)] mt-0.5">
                            {isEnglish ? item.vietnamese : `Nghĩa: ${item.vietnamese}`}
                          </p>
                        </div>
                      </div>

                      {/* Start Button */}
                      <button
                        disabled={!isUnlocked}
                        onClick={() => {
                          playAppSound(500, 'sine', 0.1);
                          onStartLesson(launchLessonId);
                        }}
                        className={`px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1 cursor-pointer transition ${
                          isCompleted
                            ? 'bg-slate-500/10 hover:bg-slate-500/20 text-slate-300'
                            : isUnlocked
                              ? 'bg-[#58cc02] hover:bg-[#58cc02]/90 border-b-4 border-[#46a302] text-black active:translate-y-0.5 active:border-b-0'
                              : 'bg-transparent text-gray-500 border border-white/5 cursor-not-allowed'
                        }`}
                      >
                        {isCompleted ? (isEnglish ? 'Review' : 'Luyện lại') : isUnlocked ? (isEnglish ? 'Start' : 'Bắt đầu') : (isEnglish ? 'Locked' : 'Đã khóa')}
                      </button>
                    </motion.div>
                  );
                })}
              </div>

              {/* Pagination controls */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between border-t border-white/10 pt-4 mt-6">
                  <button
                    disabled={currentPage === 0}
                    onClick={() => { playAppSound(300, 'sine', 0.05); setCurrentPage(p => Math.max(0, p - 1)); }}
                    className="flex items-center gap-1 text-xs font-black cursor-pointer hover:opacity-85 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    <span>{isEnglish ? 'Previous' : 'Trước'}</span>
                  </button>

                  <span className="text-[11px] font-black opacity-60">
                    {isEnglish ? `Page ${currentPage + 1} of ${totalPages}` : `Trang ${currentPage + 1} / ${totalPages}`}
                  </span>

                  <button
                    disabled={currentPage === totalPages - 1}
                    onClick={() => { playAppSound(300, 'sine', 0.05); setCurrentPage(p => Math.min(totalPages - 1, p + 1)); }}
                    className="flex items-center gap-1 text-xs font-black cursor-pointer hover:opacity-85 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <span>{isEnglish ? 'Next' : 'Tiếp'}</span>
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </motion.div>
    </div>
  );
}
