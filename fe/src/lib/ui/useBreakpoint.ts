// Feature: responsive-speaking-ui
// Shared `useBreakpoint` hook for the SpeakJoy Vite/React frontend.
//
// Provides components with a single, consistent notion of the current layout
// (mobile/tablet/desktop) derived from the viewport width. It subscribes to the
// 768px / 1024px thresholds via `window.matchMedia` (with a debounced `resize`
// fallback) and classifies the width using the pure `classifyBreakpoint`
// helper. Updates are debounced so layout settles within the 300–500ms timing
// budgets (Requirements 2.4, 10.1, 10.3) without thrashing.
//
// Presentation-only: this hook NEVER calls an API, NEVER mutates application
// state, and NEVER touches session, scoring, or speech recognition/synthesis
// logic. It only feeds className/style decisions. It is SSR/initial-render safe
// and never throws when `window`/`matchMedia` is unavailable.

import { useEffect, useState } from 'react';
import { BREAKPOINTS, classifyBreakpoint, type Layout } from './responsive';

/** Debounce window (ms) for resize/orientation updates — within the 300–500ms budget. */
const RESIZE_DEBOUNCE_MS = 150;

/** Width (CSS px) assumed when `window` is unavailable (SSR/initial render). */
const DEFAULT_SSR_WIDTH = BREAKPOINTS.desktop + 1;

/** Current layout classification and convenience flags derived from viewport width. */
export interface BreakpointState {
  layout: Layout;
  /** Current viewport width in CSS px. */
  width: number;
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
}

/** Read the current viewport width, falling back to a safe default off-DOM. */
function readViewportWidth(): number {
  if (typeof window === 'undefined' || typeof window.innerWidth !== 'number') {
    return DEFAULT_SSR_WIDTH;
  }
  return window.innerWidth;
}

/** Build a {@link BreakpointState} from a viewport width. */
function buildState(width: number): BreakpointState {
  const layout = classifyBreakpoint(width);
  return {
    layout,
    width,
    isMobile: layout === 'mobile',
    isTablet: layout === 'tablet',
    isDesktop: layout === 'desktop',
  };
}

/**
 * React hook returning the current {@link BreakpointState}. Re-renders the
 * consuming component (debounced) when the viewport crosses a breakpoint or is
 * resized. Safe to call during SSR/initial render — it returns a sensible
 * default layout and never throws.
 *
 * (Requirements 2.4, 10.1, 10.3)
 */
export function useBreakpoint(): BreakpointState {
  const [state, setState] = useState<BreakpointState>(() => buildState(readViewportWidth()));

  useEffect(() => {
    // Guard for non-browser / unsupported environments — never throw.
    if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') {
      return;
    }

    let debounceId: ReturnType<typeof setTimeout> | undefined;

    const applyWidth = () => {
      const next = buildState(readViewportWidth());
      // Only update when something actually changed to avoid needless renders.
      setState((prev) => (prev.width === next.width && prev.layout === next.layout ? prev : next));
    };

    const scheduleUpdate = () => {
      if (debounceId !== undefined) {
        clearTimeout(debounceId);
      }
      debounceId = setTimeout(applyWidth, RESIZE_DEBOUNCE_MS);
    };

    // Sync once on mount in case the width changed between initial render and effect.
    applyWidth();

    // Prefer matchMedia listeners on the two thresholds; fall back to resize.
    const mediaQueries: MediaQueryList[] = [];
    const supportsMatchMedia = typeof window.matchMedia === 'function';

    if (supportsMatchMedia) {
      const tabletQuery = window.matchMedia(`(min-width: ${BREAKPOINTS.tablet}px)`);
      const desktopQuery = window.matchMedia(`(min-width: ${BREAKPOINTS.desktop + 1}px)`);
      mediaQueries.push(tabletQuery, desktopQuery);
      for (const mq of mediaQueries) {
        if (typeof mq.addEventListener === 'function') {
          mq.addEventListener('change', scheduleUpdate);
        } else if (typeof mq.addListener === 'function') {
          // Legacy Safari fallback.
          mq.addListener(scheduleUpdate);
        }
      }
    }

    // Debounced resize/orientation fallback keeps width accurate within budget.
    window.addEventListener('resize', scheduleUpdate);
    window.addEventListener('orientationchange', scheduleUpdate);

    return () => {
      if (debounceId !== undefined) {
        clearTimeout(debounceId);
      }
      for (const mq of mediaQueries) {
        if (typeof mq.removeEventListener === 'function') {
          mq.removeEventListener('change', scheduleUpdate);
        } else if (typeof mq.removeListener === 'function') {
          mq.removeListener(scheduleUpdate);
        }
      }
      window.removeEventListener('resize', scheduleUpdate);
      window.removeEventListener('orientationchange', scheduleUpdate);
    };
  }, []);

  return state;
}
