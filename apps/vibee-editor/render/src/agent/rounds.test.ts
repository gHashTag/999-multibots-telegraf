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

describe('a browser that stopped being a browser', () => {
  const blank = async () => ({ title: '', text: '' })

  it('is restarted once and walked again', async () => {
    let restarts = 0
    let looks = 0
    const said: string[] = []
    const out = await runRound({
      personHasTheWheel: async () => false,
      look: async () => {
        looks += 1
        /* Blank until the restart, alive after it. */
        return restarts
          ? { title: '(2) Notifications / X', text: 'something' }
          : { title: '', text: '' }
      },
      tell: async t => void said.push(t),
      now: () => new Date('2026-09-23T07:05:00Z'),
      restart: async () => {
        restarts += 1
        return true
      },
      sites: [
        { name: 'X', url: 'https://x.com' },
        { name: 'hh.ru', url: 'https://hh.ru' },
      ],
    })
    expect(restarts).toBe(1)
    expect(out).toContain('restarted')
    /* One message, and it is the one from after the restart. */
    expect(said).toHaveLength(1)
    expect(said[0]).toContain('• X: 2 новых')
    /* Four blank looks before (two sites, a second look each), two after. */
    expect(looks).toBe(6)
  })

  it('tells the person plainly when the restart did not help', async () => {
    const said: string[] = []
    const out = await runRound({
      personHasTheWheel: async () => false,
      look: blank,
      tell: async t => void said.push(t),
      now: () => new Date(),
      restart: async () => false,
      sites: [
        { name: 'X', url: 'https://x.com' },
        { name: 'hh.ru', url: 'https://hh.ru' },
      ],
    })
    expect(out).toContain('restart failed')
    expect(said[0]).toContain('«Закрыть»')
  })

  it('one quiet site is not a broken browser', async () => {
    let restarts = 0
    await runRound({
      personHasTheWheel: async () => false,
      look: async url =>
        url.includes('x.com')
          ? { title: '', text: '' }
          : { title: 'Лента | LinkedIn', text: 'posts' },
      tell: async () => {},
      now: () => new Date(),
      restart: async () => {
        restarts += 1
        return true
      },
      sites: [
        { name: 'X', url: 'https://x.com' },
        { name: 'LinkedIn', url: 'https://linkedin.com' },
      ],
    })
    expect(restarts).toBe(0)
  })
})

describe('the round says WHICH things, not only how many', () => {
  it('lists the first rows the page carried', () => {
    const line = lineFor({
      name: 'hh.ru',
      title: '13 ・ Отклики',
      text: 'whatever the page says',
      items: [
        {
          title: 'Приглашение на собеседование',
          text: '',
          when: '2 ч',
          href: '/x',
        },
        { title: 'Отказ', text: '', when: 'вчера', href: '/y' },
        {
          title: 'Третье, которое не поместится',
          text: '',
          when: '',
          href: '',
        },
      ],
      ok: true,
      ms: 10,
    })
    expect(line).toContain('13 новых')
    expect(line).toContain('◦ Приглашение на собеседование (2 ч)')
    expect(line).toContain('◦ Отказ (вчера)')
    expect(line).not.toContain('Третье')
  })

  it('falls back to the page text when it lists nothing', () => {
    const line = lineFor({
      name: 'LinkedIn',
      title: 'Лента | LinkedIn',
      text: 'posts and more posts',
      items: [],
      ok: true,
      ms: 10,
    })
    expect(line).toContain('posts and more posts')
  })

  it('the log counts the rows and still carries no page text', () => {
    const log = JSON.parse(
      roundLog([
        {
          name: 'X',
          title: '(2) Notifications / X',
          text: 'private words of a person',
          items: [
            { title: 'somebody followed you', text: '', when: '', href: '' },
          ],
          ok: true,
          ms: 5,
        },
      ])
    ) as Array<Record<string, unknown>>
    expect(log[0]).toMatchObject({ site: 'X', unread: 2, rows: 1 })
    expect(JSON.stringify(log)).not.toContain('private words')
    expect(JSON.stringify(log)).not.toContain('followed you')
  })
})
