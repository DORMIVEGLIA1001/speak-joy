import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Phone, PhoneOff, Mic, MicOff, Volume2, Loader2, Award, Info,
  AlertCircle, ArrowLeft, CheckCircle2,
} from 'lucide-react';
import { AppState } from '../types';
import {
  fetchScenarios,
  fetchScenarioDetail,
  scoreFreeTalk,
  blobToWav16k,
  type RolePlayScenario,
  type RolePlayScenarioDetail,
  type WordIpaScore,
  type IpaScoreResult,
} from '../lib/roleplayApi';

interface RolePlayFreeTalkProps {
  state: AppState;
  onUpdateStats: (update: Partial<AppState>) => void;
  currentChild?: { id: string; name: string; age?: number } | null;
  globalLang: 'en' | 'vi';
  globalTheme: 'dark' | 'light';
  onActiveSessionChange?: (isActive: boolean) => void;
}

interface GrammarIssue {
  mistake: string;
  correction: string;
  instruction: string;
  type: string;
}

// A per-word pronunciation score plus how many times the child has re-tried that word.
// A red (Poor) word can be practised again up to MAX_WORD_RETRIES times; each retry
// re-scores just that word and updates the chip in place.
interface WordScoreState extends WordIpaScore {
  attempts?: number;
}

interface ChatTurn {
  role: 'user' | 'model';
  text: string;
  textVi?: string;
  score?: number;
  correctedSentence?: string;
  issues?: GrammarIssue[];
  // Pronunciation (IPA) scoring of the child's recording, filled in asynchronously
  // after the grammar reply — free talk grades both what they said and how they said it.
  pronunciationScore?: number;
  wordScores?: WordScoreState[];
}

// How many times a child may re-record a mispronounced word before we move on.
const MAX_WORD_RETRIES = 3;

type CallState = 'idle' | 'dialing' | 'connected' | 'ended';

// A persona (the friend the child talks to) is bundled with each scenario context.
// Keyed by scenario slug, with a fallback for any scenario the map does not cover.
interface Persona {
  avatar: string;
  color: string;
  friendEn: string;
  friendVi: string;
  // Sent to the backend so the AI stays in character for the whole conversation.
  character: string;
}

const SCENARIO_PERSONAS: Record<string, Persona> = {
  'at-school': {
    avatar: '🧑‍🏫',
    color: 'from-sky-500 to-indigo-600',
    friendEn: 'Ms. Sunny, your teacher',
    friendVi: 'Cô Sunny — cô giáo',
    character:
      'You are Ms. Sunny, a warm and patient teacher talking with a young student at school. Keep the whole conversation about school life — lessons, friends, the classroom, break time.',
  },
  'at-home': {
    avatar: '🧸',
    color: 'from-amber-400 to-orange-500',
    friendEn: 'Mom at home',
    friendVi: 'Mẹ ở nhà',
    character:
      'You are a loving parent chatting with your child at home. Keep the whole conversation about home life — meals, family, chores, playing at home.',
  },
  'with-friends': {
    avatar: '🧒',
    color: 'from-rose-400 to-pink-600',
    friendEn: 'Kai, your best friend',
    friendVi: 'Kai — bạn thân',
    character:
      'You are Kai, a cheerful young friend playing together. Keep the whole conversation about playing — games, toys, sports, having fun together.',
  },
};

const DEFAULT_PERSONA: Persona = {
  avatar: '🎭',
  color: 'from-teal-400 to-emerald-600',
  friendEn: 'A friendly companion',
  friendVi: 'Một người bạn thân thiện',
  character: 'You are a friendly companion for this situation. Stay on the situation for the whole conversation.',
};

const XP_PER_UTTERANCE = 5;

const personaFor = (slug: string): Persona => SCENARIO_PERSONAS[slug] || DEFAULT_PERSONA;

// Pull a handful of context words from the scenario's answer options so the AI can
// gently steer the child toward vocabulary that fits the situation.
const extractVocab = (detail: RolePlayScenarioDetail): string[] => {
  const set = new Set<string>();
  for (const script of detail.scripts || []) {
    for (const line of script.lines || []) {
      for (const option of line.options || []) {
        for (const word of String(option.text || '')
          .toLowerCase()
          .replace(/[^a-z\s]/g, ' ')
          .split(/\s+/)) {
          if (word.length >= 4) set.add(word);
        }
      }
    }
  }
  return Array.from(set).slice(0, 12);
};

export default function RolePlayFreeTalk({
  state,
  onUpdateStats,
  currentChild,
  globalLang,
  globalTheme,
  onActiveSessionChange,
}: RolePlayFreeTalkProps) {
  const isLight = globalTheme === 'light';
  const t = (en: string, vi: string) => (globalLang === 'en' ? en : vi);

  const [scenarios, setScenarios] = useState<RolePlayScenario[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Active context (chosen scenario + its persona + steering data).
  const [context, setContext] = useState<{
    scenario: RolePlayScenario;
    persona: Persona;
    vocabulary: string[];
    greetingEn: string;
    greetingVi: string;
  } | null>(null);

  const [callState, setCallState] = useState<CallState>('idle');
  const [history, setHistory] = useState<ChatTurn[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [callDuration, setCallDuration] = useState(0);
  const [earnedXp, setEarnedXp] = useState(0);
  // Which mispronounced word is being re-recorded right now, and whether its audio is
  // being scored. null = no retry in progress. Identifies the word by turn + word index.
  const [retryTarget, setRetryTarget] = useState<{ turnIndex: number; wordIndex: number } | null>(null);
  const [retryScoring, setRetryScoring] = useState(false);

  const recognitionRef = useRef<any>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const finalTranscriptRef = useRef('');
  const historyRef = useRef<ChatTurn[]>([]);
  // Raw-audio capture (MediaRecorder) runs alongside Web Speech: the browser gives us the
  // transcript, MediaRecorder gives us the waveform the backend needs for IPA scoring.
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    historyRef.current = history;
  }, [history]);

  // The conversation now lives inline in the tab (not a fullscreen overlay), so the
  // navbar/sidebar stay usable — never ask the shell to hide the mobile bottom nav.
  useEffect(() => {
    onActiveSessionChange?.(false);
  }, [onActiveSessionChange]);

  // Load scenario list on mount (and when the child's age changes).
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchScenarios(currentChild?.age)
      .then((list) => {
        if (!cancelled) setScenarios(list);
      })
      .catch((err) => {
        if (!cancelled) setError(err?.message || t('Could not load scenarios', 'Không tải được ngữ cảnh'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentChild?.age]);

  const speak = useCallback((text: string) => {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    utterance.rate = 0.92;
    const voices = window.speechSynthesis.getVoices();
    const preferred = voices.find((v) => v.lang.startsWith('en') && v.name.toLowerCase().includes('female'));
    if (preferred) utterance.voice = preferred;
    window.speechSynthesis.speak(utterance);
  }, []);

  // Set up Web Speech recognition once.
  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const rec = new SpeechRecognition();
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = 'en-US';

      rec.onresult = (event: any) => {
        let interim = '';
        let final = '';
        for (let i = event.resultIndex; i < event.results.length; i += 1) {
          if (event.results[i].isFinal) {
            final += event.results[i][0].transcript;
          } else {
            interim += event.results[i][0].transcript;
          }
        }
        if (final) finalTranscriptRef.current += final;
        setTranscript((finalTranscriptRef.current + interim).trim());
      };

      rec.onerror = (e: any) => {
        console.warn('Speech recognition error:', e);
      };

      recognitionRef.current = rec;
    }

    if ('speechSynthesis' in window) window.speechSynthesis.getVoices();

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (recognitionRef.current) {
        try { recognitionRef.current.abort(); } catch { /* ignore */ }
      }
      try { mediaRecorderRef.current?.stop(); } catch { /* ignore */ }
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    };
  }, []);

  // Call timer.
  useEffect(() => {
    if (callState === 'connected') {
      timerRef.current = setInterval(() => setCallDuration((prev) => prev + 1), 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      if (callState === 'idle') setCallDuration(0);
    }
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [callState]);

  useEffect(() => {
    if (history.length === 0) return;
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [history, isProcessing, transcript]);

  const startCall = async (scenario: RolePlayScenario) => {
    setError(null);
    setLoading(true);
    try {
      const detail = await fetchScenarioDetail(scenario.slug);
      const persona = personaFor(scenario.slug);
      const greetingEn = detail.greetingEn || scenario.greetingEn || 'Hi! Let us talk.';
      const greetingVi = detail.greetingVi || scenario.greetingVi || '';
      setContext({
        scenario,
        persona,
        vocabulary: extractVocab(detail),
        greetingEn,
        greetingVi,
      });
      setHistory([]);
      setEarnedXp(0);
      setCallState('dialing');
      setTimeout(() => {
        setCallState('connected');
        setHistory([{ role: 'model', text: greetingEn, textVi: greetingVi }]);
        speak(greetingEn);
      }, 1800);
    } catch (err: any) {
      setError(err?.message || t('Could not open this context', 'Không mở được ngữ cảnh này'));
    } finally {
      setLoading(false);
    }
  };

  const commitXp = () => {
    if (earnedXp > 0) onUpdateStats({ xp: (state.xp || 0) + earnedXp });
  };

  // Abandon any in-progress single-word retry: stop the recorder, drop its audio, and
  // release the mic. Called when the child hangs up or leaves mid-retry so a dangling
  // MediaRecorder never keeps the mic open.
  const abortWordRetry = () => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      try { recorder.onstop = null; recorder.stop(); } catch { /* ignore */ }
    }
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
    audioChunksRef.current = [];
    setRetryTarget(null);
  };

  const hangUp = () => {
    if (isRecording) stopRecording();
    if (retryTarget) abortWordRetry();
    setCallState('ended');
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    commitXp();
  };

  const exitToPicker = () => {
    if (retryTarget) abortWordRetry();
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    setCallState('idle');
    setContext(null);
    setHistory([]);
  };

  const startRecording = async () => {
    if (isProcessing) return;
    setTranscript('');
    finalTranscriptRef.current = '';
    audioChunksRef.current = [];
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      // MediaRecorder captures the raw waveform for IPA scoring; Web Speech (below) gives
      // us the transcript in parallel. Both read the same mic grant.
      try {
        const recorder = new MediaRecorder(stream);
        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) audioChunksRef.current.push(event.data);
        };
        recorder.start();
        mediaRecorderRef.current = recorder;
      } catch (recErr) {
        // No MediaRecorder support → we still run the grammar turn, just skip IPA scoring.
        console.warn('MediaRecorder unavailable, skipping IPA capture:', recErr);
        mediaRecorderRef.current = null;
      }
      if (recognitionRef.current) {
        try { recognitionRef.current.start(); } catch { /* already running */ }
      }
      setIsRecording(true);
    } catch (err) {
      console.error('Microphone access denied:', err);
      alert(t('Please allow microphone access.', 'Vui lòng cấp quyền truy cập micro!'));
    }
  };

  // Stop MediaRecorder and resolve the recorded audio as a single Blob (null if none).
  const finishAudioCapture = (): Promise<Blob | null> =>
    new Promise((resolve) => {
      const recorder = mediaRecorderRef.current;
      const releaseStream = () => {
        mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;
      };
      if (!recorder || recorder.state === 'inactive') {
        releaseStream();
        resolve(audioChunksRef.current.length ? new Blob(audioChunksRef.current) : null);
        return;
      }
      recorder.onstop = () => {
        releaseStream();
        resolve(audioChunksRef.current.length ? new Blob(audioChunksRef.current) : null);
      };
      try { recorder.stop(); } catch { releaseStream(); resolve(null); }
    });

  const stopRecording = async () => {
    if (!isRecording) return;
    setIsRecording(false);
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch { /* ignore */ }
    }
    const audioBlob = await finishAudioCapture();
    const spoken = (finalTranscriptRef.current || transcript).trim();
    if (!spoken) return;
    submitTurn(spoken, audioBlob);
  };

  const submitTurn = async (spokenText: string, audioBlob: Blob | null) => {
    if (!context) return;
    setIsProcessing(true);
    setHistory((prev) => [...prev, { role: 'user', text: spokenText }]);

    // Kick off IPA pronunciation scoring in parallel with the grammar/chat roundtrip.
    // It's best-effort: if encoding or the engine fails, we still show the grammar
    // feedback and just omit the pronunciation chips.
    const ipaPromise: Promise<IpaScoreResult | null> = audioBlob
      ? blobToWav16k(audioBlob)
          .then((wav) => scoreFreeTalk(wav, spokenText))
          .catch((err) => {
            console.warn('Free-talk IPA scoring failed:', err);
            return null;
          })
      : Promise.resolve(null);

    try {
      const apiHistory = historyRef.current.map((h) => ({
        role: h.role === 'model' ? 'assistant' : 'user',
        content: h.text,
      }));

      // No spoken_text/target_phrase: we want the backend's context-aware grammar
      // scoring of what the child freely said, steered by the scenario topic + persona —
      // not the copy-a-phrase pronunciation drill (which would always score ~100%).
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...apiHistory, { role: 'user', content: spokenText }],
          topic: context.scenario.slug,
          topic_name: context.scenario.titleEn,
          vocabulary: context.vocabulary,
          persona: context.persona.character,
          childId: currentChild?.id || undefined,
          childAge: currentChild?.age ?? undefined,
          childName: currentChild?.name || undefined,
        }),
      });

      if (!res.ok) throw new Error('chat request failed');
      const result = await res.json();

      const score = typeof result.grammar_score === 'number'
        ? result.grammar_score
        : (typeof result.score === 'number' ? result.score : undefined);
      const issues: GrammarIssue[] = Array.isArray(result.grammar_review?.issues)
        ? result.grammar_review.issues
        : [];
      const correctedSentence = result.grammar_review?.corrected_sentence;

      const ipa = await ipaPromise;

      setHistory((prev) => {
        const updated = [...prev];
        for (let i = updated.length - 1; i >= 0; i -= 1) {
          if (updated[i].role === 'user') {
            updated[i] = {
              ...updated[i],
              score,
              correctedSentence,
              issues,
              pronunciationScore: ipa?.overall_score,
              wordScores: ipa?.words,
            };
            break;
          }
        }
        const aiTurn: ChatTurn = { role: 'model', text: result.reply, textVi: result.translation };
        speak(result.reply);
        return [...updated, aiTurn];
      });

      setEarnedXp((xp) => xp + XP_PER_UTTERANCE);
    } catch (err) {
      console.error('Free-talk roundtrip failed:', err);
      const fallback = "I didn't quite catch that. Can you say it again?";
      setHistory((prev) => [...prev, { role: 'model', text: fallback, textVi: 'Tớ chưa nghe rõ lắm. Con nói lại nhé?' }]);
      speak(fallback);
    } finally {
      setIsProcessing(false);
      setTranscript('');
      finalTranscriptRef.current = '';
    }
  };

  // ── Re-record a single mispronounced (red) word ────────────────────────────
  // The child taps the mic on a red chip, says just that word, and we re-score it
  // against the known target word (so the transcript is fixed, not re-recognised).
  // Up to MAX_WORD_RETRIES tries per word; each try updates the chip + sentence score.
  const startWordRetry = async (turnIndex: number, wordIndex: number) => {
    if (retryTarget || retryScoring || isRecording || isProcessing) return;
    audioChunksRef.current = [];
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };
      recorder.start();
      mediaRecorderRef.current = recorder;
      setRetryTarget({ turnIndex, wordIndex });
    } catch (err) {
      console.error('Microphone access denied:', err);
      alert(t('Please allow microphone access.', 'Vui lòng cấp quyền truy cập micro!'));
    }
  };

  const stopWordRetry = async () => {
    if (!retryTarget) return;
    const { turnIndex, wordIndex } = retryTarget;
    const targetWord = historyRef.current[turnIndex]?.wordScores?.[wordIndex]?.word || '';
    setRetryTarget(null);
    setRetryScoring(true);
    try {
      const audioBlob = await finishAudioCapture();
      if (!audioBlob || !targetWord) return;
      const wav = await blobToWav16k(audioBlob);
      // Score the single word: the transcript IS the known target, so the backend
      // phonemizes exactly that word and grades the recording against it.
      const result = await scoreFreeTalk(wav, targetWord);
      const fresh = result.words?.[0];
      if (!fresh) return;

      setHistory((prev) => {
        const updated = [...prev];
        const turn = updated[turnIndex];
        if (!turn?.wordScores) return prev;
        const words = turn.wordScores.slice();
        const prevWord = words[wordIndex];
        const attempts = (prevWord.attempts || 0) + 1;
        // Keep the better of the two attempts so a worse retry never lowers the score.
        const better = fresh.score >= prevWord.score ? fresh : prevWord;
        words[wordIndex] = { ...better, word: prevWord.word, attempts };
        const pronunciationScore = Math.round(
          words.reduce((sum, w) => sum + w.score, 0) / words.length,
        );
        updated[turnIndex] = { ...turn, wordScores: words, pronunciationScore };
        return updated;
      });
    } catch (err) {
      console.warn('Word retry scoring failed:', err);
    } finally {
      setRetryScoring(false);
    }
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const scoreColor = (score: number) => {
    if (score >= 85) return isLight ? 'text-emerald-600' : 'text-emerald-300';
    if (score >= 60) return isLight ? 'text-amber-600' : 'text-amber-300';
    return isLight ? 'text-rose-600' : 'text-rose-300';
  };

  // ── Picker: choose a context (scenario + bundled persona) ──────────────────
  if (callState === 'idle') {
    return (
      <div className="space-y-5">
        <div className="text-center space-y-1.5">
          <div className="mx-auto inline-flex rounded-2xl bg-sky-400/15 p-3 text-sky-500">
            <Phone size={22} />
          </div>
          <h3 className={`text-lg font-black ${isLight ? 'text-slate-900' : 'text-white'}`}>
            {t('Free talk', 'Gọi nói tự do')}
          </h3>
          <p className={`mx-auto max-w-xl text-xs ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
            {t(
              'Pick a situation, then talk freely in English with your friend. The whole chat stays on that situation and you get feedback for every sentence.',
              'Chọn một ngữ cảnh, rồi trò chuyện tự do bằng tiếng Anh cùng người bạn. Cả cuộc nói chuyện sẽ xoay quanh ngữ cảnh đó và con được góp ý cho từng câu.',
            )}
          </p>
        </div>

        {loading && (
          <div className="flex items-center justify-center gap-2 text-sm text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t('Loading…', 'Đang tải…')}
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 rounded-xl border border-rose-400/30 bg-rose-400/10 px-3 py-2 text-sm text-rose-500">
            <AlertCircle className="h-4 w-4" />
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {scenarios.map((scenario) => {
            const persona = personaFor(scenario.slug);
            return (
              <button
                key={scenario.slug}
                onClick={() => startCall(scenario)}
                disabled={loading}
                className={`flex flex-col gap-3 rounded-[20px] border p-4 text-left transition-all active:scale-[0.98] disabled:opacity-60 ${
                  isLight
                    ? 'border-slate-200 bg-white hover:border-sky-300 hover:shadow-md'
                    : 'border-white/10 bg-white/5 hover:border-sky-400/40 hover:bg-white/10'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-3xl">{scenario.emoji || '🎭'}</span>
                  <div className={`shrink-0 rounded-xl bg-gradient-to-br ${persona.color} p-1.5 text-xl`}>
                    {persona.avatar}
                  </div>
                </div>
                <div>
                  <div className={`text-base font-black ${isLight ? 'text-slate-900' : 'text-white'}`}>
                    {t(scenario.titleEn, scenario.titleVi)}
                  </div>
                  <div className="mt-0.5 text-[11px] font-bold text-sky-500">
                    {t('Talk with ', 'Nói chuyện với ')}{t(persona.friendEn, persona.friendVi)}
                  </div>
                  {(scenario.personaEn || scenario.personaVi) && (
                    <p className={`mt-1 text-[11px] leading-normal ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                      {t(scenario.personaEn || '', scenario.personaVi || '')}
                    </p>
                  )}
                </div>
                <span className="mt-auto inline-flex items-center gap-1 text-xs font-black text-emerald-500">
                  <Phone size={13} />
                  {t('Start call', 'Bắt đầu gọi')}
                </span>
              </button>
            );
          })}
        </div>

        {!loading && scenarios.length === 0 && !error && (
          <p className="text-center text-sm text-slate-400">{t('No contexts yet.', 'Chưa có ngữ cảnh nào.')}</p>
        )}
      </div>
    );
  }

  // ── Inline conversation panel (bounded card — keeps navbar/sidebar usable) ──
  const persona = context?.persona || DEFAULT_PERSONA;
  const title = context ? t(context.scenario.titleEn, context.scenario.titleVi) : '';

  return (
    <div className={`flex h-[75vh] max-h-[720px] flex-col overflow-hidden rounded-[24px] border text-[var(--app-text)] ${isLight ? 'border-slate-200 bg-white' : 'border-white/10 bg-white/5'}`}>
      {/* Header */}
      <div className={`flex items-center gap-3 border-b px-4 py-3 md:px-6 ${isLight ? 'border-slate-200 bg-white' : 'border-white/10 bg-white/5'}`}>
        <button
          onClick={exitToPicker}
          className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold ${
            isLight ? 'bg-slate-100 text-slate-600 hover:bg-slate-200' : 'bg-white/10 text-slate-300 hover:bg-white/20'
          }`}
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          {t('Back', 'Quay lại')}
        </button>

        <div className={`flex min-w-0 flex-1 items-center gap-2.5`}>
          <div className={`shrink-0 rounded-xl bg-gradient-to-br ${persona.color} p-1.5 text-xl`}>{persona.avatar}</div>
          <div className="min-w-0">
            <div className={`truncate text-sm font-black ${isLight ? 'text-slate-900' : 'text-white'}`}>
              {context?.scenario.emoji} {title}
            </div>
            <div className="text-[11px] font-bold text-sky-500">{t(persona.friendEn, persona.friendVi)}</div>
          </div>
        </div>

        {callState === 'connected' && (
          <span className="inline-block rounded-full bg-sky-400/10 px-3 py-1 font-mono text-sm font-bold text-sky-500">
            {formatTime(callDuration)}
          </span>
        )}
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-400/10 px-2.5 py-1 text-[11px] font-black text-amber-500">
          <Award size={12} />
          +{earnedXp} XP
        </span>
      </div>

      {/* Conversation */}
      <div className="flex-1 overflow-y-auto px-4 py-5 md:px-6">
        <div className="mx-auto flex max-w-2xl flex-col gap-4">
          {callState === 'dialing' && (
            <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
              <div className="relative">
                <div className="absolute -inset-3 animate-ping rounded-full bg-sky-400/20" />
                <div className={`relative flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br ${persona.color} text-4xl shadow-xl`}>
                  {persona.avatar}
                </div>
              </div>
              <p className={`text-sm font-bold ${isLight ? 'text-slate-600' : 'text-slate-300'}`}>
                {t('Connecting…', 'Đang kết nối…')}
              </p>
            </div>
          )}

          {(() => {
            // Index of the most recent user turn — retry mics are only offered there so
            // the child practises the word they just said, not words from earlier turns.
            let lastUserTurnIndex = -1;
            for (let i = history.length - 1; i >= 0; i -= 1) {
              if (history[i].role === 'user') { lastUserTurnIndex = i; break; }
            }
            return history.map((turn, index) => {
            const isUser = turn.role === 'user';
            const hasIssues = (turn.issues?.length || 0) > 0;
            return (
              <div key={index} className={`flex flex-col gap-1.5 ${isUser ? 'items-end' : 'items-start'}`}>
                <span className={`px-1 text-[9px] font-black uppercase tracking-widest ${isLight ? 'text-slate-400' : 'text-slate-500'}`}>
                  {isUser ? t('You', 'Con') : t(persona.friendEn.split(',')[0], persona.friendVi.split('—')[0].trim())}
                </span>
                <div className={`max-w-[88%] rounded-2xl border p-3 ${
                  isUser
                    ? isLight ? 'border-slate-200 bg-slate-50 text-slate-800' : 'border-white/10 bg-white/5 text-slate-100'
                    : isLight ? 'border-sky-200 bg-sky-50 text-slate-800' : 'border-sky-400/20 bg-sky-400/10 text-slate-100'
                }`}>
                  <p className="text-sm font-semibold leading-relaxed">{turn.text}</p>
                  {turn.textVi && (
                    <p className={`mt-1 border-t pt-1 text-[11px] italic ${isLight ? 'border-slate-200 text-slate-500' : 'border-white/10 text-slate-400'}`}>
                      {turn.textVi}
                    </p>
                  )}
                  {!isUser && (
                    <button
                      onClick={() => speak(turn.text)}
                      className="mt-2 inline-flex items-center gap-1 text-[10px] font-black text-sky-500 hover:text-sky-400"
                    >
                      <Volume2 size={12} />
                      {t('Hear again', 'Nghe lại')}
                    </button>
                  )}
                </div>

                {/* Context-aware feedback for the child's turn */}
                {isUser && typeof turn.score === 'number' && (
                  <div className={`w-full max-w-[88%] rounded-2xl border p-3 ${isLight ? 'border-slate-200 bg-white' : 'border-white/10 bg-black/20'}`}>
                    <div className="mb-1.5 flex items-center justify-between">
                      <span className={`text-[9px] font-black uppercase tracking-wider ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                        {t('Feedback', 'Nhận xét')}
                      </span>
                      <span className={`inline-flex items-center gap-1 text-[11px] font-black ${scoreColor(turn.score)}`}>
                        <Award size={12} />
                        {turn.score}%
                      </span>
                    </div>

                    {hasIssues ? (
                      <>
                        {turn.correctedSentence && (
                          <p className={`mb-2 text-xs ${isLight ? 'text-slate-700' : 'text-slate-200'}`}>
                            <span className="font-black text-emerald-500">{t('Better: ', 'Nói hay hơn: ')}</span>
                            {turn.correctedSentence}
                          </p>
                        )}
                        <div className={`flex flex-col gap-1 rounded-lg border p-2 ${isLight ? 'border-amber-200 bg-amber-50' : 'border-amber-400/20 bg-amber-400/5'}`}>
                          {turn.issues!.slice(0, 3).map((issue, i) => (
                            <div key={i} className="flex items-start gap-1.5">
                              <Info size={12} className="mt-0.5 shrink-0 text-amber-500" />
                              <p className={`text-[10px] leading-normal ${isLight ? 'text-slate-600' : 'text-slate-300'}`}>
                                <b>{issue.mistake} → {issue.correction}:</b> {issue.instruction}
                              </p>
                            </div>
                          ))}
                        </div>
                      </>
                    ) : (
                      <div className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-500">
                        <CheckCircle2 size={13} />
                        {t('Great sentence!', 'Câu nói rất tốt!')}
                      </div>
                    )}

                    {/* Per-word pronunciation (IPA) chips — green = good, red = off. Only
                        shown when the backend could score the recording (g2p available). */}
                    {turn.wordScores && turn.wordScores.length > 0 && (
                      <div className={`mt-2 border-t pt-2 ${isLight ? 'border-slate-200' : 'border-white/10'}`}>
                        <div className="mb-1.5 flex items-center justify-between">
                          <span className={`text-[9px] font-black uppercase tracking-wider ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                            {t('Pronunciation', 'Phát âm')}
                          </span>
                          {typeof turn.pronunciationScore === 'number' && (
                            <span className={`inline-flex items-center gap-1 text-[11px] font-black ${scoreColor(turn.pronunciationScore)}`}>
                              <Mic size={11} />
                              {turn.pronunciationScore}%
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {turn.wordScores.map((w, i) => {
                            const good = w.rating === 'Good';
                            const fair = w.rating === 'Fair';
                            const tone = good
                              ? isLight ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300'
                              : fair
                                ? isLight ? 'border-amber-300 bg-amber-50 text-amber-700' : 'border-amber-400/30 bg-amber-400/10 text-amber-300'
                                : isLight ? 'border-rose-300 bg-rose-50 text-rose-700' : 'border-rose-400/30 bg-rose-400/10 text-rose-300';
                            const attempts = w.attempts || 0;
                            const retriesLeft = MAX_WORD_RETRIES - attempts;
                            // A red (Poor) word the child hasn't exhausted their tries on gets a
                            // mic to re-record just that word. Only offered on the latest user
                            // turn so the child practises the word they just said, not old ones.
                            const isLatestUserTurn = index === lastUserTurnIndex;
                            const canRetry = !good && !fair && retriesLeft > 0 && isLatestUserTurn;
                            const isRetryingThis =
                              retryTarget?.turnIndex === index && retryTarget?.wordIndex === i;
                            return (
                              <span key={i} className={`inline-flex flex-col items-center rounded-lg border px-2 py-1 ${tone}`}>
                                <span className="text-xs font-black leading-tight">{w.word}</span>
                                {w.targetIpa && (
                                  <span className="font-mono text-[9px] leading-tight opacity-80">/{w.targetIpa}/</span>
                                )}
                                {isRetryingThis ? (
                                  <button
                                    onClick={stopWordRetry}
                                    className="mt-1 inline-flex items-center gap-1 rounded-md bg-rose-500 px-1.5 py-0.5 text-[9px] font-black text-white active:scale-95"
                                  >
                                    <MicOff size={10} className="animate-pulse" />
                                    {t('Stop', 'Dừng')}
                                  </button>
                                ) : canRetry ? (
                                  <button
                                    onClick={() => startWordRetry(index, i)}
                                    disabled={!!retryTarget || retryScoring || isRecording || isProcessing}
                                    className="mt-1 inline-flex items-center gap-1 rounded-md border border-current px-1.5 py-0.5 text-[9px] font-black opacity-90 hover:opacity-100 disabled:opacity-40 active:scale-95"
                                  >
                                    <Mic size={10} />
                                    {t(`Try (${retriesLeft})`, `Nói lại (${retriesLeft})`)}
                                  </button>
                                ) : (!good && !fair && attempts >= MAX_WORD_RETRIES) ? (
                                  <span className="mt-1 text-[8px] font-bold uppercase tracking-wide opacity-70">
                                    {t('Keep going', 'Cố lên nhé')}
                                  </span>
                                ) : null}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
            });
          })()}

          {isProcessing && (
            <div className="flex items-center gap-2">
              <span className="flex h-2 w-2 animate-ping rounded-full bg-sky-400" />
              <span className={`text-[11px] font-semibold ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                {t('Replying & scoring…', 'Đang trả lời & chấm điểm…')}
              </span>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>
      </div>

      {/* Footer controls */}
      <div className={`border-t px-4 py-4 md:px-6 ${isLight ? 'border-slate-200 bg-white' : 'border-white/10 bg-white/5'}`}>
        <div className="mx-auto flex max-w-2xl flex-col gap-3">
          {callState === 'ended' ? (
            <div className="flex flex-col items-center gap-3 text-center">
              <p className={`text-sm font-black ${isLight ? 'text-slate-900' : 'text-white'}`}>
                {t(`Call ended · ${formatTime(callDuration)} · +${earnedXp} XP`, `Đã kết thúc · ${formatTime(callDuration)} · +${earnedXp} XP`)}
              </p>
              <div className="grid w-full grid-cols-2 gap-3">
                <button
                  onClick={() => context && startCall(context.scenario)}
                  className="rounded-xl bg-sky-500 px-4 py-3 text-xs font-black text-white hover:bg-sky-400"
                >
                  {t('Call again', 'Gọi lại')}
                </button>
                <button
                  onClick={exitToPicker}
                  className={`rounded-xl px-4 py-3 text-xs font-black ${isLight ? 'bg-slate-100 text-slate-700' : 'bg-white/10 text-slate-200'}`}
                >
                  {t('Other contexts', 'Ngữ cảnh khác')}
                </button>
              </div>
            </div>
          ) : (
            <>
              {isRecording && (
                <p className={`text-center text-xs italic ${isLight ? 'text-slate-600' : 'text-slate-300'}`}>
                  {transcript || t('"Say something in English…"', '"Nói gì đó bằng tiếng Anh…"')}
                </p>
              )}
              <div className="grid grid-cols-12 items-center gap-3">
                <div className="col-span-8">
                  {!isRecording ? (
                    <button
                      onClick={startRecording}
                      disabled={isProcessing || callState !== 'connected' || !!retryTarget || retryScoring}
                      className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 py-4 text-sm font-black uppercase tracking-wider text-white disabled:opacity-50 active:scale-95"
                    >
                      {isProcessing ? <Loader2 className="animate-spin" size={16} /> : <Mic size={16} />}
                      {isProcessing ? t('Thinking…', 'Đang nghĩ…') : t('Talk', 'Nói chuyện')}
                    </button>
                  ) : (
                    <button
                      onClick={stopRecording}
                      className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 py-4 text-sm font-black uppercase tracking-wider text-white active:scale-95"
                    >
                      <MicOff size={16} />
                      {t('Stop & send', 'Dừng & gửi')}
                    </button>
                  )}
                </div>
                <div className="col-span-4">
                  <button
                    onClick={hangUp}
                    className="flex w-full items-center justify-center gap-1.5 rounded-2xl bg-gradient-to-r from-rose-600 to-red-700 py-4 text-sm font-black uppercase tracking-wider text-white active:scale-95"
                  >
                    <PhoneOff size={16} />
                    {t('End', 'Gác máy')}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
