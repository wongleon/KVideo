'use client';

import { useState, useMemo, useCallback } from 'react';
import type { SourceBadge } from '@/lib/types';

interface SourceBadgeSelectionOptions {
  /** 受控的已选源；传入 onSelectedSourceChange 时生效 */
  selectedSource?: string | null;
  /** 选择变化回调；传入后即为受控模式，便于外部持久化所选源 */
  onSelectedSourceChange?: (sourceId: string | null) => void;
}

/**
 * 视频源筛选 Hook（单选）
 * - 同一时间最多选中一个视频源
 * - 再次点击已选中的源即取消筛选（回到全部）
 * - 传入 onSelectedSourceChange 时切换为受控模式
 */
export function useSourceBadges<T extends { source?: string; sourceName?: string }>(
  videos: T[],
  availableSources: SourceBadge[],
  options: SourceBadgeSelectionOptions = {}
) {
  const { selectedSource: controlledSource, onSelectedSourceChange } = options;
  const [internalSource, setInternalSource] = useState<string | null>(null);

  const isControlled = onSelectedSourceChange !== undefined;
  const selectedSource = isControlled ? controlledSource ?? null : internalSource;

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

  const updateSelection = useCallback((next: string | null) => {
    if (onSelectedSourceChange) {
      onSelectedSourceChange(next);
    } else {
      setInternalSource(next);
    }
  }, [onSelectedSourceChange]);

  const toggleSource = useCallback((sourceId: string) => {
    updateSelection(activeSource === sourceId ? null : sourceId);
  }, [activeSource, updateSelection]);

  const clearSelection = useCallback(() => {
    updateSelection(null);
  }, [updateSelection]);

  return {
    selectedSources,
    filteredVideos,
    toggleSource,
    clearSelection,
  };
}
