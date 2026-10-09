/**
 * AN AGENT'S OWN BOT, ANSWERING AS THAT AGENT.
 *
 * Behind the bot is the real agent: the render's runAgent with the
 * catalogue persona (chat.ts marketplaceAgentPrompt) and the shared tool
 * registry, reached through the same relay as every bot turn
 * (services/trinityAgent.ts) with `agent` set. In a private chat the memory is
 * the agent's own thread with that person; in a group it is the room's.
 *
 * In a group the agent speaks only when addressed and only inside the chain
 * limits (rules.ts, spec agent-hive-group.t27). Bots outside the hive are
 * never answered: a loop with a stranger's bot is not ours to count.
 */

import { logger } from '@/utils/logger'
import {
  actionForTool,
  keepTyping,
  type ChatAction,
} from '@/helpers/telegramLongAnswer'
import type { ManagedBotRow } from '@/core/bot/managedBots/store'
import * as SPEC from '@/spec/agent-hive-group.gen'
import { threadMissing } from '@/navigation/topics/engine'
import { setHiveTopic } from '@/core/bot/managedBots/store'
import { HIVE_AGENTS, hiveAgent } from './catalogue'
import {
  addressed,
  callsAll,
  followsUp,
  heardWhileMuted,
  keepsSeenMark,
  mayAnswer,
  mayAnswerAfterStop,
  mentions,
  recreateTopic,
  speaksOnAll,
  type Entity,
} from './rules'
import {
  placeOfIncoming,
  noteBotAnswer,
  noteSent,
  sinceLastBotAnswer,
} from './chain'
import {
  briefFor,
  logLine,
  noteAnswered,
  noteRecreateTry,
  sinceMute,
  sinceMyAnswer,
  sinceRecreateTry,
  sinceStop,
} from './room'

export const AGENT_COPY = {
  ru: {
    textOnly: 'Пока я читаю только текст. Напишите, пожалуйста, словами 🙏',
    busy: 'Не получилось ответить прямо сейчас. Попробуйте ещё раз через минуту.',
  },
  en: {
    textOnly: 'For now I read text only. Please write it in words 🙏',
    busy: "I couldn't answer right now. Please try again in a minute.",
  },
} as const

/** Telegram's limit is 4096; a margin for the entities Telegram counts. */
const CHUNK = 4000

export function chunks(text: string, size = CHUNK): string[] {
  const out: string[] = []
  let rest = text.trim()
  while (rest.length > size) {
    const cut = rest.lastIndexOf('\n', size)
    const at = cut > size / 2 ? cut : size
    out.push(rest.slice(0, at).trimEnd())
    rest = rest.slice(at).trimStart()
  }
  if (rest) out.push(rest)
  return out
}

/** The agent bots running in this process, and the manager bots, by user id. */
const agentBots = new Map<number, ManagedBotRow & { agentId: string }>()
const managers = new Set<number>()

export function registerAgentBot(row: ManagedBotRow): void {
  if (row.agentId) agentBots.set(row.botId, { ...row, agentId: row.agentId })
  else agentBots.delete(row.botId)
}

export function forgetAgentBot(botId: number): void {
  agentBots.delete(botId)
}

/** The running agent bots, for /hive. */
export const runningAgentBots = (): (ManagedBotRow & { agentId: string })[] => [
  ...agentBots.values(),
]

/** For tests. */
export function clearAgentBots(): void {
  agentBots.clear()
  managers.clear()
}

export function registerManager(botId: number): void {
  managers.add(botId)
}

export const isHiveBot = (id: number): boolean =>
  agentBots.has(id) || managers.has(id)

/** The other agents of this hive, as the agent should tag them. */
export function rosterLine(chatId: number, selfId: number): string {
  const mates = [...agentBots.values()]
    .filter(b => b.hiveChatId === chatId && b.botId !== selfId)
    .map(b => {
      const a = hiveAgent(b.agentId)
      return `@${b.botUsername}${a ? ` (${a.name.en}: ${a.role.en})` : ''}`
    })
  return mates.length
    ? `[Hive group. Other agents here: ${mates.join('; ')}. Tag one by its @username to ask it; answer only what is asked of you.]`
    : '[Hive group.]'
}

/**
 * The agent's place in the best-fit order for an all-tag message (spec
 * speaks_on_all): the agent whose topic it is first, then the agents the text
 * names, then the catalogue order. Every agent bot computes the same order
 * from the same roster, so exactly one of them is first.
 */
export function allRank(
  chatId: number,
  thread: number | undefined,
  text: string,
  selfId: number
): number {
  const lower = text.toLowerCase()
  const order = (b: ManagedBotRow & { agentId: string }): number[] => {
    const a = hiveAgent(b.agentId)
    const named =
      a !== undefined &&
      [a.name.en, a.name.ru].some(n => lower.includes(n.toLowerCase()))
    return [
      thread !== undefined && b.hiveTopicId === thread ? 0 : 1,
      named ? 0 : 1,
      HIVE_AGENTS.findIndex(x => x.id === b.agentId),
      b.botId,
    ]
  }
  const mates = [...agentBots.values()]
    .filter(b => b.hiveChatId === chatId)
    .sort((x, y) => {
      const a = order(x)
      const b = order(y)
      for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i]
      return 0
    })
  const at = mates.findIndex(b => b.botId === selfId)
  return at < 0 ? mates.length : at
}

/** The seen mark: 👀 while the agent works, taken away if the turn fails. */
export const SEEN_REACTION = '👀'

export interface AgentTurnDeps {
  ask: (
    identity: string,
    text: string,
    opts: {
      agent: string
      room?: string
      /** The tool the agent is running now, null when it ends (#3683). */
      onTool?: (name: string | null) => void
    }
  ) => Promise<string>
  now?: () => number
}

const defaultDeps: AgentTurnDeps = {
  ask: async (identity, text, opts) => {
    const relay = await import('@/services/trinityAgent')
    const answer = await relay.спроситьАгента(identity, text, opts) // cyrillic-ok: pre-existing export
    return answer.текст // cyrillic-ok: pre-existing field
  },
}

interface Msg {
  message_id: number
  message_thread_id?: number
  is_topic_message?: boolean
  text?: string
  caption?: string
  entities?: Entity[]
  caption_entities?: Entity[]
  from?: {
    id: number
    is_bot?: boolean
    first_name?: string
    username?: string
    language_code?: string
  }
  reply_to_message?: { message_id: number; from?: { id: number } }
}

/** What answerAsAgent needs of a Telegraf context; a plain object in tests. */
export interface AgentCtx {
  message?: unknown
  chat?: { id: number; type: string }
  botInfo?: { id: number; username: string }
  telegram: {
    sendMessage: (
      chatId: number,
      text: string,
      extra?: Record<string, unknown>
    ) => Promise<{ message_id: number }>
    sendChatAction: (
      chatId: number,
      action: ChatAction,
      extra?: Record<string, unknown>
    ) => Promise<unknown>
    /** setMessageReaction and createForumTopic; absent in older doubles. */
    callApi?: (method: string, payload: Record<string, unknown>) => Promise<any>
  }
}

/** A courtesy: a chat that refuses reactions costs the turn nothing. */
async function react(
  ctx: AgentCtx,
  chatId: number,
  messageId: number,
  emoji: string | null
): Promise<boolean> {
  if (!ctx.telegram.callApi) return false
  try {
    await ctx.telegram.callApi('setMessageReaction', {
      chat_id: chatId,
      message_id: messageId,
      reaction: emoji ? [{ type: 'emoji', emoji }] : [],
    })
    return true
  } catch {
    return false
  }
}

/** One message to an agent's bot; returns whether the agent answered. */
export async function answerAsAgent(
  ctx: AgentCtx,
  row: ManagedBotRow,
  deps: AgentTurnDeps = defaultDeps
): Promise<boolean> {
  // The live row: /hive gives a running bot its topic without a relaunch.
  row = agentBots.get(row.botId) ?? row
  const m = ctx.message as Msg | undefined
  const chat = ctx.chat
  const me = ctx.botInfo
  if (!m?.from || !chat || !me || !row.agentId) return false
  const isPrivate = chat.type === 'private'
  const isGroup = chat.type === 'group' || chat.type === 'supergroup'
  if (!isPrivate && !isGroup) return false
  const fromBot = m.from.is_bot === true
  const inHive = isGroup && row.hiveChatId === chat.id
  if (fromBot && (!inHive || !isHiveBot(m.from.id))) return false

  const text = (m.text ?? m.caption ?? '').trim()
  const copy = (m.from.language_code ?? 'ru').startsWith('ru')
    ? AGENT_COPY.ru
    : AGENT_COPY.en
  const thread = m.is_topic_message ? m.message_thread_id : undefined
  const where = thread !== undefined ? { message_thread_id: thread } : {}

  const now = deps.now?.() ?? Date.now()
  let depth = 0
  // Whose turn this is: the sender, or for a bot the person who started the chain.
  let origin: number | null = fromBot ? null : m.from.id
  if (isGroup) {
    // Every agent bot sees every hive message; the topic's log keeps one copy
    // of each for /summary (room.ts dedupes by message id).
    if (inHive)
      logLine(
        chat.id,
        thread,
        m.message_id,
        m.from.username
          ? `@${m.from.username}`
          : m.from.first_name || 'someone',
        text
      )
    // Commands belong to the manager (/stop, /mute, /brief, /summary); an
    // agent never answers "/stop" as if it were a question.
    if (text.startsWith('/')) return false
    const tagged = mentions(text, m.entities ?? m.caption_entities, me)
    const replyToMe = m.reply_to_message?.from?.id === me.id
    const ownTopic =
      inHive && row.hiveTopicId !== undefined && thread === row.hiveTopicId
    const allTag = inHive && callsAll(text)
    // spec follows_up: the person's next message in this topic goes to the
    // agent that answered them last, without a tag, for two minutes.
    const followUp =
      inHive &&
      !tagged &&
      !replyToMe &&
      followsUp(
        fromBot,
        true,
        true,
        sinceMyAnswer(chat.id, thread, m.from.id, me.id, now)
      )
    const ok =
      followUp || addressed({ tagged, allTag, replyToMe, ownTopic, fromBot })
    if (!ok) return false
    // spec speaks_on_all: an all tag alone wakes only the best fit.
    const onlyAll = allTag && !tagged && !replyToMe && !ownTopic && !followUp
    if (onlyAll && !speaksOnAll(allRank(chat.id, thread, text, me.id)))
      return false
    // spec heard_while_muted: a muted topic hears only its tag.
    if (
      inHive &&
      !heardWhileMuted(tagged, sinceMute(chat.id, thread, me.id, now))
    )
      return false
    // spec may_answer_after_stop: /stop cuts bot-to-bot turns, never a person.
    if (!mayAnswerAfterStop(fromBot, sinceStop(chat.id, now))) return false
    const place = placeOfIncoming({
      chatId: chat.id,
      messageId: m.message_id,
      fromBot,
      fromId: m.from.id,
      replyToMessageId: m.reply_to_message?.message_id,
    })
    depth = place.depth
    origin = place.origin
    // A bot message nobody can trace to a person runs in nobody's name.
    if (origin === null) return false
    if (!mayAnswer(fromBot, depth, sinceLastBotAnswer(me.id, now))) return false
    if (fromBot) noteBotAnswer(me.id, now)
  } else if (fromBot) return false

  if (!text) {
    if (isPrivate) await ctx.telegram.sendMessage(chat.id, copy.textOnly)
    return false
  }

  const author = fromBot
    ? `@${m.from.username ?? m.from.id} (an agent of this hive)`
    : m.from.first_name ||
      (m.from.username ? `@${m.from.username}` : 'a person')
  // spec brief_source: the topic's standing brief, else the group's.
  const brief = inHive ? await briefFor(chat.id, thread) : ''
  const said = isGroup
    ? [
        rosterLine(chat.id, me.id),
        ...(brief
          ? [`[Standing brief from the group's admins: ${brief}]`]
          : []),
        `${author} wrote:\n${text}`,
      ].join('\n')
    : text
  // Never the bot owner's name: a bot hop must not turn a guest's request
  // into the owner's (wallet, tools, keeper rights).
  const identity = String(origin)

  // The seen mark (spec v3): 👀 while the agent works on a group message.
  const marked = isGroup
    ? await react(ctx, chat.id, m.message_id, SEEN_REACTION)
    : false

  // Repeated every TYPING_REFRESH_MS (spec typing_due), and "sending a
  // photo…" while a picture is drawn (#3683).
  const typing = keepTyping(
    {
      sendChatAction: async action =>
        ctx.telegram.sendChatAction(chat.id, action, where),
    },
    SPEC.TYPING_REFRESH_MS
  )
  let reply: string
  let answered = true
  try {
    reply = await deps.ask(identity, said, {
      agent: row.agentId,
      ...(isGroup ? { room: String(chat.id) } : {}),
      onTool: name => typing.setAction(actionForTool(name)),
    })
  } catch (error) {
    logger.error('[agent-hive] the agent did not answer', {
      bot: row.botUsername,
      agent: row.agentId,
      error: error instanceof Error ? error.message : String(error),
    })
    reply = copy.busy
    answered = false
  } finally {
    typing()
  }
  const parts = chunks(reply)
  let place: Record<string, unknown> = where
  for (const [i, part] of parts.entries()) {
    const extra = {
      ...place,
      ...(i === 0 && isGroup
        ? {
            reply_parameters: {
              message_id: m.message_id,
              allow_sending_without_reply: true,
            },
          }
        : {}),
    }
    let sent: { message_id: number }
    try {
      sent = await ctx.telegram.sendMessage(chat.id, part, extra)
    } catch (error) {
      // spec recreate_topic: the agent's own topic was deleted under it.
      const remade =
        inHive && thread !== undefined && thread === row.hiveTopicId
          ? await remakeTopic(ctx, row, chat.id, error, now)
          : undefined
      if (remade === undefined) throw error
      place = { message_thread_id: remade }
      sent = await ctx.telegram.sendMessage(chat.id, part, {
        ...extra,
        ...place,
      })
    }
    if (isGroup) noteSent(chat.id, sent.message_id, depth + 1, origin)
    if (inHive)
      logLine(chat.id, thread, sent.message_id, `@${me.username}`, part)
  }
  const done = answered && parts.length > 0
  // spec keeps_seen_mark: a failed turn takes the mark away.
  if (marked && !keepsSeenMark(done))
    await react(ctx, chat.id, m.message_id, null)
  if (done && isGroup && !fromBot)
    noteAnswered(chat.id, thread, m.from.id, me.id, now)
  return parts.length > 0
}

/**
 * The agent's topic was deleted: make it again (agent bots are added with
 * manage_topics, addToGroupLink), at most once per TOPIC_RECREATE_COOLDOWN_MS.
 * Returns the new thread, or undefined when this is not that case or the
 * try is not due.
 */
async function remakeTopic(
  ctx: AgentCtx,
  row: ManagedBotRow,
  chatId: number,
  error: unknown,
  now: number
): Promise<number | undefined> {
  if (!threadMissing(error) || !ctx.telegram.callApi) return undefined
  if (!recreateTopic(true, false, sinceRecreateTry(row.botId, now)))
    return undefined
  noteRecreateTry(row.botId, now)
  const a = hiveAgent(row.agentId)
  try {
    const topic = (await ctx.telegram.callApi('createForumTopic', {
      chat_id: chatId,
      name: `${a?.icon ?? '🤖'} ${a?.name.ru ?? row.botName}`.slice(0, 128),
    })) as { message_thread_id: number }
    const id = topic.message_thread_id
    registerAgentBot({ ...row, hiveChatId: chatId, hiveTopicId: id })
    await setHiveTopic(row.botId, chatId, id).catch(e =>
      logger.warn('[agent-hive] the remade topic is not stored', {
        bot: row.botUsername,
        error: e instanceof Error ? e.message : String(e),
      })
    )
    return id
  } catch (e) {
    logger.warn('[agent-hive] a deleted topic could not be remade', {
      bot: row.botUsername,
      error: e instanceof Error ? e.message : String(e),
    })
    return undefined
  }
}
