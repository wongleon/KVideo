'use client';

import { useEffect, useRef, useCallback } from 'react';

interface SearchLoadingAnimationProps {
  currentSource?: string;
  checkedSources?: number;
  totalSources?: number;
  isPaused?: boolean;
  onComplete?: (checkedSources: number, totalSources: number) => void;
  onCancel?: () => void;
}

export function SearchLoadingAnimation({
  currentSource,
  checkedSources = 0,
  totalSources = 16,
  isPaused = false,
  onComplete,
  onCancel,
}: SearchLoadingAnimationProps) {
  const hasCalledComplete = useRef(false);

  // Calculate progress (0-100%)
  const progress = totalSources > 0 ? (checkedSources / totalSources) * 100 : 0;
  const isComplete = progress >= 100;

  // Call onComplete callback when animation finishes
  useEffect(() => {
    if (isComplete && onComplete && !hasCalledComplete.current) {
      hasCalledComplete.current = true;
      // Small delay to allow animation to settle
      const timeout = setTimeout(() => {
        onComplete(checkedSources, totalSources);
      }, 100);
      return () => clearTimeout(timeout);
    }
  }, [isComplete, onComplete, checkedSources, totalSources]);

  const statusText = `${checkedSources}/${totalSources} 个源`;

  return (
    <div className="w-full space-y-3 animate-fade-in">
      {/* Progress Bar - Unified 0-100% */}
      <div className="w-full">
        <div
          className="h-1 bg-[color-mix(in_srgb,var(--glass-bg)_50%,transparent)] overflow-hidden rounded-[var(--radius-full)]"
        >
          <div
            className="h-full bg-[var(--accent-color)] transition-all duration-500 ease-out relative rounded-[var(--radius-full)]"
            style={{
              width: `${progress}%`
            }}
          >
            {/* Shimmer Effect - Optimized for GPU with contain for better performance */}
            <div
              className="absolute inset-0 animate-shimmer"
              style={{
                background: 'linear-gradient(90deg, transparent 0%, rgba(255, 255, 255, 0.3) 50%, transparent 100%)',
                willChange: 'transform',
                transform: 'translateZ(0)',
                contain: 'strict'
              }}
            ></div>
          </div>
        </div>

        {/* Progress Info - Real-time count with pause indicator */}
        <div className="flex items-center justify-between mt-2 text-xs text-[var(--text-color-secondary)]">
          <span className="flex items-center gap-2">
            {statusText}
            {isPaused && (
              <span className="px-2 py-0.5 rounded-[var(--radius-full)] bg-[var(--glass-bg)] text-[10px]">
                已暂停
              </span>
            )}
            {isComplete && (
              <span className="px-2 py-0.5 rounded-[var(--radius-full)] bg-[var(--accent-color)] text-white text-[10px]">
                完成
              </span>
            )}
          </span>
          <span className="flex items-center gap-2">
            <span className="font-medium">{Math.round(progress)}%</span>
            {!isComplete && onCancel && (
              <button
                onClick={onCancel}
                className="px-2 py-0.5 rounded-[var(--radius-full)] bg-[var(--glass-bg)] hover:bg-red-500/20 text-[10px] transition-colors cursor-pointer"
              >
                取消
              </button>
            )}
          </span>
        </div>
      </div>
    </div>
  );
}
