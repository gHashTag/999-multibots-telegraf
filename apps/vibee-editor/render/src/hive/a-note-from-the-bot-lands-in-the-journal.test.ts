import { describe, expect, it } from 'vitest'
import { handleHiveNote, isHiveNotePath, NOTABLE_KINDS } from './note-route'

/** The seller's sweep writes into the hive over the server key, and only so. */
function journalPool() {
  const events: Array<Record<string, unknown>> = []
  return {
    events,
    query: async (sql: string, params: unknown[] = []) => {
      if (/^INSERT INTO hive_events/i.test(sql)) {
        events.push({
          kind: params[0],
          who: params[1],
          bot: params[2],
          amount: params[3],
          what: params[4],
          severity: params[5],
          lead: params[6],
        })
      }
      return { rows: [] }
    },
  }
}
const deps = (pool: ReturnType<typeof journalPool>, server = true) => ({
  getPool: async () => pool,
  isServer: () => server,
  readBody: async (r: any) => r.body ?? '',
})
const post = (body: unknown) => ({
  method: 'POST',
  body: typeof body === 'string' ? body : JSON.stringify(body),
})

describe('a note from the bot lands in the journal', () => {
  it('knows its path and its vocabulary', () => {
    expect(isHiveNotePath('/api/hive/note')).toBe(true)
    expect(isHiveNotePath('/api/hive/notes')).toBe(false)
    /*
     * The list is pinned, not counted: widening it is a deliberate act and
     * this line is what makes it one. `card-pressed` was added on 2026-09-16
     * because the owner's press -- the act the whole design's throughput
     * reduces to -- was recorded nowhere at all: the `written` touch needs a
     * lead on the draft, a successful press has no log line, and the journal
     * had no kind for it.
     *
     * `sweep-held` was added on 2026-09-17 for the opposite reason: a hold
     * wrote NOTHING, on purpose, so a seller holding a card and a seller
     * whose cron had died were the same silence. Production went four hours
     * and thirteen minutes without a line that day and nothing in the journal
     * could say which it was. The bot rate-limits it to one per six hours.
     *
     * `payment-unclaimed` was added on 2026-09-19, and the reason is the same
     * shape one layer out: the TON channel completes a payment when the PAYER
     * presses "check payment", and nothing else ever looks at the chain. Coins
     * can sit against a PENDING row with no watcher -- which is exactly how
     * five people came to be owed 822 stars on the other channel, found only
     * because somebody ran a reconcile by hand. The bot's hourly watch writes
     * this kind and NEVER credits: the render cannot see the chain, the bot
     * cannot see this journal without the door, and who is made whole is the
     * owner's decision.
     */
    expect([...NOTABLE_KINDS]).toEqual([
      'sweep-idle',
      'sweep-card',
      'sweep-failed',
      'sweep-held',
      'card-pressed',
      /*
       * Added 2026-09-24, and this is the entry the list exists for: the bot
       * had been posting this kind since AUTO shipped and the door did not
       * know the word. Every automatic send was refused with 400 and written
       * nowhere, so "how much went out without you" read zero however well
       * the autopilot worked. A pinned list only catches that if something
       * compares it to what the bot can actually say -- see
       * every-kind-the-bot-can-post.test.ts, written the same hour.
       */
      'card-auto-sent',
      'payment-unclaimed',
      // Added the next day, for the flaw the pair above shipped with: a watch
      // that only speaks when money is owed is indistinguishable from one that
      // has stopped. One line per channel per twenty hours makes a gap mean
      // something.
      'watch-quiet',
      /*
       * Added 2026-09-20, on the owner's word that every bot error must reach
       * the board with the highest priority. Before it, an error went to a
       * Railway log nobody reads and -- if it survived the alert throttle --
       * to a push. Neither is a record, so "what has been breaking this week"
       * had no answer anywhere. Rolled up by the bot into one line per ten
       * minutes, because one note per error turns an outage into a wall that
       * buries the unrelated failure that mattered.
       */
      'bot-errors',
      /*
       * And the fault report that no log can hold: a person writing that
       * something is broken, or asking and being left. From the code's side
       * nothing failed at all, so nothing was ever written -- the message sat
       * in crm_messages waiting for somebody to scroll far enough.
       */
      'client-unanswered',
    ])
  })

  it('writes an allow-listed kind with who, what and severity', async () => {
    const pool = journalPool()
    const out = await handleHiveNote(
      post({
        kind: 'sweep-failed',
        who: '144022504',
        what: 'ждёт Tim: [[Подпись|tg_send]]',
        severity: 'attention',
      }),
      deps(pool)
    )
    expect(out).toEqual({ status: 200, body: { ok: true, recorded: true } })
    expect(pool.events[0]).toMatchObject({
      kind: 'sweep-failed',
      who: '144022504',
      severity: 'attention',
    })
    expect(String(pool.events[0].what)).toContain('tg_send')
  })

  it('an unknown severity becomes normal; a long note is cut by the journal itself (200)', async () => {
    const pool = journalPool()
    await handleHiveNote(
      post({ kind: 'sweep-idle', what: 'x'.repeat(500), severity: 'loud' }),
      deps(pool)
    )
    expect(pool.events[0]).toMatchObject({ severity: 'normal' })
    expect(String(pool.events[0].what).length).toBe(200)
  })

  it('refuses a Mini App caller, an unknown kind, bad json and GET', async () => {
    const pool = journalPool()
    expect(
      (await handleHiveNote(post({ kind: 'sweep-idle' }), deps(pool, false)))
        .status
    ).toBe(403)
    expect(
      (await handleHiveNote(post({ kind: 'payment' }), deps(pool))).status
    ).toBe(400)
    expect((await handleHiveNote(post('{nope'), deps(pool))).status).toBe(400)
    expect((await handleHiveNote({ method: 'GET' }, deps(pool))).status).toBe(
      405
    )
    expect(pool.events).toHaveLength(0)
  })
})

/*
 * THE CLIENT AN ACT WAS ABOUT -- an id, and nothing else about them.
 */
describe('a note can name the client it was about', () => {
  it('writes the id, and null when there is none', async () => {
    const pool = journalPool()
    await handleHiveNote(
      post({
        kind: 'card-auto-sent',
        who: '900000091',
        lead: '900000501',
        what: 'ушло на автопилоте',
      }),
      deps(pool)
    )
    await handleHiveNote(
      post({ kind: 'sweep-idle', who: '900000091', what: 'никого' }),
      deps(pool)
    )
    expect(pool.events[0]).toMatchObject({
      kind: 'card-auto-sent',
      lead: '900000501',
    })
    expect(pool.events[1].lead).toBeNull()
  })

  it('takes an id-sized field only, so no message text can ride in it', async () => {
    const pool = journalPool()
    await handleHiveNote(
      post({ kind: 'card-pressed', who: '900000091', lead: 'x'.repeat(400) }),
      deps(pool)
    )
    expect(String(pool.events[0].lead)).toHaveLength(64)
  })
})
