/**
 * 路由级 loading：与追剧页共用同一套列表骨架。
 */
export default function FavoritesRouteLoading() {
    return (
        <div className="min-h-screen bg-[var(--bg-color)]">
            <main className="max-w-3xl mx-auto px-4 pt-8 pb-32">
                <div className="mb-6 flex items-center justify-between gap-4">
                    <div className="h-8 w-36 rounded-[var(--radius-lg)] bg-[var(--glass-bg)] animate-pulse" />
                    <div className="h-7 w-16 rounded-[var(--radius-full)] bg-[var(--glass-bg)] animate-pulse" />
                </div>

                <div className="space-y-3">
                    {Array.from({ length: 6 }).map((_, index) => (
                        <div
                            key={index}
                            className="flex items-stretch gap-3 rounded-lg border border-transparent bg-[color-mix(in_srgb,var(--glass-bg)_50%,transparent)]"
                        >
                            <div className="w-16 flex-shrink-0 self-stretch rounded-l-lg bg-[var(--glass-bg)] animate-pulse" />
                            <div className="flex-1 space-y-2 py-3">
                                <div className="h-4 w-2/3 rounded bg-[var(--glass-bg)] animate-pulse" />
                                <div className="h-3 w-1/3 rounded bg-[var(--glass-bg)] animate-pulse" />
                            </div>
                        </div>
                    ))}
                </div>
            </main>
        </div>
    );
}
