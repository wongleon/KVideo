/**
 * 订阅配置拉取 API
 *
 * 仅用于拉取纯 JSON 的订阅配置（自定义源列表）：不转发 Cookie/Range，不中继媒体流，
 * 因此在不开放 /api/proxy 的托管部署（Cloudflare / Vercel 合规模式）中也可用。
 * 媒体代理仍由 /api/proxy 负责，并保持托管环境下关闭。
 */

import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'edge';

/** 上游请求超时 */
const FETCH_TIMEOUT_MS = 15000;
/** 订阅内容大小上限（字节），避免被当作大文件代理使用 */
const MAX_PAYLOAD_BYTES = 2 * 1024 * 1024;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const BLOCKED_HOSTNAMES = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1', '[::1]']);

/** 拒绝本机与内网地址，避免该端点被当作内网探测跳板 */
function isBlockedHostname(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(host)) return true;
  if (host.endsWith('.local') || host.endsWith('.internal')) return true;

  const v4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const a = Number(v4[1]);
    const b = Number(v4[2]);
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 169 && b === 254) return true;
  }

  return false;
}

function errorResponse(message: string, status: number) {
  return NextResponse.json(
    { error: 'Subscription fetch failed', message },
    { status, headers: CORS_HEADERS }
  );
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(request: NextRequest) {
  const rawUrl = request.nextUrl.searchParams.get('url');

  if (!rawUrl) {
    return errorResponse('缺少 url 参数', 400);
  }

  let target: URL;
  try {
    target = new URL(rawUrl);
  } catch {
    return errorResponse('订阅地址格式错误', 400);
  }

  if (target.protocol !== 'https:' && target.protocol !== 'http:') {
    return errorResponse('仅支持 http/https 订阅地址', 400);
  }

  if (isBlockedHostname(target.hostname)) {
    return errorResponse('不允许访问该地址', 400);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const upstream = await fetch(target.href, {
      headers: {
        Accept: 'application/json, text/plain, */*',
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      },
      redirect: 'follow',
      signal: controller.signal,
    });

    if (!upstream.ok) {
      return errorResponse(`上游返回 ${upstream.status} ${upstream.statusText}`, 502);
    }

    const buffer = await upstream.arrayBuffer();
    if (buffer.byteLength > MAX_PAYLOAD_BYTES) {
      return errorResponse('订阅内容超过 2MB 上限', 413);
    }

    // 去掉 BOM，个别源会带 BOM 导致 JSON.parse 失败
    const text = new TextDecoder().decode(buffer).replace(/^\uFEFF/, '');

    try {
      JSON.parse(text);
    } catch {
      return errorResponse('订阅内容不是合法 JSON', 422);
    }

    return new NextResponse(text, {
      status: 200,
      headers: {
        ...CORS_HEADERS,
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === 'AbortError';
    return errorResponse(timedOut ? '订阅拉取超时' : '订阅拉取失败', timedOut ? 504 : 502);
  } finally {
    clearTimeout(timeoutId);
  }
}
