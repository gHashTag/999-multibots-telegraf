/**
 * IGLA: THE IGLA-CODER LOOP, WATCHED BY THE QUEEN EVERY HOUR.
 *
 * Owner, 2026-10-04: every experiment of gHashTag/igla-coder-gpu runs on
 * Railway, and its monitoring, its automatic improvement and its reports go
 * through the Queen. Owner, 2026-10-03: no new service -- extend the Queen.
 * So this is not a service: watch.mjs runs it after both of its watches (the
 * relays, then the page), on the same hourly cron, and nothing here changes
 * their exit code.
 *
 * ONE HOME FOR EVERY NUMBER: igla-coder-gpu `scripts/queen_igla.py`. Its
 * board_block() rides the igla board's public snapshot as `queen` (limits,
 * the last journal commit, the open todo); this file reads them there and
 * carries no threshold of its own. A board whose block lacks a limit this
 * file reads is not measured (exit 2, the missing keys by name): a renamed
 * key must not switch a check off. The codes are queen_igla.py's -- OVERRUN,
 * LOWBAL, SPEND, STALE -- plus what only a live watcher sees:
 *   REPO     an anomaly line the loop published itself (`tri tc-loop` status)
 *   JUDGEUP  a judge deployment of the igla-judge Railway project up longer
 *            than judge_max_h: a job nobody fetched and downed bills hourly
 *   BILLING  the last igla-loop.yml run failed before any job took a step:
 *            GitHub refused to start it (the account's payment)
 *   BOARD    the board names another repo or workflow than this file
 *   DISPATCH GitHub refused the tick (IGLA_GITHUB_TOKEN lacks Actions write)
 * What it cannot measure it says by name: unmeasured is not ok.
 *
 * THE TICK -- the automatic improvement. Every tick_h, when no igla-loop.yml
 * run is queued or running, it workflow-dispatches igla-loop.yml on `main`.
 * The workflow's own monitor (`queen_igla.py decide`) then decides whether an
 * agent iteration runs: no pod up, balance above the floor, a Claude token,
 * work to do. A run GitHub refused for billing is retried every
 * billing_retry_h, not every tick. The repo and the workflow are THIS file's
 * constants (no variable moves them), never the
 * board's: the board is public, and a forged one must not be able to point a
 * token at another repository. Only IGLA_GITHUB_TOKEN dispatches.
 *
 * Reports: POST /queen/report as source `igla-loop` on the first run, when the
 * state changes, on a dispatch, and every REPEAT_S while something needs the
 * owner; the owner's DM only on the first run and when the set of anomaly
 * codes changes (what is not measured goes to the Queen, not the phone). A
 * board that does not answer is reported on the first and the third run in a
 * row, DMed on the third, then reported every REPEAT_S. The previous run
 * lives in STATE_DIR/igla.json. Exit code (logged only): 0 ok, 1 an anomaly,
 * 2 the board not measured.
 *
 * Variables -- all optional, the owner sets each one, none is ever printed
 * (watch.mjs secretsOf() scrubs every output line and request body):
 *   IGLA                 '0' turns this off
 *   IGLA_DISPATCH        '0' watches without the tick
 *   IGLA_BOARD_URL       another board, for a test (default: IGLA_BOARD)
 *   RUNPOD_API_KEY       pods and balance; without it they are not measured
 *   IGLA_GITHUB_TOKEN    fine-grained, gHashTag/igla-coder-gpu only, Actions
 *                        read+write: the tick and the billing check. Without
 *                        it GITHUB_TOKEN is tried for reading (it does not
 *                        reach this private repo: 404, said so)
 *   IGLA_RAILWAY_TOKEN   an igla-judge project token, for JUDGEUP
 */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import {
  call,
  railway,
  redact,
  reportToQueen,
  secretsOf,
  tellOwner,
} from './watch.mjs'

export const IGLA_BOARD = 'https://board-production-2dec.up.railway.app'
export const IGLA_REPO = 'gHashTag/igla-coder-gpu'
export const IGLA_WORKFLOW = 'igla-loop.yml'
const IGLA_REF = 'main'
const SOURCE = 'igla-loop'
const RUNPOD_GQL = 'https://api.runpod.io/graphql'
const RUNPOD_REST = 'https://rest.runpod.io/v1'
const GITHUB_API = 'https://api.github.com'
/* Cloudflare in front of RunPod answers 1010 to an empty or default agent. */
const UA = 'queen-watch-igla'
const LIVE = ['queued', 'in_progress', 'waiting', 'requested', 'pending']
/* What this file reads from the board's queen block; queen_igla.py owns it. */
export const NEED_LIMITS = [
  'pod_max_h',
  'min_balance',
  'spend_slack',
  'stale_h',
  'tick_h',
  'judge_max_h',
  'billing_retry_h',
]
export const NEED_STRINGS = ['repo', 'workflow', 'judge_service']

const parse = text => {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}
const hours = (nowS, iso) => {
  const t = Date.parse(iso || '')
  return Number.isNaN(t) ? null : (nowS - t / 1000) / 3600
}

// --- facts ----------------------------------------------------------------

const boardUrl = cfg => cfg.iglaBoard || IGLA_BOARD

/**
 * The board's snapshot and its `queen` block (queen_igla.board_block), or an
 * error naming every key this file reads that the block lacks.
 */
export async function readBoard(cfg, deps) {
  const r = await call(cfg, deps, `${boardUrl(cfg)}/state`, {
    headers: { 'user-agent': UA },
  })
  if (r.status !== 200)
    return { error: `the igla board did not answer (HTTP ${r.status})` }
  const snap = parse(r.text)?.snapshot
  const q = snap?.queen
  if (!q || typeof q !== 'object')
    return {
      error:
        'the igla board has no queen block (igla-coder-gpu scripts/queen_igla.py board_block)',
    }
  const missing = [
    ...NEED_STRINGS.filter(k => typeof q[k] !== 'string' || !q[k]),
    ...NEED_LIMITS.filter(k => !Number.isFinite(q.limits?.[k])).map(
      k => `limits.${k}`
    ),
  ]
  if (missing.length)
    return {
      error: `the igla board's queen block lacks ${missing.join(', ')} (igla-coder-gpu scripts/queen_igla.py board_block): no check runs on a guessed limit`,
    }
  return { snap, q }
}

/** RunPod's '2026-10-03 09:38:07.331 +0000 UTC' -> epoch seconds. */
export function runpodTime(s) {
  const m = /^(\d{4}-\d\d-\d\d) (\d\d:\d\d:\d\d)/.exec(s || '')
  const t = m ? Date.parse(`${m[1]}T${m[2]}Z`) : NaN
  return Number.isNaN(t) ? null : t / 1000
}

async function runpod(cfg, deps, nowS) {
  if (!cfg.runpodKey) return null
  const headers = {
    authorization: `Bearer ${cfg.runpodKey}`,
    'content-type': 'application/json',
    'user-agent': UA,
  }
  const b = await call(cfg, deps, RUNPOD_GQL, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      query: '{ myself { clientBalance currentSpendPerHr } }',
    }),
  })
  const p = await call(cfg, deps, `${RUNPOD_REST}/pods`, { headers })
  const me = parse(b.text)?.data?.myself
  const pods = parse(p.text)
  if (b.status !== 200 || !me || p.status !== 200 || !Array.isArray(pods)) {
    return {
      error: `RunPod did not answer (balance HTTP ${b.status}, pods HTTP ${p.status})`,
    }
  }
  const running = pods
    .filter(x => x.desiredStatus === 'RUNNING')
    .map(x => {
      const t = runpodTime(x.lastStartedAt)
      return {
        name: x.name || '?',
        h: t === null ? null : (nowS - t) / 3600,
        cost: Number(x.costPerHr) || 0,
      }
    })
  return {
    balance: Number(me.clientBalance),
    spend: Number(me.currentSpendPerHr),
    running,
  }
}

const PROJECT = `query { projectToken { projectId environmentId } }`
const SERVICES = `query($id: String!) {
  project(id: $id) { services { edges { node { id name } } } }
}`
const DEPLOYS = `query($input: DeploymentListInput!) {
  deployments(first: 20, input: $input) { edges { node { id status createdAt } } }
}`

/** The igla-judge `judge` deployments that are up (SUCCESS), with ages. */
async function judge(cfg, deps, q, nowS) {
  if (!cfg.iglaRailwayToken) return null
  const c = { ...cfg, railwayToken: cfg.iglaRailwayToken }
  try {
    const t = (await railway(c, deps, PROJECT, {})).projectToken
    if (!t?.projectId)
      return { error: 'IGLA_RAILWAY_TOKEN is not a project token' }
    const svc = (
      await railway(c, deps, SERVICES, { id: t.projectId })
    ).project?.services?.edges
      ?.map(e => e.node)
      .find(s => s.name === q.judge_service)
    if (!svc) return { error: `no service "${q.judge_service}" in igla-judge` }
    const rows = (
      await railway(c, deps, DEPLOYS, {
        input: { serviceId: svc.id, environmentId: t.environmentId },
      })
    ).deployments?.edges?.map(e => e.node)
    return {
      up: (rows || [])
        .filter(d => d.status === 'SUCCESS')
        .map(d => ({ id: d.id, h: hours(nowS, d.createdAt) ?? 0 })),
    }
  } catch (e) {
    return {
      error: `Railway judge not read (${String(e.message).slice(0, 120)})`,
    }
  }
}

async function github(cfg, deps, token, path, init = {}) {
  const r = await call(cfg, deps, `${GITHUB_API}${path}`, {
    ...init,
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      'user-agent': UA,
    },
  })
  return { status: r.status, body: parse(r.text) }
}

/** The last igla-loop.yml run, and whether GitHub refused to start it. */
async function lastRun(cfg, deps) {
  const token = cfg.iglaGhToken || cfg.ghToken
  if (!token)
    return { error: 'no GitHub token: igla-loop.yml not read, no tick' }
  const base = `/repos/${IGLA_REPO}/actions`
  const r = await github(
    cfg,
    deps,
    token,
    `${base}/workflows/${IGLA_WORKFLOW}/runs?per_page=1`
  )
  if (r.status !== 200 || !Array.isArray(r.body?.workflow_runs)) {
    return {
      error: `${IGLA_WORKFLOW} not readable (HTTP ${r.status}): ${cfg.iglaGhToken ? 'IGLA_GITHUB_TOKEN' : 'GITHUB_TOKEN'} does not reach ${IGLA_REPO} -- no tick, no billing check`,
    }
  }
  const last = r.body.workflow_runs[0] || null
  let billing = false
  if (last && last.status === 'completed' && last.conclusion === 'failure') {
    const j = await github(cfg, deps, token, `${base}/runs/${last.id}/jobs`)
    const jobs = j.body?.jobs
    billing =
      j.status === 200 &&
      Array.isArray(jobs) &&
      jobs.length > 0 &&
      jobs.every(x => !(x.steps || []).length)
  }
  return { last, billing }
}

// --- rules ----------------------------------------------------------------

/**
 * queen_igla.assess() over the facts a watcher has. Returns
 * { anom: [line], blind: [line], jh }: an anomaly line starts with its code;
 * a blind line names what was not measured and why.
 */
export function assess({ q, snap, pods, judgeUp, run, nowS }) {
  const L = q.limits
  const anom = []
  const blind = []
  if (pods && !pods.error) {
    for (const p of pods.running)
      if (p.h !== null && p.h > L.pod_max_h)
        anom.push(
          `OVERRUN ${p.name} running ${p.h.toFixed(1)} h > ${L.pod_max_h} h`
        )
    if (pods.balance < L.min_balance)
      anom.push(
        `LOWBAL $${pods.balance.toFixed(2)} < $${L.min_balance}: no new spend`
      )
    const cost = pods.running.reduce((s, p) => s + p.cost, 0)
    if (pods.spend > cost + L.spend_slack)
      anom.push(
        `SPEND $${pods.spend.toFixed(2)}/h > running pods $${cost.toFixed(2)}/h`
      )
  } else {
    blind.push(
      pods?.error || 'pods and balance: no RUNPOD_API_KEY on queen-watch'
    )
  }
  if (judgeUp && !judgeUp.error) {
    for (const d of judgeUp.up)
      if (d.h > L.judge_max_h)
        anom.push(
          `JUDGEUP igla-judge judge deployment up ${d.h.toFixed(1)} h > ${L.judge_max_h} h: fetch, then tri tc-remote down`
        )
  } else {
    blind.push(
      judgeUp?.error || 'Railway judge: no IGLA_RAILWAY_TOKEN on queen-watch'
    )
  }
  /* queen_igla: STALE only while idle. A live judge job is work too. */
  const busy = (pods?.running?.length || 0) + (judgeUp?.up?.length || 0) > 0
  const jh = hours(nowS, q.journal_at)
  if (!busy && jh !== null && jh > L.stale_h)
    anom.push(`STALE no journal commit for ${jh.toFixed(0)} h`)
  for (const a of snap.today?.anomalies || [])
    anom.push(`REPO ${String(a).slice(0, 160)}`)
  if (q.repo !== IGLA_REPO || q.workflow !== IGLA_WORKFLOW)
    anom.push(
      `BOARD the board names ${q.repo}/${q.workflow}, this watch ${IGLA_REPO}/${IGLA_WORKFLOW}: no tick`
    )
  if (run?.billing)
    anom.push(
      `BILLING ${IGLA_WORKFLOW} run ${run.last.id} failed before any job took a step: GitHub Actions billing on the account`
    )
  if (!run || run.error) blind.push(run?.error || 'igla-loop.yml: not read')
  return { anom, blind, jh }
}

/**
 * Dispatch now? Never while a run is live; tick_h apart, billing_retry_h
 * after GitHub refused a run for billing.
 */
export function dueTick({ q, run, cfg, nowS, st, anom }) {
  if (!cfg.iglaDispatch || !cfg.iglaGhToken || !run || run.error) return false
  if (anom.some(a => a.startsWith('BOARD'))) return false
  const last = run.last
  if (last && LIVE.includes(last.status)) return false
  const every =
    (run.billing ? q.limits.billing_retry_h : q.limits.tick_h) * 3600
  const lastS = Math.max(
    last ? Date.parse(last.created_at) / 1000 || 0 : 0,
    st.dispatched_at || 0
  )
  return nowS - lastS >= every
}

/* The state key: what changed, not by how much (hours and dollars drift). */
const keyOf = (anom, blind) =>
  JSON.stringify(
    [...anom, ...blind].map(l => l.replace(/[\d.$]+/g, '#')).sort()
  )
/* The DM key is the anomaly codes alone (st.codes): a blind line is no news. */
const UNMEASURED = 'UNMEASURED'

// --- state ----------------------------------------------------------------

export async function loadIgla(dir) {
  try {
    return {
      first: false,
      ...JSON.parse(await readFile(join(dir, 'igla.json'), 'utf8')),
    }
  } catch {
    return {
      first: true,
      key: '',
      codes: '',
      told_at: 0,
      dispatched_at: 0,
      unmeasured: 0,
    }
  }
}

async function saveIgla(dir, st) {
  const { first, ...keep } = st
  await mkdir(dir, { recursive: true })
  const tmp = join(dir, 'igla.json.tmp')
  await writeFile(tmp, JSON.stringify(keep, null, 2))
  await rename(tmp, join(dir, 'igla.json'))
}

// --- the watch --------------------------------------------------------------

export async function runIgla(cfg, deps) {
  const log = line => deps.write(redact(line, secretsOf(cfg)) + '\n')
  if (!cfg.iglaOn) {
    log('igla-loop: off (IGLA=0)')
    return 0
  }
  const st = await loadIgla(cfg.stateDir)
  const nowS = deps.now()
  const when = new Date(nowS * 1000).toISOString().replace(/\.\d+Z$/, 'Z')
  const persist = async () => {
    try {
      await saveIgla(cfg.stateDir, st)
    } catch (e) {
      log(`igla-loop: could not save state (${e && e.code})`)
    }
  }
  const board = await readBoard(cfg, deps)
  if (board.error) {
    st.unmeasured = (st.unmeasured || 0) + 1
    log(`igla-loop: not measured (${st.unmeasured} in a row): ${board.error}`)
    if (
      st.first ||
      st.unmeasured === 3 ||
      (st.unmeasured > 3 && nowS - (st.told_at || 0) >= cfg.repeatS)
    ) {
      log(
        `igla-loop: queen: ${await reportToQueen(cfg, deps, {
          source: SOURCE,
          headline: `the igla loop could not be measured (${st.unmeasured} run(s) in a row)`,
          body: `${board.error}\nboard: ${boardUrl(cfg)}`,
          needsYou: true,
        })}`
      )
      st.told_at = nowS
      /* Reported: the run that measures again is a change, and says so. */
      st.key = UNMEASURED
    }
    if (st.unmeasured === 3) {
      log(
        `igla-loop: telegram: ${await tellOwner(
          cfg,
          deps,
          `⚠️ Цикл IGLA не измерен 3 часа подряд: ${board.error}` // cyrillic-ok
        )}`
      )
      st.codes = UNMEASURED
    }
    st.first = false
    await persist()
    return 2
  }
  st.unmeasured = 0
  const { snap, q } = board
  const pods = await runpod(cfg, deps, nowS)
  const judgeUp = await judge(cfg, deps, q, nowS)
  const run = await lastRun(cfg, deps)
  const { anom, blind, jh } = assess({ q, snap, pods, judgeUp, run, nowS })

  let tick = !cfg.iglaDispatch
    ? 'off (IGLA_DISPATCH=0)'
    : !cfg.iglaGhToken
      ? 'none: no IGLA_GITHUB_TOKEN on queen-watch'
      : 'not due'
  let dispatched = false
  if (dueTick({ q, run, cfg, nowS, st, anom })) {
    const d = await github(
      cfg,
      deps,
      cfg.iglaGhToken,
      `/repos/${IGLA_REPO}/actions/workflows/${IGLA_WORKFLOW}/dispatches`,
      { method: 'POST', body: JSON.stringify({ ref: IGLA_REF }) }
    )
    dispatched = d.status === 204
    if (dispatched) st.dispatched_at = nowS
    tick = dispatched
      ? `dispatched ${IGLA_WORKFLOW} on ${IGLA_REF}`
      : `dispatch refused (HTTP ${d.status})`
    /* Retried every run; reported every REPEAT_S until the token is fixed. */
    if (!dispatched)
      anom.push(
        `DISPATCH ${IGLA_WORKFLOW} refused (HTTP ${d.status}): IGLA_GITHUB_TOKEN needs Actions read+write on ${IGLA_REPO}`
      )
  } else if (run?.last && tick === 'not due') {
    const h = hours(nowS, run.last.created_at)
    tick = `not due (last run ${run.last.status}/${run.last.conclusion || '-'}, ${h === null ? '?' : h.toFixed(1)} h ago${run.billing ? ', billing: daily retry' : ''})`
  }

  const fmt = n => (n === null || n === undefined ? '?' : n.toFixed(1))
  const facts = [
    `- last loop: ${q.last_loop || '?'} (journal commit ${fmt(jh)} h ago)`,
    pods && !pods.error
      ? `- RunPod: $${pods.balance.toFixed(2)}, spend $${pods.spend.toFixed(2)}/h, running: ${pods.running.map(p => `${p.name} ${fmt(p.h)} h`).join(', ') || 'none'}`
      : null,
    judgeUp && !judgeUp.error
      ? `- Railway judge: ${judgeUp.up.length ? judgeUp.up.map(d => `up ${fmt(d.h)} h`).join(', ') : 'down'}`
      : null,
    `- tick: ${tick}`,
    `- HEAD: ${q.head || '?'}`,
    `- board/next.md: ${q.todo_open ?? '?'} open`,
    ...(q.todo || []).map(t => `  - ${t}`),
    `- board: ${boardUrl(cfg)} (snapshot ${snap.generated_at || '?'})`,
  ].filter(Boolean)
  const body = [
    `igla-coder-gpu loop, watched by queen-watch at ${when}`,
    `Anomalies:${anom.length ? '' : ' none'}`,
    ...anom.map(a => `- ${a}`),
    `Not measured:${blind.length ? '' : ' nothing'}`,
    ...blind.map(b => `- ${b}`),
    ...facts,
  ].join('\n')
  for (const line of body.split('\n').slice(1)) log(`  ${line}`)

  const codes = [...new Set(anom.map(a => a.split(' ')[0]))]
  const needsYou = anom.length > 0 || blind.length > 0
  const key = keyOf(anom, blind)
  const changed = key !== st.key
  const codesKey = codes.join(',')
  if (
    st.first ||
    changed ||
    dispatched ||
    (needsYou && nowS - (st.told_at || 0) >= cfg.repeatS)
  ) {
    const headline = codes.length
      ? `igla loop: ${codes.join(', ')} -- ${q.last_loop || '?'}`
      : `igla loop: ok${blind.length ? `, ${blind.length} not measured` : ''} -- ${q.last_loop || '?'}`
    log(
      `igla-loop: queen: ${await reportToQueen(cfg, deps, { source: SOURCE, headline, body, needsYou })}`
    )
    st.told_at = nowS
    if (st.first || codesKey !== (st.codes || '')) {
      const tg = [
        st.first
          ? '👁 Королева теперь каждый час следит за циклом IGLA-Coder (igla-coder-gpu) с Railway.' // cyrillic-ok
          : codes.length
            ? `⚠️ Цикл IGLA: ${codes.join(', ')}.` // cyrillic-ok
            : '✅ Цикл IGLA: аномалий нет.', // cyrillic-ok
        ...anom.map(a => `- ${a}`),
        blind.length
          ? `Не измеряю (${blind.length}): нужны переменные владельца на queen-watch, список в отчёте королевы.` // cyrillic-ok
          : null,
        `Последний цикл: ${q.last_loop || '?'}. Тик: ${tick}.`, // cyrillic-ok
      ]
        .filter(Boolean)
        .join('\n')
      log(`igla-loop: telegram: ${await tellOwner(cfg, deps, tg)}`)
    }
  } else {
    log('igla-loop: unchanged, already reported -- quiet until REPEAT_S')
  }
  st.key = key
  st.codes = codesKey
  st.first = false
  await persist()
  log(`igla-loop: ${anom.length ? `anomalies: ${codes.join(', ')}` : 'ok'}`)
  return anom.length ? 1 : 0
}
