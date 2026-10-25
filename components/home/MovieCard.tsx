/**
 * MovieCard - Individual movie card component
 * Displays movie poster, title, and rating
 */

import { memo, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { Icons } from '@/components/ui/Icon';

interface DoubanMovie {
  id: string;
  title: string;
  cover: string;
  rate: string;
  url: string;
}

interface MovieCardProps {
  movie: DoubanMovie;
  onMovieClick: (movie: DoubanMovie) => void;
}

export const MovieCard = memo(function MovieCard({ movie, onMovieClick }: MovieCardProps) {
  const [imageError, setImageError] = useState(false);
  const [fallbackError, setFallbackError] = useState(false);

  return (
    <Link
      href={`/search?q=${encodeURIComponent(movie.title)}`}
      onClick={(e) => {
        // Allow default behavior for modifier keys (new tab, etc.)
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

        e.preventDefault();
        onMovieClick(movie);
      }}
      data-focusable
      className="group block cursor-pointer md:hover:translate-y-[-2px] transition-transform duration-200 ease-out"
      style={{
        position: 'relative',
        zIndex: 1,
        contentVisibility: 'auto'
      }}
      onMouseEnter={(e) => (e.currentTarget.style.zIndex = '2')}
      onMouseLeave={(e) => (e.currentTarget.style.zIndex = '1')}
    >
      <Card hover={false} className="p-0! relative overflow-hidden border-0! rounded-xl! shadow-[0_2px_8px_var(--shadow-color)] md:hover:shadow-[0_8px_24px_var(--shadow-color)] transition-shadow duration-200 ease-out" blur={false}>
        {/* 海报 */}
        <div className="relative aspect-[5/8] bg-[var(--glass-bg)]">
          {!imageError ? (
            <Image
              src={movie.cover}
              alt={movie.title}
              fill
              className="object-cover transition-transform duration-300 md:group-hover:scale-105"
              sizes="(max-width: 768px) 50vw, (max-width: 1024px) 25vw, 20vw"
              loading="eager"
              unoptimized
              referrerPolicy="no-referrer"
              onError={() => setImageError(true)}
            />
          ) : !fallbackError ? (
            <Image
              src="/placeholder-poster.svg"
              alt={movie.title}
              fill
              className="object-cover"
              sizes="(max-width: 768px) 50vw, (max-width: 1024px) 25vw, 20vw"
              unoptimized
              onError={() => setFallbackError(true)}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-[var(--glass-bg)]">
              <p className="text-sm text-[var(--text-muted)]">暂无图片</p>
            </div>
          )}
          {movie.rate && parseFloat(movie.rate) > 0 && (
            <div
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation(); // 阻止事件冒泡，防止触发外层卡片的搜索点击
                window.open(movie.url, '_blank', 'noopener,noreferrer');
              }}
              title="在豆瓣中查看"
              className="absolute top-2 right-2 bg-black/80 md:hover:bg-black/90 px-2.5 py-1.5 flex items-center gap-1.5 rounded-[var(--radius-full)] z-20 md:hover:scale-105 transition-all shadow-md"
            >
              <Icons.Star size={12} className="text-yellow-400 fill-yellow-400" />
              <span className="text-xs font-bold text-white">
                {movie.rate}
              </span>
            </div>
          )}
        </div>
      </Card>
      {/* 名称：放在卡片外部，与海报左对齐 */}
      <div className="pt-2">
        <h3 className="font-semibold text-sm text-left text-[var(--text-color)] line-clamp-2 md:group-hover:text-[var(--accent-color)] transition-colors">
          {movie.title}
        </h3>
      </div>
    </Link>
  );
});
