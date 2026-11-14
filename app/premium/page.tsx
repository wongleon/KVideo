'use client';

import { Suspense, useEffect, useState } from 'react';
import { SearchForm } from '@/components/search/SearchForm';
import { NoResults } from '@/components/search/NoResults';
import { Navbar } from '@/components/layout/Navbar';
import { TagManager } from '@/components/home/TagManager';
import { SearchResults } from '@/components/home/SearchResults';
import { usePremiumHomePage } from '@/lib/hooks/usePremiumHomePage';
import { usePremiumTagManager } from '@/lib/hooks/usePremiumTagManager';
import { usePersonalizedRecommendations } from '@/components/home/hooks/usePersonalizedRecommendations';
import { PremiumContent } from '@/components/premium/PremiumContent';
import { PremiumPasswordGate } from '@/components/PremiumPasswordGate';

function PremiumHomePage() {
    const {
        query,
        hasSearched,
        loading,
        results,
        availableSources,
        completedSources,
        totalSources,
        handleSearch,
        handleReset,
        handleCancelSearch,
    } = usePremiumHomePage();

    // 标签与推荐状态提升到页面层，供吸顶标签栏和内容区共用
    const tagManager = usePremiumTagManager();
    const recommend = usePersonalizedRecommendations(true);
    const [isRecommendSelected, setIsRecommendSelected] = useState(recommend.hasHistory);

    useEffect(() => {
        if (recommend.hasHistory) {
            setIsRecommendSelected(true);
        }
    }, [recommend.hasHistory]);

    const effectiveRecommendSelected = recommend.hasHistory && isRecommendSelected;
    const categoryValue =
        tagManager.tags.find((tag) => tag.id === tagManager.selectedTag)?.value || '';

    return (
        <div className="min-h-[100dvh]">
            {/* 与普通首页一致：顶栏与标签栏共用同一个吸顶容器 */}
            <header
                className="relative sticky top-[env(safe-area-inset-top)] z-[2000] pt-2 pb-2"
                style={{ transform: 'none', backfaceVisibility: 'visible' }}
            >
                <div
                    aria-hidden
                    className="pointer-events-none absolute inset-x-0 bottom-0 top-[calc(-1*env(safe-area-inset-top))] bg-gradient-to-b from-[var(--navbar-bg-from)] to-[var(--navbar-bg-to)]"
                />
                <Navbar onReset={handleReset} isPremiumMode={true} embedded />
                {!hasSearched && (
                    <div className="relative max-w-7xl mx-auto px-4">
                        <TagManager
                            tags={tagManager.tags}
                            selectedTag={effectiveRecommendSelected ? '' : tagManager.selectedTag}
                            showTagManager={tagManager.showTagManager}
                            newTagInput={tagManager.newTagInput}
                            justAddedTag={tagManager.justAddedTag}
                            onTagSelect={(tagId) => {
                                setIsRecommendSelected(false);
                                tagManager.setSelectedTag(tagId);
                            }}
                            onTagDelete={tagManager.handleDeleteTag}
                            onToggleManager={() => tagManager.setShowTagManager(!tagManager.showTagManager)}
                            onRestoreDefaults={tagManager.handleRestoreDefaults}
                            onNewTagInputChange={tagManager.setNewTagInput}
                            onAddTag={tagManager.handleAddTag}
                            onDragEnd={tagManager.handleDragEnd}
                            onJustAddedTagHandled={() => tagManager.setJustAddedTag(false)}
                            isLoadingTags={tagManager.loading}
                            recommendTag={
                                recommend.hasHistory
                                    ? {
                                          label: '为你推荐',
                                          isSelected: effectiveRecommendSelected,
                                          onSelect: () => setIsRecommendSelected(true),
                                      }
                                    : undefined
                            }
                        />
                    </div>
                )}
            </header>

            <main className="max-w-7xl mx-auto px-4 pb-32">
                {/* Search Form - Separate from navbar */}
                <div
                    className="mt-6 mb-8 relative"
                    style={{
                        transform: 'translate3d(0, 0, 0)',
                        zIndex: 1000,
                    }}
                >
                    <SearchForm
                        onSearch={handleSearch}
                        onClear={handleReset}
                        onCancelSearch={handleCancelSearch}
                        isLoading={loading}
                        initialQuery={query}
                        currentSource=""
                        checkedSources={completedSources}
                        totalSources={totalSources}
                        placeholder="输入关键词开始搜索..."
                        isPremium={true}
                    />
                </div>

                {/* Results Section */}
                {(results.length >= 1 || (!loading && results.length > 0)) && (
                    <SearchResults
                        results={results}
                        availableSources={availableSources}
                        loading={loading}
                        isPremium={true}
                    />
                )}

                {/* No Results */}
                {!loading && hasSearched && results.length === 0 && (
                    <NoResults onReset={handleReset} />
                )}

                {/* Premium Content - Trending and Latest */}
                {!loading && !hasSearched && (
                    <PremiumContent
                        onSearch={handleSearch}
                        categoryValue={categoryValue}
                        recommendSelected={effectiveRecommendSelected}
                        recommend={recommend}
                    />
                )}
            </main>
        </div>
    );
}

export default function PremiumPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen flex items-center justify-center bg-black">
                <div className="animate-spin rounded-full h-16 w-16 border-4 border-[var(--accent-color)] border-t-transparent"></div>
            </div>
        }>
            <PremiumPasswordGate>
                <PremiumHomePage />
            </PremiumPasswordGate>
        </Suspense>
    );
}
