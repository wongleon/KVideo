import React from 'react';
import { Icons } from '@/components/ui/Icon';
import { DesktopVolumeControl } from './DesktopVolumeControl';

interface DesktopLeftControlsProps {
    isPlaying: boolean;
    isFullscreen: boolean;
    hasNextEpisode?: boolean;
    showNextEpisode?: boolean;
    onNextEpisode?: () => void;
    currentTime: number;
    duration: number;
    volume: number;
    isMuted: boolean;
    showVolumeBar: boolean;
    volumeBarRef: React.RefObject<HTMLDivElement | null>;
    onTogglePlay: () => void;
    onToggleMute: () => void;
    onVolumeChange: (e: React.MouseEvent<HTMLDivElement>) => void;
    onVolumeMouseDown: (e: React.MouseEvent<HTMLDivElement>) => void;
    formatTime: (seconds: number) => string;
}

export function DesktopLeftControls({
    isPlaying,
    isFullscreen,
    hasNextEpisode = false,
    showNextEpisode = false,
    onNextEpisode,
    currentTime,
    duration,
    volume,
    isMuted,
    showVolumeBar,
    volumeBarRef,
    onTogglePlay,
    onToggleMute,
    onVolumeChange,
    onVolumeMouseDown,
    formatTime
}: DesktopLeftControlsProps) {
    return (
        <div className="player-controls-left flex min-w-0 flex-1 items-center gap-3">
            {/* Play/Pause */}
            <button
                onClick={onTogglePlay}
                className="btn-icon shrink-0"
                aria-label={isPlaying ? 'Pause' : 'Play'}
            >
                {isPlaying ? <Icons.Pause size={20} /> : <Icons.Play size={20} />}
            </button>

            {/* 全屏时在播放键右侧显示「下一集」，图标为原快退图标的镜像 */}
            {showNextEpisode && hasNextEpisode && onNextEpisode && (
                <button
                    onClick={onNextEpisode}
                    className="btn-icon shrink-0"
                    aria-label="下一集"
                    title="下一集"
                >
                    <Icons.SkipForward size={20} />
                </button>
            )}

            {/* Volume */}
            <div className="player-volume-control shrink-0">
                <DesktopVolumeControl
                    volumeBarRef={volumeBarRef}
                    volume={volume}
                    isMuted={isMuted}
                    showVolumeBar={showVolumeBar}
                    onToggleMute={onToggleMute}
                    onVolumeChange={onVolumeChange}
                    onVolumeMouseDown={onVolumeMouseDown}
                />
            </div>

            {/* Time - 全屏时时间移到进度条上方，移动端非全屏时时间在进度条两侧 */}
            <span className={`player-time-display min-w-0 truncate text-sm font-medium text-white tabular-nums ${isFullscreen ? 'hidden' : 'hidden lg:inline'}`}>
                <span>{formatTime(currentTime)}</span>
                <span className="player-duration-display"> / {formatTime(duration)}</span>
            </span>
        </div>
    );
}
