import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  MessageSquare, Mic, MicOff, Send, Volume2, Sparkles, AlertCircle, RefreshCw, Star,
  Phone, PhoneOff, VolumeX, HelpCircle, User, MessageCircle, Play, Square, Languages,
  Sliders, Check, History, X
} from 'lucide-react';
import { AppState } from '../types';
import { playAppSound } from '../data';
import SessionRewardMascot from './SessionRewardMascot';
import SunnyMascot from './SunnyMascot';
import SpeakingTranscriptPanel from './SpeakingTranscriptPanel';
import SpeakingCorrectionPanel from './SpeakingCorrectionPanel';
import {
  normalizeHistoryTranscript as normalizeSharedHistoryTranscript,
  splitHistoryReplyForDisplay,
  type HistoryTranscriptSourceMessage,
} from '../lib/historyTranscript';
import {
  buildChatSilencePrompt,
  normalizeSpeakingCoachPayload,
  type ChatSilencePrompt,
  type GrammarReview,
  type GrammarScore,
  type SpeakingCorrection,
  type WordStatus,
} from '../lib/speakingCoach';
import { shuffleArray } from '../lib/shuffle';
import {
  TOPIC_CATALOG,
  TOPIC_SCENE_ICONS,
  promptsForAge,
  type TopicPrompt,
} from '../lib/topicCatalog';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  translation?: string;
  timestamp: Date;
  wordStatuses?: WordStatus[];  // IPA scoring — only on user messages
  score?: number;               // 0-100, only when wordStatuses present
  corrections?: SpeakingCorrection[];
  askRepeat?: string;
  pronunciationScore?: number;
  grammarReview?: GrammarReview;
  grammarScore?: GrammarScore;
}

interface ConversationHistoryItem {
  id: string;
  status: string;
  startedAt: string;
  endedAt?: string | null;
  summary?: string | null;
  conversationTranscript?: HistoryTranscriptSourceMessage[] | null;
  recordingUrl?: string | null;
}

interface AiTalkTabProps {
  state: AppState;
  onUpdateStats: (update: Partial<AppState>) => void;
  currentUser?: { id: string; email: string } | null;
  currentChild?: { id: string; name: string; age?: number } | null;
  onProgressSync?: () => Promise<void> | void;
  onUsageSync?: () => void;
  globalLang: 'en' | 'vi';
  globalTheme: 'dark' | 'light';
  onActiveSessionChange?: (isActive: boolean) => void;
}

type AssistantVoiceSource = 'browser';

const XP_PER_UTTERANCE = 5;

const calculateSessionScore = (mouthCount: number): number =>
  Math.min(100, Math.max(0, Math.floor(mouthCount)) * XP_PER_UTTERANCE);

// ── Conversation-topic catalog ──────────────────────────────────────────────
// The full catalog (topic list, greetings, quick-prompt suggestions and the
// mascot scene icons) lives in ../lib/topicCatalog so the large bilingual prompt
// data does not bloat this component. Each prompt carries a `level` so the
// suggestions can be filtered by the child's age (notes 14/7 · mục 2.2 / 2.6).
const TOPIC_PROMPTS: Record<string, TopicPrompt[]> = Object.fromEntries(
  TOPIC_CATALOG.map((topic) => [topic.id, topic.prompts]),
);

interface AudioVisualizerProps {
  isActive: boolean;
  color?: string;
  // When true the bars animate without opening the microphone. On Android
  // the mic is exclusive, so a second getUserMedia stream here would starve
  // the SpeechRecognition engine and the child's voice is never captured.
  decorative?: boolean;
}

export function AudioVisualizer({ isActive, color = '#58cc02', decorative = false }: AudioVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const [dimensions, setDimensions] = useState({ width: 300, height: 48 });

  // Dynamically respond to canvas dimensions using ResizeObserver
  useEffect(() => {
    if (!containerRef.current) return;
    const resizeObserver = new ResizeObserver((entries) => {
      for (let entry of entries) {
        const { width, height } = entry.contentRect;
        setDimensions({
          width: Math.floor(width) || 300,
          height: Math.floor(height) || 48
        });
      }
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  useEffect(() => {
    if (isActive) {
      startVisualizer();
    } else {
      stopVisualizer();
    }

    return () => {
      stopVisualizer();
    };
  }, [isActive]);

  const startVisualizer = async () => {
    try {
      stopVisualizer();

      // Decorative mode: animate the bars WITHOUT opening the microphone. During
      // a call the mic is owned by the SpeechRecognition engine; on Android the
      // mic is exclusive, so a second getUserMedia stream here would starve that
      // engine and the child's voice would never be captured.
      const bufferLength = 32;
      const dataArray = new Uint8Array(bufferLength);

      if (!decorative) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true }).catch(() => null);
        if (!stream) {
          console.warn("Permission denied or microphone unavailable.");
          return;
        }
        streamRef.current = stream;

        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        const audioCtx = new AudioContextClass();
        audioContextRef.current = audioCtx;

        const source = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 64; // nice chunky voice visualizer bands
        analyser.smoothingTimeConstant = 0.6;
        source.connect(analyser);
        analyserRef.current = analyser;
      }

      const draw = () => {
        if (!canvasRef.current) return;
        animationFrameRef.current = requestAnimationFrame(draw);

        if (analyserRef.current) {
          analyserRef.current.getByteFrequencyData(dataArray);
        } else {
          dataArray.fill(0);
        }

        const currentCanvas = canvasRef.current;
        const width = currentCanvas.width;
        const height = currentCanvas.height;
        const currentCtx = currentCanvas.getContext('2d');
        if (!currentCtx) return;

        currentCtx.clearRect(0, 0, width, height);

        const barWidth = (width / bufferLength) * 1.5;
        let barHeight;
        let x = 0;

        for (let i = 0; i < bufferLength; i++) {
          const rawValue = dataArray[i];
          // Add a gentle floating wave idle noise when microphone is active but silent
          const value = isActive && rawValue > 8 ? rawValue : Math.sin(Date.now() * 0.005 + i) * 6 + 10;

          barHeight = (value / 255) * height * 0.85;
          if (barHeight < 4) barHeight = 4;

          const gradient = currentCtx.createLinearGradient(0, height, 0, 0);
          gradient.addColorStop(0, color);
          gradient.addColorStop(0.5, color + 'cc');
          gradient.addColorStop(1, '#ffffff');

          currentCtx.fillStyle = gradient;
          const y = height / 2 - barHeight / 2; // vertically centered bar

          // Soft ambient glow when active & loud
          if (isActive && rawValue > 25) {
            currentCtx.shadowBlur = 8;
            currentCtx.shadowColor = color;
          } else {
            currentCtx.shadowBlur = 0;
          }

          // Defensive support check for roundRect (supported in all standard contemporary browser releases)
          currentCtx.beginPath();
          if (currentCtx.roundRect) {
            currentCtx.roundRect(x, y, barWidth - 3, barHeight, 3);
          } else {
            currentCtx.rect(x, y, barWidth - 3, barHeight);
          }
          currentCtx.fill();

          x += barWidth;
        }
      };

      draw();
    } catch (err) {
      console.warn("Failed startup of audio visualizer context:", err);
    }
  };

  const stopVisualizer = () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (streamRef.current) {
      try {
        streamRef.current.getTracks().forEach(track => track.stop());
      } catch (e) { }
      streamRef.current = null;
    }
    if (audioContextRef.current) {
      try {
        if (audioContextRef.current.state !== 'closed') {
          audioContextRef.current.close();
        }
      } catch (e) { }
      audioContextRef.current = null;
    }
    analyserRef.current = null;

    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      }
    }
  };

  return (
    <div ref={containerRef} className="w-full h-full flex items-center justify-center relative bg-black/20 rounded-lg">
      <canvas
        ref={canvasRef}
        width={dimensions.width}
        height={dimensions.height}
        className="block pointer-events-none max-w-full"
      />
    </div>
  );
}

function MascotAmbientDecor({ isLight, topicId }: { isLight: boolean; topicId?: string }) {
  // Topic scene: swap the default sparkles for topic-themed emoji behind the mascot (Req 2.4).
  const sceneIcons = topicId ? TOPIC_SCENE_ICONS[topicId] : undefined;
  if (sceneIcons && sceneIcons.length > 0) {
    return (
      <div className="pointer-events-none absolute inset-[-18%] z-0 overflow-visible">
        {sceneIcons.slice(0, 6).map((icon, index) => (
          <div key={index} className={`mascot-star mascot-star-${index + 1}`}>{icon}</div>
        ))}
      </div>
    );
  }

  if (isLight) {
    return (
      <div className="pointer-events-none absolute inset-[-16%] z-0 overflow-visible">
        <div className="mascot-star mascot-star-1" style={{ color: '#ffb700' }}>✨</div>
        <div className="mascot-star mascot-star-2" style={{ color: '#ff4b72' }}>🌸</div>
        <div className="mascot-star mascot-star-3" style={{ color: '#ff9600' }}>✨</div>
        <div className="mascot-star mascot-star-4" style={{ color: '#ff5db1' }}>🌸</div>
        <div className="mascot-star mascot-star-5" style={{ color: '#ffd60a' }}>✨</div>
        <div className="mascot-star mascot-star-6" style={{ color: '#ffccd5' }}>🌸</div>
      </div>
    );
  }

  return (
    <div className="pointer-events-none absolute inset-[-18%] z-0 overflow-visible">
      <div className="mascot-star mascot-star-1">✦</div>
      <div className="mascot-star mascot-star-2">✧</div>
      <div className="mascot-star mascot-star-3">✦</div>
      <div className="mascot-star mascot-star-4">✧</div>
      <div className="mascot-star mascot-star-5">✦</div>
      <div className="mascot-star mascot-star-6">✧</div>
    </div>
  );
}

export default function AiTalkTab({
  state,
  onUpdateStats,
  currentUser = null,
  currentChild = null,
  onProgressSync,
  onUsageSync,
  globalLang,
  globalTheme,
  onActiveSessionChange,
}: AiTalkTabProps) {
  const [activeTabMode, setActiveTabMode] = useState<'chat' | 'call'>('call');
  const initialXpRef = useRef(state.xp);
  const initialGemsRef = useRef(state.gems);
  const [selectedTopic, setSelectedTopic] = useState<string>(() => localStorage.getItem('parent_chat_topic') || 'freetalk');
  const [isTopicMenuOpen, setIsTopicMenuOpen] = useState(false);
  const CONVERSATION_TOPICS = TOPIC_CATALOG.map((topic) => ({
    id: topic.id,
    label: `${globalLang === 'en' ? topic.labelEn : topic.labelVi} ${topic.emoji}`,
    desc: globalLang === 'en' ? topic.descEn : topic.descVi,
    topicName: topic.topicName,
    vocabulary: topic.vocabulary,
  }));

  const [revealedTranslations, setRevealedTranslations] = useState<Record<string, boolean>>({});
  const [isCallTranslationRevealed, setIsCallTranslationRevealed] = useState<boolean>(false);

  const voiceOnboardingKey = `voice_settings_seen_${currentUser?.id || currentUser?.email || 'guest'}`;
  const [showVoiceSettings, setShowVoiceSettings] = useState(() => !localStorage.getItem(voiceOnboardingKey));
  const [voiceRate, setVoiceRate] = useState<number>(() => {
    return Number(localStorage.getItem('voice_rate') || '1.0');
  });
  const [voicePitch, setVoicePitch] = useState<number>(() => {
    return Number(localStorage.getItem('voice_pitch') || '1.2');
  });
  const [selectedVoiceName, setSelectedVoiceName] = useState<string>(() => {
    const saved = localStorage.getItem('assistant_voice_id') || localStorage.getItem('voice_name');
    // Always use browser voice
    return saved && saved.startsWith('browser:') ? saved : 'browser:Google US English';
  });
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [historyItems, setHistoryItems] = useState<ConversationHistoryItem[]>([]);
  const [selectedHistory, setSelectedHistory] = useState<ConversationHistoryItem | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  useEffect(() => {
    if (currentChild?.id) {
      const childRate = localStorage.getItem(`voice_rate_${currentChild.id}`) || localStorage.getItem('voice_rate') || '1.0';
      const childPitch = localStorage.getItem(`voice_pitch_${currentChild.id}`) || localStorage.getItem('voice_pitch') || '1.2';
      const childVoice = localStorage.getItem(`assistant_voice_id_${currentChild.id}`) || localStorage.getItem('assistant_voice_id') || localStorage.getItem('voice_name') || '';
      setVoiceRate(Number(childRate));
      setVoicePitch(Number(childPitch));
      setSelectedVoiceName(childVoice);
    }
  }, [currentChild?.id]);

  const parseSelectedAssistantVoice = (value: string): { source: AssistantVoiceSource; id: string } => {
    let normalized = value.trim();
    let source: AssistantVoiceSource = 'browser';
    // Remove browser: prefix if present
    if (normalized.startsWith('browser:')) {
      normalized = normalized.slice('browser:'.length).trim();
    }
    return { source, id: normalized };
  };

  // ── End-session confirmation modal ──────────────────────────────────────────
  // pendingEndAction stores a callback to run when the user confirms "Kết thúc học"
  const [showEndSessionModal, setShowEndSessionModal] = useState(false);
  const pendingEndActionRef = useRef<(() => void) | null>(null);

  const loadConversationHistory = async () => {
    if (!currentChild) return;
    setShowHistory(true);
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const response = await fetch(`/api/children/${currentChild.id}/sessions?limit=30`, {
        credentials: 'include',
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.message || (globalLang === 'en' ? 'Unable to load conversation history.' : 'Không thể tải lịch sử trò chuyện.'));
      }
      const sessions = payload?.data?.sessions || payload?.sessions || [];
      const nextSessions = Array.isArray(sessions) ? sessions : [];
      setHistoryItems(nextSessions);
      setSelectedHistory((previous) => {
        if (nextSessions.length === 0) {
          return null;
        }
        if (previous && nextSessions.some((session) => session.id === previous.id)) {
          return nextSessions.find((session) => session.id === previous.id) || nextSessions[0];
        }
        return nextSessions[0];
      });
    } catch (error) {
      setSelectedHistory(null);
      setHistoryError(error instanceof Error ? error.message : (globalLang === 'en' ? 'Unable to load conversation history.' : 'Không thể tải lịch sử trò chuyện.'));
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    setShowVoiceSettings(!localStorage.getItem(voiceOnboardingKey));
  }, [voiceOnboardingKey]);

  useEffect(() => {
    const savedVoice = localStorage.getItem('assistant_voice_id') || localStorage.getItem('voice_name') || '';

    if ('speechSynthesis' in window) {
      const updateVoices = () => {
        const voices = window.speechSynthesis.getVoices();
        const englishVoices = voices.filter(v => {
          const lang = (v.lang || '').toLowerCase().replace('_', '-');
          return lang === 'en' || lang.startsWith('en-');
        });
        setAvailableVoices(englishVoices);

        if (!savedVoice && englishVoices.length > 0) {
          const defaultUS = englishVoices.find(v => v.lang.includes('US') && v.name.includes('Google')) ||
            englishVoices.find(v => v.lang.includes('US')) ||
            englishVoices[0];
          if (defaultUS) {
            const browserVoiceId = `browser:${defaultUS.name}`;
            setSelectedVoiceName(browserVoiceId);
            localStorage.setItem('assistant_voice_id', browserVoiceId);
            localStorage.setItem('voice_name', defaultUS.name);
          }
        }
      };

      updateVoices();
      if (window.speechSynthesis.onvoiceschanged !== undefined) {
        window.speechSynthesis.onvoiceschanged = updateVoices;
      }
    }
  }, []);

  const activeSpeechEndRef = useRef<(() => void) | null>(null);

  const stopAssistantAudioPlayback = () => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    const onEnd = activeSpeechEndRef.current;
    activeSpeechEndRef.current = null;
    onEnd?.();
  };

  useEffect(() => () => {
    stopAssistantAudioPlayback();
  }, []);



  const speakWithSelectedAssistantVoice = async (text: string, onStart?: () => void, onEnd?: () => void) => {
    const trimmed = text.trim();
    if (!trimmed) return;

    stopAssistantAudioPlayback();

    if (!('speechSynthesis' in window)) {
      console.error('Speech synthesis is not supported in this browser.');
      onEnd?.();
      return;
    }

    let hasFinished = false;
    const finishPlayback = () => {
      if (hasFinished) return;
      hasFinished = true;
      if (activeSpeechEndRef.current === finishPlayback) {
        activeSpeechEndRef.current = null;
      }
      onEnd?.();
    };
    activeSpeechEndRef.current = finishPlayback;

    const utterance = new SpeechSynthesisUtterance(trimmed);
    utterance.rate = voiceRate;
    utterance.pitch = voicePitch;
    utterance.lang = 'en-US';

    const { id: browserVoiceId } = parseSelectedAssistantVoice(selectedVoiceName);
    const voices = window.speechSynthesis.getVoices();
    const matched = browserVoiceId ? voices.find((voice) => voice.name === browserVoiceId) : undefined;
    const fallbackVoice = matched
      || voices.find((voice) => voice.lang?.toLowerCase().replace('_', '-').startsWith('en-us'))
      || voices.find((voice) => voice.lang?.toLowerCase().startsWith('en'));
    if (fallbackVoice) utterance.voice = fallbackVoice;

    utterance.onstart = () => onStart?.();
    utterance.onend = finishPlayback;
    utterance.onerror = (error) => {
      const errorCode = (error as SpeechSynthesisErrorEvent).error;
      if (errorCode !== 'interrupted' && errorCode !== 'canceled') {
        console.error('Browser voice playback failed:', errorCode || error);
      }
      finishPlayback();
    };

    window.speechSynthesis.speak(utterance);
  };

  const handleSaveVoiceConfig = (newRate: number, newPitch: number, newVoiceName: string) => {
    stopAssistantAudioPlayback();
    setVoiceRate(newRate);
    setVoicePitch(newPitch);
    setSelectedVoiceName(newVoiceName);
    localStorage.setItem('voice_rate', String(newRate));
    localStorage.setItem('voice_pitch', String(newPitch));
    localStorage.setItem('assistant_voice_id', newVoiceName);
    localStorage.setItem('voice_name', newVoiceName);
    localStorage.setItem(voiceOnboardingKey, '1');
    playAppSound(600, 'sine', 0.1);
  };

  const handleTestVoice = () => {
    void speakWithSelectedAssistantVoice("Hello there, little star! Let's talk together in English!");
  };

  const toggleTranslation = (id: string) => {
    setRevealedTranslations(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  // Traditional Chat states
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: "Hello there, little adventurer! I am Sunny ☀️. Let's talk in English! How are you today?",
      translation: "Xin chào nhà thám hiểm tí hon! Tớ là Sunny đây ☀️. Chúng ta hãy trò chuyện bằng tiếng Anh nhé! Hôm nay cậu khỏe không?",
      timestamp: new Date()
    }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSpeakingId, setIsSpeakingId] = useState<string | null>(null);
  // Track the last target phrase suggested to the child for IPA scoring
  const [lastTargetPhrase, setLastTargetPhrase] = useState<string>('');
  const [lastSpoken, setLastSpoken] = useState('');
  const [lastCorrections, setLastCorrections] = useState<SpeakingCorrection[]>([]);
  const [lastAskRepeat, setLastAskRepeat] = useState('');
  const [lastPronunciationScore, setLastPronunciationScore] = useState<number | undefined>(undefined);
  const [lastGrammarReview, setLastGrammarReview] = useState<GrammarReview | undefined>(undefined);
  const [lastGrammarScore, setLastGrammarScore] = useState<GrammarScore | undefined>(undefined);
  const coachRepeatRef = useRef<{ target: string; attempts: number }>({ target: '', attempts: 0 });
  const [hintLevel, setHintLevel] = useState(1);
  const [interimTranscript, setInterimTranscript] = useState('');
  const [inputFromSpeech, setInputFromSpeech] = useState(false);
  const currentRecognitionHasSpeechRef = useRef(false);
  const chatFinalTranscriptRef = useRef('');
  const [currentPromptIndex, setCurrentPromptIndex] = useState(0);
  const [usedWordIndices, setUsedWordIndices] = useState<number[]>([]);
  const [scrambledWords, setScrambledWords] = useState<string[]>([]);
  const [gameFeedback, setGameFeedback] = useState<{ isCorrect: boolean; show: boolean; correctText: string } | null>(null);
  const [confettiBurst, setConfettiBurst] = useState<Array<{ id: number; x: number; y: number; color: string; scale: number }>>([]);
  const currentTopicConfig = CONVERSATION_TOPICS.find((topic) => topic.id === selectedTopic) || CONVERSATION_TOPICS[0];
  // Suggestions are filtered by the child's age (notes 14/7 · mục 2.6): younger
  // children only see the simpler sentences, older ones see the whole set.
  const quickPrompts = useMemo(
    () => promptsForAge(TOPIC_PROMPTS[selectedTopic] || TOPIC_PROMPTS.freetalk, currentChild?.age),
    [selectedTopic, currentChild?.age],
  );

  useEffect(() => {
    const currentPrompt = quickPrompts[currentPromptIndex % quickPrompts.length];
    if (currentPrompt && currentPrompt.text) {
      const words = currentPrompt.text
        .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?]/g, "")
        .split(/\s+/)
        .filter(Boolean);
      const scrambled = shuffleArray(words);
      setScrambledWords(scrambled);
      setUsedWordIndices([]);
    } else {
      setScrambledWords([]);
      setUsedWordIndices([]);
    }
  }, [selectedTopic, currentPromptIndex, quickPrompts]);

  const buildTopicWelcome = (topicId: string) => {
    const entry = TOPIC_CATALOG.find((topic) => topic.id === topicId) || TOPIC_CATALOG[0];
    return { initialGreeting: entry.greetingEn, initialTranslation: entry.greetingVi };
  };

  const clearSilenceHintTimer = () => {
    if (silenceHintTimerRef.current) {
      window.clearTimeout(silenceHintTimerRef.current);
      silenceHintTimerRef.current = null;
    }
    if (verbalSilenceHintTimerRef.current) {
      window.clearTimeout(verbalSilenceHintTimerRef.current);
      verbalSilenceHintTimerRef.current = null;
    }
  };

  const hideSilenceHint = () => {
    clearSilenceHintTimer();
    setSilenceHintVisible(false);
    setSilenceHintReason(null);
  };

  const triggerVerbalSilenceHint = () => {
    const ENCOURAGING_PHRASES = [
      "What do you think? I'm all ears!",
      "Don't be shy, you can do it!",
      "Tell me more, little adventurer!",
      "I would love to hear your voice!",
      "Tell Sunny what you are thinking!",
    ];
    const phrase = ENCOURAGING_PHRASES[Math.floor(Math.random() * ENCOURAGING_PHRASES.length)];
    if (isCallActiveRef.current) {
      safePauseCallRecognition();
      void speakWithSelectedAssistantVoice(
        phrase,
        () => setCallStatus('speaking'),
        () => {
          safeResumeCallRecognition();
          // Reschedule the visual hint for another 5s
          if (silenceHintTimerRef.current) {
            window.clearTimeout(silenceHintTimerRef.current);
          }
          silenceHintTimerRef.current = window.setTimeout(() => {
            setSilenceHintReason('call');
            setSilenceHintVisible(true);
          }, 5000);
        }
      );
    } else {
      void speakWithSelectedAssistantVoice(phrase);
    }
  };

  const scheduleSilenceHint = (reason: 'chat' | 'call', delayMs: number) => {
    clearSilenceHintTimer();
    if (reason === 'chat' && !activeChatSilencePrompt) {
      return;
    }

    if (reason === 'call' && quickPrompts.length === 0) {
      return;
    }

    // Schedule verbal encouragement at 5 seconds
    verbalSilenceHintTimerRef.current = window.setTimeout(() => {
      triggerVerbalSilenceHint();
    }, 5000);

    // Schedule visual text suggestion at 10 seconds
    silenceHintTimerRef.current = window.setTimeout(() => {
      setSilenceHintReason(reason);
      setSilenceHintVisible(true);
    }, 10000);
  };

  const advanceSilenceHint = () => {
    if (quickPrompts.length <= 1) {
      return;
    }

    setSilenceHintIndex((previous) => (previous + 1) % quickPrompts.length);
  };

  // Traditional Chat speech recognition
  const [isRecording, setIsRecording] = useState(false);
  const [recognitionError, setRecognitionError] = useState<string | null>(null);
  const [sessionMouthCount, setSessionMouthCount] = useState(0);
  const [sessionEarnedXp, setSessionEarnedXp] = useState(0);
  const [rewardSummary, setRewardSummary] = useState<{ mouthCount: number; earnedXp: number } | null>(null);
  const [silenceHintIndex, setSilenceHintIndex] = useState(0);
  const [silenceHintVisible, setSilenceHintVisible] = useState(false);
  const [silenceHintReason, setSilenceHintReason] = useState<'chat' | 'call' | null>(null);
  const activeSilencePrompt = quickPrompts[silenceHintIndex % Math.max(quickPrompts.length, 1)];
  const activeChatSilencePrompt = buildChatSilencePrompt(
    hintLevel,
    lastAskRepeat || lastTargetPhrase || lastCorrections[0]?.correct_word || '',
    activeSilencePrompt as ChatSilencePrompt,
  );
  const recognitionRef = useRef<any>(null);
  const chatMessageListRef = useRef<HTMLDivElement>(null);
  const activeSessionIdRef = useRef<string | null>(null);
  const activeSessionModeRef = useRef<'chat' | 'call' | null>(null);
  const sessionMouthCountRef = useRef(0);
  const sessionEarnedXpRef = useRef(0);
  const silenceHintTimerRef = useRef<number | null>(null);
  const verbalSilenceHintTimerRef = useRef<number | null>(null);

  // ==========================================
  // HANDS-FREE PHONE CALL MODE STATES & REFS
  // ==========================================
  const [isCallActive, setIsCallActive] = useState(false);
  const [callStatus, setCallStatus] = useState<'idle' | 'calling' | 'listening' | 'processing' | 'speaking'>('idle');
  const [callTimer, setCallTimer] = useState(0);
  const [lastSpeechDetected, setLastSpeechDetected] = useState<string>('');
  const [duoCallResponse, setDuoCallResponse] = useState<string>("Hello! I'm ready to listen to you! Speak anytime!");
  const [duoCallTranslation, setDuoCallTranslation] = useState<string>('Xin chào! Tớ đã sẵn sàng nghe rồi! Hãy nói bất cứ lúc nào nhé!');

  const callTimerRef = useRef<any>(null);
  const callRecognitionRef = useRef<any>(null);
  const isCallActiveRef = useRef(false);
  const isDuoSpeakingRef = useRef(false);
  const isAwaitingCallReplyRef = useRef(false);
  const duoSpeechQueueRef = useRef<string[]>([]);
  const duoSpeechRemainderRef = useRef('');
  const duoSpeechCarryRef = useRef('');
  const duoStreamRawReplyRef = useRef('');
  const duoSpeechInParenthesesRef = useRef(false);
  const duoQueuedSpeechRef = useRef<Set<string>>(new Set());
  const callResumeTimerRef = useRef<number | null>(null);
  const callWelcomeTimerRef = useRef<number | null>(null);
  const callTranscriptCommitTimerRef = useRef<number | null>(null);
  const callRequestAbortRef = useRef<AbortController | null>(null);
  const callFinalTranscriptRef = useRef('');
  const callInterimTranscriptRef = useRef('');
  const lastAcceptedCallTranscriptRef = useRef({ text: '', acceptedAt: 0 });
  const lastAiSpeechEndTimeRef = useRef<number>(0);  // Track when AI finished speaking

  useEffect(() => {
    const isSessionActive = activeTabMode === 'chat' || (activeTabMode === 'call' && isCallActive);
    onActiveSessionChange?.(isSessionActive);
    return () => {
      onActiveSessionChange?.(false);
    };
  }, [activeTabMode, isCallActive, onActiveSessionChange]);

  // Multi-outfit SVG Renderer for Sunny Mascot (Sun)

  // Auto-scroll only inside the message list so the page shell and mode switcher
  // never get pulled upward by a descendant scrollIntoView().
  useEffect(() => {
    const list = chatMessageListRef.current;
    if (!list) return;
    if (typeof list.scrollTo === 'function') {
      list.scrollTo({
        top: list.scrollHeight,
        behavior: 'smooth',
      });
      return;
    }

    list.scrollTop = list.scrollHeight;
  }, [messages, loading]);

  useEffect(() => {
    setSilenceHintIndex(0);
    setHintLevel(1);
    hideSilenceHint();
  }, [selectedTopic]);

  // Setup traditional speech recognition
  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const rec = new SpeechRecognition();
      rec.continuous = false;
      rec.lang = 'en-US';
      rec.interimResults = true;
      rec.maxAlternatives = 3;

      rec.onstart = () => {
        setIsRecording(true);
        setRecognitionError(null);
        setInterimTranscript('');
        currentRecognitionHasSpeechRef.current = false;
        chatFinalTranscriptRef.current = '';
        hideSilenceHint();
        scheduleSilenceHint('chat', 5000);
        playAppSound(440, 'sine', 0.1);
      };

      rec.onresult = (event: any) => {
        let finalTranscript = '';
        let interim = '';

        for (let i = event.resultIndex; i < event.results.length; i += 1) {
          const result = event.results[i];
          const transcript = result[0]?.transcript || '';
          if (result.isFinal) {
          finalTranscript = `${finalTranscript} ${transcript}`.trim();
          } else {
            interim += transcript;
          }
        }

        setInterimTranscript(interim.trim());
        const text = finalTranscript.trim();
        if (text) {
          chatFinalTranscriptRef.current = `${chatFinalTranscriptRef.current} ${text}`.replace(/\s+/g, ' ').trim();
          currentRecognitionHasSpeechRef.current = true;
          hideSilenceHint();
          setHintLevel(1);
          setInterimTranscript('');
          setInputValue(chatFinalTranscriptRef.current);
          setInputFromSpeech(true);
          playAppSound(600, 'sine', 0.08);
        }
      };

      rec.onerror = (e: any) => {
        console.error("Speech recognition error:", e);
        if (e.error === 'no-speech') {
          setRecognitionError("Sunny chưa nghe thấy gì cả bé ơi! Thử lại nha.");
          setSilenceHintReason('chat');
          setSilenceHintVisible(true);
        } else {
          setRecognitionError("Không hỗ trợ micro hoặc chưa cấp quyền.");
        }
        clearSilenceHintTimer();
        setIsRecording(false);
      };

      rec.onend = () => {
        setIsRecording(false);
        setInterimTranscript('');
        chatFinalTranscriptRef.current = '';
        if (!currentRecognitionHasSpeechRef.current) {
          setSilenceHintReason('chat');
          setSilenceHintVisible(true);
        } else {
          clearSilenceHintTimer();
        }
      };

      recognitionRef.current = rec;
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
    };
  }, []);

  // Sync isCallActive to Ref to bypass React state closure staleness
  useEffect(() => {
    isCallActiveRef.current = isCallActive;
  }, [isCallActive]);

  // Handle Call Mode Timer
  useEffect(() => {
    if (isCallActive) {
      setCallTimer(0);
      callTimerRef.current = setInterval(() => {
        setCallTimer(prev => prev + 1);
      }, 1000);
    } else {
      if (callTimerRef.current) {
        clearInterval(callTimerRef.current);
      }
      setCallTimer(0);
    }

    return () => {
      if (callTimerRef.current) {
        clearInterval(callTimerRef.current);
      }
    };
  }, [isCallActive]);

  // FORMAT TIMER FUNCTION
  const formatCallTime = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  // ==========================================
  // HANDS-FREE PHONE CALL ENGINE & LOOPS
  // ==========================================

  // Reset/stop everything when call tab is closed or unmounted
  useEffect(() => {
    return () => {
      clearSilenceHintTimer();
      teardownCallSession();
    };
  }, []);

  const splitReplyForDisplay = (rawReply: string) => {
    return splitHistoryReplyForDisplay(rawReply);
  };

  const isCallHistorySession = (item: ConversationHistoryItem | null) => {
    if (!item) return false;
    return Boolean(item.recordingUrl) || /hands-free|call/i.test(item.summary || '');
  };

  const normalizeHistoryTranscript = (item: ConversationHistoryItem | null): Message[] => {
    if (!item) {
      return [];
    }

    return normalizeSharedHistoryTranscript(item).map((message) => ({
      ...message,
      timestamp: new Date(item.startedAt),
    }));
  };

  const sanitizeSpeechFragment = (text: string) =>
    text
      .replace(/\([^()]*\)/g, ' ')
      .replace(/\([^()]*$/g, '')
      .replace(/[\/*_`#]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

  const stripParentheticalSpeechStream = (incoming: string) => {
    let clean = '';

    for (const char of incoming) {
      if (char === '(') {
        duoSpeechInParenthesesRef.current = true;
        continue;
      }

      if (char === ')') {
        duoSpeechInParenthesesRef.current = false;
        continue;
      }

      if (!duoSpeechInParenthesesRef.current) {
        clean += char;
      }
    }

    return clean;
  };

  const countSpeechWords = (text: string) =>
    text
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .length;

  const drainCompleteSpeechSentences = (incoming: string, forceFlush: boolean = false) => {
    const merged = `${duoSpeechRemainderRef.current}${incoming}`.replace(/\s+/g, ' ');
    const sentences: string[] = [];
    const regex = /(.+?[.!?]+(?:["')\]]+)*)\s*/g;
    let cursor = 0;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(merged)) !== null) {
      cursor = regex.lastIndex;
      const sentence = sanitizeSpeechFragment(match[1] || '');
      if (!sentence) {
        continue;
      }

      const combinedSentence = [duoSpeechCarryRef.current, sentence].filter(Boolean).join(' ').trim();
      const isShortSentence = countSpeechWords(combinedSentence) < 6 || combinedSentence.length < 32;

      if (!forceFlush && isShortSentence) {
        duoSpeechCarryRef.current = combinedSentence;
        continue;
      }

      duoSpeechCarryRef.current = '';
      sentences.push(combinedSentence);
    }

    duoSpeechRemainderRef.current = merged.slice(cursor).trimStart();

    if (forceFlush) {
      const finalSentence = sanitizeSpeechFragment(
        [duoSpeechCarryRef.current, duoSpeechRemainderRef.current].filter(Boolean).join(' '),
      );
      duoSpeechCarryRef.current = '';
      duoSpeechRemainderRef.current = '';
      if (finalSentence) {
        sentences.push(finalSentence);
      }
    }

    return sentences;
  };

  const playNextDuoSpeechChunk = () => {
    if (isDuoSpeakingRef.current) {
      console.log('[PLAY] Already speaking, skip');
      return;
    }

    const nextSentence = duoSpeechQueueRef.current.shift();
    if (!nextSentence) {
      console.log('[PLAY] Queue empty, AI finished speaking');
      lastAiSpeechEndTimeRef.current = Date.now(); // Mark when AI finished

      if (isCallActiveRef.current && !isAwaitingCallReplyRef.current) {
        setCallStatus('listening');
        // Keep the mic closed past the echo/cooldown window before listening again.
        if (callResumeTimerRef.current) {
          window.clearTimeout(callResumeTimerRef.current);
        }
        callResumeTimerRef.current = window.setTimeout(() => {
          callResumeTimerRef.current = null;
          console.log('[PLAY] Resuming mic after delay');
          safeResumeCallRecognition();
          scheduleSilenceHint('call', 5000);
        }, 1100);
      }
      return;
    }

    console.log('[PLAY] Speaking:', nextSentence.substring(0, 40), '...', '| Queue:', duoSpeechQueueRef.current.length);

    // Set flag AND pause mic IMMEDIATELY
    isDuoSpeakingRef.current = true;
    safePauseCallRecognition();

    void speakWithSelectedAssistantVoice(
      nextSentence,
      () => {
        console.log('[PLAY] Audio started');
        setCallStatus('speaking');
      },
      () => {
        console.log('[PLAY] Audio ended');
        isDuoSpeakingRef.current = false;
        playNextDuoSpeechChunk(); // Play next chunk
      },
    ).catch((err) => {
      console.error('[PLAY] Audio error:', err);
      isDuoSpeakingRef.current = false;
      playNextDuoSpeechChunk();
    });
  };

  // Main Speech synthesis announcer (Reads Duo's response out loud in call)
  const speakDuoResponseInCall = (text: string) => {
    const cleanSpeech = sanitizeSpeechFragment(text);
    if (!cleanSpeech) return;

    const speechKey = cleanSpeech.toLocaleLowerCase().replace(/\s+/g, ' ').trim();
    if (duoQueuedSpeechRef.current.has(speechKey)) {
      console.warn('[BLOCKED DUPLICATE]:', cleanSpeech);
      return;
    }

    duoQueuedSpeechRef.current.add(speechKey);
    console.log('[QUEUE ADD]:', cleanSpeech, '| Queue size:', duoSpeechQueueRef.current.length);
    duoSpeechQueueRef.current.push(cleanSpeech);

    // CRITICAL FIX: Only trigger if not already speaking
    if (!isDuoSpeakingRef.current) {
      playNextDuoSpeechChunk();
    }
  };

  // Temporarily stop microphone listener to prevent it from capturing Duo's voice
  const safePauseCallRecognition = () => {
    console.log('[MIC PAUSE] Attempting to stop recognition');
    if (callRecognitionRef.current) {
      try {
        callRecognitionRef.current.abort();
        console.log('[MIC PAUSE] Recognition aborted successfully');
      } catch (err) {
        console.error('[MIC PAUSE ERROR]:', err);
      }
    } else {
      console.warn('[MIC PAUSE] No recognition ref found!');
    }

    // Extra safety: clear any pending resume timers
    if (callResumeTimerRef.current) {
      window.clearTimeout(callResumeTimerRef.current);
      callResumeTimerRef.current = null;
      console.log('[MIC PAUSE] Cleared pending resume timer');
    }
    if (callTranscriptCommitTimerRef.current) {
      window.clearTimeout(callTranscriptCommitTimerRef.current);
      callTranscriptCommitTimerRef.current = null;
    }
    callFinalTranscriptRef.current = '';
    callInterimTranscriptRef.current = '';
  };

  // Resume listening
  const safeResumeCallRecognition = () => {
    console.log('[MIC RESUME] Attempting...', {
      isCallActive: isCallActiveRef.current,
      isDuoSpeaking: isDuoSpeakingRef.current,
      isAwaitingReply: isAwaitingCallReplyRef.current,
    });

    if (!isCallActiveRef.current) {
      console.log('[MIC RESUME] BLOCKED - call not active');
      return;
    }

    if (isDuoSpeakingRef.current) {
      console.log('[MIC RESUME] BLOCKED - AI still speaking');
      return;
    }

    if (isAwaitingCallReplyRef.current) {
      console.log('[MIC RESUME] BLOCKED - awaiting reply');
      return;
    }

    if (callRecognitionRef.current) {
      try {
        console.log('[MIC RESUME] ✅ Starting now');
        callRecognitionRef.current.start();
        setCallStatus('listening');
      } catch (err: any) {
        // Ignore "already started" errors
        if (err?.message?.includes('already')) {
          console.log('[MIC RESUME] Already running');
        } else {
          console.warn('[MIC RESUME] Error:', err);
        }
      }
    }
  };

  const resetSessionRewardCounters = () => {
    sessionMouthCountRef.current = 0;
    sessionEarnedXpRef.current = 0;
    setSessionMouthCount(0);
    setSessionEarnedXp(0);
  };

  // ── Internal: actually stop call and save session without any confirmation ──
  const commitStopCallSession = async () => {
    const hasSomethingToSync =
      Boolean(activeSessionIdRef.current) ||
      sessionMouthCountRef.current > 0 ||
      sessionEarnedXpRef.current > 0;

    teardownCallSession();
    playAppSound(300, 'sine', 0.1);

    if (!hasSomethingToSync) {
      resetSessionRewardCounters();
      return;
    }

    const transcriptSnapshot = messagesRef.current.slice(-12);
    await closeSessionWithRewards(
      globalLang === 'en' ? 'Hands-free English call ended.' : 'Kết thúc cuộc gọi tiếng Anh rảnh tay.',
      transcriptSnapshot,
    );
  };

  // ── Public: show confirmation if a session is active, else stop immediately ──
  const stopCallSession = (skipConfirm = false) => {
    const hasActiveSession = Boolean(activeSessionIdRef.current) && hasCurrentSessionProgress();

    if (!skipConfirm && hasActiveSession) {
      pendingEndActionRef.current = () => commitStopCallSession();
      setShowEndSessionModal(true);
      return;
    }

    commitStopCallSession();
  };

  const teardownCallSession = () => {
    isCallActiveRef.current = false;
    setIsCallActive(false);
    setCallStatus('idle');
    hideSilenceHint();
    isAwaitingCallReplyRef.current = false;
    duoSpeechQueueRef.current = [];
    duoSpeechRemainderRef.current = '';
    duoSpeechCarryRef.current = '';
    duoStreamRawReplyRef.current = '';
    duoSpeechInParenthesesRef.current = false;
    duoQueuedSpeechRef.current.clear();
    callFinalTranscriptRef.current = '';
    callInterimTranscriptRef.current = '';
    callRequestAbortRef.current?.abort();
    callRequestAbortRef.current = null;
    if (callTranscriptCommitTimerRef.current) {
      window.clearTimeout(callTranscriptCommitTimerRef.current);
      callTranscriptCommitTimerRef.current = null;
    }
    if (callResumeTimerRef.current) {
      window.clearTimeout(callResumeTimerRef.current);
      callResumeTimerRef.current = null;
    }
    if (callWelcomeTimerRef.current) {
      window.clearTimeout(callWelcomeTimerRef.current);
      callWelcomeTimerRef.current = null;
    }

    stopAssistantAudioPlayback();
    isDuoSpeakingRef.current = false;

    if (callRecognitionRef.current) {
      try {
        callRecognitionRef.current.onend = null;
        callRecognitionRef.current.abort();
      } catch (err) {
        console.error(err);
      }
      callRecognitionRef.current = null;
    }
  };

  const registerSpeechReward = (mouthCountDelta: number = 1) => {
    const safeMouthCountDelta = Math.max(0, mouthCountDelta);
    const earnedXpDelta = safeMouthCountDelta * XP_PER_UTTERANCE;

    if (safeMouthCountDelta <= 0 || earnedXpDelta <= 0) {
      return;
    }

    sessionMouthCountRef.current += safeMouthCountDelta;
    sessionEarnedXpRef.current += earnedXpDelta;
    setSessionMouthCount(sessionMouthCountRef.current);
    setSessionEarnedXp(sessionEarnedXpRef.current);

    onUpdateStats({
      xp: initialXpRef.current + sessionEarnedXpRef.current,
      gems: initialGemsRef.current + (sessionMouthCountRef.current * 2),
    });
  };

  const hasCurrentSessionProgress = () =>
    sessionMouthCountRef.current > 0 || sessionEarnedXpRef.current > 0;

  const closeSessionWithRewards = async (summary: string, transcript: Message[]): Promise<boolean> => {
    const mouthCount = sessionMouthCountRef.current;
    const earnedXp = sessionEarnedXpRef.current;
    const hadSessionProgress = mouthCount > 0 || earnedXp > 0;
    let didFinalizeSession = false;

    try {
      didFinalizeSession = await finalizeBackendSession(summary, transcript);
    } catch (error) {
      console.warn('Unable to finalize backend session:', error);
      setErrorMsg(
        globalLang === 'en'
          ? 'Your session could not be saved. Please try ending it again.'
          : 'Chưa thể lưu phiên học. Vui lòng thử kết thúc phiên lại.',
      );
      return false;
    }

    if (!didFinalizeSession) {
      return false;
    }

    if (hadSessionProgress) {
      await onProgressSync?.();
    }

    if (mouthCount > 0 || earnedXp > 0) {
      setRewardSummary({ mouthCount, earnedXp });
    }
    resetSessionRewardCounters();

    // ── Silently refresh history so the next time user opens the history
    //    panel they see the just-completed session immediately. ──────────
    if (hadSessionProgress && currentChild) {
      try {
        const histRes = await fetch(`/api/children/${currentChild.id}/sessions?limit=30`, {
          credentials: 'include',
        });
        const histPayload = await histRes.json().catch(() => ({}));
        if (!histRes.ok) {
          throw new Error(histPayload?.message || 'Unable to refresh conversation history.');
        }
        const sessions = histPayload?.data?.sessions || histPayload?.sessions || [];
        if (Array.isArray(sessions)) {
          setHistoryItems(sessions);
          setHistoryError(null);
          setSelectedHistory((previous) => {
            if (sessions.length === 0) {
              return null;
            }
            if (previous && sessions.some((session) => session.id === previous.id)) {
              return sessions.find((session) => session.id === previous.id) || sessions[0];
            }
            return sessions[0];
          });
        }
      } catch (error) {
        console.warn('Unable to refresh conversation history:', error);
        setHistoryError(
          error instanceof Error
            ? error.message
            : (globalLang === 'en' ? 'Unable to refresh conversation history.' : 'Không thể tải lại lịch sử trò chuyện.'),
        );
      }
    }
    return true;
  };

  const ensureBackendSession = async (mode: 'chat' | 'call') => {
    if (!currentChild) {
      return null;
    }

    if (activeSessionIdRef.current && activeSessionModeRef.current === mode) {
      return activeSessionIdRef.current;
    }

    const response = await fetch('/api/sessions', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        childId: currentChild.id,
      }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload?.message || 'Unable to create learning session.');
    }

    const sessionId = payload?.data?.session?.id as string | undefined;
    if (sessionId) {
      activeSessionIdRef.current = sessionId;
      activeSessionModeRef.current = mode;
    }

    return sessionId || null;
  };

  const finalizeBackendSession = async (summary: string, transcript: Message[]) => {
    const sessionId = activeSessionIdRef.current;
    if (!sessionId) {
      return false;
    }

    const requestBody = JSON.stringify({
      overallScore: calculateSessionScore(sessionMouthCountRef.current),
      summary,
      mouthCount: sessionMouthCountRef.current,
      earnedXp: sessionEarnedXpRef.current,
      transcript: transcript.map((message) => ({
        role: message.role,
        content: message.content,
        translation: message.translation,
        score: message.score,
        wordStatuses: message.wordStatuses,
        corrections: message.corrections,
        askRepeat: message.askRepeat,
        pronunciationScore: message.pronunciationScore,
        grammarReview: message.grammarReview,
      })),
    });
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const response = await fetch(`/api/sessions/${sessionId}/end`, {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
          body: requestBody,
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload?.message || 'Unable to close learning session.');
        }

        if (activeSessionIdRef.current === sessionId) {
          activeSessionIdRef.current = null;
          activeSessionModeRef.current = null;
        }
        return true;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unable to close learning session.');
        if (attempt < 2) {
          await new Promise((resolve) => window.setTimeout(resolve, 250 * (attempt + 1)));
        }
      }
    }
    throw lastError || new Error('Unable to close learning session.');
  };

  // Initialize Speech Recognition loop for Duo Voice Call Mode
  const startCallSession = async () => {
    if (isCallActiveRef.current) return;

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert(
        globalLang === 'en'
          ? 'This browser does not support the Web Speech API. Please use Google Chrome or Microsoft Edge.'
          : 'Trình duyệt không hỗ trợ Web Speech API. Hãy sử dụng Google Chrome hoặc Microsoft Edge.',
      );
      return;
    }

    isCallActiveRef.current = true;
    duoSpeechQueueRef.current = [];
    duoSpeechRemainderRef.current = '';
    duoSpeechCarryRef.current = '';
    duoStreamRawReplyRef.current = '';
    duoSpeechInParenthesesRef.current = false;
    duoQueuedSpeechRef.current.clear();
    callFinalTranscriptRef.current = '';
    callInterimTranscriptRef.current = '';
    lastAiSpeechEndTimeRef.current = 0;
    stopAssistantAudioPlayback();

    playAppSound(587, 'sine', 0.12);
    setTimeout(() => playAppSound(880, 'sine', 0.15), 150);

    try {
      await ensureBackendSession('call');
    } catch (error) {
      console.error('Unable to start backend session:', error);
    }

    setIsCallActive(true);
    setCallStatus('calling');
    setLastSpeechDetected('');
    setRecognitionError(null);
    hideSilenceHint();
    resetSessionRewardCounters();
    setDuoCallResponse("Hello there, little star! Let's talk together like on a real phone call! I'm listening to you now.");
    setDuoCallTranslation("Chào ngôi sao nhỏ! Chúng mình hãy trò chuyện rảnh tay như cuộc điện thoại thực sự nhé! Tớ đang lắng nghe bạn đây.");

    // Instantiate Call Recognition Engine
    const rec = new SpeechRecognition();
    rec.continuous = true;
    rec.lang = 'en-US';
    rec.interimResults = true;
    rec.maxAlternatives = 3;

    rec.onstart = () => {
      console.log('[REC START] Recognition started');
      if (isCallActiveRef.current && !isDuoSpeakingRef.current) {
        setCallStatus('listening');
        scheduleSilenceHint('call', 5000);
      }
    };

    const submitCallSpeech = async (speechText: string) => {
      if (!speechText || !speechText.trim()) return;

      console.log('[REC RESULT]:', speechText);

      // CRITICAL: Ignore if AI is currently speaking
      if (isDuoSpeakingRef.current) {
        console.warn('[IGNORED - AI SPEAKING]:', speechText);
        return;
      }

      // CRITICAL: Ignore if we're waiting for backend reply
      if (isAwaitingCallReplyRef.current) {
        console.warn('[IGNORED - AWAITING REPLY]:', speechText);
        return;
      }

      // CRITICAL: Cooldown - wait at least 1 second after AI finished
      const timeSinceAiSpoke = Date.now() - lastAiSpeechEndTimeRef.current;
      if (lastAiSpeechEndTimeRef.current > 0 && timeSinceAiSpoke < 1000) {
        console.warn('[IGNORED - COOLDOWN]:', speechText, '| Only', timeSinceAiSpoke, 'ms since AI spoke');
        return;
      }

      const normalizedSpeech = speechText.toLocaleLowerCase().replace(/[^a-z0-9' ]/g, ' ').replace(/\s+/g, ' ').trim();
      const previousAccepted = lastAcceptedCallTranscriptRef.current;
      if (normalizedSpeech && normalizedSpeech === previousAccepted.text && Date.now() - previousAccepted.acceptedAt < 4000) {
        console.warn('[IGNORED - DUPLICATE TRANSCRIPT]:', speechText);
        return;
      }
      lastAcceptedCallTranscriptRef.current = { text: normalizedSpeech, acceptedAt: Date.now() };

      hideSilenceHint();
      setLastSpeechDetected(speechText);
      setCallStatus('processing');
      playAppSound(660, 'triangle', 0.1);
      console.log('[USER SPEECH ACCEPTED]:', speechText);
      isAwaitingCallReplyRef.current = true;
      safePauseCallRecognition();

      // Call backend
      let requestAbortController: AbortController | null = null;
      try {
        duoSpeechQueueRef.current = [];
        duoSpeechRemainderRef.current = '';
        duoSpeechCarryRef.current = '';
        duoStreamRawReplyRef.current = '';
        duoSpeechInParenthesesRef.current = false;
        duoQueuedSpeechRef.current.clear();

        const requestPayload = [
          ...messagesRef.current.slice(-8).map(m => ({ role: m.role, content: m.content })),
          { role: 'user', content: speechText }
        ];

        console.log('[BACKEND REQUEST] Messages:', requestPayload.length, 'items');

        requestAbortController = new AbortController();
        callRequestAbortRef.current?.abort();
        callRequestAbortRef.current = requestAbortController;
        const response = await fetch('/api/chat', {
          method: 'POST',
          credentials: 'include',
          signal: requestAbortController.signal,
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            stream: true,
            messages: requestPayload.map(m => ({
              role: m.role,
              content: m.content,
            })),
            topic: currentTopicConfig.id,
            topic_name: currentTopicConfig.topicName,
            vocabulary: currentTopicConfig.vocabulary,
            childId: currentChild?.id || undefined,
            childAge: currentChild?.age ?? undefined,
            childName: currentChild?.name || undefined,
            spoken_text: speechText,
            target_phrase: '',
          })
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(
            errorData.error ||
            errorData.message ||
            errorData.detail ||
            (globalLang === 'en' ? 'Unable to reach the server.' : 'Lỗi kết nối máy chủ'),
          );
        }

        if (!response.body) {
          throw new Error(globalLang === 'en' ? 'Empty streaming response.' : 'Luồng phản hồi trống.');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let sseBuffer = '';
        let rawReply = '';
        let donePayload: Record<string, unknown> | null = null;

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          sseBuffer += decoder.decode(value, { stream: true });
          let boundaryIndex = sseBuffer.indexOf('\n\n');
          while (boundaryIndex >= 0) {
            const block = sseBuffer.slice(0, boundaryIndex);
            sseBuffer = sseBuffer.slice(boundaryIndex + 2);
            boundaryIndex = sseBuffer.indexOf('\n\n');
            const payloadText = block
              .split(/\r?\n/)
              .filter(line => line.startsWith('data:'))
              .map(line => line.slice(5).trim())
              .join('\n');
            if (!payloadText || payloadText === '[DONE]') {
              continue;
            }
            const payload = JSON.parse(payloadText);
            if (payload?.type === 'delta' && typeof payload.text === 'string') {
              duoStreamRawReplyRef.current += payload.text;
              rawReply = duoStreamRawReplyRef.current;
              const partial = splitReplyForDisplay(rawReply);
              setDuoCallResponse(partial.cleanReply || rawReply.trim());
              setDuoCallTranslation(
                partial.replyTranslation ||
                (globalLang === 'en'
                  ? 'I am really happy to talk with you!'
                  : 'Tá»› ráº¥t vui Ä‘Æ°á»£c trÃ² chuyá»‡n vá»›i cáº­u!'),
              );
              const speechDelta = stripParentheticalSpeechStream(payload.text);
              for (const sentence of drainCompleteSpeechSentences(speechDelta)) {
                speakDuoResponseInCall(sentence);
              }
            } else if (payload?.type === 'done' && typeof payload.reply === 'string') {
              rawReply = payload.reply;
              donePayload = payload;
            } else if (payload?.type === 'error') {
              throw new Error(
                typeof payload.error === 'string'
                  ? payload.error
                  : 'The configured AI provider could not answer.',
              );
            }
          }
        }

        for (const sentence of drainCompleteSpeechSentences('', true)) {
          speakDuoResponseInCall(sentence);
        }

        onUsageSync?.();

        const { cleanReply, replyTranslation } = splitReplyForDisplay(rawReply || duoStreamRawReplyRef.current);
        const targetPhrase = '';
        const normalized = normalizeSpeakingCoachPayload(
          {
            ...(donePayload || {}),
            reply: cleanReply || rawReply || duoStreamRawReplyRef.current,
            translation: typeof donePayload?.translation === 'string' ? donePayload.translation : replyTranslation,
          },
          speechText,
          targetPhrase,
        );
        const cappedCoach = capRepeatAfterThreeAttempts(
          targetPhrase,
          normalized.ask_repeat,
          normalized.corrections,
          normalized.word_statuses,
        );

        setDuoCallResponse(cleanReply);
        setDuoCallTranslation(
          normalized.translation || replyTranslation ||
          (globalLang === 'en'
            ? 'I am really happy to talk with you!'
            : 'Tớ rất vui được trò chuyện với cậu!'),
        );

        if (cappedCoach.corrections.length > 0 || normalized.word_statuses.length > 0 || normalized.grammar_review || normalized.grammar_score) {
          applySpeakingCoachState(
            speechText,
            cappedCoach.corrections,
            cappedCoach.askRepeat,
            normalized.pronunciation_score,
            normalized.grammar_review,
            normalized.grammar_score,
          );
        }

        // Feed message into traditional thread state as well so children don't lose log history
        const newUserMsg: Message = {
          id: Math.random().toString(),
          role: 'user',
          content: speechText,
          timestamp: new Date(),
          corrections: cappedCoach.corrections,
          askRepeat: cappedCoach.askRepeat,
          pronunciationScore: normalized.pronunciation_score,
          wordStatuses: normalized.word_statuses,
          score: normalized.score,
          grammarReview: normalized.grammar_review,
          grammarScore: normalized.grammar_score,
        };
        const newDuoMsg: Message = {
          id: Math.random().toString(),
          role: 'assistant',
          content: cleanReply,
          translation: normalized.translation || replyTranslation,
          timestamp: new Date(),
        };
        setMessages(prev => {
          const nextMessages = [...prev, newUserMsg, newDuoMsg];
          messagesRef.current = nextMessages;
          return nextMessages;
        });

        registerSpeechReward(1);
        isAwaitingCallReplyRef.current = false;
        if (!isDuoSpeakingRef.current && duoSpeechQueueRef.current.length === 0) {
          playNextDuoSpeechChunk();
        }

      } catch (err) {
        isAwaitingCallReplyRef.current = false;
        if (err instanceof DOMException && err.name === 'AbortError') {
          return;
        }
        console.error("Call backend failure:", err);
        setRecognitionError(err instanceof Error ? err.message : 'The configured AI provider could not answer.');
        setDuoCallResponse("I had a little hiccups. Could you speak again slowly please?");
        setDuoCallTranslation("Tớ hơi bị vấp một xíu. Cậu có thể nói lại chậm hơn được không?");
        speakDuoResponseInCall("I had a little hiccups. Could you speak again slowly please?");
      } finally {
        if (callRequestAbortRef.current === requestAbortController) {
          callRequestAbortRef.current = null;
        }
      }
    };

    const commitBufferedCallSpeech = (allowInterimOnly: boolean) => {
      const finalTranscript = callFinalTranscriptRef.current.trim();
      if (!finalTranscript && !allowInterimOnly) return false;

      const completeTurn = [finalTranscript, callInterimTranscriptRef.current]
        .filter(Boolean)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (!completeTurn) return false;

      if (callTranscriptCommitTimerRef.current) {
        window.clearTimeout(callTranscriptCommitTimerRef.current);
        callTranscriptCommitTimerRef.current = null;
      }
      callFinalTranscriptRef.current = '';
      callInterimTranscriptRef.current = '';
      void submitCallSpeech(completeTurn);
      return true;
    };

    rec.onresult = (event: any) => {
      let finalDelta = '';
      let interim = '';

      for (let index = event.resultIndex ?? 0; index < event.results.length; index += 1) {
        const result = event.results[index];
        const transcript = String(result?.[0]?.transcript || '').trim();
        if (!transcript) continue;
        if (result.isFinal) {
          finalDelta = `${finalDelta} ${transcript}`.trim();
        } else {
          interim = `${interim} ${transcript}`.trim();
        }
      }

      if (finalDelta) {
        callFinalTranscriptRef.current = `${callFinalTranscriptRef.current} ${finalDelta}`.replace(/\s+/g, ' ').trim();
      }
      callInterimTranscriptRef.current = interim;
      const preview = [callFinalTranscriptRef.current, interim].filter(Boolean).join(' ').trim();
      if (preview) {
        setLastSpeechDetected(preview);
        setCallStatus('listening');
        setRecognitionError(null);
      }

      if (callTranscriptCommitTimerRef.current) {
        window.clearTimeout(callTranscriptCommitTimerRef.current);
        callTranscriptCommitTimerRef.current = null;
      }
      if (!callFinalTranscriptRef.current) return;

      const wordCount = preview.split(/\s+/).filter(Boolean).length;
      const commitDelayMs = wordCount <= 4 ? 1600 : wordCount <= 8 ? 1350 : 1150;
      callTranscriptCommitTimerRef.current = window.setTimeout(() => {
        callTranscriptCommitTimerRef.current = null;
        commitBufferedCallSpeech(false);
      }, commitDelayMs);
    };

    rec.onerror = (e: any) => {
      console.warn("Call speech recognition error event:", e.error);
      // No speech detected is totally normal when child thinks. Simply resume call loop silently.
      if (e.error === 'no-speech') {
        setSilenceHintReason('call');
        setSilenceHintVisible(true);
      } else if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        setRecognitionError(
          globalLang === 'en'
            ? 'Microphone access is blocked. Allow mic permission for this site in your browser settings, then start the call again.'
            : 'Micro đang bị chặn. Hãy cấp quyền micro cho trang web này trong cài đặt trình duyệt rồi gọi lại nhé.',
        );
      } else if (e.error === 'audio-capture') {
        setRecognitionError(
          globalLang === 'en'
            ? 'No microphone was found. Check that another app is not using the mic, then try again.'
            : 'Không tìm thấy micro. Kiểm tra xem có ứng dụng khác đang dùng micro không rồi thử lại.',
        );
      } else if (e.error === 'network') {
        setRecognitionError(
          globalLang === 'en'
            ? 'Speech recognition needs an internet connection. Check the network and try again.'
            : 'Nhận diện giọng nói cần kết nối mạng. Kiểm tra mạng rồi thử lại nhé.',
        );
      }
      if (isCallActiveRef.current && !isDuoSpeakingRef.current && !isAwaitingCallReplyRef.current) {
        setCallStatus('listening');
      }
    };

    rec.onend = () => {
      console.log('[REC END] Recognition ended');

      if (
        isCallActiveRef.current
        && !isDuoSpeakingRef.current
        && !isAwaitingCallReplyRef.current
        && !callTranscriptCommitTimerRef.current
        && commitBufferedCallSpeech(true)
      ) {
        return;
      }

      // Auto-restart if call is still active and AI not speaking
      if (isCallActiveRef.current && !isDuoSpeakingRef.current && !isAwaitingCallReplyRef.current && !callTranscriptCommitTimerRef.current) {
        // Small delay before restart
        setTimeout(() => {
          if (isCallActiveRef.current && !isDuoSpeakingRef.current && !isAwaitingCallReplyRef.current && !callTranscriptCommitTimerRef.current) {
            console.log('[REC END] Auto-restarting');
            safeResumeCallRecognition();
          }
        }, 500);
      }
    };

    callRecognitionRef.current = rec;

    // Speak initial Duo call welcome line right away!
    callWelcomeTimerRef.current = window.setTimeout(() => {
      callWelcomeTimerRef.current = null;
      if (isCallActiveRef.current) {
        speakDuoResponseInCall("Hello there, little star! Let's talk together like on a real phone call! I'm listening to you now.");
      }
    }, 400);
  };

  const handleToggleRecord = () => {
    if (!recognitionRef.current) {
      alert(
        globalLang === 'en'
          ? 'Speech recognition is not supported or has not been enabled in this browser.'
          : 'Trình duyệt không hỗ trợ nhận diện giọng nói hoặc chưa kích hoạt.',
      );
      return;
    }

    if (isRecording) {
      recognitionRef.current.stop();
    } else {
      try {
        recognitionRef.current.start();
      } catch (err) {
        console.error(err);
      }
    }
  };

  const handleSpeakText = (text: string, msgId: string) => {
    const englishOnly = splitReplyForDisplay(text).cleanReply || sanitizeSpeechFragment(text);
    void speakWithSelectedAssistantVoice(
      englishOnly,
      () => {
        setIsSpeakingId(msgId);
      },
      () => {
        setIsSpeakingId(null);
      },
    ).catch(() => {
      setIsSpeakingId(null);
      alert(
        globalLang === 'en'
          ? 'Unable to play this voice right now.'
          : 'Hiện chưa thể phát giọng nói này.',
      );
    });
  };

  const applySpeakingCoachState = (
    spokenText: string,
    corrections: SpeakingCorrection[],
    askRepeat: string,
    pronunciationScore: number,
    grammarReview?: GrammarReview,
    grammarScore?: GrammarScore,
  ) => {
    setLastSpoken(spokenText);
    setLastCorrections(corrections);
    setLastAskRepeat(askRepeat);
    setLastPronunciationScore(pronunciationScore);
    setLastGrammarReview(grammarReview);
    setLastGrammarScore(grammarScore);
    setHintLevel(1);

    if (askRepeat) {
      setLastTargetPhrase(askRepeat);
    } else if (corrections[0]?.correct_word) {
      setLastTargetPhrase(corrections[0].correct_word);
    }
  };

  const capRepeatAfterThreeAttempts = (
    targetPhrase: string,
    askRepeat: string,
    corrections: SpeakingCorrection[],
    wordStatuses: WordStatus[],
  ) => {
    const hasTargetError =
      Boolean(targetPhrase) &&
      (corrections.length > 0 ||
        wordStatuses.some((status) => status.status === 'incorrect' || status.status === 'missing'));

    if (!hasTargetError) {
      coachRepeatRef.current = { target: askRepeat || '', attempts: 0 };
      return { askRepeat, corrections };
    }

    if (coachRepeatRef.current.target !== targetPhrase) {
      coachRepeatRef.current = { target: targetPhrase, attempts: 1 };
    } else {
      coachRepeatRef.current.attempts += 1;
    }

    if (coachRepeatRef.current.attempts >= 3) {
      coachRepeatRef.current = { target: '', attempts: 0 };
      setLastTargetPhrase('');
      return { askRepeat: '', corrections: [] };
    }

    return { askRepeat, corrections };
  };

  const handleSendMessage = async (
    customText?: string,
    options: { targetPhraseOverride?: string; isSpokenInput?: boolean } = {},
  ) => {
    const textToSend = customText || inputValue;
    if (!textToSend.trim()) return;

    if (customText) {
      playAppSound(480, 'sine', 0.08);
    } else {
      playAppSound(520, 'sine', 0.08);
    }

    setErrorMsg(null);
    hideSilenceHint();

    // Capture target phrase before clearing state
    const spokenText = textToSend.trim();
    const targetPhrase = (options.targetPhraseOverride ?? lastTargetPhrase).trim();
    const shouldRunSpeakingCoach = Boolean(options.isSpokenInput || inputFromSpeech || targetPhrase);

    const newUserMessage: Message = {
      id: Math.random().toString(),
      role: 'user',
      content: spokenText,
      timestamp: new Date()
    };

    const updatedMessages = [...messages, newUserMessage];
    setMessages(prev => [...prev, newUserMessage]);
    setInputValue('');
    setInputFromSpeech(false);
    // Clear target phrase after capturing it for this turn
    setLastTargetPhrase('');
    setLoading(true);

    if (!activeSessionIdRef.current || activeSessionModeRef.current !== 'chat') {
      resetSessionRewardCounters();
    }

    try {
      await ensureBackendSession('chat');

      const response = await fetch('/api/chat', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          messages: updatedMessages.map(m => ({
            role: m.role,
            content: m.content
          })),
          topic: currentTopicConfig.id,
          topic_name: currentTopicConfig.topicName,
          vocabulary: currentTopicConfig.vocabulary,
          childId: currentChild?.id || undefined,
          childAge: currentChild?.age ?? undefined,
          childName: currentChild?.name || undefined,
          // Speaking coach fields. Target phrases get word-by-word scoring;
          // mic input without a target still gets free-form correction hints.
          spoken_text: shouldRunSpeakingCoach ? spokenText : '',
          target_phrase: targetPhrase || '',
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.error ||
          errorData.message ||
          errorData.detail ||
          (globalLang === 'en' ? 'Unable to send the message.' : 'Gửi tin nhắn thất bại'),
        );
      }

      const data = await response.json();
      const normalized = normalizeSpeakingCoachPayload(data, spokenText, targetPhrase);
      const replyText = normalized.reply;
      const wordStatuses = normalized.word_statuses;
      const score = normalized.score;
      const replyTranslationFromServer = normalized.translation;
      const corrections = normalized.corrections;
      const askRepeat = normalized.ask_repeat;
      const pronunciationScore = normalized.pronunciation_score;
      const cappedCoach = capRepeatAfterThreeAttempts(targetPhrase, askRepeat, corrections, wordStatuses);

      // Update user message with IPA scoring results
      if (wordStatuses.length > 0 || cappedCoach.corrections.length > 0 || normalized.grammar_review || normalized.grammar_score || typeof pronunciationScore === 'number') {
        setMessages(prev => prev.map(m =>
          m.id === newUserMessage.id
            ? {
              ...m,
              wordStatuses,
              score,
              corrections: cappedCoach.corrections,
              askRepeat: cappedCoach.askRepeat,
              pronunciationScore,
              grammarReview: normalized.grammar_review,
              grammarScore: normalized.grammar_score,
            }
            : m
        ));
      }

      if (targetPhrase || cappedCoach.corrections.length > 0 || wordStatuses.length > 0 || normalized.grammar_review || normalized.grammar_score) {
        applySpeakingCoachState(
          spokenText,
          cappedCoach.corrections,
          cappedCoach.askRepeat,
          pronunciationScore,
          normalized.grammar_review,
          normalized.grammar_score,
        );
      }

      // If user successfully submitted the active prompt, advance to next prompt in game loop
      const activePrompt = quickPrompts[currentPromptIndex % quickPrompts.length];
      if (activePrompt && spokenText.toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?]/g, "").trim() === activePrompt.text.toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?]/g, "").trim()) {
        setCurrentPromptIndex(prev => prev + 1);
      }

      onUsageSync?.();

      let cleanReply = replyText;
      let replyTranslation = replyTranslationFromServer;

      // Fallback: extract translation from parentheses if server didn't return one
      if (!replyTranslation) {
        const matchPattern = replyText.match(/\(([^)]+)\)/);
        if (matchPattern && matchPattern[1]) {
          replyTranslation = matchPattern[1];
          cleanReply = replyText.replace(/\([^)]+\)/, "").trim();
        }
      }

      const newAssistantMessage: Message = {
        id: Math.random().toString(),
        role: 'assistant',
        content: cleanReply,
        translation:
          replyTranslation || (globalLang === 'en' ? 'Keep going, you are doing great!' : 'Cố lên bé ơi!'),
        timestamp: new Date()
      };

      setMessages(prev => [...prev, newAssistantMessage]);

      setTimeout(() => {
        handleSpeakText(cleanReply, newAssistantMessage.id);
      }, 300);

      playAppSound(880, 'sine', 0.15);

      registerSpeechReward(1);
      scheduleSilenceHint('chat', 5000);

    } catch (e: any) {
      setErrorMsg(e.message || (globalLang === 'en' ? 'Unable to reach the server.' : 'Lỗi kết nối máy chủ.'));
    } finally {
      setLoading(false);
    }
  };

  // ── Internal: actually reset chat and save session ──────────────────────────
  const commitResetChat = async () => {
    playAppSound(300, 'triangle', 0.12);
    hideSilenceHint();
    const transcriptSnapshot = messagesRef.current.slice(-12);
    const saved = await closeSessionWithRewards(
      globalLang === 'en' ? 'Chat practice ended.' : 'Kết thúc phiên chat luyện nói.',
      transcriptSnapshot,
    );
    if (!saved && activeSessionIdRef.current) {
      return;
    }
    const { initialGreeting, initialTranslation } = buildTopicWelcome(selectedTopic);
    setMessages([
      {
        id: 'welcome',
        role: 'assistant',
        content: initialGreeting,
        translation: initialTranslation,
        timestamp: new Date()
      }
    ]);
    setErrorMsg(null);
    setInputValue('');
    setLastSpoken('');
    setLastCorrections([]);
    setLastAskRepeat('');
    setLastPronunciationScore(undefined);
    setLastGrammarReview(undefined);
    setLastGrammarScore(undefined);
    coachRepeatRef.current = { target: '', attempts: 0 };
    setHintLevel(1);
    setInterimTranscript('');
  };

  // ── Public reset chat: prompt confirmation if session has content ────────────
  const handleResetChat = () => {
    const hasContent = Boolean(activeSessionIdRef.current) && hasCurrentSessionProgress();

    if (hasContent) {
      pendingEndActionRef.current = () => commitResetChat();
      setShowEndSessionModal(true);
      return;
    }

    commitResetChat();
  };

  const handleSelectTopic = (topicId: string) => {
    const topic = CONVERSATION_TOPICS.find((item) => item.id === topicId) || CONVERSATION_TOPICS[0];
    setSelectedTopic(topic.id);
    setIsTopicMenuOpen(false);
    localStorage.setItem('parent_chat_topic', topic.id);
    playAppSound(260, 'sine', 0.08);
    const { initialGreeting, initialTranslation } = buildTopicWelcome(topic.id);

    setMessages([
      {
        id: `welcome_${topic.id}_${Date.now()}`,
        role: 'assistant',
        content: initialGreeting,
        translation: initialTranslation,
        timestamp: new Date(),
      }
    ]);
    setRevealedTranslations({});
    setErrorMsg(null);
    setInputValue('');
    setLastSpoken('');
    setLastCorrections([]);
    setLastAskRepeat('');
    setLastPronunciationScore(undefined);
    setLastGrammarReview(undefined);
    setLastGrammarScore(undefined);
    coachRepeatRef.current = { target: '', attempts: 0 };
    setHintLevel(1);
    setInterimTranscript('');
    hideSilenceHint();
    setCurrentPromptIndex(0);
    setUsedWordIndices([]);
  };

  const messagesRef = useRef<Message[]>([]);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    const handleBeforeUnload = () => {
      if (activeSessionIdRef.current) {
        const hasProgress = hasCurrentSessionProgress();
        const transcriptSnapshot = messagesRef.current.slice(-12);
        const payload = JSON.stringify({
          overallScore: calculateSessionScore(sessionMouthCountRef.current),
          summary: 'Session auto-saved on exit.',
          mouthCount: sessionMouthCountRef.current,
          earnedXp: sessionEarnedXpRef.current,
          transcript: (hasProgress ? transcriptSnapshot : []).map((message) => ({
            role: message.role,
            content: message.content,
            translation: message.translation,
            score: message.score,
            wordStatuses: message.wordStatuses,
            corrections: message.corrections,
            askRepeat: message.askRepeat,
            pronunciationScore: message.pronunciationScore,
            grammarReview: message.grammarReview,
          })),
        });

        // sendBeacon does not support application/json well due to CORS preflight
        fetch(`/api/sessions/${activeSessionIdRef.current}/end`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          keepalive: true,
          body: payload,
        }).catch(() => { });
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      if (activeSessionIdRef.current) {
        const hasProgress = hasCurrentSessionProgress();
        const transcriptSnapshot = messagesRef.current.slice(-12);
        fetch(`/api/sessions/${activeSessionIdRef.current}/end`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          keepalive: true,
          body: JSON.stringify({
            overallScore: calculateSessionScore(sessionMouthCountRef.current),
            summary: 'Session auto-saved on exit.',
            mouthCount: sessionMouthCountRef.current,
            earnedXp: sessionEarnedXpRef.current,
            transcript: (hasProgress ? transcriptSnapshot : []).map((message) => ({
              role: message.role,
              content: message.content,
              translation: message.translation,
              score: message.score,
              wordStatuses: message.wordStatuses,
              corrections: message.corrections,
              askRepeat: message.askRepeat,
              pronunciationScore: message.pronunciationScore,
              grammarReview: message.grammarReview,
            })),
          }),
        }).catch(() => { });
        activeSessionIdRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (selectedTopic !== 'freetalk') {
      const { initialGreeting, initialTranslation } = buildTopicWelcome(selectedTopic);
      setMessages([
        {
          id: `welcome_${selectedTopic}_init`,
          role: 'assistant',
          content: initialGreeting,
          translation: initialTranslation,
          timestamp: new Date(),
        }
      ]);
    }
  }, []);

  const isLight = globalTheme === 'light';

  return (
    <div className={`speaking-shell-height rounded-[16px] border border-b-4 p-3 md:p-5 flex flex-col w-full max-w-full min-w-0 flex-1 min-h-0 shadow-2xl relative overflow-hidden overflow-x-hidden transition-all duration-300 ${isLight
      ? 'bg-white/55 backdrop-blur-md border-sky-200/80 text-[var(--app-text)] shadow-[0_12px_34px_rgba(59,130,246,0.12)]'
      : 'bg-[#152026]/70 backdrop-blur-md border-[#37464f] text-[var(--app-text)] shadow-[0_12px_34px_rgba(0,0,0,0.25)]'
      }`}>

      {/* Global Tab Radial Glow */}
      <div
        className="absolute inset-0 pointer-events-none z-0"
        style={{
          background: isLight
            ? 'radial-gradient(ellipse at center, rgba(125,211,252,0.2) 0%, rgba(147,197,253,0.1) 34%, transparent 78%)'
            : 'radial-gradient(ellipse at center, rgba(28,176,246,0.06) 0%, transparent 100%)'
        }}
      />

      {/* Ensure inner content stays above the global background */}
      <div className="relative z-10 flex flex-col w-full flex-1 min-h-0 min-w-0">

        {/* 1. SEAMLESS MODE NAVIGATION STRIP */}
        <div className="shrink-0 sticky top-0 flex pb-1.5 mb-1.5 sm:pb-3 sm:mb-3 items-center justify-between relative z-20 bg-transparent border-none shadow-none backdrop-blur-0">
          <div className={`flex p-1 rounded-[12px] sm:p-1.5 sm:rounded-[16px] ${isLight ? 'border border-[var(--app-border)] bg-[var(--app-bg-alt)]' : 'bg-[var(--app-bg-alt)]'}`}>
            <button
              onClick={() => {
                setActiveTabMode('call');
              }}
              className={`flex items-center gap-1.5 px-2.5 py-1 sm:px-4 sm:py-1.5 rounded-[9px] sm:rounded-[12px] text-[10px] sm:text-xs font-extrabold transition cursor-pointer uppercase tracking-wide ${activeTabMode === 'call'
                ? 'bg-[var(--app-accent-purple)] text-white shadow-md'
                : isLight ? 'text-[var(--app-text-muted)] hover:bg-white hover:text-[var(--app-text)]' : 'text-[var(--app-text-muted)] hover:bg-[var(--app-surface)] hover:text-[var(--app-text)]'
                }`}
            >
              <Phone className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
              <span className="hidden sm:inline">{globalLang === 'en' ? 'Hands-free call' : 'Gọi nói rảnh tay'}</span>
              <span className="inline sm:hidden">{globalLang === 'en' ? 'Call' : 'Gọi nói'}</span>
            </button>
            <button
              onClick={() => {
                // If there's an active call session, ask before switching tabs
                const hasActiveCall =
                  isCallActive &&
                  (Boolean(activeSessionIdRef.current) ||
                    sessionMouthCountRef.current > 0 ||
                    messages.length > 1);

                if (hasActiveCall) {
                  pendingEndActionRef.current = () => {
                    commitStopCallSession();
                    setActiveTabMode('chat');
                  };
                  setShowEndSessionModal(true);
                } else {
                  // No active call — switch immediately, no confirmation needed
                  teardownCallSession();
                  setActiveTabMode('chat');
                }
              }}
              className={`flex items-center gap-1.5 px-2.5 py-1 sm:px-4 sm:py-1.5 rounded-[9px] sm:rounded-[12px] text-[10px] sm:text-xs font-extrabold transition cursor-pointer uppercase tracking-wide ${activeTabMode === 'chat'
                ? 'bg-[var(--app-accent-green)] text-white shadow-md'
                : isLight ? 'text-[var(--app-text-muted)] hover:bg-white hover:text-[var(--app-text)]' : 'text-[var(--app-text-muted)] hover:bg-[var(--app-surface)] hover:text-[var(--app-text)]'
                }`}
            >
              <MessageSquare className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
              <span className="hidden sm:inline">{globalLang === 'en' ? 'Text chat' : 'Chat bằng chữ'}</span>
              <span className="inline sm:hidden">{globalLang === 'en' ? 'Chat' : 'Chat chữ'}</span>
            </button>
          </div>

          {/* Global Stats/Actions button */}
          <div className="flex flex-row items-center gap-1 sm:gap-1.5">


            {activeTabMode === 'chat' && (
              <button
                onClick={handleResetChat}
                className={`p-2 rounded-full border transition cursor-pointer ${isLight
                  ? 'bg-gray-100 hover:bg-gray-200 border-gray-200 text-gray-500 hover:text-gray-900'
                  : 'bg-[#202f36] hover:bg-[#2c3d46] border-[#37464f] text-gray-400 hover:text-white'
                  }`}
                title={globalLang === 'en' ? 'Restart conversation' : 'Bắt đầu lại cuộc hội thoại'}
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            )}

            {/* Voice Settings Sliders Trigger */}
            <button
              onClick={() => {
                playAppSound(450, 'sine', 0.08);
                setShowVoiceSettings(!showVoiceSettings);
              }}
              className={`p-2 rounded-[12px] border flex items-center gap-1.5 text-xs font-bold transition cursor-pointer ${showVoiceSettings
                ? 'bg-[var(--app-accent-blue)] border-[var(--app-accent-blue)] text-white'
                : isLight
                  ? 'bg-sky-50 border-sky-100 text-sky-700 hover:bg-sky-100'
                  : 'bg-[var(--app-bg-alt)] border-[var(--app-border)] text-sky-300 hover:bg-[var(--app-surface)]'
                }`}
              title={globalLang === 'en' ? 'Voice assistant settings' : 'Cài đặt giọng nói nhân vật'}
            >
              <Sliders className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{globalLang === 'en' ? 'Voice' : 'Giọng nói'}</span>
            </button>

            <div className={`hidden sm:flex items-center px-2.5 py-1 rounded-[12px] border text-[10px] font-black ${isLight
              ? 'bg-yellow-50 border-yellow-200 text-yellow-600'
              : 'bg-[#202f36]/60 border-[#37464f] text-yellow-400'
              }`}>
              <Star className="w-3.5 h-3.5 mr-1 fill-yellow-400 text-yellow-500" />
              <span>{globalLang === 'en' ? '+5-6 XP / turn' : '+5-6 XP / câu'}</span>
            </div>
          </div>
        </div>

        <AnimatePresence>
          {showHistory && (
            <motion.div
              className="absolute inset-0 z-50 flex items-center justify-center bg-slate-950/65 p-3 backdrop-blur-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowHistory(false)}
            >
              <motion.section
                role="dialog"
                aria-modal="true"
                aria-label={globalLang === 'en' ? 'Conversation history' : 'Lịch sử trò chuyện'}
                className={`flex max-h-[88%] w-full max-w-4xl flex-col overflow-hidden rounded-[22px] border shadow-2xl ${isLight ? 'border-slate-200 bg-white text-slate-900' : 'border-[#37464f] bg-[#131f24] text-white'}`}
                initial={{ y: 20, scale: 0.98, opacity: 0 }}
                animate={{ y: 0, scale: 1, opacity: 1 }}
                exit={{ y: 20, scale: 0.98, opacity: 0 }}
                onClick={(event) => event.stopPropagation()}
              >
                <header className={`flex items-center justify-between border-b px-5 py-4 ${isLight ? 'border-slate-200' : 'border-[#37464f]'}`}>
                  <div>
                    <h2 className="text-lg font-black">{globalLang === 'en' ? 'Conversation history' : 'Lịch sử trò chuyện'}</h2>
                    <p className="text-xs text-[var(--app-text-muted)]">{currentChild?.name}</p>
                  </div>
                  <button type="button" onClick={() => setShowHistory(false)} className="rounded-full p-2 hover:bg-black/10" aria-label={globalLang === 'en' ? 'Close' : 'Đóng'}>
                    <X className="h-5 w-5" />
                  </button>
                </header>

                <div className="grid min-h-0 flex-1 md:grid-cols-[300px_1fr]">
                  <div className={`overflow-y-auto border-b p-3 md:border-b-0 md:border-r ${isLight ? 'border-slate-200' : 'border-[#37464f]'}`}>
                    {historyLoading && <p className="p-4 text-center text-sm text-[var(--app-text-muted)]">{globalLang === 'en' ? 'Loading…' : 'Đang tải…'}</p>}
                    {historyError && <p className="rounded-xl bg-red-500/10 p-3 text-xs font-bold text-red-500">{historyError}</p>}
                    {!historyLoading && !historyError && historyItems.length === 0 && (
                      <p className="p-4 text-center text-sm text-[var(--app-text-muted)]">{globalLang === 'en' ? 'No conversations yet.' : 'Chưa có cuộc trò chuyện nào.'}</p>
                    )}
                    <div className="space-y-2">
                      {historyItems.map((item) => {
                        const isCall = isCallHistorySession(item);
                        const duration = item.endedAt
                          ? Math.round((new Date(item.endedAt).getTime() - new Date(item.startedAt).getTime()) / 60000)
                          : null;
                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => setSelectedHistory(item)}
                            className={`w-full rounded-xl border p-3 text-left transition ${selectedHistory?.id === item.id ? 'border-violet-500 bg-violet-500/10' : isLight ? 'border-slate-200 hover:bg-slate-50' : 'border-[#37464f] hover:bg-[#202f36]'}`}
                          >
                            <div className="flex items-center gap-1.5 mb-1">
                              <span className={`rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-wide ${isCall
                                ? 'bg-purple-100 text-purple-700'
                                : 'bg-emerald-100 text-emerald-700'
                                }`}>
                                {isCall ? '📞' : '💬'} {isCall ? (globalLang === 'en' ? 'Call' : 'Gọi') : (globalLang === 'en' ? 'Chat' : 'Chat')}
                              </span>
                              {duration !== null && (
                                <span className="text-[9px] font-bold text-[var(--app-text-muted)]">
                                  {duration}m
                                </span>
                              )}
                              {item.turnCount > 0 && (
                                <span className="text-[9px] font-bold text-[var(--app-text-muted)]">
                                  · {item.turnCount} {globalLang === 'en' ? 'turns' : 'lượt'}
                                </span>
                              )}
                            </div>
                            <div className="text-xs font-black">{new Date(item.startedAt).toLocaleString(globalLang === 'en' ? 'en-US' : 'vi-VN', { dateStyle: 'short', timeStyle: 'short' })}</div>
                            <div className="mt-1 line-clamp-2 text-[11px] text-[var(--app-text-muted)]">{item.summary || (globalLang === 'en' ? 'Conversation session' : 'Phiên trò chuyện')}</div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="overflow-y-auto p-4">
                    {!selectedHistory ? (
                      <div className="flex h-full min-h-40 items-center justify-center text-center text-sm text-[var(--app-text-muted)]">
                        {globalLang === 'en' ? 'Choose a session to view its transcript.' : 'Chọn một phiên để xem đoạn trò chuyện.'}
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <div className={`rounded-2xl border p-4 ${isLight ? 'border-slate-200 bg-slate-50' : 'border-[#37464f] bg-[#1a2b32]'}`}>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] ${isCallHistorySession(selectedHistory)
                              ? 'bg-purple-100 text-purple-700'
                              : 'bg-emerald-100 text-emerald-700'
                              }`}>
                              {isCallHistorySession(selectedHistory)
                                ? (globalLang === 'en' ? 'Call session' : 'Phiên gọi')
                                : (globalLang === 'en' ? 'Chat session' : 'Phiên chat')}
                            </span>
                            <span className="text-xs font-bold text-[var(--app-text-muted)]">
                              {new Date(selectedHistory.startedAt).toLocaleString(globalLang === 'en' ? 'en-US' : 'vi-VN')}
                            </span>
                          </div>
                          <div className="mt-2 text-sm font-black">
                            {selectedHistory.summary || (globalLang === 'en' ? 'Conversation session' : 'Phiên trò chuyện')}
                          </div>
                          {selectedHistory.recordingUrl && (
                            <div className={`mt-3 rounded-xl border p-3 ${isLight ? 'border-amber-200 bg-amber-50' : 'border-amber-500/20 bg-amber-500/10'}`}>
                              <div className="mb-2 text-[11px] font-black uppercase tracking-[0.18em] text-amber-600">
                                {globalLang === 'en' ? 'Original call audio' : 'Audio gốc của cuộc gọi'}
                              </div>
                              <audio controls preload="none" className="w-full" src={selectedHistory.recordingUrl}>
                                {globalLang === 'en' ? 'Your browser does not support audio playback.' : 'Trình duyệt không hỗ trợ phát âm thanh.'}
                              </audio>
                            </div>
                          )}
                        </div>
                        {normalizeHistoryTranscript(selectedHistory).map((msg) => (
                          <div key={msg.id} className={`flex items-start gap-2.5 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs flex-shrink-0 ${msg.role === 'assistant' ? 'bg-[#ffc800] text-black' : 'bg-[#1cb0f6] text-white'}`}>
                              {msg.role === 'assistant' ? '☀️' : '👶'}
                            </div>

                            <div className="max-w-[90%] min-w-0 flex flex-col space-y-1">
                              <div className={`p-3 rounded-[16px] text-xs font-semibold relative ${msg.role === 'assistant'
                                ? isLight
                                  ? 'bg-gray-100/55 text-gray-900 rounded-tl-sm border-2 border-[#ffc800]'
                                  : 'bg-white text-gray-900 rounded-tl-sm border-2 border-[#ffc800]'
                                : 'bg-[#ffc800] text-black rounded-tr-sm font-bold'
                                }`}>
                                {msg.role === 'assistant' ? (
                                  <div className={`w-2.5 h-2.5 absolute -left-1.5 top-2.5 transform -rotate-45 border-l-2 border-t-2 border-[#ffc800] ${isLight ? 'bg-gray-100/55' : 'bg-white'}`} />
                                ) : (
                                  <div className="w-2.5 h-2.5 bg-[#ffc800] absolute -right-1.5 top-2.5 transform rotate-45" />
                                )}

                                <div className="fluid-body whitespace-pre-line wrap-anywhere">{msg.content}</div>

                                {msg.role === 'assistant' && msg.translation && (
                                  <div className="mt-2">
                                    {revealedTranslations[msg.id] ? (
                                      <div className={`mt-2 pt-2 border-t border-dashed text-[11px] font-medium leading-relaxed italic ${isLight ? 'border-gray-300 text-gray-700' : 'border-slate-600 text-slate-200'}`}>
                                        <div className="flex items-center gap-1 text-[9px] font-extrabold text-[#ff9600] uppercase tracking-wider mb-1">
                                          <Languages className="w-3 h-3" />
                                          <span>{globalLang === 'en' ? 'Vietnamese translation:' : 'Dịch sang Tiếng Việt:'}</span>
                                        </div>
                                        <div
                                          className={`normal-case not-italic font-bold wrap-anywhere ${isLight ? 'text-slate-800' : 'text-slate-100'}`}
                                          style={{ WebkitTextFillColor: 'unset' }}
                                        >
                                          {msg.translation}
                                        </div>
                                        <button
                                          onClick={() => toggleTranslation(msg.id)}
                                          className="text-[9px] font-black uppercase text-purple-600 hover:underline mt-1.5 cursor-pointer block"
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
                                        className={`mt-2.5 flex items-center gap-1 px-2.5 py-1 rounded-[10px] text-[10px] font-extrabold uppercase tracking-wider transition-all duration-200 cursor-pointer shadow-sm ${isLight
                                          ? 'bg-purple-100 hover:bg-purple-200 text-purple-700 border border-purple-200'
                                          : 'bg-purple-950 hover:bg-purple-900 border border-purple-800 text-purple-300'
                                          }`}
                                      >
                                        <Languages className="w-3 h-3" />
                                        <span>{globalLang === 'en' ? 'Vietnamese 🇻🇳' : 'Dịch tiếng Việt 🇻🇳'}</span>
                                      </button>
                                    )}
                                  </div>
                                )}

                                {false && msg.role === 'user' && Array.isArray(msg.wordStatuses) && msg.wordStatuses.length > 0 && (
                                  <div className={`mt-2 rounded-xl border p-2.5 ${isLight ? 'border-sky-200 bg-sky-50/80' : 'border-sky-400/20 bg-sky-400/10'}`}>
                                    <div className="flex flex-wrap items-center gap-2">
                                      <span className="text-[10px] font-black uppercase tracking-[0.16em] text-sky-600">
                                        {globalLang === 'en' ? 'Pronunciation review' : 'Xem lại phát âm'}
                                      </span>
                                      {typeof msg.score === 'number' && (
                                        <span className="rounded-full bg-white/80 px-2 py-0.5 text-[10px] font-black text-sky-700">
                                          {globalLang === 'en' ? 'Score' : 'Điểm'}: {Math.round(msg.score)}
                                        </span>
                                      )}
                                    </div>
                                    <div className="mt-2 space-y-2">
                                      {msg.wordStatuses.map((status, index) => (
                                        <div key={`${msg.id}_word_${index}`} className={`rounded-lg border px-2.5 py-2 text-[11px] ${isLight ? 'border-white bg-white/80 text-slate-700' : 'border-white/10 bg-black/15 text-slate-100'}`}>
                                          <div className="flex flex-wrap items-center gap-2">
                                            <span className="font-black">{status.word}</span>
                                            {status.ipa && <span className="font-mono text-pink-500">{status.ipa}</span>}
                                            <span className={`rounded-full px-2 py-0.5 text-[9px] font-black uppercase ${status.status === 'correct'
                                              ? 'bg-emerald-100 text-emerald-700'
                                              : status.status === 'incorrect'
                                                ? 'bg-rose-100 text-rose-700'
                                                : 'bg-amber-100 text-amber-700'
                                              }`}>
                                              {status.status === 'correct'
                                                ? (globalLang === 'en' ? 'Correct' : 'Đúng')
                                                : status.status === 'incorrect'
                                                  ? (globalLang === 'en' ? 'Needs work' : 'Cần sửa')
                                                  : (globalLang === 'en' ? 'Missing' : 'Thiếu')}
                                            </span>
                                          </div>
                                          {status.tip_vi && <div className="mt-1 text-[10px] leading-relaxed text-[var(--app-text-muted)]">{status.tip_vi}</div>}
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>

                              <div className={`flex items-center gap-1 ${msg.role === 'user' ? 'justify-end pr-1' : 'pl-1'}`}>
                                <button
                                  onClick={() => handleSpeakText(msg.content, msg.id)}
                                  className={`text-[9px] font-bold uppercase tracking-wider rounded-md px-1.5 py-0.5 border flex items-center gap-0.5 transition cursor-pointer ${isSpeakingId === msg.id
                                    ? 'bg-[#df52ff] border-[#df52ff] text-white animate-bounce'
                                    : isLight
                                      ? 'bg-transparent border-gray-300 text-purple-600 hover:bg-purple-100'
                                      : 'bg-transparent border-[#37464f] text-[#ff9600] hover:bg-[#202f36]'
                                    }`}
                                >
                                  <Volume2 className="w-2.5 h-2.5 mr-0.5" />
                                  <span>{isSpeakingId === msg.id ? (globalLang === 'en' ? 'Speaking...' : 'Đang đọc...') : (globalLang === 'en' ? 'Replay' : 'Nghe lại')}</span>
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                        {normalizeHistoryTranscript(selectedHistory).length === 0 && (
                          <p className="py-8 text-center text-sm text-[var(--app-text-muted)]">{globalLang === 'en' ? 'This session has no saved transcript.' : 'Phiên này chưa có đoạn chat được lưu.'}</p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </motion.section>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Desktop Topic selector (Hidden on Mobile) — click to open a scrollable list */}
        <div className={`relative hidden sm:flex shrink-0 p-3 rounded-[16px] border flex-row items-center gap-3 mb-3 transition-all duration-300 ${isCallActive ? 'hidden lg:flex' : 'flex'
          } ${isLight
            ? 'bg-gradient-to-r from-sky-50 to-indigo-50 border-sky-100 shadow-sm'
            : 'bg-slate-900/80 border-white/[0.08]'
          }`}>
          <div className="flex items-center gap-2 shrink-0">
            <Sparkles className="w-4 h-4 text-emerald-500" />
            <span className={`text-[11px] font-black uppercase tracking-wider ${isLight ? 'text-sky-700' : 'text-sky-400'}`}>
              {globalLang === 'en' ? 'Topic speaking mode' : 'Chế độ nói theo chủ đề'}
            </span>
          </div>

          <button
            type="button"
            onClick={() => setIsTopicMenuOpen((open: boolean) => !open)}
            aria-expanded={isTopicMenuOpen}
            className={`flex items-center gap-2 py-1.5 px-3 rounded-full text-[11px] font-black transition duration-200 cursor-pointer border border-b-2 ${isLight
              ? 'bg-white border-slate-200 text-slate-700 hover:bg-sky-50 hover:border-sky-200'
              : 'bg-slate-800 border-white/[0.08] text-slate-200 hover:bg-slate-700'
              }`}
            title={currentTopicConfig.desc}
          >
            <span>{currentTopicConfig.label}</span>
            <svg className={`w-3.5 h-3.5 transition-transform duration-200 ${isTopicMenuOpen ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>

          {isTopicMenuOpen && (
            <>
              {/* Click-away overlay */}
              <div className="fixed inset-0 z-40" onClick={() => setIsTopicMenuOpen(false)} />
              <div
                className={`absolute left-3 top-full z-50 mt-1.5 max-h-64 w-72 overflow-y-auto custom-scrollbar rounded-[16px] border p-2 shadow-2xl ${isLight
                  ? 'border-slate-200 bg-white'
                  : 'border-white/[0.08] bg-slate-900'
                  }`}
              >
                <div className="grid grid-cols-1 gap-1">
                  {CONVERSATION_TOPICS.map((topic) => {
                    const isSelected = selectedTopic === topic.id;
                    return (
                      <button
                        key={topic.id}
                        onClick={() => handleSelectTopic(topic.id)}
                        className={`flex items-center justify-between gap-2 py-2 px-3 rounded-[12px] text-[12px] font-black text-left transition duration-150 cursor-pointer ${isSelected
                          ? 'bg-emerald-500 text-white'
                          : isLight
                            ? 'text-slate-600 hover:bg-sky-50'
                            : 'text-slate-300 hover:bg-slate-800'
                          }`}
                        title={topic.desc}
                      >
                        <span>{topic.label}</span>
                        {isSelected && <span className="text-[10px]">✔</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Mobile View: Two separate cards side-by-side */}
        <div className={`flex sm:hidden shrink-0 items-stretch gap-2 mb-3 w-full ${isCallActive ? 'hidden' : 'flex'}`}>
          {/* Frame 1: Topic Selection */}
          <div className={`flex-[1.2] flex flex-col justify-between p-3 rounded-[16px] border ${isLight
            ? 'bg-gradient-to-r from-sky-50 to-sky-100/50 border-sky-100 shadow-sm'
            : 'bg-slate-900/80 border-white/[0.08]'
            }`}>
            <div className="flex items-center gap-1.5 mb-2 shrink-0">
              <Sparkles className="w-3.5 h-3.5 text-emerald-500" />
              <span className={`text-[10px] font-black uppercase tracking-wider ${isLight ? 'text-sky-700' : 'text-sky-400'}`}>
                {globalLang === 'en' ? 'Topic' : 'Chủ đề'}
              </span>
            </div>
            <select
              value={selectedTopic}
              onChange={(e) => handleSelectTopic(e.target.value)}
              className={`w-full text-xs font-black rounded-lg py-2 px-2 border focus:outline-none focus:ring-2 focus:ring-sky-400 ${isLight ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-800 border-white/[0.08] text-slate-200'}`}
            >
              {CONVERSATION_TOPICS.map((topic) => (
                <option key={topic.id} value={topic.id}>
                  {topic.label}
                </option>
              ))}
            </select>
          </div>

          {/* Frame 2: Child Profile */}
          <div className={`flex-1 flex flex-col justify-between p-3 rounded-[16px] border ${isLight
            ? 'bg-gradient-to-r from-indigo-50 to-indigo-100/50 border-indigo-100 shadow-sm'
            : 'bg-slate-900/80 border-white/[0.08]'
            }`}>
            {currentChild ? (
              <>
                <div className="text-xs font-black text-emerald-500 text-center truncate mb-2">
                  {currentChild.name}
                </div>
                <div className="flex items-center gap-1.5 min-w-0">
                  <div className={`flex-1 flex items-center justify-center gap-0.5 py-1.5 px-1 rounded-lg border text-[10px] font-black select-none ${isLight
                    ? 'bg-amber-50 border-amber-100 text-amber-600'
                    : 'bg-amber-950/40 border-amber-900/50 text-amber-400'
                    }`} title={globalLang === 'en' ? 'Streak' : 'Chuỗi học'}>
                    <span>🔥 {state.streak || 0}</span>
                  </div>
                  <div className={`flex-1 flex items-center justify-center gap-0.5 py-1.5 px-1 rounded-lg border text-[10px] font-black select-none ${isLight
                    ? 'bg-emerald-50 border-emerald-100 text-emerald-600'
                    : 'bg-emerald-950/40 border-emerald-900/50 text-emerald-400'
                    }`} title={globalLang === 'en' ? 'XP' : 'Điểm tích luỹ'}>
                    <span>⚡ {state.xp || 0}</span>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center">
                <span className="text-xs font-black text-slate-400">👤 {globalLang === 'en' ? 'Guest' : 'Khách'}</span>
              </div>
            )}
          </div>
        </div>

        {/* ========================================================
          TAB VIEW 1: ADVANCED HANDS-FREE VOICE CALL EXPERIENCE
         ======================================================== */}
        {/* Voice Customization Settings Drawer/Overlay */}
        <AnimatePresence>
          {showVoiceSettings && (
            <motion.div
              initial={{ opacity: 0, y: -12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -12, scale: 0.98 }}
              className="fixed inset-x-4 top-[88px] z-[70] max-w-full md:absolute md:left-auto md:right-4 md:top-[132px] md:w-[540px] md:max-w-[calc(100vw-2rem)]"
            >
              <div
                className={`rounded-[16px] border border-b-4 p-4 text-xs shadow-2xl overflow-y-auto overflow-x-hidden max-h-[min(70vh,560px)] transition-all duration-300 ${isLight
                  ? 'bg-[#f7f9fa] border-gray-200 text-gray-800'
                  : 'bg-[#1a2c35] border-[#37464f] text-white'
                  }`}
              >
                <div className="flex justify-between items-center mb-3">
                  <h4 className="font-extrabold uppercase text-[#1cb0f6] tracking-wider flex items-center gap-1.5 text-xs">
                    <Sliders className="w-4 h-4 text-[#1cb0f6]" /> {globalLang === 'en' ? 'Sunny voice assistant settings ☀️' : 'Cấu hình trợ lý giọng nói Sunny ☀️'}
                  </h4>
                  <button
                    onClick={() => setShowVoiceSettings(false)}
                    className="rounded-[10px] border border-transparent px-2 py-1 text-[11px] font-extrabold text-gray-400 transition hover:border-red-200 hover:text-red-500 cursor-pointer"
                  >
                    {globalLang === 'en' ? 'Close' : 'Đóng'}
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {/* Speed / Rate control */}
                  <div className="space-y-1.5">
                    <label className="block font-bold text-gray-400">
                      {globalLang === 'en' ? 'Speech rate:' : 'Tốc độ phát âm:'} <span className="ml-1 rounded bg-[#1cb0f6] px-1.5 py-0.5 text-xs font-mono font-bold text-white">{voiceRate}x</span>
                    </label>
                    <input
                      type="range"
                      min="0.5"
                      max="1.5"
                      step="0.05"
                      value={voiceRate}
                      onChange={(e) => handleSaveVoiceConfig(Number(e.target.value), voicePitch, selectedVoiceName)}
                      className="w-full accent-[#1cb0f6] cursor-pointer"
                    />
                    <div className="flex justify-between text-[10px] text-gray-500">
                      <span>{globalLang === 'en' ? 'Slow 🐢 (0.5)' : 'Chậm 🐢 (0.5)'}</span>
                      <span>{globalLang === 'en' ? 'Normal' : 'Bình thường'}</span>
                      <span>{globalLang === 'en' ? 'Fast ⚡ (1.5)' : 'Nhanh ⚡ (1.5)'}</span>
                    </div>
                  </div>

                  {/* Pitch control */}
                  <div className="space-y-1.5">
                    <label className="block font-bold text-gray-400">
                      {globalLang === 'en' ? 'Voice pitch:' : 'Cao độ (Càng cao giọng càng giống em bé):'} <span className="ml-1 rounded bg-[#df52ff] px-1.5 py-0.5 text-xs font-mono font-bold text-white">{voicePitch}</span>
                    </label>
                    <input
                      type="range"
                      min="0.5"
                      max="1.8"
                      step="0.1"
                      value={voicePitch}
                      onChange={(e) => handleSaveVoiceConfig(voiceRate, Number(e.target.value), selectedVoiceName)}
                      className="w-full accent-[#df52ff] cursor-pointer"
                    />
                    <div className="flex justify-between text-[10px] text-gray-500">
                      <span>{globalLang === 'en' ? 'Warm 🧔 (0.5)' : 'Trầm ấm 🧔 (0.5)'}</span>
                      <span>Sunny ☀️ (1.2)</span>
                      <span>{globalLang === 'en' ? 'Playful 🧸 (1.8)' : 'Nhí nhảnh 🧸 (1.8)'}</span>
                    </div>
                  </div>

                  {/* Browser Voice selector */}
                  <div className="space-y-1.5">
                    <label className="block font-bold text-gray-400">{globalLang === 'en' ? 'Voice engine:' : 'Bộ phát âm (Voice Engine):'}</label>
                    {availableVoices.length === 0 ? (
                      <div className="p-2 border border-dashed border-[#37464f] text-[10px] text-gray-400 rounded">
                        {globalLang === 'en' ? 'Using the browser default English voice.' : 'Sử dụng giọng đọc mặc định của trình duyệt (Mỹ/Anh)'}
                      </div>
                    ) : (
                      <select
                        value={selectedVoiceName}
                        onChange={(e) => handleSaveVoiceConfig(voiceRate, voicePitch, e.target.value)}
                        className={`w-full text-xs rounded-[8px] py-1.5 px-2 focus:outline-none focus:border-[#1cb0f6] transition cursor-pointer font-bold ${isLight
                          ? 'bg-white border-gray-300 text-gray-950 border'
                          : 'bg-[#131f24] border-[#37464f] text-white border'
                          }`}
                      >
                        {availableVoices.map((v) => (
                          <option key={v.name} value={`browser:${v.name}`}>
                            {v.name} ({v.lang})
                          </option>
                        ))}
                      </select>
                    )}
                    <div className="text-[9px] text-gray-500 leading-tight">
                      {globalLang === 'en' ? 'Browser voices use the built-in device speech engine.' : 'Giọng trình duyệt dùng bộ đọc tích hợp của thiết bị.'}
                    </div>
                  </div>
                </div>

                <div className="flex justify-end gap-2 mt-4 pt-2 border-t border-gray-300/20">
                  <button
                    onClick={handleTestVoice}
                    className="px-3 py-1.5 bg-[#58cc02] hover:bg-[#4eb302] text-white font-extrabold rounded-lg transition text-[11px] uppercase flex items-center gap-1 cursor-pointer shadow-sm"
                  >
                    <span>{globalLang === 'en' ? 'Test Sunny voice 🔊' : 'Thử giọng của Sunny 🔊'}</span>
                  </button>
                  <button
                    onClick={() => {
                      playAppSound(200, 'sine', 0.05);
                      localStorage.setItem(voiceOnboardingKey, '1');
                      setShowVoiceSettings(false);
                    }}
                    className="px-3 py-1.5 bg-[#1cb0f6] hover:bg-[#1599d8] text-white font-extrabold rounded-lg transition text-[11px] uppercase cursor-pointer shadow-sm"
                  >
                    <span>{globalLang === 'en' ? 'Confirm & save' : 'Xác nhận & lưu'}</span>
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className={`shrink-0 mb-3 flex-wrap items-center gap-2 ${isCallActive ? 'hidden lg:flex' : 'flex'}`}>
          <div className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] ${isLight ? 'border-[#d7ecbb] bg-[#f5fff0] text-[#58cc02]' : 'border-[#2d4b35] bg-[#112017] text-[#7fe23a]'
            }`}>
            {globalLang === 'en' ? 'Session XP' : 'XP phiên này'}: +{sessionEarnedXp}
          </div>
          <div className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] ${isLight ? 'border-[#f2d7aa] bg-[#fff8ec] text-[#ff9600]' : 'border-[#5b4727] bg-[#21170b] text-[#ffb347]'
            }`}>
            {globalLang === 'en' ? 'Mouth opens' : 'Số lần nói'}: {sessionMouthCount}
          </div>
        </div>

        {activeTabMode === 'call' ? (
          <div className="flex-1 min-h-0 flex flex-col py-1">

            {/* Incoming Ring / Idle Start UI if session is inactive */}
            {!isCallActive ? (
              <div className="flex-1 flex flex-col items-center">
                <div className="mt-2 md:mt-6 flex flex-col items-center justify-center text-center gap-4 py-4 px-2 w-full">
                  {/* Compact avatar ring - now acts as the start call button */}
                  <button
                    onClick={startCallSession}
                    className="relative -translate-y-3 md:-translate-y-5 flex-shrink-0 cursor-pointer group rounded-full outline-none focus:ring-4 focus:ring-[#ff9600]/50 transition-transform hover:scale-105 active:scale-95"
                    title={globalLang === 'en' ? 'Start calling Sunny' : 'Gọi cho Sunny'}
                  >
                    <MascotAmbientDecor isLight={isLight} topicId={selectedTopic} />
                    <div
                      className="absolute inset-0 rounded-full animate-ping"
                      style={{
                        animationDuration: '1.8s',
                        background: isLight
                          ? 'radial-gradient(circle, rgba(255,182,193,0.45) 0%, rgba(255,235,205,0.25) 60%, transparent 100%)'
                          : 'radial-gradient(circle, rgba(255,69,0,0.5) 0%, rgba(255,150,0,0.2) 60%, transparent 100%)'
                      }}
                    />
                    <div className={`relative p-2 rounded-full border-[3px] overflow-hidden ${isLight ? 'border-white/30 bg-white/20 backdrop-blur-md shadow-[0_25px_80px_rgba(255,107,107,0.1)]' : 'border-[#ff9600] bg-[#202f36]'}`}>
                      <div
                        className="absolute inset-0 pointer-events-none"
                        style={{
                          background: isLight
                            ? 'radial-gradient(circle, rgba(255,255,255,0.6) 0%, rgba(255,229,233,0.25) 52%, rgba(255,240,243,0.1) 76%, transparent 100%)'
                            : 'radial-gradient(circle, rgba(255,69,0,0.4) 0%, rgba(255,150,0,0.1) 60%, transparent 100%)'
                        }}
                      />
                      <div className="relative z-10 pointer-events-none">
                        <SunnyMascot outfitId={state.selectedOutfitId || 'normal'} state="idle" sizeClassName="w-[44vw] h-[44vw] max-w-full md:w-[42vw] md:h-[42vw] lg:w-[min(42vw,48vh)] lg:h-[min(42vw,48vh)]" />
                      </div>
                    </div>
                    {/* Floating badge to indicate it's clickable */}
                    <div className="absolute -bottom-2 inset-x-0 flex justify-center z-20 pointer-events-none">
                      <div className="bg-[#ff9600] text-white text-[10px] md:text-xs font-black uppercase px-4 py-1.5 rounded-full shadow-[0_4px_12px_rgba(255,150,0,0.4)] border-2 border-white flex items-center gap-1.5 group-hover:bg-[#e68700] transition-colors">
                        <Phone className="w-3.5 h-3.5" />
                        <span>{globalLang === 'en' ? 'Tap to Call' : 'Chạm để gọi'}</span>
                      </div>
                    </div>
                  </button>

                  <div className="max-w-sm space-y-1.5 mt-2">
                    <h3 className="text-sm font-bold uppercase tracking-tight text-[#ff9600]">
                      {globalLang === 'en' ? 'Start a hands-free call with Sunny' : 'Mở cuộc gọi rảnh tay với Sunny'}
                    </h3>

                  </div>
                </div>
              </div>
            ) : (

              // Connected Active Call Room View
              <>
                <div className="flex-1 min-h-0 flex flex-col lg:grid lg:grid-cols-[minmax(0,1fr)_320px] xl:grid-cols-[minmax(0,1fr)_360px] gap-2 lg:gap-4 lg:items-stretch lg:h-full overflow-hidden">

                  {/* Left Column: Video Call Area (The interactive bouncing mascot & states) */}
                  <div className={`w-full shrink-0 lg:shrink h-[160px] sm:h-[220px] md:h-[280px] lg:h-full rounded-[24px] border-2 p-1.5 sm:p-3 lg:p-5 flex flex-col items-center justify-center relative overflow-hidden shadow-inner ${isLight ? 'bg-white/15 border-white/20 backdrop-blur-md' : 'bg-[#1a2b32] border-[#37464f]'
                    }`}>

                    {/* Background active grid design */}
                    <div
                      className="absolute inset-0 pointer-events-none"
                      style={{
                        background: isLight
                          ? 'radial-gradient(ellipse at center, rgba(255,204,213,0.5) 0%, rgba(255,235,205,0.25) 45%, rgba(255,255,255,0.02) 76%)'
                          : 'radial-gradient(ellipse at center, rgba(255,69,0,0.15) 0%, rgba(255,150,0,0.06) 50%, transparent 100%)'
                      }}
                    />

                    {/* Top call status and timer display */}
                    <div className="absolute top-3 inset-x-3 lg:top-5 lg:inset-x-5 flex items-center justify-between z-10 pointer-events-none">
                      <div className="flex items-center gap-2">
                        <span className="relative flex h-2.5 w-2.5">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500"></span>
                        </span>
                        <span className="text-xs font-bold font-mono tracking-wider text-red-400 uppercase">
                          {globalLang === 'en' ? 'CALL CONNECTED' : 'ĐANG KẾT NỐI CUỘC GỌI'}
                        </span>
                      </div>

                      <div className={`px-3 py-1 rounded-full text-xs font-bold font-mono border ${isLight ? 'bg-white text-gray-700 border-gray-200' : 'bg-[#131f24] text-gray-300 border-[#37464f]'
                        }`}>
                        {globalLang === 'en' ? 'Time:' : 'Thời gian:'} {formatCallTime(callTimer)}
                      </div>
                    </div>

                    {/* Mascot avatar displaying active states (listening, speaking, processing) */}
                    <div className="flex-1 w-full min-h-0 flex flex-col items-center justify-center space-y-1 lg:space-y-3 py-1 lg:py-5">
                      <div className="relative -translate-y-3 sm:-translate-y-4 md:-translate-y-6 flex items-center justify-center">
                        <MascotAmbientDecor isLight={isLight} topicId={selectedTopic} />

                        {/* ── Aura / hào quang ── */}
                        {/* Base ambient glow — luôn hiện, đổi màu theo state */}
                        <div className={`absolute rounded-full pointer-events-none transition-all duration-700 ${callStatus === 'listening'
                          ? isLight
                            ? 'inset-[-18%] bg-emerald-400/20 shadow-[0_0_60px_30px_rgba(52,211,153,0.28)]'
                            : 'inset-[-18%] bg-emerald-500/18 shadow-[0_0_70px_35px_rgba(52,211,153,0.22)]'
                          : callStatus === 'speaking'
                            ? isLight
                              ? 'inset-[-18%] bg-violet-400/22 shadow-[0_0_60px_30px_rgba(167,139,250,0.30)]'
                              : 'inset-[-18%] bg-violet-500/20 shadow-[0_0_70px_35px_rgba(167,139,250,0.25)]'
                            : callStatus === 'processing'
                              ? isLight
                                ? 'inset-[-18%] bg-amber-400/22 shadow-[0_0_60px_28px_rgba(251,191,36,0.28)]'
                                : 'inset-[-18%] bg-amber-500/18 shadow-[0_0_65px_30px_rgba(251,191,36,0.22)]'
                              : callStatus === 'calling'
                                ? isLight
                                  ? 'inset-[-14%] bg-rose-400/20 shadow-[0_0_50px_20px_rgba(244,63,94,0.25)]'
                                  : 'inset-[-14%] bg-sky-500/15 shadow-[0_0_55px_22px_rgba(56,189,248,0.18)]'
                                : isLight
                                  ? 'inset-[-12%] bg-yellow-300/18 shadow-[0_0_40px_16px_rgba(253,224,71,0.20)]'
                                  : 'inset-[-12%] bg-yellow-400/12 shadow-[0_0_45px_18px_rgba(253,224,71,0.15)]'
                          }`} />

                        {/* Pulsing ring — chỉ hiện khi đang nghe */}
                        {callStatus === 'listening' && (
                          <div className={`absolute rounded-full animate-ping pointer-events-none ${isLight
                            ? 'inset-[-22%] border-2 border-emerald-400/50'
                            : 'inset-[-22%] border-2 border-emerald-500/40'
                            }`} style={{ animationDuration: '1.6s' }} />
                        )}

                        {/* Slow rotating ring — khi AI đang nói */}
                        {callStatus === 'speaking' && (
                          <div className={`absolute rounded-full animate-spin pointer-events-none ${isLight
                            ? 'inset-[-16%] border-t-2 border-r-2 border-violet-400/60 border-b-transparent border-l-transparent'
                            : 'inset-[-16%] border-t-2 border-r-2 border-violet-400/50 border-b-transparent border-l-transparent'
                            }`} style={{ animationDuration: '2.4s' }} />
                        )}

                        {/* Pulsing dot ring — khi đang xử lý */}
                        {callStatus === 'processing' && (
                          <div className={`absolute rounded-full animate-pulse pointer-events-none ${isLight
                            ? 'inset-[-20%] border-2 border-dashed border-amber-400/55'
                            : 'inset-[-20%] border-2 border-dashed border-amber-400/45'
                            }`} />
                        )}

                        <SunnyMascot outfitId={state.selectedOutfitId || 'normal'} state={callStatus === 'idle' ? 'idle' : callStatus} sizeClassName="w-[min(52vw,280px)] h-[min(52vw,280px)] md:w-[min(42vw,320px)] md:h-[min(42vw,320px)] lg:w-[min(26vw,260px)] lg:h-[min(26vw,260px)] xl:w-[min(24vw,300px)] xl:h-[min(24vw,300px)]" />
                      </div>

                      {/* Status Indicator Bar */}
                      <div className="hidden lg:flex text-center px-4 flex-col items-center gap-2">
                        {callStatus === 'listening' && (
                          <div className="flex flex-col items-center gap-2">
                            <div className={`w-full max-w-[13rem] h-7 lg:h-9 border rounded-lg overflow-hidden flex items-center justify-center p-0.5 shadow-[0_0_12px_rgba(88,204,2,0.15)] ${isLight ? 'bg-white border-gray-200' : 'bg-[#131f24]/60 border-[#37464f]'
                              }`}>
                              <AudioVisualizer isActive={true} decorative color="#58cc02" />
                            </div>
                            <div className="bg-green-950/80 border border-green-800 text-green-400 rounded-full py-1 px-4 text-xs font-bold uppercase tracking-wider animate-pulse flex items-center gap-1.5 justify-center">
                              <span className="w-2 h-2 bg-green-400 rounded-full animate-ping" />
                              {globalLang === 'en' ? '🎤 Go ahead, I am listening!' : '🎤 Bé hãy nói đi, tớ đang nghe nè!'}
                            </div>
                          </div>
                        )}
                        {callStatus === 'processing' && (
                          <div className="bg-amber-950/80 border border-amber-800 text-amber-400 rounded-full py-1 px-4 text-xs font-bold uppercase tracking-wider animate-pulse flex items-center gap-1.5 justify-center">
                            <span className="w-2 h-2 bg-amber-400 rounded-full animate-bounce" />
                            {globalLang === 'en' ? '☀️ Sunny is thinking...' : '☀️ Sunny đang nghĩ câu trả lời...'}
                          </div>
                        )}
                        {callStatus === 'speaking' && (
                          <div className="bg-purple-950/80 border border-purple-800 text-purple-400 rounded-full py-1 px-4 text-xs font-bold uppercase tracking-wider animate-bounce flex items-center gap-1.5 justify-center">
                            <Volume2 className="w-3.5 h-3.5 text-purple-400 animate-pulse" />
                            {globalLang === 'en' ? '🔊 Sunny is speaking back...' : '🔊 Sunny đang phát âm trả lời bé...'}
                          </div>
                        )}
                        {callStatus === 'calling' && (
                          <div className="bg-slate-800 text-gray-300 rounded-full py-1 px-4 text-xs font-bold uppercase animate-pulse">
                            {globalLang === 'en' ? '📞 Connecting to Sunny...' : '📞 Đang kết nối mạng với Mặt Trời...'}
                          </div>
                        )}
                      </div>
                    </div>


                  </div>

                  {/* Mobile connector tail: visually links the mascot to Sunny's speech */}
                  <div className="lg:hidden -my-2 flex justify-center" aria-hidden="true">
                    <div className={`h-3.5 w-3.5 rotate-45 border-b-2 border-r-2 ${isLight ? 'bg-gray-50 border-gray-200' : 'bg-[#1a2b32] border-[#37464f]'}`} />
                  </div>

                  {/* Right Column: Dynamic Transcript Speech display */}
                  <div className={`w-full min-h-0 flex-1 lg:w-[320px] xl:w-[360px] lg:h-full rounded-[24px] border-2 p-3 lg:p-4 flex flex-col justify-start space-y-2 lg:space-y-3 overflow-y-auto overflow-x-hidden scrollbar-none ${isLight ? 'bg-gray-50 border-gray-200 text-gray-800' : 'bg-[#1a2b32] border-[#37464f]'
                    }`}>

                    {/* Duo Speech Bubble Box */}
                    <div className={`flex-none min-h-[108px] md:min-h-[128px] lg:min-h-[112px] flex flex-col rounded-[16px] border overflow-hidden ${isLight ? 'bg-white border-gray-200' : 'bg-[#131f24] border-[#37464f]'
                      }`}>
                      <div className="flex-1 overflow-y-auto p-3 lg:p-4 scrollbar-none">
                        <span className="mb-1 block text-[10px] font-extrabold uppercase tracking-widest text-purple-500">{globalLang === 'en' ? 'SUNNY IS SPEAKING:' : 'MẶT TRỜI SUNNY ĐANG NÓI:'}</span>
                        <p className={`text-sm font-bold leading-relaxed whitespace-pre-line ${isLight ? 'text-gray-950' : 'text-white'}`}>
                          "{duoCallResponse}"
                        </p>
                      </div>

                      <div className={`p-3 lg:p-4 border-t shrink-0 ${isLight ? 'border-gray-200 bg-gray-50/50' : 'border-[#37464f] bg-[#1a2b32]/50'}`}>
                        <span className={`mb-1.5 block text-[9px] font-extrabold uppercase tracking-wider ${isLight ? 'text-gray-400' : 'text-[#52656d]'}`}>{globalLang === 'en' ? 'Parent translation:' : 'Dịch nghĩa phụ huynh:'}</span>
                        {isCallTranslationRevealed ? (
                          <div className="space-y-1">
                            <p className={`text-[11px] font-semibold italic leading-snug ${isLight ? 'text-gray-800' : 'text-gray-300'}`}>
                              "{duoCallTranslation}"
                            </p>
                            <button
                              onClick={() => {
                                playAppSound(200, 'sine', 0.1);
                                setIsCallTranslationRevealed(false);
                              }}
                              className="touch-target tap-feedback inline-flex items-center text-[9px] font-black text-[#58cc02] hover:underline cursor-pointer mt-1"
                            >
                              {globalLang === 'en' ? 'Hide translation ✕' : 'Ẩn dịch nghĩa ✕'}
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => {
                              playAppSound(350, 'sine', 0.08);
                              setIsCallTranslationRevealed(true);
                            }}
                            className={`touch-target tap-feedback flex items-center gap-1.5 px-2.5 py-1 rounded-[10px] text-[10px] font-extrabold uppercase tracking-wider transition-all duration-200 cursor-pointer shadow-sm w-full justify-center ${isLight
                              ? 'bg-purple-100 hover:bg-purple-200 text-purple-700 border border-purple-200'
                              : 'bg-purple-950 hover:bg-purple-900 border border-purple-800 text-purple-300'
                              }`}
                          >
                            <Languages className="w-3.5 h-3.5" />
                            <span>{globalLang === 'en' ? 'Show Vietnamese 🇻🇳' : 'Xem dịch tiếng Việt 🇻🇳'}</span>
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Transcript voice of the child */}
                    {!lastSpeechDetected && (
                    <div className={`p-3 rounded-[16px] border ${isLight ? 'bg-white border-gray-200' : 'bg-[#131f24] border-[#37464f]'
                      }`}>
                      <span className="mb-0.5 block text-[10px] font-extrabold uppercase tracking-widest text-green-500">{globalLang === 'en' ? 'CHILD JUST SAID:' : 'BÉ VỪA NÓI TIẾNG ANH:'}</span>
                      <div className={`text-xs font-bold ${isLight ? 'text-gray-800' : 'text-gray-200'}`}>
                        {lastSpeechDetected ? (
                          <span className="italic">"{lastSpeechDetected}"</span>
                        ) : (
                          <span className="font-normal text-gray-400">{globalLang === 'en' ? 'No voice captured yet. Try saying "Hello Sunny"!' : 'Chưa có giọng nói được thu âm. Hãy thử gọi "Hello Sunny"!'}</span>
                        )}
                      </div>
                      {recognitionError && (
                        <p className="mt-2 text-[11px] font-bold leading-snug text-red-500">{recognitionError}</p>
                      )}
                    </div>
                    )}

                    {lastSpeechDetected && (
                      <div className="space-y-2">
                        <SpeakingTranscriptPanel
                          text={lastSpeechDetected}
                          corrections={lastCorrections}
                          label={globalLang === 'en' ? 'You said' : 'Bé vừa nói'}
                          globalTheme={globalTheme}
                        />
                        {(lastCorrections.length > 0 || Boolean(lastAskRepeat) || Boolean(lastGrammarReview) || Boolean(lastGrammarScore)) && (
                          <SpeakingCorrectionPanel
                            corrections={lastCorrections}
                            grammarReview={lastGrammarReview}
                            grammarScore={lastGrammarScore}
                            askRepeat={lastAskRepeat}
                            pronunciationScore={lastPronunciationScore}
                            globalTheme={globalTheme}
                            globalLang={globalLang}
                            onHearWord={(word) => handleSpeakText(word, '__call_coach_word__')}
                            onHearRepeat={(text) => handleSpeakText(text, '__call_coach_repeat__')}
                          />
                        )}
                      </div>
                    )}

                    <AnimatePresence>
                      {silenceHintVisible && silenceHintReason === 'call' && activeSilencePrompt && (
                        <motion.div
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: 10 }}
                          className={`rounded-[16px] border p-3 ${isLight ? 'border-amber-200 bg-amber-50' : 'border-amber-700/40 bg-amber-950/20'}`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-amber-500">
                                {globalLang === 'en' ? 'Need a little help?' : 'Cần gợi ý cho bé?'}
                              </div>
                              <div className={`mt-1 text-sm font-black ${isLight ? 'text-slate-900' : 'text-amber-50'}`}>
                                {globalLang === 'en' ? 'Try saying this:' : 'Bé có thể nói câu này:'}
                              </div>
                            </div>
                            <HelpCircle className="h-4 w-4 flex-shrink-0 text-amber-500" />
                          </div>

                          <div className={`mt-3 rounded-[12px] border px-3 py-2.5 ${isLight ? 'border-white bg-white/80' : 'border-white/10 bg-black/20'}`}>
                            <div className="text-sm font-black text-[#1cb0f6]">"{activeSilencePrompt.text}"</div>
                            <div className={`mt-1 text-[11px] font-semibold ${isLight ? 'text-slate-500' : 'text-slate-300'}`}>{activeSilencePrompt.translate}</div>
                          </div>

                          <div className="mt-3 flex gap-2">
                            <button
                              onClick={() => {
                                hideSilenceHint();
                                speakDuoResponseInCall(activeSilencePrompt.text);
                              }}
                              className={`flex-1 rounded-[12px] border px-3 py-2 text-[11px] font-black uppercase ${isLight ? 'border-sky-200 bg-sky-50 text-sky-700' : 'border-sky-400/30 bg-sky-400/10 text-sky-300'}`}
                            >
                              {globalLang === 'en' ? 'Read sample aloud' : 'Đọc mẫu cho bé nghe'}
                            </button>
                            <button
                              onClick={() => {
                                advanceSilenceHint();
                                scheduleSilenceHint('call', 5000);
                              }}
                              className={`rounded-[12px] border px-3 py-2 text-[11px] font-black uppercase ${isLight ? 'border-[var(--app-border)] bg-white text-slate-700' : 'border-[var(--app-border)] bg-black/20 text-slate-200'}`}
                            >
                              {globalLang === 'en' ? 'Next hint' : 'Gợi ý khác'}
                            </button>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* Interactive Speech audio helper */}
                    <button
                      onClick={() => speakDuoResponseInCall(duoCallResponse)}
                      disabled={callStatus !== 'listening'}
                      className={`touch-target tap-feedback w-full py-2 border rounded-[12px] flex items-center justify-center gap-1.5 text-xs font-bold disabled:opacity-50 cursor-pointer transition ${isLight
                        ? 'bg-amber-50 hover:bg-amber-100 border-amber-200 text-amber-700'
                        : 'bg-[#202f36] hover:bg-[#2c3d46] border-[#37464f] text-[#ff9600]'
                        }`}
                    >
                      <Volume2 className="w-4 h-4" />
                      <span>{globalLang === 'en' ? 'Ask Sunny to repeat 🔊' : 'Yêu cầu Sunny đọc lại 🔊'}</span>
                    </button>

                  </div>

                </div>

                {/* Unified call control bar - always reachable without scrolling */}
                <div className="shrink-0 z-20 mt-auto flex items-center justify-center gap-4 pt-1.5 sm:pt-3 pb-0">
                  <motion.button
                    whileTap={{ scale: 0.9 }}
                    onClick={() => stopCallSession()}
                    className="touch-target tap-feedback px-4 py-2 sm:px-6 sm:py-3 bg-red-600 hover:bg-red-500 text-white rounded-full font-bold text-[10px] sm:text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 shadow-lg cursor-pointer border-b-2 sm:border-b-4 border-red-800"
                  >
                    <PhoneOff className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    <span>{globalLang === 'en' ? 'End call' : 'Gác máy (Tắt cuộc gọi)'}</span>
                  </motion.button>
                </div>
              </>
            )}

          </div>
        ) : (

          // ========================================================
          // TAB VIEW 2: TRADITIONAL TEXT CHAT INTERACTIVE PANEL
          // ========================================================
          <div className="flex-1 flex flex-col justify-between overflow-hidden min-w-0 min-h-0 h-full relative z-10">

            {/* MESSAGES FLOW CONTAINER */}
            <div ref={chatMessageListRef} className="flex-1 overflow-y-auto overflow-x-hidden min-w-0 space-y-4 px-1 py-1 custom-scrollbar scroll-smooth pr-1.5 mb-2 relative z-0">
              <AnimatePresence>
                {messages.map((msg) => (
                  <motion.div
                    key={msg.id}
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2 }}
                    className={`flex items-start gap-2.5 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
                  >
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs flex-shrink-0 ${msg.role === 'assistant' ? 'bg-[#ffc800] text-black' : 'bg-[#1cb0f6] text-white'
                      }`}>
                      {msg.role === 'assistant' ? '☀️' : '👶'}
                    </div>

                    <div className="max-w-[85%] min-w-0 flex flex-col space-y-1">
                      <div className={`p-3 rounded-[16px] text-xs font-semibold relative transition-colors duration-300 ${msg.role === 'assistant'
                        ? isLight
                          ? 'bg-white text-gray-900 rounded-tl-sm border-2 border-[#ffc800] shadow-sm'
                          : 'bg-[#1c2d35] text-slate-50 rounded-tl-sm border-2 border-[#ffc800] shadow-sm'
                        : 'bg-[#ffc800] text-black rounded-tr-sm font-bold shadow-sm'
                        }`}>
                        {msg.role === 'assistant' ? (
                          <div className={`w-2.5 h-2.5 absolute -left-1.5 top-2.5 transform -rotate-45 border-l-2 border-t-2 border-[#ffc800] ${isLight ? 'bg-white' : 'bg-[#1c2d35]'}`} />
                        ) : (
                          <div className="w-2.5 h-2.5 bg-[#ffc800] absolute -right-1.5 top-2.5 transform rotate-45" />
                        )}

                        <div className="fluid-body whitespace-pre-line wrap-anywhere">{msg.content}</div>

                        {msg.role === 'assistant' && msg.translation && (
                          <div className="mt-1">
                            {revealedTranslations[msg.id] ? (
                              <div className={`mt-2 pt-2 border-t border-dashed text-[11px] font-medium leading-relaxed italic ${isLight ? 'border-gray-300 text-gray-700' : 'border-slate-650 text-slate-350'}`}>
                                <div className="flex items-center gap-1 text-[9px] font-extrabold text-[#ff9600] uppercase tracking-wider mb-1">
                                  <Languages className="w-3 h-3" />
                                  <span>{globalLang === 'en' ? 'Vietnamese translation:' : 'Dịch sang Tiếng Việt:'}</span>
                                </div>
                                <div
                                  className={`normal-case not-italic font-bold wrap-anywhere ${isLight ? 'text-slate-800' : 'text-slate-100'}`}
                                  style={{ WebkitTextFillColor: 'unset' }}
                                >
                                  {msg.translation}
                                </div>
                                <button
                                  onClick={() => toggleTranslation(msg.id)}
                                  className="text-[9px] font-black uppercase text-purple-600 hover:underline mt-1.5 cursor-pointer block"
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
                                className={`mt-2.5 flex items-center gap-1 px-2.5 py-1 rounded-[10px] text-[10px] font-extrabold uppercase tracking-wider transition-all duration-200 cursor-pointer shadow-sm ${isLight
                                  ? 'bg-purple-100 hover:bg-purple-200 text-purple-700 border border-purple-200'
                                  : 'bg-purple-950 hover:bg-purple-900 border border-purple-800 text-purple-300'
                                  }`}
                              >
                                <Languages className="w-3 h-3" />
                                <span>{globalLang === 'en' ? 'Vietnamese 🇻🇳' : 'Dịch tiếng Việt 🇻🇳'}</span>
                              </button>
                            )}
                          </div>
                        )}
                      </div>

                      {msg.role === 'assistant' && (
                        <div className="flex items-center gap-1 pl-1">
                          <button
                            onClick={() => handleSpeakText(msg.content, msg.id)}
                            className={`text-[9px] font-bold uppercase tracking-wider rounded-md px-1.5 py-0.5 border flex items-center gap-0.5 transition cursor-pointer ${isSpeakingId === msg.id
                              ? 'bg-[#df52ff] border-[#df52ff] text-white animate-bounce'
                              : isLight
                                ? 'bg-transparent border-gray-300 text-purple-600 hover:bg-purple-100'
                                : 'bg-transparent border-[#37464f] text-[#ff9600] hover:bg-[#202f36]'
                              }`}
                          >
                            <Volume2 className="w-2.5 h-2.5 mr-0.5" />
                            <span>{isSpeakingId === msg.id ? (globalLang === 'en' ? 'Speaking...' : 'Đang đọc...') : (globalLang === 'en' ? 'Speak' : 'Phát âm')}</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>

              {(lastSpoken || interimTranscript) && (
                <div className="space-y-3 px-1">
                  <SpeakingTranscriptPanel
                    text={interimTranscript || lastSpoken}
                    corrections={lastCorrections}
                    label={interimTranscript ? (globalLang === 'en' ? 'Sunny is hearing' : 'Sunny đang nghe') : (globalLang === 'en' ? 'You said' : 'Bé vừa nói')}
                    globalTheme={globalTheme}
                  />
                  {lastSpoken && (lastCorrections.length > 0 || Boolean(lastAskRepeat) || Boolean(lastGrammarReview) || Boolean(lastGrammarScore)) && (
                    <SpeakingCorrectionPanel
                      corrections={lastCorrections}
                      grammarReview={lastGrammarReview}
                      grammarScore={lastGrammarScore}
                      askRepeat={lastAskRepeat}
                      pronunciationScore={lastPronunciationScore}
                      globalTheme={globalTheme}
                      globalLang={globalLang}
                      onHearWord={(word) => handleSpeakText(word, '__coach_word__')}
                      onHearRepeat={(text) => handleSpeakText(text, '__coach_repeat__')}
                    />
                  )}
                </div>
              )}

              {loading && (
                <div className="flex items-start gap-2.5">
                  <div className="w-8 h-8 rounded-full bg-[#ffc800] text-black flex items-center justify-center font-bold text-xs flex-shrink-0 animate-bounce">
                    ☀️
                  </div>
                  <div className={`p-3 rounded-[16px] rounded-tl-sm border-2 border-[#ffc800] text-xs font-semibold relative max-w-[50%] ${isLight ? 'bg-gray-50 text-gray-800 shadow-sm' : 'bg-white text-gray-900'}`}>
                    <div className={`w-2.5 h-2.5 border-l-2 border-t-2 border-[#ffc800] absolute -left-1.5 top-2.5 transform -rotate-45 ${isLight ? 'bg-gray-50' : 'bg-white'}`} />
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-medium text-gray-500">{globalLang === 'en' ? 'Sunny is writing a reply' : 'Sunny đang viết phản hồi'}</span>
                      <span className="flex gap-0.5">
                        <span className="w-1.5 h-1.5 bg-[#ffc800] rounded-full animate-bounce delay-75" />
                        <span className="w-1.5 h-1.5 bg-[#ffc800] rounded-full animate-bounce delay-150" />
                        <span className="w-1.5 h-1.5 bg-[#ffc800] rounded-full animate-bounce delay-300" />
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {errorMsg && (
                <div className="flex items-center gap-2 p-2.5 bg-red-950/40 text-red-400 border border-red-800 rounded-[12px] text-xs">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{globalLang === 'en' ? 'Error:' : 'Lỗi:'} {errorMsg}</span>
                </div>
              )}
            </div>

            {/* QUICK SUGGESTIONS DRAWER (Only shows after 5 seconds of silence/inactivity) */}
            {silenceHintVisible && silenceHintReason === 'chat' && (
              <div className="py-3 px-1 border-t border-dashed border-[#e3e3e3] dark:border-[#37464f] mt-1 relative">

                {/* Confetti Particle Burst overlay */}
                <div className="absolute inset-0 pointer-events-none z-50 flex items-center justify-center overflow-hidden">
                  {confettiBurst.map((p) => (
                    <motion.div
                      key={p.id}
                      initial={{ x: 0, y: 20, scale: 0, opacity: 1 }}
                      animate={{
                        x: p.x * 2.5,
                        y: p.y * 2.0,
                        scale: p.scale,
                        opacity: 0,
                        rotate: Math.random() * 360
                      }}
                      transition={{ duration: 1.2, ease: 'easeOut' }}
                      style={{
                        position: 'absolute',
                        width: '10px',
                        height: '10px',
                        borderRadius: Math.random() > 0.5 ? '50%' : '15%',
                        backgroundColor: p.color,
                      }}
                    />
                  ))}
                </div>

                {(() => {
                  const activePrompt = activeSilencePrompt;
                  if (!activePrompt) return null;

                  const assembledSentence = usedWordIndices.map(idx => scrambledWords[idx]).join(" ");

                  return (
                    <div className={`rounded-2xl border p-4 ${isLight ? 'border-sky-100 bg-sky-50/40 shadow-sm' : 'border-sky-950 bg-sky-950/20'}`}>
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[14px]">🧩</span>
                          <span className={`text-[11px] font-black uppercase tracking-wider ${isLight ? 'text-sky-700' : 'text-sky-400'}`}>
                            {globalLang === 'en' ? 'Translate to English:' : 'Dịch sang tiếng Anh:'}
                          </span>
                        </div>
                        <button
                          onClick={() => {
                            playAppSound(300, 'sine', 0.05);
                            setCurrentPromptIndex(prev => prev + 1);
                          }}
                          className={`text-[10px] font-extrabold uppercase tracking-wide px-2.5 py-1 rounded-full transition ${isLight ? 'bg-gray-100 hover:bg-gray-200 text-gray-600' : 'bg-[#202f36] hover:bg-[#2c3d46] text-[#ff9600]'
                            }`}
                        >
                          {globalLang === 'en' ? 'Skip ➔' : 'Đổi câu khác ➔'}
                        </button>
                      </div>

                      {/* Vietnamese Target sentence display */}
                      <div className={`mb-3 p-3 rounded-xl border font-bold text-sm ${isLight ? 'bg-white border-sky-100 text-slate-800' : 'bg-[#1a2429] border-sky-900 text-slate-100'}`}>
                        {activePrompt.translate || activePrompt.text}
                      </div>

                      {/* Sentence builder workspace */}
                      <div className={`min-h-[56px] p-3 rounded-xl border border-dashed flex flex-wrap gap-2 items-center mb-3 transition-colors ${isLight ? 'bg-white/70 border-sky-200 shadow-inner' : 'bg-black/20 border-sky-900 shadow-inner'
                        }`}>
                        {usedWordIndices.length === 0 ? (
                          <span className={`text-xs italic font-semibold mx-auto ${isLight ? 'text-gray-400' : 'text-gray-500'}`}>
                            {globalLang === 'en' ? 'Tap word cards below to build...' : 'Chạm các thẻ từ bên dưới để ghép...'}
                          </span>
                        ) : (
                          usedWordIndices.map((wordIdx, displayIdx) => (
                            <motion.button
                              layout
                              key={`workspace-${wordIdx}`}
                              whileHover={{ scale: 1.08 }}
                              whileTap={{ scale: 0.92 }}
                              onClick={() => {
                                playAppSound(400, 'sine', 0.05);
                                setUsedWordIndices(prev => prev.filter((_, i) => i !== displayIdx));
                              }}
                              className={`px-3 py-1.5 rounded-xl border-2 font-black text-xs shadow-md cursor-pointer transition-all ${isLight ? 'bg-sky-100 hover:bg-sky-200 border-sky-300 text-sky-900' : 'bg-[#1cb0f6] border-[#169ad9] text-white'
                                }`}
                            >
                              {scrambledWords[wordIdx]}
                            </motion.button>
                          ))
                        )}
                      </div>

                      {/* Pools of words */}
                      <div className="flex flex-wrap gap-2.5 mb-4 min-h-[44px] justify-center">
                        {scrambledWords.map((word, wordIdx) => {
                          const isUsed = usedWordIndices.includes(wordIdx);
                          return (
                            <motion.button
                              layout
                              key={`pool-${wordIdx}`}
                              disabled={isUsed}
                              whileHover={isUsed ? {} : { scale: 1.08, y: -2 }}
                              whileTap={isUsed ? {} : { scale: 0.92, y: 0 }}
                              onClick={() => {
                                playAppSound(450, 'sine', 0.05);
                                setUsedWordIndices(prev => [...prev, wordIdx]);
                              }}
                              className={`px-4 py-2 rounded-xl border-2 border-b-4 font-black text-xs cursor-pointer transition-all ${isUsed
                                ? isLight
                                  ? 'bg-gray-150 border-gray-200 text-gray-300 border-b-2 translate-y-[2px] opacity-40 pointer-events-none'
                                  : 'bg-gray-800 border-gray-900 text-gray-600 border-b-2 translate-y-[2px] opacity-40 pointer-events-none'
                                : isLight
                                  ? 'bg-white hover:bg-gray-50 border-gray-300 text-slate-800 shadow-md active:border-b-2 active:translate-y-[2px]'
                                  : 'bg-[#202f36] hover:bg-[#2c3d46] border-[#37464f] text-slate-200 shadow-md active:border-b-2 active:translate-y-[2px]'
                                }`}
                            >
                              {word}
                            </motion.button>
                          );
                        })}
                      </div>

                      {/* Feedback banner */}
                      {gameFeedback && gameFeedback.show && (
                        <motion.div
                          initial={{ scale: 0.8, y: 10, opacity: 0 }}
                          animate={{ scale: 1, y: 0, opacity: 1 }}
                          transition={{ type: 'spring', stiffness: 350, damping: 20 }}
                          className={`mb-3 p-3 rounded-xl border text-xs font-bold transition-all ${gameFeedback.isCorrect
                            ? isLight
                              ? 'bg-[#e2f0d9] border-[#b8e59c] text-[#257d07]'
                              : 'bg-[#183424] border-[#265337] text-[#8ff695]'
                            : isLight
                              ? 'bg-[#ffdfe0] border-[#ffb3b5] text-[#c01818]'
                              : 'bg-[#3c1e21] border-[#5e2b2f] text-[#ff8f91]'
                            }`}
                        >
                          <div className="flex items-center gap-1.5 mb-1.5">
                            <span>{gameFeedback.isCorrect ? '🎉' : '❌'}</span>
                            <span className="font-extrabold">
                              {gameFeedback.isCorrect
                                ? (globalLang === 'en' ? 'Excellent! Correct translation!' : 'Chính xác! Bé ghép giỏi quá!')
                                : (globalLang === 'en' ? 'Not quite right yet.' : 'Chưa chính xác rồi.')}
                            </span>
                          </div>
                          {!gameFeedback.isCorrect && (
                            <div className="mb-2.5">
                              <span className="font-medium opacity-90">{globalLang === 'en' ? 'Correct phrase: ' : 'Câu đúng là: '}</span>
                              <span className="font-black text-sm underline select-all">"{gameFeedback.correctText}"</span>
                            </div>
                          )}
                          {!gameFeedback.isCorrect && (
                            <div className="flex gap-2 mt-1.5">
                              <button
                                onClick={() => {
                                  playAppSound(300, 'sine', 0.05);
                                  setGameFeedback(null);
                                }}
                                className={`px-3 py-1 rounded-lg border text-[10px] font-black uppercase transition-colors ${isLight
                                  ? 'bg-white hover:bg-gray-100 text-[#c01818] border-[#ffb3b5]'
                                  : 'bg-[#2a1315] hover:bg-[#3d1a1c] text-[#ff8f91] border-[#5e2b2f]'
                                  }`}
                              >
                                {globalLang === 'en' ? 'Try Again' : 'Thử lại'}
                              </button>
                              <button
                                onClick={() => {
                                  playAppSound(400, 'sine', 0.05);
                                  setLastTargetPhrase(gameFeedback.correctText);
                                  handleSendMessage(gameFeedback.correctText, { targetPhraseOverride: gameFeedback.correctText });
                                  setUsedWordIndices([]);
                                  setGameFeedback(null);
                                  setCurrentPromptIndex(prev => prev + 1);
                                }}
                                className={`flex-1 py-1 rounded-lg text-white text-[10px] font-black uppercase text-center border-b-2 transition-all cursor-pointer ${isLight
                                  ? 'bg-[#ea2b2b] hover:bg-[#d01c1c] border-[#c01818]'
                                  : 'bg-[#ff4b4b] hover:bg-[#e03a3a] border-[#b82525]'
                                  }`}
                              >
                                {globalLang === 'en' ? 'Use Correct Sentence' : 'Dùng câu đúng'}
                              </button>
                            </div>
                          )}
                        </motion.div>
                      )}

                      {/* Actions bar */}
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            playAppSound(200, 'sine', 0.05);
                            setUsedWordIndices([]);
                            setGameFeedback(null);
                          }}
                          disabled={usedWordIndices.length === 0}
                          className={`px-4 py-2 rounded-xl border text-[11px] font-black uppercase tracking-wider disabled:opacity-40 transition cursor-pointer ${isLight ? 'bg-white hover:bg-gray-50 border-gray-200 text-slate-600' : 'bg-[#202f36] hover:bg-[#2c3d46] border-[#37464f] text-slate-300'
                            }`}
                        >
                          {globalLang === 'en' ? 'Clear' : 'Xóa câu'}
                        </button>

                        <button
                          onClick={() => {
                            if (assembledSentence.trim()) {
                              const cleanAssembled = assembledSentence.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?]/g, "").toLowerCase().trim();
                              const cleanTarget = activePrompt.text.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?]/g, "").toLowerCase().trim();
                              const isCorrect = cleanAssembled === cleanTarget;

                              if (isCorrect) {
                                playAppSound(580, 'sine', 0.1);
                                setGameFeedback({ isCorrect: true, show: true, correctText: activePrompt.text });

                                // Celebrate with sweet confetti circles floating upwards
                                const colors = ['#ffc800', '#ff9600', '#1cb0f6', '#58cc02', '#a855f7', '#ff4b4b'];
                                const burst = Array.from({ length: 30 }).map((_, i) => ({
                                  id: Math.random() + i,
                                  x: Math.random() * 100 - 50,
                                  y: Math.random() * -120 - 40,
                                  color: colors[Math.floor(Math.random() * colors.length)],
                                  scale: Math.random() * 0.8 + 0.6
                                }));
                                setConfettiBurst(burst);
                                setTimeout(() => setConfettiBurst([]), 1500);

                                // Auto send after feedback duration
                                setTimeout(() => {
                                  setLastTargetPhrase(activePrompt.text);
                                  handleSendMessage(assembledSentence, { targetPhraseOverride: activePrompt.text });
                                  setUsedWordIndices([]);
                                  setGameFeedback(null);
                                }, 1400);
                              } else {
                                playAppSound(180, 'sawtooth', 0.1);
                                setGameFeedback({ isCorrect: false, show: true, correctText: activePrompt.text });
                              }
                            }
                          }}
                          disabled={usedWordIndices.length === 0 || loading || (gameFeedback?.show && gameFeedback.isCorrect)}
                          className={`flex-1 py-2 rounded-xl text-[11px] font-black uppercase tracking-wider text-center text-white shadow-md disabled:opacity-50 transition border-b-4 cursor-pointer active:border-b-2 active:translate-y-[2px] ${isLight
                            ? 'bg-[#1cb0f6] border-[#169ad9] hover:bg-[#159de0]'
                            : 'bg-[#1cb0f6] border-[#169ad9] hover:bg-[#159de0]'
                            }`}
                        >
                          {globalLang === 'en' ? 'Send 🚀' : 'Gửi câu 🚀'}
                        </button>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}

            {/* CHAT CHANNELS PANEL */}
            <div className={`flex-shrink-0 p-2 rounded-[16px] border space-y-2 ${isLight ? 'bg-gray-50 border-gray-200' : 'bg-[#202f36]/40 border-[#37464f]'
              }`}>
              {recognitionError && (
                <p className="text-[10px] text-red-500 font-bold px-1">{recognitionError}</p>
              )}

              <div className="flex items-center gap-2">
                <button
                  onClick={handleToggleRecord}
                  className={`w-10 h-10 rounded-[12px] flex items-center justify-center transition-all flex-shrink-0 cursor-pointer ${isRecording
                    ? 'bg-red-500 text-white animate-pulse shadow-[0_0_12px_rgba(239,68,68,0.4)]'
                    : isLight
                      ? 'bg-white border border-gray-200 text-[#58cc02] hover:bg-gray-100'
                      : 'bg-[#202f36] border border-[#37464f] text-[#58cc02] hover:bg-[#2c3d46]'
                    }`}
                  title={isRecording ? (globalLang === 'en' ? 'Listening... tap to stop' : 'Đang lắng nghe... Ấn để dừng') : (globalLang === 'en' ? 'Speak in English! (Activate microphone)' : 'Nói tiếng Anh! (Kích hoạt micro)')}
                >
                  {isRecording ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                </button>

                <input
                  type="text"
                  value={inputValue}
                  onChange={(e) => {
                    setInputValue(e.target.value);
                    setInputFromSpeech(false);
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && !loading && handleSendMessage()}
                  placeholder={isRecording ? (globalLang === 'en' ? 'Sunny is listening...' : 'Duo đang nghe bé nói tiếng Anh...') : (globalLang === 'en' ? "Type the child's English sentence..." : 'Nhập câu nói tiếng Anh của bé...')}
                  disabled={loading}
                  className={`flex-1 min-w-0 border rounded-[12px] px-3.5 py-2.5 text-xs focus:outline-none focus:border-purple-500 font-medium transition duration-200 ${isLight
                    ? 'bg-white border-gray-300 text-gray-800 placeholder-gray-400'
                    : 'bg-[#131f24] border-[#37464f] text-white placeholder-gray-500'
                    }`}
                />

                <button
                  onClick={() => handleSendMessage()}
                  disabled={loading || !inputValue.trim()}
                  className="w-10 h-10 bg-purple-600 hover:bg-purple-500 text-white rounded-[12px] flex items-center justify-center transition disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shadow-md"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>

              {isRecording && (
                <div className="flex flex-col items-center justify-center gap-1.5 py-1">
                  <div className={`w-full max-w-[14rem] h-10 border rounded-lg overflow-hidden flex items-center justify-center p-0.5 ${isLight ? 'bg-white border-gray-200 shadow-[0_0_12px_rgba(239,68,68,0.08)]' : 'bg-[#131f24]/60 border-[#37464f] shadow-[0_0_12px_rgba(239,68,68,0.15)]'
                    }`}>
                    <AudioVisualizer isActive={true} decorative color="#ef4444" />
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-[9px] font-bold uppercase text-red-500 animate-pulse">{globalLang === 'en' ? 'Sunny is listening...' : 'Duo đang lắng nghe bé phát âm...'}</span>
                  </div>
                </div>
              )}
            </div>

          </div>
        )}

        <SessionRewardMascot
          isOpen={Boolean(rewardSummary)}
          mouthCount={rewardSummary?.mouthCount || 0}
          earnedXp={rewardSummary?.earnedXp || 0}
          childName={currentChild?.name || null}
          globalLang={globalLang}
          globalTheme={globalTheme}
          onClose={() => setRewardSummary(null)}
        />

        {/* ══════════════════════════════════════════════════════════════════════
            END-SESSION CONFIRMATION MODAL
            Shown when the child finishes a call/chat and we want to ask
            whether they want to continue or save & exit the session.
        ══════════════════════════════════════════════════════════════════════ */}
        <AnimatePresence>
          {showEndSessionModal && (
            <motion.div
              className="absolute inset-0 z-[80] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-md"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <motion.div
                className="w-full max-w-sm overflow-hidden rounded-[26px] border-2 border-amber-200 bg-[#fff8e8] text-[#4a1424] shadow-[0_24px_70px_rgba(74,20,36,0.32)]"
                initial={{ scale: 0.88, y: 24, opacity: 0 }}
                animate={{ scale: 1, y: 0, opacity: 1 }}
                exit={{ scale: 0.88, y: 24, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 340, damping: 28 }}
              >
                {/* Decorative top gradient strip */}
                <div className="h-1.5 w-full bg-gradient-to-r from-[#ff9600] via-[#ffc800] to-[#58cc02]" />

                <div className="p-6 flex flex-col items-center text-center gap-4">
                  {/* Sunny mascot emoji */}
                  <div className="text-5xl select-none">☀️</div>

                  <div>
                    <h3 className="mb-1 text-lg font-black text-[#4a1424]">
                      {globalLang === 'en' ? 'Continue learning?' : 'Bạn có muốn học tiếp không?'}
                    </h3>
                    <p className="text-xs font-semibold leading-relaxed text-[#8a3a45]">
                      {globalLang === 'en'
                        ? 'Your session will be saved to history if you end now.'
                        : 'Phiên học sẽ được lưu vào lịch sử nếu bạn kết thúc bây giờ.'}
                    </p>
                  </div>

                  {/* Session stats mini-summary */}
                  {(sessionMouthCount > 0 || sessionEarnedXp > 0) && (
                    <div className="flex items-center gap-3 rounded-[14px] border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs font-bold text-emerald-800 shadow-sm">
                      <span>🗣️ {sessionMouthCount} {globalLang === 'en' ? 'times spoken' : 'lần nói'}</span>
                      <span className="text-emerald-300">·</span>
                      <span>⭐ +{sessionEarnedXp} XP</span>
                    </div>
                  )}

                  {/* Action buttons */}
                  <div className="flex flex-col gap-2.5 w-full mt-1">
                    {/* Continue → dismiss modal, resume */}
                    <button
                      onClick={() => {
                        playAppSound(440, 'sine', 0.08);
                        setShowEndSessionModal(false);
                        pendingEndActionRef.current = null;
                      }}
                      className="w-full py-3 px-4 rounded-[14px] bg-[#58cc02] hover:bg-[#4eb302] active:scale-95 text-white font-black text-sm uppercase tracking-wide transition-all shadow-[0_4px_0_#3a9700] active:shadow-none active:translate-y-1 cursor-pointer"
                    >
                      {globalLang === 'en' ? '▶ Continue learning' : '▶ Tiếp tục học'}
                    </button>

                    {/* End session → save & close */}
                    <button
                      onClick={() => {
                        playAppSound(300, 'sine', 0.1);
                        setShowEndSessionModal(false);
                        if (pendingEndActionRef.current) {
                          pendingEndActionRef.current();
                          pendingEndActionRef.current = null;
                        }
                      }}
                      className="w-full cursor-pointer rounded-[14px] border-2 border-red-200 bg-white px-4 py-3 text-sm font-black uppercase tracking-wide text-red-600 shadow-[0_3px_0_#fecaca] transition-all hover:bg-red-50 active:scale-95 active:shadow-none"
                    >
                      {globalLang === 'en' ? '✕ End session & save' : '✕ Kết thúc học & lưu lại'}
                    </button>
                  </div>

                  <p className="text-[10px] font-semibold text-[#a66b72]">
                    {globalLang === 'en'
                      ? 'Sessions are kept for 7 days in history.'
                      : 'Lịch sử phiên học được lưu trong 7 ngày.'}
                  </p>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

      </div>
    </div>
  );
}
