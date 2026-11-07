/**
 * iOS 主屏 PWA 启动图配置。
 *
 * 启动图分浅色 / 深色两套：对角渐变背景 + 品牌色光晕，
 * 中央为「图标 + 小视界」的整体居中组合。
 * 这样 iOS 冷启动的启动屏与页面首帧之间既不会出现颜色跳变，
 * 也不会是一片空白。
 */

export type AppleSplashMode = 'light' | 'dark';

/**
 * 生成与注入时遍历的模式顺序。
 * 深色排在最前：iOS 的 WebClip 启动图在安装时选定并缓存，且不解析
 * `prefers-color-scheme`，只有不带该条件的「深色」会真正命中。
 */
export const APPLE_SPLASH_MODES: AppleSplashMode[] = ['dark', 'light'];

/** 启动图中央的品牌文字 */
export const APPLE_SPLASH_BRAND_TEXT = '小视界';

export interface AppleSplashPalette {
  /** 对角渐变起点（左上） */
  gradientFrom: string;
  /** 对角渐变终点（右下） */
  gradientTo: string;
  /** 品牌文字颜色 */
  text: string;
  /** 图标投影颜色 */
  shadow: string;
  /** 图标投影不透明度 */
  shadowOpacity: number;
}

/**
 * 各模式的配色。
 * - 浅色：围绕 `--bg-color-light` (#f2f4f7) 的白→浅灰蓝对角渐变。
 * - 深色：围绕 `--bg-color-dark` (#121212) 的深灰蓝对角渐变。
 * 只用单层线性渐变，颜色沿同一方向均匀过渡，压缩后不会有同心环色带。
 */
export const APPLE_SPLASH_PALETTES: Record<AppleSplashMode, AppleSplashPalette> = {
  light: {
    gradientFrom: '#ffffff',
    gradientTo: '#cbd7e8',
    text: '#1d1d1f',
    shadow: '#0b1220',
    shadowOpacity: 0.18,
  },
  dark: {
    gradientFrom: '#2b2f38',
    gradientTo: '#060708',
    text: '#f5f5f7',
    shadow: '#000000',
    shadowOpacity: 0.5,
  },
};

export interface AppleSplashScreen {
  /** 逻辑宽度（CSS px） */
  width: number;
  /** 逻辑高度（CSS px） */
  height: number;
  /** 设备像素比 */
  ratio: number;
  orientation: 'portrait' | 'landscape';
}

// 只保留主流设备尺寸：iPhone 竖屏 + iPad 竖屏。
// 去掉 iPad 横屏与 320×568 / 414×736@3 等老旧机型，
// 未覆盖的设备会命中浅色兜底，不至于在 iOS 白屏。
const IPHONE_PORTRAIT: AppleSplashScreen[] = [
  { width: 375, height: 667, ratio: 2, orientation: 'portrait' },
  { width: 414, height: 896, ratio: 2, orientation: 'portrait' },
  { width: 375, height: 812, ratio: 3, orientation: 'portrait' },
  { width: 390, height: 844, ratio: 3, orientation: 'portrait' },
  { width: 393, height: 852, ratio: 3, orientation: 'portrait' },
  { width: 402, height: 874, ratio: 3, orientation: 'portrait' },
  { width: 414, height: 896, ratio: 3, orientation: 'portrait' },
  { width: 428, height: 926, ratio: 3, orientation: 'portrait' },
  { width: 430, height: 932, ratio: 3, orientation: 'portrait' },
  { width: 440, height: 956, ratio: 3, orientation: 'portrait' },
];

const IPAD_PORTRAIT: AppleSplashScreen[] = [
  { width: 768, height: 1024, ratio: 2, orientation: 'portrait' },
  { width: 810, height: 1080, ratio: 2, orientation: 'portrait' },
  { width: 820, height: 1180, ratio: 2, orientation: 'portrait' },
  { width: 834, height: 1112, ratio: 2, orientation: 'portrait' },
  { width: 834, height: 1194, ratio: 2, orientation: 'portrait' },
  { width: 1024, height: 1366, ratio: 2, orientation: 'portrait' },
];

export const APPLE_SPLASH_SCREENS: AppleSplashScreen[] = [...IPHONE_PORTRAIT, ...IPAD_PORTRAIT];

/** 启动图的像素尺寸（宽 × 高） */
export function getAppleSplashPixelSize(screen: AppleSplashScreen): { width: number; height: number } {
  return {
    width: screen.width * screen.ratio,
    height: screen.height * screen.ratio,
  };
}

/** 启动图文件路径，由模式与像素尺寸共同决定，避免不同设备/配色重名 */
export function getAppleSplashImagePath(screen: AppleSplashScreen, mode: AppleSplashMode): string {
  const { width, height } = getAppleSplashPixelSize(screen);
  return `/splash/apple-splash-${mode}-${width}x${height}.png`;
}

/**
 * iOS 匹配启动图所需的媒体查询。
 *
 * 深色不附加 `prefers-color-scheme`：iOS 的 WebClip 启动图是在「添加到主屏幕」
 * 时抓取并缓存的，既不解析配色查询、也不会在系统切换深浅色后重新挑选，
 * 因此这条无条件的链接是唯一实际生效的兜底。
 * 浅色额外附加 `(prefers-color-scheme: light)`，仅对未来可能支持该特性的平台生效。
 */
export function getAppleSplashMedia(screen: AppleSplashScreen, mode: AppleSplashMode): string {
  const conditions = [
    'screen',
    `(device-width: ${screen.width}px)`,
    `(device-height: ${screen.height}px)`,
    `(-webkit-device-pixel-ratio: ${screen.ratio})`,
    `(orientation: ${screen.orientation})`,
  ];

  if (mode === 'light') {
    conditions.push('(prefers-color-scheme: light)');
  }

  return conditions.join(' and ');
}
