import { afterEach, describe, expect, it, vi } from 'vitest'
import * as SPEC from './ball-grants.gen'
import * as BOARD from './ball-board.gen'
import { BALL_BOARD_TOOLS, BALL_OWNER } from '../agent/ball-board'
import {
  BALL_GRANT_TOOLS,
  grantCovers,
  grantDays,
  mayGrant,
  mayReadMail,
} from '../agent/ball-grants'
import { CRM_TOUCH_TOOLS } from '../agent/crm-touch-tools'

/**
 * WHO ELSE MAY SEE THE MAIL CARDS IS WRITTEN IN t27 FIRST (skill
 * t27-spec-first).
 *
 * gHashTag/t27 specs/automation/ball-grants.t27 is the spec of record; that
 * the vendored copy, its generated module and the host agree is held by
 * scripts/check-t27-specs.mjs. Here each `test` of the spec runs against the
 * HOST: src/agent/ball-grants.ts, and the ball_board gate it stands in front
 * of, over a stubbed pool -- no database.
 *
 * Refresh: node scripts/sync-t27-spec.mjs <t27 checkout> automation/ball-grants
 */

const VIEWER = '900000777'
const STRANGER = '900000888'

const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000)

const MAIL = [
  {
    matter: 'Acme hiring',
    owes_reply: 'us',
    stage: 'interview',
    days_since: 2,
    counterparties: ['Hr <hr@acme.example>'],
    exported_at: hoursAgo(1),
  },
  {
    matter: 'Globex invoice',
    owes_reply: 'them',
    stage: 'billing',
    days_since: 5,
    counterparties: ['ap@globex.example'],
    exported_at: hoursAgo(1),
  },
  {
    matter: 'Private letter nobody linked',
    owes_reply: 'us',
    stage: 'personal',
    days_since: 1,
    counterparties: ['friend@home.example'],
    exported_at: hoursAgo(1),
  },
  {
    matter: 'Robot notice nobody linked',
    owes_reply: 'us',
    stage: 'notice',
    days_since: 1,
    counterparties: ['noreply@robots.example'],
    exported_at: hoursAgo(1),
  },
]

const LINKS = [
  { client: 'Acme', kind: 'domain', value: 'acme.example' },
  { client: 'Globex', kind: 'email', value: 'ap@globex.example' },
]

/**
 * A pool answering by table: the owner's links, the mail digest, the work
 * snapshot, and the grants of the viewer asked about. Rows are copies, as
 * Postgres returns them.
 */
function stubPool(grants: Record<string, string[]> = {}) {
  const sql: string[] = []
  const params: unknown[][] = []
  return {
    sql,
    params,
    async query(q: string, p: unknown[] = []) {
      sql.push(q)
      params.push(p)
      const select = /^\s*SELECT/.test(q)
      if (select && q.includes(SPEC.TABLE)) {
        const viewer = String(p[1] ?? '')
        return { rows: (grants[viewer] ?? []).map(client => ({ client })) }
      }
      if (select && q.includes(BOARD.LINK_TABLE))
        return { rows: LINKS.map(l => ({ ...l })) }
      if (select && q.includes(BOARD.MAIL_TABLE))
        return { rows: MAIL.map(m => ({ ...m })) }
      if (select && q.includes(BOARD.WORK_TABLE))
        return {
          rows: [
            {
              ref: 'o/private#1',
              repo: 'o/private',
              kind: 'pr',
              number: 1,
              title: 'secret repo work',
              exported_at: hoursAgo(1),
              labels: [],
            },
          ],
        }
      if (/^\s*(INSERT|UPDATE)/.test(q)) return { rows: [{ expires_at: 'x' }] }
      return { rows: [] }
    },
  }
}

type Board = {
  total: number
  counts: Record<string, number>
  automated: number
  pooled: number
  sources: Record<string, { status: string; cards: number }>
  clients: Array<{
    key: string
    name: string
    cards: Array<{ source: string; ref: string; title: string }>
  }>
}

async function board(pool: ReturnType<typeof stubPool>, who: string) {
  const t = BALL_BOARD_TOOLS.find(x => x.name === SPEC.BOARD_TOOL)!
  return (await t.handler({}, { telegramId: who, pool } as never)) as Board
}

const grantTool = BALL_GRANT_TOOLS.find(x => x.name === SPEC.TOOL)!
const grant = (args: Record<string, unknown>, who: string, pool = stubPool()) =>
  grantTool.handler(args, { telegramId: who, pool } as never)

function quietCrm() {
  const crm = CRM_TOUCH_TOOLS.find(x => x.name === BOARD.CRM_TOOL)!
  vi.spyOn(crm, 'handler').mockResolvedValue({ total: 0, waiting: [] })
}

const mailRefs = (b: Board) =>
  b.clients.flatMap(c =>
    c.cards.filter(x => x.source === 'mail').map(x => x.ref)
  )

afterEach(() => vi.restoreAllMocks())

describe('automation/ball-grants -- the spec, against the host', () => {
  it('the owner reads the mail, a viewer only with a live grant, nobody else', async () => {
    expect(mayReadMail(true, false)).toBe(true)
    expect(mayReadMail(true, true)).toBe(true)
    expect(mayReadMail(false, true)).toBe(true)
    expect(mayReadMail(false, false)).toBe(false)

    quietCrm()
    // The owner: every matter, linked or not.
    const own = await board(stubPool(), BALL_OWNER)
    expect(mailRefs(own).sort()).toEqual(MAIL.map(m => m.matter).sort())

    // A stranger: refused BEFORE the read -- the digest is never selected.
    const pool = stubPool({ [VIEWER]: ['Acme'] })
    const none = await board(pool, STRANGER)
    expect(none.sources.mail.status).toBe('not_yours')
    expect(
      pool.sql.some(q => /^\s*SELECT/.test(q) && q.includes(BOARD.MAIL_TABLE))
    ).toBe(false)
    expect(mailRefs(none)).toEqual([])
  })

  it('only the owner grants, and never to the owner', async () => {
    expect(mayGrant(true, false)).toBe(true)
    expect(mayGrant(true, true)).toBe(false)
    expect(mayGrant(false, false)).toBe(false)
    expect(mayGrant(false, true)).toBe(false)

    await expect(
      grant({ viewer: STRANGER, client: '*' }, VIEWER)
    ).rejects.toThrow()
    await expect(
      grant({ viewer: BALL_OWNER, client: '*' }, BALL_OWNER)
    ).rejects.toThrow(/no grant/)
    // A username is not a viewer: it can change hands.
    await expect(
      grant({ viewer: '@somebody', client: '*' }, BALL_OWNER)
    ).rejects.toThrow(/telegram id/)
  })

  it('a grant covers its client, or every linked client, and never an unlinked one', async () => {
    expect(grantCovers('acme', 'acme')).toBe(true)
    expect(grantCovers('acme', 'globex')).toBe(false)
    expect(grantCovers(SPEC.ALL_CLIENTS, 'globex')).toBe(true)
    expect(grantCovers(SPEC.ALL_CLIENTS, '')).toBe(false)
    expect(grantCovers('acme', '')).toBe(false)
    expect(SPEC.UNLINKED_TO_VIEWER).toBe(false)

    quietCrm()
    // One client, named in another case than the link: still that client.
    const one = await board(stubPool({ [VIEWER]: ['acme'] }), VIEWER)
    expect(mailRefs(one)).toEqual(['Acme hiring'])

    // Every client: both linked matters, and still not the unlinked letter.
    const all = await board(stubPool({ [VIEWER]: ['*'] }), VIEWER)
    expect(mailRefs(all).sort()).toEqual(['Acme hiring', 'Globex invoice'])
  })

  it('every grant ends: unsized is a month, nothing outlives a quarter', async () => {
    expect(grantDays(0)).toBe(30)
    expect(grantDays(7)).toBe(7)
    expect(grantDays(90)).toBe(90)
    expect(grantDays(91)).toBe(90)
    expect(grantDays(200)).toBe(90)
    expect(SPEC.DAYS_DEFAULT).toBeLessThanOrEqual(SPEC.DAYS_MAX)

    const pool = stubPool()
    const r = (await grant(
      { viewer: VIEWER, client: 'Acme', days: 365 },
      BALL_OWNER,
      pool
    )) as { granted: { days: number } }
    expect(r.granted.days).toBe(SPEC.DAYS_MAX)
    const insert = pool.sql.findIndex(q => /^\s*INSERT/.test(q))
    expect(pool.sql[insert]).toMatch(/expires_at/)
    expect(pool.params[insert]).toEqual([
      BALL_OWNER,
      VIEWER,
      'Acme',
      SPEC.DAYS_MAX,
    ])
  })

  it('a grant opens the mail and nothing else', async () => {
    expect(SPEC.SOURCE).toBe('mail')
    expect(SPEC.WORK_SHARED).toBe(false)
    expect(SPEC.VIEWER_BY_ID).toBe(true)
    expect(SPEC.BOARD_TOOL).toBe('ball_board')

    quietCrm()
    const pool = stubPool({ [VIEWER]: ['*'] })
    const b = await board(pool, VIEWER)
    expect(b.sources.github.status).toBe('not_yours')
    expect(
      pool.sql.some(q => /^\s*SELECT/.test(q) && q.includes(BOARD.WORK_TABLE))
    ).toBe(false)
    expect(JSON.stringify(b)).not.toContain('secret repo work')
  })

  it('what never leaves the server, whoever asks', async () => {
    expect(SPEC.LINKS_TO_VIEWER).toBe(false)
    expect(SPEC.COUNTERPARTIES_TO_VIEWER).toBe(false)
    expect(SPEC.COUNTS_OUTSIDE_GRANT).toBe(false)
    expect(SPEC.GAME_TOKEN_MAY_READ).toBe(false)

    quietCrm()
    const b = await board(stubPool({ [VIEWER]: ['Acme'] }), VIEWER)
    const wire = JSON.stringify(b)
    // No address, no domain, no other client, no unlinked matter.
    for (const leak of [
      'hr@acme.example',
      'acme.example',
      'ap@globex.example',
      'Globex',
      'Private letter',
      'friend@home.example',
    ]) {
      expect(wire).not.toContain(leak)
    }
    // Counts are of cards in hand: one mail card, nothing about the rest.
    expect(b.total).toBe(1)
    expect(b.sources.mail.cards).toBe(1)
    expect(Object.values(b.counts).reduce((a, n) => a + n, 0)).toBe(1)
    // Not even a count of the matters outside the grant: the robot notice
    // is automated, but it is not the viewer's to count.
    expect(b.automated).toBe(0)
    expect(b.pooled).toBe(0)
    const own = await board(stubPool(), BALL_OWNER)
    expect(own.automated).toBeGreaterThan(0)

    // The t27.ai game token cannot open the board at all.
    const { GAME_TOKEN_TOOLS } = await import('../agent/routes')
    expect(GAME_TOKEN_TOOLS).not.toContain(SPEC.BOARD_TOOL)
  }, 120_000)

  it('the owner sees who looked', async () => {
    expect(SPEC.READ_RECORDED).toBe(true)
    expect(SPEC.TABLE).toBe('ball_viewer_grants')
    expect(SPEC.TOOL).toBe('ball_grant')

    quietCrm()
    const pool = stubPool({ [VIEWER]: ['Acme'] })
    await board(pool, VIEWER)
    const stamp = pool.sql.findIndex(q =>
      /^\s*UPDATE[\s\S]*last_read_at/.test(q)
    )
    expect(stamp).toBeGreaterThanOrEqual(0)
    expect(pool.params[stamp]).toEqual([BALL_OWNER, VIEWER])

    // The owner reading their own board stamps nothing.
    const own = stubPool()
    await board(own, BALL_OWNER)
    expect(own.sql.some(q => /last_read_at = now\(\)/.test(q))).toBe(false)

    // And the owner's list is where the stamp is read.
    const list = stubPool()
    await grant({ list: true }, BALL_OWNER, list)
    expect(list.sql.some(q => /SELECT[\s\S]*last_read_at/.test(q))).toBe(true)
  })

  it('the sharing is designed, not yet live', () => {
    expect(SPEC.RUN_LIVE).toBe(false)
  })
})
