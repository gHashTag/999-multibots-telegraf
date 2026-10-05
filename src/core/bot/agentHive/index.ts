/**
 * THE HIVE: every catalogue agent with a bot of its own, all of them in one
 * forum group, run from the manager's chat (@t27ai_bot).
 *
 *   /agents  (private, the team) each agent, its bot and state, with buttons:
 *            create the bot, pause or switch it on, a new token, add to group
 *   /hive    (in a forum supergroup, the team) makes it the hive: a topic per
 *            agent, and a link for every agent bot not yet in the group
 *
 * Creation is Telegram's Managed Bots (Bot API 9.6): the manager can only ASK,
 * and a person confirms each bot in Telegram's own sheet. Seeing each other in
 * the group needs Bot-to-Bot Communication Mode, which only @BotFather can
 * switch on. Neither is something an API call here can do, and the copy says
 * so instead of pretending.
 */

import type { Telegraf } from 'telegraf'
import { logger } from '@/utils/logger'
import { isAdmin } from '@/middleware/adminOnly'
import { requestManagedBotKeyboard } from '@/core/bot/managedBots/protocol'
import {
  agentBots,
  bindAgent,
  rememberHive,
  setHiveTopic,
  setManagedBotStatus,
  type AgentBotRow,
  type ManagedBotRow,
} from '@/core/bot/managedBots/store'
import {
  launchManagedBot,
  runningTelegram,
  isRunning,
  stopManagedBot,
  type RunnerDeps,
} from '@/core/bot/managedBots/runner'
import { HIVE_AGENTS, hiveAgent, type HiveAgent } from './catalogue'
import { agentBotUsername } from './rules'
import { claimAgent, claimedAgent } from './claims'
import {
  answerAsAgent,
  registerAgentBot,
  registerManager,
  runningAgentBots,
} from './answer'

export const HIVE_COPY = {
  ru: {
    title: '🐝 Агенты и их боты',
    noBot: 'бота нет',
    live: 'отвечает',
    paused: 'на паузе',
    down: 'не запущен',
    topic: 'тема в Улье',
    create: (a: HiveAgent) => `➕ ${a.name.ru}`,
    pause: (a: HiveAgent) => `⏸ ${a.name.ru}`,
    resume: (a: HiveAgent) => `▶️ ${a.name.ru}`,
    token: '🔑',
    hint: 'Создание: Telegram покажет окно подтверждения, имя можно поправить. В @BotFather у каждого бота включите Bot-to-Bot Communication Mode, иначе агенты не увидят друг друга в группе. Общая группа: форум, @t27ai_bot админ с правом на темы, там /hive.',
    askCreate: (a: HiveAgent, u: string) =>
      `Создаём бота для агента «${a.name.ru}». Нажмите кнопку ниже: Telegram предложит @${u}, его можно поправить.`,
    createButton: (a: HiveAgent) => `🤖 Создать ${a.name.ru}`,
    born: (a: HiveAgent, bot: string) =>
      `✅ @${bot} — это ${a.icon} ${a.name.ru}. Напишите ему в личку, чтобы проверить. В Улей: /hive в группе.`,
    paused1: (bot: string) => `⏸ @${bot} на паузе.`,
    resumed: (bot: string) => `▶️ @${bot} снова отвечает.`,
    tokenDone: (bot: string) =>
      `🔑 У @${bot} новый токен, бот перезапустится сам.`,
    failed: 'Не получилось: Telegram или база не ответили. Подробности в логе.',
    notForum:
      'Улей — это группа с темами. Включите «Темы» в настройках группы и отправьте /hive ещё раз.',
    noRights:
      'Сделайте меня админом с правом «Управление темами» и отправьте /hive ещё раз.',
    hiveReady: (n: number) => `🐝 Улей готов: тем агентов — ${n}.`,
    missing:
      'Ещё не в группе — добавьте кнопками ниже (боту нужны права админа, тогда он видит все сообщения):',
    noAgents: 'У агентов ещё нет ботов. Создайте их в личке: /agents',
    topicIntro: (a: HiveAgent, bot: string) =>
      `${a.icon} ${a.name.ru} — ${a.role.ru}\nПишите здесь: отвечает @${bot}. В общей теме зовите его тегом или @all.`,
    only: 'Эта команда — для команды платформы.',
  },
  en: {
    title: '🐝 Agents and their bots',
    noBot: 'no bot',
    live: 'answering',
    paused: 'paused',
    down: 'not running',
    topic: 'hive topic',
    create: (a: HiveAgent) => `➕ ${a.name.en}`,
    pause: (a: HiveAgent) => `⏸ ${a.name.en}`,
    resume: (a: HiveAgent) => `▶️ ${a.name.en}`,
    token: '🔑',
    hint: 'Creating: Telegram shows a confirmation sheet, and the name can be edited. In @BotFather switch on Bot-to-Bot Communication Mode for every bot, or the agents will not see each other in the group. The shared group: a forum, @t27ai_bot an admin who may manage topics, then /hive there.',
    askCreate: (a: HiveAgent, u: string) =>
      `Creating the bot for "${a.name.en}". Tap the button below: Telegram will suggest @${u}, which you can edit.`,
    createButton: (a: HiveAgent) => `🤖 Create ${a.name.en}`,
    born: (a: HiveAgent, bot: string) =>
      `✅ @${bot} is ${a.icon} ${a.name.en}. Message it privately to try it. For the hive: /hive in the group.`,
    paused1: (bot: string) => `⏸ @${bot} is paused.`,
    resumed: (bot: string) => `▶️ @${bot} is answering again.`,
    tokenDone: (bot: string) =>
      `🔑 @${bot} has a new token and will restart by itself.`,
    failed:
      'That did not work: Telegram or the database did not answer. See the log.',
    notForum:
      'The hive is a group with topics. Switch on Topics in the group settings and send /hive again.',
    noRights: 'Make me an admin who may manage topics, then send /hive again.',
    hiveReady: (n: number) => `🐝 The hive is ready: ${n} agent topics.`,
    missing:
      'Not in the group yet -- add them with the buttons below (as admins, so they see every message):',
    noAgents: 'No agent has a bot yet. Create them privately: /agents',
    topicIntro: (a: HiveAgent, bot: string) =>
      `${a.icon} ${a.name.en} -- ${a.role.en}\nWrite here and @${bot} answers. In the general topic call it by tag or @all.`,
    only: 'This command is for the platform team.',
  },
} as const

type Copy = (typeof HIVE_COPY)['ru'] | (typeof HIVE_COPY)['en']

const copyFor = (language?: string): Copy =>
  (language ?? 'ru').startsWith('ru') ? HIVE_COPY.ru : HIVE_COPY.en

/** Adding a bot to a group as an admin, so it reads every message there. */
export const addToGroupLink = (bot: string): string =>
  `https://t.me/${bot}?startgroup=hive&admin=pin_messages+manage_topics`

/** One line of /agents. */
export function agentLine(
  a: HiveAgent,
  row: AgentBotRow | undefined,
  running: boolean,
  copy: Copy,
  ru: boolean
): string {
  const name = `${a.icon} ${ru ? a.name.ru : a.name.en}`
  if (!row) return `${name} — ${copy.noBot}`
  const state =
    row.status !== 'live' ? copy.paused : running ? copy.live : copy.down
  const topic = row.hiveTopicId !== undefined ? `, ${copy.topic}` : ''
  return `${name} — @${row.botUsername} (${state}${topic})`
}

/** The /agents keyboard: create where there is no bot, pause or resume where there is. */
export function agentsKeyboard(
  rows: AgentBotRow[],
  copy: Copy
): { inline_keyboard: Record<string, unknown>[][] } {
  const byAgent = new Map(rows.map(r => [r.agentId, r]))
  const buttons: Record<string, unknown>[] = []
  for (const a of HIVE_AGENTS) {
    const row = byAgent.get(a.id)
    if (!row)
      buttons.push({
        text: copy.create(a),
        callback_data: `hive:new:${a.id}`,
        style: 'success',
      })
    else if (row.status === 'live')
      buttons.push({
        text: copy.pause(a),
        callback_data: `hive:pause:${row.botId}`,
        style: 'danger',
      })
    else
      buttons.push({
        text: copy.resume(a),
        callback_data: `hive:live:${row.botId}`,
        style: 'primary',
      })
  }
  const grid: Record<string, unknown>[][] = []
  for (let i = 0; i < buttons.length; i += 2) grid.push(buttons.slice(i, i + 2))
  return { inline_keyboard: grid }
}

async function showAgents(
  manager: string,
  language: string | undefined,
  send: (text: string, extra: Record<string, unknown>) => Promise<unknown>
): Promise<void> {
  const copy = copyFor(language)
  const ru = copy === HIVE_COPY.ru
  const rows = await agentBots(manager)
  const byAgent = new Map(rows.map(r => [r.agentId, r]))
  const lines = HIVE_AGENTS.map(a =>
    agentLine(
      a,
      byAgent.get(a.id),
      isRunning(byAgent.get(a.id)?.botId ?? 0),
      copy,
      ru
    )
  )
  await send([copy.title, '', ...lines, '', copy.hint].join('\n'), {
    reply_markup: agentsKeyboard(rows, copy),
    link_preview_options: { is_disabled: true },
  })
}

/** The bot is up as an agent: its profile says which, and the owner hears it. */
async function agentBorn(
  row: ManagedBotRow,
  tellOwner: RunnerDeps['tellOwner']
): Promise<void> {
  const a = hiveAgent(row.agentId)
  if (!a) return
  const tg = runningTelegram(row.botId)
  if (tg) {
    const steps: [string, Record<string, unknown>][] = [
      [
        'setMyDescription',
        { description: `${a.icon} ${a.name.en} -- ${a.role.en}` },
      ],
      [
        'setMyDescription',
        {
          description: `${a.icon} ${a.name.ru} — ${a.role.ru}`,
          language_code: 'ru',
        },
      ],
      ['setMyShortDescription', { short_description: a.role.en.slice(0, 120) }],
      [
        'setMyShortDescription',
        { short_description: a.role.ru.slice(0, 120), language_code: 'ru' },
      ],
    ]
    for (const [method, body] of steps)
      await tg.callApi(method as any, body as any).catch(error =>
        logger.warn('[agent-hive] profile step failed', {
          bot: row.botUsername,
          method,
          error: error instanceof Error ? error.message : String(error),
        })
      )
  }
  await tellOwner(row.ownerId, HIVE_COPY.ru.born(a, row.botUsername))
}

/** The RunnerDeps additions that make a managed bot an agent's bot. */
export function agentHiveDeps(
  base: RunnerDeps
): Pick<RunnerDeps, 'asAgent' | 'claimAgent' | 'agentBorn'> {
  return {
    asAgent: (ctx, row) => answerAsAgent(ctx, row),
    claimAgent: async (event, manager) => {
      if (!isAdmin(event.ownerId)) return null
      const agentId = claimedAgent(event)
      if (!agentId) return null
      return bindAgent(event.botId, agentId, manager)
    },
    agentBorn: row => agentBorn(row, base.tellOwner),
  }
}

/** /hive in a forum group: a topic for each agent bot, and who is missing. */
async function makeHive(
  bot: Telegraf<any>,
  manager: string,
  chat: { id: number; type: string },
  ownerId: number,
  copy: Copy,
  ru: boolean
): Promise<{ text: string; extra?: Record<string, unknown> }> {
  const full = (await bot.telegram.getChat(chat.id)) as { is_forum?: boolean }
  if (chat.type !== 'supergroup' || !full.is_forum)
    return { text: copy.notForum }
  const me = await bot.telegram.getChatMember(chat.id, bot.botInfo!.id)
  const mayTopics =
    me.status === 'creator' ||
    (me.status === 'administrator' &&
      (me as { can_manage_topics?: boolean }).can_manage_topics === true)
  if (!mayTopics) return { text: copy.noRights }

  const rows = (await agentBots(manager)).filter(r => r.status === 'live')
  if (!rows.length) return { text: copy.noAgents }
  await rememberHive(chat.id, ownerId, manager)

  let topics = 0
  const missing: AgentBotRow[] = []
  for (const row of rows) {
    const a = hiveAgent(row.agentId)
    if (!a) continue
    let topicId = row.hiveChatId === chat.id ? row.hiveTopicId : undefined
    if (topicId === undefined) {
      const topic = (await bot.telegram.callApi(
        'createForumTopic' as any,
        {
          chat_id: chat.id,
          name: `${a.icon} ${ru ? a.name.ru : a.name.en}`.slice(0, 128),
        } as any
      )) as { message_thread_id: number }
      topicId = topic.message_thread_id
      await setHiveTopic(row.botId, chat.id, topicId)
      await bot.telegram
        .sendMessage(chat.id, copy.topicIntro(a, row.botUsername), {
          message_thread_id: topicId,
        } as any)
        .catch(() => undefined)
    }
    topics += 1
    registerAgentBot({ ...row, hiveChatId: chat.id, hiveTopicId: topicId })
    const member = await bot.telegram
      .getChatMember(chat.id, row.botId)
      .catch(() => null)
    if (!member || member.status === 'left' || member.status === 'kicked')
      missing.push(row)
  }
  if (!missing.length) return { text: copy.hiveReady(topics) }
  return {
    text: `${copy.hiveReady(topics)}\n\n${copy.missing}`,
    extra: {
      reply_markup: {
        inline_keyboard: missing.map(r => [
          { text: `➕ @${r.botUsername}`, url: addToGroupLink(r.botUsername) },
        ]),
      },
    },
  }
}

const canManage = (botInfo: unknown): boolean =>
  (botInfo as { can_manage_bots?: boolean } | undefined)?.can_manage_bots ===
  true

/**
 * On the manager bot, next to installManagedBots. Inert on a bot without Bot
 * Management Mode, and silent to everybody outside the team.
 */
export function installAgentHive(bot: Telegraf<any>, deps: RunnerDeps): void {
  bot.command('agents', async (ctx, next) => {
    if (!ctx.from || !isAdmin(ctx.from.id) || !canManage(ctx.botInfo))
      return next()
    if (ctx.chat?.type !== 'private') return
    registerManager(ctx.botInfo.id)
    try {
      await showAgents(ctx.botInfo.username, ctx.from.language_code, (t, e) =>
        ctx.reply(t, e as any)
      )
    } catch (error) {
      logger.error('[agent-hive] /agents failed', {
        error: error instanceof Error ? error.message : String(error),
      })
      await ctx.reply(copyFor(ctx.from.language_code).failed)
    }
  })

  bot.command('hive', async (ctx, next) => {
    if (!ctx.from || !canManage(ctx.botInfo)) return next()
    const chat = ctx.chat
    if (!chat || (chat.type !== 'group' && chat.type !== 'supergroup'))
      return next()
    const copy = copyFor(ctx.from.language_code)
    if (!isAdmin(ctx.from.id)) {
      await ctx.reply(copy.only)
      return
    }
    registerManager(ctx.botInfo.id)
    try {
      const out = await makeHive(
        bot,
        ctx.botInfo.username,
        chat,
        ctx.from.id,
        copy,
        copy === HIVE_COPY.ru
      )
      await ctx.reply(out.text, out.extra as any)
    } catch (error) {
      logger.error('[agent-hive] /hive failed', {
        chat: chat.id,
        error: error instanceof Error ? error.message : String(error),
      })
      await ctx.reply(copy.failed)
    }
  })

  bot.action(/^hive:(new|pause|live|token):([a-z0-9-]+)$/, async ctx => {
    await ctx.answerCbQuery().catch(() => undefined)
    if (!ctx.from || !isAdmin(ctx.from.id) || !canManage(ctx.botInfo)) return
    const [, verb, arg] = ctx.match
    const manager = ctx.botInfo.username
    const copy = copyFor(ctx.from.language_code)
    try {
      if (verb === 'new') {
        const a = hiveAgent(arg)
        if (!a) return
        claimAgent(ctx.from.id, a.id)
        const username = agentBotUsername(a.id)
        await ctx.reply(copy.askCreate(a, username), {
          reply_markup: requestManagedBotKeyboard(copy.createButton(a), {
            username,
            name: copy === HIVE_COPY.ru ? a.name.ru : a.name.en,
          }) as any,
        })
        return
      }
      const botId = Number(arg)
      const row = (await agentBots(manager)).find(r => r.botId === botId)
      if (!row) return
      if (verb === 'pause') {
        await setManagedBotStatus(botId, 'paused')
        stopManagedBot(botId)
        await ctx.reply(copy.paused1(row.botUsername))
      } else if (verb === 'live') {
        const live = await setManagedBotStatus(botId, 'live')
        if (live) await launchManagedBot(bot, live, deps, manager)
        await ctx.reply(copy.resumed(row.botUsername))
      } else {
        // Telegram re-sends managed_bot with the new token; onManagedBot
        // relaunches the bot as the same agent from its row.
        await ctx.telegram.callApi(
          'replaceManagedBotToken' as any,
          {
            user_id: botId,
          } as any
        )
        await ctx.reply(copy.tokenDone(row.botUsername))
      }
      await showAgents(manager, ctx.from.language_code, (t, e) =>
        ctx.editMessageText(t, e as any).catch(() => undefined)
      )
    } catch (error) {
      logger.error('[agent-hive] a button failed', {
        verb,
        error: error instanceof Error ? error.message : String(error),
      })
      await ctx.reply(copy.failed)
    }
  })
}

/** At boot: the manager is known as a hive bot before any message arrives. */
export function noteManager(botInfo: { id?: number }): void {
  if (botInfo.id) registerManager(botInfo.id)
}

export { runningAgentBots }
