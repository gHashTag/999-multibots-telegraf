import { describe, it, expect, beforeEach } from 'vitest'
import {
  hostOf,
  wantKey,
  worthTrying,
  rememberPress,
  learnedLabel,
  resetRecipesForTests,
} from './recipes'

function fakeDb() {
  const rows = new Map<string, { label: string; hits: number }>()
  const queries: string[] = []
  return {
    rows,
    queries,
    async query(sql: string, params: unknown[] = []) {
      queries.push(sql.trim().split('\n')[0])
      if (sql.includes('INSERT INTO browser_recipes')) {
        const [host, want, label] = params as string[]
        const had = rows.get(`${host}|${want}`)
        rows.set(`${host}|${want}`, {
          label,
          hits: (had?.hits ?? 0) + 1,
        })
        return { rows: [] }
      }
      if (sql.includes('SELECT label FROM browser_recipes')) {
        const [host, want] = params as string[]
        const had = rows.get(`${host}|${want}`)
        return { rows: had ? [{ label: had.label }] : [] }
      }
      return { rows: [] }
    },
  }
}

beforeEach(() => resetRecipesForTests())

describe('the key of a lesson', () => {
  it('is the site without www and the asked words, folded', () => {
    expect(hostOf('https://www.x.com/home?a=1')).toBe('x.com')
    expect(hostOf('not a url')).toBe('')
    expect(wantKey('  Continue   With  Google ')).toBe('continue with google')
  })
})

describe('the agent learns the buttons of a site', () => {
  it('keeps the label that really answered, and reads it back', async () => {
    const db = fakeDb()
    await rememberPress(db, {
      url: 'https://x.com/i/flow/login',
      want: 'Google',
      label: 'continue with google',
    })
    expect(await learnedLabel(db, 'https://x.com/home', 'google')).toBe(
      'continue with google'
    )
  })

  it('a newer press replaces the lesson and counts', async () => {
    const db = fakeDb()
    const press = (label: string) =>
      rememberPress(db, { url: 'https://linkedin.com/x', want: 'post', label })
    await press('post')
    await press('опубликовать')
    expect(db.rows.get('linkedin.com|post')).toEqual({
      label: 'опубликовать',
      hits: 2,
    })
  })

  it('keeps nothing from a press with no host or no label', async () => {
    const db = fakeDb()
    await rememberPress(db, { url: 'nope', want: 'post', label: 'post' })
    await rememberPress(db, { url: 'https://x.com', want: 'post', label: ' ' })
    expect(db.rows.size).toBe(0)
  })

  it('never throws when the database is unwell', async () => {
    const sick = {
      async query() {
        throw new Error('no database today')
      },
    }
    await expect(
      rememberPress(sick, { url: 'https://x.com', want: 'a', label: 'b' })
    ).resolves.toBeUndefined()
    expect(await learnedLabel(sick, 'https://x.com', 'a')).toBeNull()
  })
})

describe('when the lesson is worth trying', () => {
  it('only when it differs from what was asked', () => {
    expect(worthTrying('google', 'continue with google')).toBe(true)
    expect(worthTrying('Google', 'google')).toBe(false)
    expect(worthTrying('google', null)).toBe(false)
  })
})
