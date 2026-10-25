'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icons } from '@/components/ui/Icon';
import { SearchResults } from '@/components/home/SearchResults';
import { SearchLoadingAnimation } from '@/components/SearchLoadingAnimation';
import { useParallelSearch } from '@/lib/hooks/useParallelSearch';
import { useLatencyPing } from '@/lib/hooks/useLatencyPing';
import { useSearchHistoryStoreSelector } from '@/lib/store/search-history-store';
import { settingsStore } from '@/lib/store/settings-store';
import { userSourcesStore } from '@/lib/store/user-sources-store';
import type { Video, SourceBadge } from '@/lib/types';

// 搜索页不写入首页搜索缓存，也不改写地址栏，避免影响首页回显
const noopCacheUpdate = () => undefined;
const noopUrlUpdate = () => undefined;

// 搜索页结果缓存：从播放页返回时直接恢复上次结果，避免重新请求
const SEARCH_PAGE_CACHE_KEY = 'kvideo_search_page_cache';
// 缓存有效期，超过后视为过期，重新搜索
const SEARCH_PAGE_CACHE_TTL = 30 * 60 * 1000;

function readSearchPageCache(): { query: string; results: Video[]; availableSources: SourceBadge[] } | null {
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
    };
  } catch {
    return null;
  }
}

function writeSearchPageCache(query: string, results: Video[], availableSources: SourceBadge[]) {
  try {
    sessionStorage.setItem(
      SEARCH_PAGE_CACHE_KEY,
      JSON.stringify({ query, results, availableSources, timestamp: Date.now() })
    );
  } catch {
    // 存储空间不足等场景下忽略，不影响正常搜索
  }
}

function clearSearchPageCache() {
  try {
    sessionStorage.removeItem(SEARCH_PAGE_CACHE_KEY);
  } catch {
    // 忽略
  }
}

export default function SearchPage() {
  const router = useRouter();
  const { searchHistory, addToSearchHistory, clearSearchHistory } = useSearchHistoryStoreSelector();

  const [query, setQuery] = useState('');
  const [hasSearched, setHasSearched] = useState(false);

  const {
    loading,
    results,
    availableSources,
    completedSources,
    totalSources,
    performSearch,
    resetSearch,
    cancelSearch,
    loadCachedResults,
  } = useParallelSearch(noopCacheUpdate, noopUrlUpdate);

  // 合并内置源与用户自定义源后执行搜索
  const executeSearch = useCallback((searchQuery: string) => {
    const trimmed = searchQuery.trim();
    if (!trimmed) return;

    const settings = settingsStore.getSettings();
    // enabled 为可选字段，未显式关闭的源都应参与搜索
    const allSources = settings.sources.filter((source) => source.enabled !== false);
    const userSources = userSourcesStore.getSources().filter((source) => source.enabled !== false);
    for (const userSource of userSources) {
      if (!allSources.find((source) => source.id === userSource.id)) {
        allSources.push(userSource);
      }
    }

    if (allSources.length === 0) return;

    addToSearchHistory(trimmed);
    setQuery(trimmed);
    setHasSearched(true);
    performSearch(trimmed, allSources, settings.sortBy);
  }, [addToSearchHistory, performSearch]);

  // 首次挂载时优先恢复上次搜索结果；若有新的 q 参数则按参数搜索
  const lastInitialQueryRef = useRef<string | null>(null);
  useEffect(() => {
    const initialQuery = new URLSearchParams(window.location.search).get('q')?.trim();
    const cached = readSearchPageCache();

    // URL 未带查询词，或与缓存查询词一致时，直接恢复缓存结果，避免重新请求
    if (cached && (!initialQuery || cached.query === initialQuery)) {
      lastInitialQueryRef.current = cached.query;
      setQuery(cached.query);
      setHasSearched(true);
      loadCachedResults(cached.results, cached.availableSources);
      return;
    }

    if (!initialQuery) return;

    // 延后到下一个任务执行，避免在 effect 内同步触发状态更新
    // 不用一次性 ref 标记，避免 StrictMode 下首次 effect 被清理后不再搜索
    const timer = window.setTimeout(() => {
      if (lastInitialQueryRef.current === initialQuery) return;
      lastInitialQueryRef.current = initialQuery;
      executeSearch(initialQuery);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [executeSearch, loadCachedResults]);

  // 搜索结束后写入缓存，便于从播放页返回时恢复
  useEffect(() => {
    if (!hasSearched || loading || !query) return;
    writeSearchPageCache(query, results, availableSources);
  }, [hasSearched, loading, query, results, availableSources]);

  // 实时延迟探测，与首页搜索结果保持一致
  const sourceUrls = useMemo(
    () => availableSources.flatMap((source) => (source.baseUrl ? [{ id: source.id, baseUrl: source.baseUrl }] : [])),
    [availableSources]
  );
  const { latencies } = useLatencyPing({
    sourceUrls,
    enabled: hasSearched && results.length > 0,
  });

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    executeSearch(query);
  };

  const handleClear = () => {
    setQuery('');
    setHasSearched(false);
    resetSearch();
    clearSearchPageCache();
  };

  const handleHistoryClick = (historyQuery: string) => {
    executeSearch(historyQuery);
  };

  return (
    <div className="min-h-screen bg-[var(--bg-color)] bg-[image:var(--bg-image)] bg-fixed">
      {/* 顶部搜索栏：返回 + 输入框 + 搜索按钮 */}
      <header className="sticky top-[env(safe-area-inset-top)] z-[1100] px-3 sm:px-4 pt-3 pb-1">
        <form onSubmit={handleSubmit} className="max-w-3xl mx-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => router.back()}
            className="w-10 h-10 flex-shrink-0 flex items-center justify-center rounded-[var(--radius-full)] bg-[var(--glass-bg)] border border-[var(--glass-border)] text-[var(--text-color)] hover:bg-[color-mix(in_srgb,var(--accent-color)_10%,transparent)] transition-all duration-200 cursor-pointer"
            aria-label="返回"
            title="返回"
          >
            <Icons.ChevronLeft size={20} />
          </button>

          <div className="relative flex-1">
            <input
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="请输入影片名称"
              aria-label="搜索影片"
              enterKeyHint="search"
              className="w-full h-10 sm:h-11 pl-4 pr-10 rounded-[var(--radius-full)] bg-[var(--glass-bg)] border border-[var(--glass-border)] text-base text-[var(--text-color)] placeholder:text-[var(--text-color-secondary)] outline-none focus:border-[var(--accent-color)] transition-colors"
            />
            {query && (
              <button
                type="button"
                onClick={handleClear}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-[var(--radius-full)] text-[var(--text-color-secondary)] hover:text-[var(--text-color)] cursor-pointer"
                aria-label="清除搜索"
              >
                <Icons.X size={16} />
              </button>
            )}
          </div>

          <button
            type="submit"
            disabled={!query.trim()}
            className="w-10 h-10 flex-shrink-0 flex items-center justify-center rounded-[var(--radius-full)] bg-[var(--accent-color)] text-white hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 cursor-pointer"
            aria-label="搜索"
            title="搜索"
          >
            <Icons.Search size={18} />
          </button>
        </form>
      </header>

      <main className="max-w-7xl mx-auto px-4 pb-24">
        {/* 搜索历史 */}
        {!hasSearched && (
          <section className="max-w-3xl mx-auto pt-2 animate-fade-in">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-[var(--text-color)]">搜索历史</h2>
              {searchHistory.length > 0 && (
                <button
                  onClick={clearSearchHistory}
                  className="p-1.5 rounded-[var(--radius-full)] text-[var(--text-color-secondary)] hover:text-[var(--text-color)] hover:bg-[var(--glass-bg)] transition-colors cursor-pointer"
                  aria-label="清空搜索历史"
                  title="清空搜索历史"
                >
                  <Icons.Trash size={18} />
                </button>
              )}
            </div>

            {searchHistory.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {searchHistory.slice(0, 10).map((item) => (
                  <button
                    key={item.query}
                    onClick={() => handleHistoryClick(item.query)}
                    className="px-4 py-2 rounded-[var(--radius-full)] bg-[var(--glass-bg)] border border-[var(--glass-border)] text-sm text-[var(--text-color)] hover:bg-[color-mix(in_srgb,var(--accent-color)_10%,transparent)] transition-colors cursor-pointer"
                  >
                    {item.query}
                  </button>
                ))}
              </div>
            ) : (
              <p className="py-12 text-center text-sm text-[var(--text-color-secondary)]">暂无搜索历史</p>
            )}
          </section>
        )}

        {/* 加载进度 */}
        {hasSearched && loading && (
          <div className="max-w-3xl mx-auto mt-2">
            <SearchLoadingAnimation
              checkedSources={completedSources}
              totalSources={totalSources}
              onCancel={cancelSearch}
            />
          </div>
        )}

        {/* 搜索结果 */}
        {hasSearched && (
          <div className="mt-3">
            <SearchResults
              results={results}
              availableSources={availableSources}
              loading={loading}
              latencies={latencies}
            />
          </div>
        )}

        {/* 无结果 */}
        {hasSearched && !loading && results.length === 0 && (
          <div className="text-center py-20 animate-fade-in">
            <div className="inline-flex items-center justify-center w-24 h-24 bg-[var(--glass-bg)] backdrop-blur-xl border border-[var(--glass-border)] mb-6 rounded-[var(--radius-full)]">
              <Icons.Search size={48} className="text-[var(--text-color-secondary)]" />
            </div>
            <h3 className="text-2xl font-bold text-[var(--text-color)] mb-3">未找到相关内容</h3>
            <p className="text-base text-[var(--text-color-secondary)]">试试其他关键词或检查拼写</p>
          </div>
        )}
      </main>
    </div>
  );
}
