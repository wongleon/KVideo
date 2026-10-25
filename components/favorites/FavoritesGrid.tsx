'use client';

import { useState, useRef, useEffect, useMemo, memo } from 'react';
import { VideoCard } from '@/components/search/VideoCard';
import { FavoritesEmptyState } from './FavoritesEmptyState';
import type { FavoriteItem, Video } from '@/lib/types';

interface FavoritesGridProps {
  favorites: FavoriteItem[];
  isPremium?: boolean;
}

export const FavoritesGrid = memo(function FavoritesGrid({
  favorites,
  isPremium = false
}: FavoritesGridProps) {
  const [visibleCount, setVisibleCount] = useState(24);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  // Convert FavoriteItem to Video format
  const videos: Video[] = useMemo(
    () =>
      favorites.map((favorite) => ({
        vod_id: favorite.videoId,
        vod_name: favorite.title,
        vod_pic: favorite.poster,
        vod_remarks: favorite.remarks,
        vod_year: favorite.year,
        type_name: favorite.type,
        source: favorite.source,
        sourceName: favorite.sourceName,
      })),
    [favorites]
  );

  // Setup intersection observer for infinite scroll
  useEffect(() => {
    if (observerRef.current) {
      observerRef.current.disconnect();
    }

    observerRef.current = new IntersectionObserver(
      (entries) => {
        const first = entries[0];
        if (first.isIntersecting && visibleCount < videos.length) {
          setVisibleCount((prev) => Math.min(prev + 24, videos.length));
        }
      },
      { threshold: 0.1 }
    );

    if (loadMoreRef.current) {
      observerRef.current.observe(loadMoreRef.current);
    }

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [visibleCount, videos.length]);

  if (videos.length === 0) {
    return <FavoritesEmptyState />;
  }

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-6 gap-3 md:gap-4 lg:gap-6">
        {videos.slice(0, visibleCount).map((video) => {
          const cardId = `${video.source}:${video.vod_id}`;
          const videoUrl = `/player?id=${video.vod_id}&source=${video.source}&title=${encodeURIComponent(video.vod_name)}${isPremium ? '&premium=1' : ''}`;

          return (
            <VideoCard
              key={cardId}
              video={video}
              videoUrl={videoUrl}
              cardId={cardId}
            />
          );
        })}
      </div>

      {/* Load more trigger */}
      {visibleCount < videos.length && (
        <div
          ref={loadMoreRef}
          className="h-20 w-full flex items-center justify-center opacity-0 pointer-events-none"
          aria-hidden="true"
        />
      )}
    </>
  );
});
