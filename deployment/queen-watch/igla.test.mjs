/**
 * igla.mjs: the IGLA-Coder loop watch that rides queen-watch's hourly run.
 * Every network call is a fake; nothing here reaches the board, RunPod,
 * Railway, GitHub, Telegram or the Queen.
 */
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  NEED_LIMITS,
  NEED_STRINGS,
  assess,
  dueTick,
  runIgla,
  runpodTime,
} from './igla.mjs'
import { config, reportToQueen } from './watch.mjs'

/* Deliberately fake values, long enough to be scrubbed. */
const QUEEN = 'fake-queen-tok-0004'
const TG = 'fake-tg-tok-0005'
const GH = 'fake-gh-tok-0006'
const RUNPOD = 'fake-runpod-key-0007'
const IGH = 'fake-igla-gh-tok-0008'
const IRAIL = 'fake-igla-rail-tok-0009'
const SECRETS = [QUEEN, TG, GH, RUNPOD, IGH, IRAIL]

const NOW = Date.parse('2026-10-04T14:00:00Z') / 1000
const iso = hoursAgo => new Date((NOW - hoursAgo * 3600) * 1000).toISOString()

function cfgWith(env = {}, over = {}) {
  return {
    ...config({
      TRIOS_API_TOKEN: QUEEN,
      OWNER_BOT_TOKEN: TG,
      GITHUB_TOKEN: GH,
      RUNPOD_API_KEY: RUNPOD,
      IGLA_GITHUB_TOKEN: IGH,
      IGLA_RAILWAY_TOKEN: IRAIL,
      STATE_DIR: mkdtempSync(join(tmpdir(), 'igla-')),
      ...env,
    }),
    ...over,
  }
}

const LIMITS = {
  pod_max_h: 7,
  min_balance: 15,
  spend_slack: 0.2,
  stale_h: 36,
  idle_h: 12,
  tick_h: 6,
  judge_max_h: 8,
  billing_retry_h: 24,
}

function queenBlock(over = {}) {
  return {
    repo: 'gHashTag/igla-coder-gpu',
    workflow: 'igla-loop.yml',
    ref: 'main',
    judge_service: 'judge',
    limits: LIMITS,
    journal_at: iso(2),
    last_loop: 'loop 32: P16 sibling-sketch judge',
    todo_open: 1,
    todo: ['owner: GitHub Actions billing'],
    head: '2bd3ddb journal.py: one header parser',
    ...over,
  }
}

const res = (status, body) => ({
  status,
  text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
})

/** A fake world; every knob answers like production by default. */
function world({
  board = 200,
  queen = queenBlock(),
  anomalies = [],
  balance = 40,
  spend = 0,
  pods = [],
  judgeUp = [],
  runs = [
    { id: 1, status: 'completed', conclusion: 'success', created_at: iso(7) },
  ],
  runsStatus = 200,
  jobs = [{ name: 'monitor', steps: [{ name: 'checkout' }] }],
  dispatch = 204,
  later = 0,
} = {}) {
  const calls = []
  const out = []
  const fetch = async (url, init = {}) => {
    const u = String(url)
    const raw = init.body || ''
    const method = init.method || 'GET'
    calls.push({
      url: u,
      method,
      raw,
      body: raw ? JSON.parse(raw) : null,
      auth: init.headers?.authorization,
    })
    if (u.endsWith('/state')) {
      if (board !== 200) return res(board, 'down')
      return res(200, {
        snapshot: { queen, today: { anomalies }, generated_at: iso(1) },
      })
    }
    if (u.includes('api.runpod.io/graphql'))
      return res(200, {
        data: { myself: { clientBalance: balance, currentSpendPerHr: spend } },
      })
    if (u.includes('rest.runpod.io/v1/pods')) return res(200, pods)
    if (u.includes('backboard.railway')) {
      const q = JSON.parse(raw).query
      if (q.includes('projectToken'))
        return res(200, {
          data: { projectToken: { projectId: 'p1', environmentId: 'e1' } },
        })
      if (q.includes('project('))
        return res(200, {
          data: {
            project: {
              services: {
                edges: [
                  { node: { id: 'b', name: 'board' } },
                  { node: { id: 'j', name: 'judge' } },
                ],
              },
            },
          },
        })
      return res(200, {
        data: {
          deployments: {
            edges: judgeUp.map((h, i) => ({
              node: { id: `d${i}`, status: 'SUCCESS', createdAt: iso(h) },
            })),
          },
        },
      })
    }
    if (u.includes('/actions/workflows/igla-loop.yml/runs'))
      return runsStatus === 200
        ? res(200, { workflow_runs: runs })
        : res(runsStatus, { message: 'Not Found' })
    if (/\/actions\/runs\/\d+\/jobs$/.test(u)) return res(200, { jobs })
    if (u.endsWith('/dispatches')) {
      if (dispatch === 'timeout')
        throw Object.assign(new Error('aborted'), { name: 'TimeoutError' })
      return res(dispatch, '')
    }
    if (u.endsWith('/queen/report')) return res(201, { id: 7 })
    if (u.endsWith('/sendMessage')) return res(200, { ok: true })
    return res(404, 'unexpected')
  }
  const deps = {
    fetch,
    sleep: async () => {},
    now: () => NOW + later,
    write: s => out.push(s),
  }
  const log = () => out.join('')
  const queenCalls = () => calls.filter(c => c.url.endsWith('/queen/report'))
  const dispatches = () => calls.filter(c => c.url.endsWith('/dispatches'))
  const tg = () => calls.filter(c => c.url.endsWith('/sendMessage'))
  return { calls, deps, log, queenCalls, dispatches, tg }
}

describe('igla: the loop watch on the Queen', () => {
  it('measures, ticks and reports a healthy loop as igla-loop', async () => {
    const w = world()
    /* No variable moves the repository the token is pointed at. */
    const cfg = cfgWith({ IGLA_REPO: 'gHashTag/t27' })
    expect(await runIgla(cfg, w.deps)).toBe(0)
    expect(w.calls[0].url).toBe(
      'https://board-production-2dec.up.railway.app/state'
    )
    const d = w.dispatches()
    expect(d).toHaveLength(1)
    expect(d[0].method).toBe('POST')
    expect(d[0].url).toBe(
      'https://api.github.com/repos/gHashTag/igla-coder-gpu/actions/workflows/igla-loop.yml/dispatches'
    )
    expect(d[0].body).toEqual({ ref: 'main' })
    /* The tick is IGLA_GITHUB_TOKEN's, never the Queen's GITHUB_TOKEN. */
    expect(d[0].auth).toBe(`Bearer ${IGH}`)
    expect(w.calls.some(c => c.url.includes('gHashTag/t27'))).toBe(false)
    const q = w.queenCalls()
    expect(q).toHaveLength(1)
    expect(Object.keys(q[0].body).sort()).toEqual([
      'body',
      'headline',
      'needs_you',
      'source',
    ])
    expect(q[0].body.source).toBe('igla-loop')
    expect(q[0].body.needs_you).toBe(false)
    expect(q[0].body.headline).toMatch(/^igla loop: ok -- loop 32/)
    expect(q[0].body.body).toContain('tick: dispatched igla-loop.yml on main')
    expect(w.tg()).toHaveLength(1)
  })

  it('stays quiet the next hour when nothing changed and no tick is due', async () => {
    const cfg = cfgWith()
    await runIgla(cfg, world().deps)
    const w = world({
      runs: [
        {
          id: 2,
          status: 'completed',
          conclusion: 'success',
          created_at: iso(1),
        },
      ],
    })
    expect(await runIgla(cfg, w.deps)).toBe(0)
    expect(w.dispatches()).toHaveLength(0)
    expect(w.queenCalls()).toHaveLength(0)
    expect(w.tg()).toHaveLength(0)
    expect(w.log()).toContain('quiet until REPEAT_S')
  })

  it('never dispatches while a run is queued or running', async () => {
    const w = world({
      runs: [
        { id: 3, status: 'in_progress', conclusion: null, created_at: iso(30) },
      ],
    })
    await runIgla(cfgWith(), w.deps)
    expect(w.dispatches()).toHaveLength(0)
  })

  it('reads every limit from the board: OVERRUN, LOWBAL, SPEND', async () => {
    const w = world({
      balance: 9.5,
      spend: 2,
      pods: [
        {
          name: 'gpuft9',
          desiredStatus: 'RUNNING',
          lastStartedAt: '2026-10-04 05:00:00.000 +0000 UTC',
          costPerHr: 0.69,
        },
      ],
    })
    expect(await runIgla(cfgWith(), w.deps)).toBe(1)
    const body = w.queenCalls()[0].body
    expect(body.needs_you).toBe(true)
    expect(body.headline).toMatch(/^igla loop: OVERRUN, LOWBAL, SPEND/)
    expect(body.body).toContain('OVERRUN gpuft9 running 9.0 h > 7 h')
    /* The same pod under a looser board limit is not an overrun. */
    const loose = world({
      queen: queenBlock({ limits: { ...LIMITS, pod_max_h: 10 } }),
      spend: 0.69,
      pods: [
        {
          name: 'gpuft9',
          desiredStatus: 'RUNNING',
          lastStartedAt: '2026-10-04 05:00:00.000 +0000 UTC',
          costPerHr: 0.69,
        },
      ],
    })
    expect(await runIgla(cfgWith(), loose.deps)).toBe(0)
  })

  it('STALE only while idle; a live judge job counts as work', async () => {
    const stale = world({ queen: queenBlock({ journal_at: iso(40) }) })
    expect(await runIgla(cfgWith(), stale.deps)).toBe(1)
    expect(stale.queenCalls()[0].body.body).toContain(
      'STALE no journal commit for 40 h'
    )
    const busy = world({
      queen: queenBlock({ journal_at: iso(40) }),
      judgeUp: [2],
    })
    expect(await runIgla(cfgWith(), busy.deps)).toBe(0)
  })

  it('JUDGEUP: a judge deployment left up past judge_max_h', async () => {
    const w = world({ judgeUp: [9.5] })
    expect(await runIgla(cfgWith(), w.deps)).toBe(1)
    expect(w.queenCalls()[0].body.body).toContain(
      'JUDGEUP igla-judge judge deployment up 9.5 h > 8 h'
    )
  })

  it('BILLING: a failed run whose jobs took no step; retried every billing_retry_h', async () => {
    const billed = {
      runs: [
        {
          id: 37200908237,
          status: 'completed',
          conclusion: 'failure',
          created_at: iso(7),
        },
      ],
      jobs: [
        { name: 'monitor', steps: [] },
        { name: 'iterate', steps: [] },
      ],
    }
    const w = world(billed)
    expect(await runIgla(cfgWith(), w.deps)).toBe(1)
    expect(w.queenCalls()[0].body.body).toContain(
      'BILLING igla-loop.yml run 37200908237'
    )
    expect(w.dispatches()).toHaveLength(0)
    const later = world({
      ...billed,
      runs: [{ ...billed.runs[0], created_at: iso(25) }],
    })
    await runIgla(cfgWith(), later.deps)
    expect(later.dispatches()).toHaveLength(1)
    /* The retry interval is the board's, not this file's. */
    const slower = world({
      ...billed,
      runs: [{ ...billed.runs[0], created_at: iso(25) }],
      queen: queenBlock({ limits: { ...LIMITS, billing_retry_h: 48 } }),
    })
    await runIgla(cfgWith(), slower.deps)
    expect(slower.dispatches()).toHaveLength(0)
    expect(slower.queenCalls()[0].body.body).toContain(
      'billing: retry every 48 h'
    )
    /* A failure that ran steps is the loop's own failure, not billing. */
    const own = world({
      ...billed,
      jobs: [{ name: 'monitor', steps: [{ name: 'x' }] }],
    })
    await runIgla(cfgWith(), own.deps)
    expect(own.log()).not.toContain('BILLING')
  })

  it('says what it cannot measure, and only IGLA_GITHUB_TOKEN dispatches', async () => {
    const w = world({ runsStatus: 404 })
    const cfg = cfgWith({
      RUNPOD_API_KEY: '',
      IGLA_GITHUB_TOKEN: '',
      IGLA_RAILWAY_TOKEN: '',
    })
    expect(await runIgla(cfg, w.deps)).toBe(0)
    const body = w.queenCalls()[0].body
    expect(body.needs_you).toBe(true)
    expect(body.headline).toMatch(/^igla loop: ok, 3 not measured/)
    expect(body.body).toContain('no RUNPOD_API_KEY on queen-watch')
    expect(body.body).toContain('no IGLA_RAILWAY_TOKEN on queen-watch')
    expect(body.body).toContain(
      'igla-loop.yml not readable (HTTP 404): GITHUB_TOKEN does not reach gHashTag/igla-coder-gpu'
    )
    expect(w.calls.some(c => c.url.includes('runpod'))).toBe(false)
    expect(w.calls.some(c => c.url.includes('backboard.railway'))).toBe(false)
    expect(
      w.calls.filter(c => c.url.includes('github') && c.method !== 'GET')
    ).toHaveLength(0)
  })

  it('a forged board never points the tick at another repository', async () => {
    const w = world({
      queen: queenBlock({ repo: 'gHashTag/t27', workflow: 'deploy.yml' }),
    })
    expect(await runIgla(cfgWith(), w.deps)).toBe(1)
    expect(w.dispatches()).toHaveLength(0)
    expect(w.calls.some(c => c.url.includes('gHashTag/t27'))).toBe(false)
    expect(w.queenCalls()[0].body.body).toContain(
      'BOARD the board names gHashTag/t27/deploy.yml'
    )
  })

  it('an unreachable board: reported on runs 1 and 3, DMed on 3, then every REPEAT_S', async () => {
    const cfg = cfgWith()
    const runs = []
    for (let i = 0; i < 4; i++) {
      const w = world({ board: 502 })
      expect(await runIgla(cfg, w.deps)).toBe(2)
      runs.push(w)
    }
    const after = world({ board: 502, later: cfg.repeatS })
    expect(await runIgla(cfg, after.deps)).toBe(2)
    runs.push(after)
    expect(runs.map(w => w.queenCalls().length)).toEqual([1, 0, 1, 0, 1])
    expect(runs.map(w => w.tg().length)).toEqual([0, 0, 1, 0, 0])
    expect(runs[0].queenCalls()[0].body.needs_you).toBe(true)
    expect(runs.every(w => w.dispatches().length === 0)).toBe(true)
    /* Measured again: a change, reported and DMed. */
    const back = world({ later: cfg.repeatS + 3600 })
    expect(await runIgla(cfg, back.deps)).toBe(0)
    expect(back.queenCalls()).toHaveLength(1)
    expect(back.tg()).toHaveLength(1)
  })

  it('a queen block missing any key this file reads is not measured, by name', async () => {
    for (const k of NEED_LIMITS) {
      const limits = { ...LIMITS }
      delete limits[k]
      const w = world({ queen: queenBlock({ limits }) })
      expect(await runIgla(cfgWith(), w.deps)).toBe(2)
      expect(w.log()).toContain(`lacks limits.${k}`)
      expect(w.dispatches()).toHaveLength(0)
      expect(w.queenCalls()[0].body.needs_you).toBe(true)
    }
    for (const k of NEED_STRINGS) {
      const w = world({ queen: queenBlock({ [k]: undefined }) })
      expect(await runIgla(cfgWith(), w.deps)).toBe(2)
      expect(w.log()).toContain(`lacks ${k}`)
      expect(w.dispatches()).toHaveLength(0)
    }
    /* A string where a number belongs is missing too. */
    const typo = world({
      queen: queenBlock({ limits: { ...LIMITS, pod_max_h: '7' } }),
    })
    expect(await runIgla(cfgWith(), typo.deps)).toBe(2)
  })

  it('a refused dispatch is a DISPATCH anomaly, retried and kept reported', async () => {
    const cfg = cfgWith()
    const first = world({ dispatch: 403 })
    expect(await runIgla(cfg, first.deps)).toBe(1)
    const body = first.queenCalls()[0].body
    expect(body.needs_you).toBe(true)
    expect(body.headline).toMatch(/^igla loop: DISPATCH/)
    expect(body.body).toContain(
      'DISPATCH igla-loop.yml refused (HTTP 403): IGLA_GITHUB_TOKEN needs Actions read+write on gHashTag/igla-coder-gpu'
    )
    const next = world({ dispatch: 403 })
    expect(await runIgla(cfg, next.deps)).toBe(1)
    expect(next.dispatches()).toHaveLength(1)
    expect(next.queenCalls()).toHaveLength(0)
    const later = world({ dispatch: 403, later: cfg.repeatS })
    expect(await runIgla(cfg, later.deps)).toBe(1)
    expect(later.queenCalls()).toHaveLength(1)
    expect(later.queenCalls()[0].body.body).toContain('DISPATCH')
  })

  it('DISPATCH blames the token only on an auth answer', async () => {
    const busy = world({ dispatch: 500 })
    expect(await runIgla(cfgWith(), busy.deps)).toBe(1)
    const b500 = busy.queenCalls()[0].body.body
    expect(b500).toContain(
      'DISPATCH igla-loop.yml not accepted: GitHub answered HTTP 500'
    )
    expect(b500).not.toContain('needs Actions read+write')
    const gone = world({ dispatch: 'timeout' })
    expect(await runIgla(cfgWith(), gone.deps)).toBe(1)
    const b0 = gone.queenCalls()[0].body.body
    expect(b0).toContain(
      'DISPATCH igla-loop.yml not sent: GitHub did not answer (TimeoutError)'
    )
    expect(b0).not.toContain('needs Actions read+write')
    for (const status of [401, 404]) {
      const auth = world({ dispatch: status })
      await runIgla(cfgWith(), auth.deps)
      expect(auth.queenCalls()[0].body.body).toContain(
        `refused (HTTP ${status}): IGLA_GITHUB_TOKEN needs Actions read+write`
      )
    }
  })

  it('no journal time or no numeric balance is said, never passed silently', async () => {
    const noJournal = world({ queen: queenBlock({ journal_at: null }) })
    expect(await runIgla(cfgWith(), noJournal.deps)).toBe(0)
    const nj = noJournal.queenCalls()[0].body
    expect(nj.body).toContain(
      'STALE: the board has no journal commit time (journal_at)'
    )
    expect(nj.needs_you).toBe(true)
    for (const balance of [null, 'n/a']) {
      const w = world({ balance })
      expect(await runIgla(cfgWith(), w.deps)).toBe(0)
      const body = w.queenCalls()[0].body.body
      expect(body).toContain(
        'RunPod answered without a numeric balance or spend'
      )
      expect(body).not.toContain('LOWBAL')
    }
  })

  it('the DM follows the anomaly codes; a blind line goes to the Queen only', async () => {
    const cfg = cfgWith({ RUNPOD_API_KEY: '' })
    const first = world()
    await runIgla(cfg, first.deps)
    expect(first.tg()).toHaveLength(1)
    const recent = [
      { id: 2, status: 'completed', conclusion: 'success', created_at: iso(1) },
    ]
    const seen = world({ runs: recent })
    await runIgla(cfgWith({}, { stateDir: cfg.stateDir }), seen.deps)
    expect(seen.queenCalls()).toHaveLength(1)
    expect(seen.tg()).toHaveLength(0)
    const low = world({ runs: recent, balance: 3 })
    await runIgla(cfgWith({}, { stateDir: cfg.stateDir }), low.deps)
    expect(low.tg()).toHaveLength(1)
  })

  it('the published loop anomalies arrive as REPO lines', async () => {
    const w = world({ anomalies: ['selfcheck tree /tmp/t27-bench missing'] })
    expect(await runIgla(cfgWith(), w.deps)).toBe(1)
    expect(w.queenCalls()[0].body.body).toContain(
      'REPO selfcheck tree /tmp/t27-bench missing'
    )
  })

  it('IGLA=0 is off, IGLA_DISPATCH=0 watches without the tick', async () => {
    const off = world()
    expect(await runIgla(cfgWith({ IGLA: '0' }), off.deps)).toBe(0)
    expect(off.calls).toHaveLength(0)
    const watch = world()
    await runIgla(cfgWith({ IGLA_DISPATCH: '0' }), watch.deps)
    expect(watch.dispatches()).toHaveLength(0)
    expect(watch.queenCalls()[0].body.body).toContain(
      'tick: off (IGLA_DISPATCH=0)'
    )
  })

  it('no secret reaches a request body or the log', async () => {
    const w = world({ balance: 1, judgeUp: [20] })
    await runIgla(cfgWith(), w.deps)
    for (const s of SECRETS) {
      expect(w.log()).not.toContain(s)
      for (const c of w.calls) expect(c.raw).not.toContain(s)
    }
  })
})

describe('igla: the pieces', () => {
  it('reads the RunPod clock', () => {
    expect(runpodTime('2026-10-04 05:00:00.331 +0000 UTC')).toBe(
      Date.parse('2026-10-04T05:00:00Z') / 1000
    )
    expect(runpodTime(null)).toBe(null)
    expect(runpodTime('garbage')).toBe(null)
  })

  it('a tick is due tick_h after the last run or dispatch, never sooner', () => {
    const q = queenBlock()
    const cfg = cfgWith()
    const run = { last: { status: 'completed', created_at: iso(5) } }
    expect(dueTick({ q, run, cfg, nowS: NOW, st: {}, anom: [] })).toBe(false)
    const old = { last: { status: 'completed', created_at: iso(6.1) } }
    expect(dueTick({ q, run: old, cfg, nowS: NOW, st: {}, anom: [] })).toBe(
      true
    )
    expect(
      dueTick({
        q,
        run: old,
        cfg,
        nowS: NOW,
        st: { dispatched_at: NOW - 60 },
        anom: [],
      })
    ).toBe(false)
  })

  it('assess carries no limit of its own', () => {
    const q = queenBlock({ limits: { ...LIMITS, min_balance: 50 } })
    const { anom } = assess({
      q,
      snap: {},
      pods: { balance: 40, spend: 0, running: [] },
      judgeUp: { up: [] },
      run: { last: null, billing: false },
      nowS: NOW,
    })
    expect(anom).toEqual(['LOWBAL $40.00 < $50: no new spend'])
  })

  it('reportToQueen still says queen-watch unless told otherwise', async () => {
    const w = world()
    await reportToQueen(cfgWith(), w.deps, {
      headline: 'h',
      body: 'b',
      needsYou: false,
    })
    expect(w.queenCalls()[0].body.source).toBe('queen-watch')
  })
})
