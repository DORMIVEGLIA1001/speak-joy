import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowLeft, Mic, Square, Volume2, Loader2, Sparkles, RefreshCw, AlertCircle, Award, ChevronRight,
} from 'lucide-react';
import { AppState } from '../types';
import {
  fetchScenarios,
  fetchScenarioDetail,
  scoreAttempt,
  blobToWav16k,
  type RolePlayScenario,
  type RolePlayScenarioDetail,
  type RolePlayLine,
  type RolePlayOption,
  type IpaScoreResult,
} from '../lib/roleplayApi';
import WordIpaScorePanel from './WordIpaScorePanel';

interface RolePlayTabProps {
  state: AppState;
  onUpdateStats: (update: Partial<AppState>) => void;
  currentChild?: { id: string; name: string; age?: number } | null;
  globalLang: 'en' | 'vi';
  globalTheme: 'dark' | 'light';
  onActiveSessionChange?: (isActive: boolean) => void;
}

type Phase = 'picker' | 'playing' | 'summary';

const XP_PER_GOOD_LINE = 8;
const PASS_THRESHOLD = 55; // overall score at/above which a line counts as "passed"

// Browser TTS — keep it simple and dependency-free for this tab.
function speak(text: string) {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'en-US';
  utterance.rate = 0.9;
  window.speechSynthesis.speak(utterance);
}

export default function RolePlayTab({
  state,
  onUpdateStats,
  currentChild,
  globalLang,
  globalTheme,
  onActiveSessionChange,
}: RolePlayTabProps) {
  void state;
  const isLight = globalTheme === 'light';
  const t = (en: string, vi: string) => (globalLang === 'en' ? en : vi);

  const [phase, setPhase] = useState<Phase>('picker');
  const [scenarios, setScenarios] = useState<RolePlayScenario[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [detail, setDetail] = useState<RolePlayScenarioDetail | null>(null);
  const [scriptIndex, setScriptIndex] = useState(0);
  const [lineIndex, setLineIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);

  const [isRecording, setIsRecording] = useState(false);
  const [isScoring, setIsScoring] = useState(false);
  const [scoreResult, setScoreResult] = useState<IpaScoreResult | null>(null);
  const [passedCount, setPassedCount] = useState(0);
  const [attemptedCount, setAttemptedCount] = useState(0);
  const [earnedXp, setEarnedXp] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    onActiveSessionChange?.(phase === 'playing');
  }, [phase, onActiveSessionChange]);

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
        if (!cancelled) setError(err?.message || t('Could not load scenarios', 'Không tải được chủ đề'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentChild?.age]);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    };
  }, []);

  const currentScript = detail?.scripts[scriptIndex];
  const currentLine: RolePlayLine | undefined = currentScript?.lines[lineIndex];

  const openScenario = async (slug: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchScenarioDetail(slug);
      setDetail(data);
      setScriptIndex(0);
      setLineIndex(0);
      setSelectedOption(null);
      setScoreResult(null);
      setPassedCount(0);
      setAttemptedCount(0);
      setEarnedXp(0);
      setPhase('playing');
      const firstLine = data.scripts[0]?.lines[0];
      if (firstLine) setTimeout(() => speak(firstLine.aiPromptEn), 400);
    } catch (err: any) {
      setError(err?.message || t('Could not open scenario', 'Không mở được chủ đề'));
    } finally {
      setLoading(false);
    }
  };

  const backToPicker = () => {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    setPhase('picker');
    setDetail(null);
  };

  const startRecording = async () => {
    if (selectedOption === null || isScoring) return;
    setScoreResult(null);
    audioChunksRef.current = [];
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        void scoreRecording();
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error('Mic access denied:', err);
      setError(t('Please allow microphone access.', 'Vui lòng cho phép dùng micro.'));
    }
  };

  const stopRecording = () => {
    if (!isRecording) return;
    setIsRecording(false);
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') recorder.stop();
  };

  const scoreRecording = useCallback(async () => {
    if (!currentLine || selectedOption === null) return;
    const option = currentLine.options[selectedOption];
    const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
    if (blob.size === 0) return;

    setIsScoring(true);
    setError(null);
    try {
      const wav = await blobToWav16k(blob);
      const result = await scoreAttempt(currentLine.id, wav, selectedOption, option.text);
      setScoreResult(result);
      setAttemptedCount((n) => n + 1);
      if (result.overall_score >= PASS_THRESHOLD) {
        setPassedCount((n) => n + 1);
        setEarnedXp((xp) => xp + XP_PER_GOOD_LINE);
      }
    } catch (err: any) {
      setError(err?.message || t('Could not score your recording. Try again.', 'Chưa chấm được. Thử lại nhé.'));
    } finally {
      setIsScoring(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentLine, selectedOption]);

  const advance = () => {
    if (!detail || !currentScript) return;
    setSelectedOption(null);
    setScoreResult(null);

    if (lineIndex + 1 < currentScript.lines.length) {
      const next = currentScript.lines[lineIndex + 1];
      setLineIndex(lineIndex + 1);
      setTimeout(() => speak(next.aiPromptEn), 300);
      return;
    }
    if (scriptIndex + 1 < detail.scripts.length) {
      const nextScript = detail.scripts[scriptIndex + 1];
      setScriptIndex(scriptIndex + 1);
      setLineIndex(0);
      const next = nextScript.lines[0];
      if (next) setTimeout(() => speak(next.aiPromptEn), 300);
      return;
    }
    // Finished the scenario — award XP once and show the summary.
    if (earnedXp > 0) onUpdateStats({ xp: (state.xp || 0) + earnedXp });
    setPhase('summary');
    onActiveSessionChange?.(false);
  };

  // ── Picker ───────────────────────────────────────────────────────────────
  if (phase === 'picker') {
    return (
      <div className="space-y-5">
        <div>
          <h2 className={`text-xl font-black ${isLight ? 'text-slate-900' : 'text-white'}`}>
            {t('Role-play', 'Nhập vai')}
          </h2>
          <p className={`text-sm ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
            {t('Pick a scene, listen to Sunny, then say your answer out loud.',
              'Chọn một tình huống, nghe Sunny nói, rồi nói câu trả lời của con.')}
          </p>
        </div>

        {loading && (
          <div className="flex items-center gap-2 text-sm text-slate-400">
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
          {scenarios.map((scenario) => (
            <button
              key={scenario.slug}
              onClick={() => openScenario(scenario.slug)}
              className={`flex flex-col gap-2 rounded-[18px] border p-4 text-left transition-all active:scale-[0.98] ${
                isLight
                  ? 'border-slate-200 bg-white hover:border-sky-300 hover:shadow-md'
                  : 'border-white/10 bg-white/5 hover:border-sky-400/40 hover:bg-white/10'
              }`}
            >
              <span className="text-3xl">{scenario.emoji || '🎭'}</span>
              <span className={`text-base font-black ${isLight ? 'text-slate-900' : 'text-white'}`}>
                {t(scenario.titleEn, scenario.titleVi)}
              </span>
              <span className={`text-xs ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                {t(scenario.personaEn || '', scenario.personaVi || '')}
              </span>
              <span className="mt-1 text-[11px] font-bold text-sky-500">
                {scenario.scriptCount} {t('scripts', 'kịch bản')}
              </span>
            </button>
          ))}
        </div>

        {!loading && scenarios.length === 0 && !error && (
          <p className="text-sm text-slate-400">{t('No scenarios yet.', 'Chưa có chủ đề nào.')}</p>
        )}
      </div>
    );
  }

  // ── Summary ──────────────────────────────────────────────────────────────
  if (phase === 'summary') {
    return (
      <div className="flex flex-col items-center gap-5 py-10 text-center">
        <div className="rounded-3xl bg-amber-400/15 p-5 text-amber-400">
          <Award className="h-12 w-12" />
        </div>
        <h2 className={`text-2xl font-black ${isLight ? 'text-slate-900' : 'text-white'}`}>
          {t('Great job!', 'Giỏi quá!')}
        </h2>
        <p className={`text-sm ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
          {t(
            `You said ${passedCount}/${attemptedCount} lines well and earned ${earnedXp} XP.`,
            `Con nói tốt ${passedCount}/${attemptedCount} câu và nhận ${earnedXp} XP.`,
          )}
        </p>
        <div className="flex gap-3">
          <button
            onClick={() => detail && openScenario(detail.slug)}
            className="rounded-2xl bg-sky-500 px-5 py-3 text-sm font-black text-white hover:bg-sky-400"
          >
            {t('Play again', 'Chơi lại')}
          </button>
          <button
            onClick={backToPicker}
            className={`rounded-2xl px-5 py-3 text-sm font-black ${
              isLight ? 'bg-slate-100 text-slate-700 hover:bg-slate-200' : 'bg-white/10 text-slate-200 hover:bg-white/20'
            }`}
          >
            {t('Other scenes', 'Chủ đề khác')}
          </button>
        </div>
      </div>
    );
  }

  // ── Playing ──────────────────────────────────────────────────────────────
  const totalLines = detail?.scripts.reduce((sum, s) => sum + s.lines.length, 0) || 0;
  const doneLines =
    (detail?.scripts.slice(0, scriptIndex).reduce((sum, s) => sum + s.lines.length, 0) || 0) + lineIndex;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <button
          onClick={backToPicker}
          className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold ${
            isLight ? 'bg-slate-100 text-slate-600 hover:bg-slate-200' : 'bg-white/10 text-slate-300 hover:bg-white/20'
          }`}
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          {t('Back', 'Quay lại')}
        </button>
        <span className={`text-xs font-bold ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
          {detail?.emoji} {t(detail?.titleEn || '', detail?.titleVi || '')} · {doneLines + 1}/{totalLines}
        </span>
      </div>

      {/* Sunny's line */}
      <div className={`rounded-[20px] border p-5 ${isLight ? 'border-sky-200 bg-sky-50' : 'border-sky-400/20 bg-sky-400/10'}`}>
        <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.16em] text-sky-500">
          <Sparkles className="h-3.5 w-3.5" />
          {t('Sunny says', 'Sunny nói')}
        </div>
        <p className={`mt-2 text-lg font-black ${isLight ? 'text-slate-900' : 'text-white'}`}>
          {currentLine?.aiPromptEn}
        </p>
        {currentLine?.aiPromptVi && (
          <p className={`mt-1 text-xs italic ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
            {currentLine.aiPromptVi}
          </p>
        )}
        <button
          onClick={() => currentLine && speak(currentLine.aiPromptEn)}
          className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-sky-500 hover:text-sky-400"
        >
          <Volume2 className="h-3.5 w-3.5" />
          {t('Hear again', 'Nghe lại')}
        </button>
      </div>

      {/* 4 answer options */}
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        {currentLine?.options.map((option: RolePlayOption, index: number) => {
          const isSelected = selectedOption === index;
          return (
            <motion.button
              key={index}
              whileTap={{ scale: 0.97 }}
              onClick={() => {
                if (isRecording || isScoring) return;
                setSelectedOption(index);
                setScoreResult(null);
                speak(option.text);
              }}
              className={`rounded-[16px] border p-3 text-left transition-all ${
                isSelected
                  ? isLight
                    ? 'border-sky-400 bg-sky-100 ring-2 ring-sky-300'
                    : 'border-sky-400/60 bg-sky-400/20 ring-2 ring-sky-400/40'
                  : isLight
                    ? 'border-slate-200 bg-white hover:border-slate-300'
                    : 'border-white/10 bg-white/5 hover:bg-white/10'
              }`}
            >
              <span className={`block text-sm font-black ${isLight ? 'text-slate-900' : 'text-white'}`}>
                {option.text}
              </span>
              <span className={`block text-[11px] ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                {option.translate}
              </span>
            </motion.button>
          );
        })}
      </div>

      {/* Record / score controls */}
      {selectedOption !== null && (
        <div className="flex flex-col items-center gap-3">
          {!isRecording ? (
            <button
              onClick={startRecording}
              disabled={isScoring}
              className="inline-flex items-center gap-2 rounded-2xl bg-emerald-500 px-6 py-3.5 text-sm font-black uppercase tracking-wider text-white hover:bg-emerald-400 disabled:opacity-50"
            >
              {isScoring ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mic className="h-4 w-4" />}
              {isScoring
                ? t('Scoring…', 'Đang chấm…')
                : t('Say it', 'Nói câu này')}
            </button>
          ) : (
            <button
              onClick={stopRecording}
              className="inline-flex items-center gap-2 rounded-2xl bg-rose-500 px-6 py-3.5 text-sm font-black uppercase tracking-wider text-white hover:bg-rose-400"
            >
              <Square className="h-4 w-4" />
              {t('Stop', 'Dừng')}
            </button>
          )}
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-rose-400/30 bg-rose-400/10 px-3 py-2 text-sm text-rose-500">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      )}

      {/* While Allosaurus scores, show the sentence the child just said with a "scoring"
          state instead of a blank wait — the same trick free-talk uses so the screen never
          freezes. We already know the target text (the picked option), so we can echo it
          immediately and swap in the per-word result when it lands. */}
      {isScoring && selectedOption !== null && currentLine && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className={`rounded-[18px] border p-4 ${isLight ? 'border-slate-200 bg-white' : 'border-white/10 bg-white/5'}`}
        >
          <div className="mb-2 flex items-center gap-2 text-[11px] font-black uppercase tracking-wider text-sky-500">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {t('Scoring your pronunciation…', 'Đang chấm phát âm của con…')}
          </div>
          <p className={`text-sm font-black ${isLight ? 'text-slate-900' : 'text-white'}`}>
            {currentLine.options[selectedOption]?.text}
          </p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {(currentLine.options[selectedOption]?.text || '')
              .split(/\s+/)
              .filter(Boolean)
              .map((word, index) => (
                <span
                  key={index}
                  className={`animate-pulse rounded-lg border px-2 py-1 text-xs font-black ${
                    isLight ? 'border-slate-200 bg-slate-100 text-slate-400' : 'border-white/10 bg-white/5 text-slate-500'
                  }`}
                >
                  {word}
                </span>
              ))}
          </div>
        </motion.div>
      )}

      {/* Per-word IPA score */}
      <AnimatePresence>
        {scoreResult && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            <WordIpaScorePanel
              overallScore={scoreResult.overall_score}
              words={scoreResult.words}
              spokenIpa={scoreResult.spoken_ipa}
              globalLang={globalLang}
              globalTheme={globalTheme}
              onHearWord={(word) => speak(word)}
            />
            <div className="mt-3 flex justify-end gap-2">
              <button
                onClick={() => {
                  setScoreResult(null);
                  setSelectedOption((prev) => prev);
                }}
                className={`rounded-xl px-4 py-2 text-xs font-bold ${
                  isLight ? 'bg-slate-100 text-slate-600 hover:bg-slate-200' : 'bg-white/10 text-slate-300 hover:bg-white/20'
                }`}
              >
                <RefreshCw className="mr-1 inline h-3.5 w-3.5" />
                {t('Try again', 'Thử lại')}
              </button>
              <button
                onClick={advance}
                className="inline-flex items-center gap-1 rounded-xl bg-sky-500 px-4 py-2 text-xs font-black text-white hover:bg-sky-400"
              >
                {t('Next', 'Tiếp theo')}
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
