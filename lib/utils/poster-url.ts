/**
 * 历史 / 收藏海报地址处理
 *
 * 历史与收藏记录里保存的是采集站的外域图片地址，直接加载时每次都要跨网回源，
 * 且 Service Worker 明确不接管跨域请求，这部分图片因此一直无法本地缓存。
 * 展示时统一改写为同源图片代理地址后，请求就变成同源 image 请求，
 * 会被 SW 的海报缓存以「缓存优先」永久保存，同时复用代理的边缘缓存。
 *
 * 注意：/api/short-drama/image 虽然命名带短剧，实际是通用的公网图片代理
 * （允许任意 http(s) 图片域名，拒绝内网地址），历史与收藏直接复用。
 */

/** 把海报地址转为同源代理地址；已经是站内地址时保持原样 */
export function buildPosterUrl(poster?: string): string | undefined {
    // 缓存可能被外部修改，这里同时做运行时类型检查
    if (!poster || typeof poster !== 'string') return undefined;
    // 站内静态资源与已经代理过的地址不再二次包装
    if (poster.startsWith('/')) return poster;
    // data:/blob: 等内联地址无法代理，保持原样
    if (!/^https?:\/\//i.test(poster)) return poster;
    return `/api/short-drama/image?url=${encodeURIComponent(poster)}`;
}

/**
 * 删除记录时同步清理该海报在 Service Worker 中的缓存。
 * 浏览器在存储压力下会自行回收，这里主动删除是为了避免取消收藏/删除历史后
 * 图片继续占用空间。清理失败不影响记录删除本身。
 */
export function evictPosterCache(poster?: string): void {
    const url = buildPosterUrl(poster);
    if (!url || typeof caches === 'undefined') return;

    void (async () => {
        try {
            const cacheNames = await caches.keys();
            // 缓存名带版本号（如 kvideo-asset-v3），这里按前缀匹配以兼容版本升级
            const assetCaches = cacheNames.filter((name) => name.startsWith('kvideo-asset-'));
            await Promise.all(
                assetCaches.map(async (name) => {
                    const cache = await caches.open(name);
                    await cache.delete(url);
                })
            );
        } catch {
            // 忽略清理失败，避免影响记录删除
        }
    })();
}

/* ---------------------------------------------------------------------------
 * 海报缓存淘汰
 *
 * 海报图片由 SW 永久缓存，但数据本身会更新：首页信息流刷新后旧海报不再被引用，
 * 长期积累会持续占用用户本地空间。这里在 localStorage 缓存更新后做一次回收：
 * 以「当前持久化数据仍然引用」的海报集合为准，删掉缓存里不再被引用的海报条目。
 *
 * 注意：只处理海报代理路径，构建产物（JS/CSS/字体）与其他图片不受影响。
 * 页面中临时展示、但未持久化的海报（如搜索结果）也会被回收，下次加载时重新下载。
 * ------------------------------------------------------------------------- */

/** 与 sw.js 的 CACHEABLE_IMAGE_PATHS 保持一致：只淘汰海报代理条目 */
const POSTER_CACHE_PATHNAMES = new Set(['/api/douban/image', '/api/short-drama/image']);

/** 首页信息流缓存的 localStorage 键（与 feed-cache 的使用方保持一致） */
const FEED_CACHE_KEYS = ['douban-feed-first-page', 'short-drama-feed-first-page'];

/**
 * 历史 / 收藏持久化的键名前缀：
 * 覆盖普通版、高级版以及带账号画像后缀（-p-<profileId>）的变体。
 */
const RECORD_STORE_PREFIXES = [
    'kvideo-history-store',
    'kvideo-premium-history-store',
    'kvideo-favorites-store',
    'kvideo-premium-favorites-store',
];

/** 两次全量淘汰的最小间隔：播放进度会频繁写 localStorage，不能每次都扫描缓存 */
const GC_MIN_INTERVAL_MS = 60 * 1000;

let gcTimer: ReturnType<typeof setTimeout> | null = null;
let lastGcAt = 0;

/** 把海报地址统一成「路径 + 查询串」，与缓存键保持一致的比较口径 */
function toCacheKey(poster?: string): string | null {
    const url = buildPosterUrl(poster);
    if (!url) return null;

    try {
        const parsed = new URL(url, window.location.origin);
        return `${parsed.pathname}${parsed.search}`;
    } catch {
        return null;
    }
}

/** 收集仍然被持久化数据引用的海报地址 */
function collectActivePosterKeys(): Set<string> {
    const active = new Set<string>();
    const add = (poster?: string) => {
        const key = toCacheKey(poster);
        if (key) active.add(key);
    };

    for (const cacheKey of FEED_CACHE_KEYS) {
        try {
            const raw = localStorage.getItem(cacheKey);
            if (!raw) continue;

            const parsed = JSON.parse(raw) as {
                entries?: Record<string, { data?: Array<{ cover?: string }> }>;
            };
            Object.values(parsed.entries ?? {}).forEach((entry) => {
                entry.data?.forEach((movie) => add(movie.cover));
            });
        } catch {
            // 单条缓存损坏时跳过，不影响其余数据
        }
    }

    for (let index = 0; index < localStorage.length; index += 1) {
        const key = localStorage.key(index);
        if (!key || !RECORD_STORE_PREFIXES.some((prefix) => key.startsWith(prefix))) continue;

        try {
            const raw = localStorage.getItem(key);
            if (!raw) continue;

            const parsed = JSON.parse(raw) as {
                state?: {
                    viewingHistory?: Array<{ poster?: string }>;
                    favorites?: Array<{ poster?: string }>;
                };
            };
            parsed.state?.viewingHistory?.forEach((item) => add(item.poster));
            parsed.state?.favorites?.forEach((item) => add(item.poster));
        } catch {
            // 单条记录损坏时跳过
        }
    }

    return active;
}

/** 扫描海报缓存，删除不再被任何持久化数据引用的条目 */
async function runPosterCacheGc(): Promise<void> {
    try {
        const cacheNames = (await caches.keys()).filter((name) => name.startsWith('kvideo-asset-'));
        if (cacheNames.length === 0) return;

        const active = collectActivePosterKeys();

        for (const name of cacheNames) {
            const cache = await caches.open(name);
            const requests = await cache.keys();

            await Promise.all(
                requests.map((request) => {
                    const url = new URL(request.url);
                    // 非海报资源（构建产物等）一律不动
                    if (!POSTER_CACHE_PATHNAMES.has(url.pathname)) return undefined;
                    if (active.has(`${url.pathname}${url.search}`)) return undefined;
                    return cache.delete(request);
                })
            );
        }
    } catch {
        // 淘汰失败不影响页面功能，下次缓存更新时会再次尝试
    }
}

/**
 * 安排一次海报缓存淘汰。
 * localStorage 缓存每次更新后调用即可：短时间内的多次调用会合并为一次，
 * 且两次扫描之间至少间隔一分钟，避免播放进度写入导致频繁扫描。
 */
export function schedulePosterCacheGc(): void {
    if (typeof window === 'undefined' || typeof caches === 'undefined') return;
    if (gcTimer) return;

    const wait = Math.max(0, GC_MIN_INTERVAL_MS - (Date.now() - lastGcAt));
    gcTimer = setTimeout(() => {
        gcTimer = null;
        lastGcAt = Date.now();
        void runPosterCacheGc();
    }, wait);
}
