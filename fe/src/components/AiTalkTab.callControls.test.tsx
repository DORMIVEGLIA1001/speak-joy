/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Feature: responsive-speaking-ui, Task 8.2
// Touch-target and hit-testing tests for the Speaking Screen Call Controls
// (AiTalkTab.tsx, Call Mode).
//
// Controls under test (all carry `.touch-target` + `.tap-feedback`):
//   - Start call button        (idle view, onClick=startCallSession)
//   - End call button          (active view, onClick=stopCallSession)
//   - Show / Hide translation  (active view, toggles isCallTranslationRevealed)
//   - "Ask Sunny to repeat"    (active view, onClick=speakDuoResponseInCall)
//
// jsdom performs no real layout and applies no Tailwind/index.css sizing, so
// physical box size cannot be measured here. Per the design's testing strategy,
// the >= 48x48px requirement is verified by asserting each control carries the
// `.touch-target` utility (index.css: `min-height: 48px; min-width: 48px;`) and
// the >= 8px spacing requirement by asserting the adjacent-control containers
// carry the gap utilities (`gap-4` = 16px / `space-y-4` = 16px, both >= 8px).
//
// Hit-testing is verified behaviorally:
//   - clicking a control fires its handler exactly once (start-call constructs
//     SpeechRecognition exactly once; the translation toggle flips state once),
//   - clicking a non-interactive inter-control gap element fires no handler.
//
// Requirements: 6.1, 6.2, 6.3, 6.5, 6.6, 10.5

import type React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

import AiTalkTab from './AiTalkTab';
import type { AppState } from '../types';

// Representative breakpoints (design testing strategy) plus an orientation
// flip: portrait (h > w) and landscape (w > h) per Req 10.5.
const SAMPLES: Array<{ width: number; height: number; label: string }> = [
  { width: 320, height: 640, label: '320x640 portrait' },
  { width: 375, height: 667, label: '375x667 portrait' },
  { width: 667, height: 375, label: '667x375 landscape' },
  { width: 768, height: 1024, label: '768x1024 portrait' },
  { width: 1024, height: 768, label: '1024x768 landscape' },
  { width: 1280, height: 800, label: '1280x800 landscape' },
  { width: 1920, height: 1080, label: '1920x1080 landscape' },
];

const baseState: AppState = {
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

function renderTab(overrides: Partial<React.ComponentProps<typeof AiTalkTab>> = {}) {
  return render(
    <AiTalkTab
      state={baseState}
      onUpdateStats={vi.fn()}
      currentUser={null}
      currentChild={null}
      onProgressSync={vi.fn()}
      onUsageSync={vi.fn()}
      globalLang="en"
      globalTheme="dark"
      {...overrides}
    />,
  );
}

function setViewport(width: number, height: number): void {
  Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: width });
  Object.defineProperty(window, 'innerHeight', { writable: true, configurable: true, value: height });
  Object.defineProperty(document.documentElement, 'clientWidth', {
    writable: true,
    configurable: true,
    value: width,
  });
  window.dispatchEvent(new Event('resize'));
}

// A SpeechRecognition mock that is `new`-constructable and records its
// construction count. startCallSession constructs exactly one instance per
// invocation, which lets us prove the start-call handler fired exactly once.
let recognitionCtor: ReturnType<typeof vi.fn>;

function installSpeechRecognitionMock(): void {
  recognitionCtor = vi.fn(function (this: any) {
    this.continuous = false;
    this.lang = '';
    this.interimResults = false;
    this.maxAlternatives = 1;
    this.onstart = null;
    this.onresult = null;
    this.onerror = null;
    this.onend = null;
    this.start = vi.fn();
    this.stop = vi.fn();
    this.abort = vi.fn();
  });
  vi.stubGlobal('SpeechRecognition', recognitionCtor);
  vi.stubGlobal('webkitSpeechRecognition', recognitionCtor);
}

// Drive idle -> active call view. Returns once the active controls render.
async function startCall(): Promise<HTMLElement> {
  const startButton = screen.getByRole('button', { name: /Start calling Sunny/i });
  fireEvent.click(startButton);
  return screen.findByRole('button', { name: /End call/i });
}

describe('Call Controls touch-targets and hit-testing (Task 8.2)', () => {
  beforeEach(() => {
    localStorage.clear();
    installSpeechRecognitionMock();

    // AudioVisualizer (only mounted in the listening state, not reached here)
    // relies on ResizeObserver; provide a no-op so nothing throws defensively.
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );

    // No currentUser/currentChild => no /api/sessions fetch; stub anyway so a
    // stray network call can never hit the wire.
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response)),
    );
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  // --- Touch-target sizing via `.touch-target` (Req 6.1, 10.5) ----------------
  describe('every Call Control is a >= 48x48px touch-target at sampled widths/orientations', () => {
    for (const { width, height, label } of SAMPLES) {
      it(`idle Start-call control carries touch-target + tap-feedback at ${label}`, () => {
        setViewport(width, height);
        renderTab();

        const startButton = screen.getByRole('button', { name: /Start calling Sunny/i });
        // index.css `.touch-target` => min-height: 48px; min-width: 48px.
        expect(startButton.className).toContain('touch-target');
        expect(startButton.className).toContain('tap-feedback');
      });
    }

    for (const { width, height, label } of SAMPLES) {
      it(`active call controls each carry touch-target at ${label}`, async () => {
        setViewport(width, height);
        renderTab();

        const endButton = await startCall();
        const showTranslation = screen.getByRole('button', { name: /Show Vietnamese/i });
        const askRepeat = screen.getByRole('button', { name: /Ask Sunny to repeat/i });

        for (const control of [endButton, showTranslation, askRepeat]) {
          expect(control.className).toContain('touch-target');
          expect(control.className).toContain('tap-feedback');
        }
      });
    }
  });

  // --- >= 8px spacing between adjacent controls (Req 6.2, 10.5) ---------------
  it('keeps >= 8px gaps between adjacent controls via gap/space utilities', async () => {
    setViewport(375, 667);
    renderTab();

    const endButton = await startCall();

    // The End-call control sits in a horizontal control row using `gap-4`
    // (1rem = 16px >= 8px) between adjacent items.
    const endRow = endButton.parentElement as HTMLElement;
    expect(endRow.className).toContain('gap-4');

    // The right-hand control column stacks the translation toggle and the
    // "Ask Sunny to repeat" control with `space-y-4` (16px >= 8px) vertical gaps.
    const askRepeat = screen.getByRole('button', { name: /Ask Sunny to repeat/i });
    const column = askRepeat.parentElement as HTMLElement;
    expect(column.className).toContain('space-y-4');
  });

  // --- A control fires its handler exactly once (Req 6.5) ---------------------
  it('fires the start-call handler exactly once per click (one SpeechRecognition instance)', async () => {
    setViewport(375, 667);
    renderTab();

    // Mount sets up the traditional recognition instance once.
    const constructedBeforeClick = recognitionCtor.mock.calls.length;

    await startCall();

    // startCallSession constructs exactly one additional recognition engine,
    // proving the handler ran exactly once (no double-fire / overlap).
    expect(recognitionCtor.mock.calls.length - constructedBeforeClick).toBe(1);
  });

  it('toggles the translation control exactly once per click', async () => {
    setViewport(375, 667);
    renderTab();
    await startCall();

    // One click reveals the translation (Show -> Hide). A double-fire would
    // toggle straight back to "Show", so a single observable flip proves the
    // handler ran exactly once.
    fireEvent.click(screen.getByRole('button', { name: /Show Vietnamese/i }));
    const hideButton = await screen.findByRole('button', { name: /Hide translation/i });
    expect(hideButton).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Show Vietnamese/i })).toBeNull();

    // One more click flips it back exactly once.
    fireEvent.click(hideButton);
    expect(await screen.findByRole('button', { name: /Show Vietnamese/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Hide translation/i })).toBeNull();
  });

  // --- Taps in inter-control gaps fire no handler (Req 6.6) -------------------
  it('does not fire any Call Control handler when a non-interactive gap is tapped', async () => {
    setViewport(375, 667);
    renderTab();

    const endButton = await startCall();
    const constructedAfterStart = recognitionCtor.mock.calls.length;

    // The gap is the control-row container itself (the space surrounding the
    // End-call button). It is a plain layout <div>, not an interactive element.
    const endRow = endButton.parentElement as HTMLElement;
    expect(endRow.tagName).not.toBe('BUTTON');
    expect(endRow.onclick).toBeNull();

    // There must be no overlapping clickable element occupying the gap: the row
    // contains exactly one interactive control (the End-call button).
    expect(within(endRow).getAllByRole('button')).toHaveLength(1);

    // Tapping the gap element fires no handler: the call stays active, no new
    // recognition engine is constructed, and translation state is unchanged.
    fireEvent.click(endRow);

    expect(screen.getByRole('button', { name: /End call/i })).toBeInTheDocument();
    expect(recognitionCtor.mock.calls.length).toBe(constructedAfterStart);
    expect(screen.getByRole('button', { name: /Show Vietnamese/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Hide translation/i })).toBeNull();
  });

  // --- Gap between stacked right-column controls fires no handler (Req 6.6) ---
  it('does not fire a handler when the stacked control column gap is tapped', async () => {
    setViewport(375, 667);
    renderTab();
    await startCall();

    const askRepeat = screen.getByRole('button', { name: /Ask Sunny to repeat/i });
    const column = askRepeat.parentElement as HTMLElement;

    // The vertical gaps between the column's children are layout margins on a
    // plain <div>; tapping the container itself must not toggle translation
    // state or otherwise invoke a control handler.
    expect(column.tagName).not.toBe('BUTTON');
    expect(column.onclick).toBeNull();

    fireEvent.click(column);

    expect(screen.getByRole('button', { name: /Show Vietnamese/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Hide translation/i })).toBeNull();
  });
});
