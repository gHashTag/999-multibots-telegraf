/**
 * WHEN THE AGENT SPEAKS TO A CLIENT AS THE OWNER, IT SEES ONLY THIS CHAT.
 *
 * Measured on 21.09.2026: a client asked the owner's business DM for a
 * currency exchanger and was answered with another person's @handle and phone
 * number. That phone had never been said in this chat. It existed only in that
 * third person's own messages -- a contact card, not a recommendation anybody
 * had chosen to pass on.
 *
 * How it got within reach is a property of the registry, not of that turn:
 *
 * - `runAgent` listed the FULL tool registry on the `business` surface.
 * - Every tg_* and crm_* tool resolves WHOSE account to open from
 *   `ctx.telegramId`. In the bot's business DM that is the client -- and a
 *   client who has connected their own Telegram is a seller, so tg_contacts,
 *   tg_search and the whole CRM archive of THEIR account answered. In the
 *   duet (crm-duet-tool.ts) the same surface runs with the OWNER's ctx, so the
 *   same tools read the owner's other chats and contact cards, and the words
 *   go to a real person from the owner's session.
 *
 * Either way the words that leave are addressed to somebody who is not the
 * account holder, which is what makes a contact card in them a disclosure.
 *
 * Two lines, on purpose:
 *
 * 1. `clientSurfaceDenial` -- tool availability by surface. The tools that
 *    read other people's chats, contact cards, the CRM archive or the account
 *    holder's own browser are not listed and a call is refused. The owner's
 *    own surfaces (bot, miniapp, ios, agent) keep every one of them.
 * 2. `createContactGuard` -- what the model can still invent or carry in from
 *    the open web. A phone, an e-mail or an @handle that this chat has not
 *    already seen, that is not the owner's or the client's own and not a bot,
 *    does not leave: the text becomes an honest line and the owner is told.
 *
 * A rule in a prompt is a request. These are the places the answer passes.
 */

/** Surfaces whose words go to a client in the owner's name. */
export const CLIENT_FACING_SURFACES: ReadonlySet<string> = new Set(['business'])

export function isClientFacing(surface?: string): boolean {
  return CLIENT_FACING_SURFACES.has(String(surface ?? ''))
}

/**
 * CRM tools that act on the person in this conversation and read nobody
 * else: the gift portrait, the invoice card, the follow-up note. Every other
 * crm_* tool reads the owner's workspace -- other leads, their words, their
 * files, their profiles -- and has no business in a client's chat.
 */
export const CLIENT_SURFACE_KEEPS: ReadonlySet<string> = new Set([
  'crm_deliver_photo',
  'crm_offer',
  'crm_touch',
])

/**
 * Whether a tool can put somebody other than this client within reach.
 *
 * By prefix, so a tg_* reader added next month is covered the day it lands:
 * tg_* open the account's other chats and contact cards; browser_* drive the
 * account holder's own browser -- his mail, his messengers; crm_* read the
 * workspace, except the three that act on this person.
 */
export function readsOtherPeople(name: string): boolean {
  if (name.startsWith('tg_')) return true
  if (name.startsWith('browser_')) return true
  if (name.startsWith('crm_')) return !CLIENT_SURFACE_KEEPS.has(name)
  return false
}

export const CLIENT_SURFACE_DENY_REASON =
  'ты пишешь клиенту от имени владельца: чужие чаты, контакты и CRM здесь закрыты — отвечай по этому разговору, а чужой контакт владелец даст сам'

/**
 * The turn's denial, widened on a client-facing surface. The caller's own
 * denials (the duet's discovery gate, its publish ban) keep their reasons.
 */
export function clientSurfaceDenial(
  surface: string | undefined,
  base: {
    denyTools?: ReadonlySet<string>
    denyReasons?: ReadonlyMap<string, string>
  } = {},
  toolNames: Iterable<string> = []
): {
  denyTools?: ReadonlySet<string>
  denyReasons?: ReadonlyMap<string, string>
} {
  if (!isClientFacing(surface)) {
    return { denyTools: base.denyTools, denyReasons: base.denyReasons }
  }
  const deny = new Set(base.denyTools ?? [])
  const reasons = new Map(base.denyReasons ?? [])
  for (const name of toolNames) {
    if (!readsOtherPeople(name) || deny.has(name)) continue
    deny.add(name)
    reasons.set(name, CLIENT_SURFACE_DENY_REASON)
  }
  return { denyTools: deny, denyReasons: reasons }
}

/* ------------------------------------------------------------------------ */
/* The outgoing guard                                                        */
/* ------------------------------------------------------------------------ */

export type ContactKind = 'phone' | 'email' | 'handle'

export interface Contact {
  kind: ContactKind
  /** Normalized: phone -> last 10 digits, handle/e-mail -> lowercase. */
  key: string
}

/** Said to the client instead of a text that carried somebody else's contact. */
export const CONTACT_WITHHELD_LINE =
  'Чужие контакты я не пересылаю — владелец ответит вам лично.'

const URL_RE = /\b(?:https?:\/\/|www\.)[^\s<>()]+/gi
const TME_RE = /\b(?:t\.me|telegram\.me)\/([A-Za-z][A-Za-z0-9_]{3,31})\b/gi
const EMAIL_RE =
  /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g
const HANDLE_RE = /(^|[^A-Za-z0-9_.@/])@([A-Za-z][A-Za-z0-9_]{3,31})\b/g
const PHONE_RE = /(?:\+\s?)?\d[\d\s().-]{7,}\d/g

/** A run of digits grouped in threes is an amount: "1 000 000 000". */
const AMOUNT_RE = /^\d{1,3}(?:[ \u00a0]\d{3})+$/
/** 2026-09-22, 2026.09.22 -- a date, not a number to call. */
const DATE_RE = /^\d{4}[-.]\d{2}[-.]\d{2}(?:[ T]\d{2}:\d{2})?$/

function phoneKey(raw: string): string | null {
  const t = raw.trim()
  const digits = t.replace(/\D/g, '')
  if (digits.length < 10 || digits.length > 15) return null
  if (!t.startsWith('+') && (AMOUNT_RE.test(t) || DATE_RE.test(t))) return null
  return digits.slice(-10)
}

/**
 * Every contact in a text. t.me/<name> counts as the handle it opens; the rest
 * of a web address is not scanned, so an asset URL full of digits is not a
 * phone and a link is not an e-mail.
 */
export function contactsIn(text: unknown): Contact[] {
  const s = String(text ?? '')
  if (!s) return []
  const out: Contact[] = []
  for (const m of s.matchAll(TME_RE)) {
    out.push({ kind: 'handle', key: m[1].toLowerCase() })
  }
  let rest = s.replace(URL_RE, ' ').replace(TME_RE, ' ')
  for (const m of rest.matchAll(EMAIL_RE)) {
    out.push({ kind: 'email', key: m[0].toLowerCase() })
  }
  rest = rest.replace(EMAIL_RE, ' ')
  for (const m of rest.matchAll(HANDLE_RE)) {
    out.push({ kind: 'handle', key: m[2].toLowerCase() })
  }
  for (const m of rest.matchAll(PHONE_RE)) {
    const key = phoneKey(m[0])
    if (key) out.push({ kind: 'phone', key })
  }
  return out
}

/** A Telegram bot's username ends in "bot"; a bot is a service, not a person. */
function isBotHandle(c: Contact): boolean {
  return c.kind === 'handle' && /bot$/i.test(c.key)
}

const keyOf = (c: Contact) => `${c.kind}:${c.key}`

export interface ContactGuard {
  /**
   * The text as it may go to the client: unchanged, or -- when it carries a
   * contact this chat has not seen -- the honest line in its place. The whole
   * text goes, not just the number: the words around a withheld number are
   * still about that person.
   */
  check(text: string): string
  /** What was withheld on this turn, by kind only. Never the values. */
  withheld(): ContactKind[]
}

export function createContactGuard(input: {
  /** Everything this chat has already said, both sides. */
  seen: unknown[]
  /** The owner's and the client's own numbers, handles, addresses. */
  own?: unknown[]
}): ContactGuard {
  const allowed = new Set<string>()
  for (const t of [...input.seen, ...(input.own ?? [])]) {
    for (const c of contactsIn(t)) allowed.add(keyOf(c))
  }
  const withheld: ContactKind[] = []
  return {
    check(text: string): string {
      const foreign = contactsIn(text).filter(
        c => !isBotHandle(c) && !allowed.has(keyOf(c))
      )
      if (!foreign.length) return text
      for (const c of foreign) withheld.push(c.kind)
      return CONTACT_WITHHELD_LINE
    },
    withheld: () => [...withheld],
  }
}

/**
 * The owner's and the client's own phone numbers, as their connected sessions
 * recorded them. A client may be told the owner's number, and his own number
 * is not a secret from him. Best effort: without the table, nobody's number is
 * "own", which only makes the guard stricter.
 */
export async function ownPhones(
  pool:
    | { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }> }
    | undefined,
  ids: string[]
): Promise<string[]> {
  const who = ids.map(String).filter(Boolean)
  if (!pool || !who.length) return []
  try {
    const r = await pool.query(
      `SELECT phone FROM tg_sessions WHERE telegram_id = ANY($1::text[]) AND phone IS NOT NULL`,
      [who]
    )
    return r.rows
      .map(row => String(row.phone ?? ''))
      .filter(Boolean)
      .map(p => (p.startsWith('+') ? p : `+${p}`))
  } catch {
    return []
  }
}
