/**
 * YouMayAlsoLike - 播放页「猜你喜欢」模块
 * 基于当前视频的类型 / 演员 / 地区推荐相似内容，最多展示 6 条，点击卡片跳转搜索
 */

'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { MovieCard } from '@/components/home/MovieCard';
import { clearSearchPageCache } from '@/lib/utils/search-page-cache';
import { useSimilarRecommendations, type SimilarMovie } from './hooks/useSimilarRecommendations';

interface YouMayAlsoLikeProps {
  title?: string;
  typeName?: string;
  actors?: string;
  area?: string;
}

export function YouMayAlsoLike({ title, typeName, actors, area }: YouMayAlsoLikeProps) {
  const router = useRouter();
  const { movies, loading } = useSimilarRecommendations({ title, typeName, actors, area });

  const handleMovieClick = useCallback(
    (movie: SimilarMovie) => {
      // 主动发起新的搜索，清空上次记录，避免回显旧搜索结果
      clearSearchPageCache();
      router.push(`/search?q=${encodeURIComponent(movie.title)}`);
    },
    [router]
  );

  // 无数据且不在加载中时整体隐藏，避免出现空模块
  if (!loading && movies.length === 0) return null;

  return (
    <section className="pt-2">
      <h2 className="mb-4 text-lg font-bold text-[var(--text-color)]">猜你喜欢</h2>

      {loading && movies.length === 0 ? (
        <div className="flex justify-center py-10">
          <div className="animate-spin rounded-full h-10 w-10 border-4 border-[var(--accent-color)] border-t-transparent" />
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 md:gap-4">
          {movies.map((movie) => (
            <MovieCard key={movie.id} movie={movie} onMovieClick={handleMovieClick} />
          ))}
        </div>
      )}
    </section>
  );
}
