import React from 'react';
import { DesktopOverlay } from './DesktopOverlay';
import { useDesktopPlayerState } from '../hooks/useDesktopPlayerState';

interface DesktopOverlayWrapperProps {
    data: ReturnType<typeof useDesktopPlayerState>['data'];
    showControls: boolean;
    isFullscreen: boolean;
    isRotated?: boolean;
    onBack?: () => void;
    onTogglePlay: () => void;
    onSkipForward: () => void;
    onSkipBackward: () => void;
    isTransitioningToNextEpisode?: boolean;
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
    /** 全屏时在返回按钮右侧展示的视频名称 */
    videoTitle?: string;
    /** 当前分集名称 */
    episodeName?: string;
    /** 当前分集下标，用于分集名为空时兜底显示集数 */
    currentEpisodeIndex?: number;
}

export function DesktopOverlayWrapper({
    data,
    showControls,
    isFullscreen,
    isRotated = false,
    onBack,
    onTogglePlay,
    onSkipForward,
    onSkipBackward,
    isTransitioningToNextEpisode = false,
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
    videoTitle = '',
    episodeName = '',
    currentEpisodeIndex = 0,
}: DesktopOverlayWrapperProps) {
    const {
        isLoading,
        isPlaying,
        showSkipForwardIndicator,
        showSkipBackwardIndicator,
        skipForwardAmount,
        skipBackwardAmount,
        isSkipForwardAnimatingOut,
        isSkipBackwardAnimatingOut,
        showToast,
        toastMessage,
    } = data;

    return (
        <DesktopOverlay
            isLoading={isLoading}
            isTransitioningToNextEpisode={isTransitioningToNextEpisode}
            isPlaying={isPlaying}
            showSkipForwardIndicator={showSkipForwardIndicator}
            showSkipBackwardIndicator={showSkipBackwardIndicator}
            skipForwardAmount={skipForwardAmount}
            skipBackwardAmount={skipBackwardAmount}
            isSkipForwardAnimatingOut={isSkipForwardAnimatingOut}
            isSkipBackwardAnimatingOut={isSkipBackwardAnimatingOut}
            showToast={showToast}
            toastMessage={toastMessage}
            showControls={showControls}
            isFullscreen={isFullscreen}
            onTogglePlay={onTogglePlay}
            onSkipForward={onSkipForward}
            onSkipBackward={onSkipBackward}
            showMoreMenu={showMoreMenu}
            isPremium={isPremium}
            isProxied={isProxied}
            onToggleMoreMenu={onToggleMoreMenu}
            onMoreMenuMouseEnter={onMoreMenuMouseEnter}
            onMoreMenuMouseLeave={onMoreMenuMouseLeave}
            onCopyLink={onCopyLink}
            seekStepSeconds={seekStepSeconds}
            isPiPSupported={isPiPSupported}
            onTogglePictureInPicture={onTogglePictureInPicture}
            isCastAvailable={isCastAvailable}
            onShowCastMenu={onShowCastMenu}
            isAirPlaySupported={isAirPlaySupported}
            onShowAirPlayMenu={onShowAirPlayMenu}
            isWebFullscreen={isWebFullscreen}
            onToggleWebFullscreen={onToggleWebFullscreen}
            webFullscreenSize={webFullscreenSize}
            onCycleWebFullscreenSize={onCycleWebFullscreenSize}
            containerRef={containerRef}
            isRotated={isRotated}
            onBack={onBack}
            videoTitle={videoTitle}
            episodeName={episodeName}
            currentEpisodeIndex={currentEpisodeIndex}
        />
    );
}
