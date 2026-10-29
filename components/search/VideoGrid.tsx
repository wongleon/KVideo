'use client';

import { useState, useRef, useCallback, useMemo, memo, useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { VideoCard } from './VideoCard';
import { VideoGroupCard, GroupedVideo } from './VideoGroupCard';
import { settingsStore } from '@/lib/store/settings-store';
import { useHistory } from '@/lib/store/history-store';
import { Video, VideoHistoryItem } from '@/lib/types';
import { useResolutionProbe } from '@/lib/hooks/useResolutionProbe';

interface VideoGridProps {
  videos: Video[];
  className?: string;
  isPremium?: boolean;
  latencies?: Record<string, number>;
}

export const VideoGrid = memo(function VideoGrid({
  videos,
  className = '',
  isPremium = false,
  latencies = {}
}: VideoGridProps) {
  const [visibleCount, setVisibleCount] = useState(24);
  const [displayMode, setDisplayMode] = useState<'normal' | 'grouped'>('normal');
  const gridRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Load display mode from settings
  useEffect(() => {
    const settings = settingsStore.getSettings();
    setDisplayMode(settings.searchDisplayMode);

    // Initial load: Check for saved scroll position to ensure we render enough items
    const params = searchParams.toString();
    const scrollKey = `scroll-pos:${pathname}${params ? '?' + params : ''}`;
    const savedPos = sessionStorage.getItem(scrollKey);

    if (savedPos && settings.rememberScrollPosition) {
      const position = parseInt(savedPos, 10);
      if (!isNaN(position) && position > 500) {
        // Approximate visible count needed: 
        // 500 is roughly where the second/third row starts.
        // Each row is ~300-400px high on most screens. 
        // 24 items is 4-6 rows.
        // If scroll is deep, we force a larger initial visible count.
        // 24, 48, 72, 96...
        const estimatedRowsNeeded = Math.ceil(position / 300) + 2;
        // Match CSS breakpoints: sm: 3, md: 4, lg: 5, xl: 6
        const itemsPerRow = window.innerWidth >= 1280 ? 6 :
          (window.innerWidth >= 1024 ? 5 :
            (window.innerWidth >= 768 ? 4 :
              (window.innerWidth >= 640 ? 3 : 2)));
        const neededCount = Math.min(videos.length, estimatedRowsNeeded * itemsPerRow);

        if (neededCount > 24) {
          setVisibleCount(Math.ceil(neededCount / 24) * 24);
        }
      }
    }

    const unsubscribe = settingsStore.subscribe(() => {
      const newSettings = settingsStore.getSettings();
      setDisplayMode(newSettings.searchDisplayMode);
    });

    return () => unsubscribe();
  }, [pathname, searchParams, videos.length]);

  // 观看历史：点击搜索结果时，若存在历史记录则直接按上次的进度与线路续播
  const { viewingHistory } = useHistory(isPremium);

  // 标题 → 最近一条历史记录（历史记录本身已按标题去重，数组按观看时间倒序）
  const historyByTitle = useMemo(() => {
    const map = new Map<string, VideoHistoryItem>();
    for (const item of viewingHistory) {
      const key = item.title.toLowerCase().trim();
      if (!map.has(key)) map.set(key, item);
    }
    return map;
  }, [viewingHistory]);

  // 分组模式：按「标题 + 年份」合并，年份缺失的条目单独成组
  const groupedVideos = useMemo<GroupedVideo[]>(() => {
    if (displayMode !== 'grouped') return [];

    const groups = new Map<string, Video[]>();

    videos.forEach(video => {
      const name = video.vod_name.toLowerCase().trim();
      const year = (video.vod_year ?? '').trim();
      // 使用不可见分隔符，避免标题本身含分隔符时误合并
      const key = `${name}\u0000${year}`;
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(video);
    });

    return Array.from(groups.values()).map((groupVideos) => {
      // Sort by latency (lowest first) 
      const sorted = [...groupVideos].sort((a, b) => {
        if (a.latency === undefined) return 1;
        if (b.latency === undefined) return -1;
        return a.latency - b.latency;
      });

      return {
        representative: sorted[0],
        videos: sorted,
        name: sorted[0].vod_name,
        year: (sorted[0].vod_year ?? '').trim(),
      };
    });
  }, [videos, displayMode]);

  // Callback ref for the load more trigger
  const loadMoreRef = useCallback((node: HTMLDivElement | null) => {
    if (observerRef.current) observerRef.current.disconnect();

    if (node) {
      observerRef.current = new IntersectionObserver(entries => {
        if (entries[0].isIntersecting) {
          setVisibleCount(prev => prev + 24);
        }
      }, { rootMargin: '400px' });

      observerRef.current.observe(node);
    }
  }, []);

  // Normal mode items
  const videoItems = useMemo(() => {
    if (displayMode === 'grouped') return [];

    return videos.map((video, index) => {
      const params: Record<string, string> = {
        id: String(video.vod_id),
        source: video.source,
        title: video.vod_name,
      };

      // 同一视频源存在观看历史时，带上集数与播放进度续播
      const historyItem = historyByTitle.get(video.vod_name.toLowerCase().trim());
      if (historyItem && historyItem.source === video.source) {
        params.episode = String(historyItem.episodeIndex);
        if (historyItem.playbackPosition > 1) {
          params.t = String(Math.floor(historyItem.playbackPosition));
        }
      }

      if (isPremium) {
        params.premium = '1';
      }

      const videoUrl = `/player?${new URLSearchParams(params).toString()}`;

      const cardId = `${video.vod_id}-${index}`;

      return { video, videoUrl, cardId };
    });
  }, [videos, displayMode, isPremium, historyByTitle]);

  // Grouped mode items
  const groupItems = useMemo(() => {
    if (displayMode !== 'grouped') return [];

    return groupedVideos.map((group, index) => {
      const historyItem = historyByTitle.get(group.name.toLowerCase().trim());
      // 默认使用组内代表线路，存在历史记录时优先沿用历史记录的线路
      let playTarget = group.representative;
      let resume: { episodeIndex: number; position: number } | undefined;

      if (historyItem) {
        const historyVideoId = historyItem.sourceMap?.[historyItem.source] ?? historyItem.videoId;
        const matched =
          group.videos.find(
            (video) => video.source === historyItem.source && String(video.vod_id) === String(historyVideoId)
          ) ?? group.videos.find((video) => video.source === historyItem.source);

        if (matched) {
          playTarget = matched;
          resume = {
            episodeIndex: historyItem.episodeIndex,
            position: historyItem.playbackPosition,
          };
        }
      }

      return {
        group,
        cardId: `group-${group.representative.vod_id}-${index}`,
        playTarget,
        resume,
      };
    });
  }, [groupedVideos, displayMode, historyByTitle]);

  // Build probe list for grouped mode (probe representative of each group)
  const groupedProbeList = useMemo(() => {
    if (displayMode !== 'grouped') return [];
    return groupedVideos.map(g => ({ id: String(g.representative.vod_id), source: g.representative.source }));
  }, [groupedVideos, displayMode]);

  // 分组模式才需要探测分辨率，普通卡片不再展示分辨率
  const probeList = displayMode === 'grouped' ? groupedProbeList : [];
  const { resolutions, isProbing } = useResolutionProbe(probeList);

  const totalItems = displayMode === 'grouped' ? groupItems.length : videoItems.length;

  // 空结果直接返回（必须放在所有 Hook 之后，避免 Hook 数量变化）
  if (videos.length === 0) {
    return null;
  }

  return (
    <>
      <div
        ref={gridRef}
        className={`grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 md:gap-4 lg:gap-6 max-w-[1920px] mx-auto ${className}`}
        role="list"
        aria-label="视频搜索结果"
      >
        {displayMode === 'grouped' ? (
          // Grouped mode
          groupItems.slice(0, visibleCount).map(({ group, cardId, playTarget, resume }) => {
            return (
              <VideoGroupCard
                key={cardId}
                group={group}
                cardId={cardId}
                playTarget={playTarget}
                resume={resume}
                isPremium={isPremium}
                latencies={latencies}
                resolution={resolutions[`${group.representative.source}:${group.representative.vod_id}`]}
                isProbing={isProbing && !resolutions[`${group.representative.source}:${group.representative.vod_id}`]}
              />
            );
          })
        ) : (
          // Normal mode
          videoItems.slice(0, visibleCount).map(({ video, videoUrl, cardId }) => {
            return (
              <VideoCard
                key={cardId}
                video={video}
                videoUrl={videoUrl}
                cardId={cardId}
                latencies={latencies}
              />
            );
          })
        )}
      </div>

      {/* Load more trigger */}
      {visibleCount < totalItems && (
        <div
          ref={loadMoreRef}
          className="h-20 w-full flex items-center justify-center opacity-0 pointer-events-none"
          aria-hidden="true"
        />
      )}
    </>
  );
});

