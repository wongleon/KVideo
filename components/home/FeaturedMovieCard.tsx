/**
 * FeaturedMovieCard - 首页当前标签的第一条影片
 * 以横向大卡片展示在列表上方，切换标签时随之更新，不再轮播
 */

'use client';

import Image from 'next/image';
import { useState } from 'react';

interface FeaturedMovie {
  id: string;
  title: string;
  cover: string;
  rate: string;
  url: string;
}

interface FeaturedMovieCardProps {
  movie: FeaturedMovie;
  onMovieClick: (movie: FeaturedMovie) => void;
}

export function FeaturedMovieCard({ movie, onMovieClick }: FeaturedMovieCardProps) {
  const [imageError, setImageError] = useState(false);

  return (
    <button
      type="button"
      onClick={() => onMovieClick(movie)}
      aria-label={movie.title}
      data-focusable
      className="relative block w-full aspect-[16/9] overflow-hidden rounded-xl bg-[var(--glass-bg)] mb-3 text-left cursor-pointer md:hidden"
    >
      <Image
        // 封面加载失败时回落到占位图，避免大卡片整块空白
        src={imageError ? '/placeholder-poster.svg' : movie.cover}
        alt={movie.title}
        fill
        className="object-cover"
        sizes="100vw"
        loading="eager"
        unoptimized
        referrerPolicy="no-referrer"
        draggable={false}
        onError={() => setImageError(true)}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-4">
        <h2 className="text-white text-base sm:text-xl font-bold truncate">{movie.title}</h2>
        {movie.rate && parseFloat(movie.rate) > 0 && (
          <span className="flex-shrink-0 flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-xs font-bold text-yellow-400">
            ★ {movie.rate}
          </span>
        )}
      </div>
    </button>
  );
}
