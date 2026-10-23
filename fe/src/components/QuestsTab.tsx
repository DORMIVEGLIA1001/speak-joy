import React from 'react';
import { Check, Sparkles, Target, Zap } from 'lucide-react';

import { playCoinSound } from '../data';
import { clampProgress } from '../lib/ui/presentation';
import { AppState } from '../types';

type ChildProfile = {
  id: string;
  name: string;
};

interface QuestsTabProps {
  state: AppState;
  onClaimReward: (questId: string, xpReward: number) => void;
  currentChild: ChildProfile | null;
  isLoading: boolean;
  globalLang: 'en' | 'vi';
}

export default function QuestsTab({ state, onClaimReward, currentChild, isLoading, globalLang }: QuestsTabProps) {
  const isEnglish = globalLang === 'en';

  const handleClaim = (questId: string, rewardXp: number) => {
    playCoinSound();
    onClaimReward(questId, rewardXp);
    alert(isEnglish ? 'Reward claimed successfully.' : 'Đã nhận thưởng thành công.');
  };

  return (
    <div className="space-y-6 rounded-[16px] border border-[var(--app-border,#f0ddc9)] border-b-4 bg-[var(--app-surface,#ffffff)] p-6 text-[var(--app-text,#2d3a4b)] shadow-2xl">
      <div className="flex items-center justify-between gap-4 border-b border-[var(--app-border,#f0ddc9)] pb-5">
        <div className="flex items-center gap-3">
          <Target className="h-8 w-8 text-[var(--color-duo-orange)]" />
          <div>
            <h2 className="readable-block text-xl font-bold tracking-tight md:text-2xl">
              {currentChild ? (isEnglish ? `${currentChild.name}'s missions` : `Nhiệm vụ của ${currentChild.name}`) : isEnglish ? 'Daily missions' : 'Nhiệm vụ hằng ngày'}
            </h2>

          </div>
        </div>
      </div>

      <div className="space-y-4">
        {state.quests.map((quest) => {
          const isCompleted = quest.completed;
          const isGoalMet = quest.current >= quest.target;
          const progressPct = clampProgress((quest.current / Math.max(quest.target, 1)) * 100);

          return (
            <div
              key={quest.id}
              className={`flex flex-col items-start justify-between gap-4 rounded-[16px] border border-b-4 p-4 transition sm:flex-row sm:items-center ${isCompleted
                  ? 'border-emerald-900/60 bg-emerald-950/20'
                  : isGoalMet
                    ? 'border-amber-600/60 bg-amber-950/20 ring-2 ring-amber-400/20'
                    : 'border-[var(--app-border,#f0ddc9)] bg-[var(--app-surface-alt,#fffdf8)]'
                }`}
            >
              <div className="flex w-full flex-1 items-center gap-3.5">
                <div
                  className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-[12px] text-lg font-bold ${isCompleted ? 'bg-[var(--app-accent-purple,#df52ff)] text-white' : isGoalMet ? 'bg-[var(--color-duo-orange)] text-black' : 'bg-[var(--app-surface-alt,#fffdf8)] text-[var(--color-duo-orange)]'
                    }`}
                >
                  {isCompleted ? <Check className="h-6 w-6 stroke-[3]" /> : '⚡'}
                </div>

                <div className="w-full flex-1 space-y-1.5">
                  <div className="flex items-center justify-between gap-3 text-xs">
                    <span className="text-sm font-bold tracking-tight text-[var(--app-text,#2d3a4b)]">{quest.title}</span>
                    <span className="font-mono font-semibold text-[var(--app-text-muted,#516072)]">
                      {quest.current}/{quest.target}
                    </span>
                  </div>

                  <div className="h-3.5 w-full overflow-hidden rounded-full border border-[var(--app-border,#f0ddc9)] bg-[var(--app-surface-alt,#fffdf8)]">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${isCompleted ? 'bg-[var(--app-accent-purple,#df52ff)]' : 'bg-gradient-to-r from-amber-400 to-[var(--color-duo-orange)]'}`}
                      style={{ width: `${progressPct}%` }}
                    />
                  </div>
                </div>
              </div>

              <div className="flex w-full items-center justify-between gap-4 border-t border-[var(--app-border-soft,#f6e7d8)] pt-3 sm:w-auto sm:justify-end sm:border-t-0 sm:pt-0">
                <div className="flex items-center gap-1 text-xs font-extrabold text-[var(--color-duo-yellow)]">
                  <Zap className="h-3.5 w-3.5 fill-[var(--color-duo-yellow)]" />
                  <span className="font-sans font-black">+{quest.rewardXp} XP</span>
                </div>

                {isCompleted ? (
                  <span className="rounded-[12px] bg-[var(--app-surface-alt,#fffdf8)] px-3.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-[var(--app-text-muted,#516072)]">
                    {isEnglish ? 'Claimed' : 'Đã nhận'}
                  </span>
                ) : isGoalMet ? (
                  <button
                    onClick={() => handleClaim(quest.id, quest.rewardXp)}
                    className="duo-btn-green min-h-[48px] cursor-pointer rounded-[12px] px-5 py-2 text-[10px] font-extrabold uppercase tracking-wider text-white"
                  >
                    {isEnglish ? 'Claim reward' : 'Nhận thưởng'}
                  </button>
                ) : (
                  <span className="rounded-[12px] border border-[var(--app-border,#f0ddc9)] bg-[var(--app-surface-alt,#fffdf8)] px-3.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-[var(--app-text-muted,#516072)]">
                    {isEnglish ? 'In progress' : 'Đang thực hiện'}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-3 rounded-[16px] border border-[var(--app-border,#f0ddc9)] border-b-4 bg-[var(--app-surface,#ffffff)] p-4">
        <Sparkles className="h-6 w-6 flex-shrink-0 text-amber-400" />
        <p className="text-left text-xs leading-relaxed text-[var(--app-text-muted,#516072)]">
          {isEnglish
            ? 'Missions are loaded from the backend. As more sessions and topic completions are recorded, this progress will follow the real child data.'
            : 'Nhiệm vụ được tải từ backend. Khi có thêm phiên học và chủ đề hoàn tất, tiến độ này sẽ bám theo dữ liệu thật của bé.'}
        </p>
      </div>
    </div>
  );
}
