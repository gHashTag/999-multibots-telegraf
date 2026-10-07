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
  nameFreshTopic,
  topicsEnabled,
  type EnsureOptions,
  type TabKind,
  type TabSpec,
} from './tabs'
import { appButton, appDoorLabel } from '@/navigation/helpers/appLinks'
import {
  requestManagedBotKeyboard,
  suggestBotName,
  suggestBotUsername,
} from '@/core/bot/managedBots/protocol'

function botName(ctx: any): string {
  return String(ctx.botInfo?.username ?? '')
}

export async function ensureTabsQuietly(
  ctx: any,
  opts: EnsureOptions = {}
): Promise<void> {
  try {
    if (ctx.chat?.type !== 'private' || !topicsEnabled(ctx.botInfo)) return
    if (!botName(ctx) || !ctx.chat?.id) return
    const isRu = isRussianFromState(ctx)
    await ensureTabs(
      ctx.telegram,
      botName(ctx),
      ctx.chat.id,
      isRu,
      tab => tabMarkup(ctx, tab, isRu),
      opts
    )
  } catch (e) {
    logger.warn('[topic-tabs] ensure failed', {
      error: e instanceof Error ? e.message : String(e),
    })
  }
}

/**
 * A tab's first message carries one button: the mini-app screen of its route
 * (spec TAB_ROUTES), or, in "My bot" when this bot may manage bots, Telegram's
 * own bot creation sheet.
 */
export function tabMarkup(ctx: any, tab: TabSpec, isRu: boolean): unknown {
  const sheet = mybotMarkup(ctx, tab.kind, isRu)
  if (sheet) return sheet
  const button = appButton(appDoorLabel(tab.route, isRu), tab.route, {
    chatType: 'private',
    botUsername: botName(ctx) || null,
  })
  return button ? { inline_keyboard: [[button]] } : undefined
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
}
