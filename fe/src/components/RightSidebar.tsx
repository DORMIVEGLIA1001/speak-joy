import React from 'react';
import { Flame, Heart } from 'lucide-react';

import { AppState } from '../types';

type AuthenticatedUser = {
  id: string;
  name: string;
  email: string;
};

type ChildProfile = {
  id: string;
  name: string;
  streakDays: number;
};

interface RightSidebarProps {
  state: AppState;
  onTabChange: (tab: string) => void;
  onOpenAuth: (type: 'signup' | 'login') => void;
  globalLang: 'en' | 'vi';
  currentUser: AuthenticatedUser | null;
  currentChild: ChildProfile | null;
  isLoadingChild: boolean;
}

export default function RightSidebar({
  state,
  onTabChange,
  onOpenAuth,
  globalLang,
  currentUser,
}: RightSidebarProps) {
  const primaryQuest = state.quests[0] || {
    current: 0,
    target: 1,
    completed: false,
    title: 'Daily mission',
  };

  const questPercent = Math.min(100, (primaryQuest.current / Math.max(primaryQuest.target, 1)) * 100);
  const isEn = globalLang === 'en';

  return (
    <div className="w-full space-y-4 p-2 text-[var(--app-text,#2d3a4b)] lg:w-96">
      <div className="flex items-center justify-between rounded-[16px] border border-[var(--app-border,#f0ddc9)] border-b-4 bg-[var(--app-surface,#ffffff)] px-4 py-3 shadow-md">
        <div className="flex items-center gap-1" title={isEn ? 'American English' : 'Tiếng Anh Mỹ'}>
          <span className="text-xl">US</span>
          <span className="text-[11px] font-bold text-[var(--app-text-muted,#516072)]">USA</span>
        </div>

        <div className="flex items-center gap-1 border-l border-[var(--app-border,#f0ddc9)] pl-3" title={isEn ? 'Daily streak' : 'Chuỗi học'}>
          <Flame className={`h-4 w-4 ${state.streak > 0 ? 'fill-[var(--color-duo-orange)] text-[var(--color-duo-orange)]' : 'text-[var(--app-text-muted,#516072)]'}`} />
          <span className="text-xs font-extrabold tracking-tight">{state.streak}</span>
        </div>

        <div className="flex items-center gap-1 border-l border-[var(--app-border,#f0ddc9)] pl-3" title={isEn ? 'Hearts / Energy' : 'Năng lượng'}>
          <Heart className="h-4 w-4 fill-[var(--color-duo-red)] text-[var(--color-duo-red)]" />
          <span className="text-xs font-extrabold tracking-tight text-[var(--color-duo-red)]">
            {state.hearts} / 5
          </span>
        </div>
      </div>

      <div className="space-y-3 rounded-[16px] border border-[var(--app-border,#f0ddc9)] border-b-4 bg-[var(--app-surface,#ffffff)] p-5 shadow-md">
        <div className="flex items-center justify-between">
          <h3 className="text-[15px] font-bold tracking-wide text-[var(--app-text,#2d3a4b)]">
            {isEn ? 'Daily quests' : 'Nhiệm vụ hằng ngày'}
          </h3>
          <button
            onClick={() => onTabChange('nhiemvu')}
            className="min-h-[48px] cursor-pointer rounded-[12px] px-2 text-xs font-bold uppercase tracking-wide text-[var(--app-accent-blue,#1cb0f6)] transition hover:underline active:scale-95"
          >
            {isEn ? 'View all' : 'Xem tất cả'}
          </button>
        </div>

        <div className="flex items-center gap-3">
          <div className="rounded-[12px] border border-[var(--app-border-soft,#f6e7d8)] bg-[var(--app-surface-alt,#fffdf8)] p-2.5 text-3xl">⚡</div>
          <div className="flex-1 space-y-1.5">
            <div className="flex items-center justify-between gap-3 text-xs">
              <span className="line-clamp-2 font-medium text-[var(--app-text-muted,#516072)]">{primaryQuest.title}</span>
              <span className="font-mono text-[var(--app-text-muted,#516072)]">
                {primaryQuest.current}/{primaryQuest.target}
              </span>
            </div>

            <div className="relative h-4 w-full overflow-hidden rounded-full border border-[var(--app-border,#f0ddc9)] bg-[var(--app-surface-alt,#fffdf8)]">
              <div
                className="h-full rounded-full bg-gradient-to-r from-amber-400 to-[var(--color-duo-orange)] transition-all duration-500"
                style={{ width: `${questPercent}%` }}
              />
              <div className="absolute right-1 top-1/2 -translate-y-1/2 text-xs">
                {primaryQuest.completed ? '✓' : '🎁'}
              </div>
            </div>
          </div>
        </div>
      </div>

      {!currentUser && (
        <div className="space-y-4 rounded-[16px] border border-[var(--app-border,#f0ddc9)] border-b-4 bg-[var(--app-surface,#ffffff)] p-5 shadow-md">
          <div className="space-y-1 text-center">
            <h3 className="text-base font-bold text-[var(--app-text,#2d3a4b)]">
              {isEn ? 'Save your progress!' : 'Lưu giữ tiến trình học!'}
            </h3>
            <p className="text-xs leading-relaxed text-[var(--app-text-muted,#516072)]">
              {isEn
                ? 'Create a parent account first, then save the child profile to backend.'
                : 'Đăng nhập tài khoản phụ huynh trước, sau đó lưu hồ sơ của bé vào backend.'}
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <button
              onClick={() => onOpenAuth('signup')}
              className="duo-btn-green min-h-[58px] w-full cursor-pointer rounded-[12px] py-3 text-sm font-extrabold uppercase tracking-wider text-white hover:brightness-110 active:brightness-95"
              id="btn-register-sidebar"
            >
              {isEn ? 'Create profile' : 'Tạo hồ sơ'}
            </button>

            <button
              onClick={() => onOpenAuth('login')}
              className="duo-btn-blue min-h-[48px] w-full cursor-pointer rounded-[12px] py-3 text-xs font-extrabold uppercase tracking-wider text-white hover:brightness-110 active:brightness-95"
              id="btn-login-sidebar"
            >
              {isEn ? 'Sign in' : 'Đăng nhập'}
            </button>
          </div>
        </div>
      )}

      <div className="space-y-1 rounded-[16px] border border-[var(--app-border,#f0ddc9)] border-b-4 bg-[var(--app-surface,#ffffff)] p-4 text-center shadow-md">
        <span className="block text-xs font-bold uppercase tracking-wider text-[var(--app-accent-purple,#df52ff)]">
          {isEn ? 'Beta version' : 'Phiên bản thử nghiệm'}
        </span>
        <p className="text-[10px] text-[var(--app-text-muted,#516072)]">
          SpeakJoy v1.0.0-Beta • {isEn ? 'Production-safe proxy auth flow enabled' : 'Đã bật luồng proxy auth an toàn cho production'}
        </p>
      </div>
    </div>
  );
}
