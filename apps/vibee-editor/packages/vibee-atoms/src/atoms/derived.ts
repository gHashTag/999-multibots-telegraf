// ===============================
// @vibee/atoms - Derived Atoms (Auto-Computed)
// Single source of truth for Web & Mobile editors
// These atoms derive their values from other atoms - NO MANUAL SYNC needed!
// ===============================

import { atom } from 'jotai';
import type { Track, TrackItem, Segment, VideoLayout } from '../types';
import { tracksAtom, videoTrackAtom, avatarTrackAtom, audioTrackAtom } from './tracks';
import { assetsAtom } from './assets';
import { DEFAULT_TEMPLATE } from '../defaults';

// ===============================
// Track-Derived Atoms
// ===============================

// All items from all tracks (flattened)
export const allItemsAtom = atom((get) => {
  const tracks = get(tracksAtom);
  return tracks.flatMap((track) => track.items);
});

// Item ID to Track mapping (O(1) lookup)
export const itemIdToTrackMapAtom = atom((get) => {
  const tracks = get(tracksAtom);
  const map = new Map<string, Track>();
  for (const track of tracks) {
    for (const item of track.items) {
      map.set(item.id, track);
    }
  }
  return map;
});

// Get track by item ID
export const getTrackByItemIdAtom = atom((get) => {
  const map = get(itemIdToTrackMapAtom);
  return (itemId: string) => map.get(itemId);
});

// Get item by ID (searches all tracks)
export const getItemByIdAtom = atom((get) => {
  const tracks = get(tracksAtom);
  return (itemId: string): TrackItem | undefined => {
    for (const track of tracks) {
      const item = track.items.find((i) => i.id === itemId);
      if (item) return item;
    }
    return undefined;
  };
});

// ===============================
// Timeline-Derived Atoms
// ===============================

// Total duration (max end frame across all items)
export const totalDurationAtom = atom((get) => {
  const tracks = get(tracksAtom);
  let maxEndFrame = DEFAULT_TEMPLATE.durationInFrames;

  for (const track of tracks) {
    for (const item of track.items) {
      const itemEnd = item.startFrame + item.durationInFrames;
      if (itemEnd > maxEndFrame) {
        maxEndFrame = itemEnd;
      }
    }
  }
  return maxEndFrame;
});

// Duration in seconds
export const durationInSecondsAtom = atom((get) => {
  const totalFrames = get(totalDurationAtom);
  return totalFrames / DEFAULT_TEMPLATE.fps;
});

// Has any content (non-empty tracks)
export const hasContentAtom = atom((get) => {
  const tracks = get(tracksAtom);
  return tracks.some((track) => track.items.length > 0);
});

// ===============================
// Background Videos (for template)
// ===============================

// Auto-extract background video URLs from video track
export const backgroundVideosAtom = atom((get) => {
  const videoTrack = get(videoTrackAtom);
  if (!videoTrack) return [];

  const assets = get(assetsAtom);

  return videoTrack.items
    .map((item) => {
      // Try to get URL from item or find asset
      if ('url' in item && item.url) return item.url as string;
      if (item.assetId) {
        const asset = assets.find((a) => a.id === item.assetId);
        return asset?.url;
      }
      return undefined;
    })
    .filter((url): url is string => !!url);
});

// ===============================
// Segments (Timeline Segments)
// ===============================

// Compute segments from tracks (for rendering)
export const segmentsAtom = atom((get) => {
  const videoTrack = get(videoTrackAtom);
  const avatarTrack = get(avatarTrackAtom);
  const assets = get(assetsAtom);

  if (!videoTrack || !avatarTrack) return [];

  const segments: Segment[] = [];
  const avatarItem = avatarTrack.items[0];
  if (!avatarItem) return [];

  const totalDuration = avatarItem.durationInFrames;
  let currentFrame = 0;

  // Sort video items by start frame
  const sortedItems = [...videoTrack.items].sort((a, b) => a.startFrame - b.startFrame);

  for (const item of sortedItems) {
    // Fullscreen segment before this B-roll
    if (item.startFrame > currentFrame) {
      segments.push({
        type: 'fullscreen',
        startFrame: currentFrame,
        durationFrames: item.startFrame - currentFrame,
      });
    }

    // B-roll segment
    const asset = item.assetId ? assets.find((a) => a.id === item.assetId) : null;
    const url = ('url' in item && item.url) ? item.url as string : asset?.url;

    segments.push({
      type: 'split',
      startFrame: item.startFrame,
      durationFrames: item.durationInFrames,
      bRollUrl: url,
      bRollType: asset?.type === 'image' ? 'image' : 'video',
      layout: ('layout' in item ? item.layout : undefined) as VideoLayout | undefined,
      offsetX: item.x || 0,
      offsetY: item.y || 0,
      scaleWidth: item.width,
      scaleHeight: item.height,
      cropX: ('cropX' in item) ? item.cropX as number : undefined,
      cropY: ('cropY' in item) ? item.cropY as number : undefined,
    });

    currentFrame = item.startFrame + item.durationInFrames;
  }

  // Final fullscreen segment
  if (currentFrame < totalDuration) {
    segments.push({
      type: 'fullscreen',
      startFrame: currentFrame,
      durationFrames: totalDuration - currentFrame,
    });
  }

  return segments;
});

// ===============================
// Asset Usage Stats
// ===============================

// Count how many times each asset is used
export const assetUsageCountAtom = atom((get) => {
  const tracks = get(tracksAtom);
  const usageMap = new Map<string, number>();

  for (const track of tracks) {
    for (const item of track.items) {
      if (item.assetId) {
        const count = usageMap.get(item.assetId) || 0;
        usageMap.set(item.assetId, count + 1);
      }
    }
  }

  return usageMap;
});

// Get unused assets
export const unusedAssetsAtom = atom((get) => {
  const assets = get(assetsAtom);
  const usageMap = get(assetUsageCountAtom);

  return assets.filter((asset) => !usageMap.has(asset.id));
});

// ===============================
// Music Track Info
// ===============================

// Get current music URL from audio track
export const currentMusicUrlAtom = atom((get) => {
  const audioTrack = get(audioTrackAtom);
  if (!audioTrack || audioTrack.items.length === 0) return null;

  const assets = get(assetsAtom);
  const firstItem = audioTrack.items[0];

  if ('url' in firstItem && firstItem.url) return firstItem.url as string;
  if (firstItem.assetId) {
    const asset = assets.find((a) => a.id === firstItem.assetId);
    return asset?.url || null;
  }

  return null;
});

// Get music volume from audio track
export const currentMusicVolumeAtom = atom((get) => {
  const audioTrack = get(audioTrackAtom);
  if (!audioTrack || audioTrack.items.length === 0) return 1;

  const firstItem = audioTrack.items[0];
  return 'volume' in firstItem ? (firstItem.volume as number) : 1;
});

// ===============================
// Avatar Track Info
// ===============================

// Get lipsync video URL from avatar track
export const lipSyncVideoUrlAtom = atom((get) => {
  const avatarTrack = get(avatarTrackAtom);
  if (!avatarTrack || avatarTrack.items.length === 0) return null;

  const assets = get(assetsAtom);
  const firstItem = avatarTrack.items[0];

  if ('url' in firstItem && firstItem.url) return firstItem.url as string;
  if (firstItem.assetId) {
    const asset = assets.find((a) => a.id === firstItem.assetId);
    return asset?.url || null;
  }

  return null;
});

// ===============================
// Track Stats
// ===============================

// Count items per track type
export const trackStatsAtom = atom((get) => {
  const tracks = get(tracksAtom);
  const stats: Record<string, number> = {};

  for (const track of tracks) {
    stats[track.type] = track.items.length;
  }

  return stats;
});

// Total item count
export const totalItemCountAtom = atom((get) => {
  const tracks = get(tracksAtom);
  return tracks.reduce((sum, track) => sum + track.items.length, 0);
});
