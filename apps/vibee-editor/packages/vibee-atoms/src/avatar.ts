// ===============================
// @vibee/atoms - Avatar Configuration Atoms
// Single source of truth for all avatar settings
// Used by both apps/mobile/ and remotion/player/
// ===============================

import { atom, type PrimitiveAtom, type WritableAtom } from 'jotai'
import type { AvatarConfig, AvatarAnimation, AvatarBorderEffect, AvatarModeSettings } from './types'
import { DEFAULT_AVATAR_CONFIG, DEFAULT_SPLIT_AVATAR, DEFAULT_FULLSCREEN_AVATAR } from './defaults'
import { STORAGE_KEYS } from './keys'

// Re-export storage keys for consumers to use with their own atomWithStorage
export const AVATAR_CONFIG_STORAGE_KEY = STORAGE_KEYS.avatarConfig
export const SPLIT_AVATAR_STORAGE_KEY = STORAGE_KEYS.splitAvatarSettings
export const FULLSCREEN_AVATAR_STORAGE_KEY = STORAGE_KEYS.fullscreenAvatarSettings

// ===============================
// Factory Function for Avatar Config Derived Atoms
// ===============================

/**
 * Creates derived atoms from an avatarConfigAtom.
 * This allows consumers to use their own atomWithStorage implementation.
 *
 * Usage:
 * ```ts
 * import { atomWithStorage } from 'jotai/utils';
 * import { createAvatarDerivedAtoms, DEFAULT_AVATAR_CONFIG, AVATAR_CONFIG_STORAGE_KEY } from '@vibee/atoms';
 *
 * const avatarConfigAtom = atomWithStorage(AVATAR_CONFIG_STORAGE_KEY, DEFAULT_AVATAR_CONFIG);
 * const { circleSizePercentAtom, faceScaleAtom, ... } = createAvatarDerivedAtoms(avatarConfigAtom);
 * ```
 */
export function createAvatarDerivedAtoms<T extends AvatarConfig>(
  configAtom: PrimitiveAtom<T> | WritableAtom<T, [T], void>
) {
  const circleSizePercentAtom = atom(
    (get) => get(configAtom).circleSizePercent,
    (get, set, value: number) => {
      set(configAtom, { ...get(configAtom), circleSizePercent: value } as T)
    }
  )

  const circleBottomPercentAtom = atom(
    (get) => get(configAtom).circleBottomPercent,
    (get, set, value: number) => {
      set(configAtom, { ...get(configAtom), circleBottomPercent: value } as T)
    }
  )

  const circleLeftPercentAtom = atom(
    (get) => get(configAtom).circleLeftPercent,
    (get, set, value: number) => {
      set(configAtom, { ...get(configAtom), circleLeftPercent: value } as T)
    }
  )

  const faceOffsetXAtom = atom(
    (get) => get(configAtom).faceOffsetX,
    (get, set, value: number) => {
      set(configAtom, { ...get(configAtom), faceOffsetX: value } as T)
    }
  )

  const faceOffsetYAtom = atom(
    (get) => get(configAtom).faceOffsetY,
    (get, set, value: number) => {
      set(configAtom, { ...get(configAtom), faceOffsetY: value } as T)
    }
  )

  const faceScaleAtom = atom(
    (get) => get(configAtom).faceScale,
    (get, set, value: number) => {
      set(configAtom, { ...get(configAtom), faceScale: value } as T)
    }
  )

  const isCircleAvatarAtom = atom(
    (get) => get(configAtom).isCircle,
    (get, set, value: boolean) => {
      set(configAtom, { ...get(configAtom), isCircle: value } as T)
    }
  )

  const avatarBorderRadiusAtom = atom(
    (get) => get(configAtom).borderRadius,
    (get, set, value: number) => {
      set(configAtom, { ...get(configAtom), borderRadius: value } as T)
    }
  )

  const avatarAnimationAtom = atom(
    (get) => get(configAtom).animation,
    (get, set, value: AvatarAnimation) => {
      set(configAtom, { ...get(configAtom), animation: value } as T)
    }
  )

  const avatarBorderEffectAtom = atom(
    (get) => get(configAtom).borderEffect,
    (get, set, value: AvatarBorderEffect) => {
      set(configAtom, { ...get(configAtom), borderEffect: value } as T)
    }
  )

  const avatarBorderColorAtom = atom(
    (get) => get(configAtom).borderColor,
    (get, set, value: string) => {
      set(configAtom, { ...get(configAtom), borderColor: value } as T)
    }
  )

  const avatarBorderColor2Atom = atom(
    (get) => get(configAtom).borderColor2,
    (get, set, value: string) => {
      set(configAtom, { ...get(configAtom), borderColor2: value } as T)
    }
  )

  const avatarBorderWidthAtom = atom(
    (get) => get(configAtom).borderWidth,
    (get, set, value: number) => {
      set(configAtom, { ...get(configAtom), borderWidth: value } as T)
    }
  )

  const avatarBorderIntensityAtom = atom(
    (get) => get(configAtom).borderIntensity,
    (get, set, value: number) => {
      set(configAtom, { ...get(configAtom), borderIntensity: value } as T)
    }
  )

  const resetAvatarConfigAtom = atom(null, (_get, set) => {
    set(configAtom, DEFAULT_AVATAR_CONFIG as T)
  })

  return {
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
    resetAvatarConfigAtom,
  }
}

// ===============================
// Factory Function for Split/Fullscreen Mode Settings
// ===============================

export function createSplitModeAtoms<T extends AvatarModeSettings>(
  settingsAtom: PrimitiveAtom<T> | WritableAtom<T, [T], void>
) {
  const splitCircleSizeAtom = atom(
    (get) => get(settingsAtom).circleSize,
    (get, set, value: number) => {
      set(settingsAtom, { ...get(settingsAtom), circleSize: value } as T)
    }
  )

  const splitPositionXAtom = atom(
    (get) => get(settingsAtom).positionX,
    (get, set, value: number) => {
      set(settingsAtom, { ...get(settingsAtom), positionX: value } as T)
    }
  )

  const splitPositionYAtom = atom(
    (get) => get(settingsAtom).positionY,
    (get, set, value: number) => {
      set(settingsAtom, { ...get(settingsAtom), positionY: value } as T)
    }
  )

  const splitFaceScaleAtom = atom(
    (get) => get(settingsAtom).faceScale,
    (get, set, value: number) => {
      set(settingsAtom, { ...get(settingsAtom), faceScale: value } as T)
    }
  )

  const splitIsCircleAtom = atom(
    (get) => get(settingsAtom).isCircle,
    (get, set, value: boolean) => {
      set(settingsAtom, { ...get(settingsAtom), isCircle: value } as T)
    }
  )

  const splitBorderRadiusAtom = atom(
    (get) => get(settingsAtom).borderRadius,
    (get, set, value: number) => {
      set(settingsAtom, { ...get(settingsAtom), borderRadius: value } as T)
    }
  )

  const resetSplitAvatarAtom = atom(null, (_get, set) => {
    set(settingsAtom, DEFAULT_SPLIT_AVATAR as T)
  })

  return {
    splitCircleSizeAtom,
    splitPositionXAtom,
    splitPositionYAtom,
    splitFaceScaleAtom,
    splitIsCircleAtom,
    splitBorderRadiusAtom,
    resetSplitAvatarAtom,
  }
}

export function createFullscreenModeAtoms<T extends AvatarModeSettings>(
  settingsAtom: PrimitiveAtom<T> | WritableAtom<T, [T], void>
) {
  const fullscreenCircleSizeAtom = atom(
    (get) => get(settingsAtom).circleSize,
    (get, set, value: number) => {
      set(settingsAtom, { ...get(settingsAtom), circleSize: value } as T)
    }
  )

  const fullscreenPositionXAtom = atom(
    (get) => get(settingsAtom).positionX,
    (get, set, value: number) => {
      set(settingsAtom, { ...get(settingsAtom), positionX: value } as T)
    }
  )

  const fullscreenPositionYAtom = atom(
    (get) => get(settingsAtom).positionY,
    (get, set, value: number) => {
      set(settingsAtom, { ...get(settingsAtom), positionY: value } as T)
    }
  )

  const fullscreenFaceScaleAtom = atom(
    (get) => get(settingsAtom).faceScale,
    (get, set, value: number) => {
      set(settingsAtom, { ...get(settingsAtom), faceScale: value } as T)
    }
  )

  const fullscreenIsCircleAtom = atom(
    (get) => get(settingsAtom).isCircle,
    (get, set, value: boolean) => {
      set(settingsAtom, { ...get(settingsAtom), isCircle: value } as T)
    }
  )

  const fullscreenBorderRadiusAtom = atom(
    (get) => get(settingsAtom).borderRadius,
    (get, set, value: number) => {
      set(settingsAtom, { ...get(settingsAtom), borderRadius: value } as T)
    }
  )

  const resetFullscreenAvatarAtom = atom(null, (_get, set) => {
    set(settingsAtom, DEFAULT_FULLSCREEN_AVATAR as T)
  })

  return {
    fullscreenCircleSizeAtom,
    fullscreenPositionXAtom,
    fullscreenPositionYAtom,
    fullscreenFaceScaleAtom,
    fullscreenIsCircleAtom,
    fullscreenBorderRadiusAtom,
    resetFullscreenAvatarAtom,
  }
}

// ===============================
// Default Atoms (in-memory, no storage)
// For consumers who want persistent storage, use the factory functions
// with your own atomWithStorage
// ===============================

export const avatarConfigAtom = atom<AvatarConfig>(DEFAULT_AVATAR_CONFIG)
export const splitAvatarSettingsAtom = atom<AvatarModeSettings>(DEFAULT_SPLIT_AVATAR)
export const fullscreenAvatarSettingsAtom = atom<AvatarModeSettings>(DEFAULT_FULLSCREEN_AVATAR)
export const avatarSettingsTabAtom = atom<'split' | 'fullscreen'>('split')

// Create derived atoms from the default atoms
const defaultAvatarDerived = createAvatarDerivedAtoms(avatarConfigAtom)
const defaultSplitDerived = createSplitModeAtoms(splitAvatarSettingsAtom)
const defaultFullscreenDerived = createFullscreenModeAtoms(fullscreenAvatarSettingsAtom)

// Export derived atoms for backward compatibility
export const {
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
  resetAvatarConfigAtom,
} = defaultAvatarDerived

export const {
  splitCircleSizeAtom,
  splitPositionXAtom,
  splitPositionYAtom,
  splitFaceScaleAtom,
  splitIsCircleAtom,
  splitBorderRadiusAtom,
  resetSplitAvatarAtom,
} = defaultSplitDerived

export const {
  fullscreenCircleSizeAtom,
  fullscreenPositionXAtom,
  fullscreenPositionYAtom,
  fullscreenFaceScaleAtom,
  fullscreenIsCircleAtom,
  fullscreenBorderRadiusAtom,
  resetFullscreenAvatarAtom,
} = defaultFullscreenDerived

// ===============================
// Legacy Border Config Atom
// ===============================

export interface AvatarBorderConfig {
  effect: AvatarBorderEffect
  color: string
  color2: string
  width: number
  intensity: number
}

export const avatarBorderConfigAtom = atom(
  (get): AvatarBorderConfig => {
    const config = get(avatarConfigAtom)
    return {
      effect: config.borderEffect,
      color: config.borderColor,
      color2: config.borderColor2,
      width: config.borderWidth,
      intensity: config.borderIntensity,
    }
  },
  (get, set, value: AvatarBorderConfig) => {
    const config = get(avatarConfigAtom)
    set(avatarConfigAtom, {
      ...config,
      borderEffect: value.effect,
      borderColor: value.color,
      borderColor2: value.color2,
      borderWidth: value.width,
      borderIntensity: value.intensity,
    })
  }
)
