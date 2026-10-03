/**
 * MANAGED BOTS, THE PART THE RENDER NEEDS (Telegram Bot API 9.6, 2026-04-03).
 *
 * The bot owns the full wire format in src/core/bot/managedBots/protocol.ts.
 * The render cannot import it (its Docker context is apps/vibee-editor) and
 * the bot cannot import this file (root tsconfig rootDir is ./src), so this is
 * a mirror of the four pure pieces the agent's tg_create_bot needs -- and
 * src/__tests__/core/managedBotsParity.test.ts feeds both copies one table
 * and fails on the first disagreement, regex source and flags included. Edit
 * one, the test makes you edit the other.
 *
 * No imports: pure, so the parity test can load it from the root.
 */

/** Telegram's rule for a bot username: 5-32 of [A-Za-z0-9_], ending in "bot". */
export const BOT_USERNAME_RE = /^[A-Za-z][A-Za-z0-9_]{1,28}bot$/i

/** A valid username to SUGGEST; Telegram's sheet lets the person edit it. */
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

/** The reply keyboard with the one button that opens Telegram's creation sheet. */
export function requestManagedBotKeyboard(
  label: string,
  suggested: { username: string; name: string }
): Record<string, unknown> {
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

/** The same sheet as a link: t.me/newbot/{manager}/{username}?name=. */
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
