/**
 * release.mjs: the board's QUEEN_REF bump (the port of
 * .github/workflows/queen-ref-bump.yml) that rides queen-watch's hourly run.
 * Every network call is a fake; nothing here reaches GitHub, Telegram or the
 * Queen.
 */
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  EVERY_S,
  brings,
  bump,
  commitMessage,
  prBody,
  readPin,
  runRelease,
  tokensOf,
} from './release.mjs'
import { config, secretsOf } from './watch.mjs'

/* Deliberately fake values, long enough to be scrubbed. */
const QUEEN = 'fake-queen-tok-0004'
const TG = 'fake-tg-tok-0005'
const GH = 'fake-trios-gh-tok-0006'
const REL = 'fake-release-gh-tok-0010'
const SECRETS = [QUEEN, TG, GH, REL]

const NOW = Date.parse('2026-10-04T14:00:00Z') / 1000
const PINNED = 'd047a86998609a4bc603f44f700647ba7065aabe'
const HEAD = 'f9065e88b14c715fcea625f4f8b927910185dc85'
const BASE = '1111111111111111111111111111111111111111'
const APP = 'https://api.github.com/repos/gHashTag/999-multibots-telegraf'
const TRINITY = 'https://api.github.com/repos/gHashTag/trinity'
const DOCKER = [
  'FROM node:20-bookworm-slim',
  '# bumping QUEEN_REF below is exactly the commit that ships it',
  `ARG QUEEN_REF=${PINNED}`,
  'RUN git fetch -q --depth 1 origin "$QUEEN_REF"',
  '',
].join('\n')
const COMMITS = [
  {
    sha: '7e9b19a0000000000000000000000000000000aa',
    commit: { message: 'docs(blog): compile time\n\nlong body' },
  },
  {
    sha: HEAD,
    commit: { message: 'play: a terminal for the seven t27 backends (#1366)' },
  },
]

function cfgWith(env = {}, over = {}) {
  return {
    ...config({
      TRIOS_API_TOKEN: QUEEN,
      OWNER_BOT_TOKEN: TG,
      GITHUB_TOKEN: GH,
      RELEASE_GITHUB_TOKEN: REL,
      STATE_DIR: mkdtempSync(join(tmpdir(), 'release-')),
      ...env,
    }),
    ...over,
  }
}

const res = (status, body) => ({
  status,
  text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
})
const b64 = s => Buffer.from(s, 'utf8').toString('base64')

/** A fake GitHub; every knob answers like production by default. */
function world({
  head = HEAD,
  docker = DOCKER,
  baseStatus = 200,
  compare = 200,
  prs = [],
  prsStatus = 200,
  ref = 201,
  branchDocker = DOCKER,
  put = 201,
  pr = 201,
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
    if (u === `${APP}/git/ref/heads/main`)
      return baseStatus === 200
        ? res(200, { object: { sha: BASE } })
        : res(baseStatus, { message: 'Not Found' })
    if (u === `${APP}/contents/apps/vibee-editor/Dockerfile?ref=${BASE}`)
      return res(200, { content: b64(docker), sha: 'blob-main' })
    if (
      u.startsWith(`${APP}/contents/apps/vibee-editor/Dockerfile?ref=release`)
    )
      return res(200, { content: b64(branchDocker), sha: 'blob-branch' })
    if (u === `${TRINITY}/git/ref/heads/main`)
      return res(200, { object: { sha: head } })
    if (u.startsWith(`${TRINITY}/compare/`))
      return compare === 200
        ? res(200, { commits: COMMITS })
        : res(compare, { message: 'Server Error' })
    if (u.startsWith(`${APP}/pulls?`))
      return prsStatus === 200 ? res(200, prs) : res(prsStatus, 'down')
    if (u === `${APP}/git/refs` && method === 'POST')
      return res(ref, ref === 201 ? { ref: 'x' } : { message: 'nope' })
    if (
      u === `${APP}/contents/apps/vibee-editor/Dockerfile` &&
      method === 'PUT'
    )
      return res(put, put === 201 ? { content: {} } : { message: 'sha' })
    if (u === `${APP}/pulls` && method === 'POST')
      return pr === 201
        ? res(201, {
            number: 3700,
            html_url:
              'https://github.com/gHashTag/999-multibots-telegraf/pull/3700',
          })
        : res(pr, { message: 'Validation Failed' })
    if (u.endsWith('/queen/report')) return res(201, { id: 9 })
    if (u.endsWith('/sendMessage')) return res(200, { ok: true })
    return res(404, 'unexpected')
  }
  const deps = {
    fetch,
    sleep: async () => {},
    now: () => NOW + later,
    write: s => out.push(s),
  }
  const gh = () => calls.filter(c => c.url.startsWith('https://api.github.com'))
  return {
    calls,
    deps,
    log: () => out.join(''),
    gh,
    writes: () => gh().filter(c => c.method !== 'GET'),
    queenCalls: () => calls.filter(c => c.url.endsWith('/queen/report')),
    tg: () => calls.filter(c => c.url.endsWith('/sendMessage')),
  }
}

describe('release: QUEEN_REF follows trinity on the Queen', () => {
  it('current: nothing is written, and the next slot is quiet', async () => {
    const cfg = cfgWith()
    const w = world({ head: PINNED })
    expect(await runRelease(cfg, w.deps)).toBe(0)
    expect(w.writes()).toHaveLength(0)
    expect(w.calls.some(c => c.url.includes('/compare/'))).toBe(false)
    expect(w.log()).toContain('the board is current at d047a86')
    const q = w.queenCalls()
    expect(q).toHaveLength(1)
    expect(q[0].body.source).toBe('board-release')
    expect(q[0].body.needs_you).toBe(false)
    const next = world({ head: PINNED, later: EVERY_S })
    expect(await runRelease(cfg, next.deps)).toBe(0)
    expect(next.writes()).toHaveLength(0)
    expect(next.queenCalls()).toHaveLength(0)
    expect(next.tg()).toHaveLength(0)
  })

  it('behind: branch at main, the one-line commit, the pull request', async () => {
    /* No variable moves the repository the token writes to. */
    const cfg = cfgWith({ GITHUB_REPO: 'gHashTag/t27' })
    const w = world()
    expect(await runRelease(cfg, w.deps)).toBe(0)
    const writes = w.writes()
    expect(writes.map(c => `${c.method} ${c.url}`)).toEqual([
      `POST ${APP}/git/refs`,
      `PUT ${APP}/contents/apps/vibee-editor/Dockerfile`,
      `POST ${APP}/pulls`,
    ])
    /* Every write is RELEASE_GITHUB_TOKEN's, never the TRIOS GITHUB_TOKEN. */
    expect(writes.every(c => c.auth === `Bearer ${REL}`)).toBe(true)
    expect(w.calls.some(c => c.url.includes('gHashTag/t27'))).toBe(false)
    expect(writes[0].body).toEqual({
      ref: 'refs/heads/release/board-f9065e8',
      sha: BASE,
    })
    const put = writes[1].body
    expect(put.branch).toBe('release/board-f9065e8')
    expect(put.sha).toBe('blob-main')
    expect(Buffer.from(put.content, 'base64').toString('utf8')).toBe(
      DOCKER.replace(`ARG QUEEN_REF=${PINNED}`, `ARG QUEEN_REF=${HEAD}`)
    )
    expect(put.message).toBe(
      'release(board): ship trinity f9065e8\n\n' +
        'The board is pinned by commit id, so a merge in gHashTag/trinity ships nothing until this line moves. It was 2 commit(s) behind.\n\n' +
        'QUEEN_REF d047a86 -> f9065e8'
    )
    const pr = writes[2].body
    expect(pr.title).toBe('release(board): ship trinity f9065e8')
    expect(pr.head).toBe('release/board-f9065e8')
    expect(pr.base).toBe('main')
    expect(pr.body).toContain('It was **2 commit(s)** behind.')
    expect(pr.body).toContain('`QUEEN_REF` `d047a86` → `f9065e8`')
    expect(pr.body).toContain(
      '## What this ships\n- 7e9b19a docs(blog): compile time\n- f9065e8 play: a terminal for the seven t27 backends (#1366)\n'
    )
    expect(pr.body).toContain(
      'Merging is deliberately left to a person: this is the release.'
    )
    const q = w.queenCalls()
    expect(q).toHaveLength(1)
    expect(q[0].body.needs_you).toBe(true)
    expect(q[0].body.headline).toBe(
      'board release: opened #3700 -- release(board): ship trinity f9065e8'
    )
    expect(q[0].body.body).toContain(
      'opened #3700: https://github.com/gHashTag/999-multibots-telegraf/pull/3700'
    )
  })

  it('a pull request already open for the head: nothing is written', async () => {
    const w = world({ prs: [{ number: 3607, state: 'open' }] })
    expect(await runRelease(cfgWith(), w.deps)).toBe(0)
    expect(w.writes()).toHaveLength(0)
    const check = w.gh().find(c => c.url.startsWith(`${APP}/pulls?`))
    expect(check.url).toContain(
      `head=${encodeURIComponent('gHashTag:release/board-f9065e8')}`
    )
    expect(w.log()).toContain('already open: #3607')
  })

  it('no token at all: not measured, nothing read, nothing written', async () => {
    const w = world()
    const cfg = cfgWith({ GITHUB_TOKEN: '', RELEASE_GITHUB_TOKEN: '' })
    expect(await runRelease(cfg, w.deps)).toBe(2)
    expect(w.gh()).toHaveLength(0)
    expect(w.log()).toContain(
      'no RELEASE_GITHUB_TOKEN or GITHUB_TOKEN on queen-watch'
    )
    expect(w.log()).toContain('board-release: not measured')
    expect(w.queenCalls()[0].body.needs_you).toBe(true)
  })

  it('a refused write is a WRITE anomaly, DMed once, reported again after REPEAT_S', async () => {
    const cfg = cfgWith()
    const w = world({ ref: 403 })
    expect(await runRelease(cfg, w.deps)).toBe(1)
    expect(w.writes()).toHaveLength(1)
    const body = w.queenCalls()[0].body
    expect(body.needs_you).toBe(true)
    expect(body.headline).toBe('board release: WRITE')
    expect(body.body).toContain(
      'WRITE branch release/board-f9065e8 refused (HTTP 403): RELEASE_GITHUB_TOKEN needs Contents and Pull requests read+write on gHashTag/999-multibots-telegraf'
    )
    expect(w.tg()).toHaveLength(1)
    /* The next slot, still refused: the codes did not change -- no DM. */
    const again = world({ ref: 403, later: EVERY_S })
    expect(await runRelease(cfg, again.deps)).toBe(1)
    expect(again.tg()).toHaveLength(0)
    expect(again.queenCalls()).toHaveLength(1)
    /* The file and the pull request are refused in their own words. */
    const put = world({ put: 409 })
    expect(await runRelease(cfgWith(), put.deps)).toBe(1)
    expect(put.writes()).toHaveLength(2)
    expect(put.queenCalls()[0].body.body).toContain(
      'WRITE apps/vibee-editor/Dockerfile on release/board-f9065e8 not accepted: GitHub answered HTTP 409'
    )
    const pr = world({ pr: 500 })
    expect(await runRelease(cfgWith(), pr.deps)).toBe(1)
    expect(pr.queenCalls()[0].body.body).toContain(
      'WRITE pull request for release/board-f9065e8 not accepted: GitHub answered HTTP 500'
    )
  })

  it('the TRIOS GITHUB_TOKEN reads and never writes', async () => {
    const w = world()
    const cfg = cfgWith({ RELEASE_GITHUB_TOKEN: '' })
    expect(await runRelease(cfg, w.deps)).toBe(1)
    expect(w.writes()).toHaveLength(0)
    expect(w.gh().length).toBeGreaterThan(0)
    expect(w.gh().every(c => c.auth === `Bearer ${GH}`)).toBe(true)
    const body = w.queenCalls()[0].body
    expect(body.headline).toBe('board release: UNWRITTEN')
    expect(body.body).toContain(
      'UNWRITTEN the board is 2 commit(s) behind gHashTag/trinity (d047a86 -> f9065e8) and no release pull request is open: no RELEASE_GITHUB_TOKEN on queen-watch to open one'
    )
    /* A RELEASE_GITHUB_TOKEN that IS the TRIOS token is not a write token. */
    const same = world()
    const c2 = cfgWith({ RELEASE_GITHUB_TOKEN: GH })
    expect(await runRelease(c2, same.deps)).toBe(1)
    expect(same.writes()).toHaveLength(0)
    expect(same.log()).toContain(
      'RELEASE_GITHUB_TOKEN is the TRIOS GITHUB_TOKEN: it reads here, it never writes'
    )
    expect(tokensOf({ ghToken: GH, releaseGhToken: GH }).write).toBe('')
  })

  it('once per six-hour slot: the next hour in the same slot reads nothing', async () => {
    const cfg = cfgWith()
    await runRelease(cfg, world({ head: PINNED }).deps)
    const hour = world({ head: PINNED, later: 3600 })
    expect(await runRelease(cfg, hour.deps)).toBe(0)
    expect(hour.calls).toHaveLength(0)
    expect(hour.log()).toContain(
      'not due (every 6 h; next slot 2026-10-04T18:00:00Z)'
    )
  })

  it('a failed pull request check is not "none open": nothing written', async () => {
    const w = world({ prsStatus: 502 })
    expect(await runRelease(cfgWith(), w.deps)).toBe(2)
    expect(w.writes()).toHaveLength(0)
  })

  it('a half-written branch is finished; a closed release is not reopened', async () => {
    /* Created by an earlier run, the file never moved: PUT, then the PR. */
    const half = world({ ref: 422 })
    expect(await runRelease(cfgWith(), half.deps)).toBe(0)
    expect(half.writes().map(c => c.method)).toEqual(['POST', 'PUT', 'POST'])
    expect(half.writes()[1].body.sha).toBe('blob-branch')
    /* Moved, but no pull request yet: only the PR. */
    const moved = DOCKER.replace(PINNED, HEAD)
    const noPr = world({ ref: 422, branchDocker: moved })
    expect(await runRelease(cfgWith(), noPr.deps)).toBe(0)
    expect(noPr.writes().map(c => c.method)).toEqual(['POST', 'POST'])
    /* A person closed this head's release: not reopened. */
    const closed = world({
      ref: 422,
      branchDocker: moved,
      prs: [{ number: 3587, state: 'closed', merged_at: null }],
    })
    expect(await runRelease(cfgWith(), closed.deps)).toBe(1)
    expect(closed.writes()).toHaveLength(1)
    expect(closed.queenCalls()[0].body.body).toContain(
      'its pull request #3587 was closed unmerged: not reopened'
    )
  })

  it('no pin line is a PIN anomaly and writes nothing', async () => {
    const w = world({ docker: 'FROM node:20\nARG QUEEN_REF=main\n' })
    expect(await runRelease(cfgWith(), w.deps)).toBe(1)
    expect(w.writes()).toHaveLength(0)
    expect(w.queenCalls()[0].body.headline).toBe('board release: PIN')
  })

  it('BOARD_RELEASE=0 is off; no secret reaches a request body or the log', async () => {
    const off = world()
    expect(await runRelease(cfgWith({ BOARD_RELEASE: '0' }), off.deps)).toBe(0)
    expect(off.calls).toHaveLength(0)
    const cfg = cfgWith()
    expect(secretsOf(cfg)).toContain(REL)
    const w = world({ ref: 403 })
    await runRelease(cfg, w.deps)
    for (const s of SECRETS) {
      expect(w.log()).not.toContain(s)
      for (const c of w.calls) expect(c.raw).not.toContain(s)
    }
  })
})

describe('release: the workflow words', () => {
  it('reads the first 40-hex pin line only', () => {
    expect(readPin(DOCKER)).toBe(PINNED)
    expect(readPin(`ARG QUEEN_REF=${PINNED} \n`)).toBe(null)
    expect(readPin(`ARG QUEEN_REF=${PINNED.toUpperCase()}`)).toBe(null)
    expect(readPin(`# ARG QUEEN_REF=${PINNED}\nARG QUEEN_REF=${HEAD}`)).toBe(
      HEAD
    )
  })

  it('bumps every exact pin line and nothing else', () => {
    const text = `ARG QUEEN_REF=${PINNED}\n# ARG QUEEN_REF=${PINNED}\n`
    expect(bump(text, PINNED, HEAD)).toBe(
      `ARG QUEEN_REF=${HEAD}\n# ARG QUEEN_REF=${PINNED}\n`
    )
  })

  it('lists the last 40 commits, or says the comparison was not read', () => {
    const many = Array.from({ length: 45 }, (_, i) => ({
      sha: `${String(i).padStart(7, '0')}${'0'.repeat(33)}`,
      commit: { message: `c${i}\nbody` },
    }))
    const lines = brings(many)
    expect(lines).toHaveLength(40)
    expect(lines[0]).toBe('- 0000005 c5')
    expect(brings(null)).toEqual(['- (the comparison could not be read)'])
    expect(prBody(PINNED, HEAD, brings(null))).toContain(
      'It was **1 commit(s)** behind.'
    )
    expect(commitMessage(PINNED, HEAD, 3).split('\n\n')).toHaveLength(3)
  })
})
