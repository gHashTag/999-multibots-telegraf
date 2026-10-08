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
import { replyToOne } from '@/navigation/helpers/answerDraft'
import { HIVE_AGENTS, hiveAgent, type HiveAgent } from './catalogue'
import * as SPEC from '@/spec/agent-hive-group.gen'
import { agentBotUsername, briefFits, maySetBrief, summaryCount } from './rules'
import { briefFor, lastLines, noteMute, noteStop, saveBrief } from './room'
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
    already: (bot: string) => `У этого агента уже есть бот: @${bot}.`,
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
      `${a.icon} ${a.name.ru} — ${a.role.ru}\nПишите здесь: отвечает ${bot}. В общей теме зовите его тегом или @all.`,
    only: 'Эта команда — для команды платформы.',
    stopped: (min: number) =>
      `⏹ Агенты не отвечают друг другу ${min} мин. Людям отвечают как обычно.`,
    muted: (who: string, min: number) =>
      `🔕 ${who} в этой теме отвечает только на свой тег — ${min} мин.`,
    everyone: 'Агенты',
    briefSet: (topic: boolean) =>
      topic ? '📌 Вводная темы сохранена.' : '📌 Вводная группы сохранена.',
    briefCleared: '📌 Вводная убрана.',
    briefLong: (max: number) => `Вводная длиннее ${max} знаков — сократите.`,
    briefAdmins: 'Вводную задают только админы группы.',
    briefShow: (b: string) =>
      b ? `📌 Сейчас: ${b}` : '📌 Вводной нет. /brief текст — задать.',
    summaryEmpty: 'В этой теме я пока ничего не видел — сводить нечего.',
    summaryAsk: (n: number, lines: string) =>
      `Сведи коротко, по-русски, последние ${n} сообщений темы: о чём договорились, что решено, кто что делает, что открыто.\n\n${lines}`,
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
    already: (bot: string) => `This agent already has a bot: @${bot}.`,
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
      `${a.icon} ${a.name.en} -- ${a.role.en}\nWrite here and ${bot} answers. In the general topic call it by tag or @all.`,
    only: 'This command is for the platform team.',
    stopped: (min: number) =>
      `⏹ The agents stop answering each other for ${min} min. People are answered as usual.`,
    muted: (who: string, min: number) =>
      `🔕 ${who} answers only its own tag in this topic for ${min} min.`,
    everyone: 'Every agent',
    briefSet: (topic: boolean) =>
      topic ? '📌 Topic brief saved.' : '📌 Group brief saved.',
    briefCleared: '📌 Brief cleared.',
    briefLong: (max: number) =>
      `The brief is longer than ${max} characters -- please shorten it.`,
    briefAdmins: "Only the group's admins set a brief.",
    briefShow: (b: string) =>
      b ? `📌 Now: ${b}` : '📌 No brief. /brief text -- set one.',
    summaryEmpty:
      'I have not seen anything in this topic yet -- nothing to sum up.',
    summaryAsk: (n: number, lines: string) =>
      `Sum up briefly, in English, the last ${n} messages of this topic: what was agreed, what was decided, who does what, what is open.\n\n${lines}`,
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

/**
 * The /agents keyboard, a row per agent: create where there is no bot; where
 * there is one, pause or resume it and give it a new token.
 */
export function agentsKeyboard(
  rows: AgentBotRow[],
  copy: Copy
): { inline_keyboard: Record<string, unknown>[][] } {
  const byAgent = new Map(rows.map(r => [r.agentId, r]))
  const grid: Record<string, unknown>[][] = []
  for (const a of HIVE_AGENTS) {
    const row = byAgent.get(a.id)
    if (!row) {
      grid.push([
        {
          text: copy.create(a),
          callback_data: `hive:new:${a.id}`,
          style: 'success',
        },
      ])
      continue
    }
    const live = row.status === 'live'
    grid.push([
      {
        text: live ? copy.pause(a) : copy.resume(a),
        callback_data: `hive:${live ? 'pause' : 'live'}:${row.botId}`,
        style: live ? 'danger' : 'primary',
      },
      { text: copy.token, callback_data: `hive:token:${row.botId}` },
    ])
  }
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

  installRoomCommands(bot)

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
        // A second tap must not ask Telegram for a second bot of one agent.
        const has = (await agentBots(manager)).find(r => r.agentId === a.id)
        if (has) {
          await ctx.reply(copy.already(has.botUsername))
          return
        }
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

const minutes = (ms: number): number => Math.round(ms / 60_000)

/** The hive group this update is in, with its thread; null elsewhere. */
function hiveRoom(ctx: any): { chat: number; thread?: number } | null {
  const chat = ctx.chat
  if (!chat || (chat.type !== 'group' && chat.type !== 'supergroup'))
    return null
  if (!runningAgentBots().some(b => b.hiveChatId === chat.id)) return null
  const m = ctx.message as
    | { is_topic_message?: boolean; message_thread_id?: number }
    | undefined
  return {
    chat: chat.id,
    ...(m?.is_topic_message ? { thread: m.message_thread_id } : {}),
  }
}

/** The text after the command word, trimmed. */
const argOf = (text: string | undefined): string =>
  String(text ?? '')
    .replace(/^\/\S+\s*/, '')
    .trim()

/**
 * /stop, /mute, /brief and /summary in a hive group (spec agent-hive-group.t27
 * v2, v3). The manager answers them; the agent bots ignore every command
 * (answer.ts), so one /stop is one reply, not nine. What concerns only the
 * person who asked -- a refusal, the brief in force, "nothing to sum up" -- is
 * ephemeral (bot-agent-stream.t27 ephemeral); a stop or a mute is for all.
 */
export function installRoomCommands(
  bot: Telegraf<any>,
  ask: (
    identity: string,
    text: string,
    room: string
  ) => Promise<string> = defaultAsk
): void {
  bot.command('stop', async (ctx, next) => {
    const room = hiveRoom(ctx)
    if (!room || !ctx.from || ctx.from.is_bot) return next()
    noteStop(room.chat)
    await ctx.reply(
      copyFor(ctx.from.language_code).stopped(minutes(SPEC.STOP_WINDOW_MS))
    )
  })

  bot.command('mute', async (ctx, next) => {
    const room = hiveRoom(ctx)
    if (!room || !ctx.from || ctx.from.is_bot) return next()
    const copy = copyFor(ctx.from.language_code)
    // "/mute @t27_coder_bot" mutes one agent; a bare /mute, all of them.
    const named = argOf(ctx.message?.text).replace(/^@/, '').toLowerCase()
    const target = named
      ? runningAgentBots().find(
          b =>
            b.hiveChatId === room.chat && b.botUsername.toLowerCase() === named
        )
      : undefined
    noteMute(room.chat, room.thread, target?.botId)
    await ctx.reply(
      copy.muted(
        target ? `@${target.botUsername}` : copy.everyone,
        minutes(SPEC.MUTE_MS)
      )
    )
  })

  bot.command('brief', async (ctx, next) => {
    const room = hiveRoom(ctx)
    if (!room || !ctx.from) return next()
    const copy = copyFor(ctx.from.language_code)
    const text = argOf(ctx.message?.text)
    // A bare /brief shows the brief in force; it changes nothing.
    if (!text) {
      await replyToOne(
        ctx,
        copy.briefShow(await briefFor(room.chat, room.thread))
      )
      return
    }
    const member = await ctx.telegram
      .getChatMember(room.chat, ctx.from.id)
      .catch(() => null)
    const isAdmin =
      member?.status === 'creator' || member?.status === 'administrator'
    if (!maySetBrief(isAdmin, ctx.from.is_bot === true)) {
      await replyToOne(ctx, copy.briefAdmins)
      return
    }
    // "/brief -" clears it: an empty brief is accepted (spec brief_fits).
    const brief = text === '-' ? '' : text
    if (!briefFits([...brief].length)) {
      await replyToOne(ctx, copy.briefLong(SPEC.MAX_BRIEF_CHARS))
      return
    }
    try {
      await saveBrief(room.chat, room.thread, brief, ctx.from.id)
      await ctx.reply(
        brief ? copy.briefSet(room.thread !== undefined) : copy.briefCleared
      )
    } catch (error) {
      logger.error('[agent-hive] /brief not saved', {
        chat: room.chat,
        error: error instanceof Error ? error.message : String(error),
      })
      await ctx.reply(copy.failed)
    }
  })

  bot.command('summary', async (ctx, next) => {
    const room = hiveRoom(ctx)
    if (!room || !ctx.from || ctx.from.is_bot) return next()
    const copy = copyFor(ctx.from.language_code)
    const asked = Number.parseInt(argOf(ctx.message?.text), 10)
    const count = summaryCount(Number.isInteger(asked) && asked > 0 ? asked : 0)
    const lines = lastLines(room.chat, room.thread, count)
    if (!lines.length) {
      await replyToOne(ctx, copy.summaryEmpty)
      return
    }
    try {
      await ctx.sendChatAction('typing').catch(() => undefined)
      const said = lines.map(l => `${l.who}: ${l.text}`).join('\n')
      // The person who asked pays for the turn, as for any agent turn.
      const answer = await ask(
        String(ctx.from.id),
        copy.summaryAsk(lines.length, said),
        String(room.chat)
      )
      await ctx.reply(answer.slice(0, 4000) || copy.failed)
    } catch (error) {
      logger.error('[agent-hive] /summary failed', {
        chat: room.chat,
        error: error instanceof Error ? error.message : String(error),
      })
      await ctx.reply(copy.failed)
    }
  })
}

async function defaultAsk(
  identity: string,
  text: string,
  room: string
): Promise<string> {
  const relay = await import('@/services/trinityAgent')
  const answer = await relay.спроситьАгента(identity, text, { room }) // cyrillic-ok: pre-existing export
  return answer.текст // cyrillic-ok: pre-existing field
}

/** At boot: the manager is known as a hive bot before any message arrives. */
export function noteManager(botInfo: { id?: number }): void {
  if (botInfo.id) registerManager(botInfo.id)
}

export { runningAgentBots }
