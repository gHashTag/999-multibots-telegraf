import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { onOrphaned, reportOrphan, LIFETIME_MS } from './src/agent/tg-proposals'
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
  issueFor,
  forgetGoneProposalsForTests,
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
  target: '900000002',
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
    const kept = remember(draft('p1', '144022504'))
    const r = claim('999', 'p1', kept.secret)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.why).toContain('не вам')
  })

  it('a refusal does not reveal whether the id exists', () => {
    const kept = remember(draft('p1', '144022504'))
    const foreign = claim('999', 'p1', kept.secret)
    const missing = claim('999', 'nonexistent', kept.secret)
    // Different reasons are fine; what must not differ is that both refuse.
    expect(foreign.ok).toBe(false)
    expect(missing.ok).toBe(false)
  })

  it('the owner can confirm their own', () => {
    const kept = remember(draft('p1', '144022504', 'текст письма'))
    const r = claim('144022504', 'p1', kept.secret)
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
    const kept = remember(draft('p1', '144022504'))
    expect(claim('144022504', 'p1', kept.secret).ok).toBe(true)
    const again = claim('144022504', 'p1', kept.secret)
    expect(again.ok).toBe(false)
    if (!again.ok) expect(again.why).toContain('уже подтверждено')
  })

  it('cancelling also consumes it, so a cancelled draft cannot be sent', () => {
    // Cancel goes through the same claim; that is the point.
    const kept = remember(draft('p1', '144022504'))
    expect(claim('144022504', 'p1', kept.secret).ok).toBe(true)
    expect(claim('144022504', 'p1', kept.secret).ok).toBe(false)
  })
})

describe('one pending proposal per person', () => {
  it('a new draft replaces the old one', () => {
    /*
     * Two drafts waiting at once is how somebody confirms the wrong one: the
     * buttons look identical and the chat has moved on.
     */
    const first = remember(draft('p1', '144022504', 'первое'))
    remember(draft('p2', '144022504', 'второе'))
    expect(pendingFor('144022504')?.what).toBe('второе')
    expect(claim('144022504', 'p1', first.secret).ok).toBe(false)
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
  it('a JSON string body yields id AND secret, and the draft is claimed', () => {
    forgetProposals()
    const kept = remember(draft('p1', '144022504', 'текст'))
    const raw = JSON.stringify({ id: 'p1', secret: kept.secret })
    const asked = idFromBody(raw)
    const r = claim('144022504', asked.id, asked.secret)
    expect(r.ok, 'подтверждение не дошло до черновика').toBe(true)
  })

  it('the raw string is NOT treated as an object', () => {
    // The precise mistake, pinned: reading `.id` off the string gives nothing.
    const raw = JSON.stringify({ id: 'p1', secret: 'abc' })
    expect((raw as unknown as { id?: string }).id).toBeUndefined()
    expect(idFromBody(raw)).toEqual({ id: 'p1', secret: 'abc' })
  })

  it('a malformed body refuses instead of throwing', () => {
    /*
     * A thrown error here surfaces as a 500 on a button press, which tells the
     * person "we are broken" rather than "that draft is gone". Refusal is the
     * honest answer, and the recoverable one.
     */
    expect(() => idFromBody('{not json')).not.toThrow()
    expect(idFromBody('{not json')).toEqual({ id: '', secret: '' })
    expect(idFromBody('')).toEqual({ id: '', secret: '' })
    expect(idFromBody(undefined)).toEqual({ id: '', secret: '' })
  })

  it('a non-string id is refused rather than coerced', () => {
    // `String(42)` would happily produce "42" and hunt for a draft named that.
    expect(idFromBody(JSON.stringify({ id: 42 })).id).toBe('')
    expect(idFromBody(JSON.stringify({ id: { toString: 1 } })).id).toBe('')
    expect(idFromBody(JSON.stringify({})).id).toBe('')
    expect(idFromBody(JSON.stringify({ id: 'p', secret: 7 })).secret).toBe('')
  })

  it('an already-parsed object still works, defensively', () => {
    expect(idFromBody({ id: 'p9', secret: 's9' })).toEqual({
      id: 'p9',
      secret: 's9',
    })
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
    const r = await exec(proposal('900000002'), { telegramId: '144022504' })
    expect(r.done, r.done ? '' : (r as { why: string }).why).toBe(true)
    expect(f.calls).toEqual([
      'sendMessage:900000002',
      'getDialogs',
      'sendMessage:900000002',
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
      { ...proposal2('a **b** c'), target: '900000002' },
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

describe('an action with no executor refuses honestly', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.doUnmock('./src/agent/telegram-tools')
  })

  it('delete names the action and says what IS carried out', async () => {
    /*
     * Pin before the executor-table refactor: the honest refusal is the
     * behaviour, and it must survive the refactor unchanged. A press on a
     * draft whose action nobody implemented must say so in words -- not
     * pretend, not throw.
     */
    vi.doMock('./src/agent/telegram-tools', () => ({
      client: async () => ({
        async getDialogs() {
          return []
        },
      }),
    }))
    const { execute: exec } = await import('./src/agent/tg-proposals')
    const r = await exec(
      {
        id: 'd1',
        telegramId: '144022504',
        action: 'delete',
        target: '@ivan',
        createdAt: Date.now(),
      } as never,
      { telegramId: '144022504' }
    )
    expect(r.done).toBe(false)
    if (!r.done) {
      expect(r.why).toContain('delete')
      expect(r.why).toContain('ещё не сделано')
    }
  })
})

describe('forward and read join send at the executor table', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.doUnmock('./src/agent/telegram-tools')
  })

  /*
   * PROTOTYPE FAKES, ON PURPOSE. GramJS hangs forwardMessages and markAsRead
   * on the prototype as wrappers that pass `this` into the library call, so a
   * detached reference dies the way sendFile did in production (#2372: every
   * photo send answered "Cannot read properties of undefined"). A fake whose
   * methods read `this` cannot be fooled by a detached call the way an object
   * literal can.
   */
  class FakeForwarder {
    public calls: Array<{
      to: string
      messages: unknown
      fromPeer: unknown
    }> = []
    private self: unknown
    constructor() {
      this.self = this
    }
    getDialogs() {
      return []
    }
    forwardMessages(
      this: FakeForwarder,
      to: string,
      opts: { messages: unknown; fromPeer: unknown }
    ) {
      if (!this || this !== this.self) {
        // Unreachable when called attached; a detached call loses `this`.
        throw new Error('detached call')
      }
      this.calls.push({ to, messages: opts.messages, fromPeer: opts.fromPeer })
      return [{ id: 500 }]
    }
    async disconnect() {}
  }

  class FakeReader {
    public reads: Array<{ chat: string; message: unknown; opts: unknown }> = []
    public top: Array<{ id?: unknown }> = [{ id: 42 }]
    getDialogs() {
      return []
    }
    getMessages(this: FakeReader, chat: string, opts: { limit: number }) {
      expect(opts.limit).toBe(1)
      expect(chat).toBeTruthy()
      return this.top
    }
    markAsRead(
      this: FakeReader,
      chat: string,
      message: unknown,
      opts?: unknown
    ) {
      this.reads.push({ chat, message, opts })
      return true
    }
    async disconnect() {}
  }

  it('forward forwards the named messages from the named source', async () => {
    const fake = new FakeForwarder()
    vi.doMock('./src/agent/telegram-tools', () => ({
      client: async () => fake,
    }))
    const { execute: exec } = await import('./src/agent/tg-proposals')
    const r = await exec(
      {
        id: 'f1',
        telegramId: '144022504',
        action: 'forward',
        target: '@dest',
        args: { messageIds: [10, 11], fromPeer: '@src' },
        createdAt: Date.now(),
      } as never,
      { telegramId: '144022504' }
    )
    expect(r.done).toBe(true)
    expect(fake.calls).toEqual([
      { to: '@dest', messages: [10, 11], fromPeer: '@src' },
    ])
  })

  it('forward with no message ids refuses before anything moves', async () => {
    const fake = new FakeForwarder()
    vi.doMock('./src/agent/telegram-tools', () => ({
      client: async () => fake,
    }))
    const { execute: exec } = await import('./src/agent/tg-proposals')
    const r = await exec(
      {
        id: 'f2',
        telegramId: '144022504',
        action: 'forward',
        target: '@dest',
        // fromPeer only: nothing named to forward.
        args: { fromPeer: '@src' },
        createdAt: Date.now(),
      } as never,
      { telegramId: '144022504' }
    )
    expect(r.done).toBe(false)
    if (!r.done) expect(r.why).toContain('нечего пересылать')
    expect(fake.calls).toHaveLength(0)
  })

  it('read marks the newest message read, with its id', async () => {
    // maxId beats a bare read-all: the wrapper gives maxId priority over
    // message, and naming the id is the precise act the card describes.
    const fake = new FakeReader()
    vi.doMock('./src/agent/telegram-tools', () => ({
      client: async () => fake,
    }))
    const { execute: exec } = await import('./src/agent/tg-proposals')
    const r = await exec(
      {
        id: 'r1',
        telegramId: '144022504',
        action: 'read',
        target: '@chat',
        createdAt: Date.now(),
      } as never,
      { telegramId: '144022504' }
    )
    expect(r.done).toBe(true)
    expect(fake.reads).toEqual([
      { chat: '@chat', message: undefined, opts: { maxId: 42 } },
    ])
  })

  it('an empty chat still reads: no newest id, so the whole dialog', async () => {
    const fake = new FakeReader()
    fake.top = []
    vi.doMock('./src/agent/telegram-tools', () => ({
      client: async () => fake,
    }))
    const { execute: exec } = await import('./src/agent/tg-proposals')
    const r = await exec(
      {
        id: 'r2',
        telegramId: '144022504',
        action: 'read',
        target: '@chat',
        createdAt: Date.now(),
      } as never,
      { telegramId: '144022504' }
    )
    expect(r.done).toBe(true)
    expect(fake.reads).toEqual([
      { chat: '@chat', message: undefined, opts: undefined },
    ])
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

  it('a read proposal now evicts the send waiting for approval', async () => {
    /*
     * THE EVICTION FLIP, AND WHY IT IS THE HONEST RULE NOW.
     *
     * Until read had an executor it was right to keep it OUT of the slot: the
     * card could not carry it out, so queueing it only threw away the message
     * the person was about to confirm. Now read executes like send, and a
     * person pressing a green button on a read they just asked for is exactly
     * what the queue is for. One executable draft at a time is still the
     * anti-spam invariant; what changed is what counts as executable.
     */
    const { TELEGRAM_TOOLS } = await import('./src/agent/telegram-tools')
    const q = await import('./src/agent/tg-proposals')
    q.forgetProposals()
    const owner = {
      telegramId: '144022504',
      pool: { query: async () => ({ rows: [] }) },
      // 'bot' because only that surface can confirm, and therefore only that
      // surface queues anything at all.
      surface: 'bot',
    } as never
    const send = TELEGRAM_TOOLS.find(t => t.name === 'tg_send')!
    const read = TELEGRAM_TOOLS.find(t => t.name === 'tg_read')!

    await send.handler({ chat: '@ivan', text: 'важное письмо' }, owner)
    expect(q.pendingFor('144022504')?.what).toBe('важное письмо')

    await read.handler({ chat: '@somebody' }, owner)
    // The read replaced it: last executable draft wins, exactly like a second
    // send always did.
    expect(q.pendingFor('144022504')?.action).toBe('read')
    expect(q.pendingCount()).toBe(1)
  })

  it('a non-executable action still answers the model with a proposal', async () => {
    // The model must learn the action did not happen; that is what the
    // proposal object is for. It simply does not occupy the human queue.
    // `delete` has no executor yet (PR3 territory), so it is the honest
    // specimen now that read and forward execute.
    const { propose } = await import('./src/agent/telegram-tools')
    const q = await import('./src/agent/tg-proposals')
    q.forgetProposals()
    const owner = {
      telegramId: '144022504',
      pool: { query: async () => ({ rows: [] }) },
      surface: 'bot',
    } as never
    const answer = (await propose(
      'delete',
      '@x',
      'сообщения 1..3',
      'why',
      owner
    )) as { proposal?: boolean }
    expect(answer.proposal).toBe(true)
    expect(q.pendingCount()).toBe(0)
  })
})

describe('the id is not a pass -- the one-time secret is', () => {
  /*
   * WHAT THIS CLOSES.
   *
   * Confirming used to need only an id and an identity, and on the server-key
   * path the identity is whatever telegram_id the caller typed. So the "two
   * checks" were one check twice: anything holding RENDER_API_KEY could read a
   * waiting draft through GET /api/tg/proposal and post it straight back to
   * /confirm, and a prepared message left the owner's real account with nobody
   * touching a button.
   *
   * Every check below describes that path staying shut.
   */
  beforeEach(() => forgetProposals())

  it('the right id with the wrong secret confirms nothing', () => {
    const kept = remember(draft('p1', '144022504', 'важное'))
    const r = claim('144022504', 'p1', 'не тот секрет')
    expect(r.ok).toBe(false)
  })

  it('no secret at all confirms nothing', () => {
    // The exact shape of the old attack: id in hand, nothing else.
    remember(draft('p1', '144022504'))
    expect(claim('144022504', 'p1', '').ok).toBe(false)
  })

  it('a refused secret does not consume the draft -- one wrong tap is not fatal', () => {
    /*
     * A stale button in an old chat message is an ordinary thing on a phone.
     * Destroying the live draft on the first mismatch would let anybody who
     * ever saw an id cancel the owner's messages at will.
     */
    const kept = remember(draft('p1', '144022504', 'важное'))
    expect(claim('144022504', 'p1', 'мимо').ok).toBe(false)
    expect(claim('144022504', 'p1', kept.secret).ok).toBe(true)
  })

  it('and a run of wrong secrets does NOT destroy it', () => {
    /*
     * A wrong-attempt limit was written here first, on the reflex that a
     * secret check wants one. It bought nothing -- 128 bits is not searchable,
     * so the limit never stops an attack -- and cost something real: anybody
     * able to reach the route could post three wrong secrets and DESTROY the
     * owner's waiting message. A control whose only reachable effect is denial
     * of service is worse than its absence.
     */
    const kept = remember(draft('p1', '144022504', 'важное'))
    for (let i = 0; i < 10; i++) {
      expect(claim('144022504', 'p1', 'мимо').ok).toBe(false)
    }
    expect(
      claim('144022504', 'p1', kept.secret).ok,
      'чужие неверные попытки уничтожили черновик владельца'
    ).toBe(true)
  })

  it('the refusal does not say WHICH thing was wrong', () => {
    // "Wrong secret" versus "no such draft" is a difference only useful to
    // somebody probing; the person just sees that it is gone.
    const kept = remember(draft('p1', '144022504'))
    const wrongSecret = claim('144022504', 'p1', 'мимо')
    const noDraft = claim('144022504', 'нет-такого', kept.secret)
    expect(wrongSecret.ok).toBe(false)
    expect(noDraft.ok).toBe(false)
    if (!wrongSecret.ok && !noDraft.ok) {
      expect(wrongSecret.why).toBe(noDraft.why)
    }
  })
})

describe('the secret comes out of exactly one door', () => {
  beforeEach(() => forgetProposals())

  it('pendingFor carries no secret', () => {
    /*
     * `pendingFor` used to be the answer of GET /api/tg/proposal, which any
     * holder of the shared server key could ask for any telegram_id. That
     * route is gone -- the draft now travels on the answer to its own turn --
     * but the redaction stays: the next reader of this function must not be
     * able to reintroduce that route by accident.
     */
    remember(draft('p1', '144022504', 'важное'))
    const shown = pendingFor('144022504')
    expect(shown).toBeTruthy()
    expect(JSON.stringify(shown)).not.toContain('secret')
    expect((shown as unknown as { secret?: string }).secret).toBeUndefined()
  })

  it('a claimed proposal carries no secret either', () => {
    // `execute` receives this. Nothing downstream needs the secret, and a
    // value that travels further than it must is a value that leaks.
    const kept = remember(draft('p1', '144022504'))
    const r = claim('144022504', 'p1', kept.secret)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(
        (r.proposal as unknown as { secret?: string }).secret
      ).toBeUndefined()
    }
  })

  it('issueFor is the door, and it opens for the owner and the right turn', () => {
    remember({ ...draft('p1', '144022504', 'важное'), turn: 'ход-1' })
    expect(issueFor('999', 'ход-1'), 'чужому выдали чужой черновик').toBeNull()
    expect(
      issueFor('144022504', 'другой-ход'),
      'черновик выдан ЧУЖОМУ запросу — это и есть гонка'
    ).toBeNull()
    expect(
      issueFor('144022504', 'ход-1')?.secret,
      'дверь не отдала секрет своему же ходу'
    ).toBeTruthy()
  })

  it('an empty turn matches nothing, including a draft that has none', () => {
    // A draft made outside a chat turn (a direct /mcp call) carries no turn.
    // If an empty token matched it, /mcp would become the free read route the
    // whole design just removed.
    remember(draft('p1', '144022504', 'важное'))
    expect(issueFor('144022504', '')).toBeNull()
  })

  it('the door opens ONCE per proposal, not once per turn', () => {
    /*
     * A defect I introduced and caught before merge. `issueFor` answered on
     * every later turn while the draft was still alive, so a person who says
     * "спасибо" after the card appears would get a SECOND card carrying the
     * same live secret: two buttons for one message, either of which sends.
     */
    remember({ ...draft('p1', '144022504', 'важное'), turn: 'ход-1' })
    expect(issueFor('144022504', 'ход-1')?.secret).toBeTruthy()
    expect(
      issueFor('144022504', 'ход-1'),
      'черновик выдан второй раз — будет вторая карточка'
    ).toBeNull()
  })

  /*
   * THE CARD CARRIES THE INSTANT IT STOPS BEING PRESSABLE.
   *
   * The bot holds its sweep while a card can still be pressed, because a
   * second card evicts the first and the first carries a picture that was
   * already generated and paid for. To hold, it needs that instant -- and the
   * only alternative to shipping it is a copy of LIFETIME_MS on the far side
   * of the wire, which stays right until somebody changes this one.
   *
   * Checked against the QUEUE, not against the arithmetic: a test that
   * recomputed createdAt + LIFETIME_MS would agree with any wrong number this
   * file produced, as long as it produced it twice.
   */
  it('the issued card names the instant the queue stops honouring it', () => {
    vi.useFakeTimers()
    try {
      const t0 = new Date('2026-09-16T10:00:00Z').getTime()
      vi.setSystemTime(new Date(t0))
      remember({ ...draft('p1', '144022504', 'важное'), turn: 'ход-1' })
      const card = issueFor('144022504', 'ход-1')
      expect(card?.expiresAt, 'карточка не сказала, когда умирает').toBeTruthy()
      const dies = Number(card?.expiresAt)

      // One millisecond before: still there to be pressed.
      vi.setSystemTime(new Date(dies - 1))
      remember(draft('sweeper', '999', 'чужой черновик двигает очередь'))
      expect(
        pendingFor('144022504'),
        'очередь выбросила карточку РАНЬШЕ названного ею срока'
      ).not.toBeNull()

      // One after: gone, and the holder was right to stop holding.
      vi.setSystemTime(new Date(dies + 1))
      remember(draft('sweeper2', '998', 'и ещё раз'))
      expect(
        pendingFor('144022504'),
        'карточка пережила названный ею же срок — держатель ждал бы впустую'
      ).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('a new draft opens the door again', () => {
    // The gate is per proposal. A fresh message must still get its card.
    remember({ ...draft('p1', '144022504', 'первое'), turn: 'ход-1' })
    expect(issueFor('144022504', 'ход-1')).toBeTruthy()
    remember({ ...draft('p2', '144022504', 'второе'), turn: 'ход-2' })
    expect(issueFor('144022504', 'ход-2')?.what).toBe('второе')
  })

  it('an issued draft is still confirmable -- issuing is not consuming', () => {
    // The card has been shown; the press must still work.
    const kept = remember({ ...draft('p1', '144022504'), turn: 'ход-1' })
    issueFor('144022504', 'ход-1')
    expect(claim('144022504', 'p1', kept.secret).ok).toBe(true)
  })

  it('remember hands back a COPY, not the live record', () => {
    /*
     * A caller holding the stored object could set `issued` back to false and
     * re-open the one-time door -- a second way in, next to the one this whole
     * change exists to close.
     */
    const kept = remember({ ...draft('p1', '144022504'), turn: 'ход-1' })
    ;(kept as unknown as { issued: boolean }).issued = true
    expect(
      issueFor('144022504', 'ход-1'),
      'вернули живую запись — её можно править снаружи'
    ).toBeTruthy()
  })

  it('two proposals never share a secret', () => {
    // A reused secret would make an old button work on a new draft -- the
    // person confirms a message they were not shown.
    const a = remember(draft('a', '111'))
    const b = remember(draft('b', '222'))
    expect(a.secret).not.toBe(b.secret)
    expect(a.secret).toMatch(/^[0-9a-f]{32}$/)
  })
})

describe('the button has 64 bytes and the payload must fit', () => {
  it('id and secret together leave room for the prefix', () => {
    /*
     * Over the limit Telegram rejects the whole message, so the card would not
     * appear at all and the failure would read as "the agent did nothing"
     * rather than as a bug. Measured against the real generated shapes.
     */
    const kept = remember(draft('0123456789ab', '144022504'))
    const payload = `tgp:ok:${kept.id}:${kept.secret}`
    expect(Buffer.byteLength(payload, 'utf8')).toBeLessThanOrEqual(64)
  })
})

describe('there is no route that simply hands drafts out', () => {
  it('GET /api/tg/proposal no longer exists', () => {
    /*
     * It answered with the full text of an unapproved private message for any
     * telegram_id the caller named, and the shared server key is enough to
     * name any of them. Before the one-time secret it was also a complete
     * authorisation: read the id, post it to /confirm.
     *
     * Nothing needs it now. A route that exists only to be polled is a route
     * that will be, so it is gone rather than merely unused.
     */
    const src = fs.readFileSync(
      path.join(__dirname, 'render-server.ts'),
      'utf8'
    )
    expect(src).not.toContain("route === '/api/tg/proposal' && req.method")
    // ...while confirm and cancel are still there.
    expect(src).toContain("route === '/api/tg/proposal/confirm'")
    expect(src).toContain("route === '/api/tg/proposal/cancel'")
  })
})

describe('a draft is only prepared where it can be confirmed', () => {
  /*
   * Only the bot chat draws the card and takes a press. The mini app and iOS
   * read the same agent stream and ignore the proposal event; a direct /mcp
   * call has no screen at all.
   *
   * Queueing for those was worse than useless: it BURNED the draft's one-time
   * secret on a client with nowhere to use it, so the message could not be
   * confirmed from anywhere -- while the agent told the person it was ready.
   */
  const owner = (surface?: string) =>
    ({
      telegramId: '144022504',
      pool: { query: async () => ({ rows: [] }) },
      turn: 'ход-1',
      surface,
    }) as never

  beforeEach(() => {
    vi.resetModules()
    vi.doUnmock('./src/agent/telegram-tools')
    forgetProposals()
  })

  it('the bot chat queues it', async () => {
    const { TELEGRAM_TOOLS } = await import('./src/agent/telegram-tools')
    const q = await import('./src/agent/tg-proposals')
    q.forgetProposals()
    const send = TELEGRAM_TOOLS.find(t => t.name === 'tg_send')!
    await send.handler({ chat: '@ivan', text: 'привет' }, owner('bot'))
    expect(q.pendingCount()).toBe(1)
  })

  for (const surface of ['miniapp', 'ios', 'agent', 'unknown', undefined]) {
    it(`${surface ?? 'no surface'} does NOT queue it`, async () => {
      const { TELEGRAM_TOOLS } = await import('./src/agent/telegram-tools')
      const q = await import('./src/agent/tg-proposals')
      q.forgetProposals()
      const send = TELEGRAM_TOOLS.find(t => t.name === 'tg_send')!
      await send.handler({ chat: '@ivan', text: 'привет' }, owner(surface))
      expect(
        q.pendingCount(),
        'черновик поставлен там, где его нечем подтвердить'
      ).toBe(0)
    })
  }

  it('and says WHERE it can be confirmed, instead of going quiet', async () => {
    /*
     * The model relays this. Without it the person is told a message is ready
     * and waits for a card that will never be drawn -- the same dangling
     * promise the whole change exists to remove, one surface over.
     */
    const { TELEGRAM_TOOLS } = await import('./src/agent/telegram-tools')
    const send = TELEGRAM_TOOLS.find(t => t.name === 'tg_send')!
    const answer = (await send.handler(
      { chat: '@ivan', text: 'привет' },
      owner('miniapp')
    )) as { proposal?: boolean; why?: string }
    expect(answer.proposal).toBe(true)
    expect(answer.why).toContain('чате бота')
  })
})

describe('a wrong secret is visible, not merely counted', () => {
  it('it is written to the log', () => {
    /*
     * A counter outlived the removed lockout for one commit: incremented on
     * every miss, read by nobody, under a comment claiming the attempts were
     * "worth seeing in the numbers". They were not being seen anywhere.
     */
    forgetProposals()
    remember(draft('p1', '144022504'))
    const said: string[] = []
    const real = console.warn
    console.warn = (...a: unknown[]) => said.push(a.join(' '))
    try {
      claim('144022504', 'p1', 'мимо')
    } finally {
      console.warn = real
    }
    expect(said.join(' ')).toContain('wrong secret')
    expect(said.join(' ')).toContain('p1')
    // The secret itself is NOT in the line: a log is where secrets go to leak.
    expect(said.join(' ')).not.toContain('мимо')
  })

  it('the dead counter is gone from the record', () => {
    forgetProposals()
    const kept = remember(draft('p1', '144022504'))
    expect(Object.keys(kept)).not.toContain('wrong')
  })
})

describe('an invoice does not outlive its draft', () => {
  /*
   * A crm_offer mints a Stars link and writes a token_invoices row BEFORE the
   * owner sees the card. Until 2026-09-08 a cancelled draft left that row
   * pending forever, and the reconcile kept listing a sale nobody was asked
   * to make. The queue owns no database, so it reports instead: every draft
   * that leaves unsent with an invoice attached, and why.
   */
  const WHO = '144022504'
  let seen: Array<{ id: string; invoiceId?: number; reason: string }> = []
  beforeEach(() => {
    forgetProposals()
    seen = []
    onOrphaned((p, reason) =>
      seen.push({ id: p.id, invoiceId: p.invoiceId, reason })
    )
  })
  afterEach(() => onOrphaned(null))
  const draft = (id: string, invoiceId?: number, who = WHO) =>
    remember({
      id,
      telegramId: who,
      action: 'send',
      target: '1',
      what: 'x',
      invoiceId,
    })

  it('cancelling reports the invoice as orphaned, with the reason', () => {
    const d = draft('d1', 42)
    expect(claim(WHO, 'd1', d.secret, 'cancel').ok).toBe(true)
    expect(seen).toEqual([{ id: 'd1', invoiceId: 42, reason: 'cancelled' }])
  })

  it('confirming reports nothing: the message goes out and the invoice stands', () => {
    const d = draft('d2', 42)
    expect(claim(WHO, 'd2', d.secret).ok).toBe(true)
    expect(seen).toEqual([])
  })

  /*
   * REPLACED WHEN THE NEW ONE BECOMES A CARD -- NOT WHEN IT IS PREPARED.
   *
   * A draft is created by a tool call inside a model turn, and the turn can
   * die afterwards. Evicting at creation meant a turn that delivered nothing
   * still destroyed the card the owner was holding: production 16.09.2026,
   * an eviction at 15:02:49 and the turn aborted at 15:03:03.
   *
   * The invoice protection this file exists for is unchanged -- the evicted
   * draft is still reported, so its pending row is still closed. Only the
   * moment moved.
   */
  const issue = (id: string, invoiceId?: number, turn = id) => {
    remember({
      id,
      telegramId: WHO,
      action: 'send',
      target: '1',
      turn,
      ...(invoiceId === undefined ? {} : { invoiceId }),
    } as never)
    return issueFor(WHO, turn)
  }

  it('a new draft reports the one it replaces, at the moment it becomes a card', () => {
    issue('old', 7)
    remember({
      id: 'new',
      telegramId: WHO,
      action: 'send',
      target: '1',
      turn: 'new',
      invoiceId: 8,
    } as never)
    expect(
      seen,
      'старую карточку убили ещё до того, как новая стала карточкой'
    ).toEqual([])

    expect(issueFor(WHO, 'new')).toBeTruthy()
    expect(seen).toEqual([{ id: 'old', invoiceId: 7, reason: 'replaced' }])
    expect(pendingFor(WHO)?.id).toBe('new')
  })

  /*
   * THE WHOLE POINT, IN ONE CASE.
   *
   * A turn prepares a draft and then dies. Nothing was ever shown for it, so
   * the card the owner is holding must still be there -- and the abandoned
   * draft must not pile up either.
   */
  it('a draft whose turn died takes nothing with it', () => {
    issue('card', 7)
    // The doomed turn: a draft is created, its turn never asks for it.
    remember({
      id: 'doomed',
      telegramId: WHO,
      action: 'send',
      target: '1',
      turn: 'aborted-turn',
      invoiceId: 9,
    } as never)
    expect(
      pendingFor(WHO)?.id,
      'карточка владельца исчезла из-за хода, который ничего не показал'
    ).toBe('card')
    expect(seen).toEqual([])

    // And the next turn clears the abandoned one rather than growing the queue.
    remember({
      id: 'next',
      telegramId: WHO,
      action: 'send',
      target: '1',
      turn: 'next',
    } as never)
    expect(seen).toEqual([{ id: 'doomed', invoiceId: 9, reason: 'expired' }])
    expect(pendingCount()).toBe(2)
  })

  it('an expired draft is reported the next time the queue looks', () => {
    vi.useFakeTimers()
    try {
      const t0 = new Date('2026-09-08T10:00:00Z').getTime()
      vi.setSystemTime(new Date(t0))
      draft('e1', 9)
      // Past the lifetime, whatever the lifetime is. Restating it here as
      // "eleven minutes" made this test a second copy of the constant, and
      // it went red the moment the real one moved.
      vi.setSystemTime(new Date(t0 + LIFETIME_MS + 60_000))
      // Somebody else's draft makes the queue sweep. The listener must not
      // depend on the OWNER coming back to ask.
      draft('other', undefined, '999')
      expect(pendingFor(WHO)).toBeNull()
      expect(seen).toEqual([{ id: 'e1', invoiceId: 9, reason: 'expired' }])
    } finally {
      vi.useRealTimers()
    }
  })

  it('a photo draft evicted or expired is reported too: the picture was made', () => {
    remember({
      id: 'ph1',
      telegramId: WHO,
      action: 'send',
      target: '1',
      turn: 'ph1',
      media: { kind: 'photo', url: 'https://s3/x.png' },
    } as never)
    expect(issueFor(WHO, 'ph1')).toBeTruthy()
    issue('after', 5)
    expect(seen.map(s => [s.id, s.reason])).toEqual([['ph1', 'replaced']])
  })

  it('a draft without an invoice never wakes the listener', () => {
    const d = draft('n1')
    claim(WHO, 'n1', d.secret, 'cancel')
    draft('n2')
    draft('n3')
    expect(seen).toEqual([])
  })

  it('a listener that throws does not break the press', () => {
    const warned: string[] = []
    const spy = vi
      .spyOn(console, 'warn')
      .mockImplementation((...a: unknown[]) => {
        warned.push(a.map(String).join(' '))
      })
    try {
      onOrphaned(() => {
        throw new Error('db is on fire')
      })
      const d = draft('t1', 5)
      expect(claim(WHO, 't1', d.secret, 'cancel').ok).toBe(true)
      expect(pendingFor(WHO)).toBeNull()
      expect(warned.join('\n')).toContain('orphan listener failed')
    } finally {
      spy.mockRestore()
    }
  })

  it('a second registration replaces the first, and null removes it', () => {
    const other: string[] = []
    onOrphaned(p => {
      other.push(p.id)
    })
    const d = draft('r1', 3)
    claim(WHO, 'r1', d.secret, 'cancel')
    expect(seen).toEqual([])
    expect(other).toEqual(['r1'])
    onOrphaned(null)
    const d2 = draft('r2', 4)
    claim(WHO, 'r2', d2.secret, 'cancel')
    expect(other).toEqual(['r1'])
  })

  it('a send that failed AFTER the press reports the invoice as failed', () => {
    // The press consumed the draft; execute() did not deliver. The confirm
    // route has only the public shape left, and that is enough.
    const d = draft('f1', 11)
    const taken = claim(WHO, 'f1', d.secret)
    expect(taken.ok).toBe(true)
    expect(seen).toEqual([])
    reportOrphan((taken as { proposal: never }).proposal, 'failed')
    expect(seen).toEqual([{ id: 'f1', invoiceId: 11, reason: 'failed' }])
  })

  it('reportOrphan on a draft without an invoice is silent', () => {
    const d = draft('f2')
    const taken = claim(WHO, 'f2', d.secret)
    reportOrphan((taken as { proposal: never }).proposal, 'failed')
    expect(seen).toEqual([])
  })

  it('the listener receives the public shape: no secret, no turn', () => {
    let got: Record<string, unknown> | null = null
    onOrphaned(p => {
      got = p as never
    })
    const d = draft('s1', 6)
    claim(WHO, 's1', d.secret, 'cancel')
    expect(got).not.toBeNull()
    expect(got!).not.toHaveProperty('secret')
    expect(got!).not.toHaveProperty('issued')
    expect(got!).not.toHaveProperty('turn')
  })
})

describe('the sent message goes into the memory at once', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.doUnmock('./src/agent/telegram-tools')
    vi.doUnmock('./src/agent/crm-mirror')
  })

  it('after a send, mirrorNow gets the owner, the lead, the Telegram id and the text', async () => {
    const mirrorNow = vi.fn(async () => ({ fresh: 1, zep: 1 }))
    vi.doMock('./src/agent/crm-mirror', () => ({ mirrorNow }))
    vi.doMock('./src/agent/telegram-tools', () => ({
      client: async () => ({
        async sendMessage() {
          return { id: 77, date: 1757348157 }
        },
      }),
    }))
    const { execute: exec } = await import('./src/agent/tg-proposals')
    const pool = { query: async () => ({ rows: [] }) }
    const r = await exec(
      {
        id: 'p9',
        telegramId: '144022504',
        action: 'send',
        target: '@pilot_client',
        what: 'привет, как дела',
        lead: '900000001',
        display: 'Pilot (@pilot_client)',
        createdAt: Date.now(),
      } as never,
      { telegramId: '144022504', pool }
    )
    expect(r.done).toBe(true)
    expect(mirrorNow).toHaveBeenCalledTimes(1)
    const [p, owner, lead, msgs, name] = mirrorNow.mock.calls[0] as unknown as [
      unknown,
      string,
      string,
      any[],
      string,
    ]
    expect(p).toBe(pool)
    expect(owner).toBe('144022504')
    expect(lead).toBe('900000001')
    expect(name).toBe('Pilot')
    expect(msgs).toEqual([
      {
        msgId: 77,
        at: new Date(1757348157000),
        out: true,
        text: 'привет, как дела',
      },
    ])
  })

  it('no lead, or a client that returns no id: nothing is mirrored and the send still counts', async () => {
    const mirrorNow = vi.fn(async () => ({ fresh: 0, zep: 0 }))
    vi.doMock('./src/agent/crm-mirror', () => ({ mirrorNow }))
    vi.doMock('./src/agent/telegram-tools', () => ({
      client: async () => ({
        async sendMessage() {
          return {}
        },
      }),
    }))
    const { execute: exec } = await import('./src/agent/tg-proposals')
    const pool = { query: async () => ({ rows: [] }) }
    const r = await exec(
      {
        id: 'p10',
        telegramId: '144022504',
        action: 'send',
        target: '@x',
        what: 'x',
        lead: '5',
        createdAt: Date.now(),
      } as never,
      { telegramId: '144022504', pool }
    )
    expect(r.done).toBe(true)
    expect(mirrorNow).not.toHaveBeenCalled()
  })
})

describe('remember caps what a media draft may carry', () => {
  beforeEach(() => {
    vi.resetModules()
    forgetProposals()
  })

  /*
   * The caps guard two different things. The url caps guard the mirror: the
   * payload is a jsonb row, and a "url" of unbounded length is a row of
   * unbounded size. The album cap guards Telegram itself, which refuses an
   * album of more than ten items at send time -- learning that from a refused
   * PRESS, after the card was shown, is a late way to learn it.
   */
  const media = (m: Record<string, unknown>) => ({
    id: 'c1',
    telegramId: '144022504',
    action: 'send' as const,
    target: '@ivan',
    what: undefined,
    createdAt: 0,
    ...m,
  })

  it('an album of two to ten urls is taken', () => {
    expect(() =>
      remember(
        media({
          media: {
            kind: 'album',
            urls: ['https://x/1.png', 'https://x/2.png'],
          },
        }) as never
      )
    ).not.toThrow()
  })

  it("one url is not an album and eleven is past Telegram's limit", () => {
    const urls = (n: number) =>
      Array.from({ length: n }, (_, i) => `https://x/${i}.png`)
    expect(() =>
      remember(media({ media: { kind: 'album', urls: urls(1) } }) as never)
    ).toThrow('альбом')
    expect(() =>
      remember(media({ media: { kind: 'album', urls: urls(11) } }) as never)
    ).toThrow('альбом')
  })

  it('a url that is not https, or is absurdly long, is refused', () => {
    expect(() =>
      remember(
        media({ media: { kind: 'voice', url: 'http://x/v.mp3' } }) as never
      )
    ).toThrow(/https/i)
    expect(() =>
      remember(
        media({
          media: {
            kind: 'photo',
            url: 'https://x/' + 'a'.repeat(2100),
          },
        }) as never
      )
    ).toThrow(/2048/)
  })
})

/*
 * A draft may name a time instead of now (owner decision, 2026-09-14). The
 * window is 30 seconds to 30 days: closer than 30 seconds is "now" wearing a
 * costume, farther than 30 days is a promise nobody can check, and Telegram
 * itself refuses both edges. The check lives in `remember` (the model sees a
 * tool error the moment it drafts one) and again in the send executor (a row
 * restored from a poisoned mirror never reaches the wire).
 */
describe('remember caps the schedule a draft may carry', () => {
  const base = (over: Record<string, unknown> = {}) => ({
    id: 'sch1',
    telegramId: '144022504',
    action: 'send' as const,
    target: '@x',
    what: 'привет',
    ...over,
  })

  it('keeps a time inside the window', () => {
    const p = remember(base({ scheduleAt: Date.now() + 60_000 }))
    expect(p.scheduleAt).toBeGreaterThan(Date.now())
  })

  it('refuses the past and the far future', () => {
    expect(() =>
      remember(base({ id: 'sch-past', scheduleAt: Date.now() - 60_000 }))
    ).toThrow('расписан')
    expect(() =>
      remember(
        base({ id: 'sch-far', scheduleAt: Date.now() + 31 * 24 * 3600_000 })
      )
    ).toThrow('расписан')
  })

  it('refuses a time the model never managed to parse', () => {
    // Date.parse of garbage is NaN; the model hands us strings, and a NaN on
    // the wire would mean "now" to Telegram -- a silent mode change.
    expect(() =>
      remember(base({ id: 'sch-nan', scheduleAt: Number.NaN }))
    ).toThrow('ISO')
  })
})

describe('a card that is gone says WHY, to the person whose card it was', () => {
  /*
   * MEASURED FROM THE HIVE JOURNAL 2026-09-16: 62 cards prepared in five and
   * a half days. One draft per person, so each new card takes the previous
   * one's id out of the queue -- while the Telegram message with its buttons
   * stays in the chat, looking alive.
   *
   * Pressing one from an hour ago answered "already confirmed or expired".
   * Half of that sentence says a message reached a client. It did not, and
   * being unsure which happened is the worst place to leave somebody about a
   * message to their own customer.
   */
  const OWNER = '144022504'

  beforeEach(() => {
    forgetProposals()
    forgetGoneProposalsForTests()
  })

  it('a replaced card tells the owner that nothing was sent', () => {
    const secret = remember(draft('old', OWNER, 'первое')).secret
    // The next sweep mints another card for the same person.
    remember(draft('new', OWNER, 'второе'))

    const r = claim(OWNER, 'old', secret)
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.why).toContain('заменён новым')
      expect(r.why, 'the owner must be told nothing left').toContain(
        'ничего не ушло'
      )
    }
  })

  it('a cancelled card says so, and still says nothing was sent', () => {
    const secret = remember(draft('c1', OWNER)).secret
    expect(claim(OWNER, 'c1', secret, 'cancel').ok).toBe(true)
    const again = claim(OWNER, 'c1', secret)
    expect(again.ok).toBe(false)
    if (!again.ok) expect(again.why).toContain('уже отменён')
  })

  it('a STRANGER holding the id learns nothing', () => {
    // The vague sentence is the right answer here and must stay vague: it
    // must not confirm that a draft ever existed.
    const secret = remember(draft('old', OWNER)).secret
    remember(draft('new', OWNER))
    const r = claim('900000009', 'old', secret)
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.why).toBe('это действие уже подтверждено или истекло')
      expect(r.why).not.toContain('заменён')
    }
  })

  it('the owner WITHOUT the secret learns nothing either', () => {
    // The button carries the secret. A guessed id does not.
    remember(draft('old', OWNER))
    remember(draft('new', OWNER))
    const r = claim(OWNER, 'old', 'не тот секрет')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.why).toBe('это действие уже подтверждено или истекло')
  })

  it('an id nobody ever issued gets the vague answer', () => {
    const r = claim(OWNER, 'никогда-не-было', 'что-то')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.why).toBe('это действие уже подтверждено или истекло')
  })

  it('the courtesy is bounded: old entries do not accumulate', () => {
    // 200 is the cap. Well past it, the oldest reasons are gone and their
    // owners get the vague sentence -- a courtesy, not a record.
    const secrets: string[] = []
    for (let i = 0; i < 205; i += 1) {
      secrets.push(remember(draft(`d${i}`, OWNER)).secret)
    }
    const first = claim(OWNER, 'd0', secrets[0])
    expect(first.ok).toBe(false)
    if (!first.ok)
      expect(first.why).toBe('это действие уже подтверждено или истекло')
    const recent = claim(OWNER, 'd203', secrets[203])
    expect(recent.ok).toBe(false)
    if (!recent.ok) expect(recent.why).toContain('заменён новым')
  })
})
