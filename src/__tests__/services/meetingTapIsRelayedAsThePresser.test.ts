import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { answerMeeting, NOT_REACHED } from '@/services/meetingAnswer'
import { SAID } from '@/services/browserApproval'
import { RenderDidNotAnswer } from '@/services/renderTimeout'

/*
 * A TAP ON A MEETING CARD (spec: t27 specs/automation/meeting-reminders.t27).
 *
 * The render sends the card with `mtg:<action>:<token>` buttons; the bot
 * relays the press to meeting_answer as the PRESSER and nothing else. The
 * owner check lives in the render, so the one thing the bot must never do is
 * relay the press under any other telegram_id.
 */
/* A shape, not a secret: built from a repeated letter. */
const TOKEN = 'a'.repeat(22) // secret-guard-ok: a repeated letter, not a value
const PRESSER = '900000001'

const sleep = async () => undefined

describe('the meeting tap reaches the render, and the person hears back', () => {
  it('relays the action and token as the presser, and takes the render words', async () => {
    const callToolImpl = vi.fn(async () => ({
      said: 'ok said',
      markup: { inline_keyboard: [[{ text: 'x', callback_data: 'y' }]] },
    }))
    const r = await answerMeeting(PRESSER, 'ok', TOKEN, { callToolImpl })
    expect(callToolImpl).toHaveBeenCalledWith(
      PRESSER,
      'meeting_answer',
      { action: 'ok', token: TOKEN },
      expect.objectContaining({ timeoutMs: expect.any(Number) })
    )
    expect(r.said).toBe('ok said')
    expect(r.reached).toBe(true)
    expect(r.markup?.inline_keyboard).toHaveLength(1)
  })

  it('a render that is down leaves words, not a dead button', async () => {
    const callToolImpl = vi.fn(async () => {
      throw new Error('connection terminated')
    })
    expect(
      await answerMeeting(PRESSER, 'cancel', TOKEN, { callToolImpl, sleep })
    ).toEqual({
      said: NOT_REACHED,
      reached: false,
    })
    // An empty body is a 502 page: the render is mid-deploy.
    const empty = vi.fn(async () => ({}))
    expect(
      await answerMeeting(PRESSER, 'done', TOKEN, {
        callToolImpl: empty,
        sleep,
      })
    ).toEqual({ said: SAID.restarting, reached: false })
  })

  it('says WHY it failed, and repeats only a fast failure, once', async () => {
    // A timeout already cost ten seconds of a stripped card: not doubled.
    const slow = vi.fn(async () => {
      throw new RenderDidNotAnswer('no answer in 10 s')
    })
    expect(
      (
        await answerMeeting(PRESSER, 'later', TOKEN, {
          callToolImpl: slow,
          sleep,
        })
      ).said
    ).toBe(SAID.timeout)
    expect(slow).toHaveBeenCalledTimes(1)
    // No connection is the minute of a deploy swap: one more try, then words.
    const offline = vi.fn(async () => {
      throw new TypeError('fetch failed')
    })
    expect(
      (
        await answerMeeting(PRESSER, 'ok', TOKEN, {
          callToolImpl: offline,
          sleep,
        })
      ).said
    ).toBe(SAID.offline)
    expect(offline).toHaveBeenCalledTimes(2)
  })

  it('a swap the second try outlives is answered as if nothing happened', async () => {
    const swap = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce({
        said: 'Отлично',
        markup: { inline_keyboard: [] },
      })
    const r = await answerMeeting(PRESSER, 'later', TOKEN, {
      callToolImpl: swap,
      sleep,
    })
    expect(r).toEqual({
      said: 'Отлично',
      reached: true,
      markup: { inline_keyboard: [] },
    })
    expect(swap).toHaveBeenCalledTimes(2)
  })

  it('a key the render refuses is named, not "try again in a minute"', async () => {
    // The real callTool against the guard's real 401 body: {error: string}.
    // Before RenderRefusedTheKey this read as "meeting_answer refused" and the
    // person was told a minute would help. Only fixing the key helps.
    const prevKey = process.env.RENDER_API_KEY
    process.env.RENDER_API_KEY = 'k' // secret-guard-ok: a one-letter stub
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: 'unauthorized', code: 'sign_in' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      })
    )
    try {
      const r = await answerMeeting(PRESSER, 'ok', TOKEN)
      expect(r).toEqual({ said: SAID.noKey, reached: false })
      expect(fetchSpy).toHaveBeenCalledTimes(1)
    } finally {
      fetchSpy.mockRestore()
      if (prevKey === undefined) delete process.env.RENDER_API_KEY
      else process.env.RENDER_API_KEY = prevKey
    }
  })

  it('nothing is relayed without a presser, a token or a known action', async () => {
    const callToolImpl = vi.fn()
    expect((await answerMeeting('', 'ok', TOKEN, { callToolImpl })).said).toBe(
      NOT_REACHED
    )
    expect(
      (await answerMeeting(PRESSER, 'ok', '  ', { callToolImpl })).said
    ).toBe(NOT_REACHED)
    expect(
      (await answerMeeting(PRESSER, 'drop', TOKEN, { callToolImpl })).said
    ).toBe(NOT_REACHED)
    expect(callToolImpl).not.toHaveBeenCalled()
  })

  it('the bot answers the exact prefix and actions the render writes', () => {
    const bot = readFileSync(
      join(__dirname, '../../navigation/registerCommands.ts'),
      'utf8'
    )
    const gen = readFileSync(
      join(
        __dirname,
        '../../../apps/vibee-editor/render/src/spec/meeting-reminders.gen.ts'
      ),
      'utf8'
    )
    const prefix = /CALLBACK_PREFIX = "([a-z:]+)"/.exec(gen)?.[1]
    expect(prefix, 'the spec no longer names its callback prefix').toBe('mtg:')
    const start = bot.indexOf(`/^${prefix}(ok|later|cancel|done|missed):`)
    expect(start, 'no handler for the meeting buttons').toBeGreaterThan(-1)
    const body = bot.slice(start, bot.indexOf('\n  bot.', start))
    // answerCbQuery first, and the presser is ctx.from -- never a field of the data.
    expect(body.indexOf('answerCbQuery')).toBeLessThan(
      body.indexOf('answerMeeting(')
    )
    expect(body).toContain('answerMeeting(String(ctx.from?.id')
  })
})
