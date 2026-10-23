/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Feature: responsive-speaking-ui, Task 12.3
// Typography unit / DOM tests for the responsive presentation layer.
//
// jsdom does not compute real font sizes or line-heights from Tailwind utility
// classes or external CSS, so this suite verifies the readable-typography
// guarantees through three complementary lenses:
//
//   1. The pure `clampFontSize` helper enforces the [14, 24]px body-text bound
//      (Req 9.1) for every input, including out-of-range / fractional values.
//   2. `fe/src/index.css` is parsed to assert the `.fluid-body` clamp bounds are
//      exactly 14px..24px (Req 9.1) and that `.fluid-body` / `.readable-block`
//      line-heights sit within the readable [1.4, 2.0] range (Req 9.3), and that
//      the global `body { overflow-x: hidden }` rule is retained (Req 9.7).
//   3. Rendered components are inspected to confirm body text carries
//      `.fluid-body` / `.readable-block` (Req 9.1, 9.3), headings use responsive
//      scale-up classes so the Desktop size is never smaller than the Mobile size
//      (Req 9.2), truncated text pairs `.truncate-accessible` with a non-empty
//      `title` so the full text stays accessible (Req 9.5), and no horizontal
//      scroll appears (Req 9.7).
//
// Requirements: 9.1, 9.2, 9.3, 9.5, 9.7

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';

import App from './App';
import PathMap from './components/PathMap';
import { clampFontSize, FONT_MIN_PX, FONT_MAX_PX } from './lib/ui/responsive';
import type { Lesson, Outfit } from './types';

// Representative breakpoints from the design's testing strategy.
const VIEWPORT_WIDTHS = [320, 375, 768, 1024, 1280, 1920] as const;

// Tailwind font-size scale (px) used to compare Mobile (base) vs Desktop (md:/lg:)
// heading sizes. Source: Tailwind's default type scale.
const TEXT_SIZE_PX: Record<string, number> = {
  'text-xs': 12,
  'text-sm': 14,
  'text-base': 16,
  'text-lg': 18,
  'text-xl': 20,
  'text-2xl': 24,
  'text-3xl': 30,
  'text-4xl': 36,
  'text-5xl': 48,
};

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

/** The base (unprefixed) `text-*` size on an element, in px, or null if none. */
function baseTextPx(className: string): number | null {
  for (const token of className.split(/\s+/)) {
    if (token.includes(':')) continue; // skip responsive variants like md:text-2xl
    if (token in TEXT_SIZE_PX) return TEXT_SIZE_PX[token];
  }
  return null;
}

/** The largest `${prefix}:text-*` size on an element, in px, or null if none. */
function responsiveTextPx(className: string, prefix: 'md' | 'lg'): number | null {
  let max: number | null = null;
  for (const token of className.split(/\s+/)) {
    if (!token.startsWith(`${prefix}:text-`)) continue;
    const size = token.slice(prefix.length + 1); // strip "md:" / "lg:"
    if (size in TEXT_SIZE_PX) {
      max = max === null ? TEXT_SIZE_PX[size] : Math.max(max, TEXT_SIZE_PX[size]);
    }
  }
  return max;
}

// --- Pure helper: body text is always clamped into [14, 24]px (Req 9.1) -------
describe('clampFontSize keeps body text within [14, 24]px (Req 9.1)', () => {
  it('uses the readable bounds as defaults', () => {
    expect(FONT_MIN_PX).toBe(14);
    expect(FONT_MAX_PX).toBe(24);
  });

  it('clamps below-range, in-range, and above-range sizes into [14, 24]', () => {
    // Below range -> snapped up to the minimum.
    expect(clampFontSize(0)).toBe(14);
    expect(clampFontSize(8)).toBe(14);
    expect(clampFontSize(13.9)).toBe(14);
    expect(clampFontSize(-100)).toBe(14);

    // In range -> returned unchanged.
    expect(clampFontSize(14)).toBe(14);
    expect(clampFontSize(16)).toBe(16);
    expect(clampFontSize(20.5)).toBe(20.5);
    expect(clampFontSize(24)).toBe(24);

    // Above range -> snapped down to the maximum.
    expect(clampFontSize(24.1)).toBe(24);
    expect(clampFontSize(48)).toBe(24);
    expect(clampFontSize(10000)).toBe(24);
  });

  it('always returns a value within [14, 24] for a sweep of inputs', () => {
    for (let px = -50; px <= 200; px += 0.5) {
      const out = clampFontSize(px);
      expect(out).toBeGreaterThanOrEqual(14);
      expect(out).toBeLessThanOrEqual(24);
    }
  });
});

// --- CSS encodes the readable typography bounds (Req 9.1, 9.3, 9.7) -----------
describe('index.css encodes the readable typography bounds (Req 9.1, 9.3, 9.7)', () => {
  const css = readFileSync(path.resolve(process.cwd(), 'src/index.css'), 'utf8');

  it('declares the .fluid-body clamp with a 14px floor and 24px ceiling (Req 9.1)', () => {
    const match = css.match(
      /\.fluid-body\s*\{[^}]*font-size:\s*clamp\(\s*(\d+(?:\.\d+)?)px\s*,[^,]*,\s*(\d+(?:\.\d+)?)px\s*\)/,
    );
    expect(match, 'Expected a .fluid-body font-size: clamp(..px, .., ..px) rule').not.toBeNull();
    const minPx = Number(match![1]);
    const maxPx = Number(match![2]);
    expect(minPx).toBe(14);
    expect(maxPx).toBe(24);
    // Floor never below 14, ceiling never above 24 (Req 9.1).
    expect(minPx).toBeGreaterThanOrEqual(14);
    expect(maxPx).toBeLessThanOrEqual(24);
  });

  it('keeps .fluid-body and .readable-block line-heights within [1.4, 2.0] (Req 9.3)', () => {
    const blocks = [...css.matchAll(/\.(fluid-body|readable-block)\s*\{([^}]*)\}/g)];
    // Both utilities must be present.
    const names = blocks.map((b) => b[1]);
    expect(names).toContain('fluid-body');
    expect(names).toContain('readable-block');

    for (const [, name, body] of blocks) {
      const lh = body.match(/line-height:\s*([\d.]+)/);
      expect(lh, `Expected a line-height in .${name}`).not.toBeNull();
      const value = Number(lh![1]);
      expect(value, `.${name} line-height >= 1.4`).toBeGreaterThanOrEqual(1.4);
      expect(value, `.${name} line-height <= 2.0`).toBeLessThanOrEqual(2.0);
    }
  });

  it('retains the global body { overflow-x: hidden } guard (Req 9.7)', () => {
    expect(css).toMatch(/body\s*\{[^}]*overflow-x:\s*hidden/);
  });
});

// --- Rendered body text and headings carry the responsive utilities ----------
describe('rendered typography utilities and heading scale-up (Req 9.1, 9.2, 9.3, 9.7)', () => {
  beforeEach(() => {
    localStorage.clear();
    // App fires guarded network calls on mount; keep them off the network.
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
    document.documentElement.removeAttribute('data-theme');
    document.body.removeAttribute('data-theme');
  });

  it('applies .fluid-body and .readable-block to body text (Req 9.1, 9.3)', () => {
    setViewportWidth(375);
    const { container } = render(<App />);

    const fluidBody = container.querySelectorAll('.fluid-body');
    const readable = container.querySelectorAll('.readable-block');

    // Body copy opts into the fluid 14-24px clamp and readable line-height,
    // and at least one prominent text block opts into the readable spacing.
    expect(fluidBody.length).toBeGreaterThanOrEqual(1);
    expect(readable.length).toBeGreaterThanOrEqual(1);

    for (const el of Array.from(fluidBody)) {
      expect(el.className).toContain('fluid-body');
    }
  });

  it('renders headings with a Desktop size >= the Mobile size (Req 9.2)', () => {
    setViewportWidth(1280);
    const { container } = render(<App />);

    const headings = Array.from(container.querySelectorAll('h1, h2, h3')).filter(
      (h) => /\b(md|lg):text-/.test(h.className),
    );

    // The locked sign-in screen shows at least one scaled-up heading.
    expect(headings.length).toBeGreaterThanOrEqual(1);

    for (const heading of headings) {
      const base = baseTextPx(heading.className);
      const md = responsiveTextPx(heading.className, 'md');
      const lg = responsiveTextPx(heading.className, 'lg');
      const desktop = Math.max(md ?? 0, lg ?? 0);

      // A responsive size must be present and never smaller than the Mobile size.
      expect(desktop, `Expected a md:/lg: text size on "${heading.className}"`).toBeGreaterThan(0);
      if (base !== null) {
        expect(
          desktop,
          `Desktop heading (${desktop}px) must be >= Mobile heading (${base}px)`,
        ).toBeGreaterThanOrEqual(base);
      }
    }
  });

  it('produces no horizontal scroll, even at a 200%-zoom-equivalent narrow viewport (Req 9.7)', () => {
    // Emulate 200% zoom by halving the effective viewport width; the shell must
    // still clip horizontal overflow and not produce a wider scroll box.
    setViewportWidth(320);
    const { container } = render(<App />);

    const main = container.querySelector('main') as HTMLElement;
    const root = main.parentElement as HTMLElement;

    expect(root.className).toContain('overflow-x-hidden');
    expect(main.className).toContain('overflow-x-hidden');

    expect(root.scrollWidth).toBeLessThanOrEqual(root.clientWidth);
    expect(main.scrollWidth).toBeLessThanOrEqual(main.clientWidth);
  });
});

// --- Truncated text keeps an accessible full text (Req 9.5) -------------------
describe('truncation shows an ellipsis with accessible full text (Req 9.5)', () => {
  const activeOutfit: Outfit = {
    id: 'normal',
    name: 'Sunny',
    vietnameseName: 'Mặt Trời',
    description: '',
    cost: 0,
    unlocked: true,
    color: '#ff9600',
    iconName: 'sun',
  } as Outfit;

  const longName =
    'A Very Long Topic Name That Will Certainly Be Truncated On Narrow Cards To An Ellipsis';

  const topicCards = [
    {
      id: 'topic-1',
      topicId: 'topic-1',
      name: longName,
      vietnameseName: 'Tên Chủ Đề Rất Dài Sẽ Bị Cắt Bớt Thành Dấu Ba Chấm Trên Thẻ Hẹp',
      slug: 'family',
      description: 'A description that is also fairly long for the card body area.',
      tone: 'blue',
      lessonCount: 3,
      completedLessons: 1,
      totalLessons: 3,
      progress: 33,
    },
  ];

  afterEach(() => {
    cleanup();
  });

  function renderTopics(globalLang: 'en' | 'vi') {
    return render(
      <PathMap
        lessons={[] as Lesson[]}
        activeOutfit={activeOutfit}
        onStartLesson={() => {}}
        onOpenChest={() => {}}
        viewType="topic"
        topicCards={topicCards}
        isTopicsLoading={false}
        globalLang={globalLang}
      />,
    );
  }

  for (const lang of ['en', 'vi'] as const) {
    it(`pairs every .truncate-accessible element with a non-empty title (${lang})`, () => {
      const { container } = renderTopics(lang);

      const truncated = Array.from(container.querySelectorAll('.truncate-accessible'));
      expect(truncated.length).toBeGreaterThanOrEqual(1);

      for (const el of truncated) {
        // The ellipsis utility must be present (visual truncation indicator)...
        expect(el.className).toContain('truncate-accessible');
        // ...and the full text must remain accessible via a non-empty title.
        const title = el.getAttribute('title');
        expect(title, 'truncated element must carry a title for the full text').toBeTruthy();
        expect((title ?? '').trim().length).toBeGreaterThan(0);
        // The title carries the complete (untruncated) text.
        expect((title ?? '').trim()).toBe((el.textContent ?? '').trim());
      }
    });
  }
});
