/**
 * 生成 iOS 主屏 PWA 启动图（对角渐变 + 品牌光晕 + 图标 + 文字）。
 *
 * 通过 sharp 把 SVG 光栅化为 PNG：sharp 由 Next.js 的可选依赖提供，
 * 已存在于项目的 node_modules 中，无需额外安装。
 *
 * 用法：npm run splash
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

import {
  APPLE_SPLASH_BRAND_TEXT,
  APPLE_SPLASH_MODES,
  APPLE_SPLASH_PALETTES,
  APPLE_SPLASH_SCREENS,
  getAppleSplashImagePath,
  getAppleSplashPixelSize,
  type AppleSplashMode,
} from '../lib/config/apple-splash';

/** 图标占屏幕短边的比例 */
const ICON_SIZE_RATIO = 0.18;
/** 图标边长上下限（像素），避免大屏上过大、小屏上过小 */
const ICON_MIN_SIZE = 96;
const ICON_MAX_SIZE = 420;
/** 图标圆角半径占比，与 iOS 应用图标外形接近 */
const ICON_CORNER_RATIO = 0.22;
/** 文字字号占图标边长的比例 */
const TEXT_SIZE_RATIO = 0.34;
/** 文字最小字号（像素） */
const TEXT_MIN_SIZE = 22;
/** 图标与文字之间的间距，占图标边长的比例 */
const TEXT_GAP_RATIO = 0.3;
/** 中文字形视觉高度占字号的比例，用于把「图标 + 文字」整体按视觉居中 */
const TEXT_GLYPH_RATIO = 0.88;
/** 文字字距，占字号的比例 */
const TEXT_TRACKING_RATIO = 0.08;
/** 图标投影的模糊半径，占图标边长的比例 */
const SHADOW_BLUR_RATIO = 0.08;

const BRAND_FONT_FAMILY =
  'PingFang SC, Microsoft YaHei, Noto Sans SC, Source Han Sans SC, sans-serif';

/** 转义 XML 特殊字符，避免品牌文字里出现 & < > 时破坏 SVG 结构 */
function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** 按目标尺寸生成一张启动图的 SVG：背景渐变、光晕、图标与文字整体居中 */
function buildSplashSvg(
  width: number,
  height: number,
  mode: AppleSplashMode,
  iconDataUri: string,
): string {
  const palette = APPLE_SPLASH_PALETTES[mode];
  const shortSide = Math.min(width, height);

  const iconSize = Math.round(
    Math.min(ICON_MAX_SIZE, Math.max(ICON_MIN_SIZE, shortSide * ICON_SIZE_RATIO)),
  );
  const fontSize = Math.round(Math.max(TEXT_MIN_SIZE, iconSize * TEXT_SIZE_RATIO));
  const gap = Math.round(iconSize * TEXT_GAP_RATIO);
  const glyphHeight = fontSize * TEXT_GLYPH_RATIO;
  const tracking = fontSize * TEXT_TRACKING_RATIO;

  // 图标与文字作为一组整体垂直居中：以字形实际高度计算，避免文字下方留白导致偏上
  const groupHeight = iconSize + gap + glyphHeight;
  const groupTop = Math.round((height - groupHeight) / 2);
  const iconLeft = Math.round((width - iconSize) / 2);
  const cornerRadius = Math.round(iconSize * ICON_CORNER_RATIO);
  const textBaseline = Math.round(groupTop + iconSize + gap + glyphHeight);
  // text-anchor: middle 会包含末尾字距，向右补偿半个字距让字形真正居中
  const textCenterX = width / 2 + tracking / 2;

  const blur = (iconSize * SHADOW_BLUR_RATIO).toFixed(2);
  const shadowOffset = Math.round(iconSize * 0.045);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="bg" x1="0.1" y1="0" x2="0.9" y2="1">
      <stop offset="0" stop-color="${palette.gradientFrom}"/>
      <stop offset="1" stop-color="${palette.gradientTo}"/>
    </linearGradient>
    <clipPath id="iconClip">
      <rect x="${iconLeft}" y="${groupTop}" width="${iconSize}" height="${iconSize}" rx="${cornerRadius}"/>
    </clipPath>
    <filter id="softShadow" x="-40%" y="-40%" width="180%" height="180%">
      <feGaussianBlur stdDeviation="${blur}"/>
    </filter>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#bg)"/>
  <rect x="${iconLeft}" y="${groupTop + shadowOffset}" width="${iconSize}" height="${iconSize}"
        rx="${cornerRadius}" fill="${palette.shadow}" opacity="${palette.shadowOpacity}"
        filter="url(#softShadow)"/>
  <image href="${iconDataUri}" x="${iconLeft}" y="${groupTop}" width="${iconSize}" height="${iconSize}"
         preserveAspectRatio="xMidYMid meet" clip-path="url(#iconClip)"/>
  <text x="${textCenterX}" y="${textBaseline}" text-anchor="middle"
        font-family="${BRAND_FONT_FAMILY}" font-size="${fontSize}" font-weight="600"
        letter-spacing="${tracking.toFixed(2)}" fill="${palette.text}">${escapeXml(APPLE_SPLASH_BRAND_TEXT)}</text>
</svg>`;
}

async function main() {
  const publicDir = path.join(process.cwd(), 'public');
  const iconBuffer = await readFile(path.join(publicDir, 'icon.png'));
  const iconDataUri = `data:image/png;base64,${iconBuffer.toString('base64')}`;

  const generated = new Map<string, Buffer>();

  for (const mode of APPLE_SPLASH_MODES) {
    for (const screen of APPLE_SPLASH_SCREENS) {
      const href = getAppleSplashImagePath(screen, mode);
      if (generated.has(href)) continue;

      const { width, height } = getAppleSplashPixelSize(screen);
      const svg = buildSplashSvg(width, height, mode, iconDataUri);
      // 保留真彩色：256 色调色板量化会在对角渐变上产生可见的斜向色带，
      // 真彩配合最高压缩等级与自适应行过滤，体积和观感之间更平衡
      const png = await sharp(Buffer.from(svg))
        .png({ compressionLevel: 9, adaptiveFiltering: true, effort: 10 })
        .toBuffer();

      generated.set(href, png);
    }
  }

  const entries = Array.from(generated.entries());
  await Promise.all(
    entries.map(async ([href, buffer]) => {
      const filePath = path.join(publicDir, href);
      await mkdir(path.dirname(filePath), { recursive: true });
      await writeFile(filePath, buffer);
    }),
  );

  const totalBytes = entries.reduce((sum, [, buffer]) => sum + buffer.length, 0);
  console.log(
    `[apple-splash] 已生成 ${entries.length} 张启动图（浅色/深色各 ${entries.length / 2} 张），` +
      `品牌文字「${APPLE_SPLASH_BRAND_TEXT}」，总体积 ${(totalBytes / 1024).toFixed(1)} KB，` +
      '输出目录 public/splash',
  );
}

main().catch((error) => {
  console.error('[apple-splash] 生成失败:', error);
  process.exitCode = 1;
});
