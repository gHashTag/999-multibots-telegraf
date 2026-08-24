import { atom } from 'jotai'

export interface AvatarPhoto {
  id: number
  url: string
  createdAt: string
}

export const avatarPhotosAtom = atom<AvatarPhoto[]>([])
export const avatarPhotosLoadingAtom = atom(false)
export const avatarPhotosErrorAtom = atom<string | null>(null)

const AVATAR_PROFILE_UNAVAILABLE =
  'Avatar profile mutations are unavailable in SAFE BETA.'

/** The legacy read route accepted a client-owned id in its path. */
export const loadAvatarPhotosAtom = atom(null, async (_get, set) => {
  set(avatarPhotosLoadingAtom, false)
  set(avatarPhotosAtom, [])
  set(avatarPhotosErrorAtom, AVATAR_PROFILE_UNAVAILABLE)
})

export const saveAvatarPhotoAtom = atom(
  null,
  async (_get, set, _url: string): Promise<boolean> => {
    set(avatarPhotosErrorAtom, AVATAR_PROFILE_UNAVAILABLE)
    return false
  }
)

export const deleteAvatarPhotoAtom = atom(
  null,
  async (_get, set, _id: number): Promise<boolean> => {
    set(avatarPhotosErrorAtom, AVATAR_PROFILE_UNAVAILABLE)
    return false
  }
)
