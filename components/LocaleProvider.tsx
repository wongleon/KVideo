'use client';

/**
 * LocaleProvider - 界面语言固定为简体中文
 * 站点配置中已移除繁体切换，此处仅确保 DOM 语言标记为简体中文
 */

import { useEffect } from 'react';

export function LocaleProvider() {
  useEffect(() => {
    document.documentElement.lang = 'zh-CN';
  }, []);

  return null;
}
