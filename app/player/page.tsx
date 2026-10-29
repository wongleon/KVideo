'use client';

import { Suspense, useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { VideoPlayer } from '@/components/player/VideoPlayer';
import { VideoMetadata } from '@/components/player/VideoMetadata';
import { EpisodeList } from '@/components/player/EpisodeList';
import { PlayerError } from '@/components/player/PlayerError';
import { SourceInfo } from '@/components/player/EpisodeList';
import type { VideoSource } from '@/lib/types';
import type { VideoResolutionInfo } from '@/components/player/hooks/useVideoResolution';
import { useResolutionProbe } from '@/lib/hooks/useResolutionProbe';
import { setCachedResolution } from '@/lib/player/resolution-cache';
import { useVideoPlayer } from '@/lib/hooks/useVideoPlayer';
import { useHistory } from '@/lib/store/history-store';
import { FavoriteButton } from '@/components/favorites/FavoriteButton';
import { MobileVideoInfo } from '@/components/player/MobileVideoInfo';
import { YouMayAlsoLike } from '@/components/player/YouMayAlsoLike';
import { htmlToText } from '@/lib/utils/html';
import { settingsStore } from '@/lib/store/settings-store';
import { userSourcesStore } from '@/lib/store/user-sources-store';
import { premiumModeSettingsStore } from '@/lib/store/premium-mode-settings';
import { getSourceName } from '@/lib/utils/source-names';
import { retrieveGroupedSources, storeGroupedSources } from '@/lib/utils/grouped-sources-cache';

type PlayerViewportMode = 'standard' | 'wide' | 'cinema';

const PLAYER_VIEWPORT_MODE_KEY = 'kvideo-player-viewport-mode';
const PLAYER_VIEWPORT_MODE_ORDER: PlayerViewportMode[] = ['standard', 'wide', 'cinema'];

function PlayerContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const isPremium = searchParams.get('premium') === '1';
  const { addToHistory, updateHistorySources } = useHistory(isPremium);

  const videoId = searchParams.get('id');
  const source = searchParams.get('source');
  const title = searchParams.get('title');
  const episodeParam = searchParams.get('episode');
  // Support both legacy 'groupedSources' (full JSON) and new 'gs' (sessionStorage key)
  const groupedSourcesParam = searchParams.get('groupedSources');
  const gsKey = searchParams.get('gs');
  const missingRequiredParams = !videoId || !source;

  // Track settings - use mode-specific store
  const modeStore = isPremium ? premiumModeSettingsStore : settingsStore;
  const [isReversed, setIsReversed] = useState(() =>
    typeof window !== 'undefined' ? modeStore.getSettings().episodeReverseOrder : false
  );

  // 播放窗口大小（沿用本地已保存的偏好，桌面端切换入口已移除）
  const [playerViewportMode] = useState<PlayerViewportMode>(() => {
    if (typeof window === 'undefined') return 'standard';
    const saved = localStorage.getItem(PLAYER_VIEWPORT_MODE_KEY);
    return saved === 'wide' || saved === 'cinema' || saved === 'standard' ? saved : 'standard';
  });
  const [isSourceSectionCollapsed, setIsSourceSectionCollapsed] = useState(false);
  const [isEpisodeSectionCollapsed, setIsEpisodeSectionCollapsed] = useState(false);

  // Sync with store changes if any (though usually it's one-way from UI to store)
  useEffect(() => {
    setIsReversed(modeStore.getSettings().episodeReverseOrder);
  }, [modeStore]);

  useEffect(() => {
    localStorage.setItem(PLAYER_VIEWPORT_MODE_KEY, playerViewportMode);
  }, [playerViewportMode]);

  // Migrate legacy long groupedSources URL to short gs key
  useEffect(() => {
    if (groupedSourcesParam && !gsKey) {
      try {
        const data = JSON.parse(groupedSourcesParam);
        if (Array.isArray(data) && data.length > 0) {
          const newKey = storeGroupedSources(data);
          if (newKey) {
            const params = new URLSearchParams(searchParams.toString());
            params.delete('groupedSources');
            params.set('gs', newKey);
            router.replace(`/player?${params.toString()}`, { scroll: false });
          }
        }
      } catch { /* ignore parse errors */ }
    }
  }, [groupedSourcesParam, gsKey, router, searchParams]);

  useEffect(() => {
    if (missingRequiredParams) {
      router.push('/');
    }
  }, [missingRequiredParams, router]);

  const [pendingFallback, setPendingFallback] = useState(false);
  const [discoveredSources, setDiscoveredSources] = useState<SourceInfo[]>([]);
  const groupedSourcesRef = useRef<SourceInfo[]>([]);

  const handleSourceUnavailable = useCallback(() => {
    const groupedSources = groupedSourcesRef.current;
    const alternatives = groupedSources.filter((item) => item.source !== source);
    if (alternatives.length === 0) {
      setPendingFallback(true);
      return;
    }

    setPendingFallback(false);
    const best = [...alternatives].sort((left, right) => {
      const latA = left.latency ?? Infinity;
      const latB = right.latency ?? Infinity;
      return latA - latB;
    })[0];

    const params = new URLSearchParams();
    params.set('id', String(best.id));
    params.set('source', best.source);
    params.set('title', title || '');
    if (episodeParam) params.set('episode', episodeParam);
    if (gsKey) {
      params.set('gs', gsKey);
    } else if (groupedSources.length > 1) {
      const newKey = storeGroupedSources(groupedSources);
      if (newKey) params.set('gs', newKey);
    }
    if (isPremium) params.set('premium', '1');
    router.replace(`/player?${params.toString()}`, { scroll: false });
  }, [episodeParam, gsKey, isPremium, router, source, title]);

  const {
    videoData,
    loading,
    videoError,
    currentEpisode,
    playUrl,
    setCurrentEpisode,
    setPlayUrl,
    setVideoError,
    fetchVideoDetails,
  } = useVideoPlayer(videoId, source, episodeParam, isReversed, handleSourceUnavailable);

  const groupedSources = useMemo<SourceInfo[]>(() => {
    let sources: SourceInfo[] = [];

    if (gsKey) {
      const cached = retrieveGroupedSources(gsKey);
      if (cached) sources = cached;
    } else if (groupedSourcesParam) {
      try {
        sources = JSON.parse(groupedSourcesParam);
      } catch {
        sources = [];
      }
    }

    if (discoveredSources.length > 0) {
      for (const ds of discoveredSources) {
        if (!sources.find((item) => item.source === ds.source)) {
          sources.push(ds);
        }
      }
    }

    if (source && !sources.find((item) => item.source === source && String(item.id) === String(videoId))) {
      sources.unshift({
        id: videoId || '',
        source,
        pic: videoData?.vod_pic,
      });
    }

    // 统一补齐线路名称：优先使用源配置里的 name，其次回退到内置映射表。
    // 缓存或 URL 带过来的旧线路可能缺少 sourceName，避免直接显示成 ID。
    const settings = settingsStore.getSettings();
    const configSources = isPremium ? settings.premiumSources : settings.sources;
    const configuredNames = new Map<string, string>(
      [...(configSources ?? []), ...userSourcesStore.getSources()].map((item) => [item.id, item.name])
    );

    sources = sources.map((item) => ({
      ...item,
      sourceName:
        item.sourceName?.trim() ||
        configuredNames.get(item.source)?.trim() ||
        getSourceName(item.source),
    }));

    const fallbackPic = videoData?.vod_pic;
    if (fallbackPic) {
      sources = sources.map((item) => item.pic ? item : { ...item, pic: fallbackPic });
    }

    return sources;
  }, [discoveredSources, groupedSourcesParam, gsKey, source, videoData?.vod_pic, videoId, isPremium]);

  useEffect(() => {
    groupedSourcesRef.current = groupedSources;
  }, [groupedSources]);

  // Retry pending fallback when discovered sources arrive
  useEffect(() => {
    if (pendingFallback && discoveredSources.length > 0) {
      handleSourceUnavailable();
    }
  }, [discoveredSources, handleSourceUnavailable, pendingFallback]);

  // Background fetch alternative sources when none provided or when existing ones lack full info
  const fetchedSourcesRef = useRef(false);
  useEffect(() => {
    if (fetchedSourcesRef.current || !title) return;

    // Check if existing grouped sources already have full info (pic + latency)
    let existingSources: SourceInfo[] = [];
    if (gsKey) {
      const cached = retrieveGroupedSources(gsKey);
      if (cached) existingSources = cached;
    } else if (groupedSourcesParam) {
      try { existingSources = JSON.parse(groupedSourcesParam); } catch {}
    }
    // Always fetch alternatives if there's a pending fallback (source unavailable)
    // 只有每个源都带有延迟信息才视为数据完整；历史/收藏传入的线路只有海报，
    // 需要再补全一次，保证与从搜索进入播放页时的源列表一致
    const hasFullInfo = !pendingFallback && existingSources.length > 1 &&
      existingSources.every(s => s.latency !== undefined);
    if (hasFullInfo) return;

    fetchedSourcesRef.current = true;

    const settings = settingsStore.getSettings();
    const sourcesForMode = isPremium ? settings.premiumSources : settings.sources;
    // 用户自定义源同样参与搜索，否则从历史进入时线路会被漏掉
    const allSources = [
      ...(sourcesForMode ?? []),
      ...userSourcesStore.getSources(),
    ].filter((s: VideoSource) => s.enabled !== false);
    // Only search other sources (not the current one)
    const otherSources = allSources.filter((s: VideoSource) => s.id !== source);
    if (otherSources.length === 0) return;

    const controller = new AbortController();
    // 请求被中断时允许重新发起（例如 React 严格模式下的首次挂载会被立即清理）
    let finished = false;

    (async () => {
      try {
        const response = await fetch('/api/search-parallel', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: title, sources: otherSources, page: 1 }),
          signal: controller.signal,
        });
        if (!response.ok || !response.body) return;

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        const found: SourceInfo[] = [];
        const normalizedTitle = title.toLowerCase().trim();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            try {
              const data = JSON.parse(line.slice(6));
              if (data.type === 'videos' && data.videos) {
                // Find exact or close title match
                const match = data.videos.find((v: {
                  vod_name?: string;
                  vod_id: string | number;
                  source: string;
                  sourceDisplayName?: string;
                  latency?: number;
                  vod_pic?: string;
                  type_name?: string;
                  vod_remarks?: string;
                }) =>
                  v.vod_name?.toLowerCase().trim() === normalizedTitle
                );
                if (match) {
                  found.push({
                    id: match.vod_id,
                    source: match.source,
                    sourceName: match.sourceDisplayName || getSourceName(match.source),
                    latency: match.latency,
                    pic: match.vod_pic,
                    typeName: match.type_name,
                    remarks: match.vod_remarks,
                  });
                  // Update state incrementally
                  setDiscoveredSources([...found]);
                }
              }
            } catch { /* ignore parse errors */ }
          }
        }
      } catch {
        // Silently ignore - this is a background enhancement
      } finally {
        finished = true;
      }
    })();

    return () => {
      controller.abort();
      if (!finished) {
        fetchedSourcesRef.current = false;
      }
    };
  }, [groupedSourcesParam, gsKey, isPremium, pendingFallback, source, title]);

  // Track current source for switching
  const [currentSourceId, setCurrentSourceId] = useState(source);
  const playerTimeRef = useRef(0);

  useEffect(() => {
    setCurrentSourceId(source);
  }, [source]);

  // Track detected video resolution from the player
  const [detectedResolution, setDetectedResolution] = useState<VideoResolutionInfo | null>(null);

  // Probe resolution for all grouped sources (not just the playing one)
  const probeList = useMemo(() => {
    return groupedSources.map((item) => ({
      id: item.id,
      source: item.source,
      episodeIndex: currentEpisode,
    }));
  }, [groupedSources, currentEpisode]);
  const { resolutions: sourceResolutions } = useResolutionProbe(probeList);

  const handleResolutionDetected = useCallback((info: VideoResolutionInfo) => {
    setDetectedResolution(info);
    if (videoId && source) {
      setCachedResolution(source, videoId, {
        ...info,
        origin: 'played',
        episodeIndex: currentEpisode,
      });
    }
  }, [currentEpisode, source, videoId]);

  // Add initial history entry when video data is loaded
  useEffect(() => {
    if (videoData && playUrl && videoId && source) {
      // Map episodes to include index
      const mappedEpisodes = videoData.episodes?.map((ep, idx) => ({
        name: ep.name || `第${idx + 1}集`,
        url: ep.url,
        index: idx,
      })) || [];

      addToHistory(
        videoId,
        videoData.vod_name || title || '未知视频',
        playUrl,
        currentEpisode,
        source,
        0, // Initial playback position
        0, // Will be updated by VideoPlayer
        videoData.vod_pic,
        mappedEpisodes,
        { vod_actor: videoData.vod_actor, type_name: videoData.type_name, vod_area: videoData.vod_area }
      );
    }
  }, [videoData, playUrl, videoId, currentEpisode, source, title, addToHistory]);

  // 把已知的完整线路列表写回历史记录，保证从历史进入播放页时源列表与之前一致
  useEffect(() => {
    if (!videoData || !playUrl) return;

    updateHistorySources(
      videoData.vod_name || title || '未知视频',
      groupedSources.map((item) => ({
        id: item.id,
        source: item.source,
        sourceName: item.sourceName,
      }))
    );
  }, [groupedSources, playUrl, title, updateHistorySources, videoData]);

  const handleEpisodeClick = useCallback((episode: { url: string }, index: number) => {
    setCurrentEpisode(index);
    setPlayUrl(episode.url);
    setVideoError('');

    // Update URL to reflect current episode
    const params = new URLSearchParams(searchParams.toString());
    params.set('episode', index.toString());
    // 切换分集后，上一集残留的播放进度不再适用
    params.delete('t');
    router.replace(`/player?${params.toString()}`, { scroll: false });
  }, [searchParams, router, setCurrentEpisode, setPlayUrl, setVideoError]);

  const handleToggleReverse = (reversed: boolean) => {
    setIsReversed(reversed);
    const settings = modeStore.getSettings();
    modeStore.saveSettings({
      ...settings,
      episodeReverseOrder: reversed
    });
  };

  // Handle auto-next episode
  const handleNextEpisode = useCallback(() => {
    const episodes = videoData?.episodes;
    if (!episodes) return;

    let nextIndex;
    if (!isReversed) {
      if (currentEpisode >= episodes.length - 1) return;
      nextIndex = currentEpisode + 1;
    } else {
      if (currentEpisode <= 0) return;
      nextIndex = currentEpisode - 1;
    }

    const nextEpisode = episodes[nextIndex];
    if (nextEpisode) {
      handleEpisodeClick(nextEpisode, nextIndex); // handleEpisodeClick relies on state setters, which are stable
    }
  }, [currentEpisode, handleEpisodeClick, isReversed, videoData]);

  const effectivePlayerViewportMode = useMemo<PlayerViewportMode>(() => {
    const manualIndex = PLAYER_VIEWPORT_MODE_ORDER.indexOf(playerViewportMode);
    const collapsedCount = Number(isSourceSectionCollapsed) + Number(isEpisodeSectionCollapsed);
    const autoIndex = Math.min(collapsedCount, PLAYER_VIEWPORT_MODE_ORDER.length - 1);
    return PLAYER_VIEWPORT_MODE_ORDER[Math.max(manualIndex, autoIndex)];
  }, [playerViewportMode, isSourceSectionCollapsed, isEpisodeSectionCollapsed]);

  const playerGridClass = effectivePlayerViewportMode === 'cinema'
    ? 'xl:grid-cols-[minmax(0,1.9fr)_minmax(280px,0.55fr)]'
    : effectivePlayerViewportMode === 'wide'
      ? 'xl:grid-cols-[minmax(0,1.65fr)_minmax(300px,0.72fr)]'
      : 'xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.9fr)]';

  if (missingRequiredParams) {
    return null;
  }

  return (
    <div className="min-h-screen bg-[var(--bg-color)]">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-20 pt-3">
        {loading && !videoData ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="animate-spin rounded-full h-16 w-16 border-4 border-[var(--accent-color)] border-t-transparent mb-4"></div>
            <p className="text-[var(--text-color-secondary)]">正在加载视频详情...</p>
          </div>
        ) : videoError && !videoData ? (
          <PlayerError
            error={videoError}
            onBack={() => router.back()}
            onRetry={fetchVideoDetails}
          />
        ) : (
          <div className="space-y-4">
          <div className={`grid min-w-0 gap-2 lg:gap-6 lg:grid-cols-3 lg:items-start ${playerGridClass}`}>
            {/* Video Player Section */}
            <div className="min-w-0 lg:col-span-2 xl:col-span-1 space-y-4 lg:space-y-6">
              {/* 移动端滚动时播放器固定在顶部 */}
              <div className="max-lg:fixed max-lg:inset-x-0 max-lg:top-[env(safe-area-inset-top)] max-lg:z-40">
                <VideoPlayer
                  playUrl={playUrl}
                  videoId={videoId || undefined}
                  currentEpisode={currentEpisode}
                  onBack={() => router.back()}
                  totalEpisodes={videoData?.episodes?.length || 0}
                  onNextEpisode={handleNextEpisode}
                  isReversed={isReversed}
                  isPremium={isPremium}
                  videoTitle={videoData?.vod_name || title || ''}
                  episodeName={videoData?.episodes?.[currentEpisode]?.name || ''}
                  externalTimeRef={playerTimeRef}
                  onResolutionDetected={handleResolutionDetected}
                />
              </div>

              {/* 固定播放器脱离文档流后的高度占位 */}
              <div className="h-[calc(56.25vw+env(safe-area-inset-top))] lg:hidden" aria-hidden="true" />

              {/* 移动端信息区：标题 / 标签 / 简介 / 收藏 */}
              <MobileVideoInfo
                title={videoData?.vod_name || title || ''}
                year={videoData?.vod_year}
                area={videoData?.vod_area}
                lang={videoData?.vod_lang}
                typeName={videoData?.type_name}
                description={htmlToText(videoData?.vod_content)}
                favorite={videoData && videoId && source ? {
                  videoId,
                  source,
                  poster: videoData.vod_pic,
                  sourceMap: Object.fromEntries(
                    (groupedSources.length > 0 ? groupedSources : [{ id: videoId, source }]).map((item) => [item.source, item.id])
                  ),
                  isPremium,
                } : undefined}
              />

              {/* 桌面端信息卡片，收藏按钮定位在卡片右上角 */}
              <div className="hidden lg:block relative">
                <VideoMetadata
                  videoData={videoData}
                  source={source}
                  sourceName={groupedSources.find((item) => item.source === source)?.sourceName}
                  title={title}
                />
                {videoData && videoId && source && (
                  <div className="absolute top-4 right-4 md:top-6 md:right-6">
                    <FavoriteButton
                      videoId={videoId}
                      source={source}
                      title={videoData.vod_name || title || '未知视频'}
                      poster={videoData.vod_pic}
                      type={videoData.type_name}
                      year={videoData.vod_year}
                      sourceMap={Object.fromEntries(
                        (groupedSources.length > 0 ? groupedSources : [{ id: videoId, source }]).map((item) => [item.source, item.id])
                      )}
                      size={20}
                      isPremium={isPremium}
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Sidebar with sticky wrapper — top offset matches navbar height for alignment */}
            <div className="min-w-0 lg:col-span-1 max-lg:-mt-2">
              <div className="lg:sticky lg:top-28 space-y-6">
                {/* 选集与线路选择（移动端常显，桌面端位于侧栏） */}
                <EpisodeList
                    episodes={videoData?.episodes || null}
                    currentEpisode={currentEpisode}
                    isReversed={isReversed}
                    onEpisodeClick={handleEpisodeClick}
                    onToggleReverse={handleToggleReverse}
                    sources={groupedSources.length > 0 ? groupedSources : undefined}
                    currentSource={currentSourceId || source || ''}
                    currentSourceVideoId={videoId}
                    currentResolution={detectedResolution}
                    sourceResolutions={sourceResolutions}
                    sourceSectionCollapsed={isSourceSectionCollapsed}
                    onSourceSectionCollapseChange={setIsSourceSectionCollapsed}
                    episodeSectionCollapsed={isEpisodeSectionCollapsed}
                    onEpisodeSectionCollapseChange={setIsEpisodeSectionCollapsed}
                    onSourceChange={(newSource) => {
                      const params = new URLSearchParams();
                      params.set('id', String(newSource.id));
                      params.set('source', newSource.source);
                      params.set('title', title || '');
                      // Preserve current episode index
                      params.set('episode', currentEpisode.toString());
                      // Preserve playback position for seamless source switch
                      if (playerTimeRef.current > 1) {
                        params.set('t', Math.floor(playerTimeRef.current).toString());
                      }
                      // Store all known sources using short gs key
                      const allSources = groupedSources.length > 0 ? groupedSources : [];
                      if (allSources.length > 1) {
                        const newKey = storeGroupedSources(allSources);
                        if (newKey) params.set('gs', newKey);
                      } else if (gsKey) {
                        params.set('gs', gsKey);
                      }
                      if (isPremium) {
                        params.set('premium', '1');
                      }
                      setCurrentSourceId(newSource.source);
                      router.replace(`/player?${params.toString()}`, { scroll: false });
                    }}
                />
              </div>
            </div>
          </div>

          {/* 猜你喜欢：基于当前视频类型 / 演员 / 地区推荐 */}
          <YouMayAlsoLike
            title={videoData?.vod_name || title || ''}
            typeName={videoData?.type_name}
            actors={videoData?.vod_actor}
            area={videoData?.vod_area}
          />
          </div>
        )}
      </main>
    </div>
  );
}

export default function PlayerPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg-color)]">
        <div className="animate-spin rounded-full h-16 w-16 border-4 border-[var(--accent-color)] border-t-transparent"></div>
      </div>
    }>
      <PlayerContent />
    </Suspense>
  );
}
