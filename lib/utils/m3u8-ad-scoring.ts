import {
    isSmallIntegerDurationBlock,
    isSmallNtscLikeBlock,
} from './m3u8-duration-grid';
import { extractFilename, extractSegmentLocation } from './m3u8-ad-pattern';
import type { Block, MainPattern } from './m3u8-ad-types';

export const AD_PATH_KEYWORDS = [
    'advert', 'preroll', 'midroll', 'postroll',
    'dai', 'vast', 'ima', 'adjump', 'commercial', 'sponsor',
];

function scoreKeywords(block: Block, extraKeywords: string[]): number {
    const keywords = [
        ...AD_PATH_KEYWORDS,
        ...extraKeywords.filter(keyword => keyword.length > 2),
    ];

    return block.segments.reduce((score, segment) => {
        const url = segment.url.toLowerCase();
        return keywords.some(keyword => url.includes(keyword.toLowerCase()))
            ? score + 2.5
            : score;
    }, 0);
}

function scoreFilenameMismatch(block: Block, mainPattern: MainPattern): number {
    if (!mainPattern.filenameRegex || block.segments.length === 0) return 0;

    const allMismatch = block.segments.every(segment => (
        !mainPattern.filenameRegex?.test(extractFilename(segment.url))
    ));
    return allMismatch ? 1.5 : 0;
}

function scoreLocationMismatch(block: Block, mainPattern: MainPattern): number {
    if ((!mainPattern.pathPrefix && !mainPattern.origin) || block.segments.length === 0) {
        return 0;
    }

    const locations = block.segments.map(segment => extractSegmentLocation(segment.url));
    const allPathsMismatch = locations.every(location => (
        location.pathPrefix !== mainPattern.pathPrefix
    ));
    // 路径前缀不一致属于「弱证据」：正常的多 CDN 轮转内容同样会命中，
    // 若单条就达到 heuristic 阈值（5 分），会造成整块误删并在时间轴留下空洞。
    // 降到 3.5 后仍需叠加关键词、命名或时长异常才会删除；
    // aggressive 模式阈值是 3 分，这条规则仍可单独触发，激进过滤不受影响。
    if (allPathsMismatch) return 3.5;

    const allOriginsMismatch = locations.every(location => (
        Boolean(mainPattern.origin && location.origin) && location.origin !== mainPattern.origin
    ));
    return allOriginsMismatch ? 3.5 : 0;
}

function scoreDurationMismatch(block: Block, mainPattern: MainPattern): number {
    if (mainPattern.avgDuration <= 0 || block.segments.length === 0 || block.segments.length > 6) {
        return 0;
    }

    const blockAverage = block.segments.reduce((sum, segment) => (
        sum + segment.duration
    ), 0) / block.segments.length;
    const durationRatio = blockAverage / mainPattern.avgDuration;
    return durationRatio < 0.6 || durationRatio > 1.8 ? 1.5 : 0;
}

function scoreDurationGrid(block: Block, mainPattern: MainPattern): number {
    if (!mainPattern.usesNtscLikeGrid && isSmallNtscLikeBlock(block.segments)) {
        return 3.5;
    }
    if (mainPattern.usesFilm24LikeGrid && isSmallIntegerDurationBlock(block.segments)) {
        return 3.5;
    }
    return 0;
}

export function scoreBlock(
    block: Block,
    mainPattern: MainPattern,
    extraKeywords: string[] = [],
    isDuplicateSignature: boolean = false,
): number {
    if (block.hasCueTag || isDuplicateSignature) return 10;

    return scoreKeywords(block, extraKeywords) +
        scoreFilenameMismatch(block, mainPattern) +
        scoreLocationMismatch(block, mainPattern) +
        scoreDurationMismatch(block, mainPattern) +
        scoreDurationGrid(block, mainPattern);
}

export const THRESHOLDS = {
    HIGH: 5,
    LOW: 3,
};

export function shouldFilterBlock(
    score: number,
    threshold: number = THRESHOLDS.HIGH,
): boolean {
    return score >= threshold;
}
