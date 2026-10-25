import React from 'react';
import { Icons } from '@/components/ui/Icon';
import { DesktopSpeedMenu } from './DesktopSpeedMenu';



interface DesktopRightControlsProps {
    isNativeFullscreen: boolean;
    isWebFullscreen: boolean;
    isPiPSupported: boolean;
    isCastAvailable: boolean;
    onToggleNativeFullscreen: () => void;
    onToggleWebFullscreen: () => void;
    onShowCastMenu: () => void;
    // Speed menu
    showSpeedMenu: boolean;
    playbackRate: number;
    speeds: number[];
    onToggleSpeedMenu: () => void;
    onSpeedChange: (speed: number) => void;
    onSpeedMenuMouseEnter: () => void;
    onSpeedMenuMouseLeave: () => void;
    containerRef: React.RefObject<HTMLDivElement | null>;
    isRotated?: boolean;
}

export function DesktopRightControls({
    isNativeFullscreen,
    isWebFullscreen,
    isCastAvailable,
    onToggleNativeFullscreen,
    onToggleWebFullscreen,
    onShowCastMenu,
    showSpeedMenu,
    playbackRate,
    speeds,
    onToggleSpeedMenu,
    onSpeedChange,
    onSpeedMenuMouseEnter,
    onSpeedMenuMouseLeave,
    containerRef,
    isRotated = false,
}: DesktopRightControlsProps) {
    // 是否处于任一全屏状态：全屏时投屏入口移到右上角
    const isAnyFullscreen = isWebFullscreen || isNativeFullscreen;

    return (
        <div className="player-controls-right relative z-50 flex shrink-0 items-center gap-3">
            {/* Google Cast - 非全屏时保留在控制条，全屏时移到右上角 */}
            {
                isCastAvailable && !isAnyFullscreen && (
                    <button
                        onClick={onShowCastMenu}
                        className="btn-icon shrink-0"
                        aria-label="投屏"
                        title="投屏"
                    >
                        <Icons.Cast size={20} />
                    </button>
                )
            }

            {/* Playback Speed */}
            <div className="shrink-0">
                <DesktopSpeedMenu
                    showSpeedMenu={showSpeedMenu}
                    playbackRate={playbackRate}
                    speeds={speeds}
                    onSpeedChange={onSpeedChange}
                    onToggleSpeedMenu={onToggleSpeedMenu}
                    onMouseEnter={onSpeedMenuMouseEnter}
                    onMouseLeave={onSpeedMenuMouseLeave}
                    containerRef={containerRef}
                    isRotated={isRotated}
                />
            </div>

            {/* Web Fullscreen / Native Fullscreen - 网页全屏时隐藏，通过返回按钮退出 */}
            {!isWebFullscreen && (
                <>
                    <button
                        onClick={onToggleWebFullscreen}
                        className="btn-icon shrink-0"
                        aria-label="网页全屏"
                        title="网页全屏 (W)"
                    >
                        <Icons.WebFullscreen size={20} />
                    </button>

                    <button
                        onClick={onToggleNativeFullscreen}
                        className="btn-icon shrink-0"
                        aria-label={isNativeFullscreen ? '退出系统全屏' : '系统全屏'}
                        title={isNativeFullscreen ? '退出系统全屏 (F)' : '系统全屏 (F)'}
                    >
                        {isNativeFullscreen ? <Icons.Minimize size={20} /> : <Icons.Maximize size={20} />}
                    </button>
                </>
            )}
        </div >
    );
}
