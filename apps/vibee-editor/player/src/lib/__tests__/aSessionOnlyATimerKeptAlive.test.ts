/**
 * A SESSION KEPT ALIVE ONLY BY A TIMER IS A SESSION THAT DIES.
 *
 * Measured on production 2026-09-21. @SamHold (504608015) signed in on the web
 * three times inside forty minutes -- 16:38, 17:17, 17:20 UTC -- and between
 * those sign-ins the render log refused his calls with one reason:
 * "session rejected: expired". Not unknown, not revoked. He was holding a
 * ten-minute access token that nothing ever exchanged.
 *
 * Rotation had exactly one trigger: the `setTimeout` armed by
 * `storeAppSession` and re-armed by `resumeAppSessionRefresh` -- whose single
 * call site was inside <TelegramLoginButton>, a component not mounted on most
 * screens. A reload elsewhere left no timer; a sleeping laptop was enough to
 * miss the one that existed; and a missed tick was permanent, because nothing
 * refreshed on demand.
 *
 * These tests pin the two clocks that replaced it: a request that asks for a
 * live credential before knocking, and a 401 that rotates and knocks again.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  clearAppSession,
  ensureFreshSession,
  getAppAccessToken,
  renewAppSession,
  startAppSessionHealing,
  storeAppSession,
} from '../appSession'
import { apiFetch } from '../apiFetch'
import { API_BASE } from '../../config'

/** A session already past its expiry, exactly as a slept-through tick leaves it. */
function storeSpentSession(): void {
  storeAppSession({
    access_token: 'spent-access',
    refresh_token: 'live-refresh',
    expires_in: 600,
  })
  // Wind the stored expiry into the past without touching the refresh token.
  sessionStorage.setItem(
    'trinity.app.session.expires-at',
    String(Date.now() - 1000)
  )
}

const rotated = {
  ok: true,
  status: 200,
  json: async () => ({
    access_token: 'fresh-access',
    refresh_token: 'next-refresh',
    expires_in: 600,
  }),
}

describe('an access token whose refresh tick was missed', () => {
  afterEach(() => {
    clearAppSession()
    vi.unstubAllGlobals()
  })

  it('is rotated before the request, not after the person gives up', async () => {
    storeSpentSession()
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(rotated)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ ok: true, active: true }),
      })
    vi.stubGlobal('fetch', fetchMock)

    const body = await apiFetch(`${API_BASE}/api/club/status`)

    expect(body).toEqual({ ok: true, active: true })
    // First call is the rotation; the real request carries the NEW token.
    expect(fetchMock.mock.calls[0][0]).toContain('/api/auth/refresh')
    const headers = fetchMock.mock.calls[1][1].headers as Headers
    expect(headers.get('Authorization')).toBe('Bearer fresh-access')
  })

  it('is rotated and the call retried when the server says 401', async () => {
    // The local clock still believes the token is good -- a revoked family, a
    // drifted clock. Only the server knows, and it answers 401.
    storeAppSession({
      access_token: 'stale-access',
      refresh_token: 'live-refresh',
      expires_in: 600,
    })
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => JSON.stringify({ error: 'session rejected' }),
      })
      .mockResolvedValueOnce(rotated)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ ok: true }),
      })
    vi.stubGlobal('fetch', fetchMock)

    await expect(apiFetch(`${API_BASE}/api/club/status`)).resolves.toEqual({
      ok: true,
    })
    expect(getAppAccessToken()).toBe('fresh-access')
  })

  it('gives the 401 to the caller when there is nothing left to rotate', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => JSON.stringify({ detail: 'no session' }),
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(apiFetch(`${API_BASE}/api/club/status`)).rejects.toThrow(
      'no session'
    )
    // No session, no refresh token: one attempt, no retry loop.
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('costs nothing while the token is still live', async () => {
    storeAppSession({
      access_token: 'live-access',
      refresh_token: 'live-refresh',
      expires_in: 600,
    })
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect(ensureFreshSession()).resolves.toBe(true)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('says no, rather than throwing, where there is no session at all', async () => {
    // The Mini App authenticates by signature and has no session to renew.
    await expect(ensureFreshSession()).resolves.toBe(false)
    await expect(renewAppSession()).resolves.toBe(false)
  })

  it('does not leave a dead session behind when the family is finished', async () => {
    storeSpentSession()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ error: 'auth_refresh_unknown' }),
      })
    )

    await expect(ensureFreshSession()).resolves.toBe(false)
    expect(getAppAccessToken()).toBe('')
  })
})

describe('the clocks the application arms at boot', () => {
  afterEach(() => {
    clearAppSession()
    vi.unstubAllGlobals()
  })

  it('heals on the moments a missed tick becomes visible', async () => {
    const listeners = new Map<string, () => void>()
    const win = {
      addEventListener: (type: string, fn: () => void) =>
        void listeners.set(type, fn),
      removeEventListener: (type: string) => void listeners.delete(type),
    }

    const stop = startAppSessionHealing(win)
    // A tab coming back from the background or a sleeping machine, a window
    // focused again, a network that returned. And `storage`: not a heal, but
    // the cookie session moving in another tab (appSession followTheJar).
    expect([...listeners.keys()].sort()).toEqual([
      'focus',
      'online',
      'storage',
      'visibilitychange',
    ])

    storeSpentSession()
    const fetchMock = vi.fn().mockResolvedValue(rotated)
    vi.stubGlobal('fetch', fetchMock)
    listeners.get('visibilitychange')!()
    await vi.waitFor(() => expect(getAppAccessToken()).toBe('fresh-access'))

    stop()
    expect(listeners.size).toBe(0)
  })
})
