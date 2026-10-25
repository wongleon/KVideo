import React, { RefObject } from 'react';

interface DesktopProgressBarProps {
    progressBarRef: RefObject<HTMLDivElement | null>;

    currentTime: number;
    duration: number;
    bufferedTime: number;
    isFullscreen: boolean;
    formatTime: (seconds: number) => string;
    onProgressClick: (e: React.MouseEvent<HTMLDivElement>) => void;
    onProgressMouseDown: (e: React.MouseEvent<HTMLDivElement>) => void;
    onProgressTouchStart: (e: React.TouchEvent<HTMLDivElement>) => void;
}

export function DesktopProgressBar({
    progressBarRef,
    currentTime,
    duration,
    bufferedTime,
    isFullscreen,
    formatTime,
    onProgressClick,
    onProgressMouseDown,
    onProgressTouchStart
}: DesktopProgressBarProps) {
    const slider = (
        <div
            ref={progressBarRef}
            className="slider-track cursor-pointer"
            onClick={onProgressClick}
            onMouseDown={onProgressMouseDown}
            onTouchStart={onProgressTouchStart}
            style={{ pointerEvents: 'auto' }}
        >
            <div
                className="slider-buffer"
                style={{ width: `${(bufferedTime / duration) * 100 || 0}%` }}
            />
            <div
                className="slider-range"
                style={{ width: `${(currentTime / duration) * 100 || 0}%` }}
            />
            <div
                className="slider-thumb"
                style={{ left: `${(currentTime / duration) * 100 || 0}%` }}
            />
        </div>
    );

    // 全屏：进度条拉满，时间放在进度条左上方
    if (isFullscreen) {
        return (
            <div className="px-4 pb-1">
                <div className="mb-2 text-xs font-medium text-white/90 tabular-nums">
                    {formatTime(currentTime)}
                    <span className="text-white/60"> / {formatTime(duration)}</span>
                </div>
                {slider}
            </div>
        );
    }

    // 非全屏：移动端两侧显示时间、进度条相应缩短；桌面端时间仍在控制条左侧
    return (
        <div className="px-4 pb-1">
            <div className="flex items-center gap-2">
                <span className="lg:hidden shrink-0 text-xs font-medium text-white/90 tabular-nums">
                    {formatTime(currentTime)}
                </span>
                <div className="flex-1 min-w-0">{slider}</div>
                <span className="lg:hidden shrink-0 text-xs font-medium text-white/60 tabular-nums">
                    {formatTime(duration)}
                </span>
            </div>
        </div>
    );
}
