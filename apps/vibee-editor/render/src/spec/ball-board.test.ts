import { afterEach, describe, expect, it, vi } from 'vitest'
import * as SPEC from './ball-board.gen'
import {
  BALL_BOARD_TOOLS,
  BALL_OWNER,
  ballRank,
  fresh,
  groupByClient,
  mailBall,
  mayRead,
  workBall,
} from '../agent/ball-board'
import { CRM_TOUCH_TOOLS } from '../agent/crm-touch-tools'

/**
 * THE BALL BOARD IS WRITTEN IN t27 FIRST (skill t27-spec-first).
 *
 * gHashTag/t27 specs/automation/ball-board.t27 is the spec of record; that
 * the vendored copy, its generated module and the host agree is held by
 * scripts/check-t27-specs.mjs. Here each `test` of the spec runs against the
 * HOST, src/agent/ball-board.ts: its pure decisions, and the three tools over
 * a stubbed pool and a stubbed crm_waiting -- no database, no GitHub.
 *
 * Refresh: node scripts/sync-t27-spec.mjs <t27 checkout> automation/ball-board
 */

const tool = (name: string) => {
  const t = BALL_BOARD_TOOLS.find(x => x.name === name)
  if (!t) throw new Error(`no ${name}`)
  return t
}

const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000)

interface Tables {
  links?: Array<{ client: string; kind: string; value: string }>
  mail?: Array<Record<string, unknown>>
  work?: Array<Record<string, unknown>>
}

/** A pool that answers by table name and records every statement. */
function stubPool(t: Tables) {
  const sql: string[] = []
  const params: unknown[][] = []
  return {
    sql,
    params,
    async query(q: string, p: unknown[] = []) {
      sql.push(q)
      params.push(p)
      if (/^\s*SELECT/.test(q) && q.includes(SPEC.LINK_TABLE))
        return { rows: t.links ?? [] }
      if (/^\s*SELECT/.test(q) && q.includes(SPEC.MAIL_TABLE))
        return { rows: t.mail ?? [] }
      if (/^\s*SELECT/.test(q) && q.includes(SPEC.WORK_TABLE))
        return { rows: t.work ?? [] }
      return { rows: [] }
    },
  }
}

/** crm_waiting, answered: the board must call it, never re-derive it. */
function stubCrm(waiting: Array<Record<string, unknown>>) {
  const crm = CRM_TOUCH_TOOLS.find(x => x.name === SPEC.CRM_TOOL)!
  return vi.spyOn(crm, 'handler').mockResolvedValue({
    total: waiting.length,
    waiting,
  })
}

type Board = {
  total: number
  counts: Record<string, number>
  sources: Record<string, { status: string; cards: number; age_h?: number }>
  clients: Array<{
    key: string
    name: string
    ball: string
    cards: Array<{ source: string; ball: string; ref: string }>
  }>
}

async function board(pool: ReturnType<typeof stubPool>, who = BALL_OWNER) {
  return (await tool(SPEC.TOOL).handler({}, {
    telegramId: who,
    pool,
  } as never)) as Board
}

afterEach(() => vi.restoreAllMocks())

describe('automation/ball-board -- the spec, against the host', () => {
  it("the mailbox's owes_reply becomes the ball, and nothing else is invented", async () => {
    expect(mailBall('us')).toBe(SPEC.BALL_OURS)
    expect(mailBall('them')).toBe(SPEC.BALL_THEIRS)
    expect(mailBall('')).toBe(SPEC.BALL_NONE)
    expect(mailBall('both')).toBe(SPEC.BALL_NONE)
    expect(mailBall(null)).toBe(SPEC.BALL_NONE)
    expect(SPEC.MAIL_TABLE).toBe('crm_matter_digest')

    stubCrm([])
    const b = await board(
      stubPool({
        mail: [
          {
            matter: 'Acme hiring',
            owes_reply: 'us',
            stage: 'interview',
            days_since: 3,
            counterparties: ['hr@acme.example'],
            exported_at: hoursAgo(1),
          },
          {
            matter: 'Quiet vendor',
            owes_reply: null,
            counterparties: [],
            exported_at: hoursAgo(1),
          },
        ],
      })
    )
    const balls = b.clients.flatMap(c => c.cards.map(x => x.ball))
    expect(balls).toEqual([SPEC.BALL_OURS, SPEC.BALL_NONE])
  })

  it('an open PR is ours unless a review is asked of somebody else', () => {
    expect(workBall(true, false, false)).toBe(SPEC.BALL_OURS)
    expect(workBall(true, true, false)).toBe(SPEC.BALL_THEIRS)
    // A waiting label is an issue's word; on a PR it changes nothing.
    expect(workBall(true, false, true)).toBe(SPEC.BALL_OURS)
  })

  it('a bug is ours until it is closed, an issue is theirs only when labelled so', async () => {
    expect(workBall(false, false, false)).toBe(SPEC.BALL_OURS)
    expect(workBall(false, true, false)).toBe(SPEC.BALL_OURS)
    expect(workBall(false, false, true)).toBe(SPEC.BALL_THEIRS)
    expect(SPEC.WAITING_LABEL).toBe('waiting')
    expect(SPEC.BUG_LABEL).toBe('bug')

    stubCrm([])
    const b = await board(
      stubPool({
        work: [
          {
            ref: 'o/r#1',
            repo: 'o/r',
            kind: 'issue',
            number: 1,
            title: 'crash',
            labels: ['bug'],
            exported_at: hoursAgo(1),
          },
          {
            ref: 'o/r#2',
            repo: 'o/r',
            kind: 'issue',
            number: 2,
            title: 'need logs',
            labels: ['waiting-for-reporter'],
            exported_at: hoursAgo(1),
          },
        ],
      })
    )
    const byRef = Object.fromEntries(
      b.clients.flatMap(c => c.cards).map(c => [c.ref, c.ball])
    )
    expect(byRef['o/r#1']).toBe(SPEC.BALL_OURS)
    expect(byRef['o/r#2']).toBe(SPEC.BALL_THEIRS)
  })

  it('the columns run ours, due, theirs, none', () => {
    expect(ballRank(SPEC.BALL_OURS)).toBe(0)
    expect(ballRank(SPEC.BALL_DUE)).toBe(1)
    expect(ballRank(SPEC.BALL_THEIRS)).toBe(2)
    expect(ballRank(SPEC.BALL_NONE)).toBe(3)
    expect(ballRank('anything')).toBe(3)

    const card = (ball: string, days: number) => ({
      source: 'crm' as const,
      ref: `${ball}${days}`,
      title: '',
      ball: ball as never,
      days,
      because: null,
      link: null,
    })
    const rows = groupByClient([
      { key: 'a', name: 'A', card: card('theirs', 9) },
      { key: 'b', name: 'B', card: card('ours', 1) },
      { key: 'c', name: 'C', card: card('due', 4) },
      { key: 'b', name: 'B', card: card('theirs', 30) },
      { key: 'd', name: 'D', card: card('ours', 5) },
    ])
    // Rows by their most urgent card, then the longest wait inside.
    expect(rows.map(r => r.key)).toEqual(['b', 'd', 'c', 'a'])
    expect(rows[0].cards.map(c => c.ball)).toEqual(['ours', 'theirs'])
  })

  it('a stale snapshot is reported, not shown', async () => {
    expect(fresh(0)).toBe(true)
    expect(fresh(26)).toBe(true)
    expect(fresh(27)).toBe(false)
    expect(SPEC.STALE_H).toBe(26)
    expect(SPEC.SNAPSHOT_REPLACES).toBe(true)

    stubCrm([])
    const b = await board(
      stubPool({
        mail: [{ matter: 'old', owes_reply: 'us', exported_at: hoursAgo(30) }],
        work: [
          {
            ref: 'o/r#3',
            repo: 'o/r',
            kind: 'pr',
            number: 3,
            title: 'x',
            exported_at: hoursAgo(40),
          },
        ],
      })
    )
    expect(b.sources.mail).toMatchObject({
      status: 'stale',
      cards: 0,
      age_h: 30,
    })
    expect(b.sources.github).toMatchObject({ status: 'stale', cards: 0 })
    expect(b.total).toBe(0)

    // The push replaces its repos: upsert the snapshot, prune the rest.
    const pool = stubPool({})
    await tool(SPEC.PUSH_TOOL).handler(
      {
        repos: ['o/r'],
        items: [{ repo: 'o/r', kind: 'pr', number: 5, title: 'y' }],
      },
      { telegramId: BALL_OWNER, pool } as never
    )
    const prune = pool.sql.findIndex(q => /DELETE FROM/.test(q))
    const upsert = pool.sql.findIndex(q =>
      /ON CONFLICT \(ref\) DO UPDATE/.test(q)
    )
    expect(upsert).toBeGreaterThan(-1)
    expect(prune).toBeGreaterThan(upsert)
    expect(pool.params[prune]).toEqual([['o/r'], ['o/r#5']])
  })

  it("the mailbox and the private repos are the owner's, refused before the read", async () => {
    expect(mayRead(SPEC.MAIL_OWNER_ONLY, true)).toBe(true)
    expect(mayRead(SPEC.MAIL_OWNER_ONLY, false)).toBe(false)
    expect(mayRead(SPEC.WORK_OWNER_ONLY, false)).toBe(false)
    expect(mayRead(false, false)).toBe(true)
    expect(SPEC.REFUSE_BEFORE_READ).toBe(true)

    stubCrm([])
    const pool = stubPool({
      mail: [{ matter: 'secret', owes_reply: 'us', exported_at: hoursAgo(1) }],
    })
    const b = await board(pool, '900000777')
    expect(b.sources.mail.status).toBe('not_yours')
    expect(b.sources.github.status).toBe('not_yours')
    // Never read, not read-and-filtered.
    expect(pool.sql.some(q => q.includes(SPEC.MAIL_TABLE))).toBe(false)
    expect(pool.sql.some(q => q.includes(SPEC.WORK_TABLE))).toBe(false)
    // The writes refuse a stranger outright.
    await expect(
      tool(SPEC.PUSH_TOOL).handler({ repos: ['o/r'], items: [] }, {
        telegramId: '900000777',
        pool,
      } as never)
    ).rejects.toThrow()
    await expect(
      tool(SPEC.LINK_TOOL).handler(
        { client: 'x', kind: 'email', value: 'a@b.c' },
        { telegramId: '900000777', pool } as never
      )
    ).rejects.toThrow()
  })

  it('the CRM is called, not re-derived', async () => {
    expect(SPEC.CRM_TOOL).toBe('crm_waiting')
    expect(SPEC.SOURCE_CRM).toBe('crm')
    expect(SPEC.SOURCE_MAIL).toBe('mail')
    expect(SPEC.SOURCE_WORK).toBe('github')

    const spy = stubCrm([
      {
        telegram_id: '900000101',
        name: 'Anna',
        waiting: 'ours',
        days: 2,
        because: 'replied, we are silent',
      },
    ])
    const pool = stubPool({})
    const ctx = { telegramId: '900000777', pool }
    const b = (await tool(SPEC.TOOL).handler({}, ctx as never)) as Board
    // Called with the CALLER's context: its gate is the only gate.
    expect(spy).toHaveBeenCalledWith({}, ctx)
    expect(b.sources.crm).toMatchObject({ status: 'ok', cards: 1 })
    expect(b.clients[0]).toMatchObject({ key: 'tg:900000101', ball: 'ours' })
  })

  it('every card has a client, and nothing unclaimed is dropped', async () => {
    expect(SPEC.PROJECT_CLIENT).toBe('project')
    expect(SPEC.UNLINKED_MAIL_IS_ITS_OWN_ROW).toBe(true)

    stubCrm([
      { telegram_id: '900000101', name: 'Anna', waiting: 'theirs', days: 5 },
    ])
    const b = await board(
      stubPool({
        links: [
          { client: '900000101', kind: 'email', value: 'anna@flowers.example' },
          { client: 'Acme', kind: 'label', value: 'client:acme' },
        ],
        mail: [
          {
            matter: 'Wedding bouquet',
            owes_reply: 'us',
            counterparties: ['Anna <ANNA@flowers.example>'],
            exported_at: hoursAgo(2),
          },
          {
            matter: 'Unknown sender',
            owes_reply: 'them',
            counterparties: ['x@nowhere.example'],
            exported_at: hoursAgo(2),
          },
        ],
        work: [
          {
            ref: 'o/r#7',
            repo: 'o/r',
            kind: 'issue',
            number: 7,
            title: 'acme export',
            labels: ['client:acme'],
            exported_at: hoursAgo(1),
          },
          {
            ref: 'o/r#8',
            repo: 'o/r',
            kind: 'pr',
            number: 8,
            title: 'refactor',
            labels: [],
            exported_at: hoursAgo(1),
          },
        ],
      })
    )
    const row = (k: string) => b.clients.find(c => c.key === k)
    // The mail matter joins the Telegram contact it was linked to.
    expect(
      row('tg:900000101')
        ?.cards.map(c => c.source)
        .sort()
    ).toEqual(['crm', 'mail'])
    expect(row('tg:900000101')?.name).toBe('Anna')
    expect(row('tg:900000101')?.ball).toBe('ours')
    expect(row('mail:Unknown sender')?.cards).toHaveLength(1)
    expect(row('name:acme')?.cards[0].ref).toBe('o/r#7')
    expect(row(`name:${SPEC.PROJECT_CLIENT}`)?.cards[0].ref).toBe('o/r#8')
    expect(b.total).toBe(5)
    expect(SPEC.CARDS_MAX).toBeGreaterThanOrEqual(100)
  })

  it('the board is designed, not yet live', () => {
    expect(SPEC.RUN_LIVE).toBe(false)
    expect(BALL_BOARD_TOOLS.map(t => t.name)).toEqual([
      SPEC.TOOL,
      SPEC.PUSH_TOOL,
      SPEC.LINK_TOOL,
    ])
    expect(SPEC.DOOR).toBe('/mcp')
  })
})
