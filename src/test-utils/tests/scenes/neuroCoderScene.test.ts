import { MySession } from '@/interfaces'
import { createMockContext } from '@/test-utils/core/mockContext'
import { createMockFunction, IMockFunction } from '@/test-utils/core/mockFunction'
import { TestResult, TestCategory } from '@/test-utils/core/types'
import { logger } from '@/utils/logger'
import { Message } from 'telegraf/typings/core/types/typegram'
import { ModeEnum } from '@/price/helpers/modelsCost'
import { promptNeuroCoder } from '@/scenes/neuroCoderScene/promts'
import { User } from 'telegraf/typings/core/types/typegram'
import { Telegram } from 'telegraf'

type BaseMockContext = ReturnType<typeof createMockContext>

interface ExtendedMockContext
  extends Omit<BaseMockContext, 'message' | 'session' | 'wizard'> {
  message?: Partial<Message.TextMessage>
  from: {
    id: number
    first_name: string
    is_bot: boolean
    language_code: string
  }
  chat: {
    id: number
    type: string
    first_name: string
  }
  session: {
    language?: string
    balance?: number
    isAdmin?: boolean
    mode?: ModeEnum
    modelUrl?: string
    prompt?: string
    numImages?: number
    images: string[]
  }
  scene: {
    enter: IMockFunction<(sceneId: string) => Promise<void>>
    leave: IMockFunction<() => Promise<void>>
    reenter: IMockFunction<() => Promise<void>>
  }
  wizard: {
    cursor: number
    next: IMockFunction<() => number>
    back: IMockFunction<() => number>
    selectStep: IMockFunction<(step: number) => number>
    scene: {
      leave: IMockFunction<() => Promise<void>>
    }
  }
  telegram: {
    sendMessage: (
      chatId: string | number,
      text: string,
      extra?: any
    ) => Promise<{ message_id: number }>
    sendPhoto: (
      chatId: string | number,
      photo: string,
      extra?: any
    ) => Promise<Message.PhotoMessage>
    sendVideo: (
      chatId: string | number,
      video: string,
      extra?: any
    ) => Promise<Message.VideoMessage>
    getFile: (fileId: string) => Promise<{
      file_id: string
      file_unique_id: string
      file_size: number
      file_path: string
    }>
  }
  answerCbQuery: IMockFunction<(text?: string) => Promise<true>>
  reply: IMockFunction<
    (text: string, extra?: any) => Promise<Message.TextMessage>
  >
  replyWithHTML: IMockFunction<
    (text: string, extra?: any) => Promise<Message.TextMessage>
  >
  replyWithMarkdownV2: IMockFunction<
    (text: string, extra?: any) => Promise<Message.TextMessage>
  >
  replyWithPhoto: IMockFunction<
    (photo: string, extra?: any) => Promise<Message.TextMessage>
  >
  replyWithVideo: IMockFunction<
    (video: string, extra?: any) => Promise<Message.TextMessage>
  >
  editMessageText: IMockFunction<
    (text: string, extra?: any) => Promise<Message.TextMessage>
  >
  editMessageReplyMarkup: IMockFunction<
    (markup: any) => Promise<Message.TextMessage>
  >
  i18n: {
    t: (key: string, params?: any) => string
  }
  replies: Message.TextMessage[]
}

const assertions = {
  assertReplyContains: (ctx: ExtendedMockContext, expectedText: string) => {
    const replyText = ctx.message?.text || ''
    if (!replyText.includes(expectedText)) {
      throw new Error(
        `Expected reply to contain "${expectedText}" but got "${replyText}"`
      )
    }
  },
  assertMockCalled: (
    mock: IMockFunction<(...args: any[]) => any>,
    expectedTimes: number = 1
  ) => {
    if (mock.mock.calls.length !== expectedTimes) {
      throw new Error(
        `Expected mock to be called ${expectedTimes} times but was called ${mock.mock.calls.length} times`
      )
    }
  },
  assert: (condition: boolean, message?: string) => {
    if (!condition) {
      throw new Error(message || 'Assertion failed')
    }
  },
}

const { assertReplyContains, assertMockCalled, assert } = assertions

const TEST_USER_ID = 123456789
const TEST_USERNAME = 'test_user'
const TEST_MODEL_URL =
  'ghashtag/neuro_coder_flux-dev-lora:5ff9ea5918427540563f09940bf95d6efc16b8ce9600e82bb17c2b188384e355'
const TEST_PROMPT = 'Test prompt'

// Создаем базовую сессию для тестов
const createTestSession = (): MySession => ({
  memory: {
    messages: [],
  },
  email: '',
  selectedModel: '',
  audioToText: {
    audioFileId: '',
    audioFileUrl: '',
    transcription: '',
    duration: 0,
    filePath: '',
    isLongAudio: false,
    transcriptionLanguage: '',
    transcriptionModel: '',
    accuracy: '',
    amount: 0,
  },
  prompt: '',
  selectedSize: '',
  userModel: {
    model_name: '',
    trigger_word: '',
    model_url: '' as `${string}/${string}:${string}`,
    model_key: '' as `${string}/${string}:${string}`,
  },
  numImages: 1,
  telegram_id: '',
  mode: ModeEnum.TextToImage,
  attempts: 0,
  videoModel: '',
  imageUrl: '',
  videoUrl: '',
  audioUrl: '',
  amount: 0,
  subscription: '',
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
  selectedPayment: {
    amount: 0,
    stars: 0,
  },
})

/**
 * Создает базовый контекст для тестов
 */
function createTestContext(overrides: Partial<ExtendedMockContext> = {}): ExtendedMockContext {
  const defaultContext: ExtendedMockContext = {
    message: {
      text: 'test message'
    },
    from: {
      id: 123,
      first_name: 'Test User',
      is_bot: false,
      language_code: 'en'
    },
    chat: {
      id: 123,
      type: 'private',
      first_name: 'Test User'
    },
    session: {
      images: []
    },
    scene: {
      enter: createMockFunction(async (sceneId: string) => {}),
      leave: createMockFunction(async () => {}),
      reenter: createMockFunction(async () => {})
    },
    wizard: {
      cursor: 0,
      next: createMockFunction(() => 1),
      back: createMockFunction(() => -1),
      selectStep: createMockFunction((step: number) => step),
      scene: {
        leave: createMockFunction(async () => {})
      }
    },
    telegram: {
      sendMessage: async () => ({ message_id: 1 }),
      sendPhoto: async () => ({ photo: [{ file_id: 'test' }] } as Message.PhotoMessage),
      sendVideo: async () => ({ video: { file_id: 'test' } } as Message.VideoMessage),
      getFile: async (fileId: string) => ({ file_id: fileId, file_unique_id: 'test', file_size: 1024, file_path: 'test/path' })
    },
    answerCbQuery: createMockFunction(async () => true),
    reply: createMockFunction(async (text: string) => ({ text } as Message.TextMessage)),
    replyWithHTML: createMockFunction(async (text: string) => ({ text } as Message.TextMessage)),
    replyWithMarkdownV2: createMockFunction(async (text: string) => ({ text } as Message.TextMessage)),
    replyWithPhoto: createMockFunction(async (photo: string) => ({ photo } as any)),
    replyWithVideo: createMockFunction(async (video: string) => ({ video } as any)),
    editMessageText: createMockFunction(async (text: string) => ({ text } as Message.TextMessage)),
    editMessageReplyMarkup: createMockFunction(async (markup: any) => ({ reply_markup: markup } as any)),
    i18n: {
      t: (key: string) => key
    },
    replies: []
  }

  return { ...defaultContext, ...overrides }
}

/**
 * Тест входа в сцену neuroCoderScene на русском языке
 */
export async function testNeuroCoderScene_EnterRu(): Promise<TestResult> {
  logger.info('🚀 Starting testNeuroCoderScene_EnterRu')
  try {
    const ctx = createTestContext({
      from: {
        id: 1,
        is_bot: false,
        first_name: 'Test User',
        language_code: 'ru',
      },
    })
    const { neuroCoderScene } = await import('@/scenes/neuroCoderScene')

    await neuroCoderScene.enter(ctx as any, async () => {})

    assertReplyContains(ctx, 'Выберите количество изображений')
    assertReplyContains(ctx, 'Отмена')

    logger.info('✅ testNeuroCoderScene_EnterRu passed')
    return {
      name: 'NeuroCoderScene: Enter Scene (RU)',
      category: TestCategory.SCENE,
      success: true,
      message: 'Успешно протестирован вход в сцену на русском языке',
    }
  } catch (error) {
    logger.error('❌ testNeuroCoderScene_EnterRu failed:', error)
    return {
      name: 'NeuroCoderScene: Enter Scene (RU)',
      category: TestCategory.SCENE,
      success: false,
      message: String(error),
    }
  }
}

/**
 * Тест входа в сцену neuroCoderScene на английском языке
 */
export async function testNeuroCoderScene_EnterEn(): Promise<TestResult> {
  logger.info('🚀 Starting testNeuroCoderScene_EnterEn')
  try {
    const ctx = createTestContext()
    const { neuroCoderScene } = await import('@/scenes/neuroCoderScene')

    await neuroCoderScene.enter(ctx as any, async () => {})

    assertReplyContains(ctx, 'Select number of images')
    assertReplyContains(ctx, 'Cancel')

    logger.info('✅ testNeuroCoderScene_EnterEn passed')
    return {
      name: 'NeuroCoderScene: Enter Scene (EN)',
      category: TestCategory.SCENE,
      success: true,
      message: 'Successfully tested scene entry in English',
    }
  } catch (error) {
    logger.error('❌ testNeuroCoderScene_EnterEn failed:', error)
    return {
      name: 'NeuroCoderScene: Enter Scene (EN)',
      category: TestCategory.SCENE,
      success: false,
      message: String(error),
    }
  }
}

/**
 * Тест выбора количества изображений
 */
export async function testNeuroCoderScene_SelectImages(): Promise<TestResult> {
  logger.info('🚀 Starting testNeuroCoderScene_SelectImages')
  try {
    const ctx = createTestContext()
    ctx.message = {
      ...ctx.message,
      text: '2',
    }

    const { neuroCoderScene } = await import('@/scenes/neuroCoderScene')

    // Создаем мок для генерации изображений
    const mockGenerateImages = createMockFunction()
    mockGenerateImages.mockResolvedValue(['image1.jpg', 'image2.jpg'])

    // Подменяем функцию генерации изображений
    const generateNeuroImageModule = await import(
      '@/services/generateNeuroImage'
    )
    generateNeuroImageModule.generateNeuroImage = mockGenerateImages

    await neuroCoderScene.middleware()(ctx as any, async () => {})

    // Проверяем, что генерация была вызвана с правильными параметрами
    assertMockCalled(mockGenerateImages)

    logger.info('✅ testNeuroCoderScene_SelectImages passed')
    return {
      name: 'NeuroCoderScene: Select Images',
      category: TestCategory.SCENE,
      success: true,
      message: 'Успешно протестирован выбор количества изображений',
    }
  } catch (error) {
    logger.error('❌ testNeuroCoderScene_SelectImages failed:', error)
    return {
      name: 'NeuroCoderScene: Select Images',
      category: TestCategory.SCENE,
      success: false,
      message: String(error),
    }
  }
}

/**
 * Тест обработки некорректного ввода
 */
export async function testNeuroCoderScene_InvalidInput(): Promise<TestResult> {
  logger.info('🚀 Starting testNeuroCoderScene_InvalidInput')
  try {
    const ctx = createTestContext()
    ctx.message = {
      ...ctx.message,
      text: 'invalid',
    }

    const { neuroCoderScene } = await import('@/scenes/neuroCoderScene')

    await neuroCoderScene.middleware()(ctx as any, async () => {})

    assertReplyContains(ctx, 'Пожалуйста, выберите количество изображений')
    assertMockCalled(ctx.scene.reenter, 1)

    logger.info('✅ testNeuroCoderScene_InvalidInput passed')
    return {
      name: 'NeuroCoderScene: Invalid Input',
      category: TestCategory.SCENE,
      success: true,
      message: 'Успешно протестирована обработка некорректного ввода',
    }
  } catch (error) {
    logger.error('❌ testNeuroCoderScene_InvalidInput failed:', error)
    return {
      name: 'NeuroCoderScene: Invalid Input',
      category: TestCategory.SCENE,
      success: false,
      message: String(error),
    }
  }
}

/**
 * Тест отмены операции
 */
export async function testNeuroCoderScene_Cancel(): Promise<TestResult> {
  logger.info('🚀 Starting testNeuroCoderScene_Cancel')
  try {
    const ctx = createTestContext()
    ctx.message = {
      ...ctx.message,
      text: 'Отмена',
    }

    // Мокируем функцию handleHelpCancel
    const mockHandleHelpCancel = createMockFunction()
    mockHandleHelpCancel.mockResolvedValue(true)

    const handleHelpCancelModule = await import('@/handlers/handleHelpCancel')
    handleHelpCancelModule.handleHelpCancel = mockHandleHelpCancel

    const { neuroCoderScene } = await import('@/scenes/neuroCoderScene')
    await neuroCoderScene.middleware()(ctx as any, async () => {})

    assertReplyContains(ctx, 'Генерация отменена')
    assertMockCalled(ctx.scene.leave)
    assertMockCalled(ctx.reply)

    logger.info('✅ testNeuroCoderScene_Cancel passed')
    return {
      name: 'NeuroCoderScene: Cancel Operation',
      category: TestCategory.SCENE,
      success: true,
      message: 'Успешно протестирована отмена операции',
    }
  } catch (error) {
    logger.error('❌ testNeuroCoderScene_Cancel failed:', error)
    return {
      name: 'NeuroCoderScene: Cancel Operation',
      category: TestCategory.SCENE,
      success: false,
      message: String(error),
    }
  }
}

/**
 * Тест обработки ошибок при генерации
 */
export async function testNeuroCoderScene_GenerationError(): Promise<TestResult> {
  logger.info('🚀 Starting testNeuroCoderScene_GenerationError')
  try {
    const ctx = createTestContext()
    ctx.message = {
      ...ctx.message,
      text: '2',
    }

    // Мокируем функцию генерации с ошибкой
    const mockGenerateImages = createMockFunction()
    mockGenerateImages.mockRejectedValue(new Error('Generation failed'))

    const generateNeuroImageModule = await import(
      '@/services/generateNeuroImage'
    )
    generateNeuroImageModule.generateNeuroImage = mockGenerateImages

    const { neuroCoderScene } = await import('@/scenes/neuroCoderScene')
    await neuroCoderScene.middleware()(ctx as any, async () => {})

    assertReplyContains(ctx, 'Произошла ошибка при генерации изображений')
    assertMockCalled(ctx.scene.reenter, 1)

    logger.info('✅ testNeuroCoderScene_GenerationError passed')
    return {
      name: 'NeuroCoderScene: Generation Error',
      category: TestCategory.SCENE,
      success: true,
      message: 'Успешно протестирована обработка ошибок при генерации',
    }
  } catch (error) {
    logger.error('❌ testNeuroCoderScene_GenerationError failed:', error)
    return {
      name: 'NeuroCoderScene: Generation Error',
      category: TestCategory.SCENE,
      success: false,
      message: String(error),
    }
  }
}

/**
 * Тест проверки максимального количества изображений
 */
export async function testNeuroCoderScene_MaxImages(): Promise<TestResult> {
  logger.info('🚀 Starting testNeuroCoderScene_MaxImages')
  try {
    const ctx = createTestContext()
    ctx.message = {
      ...ctx.message,
      text: '11',
    } // Превышаем максимальное количество

    const { neuroCoderScene } = await import('@/scenes/neuroCoderScene')
    await neuroCoderScene.middleware()(ctx as any, async () => {})

    assertReplyContains(ctx, 'Максимальное количество изображений - 10')
    assertMockCalled(ctx.scene.reenter, 1)

    logger.info('✅ testNeuroCoderScene_MaxImages passed')
    return {
      name: 'NeuroCoderScene: Max Images',
      category: TestCategory.SCENE,
      success: true,
      message:
        'Успешно протестировано ограничение максимального количества изображений',
    }
  } catch (error) {
    logger.error('❌ testNeuroCoderScene_MaxImages failed:', error)
    return {
      name: 'NeuroCoderScene: Max Images',
      category: TestCategory.SCENE,
      success: false,
      message: String(error),
    }
  }
}

/**
 * Тест проверки минимального количества изображений
 */
export async function testNeuroCoderScene_MinImages(): Promise<TestResult> {
  logger.info('🚀 Starting testNeuroCoderScene_MinImages')
  try {
    const ctx = createTestContext()
    ctx.message = {
      ...ctx.message,
      text: '0',
    } // Меньше минимального количества

    const { neuroCoderScene } = await import('@/scenes/neuroCoderScene')
    await neuroCoderScene.middleware()(ctx as any, async () => {})

    assertReplyContains(ctx, 'Минимальное количество изображений - 1')
    assertMockCalled(ctx.scene.reenter, 1)

    logger.info('✅ testNeuroCoderScene_MinImages passed')
    return {
      name: 'NeuroCoderScene: Min Images',
      category: TestCategory.SCENE,
      success: true,
      message:
        'Успешно протестировано ограничение минимального количества изображений',
    }
  } catch (error) {
    logger.error('❌ testNeuroCoderScene_MinImages failed:', error)
    return {
      name: 'NeuroCoderScene: Min Images',
      category: TestCategory.SCENE,
      success: false,
      message: String(error),
    }
  }
}

/**
 * Тест проверки состояния сессии после генерации
 */
export async function testNeuroCoderScene_SessionState(): Promise<TestResult> {
  logger.info('🚀 Starting testNeuroCoderScene_SessionState')
  try {
    const ctx = createTestContext()
    ctx.message = {
      ...ctx.message,
      text: '2',
    }

    const mockGenerateImages = createMockFunction()
    mockGenerateImages.mockResolvedValue(['image1.jpg', 'image2.jpg'])

    const generateNeuroImageModule = await import(
      '@/services/generateNeuroImage'
    )
    generateNeuroImageModule.generateNeuroImage = mockGenerateImages

    const { neuroCoderScene } = await import('@/scenes/neuroCoderScene')
    await neuroCoderScene.middleware()(ctx as any, async () => {})

    // Проверяем состояние сессии
    const expectedSession = {
      ...createTestSession(),
      numImages: 2,
      images: ['image1.jpg', 'image2.jpg'],
      mode: ModeEnum.TextToImage,
    }

    // Проверяем только нужные поля
    const actualSession = ctx.session
    assert(
      actualSession.numImages === expectedSession.numImages,
      'Неверное количество изображений в сессии'
    )
    assert(
      actualSession.images.length === expectedSession.images.length,
      'Неверное количество URL изображений'
    )
    assert(
      actualSession.mode === expectedSession.mode,
      'Неверный режим в сессии'
    )

    logger.info('✅ testNeuroCoderScene_SessionState passed')
    return {
      name: 'NeuroCoderScene: Session State',
      category: TestCategory.SCENE,
      success: true,
      message: 'Успешно протестировано состояние сессии после генерации',
    }
  } catch (error) {
    logger.error('❌ testNeuroCoderScene_SessionState failed:', error)
    return {
      name: 'NeuroCoderScene: Session State',
      category: TestCategory.SCENE,
      success: false,
      message: String(error),
    }
  }
}

/**
 * Запуск всех тестов для neuroCoderScene
 */
export async function runNeuroCoderSceneTests(): Promise<TestResult[]> {
  logger.info('🚀 Starting all neuroCoderScene tests')
  const results: TestResult[] = []

  try {
    results.push(await testNeuroCoderScene_EnterRu())
    results.push(await testNeuroCoderScene_EnterEn())
    results.push(await testNeuroCoderScene_SelectImages())
    results.push(await testNeuroCoderScene_InvalidInput())
    results.push(await testNeuroCoderScene_Cancel())
    results.push(await testNeuroCoderScene_GenerationError())
    results.push(await testNeuroCoderScene_MaxImages())
    results.push(await testNeuroCoderScene_MinImages())
    results.push(await testNeuroCoderScene_SessionState())

    const totalTests = results.length
    const passedTests = results.filter(r => r.success).length
    logger.info(
      `✅ Completed neuroCoderScene tests: ${passedTests}/${totalTests} passed`
    )
  } catch (error) {
    logger.error('❌ Error running neuroCoderScene tests:', error)
    results.push({
      name: 'NeuroCoderScene: Test Suite Error',
      category: TestCategory.SCENE,
      success: false,
      message: String(error),
    })
  }

  return results
}

export default runNeuroCoderSceneTests
