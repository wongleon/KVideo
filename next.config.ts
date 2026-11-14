import type { NextConfig } from "next";
import { getLanAllowedDevOrigins } from "./lib/config/lan-access";

const lanAllowedDevOrigins = getLanAllowedDevOrigins();

const nextConfig: NextConfig = {
  ...(lanAllowedDevOrigins.length > 0 ? { allowedDevOrigins: lanAllowedDevOrigins } : {}),

  // Performance optimizations
  reactStrictMode: true,
  poweredByHeader: false,

  // Compiler optimizations
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production',
  },

  output: 'standalone',
  outputFileTracingRoot: __dirname,
  turbopack: {
    root: __dirname,
  },

  images: {
    remotePatterns: [
      // Douban images
      {
        protocol: 'https',
        hostname: 'img3.doubanio.com',
      },
      {
        protocol: 'https',
        hostname: 'img1.doubanio.com',
      },
      {
        protocol: 'https',
        hostname: 'img2.doubanio.com',
      },
      {
        protocol: 'https',
        hostname: 'img9.doubanio.com',
      },
      // Video source images - allow all subdomains with wildcards
      {
        protocol: 'http',
        hostname: '**.com',
      },
      {
        protocol: 'https',
        hostname: '**.com',
      },
      {
        protocol: 'http',
        hostname: '**.cn',
      },
      {
        protocol: 'https',
        hostname: '**.cn',
      },
      {
        protocol: 'http',
        hostname: '**.net',
      },
      {
        protocol: 'https',
        hostname: '**.net',
      },
      {
        protocol: 'http',
        hostname: '**.org',
      },
      {
        protocol: 'https',
        hostname: '**.org',
      },
      {
        protocol: 'http',
        hostname: '**.tv',
      },
      {
        protocol: 'https',
        hostname: '**.tv',
      },
      {
        protocol: 'http',
        hostname: '**.io',
      },
      {
        protocol: 'https',
        hostname: '**.io',
      },
      {
        protocol: 'http',
        hostname: '**.xyz',
      },
      {
        protocol: 'https',
        hostname: '**.xyz',
      },
      {
        protocol: 'http',
        hostname: '**.online',
      },
      {
        protocol: 'https',
        hostname: '**.online',
      },
      {
        protocol: 'http',
        hostname: '**.top',
      },
      {
        protocol: 'https',
        hostname: '**.top',
      },
    ],
    // Add image optimization for better performance
    formats: ['image/webp'],
    minimumCacheTTL: 60,
  },

  // 图标与 manifest 属于低频变更资源，长缓存可避免 iOS「添加到主屏幕」时重复拉取
  async headers() {
    const staticAssetHeaders = [
      {
        key: 'Cache-Control',
        value: 'public, max-age=604800, stale-while-revalidate=86400',
      },
    ];

    return [
      // Service Worker 必须每次校验，否则发版后客户端迟迟拿不到新脚本，
      // 旧的缓存外壳会继续引用已失效的构建产物，PWA 会一直加载不出来
      {
        source: '/sw.js',
        headers: [{ key: 'Cache-Control', value: 'no-cache, must-revalidate' }],
      },
      { source: '/apple-touch-icon.png', headers: staticAssetHeaders },
      { source: '/icon.png', headers: staticAssetHeaders },
      { source: '/logo.png', headers: staticAssetHeaders },
      // iOS 在「添加到主屏幕」时会一次性抓取全部启动图，长缓存避免反复回源
      { source: '/splash/:path*', headers: staticAssetHeaders },
      {
        source: '/manifest.json',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=86400, stale-while-revalidate=3600',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
