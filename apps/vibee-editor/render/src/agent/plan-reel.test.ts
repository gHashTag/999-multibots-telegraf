/**
 * The plan and the course (plan-reel.t27): the course read from its own
 * spec, whole or not at all, in Russian where its bundle speaks; plan_list
 * carrying each card's reel and the next press; plan_course_add free and
 * never twice. The press itself: a-story-reel-for-any-client.test.ts.
 */
import { describe, expect, it } from 'vitest'
import * as SPEC from '../spec/plan-reel.gen'
import {
  cardCall,
  lessonCard,
  lessonLinkIn,
  parseCourse,
  readCourse,
  withRussian,
} from './plan-reel'
import { planTools } from './plan-tools'

/** A course.t27 of `n` lessons, in the shape of the real one. */
function courseSpec(n: number): string {
  const ids = Array.from({ length: n }, (_, k) => `lesson-${k + 1}`)
  const list = (xs: string[]) =>
    `[\n    ${xs.map(x => JSON.stringify(x)).join(',\n    ')}\n]`
  return [
    '; the course; a comment with "quotes"; and semicolons',
    'module course;',
    'pub const TITLE : str = "From zero to a chip";',
    `pub const LESSON_COUNT : u8 = ${n};`,
    `pub const LESSON_IDS : [${n}]str = ${list(ids)};`,
    `pub const LESSON_TITLES : [${n}]str = ${list(ids.map(i => `Title of ${i}`))};`,
    `pub const LESSON_GOALS : [${n}]str = ${list(ids.map(i => `Goal; of ${i}`))};`,
  ].join('\n')
}

const answer = (body: string, ok = true) => ({ ok, text: async () => body })

describe('the course, read from its own spec', () => {
  it('reads the title and every lesson, a ";" inside a string kept', () => {
    const c = parseCourse(courseSpec(SPEC.COURSE_LESSONS))!
    expect(c.title).toBe('From zero to a chip')
    expect(c.lessons).toHaveLength(SPEC.COURSE_LESSONS)
    expect(c.lessons[3]).toEqual({
      id: 'lesson-4',
      title: 'Title of lesson-4',
      goal: 'Goal; of lesson-4',
    })
  })

  it('refuses a course that does not read whole', () => {
    expect(parseCourse(courseSpec(SPEC.COURSE_LESSONS - 1))).toBeNull()
    expect(parseCourse('module course;')).toBeNull()
    // Every id, one title short: lessons would be named by their neighbours.
    const short = courseSpec(SPEC.COURSE_LESSONS).replace(
      /"Title of lesson-27"/,
      ''
    )
    expect(parseCourse(short)).toBeNull()
  })

  it('takes Russian from the bundle, English where a field is missing', () => {
    const c = withRussian(parseCourse(courseSpec(SPEC.COURSE_LESSONS))!, {
      ui: { TITLE: 'С нуля до чипа' },
      lessons: { 'lesson-1': { TITLE: 'Урок один', GOAL: '' } },
    })
    expect(c.title).toBe('С нуля до чипа')
    expect(c.lessons[0]).toMatchObject({
      title: 'Урок один',
      goal: 'Goal; of lesson-1',
    })
    expect(c.lessons[1].title).toBe('Title of lesson-2')
  })

  it("asks the spec's sources in order, the bundle last", async () => {
    const asked: string[] = []
    const c = await readCourse(async url => {
      asked.push(url)
      if (url === SPEC.COURSE_SOURCES[0]) return answer('', false)
      if (url === SPEC.COURSE_SOURCES[1])
        return answer(courseSpec(SPEC.COURSE_LESSONS))
      return answer(JSON.stringify({ ui: { TITLE: 'Курс' } }))
    }, true)
    expect(asked).toEqual([...SPEC.COURSE_SOURCES, SPEC.COURSE_RU_SOURCE])
    expect(c!.title).toBe('Курс')
  })

  it('no source that reads whole: no course, and the bundle is not asked', async () => {
    const asked: string[] = []
    const c = await readCourse(async url => {
      asked.push(url)
      return answer(courseSpec(3))
    }, true)
    expect(c).toBeNull()
    expect(asked).toEqual([...SPEC.COURSE_SOURCES])
  })

  it("a lesson's card links its lesson, and its reel ends there", () => {
    const card = lessonCard({
      id: 'bits-and-trits',
      title: 'Биты',
      goal: 'Как.',
    })
    expect(card.note).toBe(`Как.\n${SPEC.LESSON_ROUTE}bits-and-trits/`)
    expect(lessonLinkIn(card.note)).toBe(`${SPEC.LESSON_ROUTE}bits-and-trits/`)
    expect(cardCall(card.note)).toBe('t27.ai/learn/bits-and-trits/')
    expect(cardCall('no lesson here, t27.ai/#/blog')).toBe('')
  })

  // v2: a crawler drops what follows '#'; t27.ai/#/... previews as the home
  // page wherever it is shared (owner's screenshot, 2026-10-08).
  it('never hands out a #/ address, and reads a v1 card as its lesson page', () => {
    expect(SPEC.LESSON_ROUTE).not.toContain('#')
    expect(
      cardCall(lessonCard({ id: 'x', title: 't', goal: 'g' }).note)
    ).not.toContain('#')
    expect(
      lessonLinkIn('Old card.\nhttps://t27.ai/#/course/bits-and-trits')
    ).toBe(`${SPEC.LESSON_ROUTE}bits-and-trits/`)
    expect(cardCall('https://t27.ai/#/course/bits-and-trits')).toBe(
      't27.ai/learn/bits-and-trits/'
    )
  })
})

// ---- The tools, on a pool that holds the plan and the reels ------------------------------

const ME = '900000077'
type Item = {
  id: number
  goal_id: number
  telegram_id: string
  title: string
  note: string | null
  status: string
  template_id: string | null
}
type StoryJob = {
  item_id: number | null
  lead_id: string
  status: string
  url: string | null
  live?: boolean
  poster?: string | null
}

function fakePlan() {
  const db = {
    goals: [] as Array<{
      id: number
      telegram_id: string
      title: string
      intent: string | null
    }>,
    items: [] as Item[],
    jobs: [] as StoryJob[],
  }
  const query = async (
    sql: string,
    p: any[] = []
  ): Promise<{ rows: any[] }> => {
    const q = sql.replace(/\s+/g, ' ').trim()
    if (/^CREATE/i.test(q)) return { rows: [] }
    if (q.startsWith('SELECT id, title, intent')) {
      return { rows: db.goals.filter(g => g.telegram_id === p[0]) }
    }
    if (q.startsWith('SELECT id, goal_id, title, note, status, template_id')) {
      return {
        rows: db.items
          .filter(i => i.telegram_id === p[0])
          .sort((a, b) => a.id - b.id),
      }
    }
    if (q.startsWith('SELECT item_id, status, url,')) {
      return {
        rows: db.jobs
          .filter(j => j.lead_id === p[0])
          .reverse()
          .map(j => ({ ...j, live: j.live ?? false })),
      }
    }
    if (q.startsWith('SELECT count(*)::int AS n FROM story_jobs')) {
      return {
        rows: [
          {
            n: db.jobs.filter(
              j => j.lead_id === p[0] && j.item_id && j.status === 'done'
            ).length,
          },
        ],
      }
    }
    if (q.startsWith('INSERT INTO content_plan_goals')) {
      if (!db.goals.some(g => g.telegram_id === p[0] && g.title === p[1]))
        db.goals.push({
          id: db.goals.length + 1,
          telegram_id: p[0],
          title: p[1],
          intent: p[2],
        })
      return { rows: [] }
    }
    if (
      q.startsWith(
        'SELECT id FROM content_plan_goals WHERE telegram_id = $1 AND title = $2'
      )
    ) {
      return {
        rows: db.goals.filter(g => g.telegram_id === p[0] && g.title === p[1]),
      }
    }
    if (
      q.startsWith(
        'SELECT title FROM content_plan_items WHERE telegram_id = $1 AND goal_id = $2'
      )
    ) {
      return {
        rows: db.items.filter(
          i => i.telegram_id === p[0] && i.goal_id === p[1]
        ),
      }
    }
    if (q.startsWith('INSERT INTO content_plan_items')) {
      db.items.push({
        id: db.items.length + 100,
        goal_id: p[0],
        telegram_id: p[1],
        title: p[2],
        note: p[3],
        status: 'idea',
        template_id: null,
      })
      return { rows: [] }
    }
    throw new Error(`unexpected SQL: ${q.slice(0, 80)}`)
  }
  return { db, pool: { query } }
}

const tool = (name: string) => planTools.find(t => t.name === name)!
const ctxOf = (pool: unknown, telegramId = ME) =>
  ({ pool, telegramId }) as never

describe('plan_list carries the reels of its cards', () => {
  it("each card's reel, what is being made, and the next press's scenes and price", async () => {
    const { db, pool } = fakePlan()
    db.goals.push({ id: 1, telegram_id: ME, title: 'Курс', intent: null })
    for (const [id, status] of [
      [1, 'done'],
      [2, 'doing'],
      [3, 'idea'],
      [4, 'done'],
    ] as const)
      db.items.push({
        id,
        goal_id: 1,
        telegram_id: ME,
        title: `card ${id}`,
        note: null,
        status,
        template_id: null,
      })
    db.jobs.push(
      {
        item_id: 4,
        lead_id: ME,
        status: 'done',
        url: 'https://bucket.example/four.mp4',
        // Tried, none drawn: the browser's frame stands, and the poster of a
        // newer reel on another card never stands in for it.
        poster: '',
      },
      {
        item_id: 1,
        lead_id: ME,
        status: 'done',
        url: 'https://bucket.example/old.mp4',
        poster: 'https://shelf.example/old.jpg',
      },
      {
        item_id: 1,
        lead_id: ME,
        status: 'done',
        url: 'https://bucket.example/new.mp4',
        poster: 'https://shelf.example/new.jpg',
      }
    )
    const r: any = await tool('plan_list').handler({}, ctxOf(pool))
    const cards = r['цели'][0]['карточки'] // cyrillic-ok: plan_list's own keys
    expect(cards[0].reel).toBe('https://bucket.example/new.mp4')
    expect(cards[0].poster).toBe('https://shelf.example/new.jpg')
    expect(cards[1].reel).toBeUndefined()
    expect(cards[1].poster).toBeUndefined()
    expect(cards[3].reel).toBe('https://bucket.example/four.mp4')
    expect(cards[3].poster).toBeUndefined()
    expect(cards[2].press).toBe(true)
    expect(r.reel_press).toMatchObject({
      scenes: SPEC.FULL_SCENES,
      busy: false,
    })
    expect(r.reel_press.price_tokens).toBeGreaterThan(0)
  })

  it('the first press is the trial; while one is made, no card offers it', async () => {
    const { db, pool } = fakePlan()
    db.goals.push({ id: 1, telegram_id: ME, title: 'Курс', intent: null })
    db.items.push(
      {
        id: 1,
        goal_id: 1,
        telegram_id: ME,
        title: 'a',
        note: null,
        status: 'doing',
        template_id: null,
      },
      {
        id: 2,
        goal_id: 1,
        telegram_id: ME,
        title: 'b',
        note: null,
        status: 'idea',
        template_id: null,
      }
    )
    db.jobs.push({
      item_id: 1,
      lead_id: ME,
      status: 'running',
      url: null,
      live: true,
    })
    const r: any = await tool('plan_list').handler({}, ctxOf(pool))
    const cards = r['цели'][0]['карточки'] // cyrillic-ok: plan_list's own keys
    expect(cards[0].making).toBe(true)
    expect(cards[1].press).toBeUndefined()
    expect(r.reel_press).toMatchObject({
      scenes: SPEC.TRIAL_SCENES,
      busy: true,
    })
  })
})

describe('plan_course_add takes the course in', () => {
  const realFetch = globalThis.fetch
  const serve = (body: string) =>
    (globalThis.fetch = (async (url: string) =>
      url === SPEC.COURSE_RU_SOURCE
        ? answer(JSON.stringify({ ui: { TITLE: 'С нуля до чипа' } }))
        : answer(body)) as never)

  it('one goal, a card a lesson with its link -- and never twice', async () => {
    serve(courseSpec(SPEC.COURSE_LESSONS))
    try {
      const { db, pool } = fakePlan()
      const first: any = await tool('plan_course_add').handler({}, ctxOf(pool))
      expect(first['карточек']).toBe(SPEC.COURSE_LESSONS) // cyrillic-ok: tool's own key
      expect(db.goals.map(g => g.title)).toEqual(['С нуля до чипа'])
      expect(db.items[0].note).toContain(`${SPEC.LESSON_ROUTE}lesson-1`)
      const again: any = await tool('plan_course_add').handler({}, ctxOf(pool))
      expect(again['карточек']).toBe(0) // cyrillic-ok: tool's own key
      expect(db.items).toHaveLength(SPEC.COURSE_LESSONS)
    } finally {
      globalThis.fetch = realFetch
    }
  })

  it('one lesson by its number', async () => {
    serve(courseSpec(SPEC.COURSE_LESSONS))
    try {
      const { db, pool } = fakePlan()
      await tool('plan_course_add').handler({ lesson: '4' }, ctxOf(pool))
      expect(db.items.map(i => i.title)).toEqual(['Title of lesson-4'])
    } finally {
      globalThis.fetch = realFetch
    }
  })

  it('a course that does not read whole adds nothing', async () => {
    serve(courseSpec(5))
    try {
      const { db, pool } = fakePlan()
      const r: any = await tool('plan_course_add').handler({}, ctxOf(pool))
      expect(r['добавлено']).toBe(false) // cyrillic-ok: tool's own key
      expect(db.goals).toHaveLength(0)
      expect(db.items).toHaveLength(0)
    } finally {
      globalThis.fetch = realFetch
    }
  })
})
