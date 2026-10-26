'use client';

/**
 * VideoGroupCard - Displays grouped videos with same name as single card
 * Following Liquid Glass design system
 */

import { memo, useMemo } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Icons } from '@/components/ui/Icon';
import { LatencyBadge } from '@/components/ui/LatencyBadge';
import { Video } from '@/lib/types';
import { parseVideoTitle } from '@/lib/utils/video';
import { storeGroupedSources } from '@/lib/utils/grouped-sources-cache';
import type { ResolutionInfo } from '@/lib/hooks/useResolutionProbe';

export interface GroupedVideo {
    /** Representative video (lowest latency) */
    representative: Video;
    /** All videos in this group */
    videos: Video[];
    /** Group name (vod_name) */
    name: string;
    /** 分组年份，空字符串表示该组没有年份信息 */
    year: string;
}

interface VideoGroupCardProps {
    group: GroupedVideo;
    cardId: string;
    isPremium?: boolean;
    latencies?: Record<string, number>;
    resolution?: ResolutionInfo | null;
    isProbing?: boolean;
}

export const VideoGroupCard = memo<VideoGroupCardProps>(({
    group,
    cardId,
    isPremium = false,
    latencies = {},
    resolution,
    isProbing = false,
}) => {
    const { representative, videos, name, year } = group;

    // Best latency from the group, preferring real-time updates
    const bestLatency = useMemo(() => {
        const currentLatencies = videos.map(v => latencies[v.source] ?? v.latency).filter(l => l !== undefined) as number[];
        return currentLatencies.length > 0 ? Math.min(...currentLatencies) : undefined;
    }, [videos, latencies]);

    // Generate URL with grouped sources stored in sessionStorage (avoids long URLs / 414 errors)
    const videoUrl = useMemo(() => {
        const params = new URLSearchParams({
            id: String(representative.vod_id),
            source: representative.source,
            title: representative.vod_name,
        });

        // Store group data in sessionStorage and pass short key in URL
        if (videos.length > 1) {
            const groupData = videos.map(v => ({
                id: v.vod_id,
                source: v.source,
                sourceName: v.sourceName,
                latency: v.latency,
                pic: v.vod_pic,
                typeName: v.type_name,
                remarks: v.vod_remarks,
            }));
            const cacheKey = storeGroupedSources(groupData);
            if (cacheKey) {
                params.set('gs', cacheKey);
            }
        }

        if (isPremium) {
            params.set('premium', '1');
        }

        return `/player?${params.toString()}`;
    }, [representative, videos, isPremium]);

    return (
        <div
            style={{
                position: 'relative',
                zIndex: 1,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.zIndex = '100')}
            onMouseLeave={(e) => (e.currentTarget.style.zIndex = '1')}
        >
            <Link
                key={cardId}
                href={videoUrl}
                role="listitem"
                aria-label={`${name}${year ? ` - ${year}` : ''} - ${videos.length} 个源${representative.vod_remarks ? ` - ${representative.vod_remarks}` : ''}`}
                prefetch={false}
                data-focusable
                className="block"
            >
                <Card
                    className="p-0! relative overflow-hidden border-0! rounded-xl! shadow-[0_2px_8px_var(--shadow-color)]"
                    hover={false}
                    blur={false}
                    style={{ backfaceVisibility: 'hidden' }}
                >
                    {/* 海报 */}
                    <div className="relative aspect-[2/3] bg-[var(--glass-bg)]">
                        {representative.vod_pic ? (
                            <Image
                                src={representative.vod_pic}
                                alt={name}
                                fill
                                className="object-cover"
                                sizes="(max-width: 640px) 50vw, (max-width: 1024px) 25vw, 16vw"
                                loading="eager"
                                unoptimized
                                referrerPolicy="no-referrer"
                                onError={(e) => {
                                    const target = e.currentTarget as HTMLImageElement;
                                    if (target.dataset.fallback === '1') {
                                        target.style.opacity = '0';
                                        return;
                                    }
                                    target.dataset.fallback = '1';
                                    target.src = '/placeholder-poster.svg';
                                }}
                            />
                        ) : (
                            <Image
                                src="/placeholder-poster.svg"
                                alt={name}
                                fill
                                className="object-cover"
                                sizes="(max-width: 640px) 50vw, (max-width: 1024px) 25vw, 16vw"
                                unoptimized
                            />
                        )}

                        {/* 左上角：源数量标签 + 延迟标签 */}
                        <div className="absolute top-2 left-2 z-10 flex items-center gap-1 min-w-0 max-w-[calc(100%-1rem)]">
                            <Badge variant="primary" className="max-w-full truncate">
                                <Icons.Layers size={12} className="mr-1 shrink-0" />
                                {videos.length} 源
                            </Badge>
                            {bestLatency !== undefined && (
                                <LatencyBadge latency={bestLatency} className="flex-shrink-0 backdrop-blur-md" />
                            )}
                        </div>

                        {/* 左下角：年份（按分组年份显示，缺失则不显示） */}
                        {year && (
                            <span className="absolute bottom-2 left-2 z-10 rounded-[var(--radius-full)] bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                                {year}
                            </span>
                        )}
                    </div>
                </Card>

                {/* 名称与标签：与海报左对齐 */}
                <div className="pt-2">
                    {(() => {
                        const { cleanTitle } = parseVideoTitle(name);

                        return (
                            <>
                                <h4 className="font-semibold text-sm text-left text-[var(--text-color)] line-clamp-2">
                                    {cleanTitle}
                                </h4>
                                <div className="mt-1 flex items-center gap-1 flex-wrap">
                                    {resolution ? (
                                        <span className={`inline-flex items-center rounded-[var(--radius-full)] px-1.5 py-0.5 text-[10px] font-semibold text-white ${resolution.color}`}>
                                            {resolution.label}
                                        </span>
                                    ) : isProbing ? (
                                        <span className="inline-flex items-center rounded-[var(--radius-full)] px-1.5 py-0.5 text-[10px] font-semibold text-white/50 bg-gray-500/50 animate-pulse">
                                            ...
                                        </span>
                                    ) : null}
                                    {representative.type_name && (
                                        <span className="inline-flex max-w-full items-center truncate rounded-[var(--radius-full)] bg-[var(--glass-bg)] border border-[var(--glass-border)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--text-color-secondary)]">
                                            {representative.type_name}
                                        </span>
                                    )}
                                </div>
                            </>
                        );
                    })()}
                </div>
            </Link>
        </div>
    );
});

VideoGroupCard.displayName = 'VideoGroupCard';
