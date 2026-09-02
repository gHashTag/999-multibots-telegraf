// ===============================
// VIBEE Editor - Jotai Atoms
// Single Source of Truth Architecture
// ===============================
//
// 📁 Structure:
// ├── Core: project, tracks, assets, playback
// ├── UI: sidebar, selection, zoom, markers
// ├── Template: media, effects, avatar, captions
// ├── History: undo/redo
// ├── User: auth, quota
// └── Features: templates, feed, voices
//
// 🔧 Key patterns:
// - atomWithStorage for persistence
// - Derived atoms for computed values
// - Action atoms for complex updates
// ===============================

// ===============================
// 🎬 CORE - Editor fundamentals
// ===============================

export { projectAtom } from './project'

export {
  tracksAtom,
  videoTrackAtom,
  avatarTrackAtom,
  audioTrackAtom,
  voiceTrackAtom,
  imageTrackAtom,
  getTrackByIdAtom,
  getItemByIdAtom,
  // Track Migration
  ensureAudioTrackAtom,
  ensureVoiceTrackAtom,
  ensureImageTrackAtom,
  // Track Actions
  addTrackAtom,
  removeTrackAtom,
  updateTrackAtom,
  reorderTracksAtom,
  // Item Actions
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
  updateItemLayoutAtom,
  setAllVideoItemsLayoutAtom,
} from './tracks'

export {
  assetsAtom,
  addAssetAtom,
  removeAssetAtom,
  getAssetByIdAtom,
  DEFAULT_ASSETS,
  DEFAULT_ASSET_IDS,
  // Batch selection
  assetSelectionModeAtom,
  selectedAssetIdsAtom,
  toggleSelectionModeAtom,
  toggleAssetSelectionAtom,
  clearAssetSelectionAtom,
} from './assets'

// ===============================
// ▶️ PLAYBACK - Player controls
// ===============================

export {
  currentFrameAtom,
  isPlayingAtom,
  isMutedAtom,
  volumeAtom,
  playbackRateAtom,
  playerRefAtom,
  setCurrentFrameAtom,
  setIsPlayingAtom,
  playAtom,
  pauseAtom,
  seekToAtom,
  togglePlayAtom,
} from './playback'

// ===============================
// 🎯 SELECTION - Item selection
// ===============================

export {
  selectedItemIdsAtom,
  selectionAnchorAtom,
  clipboardAtom,
  selectItemsAtom,
  clearSelectionAtom,
  copyItemsAtom,
  // New atoms
  getSelectedItemsAtom,
  selectAllAtom,
  selectRangeAtom,
  pasteItemsAtom,
} from './selection'

// ===============================
// 🖥️ UI - Interface state
// ===============================

export {
  sidebarTabAtom,
  type SidebarTab,
  canvasZoomAtom,
  timelineZoomAtom,
  snapSettingsAtom,
  inPointAtom,
  outPointAtom,
  markersAtom,
  isExportingAtom,
  exportProgressAtom,
  volumePopupItemIdAtom,
  setSnapEnabledAtom,
  setSnapIntervalAtom,
  addMarkerAtom,
  removeMarkerAtom,
  clearInOutPointsAtom,
  setExportingAtom,
  // Marker navigation
  goToNextMarkerAtom,
  goToPrevMarkerAtom,
} from './ui'

// ===============================
// 🎨 TEMPLATE - Video composition props
// (Auto-derived from atoms, passed to Remotion)
// ===============================

export {
  backgroundVideosAtom,
  segmentsAtom,
  templatePropsAtom,
  updateTemplatePropAtom,
  type TemplatePropKey, // Type-safe keys for updateTemplatePropAtom
  forceRefreshAtom, // Force re-render when agent updates props
  // Primitive template props
  lipSyncVideoAtom,
  coverImageAtom,
  backgroundMusicAtom,
  musicVolumeAtom,
  coverDurationAtom,
  vignetteStrengthAtom,
  colorCorrectionAtom,
  circleSizePercentAtom,
  circleBottomPercentAtom,
  circleLeftPercentAtom,
  faceOffsetXAtom,
  faceOffsetYAtom,
  faceScaleAtom,
  // Circle avatar
  isCircleAvatarAtom,
  avatarBorderRadiusAtom,
  // Split/Fullscreen mode settings (CONSOLIDATED)
  avatarSettingsTabAtom,
  type AvatarModeSettings,
  splitAvatarSettingsAtom,
  fullscreenAvatarSettingsAtom,
  // Derived selector atoms (for UI compatibility)
  splitCircleSizeAtom,
  splitPositionXAtom,
  splitPositionYAtom,
  splitFaceScaleAtom,
  splitIsCircleAtom,
  splitBorderRadiusAtom,
  fullscreenCircleSizeAtom,
  fullscreenPositionXAtom,
  fullscreenPositionYAtom,
  fullscreenFaceScaleAtom,
  fullscreenIsCircleAtom,
  fullscreenBorderRadiusAtom,
  // Animation
  avatarAnimationAtom,
  // Border effect
  avatarBorderEffectAtom,
  avatarBorderColorAtom,
  avatarBorderColor2Atom,
  avatarBorderWidthAtom,
  avatarBorderIntensityAtom,
  // Captions
  captionsAtom,
  captionStyleAtom,
  showCaptionsAtom,
} from './derived'

// ===============================
// ↩️ HISTORY - Undo/Redo
// ===============================

export {
  undoAtom,
  redoAtom,
  canUndoAtom,
  canRedoAtom,
  recordSnapshotAtom,
  clearHistoryAtom,
} from './history'

// ===============================
// 💬 CAPTIONS - Transcription & loading
// ===============================

export {
  loadCaptionsAtom,
  captionsLoadingAtom,
  captionsErrorAtom,
  updateDurationFromLipSyncAtom,
} from './captions'

// ===============================
// 📋 TEMPLATES - Saved presets
// ===============================

export {
  templatesAtom,
  selectedTemplateIdAtom,
  selectedTemplateAtom,
  selectTemplateAtom,
  addTemplateAtom,
  removeTemplateAtom,
  // Per-template settings
  templateSettingsAtom,
  saveCurrentSettingsAtom,
  // Auto-save settings
  settingsWatchAtom,
  autoSaveSettingsAtom,
  type Template,
  type TemplateSettings,
} from './templates'

// ===============================
// 👤 USER - Auth & subscription
// ===============================

export {
  userAtom,
  renderQuotaAtom,
  quotaLoadingAtom,
  showPaywallAtom,
  showLoginModalAtom,
  fetchQuotaAtom,
  logRenderAtom,
  canRenderAtom,
  isDevModeAtom,
  hasUnlimitedRendersAtom,
  logoutAtom,
  // Instagram connection
  instagramStatusAtom,
  instagramLoadingAtom,
  fetchInstagramStatusAtom,
  connectInstagramAtom,
  disconnectInstagramAtom,
  postToInstagramAtom,
  type TelegramUser,
  type RenderQuota,
  type SubscriptionInfo,
  type InstagramStatus,
} from './user'

// ===============================
// 📱 FEED - Social templates
// ===============================

export {
  feedTemplatesAtom,
  feedLoadingAtom,
  feedErrorAtom,
  feedPageAtom,
  feedHasMoreAtom,
  feedSortAtom,
  feedMutedAtom,
  currentlyPlayingFeedIdAtom,
  loadFeedAtom,
  loadMoreFeedAtom,
  changeFeedSortAtom,
  likeTemplateAtom,
  starTemplateAtom,
  trackViewAtom,
  deleteTemplateAtom,
  editTemplateAtom,
  useTemplateAtom,
  publishToFeedAtom,
  currentRemixSourceAtom,
  editingFeedTemplateIdAtom,
  // Stats
  feedStatsAtom,
  feedStatsLoadingAtom,
  loadStatsAtom,
  type FeedTemplate,
  type FeedSort,
  type FeedStats,
  type PublishData,
  type RemixSource,
} from './feed'

// ===============================
// 👥 PROFILE - User profiles & follows
// ===============================

export {
  // State
  viewedProfileAtom,
  profileLoadingAtom,
  profileErrorAtom,
  myProfileAtom,
  followersAtom,
  followersLoadingAtom,
  followingAtom,
  followingLoadingAtom,
  followingFeedAtom,
  followingFeedLoadingAtom,
  // Actions
  loadProfileAtom,
  fetchMyProfileAtom,
  updateProfileAtom,
  followUserAtom,
  unfollowUserAtom,
  loadFollowersAtom,
  loadFollowingAtom,
  loadFollowingFeedAtom,
  clearProfileAtom,
  // Types
  type UserProfile,
  type FollowUser,
  type SocialLink,
} from './profile'

// ===============================
// 📦 ASSET BROWSER - Horizontal browser state
// ===============================

export {
  browserCategoryAtom,
  browserSearchAtom,
  browserUploadingAtom,
  browserUploadProgressAtom,
  filteredAssetsAtom,
  setBrowserCategoryAtom,
  setBrowserSearchAtom,
  clearBrowserFiltersAtom,
  categoryCounts,
  CATEGORY_CONFIG,
  type AssetCategory,
} from './assetBrowser'

// ===============================
// 📥 LEADS - Telegram Lead Management
// ===============================

export {
  // State atoms
  leadsAtom,
  leadsLoadingAtom,
  leadsErrorAtom,
  selectedLeadAtom,
  leadsTabAtom,
  leadsStatusFilterAtom,
  leadsIntentFilterAtom,
  leadsSessionFilterAtom,
  leadsSearchAtom,
  sessionsAtom,
  activeSessionAtom,
  sessionsLoadingAtom,
  triggersAtom,
  triggersLoadingAtom,
  leadStatsAtom,
  leadsWsConnectedAtom,
  replyModalAtom,
  // Derived atoms
  unreadLeadsCountAtom,
  filteredLeadsAtom,
  activeTriggersAtom,
  // Action atoms
  addLeadAtom,
  updateLeadAtom,
  markLeadReadAtom,
  markAllLeadsReadAtom,
  addSessionAtom,
  updateSessionStatusAtom,
  setTriggersAtom,
  addTriggerAtom,
  removeTriggerAtom,
  toggleTriggerAtom,
  clearLeadsAtom,
  // API functions
  fetchSessions,
  fetchTriggers,
  addTriggerApi,
  removeTriggerApi,
  testTrigger,
  fetchLeadStats,
  sendLeadAction,
  sendReplyMessage,
  generateScript,
  // Types
  type Lead,
  type LeadIntent,
  type LeadStatus,
  type LeadAction,
  type LeadUrgency,
  type LeadsTab,
  type TelegramSession,
  type Trigger,
  type LeadStats,
} from './leads'

// ===============================
// 📝 SCRIPT - AI Script Generator
// ===============================

export {
  // State
  scriptDataAtom,
  scriptInputAtom,
  scriptOutputTabAtom,
  isGeneratingScriptAtom,
  scriptErrorAtom,
  scriptHistoryAtom,
  // Prefill atoms (integration)
  avatarPrefilledTextAtom,
  imagePrefilledPromptAtom,
  videoPrefilledPromptsAtom,
  // Actions
  generateScriptAtom,
  useVoiceoverInAvatarAtom,
  useCoverInImageAtom,
  useBrollInVideoAtom,
  clearScriptAtom,
  loadScriptFromHistoryAtom,
  // Templates
  scriptTemplatesAtom,
  saveTemplateAtom,
  loadTemplateAtom,
  deleteScriptTemplateAtom,
  // Constants
  DEFAULT_SCRIPT_INPUT,
  NICHE_OPTIONS,
  STYLE_OPTIONS,
  DURATION_OPTIONS,
  PLATFORM_LIMITS,
  // Types
  type ScriptData,
  type ScriptInput,
  type ScriptOutput,
  type ScriptStyle,
  type ScriptDuration,
  type ScriptNiche,
  type ScriptOutputTab,
  type BRollSegment,
  type PlatformCaption,
  type Platform,
  type ScriptTemplate,
} from './script'

// ===============================
// Learn / Education
// ===============================

export {
  // State
  learnProgressAtom,
  // Derived
  beeLevelAtom,
  levelProgressAtom,
  isLessonCompletedAtom,
  // Actions
  addHoneyAtom,
  completeLessonAtom,
  updateStreakAtom,
  resetLearnProgressAtom,
  // Helpers
  getBeeLevel,
  getLevelFromBeeLevel,
  getLevelThresholds,
  // Types
  type BeeLevel,
  type LearnProgress,
} from './learn'

// История генераций из бота: серверная половина — GET /api/assets/:telegram_id
export {
  botAssetsAtom,
  botAssetsLoadingAtom,
  botAssetsErrorAtom,
  loadBotAssetsAtom,
  botAssetsByDayAtom,
  type BotAsset,
} from './botAssets'

// Профиль аватара: фото человека (assets type='avatar_photo'), от которого
// делается весь контент. Один раз загрузил — липсинк берёт лицо отсюда.
export {
  avatarPhotosAtom,
  avatarPhotosLoadingAtom,
  avatarPhotosErrorAtom,
  loadAvatarPhotosAtom,
  saveAvatarPhotoAtom,
  deleteAvatarPhotoAtom,
  type AvatarPhoto,
} from './avatarPhotos'
