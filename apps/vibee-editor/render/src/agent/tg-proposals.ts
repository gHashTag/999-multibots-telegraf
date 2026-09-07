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
export function idFromBody(raw: unknown): string {
  if (typeof raw !== 'string') {
    // Defensive: if readBody ever hands back a parsed object, take the id --
    // but do not assume it, which was the whole mistake.
    const o = raw as { id?: unknown } | null | undefined
    return typeof o?.id === 'string' ? o.id : ''
  }
  try {
    const parsed = JSON.parse(raw || '{}') as { id?: unknown }
    return typeof parsed?.id === 'string' ? parsed.id : ''
  } catch {
    /*
     * A malformed body is an empty id, not a thrown error. `claim` then
     * refuses in words the person can read; an exception here would surface as
     * a 500 on a button press, which says "we are broken" instead of "that
     * draft is gone".
     */
    return ''
  }
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
interface SendingClient {
  sendMessage: (
    to: string,
    opts: { message: string; parseMode: false }
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
async function sendWithAddressBook(
  c: SendingClient,
  target: string,
  message: string
): Promise<void> {
  try {
    await c.sendMessage(target, { message, ...VERBATIM })
    return
  } catch (e) {
    const text = e instanceof Error ? e.message : String(e)
    const unresolved = /input entity|Could not find/i.test(text)
    if (!unresolved || !LOOKS_NUMERIC.test(target)) throw e
  }
  /*
   * Warm and retry ONCE. A loop here would turn one bad address into a stream
   * of dialog fetches against Telegram, which is how an account gets limited.
   */
  await c.getDialogs({ limit: 200 })
  await c.sendMessage(target, { message, ...VERBATIM })
}

export async function execute(
  p: PendingProposal,
  ctx: { telegramId: string; pool?: unknown }
): Promise<{ done: true; action: string } | { done: false; why: string }> {
  const { client } = await import('./telegram-tools')
  let c: SendingClient | null = null
  try {
    c = (await client(ctx as never)) as SendingClient
    switch (p.action) {
      case 'send':
        if (!p.what)
          return { done: false, why: 'нечего отправлять: текст пуст' }
        await sendWithAddressBook(c, p.target, p.what)
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
