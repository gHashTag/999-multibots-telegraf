import { describe, it, expect, beforeEach, vi } from 'vitest'

/**
 * A REPLY THAT NEVER ARRIVED IS NOT A THEFT (session.ts LOST_REPLY_SECONDS).
 *
 * The rotation commits before the reply is written. A reply lost on the way
 * back left the client with a spent token, its honest retry 15 s later was
 * past the grace window, and the whole family was revoked -- every tab of the
 * browser signed out (review, 2026-09-22). The successor tells the two apart:
 * a thief replays after the legitimate client moved on, and moving on means
 * presenting the successor.
 *
 * The store below keeps what the SQL keeps (replaced_by, the successor's own
 * used/revoked state, when it was issued) and pins the successor on reissue as
 * the SQL does. The same six cases were run against Postgres itself (PGlite,
 * the real refreshStore SQL) while this was written; that run is what found
 * the second of two simultaneous retries revoking the first one's successor.
 */

type Row = {
  familyId: string
  usedAt: Date | null
  revokedAt: Date | null
  expiresAt: Date
  familyCreatedAt: Date
  createdAt: Date
  replacedBy: string | null
}

describe('a spent token presented again', () => {
  let session: typeof import('./session')

  beforeEach(async () => {
    vi.resetModules()
    session = await import('./session')
  })

  function makeStore() {
    const rows = new Map<string, Row>()
    let revokedFamilies = 0
    const store = {
      async find(h: string) {
        const r = rows.get(h)
        if (!r) return null
        const n = r.replacedBy ? rows.get(r.replacedBy) : undefined
        return {
          familyId: r.familyId,
          usedAt: r.usedAt,
          revokedAt: r.revokedAt,
          expiresAt: r.expiresAt,
          familyCreatedAt: r.familyCreatedAt,
          successorUnused: !!n && !n.usedAt && !n.revokedAt,
          successorHash: r.replacedBy ?? '',
          successorCreatedAt: n ? n.createdAt : null,
        }
      },
      async consumeAndInsert(h: string, next: string, exp: Date) {
        const r = rows.get(h)
        if (!r || r.usedAt || r.revokedAt) return false
        r.usedAt = new Date()
        r.replacedBy = next
        rows.set(next, { ...fresh(r.familyId, exp), createdAt: new Date() })
        return true
      },
      async revokeFamily(f: string) {
        revokedFamilies += 1
        for (const r of rows.values())
          if (r.familyId === f) r.revokedAt = new Date()
        return ['sess']
      },
      async reissue(h: string, successor: string, next: string, exp: Date) {
        const r = rows.get(h)
        const n = rows.get(successor)
        if (!r || r.replacedBy !== successor || !n || n.usedAt || n.revokedAt)
          return false
        n.revokedAt = new Date()
        r.replacedBy = next
        rows.set(next, { ...fresh(r.familyId, exp), createdAt: new Date() })
        return true
      },
    }
    function fresh(familyId: string, exp: Date): Row {
      return {
        familyId,
        usedAt: null,
        revokedAt: null,
        expiresAt: exp,
        familyCreatedAt: new Date(Date.now() - 86_400_000),
        createdAt: new Date(),
        replacedBy: null,
      }
    }
    return {
      store,
      rows,
      revokedFamilies: () => revokedFamilies,
      seed() {
        const t = session.issueRefreshToken()
        rows.set(t.hash, fresh('fam', t.expiresAt))
        return t
      },
    }
  }

  const later = (seconds: number) => new Date(Date.now() + seconds * 1000)
  const tokenOf = (r: unknown) =>
    (r as { next?: { token: string } }).next?.token ?? ''

  it('is a lost reply when its successor was never presented: a new successor, the family alive', async () => {
    const s = makeStore()
    const T = s.seed()
    const lost = tokenOf(await session.rotateRefreshToken(T.token, s.store))

    const retry = await session.rotateRefreshToken(T.token, s.store, later(15))
    expect(retry.ok, JSON.stringify(retry)).toBe(true)
    expect(s.revokedFamilies()).toBe(0)

    // The recovered successor works; the one nobody received does not.
    expect((await session.rotateRefreshToken(tokenOf(retry), s.store)).ok).toBe(
      true
    )
    expect(await session.rotateRefreshToken(lost, s.store)).toMatchObject({
      ok: false,
      reason: 'revoked',
    })
  })

  it('is a theft when the client already moved on to its successor', async () => {
    const s = makeStore()
    const T = s.seed()
    const next = tokenOf(await session.rotateRefreshToken(T.token, s.store))
    expect((await session.rotateRefreshToken(next, s.store)).ok).toBe(true)

    const replay = await session.rotateRefreshToken(T.token, s.store, later(15))
    expect(replay).toMatchObject({ ok: false, reason: 'reused' })
    expect(s.revokedFamilies()).toBe(1)
  })

  it('is a theft past the window, even with the successor unused', async () => {
    const s = makeStore()
    const T = s.seed()
    await session.rotateRefreshToken(T.token, s.store)
    const late = await session.rotateRefreshToken(
      T.token,
      s.store,
      later(session.LOST_REPLY_SECONDS + 1)
    )
    expect(late).toMatchObject({ ok: false, reason: 'reused' })
  })

  it('the window is minutes, not "however long": a replay an hour later is a theft', async () => {
    // The two cases above move with the constant; this one does not. A
    // mutation stretching the window to a day must fail here.
    expect(session.LOST_REPLY_SECONDS).toBeLessThanOrEqual(300)
    const s = makeStore()
    const T = s.seed()
    await session.rotateRefreshToken(T.token, s.store)
    expect(
      await session.rotateRefreshToken(T.token, s.store, later(3600))
    ).toMatchObject({ ok: false, reason: 'reused' })
  })

  it('two retries at once: one wins, the other is a race, and the winner keeps its successor', async () => {
    const s = makeStore()
    const T = s.seed()
    await session.rotateRefreshToken(T.token, s.store)
    const [a, b] = await Promise.all([
      session.rotateRefreshToken(T.token, s.store, later(20)),
      session.rotateRefreshToken(T.token, s.store, later(20)),
    ])
    const outcomes = [a, b].map(r =>
      r.ok ? 'ok' : (r as { reason: string }).reason
    )
    expect(outcomes.sort()).toEqual(['ok', 'raced'])
    const winner = a.ok ? a : b
    expect(
      (await session.rotateRefreshToken(tokenOf(winner), s.store)).ok
    ).toBe(true)
    expect(s.revokedFamilies()).toBe(0)
  })

  it('a retry moments after another retry won is a race, not a second reissue', async () => {
    const s = makeStore()
    const T = s.seed()
    await session.rotateRefreshToken(T.token, s.store)
    // The spent token is past the grace window, so only the successor's own
    // age can call the next presentation a race.
    // The rotation stamps both at once, so both are backdated together.
    const spent = s.rows.get(T.hash)!
    spent.usedAt = new Date(Date.now() - 30_000)
    s.rows.get(spent.replacedBy!)!.createdAt = spent.usedAt
    const won = await session.rotateRefreshToken(T.token, s.store)
    expect(won.ok, JSON.stringify(won)).toBe(true)
    // Moments later: the winner's successor is milliseconds old.
    const after = await session.rotateRefreshToken(T.token, s.store)
    expect(after).toMatchObject({ ok: false, reason: 'raced' })
    expect((await session.rotateRefreshToken(tokenOf(won), s.store)).ok).toBe(
      true
    )
  })

  it('inside the grace window it is still the plain race it always was', async () => {
    const s = makeStore()
    const T = s.seed()
    await session.rotateRefreshToken(T.token, s.store)
    expect(
      await session.rotateRefreshToken(T.token, s.store, later(3))
    ).toMatchObject({ ok: false, reason: 'raced' })
    expect(s.revokedFamilies()).toBe(0)
  })
})
