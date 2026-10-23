import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, Volume2, X } from 'lucide-react';

type SessionRewardMascotProps = {
  isOpen: boolean;
  mouthCount: number;
  earnedXp: number;
  childName?: string | null;
  globalLang: 'en' | 'vi';
  globalTheme: 'dark' | 'light';
  onClose: () => void;
};

export default function SessionRewardMascot({
  isOpen,
  mouthCount,
  earnedXp,
  childName,
  globalLang,
  globalTheme,
  onClose,
}: SessionRewardMascotProps) {
  const isLight = globalTheme === 'light';

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 z-40 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm"
        >
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.96 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className={`relative w-full max-w-md overflow-hidden rounded-[28px] border border-b-4 p-6 shadow-2xl ${
              isLight
                ? 'border-[#f2d7aa] bg-[#fffaf0] text-slate-900'
                : 'border-[#37464f] bg-[#131f24] text-white'
            }`}
          >
            <button
              type="button"
              onClick={onClose}
              className={`absolute right-4 top-4 rounded-full border p-2 transition ${
                isLight
                  ? 'border-slate-200 bg-white text-slate-500 hover:text-slate-800'
                  : 'border-[#37464f] bg-[#1a2b32] text-slate-300 hover:text-white'
              }`}
              aria-label={globalLang === 'en' ? 'Close reward summary' : 'Đóng tổng kết phần thưởng'}
            >
              <X className="h-4 w-4" />
            </button>

            <div className="absolute inset-x-0 top-0 h-28 bg-[radial-gradient(circle_at_top,#ffd76a,transparent_65%)] opacity-80" />

            <div className="relative space-y-5">
              <div className="flex items-start gap-4">
                <div className="relative flex h-24 w-24 flex-shrink-0 items-center justify-center rounded-full bg-[#fff1b8] shadow-[0_16px_40px_rgba(255,200,0,0.28)]">
                  <div className="absolute inset-2 rounded-full bg-[#ffc800]" />
                  <div className="absolute inset-0 animate-pulse rounded-full bg-[#ffc800]/20" />
                  <div className="relative z-10 text-[2.5rem]">☀️</div>
                </div>

                <div className="space-y-2 pt-1">
                  <div className="inline-flex items-center gap-1 rounded-full bg-[#58cc02]/15 px-3 py-1 text-[10px] font-black uppercase tracking-[0.22em] text-[#58cc02]">
                    <Sparkles className="h-3.5 w-3.5" />
                    {globalLang === 'en' ? 'Session Summary' : 'Tổng Kết Phiên'}
                  </div>
                  <h3 className="text-2xl font-black tracking-tight">
                    {globalLang === 'en'
                      ? `Sunny cheered for ${childName || 'your child'}`
                      : `Sunny vừa cổ vũ ${childName || 'bé yêu'}`}
                  </h3>
                  <p className={`${isLight ? 'text-slate-600' : 'text-slate-300'} text-sm leading-relaxed`}>
                    {globalLang === 'en'
                      ? 'Every time your child speaks, the profile now stores real XP and mouth-count progress.'
                      : 'Mỗi lần bé mở miệng nói, hồ sơ giờ sẽ lưu lại XP thật và số lần luyện nói.'}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div
                  className={`rounded-[20px] border p-4 ${
                    isLight ? 'border-[#f0d7aa] bg-white' : 'border-[#37464f] bg-[#1a2b32]'
                  }`}
                >
                  <div className="mb-2 flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.18em] text-[#ff9600]">
                    <Volume2 className="h-4 w-4" />
                    {globalLang === 'en' ? 'Mouth opens' : 'Số lần nói'}
                  </div>
                  <div className="text-3xl font-black">{mouthCount}</div>
                </div>

                <div
                  className={`rounded-[20px] border p-4 ${
                    isLight ? 'border-[#d7ecbb] bg-white' : 'border-[#37464f] bg-[#1a2b32]'
                  }`}
                >
                  <div className="mb-2 flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.18em] text-[#58cc02]">
                    <Sparkles className="h-4 w-4" />
                    {globalLang === 'en' ? 'XP earned' : 'XP nhận được'}
                  </div>
                  <div className="text-3xl font-black text-[#58cc02]">+{earnedXp}</div>
                </div>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="w-full rounded-[18px] bg-[#58cc02] px-5 py-3 text-sm font-black uppercase tracking-[0.2em] text-white shadow-[0_10px_20px_rgba(88,204,2,0.25)] transition hover:brightness-110 active:scale-[0.99]"
              >
                {globalLang === 'en' ? 'Keep Learning' : 'Tiếp Tục Học'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
