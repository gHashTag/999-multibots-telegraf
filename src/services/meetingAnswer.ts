import { logger } from '@/utils/logger'
import { SAID } from '@/services/browserApproval'
import { renderRefusedTheKey } from '@/services/renderTimeout'

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
  /**
   * True when the render answered. False means the card keeps its buttons:
   * a failed press must not leave the person with nothing left to press.
   */
  reached: boolean
}

/*
 * ONE QUIET RETRY, ONLY FOR A FAST FAILURE.
 *
 * Every card action is idempotent on the render: ok / cancel / done / missed
 * set a status, and since spec v2 a second "later" adds nothing while a
 * snooze still waits (meetings.ts answerTap). So a press may be repeated.
 *
 * Repeated only when the failure was quick -- no connection, or the empty
 * body of a deploy swap -- after RETRY_AFTER_MS. A timeout already cost the
 * person ten seconds of a stripped card and is not doubled; a refused key
 * gets the identical refusal a second time.
 */
export const RETRY_AFTER_MS = 3_000

function whyNot(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e)
  if ((e as { timedOut?: boolean })?.timedOut) return SAID.timeout
  // Both "the bot holds no key" and "the render refused the key it holds".
  if (renderRefusedTheKey(e) || /RENDER_API_KEY/.test(msg)) return SAID.noKey
  if (e instanceof TypeError) return SAID.offline
  return NOT_REACHED
}

export async function answerMeeting(
  telegramId: string,
  action: string,
  token: string,
  opts: { callToolImpl?: CallTool; sleep?: (ms: number) => Promise<void> } = {}
): Promise<MeetingAnswer> {
  const who = String(telegramId ?? '').trim()
  const t = String(token ?? '').trim()
  if (!who || !t || !(ACTIONS as readonly string[]).includes(action)) {
    return { said: NOT_REACHED, reached: false }
  }
  const sleep =
    opts.sleep ?? ((ms: number) => new Promise(r => setTimeout(r, ms)))
  const first = await once(who, action, t, opts.callToolImpl)
  if (!first.retry) return first.answer
  await sleep(RETRY_AFTER_MS)
  return (await once(who, action, t, opts.callToolImpl)).answer
}

async function once(
  who: string,
  action: string,
  t: string,
  callToolImpl?: CallTool
): Promise<{ answer: MeetingAnswer; retry: boolean }> {
  try {
    const call =
      callToolImpl ?? (await import('@/services/modelSwitch')).callTool
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
    // No words back = a 502 page or an empty body: the render is restarting.
    if (!said)
      return { answer: { said: SAID.restarting, reached: false }, retry: true }
    return {
      answer: { said, reached: true, ...(markup ? { markup } : {}) },
      retry: false,
    }
  } catch (e) {
    logger.warn('[meeting-answer] the tap did not reach the render', {
      error: e instanceof Error ? e.message : String(e),
    })
    const said = whyNot(e)
    return {
      answer: { said, reached: false },
      retry: said === SAID.offline || said === NOT_REACHED,
    }
  }
}
