// ===============================
// @vibee/atoms - Tracks Atom
// Single source of truth for Web & Mobile editors
// ===============================

import { atom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';
import type { Track, TrackItem, TrackType, VideoLayout } from '../types';
import { STORAGE_KEYS } from '../keys';
import { DEFAULT_TRACKS, createDefaultTracks } from '../defaults';

// ===============================
// Core Tracks Atom
// ===============================

export const tracksAtom = atomWithStorage<Track[]>(
  STORAGE_KEYS.tracks,
  DEFAULT_TRACKS
);

// ===============================
// Track Selectors
// ===============================

export const videoTrackAtom = atom((get) =>
  get(tracksAtom).find((t) => t.type === 'video')
);

export const avatarTrackAtom = atom((get) =>
  get(tracksAtom).find((t) => t.type === 'avatar')
);

export const audioTrackAtom = atom((get) =>
  get(tracksAtom).find((t) => t.type === 'audio')
);

export const voiceTrackAtom = atom((get) =>
  get(tracksAtom).find((t) => t.type === 'voice')
);

export const imageTrackAtom = atom((get) =>
  get(tracksAtom).find((t) => t.type === 'image')
);

// Get track by ID
export const getTrackByIdAtom = atom((get) => {
  const tracks = get(tracksAtom);
  return (trackId: string) => tracks.find((t) => t.id === trackId);
});

// Get item by ID (searches all tracks)
export const getItemByIdAtom = atom((get) => {
  const tracks = get(tracksAtom);
  return (itemId: string) => {
    for (const track of tracks) {
      const item = track.items.find((i) => i.id === itemId);
      if (item) return item;
    }
    return undefined;
  };
});

// ===============================
// Track Actions
// ===============================

let itemCounter = 0;
const generateId = (prefix: string) => `${prefix}-${Date.now()}-${++itemCounter}`;

export const addTrackAtom = atom(
  null,
  (get, set, { type, name }: { type: TrackType; name?: string }) => {
    const id = generateId('track');
    const tracks = get(tracksAtom);
    set(tracksAtom, [
      ...tracks,
      {
        id,
        type,
        name: name || type.charAt(0).toUpperCase() + type.slice(1),
        items: [],
        locked: false,
        visible: true,
        muted: false,
        solo: false,
      },
    ]);
    return id;
  }
);

export const removeTrackAtom = atom(
  null,
  (get, set, trackId: string) => {
    set(tracksAtom, get(tracksAtom).filter((t) => t.id !== trackId));
  }
);

export const updateTrackAtom = atom(
  null,
  (get, set, { trackId, updates }: { trackId: string; updates: Partial<Track> }) => {
    set(tracksAtom, get(tracksAtom).map((t) =>
      t.id === trackId ? { ...t, ...updates } : t
    ));
  }
);

export const reorderTracksAtom = atom(
  null,
  (get, set, { fromIndex, toIndex }: { fromIndex: number; toIndex: number }) => {
    if (fromIndex === toIndex) return;
    const tracks = [...get(tracksAtom)];
    const [removed] = tracks.splice(fromIndex, 1);
    tracks.splice(toIndex, 0, removed);
    set(tracksAtom, tracks);
  }
);

// ===============================
// Item Actions
// ===============================

export const addItemAtom = atom(
  null,
  (get, set, { trackId, itemData }: { trackId: string; itemData: Omit<TrackItem, 'id' | 'trackId'> }) => {
    const id = generateId('item');
    set(tracksAtom, get(tracksAtom).map((track) => {
      if (track.id !== trackId) return track;
      return {
        ...track,
        items: [...track.items, { ...itemData, id, trackId } as TrackItem],
      };
    }));
    return id;
  }
);

export const updateItemAtom = atom(
  null,
  (get, set, { itemId, updates }: { itemId: string; updates: Partial<TrackItem> }) => {
    set(tracksAtom, get(tracksAtom).map((track) => ({
      ...track,
      items: track.items.map((item) =>
        item.id === itemId ? { ...item, ...updates } as TrackItem : item
      ),
    })) as Track[]);
  }
);

export const updateItemLayoutAtom = atom(
  null,
  (get, set, { itemId, layout }: { itemId: string; layout: VideoLayout }) => {
    set(tracksAtom, get(tracksAtom).map((track) => ({
      ...track,
      items: track.items.map((item) =>
        item.id === itemId && item.type === 'video'
          ? { ...item, layout }
          : item
      ),
    })));
  }
);

export const setAllVideoItemsLayoutAtom = atom(
  null,
  (get, set, layout: VideoLayout) => {
    set(tracksAtom, get(tracksAtom).map((track) => {
      if (track.type !== 'video') return track;
      return {
        ...track,
        items: track.items.map((item) => ({ ...item, layout })),
      };
    }));
  }
);

export const deleteItemsAtom = atom(
  null,
  (get, set, itemIds: string[]) => {
    set(tracksAtom, get(tracksAtom).map((track) => ({
      ...track,
      items: track.items.filter((i) => !itemIds.includes(i.id)),
    })));
  }
);

export const moveItemAtom = atom(
  null,
  (get, set, { itemId, newStartFrame, snapSettings }: {
    itemId: string;
    newStartFrame: number;
    snapSettings?: { enabled: boolean; interval: number };
  }) => {
    let snappedFrame = newStartFrame;
    if (snapSettings?.enabled && snapSettings.interval > 0) {
      snappedFrame = Math.round(newStartFrame / snapSettings.interval) * snapSettings.interval;
    }

    set(tracksAtom, get(tracksAtom).map((track) => ({
      ...track,
      items: track.items.map((item) =>
        item.id === itemId
          ? { ...item, startFrame: Math.max(0, snappedFrame) }
          : item
      ),
    })));
  }
);

export const resizeItemAtom = atom(
  null,
  (get, set, { itemId, newDuration }: { itemId: string; newDuration: number }) => {
    set(tracksAtom, get(tracksAtom).map((track) => ({
      ...track,
      items: track.items.map((item) =>
        item.id === itemId
          ? { ...item, durationInFrames: Math.max(1, newDuration) }
          : item
      ),
    })));
  }
);

export const splitItemAtom = atom(
  null,
  (get, set, { itemId, atFrame }: { itemId: string; atFrame: number }) => {
    set(tracksAtom, get(tracksAtom).map((track) => {
      const itemIndex = track.items.findIndex((i) => i.id === itemId);
      if (itemIndex === -1) return track;

      const item = track.items[itemIndex];
      const itemEnd = item.startFrame + item.durationInFrames;

      if (atFrame <= item.startFrame || atFrame >= itemEnd) return track;

      const firstDuration = atFrame - item.startFrame;
      const secondDuration = itemEnd - atFrame;

      const firstPart = { ...item, durationInFrames: firstDuration };
      const secondPart = {
        ...item,
        id: generateId('item'),
        startFrame: atFrame,
        durationInFrames: secondDuration,
      };

      const newItems = [...track.items];
      newItems.splice(itemIndex, 1, firstPart, secondPart);

      return { ...track, items: newItems };
    }));
  }
);

export const duplicateItemsAtom = atom(
  null,
  (get, set, { itemIds, fps = 30 }: { itemIds: string[]; fps?: number }) => {
    const offset = Math.floor(fps * 0.5);
    const newIds: string[] = [];

    set(tracksAtom, get(tracksAtom).map((track) => {
      const itemsToDuplicate = track.items.filter((i) => itemIds.includes(i.id));
      if (itemsToDuplicate.length === 0) return track;

      const duplicated = itemsToDuplicate.map((item) => {
        const newId = generateId('item');
        newIds.push(newId);
        return {
          ...item,
          id: newId,
          startFrame: item.startFrame + item.durationInFrames + offset,
        };
      });

      return { ...track, items: [...track.items, ...duplicated] };
    }));

    return newIds;
  }
);

export const moveItemToTrackAtom = atom(
  null,
  (get, set, { itemId, newTrackId }: { itemId: string; newTrackId: string }) => {
    let movedItem: TrackItem | undefined;

    const tracksAfterRemove = get(tracksAtom).map((track) => {
      const index = track.items.findIndex((i) => i.id === itemId);
      if (index === -1) return track;
      movedItem = { ...track.items[index] };
      return {
        ...track,
        items: track.items.filter((i) => i.id !== itemId),
      };
    });

    if (!movedItem) return;

    set(tracksAtom, tracksAfterRemove.map((track) => {
      if (track.id !== newTrackId) return track;
      return {
        ...track,
        items: [...track.items, { ...movedItem!, trackId: newTrackId }],
      };
    }));
  }
);

export const rippleDeleteAtom = atom(
  null,
  (get, set, itemIds: string[]) => {
    set(tracksAtom, get(tracksAtom).map((track) => {
      const itemsToDelete = track.items
        .filter((i) => itemIds.includes(i.id))
        .sort((a, b) => a.startFrame - b.startFrame);

      if (itemsToDelete.length === 0) return track;

      let shiftedItems = [...track.items];
      for (const deletedItem of itemsToDelete) {
        const gapSize = deletedItem.durationInFrames;
        const gapStart = deletedItem.startFrame;

        shiftedItems = shiftedItems.map((item) => {
          if (itemIds.includes(item.id)) return item;
          if (item.startFrame > gapStart) {
            return { ...item, startFrame: Math.max(0, item.startFrame - gapSize) };
          }
          return item;
        });
      }

      return {
        ...track,
        items: shiftedItems.filter((i) => !itemIds.includes(i.id)),
      };
    }));
  }
);

export const reorderItemsAtom = atom(
  null,
  (get, set, { trackId, activeId, overId, fps = 30, coverDuration = 0.5 }: {
    trackId: string;
    activeId: string;
    overId: string;
    fps?: number;
    coverDuration?: number;
  }) => {
    set(tracksAtom, get(tracksAtom).map((track) => {
      if (track.id !== trackId) return track;

      const items = [...track.items];
      const oldIndex = items.findIndex((i) => i.id === activeId);
      const newIndex = items.findIndex((i) => i.id === overId);

      if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return track;

      const [removed] = items.splice(oldIndex, 1);
      items.splice(newIndex, 0, removed);

      // Update startFrame for video track
      if (track.type === 'video') {
        const gapFrames = Math.floor(1.5 * fps);
        const coverFrames = Math.floor(coverDuration * fps);
        let currentFrame = coverFrames + gapFrames;

        for (const item of items) {
          item.startFrame = currentFrame;
          currentFrame += item.durationInFrames + gapFrames;
        }
      }

      return { ...track, items };
    }));
  }
);

// ===============================
// Reset Action
// ===============================

export const resetTracksAtom = atom(
  null,
  (get, set, { fps = 30, durationInFrames = 825 }: { fps?: number; durationInFrames?: number } = {}) => {
    set(tracksAtom, createDefaultTracks(fps, durationInFrames));
  }
);

// ===============================
// Track Migrations
// ===============================

export const ensureAudioTrackAtom = atom(
  null,
  (get, set) => {
    const tracks = get(tracksAtom);
    const audioTrack = tracks.find(t => t.type === 'audio');

    if (!audioTrack) {
      set(tracksAtom, [...tracks, {
        id: 'track-audio',
        type: 'audio' as TrackType,
        name: 'Music',
        items: [],
        locked: false,
        visible: true,
        muted: false,
        solo: false,
      }]);
    } else if (audioTrack.name === 'Audio') {
      set(tracksAtom, tracks.map(t =>
        t.type === 'audio' ? { ...t, name: 'Music' } : t
      ));
    }
  }
);

export const ensureVoiceTrackAtom = atom(
  null,
  (get, set) => {
    const tracks = get(tracksAtom);
    if (tracks.find(t => t.type === 'voice')) return;

    const audioIndex = tracks.findIndex(t => t.type === 'audio');
    const newTracks = [...tracks];
    const voiceTrack: Track = {
      id: 'track-voice',
      type: 'voice',
      name: 'Voice',
      items: [],
      locked: false,
      visible: true,
      muted: false,
      solo: false,
    };

    if (audioIndex !== -1) {
      newTracks.splice(audioIndex, 0, voiceTrack);
    } else {
      newTracks.push(voiceTrack);
    }
    set(tracksAtom, newTracks);
  }
);

export const ensureImageTrackAtom = atom(
  null,
  (get, set) => {
    const tracks = get(tracksAtom);
    if (tracks.find(t => t.type === 'image')) return;

    const videoIndex = tracks.findIndex(t => t.type === 'video');
    const newTracks = [...tracks];
    const imageTrack: Track = {
      id: 'track-image',
      type: 'image',
      name: 'Image',
      items: [],
      locked: false,
      visible: true,
      muted: false,
      solo: false,
    };

    newTracks.splice(videoIndex + 1, 0, imageTrack);
    set(tracksAtom, newTracks);
  }
);

// ===============================
// Item Selector Atoms (for optimized subscriptions)
// ===============================

// Video track items only
export const videoItemsAtom = atom((get) => {
  const videoTrack = get(videoTrackAtom);
  return videoTrack?.items ?? [];
});

// Avatar track items only
export const avatarItemsAtom = atom((get) => {
  const avatarTrack = get(avatarTrackAtom);
  return avatarTrack?.items ?? [];
});

// Audio track items only
export const audioItemsAtom = atom((get) => {
  const audioTrack = get(audioTrackAtom);
  return audioTrack?.items ?? [];
});

// Voice track items only
export const voiceItemsAtom = atom((get) => {
  const voiceTrack = get(voiceTrackAtom);
  return voiceTrack?.items ?? [];
});

// Image track items only
export const imageItemsAtom = atom((get) => {
  const imageTrack = get(imageTrackAtom);
  return imageTrack?.items ?? [];
});

// Track item counts (for badges, without full item data)
export const trackItemCountsAtom = atom((get) => {
  const tracks = get(tracksAtom);
  return Object.fromEntries(
    tracks.map((t) => [t.type, t.items.length])
  ) as Record<string, number>;
});

// First item of each track type (common pattern)
export const firstVideoItemAtom = atom((get) => get(videoItemsAtom)[0]);
export const firstAvatarItemAtom = atom((get) => get(avatarItemsAtom)[0]);
export const firstAudioItemAtom = atom((get) => get(audioItemsAtom)[0]);

// Re-export defaults
export { DEFAULT_TRACKS, createDefaultTracks };
