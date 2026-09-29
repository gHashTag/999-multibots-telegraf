import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as SPEC from './mail-push.gen'

/**
 * THE MAILBOX PUSH IS WRITTEN IN t27 FIRST (skill t27-spec-first).
 *
 * gHashTag/t27 specs/automation/mail-push.t27 is the spec of record; that
 * the vendored copy, its generated module and the host agree is held by
 * scripts/check-t27-specs.mjs. Here each `test` of the spec runs against the
 * HOST: the pure decisions and the sweep of src/agent/mail-push.ts (the tool
 * mail_push_sweep), with a stubbed mailbox, stubbed cards and a stubbed
 * composer -- no Zoho, no Telegram, no provider is touched.
 *
 * Refresh: node scripts/sync-t27-spec.mjs <t27 checkout> automation/mail-push
 */
const OWNER = '900000001'

/** The sweep's answer, as the host's PushOutcome -- the handler types it loosely. */
type Outcome = {
  baselined: boolean
  pushed: Array<{ messageId: string; subject: string | null; draft: boolean }>
  settled: Array<{ messageId: string; sent: boolean; state: string }>
  drafts_failed: number
  carried: number
  busy?: boolean
}

/** One letter in the stubbed Inbox. */
function letter(id: number, from = 'Someone <s@example.com>') {
  return {
    messageId: String(id),
    folderId: 'f-inbox',
    fromAddress: from,
    toAddress: 'admin@t27.ai',
    subject: `subject ${id}`,
    receivedTime: Date.now(),
  }
}

/** The mailbox as the sweep sees it: folders, one view, letter bodies, sends. */
function stubMailbox(letters: Array<Record<string, unknown>>) {
  const sends: Array<Record<string, unknown>> = []
  return {
    sends,
    whoAccount: async () => ({ id: 'acct', email: 'admin@t27.ai' }),
    api: async (path: string, query?: Record<string, unknown>) => {
      if (path.endsWith('/folders')) {
        return { data: [{ folderId: 'f-inbox', folderType: 'Inbox' }] }
      }
      if (path.endsWith('/messages/view')) {
        const limit = Number(query?.limit ?? SPEC.VIEW_LIMIT)
        return { data: letters.slice(0, limit) }
      }
      if (path.endsWith('/content')) {
        return { data: { content: 'the letter body, untrusted' } }
      }
      return { data: [] }
    },
    post: async (path: string, payload: Record<string, unknown>) => {
      sends.push({ path, ...payload })
      return { data: { messageId: 'sent-1' } }
    },
  }
}

/** Cards out, taps back, sends recorded -- the whole owner side, stubbed. */
function stubDeps(
  taps: Record<string, string> = {},
  compose: (m: unknown) => Promise<string | null> = async () =>
    'a drafted reply'
) {
  const cards: string[] = []
  const sent: Array<Record<string, unknown>> = []
  let n = 0
  return {
    cards,
    sent,
    deps: {
      ask: async (_ctx: unknown, what: string) => {
        cards.push(what)
        return `card-${++n}`
      },
      answer: async (_ctx: unknown, id: string) =>
        taps[id] ? { state: taps[id], telegramId: OWNER } : null,
      compose,
      send: async (p: Record<string, unknown>) => {
        sent.push(p)
        return { messageId: 'sent-1' }
      },
    },
  }
}

/** The sweep's Postgres: one table, the seen set read back per test. */
function statePool(rows: Array<{ seen: string[] }> = []) {
  const pool = {
    saved: null as string[] | null,
    async query(_sql: string, params: unknown[] = []) {
      if (/SELECT seen/i.test(_sql)) return { rows }
      if (/INSERT INTO mail_push_state/i.test(_sql)) {
        pool.saved = params[1] as string[]
        return { rows: [] }
      }
      return { rows: [] }
    },
  }
  return pool
}

async function host() {
  const mp = await import('../agent/mail-push')
  return mp
}

async function sweepWith(
  letters: Array<Record<string, unknown>>,
  opts: {
    seen?: string[] | null
    taps?: Record<string, string>
    compose?: (m: unknown) => Promise<string | null>
    /** Runs after the stubs are in, before the sweep: seed pending cards. */
    seed?: (mp: Awaited<ReturnType<typeof host>>) => void
  } = {}
) {
  const mp = await host()
  const box = stubMailbox(letters)
  mp.setMailboxForPushTests(box as never)
  const { deps, cards, sent } = stubDeps(opts.taps, opts.compose)
  mp.setPushDepsForTests(deps as never)
  opts.seed?.(mp)
  const pool = statePool(
    opts.seen === undefined ? [] : [{ seen: opts.seen ?? [] }]
  )
  const ctx = { telegramId: OWNER, pool } as never
  const result = (await mp.MAIL_PUSH_TOOLS[0].handler({}, ctx)) as Outcome
  return { result, cards, pool, sends: box.sends, sentDeps: sent, mp }
}

beforeEach(() => {
  vi.resetModules()
  process.env.OWNER_TELEGRAM_ID = OWNER
  process.env.ZOHO_CLIENT_ID = 'test'
  process.env.ZOHO_CLIENT_SECRET = 'test'
  process.env.ZOHO_REFRESH_TOKEN = 'test'
})

describe("the spec's tests hold against the host", () => {
  it('the first sweep announces nothing, and only unseen mail after', async () => {
    const mp = await host()
    // announces(baselined, already_seen): the spec's fn, mirrored
    expect(mp.announces(false, false)).toBe(false)
    expect(mp.announces(false, true)).toBe(false)
    expect(mp.announces(true, false)).toBe(true)
    expect(mp.announces(true, true)).toBe(false)
    expect(SPEC.FIRST_SWEEP_ANNOUNCES_NOTHING).toBe(true)

    // The debut: a full Inbox is baselined, nothing is pushed
    const first = await sweepWith([letter(1), letter(2)])
    expect(first.result).toMatchObject({ baselined: true, pushed: [] })
    expect(first.cards).toEqual([])
    expect(first.pool.saved).toEqual(['1', '2'])

    // After the baseline, unseen mail is announced
    const second = await sweepWith([letter(3), letter(2), letter(1)], {
      seen: ['1', '2'],
    })
    expect(second.result.baselined).toBe(false)
    expect(second.result.pushed).toEqual([
      { messageId: '3', subject: 'subject 3', draft: true },
    ])
  })

  it('the push carries a drafted reply, and a failed draft delays nothing', async () => {
    const mp = await host()
    expect(SPEC.DRAFT_WITH_PUSH).toBe(true)
    expect(SPEC.DRAFT_NO_TOOLS).toBe(true)
    expect(SPEC.DRAFT_FAILURE_PUSHES_ANYWAY).toBe(true)
    expect(SPEC.PREVIEW_CHARS).toBe(400)
    expect(SPEC.OLDEST_FIRST).toBe(true)
    expect(SPEC.SEEN_ON_PUSH).toBe(true)

    // A draft that fails pushes the letter anyway, and says so on the card
    const failed = await sweepWith([letter(7)], {
      seen: [],
      compose: async () => null,
    })
    expect(failed.result.pushed).toEqual([
      { messageId: '7', subject: 'subject 7', draft: false },
    ])
    expect(failed.result.drafts_failed).toBe(1)
    expect(failed.cards[0]).toContain('no draft was ready in time')

    // A drafted reply rides under the letter on the card
    const withDraft = await sweepWith([letter(8)], {
      seen: [],
      compose: async () => 'the proposed answer',
    })
    expect(withDraft.cards[0]).toContain('Proposed reply')
    expect(withDraft.cards[0]).toContain('the proposed answer')

    // The card carries the letter's preview, clipped by the spec's number
    expect(
      mp.pushCardText({
        from: 'a@b.c',
        subject: 's',
        received: null,
        body: 'x'.repeat(SPEC.PREVIEW_CHARS + 50),
        draft: 'd',
        to: 'a@b.c',
      })
    ).toContain(`(+50 chars)`)

    // Oldest first AND budgeted: the view returns newest first (as Zoho does),
    // the sweep reverses into mailbox order, and PUSH_PER_TICK cards go out
    // this tick -- the sixth carries to the next one
    const view = [
      letter(12),
      letter(11),
      letter(10),
      letter(6),
      letter(5),
      letter(4),
    ]
    const burst = await sweepWith(view, { seen: [] })
    expect(burst.result.pushed.map(p => p.messageId)).toEqual([
      '4',
      '5',
      '6',
      '10',
      '11',
    ])
    expect(burst.result.carried).toBe(1)
    expect(SPEC.PUSH_PER_TICK).toBe(5)

    // The carried letter goes out on the next tick, alone
    const next = await sweepWith(view, {
      seen: ['4', '5', '6', '10', '11'],
    })
    expect(next.result.pushed.map(p => p.messageId)).toEqual(['12'])
    expect(next.result.carried).toBe(0)
  })

  it("nothing transmits without the owner's tap", async () => {
    const mp = await host()
    expect(mp.mayTransmit('allowed')).toBe(true)
    expect(mp.mayTransmit('denied')).toBe(false)
    expect(mp.mayTransmit('expired')).toBe(false)
    expect(mp.mayTransmit('pending')).toBe(false)
    expect(SPEC.SEND_NEEDS_TAP).toBe(true)
    expect(SPEC.SEND_TOOL).toBe('mail_send')

    // A card from a previous tick settles on this one: Allow sends the
    // reply it promised, Deny delivers the letter and sends nothing, and a
    // card still pending waits for the next tick untouched.
    const base = {
      to: 's@example.com',
      subject: 'Re: subject 9',
      body: 'the drafted reply',
      replyTo: '9',
      owner: OWNER,
      at: Date.now(),
    }
    const settled = await sweepWith([letter(12)], {
      seen: [],
      taps: {
        'tap-allow': 'allowed',
        'tap-deny': 'denied',
        'tap-wait': 'pending',
      },
      seed: mp => {
        mp.pendingPushes().set('tap-allow', { ...base })
        mp.pendingPushes().set('tap-deny', { ...base, replyTo: '10' })
        mp.pendingPushes().set('tap-wait', { ...base, replyTo: '11' })
      },
    })
    // Exactly one send: the allowed one, as a reply to its own letter
    expect(settled.sentDeps).toHaveLength(1)
    expect(settled.sentDeps[0]).toMatchObject({
      to: 's@example.com',
      subject: 'Re: subject 9',
      replyTo: '9',
    })
    expect(settled.result.settled).toEqual(
      expect.arrayContaining([
        { messageId: '9', sent: true, state: 'allowed' },
        { messageId: '10', sent: false, state: 'denied' },
      ])
    )
    // A still-pending card is neither sent nor dropped
    expect(settled.mp.pendingPushes().has('tap-wait')).toBe(true)

    // The reply target: parse or refuse, never guess
    expect(mp.replyToAddress('Name <who@example.com>')).toBe('who@example.com')
    expect(mp.replyToAddress('bare@example.com')).toBe('bare@example.com')
    expect(mp.replyToAddress('not an address')).toBe(null)
    expect(mp.replySubject('hello')).toBe('Re: hello')
    expect(mp.replySubject('Re: hello')).toBe('Re: hello')
  })

  it('one writer, one target, bounded state', async () => {
    const mp = await host()
    expect(SPEC.CONCURRENCY).toBe(1)
    expect(SPEC.RETRIES).toBe(0)
    expect(SPEC.VIEW_LIMIT).toBeLessThanOrEqual(SPEC.SEEN_CAP)
    expect(SPEC.PUSH_PER_TICK).toBeGreaterThanOrEqual(1)
    expect(SPEC.PUSH_PER_TICK).toBeLessThanOrEqual(SPEC.VIEW_LIMIT)

    // capSeen: newest kept, oldest dropped, at the spec's cap
    const big = Array.from({ length: SPEC.SEEN_CAP + 100 }, (_, i) => String(i))
    expect(mp.capSeen(big)).toHaveLength(SPEC.SEEN_CAP)
    expect(mp.capSeen(big).slice(-1)).toEqual([String(SPEC.SEEN_CAP + 99)])
    expect(mp.capSeen(['1', '2'])).toEqual(['1', '2'])

    // One writer in fact, not just in the cron: a second sweep arriving while
    // slow drafts hold the first one open is told the desk is busy, and the
    // letters are pushed exactly once
    let release: (() => void) | undefined
    const gate = new Promise<void>(r => (release = r))
    const box = stubMailbox([letter(20)])
    mp.setMailboxForPushTests(box as never)
    const { deps, cards } = stubDeps({}, async () => {
      await gate
      return 'a drafted reply'
    })
    mp.setPushDepsForTests(deps as never)
    const ctx = {
      telegramId: OWNER,
      pool: statePool([{ seen: [] }]),
    } as never
    const first = mp.MAIL_PUSH_TOOLS[0].handler({}, ctx)
    const second = (await mp.MAIL_PUSH_TOOLS[0].handler({}, ctx)) as Outcome
    expect(second.busy).toBe(true)
    release!()
    const done = (await first) as Outcome
    expect(done.pushed).toHaveLength(1)
    expect(cards).toHaveLength(1)

    // The sweep reads and writes exactly the spec's table
    const pool = statePool([{ seen: ['1'] }])
    await mp.ensureStateTable(pool as never)
    const seen = big.slice(0, 3)
    await mp.saveSeen(pool as never, OWNER, seen).catch(() => undefined)
    // saveSeen goes through query; the INSERT path is what statePool records
    expect(pool.saved).toEqual(seen)
  })

  it('the desk is live, the push is not yet', async () => {
    const mp = await host()
    expect(SPEC.RUN_LIVE).toBe(false)
    expect(SPEC.TOOL).toBe('mail_push_sweep')
    expect(mp.MAIL_PUSH_TOOLS[0].name).toBe(SPEC.TOOL)
    expect(SPEC.DOOR).toBe('/mcp')
    expect(SPEC.CALLER).toBe('inngest-cron')
    expect(SPEC.CRON).toBe('*/5 * * * *')

    // Fail closed: no credentials, no sweep
    delete process.env.ZOHO_CLIENT_ID
    const ctx = { telegramId: OWNER, pool: statePool() } as never
    const out = await mp.MAIL_PUSH_TOOLS[0].handler({}, ctx)
    expect(out).toMatchObject({ configured: false })
  })
})
