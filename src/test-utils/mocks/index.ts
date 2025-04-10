import { Telegraf } from 'telegraf'
import { MyContext } from '@/interfaces'
import mock from '@/test-utils/core/mock'

// Mock для getBotByName
export const mockBot = {
  telegram: {
    sendMessage: mock.create(),
    sendVideo: mock.create()
  }
}

mock.object({
  getBotByName: (botName: string) => {
    if (botName === 'nonexistent_bot') {
      return { bot: null }
    }
    return { bot: mockBot }
  }
})

// Mock для баланса пользователя
mock.object({
  getUserBalance: async (telegramId: string) => {
    if (telegramId === '123456') {
      return 1000 // Достаточный баланс для обычных операций
    }
    return 10 // Недостаточный баланс
  },
  updateUserBalance: mock.create()
})

// Mock для конфигурации видео моделей
mock.object({
  VIDEO_MODELS_CONFIG: {
    test_model: {
      id: 'test_model',
      basePrice: 100,
      api: {
        model: 'test_model_v1',
        input: {}
      }
    },
    expensive_model: {
      id: 'expensive_model',
      basePrice: 2000,
      api: {
        model: 'expensive_model_v1',
        input: {}
      }
    },
    multi_output_model: {
      id: 'multi_output_model',
      basePrice: 150,
      api: {
        model: 'multi_output_model_v1',
        input: {}
      }
    }
  }
})

// Mock для axios
mock.object({
  post: async (url: string, data: any, config: any) => {
    if (data._test?.api_error) {
      throw new Error('API error (test)')
    }
    if (data._test?.timeout) {
      throw new Error('Video generation timed out')
    }
    if (data.videoModel === 'multi_output_model') {
      return {
        data: {
          id: 'test_prediction',
          output: ['video1.mp4', 'video2.mp4']
        }
      }
    }
    return {
      data: {
        id: 'test_prediction',
        output: 'video.mp4'
      }
    }
  },
  get: async (url: string, config: any) => {
    return {
      data: {
        status: 'succeeded',
        output: 'video.mp4'
      }
    }
  }
});