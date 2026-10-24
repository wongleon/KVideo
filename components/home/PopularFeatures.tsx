/**
 * PopularFeatures - 首页豆瓣推荐区
 * 固定筛选：推荐（电影+剧集混合）、热门电影、热门剧集、热门综艺、热门美剧
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
const HOME_FILTERS: HomeFilter[] = [
  {
    id: 'recommend',
    label: '推荐',
    queries: [
      { type: 'movie', tag: '热门' },
      { type: 'tv', tag: '热门' },
    ],
  },
  { id: 'movie', label: '热门电影', queries: [{ type: 'movie', tag: '热门' }] },
  { id: 'tv', label: '热门剧集', queries: [{ type: 'tv', tag: '热门' }] },
  { id: 'variety', label: '热门综艺', queries: [{ type: 'tv', tag: '综艺' }] },
  { id: 'us-tv', label: '热门美剧', queries: [{ type: 'tv', tag: '美剧' }] },
];

const PAGE_LIMIT = 20;

/** 基于种子的伪随机数生成器（mulberry32），保证同一种子结果稳定 */
function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/** 取当天日期的数字种子，同一天内轮播内容保持不变 */
function getDailySeed(): number {
  const now = new Date();
  return now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate();
}

/** 拉取一页豆瓣数据，多路查询交错合并并去重 */
async function fetchDoubanPage(queries: DoubanQuery[], pageNumber: number): Promise<DoubanMovie[]> {
  const pageStart = pageNumber * PAGE_LIMIT;

  const results = await Promise.all(
    queries.map(async (query) => {
      try {
        const response = await fetch(
          `/api/douban/recommend?type=${query.type}&tag=${encodeURIComponent(query.tag)}&page_limit=${PAGE_LIMIT}&page_start=${pageStart}`
        );
        if (!response.ok) return [] as DoubanMovie[];
        const data = await response.json();
        return (data.subjects || []) as DoubanMovie[];
      } catch {
        return [] as DoubanMovie[];
      }
    })
  );

  const merged: DoubanMovie[] = [];
  const seen = new Set<string>();
  const maxLength = results.reduce((max, list) => Math.max(max, list.length), 0);

  for (let index = 0; index < maxLength; index += 1) {
    for (const list of results) {
      const movie = list[index];
      if (!movie || seen.has(movie.id)) continue;
      seen.add(movie.id);
      merged.push(movie);
    }
  }

  return merged;
}

interface DoubanFeedProps {
  queries: DoubanQuery[];
  onMovieClick: (movie: DoubanMovie) => void;
  /** 首屏数据加载完成后回调完整列表，由上层随机挑选轮播内容 */
  onFirstPageLoaded?: (movies: DoubanMovie[]) => void;
}

function DoubanFeed({ queries, onMovieClick, onFirstPageLoaded }: DoubanFeedProps) {
  const [movies, setMovies] = useState<DoubanMovie[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(0);

  useEffect(() => {
    let cancelled = false;

    fetchDoubanPage(queries, 0).then((list) => {
      if (cancelled) return;
      setMovies(list);
      setHasMore(list.length > 0);
      setLoading(false);
      onFirstPageLoaded?.(list);
    });

    return () => {
      cancelled = true;
    };
  }, [queries, onFirstPageLoaded]);

  const loadMore = useCallback(async (nextPage: number) => {
    setLoading(true);
    const list = await fetchDoubanPage(queries, nextPage);

    setMovies((prev) => {
      const seen = new Set(prev.map((movie) => movie.id));
      return [...prev, ...list.filter((movie) => !seen.has(movie.id))];
    });
    setPage(nextPage);
    setHasMore(list.length > 0);
    setLoading(false);
  }, [queries]);

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
}

export function PopularFeatures({ onSearch }: PopularFeaturesProps) {
  const [selectedFilterId, setSelectedFilterId] = useState(HOME_FILTERS[0].id);
  // 推荐标签前 5 个影片，用于顶部轮播图
  const [carouselMovies, setCarouselMovies] = useState<DoubanMovie[]>([]);

  // 标签栏横向滑动（滚轮 + 鼠标拖动）
  const tagScrollRef = useRef<HTMLDivElement>(null);
  const tagDragRef = useRef({ isDown: false, moved: false, startX: 0, startScrollLeft: 0 });
  // 标签栏是否已吸顶
  const [isTagBarStuck, setIsTagBarStuck] = useState(false);
  // 吸顶状态下切换标签后暂时隐藏轮播图
  const [carouselSuppressed, setCarouselSuppressed] = useState(false);

  // 监听滚动，判断标签栏是否处于吸顶状态
  useEffect(() => {
    const updateStuck = () => {
      const container = tagScrollRef.current;
      if (!container) return;
      // 与标签栏 sticky top 保持一致（移动端 64px，桌面 88px）
      const stickyTop = window.matchMedia('(min-width: 640px)').matches ? 88 : 64;
      setIsTagBarStuck(container.getBoundingClientRect().top <= stickyTop + 4);
    };

    updateStuck();
    window.addEventListener('scroll', updateStuck, { passive: true });
    window.addEventListener('resize', updateStuck);

    return () => {
      window.removeEventListener('scroll', updateStuck);
      window.removeEventListener('resize', updateStuck);
    };
  }, []);

  // 回到页面顶部（不再吸顶）时恢复轮播图
  useEffect(() => {
    if (!isTagBarStuck) {
      setCarouselSuppressed(false);
    }
  }, [isTagBarStuck]);

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

  const activeFilter = useMemo(
    () => HOME_FILTERS.find((filter) => filter.id === selectedFilterId) ?? HOME_FILTERS[0],
    [selectedFilterId]
  );

  const handleMovieClick = useCallback((movie: DoubanMovie) => {
    if (onSearch) {
      onSearch(movie.title);
    }
  }, [onSearch]);

  // 仅「推荐」标签使用首屏数据，按日期种子随机挑 5 条作为轮播内容
  const handleFirstPageLoaded = useCallback((list: DoubanMovie[]) => {
    const random = createSeededRandom(getDailySeed());
    const shuffled = [...list];
    // 洗牌：同一天内结果固定，跨天自动换一批
    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const target = Math.floor(random() * (index + 1));
      [shuffled[index], shuffled[target]] = [shuffled[target], shuffled[index]];
    }
    setCarouselMovies(shuffled.slice(0, 5));
  }, []);

  return (
    <div className="animate-fade-in">
      {/* 推荐轮播图：切换标签时保留，仅在吸顶状态下切换标签后隐藏 */}
      {carouselMovies.length > 0 && (
        <div className={carouselSuppressed ? 'invisible' : ''}>
          <RecommendCarousel movies={carouselMovies} onMovieClick={handleMovieClick} />
        </div>
      )}

      {/* 固定筛选标签：支持滚轮与鼠标拖动横向滑动 */}
      <div
        ref={tagScrollRef}
        onMouseDown={handleTagMouseDown}
        onMouseMove={handleTagMouseMove}
        onMouseUp={endTagDrag}
        onMouseLeave={endTagDrag}
        onClickCapture={handleTagClickCapture}
        className="sticky z-30 top-[calc(env(safe-area-inset-top)+4rem)] sm:top-[calc(env(safe-area-inset-top)+5.5rem)] mb-2 flex items-center gap-3 overflow-x-auto pb-2 pt-2 -mx-4 px-4 scrollbar-hide select-none cursor-grab active:cursor-grabbing"
      >
        {HOME_FILTERS.map((filter) => {
          const isSelected = filter.id === activeFilter.id;

          return (
            <button
              key={filter.id}
              type="button"
              onClick={() => {
                // 吸顶状态下切换标签时隐藏轮播图
                setCarouselSuppressed(isTagBarStuck);
                setSelectedFilterId(filter.id);
              }}
              aria-pressed={isSelected}
              data-focusable
              className={`px-6 py-2.5 text-sm font-semibold whitespace-nowrap rounded-[var(--radius-full)] transition-all cursor-pointer select-none ${
                isSelected
                  ? 'bg-[var(--accent-color)] text-white shadow-md scale-105'
                  : 'bg-[var(--glass-bg)] backdrop-blur-xl text-[var(--text-color)] border border-[var(--glass-border)] hover:border-[var(--accent-color)] hover:scale-105'
              }`}
            >
              {filter.label}
            </button>
          );
        })}
      </div>

      <DoubanFeed
        key={activeFilter.id}
        queries={activeFilter.queries}
        onMovieClick={handleMovieClick}
        onFirstPageLoaded={activeFilter.id === 'recommend' ? handleFirstPageLoaded : undefined}
      />
    </div>
  );
}
