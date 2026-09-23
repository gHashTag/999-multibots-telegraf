/**
 * WHAT THIS TEST MEASURES: THE SQL, NOT THE FAKE.
 *
 * The trap this repo has already fallen into twice is a fake pool that answers
 * the same rows to any statement: the test then passes with the WHERE clause
 * cut out, and what it proved was that the fake returns what it was told to.
 * `privateCounts.test.ts` records the mutation that exposed it, and
 * `agent-key-resolve.test.ts` records the same lesson in a different surface.
 *
 * So every case here asserts on the statement that was issued. A scope dropped
 * from a predicate, or a column named that does not exist on this database,
 * fails a case rather than a review.
 */
import { describe, expect, it } from 'vitest'
import {
  followPerson,
  listFollows,
  loadFollowCounts,
  resolveUsernameToTelegramId,
  unfollowPerson,
} from './follows'

type Rows = Array<Record<string, unknown>>

interface Call {
  sql: string
  params: unknown[]
}

/** A pool that remembers what it was asked. `answer` may return an Error to throw. */
function fakeDb(answer: (sql: string, params: unknown[]) => Rows | Error) {
  const calls: Call[] = []
  const db = {
    async query(text: string, values: unknown[] = []) {
      const sql = String(text).replace(/\s+/g, ' ').trim()
      calls.push({ sql, params: values })
      const result = answer(sql, values)
      if (result instanceof Error) throw result
      return { rows: result }
    },
  }
  return { db, calls }
}

const MISSING = new Error('relation does not exist')

describe('resolveUsernameToTelegramId', () => {
  it('never names deleted_at on profiles, and matches the username case-insensitively', async () => {
    /*
     * `profiles` HAS NO `deleted_at`. Its DDL is in render-server.ts and the
     * column belongs to `public_templates` alone. A resolver that carried the
     * predicate across would 500 on the first follow ever pressed -- so the
     * absence is asserted, not assumed.
     *
     * The case-insensitive match is the second half: every other username
     * lookup in the server uses LOWER() on both sides, and an exact match here
     * would refuse exactly the people whose profile pages render today.
     */
    const { db, calls } = fakeDb(sql => {
      if (!/FROM profiles/.test(sql)) return []
      if (/deleted_at/.test(sql))
        return new Error(`profiles has no deleted_at: ${sql}`)
      if (!/LOWER\(username\) = LOWER\(\$1\)/.test(sql))
        return new Error(`username match is not case-insensitive: ${sql}`)
      return [{ telegram_id: 42 }]
    })

    await expect(resolveUsernameToTelegramId(db, 'Neo')).resolves.toBe('42')
    expect(calls).toHaveLength(1)
    expect(calls[0].params).toEqual(['Neo'])
  })

  it('falls through profiles to public_templates to users, in that order', async () => {
    const { db, calls } = fakeDb(sql => {
      if (/FROM profiles/.test(sql)) return MISSING
      if (/FROM public_templates/.test(sql)) return []
      if (/FROM users/.test(sql)) return [{ telegram_id: '777' }]
      return []
    })

    await expect(resolveUsernameToTelegramId(db, 'ghost')).resolves.toBe('777')
    expect(calls.map(c => c.sql.match(/FROM (\w+)/)?.[1])).toEqual([
      'profiles',
      'public_templates',
      'users',
    ])
  })

  it('answers null when no source knows the name, and asks nothing for an empty one', async () => {
    const { db } = fakeDb(() => [])
    await expect(resolveUsernameToTelegramId(db, 'nobody')).resolves.toBeNull()

    const empty = fakeDb(() => [])
    await expect(
      resolveUsernameToTelegramId(empty.db, '   ')
    ).resolves.toBeNull()
    expect(empty.calls).toHaveLength(0)
  })
})

describe('loadFollowCounts', () => {
  it('scopes both counts to the subject and is_following to the viewer', async () => {
    /*
     * MUTATION THIS CASE CATCHES: drop `follower_id = $2` from the EXISTS and
     * every profile reports that you already follow it, hiding the Follow
     * button from everyone. Drop a `followee_id = $1` and the followers count
     * becomes the platform-wide total number of follows.
     */
    const { db, calls } = fakeDb(sql => {
      const followers =
        /COUNT\(\*\)::int FROM user_follows WHERE followee_id = \$1/
      const following =
        /COUNT\(\*\)::int FROM user_follows WHERE follower_id = \$1/
      const mine =
        /EXISTS \( SELECT 1 FROM user_follows WHERE follower_id = \$2 AND followee_id = \$1 \)/
      if (!followers.test(sql)) return new Error(`followers unscoped: ${sql}`)
      if (!following.test(sql)) return new Error(`following unscoped: ${sql}`)
      if (!mine.test(sql)) return new Error(`is_following unscoped: ${sql}`)
      return [{ followers_count: 3, following_count: 1, is_following: true }]
    })

    await expect(loadFollowCounts(db, '42', '99')).resolves.toEqual({
      followers_count: 3,
      following_count: 1,
      is_following: true,
    })
    expect(calls[0].params).toEqual(['42', '99'])
  })

  it('passes a null viewer rather than the string "null"', async () => {
    // `follower_id = 'null'` matches nobody by luck, not by rule. A real null
    // makes the EXISTS false by definition.
    const { db, calls } = fakeDb(() => [
      { followers_count: 0, following_count: 0, is_following: false },
    ])
    await loadFollowCounts(db, '42', undefined)
    expect(calls[0].params).toEqual(['42', null])
  })

  it('returns null rather than inventing zeroes when the table is missing', async () => {
    const { db } = fakeDb(() => MISSING)
    await expect(loadFollowCounts(db, '42', '99')).resolves.toBeNull()
  })
})

describe('followPerson', () => {
  it('refuses to follow yourself without asking the database', async () => {
    const { db, calls } = fakeDb(() => [])
    await expect(followPerson(db, '42', '42')).resolves.toBeNull()
    expect(calls).toHaveLength(0)
  })

  it('creates the table, writes idempotently, and answers with the new counts', async () => {
    /*
     * ON CONFLICT DO NOTHING is not tidiness. The client paints the +1 before
     * the request lands and retries on a dropped connection; without it the
     * second attempt is a primary-key violation, which reaches the person as
     * "follow failed" on a follow that succeeded.
     */
    const { db, calls } = fakeDb(sql => {
      if (/INSERT INTO user_follows/.test(sql)) {
        if (!/ON CONFLICT DO NOTHING/.test(sql))
          return new Error(`write is not idempotent: ${sql}`)
        return []
      }
      if (/COUNT\(\*\)::int FROM user_follows/.test(sql))
        return [{ followers_count: 1, following_count: 0, is_following: true }]
      return []
    })

    await expect(followPerson(db, '99', '42')).resolves.toEqual({
      followers_count: 1,
      following_count: 0,
      is_following: true,
    })

    const statements = calls.map(c => c.sql)
    expect(statements[0]).toMatch(/CREATE TABLE IF NOT EXISTS user_follows/)
    expect(statements[0]).toMatch(/CHECK \(follower_id <> followee_id\)/)
    expect(statements[1]).toMatch(/CREATE INDEX IF NOT EXISTS/)
    expect(statements[2]).toMatch(/INSERT INTO user_follows/)
    expect(calls[2].params).toEqual(['99', '42'])
  })

  it('reports failure instead of a silent no-op when the write throws', async () => {
    const { db } = fakeDb(sql =>
      /INSERT INTO/.test(sql) ? new Error('disk full') : []
    )
    await expect(followPerson(db, '99', '42')).resolves.toBeNull()
  })
})

describe('unfollowPerson', () => {
  it('deletes exactly the one pair', async () => {
    /*
     * MUTATION THIS CASE CATCHES: drop `AND followee_id = $2` and one unfollow
     * empties the person's entire following list.
     *
     * The assertion is on the statement, not on the parameters. Both ids are
     * still PASSED by the mutant -- `$2` simply goes unused -- so a test that
     * only inspected `params` passes a delete that clears the table. Measured:
     * the first version of this case did exactly that and survived.
     */
    const { db, calls } = fakeDb(() => [])
    await unfollowPerson(db, '99', '42')
    const del = calls.find(c => /DELETE/.test(c.sql))
    expect(del?.sql).toMatch(
      /DELETE FROM user_follows WHERE follower_id = \$1 AND followee_id = \$2/
    )
    expect(del?.params).toEqual(['99', '42'])
  })
})

describe('listFollows', () => {
  const page = (rows: Rows) => rows

  it('reads the mirror column for each direction', async () => {
    for (const [direction, subjectColumn, resultColumn] of [
      ['followers', 'followee_id', 'follower_id'],
      ['following', 'follower_id', 'followee_id'],
    ] as const) {
      const { db, calls } = fakeDb(sql =>
        /FROM user_follows WHERE/.test(sql) ? page([]) : []
      )
      await listFollows(db, '42', direction, null)
      expect(calls[0].sql).toContain(`SELECT ${resultColumn} AS person`)
      expect(calls[0].sql).toContain(`WHERE ${subjectColumn} = $1`)
      expect(calls[0].params).toEqual(['42', 20, 0])
    }
  })

  it('returns no telegram_id, hides private profiles, and marks the viewer', async () => {
    /*
     * THIS ROUTE IS PUBLIC. `auth.ts` puts `/api/users/` in
     * PUBLIC_GET_PREFIXES for GET, so anything this function returns is
     * readable by anyone -- which is the same door render-server.ts:10836 was
     * patched to close on the profile GET. A telegram_id here would reopen it
     * from the side.
     */
    const { db } = fakeDb(sql => {
      if (/FROM user_follows WHERE followee_id/.test(sql))
        return [{ person: '1' }, { person: '2' }, { person: '3' }]
      if (/FROM profiles/.test(sql))
        return [
          {
            telegram_id: '1',
            username: 'neo',
            display_name: 'Neo',
            avatar_url: null,
            is_verified: true,
            is_public: true,
          },
          {
            telegram_id: '2',
            username: 'hidden',
            display_name: 'Hidden',
            avatar_url: null,
            is_verified: false,
            is_public: false,
          },
          {
            telegram_id: '3',
            username: 'viewer',
            display_name: 'Me',
            avatar_url: null,
            is_verified: false,
            is_public: true,
          },
        ]
      if (/SELECT followee_id FROM user_follows/.test(sql))
        return [{ followee_id: '1' }]
      return []
    })

    const people = await listFollows(db, '42', 'followers', '3')
    expect(people).toEqual([
      {
        username: 'neo',
        display_name: 'Neo',
        avatar_url: null,
        is_verified: true,
        is_following: true,
        is_self: false,
      },
      {
        username: 'viewer',
        display_name: 'Me',
        avatar_url: null,
        is_verified: false,
        is_following: false,
        is_self: true,
      },
    ])
    for (const person of people ?? []) {
      expect(Object.keys(person)).not.toContain('telegram_id')
      expect(Object.keys(person)).not.toContain('id')
    }
  })

  it('names people from public_templates and users when profiles has no row', async () => {
    const { db } = fakeDb(sql => {
      if (/FROM user_follows WHERE followee_id/.test(sql))
        return [{ person: '7' }, { person: '8' }]
      if (/FROM profiles/.test(sql)) return MISSING
      if (/FROM public_templates/.test(sql))
        return [
          {
            telegram_id: '7',
            creator_username: 'maker',
            creator_name: 'Maker',
            creator_avatar: 'a.png',
          },
        ]
      if (/FROM users/.test(sql))
        return [{ telegram_id: '8', username: 'plain' }]
      return []
    })

    const people = await listFollows(db, '42', 'followers', null)
    expect(people?.map(p => p.username)).toEqual(['maker', 'plain'])
  })

  it('does not ask who the viewer follows when nobody is signed in', async () => {
    const { db, calls } = fakeDb(sql => {
      if (/FROM user_follows WHERE followee_id/.test(sql))
        return [{ person: '1' }]
      if (/FROM profiles/.test(sql))
        return [{ telegram_id: '1', username: 'neo', is_public: true }]
      return []
    })
    await listFollows(db, '42', 'followers', null)
    expect(
      calls.some(c => /SELECT followee_id FROM user_follows/.test(c.sql))
    ).toBe(false)
  })

  it('clamps the page size and answers null only when the list itself fails', async () => {
    const big = fakeDb(() => [])
    await listFollows(big.db, '42', 'followers', null, { limit: 5000, page: 2 })
    expect(big.calls[0].params).toEqual(['42', 50, 100])

    const broken = fakeDb(() => MISSING)
    await expect(
      listFollows(broken.db, '42', 'followers', null)
    ).resolves.toBeNull()
  })
})
