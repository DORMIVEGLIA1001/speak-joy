import React, { useEffect, useState } from 'react';
import {
  Volume2, Languages, Phone, MessageSquare, Calendar, Award,
  ArrowLeft, Headphones, History, AlertCircle, Sparkles, BarChart3, TrendingUp
} from 'lucide-react';
import { playAppSound } from '../data';
import { normalizeWord, type SpeakingCorrection, type WordStatus } from '../lib/speakingCoach';
import SpeakingCorrectionPanel from './SpeakingCorrectionPanel';
import {
  normalizeHistoryTranscript,
  type HistoryTranscriptSourceMessage,
  type NormalizedHistoryMessage,
} from '../lib/historyTranscript';

interface HistoryTabProps {
  currentChild: { id: string; name: string } | null;
  globalLang: 'en' | 'vi';
  globalTheme: 'dark' | 'light';
  onUnmasteredCountChange?: (count: number) => void;
  onActiveSessionChange?: (active: boolean) => void;
}

interface SessionData {
  id: string;
  topicId: string | null;
  status: string;
  startedAt: string;
  endedAt: string | null;
  turnCount: number;
  overallScore: string | null;
  summary: string;
  conversationTranscript: HistoryTranscriptSourceMessage[] | null;
  recordingUrl?: string | null;
}

type PronunciationEntry = {
  id: string;
  word: string;
  ipa?: string;
  exampleSentence?: string;
  dateRecorded: string;
  isMastered: boolean;
};

// Extracted from original code to calculate unmastered count so the sidebar notification bubble still functions
function extractMisspronouncements(sessions: SessionData[]): PronunciationEntry[] {
  const correctionPatterns = [
    /should be\s+/i,
    /correct word is\s+/i,
    /the word is\s+/i,
    /the correct pronunciation is\s+/i,
    /you said .+ but it should be\s+/i,
    /correct pronunciation is\s+/i,
    /it should be\s+/i,
    /try saying\s+/i,
    /pronounce it as\s+/i,
  ];

  const seenIds = new Set<string>();
  const result: PronunciationEntry[] = [];

  for (const session of [...sessions].reverse()) {
    const transcript = session.conversationTranscript;
    if (!transcript) continue;

    for (const message of transcript) {
      if (Array.isArray(message.corrections) && message.corrections.length > 0) {
        for (const correction of message.corrections) {
          const id = normalizeWord(correction.correct_word || correction.mistake_word);
          if (!id || seenIds.has(id)) continue;
          seenIds.add(id);
          result.unshift({
            id,
            word: correction.correct_word || correction.mistake_word,
            ipa: correction.phonetic_hint || undefined,
            exampleSentence: correction.example_sentence || message.askRepeat || undefined,
            dateRecorded: session.startedAt,
            isMastered: false,
          });
        }
        continue;
      }

      if (message.role !== 'assistant') continue;
      const content = message.content;
      const hasCorrection = correctionPatterns.some((p) => p.test(content));
      if (!hasCorrection) continue;

      const wordMatches = content.match(/\b([A-Z][a-z]+)\b/g);
      if (!wordMatches) continue;

      for (const word of wordMatches) {
        const id = word.toLowerCase();
        if (seenIds.has(id)) continue;
        seenIds.add(id);
        result.unshift({
          id,
          word,
          ipa: undefined,
          exampleSentence: undefined,
          dateRecorded: session.startedAt,
          isMastered: false,
        });
      }
    }
  }

  return result;
}

const isCallSession = (session: SessionData) => {
  return Boolean(session.recordingUrl) || /hands-free|call/i.test(session.summary || '') || session.status === 'call';
};

const formatDate = (isoString: string, globalLang: 'en' | 'vi') => {
  try {
    const date = new Date(isoString);
    return new Intl.DateTimeFormat(globalLang === 'en' ? 'en-US' : 'vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(date);
  } catch {
    return isoString;
  }
};

export default function HistoryTab({
  currentChild,
  globalLang,
  globalTheme,
  onUnmasteredCountChange,
  onActiveSessionChange,
}: HistoryTabProps) {
  const isLight = globalTheme === 'light';
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sessions, setSessions] = useState<SessionData[]>([]);
  const [selectedSession, setSelectedSession] = useState<SessionData | null>(null);
  const [revealedTranslations, setRevealedTranslations] = useState<Record<string, boolean>>({});
  const [isSpeakingId, setIsSpeakingId] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);

  const [historySubTab, setHistorySubTab] = useState<'sessions' | 'charts'>('sessions');
  const [statsData, setStatsData] = useState<any>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState<string | null>(null);

  const fetchStats = async () => {
    if (!currentChild?.id) return;
    try {
      setStatsLoading(true);
      setStatsError(null);
      const res = await fetch(`/api/children/${currentChild.id}/session-stats`, {
        credentials: 'include'
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
    if (historySubTab === 'charts') {
      void fetchStats();
    }
  }, [historySubTab, currentChild?.id]);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    onActiveSessionChange?.(selectedSession !== null);
    return () => {
      onActiveSessionChange?.(false);
    };
  }, [selectedSession, onActiveSessionChange]);

  useEffect(() => {
    const mainEl = document.querySelector('main');
    if (mainEl) {
      mainEl.scrollTop = 0;
    }
  }, [selectedSession]);

  useEffect(() => {
    const controller = new AbortController();
    const childId = currentChild?.id;

    setSessions([]);
    setSelectedSession(null);
    setRevealedTranslations({});
    setError(null);
    onUnmasteredCountChange?.(0);

    const fetchHistory = async () => {
      if (!childId) {
        setLoading(false);
        return;
      }
      try {
        setLoading(true);
        const response = await fetch(`/api/children/${childId}/sessions?limit=30`, {
          credentials: 'include',
          signal: controller.signal,
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload?.message || 'Failed to fetch history');
        const rawSessions: SessionData[] = payload?.data?.sessions || [];
        const sessionsList = rawSessions.filter((session) =>
          Boolean(session.recordingUrl) ||
          (Array.isArray(session.conversationTranscript) && session.conversationTranscript.length > 0)
        );
        setSessions(sessionsList);
        setSelectedSession((previous) => {
          if (sessionsList.length === 0) {
            return null;
          }
          if (previous && sessionsList.some((session) => session.id === previous.id)) {
            return sessionsList.find((session) => session.id === previous.id) || sessionsList[0];
          }
          return sessionsList[0];
        });

        // Calculate unmastered count for sidebar notification badge
        const mispronouncements = extractMisspronouncements(sessionsList);
        onUnmasteredCountChange?.(mispronouncements.length);
      } catch (err: any) {
        if (controller.signal.aborted) return;
        setError(err.message || 'Error fetching history');
        setSelectedSession(null);
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    };

    const timer = setTimeout(() => { void fetchHistory(); }, 500);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [currentChild, onUnmasteredCountChange]);

  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const handleSpeakText = (text: string, msgId: string) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;

    window.speechSynthesis.cancel();

    if (isSpeakingId === msgId) {
      setIsSpeakingId(null);
      return;
    }

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    utterance.onend = () => {
      setIsSpeakingId(null);
    };
    utterance.onerror = () => {
      setIsSpeakingId(null);
    };

    setIsSpeakingId(msgId);
    window.speechSynthesis.speak(utterance);
  };

  const toggleTranslation = (msgId: string) => {
    setRevealedTranslations((prev) => ({
      ...prev,
      [msgId]: !prev[msgId],
    }));
  };

  if (!currentChild) return null;

  // Sidebar element rendering list of sessions
  const renderSessionsList = () => {
    if (sessions.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-16 text-center gap-3 w-full">
          <span className="text-4xl">📚</span>
          <p className={`font-black text-sm ${isLight ? 'text-slate-600' : 'text-slate-300'}`}>
            {globalLang === 'en' ? 'No history sessions found.' : 'Chưa có lịch sử trò chuyện.'}
          </p>
          <p className="text-xs opacity-60">
            {globalLang === 'en'
              ? 'Complete a lesson or chat with Sunny to see logs!'
              : 'Hãy hoàn thành bài học hoặc nói chuyện với Sunny để lưu lịch sử nhé!'}
          </p>
        </div>
      );
    }

    return (
      <div className="flex flex-col gap-3 w-full">
        {sessions.map((session) => {
          const isSelected = selectedSession?.id === session.id;
          const isCall = isCallSession(session);
          const formattedDate = formatDate(session.startedAt, globalLang);

          return (
            <button
              key={session.id}
              onClick={() => {
                playAppSound(350, 'sine', 0.08);
                setSelectedSession(session);
              }}
              className={`w-full text-left p-4 rounded-2xl border transition-all duration-200 cursor-pointer flex flex-col gap-2 ${isSelected
                  ? isLight
                    ? 'bg-rose-50 border-rose-300 shadow-sm text-slate-800'
                    : 'bg-rose-500/10 border-rose-500/30 text-white'
                  : isLight
                    ? 'bg-white hover:bg-slate-50 border-slate-200 text-slate-700'
                    : 'bg-slate-900 hover:bg-slate-800 border-white/[0.08] text-slate-300'
                }`}
            >
              <div className="flex items-center justify-between gap-2 w-full">
                <span className="text-[10px] font-bold opacity-60 flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5" />
                  {formattedDate}
                </span>
                <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full ${isCall
                    ? 'bg-purple-100 text-purple-700'
                    : 'bg-emerald-100 text-emerald-700'
                  }`}>
                  {isCall
                    ? (globalLang === 'en' ? 'Call' : 'Gọi')
                    : (globalLang === 'en' ? 'Chat' : 'Chat')}
                </span>
              </div>

              <h3 className={`text-sm font-black line-clamp-1 ${isSelected ? 'text-rose-600' : isLight ? 'text-slate-800' : 'text-white'
                }`}>
                {session.summary || (globalLang === 'en' ? 'Conversation Session' : 'Phiên trò chuyện')}
              </h3>

              <div className="flex items-center justify-between text-xs opacity-75 mt-1">
                <span>
                  {globalLang === 'en' ? 'Turns:' : 'Lượt nói:'} <strong className="font-extrabold">{session.turnCount}</strong>
                </span>
                {session.overallScore && (
                  <span className="flex items-center gap-1">
                    <Award className="w-3.5 h-3.5 text-amber-500" />
                    {globalLang === 'en' ? 'Score:' : 'Điểm:'} <strong className="font-extrabold">{session.overallScore}</strong>
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    );
  };

  // Main session details element
  const renderSessionDetail = () => {
    if (!selectedSession) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center py-20 text-center gap-3">
          <div className="text-5xl animate-pulse">💬</div>
          <p className={`font-black text-base ${isLight ? 'text-slate-600' : 'text-slate-300'}`}>
            {globalLang === 'en' ? 'Choose a session to view transcript' : 'Chọn một cuộc trò chuyện để xem chi tiết'}
          </p>
          <p className="text-xs opacity-60 max-w-xs">
            {globalLang === 'en'
              ? 'Select any past session from the list to review transcript, audio playback, and pronunciation feedback.'
              : 'Chọn một cuộc trò chuyện từ danh sách để xem lại lời thoại, nghe lại ghi âm và nhận xét phát âm.'}
          </p>
        </div>
      );
    }

    const messages = normalizeHistoryTranscript(selectedSession);
    const isCall = isCallSession(selectedSession);
    const formattedDate = formatDate(selectedSession.startedAt, globalLang);

    return (
      <div className="flex flex-col gap-4 w-full">
        {/* Session Summary Card */}
        <div className={`rounded-2xl border p-4 flex flex-col gap-3 ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-900 border-white/[0.08]'
          }`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className={`text-[9px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full ${isCall ? 'bg-purple-100 text-purple-700' : 'bg-emerald-100 text-emerald-700'
                }`}>
                {isCall
                  ? (globalLang === 'en' ? 'Call Session' : 'Phiên gọi điện')
                  : (globalLang === 'en' ? 'Chat Session' : 'Phiên nhắn tin')}
              </span>
              <span className="text-xs font-bold opacity-60">
                {formattedDate}
              </span>
            </div>

            {selectedSession.overallScore && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-extrabold bg-amber-500/15 text-amber-600 border border-amber-500/20">
                <Award className="w-4 h-4 text-amber-500" />
                {globalLang === 'en' ? 'Score' : 'Điểm phát âm'}: {selectedSession.overallScore}
              </span>
            )}
          </div>

          <h2 className={`text-sm font-black ${isLight ? 'text-slate-800' : 'text-white'}`}>
            {selectedSession.summary || (globalLang === 'en' ? 'Conversation Summary' : 'Tóm tắt cuộc trò chuyện')}
          </h2>

          {selectedSession.recordingUrl && (
            <div className={`rounded-xl border p-3 flex flex-col gap-2 mt-1 ${isLight ? 'bg-amber-50 border-amber-205 bg-amber-50/50' : 'bg-amber-500/10 border-amber-500/20'
              }`}>
              <span className="text-[10px] font-black uppercase tracking-wider text-amber-600 flex items-center gap-1">
                <Headphones className="w-3.5 h-3.5" />
                {globalLang === 'en' ? 'Original call audio' : 'Ghi âm cuộc gọi gốc'}
              </span>
              <audio controls preload="none" className="w-full" src={selectedSession.recordingUrl}>
                {globalLang === 'en' ? 'Your browser does not support audio playback.' : 'Trình duyệt không hỗ trợ phát âm thanh.'}
              </audio>
            </div>
          )}
        </div>

        {/* Transcript Message Bubbles */}
        <div className="space-y-4 mt-2">
          {messages.map((msg) => {
            const isUser = msg.role === 'user';

            return (
              <div key={msg.id} className={`flex items-start gap-2.5 ${isUser ? 'flex-row-reverse' : ''}`}>
                {/* Avatar Icon */}
                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0 shadow-sm ${!isUser ? 'bg-[#ffc800] text-black' : 'bg-[#1cb0f6] text-white'
                  }`}>
                  {!isUser ? '☀️' : '👶'}
                </div>

                {/* Bubble Wrapper */}
                <div className="max-w-[85%] min-w-0 flex flex-col space-y-1">
                  <div className={`p-3.5 rounded-2xl text-xs relative ${!isUser
                      ? isLight
                        ? 'bg-slate-100 text-slate-800 rounded-tl-sm border border-slate-200'
                        : 'bg-slate-800 text-slate-100 rounded-tl-sm border border-white/[0.05]'
                      : 'bg-[#ffc800] text-black rounded-tr-sm font-bold shadow-sm'
                    }`}>
                    {/* Bubble Tail */}
                    {!isUser ? (
                      <div className={`w-2 h-2 absolute -left-1 top-3 transform rotate-45 border-l border-b ${isLight ? 'bg-slate-100 border-slate-200' : 'bg-slate-800 border-white/[0.05]'
                        }`} />
                    ) : (
                      <div className="w-2 h-2 bg-[#ffc800] absolute -right-1 top-3 transform rotate-45" />
                    )}

                    {/* Content text */}
                    <div className="whitespace-pre-line break-words leading-relaxed select-text fluid-body">
                      {msg.content}
                    </div>

                    {/* Translation Section (Assistant messages only) */}
                    {!isUser && msg.translation && (
                      <div className="mt-2.5">
                        {revealedTranslations[msg.id] ? (
                          <div className={`mt-2 rounded-lg border border-dashed p-2 text-[11px] italic ${isLight
                              ? 'border-slate-300 bg-white/70 text-slate-600'
                              : 'border-slate-600 bg-slate-950/35 text-slate-300'
                            }`}>
                            <div className="flex items-center gap-1 text-[9px] font-extrabold text-[#ff9600] uppercase tracking-wider mb-1">
                              <Languages className="w-3 h-3" />
                              <span>{globalLang === 'en' ? 'Vietnamese Translation:' : 'Dịch tiếng Việt:'}</span>
                            </div>
                            <div
                              className="normal-case not-italic font-bold wrap-anywhere select-text"
                              style={{
                                color: isLight ? '#1e293b' : '#f1f5f9',
                                WebkitTextFillColor: isLight ? '#1e293b' : '#f1f5f9',
                                opacity: 1,
                              }}
                            >
                              {msg.translation}
                            </div>
                            <button
                              onClick={() => toggleTranslation(msg.id)}
                              className={`mt-1.5 block cursor-pointer text-[9px] font-black uppercase hover:underline ${isLight ? 'text-purple-700' : 'text-purple-300'
                                }`}
                            >
                              {globalLang === 'en' ? 'Hide translation ✕' : 'Ẩn dịch nghĩa ✕'}
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => {
                              playAppSound(350, 'sine', 0.08);
                              toggleTranslation(msg.id);
                            }}
                            className={`flex items-center gap-1 px-2.5 py-1 rounded-xl text-[9px] font-extrabold uppercase tracking-wider transition duration-200 cursor-pointer shadow-sm ${isLight
                                ? 'bg-purple-100 hover:bg-purple-200 text-purple-700 border border-purple-200'
                                : 'bg-purple-950/40 hover:bg-purple-900 border border-purple-800 text-purple-300'
                              }`}
                          >
                            <Languages className="w-3 h-3" />
                            <span>{globalLang === 'en' ? 'Translate 🇻🇳' : 'Dịch Việt 🇻🇳'}</span>
                          </button>
                        )}
                      </div>
                    )}

                    {isUser && (msg.grammarReview || (Array.isArray(msg.corrections) && msg.corrections.length > 0) || msg.askRepeat) && (
                      <div className="mt-2.5">
                        <SpeakingCorrectionPanel
                          corrections={Array.isArray(msg.corrections) ? msg.corrections : []}
                          grammarReview={msg.grammarReview}
                          askRepeat={msg.askRepeat}
                          pronunciationScore={msg.pronunciationScore}
                          globalTheme={globalTheme}
                          globalLang={globalLang}
                        />
                      </div>
                    )}

                    {/* Pronunciation Feedback Section (User messages only) */}
                    {false && isUser && Array.isArray(msg.wordStatuses) && msg.wordStatuses.length > 0 && (
                      <div className={`mt-2.5 rounded-xl border p-2.5 ${isLight ? 'border-sky-200 bg-white/70' : 'border-sky-500/20 bg-slate-950/40'
                        }`}>
                        <div className="flex flex-wrap items-center justify-between gap-1.5 border-b pb-1.5 mb-1.5 border-dashed border-sky-200/50">
                          <span className={`text-[9px] font-black uppercase tracking-wider ${isLight ? 'text-sky-700' : 'text-sky-400'}`}>
                            {globalLang === 'en' ? 'Pronunciation evaluation' : 'Đánh giá phát âm'}
                          </span>
                          {typeof msg.score === 'number' && (
                            <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-black ${isLight ? 'bg-sky-100 text-sky-800' : 'bg-sky-500/25 text-sky-300'
                              }`}>
                              {globalLang === 'en' ? 'Score' : 'Điểm'}: {Math.round(msg.score)}
                            </span>
                          )}
                        </div>

                        <div className="space-y-1.5">
                          {msg.wordStatuses.map((status, index) => {
                            const isIncorrect = status.status === 'incorrect';
                            const isMissing = status.status === 'missing';
                            return (
                              <div
                                key={`${msg.id}_word_${index}`}
                                className={`rounded-xl border px-3 py-2.5 text-[11px] transition-all ${
                                  isIncorrect
                                    ? isLight ? 'border-red-300 bg-red-50 text-red-950 shadow-sm' : 'border-red-900/60 bg-red-950/30 text-red-100'
                                    : isMissing
                                      ? isLight ? 'border-amber-300 bg-amber-50 text-amber-955 shadow-sm' : 'border-amber-900/60 bg-amber-950/30 text-amber-100'
                                      : isLight ? 'border-slate-200 bg-white text-slate-900' : 'border-slate-800 bg-slate-900 text-slate-100'
                                }`}
                              >
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className={`font-black ${isIncorrect ? 'text-red-650 dark:text-red-400 text-xs font-black' : ''}`}>{status.word}</span>
                                  {status.ipa && <span className="font-mono text-pink-650 dark:text-pink-450 font-black">{status.ipa}</span>}
                                  <span className={`rounded-full px-2 py-0.5 text-[9px] font-black uppercase ${
                                    status.status === 'correct'
                                      ? 'bg-emerald-150 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                                      : status.status === 'incorrect'
                                        ? 'bg-red-200 text-red-800 dark:bg-red-900 dark:text-red-200'
                                        : 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                                  }`}>
                                    {status.status === 'correct'
                                      ? (globalLang === 'en' ? 'Correct' : 'Đúng')
                                      : status.status === 'incorrect'
                                        ? (globalLang === 'en' ? 'Needs work' : 'Cần sửa')
                                        : (globalLang === 'en' ? 'Missing' : 'Thiếu')}
                                  </span>
                                </div>
                                {status.tip_vi && (
                                  <div className={`mt-1 text-[10px] leading-relaxed font-semibold ${isLight ? 'text-slate-650' : 'text-slate-400'}`}>
                                    💡 {status.tip_vi}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Speak Aloud Button */}
                  <div className={`flex items-center gap-1 mt-1 ${isUser ? 'justify-end pr-1' : 'pl-1'}`}>
                    <button
                      onClick={() => handleSpeakText(msg.content, msg.id)}
                      className={`text-[9px] font-bold uppercase tracking-wider rounded-lg px-2 py-0.5 border flex items-center gap-0.5 transition cursor-pointer ${isSpeakingId === msg.id
                          ? 'bg-purple-500 border-purple-500 text-white animate-pulse'
                          : isLight
                            ? 'bg-transparent border-slate-300 text-purple-600 hover:bg-purple-100/55'
                            : 'bg-transparent border-slate-700 text-[#ff9600] hover:bg-slate-800'
                        }`}
                    >
                      <Volume2 className="w-3 h-3" />
                      <span>
                        {isSpeakingId === msg.id
                          ? (globalLang === 'en' ? 'Speaking...' : 'Đang đọc...')
                          : (globalLang === 'en' ? 'Replay' : 'Nghe lại')}
                      </span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="w-full flex flex-col gap-4">
      {/* Title Header Section */}
      <div className={`rounded-3xl border p-5 ${isLight
          ? 'bg-rose-50 border-rose-200'
          : 'bg-rose-500/10 border-rose-500/20'
        }`}>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <span className="text-2xl">⏳</span>
            <div>
              <h2 className={`text-lg font-black ${isLight ? 'text-rose-800' : 'text-rose-400'}`}>
                {globalLang === 'en' ? 'Conversation History' : 'Lịch Sử Trò Chuyện'}
              </h2>
              <p className="text-xs opacity-75 mt-0.5">
                {globalLang === 'en'
                  ? `Review ${currentChild.name}'s study transcripts and evaluations`
                  : `Xem lại lịch sử nhắn tin, gọi điện và phát âm của bé ${currentChild.name}`}
              </p>
            </div>
          </div>
          <span className={`text-xs font-extrabold px-3 py-1 rounded-full ${isLight ? 'bg-rose-100 text-rose-700' : 'bg-rose-500/20 text-rose-300'
            }`}>
            {globalLang === 'en' ? `${sessions.length} sessions` : `${sessions.length} phiên học`}
          </span>
        </div>
      </div>

      {/* Sub-tab switcher */}
      <div className="flex gap-2">
        <button
          onClick={() => {
            playAppSound(350, 'sine', 0.08);
            setHistorySubTab('sessions');
          }}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black transition cursor-pointer border ${historySubTab === 'sessions'
              ? 'bg-rose-500 text-white border-rose-500 shadow-md shadow-rose-500/10'
              : isLight
                ? 'bg-white hover:bg-slate-50 border-slate-200 text-slate-700'
                : 'bg-slate-900 hover:bg-slate-800 border-white/[0.08] text-slate-300'
            }`}
        >
          <History className="w-4 h-4" />
          <span>{globalLang === 'en' ? 'Transcripts' : 'Lời thoại'}</span>
        </button>
        <button
          onClick={() => {
            playAppSound(350, 'sine', 0.08);
            setHistorySubTab('charts');
          }}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black transition cursor-pointer border ${historySubTab === 'charts'
              ? 'bg-rose-500 text-white border-rose-500 shadow-md shadow-rose-500/10'
              : isLight
                ? 'bg-white hover:bg-slate-50 border-slate-200 text-slate-700'
                : 'bg-slate-900 hover:bg-slate-800 border-white/[0.08] text-slate-350'
            }`}
        >
          <BarChart3 className="w-4 h-4" />
          <span>{globalLang === 'en' ? 'Statistics' : 'Biểu đồ'}</span>
        </button>
      </div>

      {historySubTab === 'sessions' && (
        <>
          {/* Loading Screen */}
          {loading && (
            <div className="flex flex-col md:flex-row gap-6 w-full items-start">
              <div className="w-full md:w-[340px] flex flex-col gap-3 animate-pulse">
                {[1, 2, 3].map(i => (
                  <div key={i} className={`h-24 rounded-2xl ${isLight ? 'bg-slate-100' : 'bg-slate-800'}`} />
                ))}
              </div>
              <div className="flex-1 w-full h-80 rounded-3xl animate-pulse hidden md:block" style={{ backgroundColor: isLight ? '#f8fafc' : '#1e293b' }} />
            </div>
          )}

          {/* Error View */}
          {!loading && error && (
            <div className={`rounded-2xl border p-5 flex items-center gap-3 ${isLight ? 'bg-red-50 border-red-200 text-red-700' : 'bg-slate-900 border-red-500/20 text-red-400'
              }`}>
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <p className="font-bold">{error}</p>
            </div>
          )}

          {/* Main Content Area */}
          {!loading && !error && (
            <>
              {isMobile ? (
                /* Mobile Stack View */
                <div className="w-full">
                  {!selectedSession ? (
                    renderSessionsList()
                  ) : (
                    <div className="flex flex-col">
                      <button
                        onClick={() => {
                          playAppSound(350, 'sine', 0.08);
                          setSelectedSession(null);
                        }}
                        className={`flex items-center gap-2 self-start mb-4 px-3 py-1.5 rounded-xl text-xs font-black border transition ${isLight
                            ? 'bg-white hover:bg-slate-50 border-slate-200 text-slate-700'
                            : 'bg-slate-900 hover:bg-slate-800 border-white/[0.08] text-white'
                          }`}
                      >
                        <ArrowLeft className="w-3.5 h-3.5" />
                        {globalLang === 'en' ? 'Back to list' : 'Quay lại danh sách'}
                      </button>
                      {renderSessionDetail()}
                    </div>
                  )}
                </div>
              ) : (
                /* Desktop Split View */
                <div className="flex gap-6 w-full items-start">
                  {/* Left Column - List of Sessions */}
                  <div className="w-full md:w-[340px] md:shrink-0 md:sticky md:top-6 max-h-[calc(100vh-170px)] overflow-y-auto pr-1.5 custom-scrollbar">
                    {renderSessionsList()}
                  </div>

                  {/* Right Column - Selected Session Detail */}
                  <div className="flex-1 min-w-0 md:sticky md:top-6 max-h-[calc(100vh-170px)] overflow-y-auto pr-1.5 custom-scrollbar">
                    {renderSessionDetail()}
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}

      {historySubTab === 'charts' && (
        <div className="space-y-6">
          {statsLoading && (
            <div className="h-64 rounded-3xl animate-pulse flex items-center justify-center" style={{ backgroundColor: isLight ? '#f8fafc' : '#1e293b' }}>
              <span className="text-xs font-bold opacity-60">{globalLang === 'en' ? 'Loading stats...' : 'Đang tải thống kê...'}</span>
            </div>
          )}

          {statsError && (
            <div className={`rounded-2xl border p-5 flex items-center gap-3 ${isLight ? 'bg-red-50 border-red-200 text-red-700' : 'bg-slate-900 border-red-500/20 text-red-400'
              }`}>
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <p className="font-bold">{statsError}</p>
            </div>
          )}

          {!statsLoading && !statsError && statsData && (
            <>
              {/* Premium Stat Summary Cards */}
              <div className="grid grid-cols-3 gap-3 md:gap-4">
                <div className={`p-4 rounded-2xl border ${isLight ? 'bg-indigo-50/55 border-indigo-100 text-indigo-950' : 'bg-indigo-950/20 border-indigo-900/50 text-indigo-100'}`}>
                  <span className="text-[10px] font-black opacity-60 block">{globalLang === 'en' ? 'Total Sessions' : 'Tổng phiên học'}</span>
                  <span className="text-2xl font-black mt-1 block">{statsData.totalSessions}</span>
                </div>
                <div className={`p-4 rounded-2xl border ${isLight ? 'bg-purple-50/55 border-purple-100 text-purple-950' : 'bg-purple-950/20 border-purple-900/50 text-purple-100'}`}>
                  <span className="text-[10px] font-black opacity-60 block">{globalLang === 'en' ? 'Total Utterances' : 'Tổng số câu nói'}</span>
                  <span className="text-2xl font-black mt-1 block">{statsData.totalTurns}</span>
                </div>
                <div className={`p-4 rounded-2xl border ${isLight ? 'bg-amber-50/55 border-amber-100 text-amber-955' : 'bg-amber-950/20 border-amber-900/50 text-amber-100'}`}>
                  <span className="text-[10px] font-black opacity-60 block">{globalLang === 'en' ? 'Average Score' : 'Điểm phát âm TB'}</span>
                  <span className="text-2xl font-black mt-1 block">{statsData.averageScore.toFixed(1)}</span>
                </div>
              </div>

              {/* Charts grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* SVG Bar Chart for Turns */}
                <div className={`p-5 rounded-3xl border ${isLight ? 'bg-white border-slate-200' : 'bg-slate-900 border-white/[0.08]'}`}>
                  <h3 className="text-xs font-black uppercase tracking-wider mb-4 text-left flex items-center gap-1.5">
                    <TrendingUp className="w-4 h-4 text-rose-500" />
                    {globalLang === 'en' ? 'Utterances per Day' : 'Số câu nói mỗi ngày'}
                  </h3>
                  {statsData.dailyStats.length === 0 ? (
                    <div className="h-48 flex items-center justify-center opacity-65 text-xs">
                      {globalLang === 'en' ? 'No active sessions yet.' : 'Chưa có hoạt động nào.'}
                    </div>
                  ) : (
                    <div className="relative w-full h-56">
                      <svg viewBox="0 0 400 200" className="w-full h-full">
                        {/* Grid lines */}
                        <line x1="30" y1="20" x2="380" y2="20" stroke="rgba(128,128,128,0.15)" strokeWidth="1" />
                        <line x1="30" y1="65" x2="380" y2="65" stroke="rgba(128,128,128,0.15)" strokeWidth="1" />
                        <line x1="30" y1="110" x2="380" y2="110" stroke="rgba(128,128,128,0.15)" strokeWidth="1" />
                        <line x1="30" y1="155" x2="380" y2="155" stroke="rgba(128,128,128,0.15)" strokeWidth="1" />

                        {/* Render bars */}
                        {(() => {
                          const items = [...statsData.dailyStats].slice(0, 7).reverse();
                          const maxVal = Math.max(...items.map(x => x.turns), 5);
                          const barWidth = 30;
                          const gap = (350 - (items.length * barWidth)) / (items.length + 1);

                          return items.map((item, idx) => {
                            const val = item.turns;
                            const pct = val / maxVal;
                            const barHeight = pct * 135;
                            const x = 30 + gap + idx * (barWidth + gap);
                            const y = 155 - barHeight;

                            return (
                              <g key={`bar-${idx}`}>
                                <rect
                                  x={x}
                                  y={y}
                                  width={barWidth}
                                  height={barHeight}
                                  rx="4"
                                  fill="url(#turns-grad)"
                                  className="transition-all duration-500 hover:opacity-85"
                                />
                                <text x={x + barWidth / 2} y={y - 6} textAnchor="middle" fontSize="10" fontWeight="bold" fill={isLight ? '#334155' : '#e2e8f0'}>
                                  {val}
                                </text>
                                <text x={x + barWidth / 2} y="175" textAnchor="middle" fontSize="9" fill={isLight ? '#64748b' : '#94a3b8'}>
                                  {item.date.slice(5)}
                                </text>
                              </g>
                            );
                          });
                        })()}
                        
                        <defs>
                          <linearGradient id="turns-grad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#f43f5e" />
                            <stop offset="100%" stopColor="#fda4af" />
                          </linearGradient>
                        </defs>
                      </svg>
                    </div>
                  )}
                </div>

                {/* SVG Line Chart for Avg Score */}
                <div className={`p-5 rounded-3xl border ${isLight ? 'bg-white border-slate-200' : 'bg-slate-900 border-white/[0.08]'}`}>
                  <h3 className="text-xs font-black uppercase tracking-wider mb-4 text-left flex items-center gap-1.5">
                    <Award className="w-4 h-4 text-indigo-500" />
                    {globalLang === 'en' ? 'Average Score Trend' : 'Xu hướng điểm phát âm'}
                  </h3>
                  {statsData.dailyStats.length === 0 ? (
                    <div className="h-48 flex items-center justify-center opacity-65 text-xs">
                      {globalLang === 'en' ? 'No active sessions yet.' : 'Chưa có hoạt động nào.'}
                    </div>
                  ) : (
                    <div className="relative w-full h-56">
                      <svg viewBox="0 0 400 200" className="w-full h-full">
                        {/* Grid lines */}
                        <line x1="30" y1="20" x2="380" y2="20" stroke="rgba(128,128,128,0.15)" strokeWidth="1" />
                        <line x1="30" y1="65" x2="380" y2="65" stroke="rgba(128,128,128,0.15)" strokeWidth="1" />
                        <line x1="30" y1="110" x2="380" y2="110" stroke="rgba(128,128,128,0.15)" strokeWidth="1" />
                        <line x1="30" y1="155" x2="380" y2="155" stroke="rgba(128,128,128,0.15)" strokeWidth="1" />

                        {/* Render line path */}
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
                                  stroke="#6366f1"
                                  strokeWidth="3"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
                              )}
                              {coords.map((c, idx) => (
                                <g key={`line-pt-${idx}`}>
                                  <circle
                                    cx={c.x}
                                    cy={c.y}
                                    r="5"
                                    fill="#4f46e5"
                                    stroke="#fff"
                                    strokeWidth="1.5"
                                  />
                                  <text x={c.x} y={c.y - 8} textAnchor="middle" fontSize="9" fontWeight="bold" fill={isLight ? '#334155' : '#e2e8f0'}>
                                    {Math.round(c.val)}
                                  </text>
                                  <text x={c.x} y="175" textAnchor="middle" fontSize="9" fill={isLight ? '#64748b' : '#94a3b8'}>
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
        </div>
      )}
    </div>
  );
}
