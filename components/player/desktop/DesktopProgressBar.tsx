import React, { RefObject, useCallback, useEffect, useRef } from 'react';

interface DesktopProgressBarProps {
    progressBarRef: RefObject<HTMLDivElement | null>;
    videoRef: RefObject<HTMLVideoElement | null>;
    isPlaying: boolean;
    playbackRate: number;
    isDraggingProgressRef: React.MutableRefObject<boolean>;

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
    videoRef,
    isPlaying,
    playbackRate,
    isDraggingProgressRef,
    currentTime,
    duration,
    bufferedTime,
    isFullscreen,
    formatTime,
    onProgressClick,
    onProgressMouseDown,
    onProgressTouchStart
}: DesktopProgressBarProps) {
    const rangeRef = useRef<HTMLDivElement | null>(null);
    const thumbRef = useRef<HTMLDivElement | null>(null);
    const lastRatioRef = useRef(-1);

    // 直接写 DOM 样式，避免每帧 setState 触发整棵播放器组件重渲染
    const applyRatio = useCallback((time: number, total: number) => {
        const ratio = total > 0 ? Math.min(1, Math.max(0, time / total)) : 0;
        if (Math.abs(ratio - lastRatioRef.current) < 0.00005) return;
        lastRatioRef.current = ratio;
        const percent = `${ratio * 100}%`;
        if (rangeRef.current) rangeRef.current.style.width = percent;
        if (thumbRef.current) thumbRef.current.style.left = percent;
    }, []);

    // 暂停、拖拽预览、跳转等场景由状态同步；
    // 播放中且未拖拽时交给下面的 rAF 驱动，避免较旧的 state 覆盖新进度
    useEffect(() => {
        if (isPlaying && !isDraggingProgressRef.current) return;
        applyRatio(currentTime, duration);
    }, [applyRatio, currentTime, duration, isPlaying, isDraggingProgressRef]);

    // 播放中每帧读取 video.currentTime 驱动进度条。
    // timeupdate 只有约 4Hz，倍速下每次事件跳 0.5~1 秒，进度条会明显滞后、跳变
    useEffect(() => {
        if (!isPlaying) return;

        let frameId = 0;
        let lastObservedTime = -1;
        let lastObservedAt = 0;

        const tick = (now: number) => {
            const video = videoRef.current;
            if (video && !isDraggingProgressRef.current) {
                const total = video.duration;
                if (Number.isFinite(total) && total > 0) {
                    const observed = video.currentTime;
                    if (observed !== lastObservedTime) {
                        lastObservedTime = observed;
                        lastObservedAt = now;
                    }
                    // 部分浏览器/流媒体的 currentTime 按固定间隔量化更新，
                    // 用「距上次观测的时间 × 倍速」外推抹平跳动，最多外推 0.5s
                    const canExtrapolate = !video.paused && !video.seeking && video.readyState >= 2;
                    const extra = canExtrapolate
                        ? Math.min(((now - lastObservedAt) / 1000) * playbackRate, 0.5)
                        : 0;
                    applyRatio(observed + extra, total);
                }
            }
            frameId = requestAnimationFrame(tick);
        };

        frameId = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(frameId);
    }, [applyRatio, isPlaying, playbackRate, videoRef, isDraggingProgressRef]);

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
                ref={rangeRef}
                className="slider-range"
                style={{ width: '0%' }}
            />
            <div
                ref={thumbRef}
                className="slider-thumb"
                style={{ left: '0%' }}
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
