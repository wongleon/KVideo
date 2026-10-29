/**
 * FavoritesItem - Individual favorite item card
 * Matches HistoryItem layout for consistency
 */

import Link from 'next/link';
import { Icons } from '@/components/ui/Icon';
import { FavoriteButton } from '@/components/favorites/FavoriteButton';
import { getSourceName } from '@/lib/utils/source-names';
import { storeGroupedSources } from '@/lib/utils/grouped-sources-cache';
import type { FavoriteItem, VideoHistoryItem } from '@/lib/types';

interface FavoritesItemProps {
    item: FavoriteItem;
    /** 同一部剧的观看历史，存在时共享其线路、集数与播放进度 */
    historyItem?: VideoHistoryItem;
    onRemove: () => void;
    isPremium?: boolean;
}

export function FavoritesItem({ item, historyItem, onRemove, isPremium = false }: FavoritesItemProps) {
    // 有观看历史时沿用历史记录的线路
    const playSource = historyItem?.source || item.source;
    const playVideoId = historyItem
        ? (historyItem.sourceMap?.[historyItem.source] ?? historyItem.videoId)
        : item.videoId;

    const getGroupedSources = () => {
        // 优先使用播放页回写到历史记录的完整线路列表
        if (historyItem?.sources && historyItem.sources.length > 0) {
            const list = historyItem.sources.map((entry) => ({
                id: entry.id,
                source: entry.source,
                sourceName: entry.sourceName || getSourceName(entry.source),
                pic: item.poster,
            }));
            // 确保当前播放线路在列表中，避免播放页再追加一条同源线路
            if (!list.some((entry) => entry.source === playSource && String(entry.id) === String(playVideoId))) {
                list.unshift({
                    id: playVideoId,
                    source: playSource,
                    sourceName: getSourceName(playSource),
                    pic: item.poster,
                });
            }
            return list;
        }

        // 否则合并收藏与历史记录里已知的线路，历史记录的 id 优先
        const sourceMap = { ...(item.sourceMap || {}), ...(historyItem?.sourceMap || {}) };
        return Object.entries(sourceMap).map(([sourceName, videoId]) => ({
            id: videoId,
            source: sourceName,
            sourceName: getSourceName(sourceName),
            pic: item.poster,
        }));
    };

    const getVideoUrl = (): string => {
        const params = new URLSearchParams({
            id: playVideoId.toString(),
            source: playSource,
            title: item.title,
        });

        // 有历史记录时带上集数与播放进度，进入播放页后直接续播
        if (historyItem) {
            params.set('episode', String(historyItem.episodeIndex));
            if (historyItem.playbackPosition > 1) {
                params.set('t', String(Math.floor(historyItem.playbackPosition)));
            }
        }

        const groupData = getGroupedSources();
        if (groupData.length > 1) {
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

    // 集数：有历史记录时显示历史记录的观看集数，否则沿用收藏时记录的信息
    const historyEpisodeText = historyItem
        ? (historyItem.episodes?.[historyItem.episodeIndex]?.name || `第${historyItem.episodeIndex + 1}集`)
        : '';
    const episodeText = historyEpisodeText || item.remarks;

    return (
        <div className="group bg-[color-mix(in_srgb,var(--glass-bg)_50%,transparent)] rounded-lg overflow-hidden hover:bg-[color-mix(in_srgb,var(--accent-color)_10%,transparent)] transition-all border border-transparent hover:border-[var(--glass-border)]">
            {/* 使用客户端导航：避免整页跳转丢失用户手势，进入播放页后可自动播放 */}
            <Link
                href={getVideoUrl()}
                prefetch={false}
                className="block"
            >
                <div className="flex items-stretch gap-3">
                    {/* Poster：竖版，上下贴边、与左侧边框无间距 */}
                    <div className="relative w-16 self-stretch flex-shrink-0 bg-[var(--glass-bg)] overflow-hidden">
                        {item.poster ? (
                            <img
                                src={item.poster}
                                alt={item.title}
                                className="absolute inset-0 w-full h-full object-cover"
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
                    <div className="flex-1 min-w-0 flex flex-col justify-start gap-1.5 pt-2 pb-3">
                        <h3 className="text-base font-medium text-[var(--text-color)] truncate group-hover:text-[var(--accent-color)] transition-colors">
                            {item.title}
                        </h3>
                        {item.year && (
                            <p className="text-xs text-[var(--text-color-secondary)]">
                                {item.year}
                            </p>
                        )}
                        {episodeText && (
                            <div className="flex items-center text-xs text-[var(--text-color-secondary)]">
                                <span className="truncate">{episodeText}</span>
                            </div>
                        )}
                    </div>

                    {/* Actions - 横向排列并上下居中 */}
                    <div className="flex items-center gap-1.5 self-center pr-3 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
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
            </Link>
        </div>
    );
}
