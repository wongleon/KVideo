'use client';

import { useEffect } from 'react';

export function ServiceWorkerRegister() {
    useEffect(() => {
        if (!('serviceWorker' in navigator)) return;

        // 开发环境的构建产物名会随代码变化，缓存优先的旧外壳会让页面一直加载不出来；
        // 因此 dev 下不注册，并注销历史遗留的注册，避免本地调试持续被旧缓存干扰
        if (process.env.NODE_ENV !== 'production') {
            navigator.serviceWorker
                .getRegistrations()
                .then((registrations) =>
                    Promise.all(registrations.map((registration) => registration.unregister()))
                )
                .catch(() => {
                    // 忽略注销失败
                });
            return;
        }

        const registerServiceWorker = () => {
            navigator.serviceWorker.register('/sw.js')
                .then((registration) => {
                    registration.update().catch(() => {
                        // Ignore update check errors.
                    });
                })
                .catch(() => {
                    // Ignore registration failures.
                });
        };

        if (document.readyState === 'complete') {
            registerServiceWorker();
            return;
        }

        window.addEventListener('load', registerServiceWorker, { once: true });
        return () => window.removeEventListener('load', registerServiceWorker);
    }, []);

    return null;
}
