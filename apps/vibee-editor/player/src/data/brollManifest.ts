/**
 * B-Roll Quality Manifest
 *
 * Maps video IDs to available quality levels for adaptive streaming.
 * Used by AdaptiveQualitySelector to pick optimal quality based on bandwidth.
 *
 * Quality Levels:
 * - 360p: 500 Kbps - Mobile/low bandwidth
 * - 720p: 1500 Kbps - Standard quality
 * - 1080p: 4000 Kbps - High quality
 *
 * URL Convention: /backgrounds/business/{id}_{quality}.mp4
 */

import type { QualityManifest, QualityLevel, Resolution } from '@/lib/adaptiveQuality';

// Standard quality configurations
const QUALITY_CONFIGS: Record<Resolution, Omit<QualityLevel, 'url' | 'resolution'>> = {
  '360p': { bitrate: 500, width: 640, height: 360 },
  '720p': { bitrate: 1500, width: 1280, height: 720 },
  '1080p': { bitrate: 4000, width: 1920, height: 1080 },
};

// Helper to build quality entry
function buildQualityEntry(basePath: string, id: string): QualityManifest[string] {
  return {
    '360p': {
      resolution: '360p',
      url: `${basePath}/${id}_360p.mp4`,
      ...QUALITY_CONFIGS['360p'],
    },
    '720p': {
      resolution: '720p',
      url: `${basePath}/${id}_720p.mp4`,
      ...QUALITY_CONFIGS['720p'],
    },
    '1080p': {
      resolution: '1080p',
      url: `${basePath}/${id}.mp4`, // Original is highest quality
      ...QUALITY_CONFIGS['1080p'],
    },
  };
}

// B-Roll video manifest
export const BROLL_MANIFEST: QualityManifest = {
  // Business backgrounds
  bg00: buildQualityEntry('/backgrounds/business', 'bg00'),
  bg01: buildQualityEntry('/backgrounds/business', 'bg01'),
  bg02: buildQualityEntry('/backgrounds/business', 'bg02'),
  bg03: buildQualityEntry('/backgrounds/business', 'bg03'),
  bg04: buildQualityEntry('/backgrounds/business', 'bg04'),
  bg05: buildQualityEntry('/backgrounds/business', 'bg05'),
  bg06: buildQualityEntry('/backgrounds/business', 'bg06'),
  bg07: buildQualityEntry('/backgrounds/business', 'bg07'),
  bg08: buildQualityEntry('/backgrounds/business', 'bg08'),
  bg09: buildQualityEntry('/backgrounds/business', 'bg09'),
  bg10: buildQualityEntry('/backgrounds/business', 'bg10'),
  bg11: buildQualityEntry('/backgrounds/business', 'bg11'),
  bg12: buildQualityEntry('/backgrounds/business', 'bg12'),
  bg13: buildQualityEntry('/backgrounds/business', 'bg13'),
  bg14: buildQualityEntry('/backgrounds/business', 'bg14'),
  bg15: buildQualityEntry('/backgrounds/business', 'bg15'),
  bg16: buildQualityEntry('/backgrounds/business', 'bg16'),
  bg17: buildQualityEntry('/backgrounds/business', 'bg17'),
  bg18: buildQualityEntry('/backgrounds/business', 'bg18'),
  bg19: buildQualityEntry('/backgrounds/business', 'bg19'),
  bg20: buildQualityEntry('/backgrounds/business', 'bg20'),
  bg21: buildQualityEntry('/backgrounds/business', 'bg21'),
  bg22: buildQualityEntry('/backgrounds/business', 'bg22'),
  bg23: buildQualityEntry('/backgrounds/business', 'bg23'),
  bg24: buildQualityEntry('/backgrounds/business', 'bg24'),
};

/**
 * Get quality manifest for a video URL
 * Extracts video ID from URL and returns available qualities
 */
export function getManifestForUrl(url: string): QualityManifest[string] | null {
  // Extract video ID from URL
  // /backgrounds/business/bg00.mp4 → bg00
  const match = url.match(/\/([^/]+?)(?:_\d+p)?\.mp4$/);
  if (!match) return null;

  const videoId = match[1];
  return BROLL_MANIFEST[videoId] || null;
}

/**
 * Get video ID from URL
 */
export function getVideoIdFromUrl(url: string): string | null {
  const match = url.match(/\/([^/]+?)(?:_\d+p)?\.mp4$/);
  return match ? match[1] : null;
}

/**
 * Check if video has multi-quality support
 */
export function hasMultiQuality(url: string): boolean {
  return getManifestForUrl(url) !== null;
}

export default BROLL_MANIFEST;
