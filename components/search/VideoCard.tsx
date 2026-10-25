'use client';

import { memo } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { LatencyBadge } from '@/components/ui/LatencyBadge';

import { Video } from '@/lib/types';
import { parseVideoTitle } from '@/lib/utils/video';

interface VideoCardProps {
    video: Video;
    videoUrl: string;
    cardId: string;
    latencies?: Record<string, number>;
}

export const VideoCard = memo<VideoCardProps>(({
    video,
    videoUrl,
    cardId,
    latencies = {},
}) => {
    const displayLatency = latencies[video.source] ?? video.latency;
    const { cleanTitle } = parseVideoTitle(video.vod_name);

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
                aria-label={cleanTitle}
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
                        {video.vod_pic ? (
                            <Image
                                src={video.vod_pic}
                                alt={cleanTitle}
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
                                alt={cleanTitle}
                                fill
                                className="object-cover"
                                sizes="(max-width: 640px) 50vw, (max-width: 1024px) 25vw, 16vw"
                                unoptimized
                            />
                        )}

                        {/* 左上角：数据源标签 + 延迟标签 */}
                        {(video.sourceName || displayLatency !== undefined) && (
                            <div className="absolute top-2 left-2 z-10 flex items-center gap-1 min-w-0 max-w-[calc(100%-1rem)]">
                                {video.sourceName && (
                                    <Badge variant="primary" className="max-w-full truncate">
                                        {video.sourceName}
                                    </Badge>
                                )}
                                {displayLatency !== undefined && (
                                    <LatencyBadge latency={displayLatency} className="flex-shrink-0 backdrop-blur-md" />
                                )}
                            </div>
                        )}

                        {/* 左下角：年份 */}
                        {video.vod_year && (
                            <span className="absolute bottom-2 left-2 z-10 rounded-[var(--radius-full)] bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                                {video.vod_year}
                            </span>
                        )}
                    </div>
                </Card>

                {/* 名称与类型标签：与海报左对齐 */}
                <div className="pt-2">
                    <h4 className="font-semibold text-sm text-left text-[var(--text-color)] line-clamp-2">
                        {cleanTitle}
                    </h4>
                    {video.type_name && (
                        <span className="mt-1 inline-flex max-w-full items-center truncate rounded-[var(--radius-full)] bg-[var(--glass-bg)] border border-[var(--glass-border)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--text-color-secondary)]">
                            {video.type_name}
                        </span>
                    )}
                </div>
            </Link>
        </div>
    );
});

VideoCard.displayName = 'VideoCard';
