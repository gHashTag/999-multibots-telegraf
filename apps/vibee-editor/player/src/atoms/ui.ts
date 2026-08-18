// ===============================
// UI Atoms - Interface state
// ===============================

import { atom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';
import type { SnapSettings, MarkerColor, Marker } from '@vibee/atoms';
import { MARKER_COLORS } from '@vibee/atoms';
import { STORAGE_KEYS } from '@vibee/atoms';

// Re-export MARKER_COLORS from @vibee/atoms
export { MARKER_COLORS };

// Local markersAtom instance (uses shared Marker type from @vibee/atoms)
// This is local because navigation atoms depend on currentFrameAtom which is also local
export const markersAtom = atom<Marker[]>([]);

// ===============================
// Layout Presets - Practical layouts for 9:16 Reels editing
// Timeline ALWAYS horizontal at bottom, Assets ALWAYS vertical on left (or hidden)
// ===============================

// 4 Layout presets (simplified from broken 5)
export type LayoutPreset = 'classic' | 'compact' | 'focus' | 'full';

export const layoutPresetAtom = atomWithStorage<LayoutPreset>(
  STORAGE_KEYS.layoutPreset,
  'classic'
);

export const LAYOUT_PRESETS: Record<LayoutPreset, {
  label: string;
  labelRu: string;
  icon: string;           // Lucide icon name
  description: string;
  descriptionRu: string;
  showAssets: boolean;
  assetsWidth: number;    // px
  timelineHeight: number; // px
}> = {
  classic: {
    label: 'Classic',
    labelRu: 'Классика',
    icon: 'LayoutGrid',
    description: 'Full editor with all panels',
    descriptionRu: 'Полный редактор со всеми панелями',
    showAssets: true,
    assetsWidth: 300,
    timelineHeight: 220,
  },
  compact: {
    label: 'Compact',
    labelRu: 'Компактный',
    icon: 'Minimize2',
    description: 'Smaller panels, bigger canvas',
    descriptionRu: 'Меньше панели, больше холст',
    showAssets: true,
    assetsWidth: 280,
    timelineHeight: 180,
  },
  focus: {
    label: 'Focus',
    labelRu: 'Фокус',
    icon: 'Maximize2',
    description: 'Canvas only, minimal timeline',
    descriptionRu: 'Только холст и минимум таймлайна',
    showAssets: false,
    assetsWidth: 0,
    timelineHeight: 140,
  },
  full: {
    label: 'Timeline',
    labelRu: 'Таймлайн',
    icon: 'Layers',
    description: 'Large timeline for detailed editing',
    descriptionRu: 'Большой таймлайн для детальной работы',
    showAssets: false,
    assetsWidth: 0,
    timelineHeight: 320,
  },
};

// Unified sidebar tab - Order: Script, Templates, Avatar(lipsync), Video, Photo(image), Voice, Music
export type SidebarTab = 'script' | 'feed' | 'templates' | 'lipsync' | 'video' | 'image' | 'voice' | 'music' | 'player';
export const sidebarTabAtom = atom<SidebarTab>('feed'); // Default to feed tab

// Canvas zoom (0 = auto fit to height)
export const canvasZoomAtom = atom(0);

// Timeline zoom (persisted)
export const timelineZoomAtom = atomWithStorage(STORAGE_KEYS.timelineZoom, 1);

// Snap settings (persisted)
export const snapSettingsAtom = atomWithStorage<SnapSettings>(STORAGE_KEYS.snapSettings, {
  enabled: false,
  interval: 15, // 0.5s at 30fps
});

// In/Out points for playback range
export const inPointAtom = atom<number | null>(null);
export const outPointAtom = atom<number | null>(null);

// Export state
export const isExportingAtom = atom(false);
export const exportProgressAtom = atom(0);

// Volume popup - which track item is showing volume popup (null = closed)
export const volumePopupItemIdAtom = atom<string | null>(null);

// Action: Set snap enabled
export const setSnapEnabledAtom = atom(
  null,
  (get, set, enabled: boolean) => {
    set(snapSettingsAtom, { ...get(snapSettingsAtom), enabled });
  }
);

// Action: Set snap interval
export const setSnapIntervalAtom = atom(
  null,
  (get, set, interval: number) => {
    set(snapSettingsAtom, { ...get(snapSettingsAtom), interval: Math.max(1, interval) });
  }
);

// Action: Add marker with toggle behavior (web-specific: removes if marker exists at frame)
export const addMarkerAtom = atom(
  null,
  (get, set, { frame, name, color = 'yellow' }: { frame: number; name?: string; color?: MarkerColor }) => {
    const markers = get(markersAtom);

    // Toggle: remove if marker exists at this frame
    const existingIndex = markers.findIndex((m) => m.frame === frame);
    if (existingIndex !== -1) {
      set(markersAtom, markers.filter((_, i) => i !== existingIndex));
      return null;
    }

    // Add new marker
    const id = `marker-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const newMarker = {
      id,
      frame,
      name: name || `Marker ${markers.length + 1}`,
      color,
    };
    set(markersAtom, [...markers, newMarker].sort((a, b) => a.frame - b.frame));
    return id;
  }
);

// Action: Remove marker
export const removeMarkerAtom = atom(
  null,
  (get, set, markerId: string) => {
    set(markersAtom, get(markersAtom).filter(m => m.id !== markerId));
  }
);

// Action: Update marker
export const updateMarkerAtom = atom(
  null,
  (get, set, { id, updates }: { id: string; updates: Partial<Omit<Marker, 'id'>> }) => {
    set(markersAtom, get(markersAtom).map(m =>
      m.id === id ? { ...m, ...updates } : m
    ));
  }
);

// Action: Clear all markers
export const clearMarkersAtom = atom(null, (_, set) => {
  set(markersAtom, []);
});

// Action: Clear in/out points
export const clearInOutPointsAtom = atom(
  null,
  (get, set) => {
    set(inPointAtom, null);
    set(outPointAtom, null);
  }
);

// Action: Set exporting state
export const setExportingAtom = atom(
  null,
  (get, set, { exporting, progress = 0 }: { exporting: boolean; progress?: number }) => {
    set(isExportingAtom, exporting);
    set(exportProgressAtom, progress);
  }
);

// Import for marker navigation - use setCurrentFrameAtom action to avoid Jotai type issues
import { currentFrameAtom, setCurrentFrameAtom } from '@vibee/atoms';

// Action: Go to next marker
export const goToNextMarkerAtom = atom(
  null,
  (get, set) => {
    const markers = get(markersAtom);
    const currentFrame = get(currentFrameAtom);

    // Find next marker after current frame
    const nextMarker = markers.find((m) => m.frame > currentFrame);
    if (nextMarker) {
      set(setCurrentFrameAtom, nextMarker.frame);
    }
  }
);

// Action: Go to previous marker
export const goToPrevMarkerAtom = atom(
  null,
  (get, set) => {
    const markers = get(markersAtom);
    const currentFrame = get(currentFrameAtom);

    // Find previous marker before current frame
    const prevMarkers = markers.filter((m) => m.frame < currentFrame);
    if (prevMarkers.length > 0) {
      const prevMarker = prevMarkers[prevMarkers.length - 1];
      set(setCurrentFrameAtom, prevMarker.frame);
    }
  }
);

// Publish modal state (for opening after Instagram auth callback)
export const publishModalOpenAtom = atom(false);
export const publishModalVideoUrlAtom = atom<string | undefined>(undefined);
