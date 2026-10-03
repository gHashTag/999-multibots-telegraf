/**
 * THE PRESS MUST LEAVE THE BOT.
 *
 * `stopOwnerRun` ends the sweep in this process and the aborted fetch ends
 * the turn the person is watching. Neither reaches a duet turn or an a2a
 * run: those have no socket to close. This guards the third path -- the
 * press written down on the render -- and the rule that it can never turn a
 * working button into an error.
 */
import { describe, it, expect, vi } from 'vitest'
import {
  requestRemoteStop,
  requestRemoteStopWhy,
  stopReply,
  STOP_NOT_SENT,
  STOP_TIMEOUT_MS,
} from '@/services/agentStopRemote'

const noWait = async () => undefined

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
      sleep: noWait,
    })
    expect(refused).toBe('not written')
    const dead = await requestRemoteStop('1', {
      key: 'k',
      fetchImpl: (async () => {
        throw new Error('ENOTFOUND')
      }) as any,
      sleep: noWait,
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

  it('names why it did not land: key, refusal, silence, no road', async () => {
    const answer = (status: number) =>
      (async () => ({ ok: status < 300, status })) as any
    const opts = { key: 'k', sleep: noWait }
    expect(
      await requestRemoteStopWhy('1', { ...opts, fetchImpl: answer(401) })
    ).toBe('noKey')
    expect(
      await requestRemoteStopWhy('1', { ...opts, fetchImpl: answer(503) })
    ).toBe('refused')
    expect(
      await requestRemoteStopWhy('1', {
        ...opts,
        fetchImpl: (async () => {
          throw new Error('ECONNRESET')
        }) as any,
      })
    ).toBe('offline')
    expect(
      await requestRemoteStopWhy('1', { key: '', fetchImpl: answer(200) })
    ).toBe('noKey')
    expect(
      await requestRemoteStopWhy(' ', { ...opts, fetchImpl: answer(200) })
    ).toBe('nobody')
  })

  it('a render that never answers is cut off, not waited on forever', async () => {
    vi.useFakeTimers()
    try {
      const hang = ((_u: unknown, init: { signal: AbortSignal }) =>
        new Promise((_ok, fail) =>
          init.signal.addEventListener('abort', () =>
            fail(new Error('aborted'))
          )
        )) as any
      const p = requestRemoteStopWhy('1', {
        key: 'k',
        fetchImpl: hang,
        sleep: noWait,
      })
      await vi.advanceTimersByTimeAsync(STOP_TIMEOUT_MS * 2 + 10)
      expect(await p).toBe('timeout')
    } finally {
      vi.useRealTimers()
    }
  })

  it('a lost answer is tried once more -- a stop written twice is one stop', async () => {
    let calls = 0
    const flaky = (async () => {
      calls++
      if (calls === 1) throw new Error('ECONNRESET')
      return { ok: true, status: 200 }
    }) as any
    expect(
      await requestRemoteStopWhy('1', {
        key: 'k',
        fetchImpl: flaky,
        sleep: noWait,
      })
    ).toBe('written')
    expect(calls).toBe(2)
  })

  it('a refused KEY is not retried: three seconds do not fix a wrong key', async () => {
    let calls = 0
    const no = (async () => {
      calls++
      return { ok: false, status: 401 }
    }) as any
    await requestRemoteStopWhy('1', { key: 'k', fetchImpl: no, sleep: noWait })
    expect(calls).toBe(1)
  })
})

describe('what the press answers', () => {
  it('"nothing to stop" only when it is known', () => {
    expect(stopReply(false, 'nobody')).toContain('нечего останавливать')
    expect(stopReply(false, 'written')).toContain('Принял')
    expect(stopReply(true, 'timeout')).toContain('Останавливаю')
  })

  it('a render that never heard the press is never told as "nothing to stop"', () => {
    for (const why of ['noKey', 'refused', 'timeout', 'offline'] as const) {
      const said = stopReply(false, why)
      expect(said).toBe(STOP_NOT_SENT[why])
      expect(said).not.toContain('нечего')
    }
    // Every reason that invites another press says so; a wrong key does not.
    for (const why of ['refused', 'timeout', 'offline'] as const)
      expect(STOP_NOT_SENT[why]).toContain('ещё раз')
    expect(STOP_NOT_SENT.noKey).not.toContain('нажмите')
  })
})
