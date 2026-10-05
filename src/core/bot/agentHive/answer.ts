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
import type { ManagedBotRow } from '@/core/bot/managedBots/store'
import { hiveAgent } from './catalogue'
import { addressed, callsAll, mayAnswer, mentions, type Entity } from './rules'
import {
  depthOfIncoming,
  noteBotAnswer,
  noteSent,
  sinceLastBotAnswer,
} from './chain'

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

const isHiveBot = (id: number) => agentBots.has(id) || managers.has(id)

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

export interface AgentTurnDeps {
  ask: (
    identity: string,
    text: string,
    opts: { agent: string; room?: string }
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
      action: 'typing',
      extra?: Record<string, unknown>
    ) => Promise<unknown>
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

  let depth = 0
  if (isGroup) {
    const ok = addressed({
      tagged: mentions(text, m.entities ?? m.caption_entities, me),
      allTag: inHive && callsAll(text),
      replyToMe: m.reply_to_message?.from?.id === me.id,
      ownTopic:
        inHive && row.hiveTopicId !== undefined && thread === row.hiveTopicId,
      fromBot,
    })
    if (!ok) return false
    depth = depthOfIncoming({
      chatId: chat.id,
      messageId: m.message_id,
      fromBot,
      replyToMessageId: m.reply_to_message?.message_id,
    })
    const now = deps.now?.() ?? Date.now()
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
  const said = isGroup
    ? `${rosterLine(chat.id, me.id)}\n${author} wrote:\n${text}`
    : text
  // A bot's turn runs in the name of the bot's owner: a bot has no wallet.
  const identity = fromBot ? String(row.ownerId) : String(m.from.id)

  await ctx.telegram
    .sendChatAction(chat.id, 'typing', where)
    .catch(() => undefined)
  let reply: string
  try {
    reply = await deps.ask(identity, said, {
      agent: row.agentId,
      ...(isGroup ? { room: String(chat.id) } : {}),
    })
  } catch (error) {
    logger.error('[agent-hive] the agent did not answer', {
      bot: row.botUsername,
      agent: row.agentId,
      error: error instanceof Error ? error.message : String(error),
    })
    reply = copy.busy
  }
  const parts = chunks(reply)
  for (const [i, part] of parts.entries()) {
    const sent = await ctx.telegram.sendMessage(chat.id, part, {
      ...where,
      ...(i === 0 && isGroup
        ? {
            reply_parameters: {
              message_id: m.message_id,
              allow_sending_without_reply: true,
            },
          }
        : {}),
    })
    if (isGroup) noteSent(chat.id, sent.message_id, depth + 1)
  }
  return parts.length > 0
}
