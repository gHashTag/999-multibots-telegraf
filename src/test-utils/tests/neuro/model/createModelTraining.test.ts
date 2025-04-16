import { MyContext } from '@/interfaces/telegram-bot.interface'
import { ModeEnum } from '@/types/mode.enum'
import { createModelTraining } from '@/services/neuro/model/createModelTraining'
import { createModelTrainingDirect } from '@/services/neuro/model/createModelTrainingDirect'
import { logger } from '@/utils/logger'
import { TestContext } from '@/test-utils/core/enhanced'
import assert from '@/test-utils/core/assert'
import { mockContext } from '@/test-utils/context'
import { ModelTrainingConfig } from '@/services/shared/model.utils'
import { MySession } from '@/interfaces/telegram-bot.interface'

console.log('🚀 Starting Model Training Tests...')

// Создаем тестовый контекст
const createTestContext = (isRu = false) => {
  console.log(`📦 Creating test context (isRu: ${isRu})`)
  
  const ctx = mockContext()
  const defaultSession: Partial<MySession> = {
    mode: ModeEnum.TEST,
    is_ru: isRu,
    email: '',
    selectedModel: '',
    prompt: '',
    selectedSize: '',
    modelName: '',
    triggerWord: '',
    steps: 0,
    telegram_id: '',
    memory: { messages: [] },
    numImages: 1,
    amount: 0,
    subscription: '',
    images: [],
    targetUserId: 0,
    username: '',
    inviter: '',
    inviteCode: '',
    invoiceURL: '',
    buttons: [],
    selectedPayment: {
      amount: 0,
      stars: 0
    },
    bypass_payment_check: false
  }
  ctx.session = defaultSession as MySession

  const config: ModelTrainingConfig = {
    modelName: 'test-model',
    telegram_id: '123456789',
    triggerWord: 'test',
    steps: 100,
    botName: 'test-bot',
    is_ru: isRu,
    filePath: '/mock/path/test.safetensors'
  }

  return { ctx, config }
}

// Тесты
export const tests = {
  'Plan A: Успешное создание модели через Inngest': async () => {
    console.log('🔄 Starting Plan A test - successful model creation')
    const { ctx, config } = createTestContext()
    
    const result = await createModelTraining(config, ctx)
    console.log('📊 Plan A test result:', result)
    
    assert(result.success === true, 'Model training should be successful')
    assert(typeof result.eventId === 'string' && result.eventId.length > 0, 'Event ID should be present')
  },

  'Plan A: Обработка ошибок': async () => {
    console.log('🔄 Starting Plan A test - error handling')
    const { ctx, config } = createTestContext()
    config.modelName = '' // Invalid model name
    
    const result = await createModelTraining(config, ctx)
    console.log('📊 Plan A error test result:', result)
    
    assert(result.success === false, 'Model training should fail')
    assert(typeof result.error === 'string' && result.error.length > 0, 'Error message should be present')
  },

  'Plan B: Успешное прямое создание модели': async () => {
    console.log('🔄 Starting Plan B test - successful direct creation')
    const { ctx, config } = createTestContext()
    
    const result = await createModelTrainingDirect(ctx, config.filePath, config, true)
    console.log('📊 Plan B test result:', result)
    
    assert(result.success === true, 'Direct model training should be successful')
    assert(typeof result.requestId === 'string' && result.requestId.length > 0, 'Request ID should be present')
  },

  'Plan B: Обработка ошибок валидации': async () => {
    console.log('🔄 Starting Plan B test - validation error handling')
    const { ctx, config } = createTestContext()
    
    const invalidFilePath = '/invalid/path/test.txt'
    const result = await createModelTrainingDirect(ctx, invalidFilePath, config, true)
    console.log('📊 Plan B error test result:', result)
    
    assert(result.success === false, 'Model training should fail with invalid file')
    assert(typeof result.error === 'string' && result.error.length > 0, 'Error message should be present')
  },

  'Локализация: Русский язык': async () => {
    console.log('🔄 Starting localization test - Russian')
    const { ctx, config } = createTestContext(true)
    
    const result = await createModelTraining(config, ctx)
    console.log('📊 Localization test result:', result)
    
    assert(result.success === true, 'Model training should be successful in Russian')
  }
} 