import { MyContext, UserModel } from '@/interfaces'
import { createMockContext } from '@/test-utils/core/mockContext'
import { TestResult } from '@/test-utils/core/types'
import {
  assertMockCalled,
  assertReplyContains,
} from '@/test-utils/core/assertions'
import { IMockFunction, mockFn } from '@/test-utils/core/mockFunction'
import { TestCategory } from '@/test-utils/core/categories'
import { logger } from '@/utils/logger'
import { runSceneStep } from '@/test-utils/core/mockHelper'
import { lipSyncWizard } from '@/scenes/lipSyncWizard'
import { Message, Update, File } from 'telegraf/typings/core/types/typegram'
import {
  SceneContextScene,
  WizardContext,
  WizardSessionData,
} from 'telegraf/typings/scenes'
import { Context, Telegram } from 'telegraf'

interface WizardSession extends WizardSessionData {
  cursor: number
  attempts: number
  amount: number
  videoUrl: string
  email: string
  selectedModel: string
  audioToText: string
  prompt: string
  user: UserModel
  __scenes: {
    data: Record<string, any>
    cursor: number
  }
  __wizard: {
    cursor: number
    state: Record<string, any>
  }
}

interface ExtendedContext
  extends Omit<Context, 'scene' | 'wizard' | 'session'> {
  message?: Update.New & Update.NonChannel & Message.TextMessage
  reply: IMockFunction<
    (text: string, extra?: any) => Promise<Message.TextMessage>
  >
  replyWithHTML: IMockFunction<
    (text: string, extra?: any) => Promise<Message.TextMessage>
  >
  replyWithMarkdown: IMockFunction<
    (text: string, extra?: any) => Promise<Message.TextMessage>
  >
  scene: SceneContextScene<WizardContext<WizardSession>>
  wizard: {
    next: IMockFunction<() => void>
    selectStep: IMockFunction<(step: number) => void>
    back: IMockFunction<() => void>
  }
  telegram: Partial<Telegram> & {
    getFile: IMockFunction<(fileId: string) => Promise<File>>
    sendMessage: IMockFunction<
      (
        chatId: number | string,
        text: string,
        extra?: any
      ) => Promise<Message.TextMessage>
    >
    sendPhoto: IMockFunction<
      (
        chatId: number | string,
        photo: string | Buffer,
        extra?: any
      ) => Promise<Message & { photo: any[] }>
    >
    sendVideo: IMockFunction<
      (
        chatId: number | string,
        video: string | Buffer,
        extra?: any
      ) => Promise<Message & { video: any }>
    >
  }
  session: WizardSession
}

const TEST_USER_ID = '123456789'
const TEST_USERNAME = 'testuser'
const TEST_FILE_PATH = 'test/file/path.mp4'
const TEST_VIDEO_URL = 'https://example.com/video.mp4'
const TEST_AUDIO_URL = 'https://example.com/audio.mp3'

/**
 * Создаем базовую сессию для тестов
 */
function createTestSession(): WizardSession {
  return {
    cursor: 0,
    attempts: 0,
    amount: 0,
    videoUrl: '',
    email: '',
    selectedModel: '',
    audioToText: '',
    prompt: '',
    user: {
      id: 0,
      username: '',
      firstName: '',
      lastName: '',
      languageCode: 'en',
      isBot: false,
      isPremium: false,
      subscriptionExpiresAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    __scenes: {
      data: {},
      cursor: 0,
    },
    __wizard: {
      cursor: 0,
      state: {},
    },
  }
}

/**
 * Создаем тестовый контекст с необходимыми моками
 */
function setupTestContext(): ExtendedContext {
  const mockCtx = createMockContext() as ExtendedContext

  mockCtx.session = createTestSession()
  mockCtx.scene = {
    enter: mockFn<(sceneId: string) => Promise<unknown>>(),
    leave: mockFn<() => Promise<unknown>>(),
    reenter: mockFn<() => Promise<unknown>>(),
  }

  mockCtx.wizard = {
    next: mockFn<() => unknown>(),
    selectStep: mockFn<(step: number) => unknown>(),
    back: mockFn<() => unknown>(),
  }

  mockCtx.telegram = {
    getFile: mockFn<
      (
        fileId: string
      ) => Promise<{ file_id: string; file_size: number; file_path: string }>
    >().mockResolvedValue({
      file_id: 'file_id',
      file_size: 1024,
      file_path: TEST_FILE_PATH,
    }),
    sendMessage:
      mockFn<
        (
          chatId: number | string,
          text: string,
          extra?: any
        ) => Promise<Message.TextMessage>
      >(),
    sendPhoto:
      mockFn<
        (
          chatId: number | string,
          photo: string,
          extra?: any
        ) => Promise<Message.TextMessage>
      >(),
    sendVideo:
      mockFn<
        (
          chatId: number | string,
          video: string,
          extra?: any
        ) => Promise<Message.TextMessage>
      >(),
  }

  return mockCtx
}

// Создаем типизированные моки для вспомогательных функций
const mockIsRussian = mockFn<(ctx: MyContext) => boolean>()
const mockHandleHelpCancel = mockFn<(ctx: MyContext) => Promise<boolean>>()
const mockGenerateLipSync =
  mockFn<
    (
      videoUrl: string,
      audioUrl: string,
      telegram_id: string,
      botName: string
    ) => Promise<void>
  >()

/**
 * Тест: Вход в сцену LipSync
 */
async function testLipSyncWizard_Enter(): Promise<TestResult> {
  logger.info('🚀 Запуск теста: Вход в сцену LipSync')

  try {
    const ctx = setupTestContext()
    mockIsRussian.mockReturnValue(true)

    const enterHandler = lipSyncWizard.enter
    await runSceneStep(enterHandler, ctx)

    assertReplyContains(ctx, 'Загрузите видео')
    assertMockCalled(ctx.reply)

    return {
      name: 'LipSync Wizard - Enter Scene',
      category: TestCategory.SCENE,
      success: true,
      message: '✅ Тест успешно пройден: Корректное сообщение при входе',
    }
  } catch (error) {
    logger.error('❌ Ошибка в тесте входа в сцену:', error)
    return {
      name: 'LipSync Wizard - Enter Scene',
      category: TestCategory.SCENE,
      success: false,
      message: `❌ Тест провален: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`,
    }
  }
}

/**
 * Тест: Загрузка видео
 */
async function testLipSyncWizard_UploadVideo(): Promise<TestResult> {
  logger.info('🚀 Запуск теста: Загрузка видео')

  try {
    const ctx = setupTestContext()
    const handlers = lipSyncWizard.middleware()
    const videoHandler = typeof handlers === 'function' ? handlers : handlers[0]

    const testContext = {
      ...ctx,
      message: {
        video: {
          file_id: 'test_video_id',
          file_unique_id: 'unique_id',
          width: 1280,
          height: 720,
          duration: 10,
        },
      },
    }

    await runSceneStep(videoHandler, testContext)

    assertReplyContains(ctx, 'Теперь загрузите аудио')
    assertMockCalled(ctx.wizard.next)

    return {
      name: 'LipSync Wizard - Upload Video',
      category: TestCategory.SCENE,
      success: true,
      message: '✅ Тест успешно пройден: Видео загружено корректно',
    }
  } catch (error) {
    logger.error('❌ Ошибка в тесте загрузки видео:', error)
    return {
      name: 'LipSync Wizard - Upload Video',
      category: TestCategory.SCENE,
      success: false,
      message: `❌ Тест провален: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`,
    }
  }
}

/**
 * Тест: Загрузка аудио
 */
async function testLipSyncWizard_UploadAudio(): Promise<TestResult> {
  logger.info('🚀 Запуск теста: Загрузка аудио')

  try {
    const ctx = setupTestContext()
    ctx.session.videoUrl = TEST_VIDEO_URL

    const handlers = lipSyncWizard.middleware()
    const audioHandler = typeof handlers === 'function' ? handlers : handlers[1]

    const testContext = {
      ...ctx,
      message: {
        audio: {
          file_id: 'test_audio_id',
          file_unique_id: 'unique_audio_id',
          duration: 10,
          title: 'test_audio.mp3',
        },
      },
    }

    await runSceneStep(audioHandler, testContext)

    assertReplyContains(ctx, 'Начинаю обработку')
    assertMockCalled(mockGenerateLipSync)

    return {
      name: 'LipSync Wizard - Upload Audio',
      category: TestCategory.SCENE,
      success: true,
      message: '✅ Тест успешно пройден: Аудио загружено корректно',
    }
  } catch (error) {
    logger.error('❌ Ошибка в тесте загрузки аудио:', error)
    return {
      name: 'LipSync Wizard - Upload Audio',
      category: TestCategory.SCENE,
      success: false,
      message: `❌ Тест провален: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`,
    }
  }
}

/**
 * Тест: Обработка ошибок при загрузке видео
 */
async function testLipSyncWizard_VideoError(): Promise<TestResult> {
  logger.info('🚀 Запуск теста: Обработка ошибок при загрузке видео')

  try {
    const ctx = setupTestContext()
    ctx.telegram.getFile = mockFn().mockRejectedValue(
      new Error('Failed to get file')
    )

    const handlers = lipSyncWizard.middleware()
    const videoHandler = typeof handlers === 'function' ? handlers : handlers[0]

    const testContext = {
      ...ctx,
      message: {
        video: {
          file_id: 'test_video_id',
          file_unique_id: 'unique_id',
          width: 1280,
          height: 720,
          duration: 10,
        },
      },
    }

    await runSceneStep(videoHandler, testContext)

    assertReplyContains(ctx, 'Произошла ошибка')
    assertMockCalled(ctx.scene.leave)

    return {
      name: 'LipSync Wizard - Video Error Handling',
      category: TestCategory.SCENE,
      success: true,
      message: '✅ Тест успешно пройден: Ошибка обработана корректно',
    }
  } catch (error) {
    logger.error('❌ Ошибка в тесте обработки ошибок видео:', error)
    return {
      name: 'LipSync Wizard - Video Error Handling',
      category: TestCategory.SCENE,
      success: false,
      message: `❌ Тест провален: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`,
    }
  }
}

/**
 * Запускает все тесты LipSync Wizard
 */
export async function runLipSyncWizardTests(): Promise<TestResult[]> {
  logger.info('🚀 Запуск всех тестов LipSync Wizard')

  const results = await Promise.all([
    testLipSyncWizard_Enter(),
    testLipSyncWizard_UploadVideo(),
    testLipSyncWizard_UploadAudio(),
    testLipSyncWizard_VideoError(),
  ])

  const successCount = results.filter(r => r.success).length
  logger.info(`✅ Успешно пройдено тестов: ${successCount}/${results.length}`)

  return results
}

export default runLipSyncWizardTests
