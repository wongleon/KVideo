'use client';

import { useEffect, useRef } from 'react';

interface UseNetworkSpeedFallbackProps {
    videoRef: React.RefObject<HTMLVideoElement | null>;
    playbackRate: number;
    isDraggingProgressRef: React.MutableRefObject<boolean>;
    isTransitioningToNextEpisode: boolean;
    /** 需要降速时回调，由播放器负责写入倍速并提示用户 */
    onDowngrade: (nextRate: number) => void;
}

/** 与速度菜单保持一致的可选倍速档位 */
const SPEED_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2];

/** 缓冲余量低于该值（媒体秒）时开始计时 */
const LOW_BUFFER_SECONDS = 5;

/** 缓冲持续不足多久后触发降速 */
const LOW_BUFFER_SUSTAIN_MS = 3000;

/** 检测间隔 */
const CHECK_INTERVAL_MS = 1000;

/**
 * 倍速播放时检测缓冲是否被追平，必要时逐档降低倍速。
 * 弱网下 2x 的带宽需求是 1x 的两倍，缓冲耗尽只能干等；
 * 主动降到下一档可以让播放继续，避免长时间转圈。
 */
export function useNetworkSpeedFallback({
    videoRef,
    playbackRate,
    isDraggingProgressRef,
    isTransitioningToNextEpisode,
    onDowngrade,
}: UseNetworkSpeedFallbackProps) {
    const lowBufferSinceRef = useRef(0);
    // 回调存放在 ref 中：父组件播放时会高频重渲染，若作为 effect 依赖会不断重建计时器
    const onDowngradeRef = useRef(onDowngrade);

    useEffect(() => {
        onDowngradeRef.current = onDowngrade;
    }, [onDowngrade]);

    useEffect(() => {
        // 1x 及以下无需降速
        if (playbackRate <= 1) {
            lowBufferSinceRef.current = 0;
            return;
        }

        const interval = setInterval(() => {
            const video = videoRef.current;
            if (!video) return;

            // 暂停、跳转、起播未就绪或切集期间不参与判断，避免误降
            if (
                video.paused ||
                video.seeking ||
                video.readyState < 3 ||
                isDraggingProgressRef.current ||
                isTransitioningToNextEpisode
            ) {
                lowBufferSinceRef.current = 0;
                return;
            }

            const { buffered, currentTime } = video;
            let lead = 0;

            for (let index = 0; index < buffered.length; index += 1) {
                const start = buffered.start(index);
                const end = buffered.end(index);
                if (currentTime >= start - 0.25 && currentTime <= end) {
                    lead = Math.max(lead, end - currentTime);
                }
            }

            if (lead >= LOW_BUFFER_SECONDS) {
                lowBufferSinceRef.current = 0;
                return;
            }

            const now = Date.now();
            if (lowBufferSinceRef.current === 0) {
                lowBufferSinceRef.current = now;
                return;
            }

            if (now - lowBufferSinceRef.current < LOW_BUFFER_SUSTAIN_MS) {
                return;
            }

            const nextRate = [...SPEED_STEPS]
                .reverse()
                .find((step) => step < playbackRate - 0.001);

            lowBufferSinceRef.current = 0;

            if (nextRate && nextRate >= 1) {
                video.playbackRate = nextRate;
                onDowngradeRef.current(nextRate);
            }
        }, CHECK_INTERVAL_MS);

        return () => clearInterval(interval);
    }, [
        playbackRate,
        videoRef,
        isDraggingProgressRef,
        isTransitioningToNextEpisode,
    ]);
}
