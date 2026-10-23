/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Feature: responsive-speaking-ui, Task 13.1
// Timing / interaction tests for resize and orientation on the Speaking Screen
// (AiTalkTab.tsx) and the shared `useBreakpoint` hook.
//
// Using fake timers and simulated `resize` / `orientationchange` events, this
// file asserts the responsive timing budgets from the design's testing strategy:
//
//   - Layout re-flow within budget (Req 2.4, 4.7, 5.4, 8.5, 10.1, 10.3): after a
//     viewport-width change + resize/orientation event, `useBreakpoint` settles to
//     the new layout once the 150ms debounce window elapses — well within the
//     300–500ms budget — and does NOT update before the debounce window elapses
//     (no thrashing on partial advance).
//   - Tap feedback within 100ms (Req 6.4): interactive Speaking Screen controls
//     carry the `.tap-feedback` utility whose CSS transition duration (90ms in
//     index.css) lands within the 100ms feedback budget.
//   - Auto-scroll within 500ms (Req 7.3): in Chat Mode the auto-scroll-to-latest
//     effect calls `Element.prototype.scrollIntoView` synchronously after render,
//     well inside the 500ms budget.
//   - Primary control visible in landscape Mobile (Req 10.2): at a landscape mobile
//     viewport (667x375) the primary Start-call control is present as a >= 48x48px
//     `.touch-target` and the container uses viewport-aware (dvh/svh/clamp) heights
//     so it stays in view rather than being pushed below the fold.
//
// jsdom performs no real layout, so layout/timing intent expressed through Tailwind
// utility classes and CSS transitions is verified by className/CSS presence; the
// debounce timing is verified directly with fake timers. This file only renders the
// component and hook for measurement and does not modify them.
//
// Requirements: 2.4, 4.7, 5.4, 6.4, 7.3, 8.5, 10.1, 10.2, 10.3

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';

import AiTalkTab from './AiTalkTab';
import { useBreakpoint } from '../lib/ui/useBreakpoint';
import type { AppState } from '../types';

// The `useBreakpoint` debounce window (RESIZE_DEBOUNCE_MS) — kept in sync with the
// hook. It sits inside the 300–500ms re-flow budget (Req 2.4, 10.1, 10.3).
const DEBOUNCE_MS = 150;
const REFLOW_BUDGET_MS = 500;

/** Override the jsdom viewport so width/orientation changes are deterministic. */
function setViewport(width: number, height = 800): void {
  Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: width });
  Object.defineProperty(window, 'innerHeight', { writable: true, configurable: true, value: height });
  Object.defineProperty(document.documentElement, 'clientWidth', {
    writable: true,
    configurable: true,
    value: width,
  });
}

function fireResize(): void {
  window.dispatchEvent(new Event('resize'));
}

function fireOrientationChange(): void {
  window.dispatchEvent(new Event('orientationchange'));
}

function makeState(): AppState {
  return {
    currentTab: 'speaking',
    viewMode: 'app',
    gems: 0,
    streak: 0,
    hearts: 5,
    xp: 0,
    selectedOutfitId: 'normal',
    outfits: [],
    quests: [],
    lessons: [],
    leaderboard: [],
    activeLessonId: null,
  };
}

function renderTab() {
  return render(
    <AiTalkTab
      state={makeState()}
      onUpdateStats={vi.fn()}
      currentUser={null}
      currentChild={null}
      onProgressSync={vi.fn()}
      onUsageSync={vi.fn()}
      globalLang="en"
      globalTheme="dark"
    />,
  );
}

/** A `new`-constructable Web Speech API stand-in. No real audio is involved. */
class MockSpeechRecognition {
  continuous = false;
  lang = '';
  interimResults = false;
  maxAlternatives = 1;
  onstart: ((ev?: unknown) => void) | null = null;
  onresult: ((ev?: unknown) => void) | null = null;
  onerror: ((ev?: unknown) => void) | null = null;
  onend: ((ev?: unknown) => void) | null = null;
  start = vi.fn();
  abort = vi.fn();
  stop = vi.fn();
}

/** The outermost Speaking Screen container element. */
function getContainerRoot(container: HTMLElement): HTMLElement {
  const root = container.firstElementChild as HTMLElement | null;
  if (!root) {
    throw new Error('Expected the Speaking Screen container to be rendered');
  }
  return root;
}

// ---------------------------------------------------------------------------
// Layout re-flow within budget after resize / orientation change
// (Req 2.4, 4.7, 5.4, 8.5, 10.1, 10.3)
// ---------------------------------------------------------------------------
describe('layout re-flow within the responsive timing budget (Task 13.1)', () => {
  const originalInnerWidth = window.innerWidth;
  const originalMatchMedia = window.matchMedia;

  beforeEach(() => {
    // Exercise the debounced resize/orientation fallback path consistently:
    // jsdom does not implement matchMedia, so make sure it is absent.
    Reflect.deleteProperty(window, 'matchMedia');
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    setViewport(originalInnerWidth);
    if (originalMatchMedia) {
      window.matchMedia = originalMatchMedia;
    } else {
      Reflect.deleteProperty(window, 'matchMedia');
    }
  });

  it('settles to the new layout after a resize only once the debounce elapses (within budget)', () => {
    vi.useFakeTimers();
    setViewport(1280); // start desktop

    const { result } = renderHook(() => useBreakpoint());
    expect(result.current.layout).toBe('desktop');

    // Cross a breakpoint down to a mobile width and fire a resize.
    act(() => {
      setViewport(400);
      fireResize();
    });

    // Before the debounce window elapses the layout must NOT have changed yet
    // (debounce prevents thrashing on rapid bursts).
    act(() => {
      vi.advanceTimersByTime(DEBOUNCE_MS - 50);
    });
    expect(result.current.layout).toBe('desktop');

    // Once the full debounce window elapses, the new layout is applied — and the
    // debounce window is comfortably within the 300–500ms re-flow budget.
    act(() => {
      vi.advanceTimersByTime(50);
    });
    expect(result.current.layout).toBe('mobile');
    expect(result.current.width).toBe(400);
    expect(DEBOUNCE_MS).toBeLessThanOrEqual(REFLOW_BUDGET_MS);
  });

  it('re-flows after an orientation change within the budget', () => {
    vi.useFakeTimers();
    // Portrait mobile (tall + narrow).
    setViewport(375, 667);

    const { result } = renderHook(() => useBreakpoint());
    expect(result.current.layout).toBe('mobile');

    // Rotate to a landscape width that crosses into the tablet breakpoint.
    act(() => {
      setViewport(900, 375);
      fireOrientationChange();
    });

    // Not yet settled before the debounce window elapses.
    act(() => {
      vi.advanceTimersByTime(DEBOUNCE_MS - 1);
    });
    expect(result.current.layout).toBe('mobile');

    // Settled within the re-flow budget after the debounce completes.
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current.layout).toBe('tablet');
    expect(result.current.width).toBe(900);
  });

  it('debounces a burst of resize/orientation events into a single settled re-flow', () => {
    vi.useFakeTimers();
    setViewport(1280); // desktop

    const { result } = renderHook(() => useBreakpoint());
    expect(result.current.layout).toBe('desktop');

    // A rapid burst of intermediate widths, each within the debounce window.
    act(() => {
      setViewport(900);
      fireResize();
      vi.advanceTimersByTime(50);
      setViewport(600);
      fireOrientationChange();
      vi.advanceTimersByTime(50);
      setViewport(360);
      fireResize();
    });

    // No intermediate value settles while the timer keeps resetting.
    expect(result.current.layout).toBe('desktop');

    // Only the final width settles, one debounce window later.
    act(() => {
      vi.advanceTimersByTime(DEBOUNCE_MS);
    });
    expect(result.current.layout).toBe('mobile');
    expect(result.current.width).toBe(360);
  });
});

// ---------------------------------------------------------------------------
// Tap feedback within 100ms (Req 6.4) and auto-scroll within 500ms (Req 7.3),
// plus primary control visible in landscape Mobile (Req 10.2).
// ---------------------------------------------------------------------------
describe('Speaking Screen tap-feedback, auto-scroll, and landscape primary control (Task 13.1)', () => {
  // A stable reference to the auto-scroll spy. jsdom does not implement
  // `Element.prototype.scrollIntoView`, so we install our own fn and keep the
  // exact reference the component calls — re-reading the prototype later risks
  // observing a different fn if another file reassigned it.
  let scrollSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    localStorage.clear();
    // Auto-scroll-to-latest calls scrollIntoView, which jsdom does not implement.
    scrollSpy = vi.fn();
    Element.prototype.scrollIntoView = scrollSpy;
    // Defensive network stub — the Speaking Screen issues no fetch without a user.
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('network disabled in test'))),
    );
    // The inner AudioVisualizer relies on ResizeObserver.
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    (window as unknown as { SpeechRecognition: unknown }).SpeechRecognition = MockSpeechRecognition;
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    localStorage.clear();
    Reflect.deleteProperty(window, 'SpeechRecognition');
    // The spy was installed by raw assignment (jsdom lacks scrollIntoView), which
    // vi.restoreAllMocks cannot undo; remove it so it never leaks across files.
    Reflect.deleteProperty(Element.prototype, 'scrollIntoView');
  });

  // --- Tap feedback within 100ms (Req 6.4) ----------------------------------
  it('gives the primary control a .tap-feedback transition that lands within 100ms', () => {
    setViewport(375, 667);
    renderTab();

    const startButton = screen.getByRole('button', { name: /Start calling Sunny/i });
    // The `.tap-feedback` utility encodes the observable visual state change.
    expect(startButton.className).toContain('tap-feedback');
    expect(startButton.className).toContain('touch-target');

    // Inspect index.css: the `.tap-feedback` transition duration must be <= 100ms
    // so the visual change is observable within the tap-feedback budget.
    const cssPath = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'index.css');
    const css = readFileSync(cssPath, 'utf8');
    const tapBlockMatch = css.match(/\.tap-feedback\s*\{([^}]*)\}/);
    expect(tapBlockMatch).not.toBeNull();

    const durations = Array.from(
      (tapBlockMatch as RegExpMatchArray)[1].matchAll(/(\d+)ms/g),
      (m) => Number(m[1]),
    );
    expect(durations.length).toBeGreaterThan(0);
    for (const ms of durations) {
      expect(ms).toBeLessThanOrEqual(100);
    }
  });

  // --- Auto-scroll within 500ms (Req 7.3) -----------------------------------
  it('auto-scrolls the chat to the latest message synchronously (well within 500ms)', async () => {
    setViewport(375, 667);

    const { container } = renderTab();

    // Switch to Chat Mode so the scroll-to-latest anchor (chatBottomRef) mounts.
    fireEvent.click(screen.getByRole('button', { name: /Text chat/i }));

    scrollSpy.mockClear();

    // Adding a message changes the message list; the auto-scroll effect then runs
    // after the render commit — far inside the 500ms budget.
    const input = container.querySelector('input[type="text"]') as HTMLInputElement;
    expect(input).not.toBeNull();
    fireEvent.change(input, { target: { value: 'Hello Sunny' } });

    const sendButton = container.querySelector('button.bg-purple-600') as HTMLButtonElement;
    expect(sendButton).not.toBeNull();
    fireEvent.click(sendButton);

    // The optimistic user bubble is added before any await, so the effect fires.
    await screen.findByText('Hello Sunny');

    // The auto-scroll lives in a passive effect that flushes just after the commit;
    // wait for it so the assertion never races the effect (timing/order independent).
    await waitFor(() => expect(scrollSpy).toHaveBeenCalled());
    // The scroll-to-latest anchor uses smooth scrolling.
    expect(scrollSpy).toHaveBeenCalledWith(expect.objectContaining({ behavior: 'smooth' }));
  });

  // --- Primary control visible in landscape Mobile (Req 10.2) ---------------
  it('keeps the primary Start-call control visible in landscape Mobile (667x375)', () => {
    setViewport(667, 375); // landscape mobile: wide + short
    const { container } = renderTab();
    const root = getContainerRoot(container);

    // Viewport-aware (dvh/svh/clamp) heights keep the primary control in view
    // rather than a fixed desktop-oriented min-height that would push it below
    // the fold on a short landscape viewport.
    expect(root.className).toContain('h-[clamp(360px,calc(100svh-5rem),680px)]');
    expect(root.className).toContain('max-h-[calc(100dvh-4rem)]');

    // The primary control is present and sized as a >= 48x48px touch-target.
    const startButton = screen.getByRole('button', { name: /Start calling Sunny/i });
    expect(startButton.className).toContain('touch-target');
  });
});
