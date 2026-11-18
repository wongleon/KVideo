/**
 * ShortDramaFeed - 首页采集站分类信息流
 * 覆盖短剧 / AI漫剧 / 国漫，数据来自量子资源的对应分类（后端见 /api/short-drama），
 * 卡片与分页交互与豆瓣信息流保持一致
 */

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { useInfiniteScroll } from '@/lib/hooks/useInfiniteScroll';
import { createFeedCacheStore } from '@/lib/utils/feed-cache';
import { FeaturedMovieCard } from './FeaturedMovieCard';
import { MovieGrid } from './MovieGrid';

export interface ShortDramaMovie {
  id: string;
  title: string;
  cover: string;
  rate: string;
  url: string;
}

/** 数据分类：真人短剧 / AI 生成短剧 / 国产动漫 */
export type ShortDramaCategory = 'short-drama' | 'ai-comic' | 'guoman';

/**
 * 短剧系首屏缓存（短剧 / AI漫剧 / 国漫）。
 * 刷新阈值 / 保留期 / 持久化实现统一在 lib/utils/feed-cache 中维护，
 * 与豆瓣信息流共用同一套策略，调整时需两路一起改。
 */
const firstPageCache = createFeedCacheStore<ShortDramaMovie[]>('short-drama-feed-first-page');

interface PageResult {
  movies: ShortDramaMovie[];
  hasMore: boolean;
}

/** 请求一页短剧数据，page 从 1 开始（后端页码） */
async function fetchShortDramaPage(category: ShortDramaCategory, page: number): Promise<PageResult> {
  // v=2：封面已改为同源代理地址，带上版本号让 CDN 旧缓存立即失效
  const response = await fetch(`/api/short-drama?category=${category}&page=${page}&v=2`);
  if (!response.ok) throw new Error('Failed to fetch short drama');

  const data = await response.json();
  const movies = Array.isArray(data.subjects) ? (data.subjects as ShortDramaMovie[]) : [];
  return { movies, hasMore: Boolean(data.hasMore) };
}

interface ShortDramaFeedProps {
  category: ShortDramaCategory;
  onMovieClick: (movie: ShortDramaMovie) => void;
}

export function ShortDramaFeed({ category, onMovieClick }: ShortDramaFeedProps) {
  const [movies, setMovies] = useState<ShortDramaMovie[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(0);
  const [failed, setFailed] = useState(false);
  const inFlightRef = useRef(false);
  // 首屏只加载一次：开发模式下 effect 会执行两次，避免重复回源
  const firstLoadStartedRef = useRef(false);

  /** 加载首屏：命中缓存时先渲染缓存，超过刷新阈值再静默更新 */
  const loadFirstPage = useCallback(async () => {
    setFailed(false);

    const cached = firstPageCache.read(category);
    if (cached) {
      setMovies(cached.data);
      setHasMore(true);
      setLoading(false);
      // 未超过刷新阈值：直接复用，不再请求
      if (!cached.stale) return;
    } else {
      setLoading(true);
    }

    try {
      const result = await fetchShortDramaPage(category, 1);
      setMovies(result.movies);
      setHasMore(result.hasMore);
      // 空结果多为采集站瞬时异常，不写入缓存，避免整个会话持续空白
      if (result.movies.length > 0) {
        firstPageCache.write(category, result.movies);
      }
    } catch {
      // 已有缓存时属于静默刷新失败，保留旧内容，不切换到错误页
      if (!cached) setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [category]);

  useEffect(() => {
    if (firstLoadStartedRef.current) return;
    firstLoadStartedRef.current = true;

    // 缓存恢复放到微任务，避免 effect 内同步 setState 触发级联渲染
    void Promise.resolve().then(loadFirstPage);
  }, [loadFirstPage]);

  const loadMore = useCallback(async (nextPage: number) => {
    if (inFlightRef.current) return;

    inFlightRef.current = true;
    setLoading(true);
    try {
      const result = await fetchShortDramaPage(category, nextPage + 1);
      setMovies((prev) => {
        const seen = new Set(prev.map((movie) => movie.id));
        return [...prev, ...result.movies.filter((movie) => !seen.has(movie.id))];
      });
      setPage(nextPage);
      setHasMore(result.hasMore);
    } catch {
      // 分页失败时停止继续加载，避免观察器反复触发同一页
      setHasMore(false);
    } finally {
      inFlightRef.current = false;
      setLoading(false);
    }
  }, [category]);

  const { prefetchRef, loadMoreRef } = useInfiniteScroll({
    hasMore,
    loading,
    page,
    onLoadMore: loadMore,
  });

  if (failed && movies.length === 0) {
    return (
      <div className="text-center py-20">
        <p className="text-[var(--text-color-secondary)] mb-4">短剧加载失败，请稍后重试</p>
        <Button variant="secondary" onClick={() => void loadFirstPage()}>
          重新加载
        </Button>
      </div>
    );
  }

  return (
    <>
      {/* 首条以横向大卡片展示，与豆瓣信息流的视觉节奏保持一致 */}
      {movies.length > 0 && (
        <FeaturedMovieCard key={movies[0].id} movie={movies[0]} onMovieClick={onMovieClick} />
      )}

      <MovieGrid
        movies={movies.slice(1)}
        loading={loading}
        hasMore={hasMore}
        onMovieClick={onMovieClick}
        prefetchRef={prefetchRef}
        loadMoreRef={loadMoreRef}
      />
    </>
  );
}
