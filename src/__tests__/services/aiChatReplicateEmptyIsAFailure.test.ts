import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * AN EMPTY REPLICATE OUTPUT IS A FAILURE, NOT A RUSSIAN SENTENCE.
 *
 * `chatViaReplicate` -- the path production takes, since REPLICATE_API_TOKEN
 * is set on the bot service -- answered an empty output with a hard-coded
 * Russian "could not generate an answer", returned as if the model had said
 * it. Every caller delivered it as the answer, English speakers included, and
 * the bot chat's fallback could not tell it from a reply. It now throws like
 * the OpenAI path, so each caller apologises in the person's own language.
 */
vi.mock('@/services/chatMemoryService', () => ({
  saveMessage: vi.fn(),
  loadHistory: vi.fn(async () => []),
  getUserContext: vi.fn(async () => ''),
}))
vi.mock('@/services/skillManager', () => ({
  listSkills: vi.fn(async () => []),
}))

import { chatWithAI } from '@/services/aiChatService'

const saved = process.env.REPLICATE_API_TOKEN

function replicate(output: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) =>
      String(url).includes('/predictions/')
        ? new Response(JSON.stringify({ status: 'succeeded', output }))
        : new Response(JSON.stringify({ id: 'pred-1' }))
    )
  )
}

beforeEach(() => {
  process.env.REPLICATE_API_TOKEN = 'replicate-token-for-tests' // secret-guard-ok: test placeholder
})
afterEach(() => {
  vi.unstubAllGlobals()
  if (saved === undefined) delete process.env.REPLICATE_API_TOKEN
  else process.env.REPLICATE_API_TOKEN = saved
})

describe('chatWithAI through Replicate', () => {
  it('an empty output rejects instead of answering with a canned sentence', async () => {
    replicate(['  ', '\n'])
    await expect(
      chatWithAI([{ role: 'user', content: 'hello' }])
    ).rejects.toThrow('Empty response from AI')
  }, 20_000)

  it('a real output is returned as the model wrote it, trimmed', async () => {
    // Positive control: the failure above is about emptiness, not about the
    // path being broken.
    replicate(['Hi', ' there. '])
    await expect(
      chatWithAI([{ role: 'user', content: 'hello' }])
    ).resolves.toBe('Hi there.')
  }, 20_000)
})
