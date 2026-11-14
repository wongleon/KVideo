'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { Icons } from '@/components/ui/Icon';

/**
 * 移动端选集底部弹窗
 * 集数较多时，选集栏右侧的「选集 >」入口唤起该弹窗：
 * 顶部为标题与收起按钮，中间按每 50 集分段，下方为 5 列集数网格
 */

export interface PickerEpisode {
  name?: string;
  url: string;
}

interface EpisodePickerSheetProps {
  isOpen: boolean;
  onClose: () => void;
  /** 按当前展示顺序排列的剧集列表 */
  episodes: PickerEpisode[];
  /** 当前集在 episodes 中的下标 */
  currentIndex: number;
  /** 点击某一集时回调，参数为 displayIndex */
  onSelect: (displayIndex: number) => void;
}

/** 每个分段包含的集数，与选集列表保持一致 */
const EPISODES_PER_PAGE = 50;

/** 移动端固定播放器底部位置（16:9 视频 + 顶部安全区），弹窗从这里直接向下铺开 */
const PLAYER_BOTTOM_OFFSET = 'calc(56.25vw + env(safe-area-inset-top))';

export function EpisodePickerSheet({ isOpen, ...rest }: EpisodePickerSheetProps) {
  // 关闭时直接卸载，重新打开会自动重置分段位置并重播入场动画
  if (!isOpen) return null;
  return <EpisodePickerSheetContent {...rest} />;
}

function EpisodePickerSheetContent({
  onClose,
  episodes,
  currentIndex,
  onSelect,
}: Omit<EpisodePickerSheetProps, 'isOpen'>) {
  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(episodes.length / EPISODES_PER_PAGE)),
    [episodes.length]
  );

  // 初始落在当前集所在分段，避免打开后再用 effect 同步状态
  const [page, setPage] = useState(() =>
    Math.min(Math.max(0, Math.floor(currentIndex / EPISODES_PER_PAGE)), totalPages - 1)
  );
  const currentItemRef = useRef<HTMLButtonElement | null>(null);
  const segmentRailRef = useRef<HTMLDivElement>(null);

  const pageLabels = useMemo(() => {
    const labels: string[] = [];
    for (let index = 0; index < totalPages; index += 1) {
      const start = index * EPISODES_PER_PAGE + 1;
      const end = Math.min((index + 1) * EPISODES_PER_PAGE, episodes.length);
      labels.push(`${start}-${end}`);
    }
    return labels;
  }, [episodes.length, totalPages]);

  // 打开期间锁定页面滚动，避免弹窗背后的页面跟着滚动
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  // Esc 关闭
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // 分段切换后把当前集滚动到可视区域
  useEffect(() => {
    const timer = window.setTimeout(() => {
      currentItemRef.current?.scrollIntoView({ block: 'center' });
    }, 80);
    return () => window.clearTimeout(timer);
  }, [page]);

  // 桌面端：分段栏内容溢出时把纵向滚轮转为横向滚动
  useEffect(() => {
    const element = segmentRailRef.current;
    if (!element) return;

    const handleWheel = (event: WheelEvent) => {
      if (element.scrollWidth - element.clientWidth <= 0) return;
      // 触控板横向手势交给浏览器默认处理
      if (Math.abs(event.deltaX) >= Math.abs(event.deltaY)) return;

      event.preventDefault();
      element.scrollLeft += event.deltaY;
    };

    element.addEventListener('wheel', handleWheel, { passive: false });
    return () => element.removeEventListener('wheel', handleWheel);
  }, [totalPages]);

  const pageStart = page * EPISODES_PER_PAGE;
  const pageEpisodes = episodes.slice(pageStart, pageStart + EPISODES_PER_PAGE);

  return (
    <div className="fixed inset-0 z-[9999] lg:hidden" role="dialog" aria-modal="true" aria-label="选集">
      {/* 遮罩：只覆盖播放器以下区域 */}
      <div
        className="absolute inset-x-0 bottom-0 bg-black/40 animate-backdrop-fade-in"
        style={{ top: PLAYER_BOTTOM_OFFSET }}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* 面板：无圆角，顶部直接贴着播放器 */}
      <div
        className="absolute inset-x-0 bottom-0 flex flex-col bg-[var(--bg-color)] shadow-[0_-8px_32px_var(--shadow-color)] animate-sheet-slide-up"
        style={{ top: PLAYER_BOTTOM_OFFSET }}
      >
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-5 pb-3 pt-4">
          <h2 className="text-lg font-bold text-[var(--text-color)]">选集</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="收起选集"
            className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-full)] text-[var(--text-color-secondary)] transition-colors hover:bg-[var(--glass-hover)] cursor-pointer"
          >
            <Icons.ChevronDown size={20} />
          </button>
        </div>

        {/* 分段切换：每 50 集一段 */}
        {totalPages > 1 && (
          <div
            ref={segmentRailRef}
            className="flex gap-2 overflow-x-auto overscroll-x-contain px-5 pb-3 scrollbar-hide touch-pan-x"
          >
            {pageLabels.map((label, index) => (
              <button
                key={label}
                type="button"
                onClick={() => setPage(index)}
                aria-current={page === index ? 'true' : undefined}
                className={`flex-shrink-0 rounded-[var(--radius-full)] px-4 py-1.5 text-sm font-medium transition-colors cursor-pointer ${
                  page === index
                    ? 'bg-[var(--accent-color)] text-white'
                    : 'bg-[color-mix(in_srgb,var(--text-color)_6%,transparent)] text-[var(--text-color-secondary)] hover:text-[var(--text-color)]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {/* 集数网格 */}
        <div className="flex-1 overflow-y-auto overscroll-contain px-5 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <div className="grid grid-cols-5 gap-2">
            {pageEpisodes.map((episode, offset) => {
              const displayIndex = pageStart + offset;
              const isCurrent = displayIndex === currentIndex;

              return (
                <button
                  key={displayIndex}
                  ref={isCurrent ? currentItemRef : undefined}
                  type="button"
                  onClick={() => onSelect(displayIndex)}
                  aria-current={isCurrent ? 'true' : undefined}
                  className={`flex h-11 items-center justify-center rounded-[var(--radius-2xl)] px-1 text-sm font-medium transition-colors cursor-pointer ${
                    isCurrent
                      ? 'bg-[var(--accent-color)] text-white'
                      : 'bg-[color-mix(in_srgb,var(--text-color)_6%,transparent)] text-[var(--text-color)] hover:bg-[color-mix(in_srgb,var(--text-color)_10%,transparent)]'
                  }`}
                >
                  <span className="truncate">{episode.name || displayIndex + 1}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * 选集入口按钮：仅移动端展示，集数超过分段阈值时出现
 */
export function EpisodePickerTrigger({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-haspopup="dialog"
      data-focusable
      className="flex flex-shrink-0 items-center gap-0.5 py-1 text-xs font-medium text-[var(--accent-color)] transition-opacity hover:opacity-80 cursor-pointer"
    >
      选集
      <ChevronRight size={14} />
    </button>
  );
}
