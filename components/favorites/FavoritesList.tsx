/**
 * FavoritesList - Scrollable list of favorite items
 */

'use client';

import { useMemo } from 'react';
import type { FavoriteItem, VideoHistoryItem } from '@/lib/types';
import { useHistory } from '@/lib/store/history-store';
import { FavoritesItem } from './FavoritesItem';
import { FavoritesEmptyState } from './FavoritesEmptyState';
import { keepRenderableFavorites } from '@/lib/utils/sync-records';

interface FavoritesListProps {
    favorites: FavoriteItem[];
    onRemove: (videoId: string | number, source: string) => void;
    isPremium?: boolean;
}

export function FavoritesList({ favorites, onRemove, isPremium = false }: FavoritesListProps) {
    const { viewingHistory } = useHistory(isPremium);

    // 标题 → 最近一条观看历史，用于收藏项共享历史记录的进度、集数与线路
    const historyByTitle = useMemo(() => {
        const map = new Map<string, VideoHistoryItem>();
        for (const item of viewingHistory) {
            const key = item.title.toLowerCase().trim();
            if (!map.has(key)) map.set(key, item);
        }
        return map;
    }, [viewingHistory]);

    const renderableFavorites = keepRenderableFavorites(favorites);

    if (renderableFavorites.length === 0) {
        return <FavoritesEmptyState />;
    }

    return (
        <div className="flex-1 overflow-y-auto -mx-2 px-2 space-y-2 scroll-smooth">
            {renderableFavorites.map((item) => (
                <FavoritesItem
                    key={`${item.source}:${item.videoId}`}
                    item={item}
                    historyItem={historyByTitle.get(item.title.toLowerCase().trim())}
                    onRemove={() => onRemove(item.videoId, item.source)}
                    isPremium={isPremium}
                />
            ))}
        </div>
    );
}
