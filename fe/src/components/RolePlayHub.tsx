import { useState, type ReactNode } from 'react';
import { ListChecks, Phone } from 'lucide-react';
import { AppState } from '../types';
import RolePlayTab from './RolePlayTab';
import RolePlayFreeTalk from './RolePlayFreeTalk';

interface RolePlayHubProps {
  state: AppState;
  onUpdateStats: (update: Partial<AppState>) => void;
  currentChild?: { id: string; name: string; age?: number } | null;
  globalLang: 'en' | 'vi';
  globalTheme: 'dark' | 'light';
  onActiveSessionChange?: (isActive: boolean) => void;
}

type Mode = 'choose' | 'freetalk';

export default function RolePlayHub({
  state,
  onUpdateStats,
  currentChild,
  globalLang,
  globalTheme,
  onActiveSessionChange,
}: RolePlayHubProps) {
  const isLight = globalTheme === 'light';
  const t = (en: string, vi: string) => (globalLang === 'en' ? en : vi);
  const [mode, setMode] = useState<Mode>('choose');

  const tab = (id: Mode, icon: ReactNode, label: string) => {
    const active = mode === id;
    return (
      <button
        onClick={() => setMode(id)}
        className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-black transition-all ${
          active
            ? 'bg-sky-500 text-white shadow'
            : isLight
              ? 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              : 'bg-white/5 text-slate-300 hover:bg-white/10'
        }`}
      >
        {icon}
        {label}
      </button>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        {tab('choose', <ListChecks size={14} />, t('Pick an answer', 'Chọn đáp án'))}
        {tab('freetalk', <Phone size={14} />, t('Free talk', 'Nói tự do'))}
      </div>

      {mode === 'choose' ? (
        <RolePlayTab
          state={state}
          onUpdateStats={onUpdateStats}
          currentChild={currentChild}
          globalLang={globalLang}
          globalTheme={globalTheme}
          onActiveSessionChange={onActiveSessionChange}
        />
      ) : (
        <RolePlayFreeTalk
          state={state}
          onUpdateStats={onUpdateStats}
          currentChild={currentChild}
          globalLang={globalLang}
          globalTheme={globalTheme}
          onActiveSessionChange={onActiveSessionChange}
        />
      )}
    </div>
  );
}
