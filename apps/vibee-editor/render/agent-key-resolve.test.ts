/**
 * An issued key must OPEN what its own issue response promised.
 *
 * `handleAgentKeys` prints, to a person: "Connect with X-Agent-Key to POST /mcp
 * or /a2a". The only resolver was `chatIdentity`, which reads `AGENT_KEYS` from
 * the environment and never looks into the `agent_keys` table -- so an issued
 * key worked nowhere while the endpoint claimed the opposite. The gap was
 * recorded in that very file as "a separate change" (#884) and lived that way
 * for three cycles, until the issue route was wired and the promise became
 * audible.
 *
 * What is checked here is behaviour, not the presence of a function: a key from
 * the table yields its owner, a revoked one yields nobody, and an unreachable
 * database does NOT grant access.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { IncomingMessage } from 'node:http'
import { createHash } from 'node:crypto'
import { resolveIdentity } from './src/agent/routes'

const KEY = 'tri_deadbeefdeadbeefdeadbeefdeadbeefdeadbeef'
const hashOf = (k: string) => createHash('sha256').update(k).digest('hex')

function req(headers: Record<string, string>): IncomingMessage {
  return { headers, url: '/mcp', method: 'POST' } as unknown as IncomingMessage
}

/** A database with one key table; it counts queries so spare ones are visible. */
function fakePool(
  rows: Array<{ hash: string; owner: string; revoked: boolean }>
) {
  let queries = 0
  return {
    get queries() {
      return queries
    },
    async query(sql: string, params: unknown[] = []) {
      queries++
      if (!sql.includes('agent_keys')) return { rows: [] }
      const hash = String(params[0])
      /**
       * Revoked rows are dropped ONLY IF the query asks for it.
       *
       * The first version of this fake filtered `revoked` itself, so the
       * "revoked key yields nobody" test would have passed even with the clause
       * cut out of the SQL -- it measured my fake, not the code. Verified by
       * mutation: after this change, deleting `revoked = FALSE` turns that test
       * red as well.
       */
      const wantsActive = /revoked\s*=\s*FALSE/i.test(sql)
      const hit = rows.find(r => r.hash === hash && !(wantsActive && r.revoked))
      return { rows: hit ? [{ telegram_id: hit.owner }] : [] }
    },
  }
}

const AGENT_KEYS = process.env.AGENT_KEYS
beforeEach(() => {
  // Empty -- otherwise the key would resolve synchronously from the environment
  // and the test would prove a completely different path works.
  process.env.AGENT_KEYS = ''
})
afterEach(() => {
  if (AGENT_KEYS === undefined) delete process.env.AGENT_KEYS
  else process.env.AGENT_KEYS = AGENT_KEYS
})

describe('ключ, выданный через /api/agent/keys, разрешается', () => {
  it('живой ключ даёт своего владельца', async () => {
    const pool = fakePool([
      { hash: hashOf(KEY), owner: '144022504', revoked: false },
    ])
    const who = await resolveIdentity(req({ 'x-agent-key': KEY }), () => pool)
    expect(who).toBe('144022504')
  })

  it('ОТОЗВАННЫЙ ключ не даёт никого', async () => {
    // A revocation with no consequence is a row change, not a revocation.
    const pool = fakePool([
      { hash: hashOf(KEY), owner: '144022504', revoked: true },
    ])
    expect(
      await resolveIdentity(req({ 'x-agent-key': KEY }), () => pool)
    ).toBeNull()
  })

  it('чужой ключ не даёт никого', async () => {
    const pool = fakePool([
      { hash: hashOf(KEY), owner: '144022504', revoked: false },
    ])
    expect(
      await resolveIdentity(req({ 'x-agent-key': 'tri_нетакой' }), () => pool)
    ).toBeNull()
  })

  it('в таблице лежит ХЕШ, а не сам ключ', async () => {
    // If the plain key were compared, a dump leak would be an access leak.
    const pool = fakePool([{ hash: KEY, owner: '144022504', revoked: false }])
    expect(
      await resolveIdentity(req({ 'x-agent-key': KEY }), () => pool)
    ).toBeNull()
  })
})

describe('разрешение не повышает права', () => {
  it('без заголовка в базу вообще не ходим', async () => {
    const pool = fakePool([])
    expect(await resolveIdentity(req({}), () => pool)).toBeNull()
    expect(pool.queries).toBe(0)
  })

  it('недоступная база — это ОТКАЗ, а не проход', async () => {
    const throws = () => {
      throw new Error('база недоступна')
    }
    expect(
      await resolveIdentity(req({ 'x-agent-key': KEY }), throws as any)
    ).toBeNull()
  })

  it('запрос к базе спрашивает только неотозванные', async () => {
    // The revoked = FALSE condition belongs in the query itself: filtering in
    // code after the fetch means forgetting to filter one day.
    let sql = ''
    const pool = {
      async query(q: string) {
        sql = q
        return { rows: [] }
      },
    }
    await resolveIdentity(req({ 'x-agent-key': KEY }), () => pool)
    expect(sql).toMatch(/revoked\s*=\s*FALSE/i)
  })
})
