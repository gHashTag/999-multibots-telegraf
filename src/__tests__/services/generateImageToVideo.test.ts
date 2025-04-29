import { vi, describe, it, expect, beforeEach, Mocked } from 'vitest'
import { generateImageToVideo } from '@/services/generateImageToVideo'
import { MyContext } from '@/interfaces' // Import necessary types
import { Update } from 'telegraf/types'
// Import types for mocked modules
import type * as SupabaseCore from '@/core/supabase'
import type * as PriceHelpers from '@/price/helpers'
// Remove incorrect ReplicateRunType import
// import type { run as ReplicateRunType } from '@replicate/replicate';
import type Replicate from 'replicate' // Import the default export type
import type * as ReplicateClient from '@/core/replicate' // Keep this for the client object
import type * as DownloadHelper from '@/helpers/downloadFile'
// Restore type-only import for fs/promises
import type * as FsPromises from 'fs/promises'
import type * as ErrorAdmin from '@/helpers/error/errorMessageAdmin'
import type * as LoggerUtils from '@/utils/logger'
// Correctly import VideoModelConfig type AND the config value type
import type {
  VIDEO_MODELS_CONFIG as VideoModelsConfigValue,
  VideoModelConfig,
} from '@/price/models/VIDEO_MODELS_CONFIG'
// Import Prediction type if needed for replicate mock
import type { Prediction } from 'replicate'

// --- Mock External Dependencies ---

// Mock Replicate Client
vi.mock('@/core/replicate', () => ({
  replicate: {
    // Mock the run method on the client instance
    run: vi.fn(),
  },
}))

// Mocks for other dependencies (keep as simple vi.mock calls)
vi.mock('@/utils/logger')
vi.mock('@/helpers/downloadFile')
vi.mock('@/core/supabase')
vi.mock('@/price/helpers')
vi.mock('fs/promises')
vi.mock('@/helpers/error/errorMessageAdmin')

// Mock Models Config using actual structure and keys
vi.mock('@/config/models.config', async () => {
  // Define mock implementations matching VideoModelConfig structure
  const mockKling: VideoModelConfig = {
    id: 'kling-v1.6-pro',
    title: 'Kling v1.6 Pro',
    inputType: ['text', 'image', 'morph'], // Reflect actual config
    description: 'Mock Kling',
    basePrice: 0.098,
    api: { model: 'kwaivgi/kling-v1.6-pro', input: {} },
    imageKey: 'start_image',
    canMorph: true, // Reflect actual config
  }
  const mockWanI2V: VideoModelConfig = {
    id: 'wan-image-to-video',
    title: 'Wan-2.1-i2v',
    inputType: ['image'],
    description: 'Mock Wan I2V',
    basePrice: 0.25,
    api: { model: 'wavespeedai/wan-2.1-i2v-720p', input: {} },
    imageKey: 'image',
  }
  // Add required models for videoModelPrices.ts
  const mockMinimax: VideoModelConfig = {
    id: 'minimax',
    title: 'Mock Minimax',
    inputType: ['text', 'image'],
    description: 'Mock',
    basePrice: 0.5,
    api: { model: 'minimax/video-01', input: {} },
    imageKey: 'first_frame_image',
  }
  const mockHaiper: VideoModelConfig = {
    id: 'haiper-video-2',
    title: 'Mock Haiper',
    inputType: ['text', 'image'],
    description: 'Mock',
    basePrice: 0.05,
    api: { model: 'haiper-ai/haiper-video-2', input: {} },
    imageKey: 'frame_image_url',
  }
  const mockRay: VideoModelConfig = {
    id: 'ray-v2',
    title: 'Mock Ray',
    inputType: ['text', 'image'],
    description: 'Mock',
    basePrice: 0.18,
    api: { model: 'luma/ray-2-720p', input: {} },
    imageKey: 'start_image_url',
  }
  const mockWanT2V: VideoModelConfig = {
    id: 'wan-text-to-video',
    title: 'Mock Wan T2V',
    inputType: ['text'],
    description: 'Mock',
    basePrice: 0.25,
    api: { model: 'wavespeedai/wan-2.1-t2v-720p', input: {} },
  }
  const mockHunyuan: VideoModelConfig = {
    id: 'hunyuan-video-fast',
    title: 'Mock Hunyuan',
    inputType: ['text'],
    description: 'Mock',
    basePrice: 0.2,
    api: { model: 'wavespeedai/hunyuan-video-fast', input: {} },
  }

  // Use typeof the actual exported VALUE for the type
  const mockConfig: typeof VideoModelsConfigValue = {
    'kling-v1.6-pro': mockKling,
    'wan-image-to-video': mockWanI2V,
    // Add the required mocks
    minimax: mockMinimax,
    'haiper-video-2': mockHaiper,
    'ray-v2': mockRay,
    // Add wan-text-to-video and hunyuan-video-fast if needed
    'wan-text-to-video': mockWanT2V,
    'hunyuan-video-fast': mockHunyuan,
  }
  return { VIDEO_MODELS_CONFIG: mockConfig }
})

// Mock Filesystem operations MANUALLY
// Use the function type as the single generic argument
const mockMkdir = vi.fn<typeof FsPromises.mkdir>()
const mockWriteFile = vi.fn<typeof FsPromises.writeFile>()
vi.mock('fs/promises', () => ({
  mkdir: mockMkdir,
  writeFile: mockWriteFile,
  // Mock other fs/promises functions here if needed by the service
}))

// --- Test Suite ---

describe('generateImageToVideo Service', () => {
  let mockCtx: Partial<MyContext>
  // Declare Mocked Variables
  let supabaseMock: Mocked<typeof SupabaseCore>
  let priceMock: Mocked<typeof PriceHelpers>
  // Mock the replicate client object
  let replicateClientMock: Mocked<Replicate>
  let downloadMock: Mocked<typeof DownloadHelper>
  let errorAdminMock: Mocked<typeof ErrorAdmin>
  let loggerMock: Mocked<typeof LoggerUtils>

  beforeEach(async () => {
    vi.clearAllMocks()

    mockCtx = {
      telegram: { sendVideo: vi.fn(), sendMessage: vi.fn() } as any,
      from: {
        id: 12345,
        username: 'testuser',
        language_code: 'en',
        is_bot: false,
        first_name: 'Test',
      },
    }

    // Import mocked modules correctly
    supabaseMock = vi.mocked(await import('@/core/supabase'))
    priceMock = vi.mocked(await import('@/price/helpers'))
    // Get the mocked replicate client instance
    replicateClientMock = vi.mocked(
      (await import('@/core/replicate')).replicate
    )
    downloadMock = vi.mocked(await import('@/helpers/downloadFile'))
    // Don't need to import fs/promises mock anymore
    errorAdminMock = vi.mocked(
      await import('@/helpers/error/errorMessageAdmin')
    )
    loggerMock = vi.mocked(await import('@/utils/logger'))

    // Setup default SUCCESSFUL mock implementations
    supabaseMock.getUserByTelegramId.mockResolvedValue({
      id: 'user-uuid',
      telegram_id: '12345',
      username: 'testuser',
      first_name: 'Test',
      language_code: 'en',
      is_bot: false,
      level: 1,
      created_at: '',
      updated_at: '',
      aspect_ratio: '16:9',
      subscription_type: null,
    } as any)

    priceMock.processBalanceVideoOperation.mockResolvedValue({
      success: true,
      newBalance: 90,
      paymentAmount: 10,
      modePrice: 10,
    })

    // Setup mockResolvedValue on the mocked run method
    // Replicate run usually returns the full Prediction object or just the output array/string
    // Let's assume it returns the output directly based on generateImageToVideo code
    ;(
      replicateClientMock.run as Mocked<typeof replicateClientMock.run>
    ).mockResolvedValue(
      ['http://example.com/video.mp4'] // Assume it returns an array with the URL
    )

    downloadMock.downloadFile.mockResolvedValue(Buffer.from('video data'))
    // Setup mock implementations for fs functions directly
    mockMkdir.mockResolvedValue(undefined) // Should return Promise<void | string>
    mockWriteFile.mockResolvedValue(undefined) // Should return Promise<void>
    supabaseMock.saveVideoUrlToSupabase.mockResolvedValue()

    errorAdminMock.errorMessageAdmin.mockClear()
  })

  // Test: Standard Mode (Happy Path Only)
  it('should call dependencies correctly in standard mode (happy path) with kling-v1.6-pro', async () => {
    // Arrange
    const videoModel = 'kling-v1.6-pro'
    const imageUrl = 'http://example.com/image.jpg'
    const prompt = 'A dancing robot'
    const telegram_id = '12345'
    const username = 'testuser'
    const is_ru = false
    const bot_name = 'test_bot'

    // Act
    const result = await generateImageToVideo(
      mockCtx as MyContext,
      imageUrl,
      prompt,
      videoModel,
      telegram_id,
      username,
      is_ru,
      bot_name,
      false
    )

    // Assert
    expect(supabaseMock.getUserByTelegramId).toHaveBeenCalledWith(
      mockCtx as MyContext
    )
    expect(priceMock.processBalanceVideoOperation).toHaveBeenCalledWith(
      mockCtx as MyContext,
      videoModel,
      is_ru
    )
    expect(downloadMock.downloadFile).toHaveBeenCalledWith(imageUrl)
    // Check the call to the mocked run method
    expect(replicateClientMock.run).toHaveBeenCalledWith(
      expect.stringContaining('kling-v1.6-pro'),
      expect.objectContaining({
        prompt: prompt,
        start_image: expect.any(Buffer),
      })
    )
    expect(downloadMock.downloadFile).toHaveBeenCalledWith(
      'http://example.com/video.mp4'
    )
    // Check direct mock functions
    expect(mockMkdir).toHaveBeenCalled()
    expect(mockWriteFile).toHaveBeenCalled()
    expect(supabaseMock.saveVideoUrlToSupabase).toHaveBeenCalledWith(
      telegram_id,
      'http://example.com/video.mp4',
      expect.any(String),
      videoModel
    )
    expect(mockCtx.telegram?.sendVideo).toHaveBeenCalledTimes(2)
    expect(mockCtx.telegram?.sendVideo).toHaveBeenNthCalledWith(
      1,
      telegram_id,
      { source: expect.any(String) }
    )
    expect(mockCtx.telegram?.sendMessage).toHaveBeenCalledWith(
      telegram_id,
      expect.stringContaining('Your video is ready!')
    )
    expect(result).toEqual({ videoUrl: 'http://example.com/video.mp4' })
    expect(loggerMock.logger.error).not.toHaveBeenCalled()
  })

  // Test: Morphing Mode (Happy Path Only) with Kling
  it('should call dependencies correctly in morphing mode (happy path) with kling-v1.6-pro', async () => {
    // Arrange
    const videoModel = 'kling-v1.6-pro'
    const imageAUrl = 'http://example.com/imageA.jpg'
    const imageBUrl = 'http://example.com/imageB.jpg'
    const prompt = 'Morphing clouds'
    const telegram_id = '12345'
    const username = 'testuser'
    const is_ru = true
    const bot_name = 'test_bot'

    // Adjust balance mock for Kling price
    priceMock.processBalanceVideoOperation.mockResolvedValue({
      success: true,
      newBalance: 90,
      paymentAmount: 10,
      modePrice: 10,
    })

    // Act
    const result = await generateImageToVideo(
      mockCtx as MyContext,
      null,
      prompt,
      videoModel,
      telegram_id,
      username,
      is_ru,
      bot_name,
      true,
      imageAUrl,
      imageBUrl
    )

    // Assert
    expect(supabaseMock.getUserByTelegramId).toHaveBeenCalledWith(
      mockCtx as MyContext
    )
    expect(priceMock.processBalanceVideoOperation).toHaveBeenCalledWith(
      mockCtx as MyContext,
      videoModel,
      is_ru
    )
    expect(downloadMock.downloadFile).not.toHaveBeenCalledWith(imageAUrl)
    expect(downloadMock.downloadFile).not.toHaveBeenCalledWith(imageBUrl)

    // Check replicate.run arguments for Kling morphing
    expect(replicateClientMock.run).toHaveBeenCalledWith(
      expect.stringContaining('kling-v1.6-pro'),
      expect.objectContaining({
        start_image: imageAUrl,
        end_image: imageBUrl,
        prompt: prompt,
      })
    )

    expect(downloadMock.downloadFile).toHaveBeenCalledWith(
      'http://example.com/video.mp4'
    )
    // Check direct mock functions
    expect(mockMkdir).toHaveBeenCalled()
    expect(mockWriteFile).toHaveBeenCalled()
    expect(supabaseMock.saveVideoUrlToSupabase).toHaveBeenCalledWith(
      telegram_id,
      'http://example.com/video.mp4',
      expect.any(String),
      videoModel
    )
    expect(mockCtx.telegram?.sendVideo).toHaveBeenCalledTimes(2)
    expect(mockCtx.telegram?.sendVideo).toHaveBeenNthCalledWith(
      1,
      telegram_id,
      { source: expect.any(String) }
    )
    expect(mockCtx.telegram?.sendMessage).toHaveBeenCalledWith(
      telegram_id,
      expect.stringContaining('Ваше видео готово!')
    )
    expect(result).toEqual({ videoUrl: 'http://example.com/video.mp4' })
    expect(loggerMock.logger.error).not.toHaveBeenCalled()
  })

  // Test: Error Handling within generateImageToVideo
  it('should call errorMessageAdmin and return "error" if replicate.run throws', async () => {
    // Arrange
    const videoModel = 'kling-v1.6-pro'
    const imageUrl = 'http://example.com/image.jpg'
    const prompt = 'A dancing robot'
    const telegram_id = '12345'
    const username = 'testuser'
    const is_ru = false
    const bot_name = 'test_bot'

    // Mock replicate failure
    const replicateError = new Error('Replicate API Error')
    // Correctly mock the rejection on the run method
    ;(
      replicateClientMock.run as Mocked<typeof replicateClientMock.run>
    ).mockRejectedValue(replicateError)

    // Act
    const result = await generateImageToVideo(
      mockCtx as MyContext,
      imageUrl,
      prompt,
      videoModel,
      telegram_id,
      username,
      is_ru,
      bot_name,
      false
    )

    // Assert
    expect(replicateClientMock.run).toHaveBeenCalled()
    // Ensure fs operations were not called on error path
    expect(mockMkdir).not.toHaveBeenCalled()
    expect(mockWriteFile).not.toHaveBeenCalled()
    expect(errorAdminMock.errorMessageAdmin).toHaveBeenCalledWith(
      mockCtx as MyContext,
      replicateError
    )
    expect(loggerMock.logger.error).toHaveBeenCalledWith(
      expect.stringContaining('Error in generateImageToVideo task'),
      expect.any(Object)
    )
    expect(mockCtx.telegram?.sendVideo).not.toHaveBeenCalled()
    expect(mockCtx.telegram?.sendMessage).not.toHaveBeenCalled()
    expect(result).toBe('error')
  })
})
