// ===============================
// Profile Atoms - User Profile State
// Follow system, profile management
// ===============================

import { atom } from 'jotai'
import { atomWithStorage, createJSONStorage } from 'jotai/utils'
import { STORAGE_KEYS } from '@vibee/atoms'
import { userAtom } from './user'
import type { FeedTemplate } from './feed'
import { API_BASE } from '../config'
import { sessionStore } from '../lib/framedSession'
// authHeaders вызывался БЕЗ импорта: свободный идентификатор в ES-модуле —
// это ReferenceError при первом же исполнении строки. Синк профиля из
// Telegram падал всегда, а вызывающий гасил это через .catch(() => {}).
import { apiFetch, authHeaders } from '../lib/apiFetch'

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
  plan_count?: number
  files_count?: number
  skills_count?: number
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
// The tab's sessionStorage, or memory inside a frame by another site.
export const myProfileAtom = atomWithStorage<UserProfile | null>(
  STORAGE_KEYS.myProfile,
  null,
  createJSONStorage(() => sessionStore())
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
    plan_count: typeof raw.plan_count === 'number' ? raw.plan_count : undefined,
    files_count:
      typeof raw.files_count === 'number' ? raw.files_count : undefined,
    skills_count:
      typeof raw.skills_count === 'number' ? raw.skills_count : undefined,
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
  async (get, set, username: string) => {
    set(profileLoadingAtom, true)
    set(profileErrorAtom, null)

    try {
      const response = await fetch(
        `${API_BASE}/api/users/${encodeURIComponent(username)}`,
        { headers: authHeaders() }
      )

      if (response.ok) {
        const data = await response.json()
        const profile = transformProfile(data)
        set(viewedProfileAtom, profile)

        // If this is user's own profile, also update myProfileAtom for editing
        if (profile.is_own_profile) {
          set(myProfileAtom, profile)
        }
        return profile
      } else if (response.status === 404) {
        set(profileErrorAtom, 'User not found')
        set(viewedProfileAtom, null)
        return null
      } else {
        const error = await response.json()
        set(profileErrorAtom, error.error || 'Failed to load profile')
        return null
      }
    } catch (error) {
      console.error('Failed to load profile:', error)
      set(profileErrorAtom, 'Network error')
      return null
    } finally {
      set(profileLoadingAtom, false)
    }
  }
)

// User data that can be passed directly to avoid async state issues
interface UserData {
  id: number
  username?: string
  first_name?: string
  photo_url?: string
}

// Get or create user profile on login
// Can accept user data directly to avoid async state issues
export const fetchMyProfileAtom = atom(
  null,
  async (get, set, userData?: UserData) => {
    // Use passed data or fall back to atom
    const user = userData || get(userAtom)
    if (!user) {
      set(myProfileAtom, null)
      return null
    }

    try {
      // Синк с Telegram: сервер достаёт личность из подписи initData и
      // upsert'ит users+profiles — имя, username и аватар попадают в
      // профиль по-настоящему (раньше они жили только в памяти клиента).
      const response = await fetch(`${API_BASE}/api/users/sync-from-telegram`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          id: user.id,
          first_name: user.first_name,
          username: user.username,
          photo_url: user.photo_url,
        }),
      })

      if (response.ok) {
        const data = await response.json()
        const profile: UserProfile = {
          // Три поля отсутствовали. Раньше литерал был помечен типом
          // `MyProfile`, которого в проекте нет вовсе, — TypeScript не мог
          // проверить форму, и в myProfileAtom ложился объект без `id`,
          // `is_following` и `is_own_profile`. Читатели атома видят
          // UserProfile и вправе на них рассчитывать.
          id: String(data.id ?? data.telegram_id ?? user.id),
          is_following: false,
          is_own_profile: true,
          telegram_id: String(data.telegram_id ?? user.id),
          username: data.username ?? user.username ?? '',
          display_name: data.display_name ?? user.first_name ?? '',
          bio: '',
          avatar_url: data.avatar_url ?? null,
          cover_url: null,
          social_links: [],
          is_public: true,
          is_verified: false,
          created_at: new Date().toISOString(),
          templates_count: 0,
          followers_count: 0,
          following_count: 0,
          total_views: 0,
          total_likes: 0,
        }
        set(myProfileAtom, profile)
        return profile
      } else {
        console.error('[fetchMyProfile] sync error:', response.status)
      }
      return null
    } catch (error) {
      console.error('[fetchMyProfile] Failed:', error)
      return null
    }
  }
)

// Update profile
export const updateProfileAtom = atom(
  null,
  async (
    get,
    set,
    updates: Partial<
      Pick<UserProfile, 'display_name' | 'bio' | 'avatar_url' | 'is_public'>
    > & { social_links?: string }
  ) => {
    const user = get(userAtom)
    const myProfile = get(myProfileAtom)

    if (!user || !myProfile) {
      console.error('[updateProfile] No user or profile:', { user, myProfile })
      return null
    }

    try {
      const data = await apiFetch<{ profile?: Record<string, unknown> }>(
        `${API_BASE}/api/users/${encodeURIComponent(myProfile.username)}`,
        {
          method: 'PUT',
          body: JSON.stringify(updates),
        }
      )

      if (data.profile) {
        const updated = transformProfile(data.profile)
        // Profile mutation responses may omit or temporarily fail to aggregate
        // counters. Editing a bio must never erase the last verified stats.
        const profile: UserProfile = {
          ...updated,
          followers_count: updated.followers_count ?? myProfile.followers_count,
          following_count: updated.following_count ?? myProfile.following_count,
          templates_count: updated.templates_count ?? myProfile.templates_count,
          total_views: updated.total_views ?? myProfile.total_views,
          total_likes: updated.total_likes ?? myProfile.total_likes,
        }
        set(myProfileAtom, profile)

        // Update viewed profile if it's own profile
        const viewed = get(viewedProfileAtom)
        if (viewed?.is_own_profile) {
          set(viewedProfileAtom, profile)
        }
        return profile
      }
      return null
    } catch (error) {
      console.error('[updateProfile] Failed:', error)
      return null
    }
  }
)

// Follow user
export const followUserAtom = atom(null, async (get, set, username: string) => {
  const user = get(userAtom)
  console.log('[followUserAtom] user:', user?.id, 'target:', username)
  if (!user) return false

  // Optimistic update
  const viewed = get(viewedProfileAtom)
  if (viewed && viewed.username.toLowerCase() === username.toLowerCase()) {
    set(viewedProfileAtom, {
      ...viewed,
      is_following: true,
      followers_count: viewed.followers_count + 1,
    })
  }

  try {
    const url = `${API_BASE}/api/users/${encodeURIComponent(username)}/follow`
    console.log('[followUserAtom] POST', url, 'telegram_id:', user.id)
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ telegram_id: user.id }),
    })

    const data = await response.json().catch(() => null)
    console.log('[followUserAtom] Response:', response.status, data)

    if (response.ok) {
      // Update my profile following count
      const myProfile = get(myProfileAtom)
      if (myProfile) {
        set(myProfileAtom, {
          ...myProfile,
          following_count: myProfile.following_count + 1,
        })
      }
      return true
    } else {
      // Revert optimistic update
      if (viewed && viewed.username.toLowerCase() === username.toLowerCase()) {
        set(viewedProfileAtom, {
          ...viewed,
          is_following: false,
          followers_count: viewed.followers_count,
        })
      }
      return false
    }
  } catch (error) {
    console.error('Failed to follow user:', error)
    // Revert optimistic update
    if (viewed && viewed.username.toLowerCase() === username.toLowerCase()) {
      set(viewedProfileAtom, viewed)
    }
    return false
  }
})

// Unfollow user
export const unfollowUserAtom = atom(
  null,
  async (get, set, username: string) => {
    const user = get(userAtom)
    if (!user) return false

    // Optimistic update
    const viewed = get(viewedProfileAtom)
    if (viewed && viewed.username.toLowerCase() === username.toLowerCase()) {
      set(viewedProfileAtom, {
        ...viewed,
        is_following: false,
        followers_count: Math.max(0, viewed.followers_count - 1),
      })
    }

    try {
      const response = await fetch(
        `${API_BASE}/api/users/${encodeURIComponent(username)}/follow`,
        {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ telegram_id: user.id }),
        }
      )

      if (response.ok) {
        // Update my profile following count
        const myProfile = get(myProfileAtom)
        if (myProfile) {
          set(myProfileAtom, {
            ...myProfile,
            following_count: Math.max(0, myProfile.following_count - 1),
          })
        }
        return true
      } else {
        // Revert optimistic update
        if (
          viewed &&
          viewed.username.toLowerCase() === username.toLowerCase()
        ) {
          set(viewedProfileAtom, viewed)
        }
        return false
      }
    } catch (error) {
      console.error('Failed to unfollow user:', error)
      return false
    }
  }
)

// Load followers
export const loadFollowersAtom = atom(
  null,
  async (get, set, username: string, page = 0) => {
    set(followersLoadingAtom, true)

    const currentUser = get(userAtom)
    const userIdParam = currentUser ? `&user_id=${currentUser.id}` : ''

    try {
      const response = await fetch(
        `${API_BASE}/api/users/${encodeURIComponent(username)}/followers?page=${page}&limit=20${userIdParam}`
      )

      if (response.ok) {
        const data = await response.json()
        set(followersAtom, data.users || [])
        return data.users || []
      }
      return []
    } catch (error) {
      console.error('Failed to load followers:', error)
      return []
    } finally {
      set(followersLoadingAtom, false)
    }
  }
)

// Load following
export const loadFollowingAtom = atom(
  null,
  async (get, set, username: string, page = 0) => {
    set(followingLoadingAtom, true)

    const currentUser = get(userAtom)
    const userIdParam = currentUser ? `&user_id=${currentUser.id}` : ''

    try {
      const response = await fetch(
        `${API_BASE}/api/users/${encodeURIComponent(username)}/following?page=${page}&limit=20${userIdParam}`
      )

      if (response.ok) {
        const data = await response.json()
        set(followingAtom, data.users || [])
        return data.users || []
      }
      return []
    } catch (error) {
      console.error('Failed to load following:', error)
      return []
    } finally {
      set(followingLoadingAtom, false)
    }
  }
)

// Load following feed
export const loadFollowingFeedAtom = atom(null, async (get, set, page = 0) => {
  const user = get(userAtom)
  if (!user) {
    set(followingFeedAtom, [])
    return []
  }

  set(followingFeedLoadingAtom, true)

  try {
    const response = await fetch(
      `${API_BASE}/api/feed/following?telegram_id=${user.id}&page=${page}&limit=20`
    )

    if (response.ok) {
      const data = await response.json()
      set(followingFeedAtom, data.templates || [])
      return data.templates || []
    }
    return []
  } catch (error) {
    console.error('Failed to load following feed:', error)
    return []
  } finally {
    set(followingFeedLoadingAtom, false)
  }
})

// Clear profile on logout
export const clearProfileAtom = atom(null, (_get, set) => {
  set(myProfileAtom, null)
  set(viewedProfileAtom, null)
  set(followersAtom, [])
  set(followingAtom, [])
  set(followingFeedAtom, [])
})
