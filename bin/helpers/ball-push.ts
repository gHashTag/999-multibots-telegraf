/*
 * tri ball push -- put the owner's open code work on the ball board.
 *
 * WHY. The board (specs/automation/ball-board.t27, host src/agent/ball-board.ts)
 * shows the CRM, the mailbox and the code work side by side, by client, with
 * whose move it is. The render holds no GitHub token, and should not: the
 * mail digest already showed the pattern -- the owner's machine reads, and
 * pushes a snapshot through the render's own door. This is that push.
 *
 * What travels: every open PR the owner authored, every open issue labelled
 * as a bug, and every open issue assigned to the owner, per repository, as
 * RAW facts (draft, labels, whether a review is asked of somebody else). The
 * ball is computed by the host at read time; the rule lives in the spec once.
 *
 * A push REPLACES its repositories' snapshot (SNAPSHOT_REPLACES). A list cut
 * at gh's limit would prune work that is still open, so a repository whose
 * list hits the limit is refused whole, never pushed in part.
 *
 * Usage: tri ball push [--dry] [owner/repo ...]
 *        tri ball show
 */
import { execFileSync } from 'node:child_process'

const BASE = 'https://vibee-render-production.up.railway.app'
const OWNER_TG = '144022504'
const REPOS = [
  'gHashTag/999-multibots-telegraf',
  'gHashTag/t27',
  'gHashTag/trinity',
]
const LIMIT = 1000

type Gh = Record<string, unknown>
export type WorkItem = {
  repo: string
  kind: 'pr' | 'issue'
  number: number
  title: string
  url: string | null
  author: string | null
  draft: boolean
  review_asked_of_others: boolean
  labels: string[]
  updated_at: string | null
}

function gh(args: string[]): Gh[] {
  const out = execFileSync('gh', args, {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
  return JSON.parse(out) as Gh[]
}

const labelsOf = (x: Gh): string[] =>
  ((x.labels as Array<{ name?: string }>) ?? []).map(l => String(l.name ?? ''))

/** gh's PR row -> the push's raw facts. A review asked of the owner is his. */
export function prItem(repo: string, p: Gh, me: string): WorkItem {
  const asked = (
    (p.reviewRequests as Array<{ login?: string; name?: string }>) ?? []
  )
    .map(r => String(r.login ?? r.name ?? ''))
    .filter(who => who && who.toLowerCase() !== me.toLowerCase())
  return {
    repo,
    kind: 'pr',
    number: Number(p.number),
    title: String(p.title ?? ''),
    url: (p.url as string) ?? null,
    author: ((p.author as { login?: string }) ?? {}).login ?? null,
    draft: Boolean(p.isDraft),
    review_asked_of_others: asked.length > 0,
    labels: labelsOf(p),
    updated_at: (p.updatedAt as string) ?? null,
  }
}

export function issueItem(repo: string, i: Gh): WorkItem {
  return {
    repo,
    kind: 'issue',
    number: Number(i.number),
    title: String(i.title ?? ''),
    url: (i.url as string) ?? null,
    author: ((i.author as { login?: string }) ?? {}).login ?? null,
    draft: false,
    review_asked_of_others: false,
    labels: labelsOf(i),
    updated_at: (i.updatedAt as string) ?? null,
  }
}

function collect(repo: string, me: string): WorkItem[] | string {
  const prs = gh([
    'pr',
    'list',
    '-R',
    repo,
    '--state',
    'open',
    '--author',
    '@me',
    '--limit',
    String(LIMIT),
    '--json',
    'number,title,url,author,isDraft,reviewRequests,labels,updatedAt',
  ])
  const fields = 'number,title,url,author,labels,updatedAt'
  const bugs = gh([
    'issue',
    'list',
    '-R',
    repo,
    '--state',
    'open',
    '--label',
    'bug',
    '--limit',
    String(LIMIT),
    '--json',
    fields,
  ])
  const mine = gh([
    'issue',
    'list',
    '-R',
    repo,
    '--state',
    'open',
    '--assignee',
    '@me',
    '--limit',
    String(LIMIT),
    '--json',
    fields,
  ])
  for (const [what, list] of [
    ['PRs', prs],
    ['bugs', bugs],
    ['assigned', mine],
  ] as const)
    if (list.length >= LIMIT)
      return `${what} hit the ${LIMIT} limit -- a cut list would prune open work`
  const seen = new Set<number>()
  const issues = [...bugs, ...mine].filter(i => {
    const n = Number(i.number)
    if (seen.has(n)) return false
    seen.add(n)
    return true
  })
  return [
    ...prs.map(p => prItem(repo, p, me)),
    ...issues.map(i => issueItem(repo, i)),
  ]
}

async function push(
  key: string,
  repos: string[],
  items: WorkItem[]
): Promise<unknown> {
  const r = await fetch(`${BASE}/mcp?telegram_id=${OWNER_TG}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Api-Key': key },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: 'ball_work_push', arguments: { repos, items } },
    }),
  })
  const body = (await r.json()) as {
    error?: { message?: string }
    result?: {
      isError?: boolean
      structuredContent?: unknown
      content?: Array<{ text?: string }>
    }
  }
  if (body?.error)
    throw new Error(`ball_work_push: ${body.error.message ?? 'error'}`)
  const res = body?.result
  if (!res || res.isError)
    throw new Error(
      `ball_work_push refused: ${res?.content?.[0]?.text ?? 'no result'}`
    )
  return (
    res.structuredContent ?? JSON.parse(String(res.content?.[0]?.text ?? '{}'))
  )
}

type Board = {
  total?: number
  counts?: Record<string, number>
  sources?: Record<string, { status?: string; age_h?: number; cards?: number }>
  clients?: Array<{
    key: string
    name: string
    ball: string
    cards: Array<{ source: string; title: string; days: number | null }>
  }>
  clients_total?: number
}

/** tri ball show: the board as the owner would read it, in the terminal. */
async function show(key: string): Promise<void> {
  const r = await fetch(`${BASE}/mcp?telegram_id=${OWNER_TG}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Api-Key': key },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: 'ball_board', arguments: {} },
    }),
  })
  const body = (await r.json()) as {
    error?: { message?: string }
    result?: {
      isError?: boolean
      structuredContent?: Board
      content?: Array<{ text?: string }>
    }
  }
  // An error is not an empty board.
  if (body?.error || !body?.result || body.result.isError)
    throw new Error(
      `ball_board: ${body?.error?.message ?? body?.result?.content?.[0]?.text ?? 'no result'}`
    )
  const b: Board =
    body.result.structuredContent ??
    JSON.parse(String(body.result.content?.[0]?.text ?? '{}'))
  for (const [src, st] of Object.entries(b.sources ?? {}))
    console.log(
      `  ${src.padEnd(7)} ${String(st.status ?? '?').padEnd(9)}` +
        `${st.age_h != null ? ` ${st.age_h} h old` : ''}${st.cards != null ? ` ${st.cards} card(s)` : ''}`
    )
  console.log(
    `  balls: ${JSON.stringify(b.counts ?? {})}, clients ${b.clients_total ?? 0}`
  )
  for (const c of (b.clients ?? []).slice(0, 25)) {
    const srcs = [...new Set(c.cards.map(x => x.source))].join('+')
    console.log(
      `  ${c.ball.padEnd(6)} ${(c.name || c.key).slice(0, 34).padEnd(34)} ${String(c.cards.length).padStart(3)}  ${srcs}`
    )
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  if (args[0] === 'show') {
    const key = process.env.RENDER_API_KEY || ''
    if (!key) {
      console.log('🛑 no render key -- nothing read')
      process.exit(2)
    }
    return show(key)
  }
  const dry = args.includes('--dry')
  const repos = args.filter(a => a.includes('/'))
  const targets = repos.length ? repos : REPOS
  const me = execFileSync('gh', ['api', 'user', '-q', '.login'], {
    encoding: 'utf8',
  }).trim()

  const okRepos: string[] = []
  const items: WorkItem[] = []
  for (const repo of targets) {
    const got = collect(repo, me)
    if (typeof got === 'string') {
      console.log(`  skip  ${repo}: ${got}`)
      continue
    }
    const prs = got.filter(i => i.kind === 'pr').length
    console.log(`  ok    ${repo}: ${prs} PR(s), ${got.length - prs} issue(s)`)
    okRepos.push(repo)
    items.push(...got)
  }
  if (!okRepos.length) {
    console.log('🛑 nothing to push')
    process.exit(2)
  }
  if (dry) {
    console.log(
      `dry: ${items.length} item(s) over ${okRepos.length} repo(s), nothing sent`
    )
    return
  }
  const key = process.env.RENDER_API_KEY || ''
  if (!key) {
    console.log('🛑 no render key -- nothing sent')
    process.exit(2)
  }
  const res = await push(key, okRepos, items)
  console.log(JSON.stringify(res))
}

if (process.argv[1]?.endsWith('ball-push.ts'))
  main().catch(e => {
    console.error(`🛑 ${e instanceof Error ? e.message : String(e)}`)
    process.exit(1)
  })
