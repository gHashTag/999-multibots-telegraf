/**
 * A MANAGED BOT, BROUGHT UP AND ANSWERING.
 *
 * The bot belongs to its owner (our customer); the people who write to it are
 * THEIR clients. So every message is a business turn: `answerClient` with the
 * owner as the seller -- the same path a Telegram Business DM takes, with the
 * client-surface tool allowlist and the contact guard the render applies to
 * it (render/src/agent/client-facing.ts). The agent speaks in the owner's
 * name, out of the owner's CRM, and never out of the platform owner's.
 *
 * The token is asked of Telegram (`getManagedBotToken`) at every launch and is
 * held only by the running Telegraf instance -- never logged, never stored.
 */

import { Telegraf } from 'telegraf'
import { logger } from '@/utils/logger'
import type { ManagedBotRow } from './store'

/** What the runner needs from the outside, injectable for tests. */
export interface RunnerDeps {
  /** The agent's answer to a client of `seller`. */
  answer: (
    clientId: string,
    text: string,
    fallback: () => Promise<string>,
    seller: string
  ) => Promise<string>
  /** Tell the owner something, through the manager bot they started. */
  tellOwner: (ownerId: number, text: string) => Promise<void>
}

export interface IncomingText {
  fromId: number
  fromName: string
  language?: string
  text?: string
}

const isRu = (language?: string) => (language ?? 'ru').startsWith('ru')

export const COPY = {
  ru: {
    textOnly: 'Пока я читаю только текст. Напишите, пожалуйста, словами 🙏',
    busy: 'Не получилось ответить прямо сейчас. Я передал ваше сообщение, вам ответят здесь.',
    ownerMissed: (bot: string, who: string, text: string) =>
      `@${bot}: агент не смог ответить клиенту ${who}. Сообщение: «${text.slice(0, 300)}»`,
  },
  en: {
    textOnly: 'For now I read text only. Please write it in words 🙏',
    busy: "I couldn't answer right now. Your message has been passed on, and you'll get a reply here.",
    ownerMissed: (bot: string, who: string, text: string) =>
      `@${bot}: the agent could not answer ${who}. Message: "${text.slice(0, 300)}"`,
  },
} as const

/**
 * One incoming message to one managed bot, to the text that goes back.
 *
 * A fallback that apologises and hands the message to the owner is the only
 * one allowed here: the owner's agent must never be replaced by a tool-less
 * model that could invent a price in their name.
 */
export async function replyToClient(
  deps: RunnerDeps,
  bot: Pick<ManagedBotRow, 'botUsername' | 'ownerId'>,
  msg: IncomingText
): Promise<string> {
  const copy = isRu(msg.language) ? COPY.ru : COPY.en
  const text = msg.text?.trim()
  if (!text) return copy.textOnly
  const who = msg.fromName || String(msg.fromId)
  return deps.answer(
    String(msg.fromId),
    text,
    async () => {
      await deps
        .tellOwner(bot.ownerId, copy.ownerMissed(bot.botUsername, who, text))
        .catch(() => undefined)
      return copy.busy
    },
    String(bot.ownerId)
  )
}

/** The bots running in this process, by bot id. */
const running = new Map<number, Telegraf>()

export const isRunning = (botId: number): boolean => running.has(botId)

/** Stop every managed bot (graceful shutdown). */
export function stopManagedBots(reason = 'SIGTERM'): void {
  for (const [id, bot] of running) {
    try {
      bot.stop(reason)
    } catch {
      // already stopped
    }
    running.delete(id)
  }
}

/**
 * Ask Telegram for the bot's current token and start answering with it.
 * A bot already running is restarted, because Telegram re-sends `managed_bot`
 * exactly when the token changed.
 */
export async function launchManagedBot(
  manager: Telegraf<any>,
  row: ManagedBotRow,
  deps: RunnerDeps
): Promise<void> {
  const token = String(
    await manager.telegram.callApi(
      'getManagedBotToken' as any,
      {
        user_id: row.botId,
      } as any
    )
  )
  if (!/^\d+:[\w-]{20,}$/.test(token)) {
    throw new Error(`getManagedBotToken returned no token for ${row.botId}`)
  }

  const previous = running.get(row.botId)
  if (previous) {
    try {
      previous.stop('token-changed')
    } catch {
      // already stopped
    }
    running.delete(row.botId)
  }

  const bot = new Telegraf(token, { handlerTimeout: Infinity })
  bot.on('message', async ctx => {
    const m = ctx.message as {
      text?: string
      caption?: string
      from?: { id: number; first_name?: string; language_code?: string }
    }
    if (!m.from) return
    try {
      await ctx.sendChatAction('typing').catch(() => undefined)
      const reply = await replyToClient(deps, row, {
        fromId: m.from.id,
        fromName: m.from.first_name ?? '',
        language: m.from.language_code,
        text: m.text ?? m.caption,
      })
      if (reply) await ctx.reply(reply)
    } catch (error) {
      logger.error('[managed-bots] a client message went unanswered', {
        bot: row.botUsername,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  })
  bot.catch(error => {
    logger.error('[managed-bots] handler error', {
      bot: row.botUsername,
      error: error instanceof Error ? error.message : String(error),
    })
  })

  running.set(row.botId, bot)
  // Not awaited: launch() resolves only when polling stops.
  bot
    .launch({ allowedUpdates: ['message'], dropPendingUpdates: false })
    .catch(error => {
      running.delete(row.botId)
      logger.error('[managed-bots] polling stopped', {
        bot: row.botUsername,
        error: error instanceof Error ? error.message : String(error),
      })
    })
  logger.info('[managed-bots] answering', {
    bot: row.botUsername,
    owner: row.ownerId,
  })
}
