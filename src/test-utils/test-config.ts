/**
 * Конфигурация для тестирования различных компонентов системы
 */

import { PaymentStatus } from '@/core/supabase/updatePaymentStatus'
import { logger } from '@/utils/logger'
import { Telegraf } from 'telegraf'
import { MyContext } from '@/interfaces'

const mockBot = {
  telegram: {
    sendMessage: async () => {
      logger.info({
        message: '🤖 Mock: Отправка сообщения',
        description: 'Mock: Sending message',
      })
      return true
    },
    sendAudio: async () => {
      logger.info({
        message: '🎵 Mock: Отправка аудио',
        description: 'Mock: Sending audio',
      })
      return true
    },
    sendPhoto: async () => {
      logger.info({
        message: '📸 Mock: Отправка фото',
        description: 'Mock: Sending photo',
      })
      return true
    },
    sendVideo: async () => {
      logger.info({
        message: '🎥 Mock: Отправка видео',
        description: 'Mock: Sending video',
      })
      return true
    },
  },
  options: {},
  context: {},
  webhookFilter: () => true,
  handleError: () => Promise.resolve(),
  command: () => {
    logger.info({
      message: '🎯 Mock: Регистрация команды',
      description: 'Mock: Command registration',
    })
    return mockBot
  },
  on: () => {
    logger.info({
      message: '👂 Mock: Подписка на событие',
      description: 'Mock: Event subscription',
    })
    return mockBot
  },
  start: () => {
    logger.info({
      message: '🚀 Mock: Команда start',
      description: 'Mock: Start command',
    })
    return mockBot
  },
  help: () => {
    logger.info({
      message: '❓ Mock: Команда help',
      description: 'Mock: Help command',
    })
    return mockBot
  },
  settings: () => mockBot,
  catch: () => mockBot,
  use: () => mockBot,
  launch: async () => {
    logger.info({
      message: '🚀 Mock: Запуск бота',
      description: 'Mock: Bot launch',
    })
  },
  stop: async () => {
    logger.info({
      message: '🛑 Mock: Остановка бота',
      description: 'Mock: Bot stop',
    })
  },
  botInfo: {},
} as unknown as Telegraf<MyContext>

export const TEST_CONFIG = {
  // Базовая конфигурация
  server: {
    apiUrl: 'http://localhost:2999',
    webhookPath: '/webhooks/replicate',
    bflWebhookPath: '/webhooks/bfl',
    neurophotoWebhookPath: '/webhooks/neurophoto',
  },

  // Тестовые данные пользователей
  users: {
    main: {
      telegramId: '123456789',
      botName: 'test_bot',
      isRussian: true,
    },
    default: {
      telegramId: '144022504',
      voiceId: 'test-voice-id',
      isRussian: true,
      botName: 'test_bot',
    },
  },

  // Тестовые данные для бота
  bots: {
    default: 'neuro_blogger_bot',
  },

  // Тестовые данные для тренировки моделей
  modelTraining: {
    samples: [
      {
        trainingId: 'kvb60ecsf9rme0cntzqrhca1y4',
        modelName: 'test_model_1',
        status: 'SUCCESS',
        outputUrl:
          'https://replicate.delivery/xezq/output-model/trained_model.tar',
        version: 'ghashtag/neuro_sage:af5678e9a7b6552f3f8c6875e5e9f1c3f7d5f1e8',
        metrics: {
          predict_time: 7230.5,
        },
      },
      {
        trainingId: 'failed-training-id',
        modelName: 'test_model_2',
        status: 'failed',
        error: 'Not enough training images',
        metrics: {
          predict_time: 120.5,
        },
      },
      {
        trainingId: 'canceled-training-id',
        modelName: 'test_model_3',
        status: 'canceled',
        metrics: {
          predict_time: 45.2,
        },
      },
    ],
  },

  // Тестовые данные для BFL тренировок
  bflTraining: {
    samples: [
      {
        task_id: 'bfl-task-123456',
        status: 'COMPLETED',
        result: JSON.stringify({
          model_id: 'bfl-model-123',
          model_name: 'test_bfl_model',
          version: '1.0.0',
        }),
      },
      {
        task_id: 'bfl-task-error',
        status: 'ERROR',
        result: JSON.stringify({
          error: 'Training failed due to insufficient data',
          details: 'Minimum of 10 samples required',
        }),
      },
      {
        task_id: 'bfl-task-pending',
        status: 'PENDING',
        result: null,
      },
    ],
  },

  // Тестовые данные для нейрофото
  neurophoto: {
    samples: [
      {
        task_id: 'neurophoto-success-test',
        status: 'COMPLETED',
        result: {
          sample: 'https://example.com/test-image.jpg',
          seed: 123456,
          prompt: 'Тестовый промпт для нейрофото',
        },
      },
      {
        task_id: 'neurophoto-processing-test',
        status: 'processing',
      },
      {
        task_id: 'neurophoto-moderated-test',
        status: 'Content Moderated',
      },
    ],
  },

  // Настройки для инструментов тестирования
  options: {
    retryAttempts: 3,
    retryDelay: 1000,
    timeout: 5000,
  },

  TEST_USER_ID: '144022504',
  TEST_BOT_NAME: 'test_bot',

  PAYMENT_STATUS: {
    PENDING: 'PENDING' as PaymentStatus,
    COMPLETED: 'COMPLETED' as PaymentStatus,
    FAILED: 'FAILED' as PaymentStatus,
  },

  mocks: {
    bot: mockBot,
  },
}
