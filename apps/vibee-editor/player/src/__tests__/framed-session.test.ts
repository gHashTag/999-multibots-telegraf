import { afterEach, describe, expect, it } from 'vitest'
import { createStore } from 'jotai'
import { STORAGE_KEYS } from '@vibee/atoms'
import { sessionTrustedIn, type FramedWindow } from '@/lib/framedSession'
import {
  clearAppSession,
  getAppAccessToken,
  storeAppSession,
} from '@/lib/appSession'
import { authHeaders } from '@/lib/apiFetch'
import { userAtom } from '@/atoms/user'
import { myProfileAtom } from '@/atoms/profile'

/**
 * A PAGE THAT FRAMES THE APP DOES NOT GET THE TAB'S SIGN-IN.
 *
 * nginx lets https://t27.ai frame the app, and t27.ai is the same site as
 * app.t27.ai, so sessionStorage written by a top-level sign-in in a tab is
 * visible to an app frame the same tab later shows on t27.ai. Only the app
 * itself and Telegram may frame a signed-in app. Top level and Telegram Web
 * are the controls: there the session must still be read.
 */

const APP = 'https://app.t27.ai'

function fake(
  ancestors: string[] | null,
  { framed = true, origin = APP } = {}
): FramedWindow {
  const top = {}
  return {
    self: framed ? {} : top,
    top,
    location: {
      origin,
      ...(ancestors ? { ancestorOrigins: ancestors } : {}),
    },
  }
}

describe('sessionTrustedIn: who may see the browser session', () => {
  it('top level: trusted', () => {
    expect(sessionTrustedIn(fake(null, { framed: false }))).toBe(true)
  })
  it('framed by the app itself (the game at app.t27.ai/game/): trusted', () => {
    expect(sessionTrustedIn(fake([APP]))).toBe(true)
    expect(sessionTrustedIn(fake([APP, APP]))).toBe(true)
  })
  it('framed by Telegram Web: trusted', () => {
    expect(sessionTrustedIn(fake(['https://web.telegram.org']))).toBe(true)
    expect(sessionTrustedIn(fake(['https://webk.telegram.org']))).toBe(true)
  })
  it('framed by t27.ai, with or without the app in between: not trusted', () => {
    expect(sessionTrustedIn(fake(['https://t27.ai']))).toBe(false)
    expect(sessionTrustedIn(fake([APP, 'https://t27.ai']))).toBe(false)
    expect(sessionTrustedIn(fake(['https://t27.ai', APP]))).toBe(false)
  })
  it('look-alikes of Telegram: not trusted', () => {
    for (const origin of [
      'https://telegram.org',
      'http://web.telegram.org',
      'https://web.telegram.org.evil.example',
      'https://evil-telegram.org',
      'null',
    ]) {
      expect(sessionTrustedIn(fake([origin])), origin).toBe(false)
    }
  })
  it('framed with no ancestorOrigins (Firefox) or an empty list: not trusted', () => {
    expect(sessionTrustedIn(fake(null))).toBe(false)
    expect(sessionTrustedIn(fake([]))).toBe(false)
  })
})

/**
 * The real modules on jsdom's window, made to look framed. jsdom's own origin
 * stands in for app.t27.ai.
 */
const own = {
  self: Object.getOwnPropertyDescriptor(window, 'self'),
  ancestors: Object.getOwnPropertyDescriptor(
    window.location,
    'ancestorOrigins'
  ),
}

function frameUnder(ancestors: string[] | null): void {
  Object.defineProperty(window, 'self', {
    configurable: true,
    get: () => ({}),
  })
  Object.defineProperty(window.location, 'ancestorOrigins', {
    configurable: true,
    get: () => (ancestors === null ? undefined : ancestors),
  })
}

function unframe(): void {
  if (own.self) Object.defineProperty(window, 'self', own.self)
  else delete (window as unknown as Record<string, unknown>).self
  if (own.ancestors) {
    Object.defineProperty(window.location, 'ancestorOrigins', own.ancestors)
  } else {
    delete (window.location as unknown as Record<string, unknown>)
      .ancestorOrigins
  }
}

const OWNER = {
  id: 7,
  first_name: 'Owner',
  username: 'owner',
  auth_date: 1,
  hash: '',
  is_admin: true,
}

function signInTheTab(): void {
  window.sessionStorage.setItem('trinity.app.session.access', 'owner-access')
  window.sessionStorage.setItem('trinity.app.session.refresh', 'owner-refresh')
  window.sessionStorage.setItem(STORAGE_KEYS.user, JSON.stringify(OWNER))
  window.sessionStorage.setItem(
    STORAGE_KEYS.myProfile,
    JSON.stringify({ username: 'owner' })
  )
}

/** atomWithStorage reads storage when the atom is mounted. */
function mounted<T>(
  atom: Parameters<ReturnType<typeof createStore>['get']>[0]
) {
  const store = createStore()
  const unsub = store.sub(atom, () => {})
  return { store, value: store.get(atom) as T, unsub }
}

describe('the real session modules inside a frame', () => {
  afterEach(() => {
    unframe()
    clearAppSession()
    window.sessionStorage.clear()
  })

  it('the harness really frames the window (control)', () => {
    frameUnder(['https://t27.ai'])
    expect(window.self === window.top).toBe(false)
    expect(Array.from(window.location.ancestorOrigins!)).toEqual([
      'https://t27.ai',
    ])
  })

  it('top level: the Bearer session and the user are read (control)', () => {
    signInTheTab()
    expect(getAppAccessToken()).toBe('owner-access')
    expect(authHeaders().get('Authorization')).toBe('Bearer owner-access')
    const user = mounted<typeof OWNER | null>(userAtom)
    expect(user.value?.username).toBe('owner')
    user.unsub()
  })

  it('framed by Telegram Web: the session is read (control)', () => {
    signInTheTab()
    frameUnder(['https://web.telegram.org'])
    expect(getAppAccessToken()).toBe('owner-access')
    expect(mounted<typeof OWNER | null>(userAtom).value?.username).toBe('owner')
  })

  it('framed by t27.ai: a guest, no Bearer, no restored user or profile', () => {
    signInTheTab()
    frameUnder(['https://t27.ai'])
    expect(getAppAccessToken()).toBe('')
    expect(authHeaders().has('Authorization')).toBe(false)
    expect(mounted(userAtom).value).toBeNull()
    expect(mounted(myProfileAtom).value).toBeNull()
  })

  it('framed with no ancestorOrigins (Firefox): a guest', () => {
    signInTheTab()
    frameUnder(null)
    expect(getAppAccessToken()).toBe('')
    expect(mounted(userAtom).value).toBeNull()
  })

  it("framed by t27.ai: a logout or a sign-in inside the frame leaves the tab's session alone", () => {
    signInTheTab()
    frameUnder(['https://t27.ai'])
    const user = mounted(userAtom)
    user.store.set(userAtom, null)
    clearAppSession()
    storeAppSession({
      access_token: 'frame-access',
      refresh_token: 'frame-refresh',
      expires_in: 600,
    })
    expect(getAppAccessToken()).toBe('frame-access')
    user.unsub()
    clearAppSession()
    expect(window.sessionStorage.getItem('trinity.app.session.access')).toBe(
      'owner-access'
    )
    expect(
      JSON.parse(window.sessionStorage.getItem(STORAGE_KEYS.user) || 'null')
        ?.username
    ).toBe('owner')
  })
})
