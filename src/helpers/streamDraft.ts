import { stripAgentMarkers } from '@/navigation/helpers/actionButtons'
import { держатьПечатает } from '@/helpers/telegramLongAnswer' // cyrillic-ok: pre-existing helper name

/**
 * SHOW THE ANSWER BEING WRITTEN INSTEAD OF THREE DOTS FOR THREE MINUTES.
 *
 * The stream from the model already crosses the wire token by token -- the
 * render yields each delta and the bot's parser reads it -- and until now it was
 * collected in an array and thrown away, because "in Telegram you cannot type
 * letter by letter". That was true when it was written. Since Bot API 9.3
 * (31 Dec 2025), opened to all bots in 9.5 (1 Mar 2026), sendMessageDraft
 * streams a partial message; 10.0 (8 May 2026) allowed an empty text, which
 * renders as a "Thinking…" placeholder.
 *
 * What the owner had instead was sendChatAction every four seconds: up to
 * three minutes of an indicator that says something is happening
 * and never says what.
 *
 * THE DRAFT IS NOT THE ANSWER. It is ephemeral -- Telegram drops it after
 * about thirty seconds -- and the finished text is still sent as an ordinary
 * message afterwards. Nothing about what gets persisted changes here.
 */

/** Non-zero, per the reference; the same id animates rather than replaces. */
let nextDraftId = 1

export interface DraftKeeper {
  /** The answer as it stands. Cheap to call on every token. */
  show: (sofar: string) => void
  stop: () => void
}

export interface DraftCtx {
  chat?: { id?: number; type?: string }
  telegram?: {
    callApi?: (
      method: string,
      payload: Record<string, unknown>
    ) => Promise<unknown>
  }
  sendChatAction: (action: 'typing') => Promise<unknown>
}

/** Telegram's own limit on a draft's text. */
const MAX_DRAFT_CHARS = 4096

/**
 * What the person should see of a half-written answer.
 *
 * Complete button markers are removed the same way they are removed from the
 * finished text; a marker still being written -- `[[Опла` -- is cut off its
 * tail, because a preview that flickers bracket soup reads as a bug.
 *
 * Past four thousand characters the TAIL is kept rather than the head: a
 * preview frozen at the first screen looks stuck, while one that scrolls
 * shows the work continuing. The whole text arrives in the real message.
 */
export function draftText(sofar: string): string {
  // Cut the half-written marker FIRST: stripAgentMarkers trims, and cutting
  // afterwards would leave the space the marker was standing on.
  const clean = stripAgentMarkers(
    String(sofar ?? '').replace(/\[\[[^\]]*$/, '')
  )
  return clean.length > MAX_DRAFT_CHARS ? clean.slice(-MAX_DRAFT_CHARS) : clean
}

/**
 * Stream the answer as it is written, and keep showing something if that
 * turns out to be impossible.
 *
 * `everyMs` throttles: one call per token would meet a flood limit, and the
 * allowed rate is documented nowhere. `aliveMs` re-sends an unchanged draft,
 * because the preview expires on its own while the agent is inside a long
 * tool call and saying nothing.
 *
 * A first call Telegram refuses -- an old server, a method it does not know,
 * a group chat -- falls back to the typing indicator for the rest of the turn
 * and never tries again. Losing the preview must not cost the owner the only
 * sign that anything is happening.
 */
export function keepDraft(
  ctx: DraftCtx,
  everyMs = 1000,
  aliveMs = 10_000
): DraftKeeper {
  const chatId = ctx.chat?.id
  const call = ctx.telegram?.callApi
  let latest = ''
  let sent: string | null = null
  let sentAt = 0
  let inFlight = false
  let stopped = false
  let fellBack: (() => void) | null = null
  const draftId = nextDraftId++

  const fallBack = () => {
    if (fellBack || stopped) return
    fellBack = держатьПечатает(ctx as never) // cyrillic-ok: pre-existing name
  }

  if (typeof chatId !== 'number' || typeof call !== 'function') {
    // Nothing to draft into. The old behaviour, unchanged.
    fallBack()
    return { show: () => undefined, stop: () => fellBack?.() }
  }

  const tick = async () => {
    if (stopped || fellBack || inFlight) return
    const text = draftText(latest)
    const stale = Date.now() - sentAt >= aliveMs
    if (text === sent && !stale) return
    inFlight = true
    try {
      await call('sendMessageDraft', {
        chat_id: chatId,
        draft_id: draftId,
        text,
        /*
         * Bot API 10.3 (24 Aug 2026): a button on the draft that ends the
         * turn. Until now the only thing that could end one was a three
         * minute timer, and three minutes is a long time to watch something
         * you already know is going the wrong way. The press arrives as a
         * `stopped_message_generation` update; see services/stopTurn.
         */
        can_stop: true,
      })
      sent = text
      sentAt = Date.now()
    } catch {
      // Once, not every second: a method the server does not know will not
      // start working later in the same turn.
      fallBack()
    } finally {
      inFlight = false
    }
  }

  void tick()
  const timer = setInterval(() => void tick(), everyMs)
  ;(timer as { unref?: () => void }).unref?.()

  return {
    show: (sofar: string) => {
      latest = String(sofar ?? '')
    },
    stop: () => {
      stopped = true
      clearInterval(timer)
      fellBack?.()
    },
  }
}
