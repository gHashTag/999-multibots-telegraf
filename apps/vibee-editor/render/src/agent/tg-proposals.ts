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

import { randomBytes, timingSafeEqual } from 'node:crypto'

/** A file that IS the service: made on the owner's turn, shown on the card. */
export interface ProposalMedia {
  kind: 'photo'
  url: string
}

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
  action: 'send' | 'forward' | 'delete' | 'join' | 'leave' | 'read'
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
   * Who the message is for, in words a person recognises -- "Ольга (@playom)"
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
  charge?: ProposalCharge
}

/** What may leave this module. Never the secret, except through `issueFor`. */
export type PublicProposal = Omit<PendingProposal, 'secret' | 'issued' | 'turn'>

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

/** How long an unconfirmed proposal survives. */
const LIFETIME_MS = 10 * 60 * 1000

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
  reportOrphan(redact(p), reason)
}

/** Strip what must never leave. Copies, so a caller cannot reach the original. */
function redact(p: PendingProposal): PublicProposal {
  const { secret: _secret, issued: _issued, turn: _turn, ...rest } = p
  void _secret
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
function sameSecret(a: string, b: string): boolean {
  const x = Buffer.from(String(a ?? ''), 'utf8')
  const y = Buffer.from(String(b ?? ''), 'utf8')
  // timingSafeEqual throws on a length mismatch, which would leak the length
  // by exception. Compare a fixed-size digest of each instead.
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
 * Remember a proposal so it can be confirmed later.
 *
 * The id is supplied by the caller rather than generated here so tests do not
 * have to guess it. The SECRET is not: it is minted here, in the one place
 * that owns it, so no caller can supply a weak one or reuse an old one.
 */
export function remember(
  p: Omit<PendingProposal, 'createdAt' | 'secret' | 'issued'>
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
  for (const old of pending.values()) {
    if (old.telegramId === p.telegramId) drop(old, 'replaced')
  }
  const saved: PendingProposal = {
    ...p,
    createdAt: Date.now(),
    // 128 bits. The id is only a lookup key now; this is the authorisation.
    secret: randomBytes(16).toString('hex'),
    issued: false,
  }
  pending.set(p.id, saved)
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
): (PublicProposal & { secret: string }) | null {
  dropExpired()
  const mine = String(telegramId)
  // No turn, no answer. An empty token must never match a draft that has none.
  if (!turn) return null
  for (const p of pending.values()) {
    if (p.telegramId !== mine || p.issued || p.turn !== turn) continue
    p.issued = true
    return { ...redact(p), secret: p.secret }
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
  if (!sameSecret(p.secret, secret)) {
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
  else pending.delete(id)
  return { ok: true, proposal: redact(p) }
}

/**
 * Carry out a proposal the person has confirmed.
 *
 * Separate from `claim` on purpose: claiming is the decision, executing is the
 * consequence. A failure here must not silently put the proposal back --
 * whoever pressed the button has already decided, and a resurrected draft is
 * how the same message gets sent twice.
 */
interface SendingClient {
  sendMessage: (
    to: string,
    opts: { message: string; parseMode: false }
  ) => Promise<unknown>
  /**
   * GramJS `sendFile`: `file` may be a direct URL, which Telegram fetches
   * itself (photo by URL is capped at 10 MB). Same parseMode rule as text:
   * the approved caption must be the sent caption.
   */
  sendFile?: (
    to: string,
    opts: { file: string; caption?: string; parseMode: false }
  ) => Promise<unknown>
  getDialogs: (opts: { limit: number }) => Promise<unknown>
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
 * Send, warming the address book first if the target is a bare id.
 *
 * ── WHY THIS IS NOT JUST `sendMessage` ────────────────────────────────────
 *
 * `client()` builds a BRAND NEW `TelegramClient` on every call, and a
 * `StringSession` carries only dcId, server, port and auth key -- no entities.
 * GramJS resolves the peer inside send (`getInputEntity`), and for a bare
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
 * extra round trip, taken ONLY when the first attempt fails, so a @username
 * send stays a single call.
 */
async function withAddressBook(
  c: SendingClient,
  target: string,
  attempt: () => Promise<unknown>
): Promise<void> {
  try {
    await attempt()
    return
  } catch (e) {
    const text = e instanceof Error ? e.message : String(e)
    const unresolved = /input entity|Could not find/i.test(text)
    if (!unresolved || !LOOKS_NUMERIC.test(target)) throw e
  }
  await c.getDialogs({ limit: 200 })
  await attempt()
}

async function sendWithAddressBook(
  c: SendingClient,
  target: string,
  message: string
): Promise<void> {
  await withAddressBook(c, target, () =>
    c.sendMessage(target, { message, ...VERBATIM })
  )
}

async function sendFileWithAddressBook(
  c: SendingClient,
  target: string,
  media: ProposalMedia,
  caption: string | undefined
): Promise<void> {
  if (!c.sendFile) throw new Error('этот клиент не умеет отправлять файлы')
  const send = c.sendFile
  await withAddressBook(c, target, () =>
    send(target, { file: media.url, caption: caption ?? '', ...VERBATIM })
  )
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

export async function execute(
  p: PublicProposal,
  ctx: { telegramId: string; pool?: unknown }
): Promise<{ done: true; action: string } | { done: false; why: string }> {
  const { client } = await import('./telegram-tools')
  let c: SendingClient | null = null
  try {
    c = (await client(ctx as never)) as SendingClient
    switch (p.action) {
      case 'send': {
        if (!p.what && !p.media)
          return { done: false, why: 'нечего отправлять: текст пуст' }
        /*
         * THE MONEY, AFTER THE PRESS AND BEFORE THE SEND. A charge on the
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
        try {
          if (p.media)
            await sendFileWithAddressBook(c, p.target, p.media, p.what)
          else await sendWithAddressBook(c, p.target, p.what ?? '')
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
        if (p.lead && ctx.pool) {
          try {
            const { recordTouch } = await import('./crm-touches')
            const write = recordTouch(ctx.pool as never, {
              owner: String(ctx.telegramId),
              lead: String(p.lead),
              botName: p.bot ?? null,
              // A paid, delivered service is a purchase; a message is a touch.
              kind: p.charge ? 'bought' : 'written',
              note: p.charge
                ? `услуга в личке: ${p.media?.kind ?? p.charge.op}, списано ${paid ?? 0}`
                : `отправлено из личного продавца: ${(p.what ?? '').slice(0, 80)}`,
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
        return { done: true, action: 'send' }
      }
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
    await c?.disconnect?.().catch?.(() => undefined)
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
  return raw
}
