import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  courseIntent,
  courseKeyReply,
  requestCourseKey,
} from '@/services/courseAccess'

/*
 * The bot's half of the course ladder (spec automation/course-access.t27):
 * it reads the press, asks the render for the key with the server key, and
 * answers with one button back to the course. The rules live in the render.
 */
const SPEC = join(
  __dirname,
  '..',
  '..',
  '..',
  'apps/vibee-editor/render/src/spec/course-access.gen.ts'
)
const specValue = (name: string) =>
  readFileSync(SPEC, 'utf8').match(
    new RegExp(`export const ${name} = ("[^"]*"|\\d+)`)
  )?.[1]

const fakeFetch = (status: number, body: unknown, seen: unknown[] = []) =>
  (async (url: string, init: any) => {
    seen.push({ url, init })
    return { status, json: async () => body } as any
  }) as unknown as typeof fetch

describe('course deep link', () => {
  it('reads the two steps that need proof, and nothing else', () => {
    expect(courseIntent('course_bot_verify-hardware')).toEqual({
      step: 'bot',
      route: 'verify-hardware',
    })
    expect(courseIntent('course_paid_course')).toEqual({
      step: 'paid',
      route: 'course',
    })
    // A free step needs no bot; an unknown word, a bad route: no intent.
    expect(courseIntent('course_free_course')).toBeNull()
    expect(courseIntent('course_bot_../etc')).toBeNull()
    expect(courseIntent('course_bot_')).toBeNull()
    expect(courseIntent('club')).toBeNull()
    expect(courseIntent(undefined)).toBeNull()
  })

  it('the prefix is the spec’s, and the longest link fits Telegram', () => {
    expect(specValue('START_PREFIX')).toBe('"course_"')
    const longest = 'course_paid_buses-and-peripherals'
    expect(longest.length).toBeLessThanOrEqual(
      Number(specValue('START_MAX_CHARS'))
    )
    expect(courseIntent(longest)).not.toBeNull()
  })

  it('asks the render with the server key and answers with the key in the button', async () => {
    const seen: any[] = []
    const out = await requestCourseKey(
      { id: 1000001, first_name: 'Ada' },
      { step: 'bot', route: 'verify-hardware' },
      {
        key: 'server-key',
        fetchImpl: fakeFetch(
          200,
          { ok: true, key: 'abc.def', until: '2036-10-08' },
          seen
        ),
      }
    )
    expect(seen[0].url).toBe(
      'https://vibee-render-production.up.railway.app/api/course/key'
    )
    expect(seen[0].init.headers['X-Api-Key']).toBe('server-key')
    expect(JSON.parse(seen[0].init.body)).toMatchObject({
      telegram_id: '1000001',
      step: 'bot',
      route: 'verify-hardware',
    })
    expect(out).toEqual({
      kind: 'key',
      url: 'https://t27.ai/#/verify-hardware?unlock=abc.def',
      until: '2036-10-08',
    })
    const reply = courseKeyReply(
      true,
      { step: 'bot', route: 'verify-hardware' },
      out
    )
    expect(reply.button?.url).toBe(out.kind === 'key' ? out.url : '')
    // The key rides only in the button, never in the text a reader forwards.
    expect(reply.text).not.toContain('abc.def')
  })

  it('no club: says so and hands over to the club card, no key', async () => {
    const out = await requestCourseKey(
      { id: 1000001 },
      { step: 'paid', route: 'course' },
      { key: 'k', fetchImpl: fakeFetch(200, { ok: false, reason: 'no_club' }) }
    )
    expect(out).toEqual({ kind: 'no_club' })
    expect(
      courseKeyReply(false, { step: 'paid', route: 'course' }, out).button
    ).toBeUndefined()
  })

  it('a render that is off or unreachable is "unavailable", never a fake key', async () => {
    expect(
      await requestCourseKey(
        { id: 1 },
        { step: 'bot', route: 'course' },
        {
          key: 'k',
          fetchImpl: fakeFetch(503, { ok: false, reason: 'keys_off' }),
        }
      )
    ).toEqual({ kind: 'unavailable' })
    expect(
      await requestCourseKey(
        { id: 1 },
        { step: 'bot', route: 'course' },
        {
          key: 'k',
          fetchImpl: (async () => {
            throw new Error('down')
          }) as unknown as typeof fetch,
        }
      )
    ).toEqual({ kind: 'unavailable' })
    expect(
      await requestCourseKey(
        { id: 1 },
        { step: 'bot', route: 'course' },
        { key: '' }
      )
    ).toEqual({ kind: 'unavailable' })
  })

  it('/start acts on the course step before the new-person split', () => {
    const src = readFileSync(
      join(__dirname, '..', '..', 'navigation', 'registerCommands.ts'),
      'utf8'
    )
    const press = src.indexOf('requestCourseKey(ctx.from, courseStep)')
    const split = src.indexOf('if (!userDetails.isExist) {')
    expect(press).toBeGreaterThan(0)
    expect(press).toBeLessThan(split)
  })
})
