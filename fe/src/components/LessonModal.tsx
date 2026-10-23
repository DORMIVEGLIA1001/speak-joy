import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Heart, CheckCircle2, AlertCircle, Mic, MicOff, Volume2 } from 'lucide-react';
import { Lesson } from '../types';
import { playCorrectSound, playIncorrectSound, playAppSound } from '../data';

interface LessonModalProps {
  lesson: Lesson;
  globalLang: 'en' | 'vi';
  onClose: () => void;
  onFinish: (xpEarned: number, gemsEarned: number, failed: boolean) => void | Promise<void>;
}

const CONFETTI_COLORS = ['#58cc02', '#ff4b4b', '#ff9600', '#1cb0f6', '#ffc800', '#df52ff'];

function ConfettiShower() {
  const particles = Array.from({ length: 30 }).map((_, idx) => ({
    id: idx,
    x: Math.random() * 80 + 10,
    color: CONFETTI_COLORS[idx % CONFETTI_COLORS.length],
    size: Math.random() * 8 + 6,
    delay: Math.random() * 0.15,
    angle: Math.random() * 360,
    distX: (Math.random() - 0.5) * 500,
    distY: -(Math.random() * 400 + 200),
  }));

  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-[1001]">
      {particles.map((particle) => (
        <motion.div
          key={particle.id}
          initial={{
            opacity: 1,
            scale: 0.2,
            x: `${particle.x}vw`,
            y: '100vh',
            rotate: 0,
          }}
          animate={{
            opacity: [1, 1, 0.8, 0],
            scale: [0.2, 1.2, 1.0, 0.4],
            x: `calc(${particle.x}vw + ${particle.distX}px)`,
            y: `calc(100vh + ${particle.distY}px)`,
            rotate: particle.angle + 360,
          }}
          transition={{
            duration: 1.8,
            delay: particle.delay,
            ease: 'easeOut',
          }}
          className="absolute rounded-full"
          style={{
            backgroundColor: particle.color,
            width: particle.size,
            height: particle.size,
            boxShadow: `0 0 8px ${particle.color}`,
          }}
        />
      ))}
    </div>
  );
}

const normalizeText = (value: string) =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s]|_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export default function LessonModal({ lesson, globalLang, onClose, onFinish }: LessonModalProps) {
  const [currentIdx, setCurrentIdx] = useState(0);
  const [selection, setSelection] = useState<string | null>(null);
  const [isAnswered, setIsAnswered] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [heartsLeft, setHeartsLeft] = useState(5);
  const [isRecording, setIsRecording] = useState(false);
  const [spokenText, setSpokenText] = useState('');
  const [speechError, setSpeechError] = useState<string | null>(null);
  const [isFinishing, setIsFinishing] = useState(false);
  const recognitionRef = useRef<any>(null);
  const isEnglish = globalLang === 'en';

  const question = lesson.questions[currentIdx];

  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = 'en-US';

      recognition.onstart = () => {
        setIsRecording(true);
        setSpeechError(null);
        setSpokenText(isEnglish ? 'Listening to the child...' : 'Đang lắng nghe bé nói...');
      };

      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setSpokenText(transcript);
        processSpokenWords(transcript);
      };

      recognition.onerror = () => {
        setSpeechError(
          isEnglish
            ? 'The microphone is unavailable right now. The lesson will switch to a safe simulation mode.'
            : 'Không thể dùng micro lúc này. Hệ thống sẽ chuyển sang mô phỏng an toàn.'
        );
        setIsRecording(false);
      };

      recognition.onend = () => {
        setIsRecording(false);
      };

      recognitionRef.current = recognition;
    }

    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {
          // noop
        }
      }
    };
  }, [currentIdx]);

  const speakPrompt = (text: string) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'en-US';
      utterance.rate = 0.85;
      window.speechSynthesis.speak(utterance);
    }
  };

  const processSpokenWords = (transcript: string) => {
    const spoken = normalizeText(transcript);
    const expected = normalizeText(question.correctAnswer);
    const spokenWords = spoken.split(' ').filter(Boolean);
    const expectedWords = expected.split(' ').filter(Boolean);
    const matchedWordCount = spokenWords.filter((word) => expectedWords.includes(word)).length;
    const matched =
      spoken.includes(expected) ||
      expected.includes(spoken) ||
      (expectedWords.length > 0 && matchedWordCount / expectedWords.length >= 0.6);

    setIsAnswered(true);
    if (matched) {
      setIsCorrect(true);
      playCorrectSound();
      return;
    }

    setIsCorrect(false);
    setHeartsLeft((prev) => Math.max(0, prev - 1));
    playIncorrectSound();
  };

  const startVoiceRecording = () => {
    playAppSound(700, 'sine', 0.08);
    setSpokenText('');
    setSpeechError(null);

    if (recognitionRef.current) {
      try {
        recognitionRef.current.start();
        return;
      } catch {
        recognitionRef.current.stop();
      }
    }

    setIsRecording(true);
    setSpokenText(isEnglish ? 'Simulating voice capture...' : 'Đang mô phỏng ghi âm cho bé...');
    window.setTimeout(() => {
      setIsRecording(false);
      setSpokenText(question.correctAnswer);
      processSpokenWords(question.correctAnswer);
    }, 2000);
  };

  const handleMultipleSelect = (option: string) => {
    if (isAnswered) {
      return;
    }
    playAppSound(500, 'sine', 0.05);
    setSelection(option);
  };

  const handleCheckAnswer = () => {
    if (isAnswered) {
      if (currentIdx + 1 < lesson.questions.length) {
        setCurrentIdx((prev) => prev + 1);
        setSelection(null);
        setIsAnswered(false);
        setIsCorrect(false);
        setSpokenText('');
        setSpeechError(null);
        return;
      }

      setIsFinishing(true);
      void Promise.resolve(
        onFinish(lesson.points, Math.floor(lesson.points * 1.5), heartsLeft === 0)
      ).finally(() => setIsFinishing(false));
      return;
    }

    if (question.type === 'multiple') {
      if (!selection) {
        return;
      }

      const correct = selection === question.correctAnswer;
      setIsAnswered(true);
      setIsCorrect(correct);

      if (correct) {
        playCorrectSound();
      } else {
        setHeartsLeft((prev) => Math.max(0, prev - 1));
        playIncorrectSound();
      }
    }
  };

  const handleExitClick = () => {
    if (
      window.confirm(
        isEnglish
          ? 'Are you sure you want to stop this lesson? Progress in this attempt will not be saved.'
          : 'Bạn có chắc muốn dừng bài học không? Tiến trình của lượt này sẽ không được giữ lại.'
      )
    ) {
      onClose();
    }
  };

  const progressPct = (currentIdx / lesson.questions.length) * 100;

  return (
    <div className="fixed inset-0 bg-[#0e181f] z-[999] flex flex-col font-sans select-none overflow-y-auto w-full h-full" style={{ backgroundImage: 'radial-gradient(ellipse at center, rgba(255,69,0,0.15) 0%, rgba(255,150,0,0.05) 50%, transparent 100%)' }}>
      {isAnswered && isCorrect && <ConfettiShower />}

      <div className="max-w-4xl w-full mx-auto px-6 py-6 flex items-center justify-between gap-6">
        <button onClick={handleExitClick} className="text-gray-400 hover:text-white cursor-pointer transition p-1">
          <X className="w-6 h-6 stroke-[3]" />
        </button>

        <div className="flex-1 h-4 bg-[#202f36] rounded-full overflow-hidden border border-[#37464f]">
          <div
            className="h-full bg-gradient-to-r from-[#1cb0f6] via-[#df52ff] to-[#58cc02] transition-all duration-300 rounded-full"
            style={{ width: `${progressPct || 5}%` }}
          />
        </div>

        <div className="flex items-center gap-1.5 text-[#ff4b4b] font-bold text-sm">
          <Heart className="w-6 h-6 fill-[#ff4b4b] stroke-none animate-pulse" />
          <span>{heartsLeft}</span>
        </div>
      </div>

      <div className="flex-1 max-w-2xl w-full mx-auto px-6 py-4 flex flex-col justify-start">
        <AnimatePresence mode="wait">
          {heartsLeft === 0 ? (
            <motion.div
              key="game-over"
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="text-center py-10 space-y-6"
            >
              <span className="text-7xl">💔</span>
              <h2 className="text-2xl font-black text-[#ff4b4b]">{isEnglish ? 'Out of hearts!' : 'Bé hết tim rồi!'}</h2>
              <p className="text-gray-300 text-sm max-w-sm mx-auto leading-relaxed">
                {isEnglish
                  ? 'Take a short break, then come back and try the lesson again with fresh energy.'
                  : 'Mình nghỉ một chút nhé. Sau đó bé có thể quay lại học tiếp với tinh thần thật vui.'}
              </p>
              <button
                onClick={onClose}
                className="duo-btn-raised w-full text-white font-extrabold py-3.5 rounded-md uppercase text-xs tracking-wider cursor-pointer hover:brightness-110 active:brightness-95"
              >
                {isEnglish ? 'Back to lesson map' : 'Quay lại bản đồ học'}
              </button>
            </motion.div>
          ) : (
            <motion.div
              key={currentIdx}
              initial={{ x: 50, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -50, opacity: 0 }}
              className="space-y-6 flex-1 flex flex-col justify-start"
            >
              <div className="space-y-1">
                <span className="text-[11px] font-extrabold uppercase text-[#1cb0f6] tracking-wider block">
                  {isEnglish ? 'Question' : 'Câu hỏi'} {currentIdx + 1}/{lesson.questions.length} • {question.type === 'speak' ? (isEnglish ? 'Speaking' : 'Luyện nói') : isEnglish ? 'Quiz' : 'Trắc nghiệm'}
                </span>
                <h3 className="text-xl font-bold text-white tracking-tight leading-snug">{question.prompt}</h3>
                {question.vietnamesePrompt && (
                  <p className="text-xs text-[#df52ff] font-semibold bg-[#202f36]/40 p-2 rounded inline-block">
                    {isEnglish ? 'Hint:' : 'Gợi ý cho bé:'} {question.vietnamesePrompt}
                  </p>
                )}
              </div>

              {question.type === 'multiple' && (
                <div className="grid grid-cols-1 gap-3 pt-2">
                  {question.options?.map((option, optionIndex) => {
                    const isSelected = selection === option;
                    return (
                      <button
                        key={option}
                        disabled={isAnswered}
                        onClick={() => handleMultipleSelect(option)}
                        className={`w-full border-2 rounded-md p-4 text-left text-sm font-semibold flex items-center justify-between cursor-pointer transition ${
                          isSelected
                            ? 'bg-[#182830] border-[#1cb0f6] text-[#1cb0f6]'
                            : 'border-[#37464f] hover:bg-[#131f24] text-white'
                        }`}
                        style={{
                          boxShadow: isSelected ? '0 4px 0 #1899d6' : '0 4px 0 #20313a',
                        }}
                      >
                        <span className="flex items-center gap-3">
                          <span className="w-6 h-6 rounded-md bg-[#202f36] border border-[#37464f] text-gray-400 text-xs font-bold flex items-center justify-center">
                            {optionIndex + 1}
                          </span>
                          {option}
                        </span>

                        <Volume2
                          className="w-4 h-4 text-gray-500 hover:text-white cursor-pointer"
                          onClick={(event) => {
                            event.stopPropagation();
                            speakPrompt(option);
                          }}
                        />
                      </button>
                    );
                  })}
                </div>
              )}

              {question.type === 'speak' && (
                <div className="space-y-6 pt-2 text-center">
                  <div className="bg-[#131f24] rounded-md border border-[#37464f] p-5 space-y-2 relative">
                    <button
                      onClick={() => speakPrompt(question.correctAnswer)}
                      className="absolute top-3 right-3 p-2 bg-[#202f36] hover:bg-[#37464f] rounded-full text-[#1cb0f6] transition"
                    >
                      <Volume2 className="w-5 h-5" />
                    </button>
                    <div className="text-xl font-black text-white px-8">"{question.prompt}"</div>
                    {question.spokenPhonetics && (
                      <div className="text-xs font-mono text-gray-400">{isEnglish ? 'Phonetics:' : 'Phiên âm:'} {question.spokenPhonetics}</div>
                    )}
                  </div>

                  <div className="flex flex-col items-center justify-center space-y-3">
                    <button
                      onClick={startVoiceRecording}
                      disabled={isAnswered || isRecording}
                      className={`w-20 h-20 rounded-full flex items-center justify-center border-4 relative z-10 shadow-2xl transition cursor-pointer hover:brightness-110 active:scale-95 duration-200 ${
                        isRecording ? 'bg-[#ff4b4b] border-red-200' : 'bg-[#1cb0f6] border-blue-200'
                      }`}
                    >
                      {isRecording ? (
                        <MicOff className="w-8 h-8 text-white" />
                      ) : (
                        <Mic className="w-8 h-8 text-white fill-white" />
                      )}
                    </button>
                    <p className="text-xs font-bold uppercase text-gray-400 tracking-wider">
                      {isRecording ? (isEnglish ? 'Speak loudly now!' : 'Bé nói to lên nhé!') : isEnglish ? 'Tap the mic to start speaking' : 'Nhấn mic để bắt đầu nói'}
                    </p>
                  </div>

                  {spokenText && (
                    <div className="p-3 bg-black/40 rounded border border-[#202f36] max-w-sm mx-auto">
                      <div className="text-[10px] font-bold text-gray-500 uppercase">{isEnglish ? 'System heard:' : 'Hệ thống nghe được:'}</div>
                      <p className="text-sm italic text-yellow-300 font-semibold mt-1">"{spokenText}"</p>
                    </div>
                  )}

                  {speechError && <p className="text-xs text-[#ff4b4b] bg-red-950/20 p-2 rounded">{speechError}</p>}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div
        className={`mt-auto border-t py-6 px-6 ${
          isAnswered
            ? isCorrect
              ? 'bg-[#18281a] border-emerald-800'
              : 'bg-[#291717] border-red-900'
            : 'bg-[#131f24] border-[#37464f]'
        }`}
      >
        <div className="max-w-xl w-full mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex-1">
            <AnimatePresence mode="wait">
              {isAnswered ? (
                <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} className="flex items-start gap-3">
                  {isCorrect ? (
                    <>
                      <CheckCircle2 className="w-6 h-6 text-[#df52ff] mt-0.5 flex-shrink-0" />
                      <div>
                        <h4 className="font-extrabold text-[#df52ff] text-sm uppercase">{isEnglish ? 'Correct!' : 'Đúng rồi!'}</h4>
                        <p className="text-xs text-gray-300 leading-tight">
                          {question.vietnameseAnswerExplanation || 'Bé làm rất tốt, mình sang câu tiếp theo nhé.'}
                        </p>
                      </div>
                    </>
                  ) : (
                    <>
                      <AlertCircle className="w-6 h-6 text-[#ff4b4b] mt-0.5 flex-shrink-0" />
                      <div>
                        <h4 className="font-extrabold text-[#ff4b4b] text-sm uppercase">{isEnglish ? 'Not quite right' : 'Chưa đúng'}</h4>
                        <p className="text-xs text-gray-300 leading-tight">
                          {isEnglish ? (
                            <>The correct answer is <strong className="text-emerald-400">"{question.correctAnswer}"</strong>.</>
                          ) : (
                            <>Đáp án đúng là <strong className="text-emerald-400">"{question.correctAnswer}"</strong>.</>
                          )}
                        </p>
                      </div>
                    </>
                  )}
                </motion.div>
              ) : (
                <div className="text-xs text-gray-400 leading-tight py-2">
                  {question.type === 'speak'
                    ? isEnglish
                      ? 'Listen to the sample, then speak clearly so the system can assess pronunciation.'
                      : 'Nghe mẫu, sau đó cho bé nói to và rõ để hệ thống chấm phát âm.'
                    : isEnglish
                      ? 'Read the question carefully and choose the best answer.'
                      : 'Đọc kỹ câu hỏi rồi chọn đáp án phù hợp nhất.'}
                </div>
              )}
            </AnimatePresence>
          </div>

          <button
            onClick={handleCheckAnswer}
            disabled={isFinishing || (!isAnswered && question.type === 'multiple' && !selection)}
            className={`px-8 py-3.5 rounded-md font-extrabold text-xs tracking-wider uppercase cursor-pointer select-none border-b-4 transition disabled:cursor-not-allowed ${
              isAnswered
                ? isCorrect
                  ? 'bg-[#df52ff] border-[#ab2ad1] text-white'
                  : 'bg-[#ff4b4b] border-[#d91b1b] text-white'
                : 'bg-[#df52ff] text-white border-[#ab2ad1] disabled:bg-[#202f36] disabled:text-[#37464f] disabled:border-b-0'
            }`}
          >
            {isFinishing
              ? (isEnglish ? 'Saving...' : 'Đang lưu...')
              : isAnswered
                ? (isEnglish ? 'Continue' : 'Tiếp tục')
                : question.type === 'speak'
                  ? (isEnglish ? 'Wait for speech' : 'Chờ bé nói')
                  : isEnglish ? 'Check answer' : 'Kiểm tra'}
          </button>
        </div>
      </div>
    </div>
  );
}
