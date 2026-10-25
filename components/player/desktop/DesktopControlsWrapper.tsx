import React from 'react';
import { DesktopControls } from './DesktopControls';
import { useDesktopPlayerState } from '../hooks/useDesktopPlayerState';
import { useDesktopPlayerLogic } from '../hooks/useDesktopPlayerLogic';

interface DesktopControlsWrapperProps {
    src: string;
    data: ReturnType<typeof useDesktopPlayerState>['data'];
    logic: ReturnType<typeof useDesktopPlayerLogic>;
    refs: ReturnType<typeof useDesktopPlayerState>['refs'];
    /** 切换倍速菜单（菜单已移入控制条） */
    onToggleSpeedMenu: () => void;
    isRotated?: boolean;
    /** 是否存在下一集，用于全屏时的「下一集」按钮 */
    hasNextEpisode?: boolean;
    /** 是否显示「下一集」按钮（全屏，或移动端始终显示） */
    showNextEpisode?: boolean;
    onNextEpisode?: () => void;
}

export function DesktopControlsWrapper({ src, data, logic, refs, onToggleSpeedMenu, isRotated = false, hasNextEpisode = false, showNextEpisode = false, onNextEpisode }: DesktopControlsWrapperProps) {
    const {
        isPlaying,
        currentTime,
        duration,
        bufferedTime,
        volume,
        isMuted,
        isFullscreen,
        fullscreenMode,
        showControls,
        showVolumeBar,
        isPiPSupported,
        isAirPlaySupported,
        isCastAvailable,
    } = data;

    const {
        togglePlay,
        toggleMute,
        handleVolumeChange,
        handleVolumeMouseDown,
        toggleFullscreen,
        toggleNativeFullscreen,
        toggleWindowFullscreen,
        togglePictureInPicture,
        showAirPlayMenu,
        showCastMenu,
        handleProgressClick,
        handleProgressMouseDown,
        handleProgressTouchStart,
        formatTime,
    } = logic;

    const {
        progressBarRef,
        volumeBarRef,
    } = refs;

    const isProxied = src.includes('/api/proxy');

    return (
        <DesktopControls
            showControls={showControls}
            isPlaying={isPlaying}
            currentTime={currentTime}
            duration={duration}
            bufferedTime={bufferedTime}
            volume={volume}
            isMuted={isMuted}
            isFullscreen={isFullscreen}
            isNativeFullscreen={fullscreenMode === 'native'}
            isWebFullscreen={fullscreenMode === 'window'}
            showVolumeBar={showVolumeBar}
            isPiPSupported={isPiPSupported}
            isAirPlaySupported={isAirPlaySupported}
            isCastAvailable={isCastAvailable}
            isProxied={isProxied}
            progressBarRef={progressBarRef}
            volumeBarRef={volumeBarRef}
            onTogglePlay={togglePlay}
            onToggleMute={toggleMute}
            onVolumeChange={handleVolumeChange}
            onVolumeMouseDown={handleVolumeMouseDown}
            onToggleFullscreen={toggleFullscreen}
            onToggleNativeFullscreen={toggleNativeFullscreen}
            onToggleWebFullscreen={toggleWindowFullscreen}
            onTogglePictureInPicture={togglePictureInPicture}
            onShowAirPlayMenu={showAirPlayMenu}
            onShowCastMenu={showCastMenu}
            onProgressClick={handleProgressClick}
            onProgressMouseDown={handleProgressMouseDown}
            onProgressTouchStart={handleProgressTouchStart}
            formatTime={formatTime}
            showSpeedMenu={data.showSpeedMenu}
            playbackRate={data.playbackRate}
            speeds={[0.5, 0.75, 1, 1.25, 1.5, 2]}
            onToggleSpeedMenu={onToggleSpeedMenu}
            onSpeedChange={logic.changePlaybackSpeed}
            onSpeedMenuMouseEnter={logic.clearSpeedMenuTimeout}
            onSpeedMenuMouseLeave={logic.startSpeedMenuTimeout}
            containerRef={refs.containerRef}
            isRotated={isRotated}
            hasNextEpisode={hasNextEpisode}
            showNextEpisode={showNextEpisode}
            onNextEpisode={onNextEpisode}
        />
    );
}
