// ===============================
// Vibee Editor - Type Definitions
// ===============================

import type React from 'react';

// Import shared types
import type { CaptionStyle as SharedCaptionStyle, AvatarAnimation, AvatarBorderEffect } from '@/shared/types';
import type { SidebarTab } from '@/atoms/ui';
import type { ClipboardItem, LipSyncMainProps } from '@vibee/atoms';

// Re-export shared types
export type { SharedCaptionStyle as CaptionStyleShared, AvatarAnimation };
export type { ClipboardItem };
// Re-export LipSyncMainProps from @vibee/atoms (Single Source of Truth)
export type { LipSyncMainProps };

export interface Project {
  id: string;
  name: string;
  fps: number;
  width: number;
  height: number;
  durationInFrames: number;
}

// ===============================
// Track Types
// ===============================

export type TrackType = 'video' | 'avatar' | 'text' | 'voice' | 'audio' | 'image';

export interface Track {
  id: string;
  type: TrackType;
  name: string;
  items: TrackItem[];
  locked: boolean;
  visible: boolean;
  muted: boolean;
  solo: boolean;
}

// ===============================
// Track Item Types
// ===============================

// Color tag options for organizing clips
export type ColorTag = 'none' | 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'purple' | 'pink';

// ===============================
// Video Layout Options
// ===============================

export type VideoLayout =
  | 'top-half'          // B-roll top 50% (DEFAULT)
  | 'top-2-3'           // B-roll top 66%
  | 'top-3-4'           // B-roll top 75%
  | 'bottom-half'       // B-roll bottom 50%
  | 'bottom-2-3'        // B-roll bottom 66%
  | 'side-left'         // B-roll left 50%
  | 'side-right'        // B-roll right 50%
  | 'fullscreen'        // B-roll fullscreen only
  | 'pip-top-left'      // B-roll fullscreen, avatar top-left
  | 'pip-top-right'     // B-roll fullscreen, avatar top-right
  | 'pip-center-left'   // B-roll fullscreen, avatar center-left
  | 'pip-center-right'  // B-roll fullscreen, avatar center-right
  | 'pip-bottom-left'   // B-roll fullscreen, avatar bottom-left
  | 'pip-bottom-right'; // B-roll fullscreen, avatar bottom-right

export interface TrackItemBase {
  id: string;
  trackId: string;
  assetId?: string;

  // Timeline position
  startFrame: number;
  durationInFrames: number;

  // Canvas position & transform
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;

  // Organization
  colorTag?: ColorTag;
}

export interface VideoItemProps {
  type: 'video';
  volume: number;
  playbackRate: number;
  layout?: VideoLayout; // B-roll layout position, default 'top-half'
}

export interface ImageItemProps {
  type: 'image';
}

export interface TextItemProps {
  type: 'text';
  text: string;
  fontSize: number;
  fontFamily: string;
  fontWeight: number;
  color: string;
  textAlign: 'left' | 'center' | 'right';
}

export interface VoiceItemProps {
  type: 'voice';
  volume: number;
}

export interface AudioItemProps {
  type: 'audio';
  volume: number;
}

export interface AvatarItemProps {
  type: 'avatar';
  volume: number;
  // Avatar-specific props (lipsync video)
  circleSizePercent: number;
  circleBottomPercent: number;
  circleLeftPercent: number;
}

export type TrackItemProps =
  | VideoItemProps
  | ImageItemProps
  | TextItemProps
  | VoiceItemProps
  | AudioItemProps
  | AvatarItemProps;

export type TrackItem = TrackItemBase & TrackItemProps;

// ===============================
// Asset Types
// ===============================

export type AssetType = 'video' | 'image' | 'audio' | 'voice' | 'music';

export interface Asset {
  id: string;
  type: AssetType;
  name: string;
  url: string;
  thumbnail?: string;
  duration?: number; // frames, for video/audio
  width?: number;
  height?: number;
  fileSize?: number;
}

// ===============================
// Selection
// ===============================

export interface Selection {
  itemIds: string[];
  trackId?: string;
}

// ===============================
// Caption Types
// ===============================

// Player-specific caption item format (from API)
export interface CaptionItem {
  text: string;
  startMs: number;
  endMs: number;
  timestampMs: number;
  confidence: number | null;
}

// CaptionStyle is shared with Remotion compositions
// Extends SharedCaptionStyle for compatibility
export type CaptionStyle = SharedCaptionStyle;

// ===============================
// Timeline Segments (for render sync)
// ===============================

export interface Segment {
  type: 'split' | 'fullscreen';
  startFrame: number;
  durationFrames: number;
  bRollUrl?: string;
  bRollType?: 'video' | 'image';
  layout?: VideoLayout; // B-roll layout position, default 'top-half'
}

// LipSyncMainProps is now re-exported from @vibee/atoms (Single Source of Truth)
// See top of file for the re-export

// ===============================
// Snap Settings
// ===============================

export interface SnapSettings {
  enabled: boolean;
  interval: number; // frames
}

// ===============================
// Timeline Markers
// ===============================

export type MarkerColor = 'yellow' | 'red' | 'green' | 'blue' | 'purple';

export interface Marker {
  id: string;
  frame: number;
  name: string;
  color: MarkerColor;
}

// ===============================
// Editor State
// ===============================

export interface EditorState {
  // Project config
  project: Project;

  // Tracks & timeline
  tracks: Track[];
  currentFrame: number;
  isPlaying: boolean;
  isMuted: boolean;
  volume: number; // 0-1
  playbackRate: number; // 0.5x to 2x
  timelineZoom: number; // 1 = 100%

  // Selection
  selectedItemIds: string[];
  selectionAnchor: string | null; // for shift+click range selection

  // Clipboard
  clipboard: ClipboardItem[];

  // Assets
  assets: Asset[];

  // Template props (LipSyncMain)
  templateProps: LipSyncMainProps;

  // UI state
  sidebarTab: SidebarTab;
  canvasZoom: number;

  // Snap settings
  snapSettings: SnapSettings;

  // In/Out points for playback range
  inPoint: number | null;
  outPoint: number | null;

  // Timeline markers
  markers: Marker[];

  // Export
  isExporting: boolean;
  exportProgress: number;
}

// ===============================
// Editor Actions
// ===============================

export interface EditorActions {
  // Undo/Redo
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;

  // Project
  setProject: (project: Partial<Project>) => void;

  // Playback
  setCurrentFrame: (frame: number) => void;
  setIsPlaying: (playing: boolean) => void;
  setIsMuted: (muted: boolean) => void;
  setVolume: (volume: number) => void;
  setPlaybackRate: (rate: number) => void;
  play: () => void;
  pause: () => void;
  seekTo: (frame: number) => void;

  // Player ref for direct control (autoplay policy)
  playerRef: any;
  setPlayerRef: (ref: any) => void;
  playDirect: (event?: React.MouseEvent) => void;
  pauseDirect: () => void;

  // Tracks
  addTrack: (type: TrackType, name?: string) => string;
  removeTrack: (trackId: string) => void;
  updateTrack: (trackId: string, updates: Partial<Track>) => void;

  // Items
  addItem: (trackId: string, item: Omit<TrackItem, 'id' | 'trackId'>) => string;
  updateItem: (itemId: string, updates: Partial<TrackItem>) => void;
  deleteItems: (itemIds: string[]) => void;
  rippleDelete: (itemIds: string[]) => void;
  duplicateItems: (itemIds: string[]) => void;
  copyItems: (itemIds: string[]) => void;
  pasteItems: () => void;
  moveItem: (itemId: string, newStartFrame: number) => void;
  resizeItem: (itemId: string, newDuration: number) => void;
  splitItem: (itemId: string, atFrame: number) => void;
  moveItemToTrack: (itemId: string, newTrackId: string) => void;
  reorderItems: (trackId: string, activeId: string, overId: string) => void;

  // Selection
  selectItems: (itemIds: string[], addToSelection?: boolean) => void;
  selectRange: (toItemId: string) => void; // Shift+click range selection
  clearSelection: () => void;
  selectAll: () => void;

  // Assets
  addAsset: (asset: Omit<Asset, 'id'>) => string;
  removeAsset: (assetId: string) => void;
  cleanupOrphanedAssets: () => void;

  // Timeline
  setTimelineZoom: (zoom: number) => void;

  // Canvas
  setCanvasZoom: (zoom: number) => void;

  // UI
  setSidebarTab: (tab: SidebarTab) => void;

  // Snap
  setSnapEnabled: (enabled: boolean) => void;
  setSnapInterval: (frames: number) => void;

  // In/Out points
  setInPoint: (frame: number | null) => void;
  setOutPoint: (frame: number | null) => void;
  clearInOutPoints: () => void;

  // Markers
  addMarker: (frame: number, name?: string, color?: MarkerColor) => string | null;
  removeMarker: (markerId: string) => void;
  updateMarker: (markerId: string, updates: Partial<Marker>) => void;
  goToNextMarker: () => void;
  goToPrevMarker: () => void;

  // Export
  setExporting: (exporting: boolean, progress?: number) => void;

  // Utils
  getItemById: (itemId: string) => TrackItem | undefined;
  getTrackById: (trackId: string) => Track | undefined;
  getAssetById: (assetId: string) => Asset | undefined;
  getSelectedItems: () => TrackItem[];
  getSegmentsFromTimeline: () => Segment[];

  // Template props
  updateTemplateProp: <K extends keyof LipSyncMainProps>(
    key: K,
    value: LipSyncMainProps[K]
  ) => void;
  syncBackgroundVideosFromTimeline: () => void;
  updateDurationFromLipSync: () => Promise<void>;
  loadCaptions: () => Promise<void>;
  resetToDefaults: () => void;
}

export type EditorStore = EditorState & EditorActions;
