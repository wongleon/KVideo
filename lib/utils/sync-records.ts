import type { FavoriteItem, VideoHistoryItem } from '@/lib/types';

function hasIdentity(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const record = value as { videoId?: unknown; source?: unknown; title?: unknown };
  const videoId = record.videoId;
  const hasVideoId = typeof videoId === 'string'
    ? videoId.trim().length > 0
    : typeof videoId === 'number' && Number.isFinite(videoId);

  return hasVideoId &&
    typeof record.source === 'string' && record.source.trim().length > 0 &&
    typeof record.title === 'string' && record.title.trim().length > 0;
}

/**
 * Records restored from server-side sync are not guaranteed to be well formed —
 * they may come from an older schema or a partial write. Rendering one without
 * `videoId` or `episodeIndex` throws while building the player URL, which takes
 * down the whole page, so anything lacking the required URL fields is dropped.
 */
export function isRenderableHistoryItem(value: unknown): value is VideoHistoryItem {
  if (!hasIdentity(value)) return false;
  const episodeIndex = (value as { episodeIndex?: unknown }).episodeIndex;
  return typeof episodeIndex === 'number' && Number.isInteger(episodeIndex) && episodeIndex >= 0;
}

export function isRenderableFavoriteItem(value: unknown): value is FavoriteItem {
  return hasIdentity(value);
}

export function keepRenderableHistory(items: unknown): VideoHistoryItem[] {
  return Array.isArray(items) ? items.filter(isRenderableHistoryItem) : [];
}

export function keepRenderableFavorites(items: unknown): FavoriteItem[] {
  return Array.isArray(items) ? items.filter(isRenderableFavoriteItem) : [];
}

/** 与 history-store 中的上限保持一致，避免合并后列表无限增长 */
const MAX_HISTORY_ITEMS = 50;
/** 与 favorites-store 中的上限保持一致 */
const MAX_FAVORITES = 100;

function historyKey(item: VideoHistoryItem): string {
  return item.showIdentifier || `title:${item.title.toLowerCase().trim()}`;
}

function favoriteKey(item: FavoriteItem): string {
  return `${item.source}:${item.videoId}`;
}

/**
 * 合并本地与云端的观看历史：同一部剧取时间更新的记录。
 * 用于避免云端尚未收到最新推送时，用旧数据覆盖刚产生的观看记录。
 */
export function mergeHistoryRecords(
  local: VideoHistoryItem[],
  remote: VideoHistoryItem[]
): VideoHistoryItem[] {
  const merged = new Map<string, VideoHistoryItem>();

  for (const item of [...remote, ...local]) {
    const key = historyKey(item);
    const existing = merged.get(key);

    if (!existing) {
      merged.set(key, item);
      continue;
    }

    if (item.timestamp >= existing.timestamp) {
      merged.set(key, {
        ...existing,
        ...item,
        sourceMap: { ...(existing.sourceMap || {}), ...(item.sourceMap || {}) },
        episodes: item.episodes?.length ? item.episodes : existing.episodes,
      });
    } else {
      merged.set(key, {
        ...item,
        ...existing,
        sourceMap: { ...(item.sourceMap || {}), ...(existing.sourceMap || {}) },
        episodes: existing.episodes?.length ? existing.episodes : item.episodes,
      });
    }
  }

  return Array.from(merged.values())
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, MAX_HISTORY_ITEMS);
}

/**
 * 合并本地与云端的收藏：按来源 + 视频 ID 去重，保留添加时间更晚的一条。
 */
export function mergeFavoriteRecords(
  local: FavoriteItem[],
  remote: FavoriteItem[]
): FavoriteItem[] {
  const merged = new Map<string, FavoriteItem>();

  for (const item of [...remote, ...local]) {
    const key = favoriteKey(item);
    const existing = merged.get(key);

    if (!existing) {
      merged.set(key, item);
      continue;
    }

    merged.set(key, (item.addedAt || 0) >= (existing.addedAt || 0) ? item : existing);
  }

  return Array.from(merged.values())
    .sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0))
    .slice(0, MAX_FAVORITES);
}

