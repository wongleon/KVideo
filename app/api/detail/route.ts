/**
 * Detail API Route
 * Fetches video details including episodes and M3U8 URLs with automatic source validation
 */

import { NextRequest, NextResponse } from 'next/server';
import { getVideoDetail } from '@/lib/api/client';
import { getSourceById } from '@/lib/api/video-sources';

export const runtime = 'edge';

/**
 * 详情短期缓存
 *
 * 详情接口每次都要回源采集站，是进入播放页最慢的一环。
 * 60 秒内重复进入同一部影片（切换到播放页再返回、刷新、多标签）直接复用结果。
 * 详情不含用户数据，可以安全共享；短 TTL 保证剧集更新仍能及时拿到。
 */
const DETAIL_CACHE_TTL_MS = 60 * 1000;
const DETAIL_CACHE_LIMIT = 100;
const detailCache = new Map<string, { data: unknown; expiresAt: number }>();

function getDetailCacheKey(id: string, sourceConfig: { id?: string; name?: string; api?: string }) {
  const sourceKey = sourceConfig?.id || sourceConfig?.name || sourceConfig?.api || 'unknown';
  return `${sourceKey}:${id}`;
}

function readDetailCache(key: string): unknown | null {
  const hit = detailCache.get(key);
  if (!hit) return null;
  if (hit.expiresAt <= Date.now()) {
    detailCache.delete(key);
    return null;
  }
  return hit.data;
}

function writeDetailCache(key: string, data: unknown): void {
  if (detailCache.size >= DETAIL_CACHE_LIMIT) {
    const oldestKey = detailCache.keys().next().value;
    if (oldestKey) detailCache.delete(oldestKey);
  }
  detailCache.set(key, { data, expiresAt: Date.now() + DETAIL_CACHE_TTL_MS });
}

/**
 * Shared handler for fetching video details
 */
async function handleDetailRequest(id: string | null, source: string | null, method: string) {
  // Validate input
  if (!id) {
    return NextResponse.json(
      { error: 'Missing video ID parameter' },
      { status: 400 }
    );
  }

  // Validate source
  if (!source) {
    return NextResponse.json(
      { error: 'Missing source parameter' },
      { status: 400 }
    );
  }

  let sourceConfig;

  // If source is an object (from POST), use it
  if (typeof source === 'object') {
    sourceConfig = source;
  } else {
    // If source is a string ID (from GET), try to look it up
    sourceConfig = getSourceById(source);
  }

  if (!sourceConfig) {
    return NextResponse.json(
      { error: 'Invalid source configuration' },
      { status: 400 }
    );
  }

  const cacheKey = getDetailCacheKey(id, sourceConfig as { id?: string; name?: string; api?: string });
  const cached = readDetailCache(cacheKey);
  if (cached) {
    return NextResponse.json(
      { success: true, data: cached },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
          'X-Detail-Cache': 'HIT',
        },
      }
    );
  }

  // Fetch video detail without validation (already validated during search)
  try {
    const videoDetail = await getVideoDetail(id, sourceConfig);

    // Skip validation - videos are already checked during search
    // Just return the episodes as-is
    writeDetailCache(cacheKey, videoDetail);

    return NextResponse.json(
      {
        success: true,
        data: videoDetail,
      },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
          'X-Detail-Cache': 'MISS',
        },
      }
    );
  } catch (error) {
    console.error('Detail API error:', error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch video detail',
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const id = searchParams.get('id');
    const source = searchParams.get('source');

    return await handleDetailRequest(id, source, 'GET');
  } catch (error) {
    console.error('Detail API error:', error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}

// Support POST method for complex requests
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, source } = body;

    return await handleDetailRequest(id, source, 'POST');
  } catch (error) {
    console.error('Detail API error:', error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}
