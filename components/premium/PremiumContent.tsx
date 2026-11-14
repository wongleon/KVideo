'use client';

import { MovieGrid } from '@/components/home/MovieGrid';
import { PremiumContentGrid } from './PremiumContentGrid';
import { usePremiumContent } from '@/lib/hooks/usePremiumContent';
import { usePersonalizedRecommendations } from '@/components/home/hooks/usePersonalizedRecommendations';

type RecommendState = ReturnType<typeof usePersonalizedRecommendations>;

interface PremiumContentProps {
    onSearch?: (query: string) => void;
    /** 当前分类对应的筛选值；推荐模式下传空字符串 */
    categoryValue: string;
    /** 是否处于「为你推荐」标签 */
    recommendSelected: boolean;
    /** 推荐数据由页面层持有，便于标签栏与内容区共享同一份状态 */
    recommend: RecommendState;
}

export function PremiumContent({
    onSearch,
    categoryValue,
    recommendSelected,
    recommend,
}: PremiumContentProps) {
    const {
        videos,
        loading,
        hasMore,
        prefetchRef,
        loadMoreRef,
    } = usePremiumContent(recommendSelected ? '' : categoryValue);

    const handleVideoClick = (video: any) => {
        if (onSearch) {
            onSearch(video.vod_name || video.title);
        }
    };

    return (
        <div className="animate-fade-in">
            {recommendSelected ? (
                <MovieGrid
                    movies={recommend.movies}
                    loading={recommend.loading}
                    hasMore={recommend.hasMore}
                    onMovieClick={handleVideoClick}
                    prefetchRef={recommend.prefetchRef}
                    loadMoreRef={recommend.loadMoreRef}
                />
            ) : (
                <PremiumContentGrid
                    videos={videos}
                    loading={loading}
                    hasMore={hasMore}
                    onVideoClick={handleVideoClick}
                    prefetchRef={prefetchRef}
                    loadMoreRef={loadMoreRef}
                />
            )}
        </div>
    );
}
