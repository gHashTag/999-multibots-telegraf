/**
 * THE MANAGER SIDE: the button that creates a client's own agent bot, the
 * update that says it was created, and the relaunch of every such bot at boot.
 *
 * Installed on every farm bot and gated on what Telegram itself says: only a
 * bot whose `getMe` reports `can_manage_bots` (Bot Management Mode, switched
 * on by the bot's owner in @BotFather) can create bots. A farm bot without it
 * answers /mybot with the bot that can.
 *
 * Registered BEFORE the scenes on purpose (see the payment handlers in
 * index.ts for the same reason): the service message arrives as a `message`,
 * and a wizard step with no text to read swallows it without calling next().
 */

import type { Telegraf } from 'telegraf'
import { logger } from '@/utils/logger'
import { isAdmin } from '@/middleware/adminOnly'
import {
  readManagedBotCreated,
  readManagedBotUpdate,
  requestManagedBotKeyboard,
  suggestBotName,
  suggestBotUsername,
  type ManagedBotEvent,
} from './protocol'
import {
  extendManagedBot,
  liveManagedBots,
  managedBotsOf,
  rememberManagedBot,
  type ManagedBotRow,
} from './store'
import { launchManagedBot, type RunnerDeps } from './runner'

/** The farm bot people are sent to when theirs cannot create bots. */
export const MANAGER_BOT = 't27ai_bot'

export const MANAGER_COPY = {
  ru: {
    offer:
      'Создадим вашего собственного бота-агента. Он будет ваш: имя и аватар меняете в Telegram сами, а отвечает в нём наш агент от вашего имени.\n\nНажмите кнопку ниже, Telegram предложит имя — его можно поправить.',
    button: '🤖 Создать моего бота',
    elsewhere: (manager: string) =>
      `Ботов создаёт @${manager}. Откройте его и отправьте /mybot.`,
    have: (list: string) => `Ваши боты: ${list}`,
    until: (date: string) => `оплачен до ${date}`,
    paused: 'на паузе',
    extended: (bot: string, date: string) =>
      `✅ @${bot} оплачен до ${date} и отвечает вашим клиентам.`,
    created: (bot: string) =>
      `✅ Бот @${bot} создан и уже отвечает. Отправьте ему сообщение, чтобы проверить, как агент говорит с вашими клиентами.`,
    notYet: (bot: string) =>
      `Бот @${bot} создан, но пока не отвечает: не удалось его подключить. Мы уже видим ошибку и подключим его вручную.`,
  },
  en: {
    offer:
      "Let's create your own agent bot. It is yours: you change its name and picture in Telegram, and our agent answers in it on your behalf.\n\nTap the button below; Telegram will suggest a name you can edit.",
    button: '🤖 Create my bot',
    elsewhere: (manager: string) =>
      `Bots are created by @${manager}. Open it and send /mybot.`,
    have: (list: string) => `Your bots: ${list}`,
    until: (date: string) => `paid until ${date}`,
    paused: 'paused',
    extended: (bot: string, date: string) =>
      `✅ @${bot} is paid until ${date} and answering your clients.`,
    created: (bot: string) =>
      `✅ @${bot} is created and already answering. Send it a message to see how the agent talks to your clients.`,
    notYet: (bot: string) =>
      `@${bot} is created but not answering yet: it could not be connected. We see the error and will connect it by hand.`,
  },
} as const

const copyFor = (language?: string) =>
  (language ?? 'ru').startsWith('ru') ? MANAGER_COPY.ru : MANAGER_COPY.en

const day = (d: Date) => d.toISOString().slice(0, 10)

/** One owned bot as /mybot lists it: the name and whether it answers. */
export function ownedLine(
  bot: { botUsername: string; status: string; paidUntil?: Date },
  copy: { until: (date: string) => string; paused: string },
  now = new Date()
): string {
  const answering =
    bot.status === 'live' && bot.paidUntil && bot.paidUntil > now
  return `@${bot.botUsername} (${answering ? copy.until(day(bot.paidUntil!)) : copy.paused})`
}

export const AGENT_BOT_USAGE =
  'Как оплатить бота клиента после оплаты владельцем:\n' +
  '/agentbot @username <дней> — продлить на столько дней\n' +
  '/agentbot @username <дней> text — пакет «Менеджер агент», только текст\n' +
  '/agentbot @username <дней> media — пакет с медиа (рилсы, лицо, голос)'

/** The team's /agentbot words, or null when they do not parse. */
export function parseAgentBotArgs(
  text: string
): { botUsername: string; days: number; media?: boolean } | null {
  const [, name, daysWord, kind, ...rest] = text.trim().split(/\s+/)
  if (!name || !daysWord || rest.length) return null
  const botUsername = name.replace(/^@/, '')
  if (!/^[A-Za-z][A-Za-z0-9_]{3,31}$/.test(botUsername)) return null
  if (!/^\d{1,4}$/.test(daysWord)) return null
  const days = Number(daysWord)
  if (days < 1 || days > 400) return null
  if (kind === undefined) return { botUsername, days }
  if (kind === 'text') return { botUsername, days, media: false }
  if (kind === 'media') return { botUsername, days, media: true }
  return null
}

const canManage = (botInfo: unknown): boolean =>
  (botInfo as { can_manage_bots?: boolean } | undefined)?.can_manage_bots ===
  true

/**
 * Remember the bot, launch it, tell its owner. Idempotent: the update and the
 * service message both announce the same creation, and Telegram re-sends the
 * update on a token change -- each just re-upserts and relaunches.
 */
export async function onManagedBot(
  manager: Telegraf<any>,
  managerUsername: string,
  event: ManagedBotEvent,
  deps: RunnerDeps,
  announce: boolean
): Promise<void> {
  const copy = copyFor(event.ownerLanguage)
  try {
    let row: ManagedBotRow = (await rememberManagedBot(
      event,
      managerUsername
    )) ?? {
      botId: event.botId,
      botUsername: event.botUsername,
      botName: event.botName,
      ownerId: event.ownerId,
    }
    // A catalogue agent's bot (agentHive): bound before the first launch, so
    // it never answers a single message as a client bot.
    if (!row.agentId && deps.claimAgent)
      row = (await deps.claimAgent(event, managerUsername)) ?? row
    await launchManagedBot(manager, row, deps, managerUsername)
    if (row.agentId && deps.agentBorn) {
      if (announce) await deps.agentBorn(row)
    } else if (announce)
      await deps.tellOwner(event.ownerId, copy.created(event.botUsername))
  } catch (error) {
    logger.error('[managed-bots] a created bot could not be brought up', {
      bot: event.botUsername,
      owner: event.ownerId,
      error: error instanceof Error ? error.message : String(error),
    })
    if (announce)
      await deps
        .tellOwner(event.ownerId, copy.notYet(event.botUsername))
        .catch(() => undefined)
  }
}

export function installManagedBots(bot: Telegraf<any>, deps: RunnerDeps): void {
  bot.use(async (ctx, next) => {
    const manager = ctx.botInfo?.username
    if (!manager || !canManage(ctx.botInfo)) return next()

    // The update: a bot was created, or its token or owner changed.
    const updated = readManagedBotUpdate(ctx.update)
    if (updated) {
      // The service message below tells the owner; the update stays quiet so
      // one creation is announced once.
      await onManagedBot(bot, manager, updated, deps, false)
      return
    }

    const created = readManagedBotCreated(
      (ctx.update as { message?: unknown }).message
    )
    if (created) {
      await onManagedBot(bot, manager, created, deps, true)
      return
    }
    return next()
  })

  bot.command('mybot', async ctx => {
    const from = ctx.from
    if (!from) return
    const copy = copyFor(from.language_code)
    if (!canManage(ctx.botInfo)) {
      await ctx.reply(copy.elsewhere(MANAGER_BOT))
      return
    }
    const owned = await managedBotsOf(from.id).catch(() => [])
    if (owned.length) {
      await ctx.reply(copy.have(owned.map(b => ownedLine(b, copy)).join(', ')))
    }
    const ru = (from.language_code ?? 'ru').startsWith('ru')
    const name = [from.first_name, from.last_name].filter(Boolean).join(' ')
    await ctx.reply(copy.offer, {
      reply_markup: requestManagedBotKeyboard(copy.button, {
        username: suggestBotUsername({ id: from.id, username: from.username }),
        name: suggestBotName(name, ru),
      }) as any,
    })
  })

  /*
   * The team switches a client's bot on after the owner paid (there is no
   * checkout yet, as with the package orders): the date moves forward, the
   * package may change, and the owner hears it from the manager bot.
   */
  bot.command('agentbot', async ctx => {
    // Silent for everybody else: the command is the team's, not a feature.
    if (!ctx.from || !isAdmin(ctx.from.id)) return
    const text = ctx.message && 'text' in ctx.message ? ctx.message.text : ''
    const args = parseAgentBotArgs(text)
    if (!args) {
      await ctx.reply(AGENT_BOT_USAGE)
      return
    }
    try {
      const done = await extendManagedBot(
        args.botUsername,
        args.days,
        args.media
      )
      if (!done) {
        await ctx.reply(
          `Бота @${args.botUsername} нет среди созданных через /mybot.`
        )
        return
      }
      const date = day(done.paidUntil)
      await ctx.reply(
        `@${done.botUsername}: оплачен до ${date}, ${done.media ? 'с медиа' : 'только текст'}.`
      )
      await deps
        .tellOwner(
          done.ownerId,
          MANAGER_COPY.ru.extended(done.botUsername, date)
        )
        .catch(() => undefined)
    } catch (error) {
      logger.error('[managed-bots] /agentbot failed', {
        bot: args.botUsername,
        error: error instanceof Error ? error.message : String(error),
      })
      await ctx.reply('Не получилось записать оплату: база не ответила.')
    }
  })
}

/**
 * At boot, for a bot that can manage: every bot it created is brought back.
 * One failure never stops the rest.
 */
export async function relaunchManagedBots(
  bot: Telegraf<any>,
  botInfo: { username?: string },
  deps: RunnerDeps
): Promise<number> {
  if (!botInfo.username || !canManage(botInfo)) return 0
  let rows: ManagedBotRow[]
  try {
    rows = await liveManagedBots(botInfo.username)
  } catch (error) {
    logger.error('[managed-bots] could not read the list of managed bots', {
      error: error instanceof Error ? error.message : String(error),
    })
    return 0
  }
  let up = 0
  for (const row of rows) {
    try {
      await launchManagedBot(bot, row, deps, botInfo.username)
      up += 1
    } catch (error) {
      logger.error('[managed-bots] relaunch failed', {
        bot: row.botUsername,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }
  return up
}
