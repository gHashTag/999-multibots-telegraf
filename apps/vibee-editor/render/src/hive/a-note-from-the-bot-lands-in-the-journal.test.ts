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
     */
    expect([...NOTABLE_KINDS]).toEqual([
      'sweep-idle',
      'sweep-card',
      'sweep-failed',
      'sweep-held',
      'card-pressed',
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
