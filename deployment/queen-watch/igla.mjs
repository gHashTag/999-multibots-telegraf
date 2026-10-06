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
 * carries no threshold of its own. A board whose block lacks a key this
 * file reads is not measured (exit 2, the missing keys by name): a renamed
 * key must not switch a check off. The codes are queen_igla.py's -- OVERRUN,
 * LOWBAL, SPEND, STALE -- plus what only a live watcher sees:
 *   REPO     an anomaly line the loop published itself (`tri tc-loop` status)
 *   JUDGEUP  a judge deployment of the igla-judge Railway project live longer
 *            than judge_max_h: a job nobody fetched and downed bills hourly
 *   LOOPUP   the newest deployment of service loop live longer than
 *            loop_max_h (queen_igla.py ITERATE_MAX_H, the run's own timer),
 *            counted from the deployment's createdAt: a run that outlived
 *            its limit, and no tick goes out while it lives
 *   BOARD    the board names another repo, executor, runner service or
 *            judge service than this file
 *   TRIGGER  the tick did not go out: Railway refused the redeploy (an auth
 *            answer or a GraphQL error), answered otherwise, or did not answer
 * What it cannot measure it says by name: unmeasured is not ok.
 *
 * THE TICK -- the automatic improvement. GitHub Actions refuses the private
 * repo's jobs on billing (every igla-loop run, from its first on 2026-10-03),
 * so the loop runs on Railway:
 * service `loop` in project igla-judge, one run per deployment (restart
 * policy NEVER; the run clones main, `queen_igla.py iterate` decides, then at
 * most one agent iteration). Every tick_h this file redeploys it
 * (serviceInstanceRedeploy, header Project-Access-Token: the same call as
 * `tri tc-queen kick`), and only when all of these hold:
 *   - the newest loop deployment has exited (Railway's own status: building,
 *     DEPLOYING or SUCCESS with deploymentStopped=false is live). Never while
 *     it is live, never while its status is one nobody measured, never when
 *     the service cannot be read, never before its first deployment;
 *   - nothing else is busy, as kick reads it: no RunPod pod RUNNING and no
 *     judge deployment live, both measured (unread = held, never a guess;
 *     an answer without the list it was asked for is unread, not empty; the
 *     board's queen block carries no busy key, so this is computed here);
 *   - the board names this file's repo, executor, runner and judge service.
 * The project, environment and services are THIS file's constants (no
 * variable moves them, and the token only ever goes to RAILWAY_API), never
 * the board's: the board is public, and a forged one must not be able to
 * point a token at another service. Only IGLA_RAILWAY_TOKEN redeploys, and
 * only after Railway confirmed it is a token of that project and environment.
 * A live run is timed by the board's loop_max_h (LOOPUP above); this file
 * never stops it, it says so.
 *
 * Reports: POST /queen/report as source `igla-loop` on the first run, when the
 * state changes, on a redeploy, and every REPEAT_S while something needs the
 * owner; the owner's DM only on the first run and when the set of anomaly
 * codes changes (what is not measured goes to the Queen, not the phone). A
 * board that does not answer is reported on this file's very first run, then
 * on the third failing run in a row (DMed then), then every REPEAT_S; the
 * run that reads it again reports the recovery. The previous run
 * lives in STATE_DIR/igla.json. Exit code (logged only): 0 ok, 1 an anomaly,
 * 2 the board not measured.
 *
 * Variables -- all optional, the owner sets each one, none is ever printed
 * (watch.mjs secretsOf() scrubs every output line and request body):
 *   IGLA                 '0' turns this off
 *   IGLA_TRIGGER         '0' watches without the tick
 *   IGLA_BOARD_URL       another board, for a test (default: IGLA_BOARD)
 *   RUNPOD_API_KEY       pods and balance; without it they are not measured
 *                        (and the tick is held: busy is unknown)
 *   IGLA_RAILWAY_TOKEN   a project token of igla-judge production: JUDGEUP,
 *                        the loop runner's state, and the tick (its only write)
 *   IGLA_GITHUB_TOKEN    retired with the GitHub tick: nothing reads or sends
 *                        it; still scrubbed, in case it is left set
 */

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import {
  RAILWAY_API,
  call,
  railway,
  redact,
  reportToQueen,
  secretsOf,
  tellOwner,
} from './watch.mjs'

export const IGLA_BOARD = 'https://board-production-2dec.up.railway.app'
export const IGLA_REPO = 'gHashTag/igla-coder-gpu'
/* The executor the board must name (queen_igla.py board_block `executor`). */
export const EXECUTOR = 'railway'
/* Railway service `loop` in project igla-judge, production: measured on the
 * service by the igla side on 2026-10-04 (queen_igla.py IJ_PROJECT,
 * IJ_ENV, LOOP_ID). Only a commit moves them. */
export const LOOP_PROJECT = '1a315000-9f97-4a99-95a1-4665a37ff056'
export const LOOP_ENVIRONMENT = 'c353906c-703e-4171-ba92-5f4b361ea32d'
export const LOOP_SERVICE_ID = '21039821-9e70-4f46-a6c1-38021e67729c'
export const LOOP_SERVICE = 'loop'
/* The service whose live deployments are judge jobs (busy, JUDGEUP); the
 * board's judge_service must say the same (BOARD), it never picks it. */
export const JUDGE_SERVICE = 'judge'
const SOURCE = 'igla-loop'
const RUNPOD_GQL = 'https://api.runpod.io/graphql'
const RUNPOD_REST = 'https://rest.runpod.io/v1'
/* Cloudflare in front of RunPod answers 1010 to an empty or default agent. */
const UA = 'queen-watch-igla'
/* Railway deployment statuses, measured on service loop 2026-10-04 (the
 * contract of igla-coder-gpu#38). Live, as queen_igla.py dep_live reads it:
 * a status before the process ends (these say deploymentStopped=true, so the
 * status decides; QUEUED, WAITING and NEEDS_APPROVAL were never seen, kept
 * because dep_live keeps them), or SUCCESS while deploymentStopped is not
 * true. Exited: SUCCESS with deploymentStopped=true (exit 0), CRASHED (exit
 * non-0, restart policy NEVER). Any other status was never measured. */
const PENDING = [
  'INITIALIZING',
  'QUEUED',
  'WAITING',
  'BUILDING',
  'DEPLOYING',
  'NEEDS_APPROVAL',
]
/* What this file reads from the board's queen block; queen_igla.py owns it. */
export const NEED_LIMITS = [
  'pod_max_h',
  'min_balance',
  'spend_slack',
  'stale_h',
  'tick_h',
  'judge_max_h',
  'loop_max_h',
]
export const NEED_STRINGS = [
  'repo',
  'judge_service',
  'executor',
  'runner_service',
]

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
 * The board's snapshot, its `queen` block (queen_igla.board_block) and its
 * live map, or an error naming every key this file reads that the block
 * lacks.
 */
export async function readBoard(cfg, deps) {
  const r = await call(cfg, deps, `${boardUrl(cfg)}/state`, {
    headers: { 'user-agent': UA },
  })
  if (r.status !== 200)
    return { error: `the igla board did not answer (HTTP ${r.status})` }
  const state = parse(r.text)
  const snap = state?.snapshot
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
  return { snap, q, live: state.live || {} }
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
  const balance = money(me.clientBalance)
  const spend = money(me.currentSpendPerHr)
  /* Pods stay measured when the money is not: OVERRUN and "busy" need no
   * balance. Only LOWBAL and SPEND go blind. */
  if (balance === null || spend === null)
    return {
      balance: null,
      spend: null,
      running,
      money: 'RunPod answered without a numeric balance or spend',
    }
  return { balance, spend, running }
}

/* null, '' and true all turn into a number under Number() and would pass
 * LOWBAL silently; anything but a finite number or numeric string is null. */
function money(v) {
  const ok = typeof v === 'number' || (typeof v === 'string' && v.trim())
  const n = ok ? Number(v) : NaN
  return Number.isFinite(n) ? n : null
}

const PROJECT = `query { projectToken { projectId environmentId } }`
const SERVICES = `query($id: String!) {
  project(id: $id) { services { edges { node { id name } } } }
}`
const DEPLOYS = `query($input: DeploymentListInput!) {
  deployments(first: 20, input: $input) {
    edges { node { id status createdAt deploymentStopped } }
  }
}`
const REDEPLOY = `mutation($environmentId: String!, $serviceId: String!) {
  serviceInstanceRedeploy(environmentId: $environmentId, serviceId: $serviceId)
}`

/** Live as queen_igla.py dep_live: building, or SUCCESS not stopped. */
export const isLive = d =>
  PENDING.includes(d.status) ||
  (d.status === 'SUCCESS' && d.deploymentStopped !== true)

/**
 * Where a loop deployment is: 'building' and 'running' are live, 'exited ok'
 * and 'exited failed' are not, null is a status nobody measured (no tick).
 */
export function runState(d) {
  if (PENDING.includes(d.status)) return 'building'
  if (d.status === 'SUCCESS')
    return d.deploymentStopped === true ? 'exited ok' : 'running'
  if (d.status === 'CRASHED') return 'exited failed'
  return null
}
const exited = s => s === 'exited ok' || s === 'exited failed'

/**
 * igla-judge through IGLA_RAILWAY_TOKEN: the live deployments of service
 * JUDGE_SERVICE (with ages) and the newest loop deployment. The token goes to
 * RAILWAY_API only, and nothing is read before Railway says it is a token of
 * LOOP_PROJECT / LOOP_ENVIRONMENT. Each side is { error } unless its list was
 * in the answer.
 */
async function railwayFacts(cfg, deps, nowS) {
  if (!cfg.iglaRailwayToken) return { judgeUp: null, loop: null }
  const c = {
    ...cfg,
    railwayToken: cfg.iglaRailwayToken,
    railwayApi: RAILWAY_API,
  }
  const both = error => ({ judgeUp: { error }, loop: { error } })
  /* A 200 answer without the asked-for list (data null, the field null or
   * missing, an edge without a node) is NOT READ, never an empty list: an
   * empty judge list would read as "judge down, not busy" and tick. */
  const listOf = (data, path) => {
    const edges = path.reduce((o, k) => o?.[k], data)?.edges
    if (!Array.isArray(edges) || !edges.every(e => e?.node?.id))
      throw new Error(`Railway answered without ${path.join('.')}.edges`)
    return edges.map(e => e.node)
  }
  const rows = async serviceId =>
    listOf(
      await railway(c, deps, DEPLOYS, {
        input: {
          projectId: LOOP_PROJECT,
          environmentId: LOOP_ENVIRONMENT,
          serviceId,
        },
      }),
      ['deployments']
    ).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
  let services
  try {
    const t = (await railway(c, deps, PROJECT, {})).projectToken
    if (t?.projectId !== LOOP_PROJECT || t?.environmentId !== LOOP_ENVIRONMENT)
      return both(
        'IGLA_RAILWAY_TOKEN is not a project token of igla-judge production: Railway not read, no tick'
      )
    services = listOf(await railway(c, deps, SERVICES, { id: LOOP_PROJECT }), [
      'project',
      'services',
    ])
  } catch (e) {
    return both(
      `Railway igla-judge not read (${String(e.message).slice(0, 120)})`
    )
  }
  const out = {}
  const judgeSvc = services.find(s => s.name === JUDGE_SERVICE)
  if (!judgeSvc)
    out.judgeUp = { error: `no service "${JUDGE_SERVICE}" in igla-judge` }
  else
    try {
      out.judgeUp = {
        up: (await rows(judgeSvc.id))
          .filter(isLive)
          .map(d => ({ id: d.id, h: hours(nowS, d.createdAt) ?? 0 })),
      }
    } catch (e) {
      out.judgeUp = {
        error: `Railway judge not read (${String(e.message).slice(0, 120)})`,
      }
    }
  const loopSvc = services.find(s => s.id === LOOP_SERVICE_ID)
  if (!loopSvc || loopSvc.name !== LOOP_SERVICE)
    out.loop = {
      error: `no service "${LOOP_SERVICE}" (${LOOP_SERVICE_ID}) in igla-judge: renamed or re-created? only a commit moves igla.mjs LOOP_* -- no tick`,
    }
  else
    try {
      const d = (await rows(LOOP_SERVICE_ID))[0]
      out.loop = {
        last: d
          ? {
              id: d.id,
              status: d.status,
              state: runState(d),
              live: !exited(runState(d)),
              createdAt: d.createdAt,
              h: hours(nowS, d.createdAt),
            }
          : null,
      }
    } catch (e) {
      out.loop = {
        error: `Railway loop not read (${String(e.message).slice(0, 120)}): no tick`,
      }
    }
  return out
}

/** The one write: a new deployment of service loop (tri tc-queen kick). */
async function redeploy(cfg, deps) {
  const r = await call(
    cfg,
    deps,
    RAILWAY_API,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'user-agent': UA,
        'project-access-token': cfg.iglaRailwayToken,
      },
      body: JSON.stringify({
        query: REDEPLOY,
        variables: {
          environmentId: LOOP_ENVIRONMENT,
          serviceId: LOOP_SERVICE_ID,
        },
      }),
    },
    20000
  )
  const body = parse(r.text)
  const said = body?.errors?.[0]?.message || ''
  const ok =
    r.status === 200 && !said && body?.data?.serviceInstanceRedeploy === true
  return { ok, status: r.status, said, error: r.error }
}

/* Why a redeploy did not go out. Only an auth answer blames the token. */
function refusal(d) {
  const what = `TRIGGER ${LOOP_SERVICE} redeploy`
  const token = `IGLA_RAILWAY_TOKEN needs to deploy service ${LOOP_SERVICE} in igla-judge production`
  if (d.status === 0)
    return `${what} not sent: Railway did not answer (${d.error || 'Error'})`
  if (d.status === 401 || d.status === 403)
    return `${what} refused (HTTP ${d.status}): ${token}`
  if (d.status !== 200)
    return `${what} not accepted: Railway answered HTTP ${d.status}`
  if (/not authorized|unauthorized|forbidden|invalid token/i.test(d.said))
    return `${what} refused (${d.said.slice(0, 120)}): ${token}`
  if (d.said)
    return `${what} not accepted: Railway said ${d.said.slice(0, 160)}`
  return `${what} not accepted: Railway answered without serviceInstanceRedeploy=true`
}

// --- rules ----------------------------------------------------------------

/**
 * queen_igla.assess() over the facts a watcher has. Returns
 * { anom: [line], blind: [line], jh, busy }: an anomaly line starts with its
 * code; a blind line names what was not measured and why. busy is what the
 * tick reads, as `queen_igla.py kick` does: 'true' (a pod runs or a judge is
 * live), 'unknown' (either unread), 'false'.
 */
export function assess({ q, snap, pods, judgeUp, loop, nowS }) {
  const L = q.limits
  const anom = []
  const blind = []
  if (pods && !pods.error) {
    for (const p of pods.running)
      if (p.h !== null && p.h > L.pod_max_h)
        anom.push(
          `OVERRUN ${p.name} running ${p.h.toFixed(1)} h > ${L.pod_max_h} h`
        )
    const cost = pods.running.reduce((s, p) => s + p.cost, 0)
    if (pods.money) blind.push(pods.money)
    else {
      if (pods.balance < L.min_balance)
        anom.push(
          `LOWBAL $${pods.balance.toFixed(2)} < $${L.min_balance}: no new spend`
        )
      if (pods.spend > cost + L.spend_slack)
        anom.push(
          `SPEND $${pods.spend.toFixed(2)}/h > running pods $${cost.toFixed(2)}/h`
        )
    }
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
  const last = loop?.last
  if (!loop || loop.error)
    blind.push(
      loop?.error ||
        'loop runner: no IGLA_RAILWAY_TOKEN on queen-watch, no tick'
    )
  else if (!last)
    blind.push(
      `loop runner: service ${LOOP_SERVICE} has no deployment yet (tri tc-queen runner up), no tick`
    )
  else if (last.state === null)
    blind.push(
      `loop runner: deployment status ${last.status} was never measured on service ${LOOP_SERVICE}: held as live, no tick`
    )
  else if (last.live && last.h === null)
    blind.push(
      `loop run ${last.state}, not timed: deployment ${String(last.id).slice(0, 8)} has no createdAt`
    )
  else if (last.live && last.h > L.loop_max_h)
    anom.push(
      `LOOPUP igla-judge loop run ${last.state} ${last.h.toFixed(1)} h > ${L.loop_max_h} h: it outlived its own limit, read its log (railway logs -s loop); no tick while it lives`
    )
  /* queen_igla: STALE only while idle. A live judge job or loop run is work. */
  const work =
    (pods?.running?.length || 0) + (judgeUp?.up?.length || 0) > 0 ||
    Boolean(last?.live)
  const jh = hours(nowS, q.journal_at)
  if (jh === null)
    blind.push('STALE: the board has no journal commit time (journal_at)')
  else if (!work && jh > L.stale_h)
    anom.push(`STALE no journal commit for ${jh.toFixed(0)} h`)
  for (const a of snap.today?.anomalies || [])
    anom.push(`REPO ${String(a).slice(0, 160)}`)
  if (
    q.repo !== IGLA_REPO ||
    q.executor !== EXECUTOR ||
    q.runner_service !== LOOP_SERVICE ||
    q.judge_service !== JUDGE_SERVICE
  )
    anom.push(
      `BOARD the board names ${q.repo} executor ${q.executor} runner ${q.runner_service} judge ${q.judge_service}, this watch ${IGLA_REPO} executor ${EXECUTOR} runner ${LOOP_SERVICE} judge ${JUDGE_SERVICE}: no tick`
    )
  const ran = (pods?.running?.length || 0) > 0 || (judgeUp?.up?.length || 0) > 0
  const busy = ran
    ? 'true'
    : !pods || pods.error || !judgeUp || judgeUp.error
      ? 'unknown'
      : 'false'
  return { anom, blind: [...new Set(blind)], jh, busy }
}

/**
 * Redeploy now? Only on an exited newest run, nothing busy, a board that
 * names this watch, and tick_h after the newest run or redeploy.
 */
export function dueTick({ q, loop, busy, cfg, nowS, st, anom }) {
  if (!cfg.iglaTrigger || !cfg.iglaRailwayToken) return false
  if (!loop || loop.error || !loop.last || loop.last.live) return false
  if (busy !== 'false') return false
  if (anom.some(a => a.startsWith('BOARD'))) return false
  const lastS = Math.max(
    Date.parse(loop.last.createdAt) / 1000 || 0,
    st.triggered_at || 0
  )
  return nowS - lastS >= q.limits.tick_h * 3600
}

/* Why no tick went out, for the report. */
function held({ cfg, loop, busy, anom, pods, judgeUp }) {
  if (!cfg.iglaTrigger) return 'off (IGLA_TRIGGER=0)'
  if (!cfg.iglaRailwayToken) return 'none: no IGLA_RAILWAY_TOKEN on queen-watch'
  if (!loop || loop.error) return 'held: the loop service was not read'
  if (!loop.last) return `held: service ${LOOP_SERVICE} has no deployment yet`
  if (loop.last.state === null)
    return `held: the newest ${LOOP_SERVICE} deployment's status ${loop.last.status} was never measured`
  if (loop.last.live)
    return `held: the newest ${LOOP_SERVICE} run is live (${loop.last.state})`
  if (busy === 'true')
    return `held: busy (${[
      ...(pods?.running || []).map(p => `pod ${p.name}`),
      ...(judgeUp?.up || []).map(() => 'judge live'),
    ].join(', ')})`
  if (busy !== 'false')
    return 'held: busy unknown (RunPod or the judge not read)'
  if (anom.some(a => a.startsWith('BOARD'))) return 'held: BOARD'
  return null
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
      triggered_at: 0,
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
  const { snap, q, live } = board
  const pods = await runpod(cfg, deps, nowS)
  const { judgeUp, loop } = await railwayFacts(cfg, deps, nowS)
  const { anom, blind, jh, busy } = assess({
    q,
    snap,
    pods,
    judgeUp,
    loop,
    nowS,
  })

  let tick = held({ cfg, loop, busy, anom, pods, judgeUp })
  let triggered = false
  if (dueTick({ q, loop, busy, cfg, nowS, st, anom })) {
    const d = await redeploy(cfg, deps)
    triggered = d.ok
    if (triggered) st.triggered_at = nowS
    tick = triggered
      ? `redeployed ${LOOP_SERVICE} (igla-judge)`
      : `not redeployed (${d.status ? `HTTP ${d.status}` : 'no answer'})`
    /* Retried every run; reported every REPEAT_S until it goes out. */
    if (!triggered) anom.push(refusal(d))
  } else if (tick === null) {
    tick = `not due (newest ${LOOP_SERVICE} run ${loop.last.state}, ${(loop.last.h ?? 0).toFixed(1)} h ago; every ${q.limits.tick_h} h)`
  }

  const fmt = n => (n === null || n === undefined ? '?' : n.toFixed(1))
  const lr = live?.loop_runner
  const facts = [
    `- last loop: ${q.last_loop || '?'} (journal commit ${fmt(jh)} h ago)`,
    pods && !pods.error
      ? `- RunPod: ${pods.money ? 'balance ?, spend ?' : `$${pods.balance.toFixed(2)}, spend $${pods.spend.toFixed(2)}/h`}, running: ${pods.running.map(p => `${p.name} ${fmt(p.h)} h`).join(', ') || 'none'}`
      : null,
    judgeUp && !judgeUp.error
      ? `- Railway judge: ${judgeUp.up.length ? judgeUp.up.map(d => `up ${fmt(d.h)} h`).join(', ') : 'down'}`
      : null,
    loop?.last
      ? `- loop runner: ${loop.last.state || 'unmeasured status'} (deployment ${loop.last.id.slice(0, 8)} ${loop.last.status}, created ${fmt(loop.last.h)} h ago)`
      : null,
    lr && typeof lr === 'object'
      ? `- board live.loop_runner: ${String(lr.stage || '?').slice(0, 40)}: ${String(lr.msg || '').slice(0, 160)}`
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
    triggered ||
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
