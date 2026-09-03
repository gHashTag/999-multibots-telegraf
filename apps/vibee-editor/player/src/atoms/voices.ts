// ===============================
// Voices Atom - ElevenLabs voice management
// ===============================

import { atom } from 'jotai'
import { atomWithStorage } from 'jotai/utils'
import { STORAGE_KEYS } from '@vibee/atoms'
import { API_BASE } from '../config'
import { reconcileVoiceSelection } from '../lib/voiceSelection'

export interface Voice {
  id: string
  name: string
  category: string
  labels?: Record<string, string>
  preview_url?: string
}

// Voices cached in localStorage (refreshed on fetch)
export const voicesAtom = atomWithStorage<Voice[]>(STORAGE_KEYS.voices, [])

// Loading state
export const voicesLoadingAtom = atom(false)

// Error state
export const voicesErrorAtom = atom<string | null>(null)

// Selected voice ID (persisted)
export const selectedVoiceAtom = atomWithStorage<string>(
  STORAGE_KEYS.selectedVoice,
  ''
)

// Fetch voices action atom
export const fetchVoicesAtom = atom(null, async (get, set) => {
  // Don't fetch if already loading
  if (get(voicesLoadingAtom)) return

  set(voicesLoadingAtom, true)
  set(voicesErrorAtom, null)
  // Persisted pre-live registries may contain removed/fake ids. Clear them
  // synchronously so a slow request cannot briefly re-enable generation.
  set(voicesAtom, [])
  set(selectedVoiceAtom, '')

  try {
    const response = await fetch(`${API_BASE}/api/voices`)
    const data = await response.json()

    if (data.success && data.voices && data.voices.length > 0) {
      set(voicesAtom, data.voices)

      const currentSelected = get(selectedVoiceAtom)
      set(
        selectedVoiceAtom,
        reconcileVoiceSelection(currentSelected, data.voices)
      )

      console.log(
        `[Voices] Loaded ${data.voices.length} voices from ElevenLabs`
      )
    } else {
      set(voicesAtom, [])
      set(selectedVoiceAtom, '')
      set(voicesErrorAtom, 'Voice provider unavailable')
    }
  } catch (err) {
    console.error('[Voices] Failed to load voices:', err)
    set(voicesAtom, [])
    set(selectedVoiceAtom, '')
    set(voicesErrorAtom, 'Voice provider unavailable')
  } finally {
    set(voicesLoadingAtom, false)
  }
})
