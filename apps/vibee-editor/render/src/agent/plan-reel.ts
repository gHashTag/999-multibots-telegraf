/**
 * A CARD OF THE PLAN IS ONE PRESS FROM ITS REEL (plan-reel.t27).
 *
 * The owner, 2026-10-08: "t27.ai/#/course and my content plan -- link them to
 * my digital clone and the template; reel previews in the cabinet; start with
 * ONE reel, test it cheaply." The clone is the person's own face and voice,
 * the template is the story reel (story-template.ts); this file holds the
 * rules between a card and its reel, and reads the course from its own spec.
 *
 * Every number and rule comes from the spec's generated module: the host
 * never restates one (src/spec/plan-reel.test.ts runs the spec's tests here).
 */
/** What these reads need of a pool: the story job's and a tool's both fit. */
type Pool = { query: (sql: string, params?: unknown[]) => Promise<any> }
import * as SPEC from '../spec/plan-reel.gen'
import { posterOf } from './reel-poster'

export type CardStatus = 'idea' | 'doing' | 'done'

/** The spec's status code of a card's stored status; anything unknown is an idea. */
export function statusCode(status: unknown): number {
  return status === 'doing'
    ? SPEC.STATUS_DOING
    : status === 'done'
      ? SPEC.STATUS_DONE
      : SPEC.STATUS_IDEA
}

/** spec press_offered: an idea, while nothing of the person's is being made. */
export function pressOffered(status: number, busy: boolean): boolean {
  return status === SPEC.STATUS_IDEA && !busy
}

/** spec card_taken: a press takes its card only while it is an idea. */
export function cardTaken(status: number): boolean {
  return status === SPEC.STATUS_IDEA
}

/** spec preview_shown: a reel that came out stands on its card. */
export function previewShown(hasReel: boolean): boolean {
  return hasReel
}

/** spec scenes_for: the first reel from the plan is the one-scene trial. */
export function scenesFor(reelsOut: number): number {
  return reelsOut === 0 ? SPEC.TRIAL_SCENES : SPEC.FULL_SCENES
}

/** spec call_of: a card linking a lesson ends its reel on the lesson. */
export function callOf(linksLesson: boolean): number {
  return linksLesson ? SPEC.CALL_LESSON : SPEC.CALL_OWN
}

/** spec course_whole: the course is taken in whole or not at all. */
export function courseWhole(lessons: number): boolean {
  return lessons === SPEC.COURSE_LESSONS
}

/** spec lesson_added: a lesson that is a card already is not added again. */
export function lessonAdded(alreadyACard: boolean): boolean {
  return !alreadyACard
}

/** spec previews_shown: the cabinet's story card shows at most PREVIEWS_MAX. */
export function previewsShown(reelsOut: number): number {
  return Math.min(reelsOut, SPEC.PREVIEWS_MAX)
}

/** spec preview_height: a reel's picture is 9:16. */
export function previewHeight(width: number): number {
  return Math.floor((width * SPEC.PREVIEW_H) / SPEC.PREVIEW_W)
}

/**
 * The address of one lesson: its static page (spec v2), which carries the
 * lesson's own card. Never its SPA route: a crawler drops what follows '#'.
 */
export function lessonLink(id: string): string {
  return `${SPEC.LESSON_ROUTE}${id}/`
}

const escaped = SPEC.LESSON_ROUTE.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')
const LESSON_IN_TEXT = new RegExp(`${escaped}([a-z0-9-]+)`)
/*
 * A card written under v1 links the lesson by its SPA route
 * (https://t27.ai/#/course/<id>); it is the same lesson, so it is read and
 * answered with the lesson's page, not left to preview as the home page.
 */
const V1_LESSON_IN_TEXT = /https:\/\/t27\.ai\/#\/course\/([a-z0-9-]+)/

/** The lesson a card's note links, as its static page; '' when none. */
export function lessonLinkIn(note: unknown): string {
  const text = String(note ?? '')
  const m = LESSON_IN_TEXT.exec(text) ?? V1_LESSON_IN_TEXT.exec(text)
  return m ? lessonLink(m[1]) : ''
}

/**
 * The call a card's reel ends on, given to the story job as its `cta`: the
 * lesson's address without the scheme -- read on a phone, typed by hand --
 * or '' for the person's own call (the job then reads her profile).
 */
export function cardCall(note: unknown): string {
  const link = lessonLinkIn(note)
  return callOf(link !== '') === SPEC.CALL_LESSON
    ? link.replace(/^https?:\/\//, '')
    : ''
}

/**
 * The card a press was made on, taken in one statement: only the person's
 * own, only while it is an idea (card_taken). null: not hers, gone, or
 * already being made -- the press is refused, never moved to another card.
 */
export async function takePlanItemById(
  pool: Pool,
  lead: string,
  id: number
): Promise<{ id: number; title: string; note: string } | null> {
  if (!Number.isInteger(id) || id <= 0) return null
  let r: any
  try {
    r = await pool.query(
      `UPDATE content_plan_items SET status = 'doing', updated_at = now()
        WHERE id = $1 AND telegram_id = $2 AND status = 'idea'
        RETURNING id, title, COALESCE(note, '') AS note`,
      [id, String(lead)]
    )
  } catch {
    return null // no plan table: there is no card to take
  }
  const row = r?.rows?.[0]
  return row
    ? { id: Number(row.id), title: String(row.title), note: String(row.note) }
    : null
}

/** A card's note, for the writer of its lines; '' when there is none. */
export async function planItemNote(pool: Pool, id: unknown): Promise<string> {
  const n = Number(id)
  if (!Number.isInteger(n) || n <= 0) return ''
  try {
    const r = await pool.query(
      `SELECT COALESCE(note, '') AS note FROM content_plan_items WHERE id = $1`,
      [n]
    )
    return String(r?.rows?.[0]?.note ?? '')
  } catch {
    return ''
  }
}

/** How many reels made from the person's plan came out (the trial's count). */
export async function planReelsOut(pool: Pool, lead: string): Promise<number> {
  try {
    const r = await pool.query(
      `SELECT count(*)::int AS n FROM story_jobs
        WHERE lead_id = $1 AND item_id IS NOT NULL AND status = 'done'`,
      [String(lead)]
    )
    return Number(r?.rows?.[0]?.n ?? 0) || 0
  } catch {
    return 0 // no jobs table yet: nothing came out
  }
}

/**
 * What the person's reels say about her plan's cards: the reel of each card
 * that came out (the newest), the cards being made now, and whether anything
 * of hers is being made at all (busy: no card offers the press).
 */
export async function planReelsOf(
  pool: Pool,
  lead: string,
  freshMinutes: number
): Promise<{
  reels: Map<number, string>
  posters: Map<number, string>
  making: Set<number>
  busy: boolean
}> {
  const reels = new Map<number, string>()
  const posters = new Map<number, string>()
  const making = new Set<number>()
  let busy = false
  try {
    // The poster through to_jsonb: a process that has not added the column
    // yet (plan-reel v3) reads no poster instead of losing every reel.
    const r = await pool.query(
      `SELECT item_id, status, url, to_jsonb(story_jobs) ->> 'poster' AS poster,
              (status = 'running'
                AND updated_at > now() - ($2 || ' minutes')::interval) AS live
         FROM story_jobs WHERE lead_id = $1 ORDER BY id DESC LIMIT 200`,
      [String(lead), String(freshMinutes)]
    )
    for (const x of r?.rows ?? []) {
      if (x.live) {
        busy = true
        if (x.item_id) making.add(Number(x.item_id))
      }
      if (x.item_id && x.status === 'done' && x.url) {
        const id = Number(x.item_id)
        if (!reels.has(id)) {
          reels.set(id, String(x.url))
          const poster = posterOf(x.poster)
          if (poster) posters.set(id, poster)
        }
      }
    }
  } catch {
    // No jobs table yet: no reels, nothing being made.
  }
  return { reels, posters, making, busy }
}

// ---- The course, read from its own spec --------------------------------------------------

export interface CourseLesson {
  id: string
  title: string
  goal: string
}

export interface Course {
  title: string
  lessons: CourseLesson[]
}

/** The string literals of one `pub const NAME : ... = ...;` of a .t27 file. */
function constStrings(src: string, name: string): string[] | null {
  const head = new RegExp(`pub const ${name}\\s*:[^=]*=`)
  const m = head.exec(src)
  if (!m) return null
  const out: string[] = []
  let i = m.index + m[0].length
  let s = ''
  let inStr = false
  for (; i < src.length; i++) {
    const c = src[i]
    if (inStr) {
      if (c === '\\' && i + 1 < src.length) {
        s += src[++i]
      } else if (c === '"') {
        out.push(s)
        s = ''
        inStr = false
      } else s += c
    } else if (c === '"') inStr = true
    else if (c === ';') break
  }
  return out
}

/**
 * The course out of course.t27's own text: its title and, per lesson, the
 * id, title and goal. null unless it reads as the whole course
 * (course_whole) -- half a course is not taken in.
 */
export function parseCourse(src: string): Course | null {
  const ids = constStrings(src, 'LESSON_IDS')
  const titles = constStrings(src, 'LESSON_TITLES')
  const goals = constStrings(src, 'LESSON_GOALS')
  const title = constStrings(src, 'TITLE')?.[0] ?? ''
  if (!ids || !titles || !courseWhole(ids.length)) return null
  if (titles.length !== ids.length) return null
  return {
    title,
    lessons: ids.map((id, k) => ({
      id,
      title: titles[k],
      goal: goals?.[k] ?? '',
    })),
  }
}

/**
 * The course in Russian: each field the bundle carries over the English one,
 * the English kept where the bundle has none (course-ru.t27 FALLBACK "en").
 */
export function withRussian(course: Course, bundle: any): Course {
  const ui = bundle?.ui ?? {}
  const lessons = bundle?.lessons ?? {}
  const pick = (ru: unknown, en: string) =>
    typeof ru === 'string' && ru.trim() ? ru.trim() : en
  return {
    title: pick(ui.TITLE, course.title),
    lessons: course.lessons.map(l => ({
      id: l.id,
      title: pick(lessons[l.id]?.TITLE, l.title),
      goal: pick(lessons[l.id]?.GOAL, l.goal),
    })),
  }
}

type Fetch = (url: string) => Promise<{ ok: boolean; text(): Promise<string> }>

/**
 * The course from its sources, in the spec's order: the first that reads as
 * the whole course. Russian when `ru` and the bundle answers. null when no
 * source does -- the caller says so, nothing is added.
 */
export async function readCourse(
  fetcher: Fetch,
  ru: boolean
): Promise<Course | null> {
  let course: Course | null = null
  for (const url of SPEC.COURSE_SOURCES) {
    try {
      const res = await fetcher(url)
      if (!res.ok) continue
      course = parseCourse(await res.text())
      if (course) break
    } catch {
      // the next source
    }
  }
  if (!course || !ru) return course
  try {
    const res = await fetcher(SPEC.COURSE_RU_SOURCE)
    if (res.ok) return withRussian(course, JSON.parse(await res.text()))
  } catch {
    // English, as the contract says
  }
  return course
}

/** A lesson's card: its title, its goal, and its address for the reel's call. */
export function lessonCard(l: CourseLesson): { title: string; note: string } {
  return {
    title: l.title,
    note: [l.goal, lessonLink(l.id)].filter(Boolean).join('\n'),
  }
}
