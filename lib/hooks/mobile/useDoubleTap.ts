import { useRef } from 'react';

interface DoubleTapHandler {
    onDoubleTapLeft: () => void;
    onDoubleTapRight: () => void;
    /** 中间区域双击：播放/暂停 */
    onDoubleTapCenter?: () => void;
    onSingleTap: () => void;
    onSkipContinueLeft: () => void;
    onSkipContinueRight: () => void;
    isSkipModeActive: boolean;
    /** 中间区域宽度占视频宽度的比例，剩余部分均分给左右快进快退区 */
    centerZoneRatio?: number;
}

/**
 * Hook for handling double-tap gestures on mobile devices
 * Divides the video into left/center/right zones:
 * 左右两侧双击快退/快进，中间区域双击播放/暂停
 */
export function useDoubleTap({
    onDoubleTapLeft,
    onDoubleTapRight,
    onDoubleTapCenter,
    onSingleTap,
    onSkipContinueLeft,
    onSkipContinueRight,
    isSkipModeActive,
    centerZoneRatio = 0.6,
}: DoubleTapHandler) {
    const lastTapRef = useRef<{ time: number; side: 'left' | 'center' | 'right' | null }>({
        time: 0,
        side: null,
    });
    const singleTapTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    const handleTap = (e: React.TouchEvent<HTMLVideoElement>) => {
        const currentTime = Date.now();
        const videoElement = e.currentTarget;
        const touch = e.touches[0] || e.changedTouches[0];

        if (!touch || !videoElement) return;

        // Calculate touch position relative to video element
        const rect = videoElement.getBoundingClientRect();
        const x = touch.clientX - rect.left;
        const width = rect.width;
        // 三分区：中间占比 centerZoneRatio，左右各占剩余的一半
        const sideZoneRatio = Math.max(0, (1 - centerZoneRatio) / 2);
        const xRatio = width > 0 ? x / width : 0.5;
        const side: 'left' | 'center' | 'right' = xRatio < sideZoneRatio
            ? 'left'
            : xRatio > 1 - sideZoneRatio
                ? 'right'
                : 'center';

        const timeDiff = currentTime - lastTapRef.current.time;
        const sameSide = lastTapRef.current.side === side;

        // Clear any pending single tap
        if (singleTapTimeoutRef.current) {
            clearTimeout(singleTapTimeoutRef.current);
            singleTapTimeoutRef.current = null;
        }

        // If skip mode is active, single tap continues skipping
        if (isSkipModeActive) {
            // 中间区域在连续快进模式下沿用上一次的快进/快退方向
            const continueSide = side === 'center'
                ? (lastTapRef.current.side === 'left' ? 'left' : 'right')
                : side;

            if (continueSide === 'left') {
                onSkipContinueLeft();
            } else {
                onSkipContinueRight();
            }
            lastTapRef.current = { time: currentTime, side: continueSide };
            return;
        }

        // Double tap detected (within 300ms on the same side)
        if (timeDiff < 300 && sameSide) {
            e.preventDefault();

            if (side === 'left') {
                onDoubleTapLeft();
            } else if (side === 'right') {
                onDoubleTapRight();
            } else {
                onDoubleTapCenter?.();
            }

            // Reset to prevent triple-tap
            lastTapRef.current = { time: 0, side: null };
        } else {
            // Possible single tap - wait to see if there's a double tap
            lastTapRef.current = { time: currentTime, side };

            singleTapTimeoutRef.current = setTimeout(() => {
                // After 300ms, no double tap detected, execute single tap action
                onSingleTap();
                singleTapTimeoutRef.current = null;
            }, 300);
        }
    };

    return { handleTap };
}
