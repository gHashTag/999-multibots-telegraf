import { describe, it, expect, vi, beforeEach } from 'vitest'

const apiFetch = vi.fn()
vi.mock('@/lib/apiFetch', () => ({
  apiFetch: (...a: unknown[]) => apiFetch(...a),
}))
vi.mock('@/config', () => ({ API_BASE: 'https://render.example.com' }))

import {
  typeInBrowser,
  readBrowserFocus,
  isSecretField,
} from '@/lib/remoteBrowser'
import { whereItGoes } from './TypeSheet'

/*
 * Owner, 2026-09-22: signing in through the video stream was too hard on a
 * phone. The app's own field types into the browser's focused field.
 */
const t = (key: string, vars: Record<string, string | number> = {}) =>
  `${key}${Object.entries(vars)
    .map(([k, v]) => `|${k}=${v}`)
    .join('')}`

beforeEach(() => apiFetch.mockReset())

describe('where the text goes, said before it is sent', () => {
  it('names the kind of field, its label and the site', () => {
    const line = whereItGoes(
      { host: 'accounts.google.com', field: 'password', label: 'Password' },
      t
    )
    expect(line).toContain('browser.type.target')
    expect(line).toContain('kind=browser.type.kind.password')
    expect(line).toContain('host=accounts.google.com')
    expect(line).toContain('Password')
  })

  it('asks to tap a field when nothing has focus, or when it cannot tell', () => {
    expect(whereItGoes({ host: 'x', field: 'none', label: '' }, t)).toBe(
      'browser.type.noField'
    )
    expect(whereItGoes(null, t)).toBe('browser.type.noField')
  })

  it('hides what is typed into a password field', () => {
    expect(isSecretField({ host: '', field: 'password', label: '' })).toBe(true)
    expect(isSecretField({ host: '', field: 'email', label: '' })).toBe(false)
  })
})

describe('the calls behind the sheet', () => {
  it('posts the text and Enter as JSON to the person-only door', async () => {
    apiFetch.mockResolvedValue({
      ok: true,
      focus: { host: 'a.example', field: 'email', label: '' },
    })
    const out = await typeInBrowser('me@example.com', true)
    expect(out.ok).toBe(true)
    const [url, init] = apiFetch.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://render.example.com/api/browser/type')
    expect(init.method).toBe('POST')
    expect(JSON.parse(String(init.body))).toEqual({
      text: 'me@example.com',
      enter: true,
    })
  })

  it('tells "tap a field first" apart from a plain failure', async () => {
    apiFetch.mockRejectedValueOnce(
      Object.assign(new Error('x'), { status: 409 })
    )
    expect(await typeInBrowser('a', false)).toMatchObject({
      ok: false,
      reason: 'no-field',
    })
    apiFetch.mockRejectedValueOnce(
      Object.assign(new Error('x'), { status: 502 })
    )
    expect(await typeInBrowser('a', false)).toMatchObject({
      ok: false,
      reason: 'failed',
    })
  })

  it('reading the focus never throws', async () => {
    // readBrowserFocus makes exactly one call, so reject that one — a
    // persistent mockRejectedValue leaves a rejected result vitest 5 flags.
    apiFetch.mockRejectedValueOnce(new Error('down'))
    expect(await readBrowserFocus()).toBeNull()
  })
})

describe('the agent asking for something to be typed', () => {
  it('reads the request from the session answer', async () => {
    const { asView } = await import('@/lib/remoteBrowser')
    const v = asView({
      state: 'live',
      inputRequest: {
        id: 'q1',
        kind: 'password',
        why: 'to sign in',
        host: 'accounts.example.com',
        label: 'Password',
      },
    })
    expect(v.inputRequest).toEqual({
      id: 'q1',
      kind: 'password',
      options: [],
      why: 'to sign in',
      host: 'accounts.example.com',
      label: 'Password',
    })
  })

  it('a choice carries its buttons, and is pressed, not typed', async () => {
    const { asView, isPressedAsk } = await import('@/lib/remoteBrowser')
    const v = asView({
      state: 'live',
      inputRequest: {
        id: 'c',
        kind: 'choice',
        why: 'Skip or save?',
        options: ['Skip', 'Save', 3],
      },
    })
    expect(v.inputRequest?.options).toEqual(['Skip', 'Save'])
    expect(isPressedAsk(v.inputRequest ?? null)).toBe(true)
    expect(
      isPressedAsk(
        asView({ state: 'live', inputRequest: { id: 'p', kind: 'password' } })
          .inputRequest ?? null
      )
    ).toBe(false)
    expect(isPressedAsk(null)).toBe(false)
  })

  it('no request, or a malformed one, is none; an unknown kind is plain text', async () => {
    const { asView } = await import('@/lib/remoteBrowser')
    expect(asView({ state: 'live' }).inputRequest ?? null).toBeNull()
    expect(
      asView({ state: 'live', inputRequest: { kind: 'password' } }).inputRequest
    ).toBeNull()
    expect(
      asView({ state: 'live', inputRequest: { id: 'x', kind: 'ssn' } })
        .inputRequest?.kind
    ).toBe('text')
  })
})
