/**
 * A TURN IS KILLED FOR SILENCE, NEVER FOR TAKING A WHILE.
 *
 * Production, 20.09.2026. The bot had one deadline: 180 s of total elapsed
 * time. An `image_edit` spent 170 s of honest work and the bot cut the turn
 * 10 seconds after the picture had landed in the bucket, then asked again --
 * so the client was charged twice for the same picture and received neither.
 *
 * The render now ticks while a tool runs, so the question the bot asks is
 * "is it still alive?" and not "how long has it been?".
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  SILENCE_MS,
  TURN_CEILING_MS,
  спроситьАгента, // cyrillic-ok: pre-existing identifier
} from '@/services/trinityAgent'

vi.mock('@/utils/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))

/**
 * A chat response whose body is fed line by line from the test.
 *
 * `fail` stands in for what a real fetch does to its body when the caller's
 * signal fires: the stream errors and the reader's pending read rejects.
 */
function chatStream() {
  let push: (line: unknown) => void = () => {}
  let close: () => void = () => {}
  let fail: (e: unknown) => void = () => {}
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      const enc = new TextEncoder()
      push = line => controller.enqueue(enc.encode(JSON.stringify(line) + '\n'))
      close = () => controller.close()
      fail = e => controller.error(e)
    },
  })
  return {
    response: new Response(body, { status: 200 }),
    tick: () => push({ тип: 'ждём', имя: 'image_edit', мс: 1 }), // cyrillic-ok: event envelope
    say: (text: string) => push({ тип: 'текст', текст: text }), // cyrillic-ok: event envelope
    close,
    fail,
  }
}

beforeEach(() => {
  vi.stubEnv('RENDER_API_KEY', 'k')
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

/**
 * History is fetched first; it is not what these tests are about.
 *
 * The chat call is handed the caller's signal, exactly as the real client
 * does, and the stub kills the body when it fires -- which is what undici
 * does and what the silence deadline is counting on.
 */
function stubFetch(chat: Response, onAbort?: (e: unknown) => void) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).includes('/api/agent/history'))
        return new Response(JSON.stringify({ messages: [] }), { status: 200 })
      init?.signal?.addEventListener('abort', () => {
        onAbort?.(new Error('This operation was aborted'))
      })
      return chat
    })
  )
}

describe('a slow but living turn', () => {
  it('outlives the old flat deadline, because it keeps saying it is alive', async () => {
    const stream = chatStream()
    stubFetch(stream.response)
    const answer = спроситьАгента('555', 'сделай картинку') // cyrillic-ok: pre-existing identifier

    // Four intervals of near-silence: 4 * 89 s is far past the 180 s that
    // used to end this turn, and each tick pushes the deadline back.
    for (let i = 0; i < 4; i++) {
      await vi.advanceTimersByTimeAsync(SILENCE_MS - 1_000)
      stream.tick()
      await vi.advanceTimersByTimeAsync(0)
    }
    stream.say('Готово, держи')
    stream.close()
    await vi.advanceTimersByTimeAsync(0)

    await expect(answer).resolves.toMatchObject({ текст: 'Готово, держи' }) // cyrillic-ok: agent reply field
  })
})

describe('a turn that has genuinely died', () => {
  it('is let go after the silence, not after the whole ceiling', async () => {
    const stream = chatStream()
    stubFetch(stream.response, e => stream.fail(e))
    const answer = спроситьАгента('555', 'сделай картинку') // cyrillic-ok: pre-existing identifier
    const caught = answer.catch((e: unknown) => e)

    await vi.advanceTimersByTimeAsync(SILENCE_MS + 1_000)
    expect(await caught).toBeInstanceOf(Error)
  })

  it('the ceiling is a backstop, not the live deadline', () => {
    expect(TURN_CEILING_MS).toBeGreaterThan(SILENCE_MS)
  })
})
