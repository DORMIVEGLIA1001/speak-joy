import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

import AiTalkTab from './AiTalkTab';
import type { AppState } from '../types';

class MockAudio {
  static instances: MockAudio[] = [];

  src: string;
  playbackRate = 1;
  onplay: (() => void) | null = null;
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  pause = vi.fn();

  constructor(src: string) {
    this.src = src;
    MockAudio.instances.push(this);
  }

  play = vi.fn(async () => {
    this.onplay?.();
  });
}

function makeState(): AppState {
  return {
    currentTab: 'hoc',
    viewMode: 'app',
    gems: 10,
    streak: 3,
    hearts: 5,
    xp: 120,
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

function audioResponse() {
  return {
    ok: true,
    headers: { get: () => 'audio/wav' },
    blob: async () => new Blob([new Uint8Array(64)], { type: 'audio/wav' }),
  };
}

describe('AiTalkTab project voice sentence queue', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('assistant_voice_id', 'project:sunny-test');
    Element.prototype.scrollIntoView = vi.fn();
    MockAudio.instances = [];
    vi.stubGlobal('Audio', MockAudio as any);
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: vi.fn((_: Blob) => `blob:test-${MockAudio.instances.length}`),
      revokeObjectURL: vi.fn(),
    });
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: {
        cancel: vi.fn(),
        speak: vi.fn((utterance: any) => {
          utterance?.onstart?.();
          utterance?.onend?.();
        }),
        getVoices: vi.fn(() => []),
        onvoiceschanged: null,
      },
    });
    vi.stubGlobal('SpeechSynthesisUtterance', function (this: any, text: string) {
      this.text = text;
      this.onstart = null;
      this.onend = null;
      this.onerror = null;
    } as any);
    vi.stubGlobal('AudioContext', vi.fn(() => ({
      createOscillator: vi.fn(() => ({
        type: 'sine',
        frequency: { value: 0 },
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
      })),
      createGain: vi.fn(() => ({
        gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
        connect: vi.fn(),
      })),
      destination: {},
      currentTime: 0,
      close: vi.fn(),
    })) as any);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('prefetches one sentence and plays chunks in order', async () => {
    const ttsTexts: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === '/api/tts/voices') {
        return { ok: true, json: async () => [{ id: 'sunny-test', name: 'Sunny Test' }] } as Response;
      }
      if (String(input) === '/api/tts' && init?.method === 'POST') {
        ttsTexts.push(JSON.parse(String(init.body)).text);
        return audioResponse() as unknown as Response;
      }
      return { ok: true, json: async () => ({}) } as Response;
    }));

    renderTab();
    fireEvent.click(await screen.findByRole('button', { name: /Test Sunny voice/i }));

    await waitFor(() => expect(ttsTexts).toEqual([
      'Hello there, little star!',
      "Let's talk together in English!",
    ]));
    await waitFor(() => expect(MockAudio.instances).toHaveLength(1));

    MockAudio.instances[0].onended?.();
    await waitFor(() => expect(MockAudio.instances).toHaveLength(2));
    expect(MockAudio.instances[0].play).toHaveBeenCalledTimes(1);
    expect(MockAudio.instances[1].play).toHaveBeenCalledTimes(1);

    MockAudio.instances[1].onended?.();
  });

  it('retries once then falls back only the failed sentence to browser speech', async () => {
    let ttsAttempts = 0;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === '/api/tts/voices') {
        return { ok: true, json: async () => [{ id: 'sunny-test', name: 'Sunny Test' }] } as Response;
      }
      if (String(input) === '/api/tts' && init?.method === 'POST') {
        ttsAttempts += 1;
        if (ttsAttempts <= 2) {
          return { ok: false, json: async () => ({ message: 'temporary error' }) } as Response;
        }
        return audioResponse() as unknown as Response;
      }
      return { ok: true, json: async () => ({}) } as Response;
    }));

    renderTab();
    fireEvent.click(await screen.findByRole('button', { name: /Test Sunny voice/i }));

    await waitFor(() => expect((window.speechSynthesis as any).speak).toHaveBeenCalledTimes(1));
    const fallbackUtterance = (window.speechSynthesis as any).speak.mock.calls[0][0];
    expect(fallbackUtterance.text).toBe('Hello there, little star!');
    await waitFor(() => expect(MockAudio.instances).toHaveLength(1));
    MockAudio.instances[0].onended?.();
  });
});
