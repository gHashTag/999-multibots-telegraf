import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as SPEC from './course-access.gen'
// Every fn of the spec runs from its compiled body: the host
// (src/agent/course-access.ts) imports them and writes none of them.
import * as LOGIC from './course-access.logic'
import {
  crmTag,
  keyDays,
  lessonEvent,
  mayOpen,
  mayReport,
  mintOk,
  stepOf,
  tellsOwner,
} from './course-access.logic'

const people: { owner: string; lead: string; name: unknown }[] = []
const touches: { owner: string; lead: string; kind: string; note?: string }[] =
  []
vi.mock('../agent/chat-memory', () => ({
  rememberPerson: async (
    _p: unknown,
    owner: string,
    lead: string,
    name: unknown
  ) => {
    people.push({ owner, lead, name })
  },
}))
vi.mock('../agent/crm-touches', () => ({
  recordTouch: async (_p: unknown, t: any) => {
    touches.push(t)
    return 'recorded'
  },
}))

import {
  handleCourse,
  mintFor,
  readKey,
  reportLesson,
  type CourseDeps,
} from '../agent/course-access'

/*
 * Postgres returns copies and decides conflicts; so does this double. It
 * knows only the statements course-access.ts sends, and fails loudly on any
 * other, so a new query cannot pass by being ignored.
 */
function fakePool() {
  const learners = new Map<string, string>() // telegram -> learner
  const progress = new Set<string>()
  const told = new Set<string>()
  const tags: { owner: string; lead: string; tag: string; source: string }[] =
    []
  let n = 0
  const pool = {
    tags,
    progress,
    async query(sql: string, p: unknown[] = []) {
      const q = sql.replace(/\s+/g, ' ').trim()
      if (q.startsWith('CREATE TABLE')) return { rows: [], rowCount: 0 }
      if (q.startsWith('INSERT INTO course_learner')) {
        const tg = String(p[1])
        if (!learners.has(tg)) learners.set(tg, `L${++n}`.padEnd(16, 'x'))
        return { rows: [{ learner_id: learners.get(tg) }], rowCount: 1 }
      }
      if (q.startsWith('INSERT INTO course_told')) {
        const k = p.join('|')
        if (told.has(k)) return { rows: [], rowCount: 0 }
        told.add(k)
        return { rows: [], rowCount: 1 }
      }
      if (q.startsWith('INSERT INTO course_progress')) {
        progress.add(p.join('|'))
        return { rows: [], rowCount: 1 }
      }
      if (q.startsWith('SELECT count(*)::int AS n FROM course_progress')) {
        const pre = `${p[0]}|${p[1]}|`
        return {
          rows: [{ n: [...progress].filter(x => x.startsWith(pre)).length }],
        }
      }
      if (q.startsWith('SELECT l.telegram_id')) {
        const tg = [...learners].find(([, l]) => l === p[0])?.[0]
        return { rows: tg ? [{ telegram_id: tg, first_name: 'Ada' }] : [] }
      }
      if (q.startsWith('INSERT INTO crm_tags')) {
        tags.push({
          owner: String(p[0]),
          lead: String(p[1]),
          tag: String(p[2]),
          source: String(p[3]),
        })
        return { rows: [], rowCount: 1 }
      }
      throw new Error(`fake pool does not know: ${q.slice(0, 60)}`)
    },
  }
  return pool
}

const NOW = new Date('2026-10-11T12:00:00Z')
let told: string[]
let clubActive: boolean
let clubDays: number
const deps = (): CourseDeps => ({
  getPool: async () => pool as any,
  isServer: () => true,
  readBody: async () => '{}',
  club: async () => ({ active: clubActive, daysLeft: clubDays }),
  tellOwner: async t => {
    told.push(t)
  },
  now: () => NOW,
})
let pool: ReturnType<typeof fakePool>
const ADA = { telegramId: '1000001', firstName: 'Ada' }
let prevKey: string | undefined

beforeEach(() => {
  pool = fakePool()
  told = []
  people.length = 0
  touches.length = 0
  clubActive = false
  clubDays = 0
  prevKey = process.env.SESSION_SIGNING_KEY
  process.env.SESSION_SIGNING_KEY = 'k'.repeat(48)
})
afterEach(() => {
  process.env.SESSION_SIGNING_KEY = prevKey
})

const keyOf = (o: Awaited<ReturnType<typeof mintFor>>) => {
  if (!o.ok) throw new Error(`no key: ${o.reason}`)
  return o.key
}

describe('course-access.t27: every spec test, against the host', () => {
  it('the first course is free, whichever it is', async () => {
    expect(stepOf(0)).toBe(SPEC.STEP_FREE)
    expect(mayOpen(stepOf(0), false, false)).toBe(true)
    // A free step mints nothing: there is no word for it at the bot.
    expect(await mintFor(pool, ADA, 'free', 'course', deps())).toEqual({
      ok: false,
      reason: 'bad_request',
    })
  })

  it('the second needs the bot', async () => {
    expect(stepOf(1)).toBe(SPEC.STEP_BOT)
    expect(mayOpen(SPEC.STEP_BOT, false, false)).toBe(false)
    expect(mayOpen(SPEC.STEP_BOT, false, true)).toBe(false)
    expect(mayOpen(SPEC.STEP_BOT, true, false)).toBe(true)
    const out = await mintFor(pool, ADA, 'bot', 'verify-hardware', deps())
    const r = (await handleCourse(
      { url: `/api/course/key?k=${keyOf(out)}`, method: 'GET' },
      deps()
    )) as any
    expect(r.body).toMatchObject({ ok: true, step: SPEC.STEP_BOT })
  })

  it('the third is free again', () => {
    expect(stepOf(2)).toBe(SPEC.STEP_FREE)
    expect(mayOpen(stepOf(2), false, false)).toBe(true)
  })

  it('the fourth and every one after it need the club', async () => {
    for (const n of [3, 4, 6, 200]) expect(stepOf(n)).toBe(SPEC.STEP_PAID)
    expect(mayOpen(SPEC.STEP_PAID, true, false)).toBe(false)
    expect(mayOpen(SPEC.STEP_PAID, false, true)).toBe(true)
    expect(SPEC.LADDER_RUNGS).toBe(4)
    // The host asks the club, and without it hands out nothing.
    expect(await mintFor(pool, ADA, 'paid', 'clocks-and-cdc', deps())).toEqual({
      ok: false,
      reason: 'no_club',
    })
    clubActive = true
    clubDays = 12
    const out = await mintFor(pool, ADA, 'paid', 'clocks-and-cdc', deps())
    expect(out).toMatchObject({ ok: true, step: SPEC.STEP_PAID })
  })

  it('an unknown step opens nothing', async () => {
    expect(mayOpen(3, true, true)).toBe(false)
    expect(mayOpen(255, true, true)).toBe(false)
    expect((await mintFor(pool, ADA, 'gold', 'course', deps())).ok).toBe(false)
  })

  it('a key is minted only for a step that needs one, and only signed', async () => {
    expect(mintOk(SPEC.STEP_BOT, false, true)).toBe(true)
    expect(mintOk(SPEC.STEP_PAID, true, true)).toBe(true)
    expect(mintOk(SPEC.STEP_PAID, false, true)).toBe(false)
    expect(mintOk(SPEC.STEP_FREE, true, true)).toBe(false)
    expect(mintOk(SPEC.STEP_BOT, true, false)).toBe(false)
    expect(mintOk(SPEC.STEP_PAID, true, false)).toBe(false)
    expect(SPEC.MINTS_WITHOUT_SECRET).toBe(false)
    expect(SPEC.KEY_CARRIES_TELEGRAM_ID).toBe(false)
    // The host: a key carries no Telegram id, and a forged one is refused.
    const key = keyOf(await mintFor(pool, ADA, 'bot', 'course', deps()))
    const payload = Buffer.from(key.split('.')[0], 'base64url').toString()
    expect(payload).not.toContain(ADA.telegramId)
    const forged = `${Buffer.from(`2.${payload.split('.')[1]}.99999`).toString('base64url')}.${key.split('.')[1]}`
    expect(readKey(forged, NOW, Buffer.from('x')).ok).toBe(false)
    // ...and with no signing secret nothing is minted at all.
    process.env.SESSION_SIGNING_KEY = ''
    expect(await mintFor(pool, ADA, 'bot', 'course', deps())).toEqual({
      ok: false,
      reason: 'keys_off',
    })
    const r = await handleCourse(
      { url: `/api/course/key?k=${key}`, method: 'GET' },
      deps()
    )
    expect(r.body).toMatchObject({ ok: false, reason: 'keys_off' })
  })

  it('a paid key lives as long as the club, a bot key does not run out', async () => {
    expect(keyDays(SPEC.STEP_BOT, 0)).toBe(SPEC.BOT_KEY_DAYS)
    expect(keyDays(SPEC.STEP_BOT, 12)).toBe(SPEC.BOT_KEY_DAYS)
    expect(keyDays(SPEC.STEP_PAID, 12)).toBe(12)
    expect(keyDays(SPEC.STEP_PAID, 30)).toBe(30)
    expect(keyDays(SPEC.STEP_FREE, 30)).toBe(0)
    expect(SPEC.BOT_KEY_DAYS).toBe(3650)
    clubActive = true
    clubDays = 12
    const paid = await mintFor(pool, ADA, 'paid', 'course', deps())
    expect(paid).toMatchObject({ ok: true, until: '2026-10-23' })
    const bot = await mintFor(pool, ADA, 'bot', 'course', deps())
    expect(bot).toMatchObject({ ok: true, until: '2036-10-08' })
    // The paid key stops opening the day the club ends.
    const k = keyOf(paid)
    const after = await handleCourse(
      { url: `/api/course/key?k=${k}`, method: 'GET' },
      { ...deps(), now: () => new Date('2026-10-24T00:00:00Z') }
    )
    expect(after.body).toMatchObject({ ok: false, reason: 'expired' })
  })

  it('the CRM tag follows the step', async () => {
    expect(crmTag(SPEC.STEP_BOT)).toBe('course-bot')
    expect(crmTag(SPEC.STEP_PAID)).toBe('course-paid')
    expect(crmTag(SPEC.STEP_FREE)).toBe('')
    expect(SPEC.CRM_SOURCE).toBe('course')
    await mintFor(pool, ADA, 'bot', 'course', deps())
    expect(people.map(p => p.lead)).toEqual([ADA.telegramId])
    expect(pool.tags).toEqual([
      expect.objectContaining({
        lead: ADA.telegramId,
        tag: 'course-bot',
        source: 'course',
      }),
    ])
    expect(touches[0]).toMatchObject({ lead: ADA.telegramId, kind: 'note' })
  })

  it('a module is three lessons, a course twenty-seven', async () => {
    expect(lessonEvent(1)).toBe(SPEC.EVENT_LESSON)
    expect(lessonEvent(2)).toBe(SPEC.EVENT_LESSON)
    expect(lessonEvent(3)).toBe(SPEC.EVENT_MODULE)
    expect(lessonEvent(4)).toBe(SPEC.EVENT_LESSON)
    expect(lessonEvent(24)).toBe(SPEC.EVENT_MODULE)
    expect(lessonEvent(26)).toBe(SPEC.EVENT_LESSON)
    expect(lessonEvent(27)).toBe(SPEC.EVENT_COURSE)
    expect(SPEC.LESSONS_PER_MODULE * 9).toBe(SPEC.LESSONS_PER_COURSE)
    // The host counts lessons from its own rows, not from the report.
    const key = keyOf(await mintFor(pool, ADA, 'bot', 'course', deps()))
    told = []
    const events: number[] = []
    for (let i = 1; i <= 27; i++) {
      const o = await reportLesson(pool, key, 'course', `l${i}`, deps())
      if (o.ok) events.push(o.event)
    }
    expect(events.filter(e => e === SPEC.EVENT_MODULE)).toHaveLength(8)
    expect(events.at(-1)).toBe(SPEC.EVENT_COURSE)
    expect(told).toHaveLength(9)
  })

  it('the owner hears of keys, modules and courses, once each', async () => {
    expect(tellsOwner(SPEC.EVENT_KEY_BOT, false)).toBe(true)
    expect(tellsOwner(SPEC.EVENT_KEY_PAID, false)).toBe(true)
    expect(tellsOwner(SPEC.EVENT_MODULE, false)).toBe(true)
    expect(tellsOwner(SPEC.EVENT_COURSE, false)).toBe(true)
    expect(tellsOwner(SPEC.EVENT_LESSON, false)).toBe(false)
    expect(tellsOwner(SPEC.EVENT_MODULE, true)).toBe(false)
    expect(tellsOwner(SPEC.EVENT_KEY_BOT, true)).toBe(false)
    expect(tellsOwner(0, false)).toBe(false)
    expect(tellsOwner(6, false)).toBe(false)
    // The host: a double tap on the bot link tells the owner once.
    const key = keyOf(await mintFor(pool, ADA, 'bot', 'course', deps()))
    await mintFor(pool, ADA, 'bot', 'course', deps())
    expect(told).toHaveLength(1)
    expect(told[0]).toContain('Ada')
    // A lesson is recorded and not told; the same module twice, told once.
    for (const l of ['a', 'b'])
      await reportLesson(pool, key, 'course', l, deps())
    expect(told).toHaveLength(1)
    await reportLesson(pool, key, 'course', 'c', deps())
    await reportLesson(pool, key, 'course', 'c', deps())
    expect(told).toHaveLength(2)
  })

  it('the site sends nothing before the bot', async () => {
    expect(mayReport(false)).toBe(false)
    expect(mayReport(true)).toBe(true)
    expect(SPEC.SENDS_BEFORE_BOT).toBe(false)
    const out = await reportLesson(pool, 'not-a-key', 'course', 'l1', deps())
    expect(out.ok).toBe(false)
    expect(pool.progress.size).toBe(0)
    // And only the bot mints: without the server key, a 403.
    const r = await handleCourse(
      { url: '/api/course/key', method: 'POST' },
      {
        ...deps(),
        isServer: () => false,
        readBody: async () =>
          JSON.stringify({ telegram_id: '1', step: 'bot', route: 'course' }),
      }
    )
    expect(r.status).toBe(403)
  })

  it('the bot link fits Telegram', () => {
    expect(SPEC.BOT).toBe('t27ai_bot')
    expect(SPEC.START_PREFIX).toBe('course_')
    expect(SPEC.KEY_PARAM).toBe('unlock')
    expect(SPEC.START_MAX_CHARS).toBe(64)
    expect(SPEC.LEARNER_ID_CHARS).toBeLessThanOrEqual(32)
    // The longest course route the catalog has today, on the longest step word.
    const longest = `${SPEC.START_PREFIX}paid_buses-and-peripherals`
    expect(longest.length).toBeLessThanOrEqual(SPEC.START_MAX_CHARS)
  })

  it('what is not built is said', () => {
    expect(mayReport(SPEC.SENDS_BEFORE_BOT)).toBe(false)
    expect(SPEC.SITE_CHECKOUT).toBe(false)
    expect(SPEC.CONTENT_HIDDEN).toBe(false)
    expect(SPEC.RUN_LIVE).toBe(false)
    expect(SPEC.COURSES_KNOWN).toBe(7)
  })

  it("VERSION says what the header's last note says", () => {
    expect(SPEC.VERSION).toBe(1)
    expect(stepOf(SPEC.VERSION)).toBe(SPEC.STEP_BOT)
    expect(Object.keys(LOGIC)).toContain('stepOf')
  })
})
