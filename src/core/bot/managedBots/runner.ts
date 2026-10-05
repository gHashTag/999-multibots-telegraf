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
import { telegramClientOptionsFor } from '@/services/telegramApi'
import { launchWithConflictRetry } from '@/core/bot/launchWithConflictRetry'
import type { ManagedBotAccess, ManagedBotRow } from './store'
import { forgetAgentBot, registerAgentBot } from '@/core/bot/agentHive/answer'

/** What the runner needs from the outside, injectable for tests. */
export interface RunnerDeps {
  /** The agent's answer to a client of `seller`. */
  answer: (
    clientId: string,
    text: string,
    fallback: () => Promise<string>,
    seller: string,
    /** No media tools: the Manager Agent is a text model for the CRM. */
    textOnly: boolean
  ) => Promise<string>
  /** Tell the owner something, through the manager bot they started. */
  tellOwner: (ownerId: number, text: string) => Promise<void>
  /** Whether the bot is paid for, and whether its package makes media. */
  access: (botId: number) => Promise<ManagedBotAccess>
  /**
   * A bot that IS a catalogue agent (`row.agentId`, agentHive): its message
   * goes here instead of the client path. Injected, not imported: agentHive
   * relaunches bots through this file.
   */
  asAgent?: (ctx: any, row: ManagedBotRow) => Promise<unknown>
  /**
   * A bot just created: is it one of the catalogue agents (agentHive
   * claims.ts)? The bound row, or null for an ordinary client bot.
   */
  claimAgent?: (
    event: { botId: number; botUsername: string; ownerId: number },
    managerUsername: string
  ) => Promise<ManagedBotRow | null>
  /** An agent's bot is up: give it the agent's name and tell the owner. */
  agentBorn?: (row: ManagedBotRow) => Promise<void>
}

export interface IncomingText {
  fromId: number
  fromName: string
  fromUsername?: string
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
    paused:
      'Сейчас ассистент не отвечает. Ваше сообщение передано владельцу, он свяжется с вами.',
    ownerForward: (bot: string, who: string, text: string) =>
      `@${bot} на паузе, клиент ${who} написал: «${text.slice(0, 300)}»`,
    ownerPaused: (bot: string, renew: string) =>
      `@${bot} не отвечает вашим клиентам: оплаченный срок закончился. Сообщения клиентов я пересылаю сюда. Продлить: ${renew}`,
  },
  en: {
    textOnly: 'For now I read text only. Please write it in words 🙏',
    busy: "I couldn't answer right now. Your message has been passed on, and you'll get a reply here.",
    ownerMissed: (bot: string, who: string, text: string) =>
      `@${bot}: the agent could not answer ${who}. Message: "${text.slice(0, 300)}"`,
    paused:
      'The assistant is not answering right now. Your message has been passed to the owner, who will get in touch.',
    ownerForward: (bot: string, who: string, text: string) =>
      `@${bot} is paused; your client ${who} wrote: "${text.slice(0, 300)}"`,
    ownerPaused: (bot: string, renew: string) =>
      `@${bot} is not answering your clients: the paid period is over. Their messages are forwarded here. Renew: ${renew}`,
  },
} as const

/**
 * Where the owner of a paused bot pays to switch it back on: the package
 * order in the manager bot (src/services/agentPackageOrder.ts reads the
 * payload). A bot that makes media is a Developer Agent -- a bot of the buyer's
 * own is where the catalogue puts it -- and a text bot is a Manager Agent.
 */
export const renewUrl = (manager: string, media: boolean): string =>
  `https://t.me/${manager}?start=agentpkg_${media ? 'twin' : 'manager'}`

const NOTICE_EVERY_MS = 24 * 60 * 60 * 1000
const lastPausedNotice = new Map<number, number>()

/** For tests: forget when each owner was last told their bot is paused. */
export function clearPausedNotices(): void {
  lastPausedNotice.clear()
}

/**
 * One incoming message to one managed bot, to the text that goes back.
 *
 * A fallback that apologises and hands the message to the owner is the only
 * one allowed here: the owner's agent must never be replaced by a tool-less
 * model that could invent a price in their name.
 *
 * A bot whose paid period is over does not ask the agent at all -- every
 * turn is a model call nobody pays for. Its client is not left in silence:
 * the message goes to the owner, and the owner hears why at most once a day.
 */
export async function replyToClient(
  deps: RunnerDeps,
  bot: Pick<ManagedBotRow, 'botId' | 'botUsername' | 'ownerId'> & {
    manager: string
  },
  msg: IncomingText,
  now = Date.now()
): Promise<string> {
  const copy = isRu(msg.language) ? COPY.ru : COPY.en
  const text = msg.text?.trim()
  if (!text) return copy.textOnly
  const who =
    [msg.fromName, msg.fromUsername ? `@${msg.fromUsername}` : '']
      .filter(Boolean)
      .join(' ') || String(msg.fromId)
  const access = await deps.access(bot.botId)
  if (!access.paid) {
    await deps
      .tellOwner(bot.ownerId, copy.ownerForward(bot.botUsername, who, text))
      .catch(() => undefined)
    const last = lastPausedNotice.get(bot.botId)
    if (last === undefined || now - last >= NOTICE_EVERY_MS) {
      lastPausedNotice.set(bot.botId, now)
      await deps
        .tellOwner(
          bot.ownerId,
          copy.ownerPaused(bot.botUsername, renewUrl(bot.manager, access.media))
        )
        .catch(() => undefined)
    }
    return copy.paused
  }
  return deps.answer(
    String(msg.fromId),
    text,
    async () => {
      await deps
        .tellOwner(bot.ownerId, copy.ownerMissed(bot.botUsername, who, text))
        .catch(() => undefined)
      return copy.busy
    },
    String(bot.ownerId),
    !access.media
  )
}

/** The bots running in this process, by bot id. */
const running = new Map<number, Telegraf>()

export const isRunning = (botId: number): boolean => running.has(botId)

/** The Telegram client of a running bot (agentHive sets an agent's profile). */
export const runningTelegram = (botId: number) => running.get(botId)?.telegram

/** Stop one bot (an agent paused from /agents). */
export function stopManagedBot(botId: number, reason = 'paused'): void {
  forgetAgentBot(botId)
  const bot = running.get(botId)
  if (!bot) return
  running.delete(botId)
  try {
    bot.stop(reason)
  } catch {
    // already stopped
  }
}

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
  deps: RunnerDeps,
  /** The manager's username, for the renewal link a paused bot sends. */
  managerUsername: string
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

  // The token's own Bot API host: a managed bot moved to our server must never
  // be polled on the cloud (telegramApiRootCensus.test.ts).
  const bot = new Telegraf(token, {
    handlerTimeout: Infinity,
    telegram: telegramClientOptionsFor(token),
  })
  bot.on('message', async ctx => {
    if (row.agentId && deps.asAgent) {
      try {
        await deps.asAgent(ctx, row)
      } catch (error) {
        logger.error('[managed-bots] an agent message went unanswered', {
          bot: row.botUsername,
          agent: row.agentId,
          error: error instanceof Error ? error.message : String(error),
        })
      }
      return
    }
    const m = ctx.message as {
      text?: string
      caption?: string
      from?: {
        id: number
        first_name?: string
        username?: string
        language_code?: string
      }
    }
    if (!m.from) return
    try {
      await ctx.sendChatAction('typing').catch(() => undefined)
      const reply = await replyToClient(
        deps,
        { ...row, manager: managerUsername },
        {
          fromId: m.from.id,
          fromName: m.from.first_name ?? '',
          fromUsername: m.from.username,
          language: m.from.language_code,
          text: m.text ?? m.caption,
        }
      )
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
  registerAgentBot(row)
  // Not awaited: launch() resolves only when polling stops. A redeploy
  // overlaps two instances polling the same token, so 409 is waited out as
  // it is for the farm bots -- unless this instance was replaced meanwhile.
  void launchWithConflictRetry(
    bot,
    row.botUsername,
    ['message'],
    8,
    () => running.get(row.botId) === bot
  ).then(polled => {
    if (!polled && running.get(row.botId) === bot) running.delete(row.botId)
  })
  logger.info('[managed-bots] answering', {
    bot: row.botUsername,
    owner: row.ownerId,
    ...(row.agentId ? { agent: row.agentId } : {}),
  })
}
