import { describe, it, expect, beforeEach } from 'vitest'
import {
  askFor,
  decide,
  readApproval,
  resetApprovalsCache,
  APPROVAL_TTL_MS,
  type ApprovalState,
} from './src/browser/approvals'
import type { Queryable } from './src/browser/sessions'

/**
 * THE BRAKE.
 *
 * Every property here is the difference between "the agent asked" and "the
 * agent did it anyway":
 *
 * - a link spent twice would let an old "allow" answer a new question;
 * - a wrong token that is not refused is no gate at all;
 * - silence read as permission is the worst failure this can have, because
 *   it looks exactly like consent.
 */

interface Row {
  id: string
  telegram_id: string
  what: string
  state: string
  allow_token: string
  deny_token: string
  created_ms: number
}

function fakePool(seed: Row[] = []) {
  const rows = [...seed]
  const pool: Queryable & { rows: Row[] } = {
    rows,
    async query(sql: string, params: unknown[] = []) {
      const s = sql.trim().toUpperCase()
      if (s.startsWith('CREATE TABLE')) return { rows: [] }
      if (s.startsWith('INSERT')) {
        const [id, who, what, allow, deny] = params as string[]
        rows.push({
          id,
          telegram_id: who,
          what,
          state: 'pending',
          allow_token: allow,
          deny_token: deny,
          created_ms: Date.now(),
        })
        return { rows: [] }
      }
      if (s.startsWith('UPDATE')) {
        const [id, token] = params as string[]
        /* The real statement decides and filters in one go; so does this. */
        const row = rows.find(
          r =>
            r.id === id &&
            r.state === 'pending' &&
            (r.allow_token === token || r.deny_token === token)
        )
        if (!row) return { rows: [] }
        row.state = row.allow_token === token ? 'allowed' : 'denied'
        return { rows: [{ state: row.state }] }
      }
      if (s.startsWith('SELECT')) {
        const row = rows.find(r => r.id === String(params[0]))
        return { rows: row ? [{ ...row }] : [] }
      }
      return { rows: [] }
    },
  }
  return pool
}

let n = 0
const ask = (pool: Queryable, what = 'send the invoice') =>
  askFor(pool, {
    telegramId: 'tg-900000001',
    what,
    newId: () => `id${++n}`,
    newToken: () => `tok${++n}`,
  })

beforeEach(() => {
  resetApprovalsCache()
  n = 0
})

describe('asking', () => {
  it('starts as a question, not as permission', async () => {
    const pool = fakePool()
    const { id } = await ask(pool)
    expect((await readApproval(pool, id))?.state).toBe('pending')
  })

  it('gives allow and deny DIFFERENT tokens', async () => {
    const pool = fakePool()
    const { allowToken, denyToken } = await ask(pool)
    expect(allowToken).not.toBe(denyToken)
  })
})

describe('deciding', () => {
  it('allows on the allow token and denies on the deny token', async () => {
    const pool = fakePool()
    const a = await ask(pool)
    expect(await decide(pool, a.id, a.allowToken)).toBe('allowed')

    const b = await ask(pool)
    expect(await decide(pool, b.id, b.denyToken)).toBe('denied')
  })

  it('SPENDS THE LINK: a second press changes nothing', async () => {
    /* Otherwise a kept link answers tomorrow's question with today's yes. */
    const pool = fakePool()
    const { id, allowToken, denyToken } = await ask(pool)
    expect(await decide(pool, id, allowToken)).toBe('allowed')
    expect(await decide(pool, id, denyToken)).toBeNull()
    expect((await readApproval(pool, id))?.state).toBe('allowed')
  })

  it('refuses a token that is neither', async () => {
    const pool = fakePool()
    const { id } = await ask(pool)
    expect(await decide(pool, id, 'not-a-token')).toBeNull()
    expect((await readApproval(pool, id))?.state).toBe('pending')
  })

  it('answers the same for an unknown id as for a wrong token', async () => {
    const pool = fakePool()
    expect(await decide(pool, 'no-such-id', 'anything')).toBeNull()
  })
})

describe('silence', () => {
  it('EXPIRES rather than becoming permission', async () => {
    /*
     * The one failure that would look exactly like consent. An unanswered
     * question is a refusal.
     */
    const pool = fakePool()
    const { id } = await ask(pool)
    pool.rows[0].created_ms = Date.now() - APPROVAL_TTL_MS - 1000
    const state = (await readApproval(pool, id))?.state as ApprovalState
    expect(state).toBe('expired')
    expect(state).not.toBe('allowed')
  })

  it('does not expire a question that was just asked', async () => {
    const pool = fakePool()
    const { id } = await ask(pool)
    expect((await readApproval(pool, id))?.state).toBe('pending')
  })
})
