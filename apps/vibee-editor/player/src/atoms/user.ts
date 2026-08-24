// ===============================
// User Atom - Telegram Auth State
// ===============================

import { atom } from 'jotai'
import { atomWithStorage } from 'jotai/utils'
import { STORAGE_KEYS } from '@vibee/atoms'
import {
  SAFE_BETA_RENDER_QUOTA,
  SafeBetaCapabilityError,
} from '@/config/safeBeta'
import type {
  TelegramUser,
  RenderQuota,
  SubscriptionInfo,
  InstagramStatus,
} from '@vibee/atoms'

export type { TelegramUser, RenderQuota, SubscriptionInfo, InstagramStatus }

export const userAtom = atomWithStorage<TelegramUser | null>(
  STORAGE_KEYS.user,
  null
)

export const renderQuotaAtom = atom<RenderQuota | null>(null)
export const quotaLoadingAtom = atom(false)
export const showPaywallAtom = atom(false)
export const showLoginModalAtom = atom(false)

/**
 * SAFE BETA never asks a legacy quota endpoint to identify the caller with a
 * query parameter. The immutable client artifact reports zero capability.
 */
export const fetchQuotaAtom = atom(null, async (_get, set) => {
  set(quotaLoadingAtom, true)
  set(renderQuotaAtom, { ...SAFE_BETA_RENDER_QUOTA })
  set(quotaLoadingAtom, false)
})

/** Rendering is unavailable, so there is nothing to log or decrement. */
export const logRenderAtom = atom(null, async () => false)

/** No hostname, admin bit, preview mode, or runtime env can elevate these. */
export const canRenderAtom = atom(false)
export const isDevModeAtom = atom(false)
export const hasUnlimitedRendersAtom = atom(false)

export const logoutAtom = atom(null, (_get, set) => {
  set(userAtom, null)
  set(renderQuotaAtom, null)
  set(showPaywallAtom, false)
  set(instagramStatusAtom, null)
})

// ===============================
// Publishing integrations
// ===============================

export const instagramStatusAtom = atom<InstagramStatus | null>(null)
export const instagramLoadingAtom = atom(false)

/** Publishing integrations are deliberately unavailable in SAFE BETA. */
export const fetchInstagramStatusAtom = atom(null, async (_get, set) => {
  set(instagramLoadingAtom, false)
  set(instagramStatusAtom, null)
})

export const connectInstagramAtom = atom(null, async () => null)

export const disconnectInstagramAtom = atom(null, async () => false)

export const postToInstagramAtom = atom(
  null,
  async (
    _get,
    _set,
    _input: { videoUrl: string; caption?: string }
  ): Promise<{ success: false; error: string }> => ({
    success: false,
    error: new SafeBetaCapabilityError('publish').message,
  })
)
