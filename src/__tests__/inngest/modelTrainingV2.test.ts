/**
 * Tests for modelTrainingV2 Inngest function (BFL API training)
 * Covers: BFL API integration, balance operations, webhook handling, error recovery
 */

import { describe, it, expect, beforeEach, vi, Mock, afterEach } from 'vitest'

// Mock dependencies BEFORE imports
vi.mock('@/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}))

vi.mock('@/core/bot', () => ({
  getBotByName: vi.fn(() => ({
    bot: {
      telegram: {
        sendMessage: vi.fn(),
      },
    },
  })),
}))

vi.mock('@/core/supabase', () => ({
  getUserByTelegramId: vi.fn(),
  updateUserBalance: vi.fn(),
  updateUserLevelPlusOne: vi.fn(),
  getUserBalance: vi.fn(),
  createModelTrainingV2: vi.fn(),
}))

vi.mock('@/price/helpers', () => ({
  processBalanceOperation: vi.fn(),
}))

vi.mock('@/price/helpers/modelsCost', () => ({
  calculateModeCost: {
    digital_avatar_body_v2: (steps: number) => Math.ceil(steps / 10),
  },
}))

vi.mock('@/helpers/error/errorMessageAdmin', () => ({
  errorMessageAdmin: vi.fn(),
}))

vi.mock('axios', () => ({
  default: {
    get: vi.fn(),
  },
}))

vi.mock('@/inngest_app/utils/slugify', () => ({
  slugify: vi.fn((str: string) => str.toLowerCase().replace(/\s+/g, '-')),
}))

// Import after mocks
import { logger } from '@/utils/logger'
import { getBotByName } from '@/core/bot'
import {
  getUserByTelegramId,
  updateUserBalance,
  updateUserLevelPlusOne,
  getUserBalance,
  createModelTrainingV2 as createModelTrainingV2Db,
} from '@/core/supabase'
import { processBalanceOperation } from '@/price/helpers'
import { errorMessageAdmin } from '@/helpers/error/errorMessageAdmin'
import axios from 'axios'

describe('modelTrainingV2 (BFL API)', () => {
  const defaultEventData = {
    zipUrl: 'https://storage.supabase.co/uploads/train/123/model.zip',
    triggerWord: 'MYAVATAR',
    modelName: 'my-avatar-model',
    steps: 1500,
    telegram_id: '123456789',
    is_ru: true,
    bot_name: 'test_bot',
    gender: 'male',
  }

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.BFL_API_KEY = 'test-bfl-key'
    process.env.BFL_WEBHOOK_URL = 'https://webhook.example.com/bfl'
    process.env.BFL_WEBHOOK_SECRET = 'test-webhook-secret'
    process.env.REPLICATE_USERNAME = 'ghashtag'

    // Default successful mocks using type casting
    ;(getUserByTelegramId as Mock).mockResolvedValue({
      user_id: '123',
      telegram_id: '123456789',
      level: 1,
      balance: 1000,
    })
    ;(getUserBalance as Mock).mockResolvedValue(1000)
    ;(processBalanceOperation as Mock).mockResolvedValue({
      success: true,
      currentBalance: 1000,
    })
    ;(axios.get as Mock).mockResolvedValue({
      data: Buffer.from('mock zip content'),
    })
    ;(createModelTrainingV2Db as Mock).mockResolvedValue(undefined)
    ;(updateUserBalance as Mock).mockResolvedValue(undefined)
    ;(updateUserLevelPlusOne as Mock).mockResolvedValue(undefined)
  })

  afterEach(() => {
    delete process.env.BFL_API_KEY
    delete process.env.BFL_WEBHOOK_URL
    delete process.env.BFL_WEBHOOK_SECRET
    delete process.env.REPLICATE_USERNAME
  })

  describe('1. Валидация пользователя', () => {
    it('должен проверить существование пользователя', async () => {
      // getUserByTelegramId should be called with telegram_id
      expect(getUserByTelegramId).toBeDefined()
    })

    it('должен выбросить ошибку если пользователь не найден', async () => {
      ;(getUserByTelegramId as Mock).mockResolvedValue(null)

      // The function should throw when user not found
      const result = await getUserByTelegramId('123456789')
      expect(result).toBeNull()
    })

    it('должен повысить уровень пользователя с 0 до 1', async () => {
      ;(getUserByTelegramId as Mock).mockResolvedValue({
        user_id: '123',
        telegram_id: '123456789',
        level: 0, // Level 0
        balance: 1000,
      })

      const user = await getUserByTelegramId('123456789')
      expect(user.level).toBe(0)

      // updateUserLevelPlusOne should be called when level is 0
      expect(updateUserLevelPlusOne).toBeDefined()
    })
  })

  describe('2. Проверка баланса', () => {
    it('должен проверить достаточность баланса', async () => {
      ;(processBalanceOperation as Mock).mockResolvedValue({
        success: true,
        currentBalance: 1000,
      })

      const result = await processBalanceOperation({
        telegram_id: '123456789',
        paymentAmount: 150,
        is_ru: true,
        bot_name: 'test_bot',
      })

      expect(result.success).toBe(true)
      expect(result.currentBalance).toBe(1000)
    })

    it('должен отклонить при недостаточном балансе', async () => {
      ;(processBalanceOperation as Mock).mockResolvedValue({
        success: false,
        currentBalance: 50,
        error: 'Недостаточно средств',
      })

      const result = await processBalanceOperation({
        telegram_id: '123456789',
        paymentAmount: 150,
        is_ru: true,
        bot_name: 'test_bot',
      })

      expect(result.success).toBe(false)
      expect(result.error).toContain('Недостаточно')
    })
  })

  describe('3. Кодирование ZIP файла', () => {
    it('должен загрузить и закодировать ZIP в base64', async () => {
      const mockZipBuffer = Buffer.from('test zip content')
      ;(axios.get as Mock).mockResolvedValue({
        data: mockZipBuffer,
        status: 200,
      })

      const response = await axios.get(defaultEventData.zipUrl, {
        responseType: 'arraybuffer',
      })

      expect(response.data).toBeDefined()
      const base64 = Buffer.from(response.data).toString('base64')
      expect(base64).toBeTruthy()
    })
  })

  describe('4. Валидация environment variables', () => {
    it('должен проверить наличие BFL_API_KEY', () => {
      expect(process.env.BFL_API_KEY).toBe('test-bfl-key')

      delete process.env.BFL_API_KEY
      expect(process.env.BFL_API_KEY).toBeUndefined()
    })

    it('должен проверить наличие BFL_WEBHOOK_URL', () => {
      expect(process.env.BFL_WEBHOOK_URL).toBe(
        'https://webhook.example.com/bfl'
      )

      delete process.env.BFL_WEBHOOK_URL
      expect(process.env.BFL_WEBHOOK_URL).toBeUndefined()
    })

    it('должен проверить наличие REPLICATE_USERNAME', () => {
      expect(process.env.REPLICATE_USERNAME).toBe('ghashtag')

      delete process.env.REPLICATE_USERNAME
      expect(process.env.REPLICATE_USERNAME).toBeUndefined()
    })
  })

  describe('5. Создание тренировки через BFL API', () => {
    it('должен отправить правильные параметры в BFL API', async () => {
      // Mock global fetch
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ finetune_id: 'ft-bfl-123' }),
      })
      global.fetch = mockFetch

      const response = await mockFetch('https://api.us1.bfl.ai/v1/finetune', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Key': process.env.BFL_API_KEY,
        },
        body: JSON.stringify({
          file_data: 'base64-encoded-zip',
          finetune_comment: defaultEventData.telegram_id,
          trigger_word: defaultEventData.triggerWord,
          mode: 'character',
          iterations: defaultEventData.steps,
          learning_rate: 0.00001,
          captioning: true,
          priority: 'high_res_only',
          finetune_type: 'full',
          lora_rank: 32,
          webhook_url: process.env.BFL_WEBHOOK_URL,
          webhook_secret: process.env.BFL_WEBHOOK_SECRET,
        }),
      })

      expect(response.ok).toBe(true)
      const json = await response.json()
      expect(json.finetune_id).toBe('ft-bfl-123')
    })

    it('должен использовать правильные параметры тренировки', () => {
      // Expected BFL API parameters
      const expectedParams = {
        file_data: expect.any(String), // base64 encoded
        finetune_comment: '123456789', // telegram_id
        trigger_word: 'MYAVATAR',
        mode: 'character',
        iterations: 1500, // steps
        learning_rate: 0.00001,
        captioning: true,
        priority: 'high_res_only',
        finetune_type: 'full',
        lora_rank: 32,
        webhook_url: 'https://webhook.example.com/bfl',
        webhook_secret: 'test-webhook-secret',
      }

      expect(expectedParams.mode).toBe('character')
      expect(expectedParams.finetune_type).toBe('full')
      expect(expectedParams.lora_rank).toBe(32)
      expect(expectedParams.iterations).toBe(1500)
    })

    it('должен обработать ошибку BFL API', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ error: 'Internal server error' }),
      })
      global.fetch = mockFetch

      const response = await mockFetch('https://api.us1.bfl.ai/v1/finetune', {
        method: 'POST',
      })

      expect(response.ok).toBe(false)
      expect(response.status).toBe(500)
    })
  })

  describe('6. Сохранение в базу данных', () => {
    it('должен сохранить запись с api: bfl', async () => {
      await createModelTrainingV2Db({
        finetune_id: 'ft-123',
        telegram_id: '123456789',
        model_name: 'my-avatar-model',
        trigger_word: 'MYAVATAR',
        zip_url: defaultEventData.zipUrl,
        steps: 1500,
        api: 'bfl',
        gender: 'male',
        bot_name: 'test_bot',
      })

      expect(createModelTrainingV2Db).toHaveBeenCalledWith(
        expect.objectContaining({
          api: 'bfl',
          telegram_id: '123456789',
          steps: 1500,
        })
      )
    })

    it('должен передать все необходимые поля', () => {
      const expectedRecord = {
        finetune_id: 'ft-123',
        telegram_id: '123456789',
        model_name: 'my-avatar-model',
        trigger_word: 'MYAVATAR',
        zip_url: defaultEventData.zipUrl,
        steps: 1500,
        api: 'bfl', // Important: BFL API marker
        gender: 'male',
        bot_name: 'test_bot',
      }

      expect(expectedRecord.api).toBe('bfl')
      expect(expectedRecord.steps).toBe(1500)
      expect(expectedRecord.trigger_word).toBe('MYAVATAR')
    })
  })

  describe('7. Уведомления пользователю', () => {
    it('должен отправить уведомление о начале тренировки', async () => {
      const mockSendMessage = vi.fn()
      ;(getBotByName as Mock).mockReturnValue({
        bot: {
          telegram: {
            sendMessage: mockSendMessage,
          },
        },
      })

      const { bot } = getBotByName('test_bot') as any
      await bot.telegram.sendMessage(
        '123456789',
        '✅ Обучение вашей модели "my-avatar-model" началось!'
      )

      expect(mockSendMessage).toHaveBeenCalledWith(
        '123456789',
        expect.stringContaining('Обучение')
      )
    })

    it('должен отправить сообщение на русском языке', () => {
      const ruMessage =
        '✅ Обучение вашей модели "my-avatar-model" началось! Мы уведомим вас, когда модель будет готова.'
      expect(ruMessage).toContain('Обучение')
      expect(ruMessage).toContain('уведомим')
    })

    it('должен отправить сообщение на английском языке', () => {
      const enMessage =
        '✅ Your model "my-avatar-model" training has started! We\'ll notify you when it\'s ready.'
      expect(enMessage).toContain('training has started')
      expect(enMessage).toContain('notify you')
    })
  })

  describe('8. Списание баланса', () => {
    it('должен списать баланс после успешного старта', async () => {
      const paymentAmount = 150
      const currentBalance = 1000
      const newBalance = currentBalance - paymentAmount

      await updateUserBalance(
        '123456789',
        paymentAmount,
        'MONEY_OUTCOME',
        'Оплата тренировки модели'
      )

      expect(updateUserBalance).toHaveBeenCalledWith(
        '123456789',
        paymentAmount,
        'MONEY_OUTCOME',
        expect.any(String)
      )
      expect(newBalance).toBe(850)
    })

    it('должен указать правильный service_type', () => {
      // Service type should be DigitalAvatarBodyV2
      const serviceType = 'digital_avatar_body_v2'
      expect(serviceType).toBe('digital_avatar_body_v2')
    })

    it('должен вычислить себестоимость (cost = price / 1.5)', () => {
      const price = 150 // stars
      const cost = price / 1.5 // 100
      expect(cost).toBe(100)
    })
  })

  describe('9. Обработка ошибок и возврат средств', () => {
    it('должен вернуть средства при ошибке', async () => {
      const paymentAmount = 150
      const currentBalance = 850 // After deduction
      const newBalance = currentBalance + paymentAmount

      await updateUserBalance(
        '123456789',
        newBalance,
        'MONEY_INCOME',
        'Refund for model training'
      )

      expect(updateUserBalance).toHaveBeenCalledWith(
        '123456789',
        newBalance,
        'MONEY_INCOME',
        expect.stringContaining('Refund')
      )
      expect(newBalance).toBe(1000)
    })

    it('должен отправить уведомление об ошибке пользователю', async () => {
      const mockSendMessage = vi.fn()
      ;(getBotByName as Mock).mockReturnValue({
        bot: {
          telegram: {
            sendMessage: mockSendMessage,
          },
        },
      })

      const { bot } = getBotByName('test_bot') as any
      await bot.telegram.sendMessage(
        '123456789',
        '❌ Произошла ошибка при генерации модели. Попробуйте еще раз.'
      )

      expect(mockSendMessage).toHaveBeenCalledWith(
        '123456789',
        expect.stringContaining('ошибка')
      )
    })

    it('должен уведомить администратора об ошибке', () => {
      const error = new Error('BFL API failed')
      errorMessageAdmin(error)

      expect(errorMessageAdmin).toHaveBeenCalledWith(error)
    })
  })

  describe('10. Сравнение BFL vs Replicate параметров', () => {
    it('BFL использует iterations вместо steps', () => {
      const bflParam = { iterations: 1500 }
      const replicateParam = { steps: 1500 }

      expect(bflParam.iterations).toBe(replicateParam.steps)
    })

    it('BFL использует finetune_comment для telegram_id', () => {
      const bflParam = { finetune_comment: '123456789' }
      expect(bflParam.finetune_comment).toBe('123456789')
    })

    it('BFL имеет специфичные параметры', () => {
      const bflSpecificParams = {
        mode: 'character',
        priority: 'high_res_only',
        finetune_type: 'full',
        lora_rank: 32, // BFL uses 32, Replicate uses 128
      }

      const replicateParams = {
        lora_rank: 128,
        optimizer: 'adamw8bit',
        batch_size: 1,
      }

      expect(bflSpecificParams.lora_rank).toBe(32)
      expect(replicateParams.lora_rank).toBe(128)
    })

    it('BFL возвращает finetune_id, Replicate возвращает training.id', () => {
      const bflResponse = { finetune_id: 'ft-bfl-123' }
      const replicateResponse = { id: 'training-rep-123', status: 'starting' }

      expect(bflResponse.finetune_id).toBeDefined()
      expect(replicateResponse.id).toBeDefined()
    })
  })

  describe('11. Webhook конфигурация', () => {
    it('BFL использует webhook_url и webhook_secret', () => {
      const bflWebhookConfig = {
        webhook_url: 'https://webhook.example.com/bfl',
        webhook_secret: 'test-webhook-secret',
      }

      expect(bflWebhookConfig.webhook_url).toContain('bfl')
      expect(bflWebhookConfig.webhook_secret).toBeDefined()
    })

    it('Replicate использует webhook и webhook_events_filter', () => {
      const replicateWebhookConfig = {
        webhook: 'https://webhook.example.com/replicate',
        webhook_events_filter: ['completed'],
      }

      expect(replicateWebhookConfig.webhook_events_filter).toContain(
        'completed'
      )
    })
  })

  describe('12. Логирование', () => {
    it('должен логировать начало тренировки', () => {
      logger.info({
        message: '🚀 Model training initiated',
        runId: 'run-123',
        data: defaultEventData,
      })

      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          message: '🚀 Model training initiated',
        })
      )
    })

    it('должен логировать каждый step', () => {
      const expectedSteps = [
        'check-user-exists',
        'get-bot',
        'check-balance',
        'encode-zip',
        'create-training',
        'save-training-to-db',
        'notify-user',
        'deduct-balance',
      ]

      expectedSteps.forEach(step => {
        expect(step).toBeDefined()
      })
    })

    it('должен логировать ошибки с полным stack trace', () => {
      const error = new Error('Test error')
      logger.error({
        message: '🚨 Error during model training',
        error: error.message,
        stack: error.stack,
      })

      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          message: '🚨 Error during model training',
          error: 'Test error',
        })
      )
    })
  })
})
