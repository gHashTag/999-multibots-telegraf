/**
 * Конфигурация для тестирования различных компонентов системы
 */

import { PaymentStatus } from '@/core/supabase/updatePaymentStatus'
import { config } from 'dotenv'
config({ path: '.env.test' })

export const TEST_CONFIG = {
  // Базовая конфигурация
  server: {
    apiUrl: 'http://localhost:2999',
    webhookPath: '/api/webhook',
    webhookUrl: 'http://localhost:2999/api/webhook',
    inngestUrl: 'http://localhost:2999/api/inngest',
    inngestDevUrl: 'http://localhost:8288',
    bflWebhookPath: '/api/bfl-webhook',
    neurophotoWebhookPath: '/api/neurophoto-webhook',
  },

  // Тестовые данные пользователей
  user: {
    telegramId: '123456789',
    voiceId: 'test_voice_id',
    botName: 'test_bot',
    isRussian: true,
  },

  // Тестовые данные для бота
  bot: {
    name: 'test_bot',
    token: process.env.BOT_TOKEN_TEST_1,
  },

  // Тестовые данные для тренировки моделей
  training: {
    samples: [
      {
        text: 'Test sample 1',
        status: 'completed',
        metrics: {
          accuracy: 0.95,
          loss: 0.05,
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

  // Тестовые данные для text-to-video
  textToVideo: {
    samples: [
      {
        task_id: 'text-to-video-success',
        status: 'COMPLETED',
        result: {
          video_url: 'https://example.com/test-video.mp4',
          prompt: 'A beautiful sunset over the ocean',
          model: 'zeroscope_v2_xl',
        },
      },
      {
        task_id: 'text-to-video-processing',
        status: 'processing',
      },
      {
        task_id: 'text-to-video-failed',
        status: 'failed',
        error: 'Model processing error',
      },
    ],
  },

  // Тестовые данные для вебхуков видео
  videoWebhook: {
    samples: [
      {
        id: 'video-webhook-success',
        status: 'success',
        output: 'https://example.com/test-video.mp4',
        telegram_id: 'test_user_123',
        bot_name: 'test_bot',
        is_ru: true,
        videoModel: 'test_model',
        prompt: 'Test video generation prompt',
      },
      {
        id: 'video-webhook-failed',
        status: 'failed',
        error: 'Test error message',
        telegram_id: 'test_user_123',
        bot_name: 'test_bot',
        is_ru: true,
        videoModel: 'test_model',
        prompt: 'Failed test video generation prompt',
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

  paymentStatus: {
    success: 'success',
    failed: 'failed',
    pending: 'pending',
  },

  INNGEST_DEV_URL: 'http://localhost:8288',
  INNGEST_EVENT_KEY: 'test-key',
  NODE_ENV: 'test',
  SUPABASE_URL: process.env.SUPABASE_URL || '',
  SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_KEY || '',
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',
  TELEGRAM_BOT_TOKENS: {
    neuro_blogger_bot: process.env.TELEGRAM_BOT_TOKEN_NEURO_BLOGGER || '',
    MetaMuse_Manifest_bot: process.env.TELEGRAM_BOT_TOKEN_META_MUSE || '',
    ZavaraBot: process.env.TELEGRAM_BOT_TOKEN_ZAVARA || '',
    LeeSolarbot: process.env.TELEGRAM_BOT_TOKEN_LEE_SOLAR || '',
    NeuroLenaAssistant_bot: process.env.TELEGRAM_BOT_TOKEN_NEURO_LENA || '',
    NeurostylistShtogrina_bot:
      process.env.TELEGRAM_BOT_TOKEN_NEURO_STYLIST || '',
    Gaia_Kamskaia_bot: process.env.TELEGRAM_BOT_TOKEN_GAIA || '',
    ai_koshey_bot: process.env.TELEGRAM_BOT_TOKEN_KOSHEY || '',
    clip_maker_neuro_bot: process.env.TELEGRAM_BOT_TOKEN_CLIP_MAKER || '',
  },
} as const

export type TestConfig = typeof TEST_CONFIG
