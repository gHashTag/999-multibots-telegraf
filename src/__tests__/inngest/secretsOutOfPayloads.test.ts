/**
 * Spec: t27 specs/functions/reels-loop-generate.t27 and
 * specs/functions/content-scripts-generate.t27 (NOTE 2026-10-09).
 *
 * An event payload is stored with the event and shown in the Inngest UI and
 * traces. Two registered functions took secrets through it: reels-loop-generate
 * built a Telegraf from event.data.bot_token, content-scripts-generate preferred
 * event.data.openai_api_key over the env. Now the bot is resolved from bot_name
 * (token stays in env), bot_token is honoured only as a deprecated fallback,
 * and the OpenAI key field is gone from the schema.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NonRetriableError } from 'inngest'

const mocks = vi.hoisted(() => ({
  getBotByName: vi.fn(),
  telegrafCtor: vi.fn(),
  warn: vi.fn(),
}))

vi.mock('@/utils/logger', () => ({
  logger: { info: vi.fn(), warn: mocks.warn, error: vi.fn(), debug: vi.fn() },
}))
vi.mock('@/core/bot', () => ({ getBotByName: mocks.getBotByName }))
vi.mock('telegraf', () => ({
  Telegraf: class {
    constructor(token: string, opts: unknown) {
      mocks.telegrafCtor(token, opts)
    }
  },
}))
vi.mock('@/services/telegramApi', () => ({
  telegramClientOptionsFor: () => ({}),
}))
vi.mock('@/inngest_app/client', () => ({
  inngest: {
    createFunction: (o: unknown, t: unknown, h: unknown) => ({ o, t, h }),
  },
  createInngestFailureHandler: () => vi.fn(),
}))
vi.mock('@/core/supabase', () => ({ supabase: {} }))
vi.mock('openai', () => ({ default: class {} }))
vi.mock('@/helpers/video-helpers', () => ({
  addMusic: vi.fn(),
  combineVideos: vi.fn(),
}))
vi.mock('@/helpers', () => ({ downloadFile: vi.fn() }))
vi.mock('node-fetch', () => ({ default: vi.fn() }))

import { resolveBotForDelivery } from '@/inngest_app/functions/existing/generateAdvancedLoopingVideoFunction'
import { generateContentScriptsSchema } from '@/inngest_app/functions/content/generateContentScripts'

beforeEach(() => {
  mocks.getBotByName.mockReset()
  mocks.telegrafCtor.mockReset()
  mocks.warn.mockReset()
})

describe('reels-loop-generate: the bot comes from bot_name, not from a token in the event', () => {
  it('resolves a known bot_name through the registry and never constructs from a token', () => {
    const bot = { telegram: {} }
    mocks.getBotByName.mockReturnValue({ bot })
    expect(resolveBotForDelivery('neuro_blogger_bot', undefined)).toBe(bot)
    expect(mocks.telegrafCtor).not.toHaveBeenCalled()
  })

  it('bot_name wins even when a legacy token is also present', () => {
    const bot = { telegram: {} }
    mocks.getBotByName.mockReturnValue({ bot })
    resolveBotForDelivery('neuro_blogger_bot', 'legacy-token')
    expect(mocks.telegrafCtor).not.toHaveBeenCalled()
    expect(mocks.warn).not.toHaveBeenCalled()
  })

  it('an unknown bot_name is terminal (NonRetriableError)', () => {
    mocks.getBotByName.mockReturnValue({ bot: undefined, error: 'not found' })
    expect(() => resolveBotForDelivery('nope_bot', undefined)).toThrow(
      NonRetriableError
    )
  })

  it('a legacy bot_token still delivers, with a deprecation warning', () => {
    resolveBotForDelivery(undefined, 'legacy-token')
    expect(mocks.telegrafCtor).toHaveBeenCalledTimes(1)
    expect(mocks.telegrafCtor.mock.calls[0][0]).toBe('legacy-token')
    expect(mocks.warn).toHaveBeenCalledTimes(1)
    expect(String(mocks.warn.mock.calls[0][0])).not.toContain('legacy-token')
  })

  it('neither bot_name nor bot_token is terminal', () => {
    expect(() => resolveBotForDelivery(undefined, undefined)).toThrow(
      NonRetriableError
    )
  })
})

describe('content-scripts-generate: no OpenAI key through the event', () => {
  it('the schema has no openai_api_key and strips one that a sender still sends', () => {
    expect(Object.keys(generateContentScriptsSchema.shape)).not.toContain(
      'openai_api_key'
    )
    const parsed = generateContentScriptsSchema.parse({
      reel_id: 'r1',
      project_id: 7,
      openai_api_key: 'sk-should-not-survive',
    })
    expect(parsed).toEqual({ reel_id: 'r1', project_id: 7 })
  })
})
