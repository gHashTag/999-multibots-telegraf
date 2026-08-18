// @vibee/atoms - Shared Jotai atoms for VIBEE video editor
// Used by both apps/mobile/ and remotion/player/
// Single source of truth for unified editor logic

// ===============================
// Types - Unified type definitions
// ===============================
export type {
  // Project
  Project,
  // Tracks
  TrackType,
  Track,
  TrackItemBase,
  TrackItemProps,
  TrackItem,
  VideoItemProps,
  ImageItemProps,
  TextItemProps,
  VoiceItemProps,
  AudioItemProps,
  AvatarItemProps,
  VideoLayout,
  ColorTag,
  // Assets
  AssetType,
  Asset,
  // Selection
  Selection,
  ClipboardItem,
  // Captions
  CaptionItem,
  CaptionStyle,
  CaptionAnimation,
  // Segments
  Segment,
  // Avatar
  AvatarModeSettings,
  AvatarAnimation,
  AvatarBorderEffect,
  AvatarConfig,
  // Template
  LipSyncMainProps,
  EditorTemplate,
  // Timeline
  SnapSettings,
  Marker,
  MarkerColor,
  HistoryState,
  Transition,
  TransitionType,
  // UI
  SidebarTab,
  ModalType,
  // User/Auth
  TelegramUser,
  RenderQuota,
  SubscriptionInfo,
  InstagramStatus,
  // Feed
  FeedTemplate,
  RemixSource,
  PublishData,
  FeedSort,
  FeedType,
  FeedStats,
  // Social/Profile
  UserProfile,
  FollowUser,
} from './types'

// ===============================
// Defaults - Default values
// ===============================
export {
  DEFAULT_TEMPLATE,
  DEFAULT_ASSETS,
  DEFAULT_ASSET_IDS,
  DEFAULT_TRACKS,
  createDefaultTracks,
  DEFAULT_SPLIT_AVATAR,
  DEFAULT_FULLSCREEN_AVATAR,
  DEFAULT_AVATAR_ANIMATION,
  DEFAULT_AVATAR_CONFIG,
  CAPTION_DEFAULTS,
  DEFAULT_CAPTIONS,
  MAX_HISTORY_SIZE,
  // FPS options
  FPS_OPTIONS,
  type FpsOption,
  // Platform limits
  PLATFORM_LIMITS,
  // Limits
  MAX_DRAFTS,
  MAX_RESULTS_PER_TAB,
  // Video effect defaults
  DEFAULT_MUSIC_VOLUME,
  DEFAULT_VIGNETTE_STRENGTH,
  DEFAULT_COLOR_CORRECTION,
  DEFAULT_COVER_DURATION,
  // Timeline timing defaults
  DEFAULT_GAP_DURATION_SECONDS,
  DEFAULT_SEGMENT_DURATION_SECONDS,
  // Factory/Remotion defaults
  DEFAULT_FPS,
  DEFAULT_WIDTH,
  DEFAULT_HEIGHT,
  DEFAULT_COVER_OVERLAY_DURATION_FRAMES,
  DEFAULT_FADE_DURATION_FRAMES,
  // Track colors
  TRACK_COLORS,
  // Brand colors
  BRAND_COLORS,
  // Color correction multipliers
  COLOR_CORRECTION_MULTIPLIERS,
  // Animation timings
  ANIMATION_TIMINGS,
  // Avatar positioning
  AVATAR_POSITIONING,
  // Video volume
  AVATAR_VIDEO_VOLUME,
  // Z-Index scale
  Z_INDEX,
  // UI animation durations
  UI_ANIMATION_DURATIONS,
  // Spacing scale
  SPACING,
  // Background colors (dark theme)
  BG_COLORS,
  // Status colors (semantic)
  STATUS_COLORS,
  // Avatar layout presets
  AVATAR_LAYOUT_PRESETS,
  // Editor colors (extended dark theme)
  EDITOR_COLORS,
  // Timeline colors (playhead, guides)
  TIMELINE_COLORS,
  // System colors (iOS-style)
  SYSTEM_COLORS,
  // Typography scale
  TYPOGRAPHY,
  // Border radius scale
  BORDER_RADIUS,
  // Caption style presets
  CAPTION_STYLE_PRESETS,
  // Service endpoints
  SERVICE_ENDPOINTS,
  // WebSocket endpoints (derived from SERVICE_ENDPOINTS)
  WEBSOCKET_ENDPOINTS,
  // Timing constants (use instead of magic numbers)
  TIMING_CONSTANTS,
  // Cache TTL (platform-specific)
  CACHE_TTL,
  // Script generation options (Single Source of Truth)
  SCRIPT_NICHE_OPTIONS,
  SCRIPT_STYLE_OPTIONS,
  SCRIPT_DURATION_OPTIONS,
  DEFAULT_SCRIPT_INPUT,
  type ScriptNiche,
  type ScriptStyle,
  type ScriptDuration,
  // Export options (Single Source of Truth)
  EXPORT_QUALITY_OPTIONS,
  EXPORT_FORMAT_OPTIONS,
  DEFAULT_EXPORT_SETTINGS,
  type ExportQuality,
  type ExportFormat,
} from './defaults'

// ===============================
// Storage keys (unified across projects)
// ===============================
export {
  STORAGE_KEYS,
  KEY_VERSIONS,
  KEY_CATEGORIES,
  type StorageKey,
  type StorageKeyName,
  type StorageKeyValue,
  type KeyVersionName,
  type StorageValueTypes,
  type KeyCategory,
  getVersionedKey,
  getStorageKey,
  validateStorageKeys,
  getAllStorageKeys,
  getKeysByPrefix,
} from './keys'

// ===============================
// Storage adapters & factories
// ===============================
export {
  type StorageAdapter,
  noopStorage,
  browserStorage,
  // Platform detection
  isReactNative,
  isBrowser,
  isSSR,
  // Async storage injection (React Native)
  setAsyncStorageAdapter,
  getAsyncStorageAdapter,
  getPlatformStorage,
  // Factory functions
  createPlatformJotaiStorage,
  createStorageAtom,
  createStorageAtomWithAdapter,
  // Utilities
  clearAllStorage,
  clearStorageByPrefix,
  exportStorageData,
  importStorageData,
} from './storage'

// ===============================
// Storage key migrations (backward compatibility)
// ===============================
export {
  KEY_MIGRATIONS,
  migrateStorageKey,
  migrateStorageKeyAsync,
  runAllMigrations,
  runAllMigrationsAsync,
  createMigratingStorage,
  type KeyMigration,
  type CurrentKey,
} from './migrations'

// ===============================
// Track atoms
// ===============================
export {
  // Core atom
  tracksAtom,
  // Selectors
  videoTrackAtom,
  avatarTrackAtom,
  audioTrackAtom,
  voiceTrackAtom,
  imageTrackAtom,
  getTrackByIdAtom,
  getItemByIdAtom,
  // Item selectors (optimized subscriptions)
  videoItemsAtom,
  avatarItemsAtom,
  audioItemsAtom,
  voiceItemsAtom,
  imageItemsAtom,
  trackItemCountsAtom,
  firstVideoItemAtom,
  firstAvatarItemAtom,
  firstAudioItemAtom,
  // Track actions
  addTrackAtom,
  removeTrackAtom,
  updateTrackAtom,
  reorderTracksAtom,
  // Item actions
  addItemAtom,
  updateItemAtom,
  updateItemLayoutAtom,
  setAllVideoItemsLayoutAtom,
  deleteItemsAtom,
  moveItemAtom,
  resizeItemAtom,
  splitItemAtom,
  duplicateItemsAtom,
  moveItemToTrackAtom,
  rippleDeleteAtom,
  reorderItemsAtom,
  // Reset
  resetTracksAtom,
  // Migrations
  ensureAudioTrackAtom,
  ensureVoiceTrackAtom,
  ensureImageTrackAtom,
} from './atoms/tracks'

// ===============================
// Asset atoms
// ===============================
export {
  // Core atom
  assetsAtom,
  // Actions
  addAssetAtom,
  removeAssetAtom,
  updateAssetAtom,
  resetAssetsAtom,
  // Selectors
  getAssetByIdAtom,
  getAssetsByTypeAtom,
  // Batch selection
  assetSelectionModeAtom,
  selectedAssetIdsAtom,
  toggleAssetSelectionModeAtom,
  toggleAssetSelectionAtom,
  clearAssetSelectionAtom,
  selectAllAssetsAtom,
  deleteSelectedAssetsAtom,
} from './atoms/assets'

// ===============================
// History atoms (Undo/Redo)
// ===============================
export {
  // State
  pastSnapshotsAtom,
  futureSnapshotsAtom,
  isApplyingHistoryAtom,
  // Selectors
  canUndoAtom,
  canRedoAtom,
  historyLengthAtom,
  // Actions
  recordSnapshotAtom,
  undoAtom,
  redoAtom,
  clearHistoryAtom,
  initHistoryAtom,
  // Types
  type HistorySnapshot,
} from './atoms/history'

// ===============================
// Selection atoms
// ===============================
export {
  // State
  selectedItemIdsAtom,
  selectionAnchorAtom,
  clipboardAtom,
  // Selectors
  selectedItemsAtom,
  hasSelectionAtom,
  isItemSelectedAtom,
  hasClipboardItemsAtom,
  // Actions
  selectItemsAtom,
  toggleItemSelectionAtom,
  clearSelectionAtom,
  selectAllItemsAtom,
  selectRangeAtom,
  copySelectedAtom,
  pasteItemsAtom,
  cutSelectedAtom,
  clearClipboardAtom,
} from './atoms/selection'

// ===============================
// Derived atoms (Auto-computed)
// ===============================
export {
  // Track-derived
  allItemsAtom,
  itemIdToTrackMapAtom,
  getTrackByItemIdAtom,
  // Timeline-derived
  totalDurationAtom,
  durationInSecondsAtom,
  hasContentAtom,
  // Background videos
  backgroundVideosAtom,
  // Segments
  segmentsAtom,
  // Asset usage
  assetUsageCountAtom,
  unusedAssetsAtom,
  // Music
  currentMusicUrlAtom,
  currentMusicVolumeAtom,
  // Avatar/Lipsync
  lipSyncVideoUrlAtom,
  // Stats
  trackStatsAtom,
  totalItemCountAtom,
} from './atoms/derived'

// ===============================
// Template props atoms (legacy)
// ===============================
export {
  // Media
  lipSyncVideoAtom,
  coverImageAtom,
  backgroundMusicAtom,
  musicVolumeAtom,
  coverDurationAtom,
  // Effects
  vignetteStrengthAtom,
  colorCorrectionAtom,
  // Domain group atoms (optimized subscriptions)
  mediaPropsAtom,
  effectsPropsAtom,
  captionPropsAtom,
  avatarPropsAtom,
  splitModePropsAtom,
  fullscreenModePropsAtom,
  borderEffectPropsAtom,
} from './template'

// ===============================
// Avatar atoms (consolidated)
// ===============================
export {
  // Storage keys for consumers to use with their own atomWithStorage
  AVATAR_CONFIG_STORAGE_KEY,
  SPLIT_AVATAR_STORAGE_KEY,
  FULLSCREEN_AVATAR_STORAGE_KEY,
  // Factory functions for creating derived atoms
  createAvatarDerivedAtoms,
  createSplitModeAtoms,
  createFullscreenModeAtoms,
  // Master config atom (in-memory, no storage)
  avatarConfigAtom,
  // Derived atoms for backward compatibility
  circleSizePercentAtom,
  circleBottomPercentAtom,
  circleLeftPercentAtom,
  faceOffsetXAtom,
  faceOffsetYAtom,
  faceScaleAtom,
  isCircleAvatarAtom,
  avatarBorderRadiusAtom,
  avatarAnimationAtom,
  avatarBorderEffectAtom,
  avatarBorderColorAtom,
  avatarBorderColor2Atom,
  avatarBorderWidthAtom,
  avatarBorderIntensityAtom,
  // Border config (grouped)
  avatarBorderConfigAtom,
  type AvatarBorderConfig,
  // Split/Fullscreen mode settings (in-memory, no storage)
  avatarSettingsTabAtom,
  splitAvatarSettingsAtom,
  fullscreenAvatarSettingsAtom,
  // Split mode derived atoms
  splitCircleSizeAtom,
  splitPositionXAtom,
  splitPositionYAtom,
  splitFaceScaleAtom,
  splitIsCircleAtom,
  splitBorderRadiusAtom,
  // Fullscreen mode derived atoms
  fullscreenCircleSizeAtom,
  fullscreenPositionXAtom,
  fullscreenPositionYAtom,
  fullscreenFaceScaleAtom,
  fullscreenIsCircleAtom,
  fullscreenBorderRadiusAtom,
  // Reset atoms
  resetAvatarConfigAtom,
  resetSplitAvatarAtom,
  resetFullscreenAvatarAtom,
} from './avatar'

// ===============================
// Playback atoms
// ===============================
export {
  // Core state
  isPlayingAtom,
  currentFrameAtom,
  isMutedAtom,
  // Settings (default values, platforms can override with persistence)
  playbackSpeedAtom,
  volumeAtom,
  fpsAtom,
  loopAtom,
  // Derived
  currentTimeAtom,
  // Throttled frames (for non-critical UI)
  throttledFrameAtom,
  playheadFrameAtom,
  progressFrameAtom,
  // Actions
  setCurrentFrameAtom,
  setIsPlayingAtom,
  seekToAtom,
} from './playback'

// ===============================
// Caption atoms
// ===============================
export {
  // Core atoms
  captionsAtom,
  captionStyleAtom,
  showCaptionsAtom,
  // Loading state
  captionsLoadingAtom,
  captionsErrorAtom,
  transcribingAtom,
  // Actions
  clearCaptionsAtom,
  setCaptionsAtom,
  updateCaptionStyleAtom,
  resetCaptionStyleAtom,
} from './captions'

// ===============================
// Marker atoms
// ===============================
export {
  // Color mapping
  MARKER_COLORS,
  getMarkerColorHex,
  // Core atom
  markersAtom,
  // Actions
  addMarkerAtom,
  removeMarkerAtom,
  updateMarkerAtom,
  clearMarkersAtom,
} from './markers'

// ===============================
// Sync atoms (WebSocket collaboration)
// ===============================
export {
  // Types
  type ConnectionState,
  type SyncMessageType,
  type SyncMessage,
  type UserPresence,
  type ItemLock,
  type SyncConflict,
  type QueuedChange,
  // Connection Manager
  WebSocketManager,
  // Connection atoms
  syncConnectionStateAtom,
  syncProjectIdAtom,
  syncErrorAtom,
  lastSyncTimeAtom,
  // Presence atoms
  remoteCursorsAtom,
  updateRemoteCursorAtom,
  removeRemoteCursorAtom,
  cleanupStaleCursorsAtom,
  activeCollaboratorsAtom,
  // Lock atoms
  itemLocksAtom,
  isItemLockedAtom,
  getItemLockAtom,
  setItemLockAtom,
  removeItemLockAtom,
  // Conflict atoms
  syncConflictsAtom,
  hasConflictsAtom,
  addConflictAtom,
  resolveConflictAtom,
  clearResolvedConflictsAtom,
  // Offline atoms
  offlineQueueAtom,
  isOnlineAtom,
  offlineQueueLengthAtom,
  addToOfflineQueueAtom,
  removeFromOfflineQueueAtom,
  clearOfflineQueueAtom,
  // Utilities
  getUserColor,
  // React Hook
  useProjectSync,
  type UseProjectSyncOptions,
  type UseProjectSyncReturn,
} from './sync'

// ===============================
// Snap atoms (binary search optimization)
// ===============================
export {
  // Types
  type SnapPoint,
  type SnapResult,
  type SnapSettings,
  // Atoms
  snapPointsAtom,
  getSnappedFrameAtom,
  snapSettingsAtom,
  activeSnapFrameAtom,
  setActiveSnapFrameAtom,
  clearActiveSnapAtom,
  // Function
  findNearestSnapPoint,
  // Defaults
  defaultSnapSettings,
} from './atoms/snap'
