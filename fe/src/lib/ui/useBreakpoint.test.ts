// Feature: responsive-speaking-ui
// Unit tests for the shared `useBreakpoint` hook.
//
// Covers (Requirements 2.4, 10.1, 10.3):
//   - Breakpoint classification at sampled viewport widths (mobile/tablet/desktop)
//     including the 767/768/1024/1025 boundaries.
//   - Debounced updates on resize: state only settles after the debounce window
//     elapses (verified with fake timers), without thrashing on bursts.
//   - SSR / initial-render safety: a sensible default layout is returned and no
//     error is thrown when `matchMedia` is absent or `innerWidth` is unavailable.
//
// These are presentation-only assertions — the hook performs no API/state/session
// work, so there is nothing else to verify here.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { useBreakpoint } from './useBreakpoint';

/** Override the jsdom viewport width in a way that survives per-test resets. */
function setViewportWidth(width: number | undefined): void {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    writable: true,
    value: width,
  });
}

/** Dispatch a resize event the same way the browser would. */
function fireResize(): void {
  window.dispatchEvent(new Event('resize'));
}

describe('useBreakpoint', () => {
  // Preserve the real innerWidth / matchMedia so we can restore them afterwards.
  const originalInnerWidth = window.innerWidth;
  const originalMatchMedia = window.matchMedia;

  beforeEach(() => {
    // jsdom does not implement matchMedia by default; make sure it is absent so
    // the debounced resize fallback path is exercised consistently.
    Reflect.deleteProperty(window, 'matchMedia');
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    setViewportWidth(originalInnerWidth);
    if (originalMatchMedia) {
      window.matchMedia = originalMatchMedia;
    } else {
      // restore the "absent" state.
      Reflect.deleteProperty(window, 'matchMedia');
    }
  });

  describe('classification at sampled widths', () => {
    const cases: Array<{ width: number; layout: 'mobile' | 'tablet' | 'desktop' }> = [
      { width: 320, layout: 'mobile' },
      { width: 375, layout: 'mobile' },
      { width: 767, layout: 'mobile' }, // boundary: just below tablet
      { width: 768, layout: 'tablet' }, // boundary: tablet lower edge
      { width: 1000, layout: 'tablet' },
      { width: 1024, layout: 'tablet' }, // boundary: tablet upper edge (inclusive)
      { width: 1025, layout: 'desktop' }, // boundary: desktop lower edge
      { width: 1280, layout: 'desktop' },
      { width: 1920, layout: 'desktop' },
    ];

    it.each(cases)('classifies width $width as $layout', ({ width, layout }) => {
      setViewportWidth(width);

      const { result } = renderHook(() => useBreakpoint());

      expect(result.current.layout).toBe(layout);
      expect(result.current.width).toBe(width);
      expect(result.current.isMobile).toBe(layout === 'mobile');
      expect(result.current.isTablet).toBe(layout === 'tablet');
      expect(result.current.isDesktop).toBe(layout === 'desktop');
    });
  });

  describe('debounced updates on resize', () => {
    it('settles to the new layout only after the debounce window elapses', () => {
      vi.useFakeTimers();
      setViewportWidth(1280); // start on desktop

      const { result } = renderHook(() => useBreakpoint());
      expect(result.current.layout).toBe('desktop');

      // Shrink to a mobile width and fire a resize: the update is debounced.
      act(() => {
        setViewportWidth(400);
        fireResize();
      });

      // Before the debounce window elapses, the layout has not changed yet.
      act(() => {
        vi.advanceTimersByTime(100); // < RESIZE_DEBOUNCE_MS (150ms)
      });
      expect(result.current.layout).toBe('desktop');

      // After the full debounce window, the new layout is applied.
      act(() => {
        vi.advanceTimersByTime(50); // total 150ms
      });
      expect(result.current.layout).toBe('mobile');
      expect(result.current.width).toBe(400);
    });

    it('debounces a burst of resize events into a single settled update', () => {
      vi.useFakeTimers();
      setViewportWidth(1280); // desktop

      const { result } = renderHook(() => useBreakpoint());
      expect(result.current.layout).toBe('desktop');

      // A rapid burst of intermediate widths, each within the debounce window.
      act(() => {
        setViewportWidth(900);
        fireResize();
        vi.advanceTimersByTime(50);
        setViewportWidth(600);
        fireResize();
        vi.advanceTimersByTime(50);
        setViewportWidth(360);
        fireResize();
      });

      // No intermediate value should have settled yet (timer kept resetting).
      expect(result.current.layout).toBe('desktop');

      // Only the final width settles after one debounce window.
      act(() => {
        vi.advanceTimersByTime(150);
      });
      expect(result.current.layout).toBe('mobile');
      expect(result.current.width).toBe(360);
    });
  });

  describe('SSR / initial-render safety', () => {
    it('returns a valid default layout and does not throw when matchMedia is absent', () => {
      setViewportWidth(1280);
      expect(window.matchMedia).toBeUndefined();

      let rendered: ReturnType<typeof renderHook<ReturnType<typeof useBreakpoint>, void>>;
      expect(() => {
        rendered = renderHook(() => useBreakpoint());
      }).not.toThrow();

      const state = rendered!.result.current;
      expect(['mobile', 'tablet', 'desktop']).toContain(state.layout);
      expect(state.layout).toBe('desktop');
    });

    it('falls back to the safe default layout when innerWidth is unavailable', () => {
      // Simulate an environment where the viewport width cannot be read.
      setViewportWidth(undefined);

      const { result } = renderHook(() => useBreakpoint());

      // The hook must never throw and must resolve to a sensible default.
      expect(['mobile', 'tablet', 'desktop']).toContain(result.current.layout);
      expect(result.current.layout).toBe('desktop');
      expect(result.current.isDesktop).toBe(true);
    });
  });
});
