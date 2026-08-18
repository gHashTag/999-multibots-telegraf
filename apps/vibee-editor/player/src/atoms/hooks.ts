// ===============================
// Jotai Hooks - Convenience wrappers
// ===============================

import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  // Core
  projectAtom,
  tracksAtom,
  assetsAtom,
  // Playback
  currentFrameAtom,
  isPlayingAtom,
  isMutedAtom,
  volumeAtom,
  playbackRateAtom,
  playerRefAtom,
  playAtom,
  pauseAtom,
  seekToAtom,
  // Selection
  selectedItemIdsAtom,
  selectItemsAtom,
  clearSelectionAtom,
  clipboardAtom,
  copyItemsAtom,
  // UI
  sidebarTabAtom,
  canvasZoomAtom,
  timelineZoomAtom,
  snapSettingsAtom,
  markersAtom,
  inPointAtom,
  outPointAtom,
  // Derived
  templatePropsAtom,
  segmentsAtom,
  backgroundVideosAtom,
  // History
  undoAtom,
  redoAtom,
  canUndoAtom,
  canRedoAtom,
  recordSnapshotAtom,
  // Actions
  addItemAtom,
  updateItemAtom,
  deleteItemsAtom,
  moveItemAtom,
  resizeItemAtom,
  duplicateItemsAtom,
  addAssetAtom,
  // Captions
  loadCaptionsAtom,
  captionsLoadingAtom,
  // Templates auto-save
  settingsWatchAtom,
  autoSaveSettingsAtom,
  selectedTemplateIdAtom,
} from './index';
import type { Track, TrackItem } from '@vibee/atoms';

// ===============================
// Core Hooks
// ===============================

export function useProject() {
  return useAtom(projectAtom);
}

export function useTracks() {
  return useAtomValue(tracksAtom);
}

export function useAssets() {
  return useAtomValue(assetsAtom);
}

// ===============================
// Playback Hooks
// ===============================

export function usePlayback() {
  const currentFrame = useAtomValue(currentFrameAtom);
  const isPlaying = useAtomValue(isPlayingAtom);
  const isMuted = useAtomValue(isMutedAtom);
  const volume = useAtomValue(volumeAtom);
  const playbackRate = useAtomValue(playbackRateAtom);
  const project = useAtomValue(projectAtom);

  const play = useSetAtom(playAtom);
  const pause = useSetAtom(pauseAtom);
  const seekTo = useSetAtom(seekToAtom);
  const setCurrentFrame = useSetAtom(currentFrameAtom);
  const setIsPlaying = useSetAtom(isPlayingAtom);
  const setIsMuted = useSetAtom(isMutedAtom);
  const setVolume = useSetAtom(volumeAtom);
  const setPlaybackRate = useSetAtom(playbackRateAtom);

  return {
    currentFrame,
    isPlaying,
    isMuted,
    volume,
    playbackRate,
    durationInFrames: project.durationInFrames,
    fps: project.fps,
    play,
    pause,
    seekTo,
    setCurrentFrame,
    setIsPlaying,
    setIsMuted,
    setVolume,
    setPlaybackRate,
  };
}

// ===============================
// Selection Hooks
// ===============================

export function useSelection() {
  const selectedItemIds = useAtomValue(selectedItemIdsAtom);
  const tracks = useAtomValue(tracksAtom);
  const selectItems = useSetAtom(selectItemsAtom);
  const clearSelection = useSetAtom(clearSelectionAtom);
  const copyItems = useSetAtom(copyItemsAtom);
  const clipboard = useAtomValue(clipboardAtom);

  const selectedItems = useMemo(() => {
    const items: TrackItem[] = [];
    for (const track of tracks) {
      for (const item of track.items) {
        if (selectedItemIds.includes(item.id)) {
          items.push(item);
        }
      }
    }
    return items;
  }, [tracks, selectedItemIds]);

  const select = useCallback((itemIds: string[], addToSelection = false) => {
    selectItems({ itemIds, addToSelection });
  }, [selectItems]);

  const copy = useCallback(() => {
    if (selectedItems.length > 0) {
      copyItems(selectedItems);
    }
  }, [selectedItems, copyItems]);

  return {
    selectedItemIds,
    selectedItems,
    select,
    clear: clearSelection,
    copy,
    clipboard,
    hasSelection: selectedItemIds.length > 0,
  };
}

// ===============================
// Track Item Hook
// ===============================

export function useTrackItem(itemId: string) {
  const tracks = useAtomValue(tracksAtom);
  const updateItem = useSetAtom(updateItemAtom);

  const { item, track } = useMemo(() => {
    for (const t of tracks) {
      const found = t.items.find((i) => i.id === itemId);
      if (found) return { item: found, track: t };
    }
    return { item: undefined, track: undefined };
  }, [tracks, itemId]);

  const update = useCallback((updates: Partial<TrackItem>) => {
    updateItem({ itemId, updates });
  }, [itemId, updateItem]);

  return { item, track, update };
}

// ===============================
// Template Props Hook
// ===============================

export function useTemplateProps() {
  return useAtomValue(templatePropsAtom);
}

export function useSegments() {
  return useAtomValue(segmentsAtom);
}

export function useBackgroundVideos() {
  return useAtomValue(backgroundVideosAtom);
}

// ===============================
// History Hook
// ===============================

export function useHistory() {
  const undo = useSetAtom(undoAtom);
  const redo = useSetAtom(redoAtom);
  const canUndo = useAtomValue(canUndoAtom);
  const canRedo = useAtomValue(canRedoAtom);
  const recordSnapshot = useSetAtom(recordSnapshotAtom);

  return {
    undo,
    redo,
    canUndo,
    canRedo,
    recordSnapshot,
  };
}

// ===============================
// Auto-record history on state changes
// ===============================

export function useAutoRecordHistory() {
  const tracks = useAtomValue(tracksAtom);
  const assets = useAtomValue(assetsAtom);
  const project = useAtomValue(projectAtom);
  const templateProps = useAtomValue(templatePropsAtom);
  // UI state for undo/redo (NOT currentFrame - changes every frame during playback!)
  const timelineZoom = useAtomValue(timelineZoomAtom);
  const canvasZoom = useAtomValue(canvasZoomAtom);
  const recordSnapshot = useSetAtom(recordSnapshotAtom);

  // Use JSON.stringify for stable comparison - templatePropsAtom returns new object reference every render!
  const templatePropsString = useMemo(() => JSON.stringify(templateProps), [templateProps]);

  // Record initial snapshot on mount (so first undo has something to undo to)
  useEffect(() => {
    console.log('[History] Recording initial snapshot on mount');
    recordSnapshot();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Record snapshot on state changes (NOT currentFrame - it changes too frequently)
  // Using templatePropsString instead of templateProps to avoid new object reference triggering effect
  useEffect(() => {
    recordSnapshot();
  }, [tracks, assets, project, templatePropsString, timelineZoom, canvasZoom, recordSnapshot]);
}

// ===============================
// Captions Hook
// ===============================

export function useCaptions() {
  const loadCaptions = useSetAtom(loadCaptionsAtom);
  const isLoading = useAtomValue(captionsLoadingAtom);

  return {
    loadCaptions,
    isLoading,
  };
}

// ===============================
// UI Hooks
// ===============================

export function useUI() {
  const [sidebarTab, setSidebarTab] = useAtom(sidebarTabAtom);
  const [canvasZoom, setCanvasZoom] = useAtom(canvasZoomAtom);
  const [timelineZoom, setTimelineZoom] = useAtom(timelineZoomAtom);
  const [snapSettings, setSnapSettings] = useAtom(snapSettingsAtom);
  const markers = useAtomValue(markersAtom);
  const inPoint = useAtomValue(inPointAtom);
  const outPoint = useAtomValue(outPointAtom);

  return {
    sidebarTab,
    setSidebarTab,
    canvasZoom,
    setCanvasZoom,
    timelineZoom,
    setTimelineZoom,
    snapSettings,
    setSnapSettings,
    markers,
    inPoint,
    outPoint,
  };
}

// ===============================
// Actions Hook (for components that need multiple actions)
// ===============================

export function useEditorActions() {
  const addItem = useSetAtom(addItemAtom);
  const updateItem = useSetAtom(updateItemAtom);
  const deleteItems = useSetAtom(deleteItemsAtom);
  const moveItem = useSetAtom(moveItemAtom);
  const resizeItem = useSetAtom(resizeItemAtom);
  const duplicateItems = useSetAtom(duplicateItemsAtom);
  const addAsset = useSetAtom(addAssetAtom);

  return {
    addItem,
    updateItem,
    deleteItems,
    moveItem,
    resizeItem,
    duplicateItems,
    addAsset,
  };
}

// ===============================
// Auto-Save Template Settings Hook
// ===============================

/**
 * Hook that auto-saves template settings when they change.
 * Uses debounce (500ms) to avoid excessive saves.
 * Call this in Editor.tsx to enable auto-save.
 */
export function useAutoSaveTemplateSettings() {
  const settingsHash = useAtomValue(settingsWatchAtom);
  const templateId = useAtomValue(selectedTemplateIdAtom);
  const saveSettings = useSetAtom(autoSaveSettingsAtom);
  const timeoutRef = useRef<number | null>(null);
  const prevHashRef = useRef<string | null>(null);
  const prevTemplateIdRef = useRef<string | null>(null);

  useEffect(() => {
    // Skip initial render and when switching templates
    if (prevHashRef.current === null) {
      prevHashRef.current = settingsHash;
      prevTemplateIdRef.current = templateId;
      return;
    }

    // Don't save if we just switched templates (settings loaded from storage)
    if (prevTemplateIdRef.current !== templateId) {
      prevHashRef.current = settingsHash;
      prevTemplateIdRef.current = templateId;
      return;
    }

    // Skip if settings haven't changed
    if (prevHashRef.current === settingsHash) {
      return;
    }

    prevHashRef.current = settingsHash;

    // Debounced save
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = window.setTimeout(() => {
      saveSettings();
      timeoutRef.current = null;
    }, 500);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [settingsHash, templateId, saveSettings]);
}
