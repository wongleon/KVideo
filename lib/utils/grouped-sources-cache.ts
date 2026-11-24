/**
 * Grouped Sources Cache
 * Stores groupedSources data in sessionStorage to avoid extremely long URLs
 * that cause HTTP 414 errors on CDNs (e.g., Cloudflare, AWS CloudFront).
 *
 * Instead of passing the full JSON array in the URL parameter,
 * we store it in sessionStorage and pass a short key in the URL.
 */

const CACHE_PREFIX = 'gs:';
const MAX_CACHE_SIZE = 100;

/**
 * Store grouped sources data and return a short cache key.
 */
export function storeGroupedSources(data: any[]): string {
  if (typeof window === 'undefined') return '';

  const key = generateKey();
  try {
    // Cleanup old entries if too many
    cleanupOldEntries();
    sessionStorage.setItem(
      `${CACHE_PREFIX}${key}`,
      JSON.stringify({ data, ts: Date.now() })
    );
  } catch {
    // sessionStorage full or unavailable — fall back gracefully
  }
  return key;
}

/**
 * Retrieve grouped sources data by cache key.
 */
export function retrieveGroupedSources(key: string): any[] | null {
  if (typeof window === 'undefined' || !key) return null;
  try {
    const raw = sessionStorage.getItem(`${CACHE_PREFIX}${key}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.data || null;
  } catch {
    return null;
  }
}

/**
 * Generate a short random key (8 chars, base36).
 */
function generateKey(): string {
  return Math.random().toString(36).slice(2, 10);
}

/**
 * Remove oldest entries when cache exceeds max size.
 *
 * 注意：这里会随每次写入被调用，而 sessionStorage 是同步 API。
 * 因此先只用键名统计数量，未超量时直接返回；只有确实需要清理时才解析条目时间戳。
 * 否则列表页每条记录渲染一次就会解析全部缓存，形成阻塞点击的长任务。
 */
function cleanupOldEntries(): void {
  try {
    let total = 0;
    for (let i = 0; i < sessionStorage.length; i++) {
      if (sessionStorage.key(i)?.startsWith(CACHE_PREFIX)) {
        total += 1;
      }
    }

    if (total < MAX_CACHE_SIZE) return;

    const entries: { key: string; ts: number }[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key?.startsWith(CACHE_PREFIX)) {
        try {
          const raw = sessionStorage.getItem(key);
          const parsed = raw ? JSON.parse(raw) : null;
          entries.push({ key, ts: parsed?.ts || 0 });
        } catch {
          entries.push({ key, ts: 0 });
        }
      }
    }

    // Sort by timestamp ascending and remove oldest half
    entries.sort((a, b) => a.ts - b.ts);
    const toRemove = entries.slice(0, Math.floor(entries.length / 2));
    for (const entry of toRemove) {
      sessionStorage.removeItem(entry.key);
    }
  } catch {
    // Ignore cleanup errors
  }
}
