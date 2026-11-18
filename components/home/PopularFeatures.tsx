/**
 * PopularFeatures - 首页豆瓣推荐区
 * 固定筛选：推荐（电影+剧集混合）、电影、国产剧、综艺、美剧
 */

'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MovieGrid } from './MovieGrid';
import { FeaturedMovieCard } from './FeaturedMovieCard';
import { ShortDramaFeed } from './ShortDramaFeed';
import { useInfiniteScroll } from '@/lib/hooks/useInfiniteScroll';
import { createFeedCacheStore } from '@/lib/utils/feed-cache';

interface DoubanMovie {
  id: string;
  title: string;
  cover: string;
  rate: string;
  url: string;
}

/** 豆瓣排序方式：recommend 综合热度、time 最新、rank 评分优先 */
type DoubanSort = 'recommend' | 'time' | 'rank';

interface DoubanQuery {
  type: 'movie' | 'tv';
  tag: string;
  /** 缺省时按豆瓣默认的综合热度排序 */
  sort?: DoubanSort;
}

interface HomeFilter {
  id: string;
  label: string;
  /** 数据来源：缺省为豆瓣推荐，short-drama / ai-comic / guoman 走量子资源的对应分类 */
  source?: 'douban' | 'short-drama' | 'ai-comic' | 'guoman';
  queries: DoubanQuery[];
}

/** 首页固定筛选配置 */
export const HOME_FILTERS: HomeFilter[] = [
  {
    id: 'recommend',
    label: '推荐',
    // 电影侧按评分优先（热门池内的高分片），剧集侧按最新（剧集 rank 会穿透到经典老剧），
    // 两路各自按评分排序后交错合并，兼顾高分内容与电影/剧集混排
    queries: [
      { type: 'movie', tag: '热门', sort: 'rank' },
      { type: 'tv', tag: '热门', sort: 'time' },
    ],
  },
  { id: 'tv', label: '国产剧', queries: [{ type: 'tv', tag: '国产剧', sort: 'time' }] },
  { id: 'movie', label: '电影', queries: [{ type: 'movie', tag: '最新' }] },
  { id: 'us-tv', label: '美剧', queries: [{ type: 'tv', tag: '美剧', sort: 'time' }] },
  {
    id: 'guoman',
    label: '国漫',
    source: 'guoman',
    // 国漫对应量子资源的「国产动漫」分类
    queries: [],
  },
  { id: 'variety', label: '综艺', queries: [{ type: 'tv', tag: '综艺', sort: 'time' }] },
  {
    id: 'short-drama',
    label: '短剧',
    source: 'short-drama',
    // 短剧不在豆瓣收录范围内，改由采集站「短剧」分类提供，见 /api/short-drama
    queries: [],
  },
  {
    id: 'ai-comic',
    label: 'AI漫剧',
    source: 'ai-comic',
    // 量子资源把 AI 生成短剧单独放在「AI漫剧」分类，与真人短剧分开
    queries: [],
  },
];

const PAGE_LIMIT = 20;

/**
 * 豆瓣信息流首屏缓存。
 * 刷新阈值 / 保留期 / 持久化实现统一在 lib/utils/feed-cache 中维护，
 * 与短剧系（短剧 / AI漫剧 / 国漫）共用同一套策略，调整时需两路一起改。
 * version 2：缓存结构从 { movies } 改为 { data }，旧数据整体作废。
 */
const firstPageCache = createFeedCacheStore<DoubanMovie[]>('douban-feed-first-page', 2);

/**
 * 进行中的分页请求。
 * 相同查询、相同页码并发发起时复用同一个 Promise，避免重复回源：
 * 开发模式下 effect 会执行两次、首屏预热与用户滚动也可能同时请求同一页。
 */
const inFlightPages = new Map<string, Promise<DoubanPageResult>>();

function getQueryKey(queries: DoubanQuery[]): string {
  // sort 必须参与缓存键，否则同一标签不同排序会共用缓存导致内容串位
  return queries
    .map((query) => `${query.type}:${query.tag}:${query.sort ?? 'recommend'}`)
    .join('|');
}

/** 读取首屏缓存，stale 表示已超过刷新阈值（仍可先展示，再静默刷新） */
function readFirstPageCache(queries: DoubanQuery[]): { movies: DoubanMovie[]; stale: boolean } | null {
  const hit = firstPageCache.read(getQueryKey(queries));
  return hit ? { movies: hit.data, stale: hit.stale } : null;
}

function writeFirstPageCache(queries: DoubanQuery[], movies: DoubanMovie[]): void {
  // 空结果多为豆瓣抖动，不写入缓存，避免切回来看到空页面
  if (movies.length === 0) return;
  firstPageCache.write(getQueryKey(queries), movies);
}

interface DoubanPageResult {
  movies: DoubanMovie[];
  /** 至少一路返回了非空数据，说明后面可能还有内容；以出现空页作为真正的结束信号 */
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
  const requestKey = `${getQueryKey(queries)}|${pageNumber}`;
  const existing = inFlightPages.get(requestKey);
  if (existing) return existing;

  const pending = fetchDoubanPageInternal(queries, pageNumber, allowRetry).finally(() => {
    inFlightPages.delete(requestKey);
  });
  inFlightPages.set(requestKey, pending);
  return pending;
}

async function fetchDoubanPageInternal(
  queries: DoubanQuery[],
  pageNumber: number,
  allowRetry: boolean
): Promise<DoubanPageResult> {
  const pageStart = pageNumber * PAGE_LIMIT;

  const results = await Promise.all(
    queries.map(async (query) => {
      try {
        const response = await fetch(
          `/api/douban/recommend?type=${query.type}&tag=${encodeURIComponent(query.tag)}&sort=${query.sort ?? 'recommend'}&page_limit=${PAGE_LIMIT}&page_start=${pageStart}`
        );
        if (!response.ok) {
          return { subjects: [] as DoubanMovie[], failed: true, full: false };
        }
        const data = await response.json();
        const subjects = (data.subjects || []) as DoubanMovie[];
        // 豆瓣分页条数不固定（偶发只回 19 条），不能以「满页」判断是否还有下一页：
        // 只要本次还有数据就继续翻，真正结束以返回空页为准，避免短页被当成末页而卡住。
        return { subjects, failed: false, full: subjects.length > 0 };
      } catch {
        return { subjects: [] as DoubanMovie[], failed: true, full: false };
      }
    })
  );

  const merged: DoubanMovie[] = [];
  const seen = new Set<string>();

  // 多路混合（如「推荐」）：每路内部先按评分降序（暂无评分的置后），再交错合并。
  // 这样既保持电影/剧集交替出现的节奏，又让高分内容优先展示；
  // 若整体排序，剧集侧大量无评分的新剧会被全部压到底部，导致「推荐」变成纯电影列表。
  // 单标签不排序，保持接口自身的排序语义（如「电影」按时间）。
  if (queries.length > 1) {
    for (const result of results) {
      result.subjects.sort((a, b) => (parseFloat(b.rate) || 0) - (parseFloat(a.rate) || 0));
    }
  }

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
    return fetchDoubanPageInternal(queries, pageNumber, false);
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
/** 失败后的短暂冷却：拦截观察器重建带来的立即重复请求，真正的重试交给退避定时器 */
const RETRY_COOLDOWN = 1000;

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

  /** 记录一次暂时性失败，并在首次若干次失败后安排退避重试 */
  const scheduleRetry = useCallback((targetPage: number) => {
    failedCountRef.current += 1;
    cooldownUntilRef.current = Date.now() + RETRY_COOLDOWN;

    if (failedCountRef.current <= MAX_AUTO_RETRIES) {
      setRetryPage(targetPage);
    }
  }, []);

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

      if (result.temporaryFailure) {
        // 首屏拿不到数据同样进入退避重试，避免直接落到「暂无内容」
        scheduleRetry(0);
        return;
      }

      failedCountRef.current = 0;
      setMovies(result.movies);
      setHasMore(result.hasMore);
      writeFirstPageCache(queries, result.movies);

      // 首屏渲染完成后静默预热第二页：国内直连 Cloudflare 时链路不稳，
      // 第二页冷请求要回源豆瓣、耗时更长，更容易失败；提前预热可让 CDN 缓存好，
      // 用户滚动时直接命中。与用户滚动触发的请求会被 inFlightPages 合并，不会重复回源。
      if (result.hasMore) {
        setTimeout(() => {
          if (cancelled) return;
          void fetchDoubanPage(queries, 1).catch(() => undefined);
        }, 1500);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [queries, scheduleRetry]);

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
      // 失败不推进分页、不结束信息流：保持 hasMore 不变，退避后自动重试
      scheduleRetry(nextPage);
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

    // 首屏失败后的重试同样要回填缓存
    if (nextPage === 0) writeFirstPageCache(queries, result.movies);
  }, [queries, scheduleRetry]);

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
    <>
      {/* 当前标签的第一条以横向大卡片展示，切换标签时随之更新 */}
      {movies.length > 0 && (
        <FeaturedMovieCard key={movies[0].id} movie={movies[0]} onMovieClick={onMovieClick} />
      )}

      <MovieGrid
        // 第一条已在顶部横向卡片展示，列表从第二条开始，避免重复
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

interface PopularFeaturesProps {
  onSearch?: (query: string) => void;
  selectedFilterId: string;
}

export function PopularFeatures({ onSearch, selectedFilterId }: PopularFeaturesProps) {
  const activeFilter = useMemo(
    () => HOME_FILTERS.find((filter) => filter.id === selectedFilterId) ?? HOME_FILTERS[0],
    [selectedFilterId]
  );

  const handleMovieClick = useCallback((movie: DoubanMovie) => {
    if (onSearch) {
      onSearch(movie.title);
    }
  }, [onSearch]);

  const shortDramaCategory =
    activeFilter.source === 'short-drama' ||
    activeFilter.source === 'ai-comic' ||
    activeFilter.source === 'guoman'
      ? activeFilter.source
      : null;

  return (
    <div className="animate-fade-in">
      {shortDramaCategory ? (
        <ShortDramaFeed
          key={activeFilter.id}
          category={shortDramaCategory}
          onMovieClick={handleMovieClick}
        />
      ) : (
        <DoubanFeed
          key={activeFilter.id}
          queries={activeFilter.queries}
          onMovieClick={handleMovieClick}
        />
      )}
    </div>
  );
}
