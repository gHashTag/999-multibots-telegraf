import { describe, it, expect, beforeEach } from 'vitest'
import {
  noteShape,
  noteReach,
  postsSoFar,
  resetReachLogForTests,
} from './reach-log'
import { whatTheNumbersSay } from './reach-test'

function db() {
  const rows = new Map<string, { shape: string; reach: number | null }>()
  return {
    rows,
    async query(sql: string, params: unknown[] = []) {
      if (sql.includes('INSERT INTO blog_reach')) {
        const [slug, shape] = params as string[]
        rows.set(slug, { shape, reach: rows.get(slug)?.reach ?? null })
        return { rows: [] }
      }
      if (sql.includes('UPDATE blog_reach')) {
        const [slug, reach] = params as [string, number]
        const had = rows.get(slug)
        if (had) had.reach = reach
        return { rows: [] }
      }
      if (sql.includes('SELECT slug, shape')) {
        return {
          rows: [...rows.entries()].map(([slug, r]) => ({
            slug,
            shape: r.shape,
            at: '2026-09-24T00:00:00Z',
            reach: r.reach,
          })),
        }
      }
      return { rows: [] }
    },
  }
}

beforeEach(() => resetReachLogForTests())

describe('the shape of every post is written down when it goes out', () => {
  it('keeps the shape, and the reach when somebody reads it off', async () => {
    const d = db()
    await noteShape(d, 'gf-t', 'thread')
    await noteReach(d, 'gf-t', 412)
    expect(await postsSoFar(d)).toEqual([
      { slug: 'gf-t', shape: 'thread', at: '2026-09-24T00:00:00Z', reach: 412 },
    ])
  })

  it('a post nobody has read off yet is an unanswered question', async () => {
    const d = db()
    await noteShape(d, 'a', 'single')
    const posts = await postsSoFar(d)
    expect(posts[0].reach).toBeNull()
    expect(whatTheNumbersSay(posts).says).toContain('нечего сравнивать')
  })

  it('refuses nonsense quietly: no slug, no negative reach', async () => {
    const d = db()
    await noteShape(d, '', 'thread')
    await noteReach(d, 'ghost', -5)
    expect(d.rows.size).toBe(0)
  })

  it('never throws when the database is unwell', async () => {
    const sick = {
      async query() {
        throw new Error('no database')
      },
    }
    await expect(noteShape(sick, 'a', 'thread')).resolves.toBeUndefined()
    expect(await postsSoFar(sick)).toEqual([])
  })
})
