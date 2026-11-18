/**
 * 首页信息流的首屏缓存（豆瓣信息流与短剧系共用同一套策略）
 *
 * 策略：
 * - 刷新阈值 6 小时：超过后先展示旧数据，同时静默请求最新数据并覆盖缓存
 * - 保留期 7 天：超过后视为没有缓存，直接重新加载
 * - localStorage 持久化：PWA 冷启动或被系统回收后仍能立即渲染
 *
 * 注意：豆瓣信息流（components/home/PopularFeatures.tsx）与短剧系
 * （components/home/ShortDramaFeed.tsx：短剧 / AI漫剧 / 国漫）共用本文件的
 * 阈值与存储实现。后续调整刷新阈值、保留期或存储方式时必须统一修改，
 * 不要只改其中一路。
 */

import { schedulePosterCacheGc } from '@/lib/utils/poster-url';

/** 静默刷新阈值：超过后先展示旧数据，同时请求最新数据 */
export const FEED_CACHE_REFRESH_AFTER = 6 * 60 * 60 * 1000;

/** 持久化保留期：超过后视为没有缓存，直接重新加载 */
export const FEED_CACHE_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

export interface FeedCacheHit<T> {
    data: T;
    /** 已超过刷新阈值，但仍可先展示 */
    stale: boolean;
}

interface FeedCacheEntry<T> {
    data: T;
    timestamp: number;
}

interface StoredFeedCache<T> {
    version: number;
    entries: Record<string, FeedCacheEntry<T>>;
}

export interface FeedCacheStore<T> {
    /** 读取缓存；超过保留期返回 null，超过刷新阈值时 stale 为 true */
    read(key: string): FeedCacheHit<T> | null;
    /** 写入缓存并刷新时间戳 */
    write(key: string, data: T): void;
}

/**
 * 创建一个带 localStorage 持久化的首屏缓存。
 * 内存中的数据始终优先，localStorage 只在首次读取时回填，用于跨进程恢复。
 * version 在存储结构变化时递增，旧数据会被整体作废。
 */
export function createFeedCacheStore<T>(storageKey: string, version = 1): FeedCacheStore<T> {
    const memory = new Map<string, FeedCacheEntry<T>>();
    let loaded = false;

    const persist = () => {
        if (typeof window === 'undefined') return;

        try {
            const now = Date.now();
            const entries: Record<string, FeedCacheEntry<T>> = {};
            memory.forEach((entry, key) => {
                // 超过保留期的条目不写入，避免把已失效的数据长期留在存储里
                if (now - entry.timestamp > FEED_CACHE_MAX_AGE) return;
                entries[key] = entry;
            });

            const payload: StoredFeedCache<T> = { version, entries };
            localStorage.setItem(storageKey, JSON.stringify(payload));

            // 缓存内容变了，回收不再被引用的海报图片缓存
            schedulePosterCacheGc();
        } catch {
            // 超出配额或被系统禁用时忽略，退化为纯内存缓存
        }
    };

    /** 首次读取时把持久化的数据回填到内存 */
    const ensureLoaded = () => {
        if (loaded) return;
        loaded = true;
        if (typeof window === 'undefined') return;

        try {
            const raw = localStorage.getItem(storageKey);
            if (!raw) return;

            const parsed = JSON.parse(raw) as StoredFeedCache<T>;
            if (!parsed || parsed.version !== version || !parsed.entries) {
                localStorage.removeItem(storageKey);
                return;
            }

            const now = Date.now();
            let needsRewrite = false;

            for (const [key, entry] of Object.entries(parsed.entries)) {
                if (!entry || !Array.isArray(entry.data) || typeof entry.timestamp !== 'number') {
                    needsRewrite = true;
                    continue;
                }
                if (now - entry.timestamp > FEED_CACHE_MAX_AGE) {
                    needsRewrite = true;
                    continue;
                }
                if (memory.has(key)) continue;
                memory.set(key, entry);
            }

            // 顺手清掉过期/损坏的条目，避免长期占用存储空间
            if (needsRewrite) persist();
        } catch {
            // 存储不可用或内容损坏时忽略，退化为纯内存缓存
        }
    };

    return {
        read(key) {
            ensureLoaded();

            const entry = memory.get(key);
            if (!entry) return null;

            const age = Date.now() - entry.timestamp;
            if (age > FEED_CACHE_MAX_AGE) {
                memory.delete(key);
                return null;
            }

            return { data: entry.data, stale: age > FEED_CACHE_REFRESH_AFTER };
        },

        write(key, data) {
            ensureLoaded();
            memory.set(key, { data, timestamp: Date.now() });
            persist();
        },
    };
}
