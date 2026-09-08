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
  tableReady = true
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

export type NextStep = 'reply' | 'deliver' | 'offer' | 'wait'

export interface LeadCandidate {
  lead: string
  score: number
  signals: string[]
  total: number
  inbound: number
  lastInboundAt: Date | null
  daysSinceInbound: number | null
  unanswered: boolean
  lastTouch: { kind: string; at: string } | null
  next: NextStep
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
    let next: NextStep = 'wait'
    if (unanswered) next = 'reply'
    else if (
      signals.includes('service') &&
      (signals.includes('price') || signals.includes('buy'))
    )
      next = 'deliver'
    else if (signals.includes('price') || signals.includes('buy') || score >= 4)
      next = 'offer'
    // A refusal parks the pitch, never the reply: their last word is answered.
    if (touch?.kind === 'refused' && score < 0 && !unanswered) next = 'wait'
    out.push({
      lead,
      score,
      signals,
      total: Number(r.total),
      inbound: Number(r.inbound),
      lastInboundAt: lastIn,
      daysSinceInbound: days,
      unanswered,
      lastTouch: touch,
      next,
      because: why.join('; ') || 'давно тихо',
    })
  }
  out.sort(
    (a, b) =>
      b.score - a.score ||
      (b.lastInboundAt?.getTime() ?? 0) - (a.lastInboundAt?.getTime() ?? 0)
  )
  return out.slice(0, opts.limit ?? 20)
}
