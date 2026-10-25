import { SourceBadges } from '@/components/search/SourceBadges';
import { VideoGrid } from '@/components/search/VideoGrid';
import { useSourceBadges } from '@/lib/hooks/useSourceBadges';
import { Video, SourceBadge } from '@/lib/types';

interface SearchResultsProps {
    results: Video[];
    availableSources: SourceBadge[];
    loading: boolean;
    isPremium?: boolean;
    latencies?: Record<string, number>;
}

export function SearchResults({
    results,
    availableSources,
    loading,
    isPremium = false,
    latencies = {},
}: SearchResultsProps) {
    // 视频源筛选（单选）
    const {
        selectedSources,
        filteredVideos,
        toggleSource,
        clearSelection,
    } = useSourceBadges(results, availableSources);

    if (results.length === 0 && !loading) return null;

    return (
        <div className="animate-fade-in">
            {/* 视频源筛选标签 */}
            {availableSources.length > 0 && (
                <SourceBadges
                    sources={availableSources}
                    selectedSources={selectedSources}
                    onToggleSource={toggleSource}
                    onClearSelection={clearSelection}
                    totalCount={results.length}
                    className="mb-6"
                />
            )}

            <VideoGrid
                videos={filteredVideos}
                isPremium={isPremium}
                latencies={latencies}
            />
        </div>
    );
}
