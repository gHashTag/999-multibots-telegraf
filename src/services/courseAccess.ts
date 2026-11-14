import { logger } from '@/utils/logger'
import { sharedKvClient, type KvClient } from '@/core/session/sessionStore'

/**
 * THE BOT'S HALF OF THE COURSE LADDER.
 *
 * Spec of record: specs/automation/course-access.t27 (gHashTag/t27); the
 * render holds the rules (apps/vibee-editor/render/src/agent/course-access.ts)
 * and this side only carries the press. A reader on t27.ai who reaches the
 * second course (the bot step) or the fourth (the club) taps
 * `t.me/t27ai_bot?start=course_<bot|paid>_<route>`; the bot asks the render
 * for his key with the server key and answers with one button back to the
 * course, the key in the address. The render files him in the owner's CRM and
 * tells the owner; nothing of that is decided here.
 */

/*
 * The render the bot calls. RENDER_BASE_URL points it at any T27OS node (on
 * the Fornex VPS the bot unit sets the ladder's in-network name,
 * http://t27ai-ladder:8080); unset, it is the VPS host, whose Caddy routes
 * /api/course/* to the ladder unit.
 */
const RENDER =
  process.env.RENDER_BASE_URL || 'https://t27ai-130-17-9-230.sslip.io'
const TIMEOUT_MS = 12_000 // t27-plumbing: an HTTP timeout, not a rule of the ladder
const SITE = 'https://t27.ai'

/** The t27.ai catalog (`#/courses`): where a reader lands when no course is known. */
export const COURSES_ROUTE = 'courses'

/** Which bot button produced the arrival, as t27.ai's trafficArrival.ts reads it. */
export type CourseCampaign = 'course' | 'club' | 'signin'

/**
 * The address the button opens. The utm goes BEFORE the `#`: t27.ai is a hash
 * router, and trafficArrival.ts reads the query of the page, not of the hash.
 * The key rides in the hash route, where the course reads it.
 */
export function courseUrl(
  route: string,
  key: string,
  campaign: CourseCampaign
): string {
  return (
    `${SITE}/?utm_source=telegram&utm_medium=bot&utm_campaign=${campaign}` +
    `#/${route}?unlock=${encodeURIComponent(key)}`
  )
}

/** `course_<step word>_<route>`; the route is a course address on t27.ai. */
export const COURSE_PAYLOAD = /^course_(bot|paid)_([a-z0-9][a-z0-9-]{0,47})$/

export interface CourseIntent {
  step: 'bot' | 'paid'
  route: string
}

/** The course step a /start payload asks for, or null when it asks for none. */
export function courseIntent(payload: string | undefined): CourseIntent | null {
  const m = payload ? COURSE_PAYLOAD.exec(payload) : null
  return m ? { step: m[1] as 'bot' | 'paid', route: m[2] } : null
}

export type CourseKeyOutcome =
  | { kind: 'key'; url: string; until: string }
  | { kind: 'no_club' }
  | { kind: 'unavailable' }

export interface CoursePerson {
  id: number | string
  first_name?: string
  last_name?: string
  username?: string
}

/** Ask the render for the reader's key. Never throws: a failure is 'unavailable'. */
export async function requestCourseKey(
  who: CoursePerson,
  intent: CourseIntent,
  opts: {
    key?: string
    fetchImpl?: typeof fetch
    campaign?: CourseCampaign
  } = {}
): Promise<CourseKeyOutcome> {
  const key = opts.key ?? process.env.RENDER_API_KEY ?? ''
  if (!key) return { kind: 'unavailable' }
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS)
  try {
    const res = await (opts.fetchImpl ?? fetch)(`${RENDER}/api/course/key`, {
      method: 'POST',
      headers: { 'X-Api-Key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        telegram_id: String(who.id),
        first_name: who.first_name,
        last_name: who.last_name,
        username: who.username,
        step: intent.step,
        route: intent.route,
      }),
      signal: ac.signal,
    })
    const body = (await res.json().catch(() => ({}))) as Record<string, any>
    if (body?.ok && typeof body.key === 'string') {
      return {
        kind: 'key',
        url: courseUrl(intent.route, body.key, opts.campaign ?? 'course'),
        until: String(body.until ?? ''),
      }
    }
    if (body?.reason === 'no_club') return { kind: 'no_club' }
    logger.warn('Course key refused', {
      status: res.status,
      reason: body?.reason,
    })
    return { kind: 'unavailable' }
  } catch (e) {
    logger.warn('Course key unavailable', { error: String(e) })
    return { kind: 'unavailable' }
  } finally {
    clearTimeout(timer)
  }
}

/** What the reader is told; the button carries the key, the text never does. */
export function courseKeyReply(
  isRu: boolean,
  intent: CourseIntent,
  outcome: CourseKeyOutcome
): { text: string; button?: { label: string; url: string } } {
  const catalog = intent.route === COURSES_ROUTE
  if (outcome.kind === 'key' && catalog) {
    // The catalog is not "a course": the sign-in press and the after-club hand-back.
    return {
      text: isRu
        ? `Клуб активен — курсы на t27.ai открыты ✅\n\nНажмите кнопку — вы войдёте на сайт. Ключ действует, пока действует клуб (до ${outcome.until}).`
        : `Your club is active — the courses on t27.ai are open ✅\n\nPress the button to sign in on the site. The key works as long as the club does (until ${outcome.until}).`,
      button: {
        label: isRu ? 'Открыть курсы на t27.ai' : 'Open the courses on t27.ai',
        url: outcome.url,
      },
    }
  }
  if (outcome.kind === 'key') {
    return {
      text:
        intent.step === 'paid'
          ? isRu
            ? `Клуб активен — курс «${intent.route}» открыт ✅\n\nКлюч действует, пока действует клуб (до ${outcome.until}).`
            : `Your club is active — the course "${intent.route}" is open ✅\n\nThe key works as long as the club does (until ${outcome.until}).`
          : isRu
            ? `Спасибо, что подписались! Курс «${intent.route}» открыт ✅\n\nНажмите кнопку — курс откроется на t27.ai. Дальше ваши пройденные уроки видит автор курса, чтобы помогать.`
            : `Thanks for subscribing! The course "${intent.route}" is open ✅\n\nPress the button to open it on t27.ai. From now on the course author sees which lessons you finish, to help you along.`,
      button: {
        label: isRu ? 'Открыть курс' : 'Open the course',
        url: outcome.url,
      },
    }
  }
  if (outcome.kind === 'no_club') {
    return {
      text: catalog
        ? isRu
          ? `Вход на t27.ai — для участников клуба. Ниже — как вступить; сразу после оплаты бот сам пришлёт кнопку для входа на сайт.`
          : `Signing in on t27.ai is for club members. Here is how to join; right after you pay, the bot sends you a button to sign in on the site.`
        : isRu
          ? `Четвёртый и следующие курсы открываются с клубом. Ниже — как вступить; сразу после оплаты бот сам пришлёт кнопку, которая вернёт вас к курсу.`
          : `The fourth course and every one after it open with the club. Here is how to join; right after you pay, the bot sends you a button back to the course.`,
    }
  }
  return {
    text: isRu
      ? 'Не получилось выдать ключ к курсу ⚠️ Похоже, сбой на нашей стороне — нажмите кнопку на t27.ai ещё раз через пару минут.'
      : 'Could not issue your course key ⚠️ Looks like a hiccup on our side — press the button on t27.ai again in a couple of minutes.',
  }
}

/*
 * THE COURSE A READER WANTED, KEPT ACROSS THE CLUB PAYMENT.
 *
 * Owner, 2026-10-13: a reader pressed "Join the club" on t27.ai, paid in the
 * bot, and then had no way back to the site. The press arrives at the main
 * bot; the charge arrives at the render's cashier bot. Sessions are keyed by
 * bot id (core/session/sessionStore.ts), so the session the press wrote is not
 * the one the charge reads. The one record both see is the shared Redis, per
 * telegram id, with a TTL: a reader who does not pay within a week is not
 * handed back to a course he has long forgotten. Without Redis (dev, tests,
 * an outage) it is a process-local map with the same TTL -- a restart loses
 * it, and the hand-back then opens the catalog instead, never nothing.
 */
export const WANTED_TTL_SECONDS = 7 * 24 * 3600 // t27-plumbing: storage expiry of a hand-off record, like the session TTL; not a rule of the ladder
const WANTED_PREFIX = 'course:wanted:'

export interface WantedCourseStore {
  get(telegramId: string): Promise<string | null>
  set(telegramId: string, route: string): Promise<void>
  delete(telegramId: string): Promise<void>
}

/** The store, over any get/set/del client; a failing client falls back to memory. */
export function createWantedCourseStore(
  client: KvClient | undefined,
  opts: { now?: () => number; ttlSeconds?: number } = {}
): WantedCourseStore {
  const now = opts.now ?? (() => Date.now())
  const ttl = opts.ttlSeconds ?? WANTED_TTL_SECONDS
  const memory = new Map<string, { route: string; until: number }>()
  const fromMemory = (id: string): string | null => {
    const hit = memory.get(id)
    if (!hit) return null
    if (hit.until <= now()) {
      memory.delete(id)
      return null
    }
    return hit.route
  }
  return {
    async get(id) {
      const local = fromMemory(id)
      if (local) return local
      if (!client) return null
      try {
        const raw = await client.get(WANTED_PREFIX + id)
        return typeof raw === 'string' && COURSE_ROUTE.test(raw) ? raw : null
      } catch (e) {
        logger.warn('Wanted course: read failed', { error: String(e) })
        return null
      }
    },
    async set(id, route) {
      if (!COURSE_ROUTE.test(route)) return
      if (client) {
        try {
          await client.set(WANTED_PREFIX + id, route, {
            expiration: { type: 'EX', value: ttl },
          })
          memory.delete(id)
          return
        } catch (e) {
          logger.warn('Wanted course: write failed, kept in memory', {
            error: String(e),
          })
        }
      }
      memory.set(id, { route, until: now() + ttl * 1000 })
    },
    async delete(id) {
      memory.delete(id)
      if (!client) return
      try {
        await client.del(WANTED_PREFIX + id)
      } catch (e) {
        logger.warn('Wanted course: delete failed', { error: String(e) })
      }
    },
  }
}

const COURSE_ROUTE = /^[a-z0-9][a-z0-9-]{0,47}$/

let defaultWanted: WantedCourseStore | undefined
/** The process's store, on the session Redis when there is one. */
export function wantedCourses(): WantedCourseStore {
  defaultWanted ??= createWantedCourseStore(sharedKvClient())
  return defaultWanted
}

/**
 * AFTER THE FIRST CLUB PAYMENT, THE WAY BACK TO THE SITE.
 *
 * Mints the paid key through the same render call as the t27.ai press, for
 * the course the reader wanted or the catalog when none is remembered, and
 * returns the message to send. Null when there is nothing honest to send: the
 * render did not give a key (it is then still the club card's job, and the
 * remembered course stays for the next press). Never throws.
 */
export async function courseHandBack(
  who: CoursePerson,
  isRu: boolean,
  opts: {
    store?: WantedCourseStore
    key?: string
    fetchImpl?: typeof fetch
  } = {}
): Promise<{
  route: string
  text: string
  button: { label: string; url: string }
} | null> {
  const store = opts.store ?? wantedCourses()
  const id = String(who.id)
  const wanted = await store.get(id).catch(() => null)
  const route = wanted ?? COURSES_ROUTE
  const outcome = await requestCourseKey(
    who,
    { step: 'paid', route },
    { key: opts.key, fetchImpl: opts.fetchImpl, campaign: 'club' }
  )
  if (outcome.kind !== 'key') return null
  if (wanted) await store.delete(id)
  const text =
    route === COURSES_ROUTE
      ? isRu
        ? `Курсы на t27.ai открыты ✅ Нажмите кнопку — вы войдёте на сайт.\n\nКлюч действует, пока действует клуб (до ${outcome.until}).`
        : `The courses on t27.ai are open ✅ Press the button to sign in on the site.\n\nThe key works as long as the club does (until ${outcome.until}).`
      : isRu
        ? `Курс «${route}» открыт ✅ Нажмите кнопку — вы вернётесь к нему на t27.ai.\n\nКлюч действует, пока действует клуб (до ${outcome.until}).`
        : `The course "${route}" is open ✅ Press the button to go back to it on t27.ai.\n\nThe key works as long as the club does (until ${outcome.until}).`
  return {
    route,
    text,
    button: {
      label: isRu ? 'Открыть курсы на t27.ai' : 'Open the courses on t27.ai',
      url: outcome.url,
    },
  }
}
