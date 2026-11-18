/**
 * useHotRecommendations
 * 播放页「热门推荐」数据：取豆瓣全站热门池，
 * 电影侧按评分、剧集侧按最新，交错合并后取前 6 条。
 *
 * 缓存策略与首页信息流保持一致（lib/utils/feed-cache）：
 * - 6 小时内直接复用缓存，不发请求
 * - 超过 6 小时先展示旧数据，同时静默刷新
 * - 7 天后视为无缓存，重新加载
 */

import { useEffect, useState } from 'react';
import { createFeedCacheStore } from '@/lib/utils/feed-cache';

export interface HotMovie {
  id: string;
  title: string;
  cover: string;
  rate: string;
  url: string;
}

interface HotSource {
  type: 'movie' | 'tv';
  sort: 'rank' | 'time';
}

/** 每路查询拉取条数，用于交错挑选 */
const PAGE_LIMIT = 20;
/** 模块最多展示条数 */
const MAX_ITEMS = 6;

/**
 * 两路热榜组合，与首页「推荐」保持一致：
 * 电影按评分优先，剧集按最新（剧集 rank 会穿透到经典老剧）
 */
const SOURCES: HotSource[] = [
  { type: 'movie', sort: 'rank' },
  { type: 'tv', sort: 'time' },
];

/** 热榜查询固定，缓存键可固定；sort 参与键值，避免调整排序后读到旧数据 */
const CACHE_KEY = SOURCES.map((source) => `${source.type}:${source.sort}`).join('|');

/** 与首页 firstPageCache 同款持久化缓存 */
const hotCache = createFeedCacheStore<HotMovie[]>('player-hot-recommendations', 1);

/** 进行中的请求，避免开发模式 effect 双执行时重复回源 */
let inFlight: Promise<HotMovie[]> | null = null;

/** 按评分降序，暂无评分的置后 */
function sortByRate(movies: HotMovie[]): HotMovie[] {
  return movies.sort((a, b) => (parseFloat(b.rate) || 0) - (parseFloat(a.rate) || 0));
}

/** 拉取多路热榜，交错合并、按 id 去重后截取固定条数 */
async function fetchHot(): Promise<HotMovie[]> {
  const lists = await Promise.all(
    SOURCES.map(async (source) => {
      try {
        const response = await fetch(
          `/api/douban/recommend?type=${source.type}&tag=${encodeURIComponent('热门')}&sort=${source.sort}&page_limit=${PAGE_LIMIT}&page_start=0`
        );
        if (!response.ok) return [] as HotMovie[];
        const data = await response.json();
        return sortByRate(
          (data.subjects || []).map((subject: Partial<HotMovie>) => ({
            id: String(subject.id ?? ''),
            title: subject.title || '',
            cover: subject.cover || '',
            rate: subject.rate || '',
            url: subject.url || '',
          }))
        );
      } catch {
        return [] as HotMovie[];
      }
    })
  );

  const merged: HotMovie[] = [];
  const seenIds = new Set<string>();
  const maxLength = lists.reduce((max, list) => Math.max(max, list.length), 0);

  for (let index = 0; index < maxLength && merged.length < MAX_ITEMS; index += 1) {
    for (const list of lists) {
      const movie = list[index];
      if (!movie || !movie.id) continue;
      if (seenIds.has(movie.id)) continue;
      seenIds.add(movie.id);
      merged.push(movie);
      if (merged.length >= MAX_ITEMS) break;
    }
  }

  return merged;
}

/** 合并并发请求，请求结束后释放 */
function loadHot(): Promise<HotMovie[]> {
  if (inFlight) return inFlight;

  inFlight = fetchHot().finally(() => {
    inFlight = null;
  });

  return inFlight;
}

export function useHotRecommendations() {
  const [movies, setMovies] = useState<HotMovie[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    // 缓存只能在挂载后读取：服务端渲染拿不到 localStorage，首帧就用缓存会导致 hydration 不一致
    const cached = hotCache.read(CACHE_KEY);

    if (cached) {
      // 放到微任务中恢复，避免 effect 内同步 setState 触发级联渲染
      void Promise.resolve().then(() => {
        if (cancelled) return;
        setMovies(cached.data);
        setLoading(false);
      });

      // 命中且未过期：直接复用，不再请求
      if (!cached.stale) {
        return () => {
          cancelled = true;
        };
      }
    }

    loadHot()
      .then((list) => {
        if (cancelled) return;
        setLoading(false);
        // 空结果多为豆瓣抖动，不覆盖缓存（有旧数据时继续展示旧数据）
        if (list.length === 0) return;
        setMovies(list);
        hotCache.write(CACHE_KEY, list);
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return { movies, loading };
}
