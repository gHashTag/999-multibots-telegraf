import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/*
 * A press on /start course_bot_<route> is answered even when the data layer
 * is slow or off (gHashTag/999-multibots-telegraf#4086, context #4081).
 *
 * Before: the /start handler awaited getUserDetailsSubscription first and
 * answered the press second, so a hung database meant silence and a failing
 * one meant "An error occurred" instead of the key. These tests drive the
 * REAL handler, registered on a stand-in bot, and pin two things:
 *
 *   1. the press is asked and answered BEFORE the lookup is called;
 *   2. on a course press the lookup and the wanted-course write are bounded,
 *      and a slow or failing store ends the handler quietly -- the key has
 *      already gone out -- while every other /start path is unchanged.
 */

const supabase = vi.hoisted(() => ({
  getUserDetailsSubscription: vi.fn(),
  getReferalsCountAndUserData: vi.fn(),
  createUser: vi.fn(),
}))
const course = vi.hoisted(() => ({
  requestCourseKey: vi.fn(),
  wantedSet: vi.fn(),
}))
const club = vi.hoisted(() => ({ showClubCard: vi.fn() }))

vi.mock('@/core/supabase', () => supabase)
vi.mock('@/store', () => ({ defaultSession: { mode: null } }))
vi.mock('@/navigation/helpers/clubCard', async importOriginal => ({
  ...(await importOriginal<typeof import('@/navigation/helpers/clubCard')>()),
  showClubCard: club.showClubCard,
}))
// The real intent parser, reply text and bound; only the network and the
// store are replaced.
vi.mock('@/services/courseAccess', async importOriginal => ({
  ...(await importOriginal<typeof import('@/services/courseAccess')>()),
  requestCourseKey: course.requestCourseKey,
  wantedCourses: () => ({
    get: vi.fn(),
    set: course.wantedSet,
    delete: vi.fn(),
  }),
}))

import { registerCommands } from '@/navigation/registerCommands'
import {
  COURSE_DATA_TIMEOUT_MS,
  boundedDataCall,
} from '@/services/courseAccess'

const KEY = {
  kind: 'key' as const,
  url: 'https://t27.ai/#/course/vibecoding?k=abc.def',
  until: '2036-10-08',
}
const NEVER = () => new Promise<never>(() => undefined)

function buildBot() {
  const commands = new Map<string, any>()
  const bot: any = {
    command(name: string | string[], handler: any) {
      for (const n of Array.isArray(name) ? name : [name])
        commands.set(n, handler)
      return bot
    },
    use: () => bot,
    on: () => bot,
    action: () => bot,
    hears: () => bot,
    catch: () => bot,
    telegram: {
      setMyCommands: vi.fn(async () => undefined),
      setChatMenuButton: vi.fn(async () => undefined),
      getMe: vi.fn(async () => ({ id: 1, username: 'test_bot' })),
    },
    botInfo: { username: 'test_bot' },
  }
  return { bot, commands }
}

function buildCtx(text: string) {
  const scene = {
    current: null as any,
    enter: vi.fn(async () => undefined),
    leave: vi.fn(async () => undefined),
  }
  const ctx: any = {
    chat: { id: 1, type: 'private' },
    from: { id: 4242, username: 'reader', language_code: 'en' },
    message: { text },
    session: {} as any,
    state: {},
    scene,
    reply: vi.fn(async () => undefined),
    replyWithHTML: vi.fn(async () => undefined),
    telegram: { sendMessage: vi.fn(async () => undefined) },
    botInfo: { username: 'test_bot' },
  }
  return { ctx, scene }
}

const PRESS = '/start course_bot_vibecoding'

describe('course press: answered before the data layer is asked', () => {
  let commands: Map<string, any>

  beforeEach(() => {
    vi.clearAllMocks()
    course.requestCourseKey.mockResolvedValue(KEY)
    course.wantedSet.mockResolvedValue(undefined)
    const built = buildBot()
    commands = built.commands
    registerCommands({ bot: built.bot })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('the handler is registered', () => {
    expect(commands.has('start')).toBe(true)
  })

  it('asks the render for the key BEFORE it calls the user lookup', async () => {
    supabase.getUserDetailsSubscription.mockResolvedValue({ isExist: true })
    const { ctx } = buildCtx(PRESS)
    await commands.get('start')(ctx)
    expect(course.requestCourseKey).toHaveBeenCalledTimes(1)
    expect(supabase.getUserDetailsSubscription).toHaveBeenCalledTimes(1)
    expect(course.requestCourseKey.mock.invocationCallOrder[0]).toBeLessThan(
      supabase.getUserDetailsSubscription.mock.invocationCallOrder[0]
    )
  })

  it('answers the press with the key button while the lookup NEVER resolves', async () => {
    vi.useFakeTimers()
    supabase.getUserDetailsSubscription.mockImplementation(NEVER)
    const { ctx, scene } = buildCtx(PRESS)
    const done = commands.get('start')(ctx)
    await vi.advanceTimersByTimeAsync(COURSE_DATA_TIMEOUT_MS)
    await done
    expect(ctx.reply).toHaveBeenCalledTimes(1)
    const [, markup] = ctx.reply.mock.calls[0]
    expect(JSON.stringify(markup)).toContain(KEY.url)
    // The handler ended: no registration scene, no greeting on top.
    expect(scene.enter).not.toHaveBeenCalled()
  })

  it('is already answered when the lookup is still pending', async () => {
    vi.useFakeTimers()
    supabase.getUserDetailsSubscription.mockImplementation(NEVER)
    const { ctx } = buildCtx(PRESS)
    const done = commands.get('start')(ctx)
    await vi.advanceTimersByTimeAsync(COURSE_DATA_TIMEOUT_MS - 1)
    expect(ctx.reply).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    await done
  })

  it('a FAILING lookup does not bury the key under "An error occurred"', async () => {
    supabase.getUserDetailsSubscription.mockRejectedValue(new Error('db down'))
    const { ctx, scene } = buildCtx(PRESS)
    await expect(commands.get('start')(ctx)).resolves.not.toThrow()
    expect(ctx.reply).toHaveBeenCalledTimes(1)
    const text = String(ctx.reply.mock.calls[0][0])
    expect(text).not.toMatch(/error occurred/i)
    expect(scene.enter).not.toHaveBeenCalled()
  })

  it('a healthy lookup: ONE reply (the key), no greeting for a known reader', async () => {
    supabase.getUserDetailsSubscription.mockResolvedValue({ isExist: true })
    const { ctx, scene } = buildCtx(PRESS)
    await commands.get('start')(ctx)
    expect(course.requestCourseKey).toHaveBeenCalledTimes(1)
    expect(ctx.reply).toHaveBeenCalledTimes(1)
    expect(scene.enter).not.toHaveBeenCalled()
  })

  it('a healthy lookup, new reader: the key, then the registration scene', async () => {
    supabase.getUserDetailsSubscription.mockResolvedValue({ isExist: false })
    const { ctx, scene } = buildCtx(PRESS)
    await commands.get('start')(ctx)
    expect(ctx.reply).toHaveBeenCalledTimes(1)
    expect(scene.enter).toHaveBeenCalledWith('create_user_scene')
  })

  it('no club: a hung wanted-course write does not stop the club card', async () => {
    vi.useFakeTimers()
    course.requestCourseKey.mockResolvedValue({ kind: 'no_club' })
    course.wantedSet.mockImplementation(NEVER)
    supabase.getUserDetailsSubscription.mockResolvedValue({ isExist: true })
    const { ctx } = buildCtx(PRESS)
    const done = commands.get('start')(ctx)
    await vi.advanceTimersByTimeAsync(COURSE_DATA_TIMEOUT_MS)
    await done
    expect(club.showClubCard).toHaveBeenCalledTimes(1)
  })

  it('a free-form /start with a hung lookup is NOT bounded (scope: course press only)', async () => {
    vi.useFakeTimers()
    supabase.getUserDetailsSubscription.mockImplementation(NEVER)
    const { ctx, scene } = buildCtx('/start')
    let finished = false
    const done = commands
      .get('start')(ctx)
      .then(() => {
        finished = true
      })
    await vi.advanceTimersByTimeAsync(COURSE_DATA_TIMEOUT_MS * 5)
    expect(finished).toBe(false)
    expect(course.requestCourseKey).not.toHaveBeenCalled()
    expect(scene.enter).not.toHaveBeenCalled()
    void done
  })
})

describe('boundedDataCall', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('hands back the value of a call that answers in time', async () => {
    await expect(boundedDataCall(Promise.resolve(7))).resolves.toEqual({
      done: true,
      value: 7,
    })
  })

  it('a call that rejects is "not done", and never throws', async () => {
    await expect(
      boundedDataCall(Promise.reject(new Error('boom')))
    ).resolves.toEqual({ done: false })
  })

  it('a call slower than the bound is "not done"', async () => {
    vi.useFakeTimers()
    const out = boundedDataCall(NEVER(), 50)
    await vi.advanceTimersByTimeAsync(50)
    await expect(out).resolves.toEqual({ done: false })
  })

  it('the timer never outlives the call', async () => {
    vi.useFakeTimers()
    await boundedDataCall(Promise.resolve(1), 1000)
    expect(vi.getTimerCount()).toBe(0)
  })
})
