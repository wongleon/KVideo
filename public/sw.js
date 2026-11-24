/**
 * 小视界 Service Worker
 *
 * iOS 主屏 PWA 每次点图标都会创建全新的 WebView，没有 Safari 的页面常驻与往返缓存；
 * 而页面 HTML 由服务端动态渲染（响应头 no-store），不做缓存的话每次启动都要重新
 * 走「网络 → 边缘函数冷启动 → SSR → 下载 JS」，启动阶段就会长时间白屏。
 *
 * 这里的策略：
 * - 导航请求：缓存优先，命中后立即返回外壳，同时后台静默更新（下次启动即为最新版本）
 * - 外壳与查询参数无关的页面（搜索/播放/高级版）：带参数导航共用同一条外壳缓存
 * - App Router 的 RSC 数据请求：stale-while-revalidate，点击导航时能立即渲染目标页
 * - 带 hash 的构建产物（JS/CSS/字体/图片）：缓存优先，无需重复下载
 * - 豆瓣海报代理：缓存优先，图片 URL 与内容一一对应，避免重建元素时重新下载
 * - 其余 /api 请求：完全不接管，保证数据新鲜
 */

// v3：升级缓存版本，让历史缓存中的豆瓣占位图（image not available）整体作废
const CACHE_VERSION = 'v3';
const SHELL_CACHE = `kvideo-shell-${CACHE_VERSION}`;
const ASSET_CACHE = `kvideo-asset-${CACHE_VERSION}`;
// RSC 缓存单独建库并独立版本：升级它不会影响已经缓存好的构建产物
const RSC_CACHE = 'kvideo-rsc-v1';

/** 旧版本遗留的缓存前缀，激活时一并清理 */
const LEGACY_CACHE_PREFIXES = ['video-cache-'];

/** 预缓存清单：体积小，且是启动阶段必读的资源 */
const PRECACHE_URLS = ['/', '/manifest.json', '/apple-touch-icon.png', '/icon.png'];

/** 可以长期缓存的请求类型（构建产物文件名带 hash，内容不会原地变化） */
const CACHEABLE_DESTINATIONS = new Set(['script', 'style', 'font', 'image']);

/**
 * 海报代理路径：图片 URL 与内容一一对应，历史 / 收藏会反复展示，
 * 走缓存优先可以避免每次切页重新下载。/api/short-drama/image 实际是通用图片代理。
 */
const CACHEABLE_IMAGE_PATHS = new Set(['/api/douban/image', '/api/short-drama/image']);

/**
 * HTML 外壳与查询参数无关的页面。
 * 这些页面都是客户端组件，服务端只返回固定外壳，因此带 query 导航时可以共用一份缓存，
 * 不必每次点击都等一次服务器往返（PWA 冷启动时这段等待尤其明显）。
 */
const SHELL_QUERY_PATHNAMES = new Set([
    '/search',
    '/player',
    '/premium',
    '/premium/favorites',
    '/premium/settings',
    '/iptv',
]);

/**
 * 有效图片的最小体积。
 * 豆瓣占位图（image not available）约 3-6KB，正常海报在 15KB 以上，
 * 低于该阈值的图片不写入缓存，避免错误内容长期固化、之后无法自我恢复。
 */
const MIN_VALID_IMAGE_BYTES = 8000;

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches
            .open(SHELL_CACHE)
            .then((cache) =>
                // 逐个写入：任一资源失败不影响其余缓存，
                // 其中 '/' 是下次冷启动直接命中缓存的关键
                Promise.all(PRECACHE_URLS.map((url) => cache.add(url).catch(() => undefined)))
            )
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then(async (cacheNames) => {
            const staleCacheNames = cacheNames.filter((cacheName) => {
                if (cacheName === SHELL_CACHE || cacheName === ASSET_CACHE || cacheName === RSC_CACHE) return false;
                return (
                    cacheName.startsWith('kvideo-') ||
                    LEGACY_CACHE_PREFIXES.some((prefix) => cacheName.startsWith(prefix))
                );
            });

            await Promise.all(staleCacheNames.map((cacheName) => caches.delete(cacheName)));
            await self.clients.claim();

            // 旧缓存被清理说明站点已重新构建，当前页面可能还停在旧 HTML 上（其引用的产物已失效，
            // 表现为一直加载不出来）。这里主动重载受控页面，交给新缓存的外壳重新渲染。
            if (staleCacheNames.length > 0) {
                const clients = await self.clients.matchAll({ type: 'window' });
                await Promise.all(
                    clients.map((client) => client.navigate(client.url).catch(() => undefined))
                );
            }
        })
    );
});

/**
 * 后台拉取最新 HTML 并写入外壳缓存。
 * 返回的 Promise 会同时用于 waitUntil（保证写入不被页面生命周期打断）和首访兜底。
 *
 * cacheKey 默认用请求本身；带查询参数的外壳页会传入「去掉查询串」的地址，
 * 让同一页面的不同参数共用一份外壳缓存。
 */
function refreshShellCache(request, cacheKey = request) {
    return fetch(request)
        .then(async (response) => {
            if (response.ok) {
                const copy = response.clone();
                try {
                    const cache = await caches.open(SHELL_CACHE);
                    await cache.put(cacheKey, copy);
                } catch {
                    // 写入失败不影响本次响应
                }
            }
            return response;
        })
        .catch(() => null);
}

/**
 * 导航请求：缓存优先 + 后台更新。
 * 命中缓存时立即返回，页面外壳可在几毫秒内渲染，后台拿到的新 HTML 覆盖缓存供下次启动使用。
 */
async function respondNavigation(request, networkUpdate, cacheKey = request) {
    const cache = await caches.open(SHELL_CACHE);
    const cached = await cache.match(cacheKey);

    if (cached) {
        return cached;
    }

    const fresh = await networkUpdate;
    if (fresh) {
        return fresh;
    }

    const fallback = await cache.match('/');
    return fallback || Response.error();
}

/**
 * 是否为 App Router 的 RSC 数据请求。
 * 这类请求决定点击导航后能否立刻渲染目标页，但它们既不是导航（document），
 * 也不在 /api 下，原策略会完全放行给网络。
 */
function isRscRequest(request, url) {
    if (request.headers.get('RSC') === '1') return true;
    if (request.headers.get('Next-Router-Prefetch') === '1') return true;
    return url.searchParams.has('_rsc');
}

/**
 * RSC 请求：stale-while-revalidate。
 * 缓存键使用完整 URL（含 Next 生成的 _rsc 标记），并刻意用字符串而不是 Request，
 * 避免 Vary: Next-Router-State-Tree 导致同一页面的不同进入状态全部 miss。
 */
function handleRscRequest(event) {
    const { request } = event;
    const cacheKey = request.url;

    const cachePromise = caches.open(RSC_CACHE);
    const network = fetch(request)
        .then(async (response) => {
            const contentType = response.headers.get('content-type') || '';
            if (response.ok && contentType.includes('text/x-component')) {
                try {
                    // 等待写入完成：让 waitUntil 覆盖整个缓存过程，避免被 SW 生命周期打断
                    const cache = await cachePromise;
                    await cache.put(cacheKey, response.clone());
                } catch {
                    // 缓存写入失败不影响本次响应
                }
            }
            return response;
        })
        .catch(() => undefined);

    event.waitUntil(network.then(() => undefined));

    return (async () => {
        const cache = await cachePromise;
        const cached = await cache.match(cacheKey);
        if (cached) {
            return cached;
        }

        const fresh = await network;
        return fresh || Response.error();
    })();
}

/** 静态资源：缓存优先，未命中时请求并回填缓存 */
async function handleAsset(event) {
    const { request } = event;
    const cache = await caches.open(ASSET_CACHE);
    const cached = await cache.match(request);

    if (cached) {
        return cached;
    }

    const response = await fetch(request);

    // 图片体积异常（多为豆瓣占位图）说明内容不可用，不写入缓存，下次仍会重试
    const contentLength = Number(response.headers.get('content-length') || 0);
    const isSuspiciousImage =
        request.destination === 'image' &&
        contentLength > 0 &&
        contentLength < MIN_VALID_IMAGE_BYTES;

    if (response.ok && !isSuspiciousImage) {
        cache.put(request, response.clone()).catch(() => {});
    }

    return response;
}

self.addEventListener('fetch', (event) => {
    const { request } = event;

    if (request.method !== 'GET') return;

    const url = new URL(request.url);
    if (url.origin !== self.location.origin) return;

    if (request.mode === 'navigate') {
        // 外壳与查询参数无关的页面（搜索/播放/高级版等）共用一份外壳缓存，
        // 点击后可以直接渲染，不必每次等服务器返回。
        if (url.search) {
            if (!SHELL_QUERY_PATHNAMES.has(url.pathname)) return;

            const cacheKey = `${url.origin}${url.pathname}`;
            const networkUpdate = refreshShellCache(request, cacheKey);
            event.waitUntil(networkUpdate.then(() => undefined));
            event.respondWith(respondNavigation(request, networkUpdate, cacheKey));
            return;
        }

        // waitUntil 必须在监听器同步阶段调用，因此这里先创建更新任务再分发响应
        const networkUpdate = refreshShellCache(request);
        event.waitUntil(networkUpdate.then(() => undefined));
        event.respondWith(respondNavigation(request, networkUpdate));
        return;
    }

    // App Router 的数据请求：命中缓存时立即返回目标页内容，后台静默更新
    if (isRscRequest(request, url)) {
        event.respondWith(handleRscRequest(event));
        return;
    }

    // 接口数据不接管，交给浏览器与 CDN 的 HTTP 缓存策略；
    // 海报代理 URL 与图片一一对应且内容不变，走缓存优先，避免切页重建图片元素时重新下载
    if (url.pathname.startsWith('/api/')) {
        if (CACHEABLE_IMAGE_PATHS.has(url.pathname) && request.destination === 'image') {
            event.respondWith(handleAsset(event));
        }
        return;
    }

    if (CACHEABLE_DESTINATIONS.has(request.destination)) {
        event.respondWith(handleAsset(event));
    }
});
