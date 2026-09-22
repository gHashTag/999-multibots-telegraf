/**
 * THE BOT'S FUNNEL TABLE, WRITTEN FROM THE RENDER.
 *
 * `user_events` is the bot's funnel (src/services/trackEvent.ts in the bot):
 * start, menu, top-up, and the club's steps -- card shown, invoice created,
 * paid, abandoned. It lives in THIS Postgres: the bot reaches it through
 * TOKENS_DATABASE_URL, the same database as `user_tokens`. The bot's hourly
 * sweep reads it to mark club invoices nobody paid.
 *
 * Until the agent could mint a club invoice, every such invoice came from the
 * card's "Join" press, and the bot wrote the row. An invoice the agent hands
 * over in the chat is the same fact, so it is written as the same row -- the
 * same event name, the same columns -- or the funnel would count the card and
 * never the conversation, and the abandoned-invoice sweep would not see it.
 *
 * The table's shape is the bot's. It is created here too (IF NOT EXISTS) so a
 * render that writes first does not lose the row, and a test compares this
 * CREATE statement with the bot's so the two cannot drift.
 *
 * The bot's one rule stays: writing this is never a reason a person waits or
 * gets nothing. It never throws; callers do not await it.
 */

type Queryable = {
  query: (sql: string, params?: unknown[]) => Promise<unknown>
}

/** The events the render writes. The closed list lives in the bot. */
export type RenderFunnelEvent = 'club_invoice_created'

export const USER_EVENTS_TABLE_SQL = `CREATE TABLE IF NOT EXISTS user_events (
     id BIGSERIAL PRIMARY KEY,
     telegram_id TEXT NOT NULL,
     bot_name TEXT,
     event TEXT NOT NULL,
     detail JSONB,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now()
   )`

let tableReady = false

export function forgetUserEventsTableForTests(): void {
  tableReady = false
}

export interface FunnelRow {
  telegramId: string
  /** The farm bot the person belongs to, as the bot's rows carry it. */
  botName: string | null
  event: RenderFunnelEvent
  detail?: Record<string, unknown>
}

/** Record one step. Never throws; says whether the row landed. */
export async function trackUserEvent(
  pool: Queryable,
  row: FunnelRow
): Promise<'recorded' | 'not recorded'> {
  const id = String(row.telegramId ?? '').trim()
  if (!/^\d{5,15}$/.test(id)) return 'not recorded'
  try {
    if (!tableReady) {
      await pool.query(USER_EVENTS_TABLE_SQL)
      tableReady = true
    }
    await pool.query(
      `INSERT INTO user_events (telegram_id, bot_name, event, detail)
       VALUES ($1, $2, $3, $4)`,
      [
        id,
        row.botName || null,
        row.event,
        row.detail ? JSON.stringify(row.detail) : null,
      ]
    )
    return 'recorded'
  } catch (e) {
    // Logged, not swallowed: a funnel that went dark in silence is how the
    // bot lost two weeks of steps (trackEvent.ts).
    console.warn(
      `[funnel] ${row.event} not recorded for ${id}:`,
      String(e).slice(0, 160)
    )
    return 'not recorded'
  }
}
