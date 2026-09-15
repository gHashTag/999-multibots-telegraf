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
export interface Pool {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }>
}

export interface StoredMessage {
  msgId: number
  at: Date
  /** true = the owner wrote it; false = the other person did. */
  out: boolean
  text: string
}

const TEXT_CAP = 4000
// owner-scope: per process: the DDL runs once
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
  /*
   * Whether Telegram shows this person a photo -- NULL until an ingest has
   * looked. It is a hint, not an authority: the ingest sees them through the
   * owner's own account, and a privacy setting can hide from our bot a
   * picture the owner can see. So this only keeps a portrait out of the
   * QUEUE; crm_deliver_photo still asks the Bot API before it spends.
   */
  await pool.query(
    `ALTER TABLE crm_people ADD COLUMN IF NOT EXISTS has_photo boolean`
  )
  tableReady = true
}

export interface PersonName {
  firstName: string | null
  lastName: string | null
  username: string | null
  /** Has a profile photo; null when nobody has looked yet. */
  hasPhoto?: boolean | null
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
    `INSERT INTO crm_people (owner_id, lead_id, first_name, last_name, username, has_photo, seen_at)
     VALUES ($1, $2, $3, $4, $5, $6, now())
     ON CONFLICT (owner_id, lead_id) DO UPDATE
       SET first_name = EXCLUDED.first_name,
           last_name  = EXCLUDED.last_name,
           username   = EXCLUDED.username,
           -- Names are REPLACED, this one is not: a caller with nothing to
           -- say about the photo must not erase what an earlier look found.
           has_photo  = COALESCE(EXCLUDED.has_photo, crm_people.has_photo),
           seen_at    = now()`,
    [
      owner,
      lead,
      cut(p.firstName, 64),
      cut(p.lastName, 64),
      cut(p.username, 32),
      typeof p.hasPhoto === 'boolean' ? p.hasPhoto : null,
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
    `SELECT lead_id, first_name, last_name, username, has_photo FROM crm_people
      WHERE owner_id = $1`,
    [owner]
  )
  const map = new Map<string, PersonName>()
  for (const x of r.rows as any[]) {
    map.set(String(x.lead_id), {
      firstName: x.first_name ?? null,
      lastName: x.last_name ?? null,
      username: x.username ?? null,
      hasPhoto: typeof x.has_photo === 'boolean' ? x.has_photo : null,
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
    `SELECT first_name, last_name, username, has_photo FROM crm_people
      WHERE owner_id = $1 AND lead_id = $2`,
    [owner, lead]
  )
  const x = (r.rows as any[])[0]
  if (!x) return null
  return {
    firstName: x.first_name ?? null,
    lastName: x.last_name ?? null,
    username: x.username ?? null,
    hasPhoto: typeof x.has_photo === 'boolean' ? x.has_photo : null,
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
 * often as it likes. Empty texts (media without a caption) are skipped.
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
  const rows = msgs.filter(
    m => m.text && m.text.trim() && Number.isFinite(m.msgId)
  )
  if (!rows.length) return []
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
/**
 * A NEGATION IN THE SAME CLAUSE TURNS A WORD INTO ITS OPPOSITE.
 *
 * The buy group matches stems for want / need / pay. Nothing looked at what
 * stood before them, so the Russian for "thanks, I do not need it" scored +3
 * as an intent to buy, and "no, no video needed" came out as buy+service,
 * which is the combination that sets next='deliver'. A person who refused
 * went to the top of the hot queue with "send them an invoice" beside their
 * name -- and the brief tells the model they asked for a price themselves, so
 * the rule about never offering payment first does not save them.
 *
 * Checked per OCCURRENCE, not per message: "I do not want to wait, let me
 * pay" still counts, because the second stem carries no negation.
 *
 * THE WINDOW IS THE CLAUSE, NOT A COUNT OF CHARACTERS. The first version
 * looked back a fixed 24 characters and allowed at most one word in between.
 * That is wrong in BOTH directions at once, and both were reproduced against
 * the shipped regex:
 *
 *   "no, I want to buy it now"      -> the bare "no" reached across the comma
 *                                      into the next clause and killed a real
 *                                      intent
 *   "no need, and I will not pay"   -> the denial stands AFTER the stem, where
 *                                      nothing looked, so it scored as buy
 *   "I don't want to pay"           -> two words between the denial and the
 *                                      stem, one more than the window allowed
 *
 * So the lookbehind now runs to the nearest clause break -- , . ! ? ; : an em
 * dash, or a newline, which is also the join between two messages -- and the
 * WHOLE clause is searched rather than one word of it. A denial in the
 * previous clause no longer reaches a stem it never referred to; a denial
 * anywhere in this one does.
 *
 * Russian also puts the denial after the verb ("I will not pay" is literally
 * "to pay I will not"), so the clause is read forwards as well -- but only for
 * "not" plus an auxiliary from a short list. Accepting any "not" at all would
 * kill "paying is not a problem", which is an intent to buy.
 */
// Built from strings: the Cyrillic guard cannot see inside a regex literal
// and blocks the commit, exactly as it does for the stem lists above.
const NEGATIONS = ['не', 'нет', 'ни', 'not', "don'?t", 'no']
const NEGATION_IN_CLAUSE = new RegExp(
  '(?:^|[^\\p{L}])(?:' + NEGATIONS.join('|') + ')(?!\\p{L})',
  'iu'
)
/** Auxiliaries a denial can stand in front of AFTER the verb it denies. */
const DENIED_AFTER = [
  'буду',
  'будем',
  'будет',
  'стану',
  'станем',
  'станет',
  'хочу',
  'хотим',
  'хочет',
  'планирую',
  'планируем',
  'собираюсь',
  'собираемся',
  'готов',
  'готова',
  'готовы',
  'намерен',
  'намерена',
  'нужно',
  'нужен',
  'нужна',
]
const NEGATION_AFTER = new RegExp(
  '(?:^|[^\\p{L}])(?:не[^\\p{L}]+(?:' +
    DENIED_AFTER.join('|') +
    ")|won'?t|will not|not going to)(?!\\p{L})",
  'iu'
)
/** Punctuation a negation does not reach across. A comma is one. */
const CLAUSE_CHARS = '.!?;:,\\n\\u2014\\u2013'
const HEAD_CLAUSE = new RegExp('[^' + CLAUSE_CHARS + ']*$', 'u')
const TAIL_CLAUSE = new RegExp('^[^' + CLAUSE_CHARS + ']*', 'u')

/** Is this match denied by the clause it stands in? */
function negatedAt(text: string, index: number): boolean {
  const before = text.slice(0, index).match(HEAD_CLAUSE)?.[0] ?? ''
  if (NEGATION_IN_CLAUSE.test(before)) return true
  const after = text.slice(index).match(TAIL_CLAUSE)?.[0] ?? ''
  return NEGATION_AFTER.test(after)
}

/**
 * Does the group fire on at least one occurrence that is NOT negated?
 *
 * `re` has no global flag (it is shared and `lastIndex` would leak between
 * calls), so a global copy is made per check.
 */
function firesUnnegated(re: RegExp, text: string): boolean {
  const all = new RegExp(
    re.source,
    re.flags.includes('g') ? re.flags : re.flags + 'g'
  )
  for (const m of text.matchAll(all)) {
    if (typeof m.index === 'number' && !negatedAt(text, m.index)) return true
  }
  return false
}

const SIGNALS: Array<{
  name: string
  score: number
  re: RegExp
  /** A negation in front of it cancels this occurrence. Only intent groups. */
  denied?: boolean
}> = [
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
    // The only group where a negation in front flips the meaning: asking a
    // price is still asking even when the question is phrased with a "not",
    // and an objection is already a negation by construction.
    denied: true,
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
      'не нужно',
      'не нужен',
      'не хочу',
      'не буду',
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
    const fires = s.denied ? firesUnnegated(s.re, joined) : s.re.test(joined)
    if (fires) {
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

import { segmentOf, type Segment } from './crm-segments'
import { REFUSAL_HOLDS_DAYS } from './crm-stages'

/**
 * Does their ask need THEIR OWN face?
 *
 * The `service` signal is deliberately wide -- video, reels, voice, montage --
 * and most of that needs no avatar. Only a portrait is impossible without
 * one, so only a portrait is held back. Somebody asking about a voiceover
 * with no profile picture stays exactly where they were.
 */
const PORTRAIT =
  /(фото|аватар|портрет|нейрофото|selfie|portrait|avatar|headshot)/i // cyrillic-ok: what clients call a portrait
export function wantsPortrait(texts: string[]): boolean {
  return PORTRAIT.test(texts.join(' '))
}

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
  daysSinceInbound: number | null
  /** Days since our last word to them; null when we never wrote. */
  daysSinceOut: number | null
  unanswered: boolean
  lastTouch: { kind: string; at: string } | null
  next: NextStep
  /** The one segment this person is in; see crm-segments.ts. */
  segment: Segment
  /** Telegram shows them a photo; null when no ingest has looked yet. */
  hasPhoto: boolean | null
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
  } = {}
): Promise<LeadCandidate[]> {
  await ensureTable(pool)
  const now = opts.now ?? new Date()
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
      if (touch.kind === 'refused' && touchDays <= REFUSAL_HOLDS_DAYS) {
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
    /*
     * A PORTRAIT NEEDS A FACE TO DRAW FROM.
     *
     * The owner, 2026-09-15: the seller kept proposing a photo to people who
     * have no picture in Telegram. Refusing at the tool was not enough -- by
     * then the plan has already promised it. So the promise is not made:
     * they asked for a price, so they still get an offer, and the same
     * person with a voiceover ask is untouched.
     */
    const photo = people.get(lead)?.hasPhoto ?? null
    if (
      next === 'deliver' &&
      photo === false &&
      wantsPortrait(texts.get(lead) ?? [])
    ) {
      next = 'offer'
      why.push('нет фото в Telegram — портрет рисовать не из чего')
    }
    // A refusal parks the pitch, never the reply: their last word is answered.
    if (touch?.kind === 'refused' && score < 0 && !unanswered) next = 'wait'
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
      hasPhoto: photo,
      score,
      signals,
      total: Number(r.total),
      inbound: Number(r.inbound),
      lastInboundAt: lastIn,
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
  const chosen = opts.segment
    ? out.filter(c => c.segment === opts.segment)
    : out
  return chosen.slice(0, opts.limit ?? 20)
}
