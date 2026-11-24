/**
 * 路由级 loading：从首页点击影片进入搜索页时立即出现，
 * 保持与搜索页一致的顶栏与结果网格布局，避免导航期间没有任何视觉反馈。
 */
export default function SearchRouteLoading() {
    const tabWidths = [64, 80, 56, 72];

    return (
        <div className="min-h-screen bg-[var(--bg-color)]">
            <header className="sticky top-[env(safe-area-inset-top)] z-[1100] px-3 sm:px-4 pt-3 pb-1">
                <div className="max-w-3xl mx-auto flex items-center gap-2">
                    <div className="w-10 h-10 flex-shrink-0 rounded-[var(--radius-full)] bg-[var(--glass-bg)] animate-pulse" />
                    <div className="h-10 sm:h-11 flex-1 rounded-[var(--radius-full)] bg-[var(--glass-bg)] animate-pulse" />
                    <div className="w-10 h-10 flex-shrink-0 rounded-[var(--radius-full)] bg-[var(--glass-bg)] animate-pulse" />
                </div>
            </header>

            <main className="max-w-7xl mx-auto px-4 pb-24">
                <div className="mt-3 space-y-5">
                    <div className="flex items-center gap-2 overflow-hidden">
                        {tabWidths.map((width) => (
                            <div
                                key={width}
                                className="h-8 flex-shrink-0 rounded-[var(--radius-full)] bg-[var(--glass-bg)] animate-pulse"
                                style={{ width }}
                            />
                        ))}
                    </div>

                    <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4 lg:grid-cols-6">
                        {Array.from({ length: 12 }).map((_, index) => (
                            <div
                                key={index}
                                className="aspect-[5/8] rounded-[var(--radius-lg)] bg-[var(--glass-bg)] animate-pulse"
                            />
                        ))}
                    </div>
                </div>
            </main>
        </div>
    );
}
