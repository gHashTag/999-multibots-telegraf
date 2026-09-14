import { describe, expect, it } from 'vitest'
// RouteMemory's dependencies are loaded here, before storage is blocked, so
// the dynamic import below evaluates RouteMemory itself under the block.
import 'react-router-dom'
import '@vibee/atoms'
import '@/atoms'
import '@/lib/telegram'
import { getAppAccessToken, storeAppSession } from '@/lib/appSession'

/**
 * A THIRD-PARTY FRAME MAY HAVE NO STORAGE AT ALL.
 *
 * Inside the game's TRI frame the app is third-party to t27.ai. A browser that
 * blocks third-party storage (Chrome with third-party cookies blocked, Brave)
 * throws SecurityError from the `localStorage` / `sessionStorage` getter
 * itself, not from getItem. A module-scope read then kills the bundle before
 * anything mounts, and every TRI screen stays blank.
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
