import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { BookOpen, Trophy, Gift, Check, Lock, Play, Volume2, Sparkles, Award } from 'lucide-react';
import { Lesson, Outfit } from '../types';
import { playAppSound } from '../data';
import { MASCOT_BOB_ANIMATION } from '../assets/animations';
import SunnyMascot from './SunnyMascot';
import TopicLessonFlow from './TopicLessonFlow';

interface TopicCard {
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
}

interface PathMapProps {
  lessons: Lesson[];
  activeOutfit: Outfit;
  onStartLesson: (lessonId: string) => void;
  onOpenChest: (nodeId: string) => void;
  viewType: 'topic' | 'alphabet';
  topicCards?: TopicCard[];
  isTopicsLoading?: boolean;
  globalLang: 'en' | 'vi';
  globalTheme: 'dark' | 'light';
}

const TOPIC_LESSON_MAP: Record<string, string> = {
  family: 'lesson6',
  animals: 'lesson3',
  food: 'lesson5',
  colors: 'lesson4',
  alphabet: 'lesson2',
};

const SPEAKJOY_QUOTES = [
  { text: 'Bé yêu ơi, hôm nay bé giỏi lắm đấy! Let\'s learn!', en: "Baby, you are so awesome today! Let's learn!" },
  { text: 'Chắp cánh ước mơ tiếng Anh cùng SpeakJoy nhé! Keep it up!', en: 'Fly high with English along with SpeakJoy! Keep it up!' },
  { text: 'Đọc thật to tiếng Anh cùng SpeakJoy nha! Speak out loud!', en: 'Speak English out loud along with SpeakJoy! Speak out loud!' },
  { text: 'Mỗi ngày một bài học, tiếng Anh tiến bộ vèo vèo!', en: 'A lesson a day, English will grow every day!' },
  { text: 'Mặt Trời thích bộ đồ mới bé chọn quá! Thank you!', en: 'Sunny loves the new outfit you selected! Thank you!' },
];

const HANDBOOK_DATA: Record<string, Array<{ en: string; vi: string; phonics: string }>> = {
  lesson1: [
    { en: 'Water', vi: 'Nước uống', phonics: '/ˈwɔːtər/' },
    { en: 'Guest', vi: 'Khách đến nhà', phonics: '/ɡest/' },
    { en: 'Would you like some water, please?', vi: 'Mời khách uống nước một cách lịch sự', phonics: '/wʊd juː laɪk sʌm ˈwɔːtər pliːz/' },
  ],
  lesson3: [
    { en: 'Dog', vi: 'Con chó', phonics: '/dɔːg/' },
    { en: 'Cat', vi: 'Con mèo', phonics: '/kæt/' },
    { en: 'I love my lovely dog and cat', vi: 'Tớ yêu thương chú chó và chú mèo của mình', phonics: '/aɪ lʌv maɪ ˈlʌvli dɔːg ænd kæt/' },
  ],
  lesson4: [
    { en: 'Green', vi: 'Màu xanh lá', phonics: '/griːn/' },
    { en: 'Yellow', vi: 'Màu vàng', phonics: '/ˈjeləʊ/' },
    { en: 'Yellow is my favorite color', vi: 'Màu vàng là màu ưa thích của tớ', phonics: '/ˈjeləʊ ɪz maɪ ˈfeɪvərɪt ˈkʌlər/' },
  ],
  lesson5: [
    { en: 'Orange', vi: 'Quả cam', phonics: '/ˈɒrɪndʒ/' },
    { en: 'I love orange juice', vi: 'Tớ thích uống nước cam ép mát lành', phonics: '/aɪ lʌv ˈɒrɪndʒ dʒuːs/' },
  ],
  lesson6: [
    { en: 'Father', vi: 'Bố', phonics: '/ˈfɑːðər/' },
    { en: 'Mother', vi: 'Mẹ', phonics: '/ˈmʌðər/' },
    { en: 'I love my happy family', vi: 'Tớ yêu gia đình hạnh phúc của mình', phonics: '/aɪ lʌv maɪ ˈhæpi ˈfæməli/' },
  ],
  lesson2: [
    { en: 'Apple', vi: 'Quả táo', phonics: '/ˈæpl/' },
    { en: 'A is for Apple', vi: 'Chữ A bắt đầu của từ Apple', phonics: '/eɪ ɪz fɔːr ˈæpl/' },
  ],
  lesson_alphabet2: [
    { en: 'Elephant', vi: 'Con voi', phonics: '/ˈelɪfənt/' },
    { en: 'E is for Elephant', vi: 'Chữ E đại diện cho bé voi khổng lồ', phonics: '/iː ɪz fɔːr ˈelɪfənt/' },
  ],
  lesson_alphabet3: [
    { en: 'Ice cream', vi: 'Ly kem lạnh', phonics: '/ˈaɪs kriːm/' },
    { en: 'I love sweet ice cream', vi: 'Tớ yêu món kem ngọt mát', phonics: '/aɪ lʌv swiːt ˈaɪs kriːm/' },
  ],
};

const ALPHABET_PHONICS: Record<string, string> = {
  A: '/eɪ/',
  B: '/biː/',
  C: '/siː/',
  D: '/diː/',
  E: '/iː/',
  F: '/ef/',
  G: '/dʒiː/',
  H: '/eɪtʃ/',
  I: '/aɪ/',
  J: '/dʒeɪ/',
  K: '/keɪ/',
  L: '/el/',
  M: '/em/',
  N: '/en/',
  O: '/əʊ/',
  P: '/piː/',
  Q: '/kjuː/',
  R: '/ɑːr/',
  S: '/es/',
  T: '/tiː/',
  U: '/juː/',
  V: '/viː/',
  W: '/ˈdʌbljuː/',
  X: '/eks/',
  Y: '/waɪ/',
  Z: '/zed/',
};

export default function PathMap({
  lessons,
  activeOutfit,
  onStartLesson,
  onOpenChest,
  viewType,
  topicCards = [],
  isTopicsLoading = false,
  globalLang,
  globalTheme,
}: PathMapProps) {
  const [showTips, setShowTips] = useState(false);
  const [tipsLessonId, setTipsLessonId] = useState<string>('lesson1');
  const [quoteIdx, setQuoteIdx] = useState(0);
  const [isBubbleVisible, setIsBubbleVisible] = useState(true);

  const [flowTopicSlug, setFlowTopicSlug] = useState<string | null>(null);
  const [flowCompletedCount, setFlowCompletedCount] = useState<number>(0);

  const handleMascotClick = () => {
    playAppSound(880, 'sine', 0.12);
    const nextIdx = (quoteIdx + 1) % SPEAKJOY_QUOTES.length;
    setQuoteIdx(nextIdx);
    setIsBubbleVisible(true);
    speakGuide(SPEAKJOY_QUOTES[nextIdx].en);
  };

  const speakGuide = (text: string) => {
    if ('speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'en-US';
      utterance.rate = 0.85;
      window.speechSynthesis.speak(utterance);
    }
  };

  const speakLetter = (letter: string) => {
    playAppSound(600, 'sine', 0.08);
    speakGuide(letter);
  };


  const filteredLessons = lessons.filter((lesson) => {
    if (viewType === 'topic') {
      return ['lesson1', 'lesson3', 'lesson4', 'lesson5', 'lesson6', 'trophy_node'].includes(lesson.id) || lesson.type === 'chest';
    }
    return ['lesson2', 'lesson_alphabet2', 'lesson_alphabet3'].includes(lesson.id);
  });

  const getTopicColor = (id: string) => {
    switch (id) {
      case 'lesson1':
        return 'from-[#1cb0f6] to-[#0092d6]';
      case 'lesson3':
        return 'from-[#ff9600] to-[#e06c00]';
      case 'lesson4':
        return 'from-[#58cc02] to-[#429c01]';
      case 'lesson5':
        return 'from-[#df52ff] to-[#bd16e0]';
      case 'lesson6':
        return 'from-[#ff4b4b] to-[#d41c1c]';
      case 'lesson_alphabet2':
        return 'from-[#df52ff] to-[#bd16e0]';
      case 'lesson_alphabet3':
        return 'from-[#58cc02] to-[#429c01]';
      default:
        return 'from-[#1cb0f6] to-[#0092d6]';
    }
  };

  const getTopicEmoji = (id: string) => {
    switch (id) {
      case 'lesson1':
        return '💧';
      case 'lesson3':
        return '🐶';
      case 'lesson4':
        return '🎨';
      case 'lesson5':
        return '🍊';
      case 'lesson6':
        return '🏡';
      case 'lesson2':
        return '🍎';
      case 'lesson_alphabet2':
        return '🐘';
      case 'lesson_alphabet3':
        return '🍦';
      default:
        return '🌟';
    }
  };

  const getTopicColorBySlug = (slug: string, fallbackId: string) => {
    switch (slug) {
      case 'family':
        return 'from-[#ff4b4b] to-[#d41c1c]';
      case 'animals':
        return 'from-[#ff9600] to-[#e06c00]';
      case 'colors':
        return 'from-[#58cc02] to-[#429c01]';
      case 'food':
        return 'from-[#df52ff] to-[#bd16e0]';
      case 'alphabet':
        return 'from-[#1cb0f6] to-[#0092d6]';
      default:
        return getTopicColor(fallbackId);
    }
  };

  const getTopicEmojiBySlug = (slug: string, fallbackId: string) => {
    switch (slug) {
      case 'family':
        return '🏡';
      case 'animals':
        return '🐶';
      case 'colors':
        return '🎨';
      case 'food':
        return '🍊';
      case 'alphabet':
        return '🔤';
      default:
        return getTopicEmoji(fallbackId);
    }
  };

  const alphabetLetters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
  const handbookList = HANDBOOK_DATA[tipsLessonId] || HANDBOOK_DATA.lesson1;
  const isEnglish = globalLang === 'en';

  return (
    <div className="flex-1 w-full flex flex-col items-center">
      <div className="w-full bg-[#14252f] rounded-[24px] border border-[#37464f]/50 p-6 shadow-xl mb-7 relative overflow-hidden flex flex-col md:flex-row items-center gap-6 justify-between">
        <div className="flex-1 space-y-2 text-center md:text-left">
          <span className="text-[10px] font-black uppercase tracking-widest text-[#58cc02] bg-[#58cc02]/10 px-3 py-1 rounded-full border border-[#58cc02]/20">
            {viewType === 'topic'
              ? isEnglish
                ? '📚 Topic lessons'
                : '📚 Học theo chủ đề'
              : isEnglish
                ? '🔤 Alphabet lessons'
                : '🔤 Học theo bảng chữ cái'}
          </span>
          <h2 className="readable-block text-2xl font-black text-white leading-tight md:text-3xl">
            {viewType === 'topic'
              ? isEnglish
                ? 'Speaking and quiz practice by topic 🌟'
                : 'Luyện nói và trắc nghiệm chủ đề 🌟'
              : isEnglish
                ? 'Alphabet world and phonics vocabulary 🍎'
                : 'Thế giới chữ cái và từ vựng phonics 🍎'}
          </h2>
          <p className="text-xs text-gray-400 leading-relaxed max-w-lg">
            {viewType === 'topic'
              ? isEnglish
                ? 'Practice basic English speaking through familiar topics like friends, pets, colors, family, and food.'
                : 'Cùng Mặt Trời luyện giao tiếp tiếng Anh cơ bản theo các chủ đề gần gũi như bạn bè, thú cưng, màu sắc, gia đình và trái cây.'
              : isEnglish
                ? 'Explore the alphabet in a playful way. Tap each letter to hear the pronunciation and open its matching lesson.'
                : 'Học bảng chữ cái vui vẻ. Nhấn vào từng chữ cái để nghe phát âm và làm bài luyện tập tương ứng.'}
          </p>
        </div>

        <div className="flex flex-col items-center flex-shrink-0 relative z-10">
          <AnimatePresence mode="wait">
            {isBubbleVisible && (
              <motion.div
                initial={{ opacity: 0, scale: 0.8, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.8 }}
                onClick={handleMascotClick}
                className="mb-2 max-w-[170px] bg-white border-2 border-[#1cb0f6] text-[#1c282e] p-2.5 rounded-[16px] text-[10px] font-sans font-bold leading-tight relative shadow-xl cursor-pointer text-center"
              >
                <div className="text-[#1cb0f6] text-[8px] uppercase tracking-wider mb-0.5">
                  {isEnglish ? 'Sunny says:' : 'Mặt Trời Sunny:'}
                </div>
                <div>{SPEAKJOY_QUOTES[quoteIdx].text}</div>
                <span className="inline-block ml-1 text-violet-500 animate-pulse">🔊</span>
                <div className="w-2.5 h-2.5 bg-white border-r-2 border-b-2 border-[#1cb0f6] transform rotate-45 absolute -bottom-1.5 left-1/2 -translate-x-1/2" />
              </motion.div>
            )}
          </AnimatePresence>

          <motion.div
            animate={MASCOT_BOB_ANIMATION.keyframes}
            transition={MASCOT_BOB_ANIMATION.transition}
            onClick={handleMascotClick}
            className="cursor-pointer hover:scale-110 active:scale-95 transition-transform"
          >
            <SunnyMascot outfitId={activeOutfit.id} sizeClassName="w-16 h-16 md:w-20 md:h-20" />
          </motion.div>
          <span className="text-[10px] text-gray-500 font-bold uppercase mt-1 tracking-wider">
            {isEnglish ? activeOutfit.name : activeOutfit.vietnameseName}
          </span>
        </div>

        <div className="absolute -bottom-10 -left-10 text-[120px] opacity-[0.03] select-none pointer-events-none text-white">☀️</div>
      </div>

      {viewType === 'alphabet' && (
        <div className="w-full bg-[#111c24] border border-[#202f36] p-5 rounded-[24px] mb-8 shadow-inner">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xs font-black text-[#1cb0f6] uppercase tracking-wider flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-amber-400 animate-pulse" />
              {isEnglish ? 'Quick A to Z pronunciation board:' : 'Bảng phát âm nhanh A - Z của bé:'}
            </h3>
            <span className="text-[10px] text-gray-500 italic">
              {isEnglish ? 'Tap any letter to hear the sample sound' : 'Nhấn vào chữ cái để nghe phát âm mẫu'}
            </span>
          </div>

          <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-3">
            {alphabetLetters.map((char) => (
              <motion.button
                whileHover={{ scale: 1.08 }}
                whileTap={{ scale: 0.95 }}
                key={char}
                onClick={() => speakLetter(char)}
                className="aspect-square flex flex-col items-center justify-center min-h-[48px] min-w-[48px] p-2 rounded-2xl bg-[#14252f] hover:bg-[#182f3d] border-2 border-[#1f2d35] hover:border-[#1cb0f6] transition-all cursor-pointer shadow-md select-none group"
              >
                <span className="text-xl font-extrabold text-white group-hover:text-[#1cb0f6] transition-colors">{char}</span>
                <span className="text-[9px] text-gray-500 font-mono mt-0.5 uppercase">{ALPHABET_PHONICS[char]}</span>
              </motion.button>
            ))}
          </div>
        </div>
      )}

      <div className="w-full grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {viewType === 'topic' &&
          topicCards.length > 0 &&
          topicCards.map((topic) => {
            const mappedLessonId = TOPIC_LESSON_MAP[topic.slug] || 'lesson1';
            const isCompleted = topic.progress >= 100;
            const emoji = getTopicEmojiBySlug(topic.slug, mappedLessonId);
            const bgGrad = getTopicColorBySlug(topic.slug, mappedLessonId);
            const nextLessonNumber = Math.min(topic.completedLessons + 1, Math.max(topic.totalLessons, 1));
            const launchLessonId = `topic:${topic.slug}:${nextLessonNumber}`;

            return (
              <div
                key={topic.id}
                className="bg-[#14252f] rounded-[24px] border border-[#202f36] shadow-xl overflow-hidden flex flex-col justify-between hover:border-[#37464f] transition-all group min-h-[268px] relative"
              >
                <div className={`p-4 bg-gradient-to-br ${bgGrad} text-white flex items-start justify-between relative`}>
                  <div className="space-y-0.5">
                    <span className="text-[9px] font-black tracking-widest text-[#0e2a53] block">
                      {isEnglish ? 'Live topic from backend' : 'Chủ đề thật từ backend'}
                    </span>
                    <h3
                      className="truncate-accessible text-base font-black tracking-tight leading-tight"
                      title={isEnglish ? topic.name : topic.vietnameseName || topic.name}
                    >
                      {isEnglish ? topic.name : topic.vietnameseName || topic.name}
                    </h3>
                    <span className="text-[10.5px] opacity-90 font-medium block">
                      {isEnglish ? topic.vietnameseName || topic.name : topic.name}
                    </span>
                  </div>
                  <div className="text-3xl filter drop-shadow-md select-none transform group-hover:scale-110 transition-transform">{emoji}</div>
                </div>

                <div className="p-4 flex-1 flex flex-col justify-between space-y-4">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-[10.5px] font-bold text-gray-400">
                      <Award className="w-4 h-4 text-amber-400" />
                      <span>
                        {isEnglish ? 'Progress:' : 'Tiến độ:'} <strong className="text-[#58cc02]">{topic.progress}%</strong> • {topic.completedLessons}/{topic.totalLessons} {isEnglish ? 'lessons' : 'bài'}
                      </span>
                    </div>

                    <div className="space-y-1 bg-black/15 p-2 rounded-xl border border-[#37464f]/20">
                      <div className="text-[9.5px] text-gray-500 font-extrabold uppercase tracking-wide">
                        {isEnglish ? 'Description:' : 'Mô tả:'}
                      </div>
                      <div className="text-[11px] text-gray-300 font-medium leading-relaxed italic line-clamp-3">{topic.description}</div>
                    </div>

                    <div className="w-full h-3 bg-[#202f36] rounded-full overflow-hidden border border-[#37464f]">
                      <div className="h-full bg-gradient-to-r from-[#58cc02] to-[#1cb0f6] transition-all duration-500 rounded-full" style={{ width: `${topic.progress}%` }} />
                    </div>
                  </div>

                  <div className="flex gap-2.5 pt-2">
                    <button
                      onClick={() => {
                        playAppSound(400, 'sine', 0.05);
                        setTipsLessonId(mappedLessonId);
                        setShowTips(true);
                      }}
                      className="flex min-h-[48px] min-w-[48px] items-center justify-center p-3 bg-[#1f2d35]/50 border border-[#37464f] hover:bg-[#202f36] rounded-xl text-gray-300 hover:text-white transition active:scale-95 active:duration-75 cursor-pointer"
                      title={isEnglish ? 'Open vocabulary handbook' : 'Mở sổ tay từ vựng học'}
                    >
                      <BookOpen className="w-4 h-4" />
                    </button>

                    <button
                      onClick={() => {
                        playAppSound(400, 'sine', 0.05);
                        setFlowTopicSlug(topic.slug);
                        setFlowCompletedCount(topic.completedLessons);
                      }}
                      className={`flex-1 min-h-[48px] ${
                        isCompleted
                          ? 'bg-[#131f24] hover:bg-[#1b2b34] border border-[#37464f] text-emerald-400 active:scale-95 active:duration-75'
                          : 'bg-[#58cc02] border-b-4 border-[#46a302] text-black active:translate-y-1 active:border-b-0'
                      } font-extrabold py-3 px-4 rounded-xl text-[11px] uppercase cursor-pointer select-none transition-all text-center flex items-center justify-center gap-1.5`}
                    >
                      {isCompleted ? <Check className="w-3.5 h-3.5 text-emerald-400 stroke-[3.5]" /> : <Play className="w-3.5 h-3.5 fill-black stroke-none" />}
                      {isCompleted ? (isEnglish ? 'Review again' : 'Luyện tập lại') : isEnglish ? 'Start now' : 'Học ngay'}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}

        {viewType === 'topic' && isTopicsLoading && topicCards.length === 0 && (
          <div className="col-span-full bg-[#14252f] rounded-[24px] border border-[#202f36] p-6 text-center text-sm text-gray-300">
            {isEnglish ? 'Loading topic list from backend...' : 'Đang tải danh sách chủ đề từ backend...'}
          </div>
        )}

        {viewType === 'topic' && topicCards.length === 0 && !isTopicsLoading && (
          <div className="col-span-full bg-[#14252f] rounded-[24px] border border-[#202f36] p-6 text-center text-sm text-gray-300">
            {isEnglish ? 'No backend topics yet. Showing fallback lesson data below.' : 'Chưa có chủ đề từ backend, đang dùng dữ liệu fallback bên dưới.'}
          </div>
        )}

        {!(viewType === 'topic' && topicCards.length > 0) &&
          filteredLessons.map((lesson) => {
            const isCompleted = lesson.completed;
            const isLocked = lesson.locked;
            const isChest = lesson.type === 'chest';
            const isTrophy = lesson.type === 'trophy';
            const emoji = getTopicEmoji(lesson.id);
            const bgGrad = getTopicColor(lesson.id);

            if (isChest || isTrophy) {
              return (
                <div
                  key={lesson.id}
                  className="bg-[#14252f] border-2 border-dashed border-[#37464f] rounded-[24px] p-6 flex flex-col items-center text-center justify-between shadow-lg relative min-h-[220px]"
                >
                  <div className="space-y-1.5 mt-2">
                    <div className={`w-14 h-14 rounded-full flex items-center justify-center text-white shadow-md bg-gradient-to-tr ${isTrophy ? 'from-amber-400 to-[#ff9600]' : 'from-emerald-400 to-teal-500'}`}>
                      {isTrophy ? <Trophy className="w-7 h-7" /> : <Gift className="w-7 h-7" />}
                    </div>
                    <h3 className="font-extrabold text-white text-sm tracking-wide pt-1 leading-snug">
                      {isEnglish ? lesson.title : lesson.vietnameseTitle}
                    </h3>
                    <p className="text-[10px] text-gray-400 px-4 leading-relaxed">
                      {isTrophy
                        ? isEnglish
                          ? 'Celebrate progress with a trophy reward and +100 XP bonus!'
                          : 'Nhiệm vụ vinh danh: nhận cúp tốt nghiệp học phần và +100 KN điểm thưởng!'
                        : isEnglish
                          ? 'A hidden reward chest from Sunny. Open it to get +50 XP right away.'
                          : 'Kho báu ẩn giấu chứa quà tặng của Mặt Trời Sunny. Mở ra để nhận ngay +50 KN quà tặng.'}
                    </p>
                  </div>

                  <button
                    onClick={() => onOpenChest(lesson.id)}
                    disabled={isLocked}
                    className={`mt-4 w-full min-h-[48px] py-2.5 rounded-xl font-black text-xs cursor-pointer transition-all border-b-4 select-none ${
                      isCompleted
                        ? 'bg-emerald-600/30 border-emerald-800 text-emerald-400 cursor-default border-b-0'
                        : isTrophy
                          ? 'bg-amber-400 border-amber-600 text-black active:translate-y-1 active:border-b-0'
                          : 'bg-emerald-500 border-emerald-700 text-white active:translate-y-1 active:border-b-0'
                    }`}
                  >
                    {isCompleted
                      ? isEnglish
                        ? 'Claimed ✓'
                        : 'Đã nhận ✓'
                      : isTrophy
                        ? isEnglish
                          ? 'Claim trophy +100 XP'
                          : 'Nhận cúp +100 KN'
                        : isEnglish
                          ? 'Open chest +50 XP'
                          : 'Mở rương +50 KN'}
                  </button>
                </div>
              );
            }

            return (
              <div
                key={lesson.id}
                className="bg-[#14252f] rounded-[24px] border border-[#202f36] shadow-xl overflow-hidden flex flex-col justify-between hover:border-[#37464f] transition-all group min-h-[268px] relative"
              >
                <div className={`p-4 bg-gradient-to-br ${bgGrad} text-white flex items-start justify-between relative`}>
                  <div className="space-y-0.5">
                    <span className="text-[9px] font-black tracking-widest text-[#0e2a53] block">
                      {viewType === 'topic'
                        ? isEnglish
                          ? 'Topic lesson 📚'
                          : 'Chủ đề học 📚'
                        : isEnglish
                          ? 'Alphabet lesson 🔤'
                          : 'Bài chữ cái 🔤'}
                    </span>
                    <h3 className="text-base font-black tracking-tight leading-tight">
                      {isEnglish ? lesson.title : lesson.vietnameseTitle}
                    </h3>
                    <span className="text-[10.5px] opacity-90 font-medium block">
                      {isEnglish ? lesson.vietnameseTitle : lesson.title}
                    </span>
                  </div>
                  <div className="text-3xl filter drop-shadow-md select-none transform group-hover:scale-110 transition-transform">{emoji}</div>
                </div>

                <div className="p-4 flex-1 flex flex-col justify-between space-y-4">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-[10.5px] font-bold text-gray-400">
                      <Award className="w-4 h-4 text-amber-400" />
                      <span>
                        {isEnglish ? 'Reward:' : 'Hoàn thành được:'} <strong className="text-[#58cc02]">+{lesson.points} {isEnglish ? 'XP' : 'KN'}</strong>
                      </span>
                    </div>

                    {lesson.questions.length > 0 && (
                      <div className="space-y-1 bg-black/15 p-2 rounded-xl border border-[#37464f]/20">
                        <div className="text-[9.5px] text-gray-500 font-extrabold uppercase tracking-wide">
                          {isEnglish ? 'Sample question:' : 'Ví dụ kiểm tra:'}
                        </div>
                        <div className="text-[11px] text-gray-300 font-medium leading-relaxed italic line-clamp-2">
                          “{isEnglish ? lesson.questions[0].prompt : lesson.questions[0].vietnamesePrompt || lesson.questions[0].prompt}”
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex gap-2.5 pt-2">
                    <button
                      onClick={() => {
                        playAppSound(400, 'sine', 0.05);
                        setTipsLessonId(lesson.id);
                        setShowTips(true);
                      }}
                      className="flex min-h-[48px] min-w-[48px] items-center justify-center p-3 bg-[#1f2d35]/50 border border-[#37464f] hover:bg-[#202f36] rounded-xl text-gray-300 hover:text-white transition active:scale-95 active:duration-75 cursor-pointer"
                      title={isEnglish ? 'Open vocabulary handbook' : 'Mở sổ tay từ vựng học'}
                    >
                      <BookOpen className="w-4 h-4" />
                    </button>

                    {isCompleted ? (
                      <button
                        onClick={() => onStartLesson(lesson.id)}
                        className="flex-1 min-h-[48px] bg-[#131f24] hover:bg-[#1b2b34] border border-[#37464f] text-emerald-400 font-bold py-3 px-4 rounded-xl text-[11px] uppercase cursor-pointer select-none transition-all active:scale-95 active:duration-75 text-center flex items-center justify-center gap-1"
                      >
                        <Check className="w-3.5 h-3.5 text-emerald-400 stroke-[3.5]" />
                        {isEnglish ? 'Review again' : 'Luyện tập lại'}
                      </button>
                    ) : isLocked ? (
                      <div className="flex-1 min-h-[48px] bg-[#1a2c38]/40 border border-[#202f36] text-gray-600 font-black py-3 px-4 rounded-xl text-[11px] uppercase select-none text-center flex items-center justify-center gap-1.5 cursor-not-allowed">
                        <Lock className="w-3.5 h-3.5 text-gray-600" />
                        {isEnglish ? 'Locked' : 'Đã khóa'}
                      </div>
                    ) : (
                      <button
                        onClick={() => onStartLesson(lesson.id)}
                        className="flex-1 min-h-[48px] bg-[#58cc02] border-b-4 border-[#46a302] text-black font-extrabold py-3 px-4 rounded-xl text-[11px] uppercase cursor-pointer select-none hover:brightness-110 active:translate-y-1 active:border-b-0 transition-all text-center flex items-center justify-center gap-1.5"
                      >
                        <Play className="w-3.5 h-3.5 fill-black stroke-none" />
                        {isEnglish ? `START NOW +${lesson.points} XP` : `HỌC NGAY +${lesson.points} KN`}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
      </div>

      <AnimatePresence>
        {showTips && (
          <div className="fixed inset-0 bg-black/85 flex items-center justify-center z-[1000] p-4 text-white font-sans">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-[#1f2d35] max-w-md w-full rounded-2xl border border-[#37464f] p-6 shadow-2xl relative space-y-4 font-sans"
            >
              <div className="flex items-center justify-between border-b border-[#37464f] pb-3">
                <h3 className="text-base font-black text-[#58cc02] flex items-center gap-2">
                  <BookOpen className="w-5 h-5 text-[#df52ff]" />
                  Sổ Tay Từ Vựng
                </h3>
                <span className="text-[10px] text-gray-400 capitalize bg-white/5 py-1 px-2.5 rounded-full border border-gray-400/10">
                  {lessons.find((lesson) => lesson.id === tipsLessonId)?.vietnameseTitle || 'Từ vựng'}
                </span>
              </div>

              <div className="space-y-4 text-xs">
                <p className="text-gray-300 leading-relaxed">
                  Lắng nghe cách phát âm chuẩn Mỹ dưới đây, bé hãy luyện đọc to nhiều lần nhé:
                </p>

                <div className="space-y-3 mt-4">
                  {handbookList.map((item) => (
                    <div key={item.en} className="bg-[#131f24] p-3.5 rounded-xl border border-[#37464f] flex items-center justify-between gap-3">
                      <div className="space-y-0.5">
                        <span className="font-extrabold text-[#1cb0f6] text-sm block">{item.en}</span>
                        <span className="text-[10.5px] text-gray-400 block">{item.phonics} • {item.vi}</span>
                      </div>
                      <button onClick={() => speakGuide(item.en)} className="p-2 hover:bg-[#202f36] rounded-xl text-[#58cc02] transition cursor-pointer">
                        <Volume2 className="w-5 h-5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <button
                onClick={() => setShowTips(false)}
                className="w-full bg-[#58cc02] border-b-4 border-[#46a302] text-black font-extrabold py-3.5 rounded-xl uppercase text-xs tracking-wider cursor-pointer hover:brightness-110 active:brightness-95 active:border-b-0 active:translate-y-1 transition-all mt-3"
              >
                Đã Hiểu, Cố Lên Con Yêu! 💪
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {flowTopicSlug && (
          <TopicLessonFlow
            topicSlug={flowTopicSlug}
            completedLessonsCount={flowCompletedCount}
            globalLang={globalLang}
            globalTheme={globalTheme}
            onStartLesson={(lessonId) => {
              setFlowTopicSlug(null);
              onStartLesson(lessonId);
            }}
            onClose={() => setFlowTopicSlug(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
