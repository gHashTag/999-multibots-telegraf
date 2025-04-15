import { Scenes, Telegram } from 'telegraf'
import { Message, Update, UserFromGetMe, File } from 'telegraf/typings/core/types/typegram'
import { MyContext } from '@/interfaces'
import { uploadVideoScene } from '@/scenes/uploadVideoScene'
import { createMockContext } from '@/test-utils/core/mockContext'
import { IMockFunction, mockFn } from '@/test-utils/core/mockFunction'
import { TestCategory } from '@/test-utils/core/categories'
import { TestResult } from '@/test-utils/core/types'
import { logger } from '@/utils/logger'

const TEST_USER_ID = 123456789
const TEST_USERNAME = 'test_user'
const TEST_FILE_PATH = 'test/file/path.mp4'
const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50 MB

interface WizardSession extends Scenes.WizardSessionData {
  videoUrl: string
  balance: number
  isAdmin: boolean
  language: string
  cursor: number
  data: string
  email: string
  selectedModel: string
  audioToText: boolean
  prompt: string
  __scenes: {
    data: Record<string, any>
    cursor: number
  }
}

type WizardContextWizard = {
  next: () => Promise<void>
  selectStep: (step: number) => Promise<void>
  state: {
    cursor: number
    data: string
    severity: number
  }
}

interface ExtendedContext extends Omit<MyContext, 'scene' | 'session' | 'wizard'> {
  scene: {
    enter: IMockFunction<(sceneId: string) => Promise<void>>
    leave: IMockFunction<() => Promise<void>>
    reenter: IMockFunction<() => Promise<void>>
    state: Record<string, any>
  }
  wizard: WizardContextWizard
  session: WizardSession
  reply: IMockFunction<(text: string, extra?: any) => Promise<Message.TextMessage>>
  update: Update.MessageUpdate
  updateType: 'message'
  state: Record<string, any>
  me: string
  telegram: Partial<Telegram> & {
    getFile: IMockFunction<(fileId: string) => Promise<File>>
    getMe: () => Promise<UserFromGetMe>
  }
}

function createTestContext(overrides: Partial<ExtendedContext> = {}): ExtendedContext {
  const defaultContext: ExtendedContext = {
    ...createMockContext(),
    scene: {
      enter: mockFn<(sceneId: string) => Promise<void>>().mockImplementation(async () => Promise.resolve()),
      leave: mockFn<() => Promise<void>>().mockImplementation(async () => Promise.resolve()),
      reenter: mockFn<() => Promise<void>>().mockImplementation(async () => Promise.resolve()),
      state: {}
    },
    wizard: {
      next: mockFn<() => Promise<void>>().mockImplementation(async () => Promise.resolve()),
      selectStep: mockFn<(step: number) => Promise<void>>().mockImplementation(async () => Promise.resolve()),
      state: {
        cursor: 0,
        data: '',
        severity: 0
      }
    },
    session: {
      videoUrl: '',
      balance: 0,
      isAdmin: false,
      language: 'ru',
      cursor: 0,
      data: '',
      email: '',
      selectedModel: '',
      audioToText: false,
      prompt: '',
      __scenes: {
        data: {},
        cursor: 0
      }
    },
    reply: mockFn<(text: string, extra?: any) => Promise<Message.TextMessage>>().mockImplementation(
      async (text: string) => ({
        message_id: 1,
        date: Math.floor(Date.now() / 1000),
        chat: {
          id: TEST_USER_ID,
          type: 'private',
          first_name: TEST_USERNAME
        },
        from: {
          id: TEST_USER_ID,
          is_bot: false,
          first_name: TEST_USERNAME,
          language_code: 'ru'
        },
        text
      })
    ),
    update: {
      message: {
        message_id: 1,
        date: Math.floor(Date.now() / 1000),
        chat: {
          id: TEST_USER_ID,
          type: 'private',
          first_name: TEST_USERNAME
        },
        from: {
          id: TEST_USER_ID,
          is_bot: false,
          first_name: TEST_USERNAME,
          language_code: 'ru'
        },
        text: ''
      } as Message.TextMessage
    } as Update.MessageUpdate,
    updateType: 'message',
    state: {},
    me: 'test_bot',
    telegram: {
      getFile: mockFn<(fileId: string) => Promise<File>>().mockImplementation(
        async (fileId: string) => ({
          file_id: fileId,
          file_unique_id: 'test_unique_id',
          file_size: 1024,
          file_path: 'test/path'
        })
      ),
      getMe: async () => ({
        id: TEST_USER_ID,
        is_bot: true,
        first_name: 'Test Bot',
        username: 'test_bot',
        can_join_groups: true,
        can_read_all_group_messages: false,
        supports_inline_queries: false
      })
    }
  }

  return {
    ...defaultContext,
    ...overrides
  }
}

/**
 * Тест: Вход в сцену загрузки видео
 */
export async function testEnterScene(): Promise<TestResult> {
  logger.info('🚀 Запуск теста: Вход в сцену загрузки видео')

  try {
    const ctx = createTestContext()
    const handler = uploadVideoScene.middleware()
    await handler(ctx as any, async () => {})

    const replyCall = ctx.reply.mock.calls[0]
    if (!replyCall || !replyCall[0].includes('📹 Пожалуйста, отправьте видеофайл')) {
      throw new Error('Expected welcome message not found')
    }

    if (ctx.wizard.next.mock.calls.length !== 1) {
      throw new Error('Expected wizard.next to be called once')
    }

    return {
      name: 'Upload Video Scene - Enter',
      category: TestCategory.SCENE,
      success: true,
      message: '✅ Тест успешно пройден: Корректное приветственное сообщение и переход к следующему шагу',
    }
  } catch (error) {
    logger.error('❌ Ошибка в тесте входа в сцену:', error)
    return {
      name: 'Upload Video Scene - Enter',
      category: TestCategory.SCENE,
      success: false,
      message: `❌ Тест провален: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`,
    }
  }
}

/**
 * Тест: Загрузка корректного видео
 */
export async function testValidVideoUpload(): Promise<TestResult> {
  logger.info('🚀 Запуск теста: Загрузка корректного видео')

  try {
    const ctx = createTestContext({
      telegram: {
        ...createMockContext().telegram,
        getFile: mockFn<(fileId: string) => Promise<any>>().mockReturnValue({
          file_id: 'test_file_id',
          file_path: TEST_FILE_PATH,
        }),
      },
      message: {
        video: {
          file_id: 'test_file_id',
          file_size: 1024 * 1024, // 1MB
        },
      } as any,
    })

    const handler = uploadVideoScene.middleware()
    await handler(ctx as any, async () => {})

    if (ctx.telegram.getFile.mock.calls.length !== 1) {
      throw new Error('Expected telegram.getFile to be called once')
    }

    if (ctx.wizard.next.mock.calls.length !== 1) {
      throw new Error('Expected wizard.next to be called once')
    }

    if (!ctx.session.videoUrl) {
      throw new Error('Expected videoUrl to be set in session')
    }

    return {
      name: 'Upload Video Scene - Valid Upload',
      category: TestCategory.SCENE,
      success: true,
      message: '✅ Тест успешно пройден: Видео корректно загружено и обработано',
    }
  } catch (error) {
    logger.error('❌ Ошибка в тесте загрузки видео:', error)
    return {
      name: 'Upload Video Scene - Valid Upload',
      category: TestCategory.SCENE,
      success: false,
      message: `❌ Тест провален: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`,
    }
  }
}

/**
 * Тест: Загрузка слишком большого видео
 */
export async function testOversizedVideo(): Promise<TestResult> {
  logger.info('🚀 Запуск теста: Загрузка слишком большого видео')

  try {
    const ctx = createTestContext({
      message: {
        video: {
          file_id: 'test_file_id',
          file_size: MAX_FILE_SIZE + 1,
        },
      } as any,
    })

    const handler = uploadVideoScene.middleware()
    await handler(ctx as any, async () => {})

    const replyCall = ctx.reply.mock.calls[0]
    if (!replyCall || !replyCall[0].includes('⚠️ Ошибка: видео слишком большое')) {
      throw new Error('Expected error message not found')
    }

    if (ctx.scene.leave.mock.calls.length !== 1) {
      throw new Error('Expected scene.leave to be called once')
    }

    return {
      name: 'Upload Video Scene - Oversized Video',
      category: TestCategory.SCENE,
      success: true,
      message: '✅ Тест успешно пройден: Корректная обработка слишком большого видео',
    }
  } catch (error) {
    logger.error('❌ Ошибка в тесте загрузки большого видео:', error)
    return {
      name: 'Upload Video Scene - Oversized Video',
      category: TestCategory.SCENE,
      success: false,
      message: `❌ Тест провален: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`,
    }
  }
}

/**
 * Тест: Отправка сообщения без видео
 */
export async function testNoVideo(): Promise<TestResult> {
  logger.info('🚀 Запуск теста: Отправка сообщения без видео')

  try {
    const ctx = createTestContext({
      message: { text: 'not a video' } as any,
    })

    const handler = uploadVideoScene.middleware()
    await handler(ctx as any, async () => {})

    const replyCall = ctx.reply.mock.calls[0]
    if (!replyCall || !replyCall[0].includes('❌ Ошибка: видео не предоставлено')) {
      throw new Error('Expected error message not found')
    }

    if (ctx.scene.leave.mock.calls.length !== 1) {
      throw new Error('Expected scene.leave to be called once')
    }

    return {
      name: 'Upload Video Scene - No Video',
      category: TestCategory.SCENE,
      success: true,
      message: '✅ Тест успешно пройден: Корректная обработка отсутствия видео',
    }
  } catch (error) {
    logger.error('❌ Ошибка в тесте отсутствия видео:', error)
    return {
      name: 'Upload Video Scene - No Video',
      category: TestCategory.SCENE,
      success: false,
      message: `❌ Тест провален: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`,
    }
  }
}

/**
 * Тест: Отправка видео с неверным форматом
 */
export async function testInvalidVideoFormat(): Promise<TestResult> {
  logger.info('🚀 Запуск теста: Отправка видео с неверным форматом')

  try {
    const ctx = createTestContext({
      message: {
        document: {
          file_id: 'test_file_id',
          file_name: 'test.txt',
        },
      } as any,
    })

    const handler = uploadVideoScene.middleware()
    await handler(ctx as any, async () => {})

    const replyCall = ctx.reply.mock.calls[0]
    if (!replyCall || !replyCall[0].includes('❌ Ошибка: видео не предоставлено')) {
      throw new Error('Expected error message not found')
    }

    if (ctx.scene.leave.mock.calls.length !== 1) {
      throw new Error('Expected scene.leave to be called once')
    }

    return {
      name: 'Upload Video Scene - Invalid Format',
      category: TestCategory.SCENE,
      success: true,
      message: '✅ Тест успешно пройден: Корректная обработка неверного формата файла',
    }
  } catch (error) {
    logger.error('❌ Ошибка в тесте неверного формата:', error)
    return {
      name: 'Upload Video Scene - Invalid Format',
      category: TestCategory.SCENE,
      success: false,
      message: `❌ Тест провален: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`,
    }
  }
}

/**
 * Запуск всех тестов сцены загрузки видео
 */
export async function runUploadVideoSceneTests(): Promise<TestResult[]> {
  logger.info('🚀 Запуск всех тестов сцены загрузки видео')
  
  const results = await Promise.all([
    testEnterScene(),
    testValidVideoUpload(),
    testOversizedVideo(),
    testNoVideo(),
    testInvalidVideoFormat(),
  ])

  const totalTests = results.length
  const passedTests = results.filter(r => r.success).length
  
  logger.info(`📊 Результаты тестов: ${passedTests}/${totalTests} успешно`)
  
  return results
}

// Экспорт всех тестов
export default {
  testEnterScene,
  testValidVideoUpload,
  testOversizedVideo,
  testNoVideo,
  testInvalidVideoFormat,
  runUploadVideoSceneTests,
}
