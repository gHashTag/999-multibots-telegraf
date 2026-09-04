/**
 * Mock test for text-to-video generation (the money-provider dispatch).
 *
 * generateTextToVideo picks Replicate or Kie.ai from the real model config and
 * spends money there. Both providers are mocked (replicate.run + a hoisted
 * KieAiProvider.generateVideo), so no network and no money. The sibling test
 * covers generateImageToVideo only; this covers the text path: provider
 * dispatch, the videoUrl-vs-taskId return contract, and the refund-on-error
 * branch.
 */
import { describe, it, expect, beforeEach, afterEach, vi, Mock } from 'vitest'
import { generateTextToVideo } from '../generateTextToVideo'

vi.mock('../../../utils/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

// Avoid loading the real config module (env/Infisical) at import time.
vi.mock('../../../config', () => ({
  PUBLIC_URL: 'http://test',
  SECRET_API_KEY: 'test-secret',
}))

vi.mock('../../../core/replicate', () => ({ replicate: { run: vi.fn() } }))

vi.mock('../helpers', () => ({ getUserHelper: vi.fn() }))

vi.mock('../../../core/supabase/updateUserBalance', () => ({
  updateUserBalance: vi.fn(),
}))

vi.mock('../../../price/helpers', () => ({ calculateFinalPrice: vi.fn() }))

// KieAiProvider is loaded via dynamic import inside the SUT; declare the mock
// method with vi.hoisted so each test can steer generateVideo's return.
const { generateVideoMock } = vi.hoisted(() => ({ generateVideoMock: vi.fn() }))
vi.mock('../../../services/video-providers/KieAiProvider', () => ({
  KieAiProvider: vi
    .fn()
    .mockImplementation(() => ({ generateVideo: generateVideoMock })),
}))

vi.mock('axios', () => ({
  default: { post: vi.fn(), get: vi.fn() },
  isAxiosError: vi.fn(() => false),
}))

import { replicate } from '../../../core/replicate'
import { getUserHelper } from '../helpers'
import { updateUserBalance } from '../../../core/supabase/updateUserBalance'
import { calculateFinalPrice } from '../../../price/helpers'

const run = replicate.run as unknown as Mock
const getUser = getUserHelper as unknown as Mock
const refund = updateUserBalance as unknown as Mock
const price = calculateFinalPrice as unknown as Mock

// (prompt, telegram_id, username, is_ru, bot_name, modelId, resolution?, duration?, aspectRatio?)
function call(modelId: string) {
  return generateTextToVideo(
    'a cat surfing',
    '123456789',
    'test_user',
    false,
    'test_bot',
    modelId,
    '720p',
    8,
    '16:9'
  )
}

describe('generateTextToVideo (dispatch, mocked)', () => {
  beforeEach(() => {
    run.mockReset()
    getUser.mockReset()
    refund.mockReset()
    price.mockReset()
    generateVideoMock.mockReset()
    getUser.mockResolvedValue({ aspect_ratio: '16:9' })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('Kie provider: returns the videoUrl on sync success (no refund)', async () => {
    generateVideoMock.mockResolvedValue({
      success: true,
      data: { videoUrl: 'https://cdn/x.mp4', duration: 8 },
    })

    const res = await call('veo3')

    expect(res).toBe('https://cdn/x.mp4')
    expect(generateVideoMock).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'veo3', telegram_id: '123456789' })
    )
    expect(run).not.toHaveBeenCalled()
    expect(refund).not.toHaveBeenCalled()
  })

  it('Kie provider: returns the taskId when the job is async (no videoUrl)', async () => {
    generateVideoMock.mockResolvedValue({
      success: true,
      data: { taskId: 'task-1' },
    })

    const res = await call('veo3')

    expect(res).toBe('task-1') // a non-URL string is a legitimate success (job id)
    expect(refund).not.toHaveBeenCalled()
  })

  it('Replicate provider: returns array[0] (no Kie call, no refund)', async () => {
    run.mockResolvedValue(['https://cdn/seed.mp4'])

    const res = await call('seedance-1-pro')

    expect(res).toBe('https://cdn/seed.mp4')
    expect(run).toHaveBeenCalledWith(
      'bytedance/seedance-1-pro',
      expect.objectContaining({ input: expect.any(Object) })
    )
    expect(generateVideoMock).not.toHaveBeenCalled()
    expect(refund).not.toHaveBeenCalled()
  })

  it('provider failure returns null WITHOUT crediting anyone', async () => {
    // This case used to assert the opposite, and the assertion was locking in
    // a mint: nothing on this path ever charges, so the credit handed out
    // stars that were never taken. The only caller is the improvePromptWizard
    // scene, and no charge primitive is reachable from it.
    //
    // The three neighbouring cases already assert "no refund"; this one now
    // joins them, which makes the whole file say one thing instead of two.
    price.mockReturnValue(50)
    generateVideoMock.mockResolvedValue({
      success: false,
      error: 'Insufficient credits',
    })

    const res = await call('veo3')

    expect(res).toBeNull()
    expect(refund).not.toHaveBeenCalled()
  })

  it('invalid modelId returns null WITHOUT a refund or user lookup', async () => {
    const res = await call('does-not-exist')

    expect(res).toBeNull()
    expect(getUser).not.toHaveBeenCalled()
    expect(refund).not.toHaveBeenCalled()
  })

  it('model without text input returns null, no provider call, no refund', async () => {
    const res = await call('kling-v2.0') // inputTypes: ['image'] only

    expect(res).toBeNull()
    expect(run).not.toHaveBeenCalled()
    expect(generateVideoMock).not.toHaveBeenCalled()
    expect(refund).not.toHaveBeenCalled()
  })
})
