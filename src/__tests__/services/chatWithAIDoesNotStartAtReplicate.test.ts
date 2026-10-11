/**
 * A SET REPLICATE TOKEN IS NOT A BALANCE.
 *
 * 2026-10-11: every business DM reply failed with Replicate's "re-enable your
 * account" because chatWithAI went straight to Replicate whenever the token
 * was present. The free z.ai flash model must be asked first, and Replicate
 * may be reached only when it was switched back on (REPLICATE_LIVE=1) and no
 * other key exists.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const create = vi.fn()
const ctor = vi.fn()

vi.mock('openai', () => ({
  default: class {
    chat = { completions: { create } }
    constructor(opts: unknown) {
      ctor(opts)
    }
  },
}))
vi.mock('@/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))
vi.mock('@/services/chatMemoryService', () => ({
  saveMessage: vi.fn(),
  loadHistory: vi.fn().mockResolvedValue([]),
  getUserContext: vi.fn().mockResolvedValue(''),
}))
vi.mock('@/services/skillManager', () => ({
  listSkills: vi.fn().mockResolvedValue([]),
}))

const KEYS = [
  'GLM_API_KEY',
  'GLM_MODEL',
  'DEEPSEEK_API_KEY',
  'OPENAI_API_KEY',
  'OPENROUTER_API_KEY',
  'REPLICATE_API_TOKEN',
  'REPLICATE_LIVE',
] as const
const saved: Record<string, string | undefined> = {}

beforeEach(() => {
  for (const k of KEYS) {
    saved[k] = process.env[k]
    delete process.env[k]
  }
  create.mockReset()
  ctor.mockReset()
  create.mockResolvedValue({ choices: [{ message: { content: 'hi' } }] })
})
afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k]
    else process.env[k] = saved[k]
  }
  vi.unstubAllGlobals()
})

const ask = async () => {
  const { chatWithAI } = await import('@/services/aiChatService')
  return chatWithAI([{ role: 'user', content: 'hello' }])
}

describe('chatWithAI provider order', () => {
  it('asks z.ai flash even though the Replicate token is set', async () => {
    process.env.GLM_API_KEY = 'zai-test'
    process.env.REPLICATE_API_TOKEN = 'r8_test'
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    expect(await ask()).toBe('hi')
    expect(fetchSpy).not.toHaveBeenCalled() // no api.replicate.com round trip
    expect(ctor.mock.calls[0][0].baseURL).toContain('api.z.ai')
    expect(create.mock.calls[0][0].model).toBe('glm-4.7-flash')
  })

  it('never calls Replicate when only the token is present', async () => {
    process.env.REPLICATE_API_TOKEN = 'r8_test'
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    await expect(ask()).rejects.toThrow('No AI API key found')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('reaches Replicate only when switched back on', async () => {
    process.env.REPLICATE_API_TOKEN = 'r8_test'
    process.env.REPLICATE_LIVE = '1'
    const fetchSpy = vi.fn().mockResolvedValue({
      json: async () => ({ detail: 'billing' }),
    })
    vi.stubGlobal('fetch', fetchSpy)

    await expect(ask()).rejects.toThrow('billing')
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })
})
