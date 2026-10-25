/**
 * RecommendCarousel - 首页推荐轮播图
 * 展示热门电影 / 热门剧集 / 热门综艺 / 热门美剧各一张，自动轮播，支持跟手左右滑动切换
 */

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';

interface CarouselMovie {
  id: string;
  title: string;
  cover: string;
  rate: string;
  url: string;
}

interface RecommendCarouselProps {
  movies: CarouselMovie[];
  onMovieClick: (movie: CarouselMovie) => void;
}

/** 自动轮播间隔（毫秒） */
const AUTOPLAY_INTERVAL = 4000;
/** 松手后切换所需的横向位移（像素） */
const SWIPE_THRESHOLD = 60;
/** 判定为横向滑动的最小位移（像素） */
const DRAG_START_THRESHOLD = 8;
/** 首尾越界时的阻尼系数 */
const EDGE_RESISTANCE = 0.3;
/** 滑动动画时长与缓动 */
const SLIDE_TRANSITION = 'transform 450ms cubic-bezier(0.22, 0.61, 0.36, 1)';

export function RecommendCarousel({ movies, onMovieClick }: RecommendCarouselProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  // 手指拖动的实时位移（像素）
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const dragStateRef = useRef<{ startX: number; startY: number; dragging: boolean } | null>(null);
  const count = movies.length;

  // 轮播数据变化时回到第一张
  useEffect(() => {
    setActiveIndex(0);
    setDragOffset(0);
  }, [count]);

  // 自动轮播（拖动时不打断）
  useEffect(() => {
    if (count <= 1) return;

    const timer = window.setInterval(() => {
      if (dragStateRef.current?.dragging) return;
      setActiveIndex((prev) => (prev + 1) % count);
    }, AUTOPLAY_INTERVAL);

    return () => window.clearInterval(timer);
  }, [count]);

  const handleTouchStart = useCallback((event: React.TouchEvent) => {
    if (count <= 1) return;
    const touch = event.touches[0];
    if (!touch) return;
    dragStateRef.current = { startX: touch.clientX, startY: touch.clientY, dragging: false };
  }, [count]);

  const handleTouchMove = useCallback((event: React.TouchEvent) => {
    const state = dragStateRef.current;
    const touch = event.touches[0];
    if (!state || !touch) return;

    const deltaX = touch.clientX - state.startX;
    const deltaY = touch.clientY - state.startY;

    // 先判断横向滑动意图，避免拦截页面纵向滚动
    if (!state.dragging) {
      if (Math.abs(deltaX) < DRAG_START_THRESHOLD) return;
      if (Math.abs(deltaX) <= Math.abs(deltaY)) return;
      state.dragging = true;
      setIsDragging(true);
    }

    // 首尾继续外拖时加阻尼，滑动更有边界感
    const atStart = activeIndex === 0 && deltaX > 0;
    const atEnd = activeIndex === count - 1 && deltaX < 0;
    setDragOffset(atStart || atEnd ? deltaX * EDGE_RESISTANCE : deltaX);
  }, [activeIndex, count]);

  const handleTouchEnd = useCallback(() => {
    const state = dragStateRef.current;
    dragStateRef.current = null;
    if (!state) return;

    if (state.dragging) {
      if (dragOffset <= -SWIPE_THRESHOLD && activeIndex < count - 1) {
        setActiveIndex(activeIndex + 1);
      } else if (dragOffset >= SWIPE_THRESHOLD && activeIndex > 0) {
        setActiveIndex(activeIndex - 1);
      }
    }

    setDragOffset(0);
    setIsDragging(false);
  }, [activeIndex, count, dragOffset]);

  if (count === 0) return null;

  return (
    <div
      className="relative w-full aspect-[16/9] overflow-hidden rounded-xl bg-[var(--glass-bg)] mb-3 md:hidden"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
    >
      {/* 滑动轨道：位移由当前索引 + 拖动位移共同决定 */}
      <div
        className="flex h-full w-full will-change-transform"
        style={{
          transform: `translate3d(calc(${-activeIndex * 100}% + ${dragOffset}px), 0, 0)`,
          transition: isDragging ? 'none' : SLIDE_TRANSITION,
        }}
      >
        {movies.map((movie, index) => (
          <button
            key={movie.id}
            type="button"
            onClick={() => onMovieClick(movie)}
            aria-hidden={index !== activeIndex}
            tabIndex={index === activeIndex ? 0 : -1}
            data-focusable={index === activeIndex}
            className="relative h-full w-full flex-shrink-0 text-left cursor-pointer overflow-hidden"
          >
            <Image
              src={movie.cover}
              alt={movie.title}
              fill
              className="object-cover"
              sizes="100vw"
              loading={index === 0 ? 'eager' : 'lazy'}
              unoptimized
              referrerPolicy="no-referrer"
              draggable={false}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-4 pb-7">
              <h2 className="text-white text-base sm:text-xl font-bold truncate">
                {movie.title}
              </h2>
              {movie.rate && parseFloat(movie.rate) > 0 && (
                <span className="flex-shrink-0 flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-xs font-bold text-yellow-400">
                  ★ {movie.rate}
                </span>
              )}
            </div>
          </button>
        ))}
      </div>

      {/* 指示点 */}
      <div className="absolute inset-x-0 bottom-2.5 z-10 flex items-center justify-center gap-1.5">
        {movies.map((movie, index) => (
          <button
            key={movie.id}
            type="button"
            aria-label={`切换到第 ${index + 1} 张`}
            onClick={() => setActiveIndex(index)}
            className={`h-1.5 rounded-full transition-all cursor-pointer ${
              index === activeIndex ? 'w-4 bg-white' : 'w-1.5 bg-white/50'
            }`}
          />
        ))}
      </div>
    </div>
  );
}
