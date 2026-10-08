/**
 * WHAT A PRESSED MENU LEAVES BEHIND.
 *
 * Spec of record: bot-menu-press.t27 (gHashTag/t27#7824). Owner, 2026-10-08:
 * "the agent keeps writing the same menu everywhere, asked and unasked -- put
 * the logic in order".
 *
 * A press on a standard menu button (an `act:` callback) is answered with a
 * new message -- a scene, a list, a contact -- that carries what that answer
 * earned. Until now the pressed message kept its own copy of the menu, so
 * every press added one more identical keyboard to the chat. Now the pressed
 * message drops its standard menu buttons and keeps every other button it had
 * (a pay link, a look, the app): at any moment the live menu is the newest one.
 *
 * editMessageReplyMarkup is old Bot API, so this works the same on the cloud
 * and on the farm's self-hosted Bot API server (services/telegramApi.ts).
 *
 * The three rules below are the spec's functions, mirrored one for one; the
 * spec's constant is imported. src/spec/bot-menu-press.test.ts runs every
 * test of the spec against these.
 */
import type { InlineKeyboardButton } from 'telegraf/types'
import * as SPEC from '@/spec/bot-menu-press.gen'
import { ACTION_PREFIX } from './actionButtons'
import { logger } from '@/utils/logger'

/** spec keeps_button: a button stays unless it is a standard menu action. */
export const keepsButton = (isMenuAction: boolean): boolean => !isMenuAction

/** spec edits_markup: edit only when a button was removed (no no-op edits). */
export const editsMarkup = (removed: number): boolean => removed > 0

/** spec removes_keyboard: with nothing left, remove the keyboard, never send it empty. */
export const removesKeyboard = (kept: number): boolean => kept === 0

/** A standard menu action: its callback starts with the act: prefix. */
const isMenuAction = (button: InlineKeyboardButton): boolean => {
  const data = (button as { callback_data?: unknown }).callback_data
  return typeof data === 'string' && data.startsWith(ACTION_PREFIX)
}

/** The pressed keyboard without its standard menu buttons, and what was counted. */
export function withoutMenu(rows: readonly InlineKeyboardButton[][]): {
  rows: InlineKeyboardButton[][]
  removed: number
  kept: number
} {
  let removed = 0
  let kept = 0
  const left: InlineKeyboardButton[][] = []
  for (const row of rows ?? []) {
    const stays = (row ?? []).filter(button => {
      const keep = keepsButton(isMenuAction(button))
      if (keep) kept++
      else removed++
      return keep
    })
    if (stays.length > 0) left.push(stays)
  }
  return { rows: left, removed, kept }
}

/**
 * Take the standard menu off the message that was pressed. Returns whether the
 * message was edited. Never throws: a message too old to edit, already changed
 * or deleted costs the person nothing -- the answer goes out either way.
 */
export async function dropPressedMenu(ctx: any): Promise<boolean> {
  const rows = ctx?.callbackQuery?.message?.reply_markup?.inline_keyboard
  if (!Array.isArray(rows)) return false
  const left = withoutMenu(rows)
  if (!editsMarkup(left.removed)) return false
  try {
    await ctx.editMessageReplyMarkup(
      removesKeyboard(left.kept) ? undefined : { inline_keyboard: left.rows }
    )
    return true
  } catch (e) {
    logger.debug('[pressed-menu] the old menu stayed', {
      error: e instanceof Error ? e.message.slice(0, 120) : String(e),
    })
    return false
  }
}

/**
 * What every act:* handler calls right after answerCbQuery. The spec says the
 * answer never waits for the old menu to go (ANSWER_WAITS_FOR_EDIT), so the
 * edit runs on its own and this returns at once; callers may `await` it, which
 * honours the constant whichever way the spec sets it.
 */
export function leavePressedMenu(ctx: any): Promise<boolean> | undefined {
  const edit = dropPressedMenu(ctx)
  if (SPEC.ANSWER_WAITS_FOR_EDIT) return edit
  void edit
  return undefined
}
