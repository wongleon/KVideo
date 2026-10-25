import fs from 'fs';
import path from 'path';

export const DEFAULT_SITE_ICON_PATH = '/icon.png';
// iOS 主屏幕图标需要固定尺寸且可直接下载的 PNG，统一指向预生成的 180x180 静态资源
export const DEFAULT_APPLE_TOUCH_ICON_PATH = '/apple-touch-icon.png';
const LEGACY_SITE_ICON_ROUTE = '/api/site-icon';

function getMimeType(filePath: string): string {
  switch (path.extname(filePath).toLowerCase()) {
    case '.avif':
      return 'image/avif';
    case '.gif':
      return 'image/gif';
    case '.ico':
      return 'image/x-icon';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.png':
      return 'image/png';
    case '.svg':
      return 'image/svg+xml';
    case '.webp':
      return 'image/webp';
    default:
      return 'application/octet-stream';
  }
}

function getIconFileCandidates(filePath: string): string[] {
  if (path.isAbsolute(filePath)) {
    return [filePath];
  }

  const currentWorkingDirectory = process.cwd();
  const candidates = [path.join(currentWorkingDirectory, filePath)];
  const standaloneSuffix = `${path.sep}.next${path.sep}standalone`;

  if (currentWorkingDirectory.endsWith(standaloneSuffix)) {
    candidates.push(path.resolve(currentWorkingDirectory, '..', '..', filePath));
  }

  return [...new Set(candidates)];
}

function normalizeIconUrl(iconUrl?: string | null): string | null {
  const value = iconUrl?.trim();

  if (!value) {
    return null;
  }

  if (value === LEGACY_SITE_ICON_ROUTE) {
    console.warn('[SiteIcon] Ignoring legacy /api/site-icon path.');
    return null;
  }

  return value;
}

async function resolveIconFileAsDataUrl(iconFile: string): Promise<string | null> {
  const resolvedFilePaths = getIconFileCandidates(iconFile);
  let lastError: unknown = null;

  for (const resolvedFilePath of resolvedFilePaths) {
    try {
      const fileBuffer = await fs.promises.readFile(resolvedFilePath);
      const mimeType = getMimeType(resolvedFilePath);
      return `data:${mimeType};base64,${fileBuffer.toString('base64')}`;
    } catch (error) {
      lastError = error;
    }
  }

  console.warn(
    `[SiteIcon] Failed to read SITE_ICON_FILE from any supported path: ${resolvedFilePaths.join(', ')}`,
    lastError,
  );
  return null;
}

export async function resolveSiteIconSrc(): Promise<string> {
  const resolvedRuntimeIcon = normalizeIconUrl(process.env.SITE_ICON_RESOLVED_URL);
  if (resolvedRuntimeIcon) {
    return resolvedRuntimeIcon;
  }

  const runtimeIconUrl = normalizeIconUrl(
    process.env.SITE_ICON_URL?.trim() || process.env.NEXT_PUBLIC_SITE_ICON_URL?.trim(),
  );
  if (runtimeIconUrl) {
    return runtimeIconUrl;
  }

  const iconFile = process.env.SITE_ICON_FILE?.trim();
  if (iconFile) {
    const dataUrl = await resolveIconFileAsDataUrl(iconFile);
    if (dataUrl) {
      return dataUrl;
    }
  }

  return DEFAULT_SITE_ICON_PATH;
}

/**
 * 解析 iOS「添加到主屏幕」使用的图标地址。
 * data URL / SVG / 本地文件无法被 iOS 直接用作主屏幕图标（会触发多次探测导致取图缓慢），
 * 因此只有可直接访问的 PNG 地址才复用，其余场景统一回落到预生成的 180x180 静态图标。
 */
export async function resolveAppleTouchIconSrc(): Promise<string> {
  const candidate = normalizeIconUrl(
    process.env.SITE_ICON_RESOLVED_URL ||
      process.env.SITE_ICON_URL?.trim() ||
      process.env.NEXT_PUBLIC_SITE_ICON_URL?.trim(),
  );

  if (candidate && !candidate.startsWith('data:') && /\.png(\?.*)?$/i.test(candidate)) {
    return candidate;
  }

  return DEFAULT_APPLE_TOUCH_ICON_PATH;
}
