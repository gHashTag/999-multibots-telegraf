/**
 * WHICH PIECES OF THE DIGITAL CLONE ARE ALREADY IN PLACE.
 *
 * The welcome road decides where to start from server facts, and the voice had
 * no fact to read: the bot's voice wizard has been making ElevenLabs voices and
 * writing them to the user row all along, and nothing outside the bot could ask
 * whether one existed. So two finished pieces of the clone sat unreachable
 * while it was described as unbuilt.
 *
 * ABSENT IS NOT FALSE, and that is the whole care in this file. `undefined`
 * means the question has not been answered -- the request is in flight, or the
 * server said it could not tell. Only a definite `false` may open a step.
 * Asking somebody to record a voice they already have is the one outcome worse
 * than not asking.
 */
import { atom } from 'jotai'
import { API_BASE } from '@/config'
import { authHeaders } from '@/lib/apiFetch'

export interface CloneReady {
  /** A voice of their own exists at the provider. */
  voice?: boolean
  /** A photo exists to render a face from. */
  photo?: boolean
}

export const cloneReadyAtom = atom<CloneReady>({})
export const cloneErrorAtom = atom<string | null>(null)

export const loadCloneStatusAtom = atom(null, async (_get, set) => {
  set(cloneErrorAtom, null)
  try {
    const r = await fetch(`${API_BASE}/api/clone/status`, {
      headers: authHeaders(),
    })
    const d = (await r.json()) as {
      ok?: boolean
      error?: string
      voice?: boolean
      photo?: boolean
    }
    if (!r.ok || d.ok === false) {
      throw new Error(String(d.error ?? `HTTP ${r.status}`))
    }
    set(cloneReadyAtom, { voice: !!d.voice, photo: !!d.photo })
  } catch (e) {
    /*
     * The previous picture is kept on purpose. Overwriting it with `{}` on a
     * failed call would turn a known "the voice is there" into "we do not
     * know", and the road would start asking again on every network hiccup.
     */
    set(cloneErrorAtom, e instanceof Error ? e.message : String(e))
  }
})
