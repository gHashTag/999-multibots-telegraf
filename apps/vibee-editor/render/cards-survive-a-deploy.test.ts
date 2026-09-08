import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  remember,
  issueFor,
  claim,
  onPersist,
  restoreProposals,
  onOrphaned,
  forgetProposals,
  pendingFor,
  digestOf,
  LIFETIME_MS,
} from './src/agent/tg-proposals'
import type { PendingProposal } from './src/agent/tg-proposals'
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
})
