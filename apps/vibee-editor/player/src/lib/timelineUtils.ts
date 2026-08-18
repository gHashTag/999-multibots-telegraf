// ===============================
// Timeline Utilities
// Smart positioning for add-to-timeline
// ===============================

import type { Track, TrackItem } from '@vibee/atoms';

export interface OverlapResult {
  hasOverlap: boolean;
  overlappingItem?: TrackItem;
  suggestedStartFrame: number;
}

/**
 * Check if a position overlaps with existing items on a track
 */
export function checkOverlap(
  tracks: Track[],
  trackId: string,
  startFrame: number,
  duration: number
): OverlapResult {
  const track = tracks.find(t => t.id === trackId);
  if (!track) return { hasOverlap: false, suggestedStartFrame: startFrame };

  const endFrame = startFrame + duration;

  for (const item of track.items) {
    const itemEnd = item.startFrame + item.durationInFrames;

    // Check if ranges overlap
    if (startFrame < itemEnd && endFrame > item.startFrame) {
      return {
        hasOverlap: true,
        overlappingItem: item,
        suggestedStartFrame: itemEnd, // Place after overlapping item
      };
    }
  }

  return { hasOverlap: false, suggestedStartFrame: startFrame };
}

/**
 * Find the next available position on a track, avoiding overlaps
 * If the desired position is occupied, places after the last overlapping item
 */
export function findNextAvailablePosition(
  tracks: Track[],
  trackId: string,
  startFrame: number,
  duration: number
): number {
  const track = tracks.find(t => t.id === trackId);
  if (!track || track.items.length === 0) return startFrame;

  // Sort items by start frame
  const sortedItems = [...track.items].sort((a, b) => a.startFrame - b.startFrame);

  let candidateStart = startFrame;
  const candidateEnd = candidateStart + duration;

  // Find all items that would overlap with our desired position
  for (const item of sortedItems) {
    const itemEnd = item.startFrame + item.durationInFrames;

    // If our candidate start is within this item's range
    if (candidateStart < itemEnd && candidateEnd > item.startFrame) {
      // Move candidate to after this item
      candidateStart = itemEnd;
    }
  }

  return candidateStart;
}

/**
 * Get the first frame of a track (position of earliest item)
 */
export function getTrackStartFrame(tracks: Track[], trackId: string): number {
  const track = tracks.find(t => t.id === trackId);
  if (!track || track.items.length === 0) return 0;

  return Math.min(...track.items.map(item => item.startFrame));
}

/**
 * Get the last frame of a track (end of latest item)
 */
export function getTrackEndFrame(tracks: Track[], trackId: string): number {
  const track = tracks.find(t => t.id === trackId);
  if (!track || track.items.length === 0) return 0;

  return Math.max(
    ...track.items.map(item => item.startFrame + item.durationInFrames)
  );
}

/**
 * Get target track ID based on asset type
 */
export function getTargetTrackId(assetType: string, isLipsync = false): string {
  if (isLipsync) return 'track-avatar';

  switch (assetType) {
    case 'audio':
      return 'track-audio';
    case 'image':
      return 'track-image';
    case 'video':
    default:
      return 'track-video';
  }
}

/**
 * Get track display name for UI
 */
export function getTrackDisplayName(trackId: string, language: 'en' | 'ru' = 'en'): string {
  const names: Record<string, { en: string; ru: string }> = {
    'track-video': { en: 'Video', ru: 'Видео' },
    'track-avatar': { en: 'Avatar', ru: 'Аватар' },
    'track-image': { en: 'Image', ru: 'Изображения' },
    'track-audio': { en: 'Audio', ru: 'Аудио' },
    'track-text': { en: 'Text', ru: 'Текст' },
  };

  return names[trackId]?.[language] || trackId;
}
