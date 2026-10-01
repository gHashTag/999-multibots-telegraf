import type { IncomingMessage, ServerResponse } from 'node:http'
import * as SPEC from '../spec/kanban-card-chat.gen'
import { parseTask } from './task-thread'

/**
 * A CARD'S PULL REQUESTS AND CHECKS, READ ONCE BY THE SERVER FOR EVERYONE
 * (spec kanban-card-chat.t27 v4, STATUS_DOOR).
 *
 * The person's client reads GitHub's public API itself (player
 * lib/cardStatus.ts): sixty reads an hour per address, up to four per open.
 * With a read-only token in SERVER_TOKEN_ENV the server answers instead: one
 * GraphQL read (SERVER_READS_PER_OPEN) returns the newest SERVER_REFS_LAST
 * cross-references with each PR's check rollup, into a cache every person
 * shares. Without the token the door answers "not configured" and the
 * client reads for itself (`statusSource`) -- nothing changes until the
 * owner sets it.
 *
 * The answer has the client's CardStatus shape, so the sheet does not know
 * who read. Same order as the client: open, then merged, then closed;
 * newest first within each.
 */

export type CheckState = 'pass' | 'pending' | 'fail' | 'none'

export interface LinkedPr {
  repo: string
  number: number
  title: string
  state: 'open' | 'merged' | 'closed'
  draft: boolean
  url: string
  checks?: CheckState
}

export type CardStatus =
  | { kind: 'none' }
  | { kind: 'prs'; prs: LinkedPr[]; more: number; partial: boolean }

/** Who reads the card's status: the server only when it can and did. */
export function statusSource(tokenSet: boolean, doorMeasured: boolean): number {
  return tokenSet && doorMeasured ? SPEC.SOURCE_SERVER : SPEC.SOURCE_CLIENT
}

/** GitHub holds more references than it returned: the count is a floor. */
export function refsPartial(total: number, returned: number): boolean {
  return total > returned
}

/** The one read. A query, never a mutation (SERVER_READS_ONLY). */
export const CARD_STATUS_QUERY = `query CardStatus($owner: String!, $name: String!, $n: Int!) {
  repository(owner: $owner, name: $name) {
    issue(number: $n) {
      timelineItems(itemTypes: [CROSS_REFERENCED_EVENT], last: ${SPEC.SERVER_REFS_LAST}) {
        totalCount
        nodes {
          ... on CrossReferencedEvent {
            createdAt
            source {
              ... on PullRequest {
                number title state isDraft url merged
                repository { nameWithOwner }
                commits(last: 1) { nodes { commit { statusCheckRollup { state } } } }
              }
            }
          }
        }
      }
    }
  }
}`

const ROLLUP: Record<string, CheckState> = {
  SUCCESS: 'pass',
  FAILURE: 'fail',
  ERROR: 'fail',
  PENDING: 'pending',
  EXPECTED: 'pending',
}

const STATE_ORDER = { open: 0, merged: 1, closed: 2 } as const

interface Node {
  createdAt?: string
  source?: {
    number?: number
    title?: string
    state?: string
    isDraft?: boolean
    url?: string
    merged?: boolean
    repository?: { nameWithOwner?: string }
    commits?: {
      nodes?: Array<{
        commit?: { statusCheckRollup?: { state?: string } | null }
      }>
    }
  }
}

/**
 * The GraphQL answer as the sheet's status, or null when it is not one (an
 * error, a missing issue): a read that did not happen is not "no PR".
 */
export function statusFromGraphql(body: unknown): CardStatus | null {
  const items = (
    body as {
      data?: { repository?: { issue?: { timelineItems?: unknown } | null } }
    }
  )?.data?.repository?.issue?.timelineItems as
    | { totalCount?: number; nodes?: Node[] }
    | undefined
  if (!items || !Array.isArray(items.nodes)) return null
  const seen = new Map<string, { pr: LinkedPr; at: string; rollup?: string }>()
  for (const node of items.nodes) {
    const s = node?.source
    const repo = s?.repository?.nameWithOwner
    if (!s || !repo || !Number.isInteger(s.number)) continue
    const key = `${repo}#${s.number}`
    if (seen.has(key)) continue
    seen.set(key, {
      at: String(node.createdAt ?? ''),
      rollup: s.commits?.nodes?.[0]?.commit?.statusCheckRollup?.state,
      pr: {
        repo,
        number: Number(s.number),
        title: String(s.title ?? ''),
        state: s.merged ? 'merged' : s.state === 'OPEN' ? 'open' : 'closed',
        draft: s.isDraft === true,
        url: String(s.url ?? ''),
      },
    })
  }
  const all = [...seen.values()].sort(
    (a, b) =>
      STATE_ORDER[a.pr.state] - STATE_ORDER[b.pr.state] ||
      b.at.localeCompare(a.at)
  )
  const partial = refsPartial(Number(items.totalCount ?? 0), items.nodes.length)
  if (all.length === 0 && !partial) return { kind: 'none' }
  const shown = all.slice(0, SPEC.PRS_SHOWN_MAX)
  let checked = 0
  for (const e of shown)
    if (e.pr.state === 'open' && checked < SPEC.CHECKS_PRS_MAX) {
      checked += 1
      e.pr.checks = ROLLUP[e.rollup ?? ''] ?? 'none'
    }
  return {
    kind: 'prs',
    prs: shown.map(e => e.pr),
    more: all.length - shown.length,
    partial,
  }
}

/** One cache for every person (SERVER_SHARED_CACHE), oldest dropped first. */
const cache = new Map<string, { at: number; status: CardStatus }>()
const inFlight = new Map<string, Promise<CardStatus | null>>()

export function clearCardStatusCache(): void {
  cache.clear()
  inFlight.clear()
}

export async function readServerStatus(
  repo: string,
  number: number,
  token: string,
  opts: { fetchImpl?: typeof fetch; now?: () => number } = {}
): Promise<CardStatus | null> {
  const now = opts.now ?? Date.now
  const key = `${repo}#${number}`
  const hit = cache.get(key)
  if (hit && now() - hit.at < SPEC.STATUS_CACHE_S * 1000) return hit.status
  const pending = inFlight.get(key)
  if (pending) return pending
  const read = (async () => {
    const [owner, name] = repo.split('/')
    try {
      const r = await (opts.fetchImpl ?? fetch)(
        'https://api.github.com/graphql',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            'User-Agent': 'vibee-render-card-status',
          },
          body: JSON.stringify({
            query: CARD_STATUS_QUERY,
            variables: { owner, name, n: number },
          }),
        }
      )
      if (!r.ok) return null
      const status = statusFromGraphql(await r.json())
      if (status) {
        cache.delete(key)
        cache.set(key, { at: now(), status })
        while (cache.size > SPEC.SERVER_CACHE_CARDS_MAX)
          cache.delete(cache.keys().next().value as string)
      }
      return status
    } catch {
      return null
    } finally {
      inFlight.delete(key)
    }
  })()
  inFlight.set(key, read)
  return read
}

/**
 * GET STATUS_DOOR?repo=gHashTag/<name>&n=<number>. The caller is a person
 * already (render-server resolves identity first, STATUS_DOOR_NEEDS_PERSON).
 *   503 {configured:false}            no token: the client reads itself
 *   200 {configured:true, measured:false}   GitHub did not answer
 *   200 {configured:true, measured:true, status}
 */
export async function handleCardStatus(
  req: IncomingMessage,
  res: ServerResponse,
  opts: {
    env?: Record<string, string | undefined>
    fetchImpl?: typeof fetch
    now?: () => number
  } = {}
): Promise<void> {
  const send = (code: number, body: unknown) => {
    res.writeHead(code, {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    })
    res.end(JSON.stringify(body))
  }
  const url = new URL(req.url ?? '/', 'http://local')
  const task = parseTask(
    `${url.searchParams.get('repo') ?? ''}${SPEC.NUMBER_SEP}${url.searchParams.get('n') ?? ''}`
  )
  if (!task) return send(400, { error: 'bad_task' })
  const token = (opts.env ?? process.env)[SPEC.SERVER_TOKEN_ENV]
  if (!token) return send(503, { configured: false })
  const status = await readServerStatus(task.repo, task.number, token, opts)
  if (!status) return send(200, { configured: true, measured: false })
  send(200, { configured: true, measured: true, status })
}
