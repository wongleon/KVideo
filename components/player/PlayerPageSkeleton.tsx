/**
 * 播放页骨架屏（只含内容区，外层容器由使用方提供）
 *
 * 两个场景共用：
 * 1. 路由级 loading.tsx：点击进入播放页时立即渲染，避免客户端导航期间停留在上一页造成「点了没反应」
 * 2. 播放页内部的详情请求阶段：用历史/收藏带过来的标题与海报先占住布局，把整页 spinner 换成有内容的骨架
 */
interface PlayerPageSkeletonProps {
    /** 已知海报地址（来自历史/收藏），用于填充播放器区域 */
    poster?: string;
    /** 已知标题（来自 URL 参数），用于填充信息区 */
    title?: string;
    /** 是否在播放器区域显示加载指示器 */
    showSpinner?: boolean;
}

export function PlayerPageSkeleton({ poster, title, showSpinner = true }: PlayerPageSkeletonProps) {
    return (
        <div className="grid min-w-0 gap-2 lg:gap-6 lg:grid-cols-3 lg:items-start xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.9fr)]">
            {/* 播放器区域：有海报时先铺海报，避免黑色空块 */}
            <div className="min-w-0 lg:col-span-2 xl:col-span-1 space-y-4 lg:space-y-6">
                <div className="relative aspect-video overflow-hidden rounded-none bg-black sm:rounded-[var(--radius-2xl)]">
                    {poster ? (
                        <div
                            aria-hidden
                            className="absolute inset-0 bg-cover bg-center opacity-40 blur-sm"
                            style={{ backgroundImage: `url("${poster}")` }}
                        />
                    ) : null}
                    {showSpinner ? (
                        <div className="absolute inset-0 flex items-center justify-center">
                            <div className="animate-spin rounded-full h-16 w-16 border-4 border-[var(--accent-color)] border-t-transparent" />
                        </div>
                    ) : null}
                </div>

                {/* 移动端信息区 */}
                <div className="space-y-3">
                    <div className="h-6 w-2/3 rounded-[var(--radius-lg)] bg-[var(--glass-bg)] animate-pulse" />
                    {title ? (
                        <p className="truncate text-sm text-[var(--text-color-secondary)]">{title}</p>
                    ) : null}
                    <div className="h-4 w-1/2 rounded bg-[var(--glass-bg)] animate-pulse" />
                </div>
            </div>

            {/* 侧栏：选集 / 线路 */}
            <div className="min-w-0 lg:col-span-1 max-lg:-mt-2">
                <div className="lg:sticky lg:top-28 space-y-6">
                    <div className="space-y-3 rounded-[var(--radius-2xl)] border border-[var(--glass-border)] bg-[var(--glass-bg)] p-4">
                        <div className="h-5 w-24 rounded bg-[var(--glass-bg)] animate-pulse" />
                        <div className="grid grid-cols-4 gap-2">
                            {Array.from({ length: 8 }).map((_, index) => (
                                <div key={index} className="h-9 rounded-[var(--radius-lg)] bg-[var(--glass-bg)] animate-pulse" />
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
