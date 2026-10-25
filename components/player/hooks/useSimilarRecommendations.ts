/**
 * useSimilarRecommendations
 * 基于当前播放视频的类型、演员、地区生成豆瓣推荐查询，
 * 交错合并多路结果后取前 6 条展示。
 */

import { useEffect, useState } from 'react';

export interface SimilarMovie {
  id: string;
  title: string;
  cover: string;
  rate: string;
  url: string;
}

interface SimilarSource {
  tag: string;
  type: 'movie' | 'tv';
}

interface UseSimilarRecommendationsParams {
  title?: string;
  typeName?: string;
  actors?: string;
  area?: string;
}

/** 每路查询拉取条数，用于交错挑选 */
const PAGE_LIMIT = 20;
/** 模块最多展示条数 */
const MAX_ITEMS = 6;
/** 类型名命中这些关键词时按剧集检索 */
const TV_KEYWORDS = ['剧', '电视', '综艺', '动漫', '动画', '纪录'];

/** 拆分逗号 / 斜杠 / 顿号分隔的标签串 */
function splitTags(value?: string): string[] {
  if (!value) return [];
  return value
    .split(/[,，/、]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

/** 根据当前视频信息组装推荐查询，最多 3 路 */
function buildSources({ typeName, actors, area }: UseSimilarRecommendationsParams): SimilarSource[] {
  const sources: SimilarSource[] = [];
  const seen = new Set<string>();

  const push = (tag: string, type: 'movie' | 'tv') => {
    const key = `${type}:${tag}`;
    if (!tag || seen.has(key)) return;
    seen.add(key);
    sources.push({ tag, type });
  };

  const genres = splitTags(typeName);
  const isTv = genres.some((genre) => TV_KEYWORDS.some((keyword) => genre.includes(keyword)));
  const mediaType: 'movie' | 'tv' = isTv ? 'tv' : 'movie';

  // 前两个类型标签
  genres.slice(0, 2).forEach((genre) => push(genre, mediaType));

  // 没有类型信息时，用首位演员兜底
  if (genres.length === 0) {
    const actor = splitTags(actors)[0];
    if (actor) push(actor, mediaType);
  }

  // 地区标签（豆瓣地区标签较短，过滤掉「其他」这类无效值）
  const trimmedArea = area?.trim();
  if (trimmedArea && trimmedArea.length <= 6 && !trimmedArea.includes('其他')) {
    push(trimmedArea, mediaType);
  }

  // 兜底：保证模块始终有内容
  push('热门', mediaType);

  return sources.slice(0, 3);
}

/** 拉取多路数据，交错合并、去重并排除当前视频 */
async function fetchSimilar(
  sources: SimilarSource[],
  excludedTitle: string
): Promise<SimilarMovie[]> {
  const lists = await Promise.all(
    sources.map(async (source) => {
      try {
        const response = await fetch(
          `/api/douban/recommend?type=${source.type}&tag=${encodeURIComponent(source.tag)}&page_limit=${PAGE_LIMIT}&page_start=0`
        );
        if (!response.ok) return [] as SimilarMovie[];
        const data = await response.json();
        return (data.subjects || []).map((subject: Partial<SimilarMovie>) => ({
          id: String(subject.id ?? ''),
          title: subject.title || '',
          cover: subject.cover || '',
          rate: subject.rate || '',
          url: subject.url || '',
        })) as SimilarMovie[];
      } catch {
        return [] as SimilarMovie[];
      }
    })
  );

  const merged: SimilarMovie[] = [];
  const seenIds = new Set<string>();
  const excluded = excludedTitle.toLowerCase().trim();
  const maxLength = lists.reduce((max, list) => Math.max(max, list.length), 0);

  for (let index = 0; index < maxLength && merged.length < MAX_ITEMS; index += 1) {
    for (const list of lists) {
      const movie = list[index];
      if (!movie || !movie.id) continue;
      if (movie.title.toLowerCase().trim() === excluded) continue;
      if (seenIds.has(movie.id)) continue;
      seenIds.add(movie.id);
      merged.push(movie);
      if (merged.length >= MAX_ITEMS) break;
    }
  }

  return merged;
}

export function useSimilarRecommendations({
  title,
  typeName,
  actors,
  area,
}: UseSimilarRecommendationsParams) {
  // 用当前视频信息作为数据标识，标签变化时自动回到加载态
  const currentKey = [title, typeName, actors, area].join('|');
  const [result, setResult] = useState<{ key: string; movies: SimilarMovie[] } | null>(null);

  useEffect(() => {
    const sources = buildSources({ typeName, actors, area });
    let cancelled = false;

    fetchSimilar(sources, title || '')
      .then((list) => {
        if (cancelled) return;
        setResult({ key: currentKey, movies: list });
      })
      .catch(() => {
        if (!cancelled) setResult({ key: currentKey, movies: [] });
      });

    return () => {
      cancelled = true;
    };
  }, [currentKey, title, typeName, actors, area]);

  if (result && result.key === currentKey) {
    return { movies: result.movies, loading: false };
  }
  return { movies: [], loading: true };
}
