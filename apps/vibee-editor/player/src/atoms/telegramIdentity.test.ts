import { createStore } from 'jotai'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { telegramAutoLoginAtom } from './telegramAuth'
import { fetchMyProfileAtom, myProfileAtom } from './profile'
import { userAtom } from './user'

const setTelegramLaunch = (id: number, initData = 'signed-launch-data') => {
  window.Telegram = {
    WebApp: {
      platform: 'android',
      initData,
      initDataUnsafe: {
        user: { id, first_name: `Owner ${id}`, username: `owner_${id}` },
      },
    },
  } as unknown as NonNullable<Window['Telegram']>
}

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  delete window.Telegram
  vi.restoreAllMocks()
})

describe('active Telegram profile identity', () => {
  it('replaces a stale persisted user with the current launch identity', () => {
    const store = createStore()
    store.set(userAtom, {
      id: 111,
      first_name: 'Previous owner',
      auth_date: 0,
      hash: '',
      is_admin: false,
    })
    setTelegramLaunch(222)

    store.set(telegramAutoLoginAtom)

    expect(store.get(userAtom)?.id).toBe(222)
  })

  it('loads /api/users/me with initData and no client telegramId', async () => {
    const store = createStore()
    setTelegramLaunch(222, 'signed-owner-222')
    store.set(telegramAutoLoginAtom)
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          profile: {
            id: '1',
            telegram_id: '222',
            username: 'owner_222',
            display_name: 'Owner 222',
            social_links: [],
            is_public: true,
            is_verified: false,
            followers_count: 0,
            following_count: 0,
            templates_count: 0,
            total_views: 0,
            total_likes: 0,
            is_following: false,
            is_own_profile: true,
          },
        }),
    } as Response)

    await store.set(fetchMyProfileAtom)

    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toMatch(/\/api\/users\/me$/)
    expect(new Headers(init?.headers).get('X-Telegram-Init-Data')).toBe(
      'signed-owner-222'
    )
    expect(String(init?.body)).not.toContain('222')
    expect(store.get(myProfileAtom)?.telegram_id).toBe('222')
  })

  it('refuses to confirm a profile without signed Mini App initData', async () => {
    const store = createStore()
    store.set(userAtom, {
      id: 333,
      first_name: 'Widget user',
      auth_date: 1,
      hash: 'widget-signature',
      is_admin: false,
    })
    const fetchMock = vi.spyOn(globalThis, 'fetch')

    await store.set(fetchMyProfileAtom)

    expect(fetchMock).not.toHaveBeenCalled()
    expect(store.get(myProfileAtom)).toBeNull()
  })
})
