import { atom } from 'jotai'

export const soulAtom = atom<string | null>(null)
export const soulLoadedAtom = atom(false)
export const soulSavingAtom = atom(false)
export const soulErrorAtom = atom<string | null>(null)

const SOUL_UNAVAILABLE =
  'SOUL editing is unavailable in the exact SAFE BETA tool registry.'

export const loadSoulAtom = atom(null, async (_get, set) => {
  set(soulAtom, null)
  set(soulLoadedAtom, true)
  set(soulErrorAtom, SOUL_UNAVAILABLE)
})

export const saveSoulAtom = atom(
  null,
  async (_get, set, _soul: string): Promise<boolean> => {
    set(soulSavingAtom, false)
    set(soulErrorAtom, SOUL_UNAVAILABLE)
    return false
  }
)
