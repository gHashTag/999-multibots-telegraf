import type { MyContext } from '@/interfaces'
import { logger } from '@/utils/logger'

/**
 * A CLIENT WRITING IN A ROOM THE BOT KEEPS SILENT IN IS TOLD TO THE OWNER.
 *
 * Owner, 2026-10-03: "why is the bot not answering the VIP client and not
 * helping her with her task?" Geya wrote a full brief -- 72 reels for her
 * game -- in a room with him and the bot on 2026-09-29, and again four days
 * later. The bot was admin there, read every word, and said nothing, because
 * the room was not on GROUP_CONCIERGE_CHATS (groupConcierge.ts). That rule is
 * his and stays whole. What was wrong is that the silence was INVISIBLE: the
 * bot dropped her message and told nobody, so the one person who could open
 * the room never learned it needed opening.
 *
 * So a silent room now reports itself -- to the people who can act on it, and
 * only where it is plainly one client's room:
 *
 *   - the room has at most three members (him, one person, the bot). The
 *     shared room where five paying clients read each other stays quiet by
 *     his own decision, and a notice for it every deploy would be noise;
 *   - the sender is not one of the admins -- him writing is not a client
 *     waiting;
 *   - only admins who are IN that room hear about it, so nothing said there
 *     reaches somebody who could not read it anyway;
 *   - once per room per process. A deploy restarts the count, which is fine:
 *     a client still unanswered after a deploy is still worth saying.
 *
 * The room is CLAIMED in the same synchronous step that checks it, before the
 * first await. One photo reaches this twice (the photo handler and the agent
 * fallback), and albums and polling batches run concurrently; a mark set only
 * after the member lookups let every one of them through. A claim is released
 * when the attempt fails -- the member count errors or no notice is delivered
 * -- so a later message can try again.
 *
 * The notice names the room, the person, the first words, and the exact line
 * that opens the room, so acting on it takes one paste.
 */

export const SILENT_ROOM_MAX_MEMBERS = 3

const told = new Set<string>()

/** Test seam: forget which rooms were already reported. */
export function forgetSilentRooms(): void {
  told.clear()
}

export function silentRoomNoticeText(input: {
  room: string
  chatId: string
  who: string
  said: string
}): string {
  const said = input.said.replace(/\s+/g, ' ').trim()
  const quote = said.length > 280 ? `${said.slice(0, 279)}…` : said
  return [
    `🔇 В комнате «${input.room}» пишет ${input.who}, а я молчу.`, // cyrillic-ok
    '',
    quote ? `«${quote}»` : '(без текста)', // cyrillic-ok
    '',
    'Комнаты нет в GROUP_CONCIERGE_CHATS, поэтому я отвечаю там только на ответ мне, @имя или команду.', // cyrillic-ok
    `Чтобы я работал там со всеми, добавьте в переменную сервиса бота: ${input.chatId}`, // cyrillic-ok
  ].join('\n')
}

const PRESENT = new Set(['creator', 'administrator', 'member', 'restricted'])

/**
 * Called on the path where the bot stays silent in a group. Never throws and
 * never blocks the update: every failure is logged and swallowed, because a
 * notice that breaks message handling would be worse than no notice.
 */
export async function tellOwnersTheRoomIsSilent(
  ctx: MyContext,
  adminIds: number[]
): Promise<void> {
  let claimed = ''
  try {
    const chat = ctx.chat as
      | { id?: number; type?: string; title?: string }
      | undefined
    if (chat?.type !== 'group' && chat?.type !== 'supergroup') return
    const chatId = String(chat.id ?? '')
    if (!chatId || told.has(chatId)) return

    const from = ctx.from
    if (!from || from.is_bot) return
    if (adminIds.includes(from.id)) return

    const message = ctx.message as
      | { text?: string; caption?: string }
      | undefined
    if (!message) return

    // Claim before the first await: a concurrent call now sees the room taken.
    told.add(chatId)
    claimed = chatId

    const count = await ctx.telegram.getChatMembersCount(chat.id as number)
    if (count > SILENT_ROOM_MAX_MEMBERS) return

    const present: number[] = []
    for (const id of adminIds) {
      const m = await ctx.telegram
        .getChatMember(chat.id as number, id)
        .catch(() => undefined)
      if (m && PRESENT.has(m.status)) present.push(id)
    }
    if (!present.length) return

    const who =
      [from.first_name, from.last_name].filter(Boolean).join(' ') ||
      (from.username ? `@${from.username}` : String(from.id))
    const text = silentRoomNoticeText({
      room: chat.title || chatId,
      chatId,
      who,
      said: String(message.text ?? message.caption ?? ''),
    })
    let delivered = 0
    for (const id of present) {
      await ctx.telegram.sendMessage(id, text).then(
        () => {
          delivered++
        },
        e =>
          logger.warn('[silent-room] the notice did not reach an admin', {
            chatId,
            error: e instanceof Error ? e.message : String(e),
          })
      )
    }
    if (!delivered) {
      // Nobody heard it: give the room back so a later message retries.
      told.delete(chatId)
      return
    }
    logger.info('[silent-room] told the owner a client is unanswered', {
      chatId,
      admins: delivered,
    })
  } catch (e) {
    if (claimed) told.delete(claimed)
    logger.warn('[silent-room] could not check the room', {
      error: e instanceof Error ? e.message : String(e),
    })
  }
}
