/**
 * THE LADDER TO THE t27 COURSES, AND EVERY READER ON IT IN THE OWNER'S CRM.
 *
 * Spec of record: specs/automation/course-access.t27 (gHashTag/t27), copied
 * beside its gen-ts in src/spec/course-access.*; every rule below is the
 * spec's own fn, compiled (src/spec/course-access.logic.ts), never a copy.
 *
 * Owner, 2026-10-11: any one course free, the second for opening the bot, the
 * third free, the fourth for the club -- and "track every user in the CRM and
 * tell me each client's progress online".
 *
 * Owner, 2026-10-19 (spec VERSION 3, t27#10799): "make the courses free for
 * everyone". step_of is STEP_FREE for every rung, so no course asks for the
 * bot or the club. The bot and paid keys stay: an old link still mints one,
 * and a key already minted keeps opening what it opened. A paid key is now a
 * club member signing in on the site, not the price of a course.
 *
 * What lives here:
 *   - the KEY the bot hands a reader after `/start course_<step>_<route>`:
 *     signed with a secret derived from SESSION_SIGNING_KEY (no new variable
 *     to set, and no key at all when that is missing), carrying the step, an
 *     opaque learner id and an expiry -- never a Telegram id;
 *   - the LEARNER row (learner id <-> Telegram id), his finished lessons, and
 *     what the owner has already been told about him;
 *   - the CRM: the person in crm_people, the step as a tag in crm_tags, the
 *     step and every module and course as a note in his timeline;
 *   - the owner's live message through the house bot (sendToTelegram).
 *
 * Routes (render-server.ts):
 *   POST /api/course/key       the bot, server key only: mint for a person
 *   GET  /api/course/key?k=    t27.ai: is this key good, and for which step
 *   POST /api/course/progress  t27.ai: a lesson finished, with the key
 */
import crypto from 'node:crypto'
import * as SPEC from '../spec/course-access.gen'
import {
  crmTag,
  keyDays,
  lessonEvent,
  mayReport,
  mintOk,
  tellsOwner,
} from '../spec/course-access.logic'
import { PLATFORM_OWNER_FALLBACK } from '../platform-owner'

export interface Queryable {
  query: (
    sql: string,
    params?: unknown[]
  ) => Promise<{ rows: any[]; rowCount?: number | null }>
}

export interface CourseDeps {
  getPool: () => Promise<Queryable>
  /** True only for the farm's own server key (auth.ts hasServerKey). */
  isServer: (req: unknown) => boolean
  readBody: (req: unknown) => Promise<string>
  /** The club, as handleClub decides it: active, and days left. */
  club: (telegramId: string) => Promise<{ active: boolean; daysLeft: number }>
  /** The owner's live message; injectable so tests send nothing. */
  tellOwner?: (text: string) => Promise<unknown>
  now?: () => Date
}

export const COURSE_PATHS = ['/api/course/key', '/api/course/progress'] as const

// t27-plumbing: a route matcher for render-server.ts, not a rule of the ladder
export function isCoursePath(path: string): boolean {
  return (COURSE_PATHS as readonly string[]).includes(path)
}

const STEP_WORDS: Record<string, number> = {
  bot: SPEC.STEP_BOT,
  paid: SPEC.STEP_PAID,
}
const SLUG = /^[a-z0-9][a-z0-9-]{0,47}$/
const DAY_MS = 24 * 60 * 60 * 1000 // t27-plumbing: milliseconds in a day, a unit, not a rule

function owner(): string {
  return String(process.env.OWNER_TELEGRAM_ID || PLATFORM_OWNER_FALLBACK)
}

/** The signing secret, derived; null when the service has none to derive from. */
export function courseKeySecret(
  env: NodeJS.ProcessEnv = process.env
): Buffer | null {
  const raw = env.SESSION_SIGNING_KEY
  // t27-plumbing: the same floor session.ts holds for its own signing key
  if (!raw || raw.length < 32) return null
  return crypto
    .createHmac('sha256', Buffer.from(raw, 'utf8'))
    .update('course-access/v1')
    .digest()
}

const secret = () => courseKeySecret()

const b64 = (b: Buffer | string) => Buffer.from(b).toString('base64url')

function sign(payload: string, key: Buffer): string {
  return crypto
    .createHmac('sha256', key)
    .update(payload)
    .digest()
    .subarray(0, 24)
    .toString('base64url')
}

/** A signed key: `<b64(step.learner.expDay)>.<mac>`. */
export function mintKey(
  step: number,
  learnerId: string,
  days: number,
  now: Date,
  key: Buffer
): string {
  const expDay = Math.floor(now.getTime() / DAY_MS) + days
  const payload = `${step}.${learnerId}.${expDay}`
  return `${b64(payload)}.${sign(payload, key)}`
}

export interface KeyReading {
  ok: boolean
  step?: number
  learnerId?: string
  until?: string
  reason?: string
}

/** What a key says, checked: signature first, then the day it runs out. */
export function readKey(k: string, now: Date, key: Buffer | null): KeyReading {
  if (!key) return { ok: false, reason: 'keys_off' }
  const [p, mac] = String(k || '').split('.')
  if (!p || !mac) return { ok: false, reason: 'malformed' }
  let payload: string
  try {
    payload = Buffer.from(p, 'base64url').toString('utf8')
  } catch {
    return { ok: false, reason: 'malformed' }
  }
  const want = Buffer.from(sign(payload, key))
  const got = Buffer.from(mac)
  if (want.length !== got.length || !crypto.timingSafeEqual(want, got))
    return { ok: false, reason: 'bad_signature' }
  const [s, learnerId, d] = payload.split('.')
  const step = Number(s)
  const expDay = Number(d)
  if (!Number.isInteger(step) || !learnerId || !Number.isInteger(expDay))
    return { ok: false, reason: 'malformed' }
  if (expDay * DAY_MS <= now.getTime()) return { ok: false, reason: 'expired' }
  return {
    ok: true,
    step,
    learnerId,
    until: new Date(expDay * DAY_MS).toISOString().slice(0, 10),
  }
}

let ensured: Promise<void> | null = null
export function forgetCourseTablesForTests(): void {
  ensured = null
}
export async function ensureCourseTables(pool: Queryable): Promise<void> {
  ensured ??= (async () => {
    await pool.query(`CREATE TABLE IF NOT EXISTS course_learner (
      learner_id text PRIMARY KEY,
      telegram_id text UNIQUE NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now())`)
    // A reader who paid on t27.ai has no Telegram (course-checkout.ts): his
    // row carries the e-mail he paid with instead. Idempotent, like the
    // CREATEs: a second boot changes nothing.
    await pool.query(
      `ALTER TABLE course_learner ALTER COLUMN telegram_id DROP NOT NULL`
    )
    await pool.query(
      `ALTER TABLE course_learner ADD COLUMN IF NOT EXISTS email text`
    )
    await pool.query(`CREATE TABLE IF NOT EXISTS course_progress (
      learner_id text NOT NULL,
      course text NOT NULL,
      lesson text NOT NULL,
      done_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (learner_id, course, lesson))`)
    await pool.query(`CREATE TABLE IF NOT EXISTS course_told (
      learner_id text NOT NULL,
      course text NOT NULL,
      event int NOT NULL,
      mark int NOT NULL,
      at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (learner_id, course, event, mark))`)
  })().catch(e => {
    ensured = null
    throw e
  })
  return ensured
}

async function learnerFor(
  pool: Queryable,
  telegramId: string
): Promise<string> {
  const fresh = crypto
    .randomBytes(16)
    .toString('base64url')
    .slice(0, SPEC.LEARNER_ID_CHARS)
  const r = await pool.query(
    `INSERT INTO course_learner (learner_id, telegram_id) VALUES ($1, $2)
     ON CONFLICT (telegram_id) DO UPDATE SET telegram_id = EXCLUDED.telegram_id
     RETURNING learner_id`,
    [fresh, telegramId]
  )
  return String(r.rows[0].learner_id)
}

/**
 * Claim "told" for one event, once. True only for the first claim: the
 * spec's tells_owner gets told_before from this, so a double tap or a replayed
 * lesson report never reaches the owner twice.
 */
async function claimTold(
  pool: Queryable,
  learnerId: string,
  course: string,
  event: number,
  mark: number
): Promise<boolean> {
  const r = await pool.query(
    `INSERT INTO course_told (learner_id, course, event, mark)
     VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
    [learnerId, course, event, mark]
  )
  return (r.rowCount ?? 0) > 0
}

export interface Person {
  telegramId: string
  firstName?: string
  lastName?: string
  username?: string
}

const nameOf = (p: Person) =>
  [p.firstName, p.lastName].filter(Boolean).join(' ').trim() ||
  (p.username ? `@${p.username}` : `id ${p.telegramId}`)

/** The person in the owner's CRM, his tag, and a note in his timeline. */
async function fileInCrm(
  pool: Queryable,
  p: Person,
  tag: string,
  note: string
): Promise<void> {
  const { rememberPerson } = await import('./chat-memory')
  const { recordTouch } = await import('./crm-touches')
  const own = owner()
  await rememberPerson(pool as any, own, p.telegramId, {
    firstName: p.firstName ?? '',
    lastName: p.lastName ?? '',
    username: p.username ?? '',
  })
  if (tag) {
    await pool.query(`CREATE TABLE IF NOT EXISTS crm_tags (
      owner_id text NOT NULL, lead_id text NOT NULL, tag text NOT NULL,
      source text, evidence jsonb, tagged_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (owner_id, lead_id, tag))`)
    await pool.query(
      `INSERT INTO crm_tags (owner_id, lead_id, tag, source, evidence)
       VALUES ($1, $2, $3, $4, $5::jsonb)
       ON CONFLICT (owner_id, lead_id, tag) DO UPDATE SET tagged_at = now()`,
      [own, p.telegramId, tag, SPEC.CRM_SOURCE, JSON.stringify({ note })]
    )
  }
  await recordTouch(pool as any, {
    owner: own,
    lead: p.telegramId,
    botName: SPEC.BOT,
    kind: 'note',
    note,
  })
}

async function tell(deps: CourseDeps, text: string): Promise<void> {
  try {
    if (deps.tellOwner) {
      await deps.tellOwner(text)
      return
    }
    const { sendToTelegram } = await import('../auth/telegram-sender')
    await sendToTelegram(owner(), text)
  } catch {
    // A failing Telegram never fails the reader's step: the CRM row is the record.
  }
}

/** `a***@domain`: enough for the owner to tell two buyers apart, no more. */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf('@')
  if (at < 1) return '***'
  return `${email[0]}***${email.slice(at)}`
}

export type MintOutcome =
  | { ok: true; key: string; until: string; step: number }
  | { ok: false; reason: 'keys_off' | 'no_club' | 'bad_request' }

/** The bot's ask: a key for this person and this step (route is the course). */
export async function mintFor(
  pool: Queryable,
  p: Person,
  stepWord: string,
  route: string,
  deps: CourseDeps
): Promise<MintOutcome> {
  const step = STEP_WORDS[stepWord]
  if (
    step === undefined ||
    !SLUG.test(route) ||
    !/^\d{1,20}$/.test(p.telegramId)
  )
    return { ok: false, reason: 'bad_request' }
  const key = secret()
  const club =
    step === SPEC.STEP_PAID
      ? await deps.club(p.telegramId)
      : { active: false, daysLeft: 0 }
  if (!mintOk(step, club.active, key !== null))
    return { ok: false, reason: key ? 'no_club' : 'keys_off' }
  await ensureCourseTables(pool)
  const learnerId = await learnerFor(pool, p.telegramId)
  const now = (deps.now ?? (() => new Date()))()
  const days = keyDays(step, Math.max(1, Math.min(65535, club.daysLeft)))
  const signed = mintKey(step, learnerId, days, now, key!)
  const event =
    step === SPEC.STEP_PAID ? SPEC.EVENT_KEY_PAID : SPEC.EVENT_KEY_BOT
  const words =
    step === SPEC.STEP_PAID
      ? `вошёл на сайт с ключом клуба, курс «${route}»` // cyrillic-ok: owner-facing
      : `подписался на бота ради курса «${route}»` // cyrillic-ok: owner-facing
  try {
    await fileInCrm(pool, p, crmTag(step), `Курсы t27: ${words}`) // cyrillic-ok: CRM note
  } catch {
    // The key is the reader's; a CRM hiccup must not take it from him.
  }
  const first = await claimTold(pool, learnerId, '', event, 0)
  if (tellsOwner(event, !first))
    await tell(deps, `🎓 Курсы t27: ${nameOf(p)} ${words}.`) // cyrillic-ok: owner-facing
  return {
    ok: true,
    key: signed,
    step,
    until: new Date(now.getTime() + days * DAY_MS).toISOString().slice(0, 10),
  }
}

export type ProgressOutcome =
  | { ok: true; event: number; done: number }
  | { ok: false; reason: string }

/** The site's report of a finished lesson, with the reader's key. */
export async function reportLesson(
  pool: Queryable,
  k: string,
  course: string,
  lesson: string,
  deps: CourseDeps
): Promise<ProgressOutcome> {
  const now = (deps.now ?? (() => new Date()))()
  const reading = readKey(k, now, secret())
  if (!mayReport(reading.ok))
    return { ok: false, reason: reading.reason ?? 'no_key' }
  if (!SLUG.test(course) || !SLUG.test(lesson))
    return { ok: false, reason: 'bad_request' }
  await ensureCourseTables(pool)
  const learnerId = reading.learnerId!
  await pool.query(
    `INSERT INTO course_progress (learner_id, course, lesson) VALUES ($1, $2, $3)
     ON CONFLICT DO NOTHING`,
    [learnerId, course, lesson]
  )
  const c = await pool.query(
    `SELECT count(*)::int AS n FROM course_progress WHERE learner_id = $1 AND course = $2`,
    [learnerId, course]
  )
  // t27-plumbing: the spec's u8; more rows than a course has is a forged report
  const done = Math.min(255, Number(c.rows[0]?.n ?? 0))
  const event = lessonEvent(done)
  if (event === SPEC.EVENT_LESSON) return { ok: true, event, done }
  const first = await claimTold(pool, learnerId, course, event, done)
  if (!tellsOwner(event, !first)) return { ok: true, event, done }
  const who = await pool.query(
    `SELECT l.telegram_id, l.email, p.first_name, p.last_name, p.username
       FROM course_learner l
       LEFT JOIN crm_people p ON p.owner_id = $2 AND p.lead_id = l.telegram_id
      WHERE l.learner_id = $1`,
    [learnerId, owner()]
  )
  const row = who.rows[0]
  if (!row) return { ok: true, event, done }
  const progressWords =
    event === SPEC.EVENT_COURSE
      ? `finished the course "${course}": ${done} of ${SPEC.LESSONS_PER_COURSE} lessons`
      : `finished module ${done / SPEC.LESSONS_PER_MODULE} of "${course}" (${done} of ${SPEC.LESSONS_PER_COURSE} lessons)`
  if (!row.telegram_id) {
    // A web buyer (course-checkout.ts): no Telegram id, so no CRM row (the
    // CRM is keyed by Telegram id); the owner still hears, the e-mail masked.
    await tell(
      deps,
      `Courses t27: web reader ${maskEmail(String(row.email ?? ''))} ${progressWords}.`
    )
    return { ok: true, event, done }
  }
  const person: Person = {
    telegramId: String(row.telegram_id),
    firstName: row.first_name ?? undefined,
    lastName: row.last_name ?? undefined,
    username: row.username ?? undefined,
  }
  const words =
    event === SPEC.EVENT_COURSE
      ? `прошёл курс «${course}» целиком: ${done} из ${SPEC.LESSONS_PER_COURSE} уроков` // cyrillic-ok: owner-facing
      : `закончил модуль ${done / SPEC.LESSONS_PER_MODULE} курса «${course}» (${done} из ${SPEC.LESSONS_PER_COURSE} уроков)` // cyrillic-ok: owner-facing
  try {
    await fileInCrm(pool, person, '', `Курсы t27: ${words}`) // cyrillic-ok: CRM note
  } catch {
    // The progress row is written; the note is a second record of it.
  }
  await tell(deps, `🎓 Курсы t27: ${nameOf(person)} ${words}.`) // cyrillic-ok: owner-facing
  return { ok: true, event, done }
}

/** The three routes, one handler; render-server.ts answers with what it returns. */
export async function handleCourse(
  req: { url?: string; method?: string },
  deps: CourseDeps
): Promise<{ status: number; body: Record<string, unknown> }> {
  const url = new URL(req.url || '/', 'http://local')
  const path = url.pathname
  const now = (deps.now ?? (() => new Date()))()
  if (path === '/api/course/key' && req.method === 'GET') {
    const r = readKey(url.searchParams.get('k') || '', now, secret())
    return {
      status: 200,
      body: r.ok
        ? { ok: true, step: r.step, until: r.until }
        : { ok: false, reason: r.reason },
    }
  }
  let body: Record<string, unknown> = {}
  try {
    body = JSON.parse((await deps.readBody(req)) || '{}')
  } catch {
    return { status: 400, body: { ok: false, reason: 'bad_json' } }
  }
  const pool = await deps.getPool()
  if (path === '/api/course/key' && req.method === 'POST') {
    // Only the bot mints: a key is the proof that the person opened it.
    if (!deps.isServer(req))
      return { status: 403, body: { ok: false, reason: 'server_key_required' } }
    const out = await mintFor(
      pool,
      {
        telegramId: String(body.telegram_id ?? ''),
        firstName: body.first_name ? String(body.first_name) : undefined,
        lastName: body.last_name ? String(body.last_name) : undefined,
        username: body.username ? String(body.username) : undefined,
      },
      String(body.step ?? ''),
      String(body.route ?? ''),
      deps
    )
    return {
      status: out.ok ? 200 : out.reason === 'keys_off' ? 503 : 200,
      body: out,
    }
  }
  if (path === '/api/course/progress' && req.method === 'POST') {
    const out = await reportLesson(
      pool,
      String(body.key ?? ''),
      String(body.course ?? ''),
      String(body.lesson ?? ''),
      deps
    )
    return { status: 200, body: out }
  }
  return { status: 405, body: { ok: false, reason: 'method' } }
}
