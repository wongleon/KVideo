
/**
 * Utility functions for M3U8 playlist manipulation
 */

import {
    parseBlocks,
    learnMainPattern,
    scoreBlock,
    shouldFilterBlock,
    findDuplicateSignatureBlockIndices,
} from './m3u8-ad-detector';

const INTERSTITIAL_DATERANGE_MARKERS = [
    'class="com.apple.hls.interstitial"',
    'x-asset-uri=',
    'x-asset-list=',
    'x-playout-limit=',
    'x-resume-offset=',
    'x-restrict=',
    'cue="once"',
];

const AUXILIARY_AD_TAG_PREFIXES = [
    '#EXT-X-ASSET:',
    '#EXT-X-CUE-OUT-CONT',
    '#EXT-X-PLACEMENT-OPPORTUNITY',
    '#EXT-OATCLS-SCTE35',
    '#EXT-X-SCTE35',
];

const SEGMENT_METADATA_PREFIXES = [
    '#EXTINF:',
    '#EXT-X-BYTERANGE:',
    '#EXT-X-DISCONTINUITY',
    '#EXT-X-PROGRAM-DATE-TIME:',
];

/**
 * 分片「自带」的元数据标签。
 * 与 SEGMENT_METADATA_PREFIXES 的区别：这里刻意不含 #EXT-X-DISCONTINUITY，
 * 因为它是块分隔符，删除分片时必须保留，否则会把两段不同来源的内容当成连续时间轴。
 */
const SEGMENT_OWNED_METADATA_PREFIXES = [
    '#EXTINF:',
    '#EXT-X-BYTERANGE:',
    '#EXT-X-PROGRAM-DATE-TIME:',
];

function normalizeKeywords(keywords: string[]): string[] {
    return [...new Set(
        keywords
            .map((keyword) => keyword.trim().toLowerCase())
            .filter((keyword) => keyword.length > 0)
    )];
}

function hasKeywordMatch(line: string, normalizedKeywords: string[]): boolean {
    if (normalizedKeywords.length === 0) {
        return false;
    }

    const lowerLine = line.toLowerCase();
    return normalizedKeywords.some((keyword) => lowerLine.includes(keyword));
}

function isInterstitialDateRange(trimmedLine: string, normalizedKeywords: string[]): boolean {
    if (!trimmedLine.startsWith('#EXT-X-DATERANGE:')) {
        return false;
    }

    const lowerLine = trimmedLine.toLowerCase();
    return INTERSTITIAL_DATERANGE_MARKERS.some((marker) => lowerLine.includes(marker)) ||
        hasKeywordMatch(trimmedLine, normalizedKeywords);
}

function isAuxiliaryAdMetadataLine(trimmedLine: string, normalizedKeywords: string[]): boolean {
    return AUXILIARY_AD_TAG_PREFIXES.some((prefix) => trimmedLine.startsWith(prefix)) ||
        (trimmedLine.startsWith('#EXT-X-DATERANGE:') && hasKeywordMatch(trimmedLine, normalizedKeywords));
}

/**
 * 把「删除分片」扩展为「删除该分片自带的元数据行」。
 *
 * 一个分片在 m3u8 里通常由以下几行组成：
 *   #EXTINF:6.006,
 *   #EXT-X-BYTERANGE:1234@0            （可选）
 *   #EXT-X-PROGRAM-DATE-TIME:...       （可选）
 *   segment.ts
 *
 * 如果只删 URI 和 EXTINF，残留的 BYTERANGE 会被挂到下一个分片上，
 * 让播放器按错误的字节偏移读取一个完整分片，解析失败后触发重试；
 * 残留的 PROGRAM-DATE-TIME 也会让后续时间戳错乱。
 */
function expandRemovalToOwnedMetadata(
    lines: string[],
    segmentLineIndices: number[],
    adLineIndices: Set<number>,
): void {
    const sorted = [...segmentLineIndices].sort((a, b) => a - b);

    for (let index = 0; index < sorted.length; index += 1) {
        const lineIndex = sorted[index];
        if (!adLineIndices.has(lineIndex)) continue;

        // 上界为上一个分片的 URI 行，避免把别人的元数据一起删掉
        const lowerBound = index > 0 ? sorted[index - 1] + 1 : 0;

        for (let cursor = lineIndex - 1; cursor >= lowerBound; cursor -= 1) {
            const trimmed = lines[cursor]?.trim() ?? '';
            if (!trimmed) {
                adLineIndices.add(cursor);
                continue;
            }
            if (SEGMENT_OWNED_METADATA_PREFIXES.some((prefix) => trimmed.startsWith(prefix))) {
                adLineIndices.add(cursor);
                continue;
            }
            break;
        }
    }
}

/**
 * Filters ads from specific M3U8 content using multiple detection strategies:
 * 1. Keyword matching (configurable via env)
 * 2. CUE-OUT/CUE-IN standard tags
 * 3. HLS interstitial metadata removal
 * 4. Heuristic block analysis (filename patterns, ad path keywords, duration signature fingerprints)
 * 
 * Also converts relative URLs to absolute URLs for Blob playback.
 * 
 * @param content The raw M3U8 content string
 * @param baseUrl The base URL of the M3U8 file (to resolve relative paths)
 * @returns The filtered M3U8 content
 */
export type AdFilterMode = 'off' | 'keyword' | 'heuristic' | 'aggressive';

export function filterM3u8Ad(
    content: string,
    baseUrl: string,
    mode: AdFilterMode = 'heuristic',
    customKeywords: string[] = []
): string {
    if (!content) return '';
    if (mode === 'off') return content;

    // Use keywords passed from AdKeywordsWrapper (already loaded from env/file)
    const normalizedKeywords = normalizeKeywords(customKeywords);

    // Unwrap baseUrl if it's a proxy URL to get correct basePath and origin
    let effectiveBaseUrl = baseUrl;
    if (baseUrl.includes('/api/proxy?url=')) {
        try {
            const urlMatch = baseUrl.match(/[?&]url=([^&]+)/);
            if (urlMatch && urlMatch[1]) {
                effectiveBaseUrl = decodeURIComponent(urlMatch[1]);
            }
        } catch { /* ignore */ }
    }

    const basePath = effectiveBaseUrl.substring(0, effectiveBaseUrl.lastIndexOf('/') + 1);
    let origin = '';
    try {
        origin = new URL(effectiveBaseUrl).origin;
    } catch { /* ignore */ }

    // 2. Global Scan: Check if any ad keywords exist in the content
    const hasKeywordMatchInPlaylist = hasKeywordMatch(content, normalizedKeywords);
    const hasCueTag = content.includes('#EXT-X-CUE-OUT') || content.includes('#EXT-X-CUE-IN');

    // 3. Heuristic Analysis: If no explicit ad signals, use block-based detection
    const lines = content.split(/\r?\n/);
    const adLineIndices = new Set<number>();

    if (!hasCueTag && (mode === 'heuristic' || mode === 'aggressive')) {
        // No obvious ad signals - run heuristic analysis
        const blocks = parseBlocks(lines);
        if (blocks.length > 0) {
            const mainPattern = learnMainPattern(blocks);
            const duplicateIndices = findDuplicateSignatureBlockIndices(blocks);

            for (let blockIdx = 0; blockIdx < blocks.length; blockIdx++) {
                const block = blocks[blockIdx];
                const isDuplicate = duplicateIndices.has(blockIdx);
                // Pass all keywords (including custom ones) to heuristic scorer
                const score = scoreBlock(block, mainPattern, normalizedKeywords, isDuplicate);
                const threshold = mode === 'aggressive' ? 3.0 : 5.0;

                if (shouldFilterBlock(score, threshold)) {
                    // 这里只标记分片 URI，自带的元数据行在循环结束后统一补齐
                    for (const segment of block.segments) {
                        adLineIndices.add(segment.lineIndex);
                    }
                } else if (block.segments.length > 0) {
                    // Segment-level detection:
                    // Even if the whole block didn't trigger, check segments individually
                    // if it's a suspicious single-segment "block" (common for ads without discontinuity)
                    for (const segment of block.segments) {
                        const singleSegmentBlock = {
                            segments: [segment],
                            hasCueTag: false,
                            startLineIndex: segment.lineIndex - 1,
                            endLineIndex: segment.lineIndex
                        };
                        const segmentScore = scoreBlock(singleSegmentBlock, mainPattern, normalizedKeywords);
                        // Higher threshold for individual segments to avoid false positives
                        if (segmentScore >= 4.0) {
                            adLineIndices.add(segment.lineIndex);
                        }
                    }
                }
            }

            // 分片 URI 标记完成后，把分片自带的 EXTINF / BYTERANGE /
            // PROGRAM-DATE-TIME 一并删除，避免残留标签错配到下一个分片
            const segmentLineIndices: number[] = [];
            for (const block of blocks) {
                for (const segment of block.segments) {
                    segmentLineIndices.push(segment.lineIndex);
                }
            }
            expandRemovalToOwnedMetadata(lines, segmentLineIndices, adLineIndices);
        }
    }

    const processedLines: string[] = [];
    let hasKeptMediaLine = false;

    // State machine for CUE-OUT/CUE-IN tracking
    let insideCueAdBlock = false;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmedLine = line.trim();

        // Skip lines marked by heuristic analysis
        if (adLineIndices.has(i)) {
            continue;
        }

        // 4. Strip modern HLS interstitial metadata before the player can schedule it.
        if (
            isInterstitialDateRange(trimmedLine, normalizedKeywords) ||
            isAuxiliaryAdMetadataLine(trimmedLine, normalizedKeywords)
        ) {
            continue;
        }

        // 5. CUE Tag Detection (SCTE-35 Standard)
        // EXT-X-CUE-OUT marks start of ad, EXT-X-CUE-IN marks end
        if (trimmedLine.startsWith('#EXT-X-CUE-OUT')) {
            insideCueAdBlock = true;
            // Remove preceding DISCONTINUITY if present
            if (processedLines.length > 0 && processedLines[processedLines.length - 1].trim() === '#EXT-X-DISCONTINUITY') {
                processedLines.pop();
            }
            continue; // Skip the CUE-OUT tag itself
        }

        if (trimmedLine.startsWith('#EXT-X-CUE-IN')) {
            insideCueAdBlock = false;
            // Also skip the next line if it's a DISCONTINUITY (ad block ending marker)
            if (i + 1 < lines.length && lines[i + 1].trim() === '#EXT-X-DISCONTINUITY') {
                i++; // Skip the following DISCONTINUITY
            }
            continue; // Skip the CUE-IN tag itself
        }

        // Skip all content inside CUE ad block
        if (insideCueAdBlock) {
            continue;
        }

        // 6. Keyword-based Ad Detection & Backtrack (skip if no keywords configured)
        if (
            normalizedKeywords.length > 0 &&
            hasKeywordMatchInPlaylist &&
            hasKeywordMatch(trimmedLine, normalizedKeywords)
        ) {
            // Found Ad: Remove it and backtrack to remove associated metadata
            while (processedLines.length > 0) {
                const lastIndex = processedLines.length - 1;
                const lastLine = processedLines[lastIndex].trim();

                if (SEGMENT_METADATA_PREFIXES.some((prefix) => lastLine.startsWith(prefix))) {
                    processedLines.pop();
                } else {
                    break;
                }
            }
            continue; // Skip the ad line itself
        }

        // 7. Discontinuity Handling (Conservative Mode)
        // Keep all Discontinuity tags by default.
        // They will ONLY be removed via backtracking when a confirmed ad segment is found.
        // This prevents false positives on legitimate concatenated streams.
        if (trimmedLine === '#EXT-X-DISCONTINUITY') {
            if (
                !hasKeptMediaLine ||
                processedLines[processedLines.length - 1].trim() === '#EXT-X-DISCONTINUITY'
            ) {
                continue;
            }
            processedLines.push(line);
            continue;
        }

        // 8. General Cleanup & URL Normalization
        if (!trimmedLine || trimmedLine.startsWith('http') || trimmedLine.startsWith('blob:')) {
            processedLines.push(line);
            if (trimmedLine && !trimmedLine.startsWith('#')) {
                hasKeptMediaLine = true;
            }
            continue;
        }

        if (trimmedLine.startsWith('#')) {
            // Handle URI="..." in attributes (e.g. #EXT-X-KEY)
            if (trimmedLine.includes('URI="')) {
                processedLines.push(line.replace(/URI="([^"]+)"/g, (match, uri) => {
                    if (uri.startsWith('http')) return match; // Already absolute
                    if (uri.startsWith('/')) {
                        return `URI="${origin}${uri}"`; // Root-relative
                    }
                    return `URI="${basePath}${uri}"`; // Path-relative
                }));
            } else {
                processedLines.push(line);
            }
            continue;
        }

        // 9. Resolve Relative URLs (for Blob support)
        if (trimmedLine.startsWith('/')) {
            processedLines.push(origin ? `${origin}${trimmedLine}` : trimmedLine);
        } else {
            processedLines.push(`${basePath}${trimmedLine}`);
        }
        hasKeptMediaLine = true;
    }

    while (
        processedLines.length > 0 &&
        processedLines[processedLines.length - 1].trim() === '#EXT-X-DISCONTINUITY'
    ) {
        processedLines.pop();
    }

    return processedLines.join('\n');
}
