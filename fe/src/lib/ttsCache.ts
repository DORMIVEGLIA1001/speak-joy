/**
 * ttsCache.ts
 *
 * Cache API wrapper để lưu trữ cục bộ vĩnh viễn các file âm thanh TTS.
 * Mục đích: giảm số lần gọi server TTS cho các âm thanh tĩnh (bảng chữ cái,
 * IPA, từ vựng thông dụng) và phát âm ngay lập tức mà không cần chờ mạng.
 *
 * Chiến lược:
 * - Cache bucket: 'speakjoy-tts-v1'
 * - Cache key: URL giả `/cache/tts?k=<hash>` được ánh xạ từ (voiceId, text)
 * - TTL: vĩnh viễn (âm thanh từ vựng tĩnh không thay đổi theo thời gian)
 * - Giới hạn: MAX_ENTRIES entries – dọn dẹp FIFO khi vượt ngưỡng
 */

const CACHE_NAME = 'speakjoy-tts-v1';
const MAX_ENTRIES = 500;

/**
 * Kiểm tra Cache API có sẵn sàng trong môi trường hiện tại không.
 * Service Worker context và HTTPS đều bắt buộc; localhost được miễn HTTPS.
 */
function isCacheAvailable(): boolean {
  return typeof caches !== 'undefined';
}

/**
 * Chuyển đổi (voiceId, text) thành cache key URL giả.
 * Dùng encodeURIComponent để đảm bảo ký tự đặc biệt không gây lỗi.
 */
function buildCacheKey(voiceId: string, text: string): string {
  const raw = `${voiceId}::${text}`;
  return `/cache/tts?k=${encodeURIComponent(raw)}`;
}

/**
 * Đọc audio Blob từ cache. Trả về null nếu chưa có hoặc Cache API không khả dụng.
 */
export async function readCachedTtsAudio(
  voiceId: string,
  text: string,
): Promise<Blob | null> {
  if (!isCacheAvailable()) return null;
  try {
    const cache = await caches.open(CACHE_NAME);
    const key = buildCacheKey(voiceId, text);
    const response = await cache.match(key);
    if (!response) return null;
    return await response.blob();
  } catch {
    return null;
  }
}

/**
 * Lưu audio Blob vào cache.
 * Tự động dọn dẹp các entry cũ nhất nếu vượt quá MAX_ENTRIES.
 */
export async function cacheTtsAudio(
  voiceId: string,
  text: string,
  blob: Blob,
): Promise<void> {
  if (!isCacheAvailable()) return;
  try {
    const cache = await caches.open(CACHE_NAME);
    const key = buildCacheKey(voiceId, text);

    // Tạo Response giả với đúng Content-Type để browser cache chấp nhận
    const response = new Response(blob, {
      status: 200,
      headers: {
        'Content-Type': blob.type || 'audio/mpeg',
        'Cache-Control': 'immutable, max-age=31536000',
        'X-TTS-Cached-At': new Date().toISOString(),
      },
    });
    await cache.put(key, response);

    // Dọn dẹp FIFO nếu vượt giới hạn
    void pruneOldEntries(cache);
  } catch {
    // Cache thất bại không nên ảnh hưởng đến trải nghiệm người dùng
  }
}

/**
 * Xóa các entry cũ nhất nếu cache vượt quá MAX_ENTRIES.
 * Dùng header X-TTS-Cached-At để sắp xếp FIFO.
 */
async function pruneOldEntries(cache: Cache): Promise<void> {
  try {
    const keys = await cache.keys();
    if (keys.length <= MAX_ENTRIES) return;

    // Lấy thời gian cached của từng entry để sắp xếp
    const entries: Array<{ request: Request; cachedAt: number }> = [];
    for (const req of keys) {
      const res = await cache.match(req);
      const cachedAtHeader = res?.headers.get('X-TTS-Cached-At');
      const cachedAt = cachedAtHeader ? new Date(cachedAtHeader).getTime() : 0;
      entries.push({ request: req, cachedAt });
    }

    // Sắp xếp cũ → mới, xóa các entry cũ nhất
    entries.sort((a, b) => a.cachedAt - b.cachedAt);
    const toDelete = entries.slice(0, keys.length - MAX_ENTRIES);
    await Promise.all(toDelete.map((e) => cache.delete(e.request)));
  } catch {
    // Bỏ qua lỗi khi dọn dẹp
  }
}

/**
 * Prefetch danh sách từ vựng tĩnh lên cache trong nền.
 * Dùng cho: bảng chữ cái (A–Z), âm IPA, từ vựng thông dụng trẻ em.
 *
 * @param fetchAudio - Hàm async để lấy Blob audio từ server TTS
 * @param words      - Danh sách từ cần prefetch
 * @param voiceId    - ID giọng đọc (khớp với voiceId dùng trong AiTalkTab)
 * @param batchSize  - Số lượng request song song mỗi đợt (tránh làm nghẽn băng thông)
 */
export async function prefetchStaticVocabAudio(
  fetchAudio: (text: string) => Promise<Blob | null>,
  words: string[],
  voiceId: string,
  batchSize = 3,
): Promise<void> {
  if (!isCacheAvailable()) return;

  // Lọc ra những từ chưa có trong cache để không fetch lại
  const uncached: string[] = [];
  for (const word of words) {
    const existing = await readCachedTtsAudio(voiceId, word);
    if (!existing) uncached.push(word);
  }

  // Xử lý theo batch để tránh gửi quá nhiều request cùng lúc
  for (let i = 0; i < uncached.length; i += batchSize) {
    const batch = uncached.slice(i, i + batchSize);
    await Promise.all(
      batch.map(async (word) => {
        try {
          const blob = await fetchAudio(word);
          if (blob) await cacheTtsAudio(voiceId, word, blob);
        } catch {
          // Prefetch thất bại không sao – sẽ fetch lại khi cần
        }
      }),
    );
    // Nhường CPU cho React render giữa các batch
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

/**
 * Xóa toàn bộ cache TTS (dùng khi cần reset hoặc upgrade version).
 */
export async function clearTtsCache(): Promise<void> {
  if (!isCacheAvailable()) return;
  try {
    await caches.delete(CACHE_NAME);
  } catch {
    // Bỏ qua
  }
}

/**
 * Lấy thống kê cache hiện tại (số entry đã lưu).
 */
export async function getTtsCacheStats(): Promise<{ count: number } | null> {
  if (!isCacheAvailable()) return null;
  try {
    const cache = await caches.open(CACHE_NAME);
    const keys = await cache.keys();
    return { count: keys.length };
  } catch {
    return null;
  }
}
