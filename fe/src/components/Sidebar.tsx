import React from 'react';
import { History, Home, LogIn, LogOut, Moon, Settings, Sun, Type, User, Gamepad2, Drama } from 'lucide-react';

import { AppState } from '../types';

interface SidebarProps {
  state: AppState;
  onTabChange: (tab: string) => void;
  globalLang: 'en' | 'vi';
  globalTheme: 'dark' | 'light';
  onToggleTheme: () => void;
  onToggleLang: () => void;
  currentUser: { name: string; email: string } | null;
  currentChild?: { id: string; name: string; experiencePoints?: number; streakDays?: number } | null;
  onLogout: () => void;
  mode?: 'parent' | 'child';
  unmasteredCount?: number;
  hideBottomNav?: boolean;
}

export default function Sidebar({
  state,
  onTabChange,
  globalLang,
  globalTheme,
  onToggleTheme,
  onToggleLang,
  currentUser,
  currentChild = null,
  onLogout,
  mode = 'parent',
  unmasteredCount = 0,
  hideBottomNav = false,
}: SidebarProps) {
  const isLight = globalTheme === 'light';

  const navItems = mode === 'child'
    ? [
        { id: 'hoc', labelVi: 'học', labelEn: 'lessons', icon: Home, color: 'text-sky-400' },
        { id: 'chucai', labelVi: 'chữ cái', labelEn: 'alphabet', icon: Type, color: 'text-violet-400' },
        { id: 'nhapvai', labelVi: 'nhập vai', labelEn: 'role-play', icon: Drama, color: 'text-emerald-400' },
        { id: 'trochoi', labelVi: 'trò chơi', labelEn: 'games', icon: Gamepad2, color: 'text-amber-400' },
        { id: 'lichsu', labelVi: 'lịch sử', labelEn: 'history', icon: History, color: 'text-rose-400' },
      ]
    : [
        { id: 'childlogin', labelVi: 'đăng nhập cho bé', labelEn: 'child login', icon: LogIn, color: 'text-emerald-400' },
        { id: 'hosor', labelVi: 'hồ sơ', labelEn: 'profile', icon: User, color: 'text-violet-400' },
        { id: 'cauhinh', labelVi: 'cài đặt', labelEn: 'settings', icon: Settings, color: 'text-amber-400' },
      ];

  return (
    <div
      className="[--nav-height:64px] md:[--nav-height:0px] w-full flex flex-row flex-wrap items-center justify-between transition-colors duration-300 sticky top-0 z-[100] md:bg-transparent md:border-b-0 md:backdrop-blur-none md:flex-col md:w-64 md:h-dvh md:max-h-dvh md:sticky md:top-0 md:space-y-3 md:p-5 md:items-stretch md:z-auto text-[var(--app-text)]"
    >
      <div className="w-full mb-0 flex items-center justify-between gap-2 px-4 py-3 bg-[var(--app-surface)] backdrop-blur-md border-b border-[var(--app-border-soft)] md:bg-transparent md:border-b md:border-white/[0.08] md:backdrop-blur-none">
        <div className="flex items-center gap-1">
          <span className="select-none bg-gradient-to-r from-[var(--app-accent-blue)] via-[var(--app-accent-purple)] to-[var(--app-accent-green)] bg-clip-text text-3xl font-extrabold lowercase tracking-tight text-transparent">
            speakjoy
          </span>
          <span className="rounded bg-[var(--app-accent-purple)] px-1.5 py-0.5 font-sans text-[10px] font-bold text-white">
            Kids VN
          </span>
        </div>

        <div className="flex md:hidden items-center gap-2">
          <div className="flex items-center gap-1">
            <button
              onClick={onToggleTheme}
              className={`flex h-8 w-8 touch-target tap-feedback cursor-pointer items-center justify-center rounded-[12px] border transition-all duration-200 active:scale-95 ${isLight ? 'border-amber-200 bg-amber-50 text-amber-600 shadow-sm hover:-translate-y-0.5 hover:bg-amber-100' : 'bg-slate-800 text-slate-300'}`}
            >
              {isLight ? <Moon size={16} /> : <Sun size={16} />}
            </button>

            <button
              onClick={onToggleLang}
              className={`flex h-8 w-8 touch-target tap-feedback cursor-pointer items-center justify-center rounded-[12px] border font-black uppercase text-[10px] transition-all duration-200 active:scale-95 ${isLight ? 'border-sky-200 bg-sky-50 text-sky-600 shadow-sm hover:-translate-y-0.5 hover:bg-sky-100' : 'bg-slate-800 text-slate-300'}`}
            >
              {globalLang}
            </button>
          </div>

          {currentUser && (
            <button
              onClick={onLogout}
              className={`ml-1 flex h-8 w-8 touch-target tap-feedback cursor-pointer items-center justify-center rounded-[12px] border transition-all duration-200 active:scale-95 ${isLight ? 'border-rose-200 bg-rose-50 text-rose-600 shadow-sm hover:-translate-y-0.5 hover:bg-rose-100' : 'bg-rose-500/10 text-rose-400'}`}
            >
              <LogOut size={14} />
            </button>
          )}
        </div>
      </div>

      <nav className={`fixed bottom-0 left-0 w-full z-[200] flex flex-row justify-around border-t pb-[calc(0.5rem+env(safe-area-inset-bottom,0px))] sm:pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] pt-2 px-2 shadow-[0_-4px_20px_rgba(0,0,0,0.15)] md:relative md:z-auto md:w-full md:flex-col md:gap-5 md:mt-2 md:border-t-0 md:pb-0 md:pt-0 md:px-0 md:shadow-none transition-all duration-300 ${hideBottomNav ? 'translate-y-full opacity-0 pointer-events-none md:translate-y-0 md:opacity-100 md:pointer-events-auto' : 'translate-y-0 opacity-100'} ${isLight ? 'bg-white/35 border-white/20 backdrop-blur-md md:bg-transparent md:border-transparent md:backdrop-blur-none' : 'bg-black/35 border-white/10 backdrop-blur-md md:bg-transparent md:border-transparent md:backdrop-blur-none'}`}>
        {navItems.map((item) => {
          const isActive = state.currentTab === item.id;
          const Icon = item.icon;
          const label = globalLang === 'en' ? item.labelEn : item.labelVi;

          return (
            <span key={item.id} className="relative">
              <button
                onClick={() => onTabChange(item.id)}
                className={`flex flex-col md:flex-row touch-target tap-feedback flex-shrink-0 cursor-pointer select-none items-center gap-1 md:gap-3 rounded-[14px] border-b-[3px] md:border-b-4 px-3 py-2 md:px-4 md:py-4 font-sans text-xs font-bold uppercase tracking-wider transition-all active:scale-95 md:w-full ${isActive ? 'nav-item-active' : 'nav-item-inactive'}`}
              >
                <Icon
                  className={`h-6 w-6 md:h-6 md:w-6 flex-shrink-0 ${isActive ? (isLight ? '' : item.color) : (isLight ? '' : 'text-slate-500')}`}
                />
                <span className="hidden text-[10px] md:block md:text-[13px] md:font-extrabold">{label}</span>
              </button>
              {item.id === 'lichsu' && unmasteredCount > 0 && (
                <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[9px] font-black text-white animate-bounce z-10">
                  {unmasteredCount > 99 ? '99+' : unmasteredCount}
                </span>
              )}
            </span>
          );
        })}
      </nav>

      <div className="hidden md:mt-auto md:flex md:w-full md:flex-col md:gap-2">
        <div className="flex w-full items-center justify-between rounded-[18px] border-2 border-transparent py-1">
          <div className="flex items-center gap-3">
            <button
              onClick={onToggleTheme}
              className={`flex h-12 w-12 touch-target tap-feedback cursor-pointer items-center justify-center rounded-[18px] border transition-all duration-200 ease-out active:scale-95 hover:-translate-y-0.5 hover:shadow-md ${isLight ? 'border-amber-200 bg-amber-50 hover:bg-amber-100 text-amber-600 shadow-[0_8px_18px_rgba(251,191,36,0.18)]' : 'border-[#4b5563] bg-slate-800 hover:bg-slate-700 text-slate-300'}`}
              title={globalLang === 'en' ? 'Toggle Theme' : 'Đổi giao diện'}
            >
              {isLight ? <Moon size={20} /> : <Sun size={20} />}
            </button>

            <button
              onClick={onToggleLang}
              className={`flex h-12 w-12 touch-target tap-feedback cursor-pointer items-center justify-center rounded-[18px] border font-black uppercase transition-all duration-200 ease-out active:scale-95 hover:-translate-y-0.5 hover:shadow-md ${isLight ? 'border-sky-200 bg-sky-50 hover:bg-sky-100 text-sky-600 shadow-[0_8px_18px_rgba(56,189,248,0.16)]' : 'border-[#4b5563] bg-slate-800 hover:bg-slate-700 text-slate-300'}`}
              title={globalLang === 'en' ? 'Switch Language' : 'Đổi ngôn ngữ'}
            >
              {globalLang}
            </button>
          </div>

          {currentUser && (
            <button
              onClick={onLogout}
              className={`flex h-12 w-12 touch-target tap-feedback cursor-pointer items-center justify-center rounded-[18px] border transition-all duration-200 ease-out active:scale-95 hover:-translate-y-0.5 hover:shadow-md ${isLight ? 'border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100 shadow-[0_8px_18px_rgba(251,113,133,0.16)]' : 'border-red-500/20 bg-red-500/10 text-red-400 hover:bg-red-500/20'}`}
              title={globalLang === 'en' ? 'Sign out' : 'Đăng xuất'}
            >
              <LogOut size={18} />
            </button>
          )}
        </div>

        {mode === 'child' && currentChild && (
          <div className={`mt-1 rounded-[22px] border p-3 transition-all duration-300 ${isLight ? 'border-emerald-200 bg-white shadow-[0_12px_28px_rgba(16,185,129,0.10)]' : 'border-[#37464f] bg-[#131f24]'}`}>
            <div className={`text-center text-sm font-black uppercase tracking-wide ${isLight ? 'text-emerald-600' : 'text-emerald-400'}`}>
              {currentChild.name}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className={`rounded-[16px] border px-3 py-2 text-center transition-all duration-200 ${isLight ? 'border-amber-200 bg-amber-50 text-amber-700 shadow-[0_4px_12px_rgba(251,191,36,0.10)]' : 'border-amber-500/20 bg-amber-500/10 text-amber-300'}`}>
                <div className="text-base font-black">🔥 {currentChild.streakDays ?? state.streak}</div>
              </div>
              <div className={`rounded-[16px] border px-3 py-2 text-center transition-all duration-200 ${isLight ? 'border-cyan-200 bg-cyan-50 text-cyan-700 shadow-[0_4px_12px_rgba(56,189,248,0.10)]' : 'border-cyan-500/20 bg-cyan-500/10 text-cyan-300'}`}>
                <div className="text-base font-black">⚡ {currentChild.experiencePoints ?? state.xp}</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
