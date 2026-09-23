import { describe, it, expect } from 'vitest'
import {
  unreadOf,
  looksSignedOut,
  lineFor,
  roundMessage,
  roundLog,
  runRound,
  type Seen,
} from './rounds'

const seen = (over: Partial<Seen> = {}): Seen => ({
  name: 'X',
  title: '(1) Notifications / X',
  text: 'Stéphane Conversy followed you',
  ok: true,
  ms: 100,
  ...over,
})

describe('the count a site puts in its own title', () => {
  it('is read, and absent when there is none', () => {
    expect(unreadOf('(15) Подписки - YouTube')).toBe(15)
    expect(unreadOf('(9+) Home / X')).toBe(9)
    /* hh.ru writes it with a dot instead of brackets. */
    expect(unreadOf('13 ・ Профиль')).toBe(13)
    expect(unreadOf('Лента | LinkedIn')).toBeNull()
    expect(unreadOf('(0) nothing')).toBeNull()
  })
})

describe('a round tells the person what it saw', () => {
  it('says how many are new, and what the top of the page says', () => {
    expect(lineFor(seen())).toBe(
      '• X: 1 новых — Stéphane Conversy followed you…'
    )
  })

  it('says plainly when a site asks to sign in again', () => {
    expect(
      lineFor(
        seen({ name: 'LinkedIn', title: 'Вход', text: 'Войти по паролю' })
      )
    ).toContain('вход слетел')
  })

  it('says when a site did not open at all', () => {
    expect(lineFor(seen({ ok: false }))).toContain('не открылось')
  })

  it('never goes silent: a quiet round says it is quiet', () => {
    const text = roundMessage(
      [seen({ title: 'Лента | LinkedIn', name: 'LinkedIn', text: '' })],
      new Date('2026-09-23T07:05:00Z')
    )
    expect(text).toContain('07:05 UTC')
    expect(text).toContain('Ничего нового')
    expect(text).toContain('• LinkedIn: нового нет')
  })
})

describe('a round never drives over the person', () => {
  it('is skipped entirely while they hold the wheel', async () => {
    const looked: string[] = []
    const said: string[] = []
    const out = await runRound({
      personHasTheWheel: async () => true,
      look: async url => {
        looked.push(url)
        return { title: '', text: '' }
      },
      tell: async t => void said.push(t),
      now: () => new Date(),
    })
    expect(out).toContain('the person is driving')
    expect(looked).toEqual([])
    expect(said).toEqual([])
  })

  it('walks every site, survives one that fails, and logs what it saw', async () => {
    const said: string[] = []
    const log = await runRound({
      personHasTheWheel: async () => false,
      look: async url => {
        if (url.includes('tiktok')) throw new Error('no')
        return { title: '(2) Notifications / X', text: 'something happened' }
      },
      tell: async t => void said.push(t),
      now: () => new Date('2026-09-23T07:05:00Z'),
      sites: [
        { name: 'X', url: 'https://x.com/notifications' },
        { name: 'TikTok', url: 'https://www.tiktok.com/foryou' },
      ],
    })
    const rows = JSON.parse(log) as Array<Record<string, unknown>>
    expect(rows.map(r => r.site)).toEqual(['X', 'TikTok'])
    expect(rows[0]).toMatchObject({ ok: true, unread: 2 })
    expect(rows[1]).toMatchObject({ ok: false, unread: null })
    expect(said[0]).toContain('• TikTok: не открылось')
  })

  it('a log line is one row per site, and nothing from the page', () => {
    const log = roundLog([seen({ text: 'private words of a person' })])
    expect(log).not.toContain('private words')
    expect(JSON.parse(log)[0]).toMatchObject({ site: 'X', unread: 1 })
  })
})

describe('a page that answered with nothing gets one more look', () => {
  it('reads it again, and keeps the second answer', async () => {
    let looks = 0
    const said: string[] = []
    await runRound({
      personHasTheWheel: async () => false,
      look: async () => {
        looks += 1
        return looks === 1
          ? { title: '', text: '' }
          : { title: '(3) Подписки - YouTube', text: 'a new video' }
      },
      tell: async t => void said.push(t),
      now: () => new Date('2026-09-23T07:05:00Z'),
      sites: [{ name: 'YouTube', url: 'https://youtube.com' }],
    })
    expect(looks).toBe(2)
    expect(said[0]).toContain('• YouTube: 3 новых')
  })

  it('does not look twice at a page that answered', async () => {
    let looks = 0
    await runRound({
      personHasTheWheel: async () => false,
      look: async () => {
        looks += 1
        return { title: 'Лента | LinkedIn', text: 'posts' }
      },
      tell: async () => {},
      now: () => new Date(),
      sites: [{ name: 'LinkedIn', url: 'https://linkedin.com' }],
    })
    expect(looks).toBe(1)
  })
})
