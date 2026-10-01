import * as SPEC from '../spec/kanban-card-chat.gen'

/**
 * WHAT THE TASK'S WORK LOOKS LIKE, SAID IN THE CARD'S SHEET (spec
 * kanban-card-chat.t27 v2).
 *
 * The pull requests that name the issue -- from any repository -- and the
 * worst state of their checks. Read by the person's own client from GitHub's
 * public API: the server holds no GitHub token. That API allows sixty reads
 * an hour per address, so a read can fail for a reason that says nothing
 * about the task; then the strip says it did NOT measure and when it can
 * again, never "no pull request" (UNMEASURED_IS_NOT_NONE).
 *
 * Relative imports only: render's binding test imports this file.
 */

export type CheckState = 'pass' | 'pending' | 'fail' | 'none'

export interface LinkedPr {
  repo: string
  number: number
  title: string
  state: 'open' | 'merged' | 'closed'
  draft: boolean
  url: string
  /** Undefined: not read (closed PR, past CHECKS_PRS_MAX, or the limit). */
  checks?: CheckState
}

export type CardStatus =
  | {
      kind: 'unmeasured'
      /** When GitHub will answer again (ms since epoch), if it said. */
      retryAt: number | null
    }
  | { kind: 'none' }
  | { kind: 'prs'; prs: LinkedPr[]; more: number }

/** The worst state among a PR's checks; one failure outranks the rest. */
export function checksRank(
  failed: number,
  pending: number,
  passed: number
): number {
  if (failed > 0) return SPEC.CHECK_FAIL_RANK
  if (pending > 0) return SPEC.CHECK_PENDING_RANK
  if (passed > 0) return SPEC.CHECK_PASS_RANK
  return SPEC.CHECK_NONE_RANK
}

/** What the strip says: a read that did not happen is not an empty answer. */
export function statusState(measured: boolean, found: number): number {
  if (!measured) return SPEC.STATUS_UNMEASURED
  if (found === 0) return SPEC.STATUS_NO_PR
  return SPEC.STATUS_PRS
}

/** How many pull requests the strip lists; the rest are behind GitHub. */
export function prsShown(found: number): number {
  return Math.min(found, SPEC.PRS_SHOWN_MAX)
}

const RANK_TO_STATE: Record<number, CheckState> = {
  [SPEC.CHECK_FAIL_RANK]: 'fail',
  [SPEC.CHECK_PENDING_RANK]: 'pending',
  [SPEC.CHECK_PASS_RANK]: 'pass',
  [SPEC.CHECK_NONE_RANK]: 'none',
}

/**
 * GitHub's check runs for one commit, as one state. Neutral and skipped
 * count as passed; anything not completed is pending.
 */
export function rollupChecks(body: unknown): CheckState {
  const runs = (body as { check_runs?: unknown })?.check_runs
  let failed = 0
  let pending = 0
  let passed = 0
  if (Array.isArray(runs))
    for (const r of runs as Array<{ status?: string; conclusion?: string }>) {
      if (r?.status !== 'completed') pending += 1
      else if (['success', 'neutral', 'skipped'].includes(String(r.conclusion)))
        passed += 1
      else failed += 1
    }
  return RANK_TO_STATE[checksRank(failed, pending, passed)]
}

const STATE_ORDER = { open: 0, merged: 1, closed: 2 } as const

/**
 * The pull requests an issue's timeline says reference it, once each: open
 * first, then merged, then closed; newest first within each. Pure.
 */
export function linkedPrs(timeline: unknown): LinkedPr[] {
  if (!Array.isArray(timeline)) return []
  const seen = new Map<string, LinkedPr & { at: string }>()
  for (const e of timeline as Array<Record<string, unknown>>) {
    if (e?.event !== 'cross-referenced') continue
    const issue = (e.source as { issue?: Record<string, unknown> })?.issue
    const pr = issue?.pull_request as
      | { merged_at?: string | null; html_url?: string }
      | undefined
    if (!issue || !pr) continue
    const repo = String(
      (issue.repository as { full_name?: string })?.full_name ?? ''
    )
    const number = Number(issue.number)
    if (!repo || !Number.isInteger(number)) continue
    const key = `${repo}#${number}`
    if (seen.has(key)) continue
    seen.set(key, {
      repo,
      number,
      title: String(issue.title ?? ''),
      state: pr.merged_at
        ? 'merged'
        : issue.state === 'open'
          ? 'open'
          : 'closed',
      draft: issue.draft === true,
      url: String(pr.html_url ?? issue.html_url ?? ''),
      at: String(e.created_at ?? ''),
    })
  }
  return [...seen.values()]
    .sort(
      (a, b) =>
        STATE_ORDER[a.state] - STATE_ORDER[b.state] || b.at.localeCompare(a.at)
    )
    .map(({ at: _at, ...pr }) => pr)
}

const API = 'https://api.github.com'
const CACHE = 'card-status:'

/** A read GitHub refused for its own limit, not for the task. */
class Unmeasured extends Error {
  constructor(readonly retryAt: number | null) {
    super('unmeasured')
  }
}

async function read(url: string, fetchImpl: typeof fetch): Promise<unknown> {
  const r = await fetchImpl(url, {
    headers: { Accept: 'application/vnd.github+json' },
  })
  if (r.ok) return r.json()
  const reset = Number(r.headers.get('x-ratelimit-reset'))
  throw new Unmeasured(
    Number.isFinite(reset) && reset > 0 ? reset * 1000 : null
  )
}

/**
 * The card's status: from the session cache when it is younger than
 * STATUS_CACHE_S, else read. An unmeasured answer is never cached, so the
 * next open tries again.
 */
export async function readCardStatus(
  repo: string,
  number: number,
  opts: {
    fetchImpl?: typeof fetch
    storage?: Pick<Storage, 'getItem' | 'setItem'> | null
    now?: () => number
  } = {}
): Promise<CardStatus> {
  const fetchImpl = opts.fetchImpl ?? fetch
  const now = opts.now ?? Date.now
  const storage =
    opts.storage === undefined
      ? typeof sessionStorage === 'undefined'
        ? null
        : sessionStorage
      : opts.storage
  const key = `${CACHE}${repo}#${number}`
  try {
    const hit = JSON.parse(storage?.getItem(key) ?? 'null') as {
      at: number
      status: CardStatus
    } | null
    if (hit && now() - hit.at < SPEC.STATUS_CACHE_S * 1000) return hit.status
  } catch {
    // A broken cache entry is a miss.
  }

  let prs: LinkedPr[]
  try {
    prs = linkedPrs(
      await read(
        `${API}/repos/${repo}/issues/${number}/timeline?per_page=100`,
        fetchImpl
      )
    )
  } catch (e) {
    return {
      kind: 'unmeasured',
      retryAt: e instanceof Unmeasured ? e.retryAt : null,
    }
  }

  const shown = prs.slice(0, prsShown(prs.length))
  const open = shown
    .filter(p => p.state === 'open')
    .slice(0, SPEC.CHECKS_PRS_MAX)
  await Promise.all(
    open.map(async p => {
      try {
        const pull = (await read(
          `${API}/repos/${p.repo}/pulls/${p.number}`,
          fetchImpl
        )) as { head?: { sha?: string } }
        const sha = pull?.head?.sha
        if (!sha) return
        p.checks = rollupChecks(
          await read(
            `${API}/repos/${p.repo}/commits/${sha}/check-runs?per_page=100`,
            fetchImpl
          )
        )
      } catch {
        // Checks not read stay undefined: said as "not measured", not "none".
      }
    })
  )

  const status: CardStatus =
    statusState(true, prs.length) === SPEC.STATUS_NO_PR
      ? { kind: 'none' }
      : { kind: 'prs', prs: shown, more: prs.length - shown.length }
  const complete = open.every(p => p.checks !== undefined)
  if (complete)
    try {
      storage?.setItem(key, JSON.stringify({ at: now(), status }))
    } catch {
      // A full storage only costs the next open a read.
    }
  return status
}
