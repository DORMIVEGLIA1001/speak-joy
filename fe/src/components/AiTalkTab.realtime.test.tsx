import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import AiTalkTab from './AiTalkTab';
import type { AppState } from '../types';

vi.mock('motion/react', () => ({
  motion: new Proxy({}, { get: () => (props: any) => <div {...props} /> }),
  AnimatePresence: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('./SunnyMascot', () => ({ default: () => <div data-testid="sunny" /> }));
vi.mock('./SessionRewardMascot', () => ({ default: () => null }));
vi.mock('./SpeakingTranscriptPanel', () => ({ default: () => null }));
vi.mock('./SpeakingCorrectionPanel', () => ({ default: () => null }));
vi.mock('../data', async () => {
  const actual = await vi.importActual<typeof import('../data')>('../data');
  return { ...actual, playAppSound: vi.fn() };
});

class FakeSpeechRecognition {
  static latest: FakeSpeechRecognition | null = null;

  continuous = false;
  interimResults = false;
  lang = '';
  maxAlternatives = 1;
  startCount = 0;
  onstart: (() => void) | null = null;
  onresult: ((event: any) => void) | null = null;
  onerror: ((event: any) => void) | null = null;
  onend: (() => void) | null = null;

  constructor() {
    FakeSpeechRecognition.latest = this;
  }

  start() {
    this.startCount += 1;
    this.onstart?.();
  }

  abort() {
    this.onend?.();
  }
}

class FakeSpeechSynthesisUtterance {
  text: string;
  rate = 1;
  pitch = 1;
  voice: SpeechSynthesisVoice | null = null;
  onstart: (() => void) | null = null;
  onend: (() => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;

  constructor(text: string) {
    this.text = text;
  }
}

class FakeResizeObserver {
  observe() {}
  disconnect() {}
}

const state: AppState = {
  currentTab: 'hoc',
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

describe('AiTalkTab realtime call contract', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('voice_settings_seen_parent-1', 'true');
    FakeSpeechRecognition.latest = null;
    (window as any).SpeechRecognition = FakeSpeechRecognition;
    (window as any).webkitSpeechRecognition = undefined;
    vi.stubGlobal('SpeechSynthesisUtterance', FakeSpeechSynthesisUtterance);
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      clearRect: vi.fn(),
      createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
      fillRect: vi.fn(),
      beginPath: vi.fn(),
      roundRect: vi.fn(),
      fill: vi.fn(),
      set fillStyle(_value: unknown) {},
    } as unknown as CanvasRenderingContext2D);
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: {
        cancel: vi.fn(),
        getVoices: vi.fn(() => []),
        speak: vi.fn((utterance: FakeSpeechSynthesisUtterance) => {
          utterance.onstart?.();
          queueMicrotask(() => utterance.onend?.());
        }),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      },
    });
  });

  it('sends each accepted realtime turn through the parent-configured streaming chat route', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/sessions') {
        return new Response(JSON.stringify({ data: { session: { id: 'session-1' } } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url === '/api/chat') {
        return new Response(
          'data: {"type":"delta","text":"Great answer!"}\n\n' +
            'data: {"type":"done","reply":"Great answer!","translation":""}\n\n',
          { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
        );
      }
      return new Response(JSON.stringify({ error: `Unexpected URL: ${url}` }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <AiTalkTab
        state={state}
        onUpdateStats={vi.fn()}
        currentUser={{ id: 'parent-1', email: 'parent@example.com' }}
        currentChild={{ id: 'child-1', name: 'Mai', age: 7 }}
        globalLang="en"
        globalTheme="light"
      />,
    );

    fireEvent.click(screen.getByTitle('Start calling Sunny'));
    await waitFor(() => expect(FakeSpeechRecognition.latest).not.toBeNull());
    await waitFor(() => expect(FakeSpeechRecognition.latest!.startCount).toBeGreaterThan(0), { timeout: 3000 });

    await act(async () => {
      await FakeSpeechRecognition.latest!.onresult?.({
        resultIndex: 0,
        results: [Object.assign([{ transcript: 'I played football with my friend today' }], { isFinal: true })],
      });
    });

    await waitFor(() => {
      const chatCalls = fetchMock.mock.calls.filter(([url]) => String(url).includes('/api/'));
      expect(chatCalls.some(([url]) => String(url) === '/api/chat')).toBe(true);
    }, { timeout: 2500 });
  });

  it('keeps listening across short pauses so one child sentence is not cut into tiny turns', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      if (String(input) === '/api/sessions') {
        return new Response(JSON.stringify({ data: { session: { id: 'session-1' } } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response('', { status: 200 });
    }));

    render(
      <AiTalkTab
        state={state}
        onUpdateStats={vi.fn()}
        currentUser={{ id: 'parent-1', email: 'parent@example.com' }}
        currentChild={{ id: 'child-1', name: 'Mai', age: 7 }}
        globalLang="en"
        globalTheme="light"
      />,
    );

    fireEvent.click(screen.getByTitle('Start calling Sunny'));
    await waitFor(() => expect(FakeSpeechRecognition.latest).not.toBeNull());

    expect(FakeSpeechRecognition.latest!.continuous).toBe(true);
    expect(FakeSpeechRecognition.latest!.interimResults).toBe(true);
    expect(FakeSpeechRecognition.latest!.maxAlternatives).toBe(3);
  });

  it('does not submit an unstable interim-only transcript as the child final answer', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      if (String(input) === '/api/sessions') {
        return new Response(JSON.stringify({ data: { session: { id: 'session-1' } } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response('', { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <AiTalkTab
        state={state}
        onUpdateStats={vi.fn()}
        currentUser={{ id: 'parent-1', email: 'parent@example.com' }}
        currentChild={{ id: 'child-1', name: 'Mai', age: 7 }}
        globalLang="en"
        globalTheme="light"
      />,
    );

    fireEvent.click(screen.getByTitle('Start calling Sunny'));
    await waitFor(() => expect(FakeSpeechRecognition.latest!.startCount).toBeGreaterThan(0), { timeout: 3000 });
    await act(async () => {
      await FakeSpeechRecognition.latest!.onresult?.({
        resultIndex: 0,
        results: [Object.assign([{ transcript: 'I want to tell' }], { isFinal: false })],
      });
    });

    await new Promise((resolve) => setTimeout(resolve, 1100));
    expect(fetchMock.mock.calls.some(([url]) => String(url) === '/api/chat')).toBe(false);
  });

  it('includes the completed previous turn in the next realtime request', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/sessions') {
        return new Response(JSON.stringify({ data: { session: { id: 'session-1' } } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.endsWith('/chat')) {
        return new Response(
          'data: {"type":"delta","text":"Great! What happened next?"}\n\n' +
            'data: {"type":"done","reply":"Great! What happened next?","translation":"","ask_repeat":"I played football today."}\n\n',
          { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
        );
      }
      return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <AiTalkTab
        state={state}
        onUpdateStats={vi.fn()}
        currentUser={{ id: 'parent-1', email: 'parent@example.com' }}
        currentChild={{ id: 'child-1', name: 'Mai', age: 7 }}
        globalLang="en"
        globalTheme="light"
      />,
    );

    fireEvent.click(screen.getByTitle('Start calling Sunny'));
    await waitFor(() => expect(FakeSpeechRecognition.latest).not.toBeNull());
    await waitFor(() => expect(FakeSpeechRecognition.latest!.startCount).toBeGreaterThan(0), { timeout: 3000 });

    await act(async () => {
      await FakeSpeechRecognition.latest!.onresult?.({
        resultIndex: 0,
        results: [Object.assign([{ transcript: 'I played football today' }], { isFinal: true })],
      });
    });
    await waitFor(() => expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/chat'))).toHaveLength(1), { timeout: 2500 });
    const startsAfterFirstTurn = FakeSpeechRecognition.latest!.startCount;
    await waitFor(() => expect(FakeSpeechRecognition.latest!.startCount).toBeGreaterThan(startsAfterFirstTurn), { timeout: 3000 });

    await act(async () => {
      await FakeSpeechRecognition.latest!.onresult?.({
        resultIndex: 0,
        results: [Object.assign([{ transcript: 'My team won the game' }], { isFinal: true })],
      });
    });
    await waitFor(() => expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/chat'))).toHaveLength(2), { timeout: 2500 });

    const secondChatCall = fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/chat'))[1];
    const secondPayload = JSON.parse(String((secondChatCall[1] as RequestInit).body));
    expect(secondPayload.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ role: 'user', content: 'I played football today' }),
        expect.objectContaining({ role: 'assistant', content: 'Great! What happened next?' }),
      ]),
    );
    expect(secondPayload.target_phrase).toBe('');
  }, 10000);

  it('routes text chat through the parent-configured BFF endpoint', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/sessions') {
        return new Response(JSON.stringify({ data: { session: { id: 'session-1' } } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url === '/api/chat') {
        return new Response(JSON.stringify({ reply: 'That sounds fun! What happened next?', translation: '' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ error: `Unexpected URL: ${url}` }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <AiTalkTab
        state={state}
        onUpdateStats={vi.fn()}
        currentUser={{ id: 'parent-1', email: 'parent@example.com' }}
        currentChild={{ id: 'child-1', name: 'Mai', age: 7 }}
        globalLang="en"
        globalTheme="light"
      />,
    );

    fireEvent.click(screen.getByText('Text chat'));
    const input = screen.getByPlaceholderText("Type the child's English sentence...");
    fireEvent.change(input, { target: { value: 'I played football today.' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/chat', expect.any(Object)));
    const chatCall = fetchMock.mock.calls.find(([url]) => String(url) === '/api/chat');
    expect(chatCall?.[1]).toEqual(expect.objectContaining({ credentials: 'include' }));
    expect(fetchMock.mock.calls.some(([url]) => String(url) === '/api/ai/chat')).toBe(false);
  });

  it('keeps all finalized speech chunks in text-chat dictation', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })));

    render(
      <AiTalkTab
        state={state}
        onUpdateStats={vi.fn()}
        currentUser={{ id: 'parent-1', email: 'parent@example.com' }}
        currentChild={{ id: 'child-1', name: 'Mai', age: 7 }}
        globalLang="en"
        globalTheme="light"
      />,
    );

    fireEvent.click(screen.getByText('Text chat'));
    fireEvent.click(screen.getByTitle('Speak in English! (Activate microphone)'));
    await act(async () => {
      await FakeSpeechRecognition.latest!.onresult?.({
        resultIndex: 0,
        results: [Object.assign([{ transcript: 'I like' }], { isFinal: true })],
      });
      await FakeSpeechRecognition.latest!.onresult?.({
        resultIndex: 0,
        results: [Object.assign([{ transcript: 'red apples' }], { isFinal: true })],
      });
    });

    expect(screen.getByRole('textbox')).toHaveValue('I like red apples');
  });

  it('aborts an in-flight realtime reply when the call view unmounts', async () => {
    let requestSignal: AbortSignal | undefined;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/sessions') {
        return new Response(JSON.stringify({ data: { session: { id: 'session-1' } } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url === '/api/chat') {
        requestSignal = init?.signal || undefined;
        return await new Promise<Response>((_resolve, reject) => {
          requestSignal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
        });
      }
      return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetchMock);

    const view = render(
      <AiTalkTab
        state={state}
        onUpdateStats={vi.fn()}
        currentUser={{ id: 'parent-1', email: 'parent@example.com' }}
        currentChild={{ id: 'child-1', name: 'Mai', age: 7 }}
        globalLang="en"
        globalTheme="light"
      />,
    );

    fireEvent.click(screen.getByTitle('Start calling Sunny'));
    await waitFor(() => expect(FakeSpeechRecognition.latest!.startCount).toBeGreaterThan(0), { timeout: 3000 });
    await act(async () => {
      await FakeSpeechRecognition.latest!.onresult?.({
        resultIndex: 0,
        results: [Object.assign([{ transcript: 'I went to the park today' }], { isFinal: true })],
      });
    });
    await waitFor(() => expect(requestSignal).toBeDefined(), { timeout: 2500 });

    view.unmount();

    expect(requestSignal?.aborted).toBe(true);
  });
});
