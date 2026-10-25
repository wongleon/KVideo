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

/** 轮播图取图来源：热门电影、热门剧集、热门综艺、热门美剧各取一张 */
const CAROUSEL_FILTERS = HOME_FILTERS.filter((filter) => filter.id !== 'recommend');

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
}

function DoubanFeed({ queries, onMovieClick }: DoubanFeedProps) {
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
    });

    return () => {
      cancelled = true;
    };
  }, [queries]);

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
  // 轮播图数据：热门电影 / 热门剧集 / 热门综艺 / 热门美剧 各取一张
  const [carouselMovies, setCarouselMovies] = useState<DoubanMovie[]>([]);

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

    Promise.all(CAROUSEL_FILTERS.map((filter) => fetchDoubanPage(filter.queries, 0))).then((lists) => {
      if (cancelled) return;

      const picks: DoubanMovie[] = [];
      const seen = new Set<string>();

      lists.forEach((list) => {
        const movie = list[0];
        if (!movie || seen.has(movie.id)) return;
        seen.add(movie.id);
        picks.push(movie);
      });

      setCarouselMovies(picks);
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
      />
    </div>
  );
}
