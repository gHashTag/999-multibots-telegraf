import { createStore } from 'jotai'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  fetchQuotaAtom,
  hasUnlimitedRendersAtom,
  canRenderAtom,
  logRenderAtom,
  fetchInstagramStatusAtom,
  connectInstagramAtom,
  disconnectInstagramAtom,
  postToInstagramAtom,
  renderQuotaAtom,
  userAtom,
} from './user'
import {
  followUserAtom,
  loadFollowersAtom,
  loadFollowingAtom,
  loadFollowingFeedAtom,
  unfollowUserAtom,
  updateProfileAtom,
} from './profile'
import { publishToFeedAtom, starTemplateAtom } from './feed'
import { SafeBetaCapabilityError } from '@/config/safeBeta'
import { renderVideo } from '@/api/renderApi'
import { generateImage } from '@/lib/generateApi'
import { generateScriptAtom, scriptErrorAtom } from './script'
import { loadSoulAtom, saveSoulAtom, soulErrorAtom } from './soul'
import { openInvoice as openTelegramInvoice } from '@/lib/telegram'
import {
  avatarPhotosAtom,
  avatarPhotosErrorAtom,
  deleteAvatarPhotoAtom,
  loadAvatarPhotosAtom,
  saveAvatarPhotoAtom,
} from './avatarPhotos'
import {
  botAssetsAtom,
  botAssetsErrorAtom,
  loadBotAssetsAtom,
} from './botAssets'

const signedInUser = {
  id: 777,
  first_name: 'Signed owner',
  username: 'signed_owner',
  auth_date: 1,
  hash: 'widget-hash-is-not-server-auth',
  is_admin: true,
}

describe('SAFE BETA disabled actions', () => {
  const fetchSpy = vi.fn()
  const openInvoice = vi.fn()
  const openWindow = vi.fn()

  beforeEach(() => {
    localStorage.clear()
    fetchSpy.mockReset()
    openInvoice.mockReset()
    openWindow.mockReset()
    vi.stubGlobal('fetch', fetchSpy)
    vi.spyOn(window, 'open').mockImplementation(openWindow)
    window.Telegram = {
      WebApp: {
        initData: 'signed-init-data',
        platform: 'android',
        initDataUnsafe: { user: signedInUser },
        openInvoice,
      },
    } as unknown as NonNullable<Window['Telegram']>
    vi.stubEnv('DEV', 'true')
    vi.stubEnv('VITE_SAFE_BETA', 'false')
    vi.stubEnv('VITE_ENABLE_PAID', 'true')
  })

  afterEach(() => {
    delete window.Telegram
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('keeps render and quota fail-closed for admin/dev identities', async () => {
    const store = createStore()
    store.set(userAtom, signedInUser)

    await store.set(fetchQuotaAtom)
    expect(store.get(renderQuotaAtom)).toMatchObject({
      total_renders: 0,
      free_remaining: 0,
      subscription: null,
    })
    expect(store.get(canRenderAtom)).toBe(false)
    expect(store.get(hasUnlimitedRendersAtom)).toBe(false)
    expect(await store.set(logRenderAtom)).toBe(false)
    await expect(renderVideo({} as never)).rejects.toBeInstanceOf(
      SafeBetaCapabilityError
    )
    await expect(
      generateImage({
        model: 'disabled',
        prompt: 'disabled',
        aspectRatio: '1:1',
      })
    ).rejects.toBeInstanceOf(SafeBetaCapabilityError)
    await store.set(generateScriptAtom)
    expect(store.get(scriptErrorAtom)).toBe('SAFE_BETA_GENERATE_DISABLED')
    await store.set(loadBotAssetsAtom, 'video')
    expect(store.get(botAssetsAtom)).toEqual([])
    expect(store.get(botAssetsErrorAtom)).toContain('SAFE BETA')
    await store.set(loadAvatarPhotosAtom)
    expect(store.get(avatarPhotosAtom)).toEqual([])
    expect(store.get(avatarPhotosErrorAtom)).toContain('SAFE BETA')
    expect(
      await store.set(saveAvatarPhotoAtom, 'https://example.test/a.jpg')
    ).toBe(false)
    expect(await store.set(deleteAvatarPhotoAtom, 7)).toBe(false)
    await store.set(loadSoulAtom)
    expect(store.get(soulErrorAtom)).toContain('SAFE BETA')
    expect(await store.set(saveSoulAtom, 'client mutation')).toBe(false)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('does not dispatch disabled Instagram/publish/charge actions', async () => {
    const store = createStore()
    store.set(userAtom, signedInUser)

    await store.set(fetchInstagramStatusAtom)
    expect(await store.set(connectInstagramAtom)).toBeNull()
    expect(await store.set(disconnectInstagramAtom)).toBe(false)
    expect(
      await store.set(postToInstagramAtom, {
        videoUrl: 'https://example.test/video.mp4',
      })
    ).toEqual({ success: false, error: 'SAFE_BETA_PUBLISH_DISABLED' })
    expect(await store.set(starTemplateAtom, 42)).toBe('unsupported')
    await expect(
      openTelegramInvoice('https://example.test/invoice')
    ).resolves.toBe('unsupported')
    await expect(
      store.set(publishToFeedAtom, {
        name: 'blocked',
        videoUrl: 'https://example.test/video.mp4',
      })
    ).rejects.toBeInstanceOf(SafeBetaCapabilityError)

    expect(fetchSpy).not.toHaveBeenCalled()
    expect(openInvoice).not.toHaveBeenCalled()
    expect(openWindow).not.toHaveBeenCalled()
  })

  it('fails closed for unsupported profile endpoints without optimistic state or network', async () => {
    const store = createStore()
    store.set(userAtom, signedInUser)

    expect(
      await store.set(updateProfileAtom, { bio: 'client claim' })
    ).toBeNull()
    expect(await store.set(followUserAtom, 'second_owner')).toBe(false)
    expect(await store.set(unfollowUserAtom, 'second_owner')).toBe(false)
    expect(await store.set(loadFollowersAtom, 'second_owner')).toEqual([])
    expect(await store.set(loadFollowingAtom, 'second_owner')).toEqual([])
    expect(await store.set(loadFollowingFeedAtom)).toEqual([])
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
