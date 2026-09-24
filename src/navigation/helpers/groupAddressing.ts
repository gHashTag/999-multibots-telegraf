import type { MyContext } from '@/interfaces'
import { isConciergeChat } from './groupConcierge'

/**
 * IN A ROOM WITH OTHER PEOPLE, THE BOT SPEAKS ONLY WHEN SPOKEN TO.
 *
 * Owner, 2026-09-20: five VIP clients share one Telegram group with him, and
 * the bot is in it. He has just turned OFF privacy mode in BotFather, which is
 * what a concierge needs -- and which, until this file existed, also meant the
 * agent fallback would answer EVERY message in that room.
 *
 * That is not a nuisance, it is a leak and a liability: the agent quotes
 * prices, describes what the platform can do, and holds a conversation. Five
 * paying people read each other's messages there; an answer meant for one of
 * them lands in front of all five, and an answer nobody asked for lands in
 * front of all five too.
 *
 * ── WHAT COUNTS AS BEING SPOKEN TO ─────────────────────────────────────────
 *
 * Three signals, all of them unambiguous to a person watching:
 *
 *   1. a reply to something the bot itself said;
 *   2. the bot named by @username;
 *   3. a command addressed to it -- `/ask@t27ai_bot`, or a bare `/ask` in a
 *      group where it is the only bot that would answer.
 *
 * NOT a signal: the person's name for it, a "hey bot", a question mark, being
 * the only bot present. Every one of those is a guess, and a guess here is the
 * bot interrupting five clients.
 *
 * ── A PRIVATE CHAT IS NOT A ROOM ───────────────────────────────────────────
 *
 * One person writing to the bot alone is addressing it by definition, so this
 * returns true and the caller keeps its ordinary behaviour.
 */
export function isAddressedToUs(ctx: MyContext): boolean {
  const chatType = ctx.chat?.type
  if (chatType !== 'group' && chatType !== 'supergroup') return true

  /*
   * ONE ROOM THE OWNER OPENED ON PURPOSE (groupConcierge.ts).
   *
   * Owner, 2026-09-24: "I want the agent to start helping her in the chat".
   * The rule above is his too and stays whole; this is the exception he
   * names himself, one chat id at a time, and it is never a default.
   */
  if (isConciergeChat(ctx.chat?.id)) return true

  const me = ctx.botInfo?.username
  const message = ctx.message as
    | {
        text?: string
        caption?: string
        reply_to_message?: { from?: { id?: number; is_bot?: boolean } }
      }
    | undefined
  if (!message) return false

  /*
   * A reply to OUR message, not to any bot's. Two bots in one group is
   * ordinary, and answering a sentence meant for the other one is the same
   * interruption this file exists to prevent.
   */
  const repliedTo = message.reply_to_message?.from
  if (repliedTo?.is_bot && repliedTo.id && repliedTo.id === ctx.botInfo?.id) {
    return true
  }

  const said = String(message.text ?? message.caption ?? '')
  if (!said) return false

  if (me) {
    /*
     * Case-insensitive because Telegram does not care, and bounded by a
     * non-word character so `@t27ai_bot_old` never counts as `@t27ai_bot`.
     */
    const named = new RegExp(`@${me}(?![A-Za-z0-9_])`, 'i')
    if (named.test(said)) return true
  }

  /*
   * A command. `/ask@other_bot` is explicitly somebody else's, and a bare
   * `/ask` in a group is ambiguous -- Telegram shows it to every bot present
   * -- but answering a command is what a person expects, so it counts.
   */
  const command = /^\/([A-Za-z0-9_]+)(?:@([A-Za-z0-9_]+))?/.exec(said.trim())
  if (command) {
    const addressee = command[2]
    if (!addressee) return true
    return Boolean(me) && addressee.toLowerCase() === me!.toLowerCase()
  }

  return false
}
