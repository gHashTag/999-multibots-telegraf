import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'fs'

// Mocks
vi.mock('@/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}))

vi.mock('@/helpers/pulse', () => ({
  sendMediaToPulse: vi.fn(() => Promise.resolve()),
}))

vi.mock('@/core/getBotTokenByName', () => ({
  getBotTokenByName: vi.fn(() => 'test-token'),
}))

vi.mock('@/services/localMorphingProcessor', () => ({
  createMorphingVideo: vi.fn(() => Promise.resolve('/temp/final_video.mp4')),
}))

describe('generateMorphing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should pass original error message on failure', async () => {
    const { createMorphingVideo } = await import('@/services/localMorphingProcessor')
    const { generateMorphing } = await import('@/services/generateMorphing')

    vi.mocked(createMorphingVideo).mockRejectedValue(new Error('Replicate API 401 Unauthorized'))

    const requestData = {
      images: [
        { buffer: Buffer.from('img1'), filename: '1.jpg', originalOrder: 1 },
        { buffer: Buffer.from('img2'), filename: '2.jpg', originalOrder: 2 },
      ],
      telegram_id: '12345',
      is_ru: true,
      botName: 'test_bot',
      imageCount: 2,
      morphingType: 'seamless' as const,
      withLoop: false,
    }

    await expect(generateMorphing(requestData)).rejects.toThrow(
      'Произошла ошибка при создании морфинга: Replicate API 401 Unauthorized'
    )
  })

  it('should cleanup temp directory on error', async () => {
    const { createMorphingVideo } = await import('@/services/localMorphingProcessor')
    const { generateMorphing } = await import('@/services/generateMorphing')

    vi.mocked(createMorphingVideo).mockRejectedValue(new Error('API Error'))

    const rmSyncSpy = vi.spyOn(fs, 'rmSync').mockImplementation(() => undefined)
    const existsSyncSpy = vi.spyOn(fs, 'existsSync').mockReturnValue(true)

    const requestData = {
      images: [
        { buffer: Buffer.from('img1'), filename: '1.jpg', originalOrder: 1 },
        { buffer: Buffer.from('img2'), filename: '2.jpg', originalOrder: 2 },
      ],
      telegram_id: '12345',
      is_ru: true,
      botName: 'test_bot',
      imageCount: 2,
      morphingType: 'seamless' as const,
      withLoop: false,
    }

    try {
      await generateMorphing(requestData)
    } catch {
      // expected
    }

    expect(rmSyncSpy).toHaveBeenCalled()
    rmSyncSpy.mockRestore()
    existsSyncSpy.mockRestore()
  })
})
