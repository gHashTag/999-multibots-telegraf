// ===============================
// Bridge: Zustand-style API using Jotai atoms
// Enables gradual migration of components
// ===============================

import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { useCallback, useMemo } from 'react';
import type { PlayerRef } from '@remotion/player';
import type React from 'react';
import { produce } from 'immer';
import { editorStore } from './Provider';

// Import all atoms
import {
  projectAtom,
  tracksAtom,
  assetsAtom,
  currentFrameAtom,
  isPlayingAtom,
  setCurrentFrameAtom,
  setIsPlayingAtom,
  isMutedAtom,
  volumeAtom,
  playbackRateAtom,
  playerRefAtom,
  selectedItemIdsAtom,
  selectionAnchorAtom,
  clipboardAtom,
  sidebarTabAtom,
  canvasZoomAtom,
  timelineZoomAtom,
  snapSettingsAtom,
  markersAtom,
  inPointAtom,
  outPointAtom,
  isExportingAtom,
  exportProgressAtom,
  templatePropsAtom,
  segmentsAtom,
  // Actions
  addTrackAtom,
  removeTrackAtom,
  updateTrackAtom,
  addItemAtom,
  updateItemAtom,
  deleteItemsAtom,
  moveItemAtom,
  resizeItemAtom,
  splitItemAtom,
  duplicateItemsAtom,
  moveItemToTrackAtom,
  rippleDeleteAtom,
  reorderItemsAtom,
  resetTracksAtom,
  addAssetAtom,
  removeAssetAtom,
  selectItemsAtom,
  clearSelectionAtom,
  copyItemsAtom,
  addMarkerAtom,
  removeMarkerAtom,
  clearInOutPointsAtom,
  setExportingAtom,
  playAtom,
  pauseAtom,
  seekToAtom,
  undoAtom,
  redoAtom,
  canUndoAtom,
  canRedoAtom,
  loadCaptionsAtom,
  updateTemplatePropAtom,
  lipSyncVideoAtom,
  updateDurationFromLipSyncAtom,
} from './index';

import type {
  Track,
  TrackItem,
  TrackType,
  Asset,
  LipSyncMainProps,
  MarkerColor,
  Segment,
} from '@vibee/atoms';
import { DEFAULT_FPS } from '@vibee/atoms';
import type { EditorStore } from '@/store/types';

/**
 * useEditorStore - Zustand-compatible hook using Jotai atoms
 *
 * Usage:
 *   const tracks = useEditorStore((s) => s.tracks);
 *   const { addItem, deleteItems } = useEditorStore((s) => ({ addItem: s.addItem, deleteItems: s.deleteItems }));
 *
 * Also supports:
 *   useEditorStore.getState() - Get current state snapshot
 *   useEditorStore.setState() - Update state directly
 */
interface UseEditorStore {
  <T>(selector: (state: EditorStore) => T): T;
  getState: () => EditorStore;
  setState: (updater: ((state: EditorStore) => void) | Partial<EditorStore>) => void;
}

export const useEditorStore: UseEditorStore = function useEditorStoreImpl<T>(selector: (state: EditorStore) => T): T {
  // Get all state values
  const project = useAtomValue(projectAtom);
  const tracks = useAtomValue(tracksAtom);
  const assets = useAtomValue(assetsAtom);
  const currentFrame = useAtomValue(currentFrameAtom);
  const isPlaying = useAtomValue(isPlayingAtom);
  const isMuted = useAtomValue(isMutedAtom);
  const volume = useAtomValue(volumeAtom);
  const playbackRate = useAtomValue(playbackRateAtom);
  const playerRef = useAtomValue(playerRefAtom);
  const selectedItemIds = useAtomValue(selectedItemIdsAtom);
  const selectionAnchor = useAtomValue(selectionAnchorAtom);
  const clipboard = useAtomValue(clipboardAtom);
  const sidebarTab = useAtomValue(sidebarTabAtom);
  const canvasZoom = useAtomValue(canvasZoomAtom);
  const timelineZoom = useAtomValue(timelineZoomAtom);
  const snapSettings = useAtomValue(snapSettingsAtom);
  const markers = useAtomValue(markersAtom);
  const inPoint = useAtomValue(inPointAtom);
  const outPoint = useAtomValue(outPointAtom);
  const isExporting = useAtomValue(isExportingAtom);
  const exportProgress = useAtomValue(exportProgressAtom);
  const templateProps = useAtomValue(templatePropsAtom);
  const canUndo = useAtomValue(canUndoAtom);
  const canRedo = useAtomValue(canRedoAtom);

  // Action setters
  const setProject = useSetAtom(projectAtom);
  const setCurrentFrame = useSetAtom(currentFrameAtom);
  const setIsPlaying = useSetAtom(isPlayingAtom);
  const setIsMuted = useSetAtom(isMutedAtom);
  const setVolume = useSetAtom(volumeAtom);
  const setPlaybackRate = useSetAtom(playbackRateAtom);
  const setPlayerRef = useSetAtom(playerRefAtom);
  const setSidebarTab = useSetAtom(sidebarTabAtom);
  const setCanvasZoom = useSetAtom(canvasZoomAtom);
  const setTimelineZoom = useSetAtom(timelineZoomAtom);
  const setSnapSettings = useSetAtom(snapSettingsAtom);
  const setInPoint = useSetAtom(inPointAtom);
  const setOutPoint = useSetAtom(outPointAtom);

  // Complex actions
  const addTrack = useSetAtom(addTrackAtom);
  const removeTrack = useSetAtom(removeTrackAtom);
  const updateTrack = useSetAtom(updateTrackAtom);
  const addItem = useSetAtom(addItemAtom);
  const updateItem = useSetAtom(updateItemAtom);
  const deleteItems = useSetAtom(deleteItemsAtom);
  const moveItem = useSetAtom(moveItemAtom);
  const resizeItem = useSetAtom(resizeItemAtom);
  const splitItem = useSetAtom(splitItemAtom);
  const duplicateItems = useSetAtom(duplicateItemsAtom);
  const moveItemToTrack = useSetAtom(moveItemToTrackAtom);
  const rippleDelete = useSetAtom(rippleDeleteAtom);
  const reorderItems = useSetAtom(reorderItemsAtom);
  const resetTracks = useSetAtom(resetTracksAtom);
  const addAsset = useSetAtom(addAssetAtom);
  const removeAsset = useSetAtom(removeAssetAtom);
  const selectItems = useSetAtom(selectItemsAtom);
  const clearSelection = useSetAtom(clearSelectionAtom);
  const copyItems = useSetAtom(copyItemsAtom);
  const addMarker = useSetAtom(addMarkerAtom);
  const removeMarker = useSetAtom(removeMarkerAtom);
  const clearInOutPoints = useSetAtom(clearInOutPointsAtom);
  const setExporting = useSetAtom(setExportingAtom);
  const play = useSetAtom(playAtom);
  const pause = useSetAtom(pauseAtom);
  const seekTo = useSetAtom(seekToAtom);
  const undo = useSetAtom(undoAtom);
  const redo = useSetAtom(redoAtom);
  const loadCaptions = useSetAtom(loadCaptionsAtom);
  const updateTemplateProp = useSetAtom(updateTemplatePropAtom);
  const setLipSyncVideo = useSetAtom(lipSyncVideoAtom);
  const updateDurationFromLipSync = useSetAtom(updateDurationFromLipSyncAtom);

  // Build the store-like object
  const store = useMemo((): EditorStore => {
    // Helper functions
    const getItemById = (itemId: string) => {
      for (const track of tracks) {
        const item = track.items.find((i) => i.id === itemId);
        if (item) return item;
      }
      return undefined;
    };

    const getTrackById = (trackId: string) => tracks.find((t) => t.id === trackId);
    const getAssetById = (assetId: string) => assets.find((a) => a.id === assetId);

    const getSelectedItems = () => {
      const items: TrackItem[] = [];
      for (const track of tracks) {
        for (const item of track.items) {
          if (selectedItemIds.includes(item.id)) {
            items.push(item);
          }
        }
      }
      return items;
    };

    const getSegmentsFromTimeline = (): Segment[] => {
      const videoTrack = tracks.find((t) => t.type === 'video');
      if (!videoTrack) return [];

      const sortedItems = [...videoTrack.items].sort((a, b) => a.startFrame - b.startFrame);
      const segments: Segment[] = [];
      let lastEndFrame = 0;

      sortedItems.forEach((item) => {
        if (item.startFrame > lastEndFrame) {
          segments.push({
            type: 'fullscreen',
            startFrame: lastEndFrame,
            durationFrames: item.startFrame - lastEndFrame,
          });
        }

        const asset = assets.find((a) => a.id === item.assetId);
        segments.push({
          type: 'split',
          startFrame: item.startFrame,
          durationFrames: item.durationInFrames,
          bRollUrl: asset?.url,
          bRollType: asset?.type === 'image' ? 'image' : 'video',
        });

        lastEndFrame = item.startFrame + item.durationInFrames;
      });

      if (lastEndFrame < project.durationInFrames) {
        segments.push({
          type: 'fullscreen',
          startFrame: lastEndFrame,
          durationFrames: project.durationInFrames - lastEndFrame,
        });
      }

      return segments;
    };

    return {
      // State
      project,
      tracks,
      assets,
      currentFrame,
      isPlaying,
      isMuted,
      volume,
      playbackRate,
      playerRef,
      selectedItemIds,
      selectionAnchor,
      clipboard,
      sidebarTab,
      canvasZoom,
      timelineZoom,
      snapSettings,
      markers,
      inPoint,
      outPoint,
      isExporting,
      exportProgress,
      templateProps,

      // Actions - Project
      setProject: (updates) => setProject((prev) => ({ ...prev, ...updates })),

      // Actions - Playback
      setCurrentFrame,
      setIsPlaying,
      setIsMuted,
      setVolume,
      setPlaybackRate,
      play: () => play(),
      pause: () => pause(),
      seekTo,
      setPlayerRef,
      playDirect: (event?: React.MouseEvent) => play(event),
      pauseDirect: () => pause(),

      // Actions - Tracks
      addTrack: (type: TrackType, name?: string) => addTrack({ type, name }),
      removeTrack,
      updateTrack: (trackId, updates) => updateTrack({ trackId, updates }),

      // Actions - Items
      addItem: (trackId, itemData) => addItem({ trackId, itemData }),
      updateItem: (itemId, updates) => updateItem({ itemId, updates }),
      deleteItems,
      rippleDelete,
      duplicateItems: (itemIds) => duplicateItems({ itemIds, fps: project.fps }),
      copyItems: (itemIds) => {
        const items = itemIds.map((id) => getItemById(id)).filter((i): i is TrackItem => !!i);
        copyItems(items);
      },
      pasteItems: () => {
        // TODO: implement paste
      },
      moveItem: (itemId, newStartFrame) => moveItem({ itemId, newStartFrame, snapSettings }),
      resizeItem: (itemId, newDuration) => resizeItem({ itemId, newDuration }),
      splitItem: (itemId, atFrame) => splitItem({ itemId, atFrame }),
      moveItemToTrack: (itemId, newTrackId) => moveItemToTrack({ itemId, newTrackId }),
      reorderItems: (trackId, activeId, overId) => reorderItems({ trackId, activeId, overId, fps: project.fps, coverDuration: templateProps.coverDuration }),

      // Actions - Selection
      selectItems: (itemIds, addToSelection) => selectItems({ itemIds, addToSelection }),
      selectRange: () => {}, // TODO
      clearSelection,
      selectAll: () => {
        const allIds = tracks.flatMap((t) => t.items.map((i) => i.id));
        selectItems({ itemIds: allIds });
      },

      // Actions - Assets
      addAsset: (assetData) => addAsset(assetData),
      removeAsset,
      cleanupOrphanedAssets: () => {}, // TODO

      // Actions - UI
      setTimelineZoom,
      setCanvasZoom,
      setSidebarTab,

      // Actions - Snap
      setSnapEnabled: (enabled) => setSnapSettings({ ...snapSettings, enabled }),
      setSnapInterval: (interval) => setSnapSettings({ ...snapSettings, interval }),

      // Actions - In/Out Points
      setInPoint,
      setOutPoint,
      clearInOutPoints,

      // Actions - Markers
      addMarker: (frame: number, name?: string, color?) => addMarker({ frame, name, color }),
      removeMarker,
      updateMarker: () => {}, // TODO
      goToNextMarker: () => {
        const next = markers.find((m) => m.frame > currentFrame);
        if (next) setCurrentFrame(next.frame);
      },
      goToPrevMarker: () => {
        const prev = [...markers].reverse().find((m) => m.frame < currentFrame);
        if (prev) setCurrentFrame(prev.frame);
      },

      // Actions - Export
      setExporting: (exporting, progress) => setExporting({ exporting, progress }),

      // Actions - Undo/Redo
      undo,
      redo,
      canUndo: () => canUndo,
      canRedo: () => canRedo,

      // Actions - Utils
      getItemById,
      getTrackById,
      getAssetById,
      getSelectedItems,
      getSegmentsFromTimeline,

      // Actions - Template Props
      updateTemplateProp: (key, value) => {
        // Skip backgroundVideos - it's now auto-derived from tracks
        if (key === 'backgroundVideos') {
          console.log('[updateTemplateProp] Ignoring backgroundVideos - now auto-derived');
          return;
        }
        updateTemplateProp({ key: key as any, value });
      },
      syncBackgroundVideosFromTimeline: () => {}, // No-op: backgroundVideos is now auto-derived!
      updateDurationFromLipSync: async () => updateDurationFromLipSync(),
      loadCaptions: async () => loadCaptions(),
      resetToDefaults: () => resetTracks({ fps: DEFAULT_FPS, durationInFrames: 825 }),
    };
  }, [
    project, tracks, assets, currentFrame, isPlaying, isMuted, volume, playbackRate,
    playerRef, selectedItemIds, selectionAnchor, clipboard, sidebarTab, canvasZoom,
    timelineZoom, snapSettings, markers, inPoint, outPoint, isExporting, exportProgress,
    templateProps, canUndo, canRedo,
    // Actions
    setProject, setCurrentFrame, setIsPlaying, setIsMuted, setVolume, setPlaybackRate,
    setPlayerRef, setSidebarTab, setCanvasZoom, setTimelineZoom, setSnapSettings,
    setInPoint, setOutPoint, addTrack, removeTrack, updateTrack, addItem, updateItem,
    deleteItems, moveItem, resizeItem, splitItem, duplicateItems, moveItemToTrack,
    rippleDelete, reorderItems, resetTracks, addAsset, removeAsset, selectItems,
    clearSelection, copyItems, addMarker, removeMarker, clearInOutPoints, setExporting,
    play, pause, seekTo, undo, redo, loadCaptions, updateTemplateProp, updateDurationFromLipSync,
  ]);

  return selector(store);
}

/**
 * useLipSyncProps - Backwards compatible hook
 */
export function useLipSyncProps() {
  return useAtomValue(templatePropsAtom);
}

// ===============================
// Zustand-compatible getState/setState for non-React usage
// ===============================

const store = editorStore;

/**
 * getState - Get current state snapshot (Zustand-compatible)
 */
function getState(): EditorStore {
  const project = store.get(projectAtom);
  const tracks = store.get(tracksAtom);
  const assets = store.get(assetsAtom);
  const currentFrame = store.get(currentFrameAtom);
  const isPlaying = store.get(isPlayingAtom);
  const isMuted = store.get(isMutedAtom);
  const volume = store.get(volumeAtom);
  const playbackRate = store.get(playbackRateAtom);
  const playerRef = store.get(playerRefAtom);
  const selectedItemIds = store.get(selectedItemIdsAtom);
  const selectionAnchor = store.get(selectionAnchorAtom);
  const clipboard = store.get(clipboardAtom);
  const sidebarTab = store.get(sidebarTabAtom);
  const canvasZoom = store.get(canvasZoomAtom);
  const timelineZoom = store.get(timelineZoomAtom);
  const snapSettings = store.get(snapSettingsAtom);
  const markers = store.get(markersAtom);
  const inPoint = store.get(inPointAtom);
  const outPoint = store.get(outPointAtom);
  const isExporting = store.get(isExportingAtom);
  const exportProgress = store.get(exportProgressAtom);
  const templateProps = store.get(templatePropsAtom);

  const getItemById = (itemId: string) => {
    for (const track of tracks) {
      const item = track.items.find((i) => i.id === itemId);
      if (item) return item;
    }
    return undefined;
  };

  const getTrackById = (trackId: string) => tracks.find((t) => t.id === trackId);
  const getAssetById = (assetId: string) => assets.find((a) => a.id === assetId);

  const getSelectedItems = () => {
    const items: TrackItem[] = [];
    for (const track of tracks) {
      for (const item of track.items) {
        if (selectedItemIds.includes(item.id)) {
          items.push(item);
        }
      }
    }
    return items;
  };

  const getSegmentsFromTimeline = (): Segment[] => {
    const videoTrack = tracks.find((t) => t.type === 'video');
    if (!videoTrack) return [];

    const sortedItems = [...videoTrack.items].sort((a, b) => a.startFrame - b.startFrame);
    const segments: Segment[] = [];
    let lastEndFrame = 0;

    sortedItems.forEach((item) => {
      if (item.startFrame > lastEndFrame) {
        segments.push({
          type: 'fullscreen',
          startFrame: lastEndFrame,
          durationFrames: item.startFrame - lastEndFrame,
        });
      }

      const asset = assets.find((a) => a.id === item.assetId);
      segments.push({
        type: 'split',
        startFrame: item.startFrame,
        durationFrames: item.durationInFrames,
        bRollUrl: asset?.url,
        bRollType: asset?.type === 'image' ? 'image' : 'video',
      });

      lastEndFrame = item.startFrame + item.durationInFrames;
    });

    if (lastEndFrame < project.durationInFrames) {
      segments.push({
        type: 'fullscreen',
        startFrame: lastEndFrame,
        durationFrames: project.durationInFrames - lastEndFrame,
      });
    }

    return segments;
  };

  return {
    project,
    tracks,
    assets,
    currentFrame,
    isPlaying,
    isMuted,
    volume,
    playbackRate,
    playerRef,
    selectedItemIds,
    selectionAnchor,
    clipboard,
    sidebarTab,
    canvasZoom,
    timelineZoom,
    snapSettings,
    markers,
    inPoint,
    outPoint,
    isExporting,
    exportProgress,
    templateProps,
    // Utils
    getItemById,
    getTrackById,
    getAssetById,
    getSelectedItems,
    getSegmentsFromTimeline,
  } as EditorStore;
}

/**
 * setState - Update state (Zustand-compatible)
 */
function setState(updater: ((state: EditorStore) => void) | Partial<EditorStore>) {
  if (typeof updater === 'function') {
    // Immer-style updater
    const currentState = getState();
    const draft = produce(currentState, updater);

    // Apply changes to atoms (cast for atomWithStorage type compatibility)
    if (draft.tracks !== currentState.tracks) {
      store.set(tracksAtom, draft.tracks as any);
    }
    if (draft.assets !== currentState.assets) {
      store.set(assetsAtom, draft.assets as any);
    }
    if (draft.project !== currentState.project) {
      store.set(projectAtom, draft.project);
    }
    if (draft.currentFrame !== currentState.currentFrame) {
      store.set(setCurrentFrameAtom, draft.currentFrame);
    }
    if (draft.isPlaying !== currentState.isPlaying) {
      store.set(setIsPlayingAtom, draft.isPlaying);
    }
    if (draft.selectedItemIds !== currentState.selectedItemIds) {
      store.set(selectedItemIdsAtom as any, draft.selectedItemIds);
    }
  } else {
    // Partial update (cast for atomWithStorage type compatibility)
    if (updater.tracks !== undefined) store.set(tracksAtom, updater.tracks as any);
    if (updater.assets !== undefined) store.set(assetsAtom, updater.assets as any);
    if (updater.project !== undefined) store.set(projectAtom, updater.project);
    if (updater.currentFrame !== undefined) store.set(setCurrentFrameAtom, updater.currentFrame);
    if (updater.isPlaying !== undefined) store.set(setIsPlayingAtom, updater.isPlaying);
    if (updater.selectedItemIds !== undefined) store.set(selectedItemIdsAtom as any, updater.selectedItemIds);
  }
}

// Attach getState and setState to useEditorStore for Zustand compatibility
useEditorStore.getState = getState;
useEditorStore.setState = setState;
