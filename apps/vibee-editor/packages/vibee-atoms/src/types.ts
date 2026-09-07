// ===============================
// @vibee/atoms - Unified Type Definitions
// Single source of truth for Web & Mobile editors
// ===============================

// ===============================
// Project
// ===============================

export interface Project {
  id: string
  name: string
  fps: number
  width: number
  height: number
  durationInFrames: number
}

// ===============================
// Animation Types
// ===============================

export type AvatarAnimation =
  | 'none'
  | 'fade'
  | 'scale'
  | 'pop'
  | 'slide'
  | 'bounce'
export type CaptionAnimation =
  | 'pop'
  | 'fade'
  | 'slide'
  | 'bounce'
  | 'scaleRotate'

// ===============================
// Avatar Border Effect Types
// ===============================

export type AvatarBorderEffect =
  | 'none'
  | 'solid'
  | 'neon'
  | 'rainbow'
  | 'glass'
  | 'gradient'
  | 'pulse'
  | 'glow'
  | 'double'
  | 'neonPulse'
  | 'fire'
  | 'ocean'
  | 'sunset'
  | 'electric'
  | 'holographic'

// ===============================
// Track Types
// ===============================

export type TrackType =
  | 'video'
  | 'avatar'
  | 'text'
  | 'voice'
  | 'audio'
  | 'image'

export interface Track {
  id: string
  type: TrackType
  name: string
  items: TrackItem[]
  locked: boolean
  visible: boolean
  muted: boolean
  solo: boolean
}

// ===============================
// Track Item Types
// ===============================

export type ColorTag =
  | 'none'
  | 'red'
  | 'orange'
  | 'yellow'
  | 'green'
  | 'blue'
  | 'purple'
  | 'pink'

export type VideoLayout =
  | 'top-half'
  | 'top-2-3'
  | 'top-3-4'
  | 'bottom-half'
  | 'bottom-2-3'
  | 'side-left'
  | 'side-right'
  | 'fullscreen'
  | 'pip-top-left'
  | 'pip-top-right'
  | 'pip-center-left'
  | 'pip-center-right'
  | 'pip-bottom-left'
  | 'pip-bottom-right'

export interface TrackItemBase {
  id: string
  trackId: string
  assetId?: string
  name?: string

  // Timeline position
  startFrame: number
  durationInFrames: number

  // Canvas position & transform
  x: number
  y: number
  width: number
  height: number
  rotation: number
  opacity: number

  // Organization
  colorTag?: ColorTag
}

export interface VideoItemProps {
  type: 'video'
  volume: number
  playbackRate: number
  layout?: VideoLayout
  url?: string
  // Content panning inside container (object-position %)
  cropX?: number // 0-100, default 50 (center)
  cropY?: number // 0-100, default 50 (center)
}

export interface ImageItemProps {
  type: 'image'
  url?: string
}

export interface TextItemProps {
  type: 'text'
  text: string
  fontSize: number
  fontFamily: string
  fontWeight: number
  color: string
  textAlign: 'left' | 'center' | 'right'
}

export interface VoiceItemProps {
  type: 'voice'
  volume: number
  url?: string
}

export interface AudioItemProps {
  type: 'audio'
  volume: number
  url?: string
}

export interface AvatarItemProps {
  type: 'avatar'
  volume: number
  url?: string
  circleSizePercent: number
  circleBottomPercent: number
  circleLeftPercent: number
  // Face control
  faceScale?: number
  faceOffsetX?: number
  faceOffsetY?: number
  // Shape
  isCircle?: boolean
  avatarBorderRadius?: number
  // Border effects
  borderEffect?: AvatarBorderEffect
  borderColor?: string
  borderWidth?: number
  borderIntensity?: number
  // Animation
  avatarAnimation?: AvatarAnimation
}

export type TrackItemProps =
  | VideoItemProps
  | ImageItemProps
  | TextItemProps
  | VoiceItemProps
  | AudioItemProps
  | AvatarItemProps

export type TrackItem = TrackItemBase & TrackItemProps

// ===============================
// Asset Types
// ===============================

export type AssetType = 'video' | 'image' | 'audio' | 'voice' | 'music'

export interface Asset {
  id: string
  type: AssetType
  name: string
  url: string
  thumbnail?: string
  duration?: number // frames
  width?: number
  height?: number
  fileSize?: number
}

// ===============================
// Selection
// ===============================

export interface Selection {
  itemIds: string[]
  trackId?: string
}

export interface ClipboardItem {
  item: TrackItem
  trackType: TrackType
}

// ===============================
// Caption Types
// ===============================

export interface CaptionItem {
  text: string
  startMs: number
  endMs: number
  timestampMs?: number
  confidence?: number | null
}

export interface CaptionStyle {
  fontSize?: number
  textColor?: string
  highlightColor?: string
  backgroundColor?: string
  bottomPercent?: number
  maxWidthPercent?: number
  fontId?: string
  fontFamily?: string
  fontWeight?: number
  showShadow?: boolean
  animation?: CaptionAnimation
  maxWords?: number // Max words per caption segment
}

// ===============================
// Timeline Segments
// ===============================

export interface Segment {
  type: 'split' | 'fullscreen'
  startFrame: number
  durationFrames: number
  bRollUrl?: string
  bRollType?: 'video' | 'image'
  layout?: VideoLayout
  offsetX?: number
  offsetY?: number
  scaleWidth?: number
  scaleHeight?: number
  cropX?: number
  cropY?: number
}

// ===============================
// Avatar Mode Settings
// ===============================

export interface AvatarModeSettings {
  circleSize: number
  positionX: number
  positionY: number
  faceScale: number
  isCircle: boolean
  borderRadius: number
  // Face offset (fine-tuning)
  faceOffsetX?: number
  faceOffsetY?: number
}

// ===============================
// Consolidated Avatar Config
// Single source of truth for all avatar settings
// Replaces 16+ separate atoms with one unified config
// ===============================

export interface AvatarConfig {
  // Circle/shape settings
  circleSizePercent: number
  circleBottomPercent: number
  circleLeftPercent: number
  // Face positioning
  faceOffsetX: number
  faceOffsetY: number
  faceScale: number
  // Shape type
  isCircle: boolean
  borderRadius: number
  // Animation
  animation: AvatarAnimation
  // Border effects
  borderEffect: AvatarBorderEffect
  borderColor: string
  borderColor2: string
  borderWidth: number
  borderIntensity: number
}

// ===============================
// Template Props (LipSyncMain)
// ===============================

export interface LipSyncMainProps {
  // Media
  lipSyncVideo: string
  coverImage: string
  backgroundMusic: string
  backgroundVideos: string[]

  // Effects
  musicVolume: number
  coverDuration: number
  vignetteStrength: number
  colorCorrection: number

  // Avatar position (legacy)
  circleSizePercent: number
  circleBottomPercent: number
  circleLeftPercent: number

  // Face centering
  faceOffsetX?: number
  faceOffsetY?: number
  faceScale?: number

  // Circle avatar
  isCircleAvatar?: boolean
  avatarBorderRadius?: number

  // Split mode settings
  splitCircleSize?: number
  splitPositionX?: number
  splitPositionY?: number
  splitFaceScale?: number
  splitIsCircle?: boolean
  splitBorderRadius?: number

  // Fullscreen mode settings
  fullscreenCircleSize?: number
  fullscreenPositionX?: number
  fullscreenPositionY?: number
  fullscreenFaceScale?: number
  fullscreenIsCircle?: boolean
  fullscreenBorderRadius?: number

  // Avatar animation
  avatarAnimation?: AvatarAnimation

  // Avatar border effects
  avatarBorderEffect?: AvatarBorderEffect
  avatarBorderColor?: string
  avatarBorderColor2?: string
  avatarBorderWidth?: number
  avatarBorderIntensity?: number

  // Captions
  captions?: CaptionItem[]
  captionStyle?: CaptionStyle
  showCaptions?: boolean
}

// ===============================
// Snap Settings
// ===============================

export interface SnapSettings {
  enabled: boolean
  interval: number
}

// ===============================
// Timeline Markers
// ===============================

export type MarkerColor = 'yellow' | 'red' | 'green' | 'blue' | 'purple'

export interface Marker {
  id: string
  frame: number
  name: string
  color: MarkerColor
}

// ===============================
// History (Undo/Redo)
// ===============================

export interface HistoryState {
  states: Track[][]
  index: number
}

// ===============================
// Transition Types
// ===============================

export type TransitionType =
  | 'none'
  | 'fade'
  | 'crossfade'
  | 'slide-left'
  | 'slide-right'
  | 'slide-up'
  | 'slide-down'
  | 'zoom-in'
  | 'zoom-out'
  | 'wipe-left'
  | 'wipe-right'
  | 'wipe-up'
  | 'wipe-down'

export interface Transition {
  type: TransitionType
  durationFrames: number
}

// ===============================
// Template
// ===============================

export interface EditorTemplate {
  id: number | string
  name: string
  thumbnail_url?: string | null
  video_url?: string | null
  duration_seconds?: number
  creator_name?: string
  template_settings?: Record<string, unknown>
  assets?: Asset[]
  tracks?: Track[]
  transitions?: Transition[]
}

// ===============================
// UI State Types
// ===============================

export type SidebarTab =
  | 'templates'
  | 'lipsync'
  | 'video'
  | 'image'
  | 'voice'
  | 'music'
  | 'effects'

export type ModalType =
  | 'none'
  | 'speed'
  | 'addTrack'
  | 'export'
  | 'settings'
  | 'properties'
  | 'script'
  | 'drafts'
  | 'colorEffects'
  | 'typography'
  | 'textAnimations'
  | 'captions'
  | 'keyframes'

// ===============================
// User/Auth Types
// Cross-platform user authentication types
// ===============================

// Telegram user from Login Widget
export interface TelegramUser {
  id: number
  first_name: string
  last_name?: string
  username?: string
  photo_url?: string
  auth_date: number
  /** Present only while Telegram's Login Widget payload is being verified. */
  hash?: string
  is_admin?: boolean
}

// Subscription plan info
export interface SubscriptionInfo {
  plan: string // 'junior' | 'middle' | 'senior'
  generations_limit: number | null
  generations_used: number
  remaining: number | null
}

// Render quota from API
export interface RenderQuota {
  telegram_id: number
  total_renders: number
  free_remaining: number
  subscription: SubscriptionInfo | null
}

// Instagram connection status
export interface InstagramStatus {
  connected: boolean
  instagram_user_id?: string
  instagram_username?: string
  /**
   * Интеграции нет на этом сервере — подключать НЕКУДА.
   *
   * Отдельно от `connected: false`, потому что это разные вещи для человека:
   * «не подключено» он может исправить, «подключить некуда» — нет. Пока их
   * не различали, модалка публикации показывала кнопку «Подключить
   * Instagram», нажатие на которую не делало ровно ничего.
   */
  unavailable?: boolean
  /** Почему недоступно — короткой строкой, для честного текста в интерфейсе. */
  reason?: string
}

// ===============================
// Feed Types
// Social feed for public templates
// ===============================

// Feed template - a published video/template in the social feed
export interface FeedTemplate {
  id: number
  /** Composition identity sent by the feed API and consumed by profile grouping. */
  compositionId?: string | null
  telegramId: number
  creatorName: string
  creatorAvatar?: string
  creatorUsername?: string
  name: string
  description?: string
  thumbnailUrl?: string
  videoUrl: string
  templateSettings: Record<string, unknown>
  assets: Asset[]
  tracks: Track[]
  likesCount: number
  viewsCount: number
  usesCount: number
  isLiked: boolean
  isFeatured: boolean
  /** Звёзды Telegram, подаренные ролику (падают автору на баланс). */
  starsCount: number
  /** Дарил ли ЭТОТ юзер звезду ролику (оплаченная строка template_stars). */
  isStarred: boolean
  createdAt: string
  // Remix attribution
  parentTemplateId?: number
  originalCreatorName?: string
  originalCreatorAvatar?: string
}

// Remix source tracking - when user uses a template from feed
export interface RemixSource {
  templateId: number
  templateName: string
  creatorName: string
  creatorAvatar?: string
}

// Data for publishing a template to feed
export interface PublishData {
  templateId?: number
  name: string
  description?: string
  thumbnailUrl?: string
  videoUrl: string
  templateSettings: Record<string, unknown>
  assets: Asset[]
  tracks: Track[]
  postToTelegram?: boolean
  postToInstagram?: boolean
  telegramCaption?: string
  // Remix attribution
  parentTemplateId?: number
  originalCreatorId?: number
}

// Feed sorting options
export type FeedSort = 'recent' | 'popular'

// Feed type tabs
export type FeedType = 'for_you' | 'following'

// Feed statistics
export interface FeedStats {
  creatorsCount: number
  reelsCount: number
  totalViews: number
  totalLikes: number
}

// ===============================
// Social/Profile Types
// ===============================

// User profile in the social feed
export interface UserProfile {
  id: number
  telegramId: number
  username: string
  displayName: string
  bio?: string
  avatarUrl?: string
  followersCount: number
  followingCount: number
  templatesCount: number
  isFollowing: boolean
}

// Follower/Following user info
export interface FollowUser {
  id: number
  username: string
  displayName: string
  avatarUrl?: string
}
