/**
 * WHICH TAB OF THE PRIVATE CHAT AN EVENT FROM THE BOT LANDS IN.
 *
 * Spec of record: bot-event-tabs.t27 (gHashTag/t27#7836). Owner, 2026-10-08:
 * "every agent its own thread". A payment is the Treasurer's business, so the
 * thanks, the new balance and the club invite go to the Treasurer's tab
 * instead of the general view. The render routes the browser's requests and
 * the story reels the same way (render topic-event-tabs.ts).
 *
 * How: for the length of the handler, its `ctx.telegram` is a view that adds
 * the tab's thread to every send aimed at this chat that named no thread.
 * Telegraf's own ctx.reply writes `message_thread_id: undefined` for a message
 * outside any topic -- a successful payment is one -- so here undefined means
 * "named none"; a thread the caller did name, null included, is kept (spec
 * routes_to_tab, mirrored below). That is the one difference from the topic
 * view in threads.ts, which follows the update's own topic.
 *
 * src/spec/bot-event-tabs.test.ts runs every test of the spec against this.
 */
import * as SPEC from '@/spec/bot-event-tabs.gen'
import { THREADED_METHODS } from './threads'
import { knownTabs } from './tabs'
import { logger } from '@/utils/logger'

export type EventKey = (typeof SPEC.EVENT_KEYS)[number]

/** spec routes_to_tab: into the tab only when it exists and no thread was named. */
export const routesToTab = (tabKnown: boolean, namedThread: boolean): boolean =>
  tabKnown && !namedThread

/** The tab kind (bot-topic-tabs TAB_KEYS) an event lands in. */
export function tabOfEvent(event: EventKey): string {
  return SPEC.EVENT_TABS[SPEC.EVENT_KEYS.indexOf(event)]
}

/** The person's tab for this event in this bot, or undefined. Never throws. */
export async function eventThread(
  bot: string,
  telegramId: number,
  event: EventKey
): Promise<number | undefined> {
  if (!bot || !Number.isInteger(telegramId) || telegramId <= 0) return undefined
  try {
    const rows = await knownTabs(bot, telegramId)
    const tab = rows?.find(r => r.kind === tabOfEvent(event) && r.thread_id > 0)
    return tab?.thread_id
  } catch (e) {
    logger.debug('[event-tabs] tab not looked up; the general view', {
      error: e instanceof Error ? e.message.slice(0, 120) : String(e),
    })
    return undefined
  }
}

/** Add the tab's thread to a send aimed at this chat that named none. */
export function eventPayload(
  method: string,
  payload: any,
  chatId: number | string,
  threadId: number
): any {
  if (!payload || typeof payload !== 'object') return payload
  if (!THREADED_METHODS.has(method)) return payload
  if (String(payload.chat_id) !== String(chatId)) return payload
  if (payload.business_connection_id) return payload
  const named = payload.message_thread_id !== undefined
  return routesToTab(true, named)
    ? { ...payload, message_thread_id: threadId }
    : payload
}

/** The bot's client, seen through the event's tab. */
export function eventTelegram<T extends { callApi: Function }>(
  base: T,
  chatId: number | string,
  threadId: number
): T {
  const view = Object.create(base) as T
  ;(view as any).callApi = (method: string, payload: any, opts?: any) =>
    base.callApi(method, eventPayload(method, payload, chatId, threadId), opts)
  return view
}

/**
 * Wrap a handler so whatever it sends in a private chat lands in the event's
 * tab. Outside a private chat, without the tab, or when the lookup fails, the
 * handler runs exactly as before.
 */
export function inEventTab<C extends { [k: string]: any }>(
  event: EventKey,
  handler: (ctx: C, next?: any) => any
): (ctx: C, next?: any) => Promise<any> {
  return async (ctx: C, next?: any) => {
    const chat = ctx.chat
    const bot = String(ctx.botInfo?.username ?? '')
    if (chat?.type === 'private' && ctx.telegram) {
      const thread = await eventThread(bot, Number(chat.id), event)
      if (thread !== undefined) {
        Object.defineProperty(ctx, 'telegram', {
          value: eventTelegram(ctx.telegram, chat.id, thread),
          configurable: true,
          writable: true,
        })
      }
    }
    return handler(ctx, next)
  }
}
