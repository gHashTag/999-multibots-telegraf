// ===============================
// Generated Results Atom - AI generation history
// ===============================

import { atom } from 'jotai'
import { atomWithStorage } from 'jotai/utils'
import {
  STORAGE_KEYS,
  MAX_RESULTS_PER_TAB,
  type CaptionItem,
} from '@vibee/atoms'

// Generated result interface
export interface GeneratedResult {
  id: string
  type: 'image' | 'video' | 'audio'
  url: string
  name: string
  timestamp: number
  timedCaptions?: CaptionItem[]
}

export type GenerateTab = 'image' | 'video' | 'audio' | 'lipsync'

// Generated results per tab (persisted to localStorage)
export const generatedResultsAtom = atomWithStorage<{
  image: GeneratedResult[]
  video: GeneratedResult[]
  audio: GeneratedResult[]
  lipsync: GeneratedResult[]
}>(STORAGE_KEYS.generatedResults, {
  image: [],
  video: [],
  audio: [],
  lipsync: [],
})

// MAX_RESULTS_PER_TAB imported from @vibee/atoms

// Add result action atom
export const addGeneratedResultAtom = atom(
  null,
  (
    get,
    set,
    { tab, result }: { tab: GenerateTab; result: GeneratedResult }
  ) => {
    const current = get(generatedResultsAtom)
    set(generatedResultsAtom, {
      ...current,
      [tab]: [result, ...current[tab].slice(0, MAX_RESULTS_PER_TAB - 1)],
    })
  }
)

// Remove result action atom
export const removeGeneratedResultAtom = atom(
  null,
  (get, set, { tab, resultId }: { tab: GenerateTab; resultId: string }) => {
    const current = get(generatedResultsAtom)
    set(generatedResultsAtom, {
      ...current,
      [tab]: current[tab].filter(r => r.id !== resultId),
    })
  }
)

// Clear all results for a tab
export const clearGeneratedResultsAtom = atom(
  null,
  (get, set, tab: GenerateTab) => {
    const current = get(generatedResultsAtom)
    set(generatedResultsAtom, {
      ...current,
      [tab]: [],
    })
  }
)
