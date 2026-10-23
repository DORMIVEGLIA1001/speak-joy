
const STORAGE_KEY_PREFIX = 'speakjoy_srs_';

export type SrsQuality =
  | 0
  | 1
  | 2
  | 3
  | 4
  | 5;

export interface SrsRecord {
  wordId: string;
  ease: number;
  interval: number;
  repetitions: number;
  nextReviewAt: string;
  lastQuality: number;
  lastReviewedAt: string | null;
}

export type SrsStore = Record<string, SrsRecord>;

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Lấy ngày hôm nay dạng YYYY-MM-DD (theo giờ Việt Nam) */
function getTodayDate(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/** Thêm N ngày vào một date string YYYY-MM-DD */
function addDays(dateStr: string, days: number): string {
  const date = new Date(`${dateStr}T00:00:00`);
  date.setDate(date.getDate() + Math.max(1, Math.round(days)));
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
  }).format(date);
}

/** Clamp ease factor vào khoảng [1.3, 2.5] */
function clampEase(ease: number): number {
  return Math.max(1.3, Math.min(2.5, ease));
}

// ─── SRS Record Logic ────────────────────────────────────────────────────────

/** Tạo SrsRecord mới cho một từ chưa có */
export function createSrsRecord(wordId: string): SrsRecord {
  return {
    wordId,
    ease: 2.5,
    interval: 1,
    repetitions: 0,
    nextReviewAt: getTodayDate(), // cần ôn ngay hôm nay
    lastQuality: -1,
    lastReviewedAt: null,
  };
}

/**
 * Cập nhật SrsRecord sau khi bé trả lời.
 * Implement thuật toán SM-2 chuẩn.
 *
 * @param record  - Record hiện tại của từ
 * @param quality - Mức độ trả lời đúng (0-5)
 * @returns Record mới đã cập nhật
 */
export function updateSrsRecord(record: SrsRecord, quality: SrsQuality): SrsRecord {
  const today = getTodayDate();
  let { ease, interval, repetitions } = record;

  if (quality >= 3) {
    // Trả lời đúng: tăng interval theo SM-2
    if (repetitions === 0) {
      interval = 1;
    } else if (repetitions === 1) {
      interval = 6;
    } else {
      interval = Math.round(interval * ease);
    }
    repetitions += 1;
  } else {
    // Trả lời sai/gần đúng: reset về ngày mai
    repetitions = 0;
    interval = 1;
  }

  // Cập nhật ease factor theo SM-2
  // ΔEase = 0.1 - (5 - quality) × (0.08 + (5 - quality) × 0.02)
  const delta = 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02);
  ease = clampEase(ease + delta);

  return {
    ...record,
    ease,
    interval,
    repetitions,
    nextReviewAt: addDays(today, interval),
    lastQuality: quality,
    lastReviewedAt: today,
  };
}

// ─── Storage ─────────────────────────────────────────────────────────────────

function getStorageKey(childId: string): string {
  return `${STORAGE_KEY_PREFIX}${childId}`;
}

/** Đọc toàn bộ SRS store của một bé từ localStorage */
export function loadSrsStore(childId: string): SrsStore {
  try {
    const raw = localStorage.getItem(getStorageKey(childId));
    if (!raw) return {};
    return JSON.parse(raw) as SrsStore;
  } catch {
    return {};
  }
}

/** Lưu toàn bộ SRS store của một bé vào localStorage */
export function saveSrsStore(childId: string, store: SrsStore): void {
  try {
    localStorage.setItem(getStorageKey(childId), JSON.stringify(store));
  } catch {
    // Bỏ qua lỗi localStorage
  }
}

// ─── Query API ───────────────────────────────────────────────────────────────

/**
 * Lấy danh sách wordId cần ôn hôm nay (nextReviewAt <= today).
 * Sắp xếp: quá hạn lâu nhất lên đầu.
 */
export function getDueWordIds(store: SrsStore): string[] {
  const today = getTodayDate();
  return Object.values(store)
    .filter((r) => r.nextReviewAt <= today)
    .sort((a, b) => a.nextReviewAt.localeCompare(b.nextReviewAt))
    .map((r) => r.wordId);
}

/**
 * Lấy wordId cần ôn hôm nay hoặc chưa có record (từ mới).
 * Dùng để sort word pool: từ cần ôn lên đầu, từ mới xếp tiếp.
 */
export function getSrsWordPriority(store: SrsStore, wordId: string): number {
  const record = store[wordId];
  if (!record) return 1; // Từ mới chưa học – ưu tiên thứ 2
  const today = getTodayDate();
  if (record.nextReviewAt <= today) return 0; // Cần ôn hôm nay – ưu tiên cao nhất
  return 2; // Chưa đến lịch ôn – ưu tiên thấp
}

// ─── Update Helpers ───────────────────────────────────────────────────────────

/**
 * Ghi nhận bé đã trả lời một từ (thuận tiện wrapper).
 * Tự động load → update → save.
 */
export function recordWordAnswer(
  childId: string,
  wordId: string,
  quality: SrsQuality,
): SrsRecord {
  const store = loadSrsStore(childId);
  const existing = store[wordId] || createSrsRecord(wordId);
  const updated = updateSrsRecord(existing, quality);
  saveSrsStore(childId, { ...store, [wordId]: updated });
  return updated;
}

/**
 * Khởi tạo record cho từ mới nếu chưa có (không ghi đè).
 * Gọi khi bé gặp từ mới trong game.
 */
export function ensureWordTracked(childId: string, wordId: string): void {
  const store = loadSrsStore(childId);
  if (!store[wordId]) {
    saveSrsStore(childId, {
      ...store,
      [wordId]: createSrsRecord(wordId),
    });
  }
}

/**
 * Lấy thống kê tổng hợp của một bé.
 */
export function getSrsStats(childId: string): {
  totalWords: number;
  dueToday: number;
  masteredWords: number; // interval > 21 ngày → coi là đã thuộc
} {
  const store = loadSrsStore(childId);
  const records = Object.values(store);
  const today = getTodayDate();
  return {
    totalWords: records.length,
    dueToday: records.filter((r) => r.nextReviewAt <= today).length,
    masteredWords: records.filter((r) => r.interval > 21).length,
  };
}
