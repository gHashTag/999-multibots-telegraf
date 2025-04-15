import { TestRunner } from '../../../core/TestRunner'
import { logger } from '@/utils/logger'
import assert from '../../../core/assert'
import { ModeEnum } from '@/interfaces/mode.interface'
import { createModelTraining } from '@/services/neuro/model/createModelTraining'
import { createModelTrainingDirect } from '@/services/neuro/model/createModelTrainingDirect'
import { ModelTrainingConfig } from '@/services/shared/model.utils'
import { MyContext, MySession, MyWizardSession } from '@/interfaces/telegram-bot.interface'
import { Context, Middleware, Scenes, Telegram } from 'telegraf'
import { create } from '../../../core/mock'

const testRunner = new TestRunner()

const testFilePath = '/mock/path/test.safetensors'

// Создаем мок сессии
const mockWizardSession: MyWizardSession = {
  data: '',
  cursor: 0,
  severity: 0
}

const mockSession = {
  email: '',
  selectedModel: '',
  prompt: '',
  selectedSize: '',
  mode: ModeEnum.TEST,
  attempts: 0,
  amount: 0,
  is_ru: false,
  wizardSession: mockWizardSession,
  userModel: null,
  numImages: 0,
  telegram_id: '123456789',
  videoModel: '',
  imageUrl: '',
  videoUrl: '',
  audioUrl: '',
  subscription: null,
  images: [],
  modelName: '',
  targetUserId: 0,
  username: '',
  triggerWord: '',
  steps: 0,
  inviter: '',
  inviteCode: '',
  invoiceURL: '',
  buttons: [],
  bypass_payment_check: false,
  text: '',
  selectedPayment: {
    amount: 0,
    stars: 0
  }
} as unknown as MySession

const mockTelegram = new Telegram('mock-token')

// Создаем базовый контекст
const baseContext = {
  session: mockSession,
  telegram: mockTelegram,
  attempts: 0,
  amount: 0,
  reply: async () => ({} as any),
  update: {} as any,
  botInfo: {} as any,
  state: {} as any,
  updateType: '',
  updateSubTypes: []
} as unknown as MyContext

// Создаем сцену и визард
const mockScene = new Scenes.BaseScene<MyContext>('test')
const scenes = new Map<string, Scenes.BaseScene<MyContext>>()
scenes.set('test', mockScene)

const sceneOptions = {
  defaultSession: mockWizardSession,
  ttl: 10 * 60 * 1000 // 10 minutes
}

const mockContext = {
  ...baseContext,
  scene: new Scenes.SceneContextScene(baseContext, scenes, sceneOptions),
  wizard: new Scenes.WizardContextWizard(baseContext, [mockScene])
} as unknown as MyContext

const mockConfig: ModelTrainingConfig = {
  filePath: testFilePath,
  modelName: 'test-model',
  triggerWord: 'test',
  steps: 1000,
  telegram_id: '123456789',
  botName: 'test-bot',
  is_ru: false
}

// Моки для внешних зависимостей
const validateModelFileMock = create<() => Promise<{ path: string; size: number; name: string }>>()
validateModelFileMock.mockImplementation(async () => ({ path: '/mock/path', size: 1000, name: 'test.safetensors' }))

const uploadModelFileMock = create<() => Promise<{ success: boolean; url: string }>>()
uploadModelFileMock.mockImplementation(async () => ({ success: true, url: 'https://example.com/model.safetensors' }))

// Мок для Inngest
const mockSend = create<() => Promise<{ success: boolean; id: string }>>()
mockSend.mockImplementation(async () => ({ success: true, id: 'test_event_id' }))

const inngestMock = {
  send: mockSend
}

// Очистка моков перед каждым тестом
testRunner.beforeEach(() => {
  logger.info('🧹 Подготовка тестового окружения')
  validateModelFileMock.mockClear()
  uploadModelFileMock.mockClear()
  mockSend.mockClear()
})

// План A: Тесты через Inngest
testRunner.test('Plan A: Успешное создание модели через Inngest', async () => {
  logger.info('🚀 Начинаем тест успешного создания модели через Inngest')
  const result = await createModelTraining(mockConfig, mockContext)
  assert.isTrue(result.success, 'Ожидался успешный результат')
  assert.equal(typeof result.eventId, 'string', 'Ожидался eventId типа string')
})

testRunner.test('Plan A: Обработка ошибок', async () => {
  logger.info('🚀 Начинаем тест обработки ошибок для Plan A')
  const config = { ...mockConfig, filePath: 'invalid/path' }
  const result = await createModelTraining(config, mockContext)
  assert.isFalse(result.success, 'Ожидался неуспешный результат')
  assert.equal(typeof result.error, 'string', 'Ожидалось сообщение об ошибке')
})

// План B: Тесты прямого создания
testRunner.test('Plan B: Успешное прямое создание модели', async () => {
  logger.info('🚀 Начинаем тест прямого создания модели')
  const result = await createModelTrainingDirect(mockContext, testFilePath, mockConfig)
  assert.isTrue(result.success, 'Ожидался успешный результат')
  assert.equal(typeof result.requestId, 'string', 'Ожидался requestId типа string')
})

testRunner.test('Plan B: Обработка ошибок валидации', async () => {
  logger.info('🚀 Начинаем тест обработки ошибок валидации для Plan B')
  const result = await createModelTrainingDirect(mockContext, 'invalid/path', mockConfig)
  assert.isFalse(result.success, 'Ожидался неуспешный результат')
  assert.equal(typeof result.error, 'string', 'Ожидалось сообщение об ошибке')
})

// Тест локализации
testRunner.test('Локализация: Русский язык', async () => {
  logger.info('🚀 Начинаем тест локализации (русский язык)')
  const ruConfig = { ...mockConfig, is_ru: true }
  const result = await createModelTraining(ruConfig, mockContext)
  assert.isTrue(result.success, 'Ожидался успешный результат')
  assert.equal(typeof result.eventId, 'string', 'Ожидался eventId типа string')
})

// Тесты граничных случаев
testRunner.test('Обработка граничных случаев', async () => {
  logger.info('🔍 Тест: Граничные случаи')
  
  // Тест с пустым именем модели
  const emptyNameConfig = { ...mockConfig, modelName: '' }
  const resultEmptyName = await createModelTrainingDirect(
    mockContext,
    testFilePath,
    emptyNameConfig
  )
  assert.isFalse(resultEmptyName.success, 'Должна быть ошибка при пустом имени модели')
  
  // Тест с некорректным количеством шагов
  const invalidStepsConfig = { ...mockConfig, steps: -1 }
  const resultInvalidSteps = await createModelTrainingDirect(
    mockContext,
    testFilePath,
    invalidStepsConfig
  )
  assert.isFalse(resultInvalidSteps.success, 'Должна быть ошибка при некорректном количестве шагов')
})

export { testRunner } 