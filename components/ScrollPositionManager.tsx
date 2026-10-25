'use client';

import { useEffect, useCallback, useRef } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { settingsStore } from '@/lib/store/settings-store';

/**
 * ScrollPositionManager - Maintains scroll position across navigation and refreshes
 * Uses sessionStorage to persist scroll state per URL
 */
export function ScrollPositionManager() {
    const pathname = usePathname();
    const searchParams = useSearchParams();
    // 记录最后一次滚动所属的页面与位置，用于路由切换时立即落盘
    const lastScrollRef = useRef<{ key: string; position: number } | null>(null);
    // 记录上一路径，用于区分「页面切换」与「同页参数变化」
    const prevPathRef = useRef(pathname);

    // Create a unique key for the current page including search params
    const getPageKey = useCallback(() => {
        const params = searchParams.toString();
        return `scroll-pos:${pathname}${params ? '?' + params : ''}`;
    }, [pathname, searchParams]);

    // Restoration logic
    useEffect(() => {
        const settings = settingsStore.getSettings();
        if (!settings.rememberScrollPosition) return;

        const key = getPageKey();
        const savedPos = sessionStorage.getItem(key);

        // 页面切换且目标页没有历史位置时，显式回到顶部。
        // 否则 iOS 会因新页面内容高度不足，把旧页面的滚动位置截断后停在页面中段。
        const pathChanged = prevPathRef.current !== pathname;
        prevPathRef.current = pathname;

        if (!savedPos && pathChanged) {
            const topTimer = setTimeout(() => window.scrollTo(0, 0), 100);
            return () => clearTimeout(topTimer);
        }

        if (savedPos) {
            const position = parseInt(savedPos, 10);
            if (!isNaN(position) && position > 0) {
                // 内容可能仍在加载（轮播图、影片网格），此时 scrollTo 会被页面高度截断。
                // 因此持续对齐，直到到达目标位置、用户主动滚动或超时。
                let finished = false;
                let timer: ReturnType<typeof setTimeout> | null = null;
                let observer: ResizeObserver | null = null;
                const deadline = Date.now() + 8000;

                // 用户主动操作时立即放弃，避免与手动滚动抢夺控制权
                const stop = () => {
                    if (finished) return;
                    finished = true;
                    if (timer) clearTimeout(timer);
                    observer?.disconnect();
                    window.removeEventListener('wheel', stop);
                    window.removeEventListener('touchstart', stop);
                    window.removeEventListener('keydown', stop);
                };

                const align = () => {
                    if (finished) return;

                    window.scrollTo(0, position);

                    // 到达目标位置或超时则结束，否则等待高度增长后重试
                    if (Math.abs(window.scrollY - position) < 2 || Date.now() > deadline) {
                        stop();
                        return;
                    }

                    timer = setTimeout(align, 120);
                };

                window.addEventListener('wheel', stop, { passive: true });
                window.addEventListener('touchstart', stop, { passive: true });
                window.addEventListener('keydown', stop);

                // 页面高度变化（数据加载完成、iOS 工具栏伸缩）时立即重新对齐
                if (typeof ResizeObserver !== 'undefined') {
                    observer = new ResizeObserver(() => {
                        if (finished) return;
                        window.scrollTo(0, position);
                        if (Math.abs(window.scrollY - position) < 2) {
                            stop();
                        }
                    });
                    observer.observe(document.body);
                }

                timer = setTimeout(align, 100);

                return () => {
                    if (timer) clearTimeout(timer);
                    observer?.disconnect();
                    finished = true;
                    window.removeEventListener('wheel', stop);
                    window.removeEventListener('touchstart', stop);
                    window.removeEventListener('keydown', stop);
                };
            }
        }
    }, [getPageKey, pathname, searchParams]); // Run on navigation

    // Saving logic
    useEffect(() => {
        let timeoutId: NodeJS.Timeout;

        const persist = (key: string, position: number) => {
            // Only save if we have scrolled
            if (position > 0) {
                sessionStorage.setItem(key, position.toString());
            } else {
                sessionStorage.removeItem(key);
            }
        };

        const handleScroll = () => {
            const settings = settingsStore.getSettings();
            if (!settings.rememberScrollPosition) return;

            // 立即捕获页面 key 与滚动值：防抖回调可能在路由切换后才执行，
            // 若此时再读取 pathname/scrollY，会把上一页的位置写到新页面名下
            const key = getPageKey();
            const position = window.scrollY;
            lastScrollRef.current = { key, position };

            // Debounce saving to avoid excessive writes to sessionStorage
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => persist(key, position), 500);
        };

        window.addEventListener('scroll', handleScroll, { passive: true });

        return () => {
            window.removeEventListener('scroll', handleScroll);
            clearTimeout(timeoutId);

            // 路由切换时立即落盘最后一次位置，避免防抖被取消后丢失
            if (lastScrollRef.current) {
                persist(lastScrollRef.current.key, lastScrollRef.current.position);
                lastScrollRef.current = null;
            }
        };
    }, [getPageKey]);

    return null;
}
