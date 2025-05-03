import { describe, it, expect, vi, beforeEach } from 'vitest'
import { generateTextToVideo } from '../index' // Import from module index
import { GenerateTextToVideoDependencies } from '../types'
import { VideoModelId } from '@/types/index' // Corrected import path

// Mock dependencies
const mockLogger = {
  info: vi.fn(),
  error: vi.fn(),
}

// --- Refactored Supabase Mock ---
const mockSupabaseRpc = vi.fn()
const mockSupabaseSingle = vi.fn()
const mockSupabaseEq = vi.fn(() => ({ single: mockSupabaseSingle }))
const mockSupabaseSelect = vi.fn(() => ({ eq: mockSupabaseEq }))
const mockSupabaseInsert = vi.fn()
const mockSupabaseFrom = vi.fn(table => {
  if (table === 'users') {
    return { select: mockSupabaseSelect }
  }
  if (table === 'videos') {
    return { insert: mockSupabaseInsert }
  }
  // Default fallback or throw error if unexpected table
  return {
    select: vi.fn(() => ({ eq: vi.fn(() => ({ single: vi.fn() })) })),
    insert: vi.fn(),
  }
})

const mockSupabase = {
  from: mockSupabaseFrom,
  rpc: mockSupabaseRpc,
  // Add other top-level Supabase client methods if needed (e.g., auth)
}
// --- End Refactored Supabase Mock ---

const mockReplicateClient = {
  run: vi.fn(),
  // Mock other Replicate methods if needed
}

const mockTelegram = {
  sendMessage: vi.fn(),
  sendVideo: vi.fn(),
  // Mock other Telegram methods if needed
}

const mockFs = {
  mkdir: vi.fn(),
  writeFile: vi.fn(),
}

const mockProcessBalance = vi.fn()
const mockSaveVideoDirect = vi.fn()
const mockPulseHelper = vi.fn()
const mockSendErrorToUser = vi.fn()
const mockSendErrorToAdmin = vi.fn()
const mockGenerateVideoInternal = vi.fn() // Define the mock for internal generation

// --- Тесты --- //

describe('Module: generateTextToVideo', () => {
  let dependencies: GenerateTextToVideoDependencies

  beforeEach(() => {
    // Reset mocks before each test
    vi.resetAllMocks()

    // Setup default mock implementations for Supabase
    mockSupabaseSingle.mockResolvedValue({
      // Mock for .from('users')...single()
      data: {
        id: 1,
        telegram_id: '12345',
        level: 1,
        aspect_ratio: '1:1',
        language_code: 'en',
      },
      error: null,
    })
    mockSupabaseInsert.mockResolvedValue({ data: {}, error: null }) // Mock for .from('videos').insert()
    mockSupabaseRpc.mockResolvedValue({ data: {}, error: null }) // Mock for .rpc()

    // Setup default mock implementations for others
    mockReplicateClient.run.mockResolvedValue(['mock-video-url.mp4'])
    mockProcessBalance.mockResolvedValue({
      success: true,
      newBalance: 95,
      paymentAmount: 5,
    })
    mockSaveVideoDirect.mockResolvedValue('/path/to/local/video.mp4')
    mockPulseHelper.mockResolvedValue(undefined)
    mockSendErrorToUser.mockResolvedValue(undefined)
    mockSendErrorToAdmin.mockResolvedValue(undefined)
    mockTelegram.sendMessage.mockResolvedValue({ message_id: 1 } as any)
    mockTelegram.sendVideo.mockResolvedValue({ message_id: 2 } as any)
    mockGenerateVideoInternal.mockResolvedValue('mock-video-url.mp4') // Setup default for internal generation

    // Assemble dependencies object for the module
    dependencies = {
      logger: mockLogger,
      supabase: mockSupabase as any, // Pass the refactored mock
      replicate: mockReplicateClient as any,
      telegram: mockTelegram as any,
      fs: mockFs,
      processBalance: mockProcessBalance,
      saveVideoDirect: mockSaveVideoDirect,
      pulse: mockPulseHelper,
      sendErrorToUser: mockSendErrorToUser,
      sendErrorToAdmin: mockSendErrorToAdmin,
      generateVideoInternal: mockGenerateVideoInternal, // Add the missing mock with correct key
      videoModelsConfig: {
        'stable-video-diffusion': {
          id: 'stability-ai/stable-video-diffusion',
          api: {
            model: 'stability-ai/stable-video-diffusion',
            input: { negative_prompt: '' },
          },
          title: 'Stable Video Diffusion',
          basePriceUSD: 0.1,
          inputType: ['text'],
          isImageInput: false,
        },
      } as any,
      pathJoin: vi.fn((...args) => args.join('/')),
      pathDirname: vi.fn(p => p.substring(0, p.lastIndexOf('/'))),
      toBotName: vi.fn(name => name),
    }
  })

  it('should successfully generate a video with valid inputs (happy path)', async () => {
    // Arrange
    const params = {
      prompt: 'a dancing cat',
      videoModel: 'stable-video-diffusion' as VideoModelId,
      telegram_id: '12345',
      username: 'testuser',
      is_ru: false,
      bot_name: 'test_bot',
      message_id: 123,
      chat_id: 456,
    }

    // Act
    const result = await generateTextToVideo(params, dependencies)

    // Assert
    expect(result).toBeDefined()
    expect(result).toHaveProperty('videoLocalPath')
    expect(result?.videoLocalPath).toBe('/path/to/local/video.mp4')

    // Verify Supabase calls
    expect(mockSupabaseFrom).toHaveBeenCalledWith('users')
    expect(mockSupabaseSelect).toHaveBeenCalledWith('level')
    expect(mockSupabaseEq).toHaveBeenCalledWith(
      'telegram_id',
      params.telegram_id
    )
    expect(mockSupabaseSingle).toHaveBeenCalledTimes(1)
    expect(mockSupabaseRpc).toHaveBeenCalledWith('increment_user_level', {
      user_tid: params.telegram_id,
    })
    expect(mockSupabaseFrom).toHaveBeenCalledWith('videos')
    expect(mockSupabaseInsert).toHaveBeenCalledTimes(1)
    expect(mockProcessBalance).toHaveBeenCalledTimes(1)
    expect(mockReplicateClient.run).toHaveBeenCalledWith(
      'stability-ai/stable-video-diffusion',
      expect.objectContaining({
        input: expect.objectContaining({
          prompt: params.prompt,
          negative_prompt: '',
        }),
      })
    )
    expect(mockSaveVideoDirect).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.any(String)
    )
    expect(mockPulseHelper).toHaveBeenCalledTimes(1)
    expect(mockSendErrorToUser).not.toHaveBeenCalled()
    expect(mockSendErrorToAdmin).not.toHaveBeenCalled()
    expect(mockLogger.error).not.toHaveBeenCalled()
    expect(mockGenerateVideoInternal).toHaveBeenCalledTimes(1) // Verify internal function was called
  })

  it('should reject and log error if user not found', async () => {
    // Arrange
    const params = {
      prompt: 'user not found test',
      telegram_id: '00000',
      videoModel: 'stable-video-diffusion' as VideoModelId,
      username: 'no_user',
      is_ru: false,
      bot_name: 'test_bot',
    } as any
    // Mock Supabase user fetch to return error/no data
    mockSupabaseSingle.mockResolvedValueOnce({
      data: null,
      error: { message: 'User not found' },
    })

    // Act & Assert
    await expect(generateTextToVideo(params, dependencies)).rejects.toThrow(
      'User with ID 00000 does not exist.'
    )

    // Verify mocks
    expect(mockSupabaseFrom).toHaveBeenCalledWith('users')
    expect(mockSupabaseSelect).toHaveBeenCalledWith('level')
    expect(mockSupabaseEq).toHaveBeenCalledWith(
      'telegram_id',
      params.telegram_id
    )
    expect(mockSupabaseSingle).toHaveBeenCalledTimes(1)
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.stringContaining('Error fetching user or user not found'),
      expect.anything()
    )
    expect(mockProcessBalance).not.toHaveBeenCalled()
    expect(mockReplicateClient.run).not.toHaveBeenCalled()
    expect(mockSendErrorToUser).toHaveBeenCalledTimes(1) // Expect error handlers called by catch block
    expect(mockSendErrorToAdmin).toHaveBeenCalledTimes(1)
  })

  it('should reject and log error if balance check fails', async () => {
    // Arrange
    const params = {
      prompt: 'low balance test',
      telegram_id: '67890',
      videoModel: 'stable-video-diffusion' as VideoModelId,
      username: 'low_user',
      is_ru: false,
      bot_name: 'test_bot',
    } as any
    mockProcessBalance.mockResolvedValueOnce({
      success: false,
      error: 'Insufficient funds',
      newBalance: 5,
    })

    // Act & Assert
    await expect(generateTextToVideo(params, dependencies)).rejects.toThrow(
      'Insufficient funds' // Or 'Failed to process balance operation' if error is null
    )

    // Verify mocks
    expect(mockSupabaseFrom).toHaveBeenCalledWith('users')
    expect(mockSupabaseSingle).toHaveBeenCalledTimes(1)
    expect(mockProcessBalance).toHaveBeenCalledTimes(1)
    expect(mockReplicateClient.run).not.toHaveBeenCalled()
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.stringContaining('Balance check failed'),
      expect.anything()
    )
    expect(mockSendErrorToUser).toHaveBeenCalledTimes(1) // Expect error handlers called by catch block
    expect(mockSendErrorToAdmin).toHaveBeenCalledTimes(1)
  })

  it('should return null and log error if replicate fails', async () => {
    // Arrange
    const params = {
      prompt: 'replicate fail test',
      telegram_id: '11223',
      videoModel: 'stable-video-diffusion' as VideoModelId,
      username: 'fail_user',
      is_ru: false,
      bot_name: 'test_bot',
    } as any
    const replicateError = new Error('Replicate API timed out')
    mockReplicateClient.run.mockRejectedValueOnce(replicateError)

    // Act
    const result = await generateTextToVideo(params, dependencies)

    // Assert
    expect(result).toBeNull()
    expect(mockSupabaseFrom).toHaveBeenCalledWith('users')
    expect(mockSupabaseSingle).toHaveBeenCalledTimes(1)
    expect(mockProcessBalance).toHaveBeenCalledTimes(1)
    expect(mockReplicateClient.run).toHaveBeenCalledTimes(1)
    expect(mockSaveVideoDirect).not.toHaveBeenCalled()
    expect(mockPulseHelper).not.toHaveBeenCalled()
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.stringContaining('Replicate run failed'),
      expect.objectContaining({ error: replicateError })
    )
    expect(mockSendErrorToUser).toHaveBeenCalledTimes(1)
    expect(mockSendErrorToAdmin).toHaveBeenCalledTimes(1)
  })

  it('should return null and log error if saveVideoDirect fails', async () => {
    // Arrange
    const params = {
      prompt: 'save fail test',
      telegram_id: '44556',
      videoModel: 'stable-video-diffusion' as VideoModelId,
      username: 'save_fail_user',
      is_ru: false,
      bot_name: 'test_bot',
    } as any
    const saveError = new Error('Disk full')
    mockSaveVideoDirect.mockRejectedValueOnce(saveError)

    // Act
    // const result = await generateTextToVideo(params, dependencies)
    // Assert
    // This test needs adjustment. The function currently calls generateVideoInternal before saveVideoDirect.
    // If saveVideoDirect is mocked to fail, the test needs to ensure generateVideoInternal is called successfully first.
    mockGenerateVideoInternal.mockResolvedValueOnce('intermediate-url.mp4') // Assume internal generation succeeds
    await expect(generateTextToVideo(params, dependencies)).rejects.toThrow(
      'Disk full'
    ) // Check if error propagates

    expect(mockGenerateVideoInternal).toHaveBeenCalledTimes(1)
    expect(mockSaveVideoDirect).toHaveBeenCalledTimes(1)
    expect(mockSupabaseInsert).not.toHaveBeenCalled()
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.stringContaining('Error in generateTextToVideo:'), // Check catch block message
      expect.objectContaining({ name: 'Error', message: 'Disk full' })
    )
    expect(mockSendErrorToUser).toHaveBeenCalledTimes(1)
    expect(mockSendErrorToAdmin).toHaveBeenCalledTimes(1)
  })

  it('should handle Supabase insert error gracefully', async () => {
    // Arrange
    const params = {
      prompt: 'supabase insert fail',
      telegram_id: '77889',
      videoModel: 'stable-video-diffusion' as VideoModelId, // Add missing videoModel
      username: 'insert_fail_user', // Add missing username
      is_ru: false,
      bot_name: 'test_bot',
    } as any
    const insertError = { message: 'DB connection error' }
    mockSupabaseInsert.mockResolvedValueOnce({ data: null, error: insertError })

    // Act
    const result = await generateTextToVideo(params, dependencies)

    // Assert
    // The function might still succeed locally, but log an error
    expect(result).toBeDefined()
    expect(result).toHaveProperty('videoLocalPath') // Video was generated and saved locally
    expect(mockSupabaseInsert).toHaveBeenCalledTimes(1)
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.stringContaining('Error saving video URL to Supabase'),
      expect.objectContaining({ saveError: insertError })
    )
    expect(mockPulseHelper).toHaveBeenCalledTimes(1) // Pulse might still run
    expect(mockSendErrorToUser).not.toHaveBeenCalled() // This specific error might not notify user
    expect(mockSendErrorToAdmin).not.toHaveBeenCalled() // Or admin
  })

  // TODO: Add more tests for:
  // - Different video models
  // - Errors during Supabase RPC call (increment_user_level)
  // - Errors during pulse helper
  // - Cases with is_ru = true (if logic differs)
})
