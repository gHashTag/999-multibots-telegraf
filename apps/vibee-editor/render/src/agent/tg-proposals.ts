/**
 * PROPOSALS THAT CAN ACTUALLY BE CONFIRMED.
 *
 * `telegram-tools.ts` has always refused to act on a model's decision alone:
 * send, forward, delete, join and leave return a proposal instead of doing the
 * thing. That half was written well and is load-bearing -- confidence is
 * exactly what a well-written injection produces.
 *
 * The other half did not exist. Measured 2026-09-07: `grep -rn proposal`
 * across the whole player and bot found NOT ONE reader. The proposal was
 * returned to the model and stopped there, so `tg_send` could not send to
 * anybody, ever -- not for the agent, not for the owner. A feature that looks
 * finished because its safety half is good.
 *
 * This module is the missing half: proposals are held here, shown to the
 * person with two buttons, and executed only by an explicit confirmation that
 * names the id.
 *
 * ── WHY IN MEMORY AND SHORT-LIVED ─────────────────────────────────────────
 *
 * A proposal is a sentence in a conversation, not a record. Surviving a deploy
 * would mean somebody presses "send" on a draft written before lunch, about a
 * conversation they no longer remember. Ten minutes is longer than any real
 * confirmation takes and shorter than any memory of what was asked.
 *
 * ── WHY THE ID IS NOT A PASS ──────────────────────────────────────────────
 *
 * Confirming checks the telegram_id too. An id alone must not let anybody
 * complete somebody else's send -- the same rule the pairing code follows, and
 * for the same reason: a guessed handle would otherwise reach into another
 * person's account.
 */

export interface PendingProposal {
  id: string
  telegramId: string
  action: 'send' | 'forward' | 'delete' | 'join' | 'leave' | 'read'
  target: string
  what?: string
  createdAt: number
}

/** How long an unconfirmed proposal survives. */
const LIFETIME_MS = 10 * 60 * 1000

/** A ceiling, so a stuck agent cannot grow this without bound. */
const MAX_PENDING = 200

const pending = new Map<string, PendingProposal>()

function dropExpired(): void {
  const edge = Date.now() - LIFETIME_MS
  for (const [id, p] of pending) {
    if (p.createdAt < edge) pending.delete(id)
  }
}

/** For tests only. */
export function forgetProposals(): void {
  pending.clear()
}

export function pendingCount(): number {
  dropExpired()
  return pending.size
}

/**
 * Remember a proposal so it can be confirmed later.
 *
 * The id is supplied by the caller rather than generated here so tests do not
 * have to guess it, and so the one place that makes ids stays in the module
 * that already owns randomness.
 */
export function remember(
  p: Omit<PendingProposal, 'createdAt'>
): PendingProposal {
  dropExpired()
  if (pending.size >= MAX_PENDING) {
    throw new Error(
      'слишком много неподтверждённых действий — подождите минуту'
    )
  }
  /*
   * ONE PENDING PROPOSAL PER PERSON.
   *
   * Two drafts waiting at once is how somebody confirms the wrong one: the
   * buttons look identical and the chat has moved on. A new proposal replaces
   * the previous, and the previous can no longer be confirmed by its id.
   */
  for (const [id, old] of pending) {
    if (old.telegramId === p.telegramId) pending.delete(id)
  }
  const saved: PendingProposal = { ...p, createdAt: Date.now() }
  pending.set(p.id, saved)
  return saved
}

/** What is waiting for this person, if anything. */
export function pendingFor(telegramId: string): PendingProposal | null {
  dropExpired()
  const mine = String(telegramId)
  for (const p of pending.values()) if (p.telegramId === mine) return p
  return null
}

export function forget(id: string): void {
  pending.delete(id)
}

/**
 * Take a proposal for execution, or explain why not.
 *
 * Removes it in the same step: a proposal is consumed by confirming, so a
 * double tap on the button cannot send twice. That matters on a phone, where
 * a slow reply is indistinguishable from a missed press.
 */
export function claim(
  telegramId: string,
  id: string
): { ok: true; proposal: PendingProposal } | { ok: false; why: string } {
  dropExpired()
  const p = pending.get(id)
  if (!p) return { ok: false, why: 'это действие уже подтверждено или истекло' }
  if (p.telegramId !== String(telegramId)) {
    // Fail-closed and worded without confirming the id exists: a probe should
    // not learn whether somebody else has a draft waiting.
    return { ok: false, why: 'это действие предложено не вам' }
  }
  pending.delete(id)
  return { ok: true, proposal: p }
}

/**
 * Carry out a proposal the person has confirmed.
 *
 * Separate from `claim` on purpose: claiming is the decision, executing is the
 * consequence. A failure here must not silently put the proposal back --
 * whoever pressed the button has already decided, and a resurrected draft is
 * how the same message gets sent twice.
 */
export async function execute(
  p: PendingProposal,
  ctx: { telegramId: string; pool?: unknown }
): Promise<{ done: true; action: string } | { done: false; why: string }> {
  const { client } = await import('./telegram-tools')
  try {
    const c = (await client(ctx as never)) as {
      sendMessage: (to: string, opts: { message: string }) => Promise<unknown>
      forwardMessages: (
        to: string,
        opts: { messages: number[]; fromPeer: string }
      ) => Promise<unknown>
    }
    switch (p.action) {
      case 'send':
        if (!p.what)
          return { done: false, why: 'нечего отправлять: текст пуст' }
        await c.sendMessage(p.target, { message: p.what })
        return { done: true, action: 'send' }
      default:
        /*
         * Only sending is carried out for now. The other actions -- forward,
         * delete, join, leave -- still propose, and refusing here is honest
         * about that. Pretending to do them would be worse than the gap they
         * leave, because the person would believe the thing happened.
         */
        return {
          done: false,
          why: `подтверждение для «${p.action}» ещё не сделано — пока только отправка`,
        }
    }
  } catch (e) {
    return { done: false, why: e instanceof Error ? e.message : String(e) }
  }
}
