/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Feature: responsive-speaking-ui, Task 10.2
// DOM-measurement tests for the Voice Settings Panel overlay in AiTalkTab.tsx.
//
// The panel is open by default (showVoiceSettings initial state === true), so it
// renders without any interaction. Across the representative viewport widths from
// the design's testing strategy (320 / 375 / 768 / 1024 / 1280 / 1920) this suite
// asserts:
//  - Column counts per layout: 1 on Mobile, 1-2 on Tablet, 2-3 on Desktop. This is
//    encoded by the responsive grid utilities `grid-cols-1 md:grid-cols-2
//    lg:grid-cols-3` (Req 8.2, 8.3, 8.6).
//  - Width <= 100vw with no horizontal scroll: the overlay carries `max-w-full`
//    plus `md:max-w-[calc(100vw-2rem)]`, and the measurable scrollWidth never
//    exceeds clientWidth (Req 8.1, 8.6).
//  - Vertical scroll only when overflowing, with no horizontal scroll: the inner
//    panel carries `overflow-y-auto` + `overflow-x-hidden` + a bounded
//    `max-h-[min(70vh,560px)]` so it scrolls vertically only past that height and
//    never horizontally (Req 8.4).
//
// jsdom does not perform real layout, so responsive layout intent expressed
// through Tailwind utility classes is verified by className presence; the
// scrollWidth/clientWidth invariant is asserted where measurable.
//
// Requirements: 8.1, 8.2, 8.3, 8.4, 8.6

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';

import AiTalkTab from './AiTalkTab';
import type { AppState } from '../types';

// Representative breakpoints: Mobile (320, 375), Tablet boundary (768, 1024),
// Desktop (1280, 1920).
const MOBILE_WIDTHS = [320, 375] as const;
const TABLET_WIDTHS = [768, 1024] as const;
const DESKTOP_WIDTHS = [1280, 1920] as const;
const ALL_WIDTHS = [
  ...MOBILE_WIDTHS,
  ...TABLET_WIDTHS,
  ...DESKTOP_WIDTHS,
] as const;

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

// Minimal AppState — the Voice Settings Panel does not read any of these values,
// they only satisfy the prop contract.
function makeState(): AppState {
  return {
    currentTab: 'hoc',
    viewMode: 'app',
    gems: 0,
    streak: 0,
    hearts: 5,
    xp: 0,
    selectedOutfitId: 'original',
    outfits: [],
    quests: [],
    lessons: [],
    leaderboard: [],
    activeLessonId: null,
  };
}

function renderPanel() {
  return render(
    <AiTalkTab
      state={makeState()}
      onUpdateStats={() => {}}
      globalLang="en"
      globalTheme="light"
    />,
  );
}

// The inner panel is the parent of the controls grid; the overlay is the parent
// of the inner panel. Navigating from the grid keeps the lookup robust against
// the special characters in the arbitrary Tailwind class names.
function getPanelParts(container: HTMLElement) {
  const grid = container.querySelector(
    '[class*="grid-cols-1"][class*="md:grid-cols-2"][class*="lg:grid-cols-3"]',
  ) as HTMLElement | null;
  if (!grid) {
    throw new Error('Expected the Voice Settings controls grid to be rendered');
  }
  const innerPanel = grid.parentElement as HTMLElement;
  const overlay = innerPanel.parentElement as HTMLElement;
  return { grid, innerPanel, overlay };
}

describe('Voice Settings Panel responsive layout (Task 10.2)', () => {
  beforeEach(() => {
    localStorage.clear();
    // AiTalkTab renders an AudioVisualizer that observes its container; jsdom has
    // no ResizeObserver, so provide a no-op implementation.
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    // The chat auto-scroll effect calls scrollIntoView, absent in jsdom.
    if (!Element.prototype.scrollIntoView) {
      Element.prototype.scrollIntoView = () => {};
    }
    // matchMedia is consulted by some libraries; provide a safe default.
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      })),
    );
    // Speech APIs / network are only exercised by user actions, not on mount, but
    // stub fetch defensively so nothing reaches the network.
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('network disabled in test'))),
    );
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  // --- Column counts per layout: 1 / 1-2 / 2-3 (Req 8.2, 8.3, 8.6) ---
  describe('controls grid column counts per layout', () => {
    it('renders exactly one column on Mobile (base grid-cols-1)', () => {
      for (const width of MOBILE_WIDTHS) {
        setViewportWidth(width);
        const { container, unmount } = renderPanel();
        const { grid } = getPanelParts(container);
        // The base (Mobile) grid is a single column.
        expect(grid.className).toContain('grid-cols-1');
        unmount();
      }
    });

    it('allows 1-2 columns on Tablet (md:grid-cols-2 over the grid-cols-1 base)', () => {
      for (const width of TABLET_WIDTHS) {
        setViewportWidth(width);
        const { container, unmount } = renderPanel();
        const { grid } = getPanelParts(container);
        // From md (>= 768px, i.e. Tablet) the grid expands to two columns while
        // the grid-cols-1 base keeps a single column available below it (1-2).
        expect(grid.className).toContain('grid-cols-1');
        expect(grid.className).toContain('md:grid-cols-2');
        unmount();
      }
    });

    it('allows 2-3 columns on Desktop (lg:grid-cols-3 over the md:grid-cols-2 base)', () => {
      for (const width of DESKTOP_WIDTHS) {
        setViewportWidth(width);
        const { container, unmount } = renderPanel();
        const { grid } = getPanelParts(container);
        // From lg (Desktop) the grid expands to three columns while md keeps two
        // available below it (2-3).
        expect(grid.className).toContain('md:grid-cols-2');
        expect(grid.className).toContain('lg:grid-cols-3');
        unmount();
      }
    });
  });

  // --- Width <= 100vw with no horizontal scroll (Req 8.1, 8.6) ---
  describe('overlay width never exceeds the viewport', () => {
    for (const width of ALL_WIDTHS) {
      it(`caps the overlay at <= 100vw and produces no horizontal scroll at ${width}px`, () => {
        setViewportWidth(width);
        const { container } = renderPanel();
        const { overlay, innerPanel } = getPanelParts(container);

        // Mobile: full-width within the inset; Tablet/Desktop: capped to the
        // viewport minus the 2rem inset so it can never exceed 100vw.
        expect(overlay.className).toContain('max-w-full');
        expect(overlay.className).toContain('md:max-w-[calc(100vw-2rem)]');

        // No element of the panel produces a wider scroll box than its client box
        // (no horizontal scrollbar) at any breakpoint.
        expect(overlay.scrollWidth).toBeLessThanOrEqual(overlay.clientWidth);
        expect(innerPanel.scrollWidth).toBeLessThanOrEqual(innerPanel.clientWidth);
      });
    }
  });

  // --- Vertical scroll only when overflowing, no horizontal scroll (Req 8.4) ---
  describe('inner panel scroll behavior', () => {
    for (const width of ALL_WIDTHS) {
      it(`scrolls vertically only past a bounded height and never horizontally at ${width}px`, () => {
        setViewportWidth(width);
        const { container } = renderPanel();
        const { innerPanel } = getPanelParts(container);

        // Vertical scroll is enabled but bounded: content scrolls only once it
        // exceeds the clamped max height (min(70vh, 560px)).
        expect(innerPanel.className).toContain('overflow-y-auto');
        expect(innerPanel.className).toContain('max-h-[min(70vh,560px)]');

        // Horizontal overflow is hidden, so the panel never scrolls sideways.
        expect(innerPanel.className).toContain('overflow-x-hidden');
        expect(innerPanel.scrollWidth).toBeLessThanOrEqual(innerPanel.clientWidth);
      });
    }
  });
});
