import assert from 'node:assert/strict';
import test from 'node:test';

import { GET } from '../../../app/api/douban/image/route';
import { buildDoubanImageCandidates } from '../../../lib/server/douban-image';

// GH-ISSUE: 37,176,179,190; GH-PR: 6,230,231

test('Douban image candidates preserve the path and try reachable mirrors', () => {
  const candidates = buildDoubanImageCandidates(
    'https://img1.doubanio.com/view/photo/s_ratio_poster/public/p123.webp?x=1',
  );

  assert.deepEqual(candidates, [
    'https://img1.doubanio.com/view/photo/s_ratio_poster/public/p123.webp?x=1',
    'https://img9.doubanio.com/view/photo/s_ratio_poster/public/p123.webp?x=1',
    'https://img3.doubanio.com/view/photo/s_ratio_poster/public/p123.webp?x=1',
    'https://img2.doubanio.com/view/photo/s_ratio_poster/public/p123.webp?x=1',
  ]);
});

test('non-Douban and malformed URLs are attempted only once', () => {
  assert.deepEqual(buildDoubanImageCandidates('https://example.com/poster.jpg'), [
    'https://example.com/poster.jpg',
  ]);
  assert.deepEqual(buildDoubanImageCandidates('not a url'), ['not a url']);
});

test('image proxy falls back after a mirror network failure', async (context) => {
  const requested: string[] = [];
  const validImage = 'x'.repeat(9000);

  context.mock.method(globalThis, 'fetch', async (input: string | URL | Request) => {
    const url = input.toString();
    requested.push(url);

    if (url.includes('img1.doubanio.com')) {
      throw new TypeError('fetch failed');
    }

    return new Response(validImage, {
      status: 200,
      headers: { 'content-type': 'image/webp' },
    });
  });

  const target = encodeURIComponent('https://img1.doubanio.com/poster.webp');
  const response = await GET(new Request(`https://kvideo.test/api/douban/image?url=${target}`));

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'image/webp');
  assert.equal((await response.text()).length, validImage.length);
  assert.deepEqual(requested, [
    'https://img1.doubanio.com/poster.webp',
    'https://img9.doubanio.com/poster.webp',
  ]);
});

test('placeholder image from upstream is rejected and never cached', async (context) => {
  context.mock.method(globalThis, 'fetch', async () =>
    new Response('x'.repeat(100), {
      status: 200,
      headers: { 'content-type': 'image/jpeg' },
    }),
  );

  const target = encodeURIComponent('https://img3.doubanio.com/poster.jpg');
  const response = await GET(new Request(`https://kvideo.test/api/douban/image?url=${target}`));

  // 豆瓣占位图体积过小，必须按失败处理，且响应不可缓存免得错误内容长期固化
  assert.equal(response.status, 502);
  assert.equal(response.headers.get('cache-control'), 'no-store');
});
