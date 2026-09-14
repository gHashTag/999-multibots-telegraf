import { describe, expect, it } from 'vitest'
// RouteMemory's dependencies are loaded here, before storage is blocked, so
// the dynamic import below evaluates RouteMemory itself under the block.
import 'react-router-dom'
import '@vibee/atoms'
import '@/atoms'
import '@/lib/telegram'
import { createStore } from 'jotai'
import { getAppAccessToken, storeAppSession } from '@/lib/appSession'
import { userAtom } from '@/atoms/user'

/**
 * STORAGE MAY THROW ON ACCESS.
 *
 * Not on t27.ai in Chrome: the game's TRI frame there is same-site with
 * app.t27.ai and reads the real app's storage (measured). A browser that
 * blocks site data, or a frame under an unrelated site with third-party
 * storage blocked, throws SecurityError from the `localStorage` /
 * `sessionStorage` getter itself, not from getItem. A module-scope read then
 * kills the bundle before anything mounts, and a throwing read inside an atom
 * takes the page down to the ErrorBoundary. The headless check of a build
 * with storage blocked renders the feed page now; before the persisted user
 * read through lib/framedSession.ts it showed the ErrorBoundary.
 */

function block(name: 'localStorage' | 'sessionStorage'): () => void {
  const own = Object.getOwnPropertyDescriptor(window, name)
  Object.defineProperty(window, name, {
    configurable: true,
    get() {
      throw new DOMException('The operation is insecure.', 'SecurityError')
    },
  })
  return () => {
    if (own) Object.defineProperty(window, name, own)
    else delete (window as unknown as Record<string, unknown>)[name]
  }
}

describe('storage that throws on access', () => {
  it('the block really throws (control for the harness)', () => {
    const restore = block('sessionStorage')
    try {
      expect(() => window.sessionStorage).toThrow(/insecure/)
    } finally {
      restore()
    }
  })

  it('the app session reads as signed out instead of throwing', () => {
    const restore = block('sessionStorage')
    try {
      expect(getAppAccessToken()).toBe('')
      expect(() =>
        storeAppSession({
          access_token: 'a',
          refresh_token: 'r',
          expires_in: 60,
        })
      ).not.toThrow()
    } finally {
      restore()
    }
  })

  it('the persisted user reads as nobody instead of throwing', () => {
    const restore = block('sessionStorage')
    try {
      const store = createStore()
      expect(() => store.sub(userAtom, () => {})).not.toThrow()
      expect(store.get(userAtom)).toBeNull()
    } finally {
      restore()
    }
  })

  it('RouteMemory loads without its remembered route', async () => {
    const restore = block('localStorage')
    try {
      const mod = await import('@/components/Navigation/RouteMemory')
      expect(typeof mod.LaunchRedirect).toBe('function')
    } finally {
      restore()
    }
  })
})
