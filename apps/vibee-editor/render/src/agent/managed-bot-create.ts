/**
 * THE AGENT CREATES A TELEGRAM BOT -- THROUGH BOT API 9.6 MANAGED BOTS.
 *
 * Before this tool the agent, asked for a bot, walked the person through
 * /newbot at @BotFather card by card, or said bots are made only there. Since
 * Bot API 9.6 (2026-04-03) a manager bot can open Telegram's own creation
 * sheet: the link t.me/newbot/{manager}/{username}?name= in any surface, and
 * the `request_managed_bot` reply button in a private chat with the manager.
 * The person confirms in Telegram's sheet; Telegram creates the bot; the
 * manager receives a `managed_bot` update, which the bot service already
 * handles (src/core/bot/managedBots).
 *
 * ── THE ONE SWITCH ──────────────────────────────────────────────────────────
 *
 * A bot may manage others only after its owner turns on "Bot Management Mode"
 * in @BotFather's Mini App (https://core.telegram.org/bots/features#managed-bots).
 * getMe answers it as `can_manage_bots`. So every call asks getMe of the
 * manager first. False -> an honest refusal naming that path. It never falls
 * back to scripting /newbot: a bot created by a script through somebody's
 * account is a bot whose token passed through us, which is the thing the
 * managed path exists to avoid.
 *
 * ── NO TOKEN LEAVES ─────────────────────────────────────────────────────────
 *
 * The manager's token is used for getMe and sendMessage and for nothing
 * else: not returned, not logged, not stored. The new bot's token is never
 * asked for here at all -- getManagedBotToken is the bot service's business.
 * Errors are reduced to an HTTP status or Telegram's description, never a URL
 * (the Bot API URL contains the token).
 */

import type { AgentTool, ToolContext } from './tools'
import { tokenForBot } from './bot-farm'
import { telegramApiFor } from '../telegram-api'
import {
  BOT_USERNAME_RE,
  newBotLink,
  requestManagedBotKeyboard,
  suggestBotName,
  suggestBotUsername,
} from '../managed-bots-protocol'

/** The farm bot that manages the others (the bot service's MANAGER_BOT). */
export const MANAGER_BOT = 't27ai_bot'

/** Verified on core.telegram.org/bots/features, 2026-10-03. */
export const BOTFATHER_PATH =
  '@BotFather -> open its Mini App (https://t.me/BotFather?startapp) -> ' +
  `@${MANAGER_BOT} -> Bot Settings -> enable "Bot Management Mode"; ` +
  'then restart the bot service so it re-reads getMe.'
export const BOTFATHER_SOURCE =
  'https://core.telegram.org/bots/features#managed-bots'

type BotApiCall = (
  method: string,
  body?: Record<string, unknown>
) => Promise<{ ok: boolean; result?: any; description?: string }>

export interface CreateBotDeps {
  /** A Bot API caller bound to the manager bot, or null if the render has no token for it. */
  managerApi(): Promise<BotApiCall | null>
}

const defaultDeps: CreateBotDeps = {
  async managerApi() {
    const bot = await tokenForBot(MANAGER_BOT)
    if (!bot) return null
    const base = telegramApiFor(bot.token)
    return async (method, body) => {
      try {
        const r = await fetch(`${base}/${method}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body ?? {}),
        })
        const j: any = await r.json().catch(() => ({}))
        return {
          ok: Boolean(j?.ok),
          result: j?.result,
          description: j?.ok
            ? undefined
            : String(j?.description ?? `HTTP ${r.status}`),
        }
      } catch {
        // The thrown error may carry the URL, which carries the token.
        return { ok: false, description: 'network error' }
      }
    }
  },
}

function cleanUsername(raw: unknown): string {
  return String(raw ?? '')
    .trim()
    .replace(/^@/, '')
}

export function makeCreateBotTool(
  deps: CreateBotDeps = defaultDeps
): AgentTool {
  return {
    name: 'tg_create_bot',
    description:
      'Create a new Telegram bot for the person through Bot API Managed Bots: ' +
      'returns the t.me/newbot/<manager>/<username> link that opens ' +
      "Telegram's own creation sheet " +
      `(managed by @${MANAGER_BOT}) and, in the bot, sends a one-tap button. ` +
      'The person confirms in Telegram; no token is ever shown. Use this ' +
      'instead of walking anyone through /newbot at @BotFather. If management ' +
      'is not switched on yet it says exactly which switch.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Display name to suggest.' },
        username: {
          type: 'string',
          description:
            'Username to suggest (5-32 chars, ends in "bot"). Optional.',
        },
        lang: { type: 'string', enum: ['ru', 'en'] },
      },
    },
    async handler(args: any, ctx: ToolContext) {
      const isRu = args?.lang !== 'en'
      const asked = cleanUsername(args?.username)
      const idNum =
        Number(String(ctx?.telegramId ?? '').replace(/\D/g, '')) || 0
      const username = BOT_USERNAME_RE.test(asked)
        ? asked
        : suggestBotUsername({ id: idNum, username: asked || undefined })
      const name =
        String(args?.name ?? '')
          .trim()
          .slice(0, 64) || suggestBotName('', isRu)
      const suggested = { username, name }
      const usernameNote =
        asked && asked !== username
          ? `"${asked}" is not a valid bot username; suggested "${username}" instead.`
          : undefined

      const api = await deps.managerApi()
      if (!api) {
        return {
          ok: false,
          state: 'manager_unavailable',
          error: `The render holds no token for @${MANAGER_BOT}; cannot ask Telegram.`,
        }
      }
      const me = await api('getMe')
      if (!me.ok) {
        return {
          ok: false,
          state: 'manager_unreachable',
          error: `getMe for @${MANAGER_BOT} failed: ${me.description ?? 'unknown'}`,
        }
      }
      if (me.result?.can_manage_bots !== true) {
        return {
          ok: false,
          state: 'management_off',
          error:
            `@${MANAGER_BOT} cannot create bots yet: Bot Management Mode is off ` +
            '(getMe.can_manage_bots is false). This is one switch the bot owner ' +
            'flips once; do not script /newbot instead.',
          how_to_enable: BOTFATHER_PATH,
          source: BOTFATHER_SOURCE,
          suggested,
          ...(usernameNote ? { username_note: usernameNote } : {}),
        }
      }

      const link = newBotLink(MANAGER_BOT, suggested)
      let button_sent = false
      let button_note: string | undefined
      if (idNum > 0) {
        const label = isRu ? 'Создать бота' : 'Create the bot' // cyrillic-ok: button label
        const sent = await api('sendMessage', {
          chat_id: idNum,
          text: isRu
            ? `Нажмите кнопку — Telegram откроет создание бота @${username}. Можно и по ссылке: ${link}` // cyrillic-ok: message to the person
            : `Tap the button: Telegram opens the sheet to create @${username}. Or use the link: ${link}`,
          reply_markup: requestManagedBotKeyboard(label, suggested),
        })
        button_sent = sent.ok
        if (!sent.ok)
          button_note = `button not delivered by @${MANAGER_BOT}: ${sent.description ?? 'unknown'}; give the link`
      }
      return {
        ok: true,
        state: 'link_ready',
        link,
        manager: `@${MANAGER_BOT}`,
        suggested,
        button_sent,
        ...(button_note ? { button_note } : {}),
        ...(usernameNote ? { username_note: usernameNote } : {}),
        note: "The person confirms in Telegram's sheet; the username may be edited there and Telegram decides if it is free.",
      }
    },
  }
}

export const BOT_CREATE_TOOLS: AgentTool[] = [makeCreateBotTool()]
