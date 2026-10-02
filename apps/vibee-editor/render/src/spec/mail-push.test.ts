import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as SPEC from './mail-push.gen'

/**
 * THE MAILBOX PUSH IS WRITTEN IN t27 FIRST (skill t27-spec-first).
 *
 * gHashTag/t27 specs/automation/mail-push.t27 is the spec of record; that
 * the vendored copy, its generated module and the host agree is held by
 * scripts/check-t27-specs.mjs. Here each `test` of the spec runs against the
 * HOST: the pure decisions and the sweep of src/agent/mail-push.ts (the tools
 * mail_push_sweep and mail_push_pulse), with a stubbed mailbox, stubbed cards
 * and a stubbed composer -- no Zoho, no Telegram, no provider is touched.
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
  /** v2: manual replies the Sent watch caught and recorded this tick. */
  sent_watched: number
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

/** One item in the stubbed Sent folder -- ids are Zoho sent ids, not ours. */
function sentItem(id: string, subject: string, to = 'hr@counter.example') {
  return {
    messageId: id,
    folderId: 'f-sent',
    fromAddress: 'admin@t27.ai',
    toAddress: to,
    subject,
    receivedTime: Date.now(),
  }
}

/**
 * The mailbox as the sweep sees it: folders, one view per folder, letter
 * bodies, sends. With `sentLetters` the Sent folder exists too and the view
 * dispatches by folderId -- otherwise the Sent watch finds no folder, exactly
 * like a mailbox where it is hidden.
 */
function stubMailbox(
  letters: Array<Record<string, unknown>>,
  sentLetters: Array<Record<string, unknown>> | null = null
) {
  const sends: Array<Record<string, unknown>> = []
  return {
    sends,
    whoAccount: async () => ({ id: 'acct', email: 'admin@t27.ai' }),
    api: async (path: string, query?: Record<string, unknown>) => {
      if (path.endsWith('/folders')) {
        return {
          data: [
            { folderId: 'f-inbox', folderType: 'Inbox' },
            ...(sentLetters
              ? [{ folderId: 'f-sent', folderType: 'Sent' }]
              : []),
          ],
        }
      }
      if (path.endsWith('/messages/view')) {
        if (query?.folderId === 'f-sent') return { data: sentLetters ?? [] }
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

/**
 * Cards out, taps back, sends recorded, settles written back -- the whole
 * owner side, stubbed. v2: `record` collects every outcome row and
 * `recordFeedback` every manual reply the Sent watch catches, so the tests
 * can hold the write-back law, not just trust it.
 */
function stubDeps(
  taps: Record<string, string> = {},
  compose: (m: unknown) => Promise<string | null> = async () =>
    'a drafted reply'
) {
  const cards: string[] = []
  const sent: Array<Record<string, unknown>> = []
  const recorded: Array<Record<string, unknown>> = []
  const feedback: Array<Record<string, unknown>> = []
  const composed: Array<{ subject: unknown; history: unknown }> = []
  let n = 0
  return {
    cards,
    sent,
    recorded,
    feedback,
    composed,
    deps: {
      ask: async (_ctx: unknown, what: string) => {
        cards.push(what)
        return `card-${++n}`
      },
      answer: async (_ctx: unknown, id: string) =>
        taps[id] ? { state: taps[id], telegramId: OWNER } : null,
      compose: async (m: { subject: unknown; history?: unknown }) => {
        composed.push({ subject: m.subject, history: m.history })
        return compose(m)
      },
      send: async (p: Record<string, unknown>) => {
        sent.push(p)
        return { messageId: 'sent-1' }
      },
      record: async (_ctx: unknown, o: Record<string, unknown>) => {
        recorded.push(o)
      },
      recordFeedback: async (_ctx: unknown, f: Record<string, unknown>) => {
        feedback.push(f)
      },
    },
  }
}

/**
 * The sweep's Postgres: the cursor read back per test, the digest and the
 * offered-draft lookup answered from fixtures. Nothing ours is ever in the
 * outcomes table here -- `knownOursId` must say no, so the only thing that
 * can mark a Sent id ours in these tests is the send itself.
 */
function statePool(
  rows: Array<{ seen: string[]; sent?: string[] | null }> = [],
  extra: {
    digest?: Array<Record<string, unknown>>
    outcomeDrafts?: Array<{ thread: string; draft: string; at: string }>
  } = {}
) {
  const pool = {
    saved: null as string[] | null,
    savedSent: null as string[] | null,
    async query(_sql: string, params: unknown[] = []) {
      if (/FROM crm_matter_digest/i.test(_sql))
        return { rows: extra.digest ?? [] }
      if (/sent_id = \$1/i.test(_sql)) return { rows: [] }
      if (/draft IS NOT NULL/i.test(_sql)) {
        const thread = String(params[0] ?? '')
        return {
          rows: (extra.outcomeDrafts ?? []).filter(o => o.thread === thread),
        }
      }
      if (/SELECT seen/i.test(_sql)) return { rows }
      if (/SELECT sent/i.test(_sql)) return { rows }
      if (/INSERT INTO mail_push_state/i.test(_sql)) {
        pool.saved = params[1] as string[]
        if (params[2]) pool.savedSent = params[2] as string[]
        return { rows: [] }
      }
      return { rows: [] }
    },
  }
  return pool
}

/** The pulse's one query, answered with one cursor row (or none). */
function pulsePool(updatedAt: string | null) {
  return {
    async query(sql: string) {
      if (/SELECT seen, sent, updated_at/i.test(sql)) {
        return updatedAt
          ? {
              rows: [{ seen: ['1'], sent: ['s1'], updated_at: updatedAt }],
            }
          : { rows: [] }
      }
      return { rows: [] }
    },
  }
}

async function host() {
  const mp = await import('../agent/mail-push')
  return mp
}

async function sweepWith(
  letters: Array<Record<string, unknown>>,
  opts: {
    seen?: string[] | null
    /** The Sent cursor's baseline: what the watch already knows. */
    sentSeen?: string[]
    taps?: Record<string, string>
    compose?: (m: unknown) => Promise<string | null>
    /** Sent-folder contents; null = the mailbox exposes no Sent folder. */
    sentLetters?: Array<Record<string, unknown>> | null
    digest?: Array<Record<string, unknown>>
    outcomeDrafts?: Array<{ thread: string; draft: string; at: string }>
    /** Runs after the stubs are in, before the sweep: seed pending cards. */
    seed?: (mp: Awaited<ReturnType<typeof host>>) => void
  } = {}
) {
  const mp = await host()
  const box = stubMailbox(letters, opts.sentLetters ?? null)
  mp.setMailboxForPushTests(box as never)
  const { deps, cards, sent, recorded, feedback, composed } = stubDeps(
    opts.taps,
    opts.compose
  )
  mp.setPushDepsForTests(deps as never)
  opts.seed?.(mp)
  const pool = statePool(
    opts.seen === undefined
      ? []
      : [{ seen: opts.seen ?? [], sent: opts.sentSeen ?? null }],
    { digest: opts.digest, outcomeDrafts: opts.outcomeDrafts }
  )
  const ctx = { telegramId: OWNER, pool } as never
  const result = (await mp.MAIL_PUSH_TOOLS[0].handler({}, ctx)) as Outcome
  return {
    result,
    cards,
    pool,
    sends: box.sends,
    sentDeps: sent,
    recorded,
    feedback,
    composed,
    mp,
  }
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

  it('a stale digest is refused, not shown', async () => {
    const mp = await host()
    expect(mp.digestFresh(0)).toBe(true)
    expect(mp.digestFresh(26)).toBe(true)
    expect(mp.digestFresh(27)).toBe(false)
    expect(SPEC.DIGEST_STALE_H).toBe(26)
    expect(SPEC.HISTORY_MESSAGES).toBeGreaterThanOrEqual(1)
    expect(SPEC.HISTORY_CHARS).toBeLessThanOrEqual(200)
    expect(SPEC.DIGEST_TABLE).toBe('crm_matter_digest')

    // jcrm's export, fresh and stale: same matter, one exported now, one 27 h ago
    const digest = (exportedAt: string) => ({
      matter: 'm-labs',
      stage: 'interview',
      owes_reply: 'us',
      days_since: 3,
      next_action: 'send the reminder',
      counterparties: ['hr@mlabs.example'],
      channels: ['mail', 'hh'],
      history: Array.from({ length: 8 }, (_, i) => ({
        at: '2026-09-28',
        dir: i % 2 ? 'out' : 'in',
        subject: `thread line ${i}`,
        summary: 'x'.repeat(260),
      })),
      exported_at: exportedAt,
    })
    const now = new Date().toISOString()
    const stale = new Date(Date.now() - 27 * 3_600_000).toISOString()

    // matterBlock refuses the stale digest outright: no CRM line, ever
    expect(mp.matterBlock(digest(now))).toContain('CRM: m-labs')
    expect(mp.matterBlock(digest(stale))).toBe(null)

    // A fresh digest rides on the card and feeds the composer -- clipped to
    // the spec's six lines and 200 chars each
    const fresh = await sweepWith([letter(31, 'HR <hr@mlabs.example>')], {
      seen: [],
      digest: [digest(now)],
    })
    expect(fresh.cards[0]).toContain(
      'CRM: m-labs — stage interview, WE owe the reply (3d since the last word)'
    )
    expect(fresh.cards[0]).toContain('channels: mail, hh')
    expect(fresh.composed[0].history).toBeTruthy()
    const lines = String(fresh.composed[0].history).split('\n')
    expect(lines).toHaveLength(SPEC.HISTORY_MESSAGES)
    for (const l of lines)
      expect(l.length).toBeLessThanOrEqual(SPEC.HISTORY_CHARS + 1)

    // The stale one is refused on both roads: no card line, no history
    const cold = await sweepWith([letter(32, 'HR <hr@mlabs.example>')], {
      seen: [],
      digest: [digest(stale)],
    })
    expect(cold.cards[0]).not.toContain('CRM:')
    expect(cold.composed[0].history).toBe(null)
  })

  it("the Sent folder separates our tap-sends from the owner's manual replies", async () => {
    const mp = await host()
    expect(SPEC.SENT_WATCH).toBe(true)
    expect(mp.sentIsNews(true, false)).toBe(false)
    expect(mp.sentIsNews(false, true)).toBe(false)
    expect(mp.sentIsNews(false, false)).toBe(true)
    expect(SPEC.SENT_LIMIT).toBeLessThanOrEqual(SPEC.SEEN_CAP)
    expect(SPEC.IDENTITY).toBe('enumeration message_id')

    // One tick, three Sent items: 'sent-1' is OURS (the send below returns
    // that id and the process remembers it), 'sent-2' was typed by hand in
    // the webmail, 'sent-3' the cursor already knows. Only the manual reply
    // is evidence; our own send must not come back as a "manual" reply.
    const base = {
      to: 's@example.com',
      subject: 'Re: subject 9',
      body: 'the drafted reply',
      owner: OWNER,
      at: Date.now(),
    }
    const run = await sweepWith([letter(30)], {
      seen: [],
      taps: { 'tap-allow': 'allowed' },
      sentLetters: [
        sentItem('sent-1', 'Re: subject 9'),
        sentItem('sent-2', 'Re: subject 9'),
        sentItem('sent-3', 'Re: an old matter'),
      ],
      sentSeen: ['sent-3'],
      seed: mp => {
        mp.pendingPushes().set('tap-allow', { ...base, replyTo: '25' })
      },
    })
    expect(run.result.settled).toContainEqual({
      messageId: '25',
      sent: true,
      state: 'allowed',
    })
    expect(run.result.sent_watched).toBe(1)
    expect(run.feedback).toHaveLength(1)
    expect(run.feedback[0]).toMatchObject({
      letter_subject: 'Re: subject 9',
      offered_draft: null,
    })
    expect(String(run.feedback[0].actual_text)).toContain('the letter body')
    // The cursor learned all three: nothing is re-examined next tick
    expect([...(run.pool.savedSent ?? [])].sort()).toEqual([
      'sent-1',
      'sent-2',
      'sent-3',
    ])
  })

  it('every outcome is written back: allowed sends, denials and expiries', async () => {
    const mp = await host()
    expect(SPEC.OUTCOMES_TABLE).toBe('mail_push_outcomes')
    expect(mp.mayTransmit('allowed')).toBe(true)
    expect(mp.mayTransmit('denied')).toBe(false)

    // Three cards settle in one tick -- Allow, Deny, and one whose TTL ran
    // out between ticks. Three outcome rows leave with it, the Allow's
    // carrying the id of the copy now sitting in Sent.
    const base = {
      to: 's@example.com',
      subject: 'Re: subject 9',
      body: 'the drafted reply',
      owner: OWNER,
      at: Date.now(),
    }
    const run = await sweepWith([letter(13)], {
      seen: [],
      taps: { 'tap-allow': 'allowed', 'tap-deny': 'denied' },
      seed: mp => {
        mp.pendingPushes().set('tap-allow', { ...base, replyTo: '9' })
        mp.pendingPushes().set('tap-deny', { ...base, replyTo: '10' })
        mp.pendingPushes().set('tap-old', {
          ...base,
          replyTo: '11',
          at: Date.now() - 11 * 60 * 1000,
        })
      },
    })
    expect(run.recorded).toHaveLength(3)
    expect(run.recorded).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message_id: '9',
          thread: 'subject 9',
          state: 'allowed',
          sent: true,
          sent_id: 'sent-1',
        }),
        expect.objectContaining({
          message_id: '10',
          state: 'denied',
          sent: false,
          sent_id: null,
        }),
        expect.objectContaining({
          message_id: '11',
          state: 'expired',
          sent: false,
          sent_id: null,
        }),
      ])
    )
  })

  it('a manual reply is paired with the draft that was offered', async () => {
    const mp = await host()
    expect(mp.pairsManualReply(true, 0)).toBe(true)
    expect(mp.pairsManualReply(true, 48)).toBe(true)
    expect(mp.pairsManualReply(true, 49)).toBe(false)
    expect(mp.pairsManualReply(false, 0)).toBe(false)
    expect(SPEC.FEEDBACK_TABLE).toBe('mail_push_feedback')
    expect(SPEC.FEEDBACK_PAIR_H).toBe(48)

    // Same thread, card still warm: the feedback row carries the draft this
    // desk offered for that matter
    const warm = await sweepWith([letter(14)], {
      seen: [],
      sentLetters: [sentItem('sent-7', 'Re: subject 9')],
      sentSeen: [],
      outcomeDrafts: [
        {
          thread: 'subject 9',
          draft: 'the offered draft',
          at: new Date().toISOString(),
        },
      ],
    })
    expect(warm.feedback).toHaveLength(1)
    expect(warm.feedback[0]).toMatchObject({
      offered_draft: 'the offered draft',
    })

    // Card gone cold (49 h): the reply is still recorded as evidence, but no
    // pair is forced -- a draft from last week proves nothing about today's
    const cold = await sweepWith([letter(15)], {
      seen: [],
      sentLetters: [sentItem('sent-8', 'Re: subject 9')],
      sentSeen: [],
      outcomeDrafts: [
        {
          thread: 'subject 9',
          draft: 'the offered draft',
          at: new Date(Date.now() - 49 * 3_600_000).toISOString(),
        },
      ],
    })
    expect(cold.feedback).toHaveLength(1)
    expect(cold.feedback[0].offered_draft).toBe(null)

    // And a draft of ANOTHER matter never pairs, however warm
    const other = await sweepWith([letter(16)], {
      seen: [],
      sentLetters: [sentItem('sent-9', 'Re: subject 9')],
      sentSeen: [],
      outcomeDrafts: [
        {
          thread: 'a different matter',
          draft: 'the offered draft',
          at: new Date().toISOString(),
        },
      ],
    })
    expect(other.feedback).toHaveLength(1)
    expect(other.feedback[0].offered_draft).toBe(null)
  })

  it('the heartbeat alarms when the sweep goes quiet', async () => {
    const mp = await host()
    expect(mp.pulseFresh(0)).toBe(true)
    expect(mp.pulseFresh(30)).toBe(true)
    expect(mp.pulseFresh(31)).toBe(false)
    expect(SPEC.PULSE_TOOL).toBe('mail_push_pulse')
    expect(SPEC.PULSE_CRON).toBe('17 9 * * *')
    expect(SPEC.PULSE_STALE_MIN).toBe(30)

    const pulse = mp.MAIL_PUSH_TOOLS.find(t => t.name === SPEC.PULSE_TOOL)
    expect(pulse).toBeTruthy()
    const at = (updatedAt: string | null) =>
      ({ telegramId: OWNER, pool: pulsePool(updatedAt) }) as never

    // The cursor moved this tick: fresh
    const live = (await pulse!.handler(
      {},
      at(new Date().toISOString())
    )) as Record<string, unknown>
    expect(live).toMatchObject({ baselined: true, fresh: true, age_min: 0 })

    // Six missed ticks and more: the pulse is stale -- this is what the
    // daily cron throws on, so its failure handler alarms
    const stale = (await pulse!.handler(
      {},
      at(new Date(Date.now() - 40 * 60_000).toISOString())
    )) as { fresh: boolean; age_min: number }
    expect(stale.fresh).toBe(false)
    expect(stale.age_min).toBeGreaterThanOrEqual(31)

    // No cursor row at all: not fresh either -- silence is not health
    const none = (await pulse!.handler({}, at(null))) as Record<string, unknown>
    expect(none).toMatchObject({ baselined: false, fresh: false })
  })

  it("the digest lands through the render's own door, not a second database", async () => {
    const mp = await host()
    expect(SPEC.DIGEST_DOOR).toBe('mail_push_digest')
    // The export door is not the sweep door, and one table has one home
    expect(SPEC.DIGEST_DOOR).not.toBe(SPEC.TOOL)
    expect(SPEC.DIGEST_TABLE).toBe('crm_matter_digest')

    const door = mp.MAIL_PUSH_TOOLS.find(t => t.name === SPEC.DIGEST_DOOR)
    expect(door).toBeTruthy()

    const writes: Array<{ sql: string; params: unknown[] }> = []
    const pool = {
      query: async (sql: string, params: unknown[]) => {
        writes.push({ sql, params })
        return { rows: [] }
      },
    }
    const out = (await door!.handler(
      {
        rows: [
          {
            matter: 'Playerok',
            stage: 'interview',
            owes_reply: null,
            days_since: 3,
            next_action: 'fill the questionnaire',
            counterparties: ['hr@playerok.example'],
            channels: ['mail', 'hh'],
            history: [
              {
                at: '2026-09-28',
                dir: 'in',
                subject: 'анкета',
                summary: 'прислали форму',
              },
            ],
          },
          { stage: 'x' }, // refused: no matter to key the row on
          { matter: 'Efinix', counterparties: 7 }, // coerced, not rejected
        ],
      },
      { telegramId: OWNER, pool } as never
    )) as Record<string, unknown>

    expect(out.accepted).toBe(2)
    expect(out.matters).toEqual(['Playerok', 'Efinix'])
    expect(out.refused).toEqual([
      { matter: '(absent)', why: 'matter must be a non-empty string' },
    ])

    const insert = writes.find(w =>
      /INSERT INTO crm_matter_digest/.test(w.sql)
    )!
    expect(insert).toBeTruthy()
    // Freshness is the receiver's clock, never the exporter's
    expect(insert.sql).toContain('now()')
    expect(insert.sql).toContain('ON CONFLICT (matter)')
    // jsonb carries an explicit cast -- an untyped parameter is how the sent
    // column taught us a sweep dies
    expect(insert.sql).toContain('$8::jsonb')
    expect(insert.params[5]).toEqual(['hr@playerok.example'])
    expect(String(insert.params[7])).toContain('анкета')
    // A wrong type is coerced, not thrown: the door stays open for the rest
    const efinix = writes
      .filter(w => /INSERT INTO crm_matter_digest/.test(w.sql))
      .map(w => w.params)
    expect(efinix[1][5]).toEqual([])
  })

  it('the ledger reads back through the same door, select only', async () => {
    const mp = await host()
    const tool = mp.MAIL_PUSH_TOOLS.find(t => t.name === SPEC.LEDGER_TOOL)
    expect(tool).toBeTruthy()
    expect(SPEC.LEDGER_TOOL).not.toBe(SPEC.TOOL)
    expect(SPEC.LEDGER_TOOL).not.toBe(SPEC.DIGEST_DOOR)

    const writes: Array<{ sql: string; params: unknown[] }> = []
    const pool = {
      query: async (sql: string, params: unknown[]) => {
        writes.push({ sql, params })
        if (/FROM crm_matter_digest/.test(sql))
          return {
            rows: [
              {
                matter: 'Playerok',
                stage: 'interview',
                exported_at: new Date().toISOString(),
              },
            ],
          }
        return { rows: [] }
      },
    }
    const out = (await tool!.handler({ what: 'digest' }, {
      telegramId: OWNER,
      pool,
    } as never)) as Record<string, unknown>
    expect(out.count).toBe(1)
    // ensureStateTable runs first (CREATE TABLE IF NOT EXISTS); the read
    // itself must still be a SELECT
    const q = writes.find(w => /FROM crm_matter_digest/.test(w.sql))!
    expect(q.sql.trimStart()).toMatch(/^SELECT/)
    expect(q.sql).not.toMatch(/INSERT|UPDATE|DELETE/)
    expect(q.sql).toContain('LIMIT 100')

    // outcomes with a since window -> parameterised, floor 1h
    writes.length = 0
    const outcomes = (await tool!.handler(
      { what: 'outcomes', since_hours: 48 },
      { telegramId: OWNER, pool } as never
    )) as Record<string, unknown>
    expect(outcomes.count).toBe(0)
    const oq = writes.find(w => /FROM mail_push_outcomes/.test(w.sql))!
    expect(oq.sql).toContain(SPEC.OUTCOMES_TABLE)
    expect(oq.params).toEqual([48])
    expect(oq.sql).toContain('$1::int')

    // a table nobody knows answers empty, not 500
    const unknown = (await tool!.handler({ what: 'nope' }, {
      telegramId: OWNER,
      pool,
    } as never)) as Record<string, unknown>
    expect(unknown.rows).toEqual([])
    expect(unknown.note).toBe('unknown table')
  })
})
