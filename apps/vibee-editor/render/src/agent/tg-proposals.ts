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

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

/**
 * A file that IS the service: made on the owner's turn, shown on the card.
 *
 * ── WHICH KINDS CAN TRAVEL AS A URL, AND WHICH CANNOT ──────────────────────
 *
 * Photo and album ride the URL: Telegram fetches those itself
 * (InputMediaPhotoExternal, capped at 10 MB per photo). Voice, video, video
 * note and document CANNOT: GramJS' URL path (`_fileToMedia`, uploads.js)
 * builds an external document and silently IGNORES voiceNote, videoNote and
 * attributes -- so a round voice note "as a URL" would arrive as a plain
 * audio file, and the duration the card promised would be a lie. Those kinds
 * are downloaded here (https, ≤50 MB, 30 s) and uploaded as a CustomFile
 * with the attributes written on the card.
 */
export type ProposalMedia =
  | { kind: 'photo'; url: string }
  | { kind: 'voice'; url: string; duration?: number }
  | { kind: 'video'; url: string }
  | { kind: 'video_note'; url: string; duration?: number }
  | { kind: 'document'; url: string; fileName?: string }
  | { kind: 'album'; urls: string[]; captions?: string[] }

/**
 * Every action a proposal can carry.
 *
 * The one list. It used to be spelled out twice -- here and again in
 * telegram-tools.ts's `Proposal` -- and two copies of one list is how a third
 * thing (the executor table, the bot's card) ends up agreeing with neither.
 * The tools import this; the executor table keys it; the bot reads it through
 * the draft the server sends.
 */
export type ProposalAction =
  | 'send'
  | 'forward'
  | 'delete'
  | 'join'
  | 'leave'
  | 'read'

/**
 * Who pays for the service and how much. Charged at EXECUTE -- after the
 * owner's press, never on the model's say-so -- and refunded exactly if the
 * send then fails. `op` is the price-list key (billing-shared TOKEN_PRICES).
 */
export interface ProposalCharge {
  telegramId: string
  op: string
  tokens: number
}

export interface PendingProposal {
  id: string
  telegramId: string
  action: ProposalAction
  target: string
  what?: string
  /**
   * The lead this message is for, as a numeric telegram_id, when known.
   *
   * Set by the personal seller so that a CONFIRMED send records a `written`
   * touch on the server -- the one place that knows the message actually
   * went. Leaving that to the model means the touch is written when the
   * model remembers to, which is not the same day the message left.
   */
  lead?: string
  /** Whose bot the lead belongs to, for the touch's own visibility scope. */
  bot?: string | null
  createdAt: number
  /**
   * THE ONE-TIME SECRET, AND WHY THE ID IS NOT ENOUGH.
   *
   * Confirming used to need only the id and an identity, and the identity on
   * the server-key path is whatever `telegram_id` the caller typed. So the two
   * checks were one check twice: anyone holding RENDER_API_KEY could read a
   * waiting draft through GET /api/tg/proposal and post it straight back to
   * /confirm. A prepared message went out of the owner's real account with
   * nobody touching a button.
   *
   * This secret is minted here and handed out in exactly ONE place: the answer
   * to the turn that created the proposal (`issueFor`, read by the agent-chat
   * handler). The read route never returns it, and neither does the tool
   * result -- so a model that has been talked into leaking things has nothing
   * to leak, and a key holder watching the queue sees a draft it cannot
   * confirm.
   *
   * ── WHAT THIS DOES NOT BUY ────────────────────────────────────────────────
   *
   * It is not a fix for a leaked key. Whoever holds the key can still drive a
   * whole agent turn as the owner and receive a secret of their own. What it
   * removes is the quiet path: piggy-backing on a draft the owner is about to
   * approve, with no trace in the conversation. Closing the rest needs a
   * credential the key holder does not have -- a separate confirm key for the
   * bot service.
   */
  secret: string
  /**
   * SHA-256 of the secret, and the ONLY form that is ever written down.
   *
   * The queue is mirrored to a table so a deploy stops eating cards, and a
   * live authorisation secret has no business sitting in a table that other
   * tooling reads. The digest is enough for the check -- `claim` compares
   * digests -- and it cannot be handed out, so a row is not a card.
   *
   * A restored row therefore carries a digest and an EMPTY secret. That is
   * correct rather than lossy: a row is only restored when it was already
   * issued, meaning its plaintext is on the owner's phone and this process
   * never needs to say it again.
   *
   * Comparing digests also removes the length pre-check the raw compare
   * needed: two SHA-256 buffers are always 32 bytes, so `timingSafeEqual`
   * can be reached unconditionally.
   */
  secretDigest: string
  /**
   * Has the secret already been handed to a client?
   *
   * `issueFor` answers once per proposal, not once per turn. Without this it
   * answers on EVERY later turn while the draft is still alive, so a person who
   * says "спасибо" after the card appears gets a second identical card with the
   * same live secret -- two buttons for one message, and pressing either sends.
   *
   * One draft, one card. If the answer is lost on the way, the draft expires
   * unshown rather than reappearing later out of context.
   */
  issued: boolean
  /**
   * The request that created this draft.
   *
   * Issuance is bound to it, and that is what closes the race. `remember()`
   * runs during a tool call; the answer is written when the turn ends, and the
   * model is still writing its closing sentence in between. Reproduced against
   * these files: an attacker holding the shared server key polls the read
   * route, sees the draft appear, fires their own turn into that window, and
   * `issueFor` -- which only asked "is anything pending for this person?" --
   * handed them the secret. The owner's own turn then got null: no card was
   * ever shown, and the message went out.
   *
   * With the turn recorded, a draft is only ever handed to the request that
   * caused it. A draft created outside a chat turn (a direct /mcp tool call)
   * carries no turn and is therefore never issued at all -- which is right,
   * because /mcp has no screen to confirm on.
   */
  turn?: string
  /**
   * Who the message is for, in words a person recognises -- "Ольга (@pilot_client)"
   * -- beside the bare id the card used to show alone. Third-party text:
   * cut to one short line at the source, and shown to the owner only ever
   * NEXT TO the id, never instead of it.
   */
  display?: string
  /**
   * The token_invoices row minted for this draft, if one was. A draft that
   * leaves the queue unsent -- cancelled, replaced, expired -- marks that
   * row, so the owner's reconcile stops waiting for a payment nobody was
   * asked for. The Stars link itself stays payable: Telegram offers no way
   * to revoke one, and a payment on it still credits the person it was
   * minted for.
   */
  invoiceId?: number
  media?: ProposalMedia
  /**
   * WHEN to send instead of now, as epoch milliseconds (owner decision,
   * 2026-09-14). Telegram schedules at second precision; the card shows the
   * wall-clock time and says it can be cancelled until then. A scheduled send
   * returns a placeholder message with id 0, which the mirror skips -- there
   * is no real message id until the clock fires.
   */
  scheduleAt?: number
  charge?: ProposalCharge
  /** A free lead magnet: recorded as a touch with the gift prefix, never a purchase. */
  gift?: boolean
  /**
   * Structured arguments an executor needs beyond the prose card: which
   * messages a forward names and where they came from, for example.
   *
   * A generic bag rather than a field per argument because the executor table
   * is meant to grow without PendingProposal growing beside it: a row that
   * needs something new reads it out of here, and the jsonb mirror round-trips
   * the bag without knowing what is in it. The card stays prose -- `what` is
   * what a person reads -- and `args` is what the row reads.
   */
  args?: Record<string, unknown>
}

/** What may leave this module. Never the secret, except through `issueFor`. */
export type PublicProposal = Omit<
  PendingProposal,
  'secret' | 'secretDigest' | 'issued' | 'turn'
>

/*
 * THERE IS NO WRONG-ATTEMPT LIMIT, AND THAT IS DELIBERATE.
 *
 * A limit was written here first, on the reflex that a secret check wants one.
 * It bought nothing and cost something real: 128 bits is not searchable, so
 * the limit never stops an attack -- but anybody able to reach the route can
 * post three wrong secrets and DESTROY the owner's waiting message. A control
 * whose only reachable effect is denial of service is worse than its absence.
 *
 * A counter outlived it for one commit: incremented on every miss and read by
 * nobody, under a comment claiming the attempts were "worth seeing in the
 * numbers". They were not being seen. A wrong secret IS worth noticing, so it
 * is written to the log where somebody can actually find it, and the dead
 * field is gone.
 */

/** How long a touch write may hold up the owner's "sent" after a real send. */
const TOUCH_WRITE_MS = 3000

/**
 * How long the "typing" signal is held before the act (owner decision:
 * typing shows automatically). Telegram shows one SendMessageTypingAction
 * for about five seconds; holding for half of that keeps the indicator alive
 * through the send without stretching the press into a visible wait.
 */
export const TYPING_MS = 2500

/**
 * How long an unconfirmed proposal survives.
 *
 * IT WAS TEN MINUTES, AND THAT IS A DEADLINE ON A PERSON LOOKING AT THEIR
 * PHONE, not a security parameter. Authorisation here is the 128-bit secret
 * minted in `remember`; a shorter window buys nothing against a secret that
 * cannot be searched, and costs the one thing the queue exists for.
 *
 * The sweep that produces these cards runs every thirty minutes by default
 * (CRM_PROACTIVE_MINUTES, src/index.ts), so a card was usually already gone
 * before the next one arrived. An owner who looked at their phone after
 * lunch pressed Send and was told the draft had expired -- and the wording
 * of that refusal is deliberately ambiguous for a prober's benefit, so it
 * did not even say which.
 *
 * Measured in production 2026-09-09, while this was written: five invoices
 * ever minted, none paid, and not one card ever sent. This window is part of
 * why.
 *
 * Twelve hours by default: long enough to cover a working day's attention,
 * short enough that a sales draft naming a person and a price does not go
 * out a week stale. PROPOSAL_LIFETIME_MINUTES overrides it.
 *
 * The env value is checked with Number.isFinite, not truthiness: a typo
 * would otherwise make this NaN, every comparison against it false, and
 * nothing would ever expire.
 */
function lifetimeMinutes(): number {
  const raw = Number(process.env.PROPOSAL_LIFETIME_MINUTES)
  return Number.isFinite(raw) && raw > 0 ? raw : 720
}
/**
 * Exported so a test can advance past it without restating the number. A test
 * that hard-codes "eleven minutes" is a second copy of the constant, and it
 * went red for that reason the moment this value moved.
 */
export const LIFETIME_MS = lifetimeMinutes() * 60 * 1000

/** A ceiling, so a stuck agent cannot grow this without bound. */
const MAX_PENDING = 200

const pending = new Map<string, PendingProposal>()

/**
 * Why a draft carrying an invoice will never be sent. `failed` is the one
 * that happens AFTER the queue: the press consumed the draft, `execute`
 * did not deliver, and the invoice is as unasked-for as after a cancel.
 */
export type OrphanReason = 'cancelled' | 'replaced' | 'expired' | 'failed'
type OrphanListener = (p: PublicProposal, reason: OrphanReason) => void
let orphanListener: OrphanListener | null = null

/**
 * The queue owns no database. Whoever does (render-server, at startup)
 * registers here, and the queue reports every draft that leaves unsent with
 * an invoice attached. One listener: a second registration replaces the
 * first, so a test can install its own and take it away.
 */
export function onOrphaned(fn: OrphanListener | null): void {
  orphanListener = fn
}

/**
 * A DURABLE MIRROR OF THE QUEUE.
 *
 * `pending` is a Map in one process, so every deploy dropped every card the
 * owner had not yet pressed -- and this repository deploys several times a
 * day. The owner asked for the cards to be kept.
 *
 * The queue still owns no database, exactly as the orphan listener above owns
 * none: the server hands it a store at startup. Without one the module
 * behaves as it always did, in memory only, which is why every existing test
 * keeps passing untouched.
 *
 * Writes are fire-and-forget for the same reason the orphan note is: a slow
 * database must not hold up the button press that caused it. What this buys
 * is survival of a RESTART, not exactly-once durability -- a crash in the
 * microseconds between the press and the write loses the same card it would
 * have lost before.
 */
export interface ProposalStore {
  save: (p: PendingProposal) => void
  remove: (id: string) => void
  /**
   * One row by id, or null when there is none. Optional: an in-memory test
   * store does not need it, and without it `claimAcrossDeploy` behaves
   * exactly like `claim`. Read on a press only -- see the deploy overlap
   * note there.
   */
  load?: (id: string) => Promise<PendingProposal | null>
}
let store: ProposalStore | null = null

/** One store: a second registration replaces the first, and null removes it. */
export function onPersist(s: ProposalStore | null): void {
  store = s
}

function persistSave(p: PendingProposal): void {
  if (!store) return
  try {
    store.save(p)
  } catch (e) {
    console.warn('[proposal] store.save failed:', String(e).slice(0, 120))
  }
}

function persistRemove(id: string): void {
  if (!store) return
  try {
    store.remove(id)
  } catch (e) {
    console.warn('[proposal] store.remove failed:', String(e).slice(0, 120))
  }
}

/**
 * Put rows back after a restart.
 *
 * ONLY ISSUED DRAFTS COME BACK, and the rule is not an optimisation. A draft
 * that was never issued has a plaintext secret that died with the process, so
 * nobody could ever confirm it; restoring it would put an unpressable card in
 * the queue and, worse, hold its invoice open. Those are reported as orphans
 * instead, which un-pends the invoice the same way an expiry does.
 *
 * Expired rows are reported too. That case is new: the Map could never notice
 * a draft that expired while the process was down, because there was no draft
 * any more.
 *
 * Returns what happened, so the caller can log one honest line instead of
 * guessing.
 */
export function restoreProposals(rows: PendingProposal[]): {
  restored: number
  expired: number
  unissued: number
  replaced: number
} {
  const edge = Date.now() - LIFETIME_MS
  let restored = 0
  let expired = 0
  let unissued = 0
  let replaced = 0

  // First pass: the rows that could come back at all.
  const alive: PendingProposal[] = []
  for (const row of rows) {
    if (pending.has(row.id)) continue
    if (row.createdAt < edge) {
      expired++
      reportOrphan(redact(row), 'expired')
      persistRemove(row.id)
      continue
    }
    if (!row.issued) {
      unissued++
      reportOrphan(redact(row), 'expired')
      persistRemove(row.id)
      continue
    }
    alive.push(row)
  }

  /*
   * ONE PENDING PROPOSAL PER PERSON SURVIVES THE RESTART TOO.
   *
   * `remember` enforces it live by dropping the previous draft, so the table
   * should never hold two for one person -- but a restore that simply put
   * every row back would DEPEND on that rather than assert it, and the
   * invariant's own reason (two identical-looking buttons, the wrong one
   * pressed) is at its sharpest right after a deploy, when the chat has
   * scrolled. The newest wins; the others leave as `replaced`, exactly as
   * they would have live.
   *
   * Chosen in a second pass rather than inside the first: deciding a winner
   * while also inserting made the count of what was restored include the ones
   * immediately replaced, which is the kind of number that reads as success.
   */
  const newest = new Map<string, PendingProposal>()
  for (const row of alive) {
    const held = newest.get(row.telegramId)
    if (!held || row.createdAt > held.createdAt) {
      if (held) {
        replaced++
        reportOrphan(redact(held), 'replaced')
        persistRemove(held.id)
      }
      newest.set(row.telegramId, row)
      continue
    }
    replaced++
    reportOrphan(redact(row), 'replaced')
    persistRemove(row.id)
  }
  for (const row of newest.values()) {
    // A draft already waiting for this person beats anything from the table:
    // it was made by THIS process and its plaintext is still in hand.
    const live = [...pending.values()].find(
      q => q.telegramId === row.telegramId
    )
    if (live) {
      replaced++
      reportOrphan(redact(row), 'replaced')
      persistRemove(row.id)
      continue
    }
    pending.set(row.id, row)
    restored++
  }
  return { restored, expired, unissued, replaced }
}

/**
 * Tell the listener about a draft that will never be sent. Public because
 * the confirm route needs it too: by the time `execute` reports a failure
 * the draft has already left the queue, so there is nothing left to drop.
 */
export function reportOrphan(p: PublicProposal, reason: OrphanReason): void {
  // An invoice to un-pend, or a picture already made and never sent: both
  // are worth a line somewhere. A plain text draft is not.
  if ((p.invoiceId === undefined && !p.media) || !orphanListener) return
  try {
    orphanListener(p, reason)
  } catch (e) {
    // The listener is bookkeeping. The draft is gone whether or not the
    // note about it lands.
    console.warn('[proposal] orphan listener failed:', String(e).slice(0, 120))
  }
}

/** Remove a draft that will never be sent, telling the listener why. */
function drop(p: PendingProposal, reason: OrphanReason): void {
  pending.delete(p.id)
  persistRemove(p.id)
  reportOrphan(redact(p), reason)
}

/** Strip what must never leave. Copies, so a caller cannot reach the original. */
function redact(p: PendingProposal): PublicProposal {
  const {
    secret: _secret,
    secretDigest: _digest,
    issued: _issued,
    turn: _turn,
    ...rest
  } = p
  void _secret
  void _digest
  void _issued
  void _turn
  return rest
}

/**
 * Compare in constant time.
 *
 * `===` on strings leaks the length of the shared prefix through timing. That
 * is a thin channel and an entirely avoidable one on the check that stands
 * between a stranger and somebody else's Telegram.
 */
export function digestOf(secret: string): string {
  return createHash('sha256')
    .update(String(secret ?? ''), 'utf8')
    .digest('hex')
}

/**
 * The presented secret against the stored DIGEST.
 *
 * This used to compare the two plaintexts, with a length pre-check in front
 * of `timingSafeEqual` -- the comment beside it already said a digest was the
 * right shape, and the code had not caught up. Now both sides are 32-byte
 * digests, so there is no length to leak and no branch before the constant-
 * time compare.
 *
 * An empty stored digest never matches: a restored draft whose plaintext died
 * with the process is unconfirmable, which is the honest outcome.
 */
function sameSecret(storedDigest: string, presented: string): boolean {
  if (!storedDigest) return false
  const x = Buffer.from(storedDigest, 'utf8')
  const y = Buffer.from(digestOf(presented), 'utf8')
  if (x.length !== y.length) return false
  return timingSafeEqual(x, y)
}

function dropExpired(): void {
  const edge = Date.now() - LIFETIME_MS
  for (const p of pending.values()) {
    if (p.createdAt < edge) drop(p, 'expired')
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
 * The urls a media draft may carry, checked once here.
 *
 * `remember` throws with this text (the model reads it as a tool error and
 * can fix the call); the send executor's `check` refuses with it (a draft
 * restored from a poisoned row never gets as far as a download). The rules
 * guard the mirror row and Telegram's own album limit, and https is not
 * negotiable: an http url would send the service's file credentials over
 * the open wire.
 */
export function mediaProblem(media: ProposalMedia | undefined): string | null {
  if (!media) return null
  const urlProblem = (u: unknown): string | null => {
    const s = typeof u === 'string' ? u : ''
    if (!s.startsWith('https://'))
      return 'файл можно взять только по https-ссылке'
    if (s.length > 2048)
      return 'ссылка на файл длиннее 2048 знаков — не влезет в черновик'
    return null
  }
  if (media.kind === 'album') {
    const urls = Array.isArray(media.urls) ? media.urls : []
    if (urls.length < 2 || urls.length > 10)
      return 'альбом — это от 2 до 10 ссылок, как принимает Telegram'
    for (const u of urls) {
      const bad = urlProblem(u)
      if (bad) return bad
    }
    return null
  }
  return urlProblem((media as { url?: unknown }).url)
}

/**
 * The window a draft's schedule may sit in, checked once here.
 *
 * The same two doors as `mediaProblem`: `remember` throws with this text
 * (the model reads it as a tool error), the send executor's `check` refuses
 * with it (a restored row whose time has passed never reaches the wire).
 * Closer than 30 seconds is "now" wearing a costume; farther than 30 days
 * outlives the draft's own lifetime and any promise the card made. A time
 * that is not a finite number -- Date.parse of garbage -- must die too:
 * GramJS would read it as absent and send immediately, a mode change the
 * person never confirmed.
 */
export function scheduleProblem(
  at: unknown,
  now: number = Date.now()
): string | null {
  if (at === undefined || at === null) return null
  if (typeof at !== 'number' || !Number.isFinite(at))
    return 'время расписания не понято — передай ISO, например 2026-09-14T18:00:00Z'
  if (at < now + 30_000 || at > now + 30 * 24 * 3600_000)
    return 'расписание — от 30 секунд до 30 дней вперёд; назови время в этом окне'
  return null
}

/**
 * Remember a proposal so it can be confirmed later.
 *
 * The id is supplied by the caller rather than generated here so tests do not
 * have to guess it. The SECRET is not: it is minted here, in the one place
 * that owns it, so no caller can supply a weak one or reuse an old one.
 */
export function remember(
  p: Omit<PendingProposal, 'createdAt' | 'secret' | 'secretDigest' | 'issued'>
): PendingProposal {
  dropExpired()
  if (pending.size >= MAX_PENDING) {
    throw new Error(
      'слишком много неподтверждённых действий — подождите минуту'
    )
  }
  {
    const badMedia = mediaProblem(p.media)
    if (badMedia) throw new Error(badMedia)
    const badWhen = scheduleProblem(p.scheduleAt)
    if (badWhen) throw new Error(badWhen)
  }
  /*
   * ONE PENDING PROPOSAL PER PERSON -- ENFORCED AT ISSUE, NOT HERE.
   *
   * The rule is unchanged: two pressable drafts at once is how somebody
   * confirms the wrong one, since the buttons look identical and the chat has
   * moved on. What changed is WHEN the previous one goes.
   *
   * It used to go right here, the moment a new draft was created. But a draft
   * is created by a TOOL CALL in the middle of a model turn, and a turn can
   * die after that call -- our own 180 s abort, a dropped stream, a provider
   * error. Production, 16.09.2026:
   *
   *   15:02:49  draft-unsent  a photo draft replaced: picture made, not sent
   *   15:03:03  sweep-failed  the sweep died at the model turn: aborted
   *
   * The turn that died had already evicted the card the owner was holding --
   * and delivered nothing in its place. Two pictures paid for, one card
   * destroyed, no card produced. Four of the eight evictions that day sat
   * next to an aborted turn like this.
   *
   * A draft that was never ISSUED is not pressable: its secret never left the
   * process. So it cannot be the second identical button the rule is about,
   * and there is no reason for it to displace anything. Only a draft that
   * actually becomes a card does that -- see `issueFor`.
   *
   * What still goes here: this person's earlier UNISSUED drafts. Those belong
   * to turns that are over, `issueFor` matches on the turn token and would
   * never hand them out, and leaving them would grow the queue by one per
   * dead turn. They leave as `expired`, which is what they are: prepared,
   * never shown, and now unshowable -- the same word `restoreProposals` uses
   * for the same thing after a restart.
   */
  for (const old of pending.values()) {
    if (old.telegramId === p.telegramId && !old.issued) drop(old, 'expired')
  }
  const minted = randomBytes(16).toString('hex')
  const saved: PendingProposal = {
    ...p,
    createdAt: Date.now(),
    // 128 bits. The id is only a lookup key now; this is the authorisation.
    secret: minted,
    secretDigest: digestOf(minted),
    issued: false,
  }
  pending.set(p.id, saved)
  persistSave(saved)
  // A COPY. Handing back the live record is a second door onto the one-time
  // flag: a caller could set `issued` back to false and re-open it.
  return { ...saved }
}

/**
 * The draft AND its secret, for the answer to the turn that created it.
 *
 * The only door the secret comes out of. Named so that adding a second caller
 * is a decision somebody has to make on purpose.
 *
 * ── ONCE PER PROPOSAL, NOT ONCE PER TURN ──────────────────────────────────
 *
 * Answering on every later turn while the draft is still alive means the
 * person who says "спасибо" after the card appears gets a SECOND card, with
 * the same live secret: two buttons for one message, and pressing either
 * sends. So the door closes behind the first answer.
 *
 * The cost is that a lost answer strands the draft, and it expires unshown.
 * That is the safe direction: an unsent message is recoverable by asking
 * again, an unexpected second card is not.
 */
export function issueFor(
  telegramId: string,
  turn: string
): (PublicProposal & { secret: string; expiresAt: number }) | null {
  dropExpired()
  const mine = String(telegramId)
  // No turn, no answer. An empty token must never match a draft that has none.
  if (!turn) return null
  for (const p of pending.values()) {
    if (p.telegramId !== mine || p.issued || p.turn !== turn) continue
    /*
     * THE MOMENT THIS BECOMES A CARD, THE PREVIOUS CARD STOPS BEING ONE.
     *
     * This is the one-per-person rule, moved to the instant it is actually
     * about: a second PRESSABLE button. Done before the flag flips so the
     * loop cannot reach the draft being issued.
     */
    for (const old of pending.values()) {
      if (old.id === p.id) continue
      if (old.telegramId === mine && old.issued) drop(old, 'replaced')
    }
    p.issued = true
    // The flag is the difference between a card that comes back after a
    // restart and one that cannot: persist it the moment it flips.
    persistSave(p)
    /*
     * THE CARD SAYS WHEN IT DIES, SO NOBODY HAS TO REMEMBER.
     *
     * The bot holds its sweep while a card is still pressable -- drawing a
     * second one would evict the first, and the first carries a picture that
     * has already been paid for. To hold, it needs the instant this card
     * stops being pressable, and there are only two ways to know it: ship it
     * with the card, or keep a copy of LIFETIME_MS on the other side of the
     * wire. A copied constant is right until somebody changes the original,
     * and then it is quietly wrong in the direction that spends money.
     */
    return {
      ...redact(p),
      secret: p.secret,
      expiresAt: p.createdAt + LIFETIME_MS,
    }
  }
  return null
}

/**
 * The proposal id out of a request body.
 *
 * `readBody` returns the RAW STRING, not a parsed object. Every other caller in
 * render-server.ts wraps it in `JSON.parse`; the two confirm/cancel routes did
 * not, and the cast `as { id?: string }` compiled happily. `body.id` was
 * therefore always undefined, `claim(who, '')` always refused, and every press
 * of "Send" answered "already confirmed or expired".
 *
 * The button would have existed, looked right, and reached nobody -- which is
 * the exact defect this whole change was written to remove, reintroduced one
 * layer up. Caught by a probe before merge, not by the tests: those covered the
 * store and the bot module, and nothing covered the route wiring.
 *
 * Parsing lives here rather than inline in the route so that it is reachable by
 * a test at all.
 */
export function idFromBody(raw: unknown): { id: string; secret: string } {
  const take = (o: { id?: unknown; secret?: unknown } | null | undefined) => ({
    id: typeof o?.id === 'string' ? o.id : '',
    secret: typeof o?.secret === 'string' ? o.secret : '',
  })
  if (typeof raw !== 'string') {
    // Defensive: if readBody ever hands back a parsed object, take the fields
    // -- but do not assume it, which was the whole mistake.
    return take(raw as { id?: unknown; secret?: unknown } | null | undefined)
  }
  try {
    return take(JSON.parse(raw || '{}'))
  } catch {
    /*
     * A malformed body is an empty id, not a thrown error. `claim` then
     * refuses in words the person can read; an exception here would surface as
     * a 500 on a button press, which says "we are broken" instead of "that
     * draft is gone".
     */
    return { id: '', secret: '' }
  }
}

/**
 * What is waiting for this person, if anything -- WITHOUT the secret.
 *
 * This is what the read route answers with, and it is deliberately not enough
 * to confirm anything. Before the secret existed, this same answer was a
 * complete authorisation: read the id, post it to /confirm, and the message
 * went out with nobody pressing anything.
 */
export function pendingFor(telegramId: string): PublicProposal | null {
  dropExpired()
  const mine = String(telegramId)
  for (const p of pending.values()) if (p.telegramId === mine) return redact(p)
  return null
}

export function forget(id: string): void {
  pending.delete(id)
  persistRemove(id)
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
  id: string,
  secret: string,
  /**
   * What the press meant. Both consume the draft; only a cancel reports an
   * attached invoice as orphaned. The default keeps every existing caller
   * on the confirm path.
   */
  intent: 'execute' | 'cancel' = 'execute'
): { ok: true; proposal: PublicProposal } | { ok: false; why: string } {
  dropExpired()
  const p = pending.get(id)
  if (!p) return { ok: false, why: 'это действие уже подтверждено или истекло' }
  if (p.telegramId !== String(telegramId)) {
    // Fail-closed and worded without confirming the id exists: a probe should
    // not learn whether somebody else has a draft waiting.
    return { ok: false, why: 'это действие предложено не вам' }
  }
  if (!sameSecret(p.secretDigest, secret)) {
    /*
     * The id alone is not a pass, and this is the line that makes that true.
     *
     * Counted, and the draft is dropped after a few: 128 bits is not
     * searchable, so a wrong secret is not a guess in progress but a sign that
     * something is wrong -- and on a path that reaches other people, the
     * answer to that is to stop offering, not to keep the door ajar.
     *
     * The wording does not say "wrong secret". It is the same sentence a
     * stale draft gets, because the difference is only useful to somebody
     * probing.
     */
    console.warn(
      `[proposal] wrong secret id=${id} who=${String(telegramId)} ` +
        `action=${p.action}`
    )
    return { ok: false, why: 'это действие уже подтверждено или истекло' }
  }
  if (intent === 'cancel') drop(p, 'cancelled')
  else {
    pending.delete(id)
    persistRemove(id)
  }
  return { ok: true, proposal: redact(p) }
}

/**
 * THE PRESS MAY LAND IN A DIFFERENT PROCESS THAN THE CARD.
 *
 * Measured in production on 2026-09-13 at 16:09-16:11 UTC. A merge redeployed
 * the render while the seller's sweep was running. The outgoing container
 * served the agent turn and minted the card (16:09:46, row saved); the new
 * container had already come up and restored the table BEFORE that row
 * existed (16:10:34, "restored 1"); traffic moved over, and the press at
 * 16:11:31 reached the new process, whose Map had never heard of the id. The
 * owner read "this action is already confirmed or expired" about a card
 * that was sixty seconds old. Railway keeps both containers alive for about
 * a minute on every deploy, and this repository deploys several times a day,
 * so any card minted in that minute was unpressable.
 *
 * The table already had the row. So on a miss -- and ONLY on a miss, the
 * hot path stays in memory -- the row is read back, adopted under the same
 * rules a restart applies (issued, not expired, newest per person), and the
 * claim is tried once more with the same secret. No plaintext leaves the
 * process: the row carries the digest, and the press carries the secret.
 *
 * The mirror image of the same minute: a card the NEW process restored may
 * meanwhile have been pressed in the OLD one, which deleted the row. Its
 * Map entry is then a stale copy with a valid digest, and a second press would
 * send the message twice. So a hit is checked against the table too, and a
 * vanished row means the press already happened somewhere.
 *
 * A store that cannot answer does not block the press: the in-memory verdict
 * stands, exactly as it did before the store existed, and a warning says so.
 */
export async function claimAcrossDeploy(
  telegramId: string,
  id: string,
  secret: string,
  intent: 'execute' | 'cancel' = 'execute'
): Promise<
  { ok: true; proposal: PublicProposal } | { ok: false; why: string }
> {
  dropExpired()
  const mine = String(telegramId)
  const load = store?.load
  if (!load || !id) return claim(mine, id, secret, intent)

  if (pending.has(id)) {
    let row: PendingProposal | null | undefined
    try {
      row = await load(id)
    } catch (e) {
      console.warn('[proposal] store.load failed:', String(e).slice(0, 120))
    }
    if (row === null) {
      // The row is gone but the Map still has it: consumed by another process
      // during the overlap, or removed by hand. Either way it was pressed
      // once already.
      const stale = pending.get(id)
      pending.delete(id)
      console.warn(
        `[proposal] stale draft id=${id} who=${mine} ` +
          `action=${stale?.action ?? '?'}: row gone, not sending twice`
      )
      return { ok: false, why: 'это действие уже подтверждено или истекло' }
    }
    return claim(mine, id, secret, intent)
  }

  let row: PendingProposal | null = null
  try {
    row = await load(id)
  } catch (e) {
    console.warn('[proposal] store.load failed:', String(e).slice(0, 120))
    return claim(mine, id, secret, intent)
  }
  if (!row) {
    console.log(`[proposal] miss id=${id} who=${mine}: no row, no draft`)
    return claim(mine, id, secret, intent)
  }
  // Fail-closed before adopting anything: a probe with somebody else's id
  // must not pull their card into this process.
  if (row.telegramId !== mine) {
    return { ok: false, why: 'это действие предложено не вам' }
  }
  if (row.createdAt < Date.now() - LIFETIME_MS) {
    reportOrphan(redact(row), 'expired')
    persistRemove(row.id)
    return claim(mine, id, secret, intent)
  }
  if (!row.issued) {
    // Never shown, so never pressed: a press with this id did not come from
    // a card. The row is dropped the way a restart drops it.
    reportOrphan(redact(row), 'expired')
    persistRemove(row.id)
    return claim(mine, id, secret, intent)
  }
  /*
   * ONE PENDING PROPOSAL PER PERSON, decided by age, not by which process
   * happened to mint it. A sibling already in this Map that is NEWER than
   * the row wins, as it would have live, and the row leaves as replaced. An
   * OLDER sibling is the card the other process already superseded (it only
   * survives here because the restore ran before that happened), so it is
   * the one to drop.
   */
  for (const sibling of [...pending.values()]) {
    if (sibling.telegramId !== mine) continue
    if (sibling.createdAt > row.createdAt) {
      reportOrphan(redact(row), 'replaced')
      persistRemove(row.id)
      return claim(mine, id, secret, intent)
    }
    drop(sibling, 'replaced')
  }
  pending.set(row.id, row)
  console.log(
    `[proposal] recovered id=${id} who=${mine} action=${row.action} ` +
      `from the table: minted by another process during a deploy overlap`
  )
  return claim(mine, id, secret, intent)
}

/**
 * Carry out a proposal the person has confirmed.
 *
 * Separate from `claim` on purpose: claiming is the decision, executing is the
 * consequence. A failure here must not silently put the proposal back --
 * whoever pressed the button has already decided, and a resurrected draft is
 * how the same message gets sent twice.
 */
export interface SendingClient {
  sendMessage: (
    to: string,
    opts: { message: string; parseMode: false; schedule?: Date }
  ) => Promise<unknown>
  /**
   * GramJS `sendFile`: `file` may be a direct URL (which Telegram fetches
   * itself; photo by URL is capped at 10 MB), a CustomFile built from
   * downloaded bytes, or an array of urls for an album. Same parseMode rule
   * as text: the approved caption must be the sent caption.
   */
  sendFile?: (to: string, opts: SendFileParams) => Promise<unknown>
  /**
   * GramJS `forwardMessages`: the messages and their source are named in the
   * draft's `args`, and fromPeer is REQUIRED when ids are integers -- the
   * wrapper cannot guess which chat they came from.
   */
  forwardMessages?: (
    to: string,
    opts: { messages: number[]; fromPeer: string }
  ) => Promise<unknown>
  /** The newest message, for `read`: maxId is the precise act the card names. */
  getMessages?: (
    chat: string,
    opts: { limit: number }
  ) => Promise<Array<{ id?: unknown }>>
  /** GramJS `markAsRead`: with maxId, exactly that; without, the whole dialog. */
  markAsRead?: (
    chat: string,
    message?: unknown,
    opts?: { maxId?: number }
  ) => Promise<unknown>
  getDialogs: (opts: { limit: number }) => Promise<unknown>
  /**
   * GramJS' raw-request door. The typing signal has no wrapper method, so it
   * rides `invoke` with a hand-built request; optional because the signal is
   * cosmetic and an older client (or a test double) must simply not show it.
   */
  invoke?: (request: unknown) => Promise<unknown>
  disconnect?: () => Promise<unknown>
}

/**
 * `parseMode: false` -- THE APPROVED BYTES MUST BE THE SENT BYTES.
 *
 * GramJS defaults `client.parseMode` to the MARKDOWN parser
 * (telegramBaseClient.js:133), and `sendMessage` runs the text through it
 * unless told otherwise. The card in the bot shows the raw string with no
 * parse mode, so what a person reads and what Telegram receives were two
 * different things. Measured on the installed telegram@2.26.22:
 *
 *   approved: "Смета на правку src/__tests__/auth_flow.ts: 5**2 часов. Код: `npm run verify`"
 *   sent:     "Смета на правку src/tests/auth_flow.ts: 52 часов. Код: npm run verify"
 *
 * Three silent corruptions in one sentence: `__tests__` eaten as italics, the
 * `**` of an arithmetic expression eaten as bold, the backticks stripped. A
 * confirmation screen that shows one thing and sends another is worse than no
 * confirmation, because the person believes they checked.
 *
 * `_parseMessageText` returns the text untouched when parseMode is falsy
 * (messageParse.js:38-40), which is exactly what is wanted here.
 */
const VERBATIM = { parseMode: false } as const

/** A bare id, which is exactly the shape `tg_dialogs` hands the model. */
const LOOKS_NUMERIC = /^-?\d+$/

/**
 * Run `attempt`, warming the address book first if the target is a bare id
 * and only that is what failed.
 *
 * ── WHY THIS IS NOT JUST THE CALL ITSELF ──────────────────────────────────
 *
 * `client()` builds a BRAND NEW `TelegramClient` on every call, and a
 * `StringSession` carries only dcId, server, port and auth key -- no entities.
 * GramJS resolves the peer inside the call (`getInputEntity`), and for a bare
 * numeric id every fast path is empty on a fresh client: the per-instance
 * entity cache is populated only by results of calls made on that same
 * instance, and `checkAuthorization` (`updates.GetState`) carries no users or
 * chats, so it warms nothing.
 *
 * Reproduced against the installed telegram@2.26.22:
 *   user id      -> "Could not find the input entity for {PeerUser}"
 *   channel id   -> "Could not find the input entity for {PeerChannel}"
 *   basic group  -> resolves (InputPeerChat needs no access hash)
 *   @username    -> resolves (contacts.ResolveUsername)
 *
 * And a bare id is precisely what the model holds: `tg_dialogs` returns
 * `id: x.id?.toString()` with no username, and `tg_send` takes it back as
 * `chat`. So the common case -- "reply to this dialog" -- would have failed on
 * every press with a message about input entities, which says nothing to
 * anybody about what to do next.
 *
 * `getDialogs` is what a real client does on startup: its result carries the
 * users and chats, and GramJS feeds them into the session and the cache. One
 * extra round trip, taken ONLY when the first attempt fails AND the target is
 * numeric, so a @username call stays a single round trip and a global search
 * (no target at all) never warms.
 *
 * Shared by the send paths here and by the reading tools in
 * telegram-tools.ts -- the empty entity cache is a property of the client,
 * not of what the call was going to do.
 */
export async function resolvingPeer<T>(
  c: { getDialogs: (opts: { limit: number }) => Promise<unknown> },
  target: string | readonly string[] | undefined,
  attempt: () => Promise<T>
): Promise<T> {
  try {
    return await attempt()
  } catch (e) {
    const text = e instanceof Error ? e.message : String(e)
    const unresolved = /input entity|Could not find/i.test(text)
    /*
     * `target` may name TWO peers (a forward has a source and a destination)
     * and the thrown text does not reliably say which one was unresolved. The
     * warm-up loads every dialog, so one warm fixes both; it is taken only
     * when at least one name is a bare id, for the same reason as before.
     */
    const names =
      target === undefined ? [] : Array.isArray(target) ? target : [target]
    const anyNumeric = names.some(t => LOOKS_NUMERIC.test(t))
    if (!unresolved || !anyNumeric) throw e
  }
  await c.getDialogs({ limit: 200 })
  return attempt()
}

export async function sendWithAddressBook(
  c: SendingClient,
  target: string,
  message: string,
  scheduleAt?: number
): Promise<unknown> {
  return resolvingPeer(c, target, () =>
    c.sendMessage(target, {
      message,
      ...VERBATIM,
      ...(scheduleAt ? { schedule: new Date(scheduleAt) } : {}),
    })
  )
}

/**
 * THE SENT MESSAGE GOES INTO THE MEMORY AT ONCE.
 *
 * Postgres by Telegram's own message id, so the next ingest keeps nothing
 * twice, and Zep, so the agent's picture of this person includes what the
 * owner just said -- not half an hour later. Best effort: a memory that is
 * down does not un-send a message.
 */
async function mirrorSent(
  ctx: { telegramId: string; pool?: unknown },
  p: PublicProposal,
  sent: unknown
): Promise<void> {
  if (!p.lead || !ctx.pool) return
  const m = sent as { id?: unknown; date?: unknown } | null | undefined
  const id = Number(m?.id)
  // id 0 is Telegram's placeholder for a scheduled message: no real message
  // exists until the clock fires, and a mirrored msg_id of 0 is junk the
  // next ingest cannot match. The touch is still written -- the service the
  // person paid for is the schedule, and it was delivered.
  if (!Number.isFinite(id) || id <= 0) return
  const date = Number(m?.date)
  const text = p.what ?? ''
  if (!text.trim()) return
  try {
    const { mirrorNow } = await import('./crm-mirror')
    await mirrorNow(
      ctx.pool as never,
      String(ctx.telegramId),
      String(p.lead),
      [
        {
          msgId: id,
          at:
            Number.isFinite(date) && date > 0
              ? new Date(date * 1000)
              : new Date(),
          out: true,
          text,
        },
      ],
      p.display ? p.display.split(' (@')[0] : null
    )
  } catch (e) {
    console.warn(
      `[proposal] sent message not mirrored lead=${p.lead}: ${String(e).slice(0, 120)}`
    )
  }
}

/** A file to upload: the shape of GramJS' CustomFile, without importing it. */
export interface CustomFileLike {
  name: string
  size: number
  path: string
  buffer?: Buffer
}

/** The sendFile parameters a media kind maps to. Album captions are a list. */
export type SendFileParams = {
  file: string | CustomFileLike | Array<string | CustomFileLike>
  caption?: string | string[]
  voiceNote?: boolean
  videoNote?: boolean
  supportsStreaming?: boolean
  forceDocument?: boolean
  attributes?: unknown[]
  /** GramJS' own name for a scheduled file send. */
  scheduleDate?: Date
  parseMode: false
}

/** Opus-ish voice: ~6 KB per second is honest enough for a waveform. */
export function estimatedVoiceSeconds(bytes: number): number {
  return Math.max(1, Math.round(bytes / 6000))
}

/**
 * Download the bytes behind a media url, within hard bounds.
 *
 * https only (checked again here, because a restored row can predate a
 * validator), 50 MB (Telegram documents cap at 2 GB but a service file has
 * no business being that big, and the PRESS must not hang), 30 s wall clock.
 * Content-length is a hint, not a promise: the real check is on the bytes
 * that actually arrived.
 */
async function downloadBytes(url: string): Promise<Buffer> {
  if (!/^https:\/\//.test(url))
    throw new Error('файл можно взять только по https-ссылке')
  let res: Response
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(30_000) })
  } catch (e) {
    throw new Error(
      `не удалось скачать файл: ${String(e instanceof Error ? e.message : e).slice(0, 80)}`
    )
  }
  if (!res.ok) throw new Error(`не удалось скачать файл (${res.status})`)
  const cap = 50 * 1024 * 1024
  const declared = Number(res.headers.get('content-length') ?? 0)
  if (declared > cap) throw new Error('файл больше 50 МБ — не буду отправлять')
  const buf = Buffer.from(await res.arrayBuffer())
  if (buf.length > cap)
    throw new Error('файл больше 50 МБ — не буду отправлять')
  return buf
}

/** The last path segment of a url, or 'file' when there is none usable. */
function basenameOf(url: string): string {
  try {
    const seg = new URL(url).pathname.split('/').filter(Boolean).pop()
    return seg && seg.length <= 200 ? seg : 'file'
  } catch {
    return 'file'
  }
}

/**
 * ONE MAPPING FROM KIND TO WIRE PARAMETERS, and the reasons it is not just
 * `{file: media.url}`:
 *
 *  - voice needs `voiceNote` AND an explicit DocumentAttributeAudio, because
 *    GramJS cannot measure duration (`_getMetadata` is a stub that answers
 *    0) and a URL would drop both flags anyway;
 *  - video gets `supportsStreaming`; a video note `videoNote`;
 *  - a document is uploaded, not linked, so it arrives under its promised
 *    name and as a document even when the url ends in .png (the URL path
 *    sniffs images into InputMediaPhotoExternal);
 *  - an album passes the urls as the array `_sendAlbum` expects, captions
 *    item by item.
 *
 * The attributes are the card's promises: "~N sec" is only honest if the
 * number actually travels to Telegram.
 */
export async function fileParamsFor(
  media: ProposalMedia,
  caption: string | undefined
): Promise<SendFileParams> {
  if (media.kind === 'photo')
    return { file: media.url, caption: caption ?? '', ...VERBATIM }
  if (media.kind === 'album')
    return {
      file: media.urls,
      caption: media.captions ?? caption ?? '',
      ...VERBATIM,
    }
  const { CustomFile } = await import('telegram/client/uploads')
  if (media.kind === 'document') {
    const buf = await downloadBytes(media.url)
    const name = media.fileName?.trim() || basenameOf(media.url)
    return {
      file: new CustomFile(name, buf.length, '', buf) as CustomFileLike,
      caption: caption ?? '',
      forceDocument: true,
      ...VERBATIM,
    }
  }
  if (media.kind === 'voice' || media.kind === 'video_note') {
    const buf = await downloadBytes(media.url)
    const { Api } = await import('telegram')
    if (media.kind === 'voice') {
      const seconds = media.duration ?? estimatedVoiceSeconds(buf.length)
      return {
        file: new CustomFile(
          'voice.mp3',
          buf.length,
          '',
          buf
        ) as CustomFileLike,
        caption: caption ?? '',
        voiceNote: true,
        attributes: [
          new Api.DocumentAttributeAudio({ voice: true, duration: seconds }),
        ],
        ...VERBATIM,
      }
    }
    const seconds = media.duration ?? estimatedVoiceSeconds(buf.length)
    return {
      file: new CustomFile(
        'video_note.mp4',
        buf.length,
        '',
        buf
      ) as CustomFileLike,
      caption: '', // a round video note carries no caption on Telegram
      videoNote: true,
      attributes: [
        new Api.DocumentAttributeVideo({
          duration: seconds,
          roundMessage: true,
          w: 0,
          h: 0,
        }),
      ],
      ...VERBATIM,
    }
  }
  // video
  const buf = await downloadBytes(media.url)
  return {
    file: new CustomFile(
      basenameOf(media.url) || 'video.mp4',
      buf.length,
      '',
      buf
    ) as CustomFileLike,
    caption: caption ?? '',
    supportsStreaming: true,
    ...VERBATIM,
  }
}

export async function sendFileWithAddressBook(
  c: SendingClient,
  target: string,
  media: ProposalMedia,
  caption: string | undefined,
  scheduleAt?: number
): Promise<unknown> {
  if (!c.sendFile) throw new Error('этот клиент не умеет отправлять файлы')
  /*
   * BOUND, NOT DETACHED, AND THE DIFFERENCE IS A PRODUCTION PHOTO SEND.
   *
   * GramJS hangs `sendFile` on the prototype as
   * `sendFile(entity, params) { return uploadMethods.sendFile(this, ...) }`,
   * so the client travels as `this`. The bare `const send = c.sendFile` that
   * stood here carried the function without its instance: `this` arrived
   * undefined, and the very first line of the library implementation --
   * `client.getInputEntity(entity)` -- answered the owner's press with
   * "Cannot read properties of undefined (reading 'getInputEntity')".
   * Every PHOTO send failed this way in production (2026-09-13, a lead-magnet
   * card to @Best_WoodyWeed); text went out because `sendWithAddressBook`
   * calls `c.sendMessage` attached.
   *
   * The tests never saw it: their fake client is an object literal whose
   * `sendFile` closes over its own state and never touches `this`. The
   * regression test beside this change gives the fake a PROTOTYPE method that
   * reads `this`, the same contract the real client has.
   *
   * `.bind(c)` also keeps the narrowing the bare const was after: `c.sendFile`
   * is optional on `SendingClient`, and a property narrowing does not survive
   * into the closure below.
   */
  const send = c.sendFile.bind(c)
  const params = await fileParamsFor(media, caption)
  if (scheduleAt) params.scheduleDate = new Date(scheduleAt)
  return resolvingPeer(c, target, () => send(target, params))
}

/** Best-effort, bounded: the journal must never hold or fail a send. */
async function noteInJournal(
  pool: unknown,
  e: {
    kind: 'tokens-spent' | 'tokens-refunded' | 'failure'
    who: string
    amount: number
    what: string
    severity?: 'normal' | 'attention' | 'alarm'
  }
): Promise<void> {
  try {
    const { record } = await import('../hive/journal')
    await Promise.race([
      record(pool as never, e),
      new Promise<void>(r => setTimeout(r, TOUCH_WRITE_MS)),
    ])
  } catch (err) {
    console.warn('[proposal] journal note failed:', String(err).slice(0, 120))
  }
}

/** What an executor may need about the press that started it. */
export interface ExecCtx {
  telegramId: string
  pool?: unknown
}

/**
 * HOW ONE ACTION IS CARRIED OUT.
 *
 * `execute` used to be a switch with one populated case and a default that
 * refused everything else. Adding `forward` meant editing the switch, the
 * refusal text, and the set that decides what may occupy the queue -- three
 * places, one of them prose. The table replaces that: an action is executable
 * exactly when it has a row here, `execute` runs the same spine for every
 * row, and a row left out refuses honestly below.
 */
export interface Executor {
  /**
   * A refusal before anything moves, or null to proceed. Absent when the
   * tool's schema already guarantees everything a check would -- a guard
   * repeating the schema is the schema written twice.
   */
  check?: (p: PublicProposal, ctx: ExecCtx) => string | null
  /** The act itself. Runs inside the refund guard: a throw with money taken gives the money back. */
  run: (c: SendingClient, p: PublicProposal, ctx: ExecCtx) => Promise<unknown>
  /** Show "typing…" before the act. Sends only, and never when scheduled. */
  typing?: boolean
  /** Bookkeeping after success (the CRM mirror, the touch). Sends only. */
  after?: (
    ctx: ExecCtx,
    p: PublicProposal,
    sent: unknown,
    paid: number | null
  ) => Promise<void>
}

/** The sent message into the memory, then the touch -- send's own aftermath. */
async function afterSend(
  ctx: ExecCtx,
  p: PublicProposal,
  sent: unknown,
  paid: number | null
): Promise<void> {
  if (sent !== null) await mirrorSent(ctx, p, sent)
  if (p.lead && ctx.pool) {
    try {
      const { recordTouch } = await import('./crm-touches')
      const { SELLER_NOTE_PREFIXES } = await import('./crm-notes')
      const write = recordTouch(ctx.pool as never, {
        owner: String(ctx.telegramId),
        lead: String(p.lead),
        botName: p.bot ?? null,
        // A paid, delivered service is a purchase; a message is a touch.
        kind: p.charge ? 'bought' : 'written',
        note: p.charge
          ? SELLER_NOTE_PREFIXES.service +
            `${p.media?.kind ?? p.charge.op}, списано ${paid ?? 0}`
          : p.gift
            ? SELLER_NOTE_PREFIXES.gift +
              `${p.media?.kind ?? 'photo'}: ` +
              (p.what ?? '').slice(0, 60)
            : SELLER_NOTE_PREFIXES.message + (p.what ?? '').slice(0, 80),
      })
      const outcome = await Promise.race([
        write,
        new Promise<'timed out'>(r =>
          setTimeout(() => r('timed out'), TOUCH_WRITE_MS)
        ),
      ])
      if (outcome !== 'recorded') {
        console.warn(
          `[proposal] touch not recorded (${String(outcome)}) lead=${p.lead} who=${String(ctx.telegramId)}`
        )
      }
    } catch (e) {
      console.warn(
        `[proposal] touch write threw lead=${p.lead}: ${String(e).slice(0, 120)}`
      )
    }
  }
}

/**
 * The table. Keyed by exactly the actions `execute` can carry out; a key
 * without a row is a compile error here rather than a runtime refusal below.
 */
const EXECUTORS: Record<'send' | 'forward' | 'read', Executor> = {
  send: {
    check: p => {
      if (!p.what && !p.media) return 'нечего отправлять: текст пуст'
      /*
       * The same url rules `remember` enforces, read again here: a draft
       * restored from a poisoned row must not get as far as a download, and
       * the refusal must come before any money moves. The schedule window
       * too: a pressed draft whose time has passed would silently send NOW,
       * which is a different act from the one the card named.
       */
      return mediaProblem(p.media) ?? scheduleProblem(p.scheduleAt)
    },
    async run(c, p) {
      // Both branches hand back the sent message, so a photo with a
      // caption is mirrored like text (CRM audit 2026-09-12, P2 #9).
      if (p.media)
        return sendFileWithAddressBook(
          c,
          p.target,
          p.media,
          p.what,
          p.scheduleAt
        )
      return sendWithAddressBook(c, p.target, p.what ?? '', p.scheduleAt)
    },
    typing: true,
    after: afterSend,
  },
  forward: {
    /*
     * Forwarding carries somebody else's words somewhere new -- the card says
     * which messages from where, and `args` carries the same names in the
     * form the wire needs. No mirror, no touch: nothing the owner wrote left
     * the account, so the CRM picture gains nothing from it.
     */
    check: p => {
      const ids = p.args?.messageIds
      const n = Array.isArray(ids) ? ids.length : 0
      if (n < 1) return 'нечего пересылать: не названы сообщения'
      if (n > 100) return 'слишком много сообщений для одной пересылки (до 100)'
      if (!String(p.args?.fromPeer ?? '').trim())
        return 'не назван источник: откуда пересылать'
      return null
    },
    async run(c, p) {
      if (!c.forwardMessages)
        throw new Error('этот клиент не умеет пересылать сообщения')
      const ids = (p.args?.messageIds as number[]) ?? []
      const from = String(p.args?.fromPeer ?? '')
      // BOUND, for the same reason as sendFile: the wrapper passes `this` on
      // into the library call, and a detached reference is a production
      // failure that an object-literal fake cannot reproduce (#2372).
      const fwd = c.forwardMessages.bind(c)
      return resolvingPeer(c, [p.target, from], () =>
        fwd(p.target, { messages: ids, fromPeer: from })
      )
    },
  },
  read: {
    /*
     * Marking read is a signal TO the other person: their checkmarks change
     * and there is no undo. That visibility is why it goes through the gate
     * rather than happening on the model's say-so.
     *
     * No `check`: the schema requires the chat, and an executor guard here
     * would be the schema repeated in prose.
     */
    async run(c, p) {
      if (!c.markAsRead)
        throw new Error('этот клиент не умеет отмечать прочитанным')
      if (!c.getMessages)
        throw new Error('этот клиент не умеет читать сообщения')
      const mark = c.markAsRead.bind(c)
      return resolvingPeer(c, p.target, async () => {
        const newest = (await c.getMessages!(p.target, { limit: 1 }))[0]
        const maxId = Number(newest?.id)
        // The newest message's id names exactly what a person means by "mark
        // that read". An empty chat has no newest: read the whole dialog,
        // which for an empty chat is the same act.
        return Number.isFinite(maxId) && maxId > 0
          ? mark(p.target, undefined, { maxId })
          : mark(p.target)
      })
    },
  },
}

/** What `execute` can carry out. The tools' queue gate reads this, not a copy. */
export const EXECUTABLE_ACTIONS: ReadonlySet<string> = new Set(
  Object.keys(EXECUTORS)
)

export async function execute(
  p: PublicProposal,
  ctx: ExecCtx
): Promise<{ done: true; action: string } | { done: false; why: string }> {
  const { client } = await import('./telegram-tools')
  const { hangUp } = await import('./hang-up')
  let c: SendingClient | null = null
  try {
    c = (await client(ctx as never)) as SendingClient
    const exec = (EXECUTORS as Partial<Record<ProposalAction, Executor>>)[
      p.action
    ]
    if (!exec) {
      /*
       * An action with no row in the table still refuses, in words, naming
       * the action. Pretending to do it would be worse than the gap it
       * leaves, because the person would believe the thing happened.
       *
       * The list of what IS carried out is derived from the table, so a new
       * row updates the sentence without a second edit here.
       */
      const done = Object.keys(EXECUTORS)
      return {
        done: false,
        why:
          `подтверждение для «${p.action}» ещё не сделано — ` +
          `сделано: ${done.join(', ')}`,
      }
    }
    const bad = exec.check?.(p, ctx)
    if (bad) return { done: false, why: bad }
    /*
     * THE MONEY, AFTER THE PRESS AND BEFORE THE ACT. A charge on the
     * proposal is the recipient's -- a service they asked for in the DM
     * and the owner approved with a button. Charging here, not at tool
     * time, means the model's word alone never moves anybody's balance,
     * and a cancelled or expired card costs the recipient nothing.
     */
    let paid: number | null = null
    if (p.charge) {
      if (!ctx.pool)
        return {
          done: false,
          why: 'списать не с чего: база недоступна — услуга не отправлена',
        }
      const { spendByTid } = await import('./billing-shared')
      const r = await spendByTid(
        ctx.pool as never,
        p.charge.telegramId,
        p.charge.op
      )
      if (!r.ok)
        return {
          done: false,
          why:
            `у получателя не хватает токенов (${r.причина ?? 'баланс мал'}) — ` +
            'предложи пополнить счёт (crm_offer) и повтори',
        }
      paid = r.списано ?? 0 // cyrillic-ok: public API field
      await noteInJournal(ctx.pool, {
        kind: 'tokens-spent',
        who: p.charge.telegramId,
        // Negative, as every other tokens-spent line: money leaving.
        amount: -paid,
        what: `услуга в личке (${p.charge.op}) от ${String(ctx.telegramId)}: списано ${paid}`,
      })
    }
    /*
     * "TYPING" BEFORE THE ACT (owner decision: automatic), sends only.
     *
     * The recipient sees the person "typing" for a couple of seconds before
     * the message pops in, which is what a human conversation looks like and
     * what a sudden drop-in does not. Cosmetic by design, and disciplined
     * about it: no capability (`invoke`), no schedule (nobody is typing at
     * HH:MM -- the clock is), a failure in the signal never stops the send,
     * and the pause is skipped with it so an old client pays no wait.
     */
    if (exec.typing && !p.scheduleAt && c.invoke) {
      try {
        const { Api } = await import('telegram')
        await c.invoke(
          new Api.messages.SetTyping({
            peer: p.target,
            action: new Api.SendMessageTypingAction(),
          })
        )
      } catch {
        // The indicator is a courtesy; the approved act is not.
      }
      await new Promise(r => setTimeout(r, TYPING_MS))
    }
    let sent: unknown = null
    try {
      sent = await exec.run(c, p, ctx)
    } catch (e) {
      if (paid !== null && p.charge && ctx.pool) {
        // Not delivered: give back exactly what was taken, and say so
        // either way -- a refund that failed is the owner's problem now.
        const { refundByTid } = await import('./billing-shared')
        const back = await refundByTid(
          ctx.pool as never,
          p.charge.telegramId,
          p.charge.op,
          1,
          undefined,
          paid
        )
        await noteInJournal(ctx.pool, {
          kind: back.ok ? 'tokens-refunded' : 'failure',
          who: p.charge.telegramId,
          amount: paid,
          what: back.ok
            ? `услуга не доставлена, ${paid} возвращено: ${inPlainWords(e).slice(0, 80)}`
            : `ВОЗВРАТ НЕ ПРОШЁЛ ${paid} токенов: ${back.why}`,
          severity: back.ok ? 'attention' : 'alarm',
        })
        return {
          done: false,
          why:
            inPlainWords(e) +
            (back.ok
              ? `; списанные ${paid} токенов возвращены получателю`
              : `; ВОЗВРАТ ${paid} токенов НЕ ПРОШЁЛ — проверь баланс получателя`),
        }
      }
      throw e
    }
    if (exec.after) await exec.after(ctx, p, sent, paid)
    return { done: true, action: p.action }
  } catch (e) {
    return { done: false, why: inPlainWords(e) }
  } finally {
    /*
     * CLOSE THE SOCKET.
     *
     * `client()` builds a NEW TelegramClient every call and never closes it;
     * connect() starts an update loop that pings Telegram every nine seconds
     * for the life of the process. Counted on this branch: six clients built
     * across the tools, six connects, ZERO disconnects.
     *
     * The correct pattern already exists a hundred lines away in
     * render-server.ts's logout helper (`try { ... } finally { await
     * c.disconnect() }`) and simply was not applied here. This closes the one
     * this module opens; the five reading tools still leak and need the same
     * treatment -- filed separately rather than widened into this change.
     */
    await hangUp(c)
  }
}

/**
 * Telegram's wording turned into something the person can act on.
 *
 * "Could not find the input entity for {\"userId\":…,\"className\":\"PeerUser\"}"
 * under a button that says "Send" reads as a broken product. It has a precise
 * meaning -- we do not know this address -- and a precise remedy: name the
 * person by @username instead of by number.
 *
 * Anything unrecognised passes through unchanged. A friendly "something went
 * wrong" would erase the only clue anybody has, and this repository has already
 * paid an evening for exactly that on the login screen.
 */
function inPlainWords(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e)
  if (/input entity|Could not find/i.test(raw)) {
    return 'не нашёл этот чат в вашем Telegram — назовите адресата по @имени'
  }
  if (/FLOOD_WAIT_(\d+)/i.test(raw)) {
    const secs = Number(/FLOOD_WAIT_(\d+)/i.exec(raw)?.[1] ?? 0)
    return `Telegram просит подождать ${Math.ceil(secs / 60)} мин — слишком много действий подряд`
  }
  if (/PEER_ID_INVALID/i.test(raw)) return 'такого адресата не существует'
  if (/USER_IS_BLOCKED|USER_PRIVACY/i.test(raw)) {
    return 'этот человек не принимает от вас сообщения'
  }
  if (/CHAT_WRITE_FORBIDDEN/i.test(raw)) return 'в этот чат писать нельзя'
  /*
   * Codes the social actions (PR3: kick, pin, react, vote, join, delete)
   * answer with. Translated here rather than at each executor because the
   * plain-words door is shared, and a code said raw is an answer only the
   * debugger loves.
   */
  if (/CHAT_ADMIN_REQUIRED/i.test(raw)) {
    return 'для этого нужны права администратора в чате'
  }
  if (/USER_NOT_PARTICIPANT/i.test(raw)) {
    return 'этого человека нет в чате'
  }
  if (/USER_ALREADY_PARTICIPANT/i.test(raw)) {
    return 'этот человек уже в чате'
  }
  if (/INVITE_HASH_EXPIRED/i.test(raw)) return 'ссылка-приглашение устарела'
  if (/INVITE_HASH_INVALID/i.test(raw)) {
    return 'ссылка-приглашение недействительна'
  }
  if (/MESSAGE_ID_INVALID/i.test(raw)) {
    return 'сообщение не найдено — возможно, его уже удалили'
  }
  if (/POLL_VOTE_INVALID/i.test(raw)) {
    return 'в этом голосовании нет такого варианта'
  }
  if (/REACTION_INVALID/i.test(raw))
    return 'такой реакции здесь нельзя поставить'
  if (/CHAT_NOT_MODIFIED/i.test(raw)) return 'в чате ничего не изменилось'
  if (/MESSAGE_NOT_MODIFIED/i.test(raw)) {
    return 'в сообщении ничего не изменилось'
  }
  if (/USER_ID_INVALID/i.test(raw)) return 'такого пользователя не существует'
  return raw
}
