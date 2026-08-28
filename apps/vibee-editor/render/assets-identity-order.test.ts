import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/**
 * `/api/assets` is on the public list on purpose, so its handlers own the
 * identity check themselves.
 *
 * auth.ts lets everything under `/api/assets` past the global guard, with a
 * comment saying each handler verifies identity: POST/DELETE through a Telegram
 * signature or an agent key, and GET /api/assets/:telegram_id by matching the
 * signer against the id in the path. I read the three handlers and the comment
 * is true today — identity is checked before the body is read and before the
 * database is touched, and GET compares the signer with the requested id.
 *
 * This test exists so it stays true. The arrangement is one refactor away from
 * being wrong in a way nothing would notice: move `readBody` above the identity
 * check and an unauthenticated request starts being parsed; move the database
 * call up and it starts being answered. Neither shows up in a type check, and
 * the global guard cannot help — it was told to stand aside here.
 *
 * #902 asks for exactly this: that a handler-owned public route really does
 * verify identity before body, DB or provider.
 *
 * What this does NOT check: that the identity function is correct, or that the
 * 401 body says anything useful. Only the order, which is the part a refactor
 * silently changes.
 */

const SERVER = path.join(__dirname, 'render-server.ts')

/** The handlers auth.ts lets past the guard, by their dispatch line. */
const HANDLERS = [
  {
    name: 'POST /api/assets',
    head: "=== '/api/assets' && req.method === 'POST'",
  },
  {
    name: 'DELETE /api/assets',
    head: "=== '/api/assets' && req.method === 'DELETE'",
  },
  {
    name: 'GET /api/assets/:telegram_id',
    head: "startsWith('/api/assets/') && req.method === 'GET'",
  },
]

/** Anything that reads the request body or reaches for data. */
const AFTER = [
  'readBody(',
  'JSON.parse(await',
  'supabase',
  'getPool(',
  '.query(',
]

/** Establishing who is asking. */
const IDENTITY = ['chatIdentity(', 'verifiedTelegramId(', 'agentKeyOwner(']

function block(src: string, head: string): string {
  const start = src.indexOf(head)
  if (start === -1) return ''
  // Up to the next top-level route dispatch, which is where this handler ends.
  const rest = src.slice(start + head.length)
  const end = rest.indexOf('\n  if (req.url')
  return end === -1 ? rest : rest.slice(0, end)
}

function firstIndex(hay: string, needles: string[]): number {
  const hits = needles.map(n => hay.indexOf(n)).filter(i => i !== -1)
  return hits.length ? Math.min(...hits) : -1
}

describe('public /api/assets handlers check identity first', () => {
  const src = fs.readFileSync(SERVER, 'utf8')

  it('all three handlers are found — otherwise the checks below are empty', () => {
    for (const h of HANDLERS) {
      expect(block(src, h.head).length, h.name).toBeGreaterThan(0)
    }
  })

  for (const h of HANDLERS) {
    it(`${h.name} establishes the caller before reading body or data`, () => {
      const body = block(src, h.head)
      const identity = firstIndex(body, IDENTITY)
      const touches = firstIndex(body, AFTER)

      // No identity call at all in a route the global guard waves through is
      // the worst case, not a pass.
      expect(identity, `${h.name}: no identity check found`).toBeGreaterThan(-1)

      if (touches !== -1) {
        expect(
          identity,
          `${h.name}: body or data is reached at ${touches} before identity at ${identity}`
        ).toBeLessThan(touches)
      }
    })

    it(`${h.name} refuses with 401 when the caller is unknown`, () => {
      // An identity that is computed and then ignored would satisfy the order
      // check above while changing nothing.
      expect(block(src, h.head)).toContain('401')
    })
  }

  it('GET compares the signer against the telegram_id in the path', () => {
    // The specific hole this handler was given: a valid signature used to be
    // enough, so a signed-in person could read someone else's history.
    const body = block(src, HANDLERS[2].head)
    expect(body).toMatch(/String\(who\)\s*!==\s*String\(telegram_id\)/)
  })
})
