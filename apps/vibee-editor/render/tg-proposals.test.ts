import { describe, it, expect, beforeEach, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import {
  remember,
  pendingFor,
  claim,
  forgetProposals,
  pendingCount,
  idFromBody,
  execute,
} from './src/agent/tg-proposals'

/**
 * CONFIRMATION IS THE ONLY WAY A MESSAGE LEAVES.
 *
 * `telegram-tools.ts` never sends from a model's decision -- it proposes. That
 * half was already right. What did not exist was anything able to ACCEPT a
 * proposal: measured 2026-09-07, `grep -rn proposal` across the player and the
 * bot found not one reader, so `tg_send` could not reach anybody at all.
 *
 * These checks are about the half being added. Every one of them describes
 * something that reaches another human being if it goes wrong.
 */

const draft = (id: string, who: string, what = 'привет') => ({
  id,
  telegramId: who,
  action: 'send' as const,
  target: '6579515876',
  what,
})

beforeEach(() => forgetProposals())

describe('a proposal belongs to one person', () => {
  it('somebody else cannot confirm it, even holding the id', () => {
    /*
     * The id travels in a button payload and a request body. If it were a pass
     * on its own, anybody who saw or guessed one could send a message from
     * another person's Telegram account.
     */
    remember(draft('p1', '144022504'))
    const r = claim('999', 'p1')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.why).toContain('не вам')
  })

  it('a refusal does not reveal whether the id exists', () => {
    remember(draft('p1', '144022504'))
    const foreign = claim('999', 'p1')
    const missing = claim('999', 'nonexistent')
    // Different reasons are fine; what must not differ is that both refuse.
    expect(foreign.ok).toBe(false)
    expect(missing.ok).toBe(false)
  })

  it('the owner can confirm their own', () => {
    remember(draft('p1', '144022504', 'текст письма'))
    const r = claim('144022504', 'p1')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.proposal.what).toBe('текст письма')
  })
})

describe('confirming consumes the proposal', () => {
  it('a second press cannot send the same message twice', () => {
    /*
     * On a phone a slow reply is indistinguishable from a missed press, so the
     * second tap is not a rare case -- it is the normal one.
     */
    remember(draft('p1', '144022504'))
    expect(claim('144022504', 'p1').ok).toBe(true)
    const again = claim('144022504', 'p1')
    expect(again.ok).toBe(false)
    if (!again.ok) expect(again.why).toContain('уже подтверждено')
  })

  it('cancelling also consumes it, so a cancelled draft cannot be sent', () => {
    // Cancel goes through the same claim; that is the point.
    remember(draft('p1', '144022504'))
    expect(claim('144022504', 'p1').ok).toBe(true)
    expect(claim('144022504', 'p1').ok).toBe(false)
  })
})

describe('one pending proposal per person', () => {
  it('a new draft replaces the old one', () => {
    /*
     * Two drafts waiting at once is how somebody confirms the wrong one: the
     * buttons look identical and the chat has moved on.
     */
    remember(draft('p1', '144022504', 'первое'))
    remember(draft('p2', '144022504', 'второе'))
    expect(pendingFor('144022504')?.what).toBe('второе')
    expect(claim('144022504', 'p1').ok).toBe(false)
  })

  it('two different people keep their own', () => {
    remember(draft('p1', '111'))
    remember(draft('p2', '222'))
    expect(pendingFor('111')?.id).toBe('p1')
    expect(pendingFor('222')?.id).toBe('p2')
    expect(pendingCount()).toBe(2)
  })
})

describe('nothing waits for a person who has nothing', () => {
  it('pendingFor is null rather than somebody else draft', () => {
    remember(draft('p1', '144022504'))
    expect(pendingFor('999')).toBeNull()
  })
})

describe('the id survives the trip through an HTTP body', () => {
  /*
   * THE DEFECT THIS SECTION EXISTS FOR.
   *
   * `readBody` returns the raw STRING. The confirm and cancel routes cast it
   * `as { id?: string }`, which compiles and is a lie: `body.id` was always
   * undefined, `claim(who, '')` always refused, and every press of "Send"
   * answered "already confirmed or expired". The button existed, looked
   * correct, and could not reach anybody -- the exact defect this whole change
   * removes, reintroduced one layer up.
   *
   * Nothing caught it. The tests above cover the store; the bot tests cover the
   * bot module; the route wiring in render-server.ts had no cover at all. Found
   * by a probe before merge, and this is the cover that gap was missing.
   */
  it('a JSON string body yields the id, and the draft is claimed', () => {
    forgetProposals()
    remember(draft('p1', '144022504', 'текст'))
    const raw = JSON.stringify({ id: 'p1' })
    const r = claim('144022504', idFromBody(raw))
    expect(r.ok, 'подтверждение не дошло до черновика').toBe(true)
  })

  it('the raw string is NOT treated as an object', () => {
    // The precise mistake, pinned: reading `.id` off the string gives nothing.
    const raw = JSON.stringify({ id: 'p1' })
    expect((raw as unknown as { id?: string }).id).toBeUndefined()
    expect(idFromBody(raw)).toBe('p1')
  })

  it('a malformed body refuses instead of throwing', () => {
    /*
     * A thrown error here surfaces as a 500 on a button press, which tells the
     * person "we are broken" rather than "that draft is gone". Refusal is the
     * honest answer, and the recoverable one.
     */
    expect(() => idFromBody('{not json')).not.toThrow()
    expect(idFromBody('{not json')).toBe('')
    expect(idFromBody('')).toBe('')
    expect(idFromBody(undefined)).toBe('')
  })

  it('a non-string id is refused rather than coerced', () => {
    // `String(42)` would happily produce "42" and hunt for a draft named that.
    expect(idFromBody(JSON.stringify({ id: 42 }))).toBe('')
    expect(idFromBody(JSON.stringify({ id: { toString: 1 } }))).toBe('')
    expect(idFromBody(JSON.stringify({}))).toBe('')
  })

  it('an already-parsed object still works, defensively', () => {
    expect(idFromBody({ id: 'p9' })).toBe('p9')
  })
})

describe('every readBody in the server is parsed before use', () => {
  it('no caller treats the raw string as an object', () => {
    /*
     * A ratchet over the whole file, because this mistake is invisible at the
     * call site: `as { id?: string }` type-checks and reads as intent. Every
     * other caller in render-server.ts already wrapped it; these two did not,
     * and nothing said so.
     */
    const src = fs.readFileSync(
      path.join(__dirname, 'render-server.ts'),
      'utf8'
    )
    const bad = src
      .split('\n')
      .map((line, i) => ({ line: line.trim(), n: i + 1 }))
      .filter(l => l.line.includes('readBody(req)'))
      .filter(
        l =>
          !l.line.includes('JSON.parse') &&
          !l.line.includes('idFromBody') &&
          !l.line.includes('readBody: r =>')
      )
    expect(bad.map(b => `${b.n}: ${b.line}`)).toEqual([])
  })
})

describe('the send reaches an address the model actually holds', () => {
  /*
   * THE SECOND DEFECT FOUND BEFORE MERGE, REPRODUCED RATHER THAN READ.
   *
   * `client()` builds a fresh TelegramClient every call, and a StringSession
   * carries no entities. Against telegram@2.26.22 a bare numeric id therefore
   * fails inside sendMessage with "Could not find the input entity" -- and a
   * bare numeric id is exactly what `tg_dialogs` hands the model and what
   * `tg_send` takes back. The common case, "reply to this dialog", failed on
   * every press.
   *
   * The client is faked here on purpose: what is under test is OUR retry, not
   * Telegram. The fake refuses a numeric id until the address book is fetched,
   * which is precisely what the real one does.
   */
  const fakeClient = (opts: { failNumericUntilDialogs?: boolean } = {}) => {
    const calls: string[] = []
    let warmed = false
    return {
      calls,
      client: {
        async getDialogs() {
          calls.push('getDialogs')
          warmed = true
          return []
        },
        async sendMessage(to: string) {
          calls.push(`sendMessage:${to}`)
          const numeric = /^-?\d+$/.test(to)
          if (opts.failNumericUntilDialogs && numeric && !warmed) {
            throw new Error(
              'Could not find the input entity for {"userId":"' + to + '"}'
            )
          }
          return {}
        },
      },
    }
  }

  const proposal = (target: string) => ({
    id: 'p1',
    telegramId: '144022504',
    action: 'send' as const,
    target,
    what: 'здравствуйте',
    createdAt: Date.now(),
  })

  beforeEach(() => {
    vi.resetModules()
    vi.doUnmock('./src/agent/telegram-tools')
  })

  it('a bare id gets the address book fetched, then goes through', async () => {
    const f = fakeClient({ failNumericUntilDialogs: true })
    vi.doMock('./src/agent/telegram-tools', () => ({
      client: async () => f.client,
    }))
    const { execute: exec } = await import('./src/agent/tg-proposals')
    const r = await exec(proposal('6579515876'), { telegramId: '144022504' })
    expect(r.done, r.done ? '' : (r as { why: string }).why).toBe(true)
    expect(f.calls).toEqual([
      'sendMessage:6579515876',
      'getDialogs',
      'sendMessage:6579515876',
    ])
  })

  it('a @username costs ONE call, not two', async () => {
    // The warm-up is a repair, not a routine. Fetching dialogs on every send
    // is an extra round trip against Telegram on a path that is already fine,
    // and needless traffic is how an account gets rate limited.
    const f = fakeClient({ failNumericUntilDialogs: true })
    vi.doMock('./src/agent/telegram-tools', () => ({
      client: async () => f.client,
    }))
    const { execute: exec } = await import('./src/agent/tg-proposals')
    const r = await exec(proposal('@ivan'), { telegramId: '144022504' })
    expect(r.done).toBe(true)
    expect(f.calls).toEqual(['sendMessage:@ivan'])
  })

  it('it does not retry forever on an address that never resolves', async () => {
    /*
     * A loop here turns one bad address into a stream of dialog fetches, which
     * is how an account gets limited. One repair attempt, then an answer.
     */
    const calls: string[] = []
    vi.doMock('./src/agent/telegram-tools', () => ({
      client: async () => ({
        async getDialogs() {
          calls.push('getDialogs')
          return []
        },
        async sendMessage(to: string) {
          calls.push(`sendMessage:${to}`)
          throw new Error('Could not find the input entity for {"userId":"1"}')
        },
      }),
    }))
    const { execute: exec } = await import('./src/agent/tg-proposals')
    const r = await exec(proposal('1234567890'), { telegramId: '144022504' })
    expect(r.done).toBe(false)
    expect(calls.filter(c => c === 'getDialogs')).toHaveLength(1)
  })

  it('the failure is said in words, not in protocol', async () => {
    // "Could not find the input entity for {\"userId\":…}" under a button that
    // says Send reads as a broken product. It has a precise remedy: name the
    // person by @username.
    vi.doMock('./src/agent/telegram-tools', () => ({
      client: async () => ({
        async getDialogs() {
          return []
        },
        async sendMessage() {
          throw new Error('Could not find the input entity for {"userId":"1"}')
        },
      }),
    }))
    const { execute: exec } = await import('./src/agent/tg-proposals')
    const r = await exec(proposal('1234567890'), { telegramId: '144022504' })
    expect(r.done).toBe(false)
    if (!r.done) {
      expect(r.why).toContain('@имени')
      expect(r.why).not.toContain('input entity')
    }
  })

  it('an unknown failure passes through untouched', async () => {
    // A friendly "something went wrong" erases the only clue anybody has.
    vi.doMock('./src/agent/telegram-tools', () => ({
      client: async () => ({
        async getDialogs() {
          return []
        },
        async sendMessage() {
          throw new Error('SOMETHING_ENTIRELY_NEW')
        },
      }),
    }))
    const { execute: exec } = await import('./src/agent/tg-proposals')
    const r = await exec(proposal('@ivan'), { telegramId: '144022504' })
    expect(r.done).toBe(false)
    if (!r.done) expect(r.why).toContain('SOMETHING_ENTIRELY_NEW')
  })
})

describe('the approved bytes are the sent bytes', () => {
  const proposal2 = (what: string) => ({
    id: 'p1',
    telegramId: '144022504',
    action: 'send' as const,
    target: '@ivan',
    what,
    createdAt: Date.now(),
  })

  beforeEach(() => {
    vi.resetModules()
    vi.doUnmock('./src/agent/telegram-tools')
  })

  it('markdown parsing is switched OFF explicitly', async () => {
    /*
     * GramJS defaults client.parseMode to MARKDOWN, so sendMessage rewrites
     * the text unless told not to. The card shows the raw string, which made
     * the shown text and the sent text two different things. Measured on
     * telegram@2.26.22:
     *   approved "src/__tests__/a.ts: 5**2 часов, `npm run verify`"
     *   sent     "src/tests/a.ts: 52 часов, npm run verify"
     * A confirmation that shows one thing and sends another is worse than no
     * confirmation, because the person believes they checked.
     */
    let seen: unknown = null
    vi.doMock('./src/agent/telegram-tools', () => ({
      client: async () => ({
        async getDialogs() {
          return []
        },
        async sendMessage(_to: string, opts: unknown) {
          seen = opts
          return {}
        },
      }),
    }))
    const { execute: exec } = await import('./src/agent/tg-proposals')
    const text = 'src/__tests__/a.ts: 5**2 часов, `npm run verify`'
    const r = await exec(proposal2(text), { telegramId: '144022504' })
    expect(r.done).toBe(true)
    expect((seen as { message: string }).message).toBe(text)
    expect((seen as { parseMode: unknown }).parseMode).toBe(false)
  })

  it('the retry after warming the address book is verbatim too', async () => {
    // The repair path is a second call site, and a fix applied to one of two
    // call sites is how the bug comes back under a slightly rarer condition.
    const opts: unknown[] = []
    let warmed = false
    vi.doMock('./src/agent/telegram-tools', () => ({
      client: async () => ({
        async getDialogs() {
          warmed = true
          return []
        },
        async sendMessage(_to: string, o: unknown) {
          opts.push(o)
          if (!warmed) throw new Error('Could not find the input entity')
          return {}
        },
      }),
    }))
    const { execute: exec } = await import('./src/agent/tg-proposals')
    const r = await exec(
      { ...proposal2('a **b** c'), target: '6579515876' },
      { telegramId: '144022504' }
    )
    expect(r.done).toBe(true)
    expect(opts).toHaveLength(2)
    for (const o of opts) {
      expect((o as { parseMode: unknown }).parseMode).toBe(false)
      expect((o as { message: string }).message).toBe('a **b** c')
    }
  })
})

describe('the socket does not stay open', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.doUnmock('./src/agent/telegram-tools')
  })

  const withDisconnect = (send: () => Promise<unknown>) => {
    const state = { disconnects: 0 }
    vi.doMock('./src/agent/telegram-tools', () => ({
      client: async () => ({
        async getDialogs() {
          return []
        },
        sendMessage: send,
        async disconnect() {
          state.disconnects++
        },
      }),
    }))
    return state
  }

  const draft2 = {
    id: 'p1',
    telegramId: '144022504',
    action: 'send' as const,
    target: '@ivan',
    what: 'hi',
    createdAt: Date.now(),
  }

  it('a successful send closes its client', async () => {
    /*
     * client() builds a NEW TelegramClient per call and connect() starts an
     * update loop that pings Telegram every nine seconds for the life of the
     * process. Counted on this branch before the fix: six clients built, six
     * connected, ZERO disconnected. The correct shape already exists in the
     * logout helper a hundred lines away and was simply not applied.
     */
    const state = withDisconnect(async () => ({}))
    const { execute: exec } = await import('./src/agent/tg-proposals')
    await exec(draft2, { telegramId: '144022504' })
    expect(state.disconnects).toBe(1)
  })

  it('a FAILED send closes it too', async () => {
    // The failing path is the one that would leak in a loop: a person retries,
    // and each retry leaves another live connection behind.
    const state = withDisconnect(async () => {
      throw new Error('CHAT_WRITE_FORBIDDEN')
    })
    const { execute: exec } = await import('./src/agent/tg-proposals')
    const r = await exec(draft2, { telegramId: '144022504' })
    expect(r.done).toBe(false)
    expect(state.disconnects).toBe(1)
  })

  it('a client without disconnect does not crash the send', async () => {
    // Defensive: the fake in older tests has no disconnect, and neither does
    // any future client shape we do not control.
    vi.doMock('./src/agent/telegram-tools', () => ({
      client: async () => ({
        async getDialogs() {
          return []
        },
        async sendMessage() {
          return {}
        },
      }),
    }))
    const { execute: exec } = await import('./src/agent/tg-proposals')
    const r = await exec(draft2, { telegramId: '144022504' })
    expect(r.done).toBe(true)
  })
})

describe('only an executable action takes the one queue slot', () => {
  beforeEach(() => {
    // The describes above doMock this module; without unmocking, the real
    // TELEGRAM_TOOLS is not there and the failure looks like a missing export.
    vi.doUnmock('./src/agent/telegram-tools')
    vi.resetModules()
    forgetProposals()
  })

  it('a read proposal does not evict the send waiting for approval', async () => {
    /*
     * One slot per person, so whatever is queued last is what the card shows
     * and what a press carries out. Queueing a `tg_read` -- which `execute`
     * refuses anyway -- silently threw away the message the person was about
     * to confirm: the agent reads a chat, and the draft disappears.
     */
    const { TELEGRAM_TOOLS } = await import('./src/agent/telegram-tools')
    const q = await import('./src/agent/tg-proposals')
    q.forgetProposals()
    const owner = {
      telegramId: '144022504',
      pool: { query: async () => ({ rows: [] }) },
    } as never
    const send = TELEGRAM_TOOLS.find(t => t.name === 'tg_send')!
    const read = TELEGRAM_TOOLS.find(t => t.name === 'tg_read')!

    await send.handler({ chat: '@ivan', text: 'важное письмо' }, owner)
    expect(q.pendingFor('144022504')?.what).toBe('важное письмо')

    await read.handler({ chat: '@somebody' }, owner)
    expect(
      q.pendingFor('144022504')?.what,
      'чтение выбросило черновик отправки'
    ).toBe('важное письмо')
    expect(q.pendingCount()).toBe(1)
  })

  it('a non-executable action still answers the model with a proposal', async () => {
    // The model must learn the action did not happen; that is what the
    // proposal object is for. It simply does not occupy the human queue.
    const { TELEGRAM_TOOLS } = await import('./src/agent/telegram-tools')
    const q = await import('./src/agent/tg-proposals')
    q.forgetProposals()
    const owner = {
      telegramId: '144022504',
      pool: { query: async () => ({ rows: [] }) },
    } as never
    const read = TELEGRAM_TOOLS.find(t => t.name === 'tg_read')!
    const answer = (await read.handler({ chat: '@x' }, owner)) as {
      proposal?: boolean
    }
    expect(answer.proposal).toBe(true)
    expect(q.pendingCount()).toBe(0)
  })
})
