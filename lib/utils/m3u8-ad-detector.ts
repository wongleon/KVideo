import type { Block } from './m3u8-ad-types';

export type { Block, MainPattern, Segment } from './m3u8-ad-types';
export { learnMainPattern } from './m3u8-ad-pattern';
export { findDuplicateSignatureBlockIndices } from './m3u8-ad-signatures';
export {
    AD_PATH_KEYWORDS,
    scoreBlock,
    shouldFilterBlock,
    THRESHOLDS,
} from './m3u8-ad-scoring';

export function parseBlocks(lines: string[]): Block[] {
    const blocks: Block[] = [];
    let currentBlock: Block = {
        segments: [],
        startLineIndex: 0,
        endLineIndex: 0,
        hasCueTag: false,
    };

    for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index].trim();

        if (line.startsWith('#EXT-X-CUE-OUT') || line.startsWith('#EXT-X-CUE-IN')) {
            currentBlock.hasCueTag = true;
        }

        if (line === '#EXT-X-DISCONTINUITY') {
            if (currentBlock.segments.length > 0) {
                currentBlock.endLineIndex = index - 1;
                blocks.push(currentBlock);
            }
            currentBlock = {
                segments: [],
                startLineIndex: index + 1,
                endLineIndex: 0,
                hasCueTag: false,
            };
            continue;
        }

        if (!line.startsWith('#EXTINF:')) continue;

        const durationMatch = line.match(/#EXTINF:([\d.]+)/);
        const duration = durationMatch ? Number.parseFloat(durationMatch[1]) : 0;

        // #EXTINF 与分片 URI 之间允许出现 #EXT-X-BYTERANGE / #EXT-X-PROGRAM-DATE-TIME
        // 等标签；只看下一行会把这类分片整段漏掉，导致广告过滤对其完全不生效。
        let urlIndex = index + 1;
        while (urlIndex < lines.length) {
            const candidate = lines[urlIndex].trim();
            if (!candidate || candidate === '#EXT-X-DISCONTINUITY') break;
            if (!candidate.startsWith('#')) break;
            if (candidate.startsWith('#EXTINF:')) break;
            urlIndex += 1;
        }

        const url = lines[urlIndex]?.trim();
        if (url && !url.startsWith('#')) {
            currentBlock.segments.push({
                url,
                duration,
                lineIndex: urlIndex,
            });
        }
    }

    if (currentBlock.segments.length > 0) {
        currentBlock.endLineIndex = lines.length - 1;
        blocks.push(currentBlock);
    }

    return blocks;
}
