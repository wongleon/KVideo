/**
 * 搜索页结果缓存
 * 用于在用户从播放页返回搜索页时恢复上次的搜索结果与源标签筛选
 */

import type { SourceBadge, Video } from '@/lib/types';

const SEARCH_PAGE_CACHE_KEY = 'kvideo_search_page_cache';
// 缓存有效期，超过后视为过期，重新搜索
const SEARCH_PAGE_CACHE_TTL = 30 * 60 * 1000;

export interface SearchPageCache {
  query: string;
  results: Video[];
  availableSources: SourceBadge[];
  /** 上次选中的源标签，null 表示「全部」 */
  selectedSource: string | null;
}

export function readSearchPageCache(): SearchPageCache | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(SEARCH_PAGE_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.query !== 'string' || !parsed.query || !Array.isArray(parsed?.results)) return null;
    if (typeof parsed?.timestamp === 'number' && Date.now() - parsed.timestamp > SEARCH_PAGE_CACHE_TTL) {
      sessionStorage.removeItem(SEARCH_PAGE_CACHE_KEY);
      return null;
    }
    return {
      query: parsed.query,
      results: parsed.results,
      availableSources: Array.isArray(parsed.availableSources) ? parsed.availableSources : [],
      selectedSource: typeof parsed.selectedSource === 'string' && parsed.selectedSource ? parsed.selectedSource : null,
    };
  } catch {
    return null;
  }
}

export function writeSearchPageCache(cache: SearchPageCache): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(
      SEARCH_PAGE_CACHE_KEY,
      JSON.stringify({ ...cache, timestamp: Date.now() })
    );
  } catch {
    // 存储空间不足等场景下忽略，不影响正常搜索
  }
}

/** 主动发起新的搜索前调用，避免回到上次记录 */
export function clearSearchPageCache(): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(SEARCH_PAGE_CACHE_KEY);
  } catch {
    // 忽略
  }
}
