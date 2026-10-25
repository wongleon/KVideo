import React from 'react';
import { Icons } from '@/components/ui/Icon';

import { DesktopMoreMenu } from './DesktopMoreMenu';

interface DesktopOverlayProps {
    isLoading: boolean;
    isTransitioningToNextEpisode?: boolean;
    isPlaying: boolean;
    showSkipForwardIndicator: boolean;
    showSkipBackwardIndicator: boolean;
    skipForwardAmount: number;
    skipBackwardAmount: number;
    isSkipForwardAnimatingOut: boolean;
    isSkipBackwardAnimatingOut: boolean;
    showToast: boolean;
    toastMessage: string | null;
    showControls: boolean;
    isFullscreen: boolean;
    fullscreenClock: string;
    onTogglePlay: () => void;
    onSkipForward: () => void;
    onSkipBackward: () => void;
    showMoreMenu: boolean;
    isPremium?: boolean;
    isProxied: boolean;
    onToggleMoreMenu: () => void;
    onMoreMenuMouseEnter: () => void;
    onMoreMenuMouseLeave: () => void;
    onCopyLink: (type?: 'original' | 'proxy') => void;
    seekStepSeconds: number;
    // 右上角快捷入口
    isPiPSupported: boolean;
    onTogglePictureInPicture: () => void;
    isCastAvailable: boolean;
    onShowCastMenu: () => void;
    isAirPlaySupported: boolean;
    onShowAirPlayMenu: () => void;
    isWebFullscreen: boolean;
    onToggleWebFullscreen: () => void;
    webFullscreenSize: 'full' | 'large' | 'focused';
    onCycleWebFullscreenSize: () => void;
    containerRef: React.RefObject<HTMLDivElement | null>;
    isRotated?: boolean;
    onBack?: () => void;
}

export function DesktopOverlay({
    isLoading,
    isTransitioningToNextEpisode = false,
    isPlaying,
    showSkipForwardIndicator,
    showSkipBackwardIndicator,
    skipForwardAmount,
    skipBackwardAmount,
    isSkipForwardAnimatingOut,
    isSkipBackwardAnimatingOut,
    showToast,
    toastMessage,
    isFullscreen,
    fullscreenClock,
    onTogglePlay,
    onSkipForward,
    onSkipBackward,
    showControls,
    showMoreMenu,
    isPremium = false,
    isProxied,
    onToggleMoreMenu,
    onMoreMenuMouseEnter,
    onMoreMenuMouseLeave,
    onCopyLink,
    seekStepSeconds,
    isPiPSupported,
    onTogglePictureInPicture,
    isCastAvailable,
    onShowCastMenu,
    isAirPlaySupported,
    onShowAirPlayMenu,
    isWebFullscreen,
    onToggleWebFullscreen,
    webFullscreenSize,
    onCycleWebFullscreenSize,
    containerRef,
    isRotated = false,
    onBack,
}: DesktopOverlayProps) {
    // Show navigation buttons when controls are visible or when paused (controls usually show when paused anyway)
    const showNavButtons = showControls || !isPlaying;
    const showFullscreenClock = showControls || !isPlaying;

    return (
        <>
            {/* 返回按钮：网页全屏时退出全屏回到播放页，否则返回上一页 */}
            {(onBack || isWebFullscreen) && (
                <div
                    className={`player-edge-padding absolute left-0 z-40 transition-opacity duration-300 ${isFullscreen ? 'top-8' : 'top-4'} ${isWebFullscreen ? '' : 'lg:hidden'} ${showControls ? 'opacity-100' : 'opacity-0'}`}
                    style={{ pointerEvents: showControls ? 'auto' : 'none' }}
                >
                    <button
                        onClick={isWebFullscreen ? onToggleWebFullscreen : onBack}
                        aria-label={isWebFullscreen ? '退出网页全屏' : '返回'}
                        title={isWebFullscreen ? '退出网页全屏' : '返回'}
                        className="group flex items-center justify-center w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-black/40 hover:bg-black/60 backdrop-blur-sm text-white transition-all duration-300 hover:scale-110 active:scale-95"
                    >
                        <Icons.ChevronLeft className="text-white/80 group-hover:text-white w-5 h-5 sm:w-6 sm:h-6" />
                    </button>
                </div>
            )}

            {isFullscreen && fullscreenClock && (
                <div
                    className={`absolute top-8 left-1/2 -translate-x-1/2 z-40 transition-opacity duration-300 ${showFullscreenClock ? 'opacity-100' : 'opacity-0'}`}
                    style={{ pointerEvents: 'none' }}
                >
                    <div className="min-w-[88px] px-4 py-2 rounded-full bg-black/45 backdrop-blur-md border border-white/15 text-center shadow-[0_10px_30px_rgba(0,0,0,0.3)]">
                        <div className="flex items-center justify-center gap-2 text-white">
                            <Icons.Clock size={14} className="opacity-80" />
                            <span className="text-sm font-semibold tracking-[0.18em] tabular-nums">
                                {fullscreenClock}
                            </span>
                        </div>
                    </div>
                </div>
            )}

            {/* Top Right Controls: 画中画 / 投屏（仅全屏） / 更多 */}
            <div className={`player-edge-padding absolute right-0 ${isFullscreen ? 'top-8' : 'top-4'} z-40 flex items-center gap-2 transition-opacity duration-300 ${showControls ? 'opacity-100' : 'opacity-0'}`} style={{ pointerEvents: showControls ? 'auto' : 'none' }}>
                {isPiPSupported && (
                    <button
                        onClick={onTogglePictureInPicture}
                        aria-label="画中画"
                        title="画中画"
                        className="group flex items-center justify-center w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-black/40 hover:bg-black/60 backdrop-blur-sm text-white transition-all duration-300 hover:scale-110 active:scale-95"
                    >
                        <Icons.PictureInPicture className="text-white/80 group-hover:text-white w-5 h-5 sm:w-6 sm:h-6" />
                    </button>
                )}

                {isCastAvailable && isFullscreen && (
                    <button
                        onClick={onShowCastMenu}
                        aria-label="投屏"
                        title="投屏"
                        className="group flex items-center justify-center w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-black/40 hover:bg-black/60 backdrop-blur-sm text-white transition-all duration-300 hover:scale-110 active:scale-95"
                    >
                        <Icons.Cast className="text-white/80 group-hover:text-white w-5 h-5 sm:w-6 sm:h-6" />
                    </button>
                )}

                {isAirPlaySupported && (
                    <button
                        onClick={onShowAirPlayMenu}
                        aria-label="隔空播放"
                        title="隔空播放"
                        className="group flex items-center justify-center w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-black/40 hover:bg-black/60 backdrop-blur-sm text-white transition-all duration-300 hover:scale-110 active:scale-95"
                    >
                        <Icons.Airplay className="text-white/80 group-hover:text-white w-5 h-5 sm:w-6 sm:h-6" />
                    </button>
                )}

                <DesktopMoreMenu
                    showMoreMenu={showMoreMenu}
                    isPremium={isPremium}
                    isProxied={isProxied}
                    onToggleMoreMenu={onToggleMoreMenu}
                    onMouseEnter={onMoreMenuMouseEnter}
                    onMouseLeave={onMoreMenuMouseLeave}
                    onCopyLink={onCopyLink}
                    webFullscreenSize={webFullscreenSize}
                    onCycleWebFullscreenSize={onCycleWebFullscreenSize}
                    containerRef={containerRef}
                    isRotated={isRotated}
                />
            </div>

            {/* Loading Spinner - Glass Effect */}
            {isLoading && (
                <div className="loading-overlay-glass">
                    {isTransitioningToNextEpisode ? (
                        <div className="next-episode-loading">
                            <div className="spinner-glass"></div>
                            <span className="next-episode-text">正在自动播放下一集...</span>
                        </div>
                    ) : (
                        <div className="spinner-glass"></div>
                    )}
                </div>
            )}

            {/* Skip Backward Indicator (Animation) */}
            {showSkipBackwardIndicator && (
                <div className="absolute top-1/2 left-24 -translate-y-1/2 pointer-events-none transition-all duration-300 z-20">
                    <div className={`text-white text-3xl font-bold drop-shadow-[0_4px_8px_rgba(0,0,0,0.8)] ${isSkipBackwardAnimatingOut ? 'animate-scale-out' : 'animate-scale-in'
                        }`}>
                        -{skipBackwardAmount}秒
                    </div>
                </div>
            )}

            {/* Skip Forward Indicator (Animation) */}
            {showSkipForwardIndicator && (
                <div className="absolute top-1/2 right-24 -translate-y-1/2 pointer-events-none transition-all duration-300 z-20">
                    <div className={`text-white text-3xl font-bold drop-shadow-[0_4px_8px_rgba(0,0,0,0.8)] ${isSkipForwardAnimatingOut ? 'animate-scale-out' : 'animate-scale-in'
                        }`}>
                        +{skipForwardAmount}秒
                    </div>
                </div>
            )}

            {/* Previous Button - 垂直居中，左边缘与控制条播放键对齐 */}
            <div
                className={`player-edge-padding absolute left-0 top-0 bottom-0 flex items-center justify-center transition-opacity duration-300 z-10 ${showNavButtons ? 'opacity-100' : 'opacity-0'
                    }`}
                style={{ pointerEvents: showNavButtons ? 'auto' : 'none' }}
            >
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        onSkipBackward();
                    }}
                    className="group flex items-center justify-center w-10 h-10 rounded-full bg-black/40 hover:bg-black/60 backdrop-blur-sm transition-all duration-300 hover:scale-110 active:scale-95 cursor-pointer"
                    aria-label={`后退 ${seekStepSeconds} 秒`}
                >
                    <Icons.Rewind className="w-5 h-5 text-white/80 group-hover:text-white" />
                </button>
            </div>

            {/* Next Button - 垂直居中，右边缘与控制条右侧按钮对齐 */}
            <div
                className={`player-edge-padding absolute right-0 top-0 bottom-0 flex items-center justify-center transition-opacity duration-300 z-10 ${showNavButtons ? 'opacity-100' : 'opacity-0'
                    }`}
                style={{ pointerEvents: showNavButtons ? 'auto' : 'none' }}
            >
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        onSkipForward();
                    }}
                    className="group flex items-center justify-center w-10 h-10 rounded-full bg-black/40 hover:bg-black/60 backdrop-blur-sm transition-all duration-300 hover:scale-110 active:scale-95 cursor-pointer"
                    aria-label={`前进 ${seekStepSeconds} 秒`}
                >
                    <Icons.FastForward className="w-5 h-5 text-white/80 group-hover:text-white" />
                </button>
            </div>

            {/* Center Play Button (when paused) */}
            {!isPlaying && !isLoading && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
                    <button
                        onClick={onTogglePlay}
                        className="pointer-events-auto w-12 h-12 md:w-20 md:h-20 rounded-full bg-black/40 hover:bg-black/60 backdrop-blur-sm flex items-center justify-center transition-all duration-300 hover:scale-110 active:scale-95 cursor-pointer"
                        aria-label="播放"
                    >
                        <Icons.Play className="w-6 h-6 md:w-10 md:h-10 text-white ml-1" />
                    </button>
                </div>
            )}

            {/* Toast Notification */}
            {showToast && toastMessage && (
                <div className="absolute bottom-24 left-1/2 -translate-x-1/2 z-[200] animate-slide-up">
                    <div className="bg-[rgba(28,28,30,0.95)] backdrop-blur-[25px] rounded-[var(--radius-2xl)] border border-white/20 shadow-[0_8px_32px_rgba(0,0,0,0.6)] px-6 py-3 flex items-center gap-3 min-w-[200px]">
                        <Icons.Check size={18} className="text-[#34c759] flex-shrink-0" />
                        <span className="text-white text-sm font-medium">{toastMessage}</span>
                    </div>
                </div>
            )}
        </>
    );
}
