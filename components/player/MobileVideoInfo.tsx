'use client';

import { useMemo, useState } from 'react';
import { Icons } from '@/components/ui/Icon';
import { FavoriteButton } from '@/components/favorites/FavoriteButton';

interface MobileVideoInfoProps {
  title: string;
  year?: string;
  area?: string;
  lang?: string;
  typeName?: string;
  description?: string;
  favorite?: {
    videoId: string | number;
    source: string;
    poster?: string;
    sourceMap?: Record<string, string | number>;
    isPremium?: boolean;
  };
}

/** 移动端播放页信息区：标题 + 简介入口 + 标签胶囊 + 操作行 */
export function MobileVideoInfo({
  title,
  year,
  area,
  lang,
  typeName,
  description,
  favorite,
}: MobileVideoInfoProps) {
  const [showIntro, setShowIntro] = useState(false);

  // 年份/地区/语言与类型拆分成胶囊标签，与「详情页」样式保持一致
  const tags = useMemo(() => {
    const typeTags = (typeName || '')
      .split(/[,，/、]/)
      .map((tag) => tag.trim())
      .filter(Boolean);
    return [year, area, lang, ...typeTags].filter((tag): tag is string => Boolean(tag));
  }, [year, area, lang, typeName]);

  return (
    <section className="lg:hidden pt-1">
      <div className="flex items-start gap-3">
        <h1 className="flex-1 min-w-0 text-xl font-bold leading-snug text-[var(--text-color)]">
          {title}
        </h1>
        {description && (
          <button
            type="button"
            onClick={() => setShowIntro((current) => !current)}
            className="mt-1 flex-shrink-0 flex items-center gap-0.5 text-xs text-[var(--text-color-secondary)] cursor-pointer"
            aria-expanded={showIntro}
          >
            简介
            <Icons.ChevronLeft
              size={14}
              className={`transition-transform duration-200 ${showIntro ? '-rotate-90' : 'rotate-180'}`}
            />
          </button>
        )}
      </div>

      {(tags.length > 0 || favorite) && (
        <div className="mt-3 flex items-center gap-2">
          <div className="flex flex-1 flex-wrap items-center gap-2">
            {tags.map((tag) => (
              <span
                key={tag}
                className="rounded-[var(--radius-full)] bg-[var(--glass-bg)] border border-[var(--glass-border)] px-2.5 py-1 text-xs text-[var(--text-color-secondary)]"
              >
                {tag}
              </span>
            ))}
          </div>
          {favorite && (
            <div className="flex flex-shrink-0 flex-col items-center gap-1">
              <FavoriteButton
                videoId={favorite.videoId}
                source={favorite.source}
                title={title}
                poster={favorite.poster}
                year={year}
                type={typeName}
                sourceMap={favorite.sourceMap}
                size={22}
                className="p-1.5! bg-transparent! border-0! shadow-none!"
                showTooltip={false}
                isPremium={favorite.isPremium}
              />
              <span className="text-[11px] text-[var(--text-color-secondary)]">收藏</span>
            </div>
          )}
        </div>
      )}

      {showIntro && description && (
        <p className="mt-3 text-sm leading-relaxed text-[var(--text-color-secondary)]">
          {description}
        </p>
      )}
    </section>
  );
}
