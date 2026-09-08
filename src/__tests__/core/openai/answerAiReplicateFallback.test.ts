/**
 * When every keyed LLM provider is dead, answerAi must still answer.
 *
 * Live, 2026-09-08 14:18 UTC: a customer wrote to the bot and the chain died
 * four times in two seconds -- Grok "Model not found" (and the team out of
 * credits), GLM 429 "Insufficient balance", DeepSeek 401 "api key invalid",
 * OpenAI 401 "Incorrect API key" -- and the person got nothing, while the
 * owner's business DM kept answering through Replicate. The same Replicate
 * chat is now the last link of the chain; the control keeps the honest throw
 * when even that token is absent.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const chatWithAI = vi.fn(async () => 'replicate says hi')
vi.mock('@/services/aiChatService', () => ({
  chatWithAI: (...a: unknown[]) => chatWithAI(...(a as [])),
  AI_CHAT_MODELS: {},
}))
vi.mock('@/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

const KEYS = [
  'GROK_API_KEY',
  'GLM_API_KEY',
  'DEEPSEEK_API_KEY',
  'OPENAI_API_KEY',
  'OPENROUTER_API_KEY',
  'REPLICATE_API_TOKEN',
] as const
const saved: Record<string, string | undefined> = {}
const realFetch = global.fetch

beforeEach(() => {
  for (const k of KEYS) {
    saved[k] = process.env[k]
    delete process.env[k]
  }
  // Any provider that is somehow still tried must fail like a dead key does.
  global.fetch = vi.fn(async () => ({
    ok: false,
    status: 401,
    text: async () => 'Incorrect API key provided',
    json: async () => ({ error: { message: 'Incorrect API key provided' } }),
  })) as any
  chatWithAI.mockClear()
})
afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k]
    else process.env[k] = saved[k]
  }
  global.fetch = realFetch
  vi.resetModules()
})

const user = { username: 'u', first_name: 'U', last_name: '' } as any

describe('answerAi: Replicate is the last link of the chain', () => {
  it('with every keyed provider gone and REPLICATE_API_TOKEN set, the answer comes from chatWithAI', async () => {
    process.env.REPLICATE_API_TOKEN = 'r8_test'
    const { answerAi } = await import('@/core/openai/requests')
    const out = await answerAi(
      'gpt-4-turbo',
      user,
      'Сколько стоит нейрофото?',
      'ru',
      'You sell AI photos.'
    )
    expect(out).toBe('replicate says hi')
    expect(chatWithAI).toHaveBeenCalledTimes(1)
    const messages = (chatWithAI.mock.calls[0] as any)[0]
    expect(messages[0]).toMatchObject({ role: 'system' })
    expect(messages[0].content).toContain('Respond in the language: ru')
    expect(messages[0].content).toContain('You sell AI photos.')
    expect(messages[1].role).toBe('user')
    expect(messages[1].content).toContain('Сколько стоит нейрофото?')
  })

  it('control: without the token the chain still ends in the honest throw', async () => {
    const { answerAi } = await import('@/core/openai/requests')
    await expect(answerAi('gpt-4-turbo', user, 'hi', 'en')).rejects.toThrow(
      'All AI providers failed'
    )
    expect(chatWithAI).not.toHaveBeenCalled()
  })

  it('a failing Replicate call is reported, not swallowed into an empty answer', async () => {
    process.env.REPLICATE_API_TOKEN = 'r8_test'
    chatWithAI.mockImplementationOnce(async () => {
      throw new Error('Replicate 402 payment required')
    })
    const { answerAi } = await import('@/core/openai/requests')
    await expect(answerAi('gpt-4-turbo', user, 'hi', 'en')).rejects.toThrow(
      'All AI providers failed'
    )
  })
})
