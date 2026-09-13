import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  remember,
  issueFor,
  claim,
  claimAcrossDeploy,
  onPersist,
  restoreProposals,
  onOrphaned,
  forgetProposals,
  pendingFor,
  digestOf,
  LIFETIME_MS,
} from './src/agent/tg-proposals'
import type { PendingProposal } from './src/agent/tg-proposals'
import fs from 'node:fs'
import path from 'node:path'
import {
  proposalToRow,
  rowToProposal,
  wireProposalStore,
  unwireProposalStore,
} from './src/agent/proposal-store'

/**
 * THE CARDS SURVIVE A DEPLOY.
 *
 * The queue was a Map in one process, so every restart dropped every card the
 * owner had not pressed -- and this repository deploys several times a day. A
 * card whose life was just raised from ten minutes to twelve hours still
 * usually died inside two of them, for a reason no lifetime could fix.
 *
 * Measured in production while this was written: five invoices minted, none
 * paid, not one card ever sent.
 */

const WHO = '144022504'
const TURN = 'turn-1'

function draft(id: string, opts: Partial<PendingProposal> = {}) {
  return remember({
    id,
    telegramId: WHO,
    action: 'send',
    target: '1',
    what: 'привет', // cyrillic-ok: user-facing draft text
    turn: TURN,
    ...opts,
  } as Parameters<typeof remember>[0])
}

describe('a card comes back after a restart', () => {
  let rows: Map<string, PendingProposal>
  beforeEach(() => {
    forgetProposals()
    rows = new Map()
    onPersist({
      save: p => rows.set(p.id, JSON.parse(JSON.stringify(p))),
      remove: id => rows.delete(id),
    })
  })
  afterEach(() => {
    onPersist(null)
    onOrphaned(null)
    forgetProposals()
  })

  it('the issued card is claimable again with the SAME secret', () => {
    draft('a1')
    const issued = issueFor(WHO, TURN)
    expect(issued).toBeTruthy()
    const secret = issued!.secret

    // The deploy: the process forgets everything the Map held.
    forgetProposals()
    expect(pendingFor(WHO)).toBeNull()
    expect(claim(WHO, 'a1', secret).ok).toBe(false)

    // Coming back up.
    const out = restoreProposals([...rows.values()])
    expect(out).toEqual({ restored: 1, expired: 0, unissued: 0, replaced: 0 })
    const taken = claim(WHO, 'a1', secret)
    expect(taken.ok, 'the owner presses Send after the deploy').toBe(true)
  })

  it('a wrong secret is still refused after the restart', () => {
    draft('a2')
    issueFor(WHO, TURN)
    forgetProposals()
    restoreProposals([...rows.values()])
    expect(claim(WHO, 'a2', 'deadbeef'.repeat(4)).ok).toBe(false)
    expect(claim(WHO, 'a2', '').ok).toBe(false)
  })

  /**
   * The plaintext died with the process, so nobody could ever confirm this
   * draft. Restoring it would put an unpressable card in the queue and hold
   * its Stars invoice open; it is reported instead, which un-pends the row.
   */
  it('a card that was never issued does not come back, and is reported', () => {
    const seen: string[] = []
    onOrphaned((p, reason) => seen.push(`${p.id}:${reason}`))
    draft('a3', { invoiceId: 7 })
    forgetProposals()
    const out = restoreProposals([...rows.values()])
    expect(out.unissued).toBe(1)
    expect(out.restored).toBe(0)
    expect(seen).toEqual(['a3:expired'])
    expect(rows.has('a3'), 'and its row is deleted, not left waiting').toBe(
      false
    )
  })

  /**
   * The case the Map could never see: a draft that expired while the process
   * was down. There was no draft any more, so nothing reported it and its
   * invoice stayed pending for ever.
   */
  it('a card that expired while we were down is reported on the way back', () => {
    const seen: string[] = []
    onOrphaned((p, reason) => seen.push(`${p.id}:${reason}`))
    vi.useFakeTimers()
    try {
      const t0 = new Date('2026-09-09T10:00:00Z').getTime()
      vi.setSystemTime(new Date(t0))
      draft('a4', { invoiceId: 9 })
      issueFor(WHO, TURN)
      forgetProposals()
      vi.setSystemTime(new Date(t0 + LIFETIME_MS + 60_000))
      const out = restoreProposals([...rows.values()])
      expect(out).toEqual({
        restored: 0,
        expired: 1,
        unissued: 0,
        replaced: 0,
      })
      expect(seen).toEqual(['a4:expired'])
      expect(rows.has('a4')).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })

  it('every consuming press deletes the row, so it cannot come back twice', () => {
    draft('a5')
    const secret = issueFor(WHO, TURN)!.secret
    expect(rows.has('a5')).toBe(true)
    expect(claim(WHO, 'a5', secret).ok).toBe(true)
    expect(rows.has('a5'), 'a confirmed draft leaves no row').toBe(false)
  })

  /**
   * The invariant is at its sharpest right after a deploy, when the chat has
   * scrolled and two identical-looking buttons are the way the wrong one gets
   * pressed. The newest wins; the older leaves as `replaced`, as it would
   * have live.
   */
  it('only the newest card per person comes back', () => {
    const seen: string[] = []
    onOrphaned((p, reason) => seen.push(`${p.id}:${reason}`))
    const older: PendingProposal = {
      id: 'old',
      telegramId: WHO,
      action: 'send',
      target: '1',
      createdAt: Date.now() - 60_000,
      secret: '',
      secretDigest: digestOf('x'),
      issued: true,
      invoiceId: 3,
    }
    const newer: PendingProposal = {
      ...older,
      id: 'new',
      createdAt: Date.now(),
    }
    // NEWEST FIRST ON PURPOSE. Fed oldest-first, a rule that simply keeps the
    // LAST row it sees gives the same answer, and the test cannot tell the
    // two apart -- it did not, and the mutant survived.
    const out = restoreProposals([newer, older])
    expect(out.restored).toBe(1)
    expect(out.replaced).toBe(1)
    expect(pendingFor(WHO)?.id).toBe('new')
    expect(seen).toEqual(['old:replaced'])
  })

  /**
   * A draft made by THIS process beats anything from the table: its plaintext
   * secret is still in hand, and the card for it may already be on screen.
   * The row loses and is reported, so its invoice does not stay pending.
   */
  it('a live draft beats a row for the same person', () => {
    const seen: string[] = []
    onOrphaned((p, reason) => seen.push(`${p.id}:${reason}`))
    draft('live')
    const fromTable: PendingProposal = {
      id: 'fromTable',
      telegramId: WHO,
      action: 'send',
      target: '1',
      createdAt: Date.now() + 10_000, // even if the row looks newer
      secret: '',
      secretDigest: digestOf('y'),
      issued: true,
      invoiceId: 11,
    }
    const out = restoreProposals([fromTable])
    expect(out.restored).toBe(0)
    expect(out.replaced).toBe(1)
    expect(pendingFor(WHO)?.id).toBe('live')
    expect(seen).toEqual(['fromTable:replaced'])
  })

  it('a replaced draft takes its row with it', () => {
    draft('a6')
    draft('a7')
    expect([...rows.keys()]).toEqual(['a7'])
  })
})

/**
 * THE PRESS MAY LAND IN A DIFFERENT PROCESS THAN THE CARD.
 *
 * Measured in production on 2026-09-13, 16:09-16:11 UTC. A merge redeployed
 * the render during the seller's sweep. The outgoing container minted the
 * card and saved its row; the new container had restored the table BEFORE
 * that row existed; traffic moved over, and the press reached a Map that had
 * never heard of the id. "Already confirmed or expired" -- about a card sixty
 * seconds old. Both containers live for about a minute on every deploy.
 *
 * The table is shared. So the two processes below share `rows` and nothing
 * else: `forgetProposals()` is the second container coming up, and the press
 * goes to it.
 */
describe('a card minted by the other container during a deploy', () => {
  let rows: Map<string, PendingProposal>
  let loads: string[]
  const table = (opts: { failing?: boolean } = {}) => ({
    save: (p: PendingProposal) => rows.set(p.id, JSON.parse(JSON.stringify(p))),
    remove: (id: string) => rows.delete(id),
    load: async (id: string) => {
      loads.push(id)
      if (opts.failing) throw new Error('connection refused')
      const r = rows.get(id)
      // The row shape: the digest is there, the plaintext is not.
      return r ? { ...r, secret: '' } : null
    },
  })
  beforeEach(() => {
    forgetProposals()
    rows = new Map()
    loads = []
    onPersist(table())
  })
  afterEach(() => {
    onPersist(null)
    onOrphaned(null)
    forgetProposals()
  })

  it('the press finds the row the Map never saw, and sends once', async () => {
    // Container A: the sweep's turn mints the card and issues it.
    draft('sweep-1')
    const secret = issueFor(WHO, TURN)!.secret
    // Container B: came up before the row existed, so its Map is empty.
    forgetProposals()
    expect(claim(WHO, 'sweep-1', secret).ok, 'the plain claim misses').toBe(
      false
    )
    // The press reaches B.
    const taken = await claimAcrossDeploy(WHO, 'sweep-1', secret)
    expect(
      taken.ok,
      'the owner presses Send sixty seconds after the card'
    ).toBe(true)
    expect(rows.has('sweep-1'), 'the press consumed the row').toBe(false)
    // Pressed again on the same button: gone in both places.
    const again = await claimAcrossDeploy(WHO, 'sweep-1', secret)
    expect(again.ok).toBe(false)
  })

  it('a wrong secret is still a wrong secret after the recovery', async () => {
    draft('sweep-2')
    issueFor(WHO, TURN)
    forgetProposals()
    const r = await claimAcrossDeploy(WHO, 'sweep-2', 'not the secret')
    expect(r.ok).toBe(false)
    // The row was adopted, not deleted: the right secret still works.
    expect(rows.has('sweep-2')).toBe(true)
  })

  it("somebody else's id is refused before the row is adopted", async () => {
    draft('sweep-3')
    const secret = issueFor(WHO, TURN)!.secret
    forgetProposals()
    const r = await claimAcrossDeploy('999', 'sweep-3', secret)
    expect(r).toEqual({
      ok: false,
      why: 'это действие предложено не вам', // cyrillic-ok: user-facing refusal
    })
    expect(pendingFor(WHO), 'nothing was pulled into the Map').toBeNull()
    expect(rows.has('sweep-3'), 'and the row is untouched').toBe(true)
  })

  it('a row that expired while nobody pressed is not revived', async () => {
    draft('sweep-4')
    const secret = issueFor(WHO, TURN)!.secret
    const r = rows.get('sweep-4')!
    r.createdAt = Date.now() - LIFETIME_MS - 1000
    forgetProposals()
    const seen: string[] = []
    onOrphaned((p, reason) => seen.push(`${p.id}:${reason}`))
    const out = await claimAcrossDeploy(WHO, 'sweep-4', secret)
    expect(out.ok).toBe(false)
    expect(rows.has('sweep-4')).toBe(false)
    // A plain text draft is not reported; only invoices and media are.
    expect(seen).toEqual([])
  })

  it('a row that was never issued cannot be pressed into existence', async () => {
    draft('sweep-5')
    const minted = rows.get('sweep-5')!
    forgetProposals()
    // The plaintext never left container A, so this is the best a probe has.
    const r = await claimAcrossDeploy(WHO, 'sweep-5', 'guess')
    expect(r.ok).toBe(false)
    expect(minted.issued).toBe(false)
    expect(
      rows.has('sweep-5'),
      'an unissued row is dropped, as on restart'
    ).toBe(false)
  })

  /**
   * ONE PENDING PROPOSAL PER PERSON, decided by age. Container B restored an
   * OLDER card for the same person before A superseded it; the press on the
   * newer card wins and the stale sibling leaves as replaced.
   */
  it('an older card already in the Map yields to the pressed newer row', async () => {
    const seen: string[] = []
    onOrphaned((p, reason) => seen.push(`${p.id}:${reason}`))
    // A: the older card, still in B's Map after B restored it.
    const older: PendingProposal = {
      id: 'older',
      telegramId: WHO,
      action: 'send',
      target: '1',
      createdAt: Date.now() - 60_000,
      secret: '',
      secretDigest: digestOf('x'),
      issued: true,
      invoiceId: 7,
    }
    restoreProposals([older])
    // A then minted a newer card (its `remember` removed `older`'s row) and
    // issued it. Here: the row only.
    const newer: PendingProposal = {
      ...older,
      id: 'newer',
      createdAt: Date.now(),
      secretDigest: digestOf('s3cret'),
      invoiceId: undefined,
    }
    rows.set('newer', newer)
    const r = await claimAcrossDeploy(WHO, 'newer', 's3cret')
    expect(r.ok).toBe(true)
    expect(pendingFor(WHO)).toBeNull()
    expect(seen).toEqual(['older:replaced'])
  })

  it('a newer card already in the Map keeps its place over an older row', async () => {
    const newerLive = draft('live')
    issueFor(WHO, TURN)
    const olderRow: PendingProposal = {
      id: 'older',
      telegramId: WHO,
      action: 'send',
      target: '1',
      createdAt: newerLive.createdAt - 60_000,
      secret: '',
      secretDigest: digestOf('old'),
      issued: true,
    }
    rows.set('older', olderRow)
    const r = await claimAcrossDeploy(WHO, 'older', 'old')
    expect(r.ok).toBe(false)
    expect(rows.has('older'), 'the superseded row leaves').toBe(false)
    expect(pendingFor(WHO)?.id).toBe('live')
  })

  /**
   * The mirror image: B restored a card, A consumed it (deleting the row),
   * and B still holds a copy with a valid digest. A second press must not
   * send the message twice.
   */
  it('a draft whose row is gone is not sent a second time', async () => {
    draft('twice')
    const secret = issueFor(WHO, TURN)!.secret
    // Consumed in container A: the row is gone, B's Map still has it.
    rows.delete('twice')
    expect(claim(WHO, 'twice', secret).ok, 'the plain claim would send').toBe(
      true
    )
    // Rebuild the same state and press through the guarded path.
    forgetProposals()
    draft('twice')
    const secret2 = issueFor(WHO, TURN)!.secret
    rows.delete('twice')
    const r = await claimAcrossDeploy(WHO, 'twice', secret2)
    expect(r.ok).toBe(false)
    expect(pendingFor(WHO), 'the stale copy is dropped').toBeNull()
  })

  it('the hot path reads the table once per press, not on every hit', async () => {
    draft('hit')
    const secret = issueFor(WHO, TURN)!.secret
    const r = await claimAcrossDeploy(WHO, 'hit', secret)
    expect(r.ok).toBe(true)
    expect(loads).toEqual(['hit'])
  })

  it('a table that cannot answer leaves the in-memory verdict in force', async () => {
    onPersist(table({ failing: true }))
    draft('offline')
    const secret = issueFor(WHO, TURN)!.secret
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    try {
      const hit = await claimAcrossDeploy(WHO, 'offline', secret)
      expect(hit.ok, 'a hit still sends when the table is down').toBe(true)
      forgetProposals()
      draft('offline-2')
      const s2 = issueFor(WHO, TURN)!.secret
      forgetProposals()
      const miss = await claimAcrossDeploy(WHO, 'offline-2', s2)
      expect(miss.ok, 'a miss still refuses when the table is down').toBe(false)
      expect(
        warn.mock.calls.some(c => String(c[0]).includes('store.load failed'))
      ).toBe(true)
    } finally {
      warn.mockRestore()
    }
  })

  it('without a load in the store the guarded claim is the plain claim', async () => {
    onPersist({
      save: p => rows.set(p.id, JSON.parse(JSON.stringify(p))),
      remove: id => rows.delete(id),
    })
    draft('plain')
    const secret = issueFor(WHO, TURN)!.secret
    forgetProposals()
    const r = await claimAcrossDeploy(WHO, 'plain', secret)
    expect(r.ok).toBe(false)
  })
})

/**
 * The confirm and cancel routes go through the guarded claim: the plain
 * `claim` on a route is the exact defect measured in production.
 */
describe('the routes press through the guarded claim', () => {
  it('confirm and cancel await claimAcrossDeploy, not claim', () => {
    const src = fs.readFileSync(
      path.join(__dirname, 'render-server.ts'),
      'utf8'
    )
    const confirm = src.indexOf("route === '/api/tg/proposal/confirm'")
    const cancel = src.indexOf("route === '/api/tg/proposal/cancel'")
    expect(confirm).toBeGreaterThan(0)
    expect(cancel).toBeGreaterThan(confirm)
    const confirmBody = src.slice(confirm, cancel)
    const cancelBody = src.slice(cancel, cancel + 1500)
    expect(confirmBody).toMatch(/await claimAcrossDeploy\(/)
    expect(confirmBody).not.toMatch(/[^A-Za-z]claim\(/)
    expect(cancelBody).toMatch(/await claimAcrossDeploy\(/)
    expect(cancelBody).not.toMatch(/[^A-Za-z]claim\(/)
  })
})

/**
 * WHAT IS WRITTEN DOWN. Never the plaintext secret: the digest is all `claim`
 * needs, and it cannot be handed out, so a row is not a card. A database dump
 * is a list of drafts nobody can confirm.
 */
describe('the row is not a card', () => {
  beforeEach(() => forgetProposals())
  afterEach(() => {
    onPersist(null)
    forgetProposals()
  })

  it('the serialised row carries no secret, only its digest', () => {
    const saved: PendingProposal[] = []
    onPersist({ save: p => saved.push(p), remove: () => {} })
    draft('b1')
    const p = saved[0]
    const row = proposalToRow(p)
    expect(row.secretDigest).toBe(digestOf(p.secret))
    expect(row.payload).not.toContain(p.secret)
    expect(row.payload).not.toContain('secret')
    expect(JSON.stringify(row)).not.toContain(p.secret)
  })

  it('a row read back has the digest and no plaintext', () => {
    const saved: PendingProposal[] = []
    onPersist({ save: p => saved.push(p), remove: () => {} })
    draft('b2')
    const row = proposalToRow(saved[0])
    const back = rowToProposal({
      id: row.id,
      telegram_id: row.telegramId,
      created_at: row.createdAt,
      issued: row.issued,
      secret_digest: row.secretDigest,
      payload: row.payload,
    })
    expect(back.secret).toBe('')
    expect(back.secretDigest).toBe(row.secretDigest)
    expect(back.telegramId).toBe(WHO)
    expect(back.action).toBe('send')
  })
})

/**
 * A queue that cannot be mirrored still works -- it just forgets on deploy,
 * which is where this started. It must say so, not pretend.
 */
describe('a store that cannot be reached complains', () => {
  afterEach(() => unwireProposalStore())

  it('a failing pool is reported and leaves the queue in memory', async () => {
    const errors: string[] = []
    const spy = vi
      .spyOn(console, 'error')
      .mockImplementation((...a) => errors.push(a.join(' ')))
    const out = await wireProposalStore(() => {
      throw new Error('no database here')
    })
    spy.mockRestore()
    expect(out).toBeNull()
    expect(errors.join('\n')).toContain('NOT WIRED')
    // And the queue still works without it.
    forgetProposals()
    draft('c1')
    expect(pendingFor(WHO)).toBeTruthy()
  })

  it('a second wiring after a failure is allowed', async () => {
    const queries: string[] = []
    const pool = {
      query: async (sql: string) => {
        queries.push(sql.trim().slice(0, 24))
        return { rows: [] }
      },
    }
    const out = await wireProposalStore(() => pool)
    expect(out).toEqual({ restored: 0, expired: 0, unissued: 0, replaced: 0 })
    expect(queries.some(q => q.startsWith('CREATE TABLE'))).toBe(true)
  })
  /**
   * The wired store answers a press-time read from the table. This is the
   * pool the production route goes through, so the SQL shape is asserted
   * here rather than trusted.
   */
  it('the wired store reads one row by id for the guarded claim', async () => {
    forgetProposals()
    const table = new Map<string, any[]>()
    const queries: Array<{ sql: string; params?: unknown[] }> = []
    const pool = {
      query: async (sql: string, params?: unknown[]) => {
        queries.push({ sql: sql.replace(/\s+/g, ' ').trim(), params })
        if (/^INSERT/.test(sql.trim())) table.set(String(params![0]), params!)
        if (/^DELETE/.test(sql.trim())) table.delete(String(params![0]))
        if (/^SELECT.*WHERE id/s.test(sql.trim())) {
          const r = table.get(String(params![0]))
          return {
            rows: r
              ? [
                  {
                    id: r[0],
                    telegram_id: r[1],
                    created_at: r[2],
                    issued: r[3],
                    secret_digest: r[4],
                    payload: r[5],
                  },
                ]
              : [],
          }
        }
        return { rows: [] }
      },
    }
    await wireProposalStore(() => pool)
    // Container A mints and issues; the INSERT is fire-and-forget.
    draft('w1')
    const secret = issueFor(WHO, TURN)!.secret
    await new Promise(r => setTimeout(r, 0))
    // Container B: empty Map, same table.
    forgetProposals()
    const taken = await claimAcrossDeploy(WHO, 'w1', secret)
    expect(taken.ok).toBe(true)
    const select = queries.find(q => /^SELECT .* WHERE id = \$1$/.test(q.sql))
    expect(select?.params).toEqual(['w1'])
    await new Promise(r => setTimeout(r, 0))
    expect(table.has('w1'), 'the press deleted the row').toBe(false)
  })
})
