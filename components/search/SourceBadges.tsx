/**
 * SourceBadges - 视频源筛选标签
 * 以单行横向滚动的方式展示「全部」与各视频源，仅支持单选
 * 支持触屏滑动、鼠标滚轮与按住拖动横向滚动
 */

'use client';

import { memo, useEffect, useRef } from 'react';
import { SourceBadgeItem } from './SourceBadgeItem';
import type { SourceBadge } from '@/lib/types';

interface SourceBadgesProps {
  sources: SourceBadge[];
  selectedSources: Set<string>;
  onToggleSource: (sourceId: string) => void;
  onClearSelection: () => void;
  /** 「全部」标签上展示的视频总数 */
  totalCount?: number;
  className?: string;
}

export const SourceBadges = memo(function SourceBadges({
  sources,
  selectedSources,
  onToggleSource,
  onClearSelection,
  totalCount,
  className = ''
}: SourceBadgesProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef({
    isDown: false,
    moved: false,
    startX: 0,
    startScrollLeft: 0,
  });

  // 鼠标悬停在标签区域时，滚轮改为横向滚动标签
  // 必须用原生监听并设置 passive: false，React 的 wheel 事件无法阻止页面滚动
  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;

    const handleWheel = (event: WheelEvent) => {
      const maxScrollLeft = container.scrollWidth - container.clientWidth;
      if (maxScrollLeft <= 0) return;

      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? container.clientWidth : 1;
      const delta = (event.deltaY !== 0 ? event.deltaY : event.deltaX) * unit;
      if (delta === 0) return;

      // 区域内始终只横向滚动标签，到两端也不会带动页面滚动
      event.preventDefault();
      container.scrollLeft = Math.max(0, Math.min(maxScrollLeft, container.scrollLeft + delta));
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, [sources.length]);

  if (sources.length === 0) {
    return null;
  }

  const isAllSelected = selectedSources.size === 0;

  const handleMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const container = scrollRef.current;
    if (!container) return;

    dragRef.current = {
      isDown: true,
      moved: false,
      startX: event.pageX,
      startScrollLeft: container.scrollLeft,
    };
  };

  const handleMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
    const container = scrollRef.current;
    const drag = dragRef.current;
    if (!container || !drag.isDown) return;

    const delta = event.pageX - drag.startX;
    if (Math.abs(delta) <= 4) return;

    drag.moved = true;
    container.scrollLeft = drag.startScrollLeft - delta;
    // 防止拖动过程中选中文本
    event.preventDefault();
  };

  const endDrag = () => {
    dragRef.current.isDown = false;
  };

  // 拖动结束后拦截紧随其后的 click，避免误切换视频源
  const handleClickCapture = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!dragRef.current.moved) return;
    event.preventDefault();
    event.stopPropagation();
    dragRef.current.moved = false;
  };

  return (
    <div
      ref={scrollRef}
      role="group"
      aria-label="视频源筛选"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={endDrag}
      onMouseLeave={endDrag}
      onClickCapture={handleClickCapture}
      className={`flex items-center gap-2 w-full overflow-x-auto py-2 scrollbar-hide select-none cursor-grab active:cursor-grabbing animate-fade-in ${className}`}
    >
      <SourceBadgeItem
        id="__all__"
        name="全部"
        count={totalCount}
        isSelected={isAllSelected}
        onToggle={onClearSelection}
      />
      {sources.map((source) => (
        <SourceBadgeItem
          key={source.id}
          id={source.id}
          name={source.name}
          count={source.count}
          isSelected={selectedSources.has(source.id)}
          onToggle={() => onToggleSource(source.id)}
        />
      ))}
    </div>
  );
});
