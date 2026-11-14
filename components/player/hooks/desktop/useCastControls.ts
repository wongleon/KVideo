'use client';

import { useCallback, useEffect, useRef, useMemo } from 'react';

interface UseCastControlsProps {
    src: string;
    videoRef: React.RefObject<HTMLVideoElement | null>;
    setIsCastAvailable: (available: boolean) => void;
    setIsCasting: (casting: boolean) => void;
}

declare global {
    interface Window {
        chrome: any;
        cast: any;
        __onGCastApiAvailable?: (isAvailable: boolean) => void;
    }
}

const CAST_SDK_SCRIPT_ID = 'kvideo-cast-sender-sdk';
const CAST_SDK_SRC = 'https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1';
/** 等待 SDK 加载的最长时间，超时后放弃，避免被墙环境下长期挂起 */
const CAST_SDK_TIMEOUT_MS = 10000;

function isCastSdkReady(): boolean {
    if (typeof window === 'undefined') return false;

    return Boolean(
        window.cast?.framework?.CastContext?.getInstance &&
        window.cast?.framework?.CastContextEventType?.SESSION_STATE_CHANGED &&
        window.cast?.framework?.SessionState &&
        window.chrome?.cast?.media?.DEFAULT_MEDIA_RECEIVER_APP_ID &&
        window.chrome?.cast?.media?.MediaInfo &&
        window.chrome?.cast?.media?.LoadRequest &&
        window.chrome?.cast?.AutoJoinPolicy?.ORIGIN_SCOPED
    );
}

// 单例：同一页面生命周期内只发起一次 SDK 请求
let castSdkLoading: Promise<boolean> | null = null;

/**
 * 按需加载 Google Cast SDK。
 *
 * 脚本来自 www.gstatic.com，国内网络基本不可达。放在根布局会拖慢所有页面的加载完成时间，
 * 因此改为进入播放器页面时才请求；加载失败或超时只隐藏投屏按钮，不影响播放。
 */
function loadCastSdk(): Promise<boolean> {
    if (typeof window === 'undefined') return Promise.resolve(false);
    if (isCastSdkReady()) return Promise.resolve(true);
    if (castSdkLoading) return castSdkLoading;

    castSdkLoading = new Promise<boolean>((resolve) => {
        let settled = false;
        let timer = 0;

        const finish = (available: boolean) => {
            if (settled) return;
            settled = true;
            window.clearTimeout(timer);
            castSdkLoading = null;
            resolve(available);
        };

        timer = window.setTimeout(() => finish(false), CAST_SDK_TIMEOUT_MS);

        window.__onGCastApiAvailable = (isAvailable: boolean) => finish(Boolean(isAvailable));

        if (document.getElementById(CAST_SDK_SCRIPT_ID)) return;

        const script = document.createElement('script');
        script.id = CAST_SDK_SCRIPT_ID;
        script.src = CAST_SDK_SRC;
        script.async = true;
        script.onerror = () => {
            // 移除失败标签，下次进入播放器页面时允许重试
            script.remove();
            finish(false);
        };
        document.head.appendChild(script);
    });

    return castSdkLoading;
}

export function useCastControls({
    src,
    videoRef,
    setIsCastAvailable,
    setIsCasting
}: UseCastControlsProps) {
    const castContextRef = useRef<any>(null);
    const loadMediaRef = useRef<() => void>(() => {});

    const loadMedia = useCallback(() => {
        const castMedia = window.chrome?.cast?.media;
        if (!castContextRef.current || !src || !castMedia?.MediaInfo || !castMedia?.LoadRequest) return;

        const castContext = castContextRef.current;
        const session = castContext.getCurrentSession();
        if (!session) return;

        const mediaInfo = new castMedia.MediaInfo(src, 'video/mp4');
        // Handle HLS specifically if possible, though DEFAULT_MEDIA_RECEIVER supports it
        if (src.includes('.m3u8')) {
            mediaInfo.contentType = 'application/x-mpegurl';
        }

        const request = new castMedia.LoadRequest(mediaInfo);

        // Sync current time
        if (videoRef.current) {
            request.currentTime = videoRef.current.currentTime;
        }

        session.loadMedia(request).then(
            () => console.log('Cast: Media loaded successfully'),
            (error: any) => console.error('Cast: Media load failed', error)
        );
    }, [src, videoRef]);

    useEffect(() => {
        loadMediaRef.current = loadMedia;
    }, [loadMedia]);

    useEffect(() => {
        let cancelled = false;
        let sessionStateListener: ((event: any) => void) | null = null;

        const markCastUnavailable = () => {
            castContextRef.current = null;
            setIsCastAvailable(false);
            setIsCasting(false);
        };

        // Function to initialize Cast
        const initializeCastApi = () => {
            if (cancelled) return;

            if (!isCastSdkReady()) {
                markCastUnavailable();
                return;
            }

            try {
                const castContext = window.cast.framework.CastContext.getInstance();
                castContextRef.current = castContext;

                castContext.setOptions({
                    receiverApplicationId: window.chrome.cast.media.DEFAULT_MEDIA_RECEIVER_APP_ID,
                    autoJoinPolicy: window.chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED
                });

                // SDK loaded — show cast button immediately.
                // requestSession() will re-scan and show Chrome's native device picker.
                setIsCastAvailable(true);

                // Monitor session state
                sessionStateListener = (event: any) => {
                    const sessionState = event.sessionState;
                    const isSessionActive = sessionState === window.cast.framework.SessionState.SESSION_STARTED ||
                        sessionState === window.cast.framework.SessionState.SESSION_RESUMED;

                    setIsCasting(isSessionActive);

                    if (isSessionActive && videoRef.current) {
                        videoRef.current.pause();
                        loadMediaRef.current();
                    }
                };

                castContext.addEventListener(
                    window.cast.framework.CastContextEventType.SESSION_STATE_CHANGED,
                    sessionStateListener
                );
            } catch (error) {
                console.warn('Cast SDK is not usable in this browser context.', error);
                markCastUnavailable();
            }
        };

        // SDK 已就绪则直接初始化，否则按需加载
        if (isCastSdkReady()) {
            initializeCastApi();
        } else {
            void loadCastSdk().then((available) => {
                if (cancelled) return;
                if (available) {
                    initializeCastApi();
                } else {
                    markCastUnavailable();
                }
            });
        }

        return () => {
            cancelled = true;

            const castContext = castContextRef.current;
            if (
                sessionStateListener &&
                castContext?.removeEventListener &&
                window.cast?.framework?.CastContextEventType?.SESSION_STATE_CHANGED
            ) {
                castContext.removeEventListener(
                    window.cast.framework.CastContextEventType.SESSION_STATE_CHANGED,
                    sessionStateListener
                );
            }
        };
    }, [setIsCastAvailable, setIsCasting, videoRef]);

    const showCastMenu = useCallback(() => {
        if (!isCastSdkReady()) return;

        try {
            window.cast.framework.CastContext.getInstance().requestSession();
        } catch (error) {
            console.warn('Cast session request failed.', error);
            setIsCastAvailable(false);
        }
    }, [setIsCastAvailable]);

    const castActions = useMemo(() => ({
        showCastMenu
    }), [showCastMenu]);

    return castActions;
}
