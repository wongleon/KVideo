'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { HomeFilterTabs, HOME_FILTERS, PopularFeatures } from '@/components/home/PopularFeatures';
import { Navbar } from '@/components/layout/Navbar';
import { clearSearchPageCache } from '@/lib/utils/search-page-cache';

function HomePage() {
  const router = useRouter();
  const [selectedFilterId, setSelectedFilterId] = useState(HOME_FILTERS[0].id);

  // 首页不再展示搜索框与搜索结果，点击影片直接进入搜索页
  const handleSearch = useCallback((query: string) => {
    // 首页发起搜索属于新搜索，清空上次记录，避免进入搜索页后回显旧结果
    clearSearchPageCache();
    router.push(`/search?q=${encodeURIComponent(query)}`);
  }, [router]);

  const handleReset = useCallback(() => {
    router.push('/');
  }, [router]);

  return (
    <div className="min-h-[100dvh]">
      {/* 顶栏与分类标签栏共用同一个吸顶容器，滚动时整体固定，避免两条独立吸顶栏相互错位抖动 */}
      {/* 抵消全局 .sticky 强制的 transform 合成层，避免滚动时吸顶位置出现逐帧抖动 */}
      <header
        className="relative sticky top-[env(safe-area-inset-top)] z-[2000] pt-2 pb-2"
        style={{ transform: 'none', backfaceVisibility: 'visible' }}
      >
        {/* 吸顶背景层：向上延伸覆盖状态栏安全区，向下铺满整个头部 */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 top-[calc(-1*env(safe-area-inset-top))] bg-gradient-to-b from-[var(--navbar-bg-from)] to-[var(--navbar-bg-to)]"
        />
        <Navbar onReset={handleReset} embedded />
        <div className="relative max-w-7xl mx-auto px-4">
          <HomeFilterTabs selectedFilterId={selectedFilterId} onSelect={setSelectedFilterId} />
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 pb-32">
        <PopularFeatures selectedFilterId={selectedFilterId} onSearch={handleSearch} />
      </main>
    </div>
  );
}

export default function Home() {
  return <HomePage />;
}
