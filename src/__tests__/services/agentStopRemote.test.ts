/**
 * THE PRESS MUST LEAVE THE BOT.
 *
 * `stopOwnerRun` ends the sweep in this process and the aborted fetch ends
 * the turn the person is watching. Neither reaches a duet turn or an a2a
 * run: those have no socket to close. This guards the third path -- the
 * press written down on the render -- and the rule that it can never turn a
 * working button into an error.
 */
import { describe, it, expect } from 'vitest'
import { requestRemoteStop } from '@/services/agentStopRemote'

describe('the stop the bot sends onward', () => {
  it('names the person and proves the bot, in one POST', async () => {
    let seen: { url: string; init: any } | null = null
    const r = await requestRemoteStop('144022504', {
      key: 'k',
      base: 'https://render.test',
      fetchImpl: (async (url: any, init: any) => {
        seen = { url: String(url), init }
        return { ok: true } as any
      }) as any,
    })
    expect(r).toBe('written')
    expect(seen!.url).toBe(
      'https://render.test/api/agent/stop?telegram_id=144022504'
    )
    expect(seen!.init.method).toBe('POST')
    expect(seen!.init.headers['X-Api-Key']).toBe('k')
  })

  it('a render that refuses, or is unreachable, is not an error here', async () => {
    const refused = await requestRemoteStop('1', {
      key: 'k',
      fetchImpl: (async () => ({ ok: false, status: 503 })) as any,
    })
    expect(refused).toBe('not written')
    const dead = await requestRemoteStop('1', {
      key: 'k',
      fetchImpl: (async () => {
        throw new Error('ENOTFOUND')
      }) as any,
    })
    expect(dead).toBe('not written')
  })

  it('no key, no person — nothing is sent at all', async () => {
    let called = false
    const send = (async () => {
      called = true
      return { ok: true } as any
    }) as any
    expect(await requestRemoteStop('1', { key: '', fetchImpl: send })).toBe(
      'not written'
    )
    expect(await requestRemoteStop(' ', { key: 'k', fetchImpl: send })).toBe(
      'not written'
    )
    expect(called).toBe(false)
  })
})
