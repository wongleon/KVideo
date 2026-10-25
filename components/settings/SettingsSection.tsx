'use client';

import { useState } from 'react';
import { Icons } from '@/components/ui/Icon';

interface SettingsSectionProps {
    title: string;
    description?: string;
    children: React.ReactNode;
    headerAction?: React.ReactNode;
    defaultExpanded?: boolean;
}

export function SettingsSection({
    title,
    description,
    children,
    headerAction,
    defaultExpanded = false,
}: SettingsSectionProps) {
    // 默认收起，只显示标题
    const [isExpanded, setIsExpanded] = useState(defaultExpanded);

    return (
        <div className="bg-[var(--glass-bg)] backdrop-filter backdrop-blur-[25px] saturate-[180%] border border-[var(--glass-border)] rounded-[var(--radius-2xl)] shadow-[var(--shadow-md)] p-6 mb-6 transition-all duration-[0.4s] cubic-bezier(0.2,0.8,0.2,1) hover:translate-y-[-5px] hover:scale-[1.02] hover:shadow-[0_8px_24px_var(--shadow-color)] hover:z-10">
            <div className={`flex flex-wrap items-center justify-between gap-3 ${isExpanded ? 'mb-4' : ''}`}>
                <button
                    type="button"
                    onClick={() => setIsExpanded(prev => !prev)}
                    aria-expanded={isExpanded}
                    className="flex min-w-0 items-center gap-2 text-left cursor-pointer"
                >
                    <Icons.ChevronDown
                        size={20}
                        className={`shrink-0 text-[var(--text-color-secondary)] transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                    />
                    <h2 className="text-xl font-semibold text-[var(--text-color)]">{title}</h2>
                </button>
                {isExpanded && headerAction && <div className="flex w-full items-center justify-end gap-2 flex-wrap sm:w-auto sm:flex-1">{headerAction}</div>}
            </div>
            {isExpanded && (
                <>
                    {description && (
                        <p className="text-sm text-[var(--text-color-secondary)] mb-6 leading-[1.6]">
                            {description}
                        </p>
                    )}
                    {children}
                </>
            )}
        </div>
    );
}
