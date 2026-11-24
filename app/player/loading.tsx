import { PlayerPageSkeleton } from '@/components/player/PlayerPageSkeleton';

/**
 * 路由级 loading：客户端导航到播放页时立即出现，
 * 不用等 RSC 请求返回，避免点击后长时间停留在上一个页面。
 */
export default function PlayerRouteLoading() {
    return (
        <div className="min-h-screen bg-[var(--bg-color)]">
            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-20 pt-3">
                <PlayerPageSkeleton />
            </main>
        </div>
    );
}
