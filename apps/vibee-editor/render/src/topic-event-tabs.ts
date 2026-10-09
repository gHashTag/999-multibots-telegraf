/**
 * WHICH TAB OF THE PRIVATE CHAT AN EVENT FROM THE RENDER LANDS IN.
 *
 * Spec of record: bot-event-tabs.t27 (gHashTag/t27#7836). Owner, 2026-10-08:
 * "every agent its own thread". A browser request (a field to fill, a
 * permission to give) goes to the Navigator's tab, a finished story reel to
 * the Director's -- not to the general view, where it read as one more
 * message among the conversation.
 *
 * The tab is the person's row in bot_topic_tabs (the bot's table, the same
 * Postgres; topic-tabs-engine.ts), looked up by the bot the message is sent
 * through. No row -- no tabs, another bot, no database -- and the message goes
 * where it went before: the spec's routes_to_tab, mirrored below, with the
 * named thread always false here because no render sender names one.
 *
 * src/spec/bot-event-tabs.test.ts runs every test of the spec against this.
 */
import * as SPEC from './spec/bot-event-tabs.gen'
import { botOfToken } from './app-links'

export type EventKey = (typeof SPEC.EVENT_KEYS)[number]

/** spec routes_to_tab: into the tab only when it exists and no thread was named. */
export const routesToTab = (tabKnown: boolean, namedThread: boolean): boolean =>
  tabKnown && !namedThread

/** The tab kind (bot-topic-tabs TAB_KEYS) an event lands in. */
export function tabOfEvent(event: EventKey): string {
  return SPEC.EVENT_TABS[SPEC.EVENT_KEYS.indexOf(event)]
}

interface Queryable {
  query(sql: string, params?: unknown[]): Promise<{ rows?: any[] }>
}

let poolOf: (() => Queryable | Promise<Queryable>) | null = null

/** Wired once at startup (render-server.ts); unwired, nothing is routed. */
export function configureEventTabs(
  getPool: (() => Queryable | Promise<Queryable>) | null
): void {
  poolOf = getPool
}

/*
 * The bot stores its username as getMe returns it; the farm's names are
 * lowercased (bot-farm.ts normaliseBotName). Compared without case.
 */
export const EVENT_TAB_SQL = `SELECT thread_id FROM bot_topic_tabs
  WHERE lower(bot_username) = lower($1) AND telegram_id = $2 AND kind = $3
    AND thread_id > 0
  ORDER BY created_at DESC LIMIT 1`

/**
 * The thread of the person's tab for this event in this bot, or undefined.
 * Never throws: a lookup that fails sends the message where it went before.
 */
export async function eventThread(
  bot: string | null | undefined,
  telegramId: string | number,
  event: EventKey
): Promise<number | undefined> {
  const id = Number(telegramId)
  if (!poolOf || !bot || !Number.isInteger(id) || id <= 0) return undefined
  try {
    const pool = await poolOf()
    const r = await pool.query(EVENT_TAB_SQL, [bot, id, tabOfEvent(event)])
    const thread = Number(r.rows?.[0]?.thread_id)
    const known = Number.isInteger(thread) && thread > 0
    return routesToTab(known, false) ? thread : undefined
  } catch {
    return undefined
  }
}

/** The same, for a message sent through a token rather than a named bot. */
export async function eventThreadForToken(
  token: string,
  telegramId: string | number,
  event: EventKey,
  who: typeof botOfToken = botOfToken
): Promise<number | undefined> {
  if (!poolOf) return undefined
  const bot = await who(token).catch(() => null)
  return eventThread(bot?.username, telegramId, event)
}
