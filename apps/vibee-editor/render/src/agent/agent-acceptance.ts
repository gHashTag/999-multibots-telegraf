/**
 * WHAT THE LAST ACCEPTANCE RUN SAID ABOUT EACH MARKETPLACE AGENT.
 *
 * Competitor scan, 2026-09-24: agent marketplaces sell on VERIFIED
 * performance -- runs, pass rates, an audit trail -- not on the card's
 * adjectives. Ours had the run (`tri agents`: 5/5 on the owner, 24.09) and
 * nowhere to show it: the result lived in a GitHub comment, and the card
 * said "training" or "live" with nothing measured behind either word.
 *
 * So the acceptance script writes its verdicts here, and the market reads
 * the latest one per agent. The catalogue says what an agent is FOR; this
 * says whether it did it the last time somebody checked, and when.
 *
 * WHAT IS KEPT, AND WHAT IS NOT. Agent id, when, pass or fail, the names of
 * the tools the run called, and a reason CODE. Never the answer's text, never
 * an error message: a canary runs on the owner's real accounts, and what it
 * read there is not the market's business.
 *
 * WHO WRITES. Only a keeper (hive/roles.ts), through the same identity every
 * other route uses -- an agent key issued to a keeper included. Anybody may
 * read: the answer is the evidence the card shows to everybody.
 */

export interface Queryable {
  query: (
    sql: string,
    params?: unknown[]
  ) => Promise<{ rows: Array<Record<string, unknown>> }>
}

export const ACCEPTANCE_PATHS = ['/api/agents/acceptance'] as const

export function isAcceptancePath(path: string): boolean {
  return (ACCEPTANCE_PATHS as readonly string[]).includes(path)
}

/** Why a run failed, as a code the card can translate. Never free text. */
export const FAIL_CODES = [
  'http',
  'error',
  'no_answer',
  'acted',
  'expected_tool_missing',
  /* The answer is not what the canary asked for (acceptance-canaries.json). */
  'answer_shape',
] as const
export type FailCode = (typeof FAIL_CODES)[number]

export interface Verdict {
  agent: string
  pass: boolean
  /** Tool NAMES the run called, in order. */
  tools: string[]
  /** Empty on a pass. */
  codes: FailCode[]
}

export interface LatestVerdict extends Verdict {
  /** ISO time of the run. */
  at: string
  /**
   * The fingerprint of the canary table the run used (daily-acceptance.ts
   * CANARIES_HASH); '' when a run did not say. A verdict under an older
   * table is stale: the daily run checks again at once.
   */
  canaries: string
}

/** A canary-table fingerprint as runs send it: 12 hex characters. */
export const CANARIES_HASH_SHAPE = /^[0-9a-f]{12}$/

const AGENT_ID = /^[a-z][a-z0-9-]{0,39}$/
const TOOL_NAME = /^[a-z][a-z0-9_]{0,63}$/

/**
 * One verdict from untrusted JSON, or null. Names that are not names are
 * dropped rather than stored: this table is shown to everybody. Pure.
 */
export function verdictOf(raw: unknown): Verdict | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const agent = typeof r.agent === 'string' ? r.agent.trim() : ''
  if (!AGENT_ID.test(agent) || typeof r.pass !== 'boolean') return null
  const tools = (Array.isArray(r.tools) ? r.tools : [])
    .filter((t): t is string => typeof t === 'string' && TOOL_NAME.test(t))
    .slice(0, 40)
  const codes = (Array.isArray(r.codes) ? r.codes : [])
    .filter((c): c is FailCode =>
      (FAIL_CODES as readonly unknown[]).includes(c)
    )
    .slice(0, FAIL_CODES.length)
  return { agent, pass: r.pass, tools, codes: r.pass ? [] : codes }
}

let tableReady = false
export function resetAcceptanceTableForTests(): void {
  tableReady = false
}

async function ensureTable(q: Queryable): Promise<void> {
  if (tableReady) return
  await q.query(`CREATE TABLE IF NOT EXISTS agent_acceptance (
    id bigserial PRIMARY KEY,
    agent text NOT NULL,
    at timestamptz NOT NULL DEFAULT now(),
    pass boolean NOT NULL,
    tools text[] NOT NULL DEFAULT '{}',
    codes text[] NOT NULL DEFAULT '{}',
    by_id text NOT NULL
  )`)
  await q.query(
    `CREATE INDEX IF NOT EXISTS agent_acceptance_agent_at ON agent_acceptance (agent, at DESC)`
  )
  await q.query(
    `ALTER TABLE agent_acceptance ADD COLUMN IF NOT EXISTS canaries text NOT NULL DEFAULT ''`
  )
  tableReady = true
}

/** The newest verdict of every agent that was ever checked. */
export async function latestVerdicts(q: Queryable): Promise<LatestVerdict[]> {
  await ensureTable(q)
  const { rows } = await q.query(
    `SELECT DISTINCT ON (agent) agent, at, pass, tools, codes, canaries
       FROM agent_acceptance
      ORDER BY agent, at DESC`
  )
  return rows.map(r => ({
    agent: String(r.agent),
    at: new Date(String(r.at)).toISOString(),
    pass: r.pass === true,
    tools: Array.isArray(r.tools) ? r.tools.map(String) : [],
    codes: (Array.isArray(r.codes) ? r.codes.map(String) : []) as FailCode[],
    canaries: typeof r.canaries === 'string' ? r.canaries : '',
  }))
}

export interface AcceptanceDeps {
  getPool: () => Promise<Queryable>
  identity: (req: { url?: string; method?: string }) => string | null
  keepers: () => string[]
  readBody: () => Promise<string>
}

/** At most this many verdicts in one run: the catalogue is small. */
export const MAX_VERDICTS = 20

export async function handleAcceptance(
  req: { url?: string; method?: string },
  deps: AcceptanceDeps
): Promise<{ status: number; body: Record<string, unknown> }> {
  const path = (req.url || '').split('?')[0]
  if (!isAcceptancePath(path)) return { status: 404, body: { ok: false } }
  const method = req.method || 'GET'

  if (method === 'GET') {
    try {
      return {
        status: 200,
        body: {
          ok: true,
          verdicts: await latestVerdicts(await deps.getPool()),
        },
      }
    } catch {
      /* Unknown is not "never checked": the card keeps its own words. */
      return { status: 503, body: { ok: false, error: 'unavailable' } }
    }
  }

  if (method !== 'POST') {
    return { status: 405, body: { ok: false, error: 'GET or POST' } }
  }
  const who = deps.identity(req)
  if (!who) return { status: 401, body: { ok: false, error: 'who is asking?' } }
  if (!deps.keepers().includes(who)) {
    return { status: 403, body: { ok: false, error: 'keepers only' } }
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(await deps.readBody())
  } catch {
    return { status: 400, body: { ok: false, error: 'JSON body expected' } }
  }
  const list = Array.isArray((parsed as { verdicts?: unknown })?.verdicts)
    ? ((parsed as { verdicts: unknown[] }).verdicts as unknown[])
    : []
  const verdicts = list
    .slice(0, MAX_VERDICTS)
    .map(verdictOf)
    .filter((v): v is Verdict => v !== null)
  if (!verdicts.length) {
    return { status: 400, body: { ok: false, error: 'no valid verdicts' } }
  }
  const hash = (parsed as { canaries?: unknown })?.canaries
  await recordVerdicts(
    await deps.getPool(),
    verdicts,
    who,
    typeof hash === 'string' && CANARIES_HASH_SHAPE.test(hash) ? hash : ''
  )
  return { status: 200, body: { ok: true, kept: verdicts.length } }
}

/**
 * The one writer: the keepers' POST and the daily run (daily-acceptance.ts)
 * both come through here, and both through verdictOf first.
 */
export async function recordVerdicts(
  pool: Queryable,
  verdicts: readonly Verdict[],
  by: string,
  canaries = ''
): Promise<void> {
  await ensureTable(pool)
  const hash = CANARIES_HASH_SHAPE.test(canaries) ? canaries : ''
  for (const raw of verdicts) {
    const v = verdictOf(raw)
    if (!v) continue
    await pool.query(
      `INSERT INTO agent_acceptance (agent, pass, tools, codes, by_id, canaries)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [v.agent, v.pass, v.tools, v.codes, by, hash]
    )
  }
}
