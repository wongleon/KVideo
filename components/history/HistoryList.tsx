import { memo } from 'react';
import { HistoryItem } from './HistoryItem';
import { HistoryEmptyState } from './HistoryEmptyState';
import type { VideoHistoryItem } from '@/lib/types';
import { keepRenderableHistory } from '@/lib/utils/sync-records';

interface HistoryListProps {
    history: VideoHistoryItem[];
    /** 删除回调：需要由调用方用 useCallback 保证引用稳定 */
    onRemove: (showIdentifier: string) => void;
    isPremium?: boolean;
}

/** 只对视口内前几条开启预取，避免几十条历史同时发起 RSC 请求 */
const PREFETCH_LIMIT = 8;

export const HistoryList = memo(function HistoryList({
    history,
    onRemove,
    isPremium = false,
}: HistoryListProps) {
    const renderableHistory = keepRenderableHistory(history);

    return (
        <div className="flex-1 overflow-y-auto -mx-2 px-2" style={{
            transform: 'translate3d(0, 0, 0)',
            WebkitOverflowScrolling: 'touch'
        }}>
            {renderableHistory.length === 0 ? (
                <HistoryEmptyState />
            ) : (
                <div className="space-y-3">
                    {renderableHistory.map((item, index) => (
                        <HistoryItem
                            key={item.showIdentifier}
                            item={item}
                            onRemove={onRemove}
                            isPremium={isPremium}
                            prefetch={index < PREFETCH_LIMIT}
                        />
                    ))}
                </div>
            )}
        </div>
    );
});
