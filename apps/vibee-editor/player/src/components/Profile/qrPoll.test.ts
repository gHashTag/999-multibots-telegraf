import { describe, expect, it } from 'vitest'
import { QR_POLL_MS, accountLabel, runQrPoll } from './qrPoll'

/**
 * WAITING FOR THE SCAN.
 *
 * Two ways this loop can hurt somebody: it asks the server twice at once while
 * the server is in the middle of finishing the login, or it gives up the
 * moment a phone loses signal for one request. Both are pinned here, with the
 * clock and the request passed in.
 */

/*
 * The server's answers use Cyrillic field names. Written as computed string
 * keys so they stay string literals: as bare keys they are identifiers, which
 * the no-Cyrillic guard rightly refuses in new code.
 */
const connected = (extra: Record<string, unknown> = {}) => ({
  ok: true,
  ['подключено']: true,
  ...extra,
})
const passwordNeeded = { ok: true, ['нужен_пароль']: true }

function harness(
  answers: Array<
    Record<string, unknown> | Error | (() => Promise<Record<string, unknown>>)
  >
) {
  const log: string[] = []
  let inFlight = 0
  let maxInFlight = 0
  let alive = true
  const urls: string[] = []
  const errors: string[] = []
  return {
    log,
    urls,
    errors,
    leave: () => {
      alive = false
    },
    get maxInFlight() {
      return maxInFlight
    },
    opts: {
      poll: async () => {
        inFlight++
        maxInFlight = Math.max(maxInFlight, inFlight)
        log.push('poll')
        try {
          const next = answers.shift()
          if (next === undefined)
            throw new Error('the harness ran out of answers')
          if (next instanceof Error) throw next
          return typeof next === 'function' ? await next() : next
        } finally {
          inFlight--
        }
      },
      wait: async (ms: number) => {
        log.push(`wait:${ms}`)
      },
      alive: () => alive,
      onUrl: (u: string) => urls.push(u),
      onTransientError: (m: string) => errors.push(m),
      isGone: (m: string) => m.includes('ИСТЁК'),
    },
  }
}

describe('the loop', () => {
  it('waits BEFORE every question, and ends on connected with the account', async () => {
    const h = harness([
      { ok: true, state: 'waiting', url: 'tg://login?token=A' },
      { ok: true, state: 'waiting', url: 'tg://login?token=B' },
      connected({ account: { username: 'owner' } }),
    ])
    const end = await runQrPoll(h.opts)
    expect(end).toEqual({ kind: 'connected', account: { username: 'owner' } })
    expect(h.log).toEqual([
      `wait:${QR_POLL_MS}`,
      'poll',
      `wait:${QR_POLL_MS}`,
      'poll',
      `wait:${QR_POLL_MS}`,
      'poll',
    ])
    // The renewed token reaches the screen, in order.
    expect(h.urls).toEqual(['tg://login?token=A', 'tg://login?token=B'])
  })

  it('never has two questions in the air, however slow the answer', async () => {
    const h = harness([
      () =>
        new Promise(r =>
          setTimeout(() => r({ ok: true, state: 'waiting' }), 30)
        ),
      () => new Promise(r => setTimeout(() => r(passwordNeeded), 30)),
    ])
    expect(await runQrPoll(h.opts)).toEqual({ kind: 'password' })
    expect(h.maxInFlight).toBe(1)
  })

  it('one lost request is not the end: it says so and keeps asking', async () => {
    const h = harness([
      new Error('Failed to fetch'),
      new Error('сервер ответил 502'),
      connected(),
    ])
    const end = await runQrPoll(h.opts)
    expect(end.kind).toBe('connected')
    expect(h.errors).toEqual(['Failed to fetch', 'сервер ответил 502'])
    expect(h.log.filter(l => l === 'poll')).toHaveLength(3)
  })

  it('the server saying the attempt is gone IS the end, with its words', async () => {
    const h = harness([new Error('вход не начат или ИСТЁК — начните заново')])
    expect(await runQrPoll(h.opts)).toEqual({
      kind: 'gone',
      message: 'вход не начат или ИСТЁК — начните заново',
    })
    // Not reported as a passing hiccup as well: one message, one meaning.
    expect(h.errors).toEqual([])
  })

  it('stops asking once the person has left the screen', async () => {
    const h = harness([{ ok: true, state: 'waiting' }])
    const opts = {
      ...h.opts,
      wait: async () => {
        // They press Back during the second wait.
        if (h.log.filter(l => l === 'poll').length === 1) h.leave()
      },
    }
    expect(await runQrPoll(opts)).toEqual({ kind: 'left' })
    expect(h.log.filter(l => l === 'poll')).toHaveLength(1)
  })

  it('an answer that arrives after they left changes nothing', async () => {
    const h = harness([
      async () => {
        h.leave()
        return connected()
      },
    ])
    expect(await runQrPoll(h.opts)).toEqual({ kind: 'left' })
  })
})

describe('naming the account that connected', () => {
  it('prefers the handle, then the name, and adds how the number ends', () => {
    expect(
      accountLabel({ username: 'owner', firstName: 'D', phoneEnding: '4567' })
    ).toBe('@owner ···4567')
    expect(accountLabel({ firstName: 'Dmitry' })).toBe('Dmitry')
    expect(accountLabel({ phoneEnding: '4567' })).toBe('···4567')
  })

  it('says nothing rather than something empty', () => {
    expect(accountLabel(null)).toBe('')
    expect(accountLabel({})).toBe('')
  })
})
