import { NextResponse } from 'next/server';

export const runtime = 'edge';

/** 量子资源采集接口（苹果CMS v10） */
const SOURCE_URL = 'https://cj.lziapi.com/api.php/provide/vod/';

/**
 * 首页支持的采集站分类：短剧与 AI 漫剧是量子资源的独立分类，
 * 国漫对应「国产动漫」，三者共用同一套列表 / 分页 / 缓存逻辑。
 * type_id 在上游调整分类时可能变化，首页为空时会按 match 正则重新探测兜底。
 */
const CATEGORY_CONFIG = {
  'short-drama': { typeId: '46', match: /短剧|微短/ },
  'ai-comic': { typeId: '52', match: /AI\s*漫剧|AI\s*短剧|漫剧/i },
  guoman: { typeId: '29', match: /国产动漫|国漫/ },
} as const;

type ShortDramaCategory = keyof typeof CATEGORY_CONFIG;
/** 上游请求超时：采集站偶发挂起，超时后快速失败并交由前端重试 */
const UPSTREAM_TIMEOUT_MS = 8000;
/** 上游最多尝试次数（含首次）：采集站在边缘节点偶发连接中断，重试一次可显著降低失败率 */
const MAX_ATTEMPTS = 2;
/** 两次尝试之间的间隔 */
const RETRY_DELAY_MS = 400;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface SourceVodItem {
  vod_id?: number | string;
  vod_name?: string;
  vod_pic?: string;
}

interface SourceListResponse {
  list?: SourceVodItem[];
  pagecount?: number;
}

/** 请求上游接口并解析 JSON：网络异常与 5xx 视为暂时性失败，重试一次 */
async function fetchUpstream(url: string): Promise<SourceListResponse> {
  let lastError: unknown = new Error('Source API request failed');

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        },
      });

      if (response.status >= 500 && attempt < MAX_ATTEMPTS) {
        await delay(RETRY_DELAY_MS);
        continue;
      }

      if (!response.ok) {
        throw new Error(`Source API returned ${response.status}`);
      }

      return (await response.json()) as SourceListResponse;
    } catch (error) {
      lastError = error;
      if (attempt < MAX_ATTEMPTS) {
        await delay(RETRY_DELAY_MS);
      }
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError;
}

/** 按分类 ID 拉取一页短剧列表 */
function fetchShortDramaPage(typeId: string, page: number): Promise<SourceListResponse> {
  return fetchUpstream(`${SOURCE_URL}?ac=detail&t=${typeId}&pg=${page}`);
}

/** 从分类列表中探测分类 ID，避免上游改 ID 后标签持续空列表 */
async function detectTypeId(match: RegExp): Promise<string | null> {
  const data = (await fetchUpstream(`${SOURCE_URL}?ac=list`)) as SourceListResponse & {
    class?: Array<{ type_id: number | string; type_name: string }>;
  };
  const matched = (data.class || []).find((item) => match.test(String(item.type_name || '')));
  return matched ? String(matched.type_id) : null;
}

/** 只接受已知分类，其余参数一律回落到真人短剧 */
function resolveCategory(value: string | null): ShortDramaCategory {
  return value === 'ai-comic' || value === 'guoman' ? value : 'short-drama';
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const pageParam = parseInt(searchParams.get('page') || '1', 10);
  const page = Number.isFinite(pageParam) && pageParam > 0 ? pageParam : 1;
  const category = resolveCategory(searchParams.get('category'));
  const { typeId, match } = CATEGORY_CONFIG[category];

  try {
    let data = await fetchShortDramaPage(typeId, page);

    // 仅首页空结果时探测分类 ID：分页阶段的空页是正常的「到底了」信号，不该再回源
    if (page === 1 && (data.list || []).length === 0) {
      const detectedTypeId = await detectTypeId(match);
      if (detectedTypeId && detectedTypeId !== typeId) {
        data = await fetchShortDramaPage(detectedTypeId, page);
      }
    }

    const subjects = (data.list || [])
      // 少数条目缺少标题或 ID，直接跳过，避免列表出现不可点击的空卡片
      .filter((item) => item.vod_id != null && item.vod_name)
      .map((item) => ({
        id: String(item.vod_id),
        title: String(item.vod_name),
        // 采集站封面大多可直连；缺失时交给占位图，避免 Image 组件拿到空 src
        cover: item.vod_pic || '/placeholder-poster.svg',
        // 短剧没有豆瓣评分，留空后卡片与横向大卡都不会显示评分角标
        rate: '',
        url: '',
      }));

    return NextResponse.json(
      { subjects, page, hasMore: subjects.length > 0 },
      {
        headers: {
          // 采集站内容按更新时间倒序，短时缓存可显著降低上游压力
          'Cache-Control': subjects.length
            ? 'public, max-age=300, s-maxage=1800, stale-while-revalidate=600'
            : 'no-store',
          // query 参与 CDN 缓存键，避免不同页码互相串位
          'Netlify-Vary': 'query',
        },
      }
    );
  } catch (error) {
    console.error('Short drama API error:', error);
    // 503 + retryable：与「确实没有数据」区分开，前端据此保留分页状态并稍后重试
    return NextResponse.json(
      { subjects: [], error: 'Failed to fetch short drama', retryable: true },
      {
        status: 503,
        headers: { 'Cache-Control': 'no-store', 'Retry-After': '5' },
      }
    );
  }
}
