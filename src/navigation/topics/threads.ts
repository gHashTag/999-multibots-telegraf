/**
 * TABS IN THE PRIVATE CHAT: ONE TOPIC, ONE CONVERSATION.
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

/** Add the topic to a payload when it targets this chat and named none. */
export function threadPayload(
  method: string,
  payload: any,
  chatId: number | string,
  threadId: number
): any {
  if (!THREADED_METHODS.has(method)) return payload
  if (!payload || typeof payload !== 'object') return payload
  if (String(payload.chat_id) !== String(chatId)) return payload
  if (payload.message_thread_id !== undefined) return payload
  // A business-connection send speaks in somebody else's chat.
  if (payload.business_connection_id) return payload
  return { ...payload, message_thread_id: threadId }
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
 * The render conversation of a topic (render conversation.ts
 * CONVERSATION_RE = /^[a-z0-9]{4,24}$/). Each tab keeps its own memory under
 * the person's own thread: `self~topic<id>`, listed in the mini-app beside the
 * other conversations. No topic -> undefined -> the base conversation, which
 * is what the bot always used.
 */
export function agentConversationFor(
  threadId: number | undefined
): string | undefined {
  if (threadId === undefined) return undefined
  const id = `topic${threadId}`
  return /^[a-z0-9]{4,24}$/.test(id) ? id : undefined
}

/**
 * A topic name from the first thing written in it: one line, at most 32
 * characters (Telegram allows 128; the tab column shows far fewer).
 */
export function topicTitleFrom(text: string | undefined | null): string {
  const line = String(text ?? '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!line || line.startsWith('/')) return ''
  return line.length > 32 ? `${line.slice(0, 31).trimEnd()}…` : line
}
