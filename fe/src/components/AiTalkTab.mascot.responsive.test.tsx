/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Feature: responsive-speaking-ui, Task 7.3
// Tests for Mascot bounds and Audio Visualizer fit in the Speaking Screen
// (`AiTalkTab.tsx`).
//
// Covers:
//  - Req 5.1 / 5.2: the Mascot SVG renders within device-appropriate width
//    bounds — 40%–90% of the viewport on Mobile and <= 50% on Desktop —
//    expressed through the responsive vw-based Tailwind width classes
//    (`w-[44vw]` … `lg:w-[min(42vw,48vh)]`) plus `max-w-full` so it can never
//    overflow its container.
//  - Req 5.5: the Mascot animation-state classes (idle/calling/listening/
//    processing/speaking → hover:scale-105 / animate-pulse / animate-spin /
//    animate-bounce) are unchanged across breakpoints. Because the SVG size and
//    animation classes are pure CSS that does not vary with viewport width, the
//    rendered className is asserted identical at every sampled width.
//  - Req 5.3: the Audio Visualizer canvas carries `max-w-full` and its rendered
//    container caps the width (`max-w-[13rem]`) with `overflow-hidden`, so the
//    visualizer width is always <= its container (no overflow) at any breakpoint.
//
// jsdom performs no real layout, so the responsive intent encoded in Tailwind
// utility classes is verified by class presence / numeric inspection of the vw
// ratios, and the canvas/container relationship is verified structurally.
//
// Requirements: 5.1, 5.2, 5.3, 5.5

import type React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';

import AiTalkTab from './AiTalkTab';
import { AppState } from '../types';
import {
  mascotWidthBounds,
  classifyBreakpoint,
  MASCOT_MOBILE_MIN_RATIO,
  MASCOT_MOBILE_MAX_RATIO,
  MASCOT_DESKTOP_MAX_RATIO,
} from '../lib/ui/responsive';

// Representative viewport widths from the design's testing strategy:
// Mobile (320, 375), Tablet boundaries (768, 1024), Desktop (1280, 1920).
const VIEWPORT_WIDTHS = [320, 375, 768, 1024, 1280, 1920] as const;

// --- Minimal AppState builder (mirrors the shared test fixture) --------------
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

/** Find the Sunny mascot SVG (its viewBox is 0 0 60 60; lucide icons use 0 0 24 24). */
function getMascotSvg(container: HTMLElement): SVGSVGElement {
  const svgs = Array.from(container.querySelectorAll('svg')) as SVGSVGElement[];
  const mascot = svgs.find((svg) => svg.getAttribute('viewBox') === '0 0 60 60');
  if (!mascot) {
    throw new Error('Expected the Sunny mascot SVG (viewBox "0 0 60 60") to be rendered');
  }
  return mascot;
}

/** Extract a numeric vw value from a Tailwind class fragment like `w-[44vw]`. */
function vwFromClass(className: string, pattern: RegExp): number {
  const match = className.match(pattern);
  if (!match) {
    throw new Error(`Could not find a vw value matching ${pattern} in: ${className}`);
  }
  return Number(match[1]);
}

let speechRecognitionInstances: any[] = [];

function renderTab(props: Partial<React.ComponentProps<typeof AiTalkTab>> = {}) {
  return render(
    <AiTalkTab
      state={makeState()}
      onUpdateStats={() => {}}
      currentUser={null}
      currentChild={null}
      globalLang="en"
      globalTheme="light"
      {...props}
    />,
  );
}

describe('AiTalkTab Mascot bounds & Audio Visualizer fit (Task 7.3)', () => {
  beforeEach(() => {
    localStorage.clear();
    speechRecognitionInstances = [];

    // jsdom lacks ResizeObserver, which the AudioVisualizer constructs on mount.
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );

    // jsdom does not implement these layout/media APIs; stub them so rendering
    // the Speaking Screen never throws. None affect the responsive class output.
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
        // Synchronously drive the utterance lifecycle so the call mode can settle.
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

    const makeRecognition = () => {
      const rec: any = {
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
      };
      speechRecognitionInstances.push(rec);
      return rec;
    };
    (window as any).SpeechRecognition = vi.fn(makeRecognition);
    (window as any).webkitSpeechRecognition = (window as any).SpeechRecognition;

    vi.stubGlobal('matchMedia', vi.fn((query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })));

    // No network in these tests; the component guards session calls in try/catch.
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('network disabled in test'))));
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  // --- Req 5.1 / 5.2: Mascot width stays within device bounds ---------------
  describe('Mascot renders within device-appropriate width bounds', () => {
    for (const width of VIEWPORT_WIDTHS) {
      it(`keeps the mascot within its responsive bounds at ${width}px`, () => {
        setViewportWidth(width);
        const { container } = renderTab();
        const mascot = getMascotSvg(container);
        const cls = mascot.getAttribute('class') || '';

        // The mascot must declare its full set of responsive width classes and
        // `max-w-full` so it can never spill past its container.
        expect(cls).toContain('w-[44vw]');
        expect(cls).toContain('h-[44vw]');
        expect(cls).toContain('max-w-full');
        expect(cls).toContain('md:w-[42vw]');
        expect(cls).toContain('lg:w-[min(42vw,48vh)]');
        expect(cls).toContain('lg:h-[min(42vw,48vh)]');

        // Req 5.1 (Mobile): base width is 44vw — within the 40%–90% range.
        const mobileVw = vwFromClass(cls, /w-\[(\d+(?:\.\d+)?)vw\]/);
        expect(mobileVw).toBeGreaterThanOrEqual(MASCOT_MOBILE_MIN_RATIO * 100); // >= 40
        expect(mobileVw).toBeLessThanOrEqual(MASCOT_MOBILE_MAX_RATIO * 100); // <= 90

        // Req 5.2 (Desktop): the lg width caps at min(42vw, 48vh) — 42vw <= 50vw.
        const desktopVw = vwFromClass(cls, /lg:w-\[min\((\d+(?:\.\d+)?)vw/);
        expect(desktopVw).toBeLessThanOrEqual(MASCOT_DESKTOP_MAX_RATIO * 100); // <= 50
        // Desktop is never smaller than the mobile-equivalent lower bound (40vw).
        expect(desktopVw).toBeGreaterThanOrEqual(MASCOT_MOBILE_MIN_RATIO * 100); // >= 40
      });
    }
  });

  // --- Req 5.5: animation-state classes are unchanged across breakpoints ----
  it('keeps the idle mascot size + animation classes identical across breakpoints', () => {
    const classNamesByWidth = VIEWPORT_WIDTHS.map((width) => {
      setViewportWidth(width);
      const { container, unmount } = renderTab();
      const cls = getMascotSvg(container).getAttribute('class') || '';
      unmount();
      return cls;
    });

    // The idle state animation class is present and stable at every width.
    for (const cls of classNamesByWidth) {
      expect(cls).toContain('hover:scale-105'); // idle bounceClass
      expect(cls).toContain('transition-transform');
    }

    // The full class string is byte-for-byte identical across all breakpoints:
    // viewport width never changes which animation/size classes are applied.
    const [first, ...rest] = classNamesByWidth;
    for (const cls of rest) {
      expect(cls).toBe(first);
    }
  });

  // --- Req 5.3: Audio Visualizer fits within its container (no overflow) -----
  it('renders the listening visualizer with a width-capped, overflow-hidden container holding a max-w-full canvas', async () => {
    setViewportWidth(375);
    const { container } = renderTab();

    // Enter the hands-free call: this activates the session and creates the
    // call SpeechRecognition instance whose onstart transitions to "listening".
    const startButton = Array.from(container.querySelectorAll('button')).find((btn) =>
      /start calling/i.test(btn.textContent || ''),
    );
    expect(startButton, 'Expected the "Start calling" button to be present').toBeTruthy();

    await act(async () => {
      fireEvent.click(startButton!);
    });

    // Drive the recognition engine's onstart to reach the "listening" state,
    // which renders the AudioVisualizer inside its capped container.
    await act(async () => {
      const callRec = speechRecognitionInstances[speechRecognitionInstances.length - 1];
      callRec?.onstart?.();
    });

    // The visualizer container caps its width and clips overflow so the canvas
    // can never extend past it.
    let capContainer: HTMLElement | null = null;
    await waitFor(() => {
      capContainer = container.querySelector('div.max-w-\\[13rem\\]') as HTMLElement | null;
      expect(capContainer).not.toBeNull();
    });

    expect(capContainer!.className).toContain('max-w-[13rem]');
    expect(capContainer!.className).toContain('overflow-hidden');

    // The canvas inside carries max-w-full so its width is always <= container.
    const canvas = capContainer!.querySelector('canvas');
    expect(canvas).not.toBeNull();
    expect((canvas as HTMLCanvasElement).className).toContain('max-w-full');
  });

  // --- Req 5.1 / 5.2: pure mascot bounds helper at sampled widths -----------
  describe('mascotWidthBounds numeric helper at sampled widths', () => {
    for (const width of VIEWPORT_WIDTHS) {
      it(`produces in-range bounds for ${width}px`, () => {
        const layout = classifyBreakpoint(width);
        const { minPx, maxPx } = mascotWidthBounds(width, layout);

        // Ordering + never exceeding the viewport (Req 5.1, 5.2).
        expect(minPx).toBeLessThanOrEqual(maxPx);
        expect(maxPx).toBeLessThanOrEqual(width);

        if (layout === 'mobile') {
          // Mobile: exactly 40%–90% of the viewport.
          expect(minPx).toBeCloseTo(MASCOT_MOBILE_MIN_RATIO * width);
          expect(maxPx).toBeCloseTo(MASCOT_MOBILE_MAX_RATIO * width);
        } else if (layout === 'desktop') {
          // Desktop: never exceeds half the viewport, never below mobile lower bound.
          expect(maxPx).toBeLessThanOrEqual(MASCOT_DESKTOP_MAX_RATIO * width);
          expect(minPx).toBeGreaterThanOrEqual(MASCOT_MOBILE_MIN_RATIO * width - 1e-6);
        }
      });
    }
  });
});
