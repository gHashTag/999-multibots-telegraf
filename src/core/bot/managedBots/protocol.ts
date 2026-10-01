/**
 * MANAGED BOTS, THE WIRE FORMAT (Telegram Bot API 9.6, 2026-04-03).
 *
 * A bot with Bot Management Mode on (switched on by its owner in @BotFather's
 * mini app; `getMe` then says `can_manage_bots: true`) may ask a person to
 * create a NEW bot for them. The person confirms in Telegram's own sheet, the
 * new bot belongs to THEM, and the manager can fetch its token at any time with
 * `getManagedBotToken` -- so we never have to keep one.
 *
 * Telegraf 4.16.3 predates all of it: no type for the button, the update or the
 * service message. Everything here is therefore plain JSON with a reader that
 * refuses anything not shaped as documented, and nothing in this file touches
 * the network, so all of it is tested without a bot.
 *
 * Sources: https://core.telegram.org/bots/api#keyboardbuttonrequestmanagedbot,
 * #managedbotupdated, #managedbotcreated, #getmanagedbottoken.
 */

/** A bot a person created through ours, as Telegram reported it. */
export interface ManagedBotEvent {
  /** The new bot's user id. Its token is fetched by this id. */
  botId: number
  botUsername: string
  botName: string
  /** The person who created it, and who owns it. */
  ownerId: number
  ownerUsername?: string
  ownerName: string
  ownerLanguage?: string
}

type Obj = Record<string, unknown>

const isObj = (v: unknown): v is Obj =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

const isId = (v: unknown): v is number =>
  typeof v === 'number' && Number.isSafeInteger(v) && v > 0

function readUser(
  v: unknown
): { id: number; username?: string; name: string; language?: string } | null {
  if (!isObj(v) || !isId(v.id)) return null
  const first = typeof v.first_name === 'string' ? v.first_name : ''
  const last = typeof v.last_name === 'string' ? ` ${v.last_name}` : ''
  return {
    id: v.id,
    ...(typeof v.username === 'string' ? { username: v.username } : {}),
    name: (first + last).trim(),
    ...(typeof v.language_code === 'string'
      ? { language: v.language_code }
      : {}),
  }
}

/**
 * The `managed_bot` update: a bot was created, its token changed, or its owner
 * changed. All three mean the same thing to us -- the row is upserted and the
 * bot (re)launched with whatever token Telegram now holds.
 */
export function readManagedBotUpdate(update: unknown): ManagedBotEvent | null {
  if (!isObj(update) || !isObj(update.managed_bot)) return null
  const owner = readUser(update.managed_bot.user)
  const bot = readUser(update.managed_bot.bot)
  if (!owner || !bot || !bot.username) return null
  return {
    botId: bot.id,
    botUsername: bot.username,
    botName: bot.name,
    ownerId: owner.id,
    ...(owner.username ? { ownerUsername: owner.username } : {}),
    ownerName: owner.name,
    ...(owner.language ? { ownerLanguage: owner.language } : {}),
  }
}

/**
 * The `managed_bot_created` service message in the creator's chat with us.
 * It carries the bot but not the owner -- the owner is the message's sender.
 */
export function readManagedBotCreated(
  message: unknown
): ManagedBotEvent | null {
  if (!isObj(message) || !isObj(message.managed_bot_created)) return null
  const owner = readUser(message.from)
  const bot = readUser(message.managed_bot_created.bot)
  if (!owner || !bot || !bot.username) return null
  return {
    botId: bot.id,
    botUsername: bot.username,
    botName: bot.name,
    ownerId: owner.id,
    ...(owner.username ? { ownerUsername: owner.username } : {}),
    ownerName: owner.name,
    ...(owner.language ? { ownerLanguage: owner.language } : {}),
  }
}

/** Telegram's rule for a bot username: 5-32 of [A-Za-z0-9_], ending in "bot". */
export const BOT_USERNAME_RE = /^[A-Za-z][A-Za-z0-9_]{1,28}bot$/i

/**
 * A username to SUGGEST. The person edits it in Telegram's sheet before
 * confirming, and Telegram, not us, decides whether it is free -- so this only
 * has to be valid and recognisably theirs.
 */
export function suggestBotUsername(owner: {
  id: number
  username?: string
}): string {
  const base = (owner.username ?? '')
    .replace(/[^A-Za-z0-9_]/g, '')
    .replace(/^[^A-Za-z]+/, '')
    .replace(/_?bot$/i, '')
  const stem = base.length >= 2 ? base : `t27_${owner.id}`
  // "_agent_bot" is 10 characters; the whole name stays within 32.
  const name = `${stem.slice(0, 22)}_agent_bot`
  return BOT_USERNAME_RE.test(name) ? name : `t27_${owner.id}_bot`.slice(0, 32)
}

/** The display name to suggest: the owner's name plus what the bot is. */
export function suggestBotName(ownerName: string, isRu: boolean): string {
  const who = ownerName.trim().slice(0, 40) || 'T27'
  return isRu ? `${who} · агент` : `${who} · agent` // cyrillic-ok: bot display name
}

/**
 * The reply keyboard with the one button that opens Telegram's creation sheet.
 *
 * `request_id` must be unique within the message; one button, so any small
 * integer will do, and a fixed one keeps the markup testable.
 */
export function requestManagedBotKeyboard(
  label: string,
  suggested: { username: string; name: string }
): Obj {
  return {
    keyboard: [
      [
        {
          text: label,
          request_managed_bot: {
            request_id: 1,
            suggested_name: suggested.name,
            suggested_username: suggested.username,
          },
        },
      ],
    ],
    resize_keyboard: true,
    one_time_keyboard: true,
  }
}

/**
 * The same sheet as a link, for places a reply keyboard cannot go (the mini
 * app, a channel post, another bot): t.me/newbot/{manager}/{username}?name=.
 */
export function newBotLink(
  manager: string,
  suggested: { username: string; name: string }
): string {
  return (
    `https://t.me/newbot/${encodeURIComponent(manager)}/` +
    `${encodeURIComponent(suggested.username)}` +
    `?name=${encodeURIComponent(suggested.name)}`
  )
}
