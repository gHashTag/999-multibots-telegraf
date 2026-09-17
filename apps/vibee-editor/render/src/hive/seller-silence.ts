import { record, type JournalPool } from './journal'

/*
 * WHO WATCHES THE SELLER WHEN THE SELLER STOPS.
 *
 * A sweep reports its own outcome every half hour, so while it runs there is
 * nothing to worry about -- and nothing it can tell us when it does not run.
 * A watchdog inside the sweep would go down with it.
 *
 * So this lives in the render: a different service, a different process, its
 * own timer. The failure it exists for -- the bot down, the cron unregistered,
 * a deploy that broke the handler -- leaves the render running.
 */

/**
 * How long a silence has to last before it stops being a pause.
 *
 * Twelve hours is two missed heartbeats. A holding seller writes `sweep-held`
 * every six; an idle one writes `sweep-idle` on every tick; a failing one
 * writes `sweep-failed`. With those in place there is no legitimate state
 * that says nothing for half a day.
 *
 * NOT derived from the bot's backoff cap, which is twenty-four hours and
 * lives on the other side of the wire. Copying that number here would make
 * this alarm depend on a constant it cannot see change -- the heartbeat is
 * the thing that made a short, local threshold possible at all.
 */
export const SELLER_SILENCE_MS = 12 * 60 * 60_000

const SWEEP_KINDS = ['sweep-idle', 'sweep-card', 'sweep-failed', 'sweep-held']

async function newestAt(
  pool: JournalPool,
  kinds: string[]
): Promise<number | null> {
  const r = await pool.query(
    `SELECT at FROM hive_events WHERE kind = ANY($1) ORDER BY at DESC LIMIT 1`,
    [kinds]
  )
  const at = (r.rows?.[0] as { at?: unknown } | undefined)?.at
  if (!at) return null
  const ms = new Date(at as string).getTime()
  return Number.isFinite(ms) ? ms : null
}

/**
 * Write one alarm if the seller has gone quiet, and no more than one per
 * silence.
 *
 * Returns what it decided, so a caller can log it without guessing.
 *
 * NEVER swept at all -- a fresh install, an empty journal -- is not silence.
 * There is nothing to have stopped, and an alarm on the first day would teach
 * the owner to ignore this kind before it ever means anything.
 */
export async function checkSellerSilence(
  pool: JournalPool,
  now = Date.now()
): Promise<'quiet' | 'alarmed' | 'already alarmed' | 'never swept' | 'fine'> {
  let lastSweep: number | null
  let lastAlarm: number | null
  try {
    lastSweep = await newestAt(pool, SWEEP_KINDS)
    lastAlarm = await newestAt(pool, ['seller-silent'])
  } catch {
    // A watchdog that throws takes the report down with it. Unknown is not an
    // alarm, and it is not silence either.
    return 'quiet'
  }
  if (lastSweep === null) return 'never swept'
  if (now - lastSweep < SELLER_SILENCE_MS) return 'fine'
  /*
   * ONE ALARM PER SILENCE, NOT ONE PER CHECK.
   *
   * The report runs on its own timer. Without this the owner would get the
   * same sentence every few hours for as long as the seller stays down, which
   * is how an alarm becomes wallpaper.
   */
  if (lastAlarm !== null && now - lastAlarm < SELLER_SILENCE_MS) {
    return 'already alarmed'
  }
  const hours = Math.round((now - lastSweep) / 3600_000)
  await record(pool, {
    kind: 'seller-silent',
    who: null,
    what:
      `продавец не отчитывался ${hours} ч — это больше, чем молчит любая ` +
      `законная пауза. Похоже, обход не запускается: проверить крон и бота.`,
    severity: 'alarm',
  })
  return 'alarmed'
}
