import React from 'react';
import { Trophy, Lock, Medal, Star } from 'lucide-react';
import { AppState } from '../types';
import { resolveLang } from '../lib/ui/presentation';

interface LeaderboardTabProps {
  state: AppState;
  onStartFirstLesson: () => void;
  globalLang?: 'en' | 'vi';
}

export default function LeaderboardTab({ state, onStartFirstLesson, globalLang }: LeaderboardTabProps) {
  const isEnglish = resolveLang(globalLang) === 'en';
  const isUnlocked = state.lessons.some((lesson) => lesson.completed);
  const sortedUsers = state.leaderboard;
  return (
    <div className="bg-[var(--app-surface)] rounded-[16px] border border-[var(--app-border)] border-b-4 p-6 text-[var(--app-text)] space-y-6 shadow-2xl">
      <div className="flex items-center gap-3 border-b border-[var(--app-border)] pb-5">
        <Trophy className="w-8 h-8 text-yellow-500 fill-yellow-500 animate-pulse" />
        <div>
          <h2 className="readable-block text-xl font-bold tracking-tight md:text-2xl">
            {isEnglish ? 'Weekly Leaderboard Cup' : 'Cúp Bảng Xếp Hạng Tuần'}
          </h2>
          <p className="text-xs text-[var(--app-text-muted)]">
            {isEnglish
              ? 'Unicorn League: compete in learning with the brightest kids across Vietnam.'
              : 'Giải đấu Kỳ Lân: tranh tài học tập cùng các bé xuất sắc khắp Việt Nam.'}
          </p>
        </div>
      </div>

      {!isUnlocked ? (
        <div className="rounded-[16px] border border-[var(--app-border)] bg-[var(--app-bg-alt)] p-6 text-center space-y-4">
          <Lock className="w-10 h-10 mx-auto text-[var(--app-text-muted)]" />
          <h3 className="readable-block text-lg font-black md:text-xl">
            {isEnglish ? 'Leaderboard not unlocked yet' : 'Bảng xếp hạng chưa mở'}
          </h3>
          <p className="text-sm text-[var(--app-text-muted)] leading-relaxed">
            {isEnglish
              ? 'Complete the first lesson to unlock the league and put your name on the board of honor.'
              : 'Hãy hoàn thành bài học đầu tiên để mở khóa giải đấu và lưu tên của bé trên bảng vàng.'}
          </p>
          <button
            onClick={onStartFirstLesson}
            className="duo-btn-green text-white font-extrabold py-3 px-5 min-h-[56px] rounded-xl text-xs uppercase cursor-pointer"
          >
            {isEnglish ? 'Start the first lesson' : 'Bắt đầu bài học đầu tiên'}
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {sortedUsers.map((user, index) => (
            <div
              key={user.id}
              className={`flex items-center justify-between rounded-[16px] border px-4 py-3 ${
                user.isCurrentPlayer
                  ? 'bg-[var(--app-surface-alt)] border-[var(--app-accent-blue)]'
                  : 'bg-[var(--app-bg-alt)] border-[var(--app-border)]'
              }`}
            >
              <div className="flex items-center gap-3">
                {user.avatarUrl ? (
                  <img src={user.avatarUrl} alt={user.name} className="w-9 h-9 rounded-full object-cover" />
                ) : (
                  <div className="w-9 h-9 rounded-full flex items-center justify-center font-black text-sm" style={{ backgroundColor: user.avatarColor }}>
                    {index + 1}
                  </div>
                )}
                <div>
                  <div className="font-bold flex items-center gap-2">
                    <span>{user.name}</span>
                    {user.isCurrentPlayer && <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" />}
                  </div>
                  <div className="text-xs text-[var(--app-text-muted)]">
                    {isEnglish ? `Rank #${index + 1}` : `Hạng #${index + 1}`}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 text-amber-400 font-black">
                <Medal className="w-4 h-4" />
                <span>{user.score} XP</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
