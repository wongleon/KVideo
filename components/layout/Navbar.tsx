'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ThemeSwitcher } from '@/components/ThemeSwitcher';
import { useSiteIcon } from '@/components/SiteIconProvider';
import { Icons } from '@/components/ui/Icon';
import { siteConfig } from '@/lib/config/site-config';
import { getSession, clearSession, hasPermission, type AuthSession } from '@/lib/store/auth-store';
import { useRuntimeFeatures } from '@/components/RuntimeFeaturesProvider';
import { LogOut } from 'lucide-react';

interface NavbarProps {
    onReset: () => void;
    isPremiumMode?: boolean;
}

export function Navbar({ onReset, isPremiumMode = false }: NavbarProps) {
    const [session] = useState<AuthSession | null>(() => getSession());
    const { iptvEnabled } = useRuntimeFeatures();
    const siteIconSrc = useSiteIcon();

    const handleLogout = () => {
        fetch('/api/auth/session', { method: 'DELETE' })
            .catch(() => {
                // Best effort only.
            })
            .finally(() => {
                clearSession();
                window.location.href = '/';
            });
    };

    return (
        <nav className="sticky top-[env(safe-area-inset-top)] z-[2000] pt-2 pb-2" style={{
            transform: 'translate3d(0, 0, 0)',
            willChange: 'transform'
        }}>
            <div className="max-w-7xl mx-auto px-4">
                <div className="py-2 sm:py-4" style={{
                    transform: 'translate3d(0, 0, 0)'
                }}>
                    <div className="flex items-center justify-between gap-2 sm:gap-4">
                        <Link
                            href={isPremiumMode ? '/premium' : '/'}
                            className="flex items-center gap-2 sm:gap-3 hover:opacity-80 transition-opacity cursor-pointer min-w-0"
                            onClick={onReset}
                            data-focusable
                        >
                            <div className="w-8 h-8 sm:w-10 sm:h-10 relative flex items-center justify-center flex-shrink-0">
                                <Image
                                    src={siteIconSrc}
                                    alt={siteConfig.name}
                                    width={40}
                                    height={40}
                                    unoptimized
                                    className="object-contain"
                                />
                            </div>
                            <div className="flex flex-col min-w-0">
                                <h1 className="font-brand text-lg sm:text-2xl font-bold text-[var(--text-color)] truncate">{siteConfig.name}</h1>
                            </div>
                        </Link>

                        <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
                            {/* Search Entry */}
                            <Link
                                href="/search"
                                className="w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center rounded-[var(--radius-full)] bg-[var(--glass-bg)] border border-[var(--glass-border)] text-[var(--text-color)] hover:bg-[color-mix(in_srgb,var(--accent-color)_10%,transparent)] transition-all duration-200 cursor-pointer"
                                aria-label="搜索"
                                title="搜索"
                                data-focusable
                            >
                                <Icons.Search size={20} />
                            </Link>

                            {/* IPTV Link - only show if user has iptv_access or no auth configured */}
                            {iptvEnabled && hasPermission('iptv_access') && (
                            <Link
                                href="/iptv"
                                className="w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center rounded-[var(--radius-full)] bg-[var(--glass-bg)] border border-[var(--glass-border)] text-[var(--text-color)] hover:bg-[color-mix(in_srgb,var(--accent-color)_10%,transparent)] transition-all duration-200 cursor-pointer"
                                aria-label="直播"
                                title="直播"
                                data-focusable
                            >
                                <Icons.TV size={16} className="sm:w-5 sm:h-5" />
                            </Link>
                            )}

                            {/* User Info */}
                            {session && (
                                <div className="flex items-center gap-1 sm:gap-2">
                                    <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 bg-[var(--glass-bg)] border border-[var(--glass-border)] rounded-[var(--radius-full)] text-xs">
                                        <div className="w-5 h-5 rounded-[var(--radius-full)] bg-[var(--accent-color)]/10 flex items-center justify-center text-[var(--accent-color)] font-bold text-[10px] border border-[var(--glass-border)]">
                                            {session.name.charAt(0)}
                                        </div>
                                        <span className="text-[var(--text-color)] max-w-[60px] truncate">{session.name}</span>
                                        {(session.role === 'admin' || session.role === 'super_admin') && (
                                            <span className="px-1 py-0.5 bg-[var(--accent-color)]/10 text-[var(--accent-color)] rounded text-[10px] font-medium">
                                                {session.role === 'super_admin' ? '超管' : '管理'}
                                            </span>
                                        )}
                                    </div>
                                    <button
                                        onClick={handleLogout}
                                        className="w-8 h-8 sm:w-8 sm:h-8 flex items-center justify-center rounded-[var(--radius-full)] bg-[var(--glass-bg)] border border-[var(--glass-border)] text-[var(--text-color-secondary)] hover:text-red-500 hover:border-red-500/30 transition-all duration-200 cursor-pointer"
                                        aria-label="退出登录"
                                        title="退出登录"
                                    >
                                        <LogOut size={14} />
                                    </button>
                                </div>
                            )}
                            <ThemeSwitcher />
                        </div>
                    </div>
                </div>
            </div>
        </nav>
    );
}
