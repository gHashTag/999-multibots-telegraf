import type { IncomingMessage, ServerResponse } from 'node:http'
import * as SPEC from '../spec/kanban-card-chat.gen'
import { keepers } from '../hive/roles'
import { QUEEN_BASE, queenIndex } from '../hive/queen-client'
import { parseTask } from './task-thread'

/**
 * THE BEE AT WORK ON A CARD, LIVE (spec kanban-card-chat.t27 v7, S20).
 *
 * Owner, 2026-10-03: "tapping a card I want to see the agent working online --
 * its logs, its tool calls, the tri commands it runs". A running card is worked
 * by a Queen bee in trios-agent-server, not by the chat's agent, and the Queen
 * keeps that bee's log behind her deployment token (BEE_SOURCE). Render reads
 * it for a signed-in person and answers rows the sheet can draw:
 *
 *   tool     the tool's short name and the command as written, cut at the
 *            first word that could carry a secret
 *   result   ok or failed, its first line and how many lines it had
 *   thought  the model's own words, joined -- a keeper's only (BEE_PROSE_*);
 *            anyone else gets the row with no text, "thinking"
 *   usage, error   their first line
 *
 * The token never leaves this file's request (BEE_TOKEN_TO_BROWSER), nothing
 * is stored (BEE_STORED), and every row passes `maskSecrets` on the way out:
 * the bee's commands are written by a model, and a model can echo a key it
 * read.
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

export interface BeeDispatch {
  conversation: string
  branch: string
  model: string
  dispatchedAt: string
  finishedAt: string | null
  outcome: string | null
  running: boolean
}

interface FeedEntry {
  conversationId?: unknown
  seq?: unknown
  at?: unknown
  kind?: unknown
  text?: unknown
}

interface FeedBody {
  entries?: FeedEntry[]
  dispatch?: {
    branch?: unknown
    detail?: unknown
    conversationId?: unknown
    finishedAt?: unknown
    outcome?: unknown
    dispatchedAt?: unknown
  } | null
}

const CONVERSATION_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const WORKTREE_RE = /\/workspace\/[^\s/]+\/\.worktrees\/[^\s/]+\/?/g
const ANSI_RE = /\u001b\[[0-9;]*[A-Za-z]/g
const RISKY_WORD_RE = /[=$'"`]/
const ASSIGNMENT_RE = /^[A-Za-z_][A-Za-z0-9_]*=/
const PREFIXED_SECRET_RE =
  /\b(sk-|ghp_|gho_|ghs_|github_pat_|xox[abps]-|AKIA)[A-Za-z0-9_-]{6,}/g

/** Spec `bee_poll_s`: how often the sheet asks while a bee runs, or not. */
export function beePollS(running: boolean): number {
  return running ? SPEC.BEE_POLL_S : SPEC.BEE_IDLE_POLL_S
}

/** Spec `bee_prose_sent`: the model's own words reach a keeper only. */
export function beeProseSent(keeper: boolean): boolean {
  return keeper || !SPEC.BEE_PROSE_KEEPER_ONLY
}

function cap(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

/** A piece of a run that reads like a key: long, letters and digits mixed. */
function keyLike(piece: string): boolean {
  return piece.length >= 16 && /[0-9]/.test(piece) && /[A-Za-z]/.test(piece)
}

/**
 * A run of BEE_SECRET_RUN token characters is masked to its first four when
 * one of its `_`/`-` pieces reads like a key; so is anything with a known key
 * prefix. `check_t27_specs_against_the_host` is words and stays; hashes and
 * keys do not.
 */
export function maskSecrets(text: string): string {
  const run = new RegExp(`[A-Za-z0-9_+\\-]{${SPEC.BEE_SECRET_RUN},}`, 'g')
  return text
    .replace(PREFIXED_SECRET_RE, m => `${m.slice(0, 4)}…`)
    .replace(run, m =>
      m.split(/[_+-]/).some(keyLike) ? `${m.slice(0, 4)}…` : m
    )
}

/** The bee's own worktree is where it always is; its path is noise. */
function shortPaths(text: string): string {
  return text.replace(WORKTREE_RE, '')
}

/** One shell segment as shown, or '' when it shows nothing worth a line. */
function segmentShown(segment: string): string {
  const words = segment.trim().split(/\s+/).filter(Boolean)
  if (!words.length) return ''
  if (words[0] === 'cd' || words[0] === 'echo') return ''
  if (ASSIGNMENT_RE.test(words[0])) return ''
  const kept: string[] = []
  for (const w of words) {
    if (RISKY_WORD_RE.test(w)) {
      kept.push('…')
      break
    }
    kept.push(w)
  }
  return kept.join(' ')
}

/**
 * A shell command as the sheet shows it: the first line only, each segment
 * up to its first word that could carry a value (an assignment, a quote, a
 * `$`), the `cd` into the bee's worktree and the `echo` banners dropped.
 */
export function commandShown(command: string): string {
  const [first, ...more] = shortPaths(command.replace(ANSI_RE, '')).split('\n')
  const parts = first.split(/(\s*(?:&&|\|\||;|\|)\s*)/)
  const out: string[] = []
  for (let i = 0; i < parts.length; i += 2) {
    const shown = segmentShown(parts[i])
    if (!shown) continue
    if (out.length) out.push(` ${parts[i - 1].trim()} `)
    out.push(shown)
  }
  let text = out.join('')
  if (!text) text = segmentShown(first.trim().split(/\s+/)[0] ?? '') || '…'
  if (more.some(l => l.trim())) text += ' …'
  return cap(maskSecrets(text), SPEC.BEE_LINE_MAX)
}

/** "filesystem_bash  <cmd>" -> {tool: 'bash', text: <cmd as shown>}. */
export function toolShown(raw: string): { tool: string; text: string } {
  const at = raw.search(/\s/)
  const name = (at < 0 ? raw : raw.slice(0, at)).trim()
  const rest = at < 0 ? '' : raw.slice(at).trim()
  const tool = cap(name.replace(/^filesystem_/, ''), 32)
  if (tool === 'bash') return { tool, text: commandShown(rest) }
  const line = shortPaths(rest.replace(ANSI_RE, '')).split('\n')[0].trim()
  return { tool, text: cap(maskSecrets(line), SPEC.BEE_LINE_MAX) }
}

/** "FAILED  <why>" or the output: ok, its first line, how many lines. */
export function resultShown(raw: string): {
  ok: boolean
  text: string
  lines: number
} {
  const failed = raw.startsWith('FAILED')
  const body = (failed ? raw.slice('FAILED'.length) : raw).replace(ANSI_RE, '')
  const lines = body.split('\n').filter(l => l.trim())
  const first = shortPaths(lines[0] ?? '')
    .replace(/\s+/g, ' ')
    .trim()
  return {
    ok: !failed,
    text: cap(maskSecrets(first), SPEC.BEE_LINE_MAX),
    lines: lines.length,
  }
}

/** "openai-compatible/z-ai/glm-5.3 key 13/24 lane 1/2" -> "glm-5.3". */
export function modelFromDetail(detail: unknown): string {
  const m = /([A-Za-z0-9._-]+) key \d+\/\d+/.exec(String(detail ?? ''))
  return m ? cap(m[1], 40) : ''
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v ? v : null
}

export function dispatchShown(d: FeedBody['dispatch']): BeeDispatch | null {
  const conversation = str(d?.conversationId)
  if (!d || !conversation || !CONVERSATION_RE.test(conversation)) return null
  const finishedAt = str(d.finishedAt)
  return {
    conversation,
    branch: cap(String(d.branch ?? ''), 60),
    model: modelFromDetail(d.detail),
    dispatchedAt: str(d.dispatchedAt) ?? '',
    finishedAt,
    outcome: str(d.outcome) ? cap(String(d.outcome), 30) : null,
    running: !finishedAt,
  }
}

/**
 * The Queen's rows of ONE attempt (BEE_ONE_ATTEMPT), oldest first, after
 * `since`, as the sheet's rows. Consecutive words of the model join into one
 * thought, of which the newest BEE_THOUGHT_MAX characters are kept -- and
 * reach only a keeper (`prose`).
 */
export function rowsShown(
  entries: FeedEntry[],
  conversation: string,
  since: number,
  prose: boolean
): { rows: BeeRow[]; next: number } {
  const mine = entries
    .filter(e => e?.conversationId === conversation)
    .map(e => ({ ...e, seq: Number(e.seq) }))
    .filter(e => Number.isInteger(e.seq) && e.seq > since)
    .sort((a, b) => a.seq - b.seq)
  const rows: BeeRow[] = []
  let next = since
  for (const e of mine) {
    next = Math.max(next, e.seq)
    const at = String(e.at ?? '')
    const text = String(e.text ?? '')
    const last = rows[rows.length - 1]
    if (e.kind === 'say') {
      const words = prose ? text : ''
      if (last?.kind === 'thought') {
        last.seq = e.seq
        last.at = at
        last.text = last.text + words
        continue
      }
      rows.push({ seq: e.seq, at, kind: 'thought', text: words })
    } else if (e.kind === 'tool') {
      rows.push({ seq: e.seq, at, kind: 'tool', ...toolShown(text) })
    } else if (e.kind === 'result') {
      rows.push({ seq: e.seq, at, kind: 'result', ...resultShown(text) })
    } else if (e.kind === 'usage' || e.kind === 'error') {
      const line = shortPaths(text.replace(ANSI_RE, '')).split('\n')[0].trim()
      rows.push({
        seq: e.seq,
        at,
        kind: e.kind,
        text: cap(maskSecrets(line), SPEC.BEE_LINE_MAX),
      })
    }
  }
  for (const r of rows) {
    if (r.kind !== 'thought' || !r.text) continue
    const flat = maskSecrets(r.text.replace(/\s+/g, ' ').trim())
    r.text =
      flat.length > SPEC.BEE_THOUGHT_MAX
        ? `…${flat.slice(flat.length - SPEC.BEE_THOUGHT_MAX + 1)}`
        : flat
  }
  return { rows: rows.slice(-SPEC.BEE_ROWS_MAX), next }
}

/** Persons watching one card share one read (BEE_CACHE_S). */
const cache = new Map<string, { at: number; body: FeedBody }>()
const inFlight = new Map<string, Promise<FeedBody | null>>()

export function clearCardWorkCache(): void {
  cache.clear()
  inFlight.clear()
}

async function readFeed(
  query: string,
  token: string,
  opts: { fetchImpl?: typeof fetch; now?: () => number }
): Promise<FeedBody | null> {
  const now = opts.now ?? Date.now
  const hit = cache.get(query)
  if (hit && now() - hit.at < SPEC.BEE_CACHE_S * 1000) return hit.body
  const pending = inFlight.get(query)
  if (pending) return pending
  const read = (async () => {
    const stop = new AbortController()
    const timer = setTimeout(() => stop.abort(), 6000)
    try {
      const r = await (opts.fetchImpl ?? fetch)(
        `${QUEEN_BASE}${SPEC.BEE_SOURCE}?${query}`,
        { headers: { Authorization: `Bearer ${token}` }, signal: stop.signal }
      )
      if (!r.ok) return null
      const body = (await r.json()) as FeedBody
      if (!body || !Array.isArray(body.entries)) return null
      cache.set(query, { at: now(), body })
      while (cache.size > 200) cache.delete(cache.keys().next().value as string)
      return body
    } catch {
      return null
    } finally {
      clearTimeout(timer)
      inFlight.delete(query)
    }
  })()
  inFlight.set(query, read)
  return read
}

/**
 * GET BEE_DOOR?task=gHashTag/t27#5673[&conversation=<id>&since=<seq>]. The
 * caller is a person already (render-server resolves identity first).
 *   503 {configured:false}                         no token on this server
 *   200 {configured:true, measured:false}          the Queen did not answer
 *   200 {configured:true, measured:true, bee:null} no bee was sent to it
 *   200 {..., bee, rows, next, reset, prose}       the attempt, from `since`
 * `reset` says the attempt changed under the sheet: drop the rows it had.
 */
export async function handleCardWork(
  req: IncomingMessage,
  res: ServerResponse,
  who: string,
  opts: {
    env?: Record<string, string | undefined>
    fetchImpl?: typeof fetch
    now?: () => number
    boardRepo?: () => Promise<string>
    keeperIds?: () => string[]
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
  const task = parseTask(url.searchParams.get(SPEC.FIELD))
  if (!task) return send(400, { error: 'bad_task' })
  const token = (opts.env ?? process.env)[SPEC.BEE_TOKEN_ENV]
  if (!token) return send(503, { configured: false })

  let boardRepo = ''
  try {
    boardRepo = await (
      opts.boardRepo ?? (async () => (await queenIndex(60_000)).repo)
    )()
  } catch {
    return send(200, { configured: true, measured: false })
  }
  if (task.repo.toLowerCase() !== boardRepo.toLowerCase()) {
    return send(200, { configured: true, measured: true, bee: null })
  }

  const asked = url.searchParams.get('conversation') ?? ''
  const following = CONVERSATION_RE.test(asked) ? asked : ''
  const sinceRaw = Number(url.searchParams.get('since') ?? 0)
  let since =
    following && Number.isInteger(sinceRaw) && sinceRaw > 0 ? sinceRaw : 0

  const issue = `issue=${task.number}`
  let body = since
    ? await readFeed(
        `${issue}&conversation=${following}&since=${since}`,
        token,
        opts
      )
    : await readFeed(issue, token, opts)
  let bee = body ? dispatchShown(body.dispatch) : null
  if (body && since && bee?.conversation !== following) {
    // A new attempt started under the sheet: read it from its newest page.
    since = 0
    body = await readFeed(issue, token, opts)
    bee = body ? dispatchShown(body.dispatch) : null
  }
  if (!body) return send(200, { configured: true, measured: false })
  if (!bee) return send(200, { configured: true, measured: true, bee: null })

  const prose = beeProseSent(
    (opts.keeperIds ?? keepers)().includes(String(who))
  )
  const { rows, next } = rowsShown(
    body.entries ?? [],
    bee.conversation,
    since,
    prose
  )
  send(200, {
    configured: true,
    measured: true,
    bee,
    reset: Boolean(following) && following !== bee.conversation,
    prose,
    rows,
    next,
  })
}
