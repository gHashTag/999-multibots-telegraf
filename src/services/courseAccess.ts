import { logger } from '@/utils/logger'

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
 * A literal, like every other render call in this service: a URL assembled
 * from the environment reads to the scanner as SSRF, and there is one render.
 */
const RENDER = 'https://vibee-render-production.up.railway.app'
const TIMEOUT_MS = 12_000 // t27-plumbing: an HTTP timeout, not a rule of the ladder
const SITE = 'https://t27.ai'

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
  opts: { key?: string; fetchImpl?: typeof fetch } = {}
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
        url: `${SITE}/#/${intent.route}?unlock=${encodeURIComponent(body.key)}`,
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
      text: isRu
        ? `Четвёртый и следующие курсы открываются с клубом. Ниже — как вступить; после оплаты нажмите ту же кнопку на t27.ai ещё раз.`
        : `The fourth course and every one after it open with the club. Here is how to join; after paying, press the same button on t27.ai again.`,
    }
  }
  return {
    text: isRu
      ? 'Не получилось выдать ключ к курсу ⚠️ Похоже, сбой на нашей стороне — нажмите кнопку на t27.ai ещё раз через пару минут.'
      : 'Could not issue your course key ⚠️ Looks like a hiccup on our side — press the button on t27.ai again in a couple of minutes.',
  }
}
