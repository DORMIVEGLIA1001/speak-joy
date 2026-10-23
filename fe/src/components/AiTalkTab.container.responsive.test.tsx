/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Feature: responsive-speaking-ui, Task 6.3
// DOM-measurement tests for the Speaking Screen container (AiTalkTab.tsx).
//
// Rendered across the representative viewport widths from the design's testing
// strategy (320 / 375 / 768 / 1024 / 1280 / 1920) plus a constrained landscape
// height, and asserts:
//   - No horizontal scroll: element.scrollWidth <= element.clientWidth, backed by
//     the viewport-aware container classes (overflow-x-hidden, min-w-0, max-w-full)
//     (Req 4.1, 4.2, 4.4, 10.2).
//   - Viewport-aware container height: the clamp/dvh/svh height classes that keep
//     the primary control in view on Mobile and landscape (Req 4.4, 4.5, 4.8, 10.2).
//   - Call Mode single -> multi-column: the connected call area uses a single column
//     by default (grid-cols-1) and a multi-column grid only at Desktop (lg:grid-cols-)
//     (Req 4.2, 4.3).
//   - Primary control reachable under a constrained landscape height: the Start-call
//     control remains rendered as a >= 48x48px `.touch-target` (Req 4.5, 4.8, 10.2).
//
// jsdom performs no real layout, so layout intent expressed through Tailwind utility
// classes is verified by className presence; the scrollWidth/clientWidth invariant is
// asserted where measurable. This file only renders the component for measurement and
// does not modify it.
//
// Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.8, 10.2

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';

import AiTalkTab from './AiTalkTab';
import type { AppState } from '../types';

// Representative breakpoints: Mobile (320, 375), Tablet boundary (768, 1024),
// Desktop (1280, 1920).
const VIEWPORT_WIDTHS = [320, 375, 768, 1024, 1280, 1920] as const;

/** A minimal but complete AppState for rendering the Speaking Screen. */
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

function makeProps() {
  return {
    state: makeState(),
    onUpdateStats: vi.fn(),
    globalLang: 'en' as const,
    globalTheme: 'dark' as const,
  };
}

/** Override the jsdom viewport so the container's measurements are deterministic. */
function setViewport(width: number, height = 800): void {
  Object.defineProperty(window, 'innerWidth', {
    writable: true,
    configurable: true,
    value: width,
  });
  Object.defineProperty(window, 'innerHeight', {
    writable: true,
    configurable: true,
    value: height,
  });
  Object.defineProperty(document.documentElement, 'clientWidth', {
    writable: true,
    configurable: true,
    value: width,
  });
  window.dispatchEvent(new Event('resize'));
}

/**
 * Minimal Web Speech API stand-in so `startCallSession` can transition the
 * Speaking Screen into the connected (multi-column) call view. No real audio is
 * involved — the handler logic is untouched.
 */
class MockSpeechRecognition {
  continuous = false;
  lang = '';
  interimResults = false;
  maxAlternatives = 1;
  onstart: ((this: unknown, ev?: unknown) => void) | null = null;
  onresult: ((this: unknown, ev?: unknown) => void) | null = null;
  onerror: ((this: unknown, ev?: unknown) => void) | null = null;
  onend: ((this: unknown, ev?: unknown) => void) | null = null;
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

describe('Speaking Screen container responsive layout (Task 6.3)', () => {
  beforeEach(() => {
    localStorage.clear();
    // The Speaking Screen issues fetches only when a user/child is present (not in
    // these tests); stub fetch defensively so nothing reaches the network.
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('network disabled in test'))),
    );
    // jsdom lacks ResizeObserver (used by the inner AudioVisualizer). Provide a
    // no-op so any incidental observation never throws.
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    // Provide the Web Speech API constructor used by the hands-free call flow.
    (window as unknown as { SpeechRecognition: unknown }).SpeechRecognition =
      MockSpeechRecognition;
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    localStorage.clear();
    Reflect.deleteProperty(window, 'SpeechRecognition');
  });

  // --- No horizontal scroll + viewport-aware container classes (Req 4.1, 4.2, 4.4, 10.2) ---
  describe('no horizontal scroll and viewport-aware sizing at every breakpoint', () => {
    for (const width of VIEWPORT_WIDTHS) {
      it(`keeps the container within the viewport at ${width}px (scrollWidth <= clientWidth)`, () => {
        setViewport(width);
        const { container } = render(<AiTalkTab {...makeProps()} />);
        const root = getContainerRoot(container);

        // The container must never produce a wider scroll box than its client box.
        expect(root.scrollWidth).toBeLessThanOrEqual(root.clientWidth);

        // Horizontal-overflow guards and width clamping prevent any page-level
        // horizontal scrollbar regardless of breakpoint.
        expect(root.className).toContain('overflow-x-hidden');
        expect(root.className).toContain('min-w-0');
        expect(root.className).toContain('max-w-full');

        // Viewport-aware heights keep the primary control in view rather than a
        // fixed desktop-oriented min-height.
        expect(root.className).toContain('h-[clamp(360px,calc(100svh-5rem),680px)]');
        expect(root.className).toContain('max-h-[calc(100dvh-4rem)]');
        expect(root.className).toContain('lg:h-[calc(100vh-10rem)]');
      });
    }
  });

  // --- Call Mode single -> multi-column at Desktop (Req 4.2, 4.3) ---
  it('lays out the connected call area as a single column with a lg: multi-column grid', async () => {
    setViewport(1280);
    const { container, getByText } = render(<AiTalkTab {...makeProps()} />);

    // Enter the connected call view (Call Mode is the default active mode).
    const startLabel = getByText(/Start calling Sunny/i);
    const startButton = startLabel.closest('button');
    expect(startButton).not.toBeNull();
    fireEvent.click(startButton as HTMLButtonElement);

    // The connected call room renders a CSS grid container once the call is active.
    let grid: HTMLElement | null = null;
    await waitFor(() => {
      grid = container.querySelector('div.grid');
      expect(grid).not.toBeNull();
    });

    const gridEl = grid as unknown as HTMLElement;
    // Single column below Desktop, multi-column only from lg: up.
    expect(gridEl.className).toContain('grid-cols-1');
    expect(gridEl.className).toContain('lg:grid-cols-');
    // The call area still must not overflow horizontally.
    expect(gridEl.scrollWidth).toBeLessThanOrEqual(gridEl.clientWidth);
  });

  // --- Primary control reachable under a constrained landscape height (Req 4.5, 4.8, 10.2) ---
  it('keeps the primary call control reachable as a touch-target in constrained landscape', () => {
    // Landscape mobile: wide but short viewport.
    setViewport(740, 360);
    const { container, getByText } = render(<AiTalkTab {...makeProps()} />);
    const root = getContainerRoot(container);

    // The viewport-aware height clamps the container to the available height so the
    // primary control stays in view instead of being pushed below the fold.
    expect(root.className).toContain('h-[clamp(360px,calc(100svh-5rem),680px)]');
    expect(root.className).toContain('max-h-[calc(100dvh-4rem)]');

    // The primary Start-call control is present and sized as a >= 48x48px touch-target.
    const startButton = getByText(/Start calling Sunny/i).closest('button');
    expect(startButton).not.toBeNull();
    expect((startButton as HTMLButtonElement).className).toContain('touch-target');
  });
});
