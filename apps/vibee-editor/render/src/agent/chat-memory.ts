/**
 * THE MEMORY OF THE CORRESPONDENCE.
 *
 * Until 2026-09-08 the seller knew a person only as a row in `users` and a
 * few touches: not what they asked for, not what they were offered, not how
 * it ended. Every pitch started from zero. This module keeps the DMs
 * themselves -- ingested from the owner's Telegram through the same session
 * the tools read with -- and answers the two questions a sale needs:
 * "what is this person's story?" and "who should I write to next?".
 *
 * Postgres is the source of truth: it works on day one with no third party.
 * Zep (zep-memory.ts) mirrors the same messages into a user graph when it is
 * configured, and its context block is ADDED to the brief, never relied on.
 *
 * Every message text here is third-party text. Nothing in this module
 * interprets it; the tools frame it as foreign content before the model
 * sees it.
 */
import { LATE_WATCH_MS } from './late-picture'
import type { OwedDebt } from './crm-owed'
import {
  mediaLine,
  markerKind,
  countedKinds,
  type SentMedia,
  type SentMediaKind,
} from './tg-message-media'

export interface Pool {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }>
}

export interface StoredMessage {
  msgId: number
  at: Date
  /** true = the owner wrote it; false = the other person did. */
  out: boolean
  /** The words; for a media message, its caption (empty when there is none). */
  text: string
  /**
   * What the message carries, when it carries a file. The memory writes the
   * marker line itself (`[фото, альбом из 8] caption`), so no writer can
   * store a photo as nothing. `name` is the sender's file name, if any.
   */
  media?: SentMedia & { name?: string | null }
}

const TEXT_CAP = 4000
let tableReady = false

/** For tests: the next call creates the table again. */
export function forgetMemoryTableForTests(): void {
  tableReady = false
}

async function ensureTable(pool: Pool): Promise<void> {
  if (tableReady) return
  await pool.query(
    `CREATE TABLE IF NOT EXISTS crm_messages (
       owner_id text NOT NULL,
       lead_id  text NOT NULL,
       msg_id   bigint NOT NULL,
       at       timestamptz NOT NULL,
       "out"    boolean NOT NULL,
       text     text NOT NULL,
       PRIMARY KEY (owner_id, lead_id, msg_id)
     )`
  )
  await pool.query(
    `CREATE INDEX IF NOT EXISTS crm_messages_lead_at
       ON crm_messages (owner_id, lead_id, at DESC)`
  )
  // Who the ids are, as Telegram shows them. Without this a list of leads
  // is a list of numbers, and the owner cannot tell who is who.
  await pool.query(
    `CREATE TABLE IF NOT EXISTS crm_people (
       owner_id   text NOT NULL,
       lead_id    text NOT NULL,
       first_name text,
       last_name  text,
       username   text,
       seen_at    timestamptz NOT NULL DEFAULT now(),
       PRIMARY KEY (owner_id, lead_id)
     )`
  )
  tableReady = true
}

export interface PersonName {
  firstName: string | null
  lastName: string | null
  username: string | null
}

const cut = (v: unknown, max: number): string | null => {
  const s = String(v ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
  return s || null
}

/**
 * Who this id is: first name, last name, username, as Telegram shows them.
 * Written at ingest from the dialog's entity and REPLACED every time --
 * people rename themselves, and the list must show the current name, not
 * the one from the first sweep. Third-party text; cut to a name's length.
 */
export async function rememberPerson(
  pool: Pool,
  owner: string,
  lead: string,
  p: Partial<PersonName>
): Promise<void> {
  await ensureTable(pool)
  await pool.query(
    `INSERT INTO crm_people (owner_id, lead_id, first_name, last_name, username, seen_at)
     VALUES ($1, $2, $3, $4, $5, now())
     ON CONFLICT (owner_id, lead_id) DO UPDATE
       SET first_name = EXCLUDED.first_name,
           last_name  = EXCLUDED.last_name,
           username   = EXCLUDED.username,
           seen_at    = now()`,
    [
      owner,
      lead,
      cut(p.firstName, 64),
      cut(p.lastName, 64),
      cut(p.username, 32),
    ]
  )
}

/** Everybody the owner's ingest has named, by id. */
export async function peopleFor(
  pool: Pool,
  owner: string
): Promise<Map<string, PersonName>> {
  await ensureTable(pool)
  const r = await pool.query(
    `SELECT lead_id, first_name, last_name, username FROM crm_people
      WHERE owner_id = $1`,
    [owner]
  )
  const map = new Map<string, PersonName>()
  for (const x of r.rows as any[]) {
    map.set(String(x.lead_id), {
      firstName: x.first_name ?? null,
      lastName: x.last_name ?? null,
      username: x.username ?? null,
    })
  }
  return map
}

/** One person by id, or null when the ingest never met them. */
export async function personOf(
  pool: Pool,
  owner: string,
  lead: string
): Promise<PersonName | null> {
  await ensureTable(pool)
  const r = await pool.query(
    `SELECT first_name, last_name, username FROM crm_people
      WHERE owner_id = $1 AND lead_id = $2`,
    [owner, lead]
  )
  const x = (r.rows as any[])[0]
  if (!x) return null
  return {
    firstName: x.first_name ?? null,
    lastName: x.last_name ?? null,
    username: x.username ?? null,
  }
}

/** "First Last", or null when neither is known. */
export function fullName(p: PersonName | null | undefined): string | null {
  const s = [p?.firstName, p?.lastName].filter(Boolean).join(' ').trim()
  return s || null
}

/**
 * Store what was said. Idempotent by (owner, lead, msg_id): a second ingest
 * of the same dialog writes nothing and reports zero, so a sweep can run as
 * often as it likes. A message with neither words nor media (a service
 * action) is skipped; a media message is NEVER skipped -- see below.
 */
export async function rememberMessages(
  pool: Pool,
  owner: string,
  lead: string,
  msgs: StoredMessage[]
): Promise<number> {
  return (await rememberMessagesFresh(pool, owner, lead, msgs)).length
}

/**
 * The same write, returning the messages that were actually NEW -- so a
 * mirror (Zep) gets exactly those and never the whole dialog again. The
 * first version handed the mirror everything it had read, and every sweep
 * re-posted every message.
 */
export async function rememberMessagesFresh(
  pool: Pool,
  owner: string,
  lead: string,
  msgs: StoredMessage[]
): Promise<StoredMessage[]> {
  /*
   * A PHOTO WITHOUT A CAPTION IS NOT AN EMPTY MESSAGE.
   *
   * This filter used to be the whole rule -- empty text, skipped -- and the
   * comment above it said so in as many words: "media without a caption are
   * skipped". The CRM ingest worked around it by writing its own label before
   * calling here, which left every other writer one forgotten label away
   * from a hole exactly where a client sent her photos. Owner, 2026-09-22:
   * she sent photos for her content plan and the agent never knew.
   *
   * So the memory composes the line itself from `media`: the marker, then
   * the caption. What is returned is the COMPOSED message, because Zep and
   * the reply detector read `text` from it.
   */
  const rows = msgs
    .map(m =>
      m.media
        ? { ...m, text: mediaLine(m.media, m.media.name ?? null, m.text) }
        : m
    )
    .filter(m => m.text && m.text.trim() && Number.isFinite(m.msgId))
  if (!rows.length) return []
  /*
   * A PERSON THE OWNER DROPPED DOES NOT COME BACK WITH THE NEXT INGEST.
   *
   * The drop deletes the cache, and every list is derived from that cache --
   * but the ingest reads Telegram, not the cache, so without this line the
   * next sweep would write the same person back in and "удалить из CRM"
   * would last until the following hour. Checked HERE rather than in the
   * ingest: this is the only way a message enters the CRM, so nobody has to
   * remember it (crm-drop-tool.ts).
   */
  const { isDropped } = await import('./crm-drop-tool')
  if (await isDropped(pool as never, owner, lead)) return []
  await ensureTable(pool)
  const values: string[] = []
  const params: unknown[] = []
  rows.forEach((m, i) => {
    params.push(owner, lead, m.msgId, m.at, m.out, m.text.slice(0, TEXT_CAP))
    const b = i * 6
    values.push(`($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6})`)
  })
  const r = await pool.query(
    `INSERT INTO crm_messages (owner_id, lead_id, msg_id, at, "out", text)
     VALUES ${values.join(',')}
     ON CONFLICT (owner_id, lead_id, msg_id) DO NOTHING
     RETURNING msg_id`,
    params
  )
  const fresh = new Set(r.rows.map((x: any) => Number(x.msg_id)))
  return rows.filter(m => fresh.has(m.msgId))
}

/**
 * What a person's words say about buying. Keyword groups, each counted
 * once, in the two languages the correspondence is in. Deliberately dumb:
 * a model reads the brief afterwards; this only decides WHO gets read first.
 */
// `\\b` is ASCII-only in JS and never matches before a Cyrillic letter, so
// the boundaries are spelled out with \\p{L}. A plain entry is a whole word
// (no letter on either side); an entry ending in `*` is a prefix. The first
// version had prefixes only, and the commonest Russian conjunction
// ("because") scored as an objection through the stem for "later".
const esc = (w: string) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const stems = (words: string[]) =>
  new RegExp(
    '(?<!\\p{L})(' +
      words
        .map(w =>
          w.endsWith('*') ? esc(w.slice(0, -1)) : esc(w) + '(?!\\p{L})'
        )
        .join('|') +
      ')',
    'iu'
  )
const SIGNALS: Array<{ name: string; score: number; re: RegExp }> = [
  {
    name: 'price',
    score: 3,
    re: stems([
      'цена',
      'цены',
      'цену',
      'ценой',
      'ценник',
      'сколько стоит',
      'стоимост*',
      'прайс*',
      'тариф*',
      'price',
      'cost',
      'how much',
    ]),
  },
  {
    name: 'buy',
    score: 3,
    re: stems([
      'купить',
      'куплю',
      'покупк*',
      'оплат*',
      'оплач*',
      'заказ*',
      'хочу',
      'нужн*',
      'давай',
      'buy',
      'order',
      'pay',
      'want',
    ]),
  },
  {
    name: 'service',
    score: 2,
    re: stems([
      'видео',
      'фото',
      'рилс*',
      'reels',
      'аватар*',
      'липсинк*',
      'lipsync',
      'озвуч*',
      'монтаж*',
      'нейро*',
      'картинк*',
      'обложк*',
      'voice',
      'video',
      'photo',
      'avatar',
      'cover',
    ]),
  },
  {
    name: 'urgency',
    score: 1,
    re: stems([
      'срочно',
      'сегодня',
      'завтра',
      'когда',
      'дедлайн',
      'asap',
      'today',
      'tomorrow',
    ]),
  },
  {
    name: 'objection',
    score: -2,
    re: stems([
      'дорого',
      'подумаю',
      'потом',
      'не надо',
      'не интересно',
      'not now',
      'too expensive',
      'later',
    ]),
  },
]

export function intentSignals(texts: string[]): {
  score: number
  signals: string[]
} {
  const joined = texts.join('\n')
  let score = 0
  const signals: string[] = []
  for (const s of SIGNALS) {
    if (s.re.test(joined)) {
      score += s.score
      signals.push(s.name)
    }
  }
  return { score, signals }
}

export interface LeadContext {
  messages: StoredMessage[]
  total: number
  inbound: number
  lastInboundAt: Date | null
  lastOutboundAt: Date | null
  /** Their last word stands unanswered. */
  unanswered: boolean
  signals: string[]
  intentScore: number
}

/** The story so far, newest last. */
export async function leadContext(
  pool: Pool,
  owner: string,
  lead: string,
  limit = 40
): Promise<LeadContext> {
  await ensureTable(pool)
  const r = await pool.query(
    `SELECT msg_id, at, "out", text FROM crm_messages
      WHERE owner_id = $1 AND lead_id = $2
      ORDER BY at DESC LIMIT $3`,
    [owner, lead, limit]
  )
  const messages: StoredMessage[] = r.rows
    .map((x: any) => ({
      msgId: Number(x.msg_id),
      at: new Date(x.at),
      out: Boolean(x.out),
      text: String(x.text ?? ''),
    }))
    .reverse()
  const a = await pool.query(
    `SELECT count(*)::int AS total,
            count(*) FILTER (WHERE NOT "out")::int AS inbound,
            max(at) FILTER (WHERE NOT "out") AS last_in,
            max(at) FILTER (WHERE "out") AS last_out
       FROM crm_messages WHERE owner_id = $1 AND lead_id = $2`,
    [owner, lead]
  )
  const row = a.rows[0] ?? {}
  const lastInboundAt = row.last_in ? new Date(row.last_in) : null
  const lastOutboundAt = row.last_out ? new Date(row.last_out) : null
  const unanswered =
    lastInboundAt !== null &&
    (lastOutboundAt === null || lastInboundAt > lastOutboundAt)
  const { score, signals } = intentSignals(
    messages.filter(m => !m.out).map(m => m.text)
  )
  return {
    messages,
    total: Number(row.total ?? 0),
    inbound: Number(row.inbound ?? 0),
    lastInboundAt,
    lastOutboundAt,
    unanswered,
    signals,
    intentScore: score,
  }
}

/**
 * WHAT THEY SENT AS FILES, AS THE OWNER WOULD SAY IT: "eight photos at 06:50".
 *
 * The rows are already in the dialog -- one `[фото, альбом из 8]` line per
 * message -- and a model shown fifteen of those lines in a row reads them as
 * noise, or skims past them to the last words. This counts them into bursts:
 * their files one after another, broken by our own word or by half an hour
 * of quiet, each with its time, its count and the message ids a look needs.
 *
 * `after_our_last_word` is the question the seller must ask before replying:
 * did they send something we have not answered? That is exactly the burst the
 * brief tells it to open (tg_fetch_media) first.
 *
 * Their files only. What the owner sent is the owner's own knowledge.
 */
export interface FileBurst {
  /** When the first file of the burst came, ISO. */
  at: string
  /** When the last one came, ISO. */
  until: string
  count: number
  /** "фото ×8", "фото ×7, видео ×1". */
  what: string
  msg_ids: number[]
  after_our_last_word: boolean
}

const BURST_GAP_MS = 30 * 60_000

export function fileBursts(
  messages: StoredMessage[],
  lastOutboundAt: Date | null
): FileBurst[] {
  type Open = { first: Date; last: Date; kinds: SentMediaKind[]; ids: number[] }
  const out: Open[] = []
  let open: Open | null = null
  const sorted = [...messages].sort((a, b) => a.at.getTime() - b.at.getTime())
  for (const m of sorted) {
    if (m.out) {
      // Our own word ends whatever they were sending before it.
      open = null
      continue
    }
    const kind = markerKind(m.text)
    if (!kind) continue
    if (open && m.at.getTime() - open.last.getTime() <= BURST_GAP_MS) {
      open.last = m.at
      open.kinds.push(kind)
      open.ids.push(m.msgId)
      continue
    }
    open = { first: m.at, last: m.at, kinds: [kind], ids: [m.msgId] }
    out.push(open)
  }
  return out.map(b => ({
    at: b.first.toISOString(),
    until: b.last.toISOString(),
    count: b.ids.length,
    what: countedKinds(b.kinds),
    msg_ids: b.ids,
    after_our_last_word:
      lastOutboundAt === null || b.first.getTime() > lastOutboundAt.getTime(),
  }))
}

import { segmentOf, type Segment } from './crm-segments'

export type NextStep = 'reply' | 'deliver' | 'offer' | 'talk' | 'wait'

export interface LeadCandidate {
  lead: string
  /** As Telegram shows them; null until an ingest has met them. */
  name: string | null
  username: string | null
  /** Their last message to the owner, raw third-party text. */
  lastWords: string | null
  score: number
  signals: string[]
  total: number
  inbound: number
  lastInboundAt: Date | null
  /** Our last word to them; null when we never wrote. */
  lastOutboundAt: Date | null
  /**
   * How many messages we sent since their last word -- the reminders a
   * follow-up has already cost them. 0 when they spoke last.
   */
  outSinceIn: number
  daysSinceInbound: number | null
  /** Days since our last word to them; null when we never wrote. */
  daysSinceOut: number | null
  unanswered: boolean
  lastTouch: { kind: string; at: string } | null
  next: NextStep
  /** The one segment this person is in; see crm-segments.ts. */
  segment: Segment
  because: string
}

/**
 * WHO NEXT. Everybody the owner has ever corresponded with, scored by what
 * a salesperson would look at first: an unanswered last word, recency, what
 * the words say, and what already happened (a refusal in the last 30 days
 * is a no; a purchase is an invitation to sell again).
 *
 * The rule is written down so the owner can argue with it, not tuned by a
 * model that cannot say why.
 */
/**
 * ONE PERSON'S LAST WORD, FOR THE CARD.
 *
 * The bulk query above computes this for every lead at once and its comment
 * has always said what the line is for: "the line the owner reads to remember
 * who this is before deciding anything". He never saw it -- the card showed
 * who and what we propose to send, and nothing of what they said.
 *
 * A separate one-row read rather than a slice of the bulk one: a card is made
 * for a single person at a time, and making the card wait on a ninety-day
 * scan of everybody would be a strange price for one quote.
 */
export async function lastWordsOf(
  pool: Pool,
  owner: string,
  lead: string
): Promise<string | null> {
  try {
    const r = await pool.query(
      `SELECT text FROM crm_messages
        WHERE owner_id = $1 AND lead_id = $2 AND NOT "out"
        ORDER BY at DESC LIMIT 1`,
      [String(owner), String(lead)]
    )
    const text = (r.rows?.[0] as { text?: unknown } | undefined)?.text
    const one = String(text ?? '')
      .replace(/\s+/g, ' ')
      .trim()
    return one || null
  } catch {
    // A card without the quote is still a card. A card that never appears
    // because a quote could not be read is a lost turn.
    return null
  }
}

/** How long an unpaid invoice is asked about before selling starts over. */
export const UNPAID_INVOICE_DAYS = 14

/**
 * The newest unpaid, uncancelled invoice per person since `since`. Never
 * throws: no table (nobody was ever invoiced) or an older table without the
 * cancel column is an empty answer, and the plan is what it was before.
 */
export async function unpaidInvoicesSince(
  pool: Pool,
  since: Date
): Promise<Map<string, Date>> {
  const read = async (cancelled: boolean) =>
    (
      await pool.query(
        `SELECT telegram_id, max(created_at) AS at FROM token_invoices
          WHERE NOT redeemed AND created_at > $1${cancelled ? ' AND cancelled_at IS NULL' : ''}
          GROUP BY telegram_id`,
        [since]
      )
    ).rows ?? []
  let rows: any[] = []
  try {
    rows = await read(true)
  } catch {
    rows = await read(false).catch(() => [])
  }
  const out = new Map<string, Date>()
  for (const r of rows) {
    const at = new Date(r.at)
    if (!Number.isNaN(at.getTime())) out.set(String(r.telegram_id), at)
  }
  return out
}

export async function leadCandidates(
  pool: Pool,
  owner: string,
  opts: {
    limit?: number
    touched?: Map<string, { kind: string; at: string }>
    now?: Date
    /** Who has ever paid; decides winback and keeps clients out of warming. */
    paid?: Set<string>
    /** Keep only this segment -- applied to the WHOLE base, before the limit. */
    segment?: Segment
    /**
     * The image provider's recent verdict, when there is one. A plan must not
     * name a step the platform cannot take today.
     */
    imagesDown?: { why: string; minutesAgo: number } | null
    /**
     * What we promised these people and did not give (crm-owed.ts). Read
     * here because no other signal in this function can see it: our own
     * apology is an outbound message, so a debt looks exactly like a
     * finished conversation.
     */
    owed?: Map<string, OwedDebt>
  } = {}
): Promise<LeadCandidate[]> {
  await ensureTable(pool)
  const now = opts.now ?? new Date()
  /*
   * Dropped people are not candidates -- belt as well as braces. The purge
   * already removed their rows, so this catches only what slipped in while
   * the mark could not be read (isDropped fails open on the write path).
   * Unreadable here means "hide nobody", and the sweep's own refusal stands
   * behind it.
   */
  const dropped = await import('./crm-drop-tool')
    .then(m => m.droppedOf(pool as never, owner))
    .catch(() => null)
  const agg = await pool.query(
    `SELECT lead_id,
            count(*)::int AS total,
            count(*) FILTER (WHERE NOT "out")::int AS inbound,
            max(at) FILTER (WHERE NOT "out") AS last_in,
            max(at) FILTER (WHERE "out") AS last_out
       FROM crm_messages WHERE owner_id = $1
      GROUP BY lead_id`,
    [owner]
  )
  /*
   * OUR MESSAGES SINCE THEIR LAST WORD, per person: the count a follow-up
   * cascade needs ("two reminders, then stop") and that no touch records
   * when the owner writes from Telegram itself. Unreadable is zero -- the
   * cascade then allows one reminder, never an endless one (waitingOn caps
   * on the date as well).
   */
  const since = new Map<string, number>()
  try {
    const r = await pool.query(
      `WITH li AS (
         SELECT lead_id, max(at) AS last_in FROM crm_messages
          WHERE owner_id = $1 AND NOT "out" GROUP BY lead_id
       )
       SELECT m.lead_id, count(*)::int AS n
         FROM crm_messages m JOIN li ON li.lead_id = m.lead_id
        WHERE m.owner_id = $1 AND m."out" AND m.at > li.last_in
        GROUP BY m.lead_id`,
      [owner]
    )
    for (const x of r.rows ?? []) since.set(String(x.lead_id), Number(x.n) || 0)
  } catch {
    // Older table shapes: the count stays unknown (zero).
  }
  const recent = await pool.query(
    `SELECT lead_id, text FROM crm_messages
      WHERE owner_id = $1 AND NOT "out" AND at > $2
      ORDER BY at DESC`,
    [owner, new Date(now.getTime() - 90 * 86400_000)]
  )
  const people = await peopleFor(pool, owner)
  // Their last word, whenever it was: the line the owner reads to remember
  // who this is before deciding anything.
  const last = await pool.query(
    `SELECT DISTINCT ON (lead_id) lead_id, text FROM crm_messages
      WHERE owner_id = $1 AND NOT "out"
      ORDER BY lead_id, at DESC`,
    [owner]
  )
  const pendingInvoices = await unpaidInvoicesSince(
    pool,
    new Date(now.getTime() - UNPAID_INVOICE_DAYS * 86400_000)
  )
  const words = new Map<string, string>()
  for (const r of last.rows as any[]) {
    words.set(String(r.lead_id), String(r.text ?? ''))
  }
  const texts = new Map<string, string[]>()
  for (const r of recent.rows) {
    const list = texts.get(String(r.lead_id)) ?? []
    if (list.length < 30) list.push(String(r.text ?? ''))
    texts.set(String(r.lead_id), list)
  }
  const out: LeadCandidate[] = []
  for (const r of agg.rows) {
    const lead = String(r.lead_id)
    const lastIn = r.last_in ? new Date(r.last_in) : null
    const lastOut = r.last_out ? new Date(r.last_out) : null
    const unanswered = lastIn !== null && (lastOut === null || lastIn > lastOut)
    const days =
      lastIn === null
        ? null
        : Math.floor((now.getTime() - lastIn.getTime()) / 86400_000)
    const { score: intent, signals } = intentSignals(texts.get(lead) ?? [])
    const touch = opts.touched?.get(lead) ?? null
    let score = 0
    const why: string[] = []
    if (unanswered) {
      score += 4
      why.push('ждёт ответа')
    }
    if (days !== null && days <= 7) {
      score += 3
      why.push('писал на этой неделе')
    } else if (days !== null && days <= 30) {
      score += 1
      why.push('писал в этом месяце')
    }
    if (intent) {
      score += intent
      why.push(`слова: ${signals.join(', ')}`)
    }
    if (Number(r.inbound) >= 5) {
      score += 1
      why.push('живая переписка')
    }
    if (touch) {
      const touchDays = Math.floor(
        (now.getTime() - new Date(touch.at).getTime()) / 86400_000
      )
      if (touch.kind === 'refused' && touchDays <= 30) {
        // A "no" in the last month outweighs every other signal: the
        // playbook says thirty days of silence, and the score must agree.
        score -= 10
        why.push(`отказался ${touchDays} дн. назад`)
      } else if (touch.kind === 'later' && touchDays <= 7) {
        score -= 2
        why.push('просил позже')
      } else if (touch.kind === 'bought') {
        score += 2
        why.push('уже покупал — допродажа')
      } else if (touch.kind === 'written' && touchDays <= 2 && !unanswered) {
        score -= 1
        why.push('только что писали, дать подумать')
      }
    }
    /*
     * THE CLIENT MUST WANT TO BUY BY THEMSELVES.
     *
     * An offer -- an invoice -- is proposed only to somebody whose own words
     * asked for a price or said they want to buy. Everybody else who wrote
     * recently gets `talk`: a continuation of the conversation from its
     * context, no price, no link. The score used to turn into an offer on
     * its own (score >= 4), which pushed invoices on people who had merely
     * been active; the owner said no to that.
     *
     * `talk` waits two days after the owner's last word: following up the
     * next morning is nagging, and the playbook's cascade says two days.
     */
    const daysSinceOut =
      lastOut === null
        ? null
        : Math.floor((now.getTime() - lastOut.getTime()) / 86400_000)
    let next: NextStep = 'wait'
    if (unanswered) next = 'reply'
    else if (
      signals.includes('service') &&
      (signals.includes('price') || signals.includes('buy'))
    )
      next = 'deliver'
    else if (signals.includes('price') || signals.includes('buy'))
      next = 'offer'
    else if (
      days !== null &&
      days <= 14 &&
      (daysSinceOut === null || daysSinceOut >= 2) &&
      touch?.kind !== 'refused' &&
      touch?.kind !== 'later'
    )
      next = 'talk'
    // A refusal parks the pitch, never the reply: their last word is answered.
    if (touch?.kind === 'refused' && score < 0 && !unanswered) next = 'wait'
    /*
     * AN OFFER THAT WENT OUT COOLS DOWN (CRM audit 2026-09-12, P1 #6).
     *
     * The word "price" stays in the person's history after the invoice was
     * sent, so `offer`/`deliver` came back every two hours until they
     * replied, and the model was the only barrier. A `written` touch fresher
     * than three days, with nothing unanswered, means: wait for their word.
     * `reply` is never parked -- their new message is always answered.
     */
    if (
      (next === 'offer' || next === 'deliver') &&
      !unanswered &&
      touch?.kind === 'written' &&
      now.getTime() - new Date(touch.at).getTime() < 3 * 86400_000
    )
      next = 'wait'
    /*
     * AN INVOICE THAT WENT OUT AND WAS NOT PAID IS ASKED ABOUT, NOT REISSUED
     * (CRM audit 2026-09-27, #2).
     *
     * After the three-day cool-down above, the word "price" in their history
     * made this `offer` again, and the seller drafted a NEW invoice on top of
     * the unpaid one -- a second bill to somebody who has not answered the
     * first. What a salesperson does instead is ask whether it worked. So a
     * sent, unpaid invoice from the last fortnight turns the step into
     * `talk` (no price, no link) with the reason spelled out.
     *
     * "Sent" is the owner's press: an invoice is minted when a card is
     * DRAFTED, and only a confirmed send writes the `written` touch. An
     * invoice with no press after it was never seen by the client and does
     * not count.
     */
    const pending = pendingInvoices.get(lead)
    if (
      pending &&
      (next === 'offer' || next === 'deliver') &&
      !unanswered &&
      touch?.kind === 'written' &&
      new Date(touch.at).getTime() >= pending.getTime() - 5 * 60_000
    ) {
      const ago = Math.floor((now.getTime() - pending.getTime()) / 86400_000)
      next = 'talk'
      why.push(
        `счёт от ${ago} дн. назад не оплачен — спросить, получилось ли оплатить; новый счёт не выставлять`
      )
    }
    /*
     * A DELIVERY NEEDS SOMETHING TO DELIVER WITH.
     *
     * The owner already ruled on this shape once, on 2026-09-15, for the
     * other half of it: a portrait was being proposed to people who have no
     * picture in Telegram, and refusing at the tool was too late, because by
     * then the plan had promised it. The promise is not made instead.
     *
     * The same hole is open one step further out. Measured in production on
     * 2026-09-16: FAL answers 403, its balance spent; of the five candidates
     * the sweep actually looks at, FOUR carried next='deliver'. The brief
     * takes the first one that is not `wait`, so the seller spent its turns
     * preparing a picture nothing could draw -- which is the shape of 64
     * cards prepared against 5 sent.
     *
     * They asked for a price, so they still get an `offer`: that part of
     * their own words is still true and still answerable with text. Only the
     * picture is withdrawn, and the reason travels with it so the owner sees
     * a plan that changed for a reason rather than a plan that changed.
     */
    if (next === 'deliver' && opts.imagesDown) {
      next = 'offer'
      why.push(
        `картинки не выходят ${opts.imagesDown.minutesAgo} мин.: ` +
          opts.imagesDown.why
      )
    }
    /*
     * A DEBT OUTRANKS WHOSE TURN IT IS.
     *
     * Everything above this line answers "did they speak last?". For somebody
     * we owe something that is the wrong question: we spoke last precisely
     * BECAUSE we were apologising, so the rules above park them -- `wait`
     * until two days of silence make them small talk. Production, 2026-09-21:
     * that is fourteen hours of nothing for a picture asked for at 17:14.
     *
     * So an open debt puts them back: the reply is owed, not optional, and
     * the score has to clear whatever a `written` touch subtracted. When the
     * pictures are back this is a `deliver` -- go and give it -- and while
     * they are still down it is a `reply`, because a person waiting a day is
     * owed a word even if the thing itself has to wait.
     */
    const debt = opts.owed?.get(lead) ?? null
    if (debt) {
      const hours = Math.floor((now.getTime() - debt.at.getTime()) / 3600_000)
      score += 6
      /*
       * A PORTRAIT THAT ALREADY EXISTS, OR IS STILL BEING DRAWN, IS NOT A
       * PICTURE TO MAKE (late-picture.ts). A finished one is handed over even
       * while the provider looks down -- nothing needs drawing -- and one
       * still inside its watch is left alone: chasing it would spend a turn
       * to learn "not yet". Past the watch, `deliver` asks the stored task.
       */
      const drawing =
        !debt.readyUrl &&
        !!debt.taskId &&
        !!debt.taskAt &&
        now.getTime() - debt.taskAt.getTime() < LATE_WATCH_MS
      if (debt.readyUrl) {
        why.push(
          `мы должны: ${debt.what} — портрет готов, отдать его (crm_deliver_photo), заново не рисовать`
        )
        next = 'deliver'
      } else if (drawing) {
        why.push(`мы должны: ${debt.what} — портрет рисуется, придёт сам`)
        next = 'wait'
      } else {
        why.push(
          `мы должны: ${debt.what}, ${hours} ч. назад не получилось (${debt.why})`
        )
        next = opts.imagesDown ? 'reply' : 'deliver'
      }
    }
    const segment = segmentOf({
      unanswered,
      next,
      signals,
      daysSinceInbound: days,
      daysSinceOut,
      lastTouch: touch,
      paid: opts.paid?.has(lead) ?? false,
      now: now.getTime(),
    })
    out.push({
      lead,
      name: fullName(people.get(lead)),
      username: people.get(lead)?.username ?? null,
      lastWords: words.get(lead) || null,
      score,
      signals,
      total: Number(r.total),
      inbound: Number(r.inbound),
      lastInboundAt: lastIn,
      lastOutboundAt: lastOut,
      outSinceIn: since.get(lead) ?? 0,
      daysSinceInbound: days,
      daysSinceOut,
      unanswered,
      lastTouch: touch,
      next,
      segment,
      because: why.join('; ') || 'давно тихо',
    })
  }
  out.sort(
    (a, b) =>
      b.score - a.score ||
      (b.lastInboundAt?.getTime() ?? 0) - (a.lastInboundAt?.getTime() ?? 0)
  )
  // A segment is chosen over the whole base: a quiet warm person must be
  // reachable past the hundreds of unanswered who fill the top of the list.
  const chosen = (
    opts.segment ? out.filter(c => c.segment === opts.segment) : out
  ).filter(c => !dropped?.has(c.lead))
  return chosen.slice(0, opts.limit ?? 20)
}
