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
import {
  TRI_DEV_COMMANDS,
  TRI_DEV_DESCRIPTION,
  TRI_DEV_PACKAGE,
  registerTriDevBot,
  replyToTriDev,
  unregisterTriDevBot,
  type DispatchDeps,
} from './triDev'

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
  /** For tests: the TRI DEV runner's address and the fetch that reaches it. */
  triDev?: DispatchDeps
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
 * payload). The package the bot was made or paid for wins; a bot made before
 * packages were remembered is a Developer Agent when it makes media -- a bot of
 * the buyer's own is where the catalogue puts it -- and a Manager Agent when not.
 */
export const renewUrl = (
  manager: string,
  media: boolean,
  packageId?: string
): string =>
  `https://t.me/${manager}?start=agentpkg_${
    packageId && /^[a-z]{2,20}$/.test(packageId)
      ? packageId
      : media
        ? 'twin'
        : 'manager'
  }`

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
  bot: Pick<ManagedBotRow, 'botId' | 'botUsername' | 'ownerId' | 'package'> & {
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
          copy.ownerPaused(
            bot.botUsername,
            renewUrl(bot.manager, access.media, bot.package)
          )
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

/** Stop every managed bot (graceful shutdown). */
export function stopManagedBots(reason = 'SIGTERM'): void {
  for (const [id, bot] of running) {
    try {
      bot.stop(reason)
    } catch {
      // already stopped
    }
    running.delete(id)
    unregisterTriDevBot(id)
  }
}

/**
 * What a bot of each package shows in Telegram: its command menu and its
 * description, per language. Only TRI DEV has one: the client-facing packages
 * keep whatever their owner set in Telegram, which is the owner's to write.
 */
export const PACKAGE_PROFILES: Record<
  string,
  {
    commands: typeof TRI_DEV_COMMANDS
    description: typeof TRI_DEV_DESCRIPTION
  }
> = {
  [TRI_DEV_PACKAGE]: {
    commands: TRI_DEV_COMMANDS,
    description: TRI_DEV_DESCRIPTION,
  },
}

/** The slice of Telegraf's telegram client a profile needs. */
export interface ProfileTelegram {
  setMyCommands(commands: any, extra?: any): Promise<unknown>
  setMyDescription(description: string, languageCode?: string): Promise<unknown>
  setMyShortDescription(
    shortDescription: string,
    languageCode?: string
  ): Promise<unknown>
}

/**
 * Write the package's menu and description into the bot, ru and en by
 * language_code, with the English one also as the default for every other
 * language. Never throws: a bot with an old menu still answers.
 */
export async function applyPackageProfile(
  telegram: ProfileTelegram,
  packageId: string | undefined,
  botUsername = ''
): Promise<boolean> {
  const profile = packageId ? PACKAGE_PROFILES[packageId] : undefined
  if (!profile) return false
  try {
    for (const lang of ['ru', 'en'] as const) {
      await telegram.setMyCommands([...profile.commands[lang]], {
        language_code: lang,
      })
      await telegram.setMyDescription(
        profile.description[lang].description,
        lang
      )
      await telegram.setMyShortDescription(
        profile.description[lang].short,
        lang
      )
    }
    await telegram.setMyCommands([...profile.commands.en])
    await telegram.setMyDescription(profile.description.en.description)
    await telegram.setMyShortDescription(profile.description.en.short)
    return true
  } catch (error) {
    logger.warn('[managed-bots] package profile not written', {
      bot: botUsername,
      package: packageId,
      error: error instanceof Error ? error.message : String(error),
    })
    return false
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
  const triDev = row.package === TRI_DEV_PACKAGE
  if (triDev) {
    registerTriDevBot(row.botId, {
      ownerId: row.ownerId,
      send: (chatId, text) => bot.telegram.sendMessage(chatId, text),
    })
  } else {
    unregisterTriDevBot(row.botId)
  }
  void applyPackageProfile(bot.telegram as any, row.package, row.botUsername)
  bot.on('message', async ctx => {
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
    if (triDev) {
      try {
        const access = await deps.access(row.botId)
        const reply = await replyToTriDev(
          {
            botId: row.botId,
            ownerId: row.ownerId,
            fromId: m.from.id,
            chatId: ctx.chat.id,
            language: m.from.language_code,
            text: m.text,
            paid: access.paid,
            renewUrl: renewUrl(managerUsername, false, TRI_DEV_PACKAGE),
          },
          deps.triDev
        )
        if (reply) await ctx.reply(reply)
      } catch (error) {
        logger.error('[tri-dev] a message went unanswered', {
          bot: row.botUsername,
          error: error instanceof Error ? error.message : String(error),
        })
      }
      return
    }
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
    package: row.package ?? null,
  })
}
