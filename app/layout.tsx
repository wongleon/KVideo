import React from 'react';
import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "@/components/ThemeProvider";
import { AutoSync } from '@/components/AutoSync'; // <-- 引入了自动同步组件
import { SiteIconProvider } from '@/components/SiteIconProvider';
import { TVProvider } from "@/lib/contexts/TVContext";
import { TVNavigationInitializer } from "@/components/TVNavigationInitializer";
import { Analytics } from "@vercel/analytics/react";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
import { PasswordGate } from "@/components/PasswordGate";
import { siteConfig } from "@/lib/config/site-config";
import { AdKeywordsInjector } from "@/components/AdKeywordsInjector";
import { BackToTop } from "@/components/ui/BackToTop";
import { ScrollPositionManager } from "@/components/ScrollPositionManager";
import { BottomNav } from "@/components/layout/BottomNav";
import { LocaleProvider } from "@/components/LocaleProvider";
import { RuntimeFeaturesProvider } from "@/components/RuntimeFeaturesProvider";
import { VideoTogetherController } from '@/components/VideoTogetherController';
import { shouldEnableVercelAnalytics } from '@/lib/config/deployment';
import { getRuntimeFeatures } from "@/lib/server/runtime-features";
import { getRuntimeEnvValue } from "@/lib/server/runtime-env";
import {
  APPLE_SPLASH_MODES,
  APPLE_SPLASH_SCREENS,
  getAppleSplashImagePath,
  getAppleSplashMedia,
} from "@/lib/config/apple-splash";
import { resolveAppleTouchIconSrc, resolveSiteIconSrc } from '@/lib/server/site-icon';
import fs from 'fs';
import path from 'path';

const DEFAULT_VIDEOTOGETHER_SCRIPT_URL =
  'https://fastly.jsdelivr.net/gh/VideoTogether/VideoTogether@latest/release/extension.website.user.js';

// Server Component specifically for reading env/file (async for best practices)
async function AdKeywordsWrapper() {
  let keywords: string[] = [];

  try {
    // 1. Try reading from file (Docker runtime support)
    const keywordsFile = process.env.AD_KEYWORDS_FILE;
    if (keywordsFile) {
      // Resolve absolute path or relative to CWD
      const filePath = path.isAbsolute(keywordsFile)
        ? keywordsFile
        : path.join(process.cwd(), keywordsFile);

      try {
        const content = await fs.promises.readFile(filePath, 'utf-8');
        keywords = content.split(/[\n,]/).map((k: string) => k.trim()).filter((k: string) => k);
        console.log(`[AdFilter] Loaded ${keywords.length} keywords from file: ${filePath}`);
      } catch (fileError: unknown) {
        // Handle file not found (ENOENT) gracefully
        if ((fileError as NodeJS.ErrnoException).code !== 'ENOENT') {
          console.warn('[AdFilter] Error reading keywords file:', fileError);
        }
      }
    }

    // 2. Fallback to Env var (Runtime or Build time)
    if (keywords.length === 0) {
      const envKeywords = process.env.AD_KEYWORDS || process.env.NEXT_PUBLIC_AD_KEYWORDS;
      if (envKeywords) {
        keywords = envKeywords.split(/[\n,]/).map((k: string) => k.trim()).filter((k: string) => k);
      }
    }
  } catch (error) {
    console.warn('[AdFilter] Failed to load keywords:', error);
  }

  return <AdKeywordsInjector keywords={keywords} />;
}

export async function generateMetadata(): Promise<Metadata> {
  const siteIconSrc = await resolveSiteIconSrc();
  const appleTouchIconSrc = await resolveAppleTouchIconSrc();

  return {
    title: siteConfig.title,
    description: siteConfig.description,
    icons: {
      icon: siteIconSrc,
      // 明确声明 180x180，避免 iOS 反复探测尺寸而拖慢「添加到主屏幕」
      apple: [{ url: appleTouchIconSrc, sizes: '180x180', type: 'image/png' }],
    },
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const siteIconSrc = await resolveSiteIconSrc();
  const runtimeFeatures = getRuntimeFeatures();
  // 服务端判定是否需要鉴权：无需鉴权时首屏直接渲染页面内容，避免整页白屏。
  // 使用 getRuntimeEnvValue 与 /api/auth 的读取方式保持一致（Cloudflare 下变量在请求上下文中）。
  const hasAuth = !!(
    getRuntimeEnvValue('ADMIN_PASSWORD') ||
    getRuntimeEnvValue('ACCESS_PASSWORD') ||
    getRuntimeEnvValue('ACCOUNTS') ||
    (
      getRuntimeEnvValue('AUTH_SECRET') &&
      getRuntimeEnvValue('UPSTASH_REDIS_REST_URL') &&
      getRuntimeEnvValue('UPSTASH_REDIS_REST_TOKEN')
    )
  );
  const videoTogetherScriptUrl =
    process.env.VIDEOTOGETHER_SCRIPT_URL?.trim() || DEFAULT_VIDEOTOGETHER_SCRIPT_URL;
  const videoTogetherSettingUrl = process.env.VIDEOTOGETHER_SETTING_URL?.trim();
  const videoTogetherEnvEnabled = process.env.VIDEOTOGETHER_ENABLED !== 'false';
  const vercelAnalyticsEnabled = shouldEnableVercelAnalytics();

  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        {/* PWA Manifest */}
        <link rel="manifest" href="/manifest.json" />
        {/* iOS 主屏启动图：渐变背景 + 站点图标。
            iOS 的 WebClip 启动图在「添加到主屏幕」时抓取并缓存，且不解析
            prefers-color-scheme，因此深色那张（不带查询条件）才是实际命中的兜底；
            浅色那张追加配色查询，仅对未来可能支持该特性的平台生效。 */}
        {APPLE_SPLASH_SCREENS.map((screen) => (
          <React.Fragment key={`${screen.orientation}-${screen.width}x${screen.height}@${screen.ratio}`}>
            {APPLE_SPLASH_MODES.map((mode) => (
              <link
                key={mode}
                rel="apple-touch-startup-image"
                href={getAppleSplashImagePath(screen, mode)}
                media={getAppleSplashMedia(screen, mode)}
              />
            ))}
          </React.Fragment>
        ))}
        {/* Apple PWA Support */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="小视界" />
        {/* apple-touch-icon 由 generateMetadata 输出，固定 180x180 静态 PNG */}
        {/* Theme Color (for browser address bar) */}
        <meta name="theme-color" content="#cbdbec" />
        <meta name="color-scheme" content="light dark" />
        {/* Mobile viewport */}
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      </head>
      <body
        className="antialiased"
        suppressHydrationWarning
      >
        <SiteIconProvider iconSrc={siteIconSrc}>
          <ThemeProvider>
            <RuntimeFeaturesProvider initialFeatures={runtimeFeatures}>
              <VideoTogetherController
                envEnabled={videoTogetherEnvEnabled}
                scriptUrl={videoTogetherScriptUrl}
                settingUrl={videoTogetherSettingUrl}
              />
              <LocaleProvider />

              <TVProvider>
                <TVNavigationInitializer />
                <PasswordGate hasAuth={hasAuth}>
                  <AutoSync />
                  <AdKeywordsWrapper />
                  {children}
                  <BottomNav />
                  <BackToTop />
                  {/* ScrollPositionManager 使用 useSearchParams，需置于 Suspense 内，
                      否则静态预渲染时会触发 CSR bailout 报错 */}
                  <React.Suspense fallback={null}>
                    <ScrollPositionManager />
                  </React.Suspense>
                </PasswordGate>
              </TVProvider>
              {vercelAnalyticsEnabled ? <Analytics /> : null}
              <ServiceWorkerRegister />
            </RuntimeFeaturesProvider>
          </ThemeProvider>
        </SiteIconProvider>

        {/* ARIA Live Region for Screen Reader Announcements */}
        <div
          id="aria-live-announcer"
          role="status"
          aria-live="polite"
          aria-atomic="true"
          className="sr-only"
        />

        {/* Google Cast SDK */}
        <script src="https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1" async />

        {/* Scroll Performance Optimization Script */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                let scrollTimer;
                const body = document.body;
                
                function handleScroll() {
                  body.classList.add('scrolling');
                  clearTimeout(scrollTimer);
                  scrollTimer = setTimeout(function() {
                    body.classList.remove('scrolling');
                  }, 150);
                }
                
                let ticking = false;
                window.addEventListener('scroll', function() {
                  if (!ticking) {
                    window.requestAnimationFrame(function() {
                      handleScroll();
                      ticking = false;
                    });
                    ticking = true;
                  }
                }, { passive: true });
              })();
            `,
          }}
        />
      </body>
    </html>
  );
}
