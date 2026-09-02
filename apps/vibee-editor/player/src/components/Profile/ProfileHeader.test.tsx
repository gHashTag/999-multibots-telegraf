import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ isOwn: true }))

const profile = {
  id: 'profile-1',
  telegram_id: '27',
  username: 't27_dev',
  display_name: 'Dmitrii T27 DEV',
  bio: null,
  avatar_url: null,
  cover_url: null,
  social_links: [],
  is_public: true,
  is_verified: false,
  followers_count: 0,
  following_count: 0,
  templates_count: 40,
  total_views: 81,
  total_likes: 0,
  created_at: '2026-09-01T00:00:00Z',
  is_following: false,
  // Reproduces the live race: server ownership is stale while the shared
  // client identity already knows this is the signed-in user's profile.
  is_own_profile: false,
}

vi.mock('jotai', async importOriginal => {
  const actual = await importOriginal<typeof import('jotai')>()
  return {
    ...actual,
    useAtomValue: (target: symbol) => {
      if (target.description === 'viewedProfileAtom') return profile
      if (target.description === 'myProfileAtom') return null
      if (target.description === 'userAtom')
        return { id: 27, first_name: 'Dmitrii' }
      return null
    },
    useSetAtom: () => vi.fn(),
    useAtom: () => [false, vi.fn()],
  }
})

vi.mock('@/atoms', () => ({
  viewedProfileAtom: Symbol('viewedProfileAtom'),
  myProfileAtom: Symbol('myProfileAtom'),
  userAtom: Symbol('userAtom'),
  followUserAtom: Symbol('followUserAtom'),
  unfollowUserAtom: Symbol('unfollowUserAtom'),
  showLoginModalAtom: Symbol('showLoginModalAtom'),
}))

vi.mock('@/hooks/useLanguage', () => ({
  useLanguage: () => ({ t: (key: string) => key.split('.').at(-1) ?? key }),
}))

vi.mock('./useIsOwnProfile', () => ({
  useIsOwnProfile: () => state.isOwn,
}))

vi.mock('@/config', () => ({ API_BASE: 'https://api.example.test' }))
vi.mock('@/lib/apiFetch', () => ({ authHeaders: () => new Headers() }))

import { ProfileHeader } from './ProfileHeader'

describe('ProfileHeader owner actions', () => {
  let host: HTMLDivElement
  let root: Root

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ json: async () => ({}) })
    )
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    host.remove()
    vi.unstubAllGlobals()
  })

  it('hides Follow when the shared identity says this is my profile', async () => {
    state.isOwn = true
    await act(async () => root.render(<ProfileHeader />))

    expect(host.querySelector('.follow-button')).toBeNull()
    expect(host.querySelector('.profile-header__edit-btn')).not.toBeNull()
  })

  it('keeps Follow on another user profile', async () => {
    state.isOwn = false
    await act(async () => root.render(<ProfileHeader />))

    expect(host.querySelector('.follow-button')).not.toBeNull()
    expect(host.querySelector('.profile-header__edit-btn')).toBeNull()
  })
})
