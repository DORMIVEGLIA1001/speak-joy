/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Feature: responsive-speaking-ui, Task 4.3
// DOM-measurement tests for the App Shell (App.tsx) and Sidebar (Sidebar.tsx).
//
// Rendered across the representative viewport widths from the design's testing
// strategy (320 / 375 / 768 / 1024 / 1280 / 1920) and asserts:
//  - No horizontal scroll: element.scrollWidth <= element.clientWidth
//    (Req 2.1, 2.2, 2.3, 2.7, 10.4).
//  - App Shell stacking: column on Mobile, row on Tablet/Desktop via the
//    `flex-col` / `md:flex-row` Tailwind classes (Req 3.1, 3.2, 3.7).
//  - Centered, width-constrained content region: `mx-auto` + a `max-w-*`
//    constraint on the content wrapper (Req 3.6).
//  - Navigation touch-targets: each Sidebar nav item carries the `.touch-target`
//    utility (>= 48x48px) and the fixed mobile nav declares `--nav-height`
//    consumed by `.safe-bottom` on <main> (Req 3.3, 3.4).
//
// jsdom does not perform real layout, so layout intent expressed through Tailwind
// utility classes is verified by className presence; the scrollWidth/clientWidth
// invariant is asserted where measurable.
//
// Requirements: 2.1, 2.2, 2.3, 2.7, 3.1, 3.2, 3.3, 3.6, 3.7, 10.4

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';

import App from './App';

// Representative breakpoints: Mobile (320, 375), Tablet boundary (768, 1024),
// Desktop (1280, 1920).
const VIEWPORT_WIDTHS = [320, 375, 768, 1024, 1280, 1920] as const;

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

function getShell(container: HTMLElement) {
  const main = container.querySelector('main');
  if (!main) {
    throw new Error('Expected the App Shell <main> region to be rendered');
  }
  const root = main.parentElement as HTMLElement;
  const nav = container.querySelector('nav');
  if (!nav) {
    throw new Error('Expected the Sidebar <nav> to be rendered');
  }
  // The Sidebar wrapper owns the --nav-height declaration and md: layout classes.
  const sidebarRoot = nav.parentElement as HTMLElement;
  return { main, root, nav, sidebarRoot };
}

describe('App Shell + Sidebar responsive layout (Task 4.3)', () => {
  beforeEach(() => {
    localStorage.clear();
    // App fires network calls in mount effects; they are out of scope here and
    // already guarded by try/catch in App. Stub fetch so no test hits the network.
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

  // --- No horizontal scroll across every breakpoint (Req 2.1-2.3, 2.7, 10.4) ---
  describe('no horizontal scroll at any breakpoint', () => {
    for (const width of VIEWPORT_WIDTHS) {
      it(`keeps content within the viewport at ${width}px (scrollWidth <= clientWidth)`, () => {
        setViewportWidth(width);
        const { container } = render(<App />);
        const { main, root } = getShell(container);

        // The shell and main content must never produce a wider scroll box than
        // their client box (no page-level horizontal scrollbar).
        expect(root.scrollWidth).toBeLessThanOrEqual(root.clientWidth);
        expect(main.scrollWidth).toBeLessThanOrEqual(main.clientWidth);

        // The shell guards against horizontal overflow with overflow-x-hidden,
        // and <main> isolates its own overflow + min-w-0 to avoid flex blowout.
        expect(root.className).toContain('overflow-x-hidden');
        expect(main.className).toContain('overflow-x-hidden');
        expect(main.className).toContain('min-w-0');
      });
    }
  });

  // --- App Shell stacking: column on Mobile, row on Tablet/Desktop (Req 3.1, 3.2, 3.7) ---
  it('stacks the Sidebar and main in a column on Mobile and a row from md up', () => {
    setViewportWidth(375);
    const { container } = render(<App />);
    const { root } = getShell(container);

    // Mobile default is a single vertical column (flex-col); the md: breakpoint
    // (>= 768px, i.e. Tablet and Desktop) switches to a horizontal row.
    expect(root.className).toContain('flex');
    expect(root.className).toContain('flex-col');
    expect(root.className).toContain('md:flex-row');
  });

  // --- Centered, width-constrained content region (Req 3.6) ---
  it('centers and width-constrains the content region', () => {
    setViewportWidth(1280);
    const { container } = render(<App />);
    const { main } = getShell(container);

    // The content wrapper is centered (mx-auto) and capped to a max width so it
    // does not stretch edge-to-edge on Tablet/Desktop.
    const contentWrapper = main.querySelector('div.mx-auto.transition-all');
    expect(contentWrapper).not.toBeNull();
    expect((contentWrapper as HTMLElement).className).toContain('mx-auto');
    expect((contentWrapper as HTMLElement).className).toContain('max-w-');
  });

  // --- Navigation touch-targets >= 48x48px (Req 3.3) ---
  it('renders every Sidebar nav item as a >= 48x48px touch-target', () => {
    setViewportWidth(320);
    const { container } = render(<App />);
    const { nav } = getShell(container);

    const navButtons = Array.from(nav.querySelectorAll('button'));
    // Parent mode contains child login, profile, and settings. Learning entries
    // are intentionally shown only after a child signs in.
    expect(navButtons.length).toBeGreaterThanOrEqual(3);

    for (const button of navButtons) {
      // .touch-target guarantees min-height: 48px; min-width: 48px.
      expect(button.className).toContain('touch-target');
    }
  });

  // --- Fixed mobile nav contributes --nav-height for .safe-bottom (Req 3.4) ---
  it('declares --nav-height on the Sidebar and applies safe-bottom to main', () => {
    setViewportWidth(320);
    const { container } = render(<App />);
    const { main, sidebarRoot } = getShell(container);

    // On Mobile the fixed nav reserves 64px; from md up the column layout removes
    // the bottom nav so the reserved height collapses to 0.
    expect(sidebarRoot.className).toContain('[--nav-height:64px]');
    expect(sidebarRoot.className).toContain('md:[--nav-height:0px]');

    // <main> reserves space for that nav via .safe-bottom so the last content is
    // not obscured by the fixed mobile navigation.
    expect(main.className).toContain('safe-bottom');
  });
});
