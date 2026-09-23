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
 * 1. `clientSurfaceDenial` -- tool availability by surface. Only the tools
 *    named in CLIENT_SURFACE_TOOLS are listed; every other one -- other
 *    people's chats, contact cards, the CRM archive, the account holder's own
 *    browser, the hive journal, and whatever reader lands next -- is not
 *    listed and a call is refused. The owner's own surfaces (bot, miniapp,
 *    ios, agent) keep every one of them.
 * 2. `createContactGuard` -- what the model can still invent or carry in from
 *    the open web. A phone, an e-mail or an @handle that this chat has not
 *    already seen -- written out or inside a messenger or profile link
 *    (wa.me, t.me/+, tg://resolve, instagram.com, vk.com) -- that is not the
 *    owner's or the client's own and not a bot, does not leave: the text
 *    becomes an honest line and the owner is told.
 *
 * A rule in a prompt is a request. These are the places the answer passes.
 */

import { isAssetUrl } from './asset-links'

/** Surfaces whose words go to a client in the owner's name. */
export const CLIENT_FACING_SURFACES: ReadonlySet<string> = new Set(['business'])

export function isClientFacing(surface?: string): boolean {
  return CLIENT_FACING_SURFACES.has(String(surface ?? ''))
}

/**
 * THE ONLY TOOLS A CLIENT'S CHAT IS OFFERED -- AN ALLOWLIST, NOT A DENYLIST.
 *
 * The first version of this gate closed three prefixes (tg_, browser_, crm_)
 * and left 56 registry tools open. Several of them read other people through
 * the account the turn runs as: in the duet that account is the OWNER's, and
 * when the owner keeps the hive, hive_events / hive_board / hive_pulse return
 * the farm journal (other people's ids and notes) and inngest_runs /
 * inngest_run return event payloads; soul_of reads anybody's SOUL by name. A
 * denylist also opens every future reader (mail_*, zep_*) the day it lands.
 *
 * So the business surface is shown exactly what serving THIS person needs:
 *
 * - the three CRM tools that act on the person in this conversation and read
 *   nobody else: the gift portrait, the invoice card, the follow-up note;
 * - this person's money: the token invoice, the balance, the price list;
 * - the work itself: pictures, voice, video, the reel and its status, the
 *   reel templates and the Leela plan text the duet's reels are made from;
 * - the open web, whose text the outgoing contact guard still reads.
 *
 * `club_invoice` is not here on purpose: the club is not sold to a client in
 * the DM (DM_CLIENT_BULLET in chat.ts) and the tool refuses that surface
 * itself. Adding a tool here is a decision that it reads nobody but this
 * client -- the test pins this set by name.
 */
export const CLIENT_SURFACE_TOOLS: ReadonlySet<string> = new Set([
  'crm_deliver_photo',
  'crm_offer',
  'crm_touch',
  'tokens_invoice',
  'my_balance',
  'pricing',
  'image_generate',
  'image_edit',
  'audio_generate',
  'video_generate',
  'reel_render',
  'render_status',
  'templates_list',
  'leela_plan',
  'web_search',
  'web_read',
])

/**
 * Whether a tool is closed to a client's chat: every tool that is not named
 * in CLIENT_SURFACE_TOOLS, including one added to the registry next month.
 */
export function closedToClients(name: string): boolean {
  return !CLIENT_SURFACE_TOOLS.has(name)
}

export const CLIENT_SURFACE_DENY_REASON =
  'ты пишешь клиенту от имени владельца: здесь открыты только инструменты для этого клиента (работа, счёт, баланс, веб) — чужие чаты, контакты, CRM и журналы закрыты; отвечай по этому разговору, а чужой контакт владелец даст сам'

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
    if (!closedToClients(name) || deny.has(name)) continue
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

/**
 * An address: a web link, a messenger's app link (tg://, whatsapp://,
 * viber://), or one of the messenger and profile hosts a model writes without
 * a scheme ("wa.me/...", "instagram.com/...").
 */
const LINK_RE =
  /(?:\b(?:https?|tg|whatsapp|viber):\/\/|\bwww\.|\b(?:wa\.me|api\.whatsapp\.com|(?:t|telegram)\.me|instagram\.com|vk\.com|signal\.me)\/)[^\s<>()"'`]*/gi
const TME_RE = /\b(?:t\.me|telegram\.me)\/([A-Za-z][A-Za-z0-9_]{3,31})\b/gi
const EMAIL_RE =
  /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g
const HANDLE_RE = /(^|[^A-Za-z0-9_.@/])@([A-Za-z][A-Za-z0-9_]{3,31})\b/g

/**
 * A HANDLE WRITTEN WITHOUT THE @, AFTER THE MESSENGER IT BELONGS TO.
 *
 * "Telegram: placeholder_name" is how a contact is passed on in prose, and
 * HANDLE_RE never saw it: it requires the @ (#2875). The separator is
 * REQUIRED, and is either a colon or a dash with spaces on both sides --
 * "Telegram support" and "insta-blogger" are prose, and reading either as a
 * handle would replace a whole answer over an ordinary sentence.
 *
 * `\b` is not used around the labels: in JavaScript it is ASCII-only, so
 * `\bтг\b` matches no Russian word at all. The boundaries here are Unicode
 * letter and number classes.
 */
const LABELLED_HANDLE_RE = new RegExp(
  '(?:^|[^\\p{L}\\p{N}_])' +
    '(?:telegram|telegramm|tg|instagram|insta|whatsapp|viber|skype|vk|' +
    'telega|nick|nickname|username|handle|' +
    'телеграм|телеграмм|тг|телега|инстаграм|инста|вотсап|ватсап|вайбер|вк|' +
    'ник|никнейм|юзернейм)' +
    '(?:\\s*[:：]\\s*|\\s+[-–—]\\s+)' +
    '@?([A-Za-z][A-Za-z0-9_]{3,31})(?![\\p{L}\\p{N}_])',
  'giu'
)

const PHONE_RE = /(?:\+\s?)?\d[\d\s().-]{7,}\d/g

/** A run of digits grouped in threes is an amount: "1 000 000 000". */
const AMOUNT_RE = /^\d{1,3}(?:[  ]\d{3})+$/

/**
 * How long a grouped run may be before it stops being read as an amount.
 *
 * "10 000 000 099" is ELEVEN digits grouped in threes, so the amount
 * exemption covered it and a phone number written that way left the chat
 * (#2875). Ten is the boundary: it is the shortest phone there is, and
 * everything this business counts -- stars, tokens, roubles -- fits in ten
 * digits. Longer than that, and the run is read as a number to call. The
 * price of being wrong here is one withheld answer; the price of the old
 * rule was a third person's phone number in a client's chat.
 */
const AMOUNT_MAX_DIGITS = 10

/**
 * 2026-09-22, 2026.09.22, 22.09.2026 -- a date, not a number to call, with or
 * without a time, and with the time CUT SHORT: PHONE_RE's character class has
 * no colon in it, so "2026-09-22 15:30" arrives here as "2026-09-22 15" --
 * ten digits, which used to be read as a phone, replacing the whole answer
 * and paging the owner (#2875).
 */
const DATE_RE =
  /^(?:\d{4}[-.]\d{2}[-.]\d{2}|\d{2}[-.]\d{2}[-.]\d{4})(?:[ T]\d{1,2}(?::\d{2}(?::\d{2})?)?)?$/

function phoneKey(raw: string): string | null {
  const t = raw.trim()
  const digits = t.replace(/\D/g, '')
  if (digits.length < 10 || digits.length > 15) return null
  if (!t.startsWith('+')) {
    if (AMOUNT_RE.test(t) && digits.length <= AMOUNT_MAX_DIGITS) return null
    if (DATE_RE.test(t)) return null
  }
  return digits.slice(-10)
}

/*
 * WHAT AN ADDRESS SAYS ABOUT A PERSON.
 *
 * A link is the usual way somebody's number is passed on: wa.me/<number>,
 * t.me/+<number>, tg://resolve?domain=<name>, a profile on instagram.com or
 * vk.com. The first version of the guard deleted every address before it
 * looked for phones and handles, so each of those went to the client as it
 * was. Now an address is read by its shape.
 *
 * Not read as prose, on purpose: a digit run inside an arbitrary address is
 * not a phone. Measured over 10 000 random samples, 17% of signed S3 links
 * (a 64-hex signature) and 8.6% of uuid render links carry a 10-15 digit run
 * -- a client's own reel withheld one time in six. Only the parts of an
 * address that name a person are read: the messenger hosts' paths, phone and
 * number parameters, a "+" and its digits, "/@name", an e-mail, a t.me name.
 * Our own asset addresses are not read at all.
 */
const INSTAGRAM_NOT_PEOPLE = new Set([
  'p',
  'reel',
  'reels',
  'tv',
  'explore',
  'accounts',
  'direct',
  'about',
  'legal',
  'developer',
  'web',
  'challenge',
])
const VK_NOT_PEOPLE = new Set([
  'feed',
  'im',
  'search',
  'friends',
  'groups',
  'music',
  'video',
  'audio',
  'apps',
  'settings',
  'login',
  'away',
])
const PLUS_PHONE_RE = /\+(\d{10,15})(?!\d)/g
const WA_PHONE_RE = /\bwa\.me\/\+?(\d{10,15})(?!\d)/gi
const PHONE_PARAM_RE = /[?&#](?:phone|number|tel|mobile)=\+?(\d{10,15})(?!\d)/gi
const AT_SEGMENT_RE = /\/@([A-Za-z0-9_.]{3,32})/g

function decoded(s: string): string {
  try {
    return decodeURIComponent(s)
  } catch {
    return s
  }
}

function profileHandle(seg: string | undefined, notPeople: Set<string>) {
  const h = String(seg ?? '').replace(/^@/, '')
  if (!/^[A-Za-z0-9_.]{3,32}$/.test(h)) return null
  if (notPeople.has(h.toLowerCase())) return null
  return h.toLowerCase()
}

/** The contacts one address names. Our own asset addresses name nobody. */
function contactsInLink(link: string): Contact[] {
  if (isAssetUrl(link)) return []
  const out: Contact[] = []
  const phone = (digits: string) => {
    const key = phoneKey(`+${digits}`)
    if (key) out.push({ kind: 'phone', key })
  }
  const handle = (key: string | null) => {
    if (key) out.push({ kind: 'handle', key })
  }
  const text = decoded(link)
  for (const m of text.matchAll(TME_RE)) handle(m[1].toLowerCase())
  for (const m of text.matchAll(PLUS_PHONE_RE)) phone(m[1])
  for (const m of text.matchAll(WA_PHONE_RE)) phone(m[1])
  for (const m of text.matchAll(PHONE_PARAM_RE)) phone(m[1])
  for (const m of text.matchAll(AT_SEGMENT_RE)) handle(m[1].toLowerCase())
  for (const m of text.matchAll(EMAIL_RE)) {
    out.push({ kind: 'email', key: m[0].toLowerCase() })
  }
  let u: URL
  try {
    u = new URL(
      /^[a-z][a-z0-9+.-]*:\/\//i.test(link) ? link : `https://${link}`
    )
  } catch {
    return out
  }
  const host = u.hostname.toLowerCase().replace(/^(?:www|m)\./, '')
  const segs = u.pathname.split('/').filter(Boolean).map(decoded)
  if (u.protocol === 'tg:' && host === 'resolve') {
    const domain = u.searchParams.get('domain')
    if (domain && /^[A-Za-z][A-Za-z0-9_]{3,31}$/.test(domain)) {
      handle(domain.toLowerCase())
    }
  }
  if (host === 'instagram.com') {
    handle(
      segs[0] === 'stories'
        ? profileHandle(segs[1], INSTAGRAM_NOT_PEOPLE)
        : profileHandle(segs[0], INSTAGRAM_NOT_PEOPLE)
    )
  }
  if (host === 'vk.com') handle(profileHandle(segs[0], VK_NOT_PEOPLE))
  return out
}

/**
 * Every contact in a text. An address is read by its shape (contactsInLink);
 * the prose around it is read for phones, e-mails and handles, so an asset
 * URL full of digits is not a phone and a link is not an e-mail.
 */
export function contactsIn(text: unknown): Contact[] {
  const s = String(text ?? '')
  if (!s) return []
  const out: Contact[] = []
  let rest = s.replace(LINK_RE, raw => {
    out.push(...contactsInLink(raw.replace(/[.,;:!?]+$/, '')))
    return ' '
  })
  for (const m of rest.matchAll(EMAIL_RE)) {
    out.push({ kind: 'email', key: m[0].toLowerCase() })
  }
  rest = rest.replace(EMAIL_RE, ' ')
  for (const m of rest.matchAll(HANDLE_RE)) {
    out.push({ kind: 'handle', key: m[2].toLowerCase() })
  }
  for (const m of rest.matchAll(LABELLED_HANDLE_RE)) {
    out.push({ kind: 'handle', key: m[1].toLowerCase() })
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
