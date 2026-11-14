import { NextResponse } from 'next/server';

export const runtime = 'edge';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'movie'; // movie or tv

    try {
        const url = `https://movie.douban.com/j/search_tags?type=${type}&source=index`;

        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
                'Referer': 'https://movie.douban.com/',
            },
            // 豆瓣上游在部分边缘节点会挂起数十秒，超时后快速失败
            signal: AbortSignal.timeout(8000),
            // Cloudflare 边缘缓存上游响应（Node 自托管会忽略该字段）
            cf: { cacheEverything: true, cacheTtl: 86400 },
        } as RequestInit & { cf: { cacheEverything: boolean; cacheTtl: number } });

        if (!response.ok) {
            throw new Error(`Douban API returned ${response.status}`);
        }

        const data = await response.json();
        return NextResponse.json(data);
    } catch (error) {
        console.error('Douban Tags API error:', error);
        return NextResponse.json(
            { tags: [], error: 'Failed to fetch tags' },
            { status: 500 }
        );
    }
}
