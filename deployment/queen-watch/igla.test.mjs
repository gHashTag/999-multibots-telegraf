/**
 * igla.mjs: the IGLA-Coder loop watch that rides queen-watch's hourly run.
 * Every network call is a fake; nothing here reaches the board, RunPod,
 * Railway, GitHub, Telegram or the Queen.
 *
 * igla.mjs is imported as a namespace so that a name it does not export is
 * undefined in the test that needs it: run against an older igla.mjs, each
 * test fails on its own assertion instead of the whole file failing to load.
 */
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import * as igla from './igla.mjs'
import { RAILWAY_API, config, reportToQueen } from './watch.mjs'

const {
  EXECUTOR,
  LOOP_ENVIRONMENT,
  LOOP_PROJECT,
  LOOP_SERVICE,
  LOOP_SERVICE_ID,
  NEED_LIMITS,
  NEED_STRINGS,
  assess,
  dueTick,
  isLive,
  runIgla,
  runState,
  runpodTime,
} = igla

/* Deliberately fake values, long enough to be scrubbed. */
const QUEEN = 'fake-queen-tok-0004'
const TG = 'fake-tg-tok-0005'
const GH = 'fake-gh-tok-0006'
const RUNPOD = 'fake-runpod-key-0007'
const IGH = 'fake-igla-gh-tok-0008'
const IRAIL = 'fake-igla-rail-tok-0009'
const QRAIL = 'fake-queen-rail-tok-0011'
const SECRETS = [QUEEN, TG, GH, RUNPOD, IGH, IRAIL, QRAIL]

/* The measured ids of igla-judge production and its service loop
 * (igla-coder-gpu#38 runner contract, 2026-10-04T17:36:08Z). */
const PROJECT = '1a315000-9f97-4a99-95a1-4665a37ff056'
const ENVIRONMENT = 'c353906c-703e-4171-ba92-5f4b361ea32d'
const SERVICE = '21039821-9e70-4f46-a6c1-38021e67729c'
const JUDGE = 'bf41bf05-b200-4d9a-8d17-f5acb4a1c0ec'

const NOW = Date.parse('2026-10-04T14:00:00Z') / 1000
const iso = hoursAgo => new Date((NOW - hoursAgo * 3600) * 1000).toISOString()

function cfgWith(env = {}, over = {}) {
  return {
    ...config({
      TRIOS_API_TOKEN: QUEEN,
      OWNER_BOT_TOKEN: TG,
      GITHUB_TOKEN: GH,
      RAILWAY_API_TOKEN: QRAIL,
      RUNPOD_API_KEY: RUNPOD,
      IGLA_GITHUB_TOKEN: IGH,
      IGLA_RAILWAY_TOKEN: IRAIL,
      STATE_DIR: mkdtempSync(join(tmpdir(), 'igla-')),
      ...env,
    }),
    ...over,
  }
}

/* The live board's limits (2026-10-04); billing_retry_h is no longer read. */
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
    executor: 'railway',
    runner_service: 'loop',
    limits: LIMITS,
    journal_at: iso(2),
    last_loop: 'loop 32: P16 sibling-sketch judge',
    todo_open: 1,
    todo: ['owner: loop runner variables'],
    head: '2bd3ddb journal.py: one header parser',
    ...over,
  }
}

const res = (status, body) => ({
  status,
  text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
})

const EXITED = { status: 'SUCCESS', stopped: true, h: 7 }
const SERVICES = [
  { id: 'b', name: 'board' },
  { id: JUDGE, name: 'judge' },
  { id: SERVICE, name: 'loop' },
]

/** A fake world; every knob answers like production by default. */
function world({
  board = 200,
  queen = queenBlock(),
  live = {},
  anomalies = [],
  balance = 40,
  spend = 0,
  pods = [],
  /* judge deployments: hours ago, or { h, status, stopped } */
  judgeUp = [],
  /* loop deployments, any order: { status, stopped, h } */
  loop = [EXITED],
  token = { projectId: PROJECT, environmentId: ENVIRONMENT },
  services = SERVICES,
  redeploy = 200,
  later = 0,
} = {}) {
  const calls = []
  const out = []
  const node = (d, i, p) => ({
    node: {
      id: `${p}${i}aaaaaaa-0000`,
      status: d.status,
      createdAt: iso(d.h),
      ...(d.stopped === undefined ? {} : { deploymentStopped: d.stopped }),
    },
  })
  const fetch = async (url, init = {}) => {
    const u = String(url)
    const raw = init.body || ''
    const method = init.method || 'GET'
    calls.push({
      url: u,
      method,
      raw,
      body: raw ? JSON.parse(raw) : null,
      headers: init.headers || {},
      auth: init.headers?.authorization,
    })
    if (u.endsWith('/state')) {
      if (board !== 200) return res(board, 'down')
      return res(200, {
        snapshot: { queen, today: { anomalies }, generated_at: iso(1) },
        live,
      })
    }
    if (u.includes('api.runpod.io/graphql'))
      return res(200, {
        data: { myself: { clientBalance: balance, currentSpendPerHr: spend } },
      })
    if (u.includes('rest.runpod.io/v1/pods')) return res(200, pods)
    if (u === RAILWAY_API) {
      const { query: q, variables: v } = JSON.parse(raw)
      if (q.includes('serviceInstanceRedeploy')) {
        if (redeploy === 'timeout')
          throw Object.assign(new Error('aborted'), { name: 'TimeoutError' })
        if (redeploy === 'gqlerr')
          return res(200, {
            errors: [{ message: 'Service instance not found' }],
          })
        if (redeploy === 'denied')
          return res(200, { errors: [{ message: 'Not Authorized' }] })
        if (redeploy === 'false')
          return res(200, { data: { serviceInstanceRedeploy: false } })
        if (redeploy !== 200) return res(redeploy, 'no')
        return res(200, { data: { serviceInstanceRedeploy: true } })
      }
      if (q.includes('projectToken'))
        return res(200, { data: { projectToken: token } })
      if (q.includes('project('))
        return res(200, {
          data: {
            project: {
              services: { edges: services.map(s => ({ node: s })) },
            },
          },
        })
      if (q.includes('deployments(')) {
        const sid = v.input.serviceId
        const rows =
          sid === SERVICE
            ? loop.map((d, i) => node(d, i, 'l'))
            : sid === JUDGE
              ? judgeUp.map((d, i) =>
                  node(
                    typeof d === 'number'
                      ? { status: 'SUCCESS', stopped: false, h: d }
                      : d,
                    i,
                    'j'
                  )
                )
              : []
        return res(200, { data: { deployments: { edges: rows } } })
      }
      return res(400, 'unexpected query')
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
  const redeploys = () =>
    calls.filter(c => (c.body?.query || '').includes('serviceInstanceRedeploy'))
  const railwayCalls = () => calls.filter(c => c.url.includes('railway.com'))
  const tg = () => calls.filter(c => c.url.endsWith('/sendMessage'))
  return { calls, deps, log, queenCalls, redeploys, railwayCalls, tg }
}

describe('igla: the loop watch on the Queen', () => {
  it('healthy: redeploys service loop with the constants and reports as igla-loop', async () => {
    const w = world()
    /* No variable moves the repository, the API host or the service. */
    const cfg = cfgWith({
      IGLA_REPO: 'gHashTag/t27',
      RAILWAY_API_URL: 'https://railway.example.test/graphql',
    })
    expect(await runIgla(cfg, w.deps)).toBe(0)
    expect(w.calls[0].url).toBe(
      'https://board-production-2dec.up.railway.app/state'
    )
    expect([LOOP_PROJECT, LOOP_ENVIRONMENT, LOOP_SERVICE_ID]).toEqual([
      PROJECT,
      ENVIRONMENT,
      SERVICE,
    ])
    expect([LOOP_SERVICE, EXECUTOR]).toEqual(['loop', 'railway'])
    const d = w.redeploys()
    expect(d).toHaveLength(1)
    expect(d[0].method).toBe('POST')
    expect(d[0].url).toBe('https://backboard.railway.com/graphql/v2')
    expect(d[0].body.query).toContain(
      'serviceInstanceRedeploy(environmentId: $environmentId, serviceId: $serviceId)'
    )
    expect(d[0].body.variables).toEqual({
      environmentId: ENVIRONMENT,
      serviceId: SERVICE,
    })
    /* The tick is IGLA_RAILWAY_TOKEN's, as a project token, nothing else. */
    expect(d[0].headers['project-access-token']).toBe(IRAIL)
    expect(d[0].auth).toBeUndefined()
    expect(w.calls.some(c => c.url.includes('example.test'))).toBe(false)
    expect(w.calls.some(c => c.url.includes('github'))).toBe(false)
    expect(w.calls.some(c => c.raw.includes('gHashTag/t27'))).toBe(false)
    for (const c of w.railwayCalls()) {
      expect(c.url).toBe(RAILWAY_API)
      expect(JSON.stringify(c.headers)).not.toContain(QRAIL)
    }
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
    expect(q[0].body.body).toContain('tick: redeployed loop (igla-judge)')
    expect(q[0].body.body).toContain(
      '- loop runner: exited ok (deployment l0aaaaaa SUCCESS, created 7.0 h ago)'
    )
    expect(w.log()).toContain('igla-loop: queen: filed (id 7)')
    expect(w.tg()).toHaveLength(1)
  })

  it('stays quiet the next hour when nothing changed and no tick is due', async () => {
    const cfg = cfgWith()
    await runIgla(cfg, world().deps)
    const w = world({ loop: [{ ...EXITED, h: 1 }], later: 3600 })
    expect(await runIgla(cfg, w.deps)).toBe(0)
    expect(w.redeploys()).toHaveLength(0)
    expect(w.queenCalls()).toHaveLength(0)
    expect(w.tg()).toHaveLength(0)
    expect(w.log()).toContain(
      'igla-loop: unchanged, already reported -- quiet until REPEAT_S'
    )
    /* Redeployed but not yet listed: the redeploy itself starts the clock. */
    const unlisted = world({ later: 3600 })
    expect(await runIgla(cfg, unlisted.deps)).toBe(0)
    expect(unlisted.redeploys()).toHaveLength(0)
  })

  it('never redeploys while the newest loop deployment is live', async () => {
    for (const live of [
      { status: 'INITIALIZING', stopped: true },
      { status: 'BUILDING', stopped: true },
      { status: 'DEPLOYING', stopped: true },
      { status: 'QUEUED' },
      { status: 'SUCCESS', stopped: false },
      { status: 'SUCCESS' },
    ]) {
      /* An older exited run below it does not matter; order is createdAt. */
      const w = world({
        loop: [
          { ...EXITED, h: 30 },
          { ...live, h: 20 },
        ],
      })
      await runIgla(cfgWith(), w.deps)
      expect(w.redeploys()).toHaveLength(0)
      const body = w.queenCalls()[0].body
      expect(body.body).toContain('tick: held: the newest loop run is live')
      /* A live run is not timed: no limit on the board, said by name. */
      expect(body.body).toContain(
        "not timed: the board's queen block publishes no loop run limit"
      )
      expect(body.needs_you).toBe(true)
    }
    /* A status nobody measured holds the tick too, by name. */
    for (const status of ['FAILED', 'SLEEPING', 'REMOVED']) {
      const w = world({ loop: [{ status, stopped: true, h: 20 }] })
      await runIgla(cfgWith(), w.deps)
      expect(w.redeploys()).toHaveLength(0)
      const b = w.queenCalls()[0].body.body
      expect(b).toContain(
        `deployment status ${status} was never measured on service loop`
      )
      expect(b).toContain(
        `tick: held: the newest loop deployment's status ${status} was never measured`
      )
    }
    const none = world({ loop: [] })
    await runIgla(cfgWith(), none.deps)
    expect(none.redeploys()).toHaveLength(0)
    expect(none.queenCalls()[0].body.body).toContain(
      'service loop has no deployment yet'
    )
  })

  it('a crashed run is exited: the tick comes back after tick_h', async () => {
    const w = world({ loop: [{ status: 'CRASHED', stopped: true, h: 6.5 }] })
    expect(await runIgla(cfgWith(), w.deps)).toBe(0)
    expect(w.redeploys()).toHaveLength(1)
    expect(w.queenCalls()[0].body.body).toContain(
      '- loop runner: exited failed'
    )
    /* tick_h is the board's: under a 12 h tick the same run is not due. */
    const slow = world({
      loop: [{ status: 'CRASHED', stopped: true, h: 6.5 }],
      queen: queenBlock({ limits: { ...LIMITS, tick_h: 12 } }),
    })
    await runIgla(cfgWith(), slow.deps)
    expect(slow.redeploys()).toHaveLength(0)
    expect(slow.queenCalls()[0].body.body).toContain(
      'tick: not due (newest loop run exited failed, 6.5 h ago; every 12 h)'
    )
  })

  it('never redeploys while busy, or while busy cannot be read', async () => {
    const pod = world({
      spend: 0.69,
      pods: [
        {
          name: 'gpuft9',
          desiredStatus: 'RUNNING',
          lastStartedAt: '2026-10-04 12:00:00.000 +0000 UTC',
          costPerHr: 0.69,
        },
      ],
    })
    await runIgla(cfgWith(), pod.deps)
    expect(pod.redeploys()).toHaveLength(0)
    expect(pod.queenCalls()[0].body.body).toContain(
      'tick: held: busy (pod gpuft9)'
    )
    const judge = world({ judgeUp: [2] })
    await runIgla(cfgWith(), judge.deps)
    expect(judge.redeploys()).toHaveLength(0)
    expect(judge.queenCalls()[0].body.body).toContain(
      'tick: held: busy (judge live)'
    )
    const unread = world()
    await runIgla(cfgWith({ RUNPOD_API_KEY: '' }), unread.deps)
    expect(unread.redeploys()).toHaveLength(0)
    expect(unread.queenCalls()[0].body.body).toContain(
      'tick: held: busy unknown'
    )
    /* A judge deployment that exited is neither busy nor JUDGEUP. */
    const done = world({
      judgeUp: [{ status: 'SUCCESS', stopped: true, h: 20 }],
    })
    expect(await runIgla(cfgWith(), done.deps)).toBe(0)
    expect(done.redeploys()).toHaveLength(1)
    expect(done.queenCalls()[0].body.body).toContain('- Railway judge: down')
  })

  it('a refused redeploy is a TRIGGER anomaly, retried and kept reported', async () => {
    const cfg = cfgWith()
    const first = world({ redeploy: 403 })
    expect(await runIgla(cfg, first.deps)).toBe(1)
    const body = first.queenCalls()[0].body
    expect(body.needs_you).toBe(true)
    expect(body.headline).toMatch(/^igla loop: TRIGGER/)
    expect(body.body).toContain(
      'TRIGGER loop redeploy refused (HTTP 403): IGLA_RAILWAY_TOKEN needs to deploy service loop in igla-judge production'
    )
    expect(body.body).toContain('tick: not redeployed (HTTP 403)')
    expect(first.tg()).toHaveLength(1)
    const next = world({ redeploy: 403, later: 3600 })
    expect(await runIgla(cfg, next.deps)).toBe(1)
    expect(next.redeploys()).toHaveLength(1)
    expect(next.queenCalls()).toHaveLength(0)
    expect(next.tg()).toHaveLength(0)
    const later = world({ redeploy: 403, later: cfg.repeatS })
    expect(await runIgla(cfg, later.deps)).toBe(1)
    expect(later.queenCalls()).toHaveLength(1)
    expect(later.queenCalls()[0].body.body).toContain('TRIGGER')
  })

  it('TRIGGER blames the token only on an auth answer', async () => {
    const cases = [
      [500, 'TRIGGER loop redeploy not accepted: Railway answered HTTP 500'],
      [
        'timeout',
        'TRIGGER loop redeploy not sent: Railway did not answer (TimeoutError)',
      ],
      [
        'gqlerr',
        'TRIGGER loop redeploy not accepted: Railway said Service instance not found',
      ],
      [
        'false',
        'TRIGGER loop redeploy not accepted: Railway answered without serviceInstanceRedeploy=true',
      ],
    ]
    for (const [redeploy, line] of cases) {
      const w = world({ redeploy })
      expect(await runIgla(cfgWith(), w.deps)).toBe(1)
      const b = w.queenCalls()[0].body.body
      expect(b).toContain(line)
      expect(b).not.toContain('needs to deploy')
    }
    for (const [redeploy, why] of [
      [401, 'HTTP 401'],
      ['denied', 'Not Authorized'],
    ]) {
      const w = world({ redeploy })
      await runIgla(cfgWith(), w.deps)
      expect(w.queenCalls()[0].body.body).toContain(
        `TRIGGER loop redeploy refused (${why}): IGLA_RAILWAY_TOKEN needs to deploy`
      )
    }
  })

  it('a forged board never ticks: another repo, executor or runner is BOARD', async () => {
    for (const [over, says] of [
      [{ repo: 'gHashTag/t27' }, 'gHashTag/t27 executor railway runner loop'],
      [
        { executor: 'github' },
        'gHashTag/igla-coder-gpu executor github runner loop',
      ],
      [
        { runner_service: 'judge' },
        'gHashTag/igla-coder-gpu executor railway runner judge',
      ],
    ]) {
      const w = world({ queen: queenBlock(over) })
      expect(await runIgla(cfgWith(), w.deps)).toBe(1)
      expect(w.redeploys()).toHaveLength(0)
      const body = w.queenCalls()[0].body
      expect(body.headline).toMatch(/^igla loop: BOARD/)
      expect(body.body).toContain(`BOARD the board names ${says}`)
      expect(body.body).toContain(
        'this watch gHashTag/igla-coder-gpu executor railway runner loop: no tick'
      )
      expect(body.body).toContain('tick: held: BOARD')
    }
  })

  it('a token of another project, or a re-created service, reads no further and never ticks', async () => {
    for (const token of [
      { projectId: 'another-project', environmentId: ENVIRONMENT },
      { projectId: PROJECT, environmentId: 'another-environment' },
      null,
    ]) {
      const w = world({ token })
      await runIgla(cfgWith(), w.deps)
      expect(w.redeploys()).toHaveLength(0)
      expect(
        w.railwayCalls().filter(c => !c.body.query.includes('projectToken'))
      ).toHaveLength(0)
      expect(w.queenCalls()[0].body.body).toContain(
        'IGLA_RAILWAY_TOKEN is not a project token of igla-judge production'
      )
    }
    for (const services of [
      [
        { id: JUDGE, name: 'judge' },
        { id: SERVICE, name: 'loop-old' },
      ],
      [
        { id: JUDGE, name: 'judge' },
        { id: 'a-new-id', name: 'loop' },
      ],
    ]) {
      const w = world({ services })
      await runIgla(cfgWith(), w.deps)
      expect(w.redeploys()).toHaveLength(0)
      expect(w.queenCalls()[0].body.body).toContain(
        'renamed or re-created? only a commit moves igla.mjs LOOP_*'
      )
    }
  })

  it('not configured: says what it cannot measure, and only IGLA_RAILWAY_TOKEN ticks', async () => {
    const w = world()
    /* The Queen's own Railway and GitHub tokens stay set, and are not used. */
    const cfg = cfgWith({ RUNPOD_API_KEY: '', IGLA_RAILWAY_TOKEN: '' })
    expect(await runIgla(cfg, w.deps)).toBe(0)
    const body = w.queenCalls()[0].body
    expect(body.needs_you).toBe(true)
    expect(body.headline).toMatch(/^igla loop: ok, 3 not measured/)
    expect(body.body).toContain('no RUNPOD_API_KEY on queen-watch')
    expect(body.body).toContain(
      'Railway judge: no IGLA_RAILWAY_TOKEN on queen-watch'
    )
    expect(body.body).toContain(
      'loop runner: no IGLA_RAILWAY_TOKEN on queen-watch, no tick'
    )
    expect(body.body).toContain(
      'tick: none: no IGLA_RAILWAY_TOKEN on queen-watch'
    )
    expect(w.calls.some(c => c.url.includes('runpod'))).toBe(false)
    expect(w.railwayCalls()).toHaveLength(0)
    expect(w.calls.some(c => c.url.includes('github'))).toBe(false)
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

  it('STALE only while idle; a live judge job or loop run counts as work', async () => {
    const stale = world({ queen: queenBlock({ journal_at: iso(40) }) })
    expect(await runIgla(cfgWith(), stale.deps)).toBe(1)
    expect(stale.queenCalls()[0].body.body).toContain(
      'STALE no journal commit for 40 h'
    )
    const judge = world({
      queen: queenBlock({ journal_at: iso(40) }),
      judgeUp: [2],
    })
    expect(await runIgla(cfgWith(), judge.deps)).toBe(0)
    const run = world({
      queen: queenBlock({ journal_at: iso(40) }),
      loop: [{ status: 'SUCCESS', stopped: false, h: 1 }],
    })
    expect(await runIgla(cfgWith(), run.deps)).toBe(0)
  })

  it('JUDGEUP: a judge deployment live past judge_max_h', async () => {
    const w = world({ judgeUp: [9.5] })
    expect(await runIgla(cfgWith(), w.deps)).toBe(1)
    expect(w.queenCalls()[0].body.body).toContain(
      'JUDGEUP igla-judge judge deployment up 9.5 h > 8 h'
    )
    const building = world({
      judgeUp: [{ status: 'BUILDING', stopped: true, h: 9.5 }],
    })
    expect(await runIgla(cfgWith(), building.deps)).toBe(1)
  })

  it('the board live.loop_runner is reported, never the authority', async () => {
    const msg =
      'deployment 52b13c33: missing CLAUDE_CODE_OAUTH_TOKEN, GITHUB_TOKEN, RUNPOD_API_KEY'
    const w = world({
      live: {
        loop_runner: { stage: 'iterate', msg, ts: iso(30) },
      },
    })
    expect(await runIgla(cfgWith(), w.deps)).toBe(0)
    expect(w.queenCalls()[0].body.body).toContain(
      `- board live.loop_runner: iterate: ${msg}`
    )
    /* Railway says the run exited; an old board event does not hold the tick. */
    expect(w.redeploys()).toHaveLength(1)
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
    expect(runs.every(w => w.redeploys().length === 0)).toBe(true)
    expect(runs.every(w => w.railwayCalls().length === 0)).toBe(true)
    /* Measured again: a change, reported and DMed. */
    const back = world({ later: cfg.repeatS + 3600 })
    expect(await runIgla(cfg, back.deps)).toBe(0)
    expect(back.queenCalls()).toHaveLength(1)
    expect(back.tg()).toHaveLength(1)
  })

  it('missing board keys: not measured (exit 2) by name, nothing touched', async () => {
    expect(NEED_STRINGS).toEqual(
      expect.arrayContaining([
        'repo',
        'judge_service',
        'executor',
        'runner_service',
      ])
    )
    expect(NEED_LIMITS).not.toContain('billing_retry_h')
    for (const k of NEED_LIMITS) {
      const limits = { ...LIMITS }
      delete limits[k]
      const w = world({ queen: queenBlock({ limits }) })
      expect(await runIgla(cfgWith(), w.deps)).toBe(2)
      expect(w.log()).toContain(`lacks limits.${k}`)
      expect(w.redeploys()).toHaveLength(0)
      expect(w.railwayCalls()).toHaveLength(0)
      expect(w.queenCalls()[0].body.needs_you).toBe(true)
    }
    for (const k of NEED_STRINGS) {
      const w = world({ queen: queenBlock({ [k]: undefined }) })
      expect(await runIgla(cfgWith(), w.deps)).toBe(2)
      expect(w.log()).toContain(`lacks ${k}`)
      expect(w.redeploys()).toHaveLength(0)
      expect(w.railwayCalls()).toHaveLength(0)
    }
    /* A string where a number belongs is missing too. */
    const typo = world({
      queen: queenBlock({ limits: { ...LIMITS, pod_max_h: '7' } }),
    })
    expect(await runIgla(cfgWith(), typo.deps)).toBe(2)
    /* The retired GitHub tick's keys are no longer needed. */
    const { billing_retry_h, ...noBilling } = LIMITS
    const retired = world({
      queen: queenBlock({
        limits: noBilling,
        workflow: undefined,
        ref: undefined,
      }),
    })
    expect(billing_retry_h).toBe(24)
    expect(await runIgla(cfgWith(), retired.deps)).toBe(0)
    expect(retired.redeploys()).toHaveLength(1)
  })

  it('no journal time or no numeric balance is said, never passed silently', async () => {
    const noJournal = world({ queen: queenBlock({ journal_at: null }) })
    expect(await runIgla(cfgWith(), noJournal.deps)).toBe(0)
    const nj = noJournal.queenCalls()[0].body
    expect(nj.body).toContain(
      'STALE: the board has no journal commit time (journal_at)'
    )
    expect(nj.needs_you).toBe(true)
    for (const balance of [null, 'n/a', '', true]) {
      const w = world({ balance })
      expect(await runIgla(cfgWith(), w.deps)).toBe(0)
      const body = w.queenCalls()[0].body.body
      expect(body).toContain(
        'RunPod answered without a numeric balance or spend'
      )
      expect(body).not.toContain('LOWBAL')
    }
  })

  it('a balance it cannot read still leaves the pods measured', async () => {
    const w = world({
      balance: null,
      pods: [
        {
          name: 'gpuft9',
          desiredStatus: 'RUNNING',
          lastStartedAt: '2026-10-04 05:00:00.000 +0000 UTC',
          costPerHr: 0.69,
        },
      ],
      queen: queenBlock({ journal_at: iso(40) }),
    })
    expect(await runIgla(cfgWith(), w.deps)).toBe(1)
    const body = w.queenCalls()[0].body.body
    expect(body).toContain('OVERRUN gpuft9 running 9.0 h > 7 h')
    expect(body).toContain(
      '- RunPod: balance ?, spend ?, running: gpuft9 9.0 h'
    )
    expect(body).toContain('RunPod answered without a numeric balance or spend')
    /* A running pod is work: no STALE beside it. */
    expect(body).not.toContain('STALE no journal commit')
    expect(body).not.toMatch(/LOWBAL|SPEND \$/)
    /* A numeric string is a number. */
    const str = world({ balance: '9.5' })
    expect(await runIgla(cfgWith(), str.deps)).toBe(1)
    expect(str.queenCalls()[0].body.body).toContain('LOWBAL $9.50 < $')
  })

  it('the DM follows the anomaly codes; a blind line goes to the Queen only', async () => {
    const cfg = cfgWith({ RUNPOD_API_KEY: '' })
    const first = world()
    await runIgla(cfg, first.deps)
    expect(first.tg()).toHaveLength(1)
    const seen = world({ loop: [{ ...EXITED, h: 1 }] })
    await runIgla(cfgWith({}, { stateDir: cfg.stateDir }), seen.deps)
    expect(seen.queenCalls()).toHaveLength(1)
    expect(seen.tg()).toHaveLength(0)
    const low = world({ loop: [{ ...EXITED, h: 1 }], balance: 3 })
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

  it('IGLA=0 is off, IGLA_TRIGGER=0 watches without the tick', async () => {
    const off = world()
    expect(await runIgla(cfgWith({ IGLA: '0' }), off.deps)).toBe(0)
    expect(off.calls).toHaveLength(0)
    const watch = world()
    await runIgla(cfgWith({ IGLA_TRIGGER: '0' }), watch.deps)
    expect(watch.redeploys()).toHaveLength(0)
    expect(watch.railwayCalls().length).toBeGreaterThan(0)
    expect(watch.queenCalls()[0].body.body).toContain(
      'tick: off (IGLA_TRIGGER=0)'
    )
  })

  it('no secret reaches a request body or the log', async () => {
    const w = world({ balance: 1, judgeUp: [20], redeploy: 403 })
    await runIgla(cfgWith(), w.deps)
    for (const s of SECRETS) {
      expect(w.log()).not.toContain(s)
      for (const c of w.calls) expect(c.raw).not.toContain(s)
    }
    /* The retired IGLA_GITHUB_TOKEN is sent nowhere, not even as a header. */
    for (const c of w.calls)
      expect(JSON.stringify(c.headers)).not.toContain(IGH)
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

  it('reads a deployment as the runner contract measured it', () => {
    const at = (status, deploymentStopped) => ({ status, deploymentStopped })
    expect(runState(at('INITIALIZING', true))).toBe('building')
    expect(runState(at('BUILDING', true))).toBe('building')
    expect(runState(at('DEPLOYING', true))).toBe('building')
    expect(runState(at('SUCCESS', false))).toBe('running')
    expect(runState(at('SUCCESS', true))).toBe('exited ok')
    expect(runState(at('CRASHED', true))).toBe('exited failed')
    expect(runState(at('REMOVED', true))).toBe(null)
    /* queen_igla.py dep_live, for the judge. */
    expect(isLive(at('SUCCESS', false))).toBe(true)
    expect(isLive(at('SUCCESS', true))).toBe(false)
    expect(isLive(at('DEPLOYING', true))).toBe(true)
    expect(isLive(at('CRASHED', true))).toBe(false)
    expect(isLive(at('REMOVED', true))).toBe(false)
  })

  it('a tick is due tick_h after the last run or redeploy, never sooner', () => {
    const q = queenBlock()
    const cfg = cfgWith()
    const loop = h => ({
      last: { createdAt: iso(h), state: 'exited ok', live: false },
    })
    const base = { q, busy: 'false', cfg, nowS: NOW, st: {}, anom: [] }
    expect(dueTick({ ...base, loop: loop(5) })).toBe(false)
    expect(dueTick({ ...base, loop: loop(6.1) })).toBe(true)
    expect(
      dueTick({ ...base, loop: loop(6.1), st: { triggered_at: NOW - 60 } })
    ).toBe(false)
    expect(dueTick({ ...base, loop: loop(6.1), busy: 'unknown' })).toBe(false)
    expect(dueTick({ ...base, loop: loop(6.1), busy: 'true' })).toBe(false)
    expect(dueTick({ ...base, loop: loop(6.1), anom: ['BOARD x'] })).toBe(false)
    expect(
      dueTick({
        ...base,
        loop: { last: { ...loop(30).last, state: 'running', live: true } },
      })
    ).toBe(false)
    expect(dueTick({ ...base, loop: { error: 'x' } })).toBe(false)
    expect(dueTick({ ...base, loop: { last: null } })).toBe(false)
    expect(
      dueTick({ ...base, loop: loop(30), cfg: { ...cfg, iglaTrigger: false } })
    ).toBe(false)
  })

  it('assess carries no limit of its own', () => {
    const q = queenBlock({ limits: { ...LIMITS, min_balance: 50 } })
    const { anom, blind, busy } = assess({
      q,
      snap: {},
      pods: { balance: 40, spend: 0, running: [] },
      judgeUp: { up: [] },
      loop: { last: { state: 'exited ok', live: false, h: 7 } },
      nowS: NOW,
    })
    expect(anom).toEqual(['LOWBAL $40.00 < $50: no new spend'])
    expect(blind).toEqual([])
    expect(busy).toBe('false')
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
