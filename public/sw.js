/**
 * 小视界 Service Worker
 *
 * iOS 主屏 PWA 每次点图标都会创建全新的 WebView，没有 Safari 的页面常驻与往返缓存；
 * 而页面 HTML 由服务端动态渲染（响应头 no-store），不做缓存的话每次启动都要重新
 * 走「网络 → 边缘函数冷启动 → SSR → 下载 JS」，启动阶段就会长时间白屏。
 *
 * 这里的策略：
 * - 导航请求：缓存优先，命中后立即返回外壳，同时后台静默更新（下次启动即为最新版本）
 * - 带 hash 的构建产物（JS/CSS/字体/图片）：缓存优先，无需重复下载
 * - /api 请求：完全不接管，保证数据新鲜
 */

const CACHE_VERSION = 'v1';
const SHELL_CACHE = `kvideo-shell-${CACHE_VERSION}`;
const ASSET_CACHE = `kvideo-asset-${CACHE_VERSION}`;

/** 旧版本遗留的缓存前缀，激活时一并清理 */
const LEGACY_CACHE_PREFIXES = ['video-cache-'];

/** 预缓存清单：体积小，且是启动阶段必读的资源 */
const PRECACHE_URLS = ['/', '/manifest.json', '/apple-touch-icon.png', '/icon.png'];

/** 可以长期缓存的请求类型（构建产物文件名带 hash，内容不会原地变化） */
const CACHEABLE_DESTINATIONS = new Set(['script', 'style', 'font', 'image']);

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
        caches
            .keys()
            .then((cacheNames) =>
                Promise.all(
                    cacheNames
                        .filter((cacheName) => {
                            if (cacheName === SHELL_CACHE || cacheName === ASSET_CACHE) return false;
                            return (
                                cacheName.startsWith('kvideo-') ||
                                LEGACY_CACHE_PREFIXES.some((prefix) => cacheName.startsWith(prefix))
                            );
                        })
                        .map((cacheName) => caches.delete(cacheName))
                )
            )
            .then(() => self.clients.claim())
    );
});

/**
 * 后台拉取最新 HTML 并写入外壳缓存。
 * 返回的 Promise 会同时用于 waitUntil（保证写入不被页面生命周期打断）和首访兜底。
 */
function refreshShellCache(request) {
    return fetch(request)
        .then(async (response) => {
            if (response.ok) {
                const copy = response.clone();
                try {
                    const cache = await caches.open(SHELL_CACHE);
                    await cache.put(request, copy);
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
async function respondNavigation(request, networkUpdate) {
    const cache = await caches.open(SHELL_CACHE);
    const cached = await cache.match(request);

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

/** 静态资源：缓存优先，未命中时请求并回填缓存 */
async function handleAsset(event) {
    const { request } = event;
    const cache = await caches.open(ASSET_CACHE);
    const cached = await cache.match(request);

    if (cached) {
        return cached;
    }

    const response = await fetch(request);
    if (response.ok) {
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
        // 搜索页、播放页等结果与查询参数强相关，缓存会展示上一次的内容，直接交给网络
        if (url.search) return;

        // waitUntil 必须在监听器同步阶段调用，因此这里先创建更新任务再分发响应
        const networkUpdate = refreshShellCache(request);
        event.waitUntil(networkUpdate.then(() => undefined));
        event.respondWith(respondNavigation(request, networkUpdate));
        return;
    }

    // 接口数据不接管，交给浏览器与 CDN 的 HTTP 缓存策略；
    // 海报代理 URL 与图片一一对应且内容不变，走缓存优先，避免切页重建图片元素时重新下载
    if (url.pathname.startsWith('/api/')) {
        if (url.pathname === '/api/douban/image' && request.destination === 'image') {
            event.respondWith(handleAsset(event));
        }
        return;
    }

    if (CACHEABLE_DESTINATIONS.has(request.destination)) {
        event.respondWith(handleAsset(event));
    }
});
