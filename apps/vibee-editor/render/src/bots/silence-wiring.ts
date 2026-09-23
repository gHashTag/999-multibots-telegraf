import { watchOnce, type Alarm, type WatchState } from './silence-watch'

/**
 * THE TICK, WIRED TO THE REAL WORLD.
 *
 * silence-watch.ts decides; this fetches, remembers and delivers. The split is
 * the reason the decision has nine tests and this file has none it cannot
 * afford: everything here is a query, a token lookup or a sendMessage.
 *
 * WHO IS TOLD. The person the bot belongs to, in their private chat with the
 * bot the platform speaks through. Not the bot that is down -- it is down.
 *
 * COST. One getMe per owned bot per tick, and the tick is slow on purpose:
 * this is a watchman, not a monitor, and a bot that fell a minute ago is not
 * worse news than one that fell ten minutes ago.
 */

type Pool = {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }>
}

let tableReady = false

async function ensureTable(pool: Pool): Promise<void> {
  if (tableReady) return
  await pool.query(
    `CREATE TABLE IF NOT EXISTS bot_silence (
       owner_id text NOT NULL,
       bot      text NOT NULL,
       misses   integer NOT NULL DEFAULT 0,
       alarmed  boolean NOT NULL DEFAULT false,
       since    timestamptz,
       seen_at  timestamptz NOT NULL DEFAULT now(),
       PRIMARY KEY (owner_id, bot)
     )`
  )
  tableReady = true
}

/** For tests: the next call creates the table again. */
export function forgetSilenceTableForTests(): void {
  tableReady = false
}

/**
 * Everybody who owns a bot, from the same table the club and the bot screen
 * read (`avatars`). One request, not one per owner: a farm of a hundred bots
 * must not cost a hundred round trips every tick.
 */
async function ownersFromAvatars(): Promise<
  Array<{ ownerId: string; bots: string[] }>
> {
  const url = (process.env.SUPABASE_URL || '').replace(/\/+$/, '')
  const key = process.env.SUPABASE_SERVICE_KEY || ''
  if (!url || !key) return []
  const res = await fetch(
    `${url}/rest/v1/avatars?select=telegram_id,bot_name`,
    { headers: { apikey: key, Authorization: `Bearer ${key}` } }
  )
  if (!res.ok) throw new Error(`avatars replied ${res.status}`)
  const rows = (await res.json()) as Array<{
    telegram_id: number | string | null
    bot_name: string | null
  }>
  const byOwner = new Map<string, string[]>()
  for (const r of rows) {
    const owner = String(r.telegram_id ?? '').trim()
    const bot = String(r.bot_name ?? '').trim()
    if (!owner || !bot) continue
    byOwner.set(owner, [...(byOwner.get(owner) ?? []), bot])
  }
  return [...byOwner.entries()].map(([ownerId, bots]) => ({ ownerId, bots }))
}

/**
 * One round of the watch. Returns what it said, so the log can carry it and
 * a caller can decide to say nothing twice.
 */
export async function runSilenceWatch(
  pool: Pool,
  deliver: (ownerId: string, text: string) => Promise<void>
): Promise<Alarm[]> {
  await ensureTable(pool)
  const alarms = await watchOnce({
    owners: ownersFromAvatars,
    tokenForBot: async (name: string) => {
      const { tokenForBot } = await import('../agent/bot-farm')
      return (await tokenForBot(name))?.token ?? null
    },
    readState: async (ownerId, bot) => {
      const r = await pool.query(
        `SELECT misses, alarmed, since::text FROM bot_silence
          WHERE owner_id = $1 AND bot = $2`,
        [ownerId, bot]
      )
      const row = r.rows?.[0]
      if (!row) return null
      return {
        misses: Number(row.misses) || 0,
        alarmed: Boolean(row.alarmed),
        since: row.since ?? null,
      } as WatchState
    },
    writeState: async (ownerId, bot, s) => {
      await pool.query(
        `INSERT INTO bot_silence (owner_id, bot, misses, alarmed, since, seen_at)
         VALUES ($1,$2,$3,$4,$5, now())
         ON CONFLICT (owner_id, bot) DO UPDATE
           SET misses = EXCLUDED.misses,
               alarmed = EXCLUDED.alarmed,
               since = EXCLUDED.since,
               seen_at = now()`,
        [ownerId, bot, s.misses, s.alarmed, s.since]
      )
    },
  })

  for (const alarm of alarms) {
    try {
      await deliver(alarm.ownerId, alarm.text)
    } catch (e) {
      // A watchman who cannot reach one person still watches everybody else.
      console.error(
        `[bot-silence] could not tell ${alarm.ownerId}:`,
        String(e).slice(0, 200)
      )
    }
  }
  return alarms
}
