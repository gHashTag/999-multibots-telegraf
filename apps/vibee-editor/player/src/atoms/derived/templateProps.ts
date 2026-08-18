// ===============================
// Derived: templateProps
// Composite atom combining all template properties
// ===============================

import { atom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';
import {
  backgroundVideosAtom,
  currentMusicUrlAtom,
  currentMusicVolumeAtom,
  lipSyncVideoUrlAtom,
  CAPTION_DEFAULTS,
  DEFAULT_CAPTIONS,
  STORAGE_KEYS,
  DEFAULT_MUSIC_VOLUME,
  DEFAULT_COVER_DURATION,
  DEFAULT_VIGNETTE_STRENGTH,
  DEFAULT_COLOR_CORRECTION,
  type CaptionItem,
  type CaptionStyle,
  type LipSyncMainProps,
  type AvatarAnimation,
  type AvatarBorderEffect,
  type AvatarModeSettings,
  // Import avatar atoms from shared package
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
  avatarSettingsTabAtom,
  splitAvatarSettingsAtom,
  fullscreenAvatarSettingsAtom,
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
} from '@vibee/atoms';

// Re-export derived atoms from @vibee/atoms for local access
export { currentMusicUrlAtom, currentMusicVolumeAtom, lipSyncVideoUrlAtom };

// Re-export all avatar atoms from @vibee/atoms for backward compatibility
export {
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
  avatarSettingsTabAtom,
  splitAvatarSettingsAtom,
  fullscreenAvatarSettingsAtom,
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
};

// Re-export type for backward compatibility
export type { AvatarModeSettings };

// ===============================
// Primitive Template Props Atoms
// ===============================

export const lipSyncVideoAtom = atom('/lipsync/lipsync.mp4');

export const coverImageAtom = atomWithStorage(
  STORAGE_KEYS.coverImage,
  '/covers/poster.jpeg'
);

export const backgroundMusicAtom = atomWithStorage(
  STORAGE_KEYS.backgroundMusic,
  '/audio/music/bgmusic.mp3'
);

export const musicVolumeAtom = atomWithStorage(
  STORAGE_KEYS.musicVolume,
  DEFAULT_MUSIC_VOLUME
);

export const coverDurationAtom = atomWithStorage(
  STORAGE_KEYS.coverDuration,
  DEFAULT_COVER_DURATION
);

export const vignetteStrengthAtom = atomWithStorage(
  STORAGE_KEYS.vignetteStrength,
  DEFAULT_VIGNETTE_STRENGTH
);

export const colorCorrectionAtom = atomWithStorage(
  STORAGE_KEYS.colorCorrection,
  DEFAULT_COLOR_CORRECTION
);

// ===============================
// Captions Atoms
// ===============================

// Captions data - PERSISTED to survive page refresh (default: demo transcript)
export const captionsAtom = atomWithStorage<CaptionItem[]>(STORAGE_KEYS.captions, DEFAULT_CAPTIONS);

// Caption style (persisted)
export const captionStyleAtom = atomWithStorage<CaptionStyle>(
  STORAGE_KEYS.captionStyle,
  {
    fontSize: CAPTION_DEFAULTS.fontSize,
    textColor: CAPTION_DEFAULTS.textColor,
    highlightColor: CAPTION_DEFAULTS.highlightColor,
    backgroundColor: CAPTION_DEFAULTS.backgroundColor,
    bottomPercent: CAPTION_DEFAULTS.bottomPercent,
    maxWidthPercent: CAPTION_DEFAULTS.maxWidthPercent,
    fontWeight: CAPTION_DEFAULTS.fontWeight,
    showShadow: CAPTION_DEFAULTS.showShadow,
    fontFamily: CAPTION_DEFAULTS.fontFamily,
    animation: 'pop', // Default caption animation (pop-in effect)
  }
);

export const showCaptionsAtom = atomWithStorage(STORAGE_KEYS.showCaptions, true);

// ===============================
// Force Refresh Atom
// ===============================

/**
 * forceRefreshAtom - Used to force re-render when atomWithStorage
 * doesn't trigger React subscriptions properly via editorStore.set()
 */
export const forceRefreshAtom = atom(0);

// ===============================
// Composite templateProps Atom
// ===============================

/**
 * templatePropsAtom - Combines all template props into LipSyncMainProps
 *
 * backgroundVideos is AUTO-DERIVED from video track!
 */
export const templatePropsAtom = atom((get): LipSyncMainProps => {
  // Subscribe to forceRefresh to ensure re-render when agent updates props
  get(forceRefreshAtom);

  return {
    lipSyncVideo: get(lipSyncVideoAtom),
    coverImage: get(coverImageAtom),
    backgroundMusic: get(backgroundMusicAtom),
    backgroundVideos: get(backgroundVideosAtom), // AUTO-DERIVED!
    musicVolume: get(musicVolumeAtom),
    coverDuration: get(coverDurationAtom),
    vignetteStrength: get(vignetteStrengthAtom),
    colorCorrection: get(colorCorrectionAtom),
    circleSizePercent: get(circleSizePercentAtom),
    circleBottomPercent: get(circleBottomPercentAtom),
    circleLeftPercent: get(circleLeftPercentAtom),
    captions: get(captionsAtom),
    captionStyle: get(captionStyleAtom),
    showCaptions: get(showCaptionsAtom),
    faceOffsetX: get(faceOffsetXAtom),
    faceOffsetY: get(faceOffsetYAtom),
    faceScale: get(faceScaleAtom),
    isCircleAvatar: get(isCircleAvatarAtom),
    avatarBorderRadius: get(avatarBorderRadiusAtom),
    // Split mode settings
    splitCircleSize: get(splitCircleSizeAtom),
    splitPositionX: get(splitPositionXAtom),
    splitPositionY: get(splitPositionYAtom),
    splitFaceScale: get(splitFaceScaleAtom),
    splitIsCircle: get(splitIsCircleAtom),
    splitBorderRadius: get(splitBorderRadiusAtom),
    // Fullscreen mode settings
    fullscreenCircleSize: get(fullscreenCircleSizeAtom),
    fullscreenPositionX: get(fullscreenPositionXAtom),
    fullscreenPositionY: get(fullscreenPositionYAtom),
    fullscreenFaceScale: get(fullscreenFaceScaleAtom),
    fullscreenIsCircle: get(fullscreenIsCircleAtom),
    fullscreenBorderRadius: get(fullscreenBorderRadiusAtom),
    // Avatar animation
    avatarAnimation: get(avatarAnimationAtom),
    // Avatar border effect
    avatarBorderEffect: get(avatarBorderEffectAtom),
    avatarBorderColor: get(avatarBorderColorAtom),
    avatarBorderColor2: get(avatarBorderColor2Atom),
    avatarBorderWidth: get(avatarBorderWidthAtom),
    avatarBorderIntensity: get(avatarBorderIntensityAtom),
  };
});

// ===============================
// Update Template Prop Action
// ===============================

// Type-safe prop atom map - ensures keys match LipSyncMainProps
const propAtomMap = {
  lipSyncVideo: lipSyncVideoAtom,
  coverImage: coverImageAtom,
  backgroundMusic: backgroundMusicAtom,
  musicVolume: musicVolumeAtom,
  coverDuration: coverDurationAtom,
  vignetteStrength: vignetteStrengthAtom,
  colorCorrection: colorCorrectionAtom,
  circleSizePercent: circleSizePercentAtom,
  circleBottomPercent: circleBottomPercentAtom,
  circleLeftPercent: circleLeftPercentAtom,
  captions: captionsAtom,
  captionStyle: captionStyleAtom,
  showCaptions: showCaptionsAtom,
  faceOffsetX: faceOffsetXAtom,
  faceOffsetY: faceOffsetYAtom,
  faceScale: faceScaleAtom,
  isCircleAvatar: isCircleAvatarAtom,
  avatarBorderRadius: avatarBorderRadiusAtom,
  // Split mode
  splitCircleSize: splitCircleSizeAtom,
  splitPositionX: splitPositionXAtom,
  splitPositionY: splitPositionYAtom,
  splitFaceScale: splitFaceScaleAtom,
  splitIsCircle: splitIsCircleAtom,
  splitBorderRadius: splitBorderRadiusAtom,
  // Fullscreen mode
  fullscreenCircleSize: fullscreenCircleSizeAtom,
  fullscreenPositionX: fullscreenPositionXAtom,
  fullscreenPositionY: fullscreenPositionYAtom,
  fullscreenFaceScale: fullscreenFaceScaleAtom,
  fullscreenIsCircle: fullscreenIsCircleAtom,
  fullscreenBorderRadius: fullscreenBorderRadiusAtom,
  // Animation
  avatarAnimation: avatarAnimationAtom,
  // Border effect
  avatarBorderEffect: avatarBorderEffectAtom,
  avatarBorderColor: avatarBorderColorAtom,
  avatarBorderColor2: avatarBorderColor2Atom,
  avatarBorderWidth: avatarBorderWidthAtom,
  avatarBorderIntensity: avatarBorderIntensityAtom,
} as const;

// Extract valid keys from the map (type-safe)
export type TemplatePropKey = keyof typeof propAtomMap;

export const updateTemplatePropAtom = atom(
  null,
  (
    _get,
    set,
    { key, value }: { key: TemplatePropKey; value: unknown }
  ) => {
    const propAtom = propAtomMap[key];
    if (propAtom) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      set(propAtom as any, value);
    } else {
      console.warn(`[updateTemplateProp] Unknown key: ${String(key)}`);
    }
  }
);
