import { describe, expect, it } from 'vitest'
import * as SPEC from './reddit-desk.gen'
import {
  SUBREDDITS,
  isClosed,
  mayTake,
  skipActive,
  tellSkip,
  type CommunityState,
} from '../agent/reddit'
import { skipStore } from '../agent/reddit-wiring'

/**
 * THE REDDIT DESK HEALS ITS OWN LIST, WRITTEN IN t27 FIRST (skill
 * t27-spec-first).
 *
 * src/spec/reddit-desk.t27 holds the rules and the numbers; reddit-desk.gen.ts
 * is `t27c gen-ts` of it. Each `test` of the spec runs here against the HOST:
 * src/agent/reddit.ts (isClosed, skipActive, mayTake, tellSkip, SUBREDDITS)
 * and reddit-wiring.ts (skipStore). The tick itself -- a banned first
 * community skipped, recorded and the next one asked; a skip that expires;
 * the owner's list untouched -- is in src/agent/reddit.test.ts.
 */

describe('spec reddit-desk.t27', () => {
  it('a community Reddit closed is skipped, and an unknown read is not', () => {
    const closed: CommunityState[] = [
      'banned',
      'private',
      'quarantined',
      'not_found',
      'restricted',
    ]
    for (const s of closed) expect(isClosed(s)).toBe(true)
    expect(isClosed('open')).toBe(false)
    expect(isClosed('unknown')).toBe(false)
    expect(SPEC.UNKNOWN_SKIPS).toBe(false)
  })

  it('a skip lasts thirty days, then the community is tried again', () => {
    expect(skipActive(0)).toBe(true)
    expect(skipActive(2591999999)).toBe(true)
    expect(skipActive(2592000000)).toBe(false)
    expect(mayTake(true, 0)).toBe(false)
    expect(mayTake(true, 2591999999)).toBe(false)
    expect(mayTake(true, 2592000000)).toBe(true)
    expect(mayTake(false, 0)).toBe(true)
    expect(SPEC.SKIP_MS).toBe(2592000000)
    expect(SPEC.SKIP_MS).toBe(30 * 24 * 3600 * 1000)
  })

  it('the owner is told once per new skip', () => {
    expect(tellSkip(false)).toBe(true)
    expect(tellSkip(true)).toBe(false)
  })

  it("the owner's own list is never rewritten", async () => {
    expect(SPEC.OWNER_LIST_REWRITTEN).toBe(false)
    expect(SPEC.LIST_KEY).not.toBe(SPEC.SKIP_KEY)
    /* The skip store touches its own row and nothing else. */
    const keys: string[] = []
    const pool = {
      query: async (sql: string, params: unknown[] = []) => {
        if (
          /^\s*(SELECT|INSERT|UPDATE|DELETE)\b[\s\S]*agent_strategies/i.test(
            sql
          )
        )
          keys.push(String(params[0]))
        return { rows: [] }
      },
    }
    const store = skipStore(pool)
    await store.write([
      { name: 't27ai', state: 'banned', at: '2026-10-03T00:00:00.000Z' },
    ])
    await store.read()
    expect(keys.length).toBeGreaterThan(0)
    expect(new Set(keys)).toEqual(new Set([SPEC.SKIP_KEY]))
  })

  it('the desk creates nothing and posts only on a yes', () => {
    expect(SPEC.CREATES_SUBREDDIT).toBe(false)
    expect(SPEC.ASK_NEEDS_YES).toBe(true)
  })

  it('the built-in list no longer names the banned community', () => {
    expect(SUBREDDITS).toHaveLength(SPEC.DEFAULT_SUBREDDITS)
    expect(SUBREDDITS.map(s => s.name.toLowerCase())).not.toContain('t27ai')
  })
})
