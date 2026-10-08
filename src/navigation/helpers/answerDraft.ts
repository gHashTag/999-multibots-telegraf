/**
 * AN AGENT ANSWER THAT GROWS ON SCREEN, WITH A STOP BUTTON.
 *
 * Spec of record: bot-agent-stream.t27 (gHashTag/t27#7836). Owner, 2026-10-08:
 * "answers of the agent with 'thinking' and 'stop'".
 *
 * The render streams the turn; until now the bot kept it to itself and sent
 * one message at the end, with only "typing…" in between. In a private chat
 * the bot now shows a draft (Bot API sendMessageDraft): empty at first, which
 * Telegram draws as "Thinking…", then the answer as it is written, with a
 * stop button (can_stop). A press arrives as a `stopped_message_generation`
 * update; the turn is aborted and what was written so far becomes the answer.
 *
 * A draft is a preview, never the answer: the finished text still goes out as
 * a real message (ANSWER_PERSISTS), exactly as before. And the farm runs its
 * own Bot API server whose version cannot be read from outside, so the first
 * refusal turns drafts off for that bot (PROBE_REFUSALS) and the person sees
 * what they saw before: typing, then the answer.
 *
 * The five rules are the spec's functions, mirrored one for one; its numbers
 * are imported. src/spec/bot-agent-stream.test.ts runs every test of the spec
 * against these.
 */
import * as SPEC from '@/spec/bot-agent-stream.gen'
import { logger } from '@/utils/logger'

/** spec uses_draft: a private chat whose server has not refused a draft. */
export const usesDraft = (isPrivate: boolean, refusals: number): boolean =>
  isPrivate && refusals < SPEC.PROBE_REFUSALS

/** spec draft_due: the text grew and the last draft is old enough, or keep-alive. */
export const draftDue = (grew: boolean, sinceLastMs: number): boolean =>
  (grew && sinceLastMs >= SPEC.DRAFT_EVERY_MS) ||
  sinceLastMs >= SPEC.DRAFT_REFRESH_MS

/** spec draft_chars: the draft shows at most what Telegram takes. */
export const draftChars = (answerChars: number): number =>
  answerChars > SPEC.DRAFT_MAX_CHARS ? SPEC.DRAFT_MAX_CHARS : answerChars

/** spec after_stop: 1 the words so far are the answer, 2 a "stopped" line. */
export const afterStop = (partialChars: number): 1 | 2 =>
  partialChars > 0 ? 1 : 2

/** spec ephemeral: a group reply meant for one person is ephemeral. */
export const ephemeral = (isGroup: boolean, forOnePerson: boolean): boolean =>
  isGroup && forOnePerson

/** Refusals of sendMessageDraft, per bot, since this process started. */
const refusals = new Map<string, number>()
/** Live drafts by `${chatId}:${draftId}`, so a stop press finds its turn. */
const live = new Map<string, AnswerDraft>()

export interface AnswerDraft {
  /** Aborts the turn when the person presses stop; undefined when inert. */
  signal?: AbortSignal
  /** True once the person pressed stop. */
  readonly stopped: boolean
  /** The answer as written so far. */
  readonly text: string
  /** A new piece of the answer arrived. */
  grow(soFar: string): void
  /** The turn ended: no more drafts, the stop button is gone. */
  close(): void
}

const INERT: AnswerDraft = {
  stopped: false,
  text: '',
  grow: () => undefined,
  close: () => undefined,
}

/**
 * Start a draft for this turn: "Thinking…" with a stop button right away, then
 * the answer as it grows. Inert outside private chats and on a bot whose
 * server refused a draft. Never throws.
 */
export function startAnswerDraft(
  ctx: any,
  now: () => number = Date.now
): AnswerDraft {
  const chatId = ctx?.chat?.id
  const bot = String(ctx?.botInfo?.username ?? '')
  const isPrivate = ctx?.chat?.type === 'private'
  if (!chatId || !bot || !ctx?.telegram?.callApi) return INERT
  if (!usesDraft(isPrivate, refusals.get(bot) ?? 0)) return INERT

  // Non-zero, and different for every turn (spec: changes to one id animate).
  const draftId = 1 + Math.floor(Math.random() * 2_000_000_000)
  const key = `${chatId}:${draftId}`
  const controller = new AbortController()
  let text = ''
  let shown = -1
  let lastAt = 0
  let stopped = false
  let closed = false
  let inFlight = false
  let refused = false

  const send = (body: string): void => {
    if (closed || refused || inFlight) return
    inFlight = true
    lastAt = now()
    shown = body.length
    // sendMessageDraft is a threaded method: in a tab it lands in that tab
    // (navigation/topics/threads.ts THREADED_METHODS).
    Promise.resolve(
      ctx.telegram.callApi('sendMessageDraft', {
        chat_id: chatId,
        draft_id: draftId,
        text: body,
        can_stop: true,
      })
    )
      .catch((e: unknown) => {
        refused = true
        refusals.set(bot, (refusals.get(bot) ?? 0) + 1)
        logger.info('[answer-draft] drafts refused; typing only for this bot', {
          bot,
          error: e instanceof Error ? e.message.slice(0, 120) : String(e),
        })
      })
      .finally(() => {
        inFlight = false
      })
  }

  // Keep-alive while a tool runs and no text arrives (spec DRAFT_REFRESH_MS).
  const timer = setInterval(
    () => {
      if (draftDue(false, now() - lastAt)) send(cut(text))
    },
    Math.min(SPEC.DRAFT_EVERY_MS * 5, SPEC.DRAFT_REFRESH_MS)
  )
  ;(timer as any).unref?.()

  const draft: AnswerDraft = {
    signal: controller.signal,
    get stopped() {
      return stopped
    },
    get text() {
      return text
    },
    grow(soFar: string) {
      text = soFar
      if (draftDue(cut(soFar).length > shown, now() - lastAt)) send(cut(soFar))
    },
    close() {
      closed = true
      clearInterval(timer)
      live.delete(key)
    },
  }
  ;(draft as any).stop = () => {
    stopped = true
    controller.abort()
  }
  live.set(key, draft)
  send('') // "Thinking…"
  return draft
}

/** The beginning of the answer, in whole code points, cut to what Telegram takes. */
function cut(text: string): string {
  const chars = [...text]
  return chars.slice(0, draftChars(chars.length)).join('')
}

/**
 * The person pressed stop on a draft (update `stopped_message_generation`).
 * Returns whether a live turn was stopped.
 */
export function stopAnswerDraft(chatId: number, draftId: number): boolean {
  const draft = live.get(`${chatId}:${draftId}`)
  if (!draft) return false
  ;(draft as any).stop()
  return true
}

/** Middleware: a stop press ends its turn and goes no further. */
export async function draftStopMiddleware(
  ctx: any,
  next: () => Promise<void>
): Promise<void> {
  const s = ctx?.update?.stopped_message_generation
  if (!s) return next()
  stopAnswerDraft(Number(s.chat?.id), Number(s.draft_id))
}

/**
 * A reply for one person in a group, sent so only they see it (Bot API 10.3
 * ephemeral_message_parameters); anywhere else, or when the server refuses
 * it, an ordinary reply (spec EPHEMERAL_FALLS_BACK).
 */
export async function replyToOne(
  ctx: any,
  text: string,
  extra: Record<string, unknown> = {}
): Promise<unknown> {
  const isGroup =
    ctx?.chat?.type === 'group' || ctx?.chat?.type === 'supergroup'
  const person = ctx?.from?.id
  if (ephemeral(isGroup, Boolean(person))) {
    try {
      return await ctx.reply(text, {
        ...extra,
        ephemeral_message_parameters: { receiver_user_id: person },
      })
    } catch (e) {
      if (!SPEC.EPHEMERAL_FALLS_BACK) throw e
      logger.debug('[answer-draft] ephemeral refused; an ordinary reply', {
        error: e instanceof Error ? e.message.slice(0, 120) : String(e),
      })
    }
  }
  return ctx.reply(text, extra)
}

/** For tests. */
export function resetAnswerDrafts(): void {
  refusals.clear()
  for (const d of live.values()) d.close()
  live.clear()
}
