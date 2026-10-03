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
  TRI_DEV_BOT_SUFFIX,
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
import { TRI_DEV_PACKAGE } from './triDev'

/** The farm bot people are sent to when theirs cannot create bots. */
export const MANAGER_BOT = 't27ai_bot'

export const MANAGER_COPY = {
  ru: {
    offer:
      'Создадим вашего собственного бота-агента. Он будет ваш: имя и аватар меняете в Telegram сами, а отвечает в нём наш агент от вашего имени.\n\nНажмите кнопку ниже, Telegram предложит имя — его можно поправить.',
    offerTriDev:
      'Создадим вашего бота TRI DEV — агента-разработчика. Бот будет ваш, и задачи ему даёте только вы: /task со ссылкой на задачу GitHub или текстом, в ответ — pull request и запись работы на t27.ai/term.\n\nНажмите кнопку ниже, Telegram предложит имя — его можно поправить.',
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
    offerTriDev:
      "Let's create your TRI DEV bot, a developer agent. It is yours, and only you give it tasks: /task with a GitHub issue link or text, and you get back a pull request and a recording of the work at t27.ai/term.\n\nTap the button below; Telegram will suggest a name you can edit.",
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
  '/agentbot @username <дней> media — пакет с медиа (рилсы, лицо, голос)\n' +
  '/agentbot @username <дней> tridev — пакет TRI DEV, агент-разработчик'

/** The team's /agentbot words, or null when they do not parse. */
export function parseAgentBotArgs(text: string): {
  botUsername: string
  days: number
  media?: boolean
  packageId?: string
} | null {
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
  if (kind === TRI_DEV_PACKAGE)
    return { botUsername, days, media: false, packageId: TRI_DEV_PACKAGE }
  return null
}

/**
 * The package a person asked for in /mybot, until their bot arrives. Telegram's
 * creation sheet carries no payload of ours, so the intent is held here for an
 * hour, in memory; a creation with no intent left is still recognised as TRI
 * DEV by the username we suggested for it.
 */
const INTENT_TTL_MS = 60 * 60 * 1000
const intents = new Map<number, { packageId: string; at: number }>()

export function rememberIntent(
  ownerId: number,
  packageId: string,
  now = Date.now()
): void {
  intents.set(ownerId, { packageId, at: now })
}

/** For tests: forget every intent. */
export function clearIntents(): void {
  intents.clear()
}

/** The package a created bot is for: the owner's /mybot intent, or its name. */
export function packageOfCreation(
  event: Pick<ManagedBotEvent, 'ownerId' | 'botUsername'>,
  now = Date.now()
): string | undefined {
  const intent = intents.get(event.ownerId)
  if (intent && now - intent.at < INTENT_TTL_MS) return intent.packageId
  if (event.botUsername.toLowerCase().endsWith(TRI_DEV_BOT_SUFFIX))
    return TRI_DEV_PACKAGE
  return undefined
}

/** The package named after /mybot, when it is one /mybot makes. */
export function mybotPackage(text: string): string | undefined {
  const word = text.trim().split(/\s+/)[1]?.toLowerCase()
  return word === TRI_DEV_PACKAGE ? TRI_DEV_PACKAGE : undefined
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
    const stored = await rememberManagedBot(
      event,
      managerUsername,
      packageOfCreation(event)
    )
    if (announce) intents.delete(event.ownerId)
    await launchManagedBot(
      manager,
      {
        botId: event.botId,
        botUsername: event.botUsername,
        botName: event.botName,
        ownerId: event.ownerId,
        ...(stored ? { package: stored } : {}),
      },
      deps,
      managerUsername
    )
    if (announce)
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
    const text = ctx.message && 'text' in ctx.message ? ctx.message.text : ''
    const packageId = mybotPackage(text)
    if (packageId) rememberIntent(from.id, packageId)
    await ctx.reply(packageId ? copy.offerTriDev : copy.offer, {
      reply_markup: requestManagedBotKeyboard(copy.button, {
        username: suggestBotUsername(
          { id: from.id, username: from.username },
          packageId
        ),
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
        args.media,
        args.packageId
      )
      if (!done) {
        await ctx.reply(
          `Бота @${args.botUsername} нет среди созданных через /mybot.`
        )
        return
      }
      const date = day(done.paidUntil)
      await ctx.reply(
        `@${done.botUsername}: оплачен до ${date}, ${done.package === TRI_DEV_PACKAGE ? 'TRI DEV' : done.media ? 'с медиа' : 'только текст'}.`
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

/**
 * One line per bot at boot: whether Telegram lets it manage bots. Greppable as
 * `[managed-bots] can_manage_bots=`, so a bot that lost Bot Management Mode in
 * @BotFather is seen in the logs, not in a customer's silence.
 */
const reported = new Set<string>()

export function reportManagedBotCapabilities(botInfo: {
  username?: string
  can_manage_bots?: boolean
}): boolean {
  const can = canManage(botInfo)
  const key = botInfo.username ?? ''
  if (!reported.has(key)) {
    reported.add(key)
    logger.info(
      `[managed-bots] can_manage_bots=${can} bot=${botInfo.username ?? 'unknown'}`
    )
  }
  return can
}

/** For tests: forget which bots were reported. */
export function clearCapabilityReports(): void {
  reported.clear()
}

/**
 * THE RIGHTS A MANAGER BOT ASKS FOR WHEN IT IS MADE A CHANNEL ADMIN.
 *
 * An agent posts, edits and deletes in its owner's channel and its stories,
 * and nothing more: it never promotes, restricts, invites, renames the channel
 * or acts anonymously. These are the defaults Telegram pre-ticks when the
 * owner adds the bot to a channel; the owner may still change them there.
 */
export const CHANNEL_ADMIN_RIGHTS = {
  is_anonymous: false,
  can_manage_chat: true,
  can_delete_messages: true,
  can_manage_video_chats: false,
  can_restrict_members: false,
  can_promote_members: false,
  can_change_info: false,
  can_invite_users: false,
  can_post_messages: true,
  can_edit_messages: true,
  can_pin_messages: false,
  can_post_stories: true,
  can_edit_stories: true,
  can_delete_stories: true,
  can_manage_topics: false,
} as const

export type ChannelAdminRights = Record<
  keyof typeof CHANNEL_ADMIN_RIGHTS,
  boolean
>

/**
 * The slice of Telegraf's telegram client the rights need. Called through
 * callApi with the Bot API's own field names, so `for_channels: true` is on
 * the wire exactly as written.
 */
export interface RightsTelegram {
  callApi(method: string, payload: Record<string, unknown>): Promise<unknown>
}

const sameRights = (current: unknown): boolean => {
  if (typeof current !== 'object' || current === null) return false
  const c = current as Record<string, unknown>
  return (
    Object.keys(CHANNEL_ADMIN_RIGHTS) as (keyof ChannelAdminRights)[]
  ).every(k => (c[k] === true) === CHANNEL_ADMIN_RIGHTS[k])
}

/**
 * At boot, for a bot that can manage bots: read its default channel rights and
 * write CHANNEL_ADMIN_RIGHTS only when they differ, so a restart is not a
 * write. One log line, `[managed-bots] channel_admin_rights=` with the booleans
 * and changed=. Never throws: a bot with the old defaults still answers.
 */
export async function ensureChannelAdminRights(
  telegram: RightsTelegram,
  botInfo: { username?: string; can_manage_bots?: boolean }
): Promise<{ changed: boolean } | null> {
  if (!canManage(botInfo)) return null
  try {
    const current = await telegram.callApi('getMyDefaultAdministratorRights', {
      for_channels: true,
    })
    const changed = !sameRights(current)
    if (changed) {
      await telegram.callApi('setMyDefaultAdministratorRights', {
        rights: { ...CHANNEL_ADMIN_RIGHTS },
        for_channels: true,
      })
    }
    const flags = (
      Object.keys(CHANNEL_ADMIN_RIGHTS) as (keyof ChannelAdminRights)[]
    )
      .map(k => `${k}:${CHANNEL_ADMIN_RIGHTS[k]}`)
      .join(',')
    logger.info(
      `[managed-bots] channel_admin_rights=${flags} changed=${changed} bot=${botInfo.username ?? 'unknown'}`
    )
    return { changed }
  } catch (error) {
    logger.warn('[managed-bots] channel admin rights not checked', {
      bot: botInfo.username,
      error: error instanceof Error ? error.message : String(error),
    })
    return null
  }
}
