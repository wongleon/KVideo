import { NextResponse } from 'next/server';
import { buildDoubanImageCandidates } from '@/lib/server/douban-image';

export const runtime = 'edge';

/** 单个镜像的超时：云端到豆瓣 CDN 的链路不稳，超时后立即换下一个镜像 */
const PER_CANDIDATE_TIMEOUT_MS = 3000;
/** 整张图的拉取总预算：镜像串行重试不能无限叠加，超预算直接返回错误，避免拖死整页 */
const TOTAL_BUDGET_MS = 8000;
/**
 * 有效图片的最小体积。
 * 豆瓣在图片失效或被限流时会返回 200 的 "image not available" 占位图（约 3-6KB），
 * 正常海报均在 15KB 以上；低于该阈值的响应必须当作失败处理，且绝不能写入任何缓存。
 */
const MIN_VALID_IMAGE_BYTES = 8000;

const REQUEST_HEADERS = {
    'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    Accept: 'image/jpeg,image/png,image/gif,*/*;q=0.8',
    Referer: 'https://movie.douban.com/',
};

/**
 * 取 Cloudflare 边缘缓存。
 * Pages Functions 生成的响应不会自动进入边缘缓存（Cache-Control 只影响浏览器），
 * 必须显式读写 Cache API，否则每次请求都要跨网回源豆瓣，海外节点会非常慢甚至超时。
 * 本地 Node 环境没有全局 caches，返回 null 时退化为不缓存。
 */
function getEdgeCache(): Cache | null {
    try {
        // Cloudflare 的 caches.default 不在 DOM 标准类型里，这里用结构化类型读取
        const cacheStorage = (globalThis as { caches?: { default?: Cache } }).caches;
        return cacheStorage?.default ?? null;
    } catch {
        // 运行时未提供 Cache API 时退化为不缓存，不能让图片请求因此失败
        return null;
    }
}

export async function GET(request: Request) {
    const cache = getEdgeCache();
    // 诊断用：hit 命中边缘缓存、miss 已回源、off 运行时未提供 Cache API
    const cacheState = cache ? 'miss' : 'off';
    // 用独立的 GET 请求作为缓存键：Next 包装过的请求对象不适合直接交给 Cache API
    const cacheKey = new Request(request.url, { method: 'GET' });

    // 命中边缘缓存直接返回，不再回源；任何缓存异常都退化为直接回源
    if (cache) {
        try {
            const cached = await cache.match(cacheKey);
            if (cached) {
                const headers = new Headers(cached.headers);
                headers.set('X-Image-Cache', 'hit');
                return new Response(cached.body, { status: cached.status, headers });
            }
        } catch (error) {
            // 忽略，走正常回源流程
            console.error('[DoubanImage] cache.match failed:', error);
        }
    }

    const { searchParams } = new URL(request.url);
    const imageUrl = searchParams.get('url');

    if (!imageUrl) {
        return NextResponse.json({ error: 'Missing image URL' }, { status: 400 });
    }

    let lastStatus = 502;
    let lastError = 'Error fetching image';
    const deadline = Date.now() + TOTAL_BUDGET_MS;

    for (const candidate of buildDoubanImageCandidates(imageUrl)) {
        const remaining = deadline - Date.now();
        if (remaining <= 0) break;

        let imageResponse: Response;

        try {
            imageResponse = await fetch(candidate, {
                headers: REQUEST_HEADERS,
                signal: AbortSignal.timeout(Math.min(PER_CANDIDATE_TIMEOUT_MS, remaining)),
                // 让 Cloudflare 直接缓存豆瓣图片本体：图片内容不会变化，
                // 命中后同一数据中心的后续请求不再跨网回源（Cache API 不可用时的兜底）
                cf: { cacheEverything: true, cacheTtl: 2592000 },
            } as RequestInit & { cf: { cacheEverything: boolean; cacheTtl: number } });
        } catch {
            // 线路不可达或超时,换下一个镜像
            continue;
        }

        if (!imageResponse.ok) {
            lastStatus = imageResponse.status;
            lastError = imageResponse.statusText || 'Error fetching image';
            continue;
        }

        if (!imageResponse.body) {
            lastStatus = 500;
            lastError = 'Image response has no body';
            continue;
        }

        // 上游返回非图片内容（如被拦截后回吐 HTML）同样不可用
        const upstreamType = imageResponse.headers.get('content-type') || '';
        if (!upstreamType.startsWith('image/')) {
            lastStatus = 502;
            lastError = `Unexpected content type: ${upstreamType || 'unknown'}`;
            continue;
        }

        let bytes: ArrayBuffer;
        try {
            bytes = await imageResponse.arrayBuffer();
        } catch {
            lastStatus = 502;
            lastError = 'Failed to read image body';
            continue;
        }

        // 占位图是内容层面的问题，换镜像也拿不到真图，直接失败且不缓存
        if (bytes.byteLength < MIN_VALID_IMAGE_BYTES) {
            return NextResponse.json(
                { error: 'Upstream returned placeholder image' },
                { status: 502, headers: { 'Cache-Control': 'no-store' } }
            );
        }

        const headers = new Headers();
        headers.set('Content-Type', upstreamType);
        headers.set('Content-Length', String(bytes.byteLength));
        headers.set('X-Image-Cache', cacheState);
        // 边缘缓存 30 天、浏览器 1 天：即使上游某天返回了异常内容，客户端也能较快自我恢复
        headers.set('Cache-Control', 'public, max-age=86400, s-maxage=2592000, stale-while-revalidate=86400');
        // Netlify 缓存 edge function 响应时默认不把 query 计入缓存键，
        // 不声明按 url 变化会导致所有海报命中同一份缓存（全站显示同一张图）。
        headers.set('Netlify-Vary', 'query=url');

        const response = new Response(bytes, {
            status: 200,
            headers,
        });

        if (cache) {
            // 首次回源后写入边缘缓存，后续同节点的请求直接命中。
            // 写入失败不影响本次响应，只会在下次请求时再回源一次。
            try {
                await cache.put(cacheKey, response.clone());
                response.headers.set('X-Image-Cache-Put', 'ok');
            } catch (error) {
                // 把失败原因透出到响应头，便于线上确认 Cache API 是否可用
                response.headers.set(
                    'X-Image-Cache-Put',
                    error instanceof Error ? error.message.slice(0, 80) : 'failed',
                );
            }
        }

        return response;
    }

    // 失败响应一律不可缓存，避免错误状态被浏览器或 Service Worker 记住
    return NextResponse.json({ error: lastError }, { status: lastStatus, headers: { 'Cache-Control': 'no-store' } });
}
