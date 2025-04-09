import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { inngest } from '@/inngest-functions/clients'
import { imageToVideoFunction } from '@/inngest-functions/imageToVideo.inngest'
import { createTestUser } from '../helpers/createTestUser'
import { createMockContext } from '../helpers/createMockContext'
import { mockSupabase } from '../mocks/supabase'
import { mockBotInstance } from '../mocks/botMock'
import { VIDEO_MODELS_CONFIG } from '@/menu/videoModelMenu'
import axios from 'axios'
import { vi } from 'vitest'

vi.mock('axios')
const mockedAxios = axios as jest.Mocked<typeof axios>

describe('imageToVideoFunction', () => {
  const testUser = {
    telegram_id: '123456789',
    username: 'testuser',
    is_ru: false,
    bot_name: 'test_bot',
  }

  const testEvent = {
    name: 'image/video',
    data: {
      imageUrl: 'https://example.com/image.jpg',
      prompt: 'test prompt',
      videoModel: Object.keys(VIDEO_MODELS_CONFIG)[0],
      telegram_id: testUser.telegram_id,
      username: testUser.username,
      is_ru: testUser.is_ru,
      bot_name: testUser.bot_name,
      description: 'Test video generation',
    },
  }

  beforeEach(async () => {
    vi.clearAllMocks()
    await createTestUser(testUser)
    mockBotInstance.telegram.sendMessage.mockClear()
    mockBotInstance.telegram.sendVideo.mockClear()
  })

  afterEach(() => {
    vi.clearAllMocks()
    mockSupabase.reset()
  })

  it('should successfully process video generation', async () => {
    // Mock successful API responses
    mockedAxios.post.mockResolvedValueOnce({
      data: { id: 'test-prediction-id' },
    })
    mockedAxios.get.mockResolvedValueOnce({
      data: { status: 'succeeded', output: 'https://example.com/video.mp4' },
    })

    // Set initial balance
    mockSupabase.setUserBalance(1000)

    const result = await inngest.test(imageToVideoFunction).run(testEvent)

    expect(result.error).toBeUndefined()
    expect(mockBotInstance.telegram.sendMessage).toHaveBeenCalledWith(
      testUser.telegram_id,
      '🎬 Starting video generation...\nThis may take a few minutes.'
    )
    expect(mockBotInstance.telegram.sendVideo).toHaveBeenCalledWith(
      testUser.telegram_id,
      'https://example.com/video.mp4'
    )
  })

  it('should handle insufficient balance', async () => {
    // Set low balance
    mockSupabase.setUserBalance(0)

    const result = await inngest.test(imageToVideoFunction).run(testEvent)

    expect(mockBotInstance.telegram.sendMessage).toHaveBeenCalledWith(
      testUser.telegram_id,
      'Insufficient funds. Top up your balance by calling the /buy command.'
    )
    expect(mockBotInstance.telegram.sendVideo).not.toHaveBeenCalled()
  })

  it('should handle API errors', async () => {
    // Mock API error
    mockedAxios.post.mockRejectedValueOnce(new Error('API Error'))

    // Set sufficient balance
    mockSupabase.setUserBalance(1000)

    const result = await inngest.test(imageToVideoFunction).run(testEvent)

    expect(result.error).toBeDefined()
    expect(mockBotInstance.telegram.sendMessage).toHaveBeenCalledWith(
      testUser.telegram_id,
      '❌ An error occurred while generating the video. Please try again later.'
    )
    expect(mockBotInstance.telegram.sendVideo).not.toHaveBeenCalled()
  })

  it('should handle video generation timeout', async () => {
    // Mock timeout scenario
    mockedAxios.post.mockResolvedValueOnce({
      data: { id: 'test-prediction-id' },
    })
    
    // Mock status checks to always return 'processing'
    for (let i = 0; i < 60; i++) {
      mockedAxios.get.mockResolvedValueOnce({
        data: { status: 'processing' },
      })
    }

    // Set sufficient balance
    mockSupabase.setUserBalance(1000)

    const result = await inngest.test(imageToVideoFunction).run(testEvent)

    expect(result.error).toBeDefined()
    expect(mockBotInstance.telegram.sendMessage).toHaveBeenCalledWith(
      testUser.telegram_id,
      '❌ An error occurred while generating the video. Please try again later.'
    )
    expect(mockBotInstance.telegram.sendVideo).not.toHaveBeenCalled()
  })

  it('should handle invalid video model', async () => {
    const invalidEvent = {
      ...testEvent,
      data: {
        ...testEvent.data,
        videoModel: 'invalid_model',
      },
    }

    const result = await inngest.test(imageToVideoFunction).run(invalidEvent)

    expect(mockBotInstance.telegram.sendMessage).toHaveBeenCalledWith(
      testUser.telegram_id,
      'Invalid model'
    )
    expect(mockBotInstance.telegram.sendVideo).not.toHaveBeenCalled()
  })

  it('should handle missing required fields', async () => {
    const invalidEvent = {
      ...testEvent,
      data: {
        telegram_id: testUser.telegram_id,
        // Missing other required fields
      },
    }

    const result = await inngest.test(imageToVideoFunction).run(invalidEvent)

    expect(result.error).toBeDefined()
    expect(result.error.message).toBe('Missing required fields')
  })
}) 