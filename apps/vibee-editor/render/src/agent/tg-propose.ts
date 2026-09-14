import crypto from 'node:crypto'
import type { ToolContext } from './tools'
import { remember, EXECUTABLE_ACTIONS } from './tg-proposals'
import type {
  ProposalAction,
  ProposalMedia,
  ProposalCharge,
} from './tg-proposals'

/**
 * THE GATE, ON ITS OWN SHELF.
 *
 * `propose` and its identity guard used to live in telegram-tools.ts, next
 * to the tools that call them. The social layer (tg-social-tools.ts) needs
 * the same gate, and importing it from there would have closed a cycle:
 * telegram-tools spreads TG_SOCIAL_TOOLS, so a module graph entered through
 * tg-social-tools reached that spread while this code was still
 * uninitialized. A gate that holds or breaks depending on which door the
 * import walked in by is not a gate -- so the gate moved here. A leaf: no
 * import of any tool file, reached from everywhere, broken from nowhere.
 *
 * The code below is what stood in telegram-tools.ts, unchanged.
 */

/**
 * WHO may read and act: anyone with a verified identity -- on THEIR OWN
 * account, and nobody else's.
 *
 * Until 2026-09-08 every reading tool and `propose()` asked `requireOwner`.
 * That was the right gate while the service held ONE session string for
 * everybody: a stranger reaching `client()` would have read the owner's
 * dialogs. Since 2026-09-06 the session is looked up per caller
 * (`сессияДля` reads tg_sessions by the caller's id; only the owner falls
 * back to the env string), so the account a tool opens is always the
 * caller's own. The owner gate then stopped protecting anything and started
 * refusing the very people the login screen invites in -- the "CRM for
 * clients" the product is sold as.
 *
 * What is refused here is only the absence of identity. "You have no
 * session" is `client()`'s call, and it says so in words the person can act
 * on. Throwing, not returning: a refusal must not be mistakable for data.
 */
export function requireIdentity(ctx?: ToolContext): void {
  if (ctx && String(ctx.telegramId ?? '').trim()) return
  throw new Error(
    'Не знаю, кто спрашивает: инструменты Telegram работают только от имени ' +
      'подтверждённого пользователя.'
  )
}

/**
 * A proposed outward action awaiting the human's word.
 *
 * Returned INSTEAD of doing the thing. The agent reports it, the human approves
 * in the app, and only that approval executes it. There is no flag on this
 * object that lets a caller skip the step — the absence of one is the point.
 */
export interface Proposal {
  proposal: true
  action: ProposalAction
  target: string
  what?: string
  why: string
  /** The recipient in words, beside the id. See PendingProposal.display. */
  display?: string
  media?: ProposalMedia
  charge?: ProposalCharge
}

/** What a caller may attach to a draft beyond the message itself. */
export interface ProposalExtras {
  display?: string
  invoiceId?: number
  media?: ProposalMedia
  /** WHEN to send, epoch ms; validated by `scheduleProblem` in `remember`. */
  scheduleAt?: number
  charge?: ProposalCharge
  /** A free lead magnet: nobody is charged, and the touch note says "gift". */
  gift?: boolean
  /**
   * Structured arguments the executor will need: which messages a forward
   * names, and where they came from. The prose `what` is what the person
   * reads on the card; this is what the executor reads on the press.
   */
  args?: Record<string, unknown>
}

/**
 * Actions `execute` can actually carry out.
 *
 * DERIVED, not restated: the executor table in tg-proposals.ts is the one
 * place that knows, and a copy here is how a tool queues a draft nobody can
 * execute (or refuses to queue one somebody can). When `forward` gained its
 * row there, this set followed without this file changing a line of its own.
 */
const EXECUTABLE = EXECUTABLE_ACTIONS

/**
 * Surfaces that can actually SHOW a confirmation and take a press.
 *
 * Only the bot chat has the card and the two buttons. The mini app and iOS
 * read the same agent stream and ignore the proposal event; a direct /mcp call
 * has no screen at all.
 *
 * Queueing a draft for those was a promise nothing kept -- worse, it BURNED
 * the draft's one-time secret on a client that had nowhere to use it, so the
 * message could never be confirmed from anywhere, and the person was told it
 * was prepared. Refusing out loud, with the place to go, is the honest answer.
 *
 * Add a surface here only together with a confirmation screen on it.
 */
const CAN_CONFIRM = new Set(['bot'])

/**
 * Build a proposal AND remember it, so it can actually be confirmed.
 *
 * It used to only build one. `grep -rn proposal` across the player and the bot
 * found not a single reader, so `tg_send` could not send to anybody, ever --
 * the safety half of the design was complete and the other half was missing.
 *
 * The identity guard is called here rather than in each handler: the acting
 * handlers once took no ToolContext at all, which meant no identity check on
 * the tools that reach other people. Harmless only while nothing executed.
 */
export function propose(
  action: Proposal['action'],
  target: string,
  what: string | undefined,
  why: string,
  ctx?: ToolContext,
  lead?: string,
  bot?: string | null,
  extra?: ProposalExtras
): Proposal & { id: string } {
  requireIdentity(ctx)
  const named = {
    ...(extra?.display ? { display: extra.display } : {}),
    ...(extra?.media ? { media: extra.media } : {}),
    ...(extra?.charge ? { charge: extra.charge } : {}),
    ...(extra?.gift ? { gift: true } : {}),
  }
  /*
   * A SHORT ID, BECAUSE THE BUTTON HAS 64 BYTES.
   *
   * Telegram's callback data must hold "tgp:ok:" + id + ":" + a 32-char
   * secret. A 36-char UUID leaves 20 bytes, which is not enough for a secret
   * worth having -- and over the limit Telegram rejects the whole message, so
   * the card would simply not appear and the failure would read as "the agent
   * did nothing".
   *
   * 12 hex characters is 48 bits, which is plenty for a lookup key inside a
   * map that holds at most 200 entries for ten minutes. The authorisation is
   * the secret, not this.
   */
  const id = crypto.randomUUID().replace(/-/g, '').slice(0, 12)
  /*
   * ONLY WHAT CAN ACTUALLY BE CARRIED OUT TAKES THE QUEUE SLOT.
   *
   * `execute` performs send, forward and read, and honestly refuses delete,
   * join and leave. Queueing what cannot execute cost two real defects while
   * read had no executor:
   *
   *  - the card said "Отправить сообщение в Telegram?" for every action, so a
   *    `tg_read` proposal appeared as a send with an empty body, and pressing
   *    the green button answered that read is not wired -- a confirmation
   *    screen describing an action that is not the one on offer;
   *  - one slot per person means a `tg_read` proposal EVICTED the send draft
   *    the person was about to confirm. The agent reads a chat, and the
   *    message waiting for approval quietly disappears.
   *
   * Now that read executes, queueing it is the point -- and eviction is the
   * honest rule it always was for a second send. The others still return a
   * proposal to the model -- that is how it learns the action was not
   * performed -- they simply do not occupy the human queue. A row added to
   * the executor table joins the queue here without this file changing.
   */
  if (EXECUTABLE.has(action) && CAN_CONFIRM.has(String(ctx?.surface ?? ''))) {
    remember({
      id,
      telegramId: String(ctx?.telegramId ?? ''),
      action,
      target,
      what,
      // The turn this draft belongs to. Only that turn's answer may carry its
      // secret; a draft made outside a chat turn is never handed to anybody.
      turn: ctx?.turn,
      lead,
      bot,
      display: extra?.display,
      invoiceId: extra?.invoiceId,
      media: extra?.media,
      scheduleAt: extra?.scheduleAt,
      charge: extra?.charge,
      gift: extra?.gift,
      args: extra?.args,
    })
  }
  /*
   * Say where it can be confirmed when it cannot be confirmed here. The model
   * relays this, so the person is sent to the bot chat instead of waiting for
   * something that will never appear.
   */
  if (!CAN_CONFIRM.has(String(ctx?.surface ?? ''))) {
    return {
      proposal: true,
      id,
      action,
      target,
      what,
      ...named,
      why:
        'Подтвердить это можно только в чате бота — там есть кнопки ' +
        '«Отправить / Отмена». Скажи человеку открыть бота и повторить просьбу.',
    }
  }
  return { proposal: true, id, action, target, what, ...named, why }
}
