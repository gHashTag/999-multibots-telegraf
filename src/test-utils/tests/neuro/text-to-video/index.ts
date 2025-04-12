// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { TEST_CONFIG } from './test-config'
import { logger } from '@/utils/logger'
import { inngest } from '@/core/inngest/clients'
import { ModeEnum } from './price/types/modes'
import { v4 as uuidv4 } from 'uuid'

interface TextToVideoTestCase {
  description: string
  input: {
    prompt: string
    videoModel: string
    telegram_id: string
    username: string
    is_ru: boolean
    bot_name: string
  }
  expectedOutput: {
    success: boolean
    error?: string
  }
}

const testCases: TextToVideoTestCase[] = [
  {
    description: '🎯 Успешная генерация видео',
    input: {
      prompt: 'A beautiful sunset over the ocean',
      videoModel: 'zeroscope_v2_xl',
      telegram_id: '123456789',
      username: 'test_user',
      is_ru: false,
      bot_name: 'test_bot',
    },
    expectedOutput: {
      success: true,
    },
  },
  {
    description: '🎯 Ошибка - пустой промпт',
    input: {
      prompt: '',
      videoModel: 'zeroscope_v2_xl',
      telegram_id: '123456789',
      username: 'test_user',
      is_ru: false,
      bot_name: 'test_bot',
    },
    expectedOutput: {
      success: false,
      error: 'Prompt is required',
    },
  },
]

export const runTextToVideoTests = async () => {
  logger.info('🚀 Запуск тестов text-to-video', {
    description: 'Starting text-to-video tests',
    test_count: testCases.length,
  })

  for (const testCase of testCases) {
    try {
      logger.info(`🔍 Тестовый сценарий: ${testCase.description}`, {
        description: 'Running test case',
        input: testCase.input,
      })

      const eventId = `test-text-to-video-${Date.now()}-${uuidv4()}`

      // Отправляем событие в Inngest
      await inngest.send({
        id: eventId,
        name: 'text-to-video/generate',
        data: {
          ...testCase.input,
          mode: ModeEnum.TextToVideo,
        },
      })

      logger.info('✅ Тест успешно выполнен', {
        description: 'Test completed successfully',
        eventId,
      })
    } catch (error) {
      logger.error('❌ Ошибка в тесте', {
        description: 'Test failed',
        error: error instanceof Error ? error.message : 'Unknown error',
        test_case: testCase.description,
      })
    }
  }
}
