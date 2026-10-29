/**
 * HistoryItem - Individual watch history item
 * Displays video thumbnail, title, episode, progress, and delete button
 */

import Link from 'next/link';
import Image from 'next/image';
import { Icons } from '@/components/ui/Icon';
import { formatTime } from '@/lib/utils/format-utils';
import { PosterImage } from './PosterImage';
import { FavoriteButton } from '@/components/favorites/FavoriteButton';
import { getSourceName } from '@/lib/utils/source-names';
import { storeGroupedSources } from '@/lib/utils/grouped-sources-cache';
import type { VideoHistoryItem } from '@/lib/types';

interface HistoryItemProps {
  item: VideoHistoryItem;
  onRemove: () => void;
  isPremium?: boolean;
}

export function HistoryItem({ item, onRemove, isPremium = false }: HistoryItemProps) {
  // 优先使用播放页记录的完整线路列表，旧记录回退到 sourceMap
  const getGroupedSources = () => {
    if (item.sources && item.sources.length > 0) {
      const list = item.sources.map((entry) => ({
        id: entry.id,
        source: entry.source,
        sourceName: entry.sourceName || getSourceName(entry.source),
        pic: item.poster,
      }));
      // 确保当前播放的线路在列表中，避免播放页再追加一条同源线路
      if (!list.some((entry) => entry.source === item.source && String(entry.id) === String(item.videoId))) {
        list.unshift({
          id: item.videoId,
          source: item.source,
          sourceName: getSourceName(item.source),
          pic: item.poster,
        });
      }
      return list;
    }

    if (item.sourceMap) {
      return Object.entries(item.sourceMap).map(([sourceName, videoId]) => ({
        id: videoId,
        source: sourceName,
        sourceName: getSourceName(sourceName),
        pic: item.poster,
      }));
    }

    return [];
  };

  const getVideoUrl = (): string => {
    const params = new URLSearchParams({
      id: item.videoId.toString(),
      source: item.source,
      title: item.title,
      episode: item.episodeIndex.toString(),
    });
    // Store groupedSources in sessionStorage to avoid long URLs
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

  const progress = (item.playbackPosition / item.duration) * 100;
  const episodeText = item.episodes && item.episodes.length > 0
    ? item.episodes[item.episodeIndex]?.name || `第${item.episodeIndex + 1}集`
    : '';

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
          <PosterImage poster={item.poster} title={item.title} progress={progress} />

          {/* Info */}
          <div className="flex-1 min-w-0 flex flex-col justify-start gap-1.5 pt-2 pb-3">
            <h3 className="text-base font-medium text-[var(--text-color)] truncate group-hover:text-[var(--accent-color)] transition-colors">
              {item.title}
            </h3>
            {episodeText && (
              <p className="text-xs text-[var(--text-color-secondary)]">
                {episodeText}
              </p>
            )}
            <div className="flex items-center text-xs text-[var(--text-color-secondary)]">
              <span>{formatTime(item.playbackPosition)} / {formatTime(item.duration)}</span>
            </div>
          </div>

          {/* Actions - 横向排列并上下居中 */}
          <div className="flex items-center gap-1.5 self-center pr-3 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
            {/* Favorite button - 左侧 */}
            <FavoriteButton
              videoId={item.videoId}
              source={item.source}
              title={item.title}
              poster={item.poster}
              remarks={episodeText}
              sourceMap={item.sourceMap}
              size={18}
              className="!p-2 !bg-transparent !border-0 !shadow-none hover:!bg-[var(--glass-bg)]"
              showTooltip={false}
              isPremium={isPremium}
            />

            {/* Delete button - 右侧，尺寸稍大 */}
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onRemove();
              }}
              className="p-2.5 hover:bg-[var(--glass-bg)] rounded-full cursor-pointer"
              aria-label="删除"
            >
              <Icons.Trash size={20} className="text-[var(--text-color-secondary)]" />
            </button>
          </div>
        </div>
      </Link>
    </div>
  );
}
