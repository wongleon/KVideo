import { NextResponse } from 'next/server';
import { buildDoubanImageCandidates } from '@/lib/server/douban-image';

export const runtime = 'edge';

/** 单个镜像的超时：云端到豆瓣 CDN 的链路不稳，超时后立即换下一个镜像 */
const PER_CANDIDATE_TIMEOUT_MS = 3000;
/** 整张图的拉取总预算：镜像串行重试不能无限叠加，超预算直接返回错误，避免拖死整页 */
const TOTAL_BUDGET_MS = 8000;

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
    // Cloudflare 的 caches.default 不在 DOM 标准类型里，这里用结构化类型读取
    const cacheStorage = (globalThis as { caches?: { default?: Cache } }).caches;
    return cacheStorage?.default ?? null;
}

export async function GET(request: Request) {
    const cache = getEdgeCache();

    // 命中边缘缓存直接返回，不再回源
    if (cache) {
        const cached = await cache.match(request);
        if (cached) return cached;
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
            });
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

        const headers = new Headers();
        const contentType = imageResponse.headers.get('content-type');
        if (contentType) {
            headers.set('Content-Type', contentType);
        }
        // URL 中的 ?url= 指向固定图片且带 v=2 版本号，内容不会变化，可长期缓存
        headers.set('Cache-Control', 'public, max-age=15724800, s-maxage=15724800, immutable');
        // Netlify 缓存 edge function 响应时默认不把 query 计入缓存键，
        // 不声明按 url 变化会导致所有海报命中同一份缓存（全站显示同一张图）。
        headers.set('Netlify-Vary', 'query=url');

        const response = new Response(imageResponse.body, {
            status: 200,
            headers,
        });

        if (cache) {
            // 首次回源后写入边缘缓存，后续同节点的请求直接命中。
            // 写入失败不影响本次响应，只会在下次请求时再回源一次。
            try {
                await cache.put(request, response.clone());
            } catch {
                // 忽略缓存写入失败（如客户端提前断开）
            }
        }

        return response;
    }

    return NextResponse.json({ error: lastError }, { status: lastStatus });
}
