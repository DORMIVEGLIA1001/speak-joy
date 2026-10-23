import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

import App from './App';

describe('App session restoration', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('does not flash sign-in or create-child screens while auth is unresolved', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => undefined)));

    render(<App />);

    expect(screen.getByRole('status', { name: 'Opening SpeakJoy' })).toBeInTheDocument();
    expect(screen.queryByText('Sign in to unlock the learning app')).toBeNull();
    expect(screen.queryByText('Create your first child profile')).toBeNull();
  });

  it('opens lessons directly after restoring an authenticated child session', async () => {
    const child = {
      id: 'child-1', parentId: 'parent-1', name: 'Mia', age: 8, level: 'starter', status: 'active',
      sessionsCompleted: 0, latestScore: 0, topicsCompleted: 0, streakDays: 0,
      weeklyGoal: 3, weeklyCompleted: 0, totalMinutes: 0, badgesEarned: 0,
      attendanceRate: 0, lastSessionAt: '', learningGoal: '', nextFocus: '',
    };

    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const body = url.includes('/api/auth/me')
        ? { user: { id: 'parent-1', name: 'Parent', email: 'parent@example.com' } }
        : url.includes('/api/child-auth/status')
          ? { active: true, child: { id: child.id, name: child.name, username: 'mia' } }
          : url.endsWith('/api/children')
            ? { children: [child] }
            : url.includes('/missions')
              ? { missions: [] }
              : url.includes('/topics')
                ? { topics: [] }
                : url.includes('/leaderboard')
                  ? { leaderboard: [] }
                  : {};
      return { ok: true, status: 200, json: async () => body } as Response;
    }));

    render(<App />);

    expect(await screen.findByRole('button', { name: /Start calling Sunny/i })).toBeInTheDocument();
    expect(screen.queryByText('Sign in to unlock the learning app')).toBeNull();
    expect(screen.queryByText('Create your first child profile')).toBeNull();
  });
});
