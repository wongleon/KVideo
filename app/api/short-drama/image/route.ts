import { NextResponse } from 'next/server';

export const runtime = 'edge';

/**
 * 采集站封面代理
 *
 * 采集站（量子资源）的图片托管在 p.lztutu.com 等第三方 CDN 上，
 * 这些域名在部分网络（尤其是国内直连）经常不可达，导致首页短剧 / AI漫剧 / 国漫
 * 列表只有文字、海报全部加载失败。这里统一由边缘节点回源并缓存，图片始终走同源域名。
 */

/** 上游图片超时：图床偶发挂起，超时后快速失败，由前端兜底为占位图 */
const UPSTREAM_TIMEOUT_MS = 10000;
/** 允许透传的最大体积，超过视为异常响应直接拒绝（正常海报远小于该值） */
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;

/** 部分图床对非浏览器 UA / 空 Referer 返回 403，这里模拟普通浏览器请求 */
const REQUEST_HEADERS = {
    'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
};

/**
 * 取 Cloudflare 边缘缓存。
 * 与豆瓣图片代理一致：Pages Functions 的响应不会自动进入边缘缓存，
 * 需要显式读写 Cache API，否则每次请求都要跨网回源图床。
 */
function getEdgeCache(): Cache | null {
    try {
        const cacheStorage = (globalThis as { caches?: { default?: Cache } }).caches;
        return cacheStorage?.default ?? null;
    } catch {
        return null;
    }
}

/**
 * 只允许代理公网 HTTP(S) 图片地址：
 * 纯 IP / IPv6 / localhost / 内网域名一律拒绝，避免接口被当作任意请求的跳板。
 */
function isPublicHttpUrl(url: URL): boolean {
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;

    const host = url.hostname.toLowerCase();
    // 纯 IPv4、IPv6（带冒号或方括号）直接拒绝：采集站图片均使用域名
    if (/^\d+(\.\d+){3}$/.test(host) || host.includes(':') || host.startsWith('[')) return false;
    if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) return false;

    return true;
}

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const rawUrl = searchParams.get('url');

    if (!rawUrl) {
        return NextResponse.json({ error: 'Missing image URL' }, { status: 400 });
    }

    let target: URL;
    try {
        target = new URL(rawUrl);
    } catch {
        return NextResponse.json({ error: 'Invalid image URL' }, { status: 400 });
    }

    if (!isPublicHttpUrl(target)) {
        return NextResponse.json({ error: 'Image URL is not allowed' }, { status: 400 });
    }

    const cache = getEdgeCache();
    const cacheKey = new Request(request.url, { method: 'GET' });

    if (cache) {
        try {
            const cached = await cache.match(cacheKey);
            if (cached) {
                const headers = new Headers(cached.headers);
                headers.set('X-Image-Cache', 'hit');
                return new Response(cached.body, { status: cached.status, headers });
            }
        } catch (error) {
            console.error('[ShortDramaImage] cache.match failed:', error);
        }
    }

    try {
        const upstream = await fetch(target.toString(), {
            headers: REQUEST_HEADERS,
            signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
            // 命中 Cloudflare 数据中心的图床缓存，减少跨网回源
            cf: { cacheEverything: true, cacheTtl: 2592000 },
        } as RequestInit & { cf: { cacheEverything: boolean; cacheTtl: number } });

        if (!upstream.ok || !upstream.body) {
            return NextResponse.json(
                { error: `Upstream returned ${upstream.status}` },
                { status: 502, headers: { 'Cache-Control': 'no-store' } }
            );
        }

        const contentType = upstream.headers.get('content-type') || '';
        // 上游被拦截时可能回吐 HTML，这类响应不能当作图片
        if (!contentType.startsWith('image/')) {
            return NextResponse.json(
                { error: 'Upstream did not return an image' },
                { status: 502, headers: { 'Cache-Control': 'no-store' } }
            );
        }

        const contentLength = Number(upstream.headers.get('content-length') || 0);
        if (contentLength > MAX_IMAGE_BYTES) {
            return NextResponse.json(
                { error: 'Image is too large' },
                { status: 502, headers: { 'Cache-Control': 'no-store' } }
            );
        }

        const headers = new Headers();
        headers.set('Content-Type', contentType);
        headers.set('X-Image-Cache', cache ? 'miss' : 'off');
        // 采集站封面内容不会原地变化，边缘缓存 30 天、浏览器 1 天
        headers.set('Cache-Control', 'public, max-age=86400, s-maxage=2592000, stale-while-revalidate=86400');
        // Netlify 默认不把 query 计入边缘缓存键，不声明会让不同海报互相串图
        headers.set('Netlify-Vary', 'query=url');

        const response = new Response(upstream.body, { status: 200, headers });

        if (cache) {
            try {
                await cache.put(cacheKey, response.clone());
            } catch (error) {
                // 写入失败不影响本次响应，下次请求重新回源
                console.error('[ShortDramaImage] cache.put failed:', error);
            }
        }

        return response;
    } catch (error) {
        console.error('[ShortDramaImage] fetch failed:', error);
        return NextResponse.json(
            { error: 'Failed to fetch image' },
            { status: 502, headers: { 'Cache-Control': 'no-store' } }
        );
    }
}
