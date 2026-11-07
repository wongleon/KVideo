'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';

type Theme = 'light' | 'dark' | 'system';

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  actualTheme: 'light' | 'dark';
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>('system');
  const [actualTheme, setActualTheme] = useState<'light' | 'dark'>('dark');
  const [mounted, setMounted] = useState(false);
  const transitionRef = React.useRef<any>(null);

  useEffect(() => {
    setMounted(true);
    // Load saved theme
    const saved = localStorage.getItem('theme') as Theme;
    if (saved) {
      setTheme(saved);
    }
  }, []);

  useEffect(() => {
    if (!mounted) return;

    const applyTheme = (newTheme?: 'light' | 'dark') => {
      const themeToApply = newTheme || (theme === 'system' 
        ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
        : theme);
      
      setActualTheme(themeToApply);
      document.documentElement.classList.toggle('dark', themeToApply === 'dark');
      // 让浏览器/系统状态栏的文字颜色跟随主题
      document.documentElement.style.colorScheme = themeToApply;

      // 同步状态栏 / 浏览器主题色：取顶栏渐变起点色，避免状态栏出现纯黑或纯白的色带
      const themeColorMeta = document.querySelector('meta[name="theme-color"]');
      if (themeColorMeta) {
        const cssThemeColor = getComputedStyle(document.documentElement)
          .getPropertyValue('--theme-color')
          .trim();
        themeColorMeta.setAttribute(
          'content',
          cssThemeColor || (themeToApply === 'dark' ? '#1e2328' : '#cbdbec')
        );
      }

      // iOS 主屏 Web App 的状态栏由 WebKit 单独合成，切换根元素背景后不会立即重绘，
      // 表现为「要切换页面或滚动一下状态栏才变色」。
      // 这里直接给根元素写内联背景，并做一次 1px 的微滚动，强制重建该区域。
      const isStandalone =
        (window.navigator as Navigator & { standalone?: boolean }).standalone === true ||
        window.matchMedia('(display-mode: standalone)').matches;

      if (isStandalone) {
        const root = document.documentElement;
        // 读取切换后生效的主题色变量，与顶栏渐变起点保持一致
        const themedBackground = window
          .getComputedStyle(root)
          .getPropertyValue('--theme-color')
          .trim();
        if (themedBackground) {
          root.style.backgroundColor = themedBackground;
        }

        const scrollY = window.scrollY;
        window.scrollTo(0, scrollY + 1);
        window.requestAnimationFrame(() => {
          window.scrollTo(0, scrollY);
        });
      }
    };

    const applyThemeWithTransition = () => {
      // Abort previous transition if it exists
      if (transitionRef.current) {
        try {
          transitionRef.current.skipTransition();
        } catch (e) {
          // Ignore if transition already finished
        }
      }

      // Check if document is visible - skip transition if hidden
      if (document.hidden) {
        applyTheme();
        return;
      }

      // Check if View Transition API is supported
      // @ts-ignore - View Transition API is experimental
      if (typeof document.startViewTransition === 'function') {
        try {
          // @ts-ignore
          transitionRef.current = document.startViewTransition(() => {
            applyTheme();
          });
          
          // Clear ref after transition completes or fails
          if (transitionRef.current) {
            transitionRef.current.finished
              .then(() => { transitionRef.current = null; })
              .catch((error: Error) => { 
                // Silently handle transition errors (visibility changes, etc.)
                transitionRef.current = null;
              });
          }
        } catch (error) {
          // Fallback if transition fails to start
          applyTheme();
        }
      } else {
        // Fallback for browsers that don't support View Transition API
        applyTheme();
      }
    };

    applyThemeWithTransition();
    localStorage.setItem('theme', theme);

    // Listen for system theme changes
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleSystemThemeChange = () => {
      if (theme === 'system') {
        applyThemeWithTransition();
      }
    };
    
    // Listen for visibility changes to abort transitions
    const handleVisibilityChange = () => {
      if (document.hidden && transitionRef.current) {
        try {
          transitionRef.current.skipTransition();
        } catch (e) {
          // Ignore
        }
        transitionRef.current = null;
      }
    };
    
    mediaQuery.addEventListener('change', handleSystemThemeChange);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      mediaQuery.removeEventListener('change', handleSystemThemeChange);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      // Abort any pending transition on unmount
      if (transitionRef.current) {
        try {
          transitionRef.current.skipTransition();
        } catch (e) {
          // Ignore
        }
      }
    };
  }, [theme, mounted]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, actualTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context;
}
