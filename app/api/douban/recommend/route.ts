import { NextResponse } from 'next/server';

export const runtime = 'edge';

/** 单次上游请求超时：豆瓣在部分边缘节点会挂起数十秒，缩短超时后重试，避免整页长时间等待 */
const UPSTREAM_TIMEOUT_MS = 4000;
/** 上游最多尝试次数（含首次） */
const MAX_ATTEMPTS = 2;
/** 两次尝试之间的间隔 */
const RETRY_DELAY_MS = 400;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 请求豆瓣接口：网络异常与 5xx 视为暂时性失败，重试一次 */
async function fetchUpstream(url: string): Promise<Response> {
  let lastError: unknown = new Error('Douban API request failed');

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          'Referer': 'https://movie.douban.com/',
        },
        signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      });

      if (response.status >= 500 && attempt < MAX_ATTEMPTS) {
        await delay(RETRY_DELAY_MS);
        continue;
      }

      return response;
    } catch (error) {
      lastError = error;
      if (attempt < MAX_ATTEMPTS) {
        await delay(RETRY_DELAY_MS);
      }
    }
  }

  throw lastError;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const tag = searchParams.get('tag') || '热门';
  const pageLimit = searchParams.get('page_limit') || '20';
  const pageStart = searchParams.get('page_start') || '0';
  const type = searchParams.get('type') || 'movie'; // movie or tv

  try {
    const url = `https://movie.douban.com/j/search_subjects?type=${type}&tag=${encodeURIComponent(tag)}&sort=recommend&page_limit=${pageLimit}&page_start=${pageStart}`;

    // 不再使用 cf.cacheEverything：同一上游 URL 的请求在边缘节点合并后，
    // 一次挂起会把后续同 URL 请求一起拖到超时，反而放大了故障
    const response = await fetchUpstream(url);

    if (!response.ok) {
      throw new Error(`Douban API returned ${response.status}`);
    }

    const data = await response.json();
    const subjects = Array.isArray(data.subjects) ? data.subjects : [];
    const hasSubjects = subjects.length > 0;

    // 转换图片链接使用代理
    if (hasSubjects) {
      data.subjects = subjects.map((item: Record<string, unknown>) => ({
        ...item,
        // v=2 用于绕过此前被错误缓存（同一张图）的浏览器缓存
        cover:
          typeof item.cover === 'string'
            ? `/api/douban/image?v=2&url=${encodeURIComponent(item.cover)}`
            : item.cover,
      }));
    }

    return NextResponse.json(data, {
      headers: {
        // 允许 CDN 与浏览器缓存以提升首屏速度；同时声明 query 参与缓存键，
        // 避免不同标签共用同一份缓存导致数据串位。
        // 空结果（多为豆瓣限流/抖动）不缓存，否则一次失败会让该标签持续显示「暂无内容」
        'Cache-Control': hasSubjects
          ? 'public, max-age=300, s-maxage=86400, stale-while-revalidate=3600'
          : 'no-store',
        'Netlify-Vary': 'query',
      },
    });
  } catch (error) {
    console.error('Douban API error:', error);
    // 503 + retryable：与「确实没有数据」区分开，前端据此保留分页状态并在稍后重试
    return NextResponse.json(
      { subjects: [], error: 'Failed to fetch recommendations', retryable: true },
      {
        status: 503,
        headers: { 'Cache-Control': 'no-store', 'Retry-After': '5' },
      }
    );
  }
}
