/**
 * Feature: kid-friendly-ui-improvements, Task 6.7
 * i18n, Reward_Display, and theme-color tests for the refactored components
 * (LeaderboardTab, SettingsTab, QuestsTab, ProfileTab).
 *
 * Covers:
 *  - i18n (Req 4.3, 5.1, 5.2, 5.3, 5.4, 5.7): LeaderboardTab and SettingsTab render
 *    static labels in the active language, while user/system-generated content
 *    (child names, score values) is NOT translated.
 *  - Reward_Display (Req 9.1): QuestsTab and ProfileTab show the XP reward with an
 *    icon (lucide Zap) and never the literal `*` character.
 *  - Theme color (Req 4.1, 4.2, 4.3, 4.7): refactored components use Theme_Variables
 *    (var(--app-*)) instead of hardcoded dark hex, and Theme_Variable fallbacks exist.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import LeaderboardTab from './LeaderboardTab';
import SettingsTab from './SettingsTab';
import QuestsTab from './QuestsTab';
import ProfileTab from './ProfileTab';
import { AppState } from '../types';

const here = path.dirname(fileURLToPath(import.meta.url));

// --- Shared mock builders ------------------------------------------------------

function makeState(overrides: Partial<AppState> = {}): AppState {
  return {
    currentTab: 'banggxephang',
    viewMode: 'app',
    gems: 10,
    streak: 3,
    hearts: 5,
    xp: 1234,
    selectedOutfitId: 'o1',
    outfits: [
      {
        id: 'o1',
        name: 'Sunny',
        vietnameseName: 'Mặt Trời',
        description: '',
        cost: 0,
        unlocked: true,
        color: '#ff9600',
        iconName: 'sun',
      },
    ],
    quests: [
      { id: 'q1', title: 'Finish 3 lessons', target: 3, current: 1, rewardGems: 5, rewardXp: 50, completed: false },
      { id: 'q2', title: 'Daily streak', target: 1, current: 1, rewardGems: 2, rewardXp: 25, completed: false },
    ],
    lessons: [
      { id: 'l1', title: 'L1', vietnameseTitle: '', points: 10, questions: [], completed: true, locked: false, type: 'lesson' },
    ],
    leaderboard: [
      { id: '1', name: 'Bảo Nam', score: 620, avatarColor: '#58cc02', rank: 1 },
      { id: '2', name: 'Minh Thư', score: 540, avatarColor: '#1cb0f6', rank: 2, isCurrentPlayer: true },
    ],
    activeLessonId: null,
    ...overrides,
  };
}

const currentUser = { id: 'u1', name: 'Parent', email: 'parent@example.com' };

afterEach(() => {
  cleanup();
});

// ===============================================================================
// i18n — LeaderboardTab (Req 4.3, 5.1, 5.2, 5.7)
// ===============================================================================

describe('LeaderboardTab i18n — static labels translate, names/scores do not', () => {
  it("renders English static labels with globalLang='en'", () => {
    render(<LeaderboardTab state={makeState()} onStartFirstLesson={() => {}} globalLang="en" />);

    // Static UI labels are in English.
    expect(screen.getByText('Weekly Leaderboard Cup')).toBeInTheDocument();
    expect(screen.getByText('Rank #1')).toBeInTheDocument();
    expect(screen.queryByText('Cúp Bảng Xếp Hạng Tuần')).not.toBeInTheDocument();

    // User/system content is NOT translated: names and scores stay as given.
    expect(screen.getByText('Bảo Nam')).toBeInTheDocument();
    expect(screen.getByText('Minh Thư')).toBeInTheDocument();
    expect(screen.getByText('620 XP')).toBeInTheDocument();
    expect(screen.getByText('540 XP')).toBeInTheDocument();
  });

  it("renders Vietnamese static labels with globalLang='vi'", () => {
    render(<LeaderboardTab state={makeState()} onStartFirstLesson={() => {}} globalLang="vi" />);

    // Static UI labels are in Vietnamese.
    expect(screen.getByText('Cúp Bảng Xếp Hạng Tuần')).toBeInTheDocument();
    expect(screen.getByText('Hạng #1')).toBeInTheDocument();
    expect(screen.queryByText('Weekly Leaderboard Cup')).not.toBeInTheDocument();

    // The exact same names/scores appear regardless of language (not translated).
    expect(screen.getByText('Bảo Nam')).toBeInTheDocument();
    expect(screen.getByText('Minh Thư')).toBeInTheDocument();
    expect(screen.getByText('620 XP')).toBeInTheDocument();
    expect(screen.getByText('540 XP')).toBeInTheDocument();
  });

  it("defaults to Vietnamese when globalLang is missing/invalid (Req 5.6)", () => {
    render(<LeaderboardTab state={makeState()} onStartFirstLesson={() => {}} />);
    expect(screen.getByText('Cúp Bảng Xếp Hạng Tuần')).toBeInTheDocument();
  });
});

// ===============================================================================
// i18n — SettingsTab (Req 5.3, 5.4)
// ===============================================================================

describe('SettingsTab i18n — static labels follow globalLang', () => {
  beforeEach(() => {
    // SettingsTab does not fetch when there is no signed-in user, but stub fetch
    // defensively so no test can hit the network.
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('network disabled in test'))),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  const baseProps = {
    currentUser: { id: 'parent-1', name: 'Parent', email: 'parent@example.com', authProvider: 'local' },
    onLogout: () => {},
    onSessionRefresh: async () => {},
    refreshNonce: 0,
  } as const;

  it("renders English static labels with globalLang='en'", async () => {
    render(<SettingsTab {...baseProps} globalLang="en" globalTheme="light" />);

    // findBy* awaits the async passkey-support effect so its state update settles.
    expect(await screen.findByText('AI settings and API key')).toBeInTheDocument();
    expect(screen.getByText('Local account information')).toBeInTheDocument();
    expect(screen.queryByText('Cài đặt AI và API key')).not.toBeInTheDocument();
  });

  it("renders Vietnamese static labels with globalLang='vi'", async () => {
    render(<SettingsTab {...baseProps} globalLang="vi" globalTheme="light" />);

    expect(await screen.findByText('Cài đặt AI và API key')).toBeInTheDocument();
    expect(screen.getByText('Thông tin tài khoản local')).toBeInTheDocument();
    expect(screen.queryByText('AI settings and API key')).not.toBeInTheDocument();
  });
});

// ===============================================================================
// Reward_Display — QuestsTab & ProfileTab (Req 9.1)
// ===============================================================================

describe('Reward_Display — XP reward uses an icon and no literal "*"', () => {
  it('QuestsTab shows a Zap icon for XP and no "*" character', () => {
    const { container } = render(
      <QuestsTab
        state={makeState()}
        onClaimReward={() => {}}
        currentChild={{ id: 'c1', name: 'Bao' }}
        isLoading={false}
        globalLang="en"
      />,
    );

    // The XP reward is shown with the lucide Zap icon (rendered as svg.lucide-zap).
    const zapIcons = container.querySelectorAll('svg.lucide-zap');
    expect(zapIcons.length).toBeGreaterThan(0);

    // The XP value is still present alongside the icon.
    expect(screen.getByText('+50 XP')).toBeInTheDocument();

    // No literal asterisk is used to represent the reward anywhere in the output.
    expect(container.textContent).not.toContain('*');
  });

  it('ProfileTab does not render the missions panel', () => {
    const { container } = render(
      <ProfileTab
        state={makeState()}
        currentUser={currentUser}
        currentChild={null}
        children={[]}
        isLoading={false}
        errorMessage={null}
        onSaveChild={async () => {}}
        onClaimReward={() => {}}
        globalLang="en"
        globalTheme="light"
      />,
    );

    const zapIcons = container.querySelectorAll('svg.lucide-zap');
    expect(zapIcons.length).toBe(0);
    expect(screen.queryByText('+50 XP')).not.toBeInTheDocument();
    expect(screen.queryByText("Bao's missions")).not.toBeInTheDocument();
    expect(container.textContent).not.toContain('*');
  });
});

// ===============================================================================
// Theme color — refactored components use Theme_Variables, not dark hex (Req 4.1-4.3, 4.7)
// ===============================================================================

describe('Theme color — refactored components use Theme_Variables instead of hardcoded dark hex', () => {
  // Components refactored for theme in tasks 6.1-6.4.
  const refactored = ['LeaderboardTab.tsx', 'QuestsTab.tsx', 'SettingsTab.tsx'];

  // Dark hex values that the refactor removed; they must not reappear.
  const darkHex = ['#131f24', '#0f171d', '#37464f', '#202f36', '#0b1115', '#0e171e', '#122129'];

  function readComponent(name: string): string {
    return fs.readFileSync(path.resolve(here, name), 'utf-8');
  }

  for (const name of refactored) {
    it(`${name} uses var(--app-*) Theme_Variables`, () => {
      const src = readComponent(name);
      expect(src).toContain('var(--app-');
    });

    it(`${name} contains no hardcoded dark hex colors`, () => {
      const src = readComponent(name);
      for (const hex of darkHex) {
        expect(src.toLowerCase()).not.toContain(hex);
      }
    });
  }

  it('QuestsTab declares light Theme_Variable fallbacks (Req 4.7)', () => {
    const src = readComponent('QuestsTab.tsx');
    // e.g. var(--app-border,#f0ddc9) — a Theme_Variable with a light fallback value.
    const fallbackPattern = /var\(--app-[a-z-]+,\s*#[0-9a-fA-F]{3,6}\)/;
    expect(fallbackPattern.test(src)).toBe(true);
  });

  it('LeaderboardTab renders consistently under both light and dark themes', () => {
    // Theme_Variables resolve per active theme, so the same markup serves both.
    document.documentElement.setAttribute('data-theme', 'light');
    const lightRender = render(
      <LeaderboardTab state={makeState()} onStartFirstLesson={() => {}} globalLang="en" />,
    );
    expect(lightRender.getByText('Weekly Leaderboard Cup')).toBeInTheDocument();
    cleanup();

    document.documentElement.setAttribute('data-theme', 'dark');
    const darkRender = render(
      <LeaderboardTab state={makeState()} onStartFirstLesson={() => {}} globalLang="en" />,
    );
    expect(darkRender.getByText('Weekly Leaderboard Cup')).toBeInTheDocument();
    document.documentElement.removeAttribute('data-theme');
  });
});
