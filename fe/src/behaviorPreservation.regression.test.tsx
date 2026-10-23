/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Feature: responsive-speaking-ui, Task 13.2
// Behavior-preservation regression checks.
//
// Requirement 1 constrains this feature to presentation-only changes: state,
// fetch calls, XP/scoring, speech recognition/synthesis, session management and
// auth must behave exactly as before. The full existing `fe` Vitest suite
// (`vitest --run`) is expected to remain green unchanged as the primary
// behavior-preservation guard. This file adds focused regression assertions that
// the user-facing behavior hooks still fire and that the Mascot's animation
// state is independent of the responsive breakpoint:
//
//  - Mode switch (Call <-> Chat): rendering AiTalkTab (default Call mode), the
//    "Text chat" toggle switches to Chat mode (the chat input textbox appears)
//    and the "Hands-free call" toggle switches back (textbox disappears). The
//    mode-toggle handler fires and works unchanged (Req 4.6).
//  - Nav tab-switch: rendering Sidebar with an onTabChange spy, clicking a nav
//    item calls onTabChange exactly once with the correct tab id — the
//    tab-switch handler fires unchanged (Req 3.5).
//  - Mascot animation state classes unchanged across breakpoints: the idle
//    Mascot SVG (viewBox "0 0 60 60") className (including the idle animation
//    classes hover:scale-105 / transition-transform) is byte-for-byte identical
//    at 320 / 768 / 1280px — the animation state does not vary with viewport
//    width (Req 5.5).
//
// Requirements: 1.1, 1.2, 1.3, 3.5, 4.6, 5.5

import type React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

import AiTalkTab from './components/AiTalkTab';
import Sidebar from './components/Sidebar';
import type { AppState } from './types';

// Representative breakpoints spanning Mobile / Tablet / Desktop.
const BREAKPOINT_WIDTHS = [320, 768, 1280] as const;

function makeState(overrides: Partial<AppState> = {}): AppState {
  return {
    currentTab: 'speaking',
    viewMode: 'app',
    gems: 10,
    streak: 3,
    hearts: 5,
    xp: 0,
    selectedOutfitId: 'normal',
    outfits: [
      {
        id: 'normal',
        name: 'Sunny',
        vietnameseName: 'Mặt Trời',
        description: '',
        cost: 0,
        unlocked: true,
        color: '#ff9600',
        iconName: 'sun',
      },
    ],
    quests: [],
    lessons: [],
    leaderboard: [],
    activeLessonId: null,
    ...overrides,
  } as AppState;
}

function setViewportWidth(width: number): void {
  Object.defineProperty(window, 'innerWidth', {
    writable: true,
    configurable: true,
    value: width,
  });
  Object.defineProperty(document.documentElement, 'clientWidth', {
    writable: true,
    configurable: true,
    value: width,
  });
  window.dispatchEvent(new Event('resize'));
}

/** Find the Sunny mascot SVG (viewBox "0 0 60 60"; lucide icons use "0 0 24 24"). */
function getMascotSvg(container: HTMLElement): SVGSVGElement {
  const svgs = Array.from(container.querySelectorAll('svg')) as SVGSVGElement[];
  const mascot = svgs.find((svg) => svg.getAttribute('viewBox') === '0 0 60 60');
  if (!mascot) {
    throw new Error('Expected the Sunny mascot SVG (viewBox "0 0 60 60") to be rendered');
  }
  return mascot;
}

function renderTab(props: Partial<React.ComponentProps<typeof AiTalkTab>> = {}) {
  return render(
    <AiTalkTab
      state={makeState()}
      onUpdateStats={vi.fn()}
      currentUser={null}
      currentChild={null}
      globalLang="en"
      globalTheme="light"
      {...props}
    />,
  );
}

describe('Behavior Preservation Regression (Task 13.2)', () => {
  beforeEach(() => {
    localStorage.clear();

    // jsdom lacks ResizeObserver (constructed by the AudioVisualizer on mount).
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );

    // jsdom does not implement these layout/media APIs; stub them so rendering
    // the Speaking Screen never throws. None affect behavior under test.
    Element.prototype.scrollIntoView = vi.fn();
    HTMLCanvasElement.prototype.getContext = vi.fn(() => null) as any;

    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: vi.fn(() => Promise.resolve(null)) },
    });

    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: {
        getVoices: vi.fn(() => []),
        speak: vi.fn((utterance: any) => {
          utterance.onstart?.();
          utterance.onend?.();
        }),
        cancel: vi.fn(),
        onvoiceschanged: null,
      },
    });

    (window as any).SpeechSynthesisUtterance = class {
      text: string;
      lang = '';
      rate = 1;
      pitch = 1;
      voice: unknown = null;
      onstart: (() => void) | null = null;
      onend: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor(text: string) {
        this.text = text;
      }
    };

    const makeRecognition = () => ({
      continuous: false,
      lang: '',
      interimResults: false,
      maxAlternatives: 1,
      onstart: null,
      onresult: null,
      onerror: null,
      onend: null,
      start: vi.fn(),
      stop: vi.fn(),
      abort: vi.fn(),
    });
    (window as any).SpeechRecognition = vi.fn(makeRecognition);
    (window as any).webkitSpeechRecognition = (window as any).SpeechRecognition;

    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) => ({
        matches: false,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    );

    // No network: session calls are guarded by try/catch in the component.
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('network disabled in test'))));
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  // --- Mode switch (Call <-> Chat) handler fires unchanged (Req 4.6) ----------
  describe('mode-switch (Call <-> Chat) handler fires unchanged', () => {
    it('switches to Chat mode when the Text chat toggle is clicked and back to Call mode', () => {
      setViewportWidth(375);
      renderTab();

      // Default mode is Call: the hands-free Start-call control is present and
      // the chat input textbox is not rendered yet.
      expect(screen.getByRole('button', { name: /Start calling Sunny/i })).toBeInTheDocument();
      expect(screen.queryByRole('textbox')).toBeNull();

      // Click the "Text chat" toggle -> Chat mode: the input textbox appears.
      fireEvent.click(screen.getByRole('button', { name: /Text chat/i }));
      const chatInput = screen.getByRole('textbox');
      expect(chatInput).toBeInTheDocument();
      expect(chatInput).toHaveAttribute(
        'placeholder',
        expect.stringMatching(/Type the child/i),
      );
      // Chat mode no longer shows the call Start button.
      expect(screen.queryByRole('button', { name: /Start calling Sunny/i })).toBeNull();

      // Click the "Hands-free call" toggle -> back to Call mode: textbox gone,
      // Start-call control restored. The mode handler works unchanged.
      fireEvent.click(screen.getByRole('button', { name: /Hands-free call/i }));
      expect(screen.queryByRole('textbox')).toBeNull();
      expect(screen.getByRole('button', { name: /Start calling Sunny/i })).toBeInTheDocument();
    });
  });

  // --- Nav tab-switch handler fires unchanged (Req 3.5) -----------------------
  describe('Sidebar nav tab-switch handler fires unchanged', () => {
    function renderSidebar(onTabChange: (tab: string) => void, mode: 'parent' | 'child') {
      return render(
        <Sidebar
          state={makeState({ currentTab: 'hoc' })}
          onTabChange={onTabChange}
          globalLang="en"
          globalTheme="light"
          onToggleTheme={vi.fn()}
          onToggleLang={vi.fn()}
          currentUser={null}
          onLogout={vi.fn()}
          mode={mode}
        />,
      );
    }

    const NAV_CASES: Array<{ label: RegExp; id: string }> = [
      { label: /lessons/i, id: 'hoc' },
      { label: /alphabet/i, id: 'chucai' },
      { label: /profile/i, id: 'hosor' },
      { label: /settings/i, id: 'cauhinh' },
    ];

    for (const { label, id } of NAV_CASES) {
      it(`calls onTabChange exactly once with "${id}" when the ${label.source} nav item is clicked`, () => {
        const onTabChange = vi.fn();
        const mode = id === 'hoc' || id === 'chucai' ? 'child' : 'parent';
        const { container } = renderSidebar(onTabChange, mode);

        const nav = container.querySelector('nav');
        expect(nav).not.toBeNull();

        const navItem = within(nav as HTMLElement).getByText(label).closest('button');
        expect(navItem).not.toBeNull();

        fireEvent.click(navItem as HTMLButtonElement);

        expect(onTabChange).toHaveBeenCalledTimes(1);
        expect(onTabChange).toHaveBeenCalledWith(id);
      });
    }
  });

  // --- Mascot animation state classes unchanged across breakpoints (Req 5.5) --
  describe('Mascot idle animation classes are unchanged across breakpoints', () => {
    it('renders the idle Mascot with identical animation/size classes at 320 / 768 / 1280px', () => {
      const classNamesByWidth = BREAKPOINT_WIDTHS.map((width) => {
        setViewportWidth(width);
        const { container, unmount } = renderTab();
        const cls = getMascotSvg(container).getAttribute('class') || '';
        unmount();
        return cls;
      });

      // The idle animation classes are present at every breakpoint.
      for (const cls of classNamesByWidth) {
        expect(cls).toContain('hover:scale-105'); // idle-state animation class
        expect(cls).toContain('transition-transform');
      }

      // The full class string is byte-for-byte identical across all breakpoints:
      // the Mascot's animation state never varies with viewport width.
      const [first, ...rest] = classNamesByWidth;
      for (const cls of rest) {
        expect(cls).toBe(first);
      }
    });
  });
});
