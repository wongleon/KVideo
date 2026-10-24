/**
 * FavoritesItem - Individual favorite item card
 * Matches HistoryItem layout for consistency
 */

import { Icons } from '@/components/ui/Icon';
import { FavoriteButton } from '@/components/favorites/FavoriteButton';
import { formatDate } from '@/lib/utils/format-utils';
import { getSourceName } from '@/lib/utils/source-names';
import { storeGroupedSources } from '@/lib/utils/grouped-sources-cache';
import type { FavoriteItem } from '@/lib/types';

interface FavoritesItemProps {
    item: FavoriteItem;
    onRemove: () => void;
    isPremium?: boolean;
}

export function FavoritesItem({ item, onRemove, isPremium = false }: FavoritesItemProps) {
    const getVideoUrl = (): string => {
        const params = new URLSearchParams({
            id: item.videoId.toString(),
            source: item.source,
            title: item.title,
        });
        if (item.sourceMap && Object.keys(item.sourceMap).length > 1) {
            const groupData = Object.entries(item.sourceMap).map(([sourceName, videoId]) => ({
                id: videoId,
                source: sourceName,
                sourceName: getSourceName(sourceName),
                pic: item.poster,
            }));
            const cacheKey = storeGroupedSources(groupData);
            if (cacheKey) {
                params.set('gs', cacheKey);
            }
        }
        if (isPremium) {
            params.set('premium', '1');
        }
        return `/player?${params.toString()}`;
    };

    const handleClick = (event: React.MouseEvent) => {
        // Middle mouse or Ctrl/Cmd+click opens in new tab
        if (event.button === 1 || event.ctrlKey || event.metaKey) {
            event.preventDefault();
            window.open(getVideoUrl(), '_blank');
            return;
        }
    };

    return (
        <div className="group bg-[color-mix(in_srgb,var(--glass-bg)_50%,transparent)] rounded-[var(--radius-2xl)] p-3 hover:bg-[color-mix(in_srgb,var(--accent-color)_10%,transparent)] transition-all border border-transparent hover:border-[var(--glass-border)]">
            <a
                href={getVideoUrl()}
                onClick={(e) => {
                    e.preventDefault();
                    handleClick(e as any);
                    if (!e.ctrlKey && !e.metaKey) {
                        window.location.href = getVideoUrl();
                    }
                }}
                onAuxClick={(e) => handleClick(e as any)}
                className="block"
            >
                <div className="flex gap-3">
                    {/* Poster - Same size as HistoryItem */}
                    <div className="relative w-28 h-16 flex-shrink-0 bg-[var(--glass-bg)] rounded-[var(--radius-2xl)] overflow-hidden">
                        {item.poster ? (
                            <img
                                src={item.poster}
                                alt={item.title}
                                className="w-full h-full object-cover"
                                referrerPolicy="no-referrer"
                                onError={(e) => {
                                    const target = e.currentTarget as HTMLImageElement;
                                    target.style.display = 'none';
                                }}
                            />
                        ) : null}
                        {/* Fallback icon */}
                        <div className="absolute inset-0 flex items-center justify-center -z-10">
                            <Icons.Film size={32} className="text-[var(--text-color-secondary)] opacity-30" />
                        </div>
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-medium text-[var(--text-color)] truncate group-hover:text-[var(--accent-color)] transition-colors mb-1">
                            {item.title}
                        </h3>
                        {item.year && (
                            <p className="text-xs text-[var(--text-color-secondary)] mb-1">
                                {item.year}
                            </p>
                        )}
                        <div className="flex items-center justify-between text-xs text-[var(--text-color-secondary)]">
                            {item.remarks && (
                                <span className="truncate">{item.remarks}</span>
                            )}
                            <span className="flex-shrink-0">
                                {formatDate(item.addedAt)}
                            </span>
                        </div>
                    </div>

                    {/* Actions - 横向排列并上下居中 */}
                    <div className="flex items-center gap-1.5 self-center opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                        {/* Favorite button - 左侧 */}
                        <FavoriteButton
                            videoId={item.videoId}
                            source={item.source}
                            title={item.title}
                            poster={item.poster}
                            sourceName={item.sourceName}
                            type={item.type}
                            year={item.year}
                            remarks={item.remarks}
                            sourceMap={item.sourceMap}
                            size={18}
                            className="!p-2 !bg-transparent !border-0 !shadow-none hover:!bg-[var(--glass-bg)]"
                            showTooltip={false}
                            isPremium={isPremium}
                        />

                        {/* Remove button - 右侧，尺寸稍大 */}
                        <button
                            onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                onRemove();
                            }}
                            className="p-2.5 hover:bg-[var(--glass-bg)] rounded-full cursor-pointer"
                            aria-label="取消收藏"
                        >
                            <Icons.Trash size={20} className="text-[var(--text-color-secondary)]" />
                        </button>
                    </div>
                </div>
            </a>
        </div>
    );
}
