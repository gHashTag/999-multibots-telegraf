/**
 * Where the tabs meet the bot: /start makes them, /tabs remakes the ones the
 * person deleted, the first message of a person's own topic names it. Every call here is quiet:
 * a tab is a convenience and must never cost a person their answer.
 */
import type { Telegraf } from 'telegraf'
import { logger } from '@/utils/logger'
import { isRussianFromState } from '@/helpers/centralizedLanguage'
import {
  ensureTabs,
  knownTabs,
  nameFreshTopic,
  TABS,
  topicsEnabled,
  type EnsureOptions,
  type TabKind,
  type TabSpec,
} from './tabs'
import {
  HIRE_PREFIX,
  hireRows,
  hireable,
  offeredKinds,
  startingKinds,
} from './team'
import { appButton, appDoorLabel } from '@/navigation/helpers/appLinks'
import {
  requestManagedBotKeyboard,
  suggestBotName,
  suggestBotUsername,
} from '@/core/bot/managedBots/protocol'

function botName(ctx: any): string {
  return String(ctx.botInfo?.username ?? '')
}

/**
 * Make the tabs that join now and look after the ones the person has
 * (bot-agent-team.t27). By default the joining ones are the core and the
 * member the person's link named (`linkRoute`, the app screen of
 * `?start=app_<route>`); `opts.only` names them instead (a hire press).
 * Returns the kinds made.
 */
export async function ensureTabsQuietly(
  ctx: any,
  opts: EnsureOptions = {},
  linkRoute?: string | null
): Promise<string[]> {
  try {
    if (ctx.chat?.type !== 'private' || !topicsEnabled(ctx.botInfo)) return []
    if (!botName(ctx) || !ctx.chat?.id) return []
    const isRu = isRussianFromState(ctx)
    const only = opts.only ?? startingKinds(linkRoute)
    // Who is on the team once this call is done: the Agent tab offers the rest.
    const onTeam = new Set<string>(only)
    for (const row of (await knownTabs(botName(ctx), ctx.chat.id)) ?? [])
      onTeam.add(row.kind)
    return await ensureTabs(
      ctx.telegram,
      botName(ctx),
      ctx.chat.id,
      isRu,
      tab => tabMarkup(ctx, tab, isRu, onTeam),
      { ...opts, only }
    )
  } catch (e) {
    logger.warn('[topic-tabs] ensure failed', {
      error: e instanceof Error ? e.message : String(e),
    })
    return []
  }
}

/** A member's tab title in the person's language, emoji included. */
export function memberName(kind: string, isRu: boolean): string {
  const tab = TABS.find(t => t.kind === kind)
  return tab ? (isRu ? tab.ru : tab.en) : kind
}

/** The hire buttons for a person whose team holds `onTeam`. */
export function teamRows(
  onTeam: Iterable<string>,
  isRu: boolean
): { text: string; callback_data: string }[][] {
  return hireRows(offeredKinds(onTeam), kind => memberName(kind, isRu))
}

/**
 * A tab's first message carries one button: the mini-app screen of its route
 * (spec TAB_ROUTES), or, in "My bot" when this bot may manage bots, Telegram's
 * own bot creation sheet. The Agent tab's carries the team above it: one
 * button for each member not yet on the team (bot-agent-team.t27 offered).
 */
export function tabMarkup(
  ctx: any,
  tab: TabSpec,
  isRu: boolean,
  onTeam?: ReadonlySet<string>
): unknown {
  const sheet = mybotMarkup(ctx, tab.kind, isRu)
  if (sheet) return sheet
  const button = appButton(appDoorLabel(tab.route, isRu), tab.route, {
    chatType: 'private',
    botUsername: botName(ctx) || null,
  })
  const team = tab.kind === TABS[0].kind && onTeam ? teamRows(onTeam, isRu) : []
  const rows = [...team, ...(button ? [[button]] : [])]
  return rows.length ? { inline_keyboard: rows } : undefined
}

/**
 * The "My bot" tab opens with the same button /mybot sends: Telegram's own
 * creation sheet (Bot API 9.6 request_managed_bot). Only when this bot may
 * manage bots (getMe can_manage_bots); otherwise the tab is text only.
 */
export function mybotMarkup(ctx: any, kind: TabKind, isRu: boolean): unknown {
  if (kind !== 'mybot' || ctx.botInfo?.can_manage_bots !== true || !ctx.from) {
    return undefined
  }
  const name = [ctx.from.first_name, ctx.from.last_name]
    .filter(Boolean)
    .join(' ')
  return requestManagedBotKeyboard(
    isRu ? '🤖 Создать моего бота' : '🤖 Create my bot',
    {
      username: suggestBotUsername({
        id: ctx.from.id,
        username: ctx.from.username,
      }),
      name: suggestBotName(name, isRu),
    }
  )
}

export async function nameTopicQuietly(
  ctx: any,
  threadId: number
): Promise<void> {
  try {
    if (!topicsEnabled(ctx.botInfo) || !botName(ctx)) return
    const msg = ctx.message
    const text = msg?.text ?? msg?.caption
    await nameFreshTopic(
      ctx.telegram,
      botName(ctx),
      ctx.chat.id,
      threadId,
      text,
      msg?.reply_to_message?.forum_topic_created?.name
    )
  } catch (e) {
    logger.warn('[topic-tabs] naming failed', {
      error: e instanceof Error ? e.message : String(e),
    })
  }
}

/**
 * /tabs: make again the fixed tabs the person deleted. Nothing is forgotten
 * blindly: each stored tab is asked about, and only a tab Telegram says is
 * gone is made again. A live tab keeps its thread, its history and its name.
 */
export function registerTabsCommand(bot: Telegraf<any>): void {
  bot.command('tabs', async ctx => {
    const isRu = isRussianFromState(ctx as any)
    if (ctx.chat?.type !== 'private') return
    if (!topicsEnabled(ctx.botInfo)) {
      await ctx.reply(
        isRu
          ? 'Вкладки в этом боте пока выключены.'
          : 'Tabs are not turned on for this bot yet.'
      )
      return
    }
    await ensureTabsQuietly(ctx, { probe: true })
    await ctx.reply(isRu ? 'Вкладки на месте.' : 'Tabs are in place.')
  })

  /*
   * /team: who is on the person's team, and a button for each member who is
   * not (bot-agent-team.t27 offered). A press makes that member's tab.
   */
  bot.command('team', async ctx => {
    if (ctx.chat?.type !== 'private') return
    const isRu = isRussianFromState(ctx as any)
    if (!topicsEnabled(ctx.botInfo)) {
      await ctx.reply(
        isRu
          ? 'Вкладки в этом боте пока выключены.'
          : 'Tabs are not turned on for this bot yet.'
      )
      return
    }
    const onTeam = await teamOf(ctx)
    await ctx.reply(teamText(onTeam, isRu), teamMarkup(onTeam, isRu))
  })

  bot.action(new RegExp(`^${HIRE_PREFIX}(\\w+)$`), async ctx => {
    await ctx.answerCbQuery().catch(() => undefined)
    const kind = String((ctx as any).match?.[1] ?? '')
    if (ctx.chat?.type !== 'private' || !hireable(kind)) return
    const isRu = isRussianFromState(ctx as any)
    await ensureTabsQuietly(ctx, { only: [kind] })
    // The pressed card now offers only who is still missing; its other
    // buttons (the Agent tab's door to the app) stay where they were.
    const onTeam = await teamOf(ctx)
    const kept = keptRows((ctx.callbackQuery as any)?.message?.reply_markup)
    const rows = [...teamRows(onTeam, isRu), ...kept]
    await ctx
      .editMessageReplyMarkup(
        rows.length ? { inline_keyboard: rows } : undefined
      )
      .catch(() => undefined)
  })
}

/** The kinds on the person's team in this bot (their stored tabs). */
async function teamOf(ctx: any): Promise<Set<string>> {
  const rows = (await knownTabs(botName(ctx), ctx.chat.id)) ?? []
  return new Set(rows.filter(r => r.thread_id > 0).map(r => r.kind))
}

/** The team, as /team says it. */
export function teamText(onTeam: ReadonlySet<string>, isRu: boolean): string {
  const members = TABS.filter(t => onTeam.has(t.kind)).map(t =>
    isRu ? t.ru : t.en
  )
  const head = isRu ? 'Ваша команда' : 'Your team'
  const list = members.length
    ? members.join(', ')
    : isRu
      ? 'пока никого'
      : 'nobody yet'
  const tail = offeredKinds(onTeam).length
    ? isRu
      ? 'Позовите агента — у него появится своя вкладка.'
      : 'Call an agent and it gets a tab of its own.'
    : isRu
      ? 'Вся команда в сборе.'
      : 'The whole team is here.'
  return `${head}: ${list}.\n${tail}`
}

/**
 * The hire buttons, or no keyboard at all when the whole team is there:
 * Telegram refuses an inline keyboard without buttons.
 */
export function teamMarkup(onTeam: ReadonlySet<string>, isRu: boolean): any {
  const rows = teamRows(onTeam, isRu)
  return rows.length ? { reply_markup: { inline_keyboard: rows } } : {}
}

/** The rows of a keyboard that are not hire buttons. */
export function keptRows(markup: any): any[][] {
  const rows: any[][] = Array.isArray(markup?.inline_keyboard)
    ? markup.inline_keyboard
    : []
  return rows
    .map(row =>
      row.filter(
        (b: any) => !String(b?.callback_data ?? '').startsWith(HIRE_PREFIX)
      )
    )
    .filter(row => row.length > 0)
}
