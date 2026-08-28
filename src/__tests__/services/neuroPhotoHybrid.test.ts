/**
 * Mock test for the neurophoto money path (generateNeuroPhotoHybrid).
 *
 * Plan A POSTs to a separate AI server; on any failure it falls back to Plan B
 * (generateNeuroPhotoDirect, which runs Replicate/FAL and moves stars). Mocking
 * axios (Plan A) and generateNeuroPhotoDirect (Plan B) means no network, no
 * provider, no money. generateNeuroPhotoDirect's internals already have their
 * own test; this covers the hybrid dispatch: Plan A success, Plan B fallback,
 * the NSFW guard, the provider gate, and the pre-flight validation.
 */
import { describe, it, expect, beforeEach, afterEach, vi, Mock } from 'vitest'

vi.mock('axios', () => ({
  default: { post: vi.fn() },
  isAxiosError: vi.fn(() => false),
}))

vi.mock('@/config', () => ({
  isDev: false,
  SECRET_API_KEY: 'test-secret',
  API_SERVER_URL_FINAL: 'https://x',
  LOCAL_SERVER_URL: 'http://localhost',
}))

vi.mock('@/config/aiServer', () => ({ getAiServerUrl: vi.fn() }))

vi.mock('@/helpers/centralizedLanguage', () => ({
  // Called both awaited and un-awaited in the SUT; a sync boolean works for both.
  isRussianFromState: vi.fn(() => false),
}))

vi.mock('@/utils/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

vi.mock('@/services/generateNeuroPhotoDirect', () => ({
  generateNeuroPhotoDirect: vi.fn(),
}))

vi.mock('@/price/helpers/modelsCost', () => ({
  calculateModeCost: vi.fn(() => ({ stars: 7.5, dollars: 0, rubles: 0 })),
}))

vi.mock('@/services/provider-health-monitor', () => ({
  isProviderAvailable: vi.fn(() => true),
}))

vi.mock('@/services/skillManager', () => ({
  trackGeneration: vi.fn().mockResolvedValue(undefined),
}))

import axios, { isAxiosError } from 'axios'
import { getAiServerUrl } from '@/config/aiServer'
import { generateNeuroPhotoDirect } from '@/services/generateNeuroPhotoDirect'
import { isProviderAvailable } from '@/services/provider-health-monitor'
import { generateNeuroPhotoHybrid } from '@/services/generateNeuroPhotoHybrid'

const post = axios.post as unknown as Mock
const axiosErr = isAxiosError as unknown as Mock
const aiUrl = getAiServerUrl as unknown as Mock
const direct = generateNeuroPhotoDirect as unknown as Mock
const providerAvail = isProviderAvailable as unknown as Mock

function makeCtx(over: Record<string, unknown> = {}) {
  return {
    session: {
      prompt: 'a wizard portrait',
      userModel: { model_url: 'owner/m:v', trigger_word: 'X' },
    },
    from: { id: 123456789, username: 'test_user' },
    chat: { id: 123456789 },
    botInfo: { username: 'test_bot' },
    telegram: { sendChatAction: vi.fn(), sendPhoto: vi.fn() },
    reply: vi.fn(),
    ...over,
  } as any
}

function run(ctx: any) {
  return generateNeuroPhotoHybrid(
    'a wizard portrait',
    'owner/m:v',
    1,
    '123456789',
    ctx,
    'test_bot',
    null,
    ctx.session?.userModel
  )
}

describe('generateNeuroPhotoHybrid (Plan A/B, mocked)', () => {
  beforeEach(() => {
    post.mockReset()
    axiosErr.mockReset()
    aiUrl.mockReset()
    direct.mockReset()
    providerAvail.mockReset()
    axiosErr.mockReturnValue(false)
    providerAvail.mockReturnValue(true)
    direct.mockResolvedValue({
      data: 'done',
      success: true,
      urls: ['https://cdn/direct.jpg'],
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('Plan A success: uses the AI server, returns its urls, no Plan B', async () => {
    aiUrl.mockReturnValue('https://ai.example.com')
    post.mockResolvedValue({
      status: 200,
      data: { urls: ['https://cdn/img.jpg'] },
    })

    const ctx = makeCtx()
    const res = (await run(ctx)) as any

    expect(res.urls).toEqual(['https://cdn/img.jpg'])
    expect(String(post.mock.calls[0][0])).toContain('/generate/neuro-photo')
    expect(direct).not.toHaveBeenCalled()
    expect(ctx.telegram.sendPhoto).toHaveBeenCalled()
  })

  it('Plan B default (AI server not configured): calls generateNeuroPhotoDirect', async () => {
    aiUrl.mockReturnValue(null)

    const ctx = makeCtx()
    const res = (await run(ctx)) as any

    expect(post).not.toHaveBeenCalled()
    expect(direct).toHaveBeenCalledTimes(1)
    expect(res.success).toBe(true)
    expect(res.urls).toEqual(['https://cdn/direct.jpg'])
  })

  it('Plan A failure falls back to Plan B', async () => {
    aiUrl.mockReturnValue('https://ai.example.com')
    post.mockRejectedValue(new Error('server 500')) // isAxiosError false -> generic -> Plan B

    const ctx = makeCtx()
    const res = (await run(ctx)) as any

    expect(direct).toHaveBeenCalledTimes(1)
    expect(res.urls).toEqual(['https://cdn/direct.jpg'])
  })

  it('NSFW from Plan A: replies and returns null, no Plan B', async () => {
    aiUrl.mockReturnValue('https://ai.example.com')
    axiosErr.mockReturnValue(true)
    post.mockRejectedValue({
      response: { data: { error: 'NSFW content detected' } },
    })

    const ctx = makeCtx()
    const res = await run(ctx)

    expect(res).toBeNull()
    expect(ctx.reply).toHaveBeenCalled()
    expect(direct).not.toHaveBeenCalled()
  })

  it('provider gate closed: returns null, no provider call', async () => {
    providerAvail.mockReturnValue(false)

    const ctx = makeCtx()
    const res = await run(ctx)

    expect(res).toBeNull()
    expect(ctx.reply).toHaveBeenCalled()
    expect(post).not.toHaveBeenCalled()
    expect(direct).not.toHaveBeenCalled()
  })

  it('validation throws on missing prompt / userModel', async () => {
    const noPrompt = makeCtx({ session: { userModel: { model_url: 'x' } } })
    await expect(
      generateNeuroPhotoHybrid(
        'x',
        'owner/m:v',
        1,
        '123',
        noPrompt,
        'bot',
        null,
        noPrompt.session.userModel
      )
    ).rejects.toThrow('Prompt not found')

    const noModel = makeCtx({ session: { prompt: 'x' } })
    await expect(
      generateNeuroPhotoHybrid(
        'x',
        'owner/m:v',
        1,
        '123',
        noModel,
        'bot',
        null,
        undefined
      )
    ).rejects.toThrow('User model not found')
  })
})
