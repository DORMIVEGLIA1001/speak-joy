// Client helpers for the role-play speaking mode (notes 14/7 · mục 3).
//
// Two jobs:
// 1. Typed fetch wrappers over the /api/roleplay/* proxy (scenarios list + detail,
//    and the audio→IPA scoring POST).
// 2. Encode a recorded audio Blob into 16 kHz mono 16-bit PCM WAV — the backend's
//    offline Allosaurus engine reads WAV and the server has no ffmpeg to transcode
//    the webm/opus that MediaRecorder produces. We resample in-browser via
//    OfflineAudioContext so the upload is already in the format the engine wants.

export interface RolePlayOption {
  text: string;
  ipa: string;
  translate: string;
  correct: boolean;
}

export interface RolePlayLine {
  id: string;
  order: number;
  aiPromptEn: string;
  aiPromptVi: string | null;
  options: RolePlayOption[];
}

export interface RolePlayScript {
  id: string;
  slug: string;
  order: number;
  titleEn: string | null;
  titleVi: string | null;
  lines: RolePlayLine[];
}

export interface RolePlayScenario {
  id: string;
  scenarioId: string;
  slug: string;
  titleEn: string;
  titleVi: string;
  personaEn: string | null;
  personaVi: string | null;
  emoji: string | null;
  greetingEn: string | null;
  greetingVi: string | null;
  ageMin: number | null;
  ageMax: number | null;
  scriptCount: number;
}

export interface RolePlayScenarioDetail extends RolePlayScenario {
  scripts: RolePlayScript[];
}

export interface WordIpaScore {
  word: string;
  targetIpa: string;
  spokenIpa: string;
  score: number;
  rating: "Good" | "Fair" | "Poor";
}

export interface IpaScoreResult {
  overall_score: number;
  spoken_ipa: string;
  words: WordIpaScore[];
  targetText: string;
}

const TARGET_SAMPLE_RATE = 16000;

async function readJson(response: Response): Promise<any> {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return {};
  }
}

// Lightweight runtime guards at the fetch boundary. The API is trusted but not
// infallible: a shape drift or a stray null used to flow straight into the UI (e.g.
// `scenario.scripts` read off undefined) and blank the tab. These throw a clean error
// instead so the caller's catch shows a friendly message rather than crashing mid-render.
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asScenario(value: unknown): RolePlayScenario {
  if (!isRecord(value) || typeof value.slug !== "string") {
    throw new Error("Malformed scenario data from server");
  }
  return value as unknown as RolePlayScenario;
}

function asScenarioDetail(value: unknown): RolePlayScenarioDetail {
  const scenario = asScenario(value);
  if (!Array.isArray((value as Record<string, unknown>).scripts)) {
    throw new Error("Malformed scenario detail from server");
  }
  return scenario as RolePlayScenarioDetail;
}

function asIpaScoreResult(value: unknown): IpaScoreResult {
  if (!isRecord(value) || typeof value.overall_score !== "number" || !Array.isArray(value.words)) {
    throw new Error("Malformed scoring result from server");
  }
  return value as unknown as IpaScoreResult;
}

export async function fetchScenarios(childAge?: number): Promise<RolePlayScenario[]> {
  const query = typeof childAge === "number" ? `?childAge=${encodeURIComponent(childAge)}` : "";
  const response = await fetch(`/api/roleplay/scenarios${query}`, { credentials: "include" });
  const payload = await readJson(response);
  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.message || "Could not load scenarios");
  }
  const scenarios = payload.data?.scenarios;
  return Array.isArray(scenarios) ? scenarios.map(asScenario) : [];
}

export async function fetchScenarioDetail(slug: string): Promise<RolePlayScenarioDetail> {
  const response = await fetch(`/api/roleplay/scenarios/${encodeURIComponent(slug)}`, {
    credentials: "include",
  });
  const payload = await readJson(response);
  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.message || "Could not load scenario");
  }
  return asScenarioDetail(payload.data?.scenario);
}

export async function scoreAttempt(
  lineId: string,
  wavBlob: Blob,
  optionIndex: number,
  optionText: string,
): Promise<IpaScoreResult> {
  const form = new FormData();
  form.append("audio", wavBlob, "attempt.wav");
  form.append("lineId", lineId);
  form.append("optionIndex", String(optionIndex));
  form.append("optionText", optionText);

  const response = await fetch("/api/roleplay/score-ipa", {
    method: "POST",
    credentials: "include",
    body: form,
  });
  const payload = await readJson(response);
  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.message || "Could not score your recording");
  }
  return payload.data;
}

// Free talk has no scripted line: we send the recording plus the browser's speech-
// recognition transcript, and the backend phonemizes that transcript to build the
// target IPA on the fly, then grades pronunciation against it.
export async function scoreFreeTalk(
  wavBlob: Blob,
  transcript: string,
): Promise<IpaScoreResult> {
  const form = new FormData();
  form.append("audio", wavBlob, "freetalk.wav");
  form.append("transcript", transcript);

  const response = await fetch("/api/roleplay/score-freetalk", {
    method: "POST",
    credentials: "include",
    body: form,
  });
  const payload = await readJson(response);
  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.message || "Could not score your recording");
  }
  return payload.data;
}

// ── WAV encoding ─────────────────────────────────────────────────────────────

// Decode an arbitrary recorded Blob (webm/opus/ogg…) → resample to 16 kHz mono →
// 16-bit PCM WAV Blob. Throws if the browser cannot decode the recording.
export async function blobToWav16k(blob: Blob): Promise<Blob> {
  const arrayBuffer = await blob.arrayBuffer();
  const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioCtx) {
    throw new Error("This browser can't decode the recording (no AudioContext).");
  }
  // A regular AudioContext counts toward the browser's ~6-context cap. If we ever leak one
  // (e.g. decodeAudioData throws and we don't close it), repeated scoring attempts exhaust
  // the cap and every later decode fails. So the decode context is always torn down in a
  // finally, and its close() — which can itself throw if already closing — is swallowed.
  const decodeCtx = new AudioCtx();
  let decoded: AudioBuffer;
  try {
    decoded = await decodeCtx.decodeAudioData(arrayBuffer.slice(0));
  } catch {
    throw new Error("Could not read the recording audio. Please try recording again.");
  } finally {
    try {
      await decodeCtx.close();
    } catch {
      /* already closed / closing — nothing to release */
    }
  }

  const duration = decoded.duration;
  const OfflineCtx =
    window.OfflineAudioContext || (window as any).webkitOfflineAudioContext;
  if (!OfflineCtx) {
    throw new Error("This browser can't resample the recording (no OfflineAudioContext).");
  }
  // OfflineAudioContext has no reliable close() (not a real-time context), so it's left to
  // GC once rendering settles — it does not count against the real-time context cap.
  const frameCount = Math.max(1, Math.ceil(duration * TARGET_SAMPLE_RATE));
  const offline = new OfflineCtx(1, frameCount, TARGET_SAMPLE_RATE);
  const source = offline.createBufferSource();
  source.buffer = decoded;
  source.connect(offline.destination);
  source.start(0);
  const rendered = await offline.startRendering();

  return encodeWav(rendered.getChannelData(0), TARGET_SAMPLE_RATE);
}

function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  const writeString = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i += 1) {
      view.setUint8(offset + i, text.charCodeAt(i));
    }
  };

  writeString(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate (mono 16-bit)
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  writeString(36, "data");
  view.setUint32(40, samples.length * 2, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
    offset += 2;
  }

  return new Blob([view], { type: "audio/wav" });
}
