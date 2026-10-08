/**
 * TABS IN THE PRIVATE CHAT: AN ANSWER GOES TO THE TAB IT WAS ASKED IN.
 *
 * Bot API 9.3 (2025-12-31) brought forum topics to private chats with a bot
 * (`User.has_topics_enabled`, `message_thread_id` / `is_topic_message` on
 * private messages and on every send method); 9.4 (2026-02-09) let the bot
 * itself call `createForumTopic` there and added
 * `User.allows_users_to_create_topics`. Telegram shows the topics as a left
 * column of tabs; a message written outside any topic opens a "New Thread".
 *
 * THE BUG THIS FILE EXISTS FOR: an answer sent without `message_thread_id`
 * lands in the general view, not in the tab the person wrote in. Telegraf's
 * `ctx.reply` already threads (context.js getThreadId), but every direct
 * `ctx.telegram.sendMessage(ctx.chat.id, ...)` -- the agent lane, the typing
 * indicator, long-answer splitting -- does not. So each update in a topic
 * gets its own `ctx.telegram`: the bot's client with one change, a
 * `message_thread_id` added to any send aimed at this same private chat that
 * did not name a thread itself. Pure apart from the client it wraps.
 */

import { TOPIC_NAME_MAX } from '@/spec/bot-topic-tabs.gen'

/** Methods that accept `message_thread_id` in a private chat (Bot API 9.3). */
export const THREADED_METHODS: ReadonlySet<string> = new Set([
  'sendMessage',
  'sendMessageDraft',
  'sendPhoto',
  'sendVideo',
  'sendAnimation',
  'sendAudio',
  'sendDocument',
  'sendVoice',
  'sendVideoNote',
  'sendSticker',
  'sendMediaGroup',
  'sendLocation',
  'sendVenue',
  'sendContact',
  'sendPoll',
  'sendDice',
  'sendInvoice',
  'sendPaidMedia',
  'sendChatAction',
  'copyMessage',
  'copyMessages',
  'forwardMessage',
  'forwardMessages',
])

interface MaybeTopicMessage {
  message_thread_id?: number
  is_topic_message?: boolean
  chat?: { id: number | string; type?: string }
}

/**
 * The topic an update belongs to, for a PRIVATE chat only (groups already
 * work through Telegraf's own threading and are not this file's business).
 * Reads the message, or the message under a pressed button.
 */
export function privateTopicOf(update: any): number | undefined {
  const msg: MaybeTopicMessage | undefined =
    update?.message ??
    update?.edited_message ??
    update?.callback_query?.message ??
    undefined
  if (!msg || msg.chat?.type !== 'private') return undefined
  if (!msg.is_topic_message) return undefined
  const id = Number(msg.message_thread_id)
  return Number.isInteger(id) && id > 0 ? id : undefined
}

/**
 * The spec's rule (bot-topic-tabs.t27 inject_thread): a send gets the tab's
 * thread only when it accepts one, targets this same chat, is not a
 * business-connection send (that speaks in somebody else's chat), and did not
 * name a thread itself -- and naming means the KEY is present, even with the
 * value null: a caller that wrote `message_thread_id: null` asked for none.
 */
export function injectThread(
  threadedMethod: boolean,
  sameChat: boolean,
  keyPresent: boolean,
  business: boolean
): boolean {
  return threadedMethod && sameChat && !keyPresent && !business
}

/** Add the topic to a payload when it targets this chat and named none. */
export function threadPayload(
  method: string,
  payload: any,
  chatId: number | string,
  threadId: number
): any {
  if (!payload || typeof payload !== 'object') return payload
  const inject = injectThread(
    THREADED_METHODS.has(method),
    String(payload.chat_id) === String(chatId),
    'message_thread_id' in payload,
    Boolean(payload.business_connection_id)
  )
  return inject ? { ...payload, message_thread_id: threadId } : payload
}

/**
 * The bot's client, seen through one topic. `Object.create` keeps every
 * method of the shared client (they all end in `this.callApi`) and shadows
 * only `callApi`, so the shared instance other updates use is never touched.
 */
export function threadedTelegram<T extends { callApi: Function }>(
  base: T,
  chatId: number | string,
  threadId: number
): T {
  const view = Object.create(base) as T
  ;(view as any).callApi = (method: string, payload: any, opts?: any) =>
    base.callApi(method, threadPayload(method, payload, chatId, threadId), opts)
  return view
}

/** Middleware: an update in a private topic answers into that topic. */
export async function topicThreadMiddleware(
  ctx: any,
  next: () => Promise<void>
): Promise<void> {
  const threadId = privateTopicOf(ctx.update)
  if (threadId !== undefined && ctx.chat?.id !== undefined && ctx.telegram) {
    Object.defineProperty(ctx, 'telegram', {
      value: threadedTelegram(ctx.telegram, ctx.chat.id, threadId),
      configurable: true,
      writable: true,
    })
    ctx.state = ctx.state ?? {}
    ctx.state.topicThreadId = threadId
  }
  return next()
}

/**
 * A topic name from the first thing written in it: one line, at most
 * SPEC.TOPIC_NAME_MAX characters (Telegram allows 128; the tab column shows
 * far fewer). Characters are code points, so an emoji is never cut in half.
 */
export function topicTitleFrom(text: string | undefined | null): string {
  const line = String(text ?? '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!line || line.startsWith('/')) return ''
  const chars = [...line]
  if (chars.length <= TOPIC_NAME_MAX) return line
  return `${chars
    .slice(0, TOPIC_NAME_MAX - 1)
    .join('')
    .trimEnd()}…`
}
