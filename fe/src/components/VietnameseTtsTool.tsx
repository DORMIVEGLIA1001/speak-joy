import React, { useEffect, useMemo, useRef, useState } from 'react';
import { LoaderCircle, Play, RefreshCw, Square, Upload, Volume2, WandSparkles } from 'lucide-react';

type ProjectVoice = {
  id: string;
  name: string;
};

type VietnameseTtsToolProps = {
  globalLang: 'en' | 'vi';
  globalTheme: 'dark' | 'light';
};

const DEFAULT_TEXT = 'Xin chào! Đây là công cụ thử giọng VieNeu TTS cho tiếng Việt. Bạn có thể dán một đoạn văn dài vào đây, chọn giọng đọc, rồi bấm đọc thử.';
const DEFAULT_CLONE_TEXT = 'Xin chào, đây là phần thử clone giọng nói bằng VieNeu TTS.';
const CHUNK_SIZE = 900;

function splitVietnameseText(text: string, maxLength = CHUNK_SIZE) {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return [];

  const sentences = normalized.match(/[^.!?。！？…]+[.!?。！？…]*\s*/g) || [normalized];
  const chunks: string[] = [];
  let current = '';

  for (const rawSentence of sentences) {
    const sentence = rawSentence.trim();
    if (!sentence) continue;

    if (sentence.length > maxLength) {
      if (current) {
        chunks.push(current);
        current = '';
      }
      for (let i = 0; i < sentence.length; i += maxLength) {
        chunks.push(sentence.slice(i, i + maxLength).trim());
      }
      continue;
    }

    const next = current ? `${current} ${sentence}` : sentence;
    if (next.length > maxLength) {
      chunks.push(current);
      current = sentence;
    } else {
      current = next;
    }
  }

  if (current) chunks.push(current);
  return chunks;
}

export default function VietnameseTtsTool({ globalLang, globalTheme }: VietnameseTtsToolProps) {
  const isEnglish = globalLang === 'en';
  const isLight = globalTheme === 'light';
  const [text, setText] = useState(DEFAULT_TEXT);
  const [voices, setVoices] = useState<ProjectVoice[]>([]);
  const [voiceId, setVoiceId] = useState('');
  const [style, setStyle] = useState('tu_nhien');
  const [loadingVoices, setLoadingVoices] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [cloning, setCloning] = useState(false);
  const [currentChunk, setCurrentChunk] = useState(0);
  const [cloneText, setCloneText] = useState(DEFAULT_CLONE_TEXT);
  const [refAudio, setRefAudio] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const objectUrlsRef = useRef<Set<string>>(new Set());
  const playTokenRef = useRef(0);

  const chunks = useMemo(() => splitVietnameseText(text), [text]);
  const charCount = text.trim().length;

  const releaseAudioUrls = () => {
    for (const url of objectUrlsRef.current) URL.revokeObjectURL(url);
    objectUrlsRef.current.clear();
  };

  const stopPlayback = () => {
    playTokenRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
      audioRef.current = null;
    }
    releaseAudioUrls();
    setPlaying(false);
    setCloning(false);
  };

  useEffect(() => () => stopPlayback(), []);

  const loadVoices = async () => {
    setLoadingVoices(true);
    setError(null);
    try {
      const response = await fetch('/api/tts/voices');
      const payload = await response.json().catch(() => []);
      if (!response.ok) throw new Error(payload?.message || payload?.detail || 'Unable to load voices.');
      const nextVoices = Array.isArray(payload)
        ? payload.map((voice) => ({ id: String(voice.id || voice.name || ''), name: String(voice.name || voice.id || '') })).filter((voice) => voice.id)
        : [];
      setVoices(nextVoices);
      if (!voiceId && nextVoices.length > 0) setVoiceId(nextVoices[0].id);
    } catch (err) {
      setError(err instanceof Error ? err.message : (isEnglish ? 'Unable to load VieNeu voices.' : 'Không thể tải danh sách giọng VieNeu.'));
    } finally {
      setLoadingVoices(false);
    }
  };

  useEffect(() => {
    void loadVoices();
  }, []);

  const playAudioBlob = (blob: Blob, token: number) => new Promise<void>((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    objectUrlsRef.current.add(url);
    const audio = new Audio(url);
    audioRef.current = audio;
    audio.onended = () => {
      URL.revokeObjectURL(url);
      objectUrlsRef.current.delete(url);
      if (token === playTokenRef.current) resolve();
    };
    audio.onerror = () => reject(new Error(isEnglish ? 'Audio playback failed.' : 'Không thể phát audio.'));
    audio.play().catch(reject);
  });

  const synthesizeChunk = async (chunk: string, signal: AbortSignal) => {
    const response = await fetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: chunk,
        voice_id: voiceId || undefined,
        style,
      }),
      signal,
    });
    const contentType = response.headers.get('content-type') || '';
    if (!response.ok) {
      const payload = contentType.includes('application/json') ? await response.json().catch(() => ({})) : {};
      throw new Error(payload?.message || payload?.detail || (isEnglish ? 'VieNeu TTS request failed.' : 'Yêu cầu VieNeu TTS thất bại.'));
    }
    const blob = await response.blob();
    if (!contentType.toLowerCase().includes('audio/') || blob.size <= 44) {
      throw new Error(isEnglish ? 'VieNeu returned invalid audio.' : 'VieNeu trả về audio không hợp lệ.');
    }
    return blob;
  };

  const playText = async () => {
    if (chunks.length === 0) {
      setError(isEnglish ? 'Enter Vietnamese text first.' : 'Hãy nhập văn bản tiếng Việt trước.');
      return;
    }

    stopPlayback();
    const token = playTokenRef.current;
    const controller = new AbortController();
    abortRef.current = controller;
    setPlaying(true);
    setError(null);
    setMessage(null);

    try {
      for (let index = 0; index < chunks.length; index += 1) {
        if (token !== playTokenRef.current || controller.signal.aborted) return;
        setCurrentChunk(index + 1);
        const blob = await synthesizeChunk(chunks[index], controller.signal);
        await playAudioBlob(blob, token);
      }
      setMessage(isEnglish ? 'Finished reading the full text.' : 'Đã đọc xong toàn bộ văn bản.');
    } catch (err) {
      if (!controller.signal.aborted) {
        setError(err instanceof Error ? err.message : (isEnglish ? 'Unable to read this text.' : 'Không thể đọc văn bản này.'));
      }
    } finally {
      if (token === playTokenRef.current) {
        setPlaying(false);
        abortRef.current = null;
      }
    }
  };

  const cloneVoice = async () => {
    if (!refAudio) {
      setError(isEnglish ? 'Choose a 3-8 second reference audio file first.' : 'Hãy chọn file audio mẫu 3-8 giây trước.');
      return;
    }
    if (!cloneText.trim()) {
      setError(isEnglish ? 'Enter text for the cloned voice to read.' : 'Hãy nhập nội dung cần đọc bằng giọng clone.');
      return;
    }

    stopPlayback();
    const token = playTokenRef.current;
    const controller = new AbortController();
    abortRef.current = controller;
    setCloning(true);
    setPlaying(true);
    setCurrentChunk(1);
    setError(null);
    setMessage(null);

    try {
      const formData = new FormData();
      formData.append('text', cloneText.trim());
      formData.append('ref_audio', refAudio);
      formData.append('style', style);

      const response = await fetch('/api/tts/clone', {
        method: 'POST',
        body: formData,
        signal: controller.signal,
      });
      const contentType = response.headers.get('content-type') || '';
      if (!response.ok) {
        const payload = contentType.includes('application/json') ? await response.json().catch(() => ({})) : {};
        throw new Error(payload?.message || payload?.detail || (isEnglish ? 'VieNeu voice clone failed.' : 'Clone giọng VieNeu thất bại.'));
      }
      const blob = await response.blob();
      if (!contentType.toLowerCase().includes('audio/') || blob.size <= 44) {
        throw new Error(isEnglish ? 'VieNeu returned invalid cloned audio.' : 'VieNeu trả về audio clone không hợp lệ.');
      }
      await playAudioBlob(blob, token);
      setMessage(isEnglish ? 'Finished playing cloned voice.' : 'Đã phát xong giọng clone.');
    } catch (err) {
      if (!controller.signal.aborted) {
        setError(err instanceof Error ? err.message : (isEnglish ? 'Unable to clone this voice.' : 'Không thể clone giọng này.'));
      }
    } finally {
      if (token === playTokenRef.current) {
        setPlaying(false);
        setCloning(false);
        abortRef.current = null;
      }
    }
  };

  return (
    <section className={`rounded-[20px] border p-5 ${isLight ? 'border-[var(--app-border)] bg-[var(--app-bg-alt)]' : 'border-[var(--app-border)] bg-black/20'}`}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Volume2 className="h-5 w-5 text-rose-500" />
            <h2 className="text-lg font-black">{isEnglish ? 'VieNeu Vietnamese TTS tool' : 'Công cụ đọc tiếng Việt VieNeu TTS'}</h2>
          </div>
          <p className="mt-1 text-sm text-[var(--app-text-muted)]">
            {isEnglish ? 'Paste a long Vietnamese text and the tool will read it in queued chunks.' : 'Dán đoạn tiếng Việt dài, công cụ sẽ tự chia đoạn và đọc lần lượt.'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadVoices()}
          disabled={loadingVoices}
          className={`inline-flex min-h-10 items-center gap-2 rounded-xl border px-3 text-xs font-black uppercase ${isLight ? 'border-rose-200 bg-white text-rose-600' : 'border-rose-500/30 bg-rose-500/10 text-rose-200'} disabled:opacity-60`}
        >
          {loadingVoices ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          {isEnglish ? 'Voices' : 'Giọng'}
        </button>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <label className="text-xs font-black uppercase">
          {isEnglish ? 'Voice' : 'Giọng đọc'}
          <select
            value={voiceId}
            onChange={(event) => setVoiceId(event.target.value)}
            className={`mt-2 min-h-12 w-full rounded-xl border px-3 text-sm font-bold normal-case ${isLight ? 'border-[var(--app-border)] bg-white text-[var(--app-text)]' : 'border-[var(--app-border)] bg-black/30 text-white'}`}
          >
            {voices.length === 0 && <option value="">{isEnglish ? 'Service default' : 'Mặc định của dịch vụ'}</option>}
            {voices.map((voice) => <option key={voice.id} value={voice.id}>{voice.name}</option>)}
          </select>
        </label>

        <label className="text-xs font-black uppercase">
          {isEnglish ? 'Style' : 'Phong cách'}
          <select
            value={style}
            onChange={(event) => setStyle(event.target.value)}
            className={`mt-2 min-h-12 w-full rounded-xl border px-3 text-sm font-bold normal-case ${isLight ? 'border-[var(--app-border)] bg-white text-[var(--app-text)]' : 'border-[var(--app-border)] bg-black/30 text-white'}`}
          >
            <option value="tu_nhien">Tự nhiên</option>
            <option value="tin_tuc">Tin tức</option>
            <option value="doc_truyen">Đọc truyện</option>
          </select>
        </label>
      </div>

      <label className="mt-4 block text-xs font-black uppercase">
        {isEnglish ? 'Vietnamese text' : 'Văn bản tiếng Việt'}
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          rows={9}
          maxLength={20000}
          className={`mt-2 w-full resize-y rounded-xl border p-4 text-sm font-semibold normal-case leading-7 outline-none focus:border-rose-400 ${isLight ? 'border-[var(--app-border)] bg-white text-[var(--app-text)]' : 'border-[var(--app-border)] bg-black/30 text-white'}`}
        />
      </label>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-bold text-[var(--app-text-muted)]">
        <span>{charCount.toLocaleString()} / 20,000 {isEnglish ? 'characters' : 'ký tự'}</span>
        <span>•</span>
        <span>{chunks.length} {isEnglish ? 'audio chunks' : 'đoạn audio'}</span>
        {playing && !cloning && (
          <>
            <span>•</span>
            <span className="text-rose-500">{isEnglish ? 'Reading' : 'Đang đọc'} {currentChunk}/{chunks.length}</span>
          </>
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => void playText()}
          disabled={playing || chunks.length === 0}
          className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-rose-500 px-5 text-sm font-black uppercase text-white shadow disabled:cursor-not-allowed disabled:opacity-60"
        >
          {playing ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          {isEnglish ? 'Read text' : 'Đọc văn bản'}
        </button>
        <button
          type="button"
          onClick={stopPlayback}
          disabled={!playing}
          className={`inline-flex min-h-12 items-center gap-2 rounded-xl border px-5 text-sm font-black uppercase disabled:cursor-not-allowed disabled:opacity-60 ${isLight ? 'border-slate-200 bg-white text-slate-700' : 'border-white/10 bg-white/5 text-white'}`}
        >
          <Square className="h-4 w-4" />
          {isEnglish ? 'Stop' : 'Dừng'}
        </button>
      </div>

      <div className={`mt-5 rounded-2xl border p-4 ${isLight ? 'border-rose-100 bg-white/70' : 'border-rose-500/20 bg-rose-500/5'}`}>
        <div className="flex items-center gap-2">
          <WandSparkles className="h-5 w-5 text-rose-500" />
          <h3 className="text-sm font-black uppercase">{isEnglish ? 'Clone a voice' : 'Clone giọng nói'}</h3>
        </div>
        <p className="mt-1 text-xs font-bold text-[var(--app-text-muted)]">
          {isEnglish ? 'Upload a short 3-8s sample, then type the Vietnamese sentence to synthesize.' : 'Tải lên mẫu giọng ngắn 3-8 giây, rồi nhập câu tiếng Việt cần đọc.'}
        </p>

        <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
          <label className={`flex min-h-32 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed p-4 text-center ${isLight ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-rose-500/30 bg-black/20 text-rose-100'}`}>
            <Upload className="mb-2 h-6 w-6" />
            <span className="text-xs font-black uppercase">{isEnglish ? 'Reference audio' : 'Audio mẫu'}</span>
            <span className="mt-1 max-w-full truncate text-xs font-bold text-[var(--app-text-muted)]">
              {refAudio ? refAudio.name : (isEnglish ? 'wav, mp3, flac, m4a, ogg...' : 'wav, mp3, flac, m4a, ogg...')}
            </span>
            <input
              type="file"
              accept=".wav,.mp3,.flac,.m4a,.ogg,.opus,audio/*"
              className="sr-only"
              onChange={(event) => setRefAudio(event.target.files?.[0] || null)}
            />
          </label>

          <label className="text-xs font-black uppercase">
            {isEnglish ? 'Text for cloned voice' : 'Nội dung đọc bằng giọng clone'}
            <textarea
              value={cloneText}
              onChange={(event) => setCloneText(event.target.value)}
              rows={5}
              maxLength={20000}
              className={`mt-2 w-full resize-y rounded-xl border p-3 text-sm font-semibold normal-case leading-6 outline-none focus:border-rose-400 ${isLight ? 'border-[var(--app-border)] bg-white text-[var(--app-text)]' : 'border-[var(--app-border)] bg-black/30 text-white'}`}
            />
          </label>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void cloneVoice()}
            disabled={playing || cloning || !refAudio || !cloneText.trim()}
            className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-rose-600 px-5 text-sm font-black uppercase text-white shadow disabled:cursor-not-allowed disabled:opacity-60"
          >
            {cloning ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <WandSparkles className="h-4 w-4" />}
            {isEnglish ? 'Clone and play' : 'Clone và phát'}
          </button>
          <span className="text-xs font-bold text-[var(--app-text-muted)]">
            {isEnglish ? 'Max reference file size depends on the VieNeu server, usually 25 MB.' : 'Dung lượng file mẫu phụ thuộc server VieNeu, thường tối đa 25 MB.'}
          </span>
        </div>
      </div>

      {error && <div className="mt-3 rounded-xl border border-rose-300/40 bg-rose-500/10 p-3 text-sm font-bold text-rose-500">{error}</div>}
      {message && <div className="mt-3 rounded-xl border border-emerald-300/40 bg-emerald-500/10 p-3 text-sm font-bold text-emerald-500">{message}</div>}
    </section>
  );
}
