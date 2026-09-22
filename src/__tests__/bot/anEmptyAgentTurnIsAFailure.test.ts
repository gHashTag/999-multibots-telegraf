import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * AN EMPTY TURN REACHES THE BOT AS A FAILURE, WITH ITS REASON.
 *
 * Production, 2026-09-22, turn 271956af: the render's agent called my_assets
 * and my_renders and ended the turn with no text. The stream said "done", the
 * bot logged `ответ получен ... длина 0` as a success and then "empty answer",
 * and nobody could tell from the bot's log why.
 *
 * The render now ends such a turn with an `ошибка` event whose text starts
 * with its EMPTY_ANSWER_ERROR (apps/vibee-editor/render/src/agent/chat.ts)
 * and names every provider that was empty. This is the other half of that
 * contract, driven through the REAL `спроситьАгента`: the call rejects with
 * the render's reason instead of resolving to an empty answer, so the bot's
 * fallback log says what happened.
 */

const PERSON = '900000003'
const EMPTY_ANSWER_ERROR = 'модель не дала ответа' // cyrillic-ok: the render's constant, quoted

const event = (o: Record<string, unknown>) => JSON.stringify(o)

/** Every request gets the same stream, from its first byte. */
function serve(lines: string[]) {
  const enc = new TextEncoder()
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      let sent = false
      return {
        ok: true,
        status: 200,
        body: {
          getReader: () => ({
            read: async () => {
              if (sent) return { done: true, value: undefined }
              sent = true
              return {
                done: false,
                value: enc.encode(lines.join('\n') + '\n'),
              }
            },
          }),
        },
      }
    })
  )
}

beforeEach(() => {
  vi.resetModules()
  process.env.RENDER_API_KEY = 'test-key'
})
afterEach(() => vi.unstubAllGlobals())

describe('the render says the model gave no answer', () => {
  it('the bot rejects with that reason, not an empty success', async () => {
    const why =
      `${EMPTY_ANSWER_ERROR}: zai: пустой ответ после my_assets, my_renders ` + // cyrillic-ok: fixture
      'и повторной просьбы; zai-lite: пустой ответ и повторной просьбы' // cyrillic-ok: fixture
    serve([
      event({ ['тип']: 'ход', id: 't-empty' }),
      event({ ['тип']: 'провайдер', id: 'zai', model: 'glm-5.3' }),
      event({ ['тип']: 'инструмент', ['имя']: 'my_assets' }),
      event({ ['тип']: 'инструмент', ['имя']: 'my_renders' }),
      event({ ['тип']: 'ошибка', ['текст']: why }),
    ])
    const { спроситьАгента: ask } = await import('@/services/trinityAgent') // cyrillic-ok: pre-existing export name
    const question = 'покажи мои материалы' // cyrillic-ok: fixture
    await expect(ask(PERSON, question)).rejects.toThrow(EMPTY_ANSWER_ERROR)
  })
})
