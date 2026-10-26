'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { PopularFeatures } from '@/components/home/PopularFeatures';
import { Navbar } from '@/components/layout/Navbar';
import { clearSearchPageCache } from '@/lib/utils/search-page-cache';

function HomePage() {
  const router = useRouter();

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
      {/* Glass Navbar */}
      <Navbar onReset={handleReset} />

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 pt-0 pb-32">
        <PopularFeatures onSearch={handleSearch} />
      </main>
    </div>
  );
}

export default function Home() {
  return <HomePage />;
}
