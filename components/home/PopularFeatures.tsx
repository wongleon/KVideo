/**
 * PopularFeatures - 首页豆瓣推荐区
 * 固定筛选：推荐（电影+剧集混合）、热门电影、最新电影、热门剧集、热门综艺、热门美剧
 */

'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MovieGrid } from './MovieGrid';
import { RecommendCarousel } from './RecommendCarousel';
import { useInfiniteScroll } from '@/lib/hooks/useInfiniteScroll';

interface DoubanMovie {
  id: string;
  title: string;
  cover: string;
  rate: string;
  url: string;
}

interface DoubanQuery {
  type: 'movie' | 'tv';
  tag: string;
}

interface HomeFilter {
  id: string;
  label: string;
  queries: DoubanQuery[];
}

/** 首页固定筛选配置 */
export const HOME_FILTERS: HomeFilter[] = [
  {
    id: 'recommend',
    label: '推荐',
    queries: [
      { type: 'movie', tag: '热门' },
      { type: 'tv', tag: '热门' },
    ],
  },
  { id: 'movie', label: '热门电影', queries: [{ type: 'movie', tag: '热门' }] },
  { id: 'new-movie', label: '最新电影', queries: [{ type: 'movie', tag: '最新' }] },
  { id: 'tv', label: '热门剧集', queries: [{ type: 'tv', tag: '热门' }] },
  { id: 'variety', label: '热门综艺', queries: [{ type: 'tv', tag: '综艺' }] },
  { id: 'us-tv', label: '热门美剧', queries: [{ type: 'tv', tag: '美剧' }] },
];

const PAGE_LIMIT = 20;

/** 首屏数据缓存有效期：路由切换回来时直接复用，超过后先展示旧数据再后台刷新 */
const FEED_CACHE_TTL = 10 * 60 * 1000;

interface CachedFeed {
  movies: DoubanMovie[];
  timestamp: number;
}

/**
 * 模块级缓存：Next.js 路由切换会卸载首页组件，组件内 state 随之丢失，
 * 放在模块作用域可以在同一次会话内跨路由保留，切回首页时立即渲染，无需重新加载。
 */
const firstPageCache = new Map<string, CachedFeed>();
let carouselCache: CachedFeed | null = null;

function getQueryKey(queries: DoubanQuery[]): string {
  return queries.map((query) => `${query.type}:${query.tag}`).join('|');
}

/** 读取首屏缓存，stale 表示已过期（仍可先展示，再静默刷新） */
function readFirstPageCache(queries: DoubanQuery[]): (CachedFeed & { stale: boolean }) | null {
  const cached = firstPageCache.get(getQueryKey(queries));
  if (!cached) return null;
  return { ...cached, stale: Date.now() - cached.timestamp > FEED_CACHE_TTL };
}

function writeFirstPageCache(queries: DoubanQuery[], movies: DoubanMovie[]): void {
  // 空结果多为豆瓣抖动，不写入缓存，避免切回来看到空页面
  if (movies.length === 0) return;
  firstPageCache.set(getQueryKey(queries), { movies, timestamp: Date.now() });
}

function readCarouselCache(): (CachedFeed & { stale: boolean }) | null {
  if (!carouselCache) return null;
  return { ...carouselCache, stale: Date.now() - carouselCache.timestamp > FEED_CACHE_TTL };
}

function writeCarouselCache(movies: DoubanMovie[]): void {
  if (movies.length === 0) return;
  carouselCache = { movies, timestamp: Date.now() };
}

/** 轮播图取图来源：热门电影、热门剧集、热门综艺、热门美剧各取一张（推荐与最新电影不参与） */
const CAROUSEL_FILTERS = HOME_FILTERS.filter(
  (filter) => filter.id !== 'recommend' && filter.id !== 'new-movie'
);

interface DoubanPageResult {
  movies: DoubanMovie[];
  /** 至少一路取满一页，说明后面可能还有数据 */
  hasMore: boolean;
  /** 所有查询都失败（超时/5xx），属于暂时性问题，不能当作「没有更多」 */
  temporaryFailure: boolean;
}

/** 拉取一页豆瓣数据，多路查询交错合并并去重 */
async function fetchDoubanPage(
  queries: DoubanQuery[],
  pageNumber: number,
  allowRetry = true
): Promise<DoubanPageResult> {
  const pageStart = pageNumber * PAGE_LIMIT;

  const results = await Promise.all(
    queries.map(async (query) => {
      try {
        const response = await fetch(
          `/api/douban/recommend?type=${query.type}&tag=${encodeURIComponent(query.tag)}&page_limit=${PAGE_LIMIT}&page_start=${pageStart}`
        );
        if (!response.ok) {
          return { subjects: [] as DoubanMovie[], failed: true, full: false };
        }
        const data = await response.json();
        const subjects = (data.subjects || []) as DoubanMovie[];
        return { subjects, failed: false, full: subjects.length >= PAGE_LIMIT };
      } catch {
        return { subjects: [] as DoubanMovie[], failed: true, full: false };
      }
    })
  );

  const merged: DoubanMovie[] = [];
  const seen = new Set<string>();
  const maxLength = results.reduce((max, result) => Math.max(max, result.subjects.length), 0);

  for (let index = 0; index < maxLength; index += 1) {
    for (const result of results) {
      const movie = result.subjects[index];
      if (!movie || seen.has(movie.id)) continue;
      seen.add(movie.id);
      merged.push(movie);
    }
  }

  // 首屏为空通常是豆瓣偶发超时或限流（而非真的没有内容），静默重试一次，
  // 避免刚切到该标签就误显示「暂无内容」
  if (merged.length === 0 && allowRetry && pageNumber === 0) {
    await new Promise((resolve) => setTimeout(resolve, 600));
    return fetchDoubanPage(queries, pageNumber, false);
  }

  return {
    movies: merged,
    hasMore: results.some((result) => result.full),
    // 一路成功一路失败时仍按成功处理，只有全部失败才算暂时性故障
    temporaryFailure: results.every((result) => result.failed),
  };
}

interface HomeFilterTabsProps {
  selectedFilterId: string;
  onSelect: (id: string) => void;
}

/** 首页分类标签栏：与顶栏同处一个吸顶容器，避免两条独立吸顶栏在滚动时相互错位 */
export function HomeFilterTabs({ selectedFilterId, onSelect }: HomeFilterTabsProps) {
  // 标签栏横向滑动（滚轮 + 鼠标拖动）
  const tagScrollRef = useRef<HTMLDivElement>(null);
  const tagDragRef = useRef({ isDown: false, moved: false, startX: 0, startScrollLeft: 0 });

  useEffect(() => {
    const container = tagScrollRef.current;
    if (!container) return;

    const handleWheel = (event: WheelEvent) => {
      const maxScrollLeft = container.scrollWidth - container.clientWidth;
      if (maxScrollLeft <= 0) return;

      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? container.clientWidth : 1;
      const delta = (event.deltaY !== 0 ? event.deltaY : event.deltaX) * unit;
      if (delta === 0) return;

      // 区域内始终只横向滚动标签，到两端也不会带动页面滚动
      event.preventDefault();
      container.scrollLeft = Math.max(0, Math.min(maxScrollLeft, container.scrollLeft + delta));
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, []);

  const handleTagMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const container = tagScrollRef.current;
    if (!container) return;

    tagDragRef.current = {
      isDown: true,
      moved: false,
      startX: event.pageX,
      startScrollLeft: container.scrollLeft,
    };
  };

  const handleTagMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
    const container = tagScrollRef.current;
    const drag = tagDragRef.current;
    if (!container || !drag.isDown) return;

    const delta = event.pageX - drag.startX;
    if (Math.abs(delta) <= 4) return;

    drag.moved = true;
    container.scrollLeft = drag.startScrollLeft - delta;
    event.preventDefault();
  };

  const endTagDrag = () => {
    tagDragRef.current.isDown = false;
  };

  const handleTagClickCapture = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!tagDragRef.current.moved) return;
    event.preventDefault();
    event.stopPropagation();
    tagDragRef.current.moved = false;
  };

  return (
    <div
      ref={tagScrollRef}
      onMouseDown={handleTagMouseDown}
      onMouseMove={handleTagMouseMove}
      onMouseUp={endTagDrag}
      onMouseLeave={endTagDrag}
      onClickCapture={handleTagClickCapture}
      className="flex h-14 items-center gap-3 overflow-x-auto overflow-y-hidden overscroll-x-contain pb-2 pt-2 -mx-4 px-4 scrollbar-hide select-none cursor-grab active:cursor-grabbing"
    >
      {HOME_FILTERS.map((filter) => {
        const isSelected = filter.id === selectedFilterId;

        return (
          <button
            key={filter.id}
            type="button"
            onClick={() => onSelect(filter.id)}
            aria-pressed={isSelected}
            data-focusable
            className={`flex-shrink-0 px-6 py-2.5 text-sm font-semibold whitespace-nowrap rounded-[var(--radius-full)] transition-colors cursor-pointer select-none ${
              isSelected
                ? 'bg-[var(--accent-color)] text-white shadow-md'
                : 'bg-[var(--glass-bg)] text-[var(--text-color)] ring-1 ring-inset ring-[var(--glass-border)] hover:ring-[var(--accent-color)]'
            }`}
          >
            {filter.label}
          </button>
        );
      })}
    </div>
  );
}

interface DoubanFeedProps {
  queries: DoubanQuery[];
  onMovieClick: (movie: DoubanMovie) => void;
}

/** 连续失败后的自动重试次数上限，超过后等待用户再次滚动触发 */
const MAX_AUTO_RETRIES = 3;
/** 自动重试的基础退避时间，按失败次数递增 */
const RETRY_BASE_DELAY = 3000;

function DoubanFeed({ queries, onMovieClick }: DoubanFeedProps) {
  const [movies, setMovies] = useState<DoubanMovie[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(0);
  // 待重试的页码，非空时由下方 effect 安排退避重试
  const [retryPage, setRetryPage] = useState<number | null>(null);
  const inFlightRef = useRef(false);
  const failedCountRef = useRef(0);
  const cooldownUntilRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    // 缓存只能在挂载后恢复：服务端渲染拿不到客户端缓存，首帧就用缓存会导致 hydration 不一致
    const cached = readFirstPageCache(queries);

    if (cached) {
      // 放到微任务中恢复，避免 effect 内同步 setState 触发级联渲染
      void Promise.resolve().then(() => {
        if (cancelled) return;
        setMovies(cached.movies);
        setHasMore(true);
        setLoading(false);
      });

      // 命中且未过期：直接复用，不再请求
      if (!cached.stale) {
        return () => {
          cancelled = true;
        };
      }
    }

    fetchDoubanPage(queries, 0).then((result) => {
      if (cancelled) return;
      setLoading(false);

      // 暂时性失败（超时/5xx）时保留已有内容，不清空
      if (result.temporaryFailure) return;

      setMovies(result.movies);
      setHasMore(result.hasMore);
      writeFirstPageCache(queries, result.movies);
    });

    return () => {
      cancelled = true;
    };
  }, [queries]);

  const loadMore = useCallback(async (nextPage: number) => {
    // 防重入：加载中或处于失败冷却期时忽略观察器重建带来的重复触发
    if (inFlightRef.current || Date.now() < cooldownUntilRef.current) return;

    inFlightRef.current = true;
    setLoading(true);

    let result: DoubanPageResult | null = null;
    try {
      result = await fetchDoubanPage(queries, nextPage);
    } finally {
      inFlightRef.current = false;
      setLoading(false);
    }

    if (!result) return;

    if (result.temporaryFailure) {
      failedCountRef.current += 1;
      // 失败不推进分页、不结束信息流：保持 hasMore 不变，退避后自动重试
      cooldownUntilRef.current =
        Date.now() + RETRY_BASE_DELAY * Math.min(failedCountRef.current, MAX_AUTO_RETRIES);

      if (failedCountRef.current <= MAX_AUTO_RETRIES) {
        setRetryPage(nextPage);
      }
      return;
    }

    failedCountRef.current = 0;
    setRetryPage(null);
    setMovies((prev) => {
      const seen = new Set(prev.map((movie) => movie.id));
      return [...prev, ...result.movies.filter((movie) => !seen.has(movie.id))];
    });
    setPage(nextPage);
    setHasMore(result.hasMore);
  }, [queries]);

  // 失败后的指数退避重试
  useEffect(() => {
    if (retryPage === null) return;

    const delayMs = RETRY_BASE_DELAY * failedCountRef.current;
    const timer = setTimeout(() => {
      setRetryPage(null);
      void loadMore(retryPage);
    }, delayMs);

    return () => clearTimeout(timer);
  }, [retryPage, loadMore]);

  const { prefetchRef, loadMoreRef } = useInfiniteScroll({
    hasMore,
    loading,
    page,
    onLoadMore: loadMore,
  });

  return (
    <MovieGrid
      movies={movies}
      loading={loading}
      hasMore={hasMore}
      onMovieClick={onMovieClick}
      prefetchRef={prefetchRef}
      loadMoreRef={loadMoreRef}
    />
  );
}

interface PopularFeaturesProps {
  onSearch?: (query: string) => void;
  selectedFilterId: string;
}

export function PopularFeatures({ onSearch, selectedFilterId }: PopularFeaturesProps) {
  // 轮播图数据：热门电影 / 热门剧集 / 热门综艺 / 热门美剧 各取一张
  const [carouselMovies, setCarouselMovies] = useState<DoubanMovie[]>([]);

  const activeFilter = useMemo(
    () => HOME_FILTERS.find((filter) => filter.id === selectedFilterId) ?? HOME_FILTERS[0],
    [selectedFilterId]
  );

  const handleMovieClick = useCallback((movie: DoubanMovie) => {
    if (onSearch) {
      onSearch(movie.title);
    }
  }, [onSearch]);

  // 首屏并行拉取四个分类，各取列表第一张组成轮播图
  useEffect(() => {
    let cancelled = false;
    const cached = readCarouselCache();

    if (cached) {
      // 放到微任务中恢复，避免 effect 内同步 setState 触发级联渲染
      void Promise.resolve().then(() => {
        if (cancelled) return;
        setCarouselMovies(cached.movies);
      });

      // 命中且未过期：直接复用，不再请求
      if (!cached.stale) {
        return () => {
          cancelled = true;
        };
      }
    }

    // 「最新电影」不在轮播图里，但其余标签的数据在推荐与轮播阶段其实都已请求过，
    // 只有它要等用户切换时才首次请求，容易撞上豆瓣冷请求的抖动而暂时查不到。
    // 这里首屏预热一次（结果不入轮播），切换该标签时可直接命中缓存。
    const latestFilter = HOME_FILTERS.find((filter) => filter.id === 'new-movie');
    if (latestFilter && !readFirstPageCache(latestFilter.queries)) {
      void fetchDoubanPage(latestFilter.queries, 0, false).then((result) => {
        writeFirstPageCache(latestFilter.queries, result.movies);
      });
    }

    Promise.all(CAROUSEL_FILTERS.map((filter) => fetchDoubanPage(filter.queries, 0))).then((results) => {
      if (cancelled) return;

      const picks: DoubanMovie[] = [];
      const seen = new Set<string>();

      results.forEach((result) => {
        const movie = result.movies[0];
        if (!movie || seen.has(movie.id)) return;
        seen.add(movie.id);
        picks.push(movie);
      });

      // 轮播依赖的四个分类数据同时写入首屏缓存，切换标签时可直接复用
      results.forEach((result, index) => {
        writeFirstPageCache(CAROUSEL_FILTERS[index].queries, result.movies);
      });

      setCarouselMovies(picks);
      writeCarouselCache(picks);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="animate-fade-in">
      {/* 推荐轮播图：切换标签时始终保留 */}
      {carouselMovies.length > 0 && (
        <RecommendCarousel movies={carouselMovies} onMovieClick={handleMovieClick} />
      )}

      <DoubanFeed
        key={activeFilter.id}
        queries={activeFilter.queries}
        onMovieClick={handleMovieClick}
      />
    </div>
  );
}
