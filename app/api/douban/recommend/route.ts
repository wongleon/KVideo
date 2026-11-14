import { NextResponse } from 'next/server';

export const runtime = 'edge';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const tag = searchParams.get('tag') || '热门';
  const pageLimit = searchParams.get('page_limit') || '20';
  const pageStart = searchParams.get('page_start') || '0';
  const type = searchParams.get('type') || 'movie'; // movie or tv

  try {
    const url = `https://movie.douban.com/j/search_subjects?type=${type}&tag=${encodeURIComponent(tag)}&sort=recommend&page_limit=${pageLimit}&page_start=${pageStart}`;

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Referer': 'https://movie.douban.com/',
      },
      // 豆瓣上游在部分边缘节点会挂起数十秒，超时后快速失败，避免首页内容长时间空白
      signal: AbortSignal.timeout(8000),
      // Cloudflare 边缘缓存上游响应（Node 自托管会忽略该字段）。
      // next.revalidate 依赖 Vercel 的 ISR，在 Pages/Workers 运行时不会生效。
      cf: { cacheEverything: true, cacheTtl: 86400 },
    } as RequestInit & { cf: { cacheEverything: boolean; cacheTtl: number } });

    if (!response.ok) {
      throw new Error(`Douban API returned ${response.status}`);
    }

    const data = await response.json();

    // 转换图片链接使用代理
    if (data.subjects && Array.isArray(data.subjects)) {
      data.subjects = data.subjects.map((item: any) => ({
        ...item,
        // v=2 用于绕过此前被错误缓存（同一张图）的浏览器缓存
        cover: item.cover ? `/api/douban/image?v=2&url=${encodeURIComponent(item.cover)}` : item.cover,
      }));
    }

    return NextResponse.json(data, {
      headers: {
        // 允许 CDN 与浏览器缓存以提升首屏速度；同时声明 query 参与缓存键，
        // 避免不同标签共用同一份缓存导致数据串位
        'Cache-Control': 'public, max-age=300, s-maxage=86400, stale-while-revalidate=3600',
        'Netlify-Vary': 'query',
      },
    });
  } catch (error) {
    console.error('Douban API error:', error);
    return NextResponse.json(
      { subjects: [], error: 'Failed to fetch recommendations' },
      { status: 500 }
    );
  }
}
