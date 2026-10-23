import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

import AiTalkTab from './AiTalkTab';
import type { AppState } from '../types';

function makeState(overrides: Partial<AppState> = {}): AppState {
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

describe('AiTalkTab speaking coach panels', () => {
  beforeEach(() => {
    localStorage.clear();
    Element.prototype.scrollIntoView = vi.fn();
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
    vi.stubGlobal('AudioContext', vi.fn(() => ({
      createOscillator: vi.fn(() => ({
        type: 'sine',
        frequency: { value: 0 },
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
      })),
      createGain: vi.fn(() => ({
        gain: {
          setValueAtTime: vi.fn(),
          exponentialRampToValueAtTime: vi.fn(),
        },
        connect: vi.fn(),
      })),
      destination: {},
      currentTime: 0,
      close: vi.fn(),
    })) as any);
    vi.stubGlobal('SpeechSynthesisUtterance', function (this: any, text: string) {
      this.text = text;
      this.lang = 'en-US';
      this.rate = 1;
      this.pitch = 1;
      this.onstart = null;
      this.onend = null;
      this.onerror = null;
    } as any);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('renders transcript and correction panels from the new speaking coach payload', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          reply: 'Great try. Say elephant slowly.',
          translation: 'Con làm tốt lắm. Hãy nói elephant chậm lại nhé.',
          score: 78,
          word_statuses: [{ word: 'elephant', status: 'incorrect', ipa: 'EH-luh-fuhnt', tip_vi: 'Mở miệng rộng hơn nhé.' }],
          praise: 'Great try!',
          corrections: [
            {
              mistake_word: 'elepant',
              correct_word: 'elephant',
              phonetic_hint: 'EH-luh-fuhnt',
              instruction: 'Say it slowly with Sunny.',
              example_sentence: 'I like elephant.',
              type: 'pronunciation',
            },
          ],
          ask_repeat: 'I like elephant.',
          pronunciation_score: 78,
          continue_question: 'Can you say it one more time?',
        }),
      })),
    );

    renderTab();
    fireEvent.click(screen.getByRole('button', { name: /Text chat/i }));
    fireEvent.click(screen.getByRole('button', { name: /My name is John!/i }));

    expect(await screen.findByText(/You said/i)).toBeTruthy();
    expect(screen.getByText(/Pronunciation score/i)).toBeTruthy();
    expect(screen.getByText(/Repeat after Sunny/i)).toBeTruthy();
    expect(screen.getByText('EH-luh-fuhnt')).toBeTruthy();
    expect(screen.getByText(/I like elephant\./i)).toBeTruthy();
    await waitFor(() => {
      expect((window.speechSynthesis as any).speak).toHaveBeenCalled();
    });
  });

  it('falls back to legacy word_statuses payload without crashing the coach UI', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          reply: 'Nice effort! Let us try that sentence again.',
          translation: 'Cố gắng tốt lắm! Mình thử lại câu đó nhé.',
          score: 64,
          word_statuses: [{ word: 'John', status: 'missing', ipa: 'JOHN', tip_vi: 'Thêm từ John vào cuối câu nhé.' }],
        }),
      })),
    );

    renderTab();
    fireEvent.click(screen.getByRole('button', { name: /Text chat/i }));
    fireEvent.click(screen.getByRole('button', { name: /My name is John!/i }));

    await waitFor(() => {
      expect(screen.getByText(/Pronunciation score/i)).toBeTruthy();
    });
    expect(screen.getByText(/Repeat after Sunny/i)).toBeTruthy();
    expect(screen.getByText('Thêm từ John vào cuối câu nhé.')).toBeTruthy();
    await waitFor(() => {
      expect((window.speechSynthesis as any).speak).toHaveBeenCalled();
    });
  });
});
