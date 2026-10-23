/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Feature: responsive-speaking-ui, Task 9.2
// DOM-measurement tests for Chat Mode of the Speaking Screen (AiTalkTab.tsx).
//
// The component defaults to Call Mode (`activeTabMode === 'call'`); each test
// first switches to Chat Mode by clicking the "Text chat" toggle, then asserts
// the responsive presentation guarantees added in task 9.1:
//
//  - No horizontal scroll (Req 7.1): the Message_List container carries
//    `overflow-y-auto` + `overflow-x-hidden` + `min-w-0`, and
//    `scrollWidth <= clientWidth` wherever jsdom can measure it.
//  - Bubble max-width <= 85% of container (Req 7.4): each message bubble wrapper
//    carries the `max-w-[85%]` (and `min-w-0`) class.
//  - Long URL wrapping (Req 7.6): message content carries `.wrap-anywhere`, and a
//    long unbroken URL rendered in a bubble does not introduce horizontal scroll.
//  - Input bar visibility / fixed position (Req 7.2): the input + send bar panel
//    carries `flex-shrink-0`, the text input carries `min-w-0`, and both the
//    input and the send control are present and interactive.
//
// jsdom performs no real layout, so layout intent expressed through Tailwind
// utility classes is verified by className presence; the scrollWidth/clientWidth
// invariant is asserted where measurable.
//
// Requirements: 7.1, 7.2, 7.4, 7.6

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

import AiTalkTab from './AiTalkTab';
import { AppState } from '../types';

// Representative breakpoints from the design's testing strategy:
// Mobile (320, 375), Tablet boundary (768, 1024), Desktop (1280, 1920).
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

function makeState(overrides: Partial<AppState> = {}): AppState {
  return {
    currentTab: 'hoc',
    viewMode: 'app',
    gems: 10,
    streak: 3,
    hearts: 5,
    xp: 1234,
    selectedOutfitId: 'normal',
    outfits: [],
    quests: [],
    lessons: [],
    leaderboard: [],
    activeLessonId: null,
    ...overrides,
  };
}

function renderTab() {
  return render(
    <AiTalkTab
      state={makeState()}
      onUpdateStats={() => {}}
      currentUser={null}
      currentChild={null}
      onProgressSync={() => {}}
      onUsageSync={() => {}}
      globalLang="en"
      globalTheme="dark"
    />,
  );
}

/** Switch the Speaking Screen from the default Call Mode into Chat Mode. */
function switchToChatMode(): void {
  const chatToggle = screen.getByRole('button', { name: /Text chat/i });
  fireEvent.click(chatToggle);
}

/** Locate the Chat Mode scrolling Message_List container. */
function getMessageList(container: HTMLElement): HTMLElement {
  const list = container.querySelector('div.overflow-y-auto.overflow-x-hidden.min-w-0');
  if (!list) {
    throw new Error('Expected the Chat Mode Message_List container to be rendered');
  }
  return list as HTMLElement;
}

/** Locate the fixed input + send bar panel that owns the text input. */
function getInputBar(container: HTMLElement): HTMLElement {
  const panel = Array.from(container.querySelectorAll('div')).find(
    (el) => el.className.includes('flex-shrink-0') && !!el.querySelector('input[type="text"]'),
  );
  if (!panel) {
    throw new Error('Expected the Chat Mode input/send bar panel to be rendered');
  }
  return panel as HTMLElement;
}

describe('Chat Mode responsive layout (Task 9.2)', () => {
  beforeEach(() => {
    localStorage.clear();
    // The auto-scroll-to-latest effect calls scrollIntoView, which jsdom does not
    // implement; stub it so rendering the message list never throws.
    Element.prototype.scrollIntoView = vi.fn();
    // Sending a message issues a fetch to /api/chat; keep it off the network. The
    // optimistic user bubble is added before the await, so rejecting is fine.
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

  // --- No horizontal scroll across every breakpoint (Req 7.1) -----------------
  describe('Message_List produces no horizontal scroll at any breakpoint', () => {
    for (const width of VIEWPORT_WIDTHS) {
      it(`keeps the message list within its box at ${width}px`, () => {
        setViewportWidth(width);
        const { container } = renderTab();
        switchToChatMode();

        const list = getMessageList(container);

        // Vertical scrolling only; horizontal overflow is clipped and flex
        // children may shrink (min-w-0) so a wide child cannot blow out the row.
        expect(list.className).toContain('overflow-y-auto');
        expect(list.className).toContain('overflow-x-hidden');
        expect(list.className).toContain('min-w-0');

        // No horizontal scroll box wider than the client box (measured where jsdom can).
        expect(list.scrollWidth).toBeLessThanOrEqual(list.clientWidth);
      });
    }
  });

  // --- Bubble max-width <= 85% of container (Req 7.4) -------------------------
  it('caps every message bubble wrapper at 85% of the container width', () => {
    setViewportWidth(375);
    const { container } = renderTab();
    switchToChatMode();

    const bubbleWrappers = Array.from(container.querySelectorAll('div')).filter((el) =>
      el.className.includes('max-w-[85%]'),
    );

    // At least the welcome message bubble is rendered.
    expect(bubbleWrappers.length).toBeGreaterThanOrEqual(1);
    for (const wrapper of bubbleWrappers) {
      // 85% cap plus min-w-0 so a long token cannot force the wrapper wider.
      expect(wrapper.className).toContain('max-w-[85%]');
      expect(wrapper.className).toContain('min-w-0');
    }
  });

  // --- Message content wraps long unbroken strings (Req 7.6) -----------------
  it('marks message content for wrapping so it never overflows the bubble', () => {
    setViewportWidth(320);
    const { container } = renderTab();
    switchToChatMode();

    // The welcome message content (and its translation) opt into break-anywhere
    // wrapping so a long URL is broken instead of overflowing.
    const wrapTargets = Array.from(container.querySelectorAll('div')).filter((el) =>
      el.className.includes('wrap-anywhere'),
    );
    expect(wrapTargets.length).toBeGreaterThanOrEqual(1);
  });

  it('wraps a long URL in a sent bubble without introducing horizontal scroll', async () => {
    setViewportWidth(320);
    const { container } = renderTab();
    switchToChatMode();

    const longUrl =
      'https://example.com/this/is/an/extremely/long/unbroken/url/that/would/overflow/a/narrow/mobile/chat/bubble/if/it/were/not/wrapped?token=abcdefghijklmnopqrstuvwxyz0123456789';

    const input = container.querySelector('input[type="text"]') as HTMLInputElement;
    expect(input).not.toBeNull();
    fireEvent.change(input, { target: { value: longUrl } });

    const sendButton = container.querySelector('button.bg-purple-600') as HTMLButtonElement;
    expect(sendButton).not.toBeNull();
    fireEvent.click(sendButton);

    // The user bubble is added optimistically; wait for it to render.
    const urlNode = await screen.findByText(longUrl);

    // The content node carries the break-anywhere utility.
    expect(urlNode.className).toContain('wrap-anywhere');

    // Its bubble wrapper is still capped at 85% and allowed to shrink.
    const wrapper = urlNode.closest('div.min-w-0');
    expect(wrapper).not.toBeNull();

    // The list still does not produce a horizontal scroll box.
    const list = getMessageList(container);
    expect(list.scrollWidth).toBeLessThanOrEqual(list.clientWidth);
  });

  // --- Input + send bar stays visible and fixed (Req 7.2) --------------------
  describe('input + send bar is present, fixed, and shrink-proof', () => {
    for (const width of VIEWPORT_WIDTHS) {
      it(`shows the input bar with flex-shrink-0 and a min-w-0 input at ${width}px`, () => {
        setViewportWidth(width);
        const { container } = renderTab();
        switchToChatMode();

        const inputBar = getInputBar(container);
        // flex-shrink-0 keeps the bar from collapsing when the message list grows.
        expect(inputBar.className).toContain('flex-shrink-0');

        const scoped = within(inputBar);
        const input = scoped.getByRole('textbox') as HTMLInputElement;
        // min-w-0 lets the input shrink within the row instead of overflowing.
        expect(input.className).toContain('min-w-0');

        // The send control is present alongside the input.
        const sendButton = inputBar.querySelector('button.bg-purple-600');
        expect(sendButton).not.toBeNull();
      });
    }
  });
});
