// ===============================
// Profile Atoms - User Profile State
// Follow system, profile management
// ===============================

import { atom } from 'jotai'
import { atomWithStorage } from 'jotai/utils'
import { STORAGE_KEYS } from '@vibee/atoms'
import { userAtom } from './user'
import type { FeedTemplate } from './feed'
import { API_BASE } from '../config'
import { apiFetch, type ApiError } from '../lib/apiFetch'
import { getInitData } from '../lib/telegram'

// ===============================
// Types
// ===============================

export interface SocialLink {
  platform:
    | 'telegram'
    | 'instagram'
    | 'twitter'
    | 'youtube'
    | 'tiktok'
    | 'website'
  url: string
  label?: string
}

export interface UserProfile {
  id: string
  telegram_id: string
  username: string
  display_name: string | null
  bio: string | null
  avatar_url: string | null
  cover_url: string | null
  social_links: SocialLink[]
  is_public: boolean
  is_verified: boolean
  followers_count: number
  following_count: number
  templates_count: number
  total_views: number
  total_likes: number
  created_at: string
  is_following: boolean
  is_own_profile: boolean
}

export interface FollowUser {
  id: string
  username: string
  display_name: string | null
  avatar_url: string | null
  is_following: boolean
}

// ===============================
// State Atoms
// ===============================

// Currently viewed profile (on profile page)
export const viewedProfileAtom = atom<UserProfile | null>(null)

// Profile loading state
export const profileLoadingAtom = atom<boolean>(false)

// Profile error state
export const profileErrorAtom = atom<string | null>(null)

// User's own profile (cached in localStorage)
export const myProfileAtom = atomWithStorage<UserProfile | null>(
  STORAGE_KEYS.myProfile,
  null
)

// Followers list for current profile
export const followersAtom = atom<FollowUser[]>([])
export const followersLoadingAtom = atom<boolean>(false)

// Following list for current profile
export const followingAtom = atom<FollowUser[]>([])
export const followingLoadingAtom = atom<boolean>(false)

// Following feed (templates from followed users)
export const followingFeedAtom = atom<FeedTemplate[]>([])
export const followingFeedLoadingAtom = atom<boolean>(false)

// ===============================
// Helper function to parse social_links
// ===============================

function parseSocialLinks(socialLinksStr: string): SocialLink[] {
  try {
    const parsed = JSON.parse(socialLinksStr)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function transformProfile(raw: Record<string, unknown>): UserProfile {
  return {
    id: String(raw.id),
    telegram_id: String(raw.telegram_id),
    username: raw.username as string,
    display_name: raw.display_name as string | null,
    bio: raw.bio as string | null,
    avatar_url: raw.avatar_url as string | null,
    cover_url: (raw.cover_url as string | null) || null,
    social_links:
      typeof raw.social_links === 'string'
        ? parseSocialLinks(raw.social_links)
        : (raw.social_links as SocialLink[]) || [],
    is_public: raw.is_public as boolean,
    is_verified: (raw.is_verified as boolean) || false,
    followers_count: raw.followers_count as number,
    following_count: raw.following_count as number,
    templates_count: raw.templates_count as number,
    total_views: raw.total_views as number,
    total_likes: raw.total_likes as number,
    created_at: raw.created_at as string,
    is_following: raw.is_following as boolean,
    is_own_profile: raw.is_own_profile as boolean,
  }
}

// ===============================
// Action Atoms
// ===============================

// Load profile by username
export const loadProfileAtom = atom(
  null,
  async (_get, set, username: string) => {
    set(profileLoadingAtom, true)
    set(profileErrorAtom, null)

    try {
      const data = await apiFetch<Record<string, unknown>>(
        `${API_BASE}/api/users/${encodeURIComponent(username)}`
      )
      const profile = transformProfile(data)
      set(viewedProfileAtom, profile)

      if (profile.is_own_profile) {
        set(myProfileAtom, profile)
      }
      return profile
    } catch (error) {
      if ((error as ApiError)?.status === 404) {
        set(profileErrorAtom, 'User not found')
        set(viewedProfileAtom, null)
        return null
      }
      console.error('Failed to load profile:', error)
      set(profileErrorAtom, (error as Error)?.message || 'Network error')
      return null
    } finally {
      set(profileLoadingAtom, false)
    }
  }
)

// Get or create the active profile from server-verified Telegram initData.
export const fetchMyProfileAtom = atom(null, async (get, set) => {
  const user = get(userAtom)
  if (!user) {
    set(myProfileAtom, null)
    return null
  }

  // Login Widget data is not Mini App initData. Never present it as a
  // server-confirmed profile until a signed server-side exchange exists.
  if (!getInitData()) {
    set(myProfileAtom, null)
    set(profileErrorAtom, 'Подтвердите профиль внутри Mini App @t27ai_bot.')
    return null
  }

  try {
    const data = await apiFetch<{ profile: Record<string, unknown> }>(
      `${API_BASE}/api/users/me`,
      { method: 'POST', body: '{}' }
    )
    const profile = transformProfile(data.profile)
    set(myProfileAtom, profile)
    set(profileErrorAtom, null)
    return profile
  } catch (error) {
    console.error('[fetchMyProfile] Failed:', error)
    set(myProfileAtom, null)
    set(
      profileErrorAtom,
      (error as Error)?.message || 'Profile verification failed'
    )
    return null
  }
})

const PROFILE_MUTATION_UNAVAILABLE = 'SAFE_BETA_PROFILE_MUTATION_UNAVAILABLE'

// Profile mutation endpoints are not part of the signed SAFE BETA server
// contract. Keep the existing atoms for callers, but fail closed before any
// optimistic state change or network dispatch.
export const updateProfileAtom = atom(
  null,
  async (
    _get,
    set,
    _updates: Partial<
      Pick<UserProfile, 'display_name' | 'bio' | 'avatar_url' | 'is_public'>
    > & { social_links?: string }
  ) => {
    set(profileErrorAtom, PROFILE_MUTATION_UNAVAILABLE)
    return null
  }
)

export const followUserAtom = atom(
  null,
  async (_get, set, _username: string) => {
    set(profileErrorAtom, PROFILE_MUTATION_UNAVAILABLE)
    return false
  }
)

export const unfollowUserAtom = atom(
  null,
  async (_get, set, _username: string) => {
    set(profileErrorAtom, PROFILE_MUTATION_UNAVAILABLE)
    return false
  }
)

// These list endpoints do not exist in the signed SAFE BETA server registry.
// Returning an empty list is preferable to accidentally hitting the generic
// /api/users/:username handler with a misleading suffix.
export const loadFollowersAtom = atom(
  null,
  async (_get, set, _username: string, _page = 0) => {
    set(followersLoadingAtom, false)
    set(followersAtom, [])
    return []
  }
)

export const loadFollowingAtom = atom(
  null,
  async (_get, set, _username: string, _page = 0) => {
    set(followingLoadingAtom, false)
    set(followingAtom, [])
    return []
  }
)

export const loadFollowingFeedAtom = atom(
  null,
  async (_get, set, _page = 0) => {
    set(followingFeedLoadingAtom, false)
    set(followingFeedAtom, [])
    return []
  }
)

// Clear profile on logout
export const clearProfileAtom = atom(null, (_get, set) => {
  set(myProfileAtom, null)
  set(viewedProfileAtom, null)
  set(followersAtom, [])
  set(followingAtom, [])
  set(followingFeedAtom, [])
})
