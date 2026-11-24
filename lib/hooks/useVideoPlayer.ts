'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { settingsStore } from '@/lib/store/settings-store';
import { userSourcesStore } from '@/lib/store/user-sources-store';

interface VideoData {
  vod_id: string;
  vod_name: string;
  vod_pic?: string;
  vod_content?: string;
  vod_actor?: string;
  vod_director?: string;
  vod_year?: string;
  vod_area?: string;
  vod_lang?: string;
  type_name?: string;
  episodes?: Array<{ name?: string; url: string }>;
}

/**
 * 详情短期缓存
 *
 * 从播放页返回列表再点进同一部影片时，不必等 /api/detail 回源：
 * 先用手上这份数据把播放器渲染出来，同时仍发起一次网络请求刷新。
 */
const DETAIL_CACHE_TTL_MS = 5 * 60 * 1000;
const DETAIL_CACHE_LIMIT = 30;
const detailCache = new Map<string, { data: VideoData; expiresAt: number }>();

function getDetailCacheKey(videoId: string, source: string): string {
  return `${source}:${videoId}`;
}

function readDetailCache(videoId: string, source: string): VideoData | null {
  const key = getDetailCacheKey(videoId, source);
  const hit = detailCache.get(key);
  if (!hit) return null;
  if (hit.expiresAt <= Date.now()) {
    detailCache.delete(key);
    return null;
  }
  return hit.data;
}

function writeDetailCache(videoId: string, source: string, data: VideoData): void {
  if (detailCache.size >= DETAIL_CACHE_LIMIT) {
    const oldestKey = detailCache.keys().next().value;
    if (oldestKey) detailCache.delete(oldestKey);
  }
  detailCache.set(getDetailCacheKey(videoId, source), {
    data,
    expiresAt: Date.now() + DETAIL_CACHE_TTL_MS,
  });
}

interface UseVideoPlayerReturn {
  videoData: VideoData | null;
  loading: boolean;
  videoError: string;
  currentEpisode: number;
  playUrl: string;
  setCurrentEpisode: (index: number) => void;
  setPlayUrl: (url: string) => void;
  setVideoError: (error: string) => void;
  fetchVideoDetails: () => Promise<void>;
}

export function useVideoPlayer(
  videoId: string | null,
  source: string | null,
  episodeParam: string | null,
  isReversed: boolean = false,
  onSourceUnavailable?: () => void
): UseVideoPlayerReturn {
  const [videoData, setVideoData] = useState<VideoData | null>(null);
  // Initialize loading to true if we have the necessary params to start fetching
  const [loading, setLoading] = useState(!!(videoId && source));
  const [currentEpisode, setCurrentEpisode] = useState(0);
  const [playUrl, setPlayUrl] = useState('');
  const [videoError, setVideoError] = useState<string>('');

  // 记录当前是否已有可播放的数据：切换源时保留旧画面，避免整页回到加载态
  const hasPlayableDataRef = useRef(false);

  useEffect(() => {
    hasPlayableDataRef.current = videoData !== null && playUrl !== '';
  }, [videoData, playUrl]);

  // Refs to keep track of latest values for the fetch function without re-triggering it
  // This solves the stale closure problem while keeping fetchVideoDetails stable for the player
  const episodeParamRef = useRef(episodeParam);
  const isReversedRef = useRef(isReversed);
  const onSourceUnavailableRef = useRef(onSourceUnavailable);

  useEffect(() => {
    episodeParamRef.current = episodeParam;
  }, [episodeParam]);

  useEffect(() => {
    isReversedRef.current = isReversed;
  }, [isReversed]);

  useEffect(() => {
    onSourceUnavailableRef.current = onSourceUnavailable;
  }, [onSourceUnavailable]);

  /** 把详情数据落到各个 state（网络返回与本地缓存共用同一套规则） */
  const applyVideoDetail = useCallback((data: VideoData) => {
    setVideoData(data);
    setLoading(false);

    if (data.episodes && data.episodes.length > 0) {
      const latestIsReversed = isReversedRef.current;
      const latestEpisodeParam = episodeParamRef.current;

      const defaultIndex = latestIsReversed ? data.episodes.length - 1 : 0;
      const episodeIndex = latestEpisodeParam ? parseInt(latestEpisodeParam, 10) : defaultIndex;
      const validIndex = (episodeIndex >= 0 && episodeIndex < data.episodes.length) ? episodeIndex : defaultIndex;

      const episodeUrl = data.episodes[validIndex].url;
      setCurrentEpisode(validIndex);
      setPlayUrl(episodeUrl);
    } else {
      setVideoError('该来源没有可播放的剧集');
      setLoading(false);
    }
  }, []);

  const fetchVideoDetails = useCallback(async () => {
    if (!videoId || !source) return;

    try {
      // Don't clear error immediately if we are just retrying silently, 
      // but for manual retry or initial load we should.
      // Let's clear it to show loading state if we want, or keep it.
      // Standard behavior: clear error and show loading.
      setVideoError('');
      setLoading(true);

      // 先渲染本地短期缓存：详情请求未返回前也能看到播放器与选集，
      // 随后仍然请求网络，保证剧集信息是最新的
      if (!hasPlayableDataRef.current) {
        const cached = readDetailCache(videoId, source);
        if (cached) {
          applyVideoDetail(cached);
        }
      }

      const settings = settingsStore.getSettings();
      const allSources = [
        ...settings.sources,
        ...settings.premiumSources,
        ...settings.subscriptions,
        ...userSourcesStore.getSources(),
      ];

      const sourceConfig = allSources.find(s => s.id === source);
      let response;

      if (sourceConfig) {
        response = await fetch('/api/detail', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: videoId, source: sourceConfig })
        });
      } else {
        response = await fetch(`/api/detail?id=${videoId}&source=${source}`);
      }

      const data = await response.json();
      const sourceUnavailable =
        response.status === 404 ||
        (response.status === 400 && typeof data?.error === 'string' && data.error.toLowerCase().includes('source')) ||
        (typeof data?.error === 'string' && data.error.includes('视频源不可用'));

      if (!response.ok) {
        if (sourceUnavailable) {
          setVideoError(data.error || '该视频源不可用。请返回并尝试其他来源。');
          setLoading(false);
          onSourceUnavailableRef.current?.();
          return;
        }
        throw new Error(data.error || `HTTP ${response.status}: ${response.statusText}`);
      }

      if (data.success && data.data) {
        // 只有拿得到剧集时才缓存，避免把「该来源没有可播放的剧集」长期固化
        if (data.data.episodes && data.data.episodes.length > 0) {
          writeDetailCache(videoId, source, data.data);
        }
        applyVideoDetail(data.data);
      } else {
        throw new Error(data.error || '来自 API 的响应无效');
      }
    } catch (error) {
      console.error('Failed to fetch video details:', error);
      setVideoError(error instanceof Error ? error.message : '加载视频详情失败。');
      setLoading(false);
    }
  }, [videoId, source, applyVideoDetail]);

  // EFFECT: Retry logic when settings change (e.g., sources loaded from subscriptions)
  useEffect(() => {
    if (!videoId || !source || !videoError) return;

    const unsubscribe = settingsStore.subscribe(() => {
      // If we are currently in an error state (likely "Invalid source configuration"),
      // and settings updated (likely new sources arrived), try fetching again.
      // We can be smarter: check if the source ID now exists in the store.
      const settings = settingsStore.getSettings();
      const allSources = [
        ...settings.sources,
        ...settings.premiumSources,
        ...settings.subscriptions, // note: subscription items aren't usually video sources directly but let's check broadly
      ];

      // We really need to check if the specific source ID is now available
      // But since 'subscriptions' in store expands into 'sources'/'premiumSources',
      // we just check if any sources exist now.
      if (allSources.length > 0) {
        console.log("Settings updated, retrying video fetch...");
        fetchVideoDetails();
      }
    });

    return () => unsubscribe();
  }, [videoId, source, videoError, fetchVideoDetails]);

  // Sync state from params if they change externally (e.g. back/forward navigation)
  useEffect(() => {
    if (videoData?.episodes && episodeParam !== null) {
      const index = parseInt(episodeParam, 10);
      if (!isNaN(index) && index >= 0 && index < videoData.episodes.length) {
        if (index !== currentEpisode) {
          setCurrentEpisode(index);
          setPlayUrl(videoData.episodes[index].url);
        }
      }
    }
  }, [episodeParam, videoData, currentEpisode]);

  useEffect(() => {
    if (videoId && source) {
      // 已有播放数据时属于切换源：保留当前视频与选集，
      // 等新源详情返回后再整体替换，避免页面回到加载态
      if (!hasPlayableDataRef.current) {
        setVideoData(null);
        setCurrentEpisode(0);
        setPlayUrl('');
      }
      fetchVideoDetails();
    }
  }, [videoId, source, fetchVideoDetails]);

  return {
    videoData,
    loading,
    videoError,
    currentEpisode,
    playUrl,
    setCurrentEpisode,
    setPlayUrl,
    setVideoError,
    fetchVideoDetails,
  };
}
