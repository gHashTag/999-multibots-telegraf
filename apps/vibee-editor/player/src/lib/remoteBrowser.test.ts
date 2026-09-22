import { describe, it, expect, vi, beforeEach } from 'vitest'

const apiFetch = vi.fn()
vi.mock('@/lib/apiFetch', () => ({
  apiFetch: (...a: unknown[]) => apiFetch(...a),
}))
vi.mock('../config', () => ({
  API_BASE: 'https://render.example.com',
}))

const load = async () => await import('./remoteBrowser')

beforeEach(() => {
  apiFetch.mockReset()
})

/**
 * WHAT THE MINI APP IS ALLOWED TO KNOW, AND WHERE IT MAY SHOW IT.
 *
 * Two properties here are not cosmetic:
 *
 * - "unavailable" must arrive as a STATE. Railway runs the broker and cannot
 *   run pods, so 503 is the designed answer there; showing it as a failure
 *   sends people to support over a deployment fact.
 * - `canEmbed` must be FALSE across origins. The session cookie is
 *   SameSite=Lax, so a cross-site frame is refused after it loads, and
 *   Telegram on iOS blocks third-party cookies outright. A frame that says
 *   "not signed in" is worse than a button that works.
 */

describe('reading the session', () => {
  it('passes the state through', async () => {
    const { readBrowserSession } = await load()
    apiFetch.mockResolvedValue({
      ok: true,
      state: 'live',
      sessionId: 's1',
      viewUrl: '/live/s1?t=x',
    })
    expect(await readBrowserSession()).toEqual({
      state: 'live',
      sessionId: 's1',
      viewUrl: '/live/s1?t=x',
    })
  })

  it('says who drives, and only in the two words it knows', async () => {
    const { readBrowserSession } = await load()
    apiFetch.mockResolvedValue({
      ok: true,
      state: 'live',
      sessionId: 's1',
      viewUrl: '/live/s1?t=x',
      wheel: 'person',
    })
    expect((await readBrowserSession()).wheel).toBe('person')
    apiFetch.mockResolvedValue({
      ok: true,
      state: 'live',
      sessionId: 's1',
      viewUrl: '/live/s1?t=x',
      wheel: 'robot',
    })
    expect(await readBrowserSession()).not.toHaveProperty('wheel')
  })

  it('a 503 from a failed session renewal is not "not set up here"', async () => {
    // That answer latches the watcher off for the page's life; a renewal
    // that failed for a moment must not (third review, 2026-09-22).
    const { readBrowserSession } = await load()
    const err = Object.assign(new Error('the sign-in service did not answer'), {
      status: 503,
      code: 'session_renewal_unavailable',
    })
    apiFetch.mockRejectedValueOnce(err)
    await expect(readBrowserSession()).rejects.toBe(err)
  })

  it('treats 503 as "not set up here", not as a failure', async () => {
    const { readBrowserSession } = await load()
    const err = Object.assign(new Error('not configured'), { status: 503 })
    apiFetch.mockRejectedValue(err)
    expect(await readBrowserSession()).toEqual({ state: 'unavailable' })
  })

  it('treats 401 as "sign in first", not as a crash', async () => {
    /*
     * Measured in a plain browser: without this the screen showed the
     * server's own "no X-Api-Key and no Telegram initData".
     */
    const { readBrowserSession } = await load()
    apiFetch.mockRejectedValue(
      Object.assign(new Error('no X-Api-Key and no Telegram initData'), {
        status: 401,
      })
    )
    expect(await readBrowserSession()).toEqual({ state: 'signin' })
  })

  it('still throws on a real failure', async () => {
    const { readBrowserSession } = await load()
    apiFetch.mockRejectedValue(
      Object.assign(new Error('boom'), { status: 502 })
    )
    await expect(readBrowserSession()).rejects.toThrow('boom')
  })

  it('defaults to "none" when the server says nothing useful', async () => {
    const { readBrowserSession } = await load()
    apiFetch.mockResolvedValue({ ok: true })
    expect((await readBrowserSession()).state).toBe('none')
  })
})

describe('the four doors are four different requests', () => {
  it('opens, closes and forgets on the right paths and methods', async () => {
    const { openBrowserSession, closeBrowserSession, forgetBrowserProfile } =
      await load()
    apiFetch.mockResolvedValue({ ok: true, state: 'none' })

    await openBrowserSession()
    expect(apiFetch).toHaveBeenLastCalledWith(
      'https://render.example.com/api/browser/session',
      { method: 'POST' }
    )

    await closeBrowserSession()
    expect(apiFetch).toHaveBeenLastCalledWith(
      'https://render.example.com/api/browser/session',
      { method: 'DELETE' }
    )

    /* Forgetting is a DIFFERENT path: closing must never wipe the logins. */
    await forgetBrowserProfile()
    expect(apiFetch).toHaveBeenLastCalledWith(
      'https://render.example.com/api/browser/profile',
      { method: 'DELETE' }
    )
  })
})

describe('where the browser may be shown', () => {
  it('resolves the path against OUR origin, not the render server', async () => {
    /*
     * `/live/` is proxied under this app's origin by the nginx config that
     * ships in the same image as this bundle. Same origin is what keeps the
     * viewer's cookie first-party, and a phone keeps no other kind.
     */
    const { absoluteViewUrl } = await load()
    expect(absoluteViewUrl('/live/s1?t=x')).toBe(
      `${window.location.origin}/live/s1?t=x`
    )
    expect(absoluteViewUrl('/live/s1?t=x')).not.toContain('render.example.com')
  })

  it('embeds its own origin', async () => {
    const { canEmbed } = await load()
    expect(canEmbed('/live/s1?t=x')).toBe(true)
  })

  it('NEVER frames a viewer that lives somewhere else', async () => {
    /*
     * The guard that still matters: a server handing back an absolute URL to
     * another origin. Framed, its cookie would be third-party and refused --
     * so it is opened top-level instead.
     */
    const { canEmbed } = await load()
    expect(canEmbed('https://elsewhere.example/live/s1?t=x')).toBe(false)
  })
})
