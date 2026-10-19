import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  COURSES_ROUTE,
  WANTED_TTL_SECONDS,
  courseHandBack,
  courseIntent,
  courseKeyReply,
  courseUrl,
  createWantedCourseStore,
} from '@/services/courseAccess'
import {
  CLUB_JOIN,
  CLUB_SITE,
  clubCardKeyboard,
  signInOnSite,
} from '@/navigation/helpers/clubCard'
import type { KvClient } from '@/core/session/sessionStore'
import type { ClubStatus } from '@/services/clubMembership'

/*
 * Owner, 2026-10-13: he joined the club from t27.ai, paid in the bot, and had
 * no way back to the site. The bot now remembers the course a reader wanted,
 * hands him back to it after the first club payment, and gives a member a
 * "Sign in on t27.ai" door. These tests pin each half.
 */

const ROOT = join(__dirname, '..', '..', '..')

const fakeFetch = (body: unknown, seen: any[] = []) =>
  (async (url: string, init: any) => {
    seen.push({ url, body: JSON.parse(init.body) })
    return { status: 200, json: async () => body } as any
  }) as unknown as typeof fetch

const KEY_BODY = { ok: true, key: 'abc.def', until: '2026-11-12' }

function fakeKv(): KvClient & { data: Map<string, string>; ex: number[] } {
  const data = new Map<string, string>()
  const ex: number[] = []
  return {
    data,
    ex,
    async get(k) {
      return data.get(k) ?? null
    },
    async set(k, v, o) {
      data.set(k, v)
      if (o?.expiration) ex.push(o.expiration.value)
    },
    async del(k) {
      data.delete(k)
    },
  }
}

describe('the URL the bot sends', () => {
  it('carries utm before the hash and the key inside the hash route', () => {
    expect(courseUrl('courses', 'a.b/c', 'club')).toBe(
      'https://t27.ai/?utm_source=telegram&utm_medium=bot&utm_campaign=club#/courses?unlock=a.b%2Fc'
    )
    const u = new URL(courseUrl('verify-hardware', 'k', 'course'))
    // What trafficArrival.ts reads: the page query, not the hash.
    expect(u.searchParams.get('utm_source')).toBe('telegram')
    expect(u.searchParams.get('utm_medium')).toBe('bot')
    expect(u.searchParams.get('utm_campaign')).toBe('course')
    expect(u.hash).toBe('#/verify-hardware?unlock=k')
  })

  it('accepts /start course_paid_courses, the site sign-in link', () => {
    expect(courseIntent('course_paid_courses')).toEqual({
      step: 'paid',
      route: COURSES_ROUTE,
    })
  })

  it("the render's route check accepts `courses`", () => {
    const src = readFileSync(
      join(ROOT, 'apps/vibee-editor/render/src/agent/course-access.ts'),
      'utf8'
    )
    const slug = src.match(/const SLUG = (\/.+\/)\n/)?.[1]
    expect(slug).toBeTruthy()
    const re = new RegExp(slug!.slice(1, -1))
    expect(re.test(COURSES_ROUTE)).toBe(true)
  })
})

describe('the no-club answer', () => {
  it('on the site sign-in, promises the automatic button back, not a second press', () => {
    for (const isRu of [true, false]) {
      const r = courseKeyReply(
        isRu,
        { step: 'paid', route: COURSES_ROUTE },
        { kind: 'no_club' }
      )
      expect(r.button).toBeUndefined()
      expect(r.text).not.toMatch(/same button|ту же кнопку/) // cyrillic-ok: UI copy under test
      expect(r.text).toMatch(/bot sends|бот сам пришлёт/) // cyrillic-ok: UI copy under test
      // ...and does not pretend a course needs signing in.
      expect(r.text).toMatch(/free to read|бесплатны/) // cyrillic-ok: UI copy under test
    }
  })

  it('on a course, opens the course free and never asks for the club (spec VERSION 3)', () => {
    for (const isRu of [true, false]) {
      const r = courseKeyReply(
        isRu,
        { step: 'paid', route: 'clocks-and-cdc' },
        { kind: 'no_club' }
      )
      expect(r.button?.url).toBe(
        'https://t27.ai/?utm_source=telegram&utm_medium=bot&utm_campaign=course#/clocks-and-cdc'
      )
      // No key rides in a free course's address.
      expect(r.button?.url).not.toContain('unlock')
      expect(r.text).toMatch(/free now|бесплатны/) // cyrillic-ok: UI copy under test
      expect(r.text).not.toMatch(/fourth|четвёрт|how to join|как вступить/i) // cyrillic-ok: UI copy under test
    }
  })

  it('names the catalog as the courses on t27.ai, not as a course called "courses"', () => {
    const r = courseKeyReply(
      false,
      { step: 'paid', route: COURSES_ROUTE },
      { kind: 'key', url: 'https://t27.ai/x', until: '2026-11-12' }
    )
    expect(r.button?.label).toBe('Open the courses on t27.ai')
    expect(r.text).not.toContain('"courses"')
  })
})

describe('the remembered course', () => {
  it('is kept per person in the shared store, with a 7-day TTL', async () => {
    const kv = fakeKv()
    const store = createWantedCourseStore(kv)
    await store.set('1000001', 'verify-hardware')
    expect(kv.data.get('course:wanted:1000001')).toBe('verify-hardware')
    expect(kv.ex).toEqual([WANTED_TTL_SECONDS])
    expect(WANTED_TTL_SECONDS).toBe(7 * 24 * 3600)
    // A second store over the same Redis (another bot) reads it.
    expect(await createWantedCourseStore(kv).get('1000001')).toBe(
      'verify-hardware'
    )
  })

  it('without Redis, lives in memory and expires after the TTL', async () => {
    let t = 0
    const store = createWantedCourseStore(undefined, { now: () => t })
    await store.set('1', 'course')
    expect(await store.get('1')).toBe('course')
    t = WANTED_TTL_SECONDS * 1000 + 1
    expect(await store.get('1')).toBeNull()
  })

  it('falls back to memory when Redis fails, and never stores a bad route', async () => {
    const broken: KvClient = {
      get: async () => {
        throw new Error('down')
      },
      set: async () => {
        throw new Error('down')
      },
      del: async () => {
        throw new Error('down')
      },
    }
    const store = createWantedCourseStore(broken)
    await store.set('1', 'course')
    expect(await store.get('1')).toBe('course')
    await store.set('2', '../etc')
    expect(await store.get('2')).toBeNull()
  })

  it('/start remembers the route when the sign-in press finds no club', () => {
    const src = readFileSync(
      join(ROOT, 'src/navigation/registerCommands.ts'),
      'utf8'
    )
    // Only the catalog (the site sign-in) goes on to the club card: a course
    // is free since spec VERSION 3 and got its own button.
    const noClub = src.indexOf(
      "outcome.kind === 'no_club' &&\n          courseStep.route === COURSES_ROUTE"
    )
    const remember = src.indexOf('.set(String(ctx.from.id), courseStep.route)')
    expect(noClub).toBeGreaterThan(0)
    expect(remember).toBeGreaterThan(noClub)
    expect(remember - noClub).toBeLessThan(600)
  })
})

describe('the hand-back after the club payment', () => {
  it('mints the paid key for the remembered course and forgets it', async () => {
    const store = createWantedCourseStore(undefined)
    await store.set('1000001', 'verify-hardware')
    const seen: any[] = []
    const back = await courseHandBack({ id: 1000001 }, false, {
      store,
      key: 'k',
      fetchImpl: fakeFetch(KEY_BODY, seen),
    })
    expect(seen[0].body).toMatchObject({
      telegram_id: '1000001',
      step: 'paid',
      route: 'verify-hardware',
    })
    expect(back).toMatchObject({
      route: 'verify-hardware',
      button: {
        label: 'Open the courses on t27.ai',
        url: 'https://t27.ai/?utm_source=telegram&utm_medium=bot&utm_campaign=club#/verify-hardware?unlock=abc.def',
      },
    })
    expect(back!.text).not.toContain('abc.def')
    expect(await store.get('1000001')).toBeNull()
  })

  it('opens the catalog when no course is remembered (RU label)', async () => {
    const seen: any[] = []
    const back = await courseHandBack({ id: 1000002 }, true, {
      store: createWantedCourseStore(undefined),
      key: 'k',
      fetchImpl: fakeFetch(KEY_BODY, seen),
    })
    expect(seen[0].body.route).toBe(COURSES_ROUTE)
    expect(back?.button.label).toBe('Открыть курсы на t27.ai') // cyrillic-ok: UI copy under test
    expect(back?.button.url).toBe(
      'https://t27.ai/?utm_source=telegram&utm_medium=bot&utm_campaign=club#/courses?unlock=abc.def'
    )
  })

  it('sends nothing when the render gives no key, and keeps the course for later', async () => {
    const store = createWantedCourseStore(undefined)
    await store.set('1000003', 'course')
    const back = await courseHandBack({ id: 1000003 }, false, {
      store,
      key: 'k',
      fetchImpl: fakeFetch({ ok: false, reason: 'no_club' }),
    })
    expect(back).toBeNull()
    expect(await store.get('1000003')).toBe('course')
  })
})

describe('"Sign in on t27.ai" for a member', () => {
  const status = (active: boolean): ClubStatus => ({
    active,
    granted: null,
    until: null,
    daysLeft: 20,
    stars: 10000,
    periodDays: 30,
    tokensPerPeriod: 2571,
    guestEnded: null,
  })
  const datas = (kb: any) =>
    kb.reply_markup.inline_keyboard.flat().map((b: any) => b.callback_data)

  it('is on the member card, and only there', () => {
    expect(
      datas(clubCardKeyboard(true, status(true), { app: false }))
    ).toContain(CLUB_SITE)
    const offer = datas(clubCardKeyboard(true, status(false), { app: false }))
    expect(offer).not.toContain(CLUB_SITE)
    expect(offer).toContain(CLUB_JOIN)
  })

  it('mints a paid key for the catalog and answers with one URL button', async () => {
    const seen: any[] = []
    const reply = vi.fn(async (..._a: unknown[]) => undefined)
    const ctx = {
      from: { id: 1000004, language_code: 'en' },
      chat: { id: 1000004, type: 'private' },
      state: {},
      session: {},
      reply,
    }
    await signInOnSite(ctx as never, {
      key: 'k',
      fetchImpl: fakeFetch(KEY_BODY, seen),
    })
    expect(seen[0].body).toMatchObject({ step: 'paid', route: COURSES_ROUTE })
    const [, extra] = reply.mock.calls[0] as [string, any]
    const button = extra.reply_markup.inline_keyboard[0][0]
    expect(button.url).toBe(
      'https://t27.ai/?utm_source=telegram&utm_medium=bot&utm_campaign=signin#/courses?unlock=abc.def'
    )
  })
})
