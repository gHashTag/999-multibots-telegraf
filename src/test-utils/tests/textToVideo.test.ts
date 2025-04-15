import { inngest } from '@/inngest-functions/clients'
import { textToVideoFunction } from '@/inngest-functions/textToVideo.inngest'
import { InngestTestEngine } from '@inngest/test'
import { mockSupabase } from '../mocks/supabase'
import { mockBotInstance } from '../mocks/botMock'
import { VIDEO_MODELS_CONFIG } from '@/menu/videoModelMenu'
import axios from 'axios'
import { describe, expect, it } from '@jest/globals'
import { TextToVideoResult } from '@/interfaces/textToVideo.interface'
import { createTestEvent, createTestExecutionContext } from '@inngest/test'
import { executeTest } from '@/test-utils/inngest'

// Mock axios
jest.mock('axios')
const mockedAxios = axios as jest.Mocked<typeof axios>

interface TestResult {
  success: boolean
  videoUrl?: string
  error?: string
}

describe('textToVideoFunction', () => {
  const testUser = {
    telegram_id: '123456789',
    username: 'testuser',
    is_ru: false,
    bot_name: 'test_bot',
    level: 9,
    balance: 1000,
  }

  const testEvent = {
    name: 'text-to-video.requested',
    data: {
      prompt: 'A beautiful sunset over the ocean',
      telegram_id: testUser.telegram_id,
      is_ru: testUser.is_ru,
      bot_name: testUser.bot_name,
      model_id: Object.keys(VIDEO_MODELS_CONFIG)[0],
      aspect_ratio: '16:9',
      duration: 6,
      username: testUser.username,
    },
  }

  const testEngine = new InngestTestEngine()

  beforeEach(() => {
    jest.clearAllMocks()
    mockSupabase.setUserBalance(testUser.balance)
    mockBotInstance.telegram.sendMessage.mockClear()
    mockBotInstance.telegram.sendVideo.mockClear()
  })

  afterEach(() => {
    jest.clearAllMocks()
    mockSupabase.reset()
  })

  it('should process video generation successfully', async () => {
    const result = await executeTest<TextToVideoResult>(
      textToVideoFunction,
      'text.to.video',
      {
        prompt: 'test prompt',
        videoModel: 'test_model',
        telegram_id: 123456,
        username: 'testuser',
        is_ru: false,
        bot_name: 'test_bot',
      }
    )

    expect(result.success).toBe(true)
    expect(result.videoUrl).toBeDefined()
  })

  it('should handle insufficient balance', async () => {
    mockSupabase.setUserBalance(0)

    const { result } = await testEngine.execute({
      events: [
        {
          ...testEvent,
          data: {
            ...testEvent.data,
            _test: { insufficient_balance: true },
          },
        },
      ],
    })

    expect(result.success).toBe(false)
    expect(result.error).toContain('insufficient balance')
    expect(mockBotInstance.telegram.sendVideo).not.toHaveBeenCalled()
  })

  it('should handle API error', async () => {
    const { result } = await testEngine.execute({
      events: [
        {
          ...testEvent,
          data: {
            ...testEvent.data,
            _test: { api_error: true },
          },
        },
      ],
    })

    expect(result.success).toBe(false)
    expect(result.error).toBeDefined()
    expect(mockBotInstance.telegram.sendVideo).not.toHaveBeenCalled()
  })

  it('should handle invalid parameters', async () => {
    const { result } = await testEngine.execute({
      events: [
        {
          ...testEvent,
          data: {
            // Missing required fields
            telegram_id: testUser.telegram_id,
          },
        },
      ],
    })

    expect(result.success).toBe(false)
    expect(result.error).toContain('Missing required fields')
    expect(mockBotInstance.telegram.sendVideo).not.toHaveBeenCalled()
  })

  it('should handle unsupported model', async () => {
    const { result } = await testEngine.execute({
      events: [
        {
          ...testEvent,
          data: {
            ...testEvent.data,
            model_id: 'unsupported-model',
          },
        },
      ],
    })

    expect(result.success).toBe(false)
    expect(result.error).toContain('does not support text input')
    expect(mockBotInstance.telegram.sendVideo).not.toHaveBeenCalled()
  })
})
