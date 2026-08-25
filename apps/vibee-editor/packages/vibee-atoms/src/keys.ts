// ===============================
// Unified Storage Keys Registry
// Centralized storage key management for cross-project compatibility
// Both apps/mobile/ (React Native) and remotion/player/ (Web) import from this package
// SINGLE SOURCE OF TRUTH for all storage keys
// ===============================

import type { Track, Asset, CaptionItem, CaptionStyle, AvatarConfig, AvatarModeSettings, Marker, SnapSettings } from './types'

// ===============================
// Key Version Registry
// Tracks current versions for migration purposes
// ===============================
export const KEY_VERSIONS = {
  tracks: 17,
  assets: 14,
  captions: 2,
  captionStyle: 3,
  project: 15,
  splitAvatarSettings: 2,
  fullscreenAvatarSettings: 2,
  myProfile: 1,
  templateSettings: 1,
  voices: 1,
  generatedResults: 1,
  scriptData: 1,
  scriptHistory: 1,
  scriptTemplates: 1,
} as const

export type KeyVersionName = keyof typeof KEY_VERSIONS

// Helper to get versioned key
export function getVersionedKey(base: string, version: number): string {
  return `${base}-v${version}`
}

// ===============================
// Storage Keys - Complete Registry
// ===============================
export const STORAGE_KEYS = {
  // ============= Playback & Editor Session =============
  projectName: 'editor:projectName',
  playbackSpeed: 'editor:playbackSpeed',
  volume: 'editor:volume',
  isMuted: 'editor:isMuted',
  zoom: 'editor:zoom',
  snapEnabled: 'editor:snapEnabled',
  fps: 'editor:fps',
  activeTab: 'editor:activeTab',
  loop: 'editor:loop',

  // ============= Export Settings =============
  exportQuality: 'editor:exportQuality',
  exportFormat: 'editor:exportFormat',
  exportIncludeAudio: 'editor:exportIncludeAudio',
  exportSettings: 'vibee-export-settings',

  // ============= Panel Preferences =============
  colorEffectsTab: 'editor:colorEffectsTab',
  captionsPanelTab: 'editor:captionsPanelTab',
  keyframeProperty: 'editor:keyframeProperty',

  // ============= Timeline Markers =============
  markers: 'editor:markers',

  // ============= Media Sources =============
  lipSyncVideo: 'vibee-lipsync-video',
  coverImage: 'vibee-cover-image',
  backgroundMusic: 'vibee-background-music',
  musicVolume: 'vibee-music-volume',
  coverDuration: 'vibee-cover-duration',

  // ============= Effects =============
  vignetteStrength: 'vibee-vignette-strength',
  colorCorrection: 'vibee-color-correction',

  // ============= Avatar Mode Settings (Versioned) =============
  splitAvatarSettings: 'vibee-split-avatar-settings-v2',
  fullscreenAvatarSettings: 'vibee-fullscreen-avatar-settings-v2',

  // ============= Avatar Animation & Border =============
  avatarAnimation: 'vibee-avatar-animation',
  avatarBorderEffect: 'vibee-avatar-border-effect',
  avatarBorderColor: 'vibee-avatar-border-color',
  avatarBorderColor2: 'vibee-avatar-border-color2',
  avatarBorderWidth: 'vibee-avatar-border-width',
  avatarBorderIntensity: 'vibee-avatar-border-intensity',
  avatarSettingsTab: 'vibee-avatar-settings-tab',

  // ============= Captions (Versioned) =============
  captions: 'vibee-captions-v2',
  captionStyle: 'vibee-caption-style-v3',
  showCaptions: 'vibee-show-captions',

  // ============= Project & Tracks (Versioned) =============
  project: 'vibee-project-v15',
  tracks: 'vibee-tracks-v17',
  assets: 'vibee-assets-v14',

  // ============= Templates =============
  templates: 'vibee-templates',
  selectedTemplate: 'vibee-selected-template',
  templateSettings: 'vibee-template-settings-v1',

  // ============= User & Auth =============
  user: 'vibee-user',
  myProfile: 'vibee-my-profile-v1',
  language: 'vibee-lang',
  authToken: 'vibee-auth-token',
  refreshToken: 'vibee-refresh-token',
  sessionId: 'vibee-session-id',

  // ============= UI Settings =============
  /** Открытая вкладка боковой панели. Без неё переключение сбрасывалось
   * на «ленту» при каждой перезагрузке. */
  sidebarTab: 'vibee-sidebar-tab',
  /** История общения с агентом. Хранится, потому что теряться ей нельзя:
   * человек пишет туда задание, а не разовую реплику. */
  agentChat: 'vibee-agent-chat',
  /** Недописанное сообщение агенту. Черновик жил в useState компонента и
   * умирал вместе с ним — то есть при любом уходе на другую вкладку. */
  agentChatDraft: 'vibee-agent-chat-draft',
  /** Последний открытый экран. Telegram умеет запускать мини-апп только с
   * корня, поэтому без этого каждый возврат начинался с ленты. */
  lastRoute: 'vibee-last-route',
  timelineZoom: 'vibee-timeline-zoom',
  snapSettings: 'vibee-snap-settings',
  playbackRate: 'vibee-playback-rate',
  theme: 'vibee-theme',

  // ============= AI Generation =============
  voices: 'vibee-voices-v1',
  selectedVoice: 'vibee-selected-voice',
  generatedResults: 'vibee-generated-results-v1',
  scriptData: 'vibee-script-data-v1',
  scriptHistory: 'vibee-script-history-v1',
  scriptTemplates: 'vibee-script-templates-v1',
  aiModel: 'vibee-ai-model',
  aiTemperature: 'vibee-ai-temperature',

  // ============= Render Session =============
  renderSession: 'vibee-render-session',
  renderHistory: 'vibee-render-history',

  // ============= Drafts =============
  drafts: 'vibee-drafts',
  currentDraftId: 'vibee-current-draft',
  recentProjects: 'vibee-recent-projects',
  autosaveEnabled: 'vibee-autosave-enabled',
  autosaveInterval: 'vibee-autosave-interval',

  // ============= Bookmarks =============
  bookmarks: 'vibee-bookmarks',
  bookmarkedIds: 'vibee-bookmarked-ids',

  // ============= Consolidated Avatar Config =============
  avatarConfig: 'vibee-avatar-config',

  // ============= Legacy Circle Avatar (deprecated, kept for compatibility) =============
  circleSize: 'vibee-circle-size',
  circleBottom: 'vibee-circle-bottom-v2',
  circleLeft: 'vibee-circle-left-percent',
  faceOffsetX: 'vibee-face-offset-x',
  faceOffsetY: 'vibee-face-offset-y',
  faceScale: 'vibee-face-scale',
  isCircleAvatar: 'vibee-is-circle-avatar',
  avatarBorderRadius: 'vibee-avatar-border-radius',

  // ============= Transcription =============
  lastTranscribedVideo: 'vibee-last-transcribed-video',
  transcriptionLanguage: 'vibee-transcription-lang',
  transcriptionModel: 'vibee-transcription-model',

  // ============= Leads Management =============
  leadsTab: 'vibee-leads-tab',
  leadsStatusFilter: 'vibee-leads-status-filter',
  leadsIntentFilter: 'vibee-leads-intent-filter',
  leadsSessionFilter: 'vibee-leads-session-filter',
  activeSession: 'vibee-active-session',

  // ============= Layout & Presets =============
  layoutPreset: 'vibee-layout-preset',

  // ============= Mobile-specific (backward compatible) =============
  splitAvatar: 'vibee-split-avatar',
  fullscreenAvatar: 'vibee-fullscreen-avatar',
  guides: 'vibee-guides',
  script: 'vibee-script',
  textAnimation: 'vibee-text-animation',
  preferences: 'vibee-preferences',

  // ============= Social & Integrations =============
  feedSort: 'vibee-feed-sort',
  instagram: 'vibee-instagram',
  tiktok: 'vibee-tiktok',
  youtube: 'vibee-youtube',

  // ============= Learn / Education =============
  learnProgress: 'vibee-learn-progress',
  tutorialsSeen: 'vibee-tutorials-seen',

  // ============= NEW: UI Layout Persistence =============
  sidebarCollapsed: 'vibee-sidebar-collapsed',
  timelineHeight: 'vibee-timeline-height',
  canvasZoom: 'vibee-canvas-zoom',
  panelSizes: 'vibee-panel-sizes',
  propertiesPanelOpen: 'vibee-properties-panel-open',
  assetsPanelOpen: 'vibee-assets-panel-open',

  // ============= NEW: Timeline State =============
  timelineScrollPosition: 'vibee-timeline-scroll',
  trackCollapsed: 'vibee-track-collapsed',
  waveformVisible: 'vibee-waveform-visible',
  thumbnailsVisible: 'vibee-thumbnails-visible',

  // ============= NEW: Onboarding =============
  onboardingComplete: 'vibee-onboarding-complete',
  onboardingStep: 'vibee-onboarding-step',
  tooltipsShown: 'vibee-tooltips-shown',
  welcomeModalSeen: 'vibee-welcome-seen',

  // ============= NEW: Performance =============
  renderQuality: 'vibee-render-quality',
  previewQuality: 'vibee-preview-quality',
  hardwareAcceleration: 'vibee-hw-accel',
  cacheSize: 'vibee-cache-size',

  // ============= NEW: Notifications =============
  notificationSettings: 'vibee-notifications',
  pushToken: 'vibee-push-token',
  notificationsEnabled: 'vibee-notifications-enabled',

  // ============= NEW: Analytics Consent =============
  analyticsConsent: 'vibee-analytics-consent',
  crashReportingConsent: 'vibee-crash-consent',
  personalizedAdsConsent: 'vibee-personalized-ads',

  // ============= NEW: Feature Flags =============
  betaFeatures: 'vibee-beta-features',
  experimentalUI: 'vibee-experimental-ui',
  debugMode: 'vibee-debug-mode',

  // ============= NEW: Session =============
  lastProjectId: 'vibee-last-project',
  recentSearches: 'vibee-recent-searches',
  recentAssets: 'vibee-recent-assets',
  lastUsedAssetType: 'vibee-last-asset-type',

  // ============= NEW: Sync State =============
  syncStatus: 'vibee-sync-status',
  lastSyncTime: 'vibee-last-sync',
  offlineQueue: 'vibee-offline-queue',
  syncConflicts: 'vibee-sync-conflicts',

  // ============= NEW: Shortcuts & Accessibility =============
  keyboardShortcuts: 'vibee-shortcuts',
  reducedMotion: 'vibee-reduced-motion',
  highContrast: 'vibee-high-contrast',
  fontSize: 'vibee-font-size',

  // ============= NEW: Editor State =============
  currentTool: 'vibee-current-tool',
  gridEnabled: 'vibee-grid-enabled',
  gridSize: 'vibee-grid-size',
  rulerEnabled: 'vibee-ruler-enabled',

  // ============= NEW: Collaboration =============
  collaborators: 'vibee-collaborators',
  shareSettings: 'vibee-share-settings',
  commentsDraft: 'vibee-comments-draft',
} as const

// ===============================
// Type Exports
// ===============================
export type StorageKeyName = keyof typeof STORAGE_KEYS
export type StorageKeyValue = (typeof STORAGE_KEYS)[StorageKeyName]
export type StorageKey = StorageKeyValue

// ===============================
// Storage Value Types (for type-safe access)
// ===============================
export interface StorageValueTypes {
  // Playback
  playbackSpeed: number
  volume: number
  isMuted: boolean
  fps: number
  zoom: number
  snapEnabled: boolean
  loop: boolean

  // Export
  exportQuality: 'low' | 'medium' | 'high' | '4k'
  exportFormat: 'mp4' | 'webm' | 'gif'
  exportIncludeAudio: boolean

  // Avatar
  avatarConfig: AvatarConfig
  splitAvatarSettings: AvatarModeSettings
  fullscreenAvatarSettings: AvatarModeSettings

  // Captions
  captions: CaptionItem[]
  captionStyle: CaptionStyle
  showCaptions: boolean

  // Tracks & Assets
  tracks: Track[]
  assets: Asset[]

  // Markers
  markers: Marker[]

  // Snap
  snapSettings: SnapSettings

  // UI
  theme: 'light' | 'dark' | 'system'
  sidebarCollapsed: boolean
  timelineHeight: number
  canvasZoom: number

  // Onboarding
  onboardingComplete: boolean
  onboardingStep: number

  // Performance
  renderQuality: 'low' | 'medium' | 'high'
  previewQuality: 'low' | 'medium' | 'high'
  hardwareAcceleration: boolean

  // Consent
  analyticsConsent: boolean
  crashReportingConsent: boolean

  // Feature flags
  betaFeatures: Record<string, boolean>
  debugMode: boolean

  // Accessibility
  reducedMotion: boolean
  highContrast: boolean
  fontSize: 'small' | 'medium' | 'large'
}

// Type-safe getter for storage key
export function getStorageKey<K extends StorageKeyName>(key: K): StorageKeyValue {
  return STORAGE_KEYS[key]
}

// Validate all keys are unique (runtime check)
export function validateStorageKeys(): { valid: boolean; duplicates: string[] } {
  const values = Object.values(STORAGE_KEYS)
  const seen = new Set<string>()
  const duplicates: string[] = []

  for (const value of values) {
    if (seen.has(value)) {
      duplicates.push(value)
    }
    seen.add(value)
  }

  return {
    valid: duplicates.length === 0,
    duplicates,
  }
}

// Get all keys as array (useful for clearing storage)
export function getAllStorageKeys(): StorageKeyValue[] {
  return Object.values(STORAGE_KEYS)
}

// Get keys by prefix
export function getKeysByPrefix(prefix: string): StorageKeyValue[] {
  return Object.values(STORAGE_KEYS).filter(key => key.startsWith(prefix))
}

// Key categories for organization
export const KEY_CATEGORIES = {
  playback: ['playbackSpeed', 'volume', 'isMuted', 'fps', 'zoom', 'loop'] as StorageKeyName[],
  export: ['exportQuality', 'exportFormat', 'exportIncludeAudio', 'exportSettings'] as StorageKeyName[],
  avatar: ['avatarConfig', 'splitAvatarSettings', 'fullscreenAvatarSettings', 'avatarAnimation', 'avatarBorderEffect'] as StorageKeyName[],
  captions: ['captions', 'captionStyle', 'showCaptions'] as StorageKeyName[],
  project: ['project', 'tracks', 'assets', 'drafts', 'currentDraftId'] as StorageKeyName[],
  ui: ['theme', 'sidebarCollapsed', 'timelineHeight', 'canvasZoom', 'panelSizes'] as StorageKeyName[],
  user: ['user', 'myProfile', 'language', 'authToken'] as StorageKeyName[],
  sync: ['syncStatus', 'lastSyncTime', 'offlineQueue'] as StorageKeyName[],
} as const

export type KeyCategory = keyof typeof KEY_CATEGORIES
