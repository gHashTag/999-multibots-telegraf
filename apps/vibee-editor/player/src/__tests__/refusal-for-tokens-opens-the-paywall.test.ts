// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'

/**
 * THE OFFER EXISTED ONLY BEFORE ANYBODY HAD PAID.
 *
 * The paywall opens in the pre-flight check, when the three free renders of
 * the month are gone. After that a person can buy tokens -- and when those run
 * out mid-session the server answers 402 "not enough tokens", which the client
 * turned into a bare string: every non-ok response became `{success:false,
 * error:text}` with the status discarded. So a refusal a top-up would fix was
 * indistinguishable from a provider error that it would not, and the most
 * engaged person in the product -- free quota spent, tokens bought, tokens
 * gone -- was the one shown no way to continue.
 *
 * The two halves are tested differently on purpose: the status is real
 * behaviour and gets a real fetch; the paywall lives in a jotai component that
 * needs a store, so it is pinned by source, the way voices.test.ts does.
 */
const realFetch = globalThis.fetch

function reply(status: number, body = 'не хватает токенов: нужно 20, есть 16') {
  // cyrillic-ok: the server's own refusal text
  return vi
    .fn()
    .mockResolvedValue(
      new Response(body, { status, headers: { 'Content-Type': 'text/plain' } })
    )
}

describe('a refusal for want of tokens is told apart from a failure', () => {
  beforeEach(() => {
    // A block body on purpose: resetModules() returns vi, and an arrow that
    // returns it makes the hook look like it is handing back a cleanup
    // function. The player's type gate catches that; the root one does not
    // see this directory at all.
    vi.resetModules()
  })
  afterEach(() => {
    globalThis.fetch = realFetch
    vi.unstubAllGlobals()
  })

  const load = async () => await import('../lib/generateApi')

  it('marks a 402 as a shortfall a top-up would fix', async () => {
    // realFetch is captured when the module loads, so the stub goes first.
    vi.stubGlobal('fetch', reply(402))
    const api = await load()
    const r = await api.generateImage({
      model: 'm',
      prompt: 'p',
      aspectRatio: '1:1',
    } as never)
    expect(r.success).toBe(false)
    expect(r.insufficientTokens).toBe(true)
  })

  it('does NOT mark a provider failure, which no top-up fixes', async () => {
    vi.stubGlobal('fetch', reply(500, 'upstream exploded'))
    const api = await load()
    const r = await api.generateImage({
      model: 'm',
      prompt: 'p',
      aspectRatio: '1:1',
    } as never)
    expect(r.success).toBe(false)
    expect(r.insufficientTokens).toBe(false)
  })

  it('keeps the error text either way, so the reason is still shown', async () => {
    vi.stubGlobal('fetch', reply(402))
    const api = await load()
    const r = await api.generateImage({
      model: 'm',
      prompt: 'p',
      aspectRatio: '1:1',
    } as never)
    expect(String(r.error)).toContain('16')
  })

  it('the panel opens the paywall on that flag, in the branch that shows the error', () => {
    const panel = fs.readFileSync(
      path.join(__dirname, '../components/Panels/GeneratePanel.tsx'),
      'utf8'
    )
    const at = panel.indexOf('result.insufficientTokens')
    expect(at, 'the flag must be consulted at all').toBeGreaterThan(-1)
    // Position, not presence: a call that drifted out of the failure branch
    // would still satisfy a substring check.
    const setter = panel.indexOf('setShowPaywall(true)', at)
    const shows = panel.indexOf('setError(result.error', at)
    expect(setter).toBeGreaterThan(-1)
    expect(setter).toBeLessThan(shows)
  })
})
