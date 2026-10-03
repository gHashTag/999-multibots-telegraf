import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as SPEC from '../spec/kanban-card-chat.gen'

vi.mock('../hive/queen-client', () => ({
  QUEEN_BASE: 'https://queen.test',
  queenIndex: async () => ({ repo: 'gHashTag/t27', cards: new Map() }),
}))

import {
  clearCardWorkCache,
  commandShown,
  dispatchShown,
  handleCardWork,
  maskSecrets,
  modelFromDetail,
  resultShown,
  rowsShown,
  toolShown,
} from './card-work'

const A = '11111111-2222-4333-8444-555555555555'
const B = '99999999-2222-4333-8444-555555555555'
const WT = '/workspace/t27/.worktrees/queen-5673'
const KEY = 'sk-proj-AbC123dEf456GhI789jKl012MnO345' // secret-guard-ok: fake key, the masking fixture

const entry = (seq: number, kind: string, text: string, cid = A) => ({
  conversationId: cid,
  seq,
  issue: 5673,
  at: `2026-10-03T10:00:${String(seq % 60).padStart(2, '0')}Z`,
  kind,
  text,
})

const dispatch = (cid = A, finishedAt: string | null = null) => ({
  issue: 5673,
  branch: 'queen/5673',
  detail: 'openai-compatible/z-ai/glm-5.3 key 13/24 lane 1/2',
  conversationId: cid,
  finishedAt,
  outcome: finishedAt ? 'pr_opened' : null,
  dispatchedAt: '2026-10-03T09:59:00Z',
})

describe('commandShown', () => {
  it('shows the command as written, without the worktree cd or echo banners', () => {
    expect(
      commandShown(
        `cd ${WT} && echo "== parse ==" && t27c parse demos/lock.t27 && tri test lock`
      )
    ).toBe('t27c parse demos/lock.t27 && tri test lock')
    expect(commandShown(`git -C ${WT} status --short | head -5`)).toBe(
      'git -C status --short | head -5'
    )
  })

  it('cuts a segment at the first word that could carry a value', () => {
    expect(commandShown(`cd ${WT} && M=specs/x.t27 && t27c parse $M`)).toBe(
      't27c parse …'
    )
    expect(
      commandShown(`curl -H "Authorization: Bearer ${KEY}" https://x`)
    ).toBe('curl -H …')
    expect(commandShown(`TOKEN=${KEY} tri publish`)).toBe('…')
    expect(commandShown('gh api repos/x --jq `whoami`')).toBe(
      'gh api repos/x --jq …'
    )
    expect(commandShown(`tri run ${KEY}`)).not.toContain(KEY.slice(8))
  })

  it('a heredoc or a second line is said, not shown', () => {
    expect(commandShown("cat > a.t27 <<'EOF'\nsecret body\nEOF")).toBe(
      'cat > a.t27 … …'
    )
    expect(commandShown(`tri ${'x'.repeat(400)}`).length).toBeLessThanOrEqual(
      SPEC.BEE_LINE_MAX
    )
  })
})

describe('maskSecrets', () => {
  it('masks keys and long mixed runs, keeps identifiers and words', () => {
    expect(maskSecrets(`key ${KEY} end`)).toBe('key sk-p… end')
    expect(maskSecrets('ghp_abcdef123456')).toBe('ghp_…')
    expect(maskSecrets('a1b2c3d4e5f6a7b8c9d0e1f2a3b4')).toBe('a1b2…')
    expect(maskSecrets('check_t27_specs_against_the_host')).toBe(
      'check_t27_specs_against_the_host'
    )
    expect(maskSecrets('commit 3b616b8fa')).toBe('commit 3b616b8fa')
  })
})

describe('toolShown and resultShown', () => {
  it('names the tool short and the path inside the bee tree', () => {
    expect(
      toolShown(`filesystem_bash  cd ${WT} && t27c parse specs/a.t27`)
    ).toEqual({ tool: 'bash', text: 't27c parse specs/a.t27' })
    expect(toolShown(`filesystem_read  ${WT}/demos/lock.t27`)).toEqual({
      tool: 'read',
      text: 'demos/lock.t27',
    })
    expect(toolShown('github_create_pr').tool).toBe('github_create_pr')
  })

  it('a result is ok or failed, its first line and its length', () => {
    expect(resultShown('FAILED  exit 1: parse error at 3:7\nmore')).toEqual({
      ok: false,
      text: 'exit 1: parse error at 3:7',
      lines: 2,
    })
    expect(resultShown(`Wrote 812 bytes to ${WT}/specs/a.t27`)).toEqual({
      ok: true,
      text: 'Wrote 812 bytes to specs/a.t27',
      lines: 1,
    })
    expect(resultShown('\u001b[32mPASS\u001b[0m 24/24').text).toBe('PASS 24/24')
  })
})

describe('dispatchShown', () => {
  it('reads the attempt, its model, running until finished', () => {
    expect(dispatchShown(dispatch())).toEqual({
      conversation: A,
      branch: 'queen/5673',
      model: 'glm-5.3',
      dispatchedAt: '2026-10-03T09:59:00Z',
      finishedAt: null,
      outcome: null,
      running: true,
    })
    expect(dispatchShown(dispatch(A, '2026-10-03T10:30:00Z'))?.running).toBe(
      false
    )
    expect(dispatchShown(null)).toBeNull()
    expect(dispatchShown({ ...dispatch(), conversationId: '../x' })).toBeNull()
    expect(modelFromDetail('nothing here')).toBe('')
  })
})

describe('rowsShown', () => {
  const page = [
    entry(5, 'tool', `filesystem_bash  cd ${WT} && tri test lock`),
    entry(1, 'say', 'I will read '),
    entry(2, 'say', 'the spec first.'),
    entry(3, 'tool', `filesystem_read  ${WT}/specs/a.t27`),
    entry(4, 'result', 'module a;\n; ...'),
    entry(6, 'result', 'FAILED  1 test failed'),
    entry(7, 'say', `the key is ${KEY}`),
    entry(8, 'tool', 'filesystem_ls  /', B),
  ]

  it('one attempt, oldest first, thoughts joined', () => {
    const { rows, next } = rowsShown(page, A, 0, true)
    expect(next).toBe(7)
    expect(rows.map(r => [r.seq, r.kind])).toEqual([
      [2, 'thought'],
      [3, 'tool'],
      [4, 'result'],
      [5, 'tool'],
      [6, 'result'],
      [7, 'thought'],
    ])
    expect(rows[0].text).toBe('I will read the spec first.')
    expect(rows[5].text).toBe('the key is sk-p…')
    expect(rows[4]).toMatchObject({ ok: false, text: '1 test failed' })
  })

  it('a person who is not a keeper sees that it thinks, not what', () => {
    const { rows } = rowsShown(page, A, 0, false)
    expect(rows.filter(r => r.kind === 'thought').map(r => r.text)).toEqual([
      '',
      '',
    ])
    expect(JSON.stringify(rows)).not.toContain('spec first')
  })

  it('from `since` on, and bounded', () => {
    expect(rowsShown(page, A, 5, true).rows.map(r => r.seq)).toEqual([6, 7])
    const many = Array.from({ length: 700 }, (_, i) =>
      entry(i + 1, 'tool', 'filesystem_ls  specs')
    )
    const { rows } = rowsShown(many, A, 0, true)
    expect(rows).toHaveLength(SPEC.BEE_ROWS_MAX)
    expect(rows[rows.length - 1].seq).toBe(700)
    const long = rowsShown([entry(1, 'say', 'word '.repeat(300))], A, 0, true)
      .rows[0]
    expect(long.text.length).toBe(SPEC.BEE_THOUGHT_MAX)
  })
})

describe('handleCardWork', () => {
  beforeEach(() => clearCardWorkCache())

  const door = async (
    url: string,
    opts: Parameters<typeof handleCardWork>[3] = {},
    who = '42'
  ) => {
    let code = 0
    let body = ''
    await handleCardWork(
      { url } as never,
      {
        writeHead: (c: number) => void (code = c),
        end: (b: string) => void (body = b),
      } as never,
      who,
      { keeperIds: () => ['7'], ...opts }
    )
    return { code, body: JSON.parse(body) }
  }
  const env = { [SPEC.BEE_TOKEN_ENV]: 'queen-token' }
  const queen = (body: unknown, status = 200) =>
    vi.fn(
      async (_url: string, _init?: RequestInit) =>
        new Response(JSON.stringify(body), { status })
    )

  it('no token: 503, the Queen never asked; a bad task: 400', async () => {
    const f = queen({})
    const off = await door('/api/card-work?task=gHashTag/t27%235673', {
      env: {},
      fetchImpl: f as never,
    })
    expect(off).toEqual({ code: 503, body: { configured: false } })
    expect(f).not.toHaveBeenCalled()
    expect((await door('/api/card-work?task=nope', { env })).code).toBe(400)
  })

  it('asks with the token, from the server, and never answers it', async () => {
    const f = queen({ entries: page5673(), dispatch: dispatch() })
    const r = await door('/api/card-work?task=gHashTag/t27%235673', {
      env,
      fetchImpl: f as never,
    })
    expect(r.code).toBe(200)
    const [url, init] = f.mock.calls[0]
    expect(String(url)).toBe('https://queen.test/queen/feed/data?issue=5673')
    expect((init?.headers as Record<string, string>).Authorization).toBe(
      'Bearer queen-token'
    )
    expect(JSON.stringify(r.body)).not.toContain('queen-token')
    expect(r.body).toMatchObject({
      configured: true,
      measured: true,
      reset: false,
      prose: false,
      next: 3,
      bee: { conversation: A, running: true, model: 'glm-5.3' },
    })
    expect(r.body.rows).toHaveLength(3)
  })

  it('a keeper reads the words; a later poll asks only for what is new', async () => {
    const f = queen({ entries: page5673(), dispatch: dispatch() })
    const k = await door(
      '/api/card-work?task=gHashTag/t27%235673',
      { env, fetchImpl: f as never },
      '7'
    )
    expect(k.body.prose).toBe(true)
    expect(k.body.rows[0].text).toBe('reading')
    const g = queen({
      entries: [entry(4, 'tool', 'filesystem_bash  tri test lock')],
      dispatch: dispatch(),
    })
    const r = await door(
      `/api/card-work?task=gHashTag/t27%235673&conversation=${A}&since=3`,
      { env, fetchImpl: g as never }
    )
    expect(String(g.mock.calls[0][0])).toBe(
      `https://queen.test/queen/feed/data?issue=5673&conversation=${A}&since=3`
    )
    expect(r.body.rows).toEqual([
      expect.objectContaining({ seq: 4, tool: 'bash', text: 'tri test lock' }),
    ])
    expect(r.body.reset).toBe(false)
  })

  it('a new attempt under the sheet: read afresh and say reset', async () => {
    const f = vi.fn(
      async (url: string) =>
        new Response(
          JSON.stringify(
            url.includes('since=')
              ? { entries: [], dispatch: dispatch(B) }
              : {
                  entries: [entry(1, 'tool', 'filesystem_ls  specs', B)],
                  dispatch: dispatch(B),
                }
          )
        )
    )
    const r = await door(
      `/api/card-work?task=gHashTag/t27%235673&conversation=${A}&since=40`,
      { env, fetchImpl: f as never }
    )
    expect(f).toHaveBeenCalledTimes(2)
    expect(r.body).toMatchObject({ reset: true, next: 1 })
    expect(r.body.bee.conversation).toBe(B)
  })

  it('no bee, a stranger board, a silent Queen -- each said as itself', async () => {
    const none = await door('/api/card-work?task=gHashTag/t27%231', {
      env,
      fetchImpl: queen({ entries: [], dispatch: null }) as never,
    })
    expect(none.body).toEqual({ configured: true, measured: true, bee: null })
    const f = queen({})
    const other = await door('/api/card-work?task=gHashTag/trinity%237', {
      env,
      fetchImpl: f as never,
    })
    expect(other.body).toEqual({ configured: true, measured: true, bee: null })
    expect(f).not.toHaveBeenCalled()
    const silent = await door('/api/card-work?task=gHashTag/t27%232', {
      env,
      fetchImpl: queen({}, 403) as never,
    })
    expect(silent.body).toEqual({ configured: true, measured: false })
  })

  it('people watching one card share one read', async () => {
    const f = queen({ entries: page5673(), dispatch: dispatch() })
    let t = 1000
    const opts = { env, fetchImpl: f as never, now: () => t }
    await Promise.all([
      door('/api/card-work?task=gHashTag/t27%235673', opts),
      door('/api/card-work?task=gHashTag/t27%235673', opts, '8'),
    ])
    await door('/api/card-work?task=gHashTag/t27%235673', opts)
    expect(f).toHaveBeenCalledTimes(1)
    t += SPEC.BEE_CACHE_S * 1000
    await door('/api/card-work?task=gHashTag/t27%235673', opts)
    expect(f).toHaveBeenCalledTimes(2)
  })
})

function page5673() {
  return [
    entry(3, 'result', 'ok'),
    entry(2, 'tool', `filesystem_bash  cd ${WT} && t27c parse specs/a.t27`),
    entry(1, 'say', 'reading'),
  ]
}
