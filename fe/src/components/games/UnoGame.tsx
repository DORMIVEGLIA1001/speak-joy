import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ArrowLeft, Ban, Hand, Mic, RotateCcw, Sparkles, Trophy, Volume2, X } from 'lucide-react';
import { playAppSound, playCorrectSound, playIncorrectSound } from '../../data';
import { extractTranscriptWords, normalizeWord } from '../../lib/wordChain';
import FallbackChallenge from './FallbackChallenge';
import { loadSrsStore, getSrsWordPriority, recordWordAnswer } from '../../lib/spaceRepetition';

export interface GameChildProfile {
  id: string;
  name: string;
  age?: number;
  avatarUrl?: string | null;
}


import {
  UNO_COLORS,
  UnoCard,
  UnoColor,
  UnoPlayer,
  UnoState,
  canPlay,
  chooseAiMove,
  dealGame,
  drawCards,
  isSpecial,
  isWild,
  nextPlayerIndex,
  passTurn,
  playCard,
  playableCards,
  topCard,
} from '../../lib/uno';

interface VocabWord {
  emoji: string;
  word: string;
  ipa?: string;
  vietnamese: string;
  level?: string;
  category?: string;
}

interface UnoGameProps {
  globalLang: 'en' | 'vi';
  isLight: boolean;
  wordPool: VocabWord[];
  playerName: string;
  aiCount: number;
  onExit: () => void;
  onWin?: () => void;
  speak: (text: string) => void;
  currentChild?: GameChildProfile | null;
}

const COLOR_HEX: Record<UnoColor, string> = {
  red: '#ef4444',
  yellow: '#f59e0b',
  green: '#22c55e',
  blue: '#3b82f6',
};

const VALUE_GLYPH: Record<string, string> = {
  skip: '⊘',
  reverse: '↺',
  draw2: '+2',
  wild: '★',
  wild4: '+4',
};

const AI_NAMES = ['Sunny', 'Leo', 'Mia'];
const TURN_SECONDS = 10;
const UNO_GRACE_SECONDS = 3;

type UnoSeat = 'human' | 'top' | 'left' | 'right' | 'center';
type UnoActionEffectType = 'skip' | 'draw2' | 'wild4' | 'reverse' | 'wild';

interface UnoActionEffect {
  id: number;
  type: UnoActionEffectType;
  targetSeat: UnoSeat;
  targetIdx: number | null;
  actorIdx: number;
  cards?: number;
  color?: UnoColor;
}

const SEAT_EFFECT_CLASS: Record<UnoSeat, string> = {
  top: 'left-1/2 top-24 -translate-x-1/2',
  left: 'left-28 top-1/2 -translate-y-1/2',
  right: 'right-28 top-1/2 -translate-y-1/2',
  human: 'left-1/2 bottom-8 -translate-x-1/2',
  center: 'left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2',
};

const CARD_FLY_TARGET: Record<UnoSeat, { x: number; y: number; rotate: number }> = {
  top: { x: 0, y: -190, rotate: -6 },
  left: { x: -280, y: -8, rotate: -14 },
  right: { x: 280, y: -8, rotate: 14 },
  human: { x: 0, y: 230, rotate: 6 },
  center: { x: 0, y: 0, rotate: 0 },
};

export default function UnoGame({
  globalLang,
  isLight,
  wordPool,
  playerName,
  aiCount,
  onExit,
  onWin,
  speak,
  currentChild,
}: UnoGameProps) {
  const isEnglish = globalLang === 'en';
  const reduceMotion = useReducedMotion();

  const [state, setState] = useState<UnoState | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ en: string; vi: string } | null>(null);
  const [wildPickerCard, setWildPickerCard] = useState<UnoCard | null>(null);
  const [lastPlayedId, setLastPlayedId] = useState<string | null>(null);
  const [turnTimeLeft, setTurnTimeLeft] = useState(TURN_SECONDS);
  const [drawnThisTurn, setDrawnThisTurn] = useState(false);
  const [drawPulse, setDrawPulse] = useState(false);
  const [drawFly, setDrawFly] = useState<{ id: number; seat: UnoSeat } | null>(null);
  const drawFlySeq = useRef(0);
  const [actionEffect, setActionEffect] = useState<UnoActionEffect | null>(null);
  const [pendingUno, setPendingUno] = useState<{ playerIdx: number; secondsLeft: number } | null>(null);
  const timersRef = useRef<number[]>([]);
  const actionEffectSeq = useRef(0);

  const [challengeCard, setChallengeCard] = useState<UnoCard | null>(null);
  const [challengeWord, setChallengeWord] = useState<VocabWord | null>(null);
  const [challengeAttempts, setChallengeAttempts] = useState(0);
  const [challengeStatus, setChallengeStatus] = useState<'idle' | 'listening' | 'correct' | 'retry'>('idle');
  const [heardText, setHeardText] = useState('');
  const recognitionRef = useRef<any>(null);
  const pendingWildColorRef = useRef<UnoColor | undefined>(undefined);

  const t = (en: string, vi: string) => (isEnglish ? en : vi);

  const clearTimers = useCallback(() => {
    timersRef.current.forEach((id) => window.clearTimeout(id));
    timersRef.current = [];
  }, []);

  const later = useCallback((fn: () => void, ms: number) => {
    const id = window.setTimeout(fn, ms);
    timersRef.current.push(id);
    return id;
  }, []);

  const buildPlayers = useCallback((): Omit<UnoPlayer, 'hand'>[] => {
    const players: Omit<UnoPlayer, 'hand'>[] = [
      { id: 'human', name: playerName || t('You', 'Bé'), isHuman: true },
    ];
    for (let i = 0; i < aiCount; i += 1) {
      players.push({ id: `ai${i}`, name: AI_NAMES[i] || `AI ${i + 1}`, isHuman: false });
    }
    return players;
  }, [aiCount, isEnglish, playerName]);

  const startGame = useCallback(() => {
    clearTimers();
    playAppSound(500, 'sine', 0.1);
    setState(dealGame(buildPlayers()));
    setBusy(false);
    setMessage(null);
    setWildPickerCard(null);
    setChallengeCard(null);
    setChallengeWord(null);
    setLastPlayedId(null);
    setTurnTimeLeft(TURN_SECONDS);
    setDrawnThisTurn(false);
    setDrawPulse(false);
    setActionEffect(null);
    setPendingUno(null);
  }, [buildPlayers, clearTimers]);

  useEffect(() => {
    startGame();
  }, [startGame]);

  useEffect(() => () => clearTimers(), [clearTimers]);

  const pickChallengeWord = useCallback((exclude?: string): VocabWord | null => {
    let pool = wordPool.filter((word) => word.emoji && word.word && word.word !== exclude);
    if (pool.length === 0) return null;
    if (currentChild?.id) {
      const store = loadSrsStore(currentChild.id);
      pool = [...pool].sort((a, b) => {
        const prioA = getSrsWordPriority(store, a.word.toLowerCase());
        const prioB = getSrsWordPriority(store, b.word.toLowerCase());
        return prioA - prioB;
      });
      const storeForRef = store;
      const withPriority = pool.map(w => ({ word: w, prio: getSrsWordPriority(storeForRef, w.word.toLowerCase()) }));
      const minPrio = Math.min(...withPriority.map(x => x.prio));
      const bestPool = withPriority.filter(x => x.prio === minPrio).map(x => x.word);
      return bestPool[Math.floor(Math.random() * bestPool.length)];
    }
    return pool[Math.floor(Math.random() * pool.length)];
  }, [wordPool, currentChild]);

  const seatForPlayer = useCallback((playerIdx: number): UnoSeat => {
    if (playerIdx === 0) return 'human';
    if (playerIdx === 1) return 'top';
    if (playerIdx === 2) return 'left';
    if (playerIdx === 3) return 'right';
    return 'center';
  }, []);

  const flyDrawnCard = useCallback((playerIdx: number) => {
    drawFlySeq.current += 1;
    setDrawFly({ id: drawFlySeq.current, seat: seatForPlayer(playerIdx) });
    later(() => setDrawFly((current) => (current && current.id === drawFlySeq.current ? null : current)), reduceMotion ? 350 : 750);
  }, [later, reduceMotion, seatForPlayer]);

  const showActionEffect = useCallback((
    source: UnoState,
    card: UnoCard,
    targetIdx: number | null,
    color?: UnoColor,
  ) => {
    if (!isSpecial(card)) return;
    const cards = card.value === 'draw2' ? 2 : card.value === 'wild4' ? 4 : undefined;
    actionEffectSeq.current += 1;
    setActionEffect({
      id: actionEffectSeq.current,
      type: card.value as UnoActionEffectType,
      targetSeat: targetIdx === null ? 'center' : seatForPlayer(targetIdx),
      targetIdx,
      actorIdx: source.currentPlayer,
      cards,
      color,
    });
  }, [seatForPlayer]);

  const announceCardEffect = useCallback((source: UnoState, card: UnoCard, color?: UnoColor) => {
    const actor = source.players[source.currentPlayer];
    const nextIdx = nextPlayerIndex(source.currentPlayer, source.players.length, source.direction, 1);
    const victim = source.players[nextIdx];

    if (card.value === 'skip') {
      showActionEffect(source, card, nextIdx, color);
      setMessage({
        en: `${actor.name} skipped ${victim.name}.`,
        vi: `${actor.name} chặn lượt của ${victim.name}.`,
      });
    } else if (card.value === 'draw2') {
      showActionEffect(source, card, nextIdx, color);
      setMessage({
        en: `${actor.name} made ${victim.name} draw 2 and lose a turn.`,
        vi: `${actor.name} bắt ${victim.name} rút 2 lá và mất lượt.`,
      });
    } else if (card.value === 'wild4') {
      showActionEffect(source, card, nextIdx, color);
      setMessage({
        en: `${actor.name} made ${victim.name} draw 4 and lose a turn.`,
        vi: `${actor.name} bắt ${victim.name} rút 4 lá và mất lượt.`,
      });
    } else if (card.value === 'reverse') {
      showActionEffect(source, card, null, color);
      setMessage({
        en: `${actor.name} reversed the play direction.`,
        vi: `${actor.name} đảo chiều vòng chơi.`,
      });
    } else if (card.value === 'wild') {
      showActionEffect(source, card, null, color);
      setMessage({
        en: `${actor.name} changed the active color.`,
        vi: `${actor.name} đổi màu đang chơi.`,
      });
    }
  }, [showActionEffect]);

  const commitPlay = useCallback((card: UnoCard, color?: UnoColor) => {
    setLastPlayedId(card.id);
    setState((prev) => {
      if (!prev) return prev;
      const playerIdx = prev.currentPlayer;
      announceCardEffect(prev, card, color);
      const next = playCard(prev, card.id, color);
      const handLeft = next.players[playerIdx]?.hand.length ?? 0;

      if (next.winner === null && handLeft === 1) {
        setPendingUno({ playerIdx, secondsLeft: UNO_GRACE_SECONDS });
      } else if (pendingUno?.playerIdx === playerIdx) {
        setPendingUno(null);
      }

      setDrawnThisTurn(false);
      setTurnTimeLeft(TURN_SECONDS);
      return next;
    });
    playAppSound(320, 'sine', 0.12);
    if (isSpecial(card)) playAppSound(180, 'triangle', 0.18);
  }, [announceCardEffect, pendingUno?.playerIdx]);

  const onPlayCard = useCallback((card: UnoCard) => {
    if (!state || busy || state.currentPlayer !== 0 || state.winner !== null) return;
    if (!canPlay(card, topCard(state), state.activeColor)) {
      setMessage({ en: "That card can't be played now.", vi: 'Lá này chưa đánh được lúc này.' });
      playIncorrectSound();
      return;
    }

    if (isSpecial(card)) {
      const word = pickChallengeWord();
      if (!word) {
        if (isWild(card)) {
          setWildPickerCard(card);
        } else {
          commitPlay(card);
        }
        return;
      }
      pendingWildColorRef.current = undefined;
      setChallengeCard(card);
      setChallengeWord(word);
      setChallengeAttempts(0);
      setChallengeStatus('idle');
      setHeardText('');
      later(() => { if (word) speak(word.word); }, 350);
      return;
    }

    commitPlay(card);
  }, [busy, commitPlay, later, pickChallengeWord, speak, state]);

  const onDraw = useCallback(() => {
    if (!state || busy || state.currentPlayer !== 0 || state.winner !== null) return;
    if (drawnThisTurn) {
      setMessage({ en: 'Only one draw per turn.', vi: 'Mỗi lượt chỉ được rút một lá.' });
      playIncorrectSound();
      return;
    }
    setState((prev) => (prev ? drawCards(prev, 0, 1) : prev));
    setDrawnThisTurn(true);
    setDrawPulse(true);
    flyDrawnCard(0);
    later(() => setDrawPulse(false), 450);
    playAppSound(420, 'sine', 0.08);
    setMessage({ en: 'You drew a card.', vi: 'Bé đã rút một lá.' });
  }, [busy, drawnThisTurn, flyDrawnCard, later, state]);

  const onPassTurn = useCallback(() => {
    if (!state || busy || state.currentPlayer !== 0 || state.winner !== null) return;
    setState((prev) => (prev ? passTurn(prev) : prev));
    setDrawnThisTurn(false);
    setTurnTimeLeft(TURN_SECONDS);
    setMessage(null);
  }, [busy, state]);

  const timeoutTurn = useCallback(() => {
    setState((prev) => {
      if (!prev || prev.winner !== null) return prev;
      const player = prev.players[prev.currentPlayer];
      setMessage({
        en: `${player.name} ran out of time and passed.`,
        vi: `${player.name} hết giờ và bị bỏ lượt.`,
      });
      return passTurn(prev);
    });
    setDrawnThisTurn(false);
    setTurnTimeLeft(TURN_SECONDS);
  }, []);

  useEffect(() => {
    setTurnTimeLeft(TURN_SECONDS);
    setDrawnThisTurn(false);
  }, [state?.currentPlayer]);

  useEffect(() => {
    if (!state || state.winner !== null || challengeCard || wildPickerCard) return undefined;
    if (turnTimeLeft <= 0) {
      timeoutTurn();
      return undefined;
    }
    const id = window.setTimeout(() => setTurnTimeLeft((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearTimeout(id);
  }, [challengeCard, state, timeoutTurn, turnTimeLeft, wildPickerCard]);

  const callUno = useCallback((playerIdx: number) => {
    const playerNameForMessage = state?.players[playerIdx]?.name || 'Player';
    setPendingUno((pending) => (pending?.playerIdx === playerIdx ? null : pending));
    setMessage({
      en: `${playerNameForMessage} called UNO!`,
      vi: `${playerNameForMessage} đã hô UNO!`,
    });
    playAppSound(760, 'triangle', 0.12);
  }, [state?.players]);

  useEffect(() => {
    if (!pendingUno || !state || state.winner !== null) return undefined;
    if (pendingUno.secondsLeft <= 0) {
      const player = state.players[pendingUno.playerIdx];
      setState((prev) => (prev ? drawCards(prev, pendingUno.playerIdx, 2) : prev));
      setMessage({
        en: `${player?.name || 'Player'} missed UNO and drew 2 cards.`,
        vi: `${player?.name || 'Người chơi'} quên hô UNO và bị phạt rút 2 lá.`,
      });
      setPendingUno(null);
      playIncorrectSound();
      return undefined;
    }

    const id = window.setTimeout(() => {
      setPendingUno((pending) => (
        pending ? { ...pending, secondsLeft: Math.max(0, pending.secondsLeft - 1) } : pending
      ));
    }, 1000);
    return () => window.clearTimeout(id);
  }, [pendingUno, state]);

  useEffect(() => {
    if (!pendingUno || !state || state.players[pendingUno.playerIdx]?.isHuman) return undefined;
    const id = window.setTimeout(() => callUno(pendingUno.playerIdx), reduceMotion ? 250 : 900);
    return () => window.clearTimeout(id);
  }, [callUno, pendingUno, reduceMotion, state]);

  const closeChallenge = useCallback(() => {
    if (recognitionRef.current) {
      try { recognitionRef.current.abort(); } catch { /* noop */ }
    }
    setChallengeCard(null);
    setChallengeWord(null);
    setChallengeStatus('idle');
    setHeardText('');
    setChallengeAttempts(0);
  }, []);

  const rotateChallengeWord = useCallback(() => {
    const next = pickChallengeWord(challengeWord?.word);
    setChallengeWord(next);
    setChallengeAttempts(0);
    setChallengeStatus('idle');
    setHeardText('');
    later(() => { if (next) speak(next.word); }, 300);
  }, [challengeWord, later, pickChallengeWord, speak]);

  const judgeSpeech = useCallback((transcript: string) => {
    if (!challengeWord || !challengeCard) return;
    const heard = extractTranscriptWords(transcript);
    const target = normalizeWord(challengeWord.word);
    const matched = heard.some((word) => word === target || (word.length > 3 && (word.includes(target) || target.includes(word))));
    setHeardText(heard.join(' '));

    if (matched) {
      if (currentChild?.id) {
        recordWordAnswer(currentChild.id, challengeWord.word.toLowerCase(), 5);
      }
      playCorrectSound();
      setChallengeStatus('correct');
      const card = challengeCard;
      const color = pendingWildColorRef.current;
      later(() => {
        closeChallenge();
        if (isWild(card) && !color) {
          setWildPickerCard(card);
        } else {
          commitPlay(card, color);
        }
      }, 850);
      return;
    }

    playIncorrectSound();
    const attempts = challengeAttempts + 1;
    setChallengeAttempts(attempts);
    setChallengeStatus('retry');
    if (attempts >= 3) {
      if (currentChild?.id) {
        recordWordAnswer(currentChild.id, challengeWord.word.toLowerCase(), 1);
      }
      setChallengeStatus('fallback');
    }
  }, [challengeAttempts, challengeCard, challengeWord, closeChallenge, commitPlay, later, rotateChallengeWord, currentChild]);

  const startListening = useCallback(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      setMessage({ en: 'Speech recognition is not available.', vi: 'Trình nhận diện giọng nói không khả dụng.' });
      return;
    }
    if (recognitionRef.current) {
      try { recognitionRef.current.abort(); } catch { /* noop */ }
    }
    const rec = new SR();
    rec.continuous = false;
    rec.lang = 'en-US';
    rec.interimResults = true;
    rec.onstart = () => { setChallengeStatus('listening'); setHeardText(''); };
    rec.onresult = (event: any) => {
      const firstResult = event.results[0];
      const alts = Array.from(firstResult || [])
        .map((entry: any) => String(entry?.transcript || '').toLowerCase().trim())
        .filter(Boolean);
      setHeardText(alts[0] || '');
      if (firstResult?.isFinal) judgeSpeech(alts.join(' '));
    };
    rec.onerror = () => setChallengeStatus('retry');
    rec.onend = () => setChallengeStatus((status) => (status === 'listening' ? 'retry' : status));
    recognitionRef.current = rec;
    rec.start();
  }, [judgeSpeech]);

  useEffect(() => {
    if (!state || state.winner !== null) return undefined;
    if (challengeCard || wildPickerCard) return undefined;

    const player = state.players[state.currentPlayer];
    if (player.isHuman) {
      setBusy(false);
      return undefined;
    }

    setBusy(true);
    const thinkId = later(() => {
      setState((prev) => {
        if (!prev || prev.winner !== null || prev.players[prev.currentPlayer].isHuman) return prev;
        const applyAiCard = (source: UnoState, card: UnoCard, color?: UnoColor) => {
          const playerIdx = source.currentPlayer;
          setLastPlayedId(card.id);
          announceCardEffect(source, card, color);
          const next = playCard(source, card.id, color);
          const handLeft = next.players[playerIdx]?.hand.length ?? 0;
          if (next.winner === null && handLeft === 1) {
            setPendingUno({ playerIdx, secondsLeft: UNO_GRACE_SECONDS });
          }
          setDrawnThisTurn(false);
          setTurnTimeLeft(TURN_SECONDS);
          return next;
        };
        const move = chooseAiMove(prev);
        if (!move) {
          const drawn = drawCards(prev, prev.currentPlayer, 1);
          setDrawPulse(true);
          flyDrawnCard(prev.currentPlayer);
          later(() => setDrawPulse(false), 450);
          const retry = chooseAiMove(drawn);
          if (retry) {
            return applyAiCard(drawn, retry.card, retry.color);
          }
          setDrawnThisTurn(false);
          setTurnTimeLeft(TURN_SECONDS);
          return passTurn(drawn);
        }
        return applyAiCard(prev, move.card, move.color);
      });
      playAppSound(300, 'sine', 0.1);
    }, reduceMotion ? 350 : 900);

    return () => window.clearTimeout(thinkId);
  }, [announceCardEffect, challengeCard, flyDrawnCard, later, reduceMotion, state?.currentPlayer, state?.winner, wildPickerCard]);

  useEffect(() => {
    if (state?.winner === null || state?.winner === undefined) return undefined;
    setBusy(true);
    if (state.winner === 0) {
      playCorrectSound();
      onWin?.();
    }
    // Auto-return to the main menu shortly after the round ends.
    const id = window.setTimeout(() => onExit(), reduceMotion ? 2200 : 3500);
    return () => window.clearTimeout(id);
  }, [onExit, onWin, reduceMotion, state?.winner]);

  useEffect(() => {
    if (!actionEffect) return undefined;
    const id = window.setTimeout(() => setActionEffect(null), reduceMotion ? 900 : 1600);
    return () => window.clearTimeout(id);
  }, [actionEffect, reduceMotion]);

  const chooseWildColor = useCallback((color: UnoColor) => {
    if (!wildPickerCard) return;
    const card = wildPickerCard;
    setWildPickerCard(null);
    playAppSound(500, 'sine', 0.08);
    commitPlay(card, color);
  }, [commitPlay, wildPickerCard]);

  if (!state) return null;

  const human = state.players[0];
  const top = topCard(state);
  const playable = state.currentPlayer === 0 && state.winner === null ? playableCards(state) : [];
  const playableIds = new Set(playable.map((card) => card.id));
  const hasPlayable = playable.length > 0;
  const current = state.players[state.currentPlayer];
  const statusText = state.winner !== null
    ? state.winner === 0
      ? t('You won the UNO round!', 'Bé đã thắng ván UNO!')
      : t(`${state.players[state.winner].name} won this round.`, `${state.players[state.winner].name} đã thắng ván này.`)
    : current.isHuman
      ? t(hasPlayable ? 'Your turn: play a glowing card.' : 'No playable card. Draw one or pass.', hasPlayable ? 'Đến lượt bé: đánh lá đang sáng.' : 'Chưa có lá hợp lệ. Rút bài hoặc bỏ lượt.')
      : t(`${current.name} is thinking...`, `${current.name} đang suy nghĩ...`);

  const renderCard = (
    card: UnoCard,
    opts: { faceDown?: boolean; playable?: boolean; compact?: boolean; tiny?: boolean; layout?: boolean } = {},
  ) => {
    const faceDown = opts.faceDown;
    const cardColor = isWild(card) ? '#111827' : COLOR_HEX[card.color as UnoColor];
    const label = faceDown ? 'UNO' : (VALUE_GLYPH[card.value] || card.value.toUpperCase());
    const sizeClass = opts.tiny
      ? 'w-8 text-[8px] sm:w-12 sm:text-[10px]'
      : opts.compact
        ? 'w-12 text-[10px] sm:w-16 sm:text-xs'
        : 'w-[58px] text-sm sm:w-24 sm:text-lg';

    return (
      <motion.div
        layoutId={opts.layout ? `uno-card-${card.id}` : undefined}
        whileHover={opts.playable ? { y: -10, rotate: -2 } : undefined}
        transition={{ type: 'spring', stiffness: 420, damping: 30 }}
        className={[
          'relative flex aspect-[2/3] min-h-0 select-none flex-col items-center justify-center overflow-hidden rounded-[10px] border-2 border-white text-center font-black shadow-[0_8px_14px_rgba(15,23,42,0.24)] sm:rounded-[14px] sm:border-[3px] sm:shadow-[0_12px_22px_rgba(15,23,42,0.28)]',
          'before:absolute before:inset-1.5 before:rounded-[8px] before:border before:border-white/55 before:content-[""] sm:before:inset-2 sm:before:rounded-[10px]',
          sizeClass,
          opts.playable ? 'ring-4 ring-emerald-300 ring-offset-2 ring-offset-transparent' : '',
          lastPlayedId === card.id ? 'animate-pulse' : '',
        ].join(' ')}
        style={{
          background: faceDown
            ? 'radial-gradient(circle at 28% 18%, rgba(255,255,255,.28), transparent 24%), linear-gradient(145deg, #ef4444 0%, #dc2626 58%, #991b1b 100%)'
            : `radial-gradient(circle at 25% 18%, rgba(255,255,255,.32), transparent 24%), ${cardColor}`,
          color: 'white',
        }}
      >
        <span
          className={[
            'relative z-10 px-2 py-1.5 text-xl leading-none drop-shadow sm:px-3 sm:py-2 sm:text-4xl',
            faceDown
              ? 'rounded-none bg-transparent text-white [text-shadow:0_2px_0_rgba(127,29,29,.55)]'
              : 'rounded-full bg-white/95 text-slate-950 shadow-inner',
          ].join(' ')}
        >
          {label}
        </span>
      </motion.div>
    );
  };

  const renderOpponentSeat = (player: UnoPlayer, seat: 'top' | 'left' | 'right') => {
    const isActive = state.players[state.currentPlayer]?.id === player.id;
    const seatClass = seat === 'top'
      ? 'left-1/2 top-1 -translate-x-1/2 sm:top-2'
      : seat === 'left'
        ? 'left-1 top-1/2 -translate-y-1/2 sm:left-2'
        : 'right-1 top-1/2 -translate-y-1/2 sm:right-2';
    const fanRotation = seat === 'left' ? '-rotate-90' : seat === 'right' ? 'rotate-90' : '';

    return (
      <div className={`uno-opponent-area absolute z-20 ${seatClass}`}>
        <div className={[
          'rounded-xl border px-2 py-1.5 shadow-lg backdrop-blur-md sm:rounded-2xl sm:px-3 sm:py-2 sm:shadow-xl',
          isActive ? 'border-amber-300 bg-amber-300/20 ring-2 ring-amber-300' : isLight ? 'border-slate-200 bg-white/80' : 'border-white/10 bg-slate-950/75',
        ].join(' ')}
        >
          <div className="mb-1 flex items-center justify-between gap-2 sm:gap-3">
            <span className="max-w-14 truncate text-[9px] font-black uppercase sm:max-w-20 sm:text-[11px]">{player.name}</span>
            <span className="rounded-full bg-slate-900 px-1.5 py-0.5 text-[9px] font-black text-white sm:px-2 sm:text-[10px]">{player.hand.length}</span>
          </div>
          <div className={`flex justify-center -space-x-6 sm:-space-x-8 ${fanRotation}`}>
            {player.hand.slice(0, 5).map((card, index) => (
              <div
                key={card.id}
                className="shrink-0"
                style={{ transform: `rotate(${(index - Math.min(player.hand.length, 5) / 2) * 4}deg)` }}
              >
                {renderCard(card, { faceDown: true, tiny: true, layout: true })}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  const renderActionGlyph = (effect: UnoActionEffect) => {
    if (effect.type === 'skip') return <Ban className="h-10 w-10" />;
    if (effect.type === 'reverse') return <RotateCcw className="h-10 w-10" />;
    if (effect.type === 'wild') return <Sparkles className="h-10 w-10" />;
    return <span className="text-4xl font-black leading-none">{effect.type === 'wild4' ? '+4' : '+2'}</span>;
  };

  const actionEffectLabel = (effect: UnoActionEffect) => {
    if (effect.type === 'skip') return t('Turn skipped', 'Bi chan luot');
    if (effect.type === 'reverse') return t('Direction reversed', 'Dao chieu');
    if (effect.type === 'wild') return t('Color changed', 'Doi mau');
    return effect.type === 'wild4' ? '+4' : '+2';
  };

  const actionEffectClass = (effect: UnoActionEffect) => {
    if (effect.type === 'skip') return 'border-rose-200 bg-rose-500 text-white shadow-[0_0_34px_rgba(244,63,94,0.65)]';
    if (effect.type === 'reverse') return 'border-sky-200 bg-sky-500 text-white shadow-[0_0_34px_rgba(14,165,233,0.65)]';
    if (effect.type === 'wild') return 'border-white/80 bg-slate-950 text-white shadow-[0_0_34px_rgba(255,255,255,0.45)]';
    return 'border-amber-100 bg-amber-400 text-slate-950 shadow-[0_0_34px_rgba(251,191,36,0.75)]';
  };

  return (
    <div className={`uno-game-shell flex min-h-[560px] flex-1 flex-col overflow-hidden rounded-2xl border p-2 sm:min-h-[620px] sm:p-5 ${
      isLight ? 'border-red-200 bg-white/85 text-slate-900' : 'border-red-500/20 bg-[#170f18] text-white'
    }`}
    >
      <div className="landscape-hide mb-2 flex shrink-0 items-center justify-between gap-2 sm:mb-3">
        <button
          type="button"
          onClick={onExit}
          className={`flex h-9 w-9 items-center justify-center rounded-xl border sm:h-10 sm:w-10 ${
            isLight ? 'border-slate-200 bg-white text-slate-700' : 'border-white/10 bg-white/5 text-white'
          }`}
          title={t('Back', 'Quay lại')}
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="text-center">
          <h2 className="text-xs font-black uppercase tracking-wide sm:text-base">UNO Vocabulary</h2>
          <p className="max-w-[250px] truncate text-[11px] font-bold text-[var(--app-text-muted)] sm:max-w-none sm:text-xs">{statusText}</p>
          <div className="mt-1 inline-flex items-center gap-1.5 rounded-full border border-amber-400/30 bg-amber-400/10 px-2.5 py-0.5 text-[10px] font-black text-amber-500 sm:gap-2 sm:px-3 sm:py-1 sm:text-[11px]">
            <span>{t('Turn timer', 'Thời gian lượt')}</span>
            <span className={turnTimeLeft <= 3 ? 'animate-pulse text-rose-500' : ''}>{turnTimeLeft}s</span>
            <span className="rounded-full bg-black/15 px-2 text-[10px] text-[var(--app-text)]">
              {state.direction === 1 ? '↻' : '↺'}
            </span>
          </div>
        </div>
        <div className="h-9 w-9 sm:h-10 sm:w-10" aria-hidden="true" />
      </div>

      <div className={`uno-table-area relative flex min-h-[350px] flex-1 overflow-hidden rounded-[22px] border p-2 shadow-inner sm:min-h-[520px] sm:rounded-[28px] sm:p-3 ${
        isLight
          ? 'border-emerald-700/20 bg-[radial-gradient(circle_at_center,#21a366_0%,#166534_58%,#14532d_100%)]'
          : 'border-emerald-300/15 bg-[radial-gradient(circle_at_center,#14532d_0%,#052e16_60%,#020617_100%)]'
      }`}
      >
        <div className="pointer-events-none absolute inset-3 rounded-[18px] border-2 border-dashed border-white/18 sm:inset-4 sm:rounded-[24px] sm:border-4" />
        <div className="pointer-events-none absolute inset-x-8 top-1/2 h-px bg-white/10 sm:inset-x-10" />
        <div className="pointer-events-none absolute inset-y-8 left-1/2 w-px bg-white/10 sm:inset-y-10" />

        {state.players[1] && renderOpponentSeat(state.players[1], 'top')}
        {state.players[2] && renderOpponentSeat(state.players[2], 'left')}
        {state.players[3] && renderOpponentSeat(state.players[3], 'right')}

        <AnimatePresence>
          {actionEffect && (
            <React.Fragment key={`action-effect-${actionEffect.id}`}>
              <div
                key={`action-badge-${actionEffect.id}`}
                className={`pointer-events-none absolute z-40 ${SEAT_EFFECT_CLASS[actionEffect.targetSeat]}`}
              >
                <motion.div
                  className={`flex min-h-20 min-w-20 flex-col items-center justify-center rounded-full border-4 px-3 text-center font-black uppercase sm:min-h-24 sm:min-w-24 sm:px-4 ${actionEffectClass(actionEffect)}`}
                  initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.35, y: 18 }}
                  animate={reduceMotion ? { opacity: 1 } : { opacity: [0, 1, 1, 0.88], scale: [0.35, 1.22, 1], y: [18, -8, 0] }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={{ duration: reduceMotion ? 0.25 : 0.72, ease: 'easeOut' }}
                >
                  {renderActionGlyph(actionEffect)}
                  <span className="mt-1 text-[10px] tracking-wide">{actionEffectLabel(actionEffect)}</span>
                  {actionEffect.color && (
                    <span
                      className="mt-1 h-4 w-4 rounded-full border-2 border-white shadow"
                      style={{ background: COLOR_HEX[actionEffect.color] }}
                    />
                  )}
                </motion.div>
              </div>

              {Array.from({ length: actionEffect.cards ?? 0 }).map((_, index) => {
                const target = CARD_FLY_TARGET[actionEffect.targetSeat];
                return (
                  <motion.div
                    key={`action-card-${actionEffect.id}-${index}`}
                    className="pointer-events-none absolute left-1/2 top-1/2 z-30"
                    initial={{ x: -24, y: -38, opacity: 0, scale: 0.55, rotate: 0 }}
                    animate={reduceMotion
                      ? { opacity: [0, 1, 0], scale: 0.72 }
                      : {
                        x: target.x + (index - 1.5) * 12,
                        y: target.y + (index % 2) * 12,
                        opacity: [0, 1, 1, 0],
                        scale: [0.55, 0.82, 0.7],
                        rotate: target.rotate + (index - 1.5) * 7,
                      }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: reduceMotion ? 0.45 : 1.05, delay: index * 0.08, ease: 'easeInOut' }}
                  >
                    {renderCard({ id: `action-${actionEffect.id}-${index}`, color: 'wild', value: 'wild' }, { faceDown: true, tiny: true })}
                  </motion.div>
                );
              })}
            </React.Fragment>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {drawFly && (
            <motion.div
              key={`draw-fly-${drawFly.id}`}
              className="pointer-events-none absolute left-1/2 top-1/2 z-30"
              initial={{ x: -18, y: -30, opacity: 0, scale: 0.6, rotate: -4 }}
              animate={reduceMotion
                ? { opacity: [0, 1, 0], scale: 0.8 }
                : {
                  x: CARD_FLY_TARGET[drawFly.seat].x,
                  y: CARD_FLY_TARGET[drawFly.seat].y,
                  opacity: [0, 1, 1, 0],
                  scale: [0.6, 0.95, 0.8],
                  rotate: CARD_FLY_TARGET[drawFly.seat].rotate,
                }}
              exit={{ opacity: 0 }}
              transition={{ duration: reduceMotion ? 0.35 : 0.7, ease: 'easeOut' }}
            >
              {renderCard({ id: `draw-fly-${drawFly.id}`, color: 'wild', value: 'wild' }, { faceDown: true, tiny: true })}
            </motion.div>
          )}
        </AnimatePresence>

        <main className="uno-play-area relative z-10 m-auto flex max-w-full flex-col items-center justify-center">
          <div className="flex items-center gap-3 rounded-2xl border border-white/15 bg-black/18 p-2.5 shadow-xl backdrop-blur-sm sm:gap-5 sm:rounded-3xl sm:p-4 sm:shadow-2xl">
            <div className="text-center">
              <p className="mb-1 text-[9px] font-black uppercase text-white/75 sm:mb-2 sm:text-[10px]">{t('Draw pile', 'Chồng rút')}</p>
              <motion.div animate={drawPulse ? { y: [-6, -22, 0], rotate: [0, -5, 0], scale: [1, 1.08, 1] } : {}}>
                {renderCard({ id: 'draw', color: 'wild', value: 'wild' }, { faceDown: true, compact: true })}
              </motion.div>
              <p className="mt-1 text-xs font-black text-white">{state.drawPile.length}</p>
            </div>
            <div className="text-center">
              <p className="mb-1 text-[9px] font-black uppercase text-white/75 sm:mb-2 sm:text-[10px]">{t('Played card', 'Lá vừa đánh')}</p>
              <AnimatePresence mode="popLayout">
                <motion.div
                  key={top.id}
                  layoutId={`uno-card-${top.id}`}
                  initial={{ scale: 0.72, y: -80, rotate: -18, opacity: 0 }}
                  animate={{ scale: 1, y: 0, rotate: lastPlayedId === top.id ? 4 : 0, opacity: 1 }}
                  exit={{ scale: 0.72, opacity: 0 }}
                  transition={{ type: 'spring', stiffness: 360, damping: 26 }}
                  className={lastPlayedId === top.id ? 'drop-shadow-[0_0_28px_rgba(251,191,36,0.55)]' : ''}
                >
                  {renderCard(top)}
                </motion.div>
              </AnimatePresence>
              <div className="mt-1 flex items-center justify-center gap-1.5 rounded-full bg-black/25 px-2.5 py-0.5 text-[10px] font-black uppercase text-white sm:mt-2 sm:gap-2 sm:px-3 sm:py-1 sm:text-xs">
                <span className="h-3.5 w-3.5 rounded-full border border-white/80 sm:h-4 sm:w-4" style={{ background: COLOR_HEX[state.activeColor] }} />
                <span>{state.activeColor}</span>
              </div>
            </div>
          </div>

          {message && (
            <div className="mt-2 max-w-[260px] rounded-xl border border-amber-300/40 bg-amber-300/20 px-3 py-1.5 text-center text-[11px] font-black text-amber-100 shadow-lg sm:mt-3 sm:max-w-none sm:py-2 sm:text-xs">
              {isEnglish ? message.en : message.vi}
            </div>
          )}

          {pendingUno && (
            <div className="mt-2 rounded-xl border border-rose-300/50 bg-rose-500/25 px-3 py-1.5 text-center text-[11px] font-black text-white shadow-lg sm:mt-3 sm:py-2 sm:text-xs">
              {state.players[pendingUno.playerIdx]?.name} {t('must call UNO!', 'phải hô UNO!')} {pendingUno.secondsLeft}s
            </div>
          )}

          <div className="mt-3 flex flex-wrap justify-center gap-2 sm:mt-4">
            <button
              type="button"
              onClick={onDraw}
              disabled={busy || drawnThisTurn || state.currentPlayer !== 0 || state.winner !== null}
              className="flex min-h-10 items-center gap-1.5 rounded-xl border-b-4 border-sky-700 bg-sky-500 px-3 text-[11px] font-black uppercase text-white disabled:opacity-50 sm:min-h-11 sm:gap-2 sm:px-4 sm:text-xs"
            >
              <Hand className="h-4 w-4" />{t('Draw', 'Rút bài')}
            </button>
            <button
              type="button"
              onClick={onPassTurn}
              disabled={busy || state.currentPlayer !== 0 || state.winner !== null}
              className="min-h-10 rounded-xl border-b-4 border-slate-700 bg-slate-500 px-3 text-[11px] font-black uppercase text-white disabled:opacity-50 sm:min-h-11 sm:px-4 sm:text-xs"
            >
              {t('Pass', 'Bỏ lượt')}
            </button>
          </div>

          {state.winner !== null && (
            <div className="mt-3 rounded-2xl border border-emerald-400/30 bg-emerald-400/10 p-3 text-center text-white sm:mt-4 sm:p-4">
              <Trophy className="mx-auto mb-2 h-8 w-8 text-amber-300" />
              <p className="text-sm font-black">{statusText}</p>
            </div>
          )}
        </main>
      </div>

      <section className={`uno-player-hand mt-2 shrink-0 rounded-2xl border p-2 sm:mt-3 sm:p-3 ${state.currentPlayer === 0 ? 'border-amber-400 ring-2 ring-amber-300/40' : isLight ? 'border-slate-200 bg-white' : 'border-white/10 bg-white/5'}`}>
        <div className="mb-1.5 flex items-center justify-between gap-2 sm:mb-2">
          <div>
            <p className="text-[11px] font-black uppercase sm:text-xs">{human.name}</p>
            <p className="text-[10px] font-bold text-[var(--app-text-muted)] sm:text-[11px]">{human.hand.length} {t('cards', 'lá bài')}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => callUno(0)}
              disabled={pendingUno?.playerIdx !== 0}
              className={`min-h-9 rounded-xl border-b-4 px-3 text-[11px] font-black uppercase text-white shadow-lg sm:min-h-10 sm:px-4 sm:text-xs ${
                pendingUno?.playerIdx === 0
                  ? 'animate-pulse border-amber-700 bg-amber-500'
                  : 'cursor-not-allowed border-slate-500 bg-slate-400 opacity-60'
              }`}
            >
              UNO!
            </button>
            <Volume2 className="h-4 w-4 text-[var(--app-text-muted)]" />
          </div>
        </div>
        <div className="flex gap-1.5 overflow-x-auto pb-1.5 sm:gap-2 sm:pb-2">
          {human.hand.map((card) => (
            <button
              key={card.id}
              type="button"
              disabled={busy || state.currentPlayer !== 0 || state.winner !== null}
              onClick={() => onPlayCard(card)}
              className="shrink-0 transition disabled:opacity-70"
              title={t('Play card', 'Đánh lá bài')}
            >
              {renderCard(card, { playable: playableIds.has(card.id), layout: true })}
            </button>
          ))}
        </div>
      </section>

      {wildPickerCard && (
        <div className="fixed inset-0 z-[700] flex items-center justify-center bg-black/60 p-4">
          <div className={`w-full max-w-sm rounded-2xl border p-4 text-center shadow-2xl ${isLight ? 'border-slate-200 bg-[#fffaf8] text-[#4e0c1b]' : 'border-white/10 bg-slate-950'}`}>
            <h3 className="mb-3 text-sm font-black uppercase">{t('Choose a color', 'Chọn màu')}</h3>
            <div className="grid grid-cols-2 gap-3">
              {UNO_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => chooseWildColor(color)}
                  className="min-h-14 rounded-xl border-2 border-white/70 text-xs font-black uppercase text-white"
                  style={{ background: COLOR_HEX[color] }}
                >
                  {color}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {challengeCard && challengeWord && (
        <div className="fixed inset-0 z-[700] flex items-center justify-center bg-black/60 p-4">
          <div className={`w-full max-w-md rounded-2xl border p-4 text-center shadow-2xl ${isLight ? 'border-slate-200 bg-[#fffaf8] text-[#4e0c1b]' : 'border-white/10 bg-slate-950'}`}>
            {challengeStatus === 'fallback' ? (
              <FallbackChallenge
                word={challengeWord}
                wordPool={wordPool}
                onSuccess={() => {
                  if (currentChild?.id) {
                    recordWordAnswer(currentChild.id, challengeWord.word.toLowerCase(), 3);
                  }
                  playCorrectSound();
                  setChallengeStatus('correct');
                  const card = challengeCard;
                  const color = pendingWildColorRef.current;
                  setTimeout(() => {
                    closeChallenge();
                    if (isWild(card) && !color) {
                      setWildPickerCard(card);
                    } else {
                      commitPlay(card, color);
                    }
                  }, 850);
                }}
                onSkip={rotateChallengeWord}
                globalLang={globalLang}
                isLight={isLight}
              />
            ) : (
              <>
                <div className="mb-3 flex items-center justify-between">
                  <button type="button" onClick={closeChallenge} className="rounded-lg p-2 text-[var(--app-text-muted)]"><X className="h-5 w-5" /></button>
                  <h3 className="text-sm font-black uppercase">{t('Speak to play special card', 'Đọc từ để đánh lá đặc biệt')}</h3>
                  <button type="button" onClick={() => speak(challengeWord.word)} className="rounded-lg p-2 text-sky-500"><Volume2 className="h-5 w-5" /></button>
                </div>
                <div className="mb-4 rounded-2xl border border-amber-400/30 bg-amber-400/10 p-4">
                  <div className="text-5xl">{challengeWord.emoji}</div>
                  <p className="mt-2 text-2xl font-black">{challengeWord.word}</p>
                  {challengeWord.ipa && <p className="text-xs font-bold text-sky-500">{challengeWord.ipa}</p>}
                  <p className="text-xs font-bold text-[var(--app-text-muted)]">{challengeWord.vietnamese}</p>
                </div>
                <div className="flex justify-center gap-3">
                  <button
                    type="button"
                    onClick={startListening}
                    className={`flex h-14 w-14 items-center justify-center rounded-full border-b-4 text-white ${challengeStatus === 'listening' ? 'border-rose-700 bg-rose-500' : 'border-emerald-700 bg-emerald-500'}`}
                  >
                    <Mic className="h-6 w-6" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setChallengeStatus('fallback')}
                    className="flex h-14 px-4 items-center justify-center rounded-2xl border-b-4 border-amber-700 bg-amber-500 text-white text-xs font-black uppercase"
                  >
                    {t('Quiz Fallback', 'Chơi game thay thế')}
                  </button>
                </div>
                {heardText && <p className="mt-3 text-xs font-bold text-[var(--app-text-muted)]">"{heardText}"</p>}
                {challengeStatus === 'correct' && <p className="mt-3 text-sm font-black text-emerald-500">{t('Great speaking!', 'Bé đọc tốt lắm!')}</p>}
                {challengeStatus === 'retry' && <p className="mt-3 text-sm font-black text-rose-500">{t('Try again.', 'Thử lại nhé.')}</p>}
              </>
            )}
          </div>
        </div>
      )}

      {state.winner !== null && (
        <div className="fixed inset-0 z-[710] flex items-center justify-center bg-black/70 p-4">
          <div className={`w-full max-w-sm rounded-2xl border p-5 text-center shadow-2xl ${isLight ? 'border-emerald-200 bg-[#fffaf8] text-[#4e0c1b]' : 'border-emerald-400/30 bg-slate-950'}`}>
            <Trophy className="mx-auto mb-3 h-10 w-10 text-amber-500" />
            <h3 className="text-lg font-black uppercase">{statusText}</h3>
            <p className="mt-2 text-xs font-bold text-[var(--app-text-muted)]">
              {t('The round is over.', 'Ván bài đã kết thúc.')}
            </p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={startGame}
                className="min-h-11 rounded-xl border-b-4 border-emerald-700 bg-emerald-500 px-3 text-xs font-black uppercase text-white"
              >
                {t('Play again', 'Chơi lại')}
              </button>
              <button
                type="button"
                onClick={onExit}
                className="min-h-11 rounded-xl border-b-4 border-slate-700 bg-slate-500 px-3 text-xs font-black uppercase text-white"
              >
                {t('Menu', 'Menu')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
