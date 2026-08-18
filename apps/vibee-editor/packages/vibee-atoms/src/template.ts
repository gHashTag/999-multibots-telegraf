// Template props atoms - shared between mobile and web editors
// Note: Avatar atoms have been moved to ./avatar.ts for consolidation
import { atom } from 'jotai'
import {
  DEFAULT_MUSIC_VOLUME,
  DEFAULT_VIGNETTE_STRENGTH,
  DEFAULT_COLOR_CORRECTION,
  DEFAULT_COVER_DURATION,
} from './defaults'

// ===============================
// Media Atoms (using defaults from ./defaults.ts - single source of truth)
// ===============================

export const lipSyncVideoAtom = atom('/lipsync/lipsync.mp4')
export const coverImageAtom = atom('/covers/poster.jpeg')
export const backgroundMusicAtom = atom('/audio/music/bgmusic.mp3')
export const musicVolumeAtom = atom(DEFAULT_MUSIC_VOLUME)
export const coverDurationAtom = atom(DEFAULT_COVER_DURATION)

// ===============================
// Effects Atoms (using defaults from ./defaults.ts - single source of truth)
// ===============================

export const vignetteStrengthAtom = atom(DEFAULT_VIGNETTE_STRENGTH)
export const colorCorrectionAtom = atom(DEFAULT_COLOR_CORRECTION)

// ===============================
// Domain Group Atoms (for optimized subscriptions)
// ===============================

import { captionsAtom, captionStyleAtom, showCaptionsAtom } from './captions'
import {
  avatarConfigAtom,
  splitAvatarSettingsAtom,
  fullscreenAvatarSettingsAtom,
  avatarBorderConfigAtom,
} from './avatar'

// Media props group
export const mediaPropsAtom = atom((get) => ({
  lipSyncVideo: get(lipSyncVideoAtom),
  coverImage: get(coverImageAtom),
  backgroundMusic: get(backgroundMusicAtom),
  musicVolume: get(musicVolumeAtom),
  coverDuration: get(coverDurationAtom),
}))

// Effects props group
export const effectsPropsAtom = atom((get) => ({
  vignetteStrength: get(vignetteStrengthAtom),
  colorCorrection: get(colorCorrectionAtom),
}))

// Caption props group
export const captionPropsAtom = atom((get) => ({
  captions: get(captionsAtom),
  captionStyle: get(captionStyleAtom),
  showCaptions: get(showCaptionsAtom),
}))

// Avatar props group (combines avatar config)
export const avatarPropsAtom = atom((get) => ({
  ...get(avatarConfigAtom),
}))

// Split mode props group
export const splitModePropsAtom = atom((get) => ({
  ...get(splitAvatarSettingsAtom),
}))

// Fullscreen mode props group
export const fullscreenModePropsAtom = atom((get) => ({
  ...get(fullscreenAvatarSettingsAtom),
}))

// Border effects props group
export const borderEffectPropsAtom = atom((get) => get(avatarBorderConfigAtom))
