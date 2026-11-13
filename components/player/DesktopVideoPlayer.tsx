'use client';

import React from 'react';
import { useDesktopPlayerState } from './hooks/useDesktopPlayerState';
import { useDesktopPlayerLogic } from './hooks/useDesktopPlayerLogic';
import { useHlsPlayer } from './hooks/useHlsPlayer';
import { useAutoSkip } from './hooks/useAutoSkip';
import { useStallDetection } from './hooks/useStallDetection';
import { useVideoResolution } from './hooks/useVideoResolution';
import { DesktopControlsWrapper } from './desktop/DesktopControlsWrapper';
import { DesktopOverlayWrapper } from './desktop/DesktopOverlayWrapper';
import { DanmakuCanvas } from './DanmakuCanvas';
import { usePlayerSettings } from './hooks/usePlayerSettings';
import { useDanmaku } from './hooks/useDanmaku';
import { useIsIOS, useIsMobile } from '@/lib/hooks/mobile/useDeviceDetection';
import { useDoubleTap } from '@/lib/hooks/mobile/useDoubleTap';
import { settingsStore, DEFAULT_SEEK_STEP_SECONDS } from '@/lib/store/settings-store';
import { premiumModeSettingsStore } from '@/lib/store/premium-mode-settings';
import { shouldHidePlayerCursor } from '@/lib/player/cursor-visibility';
import './web-fullscreen.css';

type WebFullscreenSize = 'full' | 'large' | 'focused';

const WEB_FULLSCREEN_SIZE_KEY = 'kvideo-web-fullscreen-size';
const WEB_FULLSCREEN_SIZE_ORDER: WebFullscreenSize[] = ['full', 'large', 'focused'];
const WEB_FULLSCREEN_SCALE: Record<WebFullscreenSize, number> = {
  full: 1,
  large: 0.92,
  focused: 0.84,
};

interface ViewportMetrics {
  width: number;
  height: number;
}

type LegacyInlineVideoProps = React.VideoHTMLAttributes<HTMLVideoElement> & {
  'webkit-playsinline'?: 'true';
};

const LEGACY_INLINE_VIDEO_PROPS: LegacyInlineVideoProps = {
  'webkit-playsinline': 'true',
};

function readViewportMetrics(): ViewportMetrics {
  if (typeof window === 'undefined') {
    return { width: 0, height: 0 };
  }

  const viewport = window.visualViewport;
  return {
    width: Math.round(viewport?.width ?? window.innerWidth ?? 0),
    height: Math.round(viewport?.height ?? window.innerHeight ?? 0),
  };
}

interface DesktopVideoPlayerProps {
  src: string;
  poster?: string;
  onError?: (error: string) => void;
  onTimeUpdate?: (currentTime: number, duration: number) => void;
  initialTime?: number;
  shouldAutoPlay?: boolean;
  /** 返回上一页，用于播放器左上角的返回按钮 */
  onBack?: () => void;
  // Episode navigation props for auto-skip/auto-next
  totalEpisodes?: number;
  currentEpisodeIndex?: number;
  onNextEpisode?: () => void;
  isReversed?: boolean;
  // Danmaku props
  videoTitle?: string;
  episodeName?: string;
  isPremium?: boolean;
  // Resolution callback
  onResolutionDetected?: (info: import('./hooks/useVideoResolution').VideoResolutionInfo) => void;
}

export function DesktopVideoPlayer({
  src,
  poster,
  onError,
  onTimeUpdate,
  initialTime = 0,
  shouldAutoPlay = false,
  onBack,
  totalEpisodes = 1,
  currentEpisodeIndex = 0,
  onNextEpisode,
  isReversed = false,
  videoTitle = '',
  episodeName = '',
  isPremium = false,
  onResolutionDetected,
}: DesktopVideoPlayerProps) {
  const { refs, data, actions } = useDesktopPlayerState();
  const { fullscreenType: settingsFullscreenType } = usePlayerSettings(isPremium);
  const isIOS = useIsIOS();
  const isMobile = useIsMobile();
  const [viewportMetrics, setViewportMetrics] = React.useState<ViewportMetrics>(() => readViewportMetrics());
  const [seekStepSeconds, setSeekStepSeconds] = React.useState(DEFAULT_SEEK_STEP_SECONDS);
  const [webFullscreenSize, setWebFullscreenSize] = React.useState<WebFullscreenSize>(() => {
    if (typeof window === 'undefined') return 'full';
    const saved = localStorage.getItem(WEB_FULLSCREEN_SIZE_KEY);
    return saved === 'large' || saved === 'focused' || saved === 'full' ? saved : 'full';
  });

  // Detect actual video resolution
  const videoResolution = useVideoResolution(refs.videoRef);

  // Notify parent when resolution is detected
  React.useEffect(() => {
    if (videoResolution && onResolutionDetected) {
      onResolutionDetected(videoResolution);
    }
  }, [videoResolution, onResolutionDetected]);

  // Danmaku
  const { danmakuEnabled, comments: danmakuComments } = useDanmaku({
    videoTitle,
    episodeName,
    episodeIndex: currentEpisodeIndex,
  });

  const updateViewportMetrics = React.useCallback(() => {
    setViewportMetrics((current) => {
      const next = readViewportMetrics();
      if (current.width === next.width && current.height === next.height) {
        return current;
      }
      return next;
    });
  }, []);

  React.useEffect(() => {
    updateViewportMetrics();

    const visualViewport = window.visualViewport;
    window.addEventListener('resize', updateViewportMetrics);
    window.addEventListener('orientationchange', updateViewportMetrics);
    visualViewport?.addEventListener('resize', updateViewportMetrics);

    return () => {
      window.removeEventListener('resize', updateViewportMetrics);
      window.removeEventListener('orientationchange', updateViewportMetrics);
      visualViewport?.removeEventListener('resize', updateViewportMetrics);
    };
  }, [updateViewportMetrics]);

  // Use user preference for fullscreen type, resolving 'auto' to device default
  // Auto Rules:
  // - Mobile: Window Fullscreen (Better for Danmaku/Controls)
  // - Desktop: Native Fullscreen (Better for PiP/Performance)
  const fullscreenType = settingsFullscreenType === 'auto'
    ? (isIOS ? 'window' : isMobile ? 'window' : 'native') // Treat all mobile as window for consistency if auto
    : settingsFullscreenType;

  const isLandscape = viewportMetrics.width > viewportMetrics.height;

  // Check if we need to force landscape (iOS + Fullscreen + Portrait)
  const shouldForceLandscape = data.fullscreenMode === 'window' && isIOS && !isLandscape;

  React.useEffect(() => {
    updateViewportMetrics();

    if (data.fullscreenMode !== 'window') return;

    const rafId = window.requestAnimationFrame(updateViewportMetrics);
    const timeoutId = window.setTimeout(updateViewportMetrics, 250);

    return () => {
      window.cancelAnimationFrame(rafId);
      window.clearTimeout(timeoutId);
    };
  }, [data.fullscreenMode, src, updateViewportMetrics]);

  React.useEffect(() => {
    localStorage.setItem(WEB_FULLSCREEN_SIZE_KEY, webFullscreenSize);
  }, [webFullscreenSize]);

  React.useEffect(() => {
    const store = isPremium ? premiumModeSettingsStore : settingsStore;

    const syncSeekStep = () => {
      setSeekStepSeconds(store.getSettings().seekStepSeconds ?? DEFAULT_SEEK_STEP_SECONDS);
    };

    syncSeekStep();
    const unsubscribe = store.subscribe(syncSeekStep);
    return () => unsubscribe();
  }, [isPremium]);

  // Initialize HLS Player
  useHlsPlayer({
    videoRef: refs.videoRef,
    src,
    isPremium,
    autoPlay: shouldAutoPlay
  });

  const {
    videoRef,
    containerRef,
    moreMenuTimeoutRef,
  } = refs;

  const {
    isPlaying,
    currentTime,
    duration,
  } = data;

  const {
    setShowControls,
    setBufferedTime,
    setIsLoading,
  } = actions;

  // Reset loading state and show spinner when source changes
  React.useEffect(() => {
    setIsLoading(true);
    setBufferedTime(0);
  }, [src, setBufferedTime, setIsLoading]);

  const logic = useDesktopPlayerLogic({
    src,
    initialTime,
    shouldAutoPlay,
    onError,
    onTimeUpdate,
    refs,
    data,
    actions,
    fullscreenType,
    isForceLandscape: shouldForceLandscape,
    seekStepSeconds,
  });

  // Auto-skip intro/outro and auto-next episode
  const { isTransitioningToNextEpisode } = useAutoSkip({
    videoRef,
    currentTime,
    duration,
    isPlaying,
    isPremium,
    totalEpisodes,
    currentEpisodeIndex,
    onNextEpisode,
    isReversed,
    src,
  });

  // Sensitive stalling detection (e.g. video stuck but HTML5 state says playing)
  useStallDetection({
    videoRef,
    isPlaying: data.isPlaying,
    isDraggingProgressRef: refs.isDraggingProgressRef,
    setIsLoading: actions.setIsLoading,
    isTransitioningToNextEpisode
  });

  const {
    handleMouseMove,
    handleTouchToggleControls,
    togglePlay,
    handlePlay,
    handlePause,
    handleTimeUpdateEvent,
    handleLoadedMetadata,
    handleProgressEvent,
    handleVideoError,
  } = logic;

  const cycleWebFullscreenSize = React.useCallback(() => {
    setWebFullscreenSize((current) => {
      const currentIndex = WEB_FULLSCREEN_SIZE_ORDER.indexOf(current);
      return WEB_FULLSCREEN_SIZE_ORDER[(currentIndex + 1) % WEB_FULLSCREEN_SIZE_ORDER.length];
    });
  }, []);

  const webFullscreenStyle = React.useMemo<React.CSSProperties | undefined>(() => {
    if (data.fullscreenMode !== 'window') return undefined;
    if (viewportMetrics.width <= 0 || viewportMetrics.height <= 0) return undefined;

    const stageWidth = shouldForceLandscape ? viewportMetrics.height : viewportMetrics.width;
    const stageHeight = shouldForceLandscape ? viewportMetrics.width : viewportMetrics.height;

    return {
      ['--kvideo-viewport-width' as string]: `${viewportMetrics.width}px`,
      ['--kvideo-viewport-height' as string]: `${viewportMetrics.height}px`,
      ['--kvideo-stage-viewport-width' as string]: `${stageWidth}px`,
      ['--kvideo-stage-viewport-height' as string]: `${stageHeight}px`,
      ['--kvideo-web-scale' as string]: WEB_FULLSCREEN_SCALE[webFullscreenSize].toString(),
    };
  }, [data.fullscreenMode, shouldForceLandscape, viewportMetrics, webFullscreenSize]);

  const shouldHideCursor = shouldHidePlayerCursor({
    isFullscreen: data.isFullscreen,
    isPlaying: data.isPlaying,
    showControls: data.showControls,
    hasInteractiveOverlay: data.showSpeedMenu || data.showMoreMenu || data.showVolumeBar,
  });

  const containerStyle = React.useMemo<React.CSSProperties>(() => ({
    ...(webFullscreenStyle ?? {}),
    cursor: shouldHideCursor ? 'none' : undefined,
  }), [webFullscreenStyle, shouldHideCursor]);

  const stageClassName = data.fullscreenMode === 'window'
    ? 'kvideo-stage kvideo-web-fullscreen-stage'
    : 'kvideo-stage absolute inset-0';

  // 存在下一集时在控制条显示「下一集」按钮（全屏，或移动端始终显示）
  const hasNextEpisode = Boolean(onNextEpisode) && totalEpisodes > 1;
  const showNextEpisode = hasNextEpisode && (data.isFullscreen || isMobile);

  const isTopAlignedWebFullscreen = data.fullscreenMode === 'window' && isMobile && !isLandscape && !shouldForceLandscape;

  // Mobile double-tap gesture for skip forward/backward
  // 双击切换播放后，同一次触摸序列末尾的 click 可能落在刚出现的中心播放按钮上，短暂忽略
  const overlayPlayGuardRef = React.useRef(0);

  const { handleTap } = useDoubleTap({
    onSingleTap: handleTouchToggleControls,
    onDoubleTapLeft: () => {
      logic.skipBackward();
      handleMouseMove(); // Reset 3s auto-hide timer
    },
    onDoubleTapRight: () => {
      logic.skipForward();
      handleMouseMove(); // Reset 3s auto-hide timer
    },
    // 双击中间区域切换播放/暂停，再次双击恢复
    onDoubleTapCenter: () => {
      overlayPlayGuardRef.current = Date.now();
      togglePlay();
    },
    onSkipContinueLeft: () => {
      logic.skipBackward();
      handleMouseMove();
    },
    onSkipContinueRight: () => {
      logic.skipForward();
      handleMouseMove();
    },
    isSkipModeActive: data.showSkipForwardIndicator || data.showSkipBackwardIndicator,
  });

  // 触摸手势绑定在播放器容器上，任何落点都能捕获；
  // 交互控件（按钮/进度条/控制条）上的触摸不参与手势判定
  const lastTouchAtRef = React.useRef(0);

  const handleContainerTap = React.useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    lastTouchAtRef.current = Date.now();
    const target = e.target as HTMLElement | null;
    if (target?.closest('button, a, input, [role="slider"], [data-player-controls]')) return;
    handleTap(e);
  }, [handleTap]);

  // 触摸设备上的 click 由触摸手势统一处理，避免同一次操作触发两次播放状态切换
  const handleVideoClick = React.useCallback(() => {
    if (Date.now() - lastTouchAtRef.current < 600) return;
    togglePlay();
  }, [togglePlay]);

  // 中心播放按钮：双击刚切换完的 500ms 内忽略 click，避免同一次触摸把它又切回去
  const handleOverlayTogglePlay = React.useCallback(() => {
    if (Date.now() - overlayPlayGuardRef.current < 500) return;
    togglePlay();
  }, [togglePlay]);

  return (
    <div
      ref={containerRef}
      className={`kvideo-container relative aspect-video bg-black group ${data.fullscreenMode === 'window' ? `is-web-fullscreen web-size-${webFullscreenSize}` : ''
        } ${shouldForceLandscape ? 'force-landscape' : ''} ${isTopAlignedWebFullscreen ? 'top-align-stage' : ''} overflow-hidden rounded-none sm:rounded-[var(--radius-2xl)]`}
      style={containerStyle}
      onMouseMove={() => { handleMouseMove(); }}
      onMouseLeave={() => isPlaying && setShowControls(false)}
      onTouchStart={handleContainerTap}
    >
      <div className={stageClassName}>
        {/* Clipping Wrapper for video and overlays - Restores the 'Liquid Glass' rounded look */}
        <div className={`absolute inset-0 overflow-hidden pointer-events-none ${data.fullscreenMode === 'window' ? 'rounded-none' : 'rounded-none sm:rounded-[var(--radius-2xl)]'
          }`}>
          <div className="absolute inset-0 pointer-events-auto">
          {/* Video Element */}
          <video
            ref={videoRef}
            className="w-full h-full object-contain"
            poster={poster}
            x-webkit-airplay="allow"
            playsInline={true} // Crucial for iOS custom fullscreen to work without native player taking over
            controls={false} // Explicitly disable native controls
            onPlay={handlePlay}
            onPause={handlePause}
            onTimeUpdate={handleTimeUpdateEvent}
            onLoadedMetadata={handleLoadedMetadata}
            onProgress={handleProgressEvent}
            onError={handleVideoError}
            onWaiting={() => setIsLoading(true)}
            onCanPlay={() => setIsLoading(false)}
            onClick={handleVideoClick}
            {...LEGACY_INLINE_VIDEO_PROPS} // Legacy iOS support
          />

          {/* Danmaku Canvas */}
          {danmakuEnabled && danmakuComments.length > 0 && (
            <DanmakuCanvas
              comments={danmakuComments}
              currentTime={currentTime}
              isPlaying={isPlaying}
              duration={duration}
            />
          )}

          <DesktopOverlayWrapper
            data={data}
            showControls={data.showControls}
            isFullscreen={data.isFullscreen}
            isRotated={shouldForceLandscape}
            onBack={onBack}
            onTogglePlay={handleOverlayTogglePlay}
            onSkipForward={logic.skipForward}
            onSkipBackward={logic.skipBackward}
            isTransitioningToNextEpisode={isTransitioningToNextEpisode}
            // More Menu Props
            showMoreMenu={data.showMoreMenu}
            isPremium={isPremium}
            isProxied={src.includes('/api/proxy')}
            onToggleMoreMenu={() => actions.setShowMoreMenu(!data.showMoreMenu)}
            onMoreMenuMouseEnter={() => {
              if (moreMenuTimeoutRef.current) {
                clearTimeout(moreMenuTimeoutRef.current);
                moreMenuTimeoutRef.current = null;
              }
            }}
            onMoreMenuMouseLeave={() => {
              if (moreMenuTimeoutRef.current) {
                clearTimeout(moreMenuTimeoutRef.current);
              }
              moreMenuTimeoutRef.current = setTimeout(() => {
                actions.setShowMoreMenu(false);
                moreMenuTimeoutRef.current = null;
              }, 800); // Increased timeout for better stability
            }}
            onCopyLink={logic.handleCopyLink}
            seekStepSeconds={seekStepSeconds}
            // 右上角快捷入口：画中画 + 全屏时的投屏
            isPiPSupported={data.isPiPSupported}
            onTogglePictureInPicture={logic.togglePictureInPicture}
            isCastAvailable={data.isCastAvailable}
            onShowCastMenu={logic.showCastMenu}
            isAirPlaySupported={data.isAirPlaySupported}
            onShowAirPlayMenu={logic.showAirPlayMenu}
            isWebFullscreen={data.fullscreenMode === 'window'}
            onToggleWebFullscreen={logic.toggleWindowFullscreen}
            webFullscreenSize={webFullscreenSize}
            onCycleWebFullscreenSize={cycleWebFullscreenSize}
            // Portal container
            containerRef={containerRef}
            // 全屏时左上角展示的视频名称与集数
            videoTitle={videoTitle}
            episodeName={episodeName}
            currentEpisodeIndex={currentEpisodeIndex}
          />

            <DesktopControlsWrapper
              src={src}
              data={data}
              logic={logic}
              refs={refs}
              onToggleSpeedMenu={() => actions.setShowSpeedMenu(!data.showSpeedMenu)}
              isRotated={shouldForceLandscape}
              hasNextEpisode={hasNextEpisode}
              showNextEpisode={showNextEpisode}
              onNextEpisode={onNextEpisode}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
