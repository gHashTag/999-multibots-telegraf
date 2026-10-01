import { logger } from '@/utils/logger'

/**
 * A TAP ON A MEETING CARD, RELAYED AS THE PERSON WHO PRESSED IT.
 *
 * Spec of record: gHashTag/t27 specs/automation/meeting-reminders.t27. The
 * render sends the card (src/agent/meetings.ts); its buttons carry
 * `mtg:<action>:<token>`. The bot holds nothing between the card and the
 * press: it hands the action and the token to the render's meeting_answer
 * tool under the PRESSER's telegram_id, and the render honours it only if the
 * meeting is theirs (OWNER_ONLY) -- a forwarded card pressed by someone else
 * changes nothing.
 *
 * It NEVER throws: a render that is down must leave the person with words,
 * not with a button that did nothing.
 */
export const ACTIONS = ['ok', 'later', 'cancel', 'done', 'missed'] as const
export type MeetingAction = (typeof ACTIONS)[number]

/** What the person is told when the render cannot be reached at all. */
export const NOT_REACHED =
  'Не смог передать ответ — попробуйте ещё раз через минуту.' // cyrillic-ok: user-facing

const TIMEOUT_MS = 10_000

type CallTool = (
  telegramId: string,
  name: string,
  args: Record<string, unknown>,
  o?: { timeoutMs?: number }
) => Promise<Record<string, any>>

export interface MeetingAnswer {
  said: string
  /** The card's buttons after the press; absent means "strip them". */
  markup?: { inline_keyboard: unknown[][] }
}

export async function answerMeeting(
  telegramId: string,
  action: string,
  token: string,
  opts: { callToolImpl?: CallTool } = {}
): Promise<MeetingAnswer> {
  const who = String(telegramId ?? '').trim()
  const t = String(token ?? '').trim()
  if (!who || !t || !(ACTIONS as readonly string[]).includes(action)) {
    return { said: NOT_REACHED }
  }
  try {
    const call =
      opts.callToolImpl ?? (await import('@/services/modelSwitch')).callTool
    const r = await call(
      who,
      'meeting_answer',
      { action, token: t },
      { timeoutMs: TIMEOUT_MS }
    )
    // The render owns the wording: it is the side that knows the meeting.
    const said = String(r?.said ?? '').trim()
    const markup =
      r?.markup && Array.isArray(r.markup.inline_keyboard)
        ? (r.markup as MeetingAnswer['markup'])
        : undefined
    return { said: said || NOT_REACHED, ...(markup ? { markup } : {}) }
  } catch (e) {
    logger.warn('[meeting-answer] the tap did not reach the render', {
      error: e instanceof Error ? e.message : String(e),
    })
    return { said: NOT_REACHED }
  }
}
