// ===============================
// Derived Atoms - Auto-computed state
// ===============================

export { backgroundVideosAtom } from './backgroundVideos';
export { segmentsAtom } from './segments';
export {
  // Primitive atoms
  lipSyncVideoAtom,
  coverImageAtom,
  backgroundMusicAtom,
  musicVolumeAtom,
  coverDurationAtom,
  // Derived atoms from @vibee/atoms
  currentMusicUrlAtom,
  currentMusicVolumeAtom,
  lipSyncVideoUrlAtom,
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
  // Captions
  captionsAtom,
  captionStyleAtom,
  showCaptionsAtom,
  // Avatar animation
  avatarAnimationAtom,
  // Avatar border effects
  avatarBorderEffectAtom,
  avatarBorderColorAtom,
  avatarBorderColor2Atom,
  avatarBorderWidthAtom,
  avatarBorderIntensityAtom,
  // Composite
  templatePropsAtom,
  updateTemplatePropAtom,
  type TemplatePropKey,
  forceRefreshAtom,
} from './templateProps';
