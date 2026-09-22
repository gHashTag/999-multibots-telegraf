/**
 * WHAT THE AGENT DID IN THE PERSON'S BROWSER, STEP BY STEP.
 *
 * On 2026-09-22 the agent told the owner the screen showed "the Queen's
 * board with task cards" while it showed a Google sign-in; finding out took
 * an evening of re-running its calls by hand. Browserbase and Kernel keep a
 * recording of each session for exactly this. Ours is smaller: one row per
 * browser tool call -- which tool, where, what came back, how long -- kept
 * in the render's Postgres so it survives a deploy.
 *
 * WHAT IS NEVER WRITTEN DOWN. The text the agent typed and the code it ran
 * are recorded by LENGTH only: typed text can be a message, a search, or --
 * against the rules but possible -- something private. Addresses lose their
 * query and fragment, where tokens live. The person's own passwords never
 * pass through a tool at all (they type them in the stream).
 *
 * Read by the person (GET /api/browser/journal) and by `tri journal`.
 * The last KEEP_STEPS per person are kept; older rows go on the next write.
 */
import type { Queryable } from './sessions'

export const KEEP_STEPS = 200
export const READ_STEPS = 50
/*
 * PROBES ARE NOT THE AGENT'S WORK.
 *
 * On 2026-09-22 every row of the owner's journal was a `tri eyes` check --
 * "checked tabs, looked" every hour of the night -- and a person opening the
 * panel would have read steps nobody asked for, while real ones were pushed
 * toward the 200-row limit. A caller marks a probe (MCP _meta.probe); probes
 * are kept apart (the last KEEP_PROBES), hidden from the person's view, and
 * shown to `tri journal`, where their timings are the point.
 */
export const KEEP_PROBES = 20

export interface Step {
  tool: string
  ok: boolean
  ms: number
  /** Short, already sanitised facts about the call; never raw input. */
  detail: Record<string, unknown>
}

/** An address with its query and fragment removed; null when unparseable. */
export function bareUrl(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw) return null
  try {
    const u = new URL(raw)
    return `${u.origin}${u.pathname}`.slice(0, 200)
  } catch {
    return null
  }
}

const clip = (v: unknown, n: number): string | null =>
  typeof v === 'string' ? v.slice(0, n) : null

/**
 * The facts worth keeping about one call, from its arguments and its
 * result. Pure, so the privacy rules are tested directly.
 */
export function stepOf(
  tool: string,
  args: Record<string, unknown>,
  outcome: { result?: unknown; error?: unknown },
  ms: number
): Step {
  const detail: Record<string, unknown> = {}
  const r = (outcome.result ?? {}) as Record<string, unknown>
  switch (tool) {
    case 'browser_open':
      detail.url = bareUrl(args.url)
      break
    case 'browser_click':
      detail.x = Number(args.x)
      detail.y = Number(args.y)
      break
    case 'browser_type':
      // The text itself is never stored: only how long it was.
      detail.chars = typeof args.text === 'string' ? args.text.length : 0
      break
    case 'browser_evaluate':
      detail.chars = typeof args.code === 'string' ? args.code.length : 0
      break
    case 'browser_read':
      detail.url = bareUrl(r.url)
      detail.title = clip(r.title, 120)
      break
    case 'browser_screenshot':
      detail.desktop = args.desktop === true
      detail.tabs = Array.isArray(r.tabs) ? r.tabs.length : null
      detail.seen = clip(r.seen, 300)
      if (r.seenPending === true) detail.seenPending = true
      break
    case 'browser_status':
      detail.running = r.running === true
      detail.pages = Array.isArray(r.pages) ? r.pages.length : null
      break
    case 'browser_ask_input':
      // What was asked for and whether it came; never what was typed.
      detail.kind = clip(args.kind, 20)
      detail.what = clip(args.why, 200)
      detail.typed = r.typed === true
      if (typeof r.chars === 'number') detail.chars = r.chars
      break
    case 'browser_ask_permission':
      detail.what = clip(args.what ?? args.action ?? args.text, 200)
      break
  }
  if (outcome.error !== undefined) {
    detail.error = String(
      outcome.error instanceof Error ? outcome.error.message : outcome.error
    ).slice(0, 200)
  }
  return { tool, ok: outcome.error === undefined, ms: Math.round(ms), detail }
}

let tableReady = false

export async function ensureJournal(q: Queryable): Promise<void> {
  if (tableReady) return
  await q.query(
    `CREATE TABLE IF NOT EXISTS browser_journal (
       id          bigserial PRIMARY KEY,
       telegram_id text NOT NULL,
       at          timestamptz NOT NULL DEFAULT now(),
       tool        text NOT NULL,
       ok          boolean NOT NULL,
       ms          integer NOT NULL,
       detail      jsonb NOT NULL
     )`,
    []
  )
  await q.query(
    `CREATE INDEX IF NOT EXISTS browser_journal_person_at ON browser_journal (telegram_id, at DESC)`,
    []
  )
  tableReady = true
}

export function resetJournalCacheForTests(): void {
  tableReady = false
}

/**
 * Write one step. Never throws: a journal that cannot be written must not
 * turn a working click into a failed one.
 */
export async function recordStep(
  q: Queryable,
  telegramId: string,
  step: Step,
  opts: { probe?: boolean } = {}
): Promise<void> {
  try {
    await ensureJournal(q)
    const detail = opts.probe ? { ...step.detail, probe: true } : step.detail
    await q.query(
      `INSERT INTO browser_journal (telegram_id, tool, ok, ms, detail) VALUES ($1, $2, $3, $4, $5)`,
      [telegramId, step.tool, step.ok, step.ms, JSON.stringify(detail)]
    )
    // Real steps and probes are trimmed apart: probes never push out work.
    await q.query(
      `DELETE FROM browser_journal WHERE telegram_id = $1 AND (detail->>'probe') IS NULL AND id NOT IN (
         SELECT id FROM browser_journal WHERE telegram_id = $1 AND (detail->>'probe') IS NULL
         ORDER BY at DESC, id DESC LIMIT ${KEEP_STEPS}
       )`,
      [telegramId]
    )
    await q.query(
      `DELETE FROM browser_journal WHERE telegram_id = $1 AND (detail->>'probe') IS NOT NULL AND id NOT IN (
         SELECT id FROM browser_journal WHERE telegram_id = $1 AND (detail->>'probe') IS NOT NULL
         ORDER BY at DESC, id DESC LIMIT ${KEEP_PROBES}
       )`,
      [telegramId]
    )
  } catch (e) {
    console.warn('[browser-journal] not written:', String(e).slice(0, 160))
  }
}

export interface JournalRow {
  at: string
  tool: string
  ok: boolean
  ms: number
  detail: Record<string, unknown>
}

export async function readJournal(
  q: Queryable,
  telegramId: string,
  limit: number = READ_STEPS,
  opts: { probes?: boolean } = {}
): Promise<JournalRow[]> {
  await ensureJournal(q)
  const n = Math.max(1, Math.min(KEEP_STEPS, Math.floor(limit) || READ_STEPS))
  const onlyWork = opts.probes ? '' : ` AND (detail->>'probe') IS NULL`
  const { rows } = await q.query(
    `SELECT at, tool, ok, ms, detail FROM browser_journal WHERE telegram_id = $1${onlyWork} ORDER BY at DESC, id DESC LIMIT ${n}`,
    [telegramId]
  )
  return (rows as Array<Record<string, unknown>>).map(r => ({
    at: new Date(String(r.at)).toISOString(),
    tool: String(r.tool),
    ok: Boolean(r.ok),
    ms: Number(r.ms),
    detail:
      typeof r.detail === 'string'
        ? JSON.parse(r.detail)
        : ((r.detail ?? {}) as Record<string, unknown>),
  }))
}
