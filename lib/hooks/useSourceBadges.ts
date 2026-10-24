'use client';

import { useState, useMemo, useCallback } from 'react';
import type { SourceBadge } from '@/lib/types';

/**
 * 视频源筛选 Hook（单选）
 * - 同一时间最多选中一个视频源
 * - 再次点击已选中的源即取消筛选（回到全部）
 */
export function useSourceBadges<T extends { source?: string; sourceName?: string }>(
  videos: T[],
  availableSources: SourceBadge[]
) {
  const [selectedSource, setSelectedSource] = useState<string | null>(null);

  // 搜索过程中源列表会实时变化，选中的源不存在时自动回退为全部
  const activeSource = selectedSource && availableSources.some((source) => source.id === selectedSource)
    ? selectedSource
    : null;

  const selectedSources = useMemo(
    () => new Set(activeSource ? [activeSource] : []),
    [activeSource]
  );

  const filteredVideos = useMemo(() => {
    if (!activeSource) return videos;
    return videos.filter((video) => video.source === activeSource);
  }, [videos, activeSource]);

  const toggleSource = useCallback((sourceId: string) => {
    setSelectedSource((prev) => (prev === sourceId ? null : sourceId));
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedSource(null);
  }, []);

  return {
    selectedSources,
    filteredVideos,
    toggleSource,
    clearSelection,
  };
}
