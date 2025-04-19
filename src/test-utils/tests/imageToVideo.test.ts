// Mock fetch
const mockFetch = jest.fn(() =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ output: ['https://example.com/video.mp4'] }),
  })
)

// @ts-ignore
global.fetch = mockFetch

// Mock Supabase config
jest.mock('@/config', () => ({
  SUPABASE_URL: 'http://localhost:54321',
  SUPABASE_SERVICE_KEY: 'test-service-key',
  SUPABASE_SERVICE_ROLE_KEY: 'test-role-key',
}))

// Mock ModeEnum and getModelPrice
jest.mock('@/price/helpers/modelsCost', () => ({
  ModeEnum: {
    ImageToVideo: 'image_to_video',
  },
  getModelPrice: jest.fn().mockReturnValue(100),
}))

// Mock calculateFinalPrice
jest.mock('@/price/helpers/calculateFinalPrice', () => ({
  calculateFinalPrice: jest.fn().mockReturnValue(100),
}))

import { describe, it, expect, beforeEach, jest } from '@jest/globals'
import { createTestEngine, executeTest, InngestEvent } from '../inngest'
import { imageToVideoFunction } from '@/inngest-functions/imageToVideo.inngest'
import { mockSupabase } from '../mocks/supabase'
import { ImageToVideoResult } from '@/interfaces/imageToVideo.interface'
import { ImageToVideoEvent } from '@/inngest-functions/imageToVideo.inngest'
import { User } from '../mocks/types'
import { ModeEnum } from '@/interfaces/modes'
import { VIDEO_MODELS_CONFIG } from '@/menu/videoModelMenu'
import { MockSupabaseClient } from '../mocks/types'
import { Telegraf } from 'telegraf'

// Mock VIDEO_MODELS_CONFIG
jest.mock('@/menu/videoModelMenu', () => ({
  VIDEO_MODELS_CONFIG: {
    minimax: {
      id: 'image_to_video',
      name: 'Minimax',
      api: {
        model: 'minimax-model',
        input: {},
      },
    },
  },
}))

// Mock the bot instance
jest.mock('@/core/bot', () => ({
  getBotByName: () => ({
    success: true,
    bot: new Telegraf('fake-token'),
  }),
}))

describe('imageToVideoFunction', () => {
  const testUser: Required<User> = {
    id: '1',
    telegram_id: '12345',
    username: 'testuser',
    is_ru: false,
    bot_name: 'test_bot',
    balance: 1000,
    subscription_end_date: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }

  beforeEach(async () => {
    mockSupabase.reset()
    await mockSupabase.createUser(testUser)
  })

  const defaultEvent: InngestEvent<ImageToVideoEvent['data']> = {
    name: 'image/video',
    data: {
      imageUrl: 'https://example.com/image.jpg',
      prompt: 'test prompt',
      videoModel: 'minimax',
      telegram_id: testUser.telegram_id,
      username: testUser.username,
      is_ru: testUser.is_ru,
      bot_name: testUser.bot_name,
      description: 'Test video generation',
    },
    ts: Date.now(),
    id: 'test-id',
  }

  it('should successfully generate video with sufficient balance', async () => {
    const engine = createTestEngine(imageToVideoFunction)
    const result = await executeTest<
      ImageToVideoEvent['data'],
      ImageToVideoResult
    >(engine, defaultEvent)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.videoUrl).toBeDefined()
      expect(result.modePrice).toBeGreaterThan(0)
      expect(result.newBalance).toBeDefined()
    }
  })

  it('should handle insufficient balance', async () => {
    await mockSupabase.setUserBalance(testUser.telegram_id, 0)

    const engine = createTestEngine(imageToVideoFunction)
    const result = await executeTest<
      ImageToVideoEvent['data'],
      ImageToVideoResult
    >(engine, defaultEvent)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toContain('Insufficient funds')
      expect(result.modePrice).toBeGreaterThan(0)
      expect(result.newBalance).toBe(0)
    }
  })

  it('should handle invalid video model', async () => {
    const event: InngestEvent<ImageToVideoEvent['data']> = {
      ...defaultEvent,
      data: {
        ...defaultEvent.data,
        videoModel: 'nonexistent_model',
      },
    }

    const engine = createTestEngine(imageToVideoFunction)
    const result = await executeTest<
      ImageToVideoEvent['data'],
      ImageToVideoResult
    >(engine, event)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toBe('Invalid model')
      expect(result.modePrice).toBe(0)
    }
  })

  it('should handle API errors', async () => {
    const event: InngestEvent<ImageToVideoEvent['data']> = {
      ...defaultEvent,
      data: {
        ...defaultEvent.data,
        _test: { api_error: true },
      },
    }

    const engine = createTestEngine(imageToVideoFunction)
    const result = await executeTest<
      ImageToVideoEvent['data'],
      ImageToVideoResult
    >(engine, event)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toBe('API Error')
    }
  })

  it('should handle timeout errors', async () => {
    const event: InngestEvent<ImageToVideoEvent['data']> = {
      ...defaultEvent,
      data: {
        ...defaultEvent.data,
        _test: { timeout: true },
      },
    }

    const engine = createTestEngine(imageToVideoFunction)
    const result = await executeTest<
      ImageToVideoEvent['data'],
      ImageToVideoResult
    >(engine, event)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toBe('Video generation timed out')
    }
  })

  it('should handle multiple video outputs', async () => {
    const event: InngestEvent<ImageToVideoEvent['data']> = {
      ...defaultEvent,
      data: {
        ...defaultEvent.data,
        _test: { multiple_outputs: true },
      },
    }

    const engine = createTestEngine(imageToVideoFunction)
    const result = await executeTest<
      ImageToVideoEvent['data'],
      ImageToVideoResult
    >(engine, event)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(Array.isArray(result.videoUrl)).toBe(true)
      expect(result.videoUrl).toHaveLength(2)
    }
  })

  it('should handle missing required fields', async () => {
    const event: InngestEvent<Partial<ImageToVideoEvent['data']>> = {
      name: 'image/video',
      data: {
        // Missing required fields
        prompt: 'Test prompt',
        telegram_id: testUser.telegram_id,
      },
    }

    const engine = createTestEngine(imageToVideoFunction)
    const result = await executeTest<
      ImageToVideoEvent['data'],
      ImageToVideoResult
    >(engine, event as InngestEvent<ImageToVideoEvent['data']>)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toBe('Missing required fields')
      expect(result.modePrice).toBe(0)
    }
  })
})
