import * as SPEC from '../spec/kanban-card-chat.gen'

/**
 * THE BEE AT WORK ON A CARD, LIVE (spec kanban-card-chat.t27 v7, S20).
 *
 * Owner, 2026-10-03: "tapping a card I want to see the agent working online
 * -- its logs, its tool calls, the tri commands it runs". Render reads the
 * Queen's log of the bee on this card (render agent/card-work.ts, BEE_DOOR)
 * and answers rows; this module asks for what is new and keeps one list.
 * Pure: no React. Relative imports only -- render's spec test imports it.
 */

export type BeeRowKind = 'tool' | 'result' | 'thought' | 'usage' | 'error'

export interface BeeRow {
  seq: number
  at: string
  kind: BeeRowKind
  text: string
  tool?: string
  ok?: boolean
  lines?: number
}

export interface BeeAttempt {
  conversation: string
  branch: string
  model: string
  dispatchedAt: string
  finishedAt: string | null
  outcome: string | null
  running: boolean
}

/** What the sheet knows of the bee on this card. */
export type BeeWork =
  | { kind: 'reading' }
  /** No token on render (503) or an old render (404): said, not hidden. */
  | { kind: 'off' }
  /** The Queen did not answer this time. Never "no bee". */
  | { kind: 'unmeasured' }
  | { kind: 'none' }
  | {
      kind: 'bee'
      bee: BeeAttempt
      rows: BeeRow[]
      next: number
      prose: boolean
      /** The last read failed: the rows are the last ones seen. */
      stale?: boolean
    }

/** Spec `bee_poll_s`. */
export function beePollS(running: boolean): number {
  return running ? SPEC.BEE_POLL_S : SPEC.BEE_IDLE_POLL_S
}

const KINDS: readonly BeeRowKind[] = [
  'tool',
  'result',
  'thought',
  'usage',
  'error',
]

function rowOk(r: unknown): r is BeeRow {
  const x = (r ?? {}) as Record<string, unknown>
  return (
    Number.isInteger(x.seq) &&
    typeof x.text === 'string' &&
    KINDS.includes(x.kind as BeeRowKind)
  )
}

/**
 * The rows so far and a fresh answer as one list: a thought that went on
 * across two polls is one thought, a `reset` (a new attempt) starts over,
 * and only the newest BEE_ROWS_MAX stay.
 */
export function mergeRows(
  had: BeeRow[],
  fresh: BeeRow[],
  reset: boolean
): BeeRow[] {
  const out = reset ? [] : had.slice()
  const last = out.length ? out[out.length - 1].seq : 0
  for (const r of fresh) {
    if (r.seq <= last) continue
    const tail = out[out.length - 1]
    if (r.kind === 'thought' && tail?.kind === 'thought') {
      const text = `${tail.text} ${r.text}`.trim()
      out[out.length - 1] = {
        ...tail,
        seq: r.seq,
        at: r.at,
        text:
          text.length > SPEC.BEE_THOUGHT_MAX
            ? `…${text.slice(text.length - SPEC.BEE_THOUGHT_MAX + 1)}`
            : text,
      }
      continue
    }
    out.push(r)
  }
  return out.slice(-SPEC.BEE_ROWS_MAX)
}

/** The door's answer folded into what the sheet had. */
export function workFrom(had: BeeWork, status: number, body: unknown): BeeWork {
  if (status === 503 || status === 404) return { kind: 'off' }
  const b = (body ?? {}) as Record<string, unknown>
  if (status === 200 && b.configured === false) return { kind: 'off' }
  if (status !== 200 || b.measured !== true) {
    // A missed read keeps what was seen and says so; never "no bee".
    return had.kind === 'bee' ? { ...had, stale: true } : { kind: 'unmeasured' }
  }
  const bee = b.bee as BeeAttempt | null | undefined
  if (!bee || typeof bee.conversation !== 'string') return { kind: 'none' }
  const fresh = Array.isArray(b.rows) ? b.rows.filter(rowOk) : []
  const same =
    had.kind === 'bee' && had.bee.conversation === bee.conversation && !b.reset
  const rows = mergeRows(same ? had.rows : [], fresh, !same)
  const next = Number.isInteger(b.next) ? Number(b.next) : 0
  return {
    kind: 'bee',
    bee,
    rows,
    next: same ? Math.max(had.next, next) : next,
    prose: b.prose === true,
  }
}

/** The query for the next poll: from where the sheet is, on its attempt. */
export function workQuery(task: string, had: BeeWork): string {
  const q = new URLSearchParams({ [SPEC.FIELD]: task })
  if (had.kind === 'bee' && had.next > 0) {
    q.set('conversation', had.bee.conversation)
    q.set('since', String(had.next))
  }
  return q.toString()
}

/** Seconds until the next ask; null stops asking (nothing to wait for). */
export function nextPollS(work: BeeWork, watching: boolean): number | null {
  if (work.kind === 'off') return null
  if (work.kind === 'bee') return beePollS(watching && work.bee.running)
  return beePollS(false)
}

/**
 * The CLIs the owner asked to see stand out: the program a command starts
 * with, when it is one of ours or a build tool.
 */
const HEADS = ['tri', 't27c', 'git', 'gh', 'cargo', 'npm', 'npx', 'bun', 'node']

export function commandHead(text: string): string | null {
  const first = text.trim().split(/\s+/)[0] ?? ''
  const name = first.split('/').pop() ?? ''
  return HEADS.includes(name) ? name : null
}

/** How many tool calls the attempt made, as far as the sheet has seen. */
export function toolCount(rows: BeeRow[]): number {
  return rows.filter(r => r.kind === 'tool').length
}
