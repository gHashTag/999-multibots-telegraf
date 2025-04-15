import { Scenes, Context } from 'telegraf'
import { createMockBot } from '../../mocks/telegrafMock'
import { Message } from 'telegraf/typings/core/types/typegram'
import { isRussian } from '../../../utils/i18n'
import { textToSpeechWizard } from '../../../scenes/textToSpeechWizard'
import { logger } from '../../../utils/logger'
import { MyContext } from '@/interfaces'
import { createMockContext } from '../../core/mockContext'
import { TestResult } from '../../core/types'
import { TestCategory } from '../../core/categories'
import { MockFunction, create as mockFunction } from '../../core/mock'
import { inngest } from '@/inngest-functions/clients'
import { getVoiceId } from '@/core/supabase'

interface MyContext extends Context {
  session: {
    textToConvert?: string
    voiceId?: string
  }
  scene: Scenes.SceneContextScene<MyContext>
  message?: Message.TextMessage
}

interface TestContext extends MyContext {
  reply: jest.Mock
}

interface TestResult {
  name: string
  category: string
  success: boolean
  message: string
}

const mockIsRussian = jest
  .fn()
  .mockImplementation((text: string) => text.includes('ru'))
const mockTextToSpeech = jest.fn()
const mockLogger = {
  info: jest.fn(),
  error: jest.fn(),
}

const setupContext = (language: string = 'ru'): TestContext => {
  const ctx = {
    ...createMockBot(),
    scene: {
      enter: jest.fn(),
      leave: jest.fn(),
      state: {},
    } as Partial<Scenes.SceneContextScene<MyContext>>,
    session: {},
    message: {
      text: language,
    },
    reply: jest.fn(),
  } as TestContext

  mockIsRussian.mockReturnValue(language === 'ru')
  return ctx
}

const TEST_USER_ID = 123456789
const TEST_USERNAME = 'test_user'
const TEST_VOICE_ID = 'test-voice-id'

/**
 * Тест входа в сцену text-to-speech на русском языке
 */
export async function testTextToSpeechWizard_Enter(): Promise<TestResult> {
  try {
    logger.info('Запуск теста: TextToSpeechWizard - Вход в сцену (RU)')

    // Создаем мок-контекст
    const ctx = createMockContext()
    ctx.from = { id: TEST_USER_ID, username: TEST_USERNAME } as any
    ctx.session = {} as any

    // Импортируем сцену
    const { textToSpeechWizard } = await import('@/scenes/textToSpeechWizard')

    // Вызываем обработчик входа в сцену
    await textToSpeechWizard.steps[0](ctx as unknown as MyContext)

    // Проверяем, что отправлено правильное сообщение
    if (
      !ctx.reply.calledWith(
        '🎙️ Отправьте текст, для преобразования его в голос'
      )
    ) {
      throw new Error('Неверное сообщение при входе в сцену')
    }

    return {
      name: 'TextToSpeechWizard: Вход в сцену (RU)',
      category: TestCategory.Scenes,
      success: true,
      message: 'Тест успешно пройден',
    }
  } catch (error) {
    logger.error('Ошибка в тесте:', error)
    return {
      name: 'TextToSpeechWizard: Вход в сцену (RU)',
      category: TestCategory.Scenes,
      success: false,
      message: String(error),
    }
  }
}

/**
 * Тест входа в сцену text-to-speech на английском языке
 */
export async function testTextToSpeechWizard_EnterEnglish(): Promise<TestResult> {
  try {
    logger.info('Запуск теста: TextToSpeechWizard - Вход в сцену (EN)')

    // Создаем мок-контекст с английским языком
    const ctx = createMockContext()
    ctx.from = { id: TEST_USER_ID, username: TEST_USERNAME } as any
    ctx.session = { language: 'en' } as any

    // Импортируем сцену
    const { textToSpeechWizard } = await import('@/scenes/textToSpeechWizard')

    // Вызываем обработчик входа в сцену
    await textToSpeechWizard.steps[0](ctx as unknown as MyContext)

    // Проверяем, что отправлено правильное сообщение
    if (!ctx.reply.calledWith('🎙️ Send text, to convert it to voice')) {
      throw new Error('Incorrect message when entering scene in English')
    }

    return {
      name: 'TextToSpeechWizard: Вход в сцену (EN)',
      category: TestCategory.Scenes,
      success: true,
      message: 'Тест успешно пройден',
    }
  } catch (error) {
    logger.error('Ошибка в тесте:', error)
    return {
      name: 'TextToSpeechWizard: Вход в сцену (EN)',
      category: TestCategory.Scenes,
      success: false,
      message: String(error),
    }
  }
}

/**
 * Тест обработки текста и отправки события в Inngest
 */
export async function testTextToSpeechWizard_ProcessText(): Promise<TestResult> {
  try {
    logger.info('Запуск теста: TextToSpeechWizard - Обработка текста')

    // Мокаем функцию getVoiceId
    const mockGetVoiceId = mockFunction<typeof getVoiceId>()
    mockGetVoiceId.mockReturnValue(Promise.resolve(TEST_VOICE_ID))

    // Мокаем функцию inngest.send
    const mockInngestSend = mockFunction<typeof inngest.send>()
    mockInngestSend.mockReturnValue(Promise.resolve())

    // Создаем мок-контекст
    const ctx = createMockContext()
    ctx.from = { id: TEST_USER_ID, username: TEST_USERNAME } as any
    ctx.message = { text: 'Test message' } as any
    ctx.session = {} as any

    // Импортируем сцену
    const { textToSpeechWizard } = await import('@/scenes/textToSpeechWizard')

    // Вызываем обработчик текста
    await textToSpeechWizard.steps[1](ctx as unknown as MyContext)

    // Проверяем, что был запрос voice_id
    if (!mockGetVoiceId.called) {
      throw new Error('Не был вызван getVoiceId')
    }

    // Проверяем, что было отправлено событие в Inngest
    if (!mockInngestSend.called) {
      throw new Error('Не было отправлено событие в Inngest')
    }

    return {
      name: 'TextToSpeechWizard: Обработка текста',
      category: TestCategory.Scenes,
      success: true,
      message: 'Тест успешно пройден',
    }
  } catch (error) {
    logger.error('Ошибка в тесте:', error)
    return {
      name: 'TextToSpeechWizard: Обработка текста',
      category: TestCategory.Scenes,
      success: false,
      message: String(error),
    }
  }
}

/**
 * Тест обработки отсутствующего voice_id
 */
export async function testTextToSpeechWizard_NoVoiceId(): Promise<TestResult> {
  try {
    logger.info('Запуск теста: TextToSpeechWizard - Отсутствующий voice_id')

    // Мокаем функцию getVoiceId, возвращающую null
    const mockGetVoiceId = mockFunction<typeof getVoiceId>()
    mockGetVoiceId.mockReturnValue(Promise.resolve(null))

    // Создаем мок-контекст
    const ctx = createMockContext()
    ctx.from = { id: TEST_USER_ID, username: TEST_USERNAME } as any
    ctx.message = { text: 'Test message' } as any
    ctx.session = {} as any

    // Импортируем сцену
    const { textToSpeechWizard } = await import('@/scenes/textToSpeechWizard')

    // Вызываем обработчик текста
    await textToSpeechWizard.steps[1](ctx as unknown as MyContext)

    // Проверяем, что отправлено сообщение об отсутствии voice_id
    if (
      !ctx.reply.calledWith(
        '🎯 Для корректной работы обучите аватар используя 🎤 Голос для аватара в главном меню'
      )
    ) {
      throw new Error('Неверное сообщение при отсутствии voice_id')
    }

    return {
      name: 'TextToSpeechWizard: Отсутствующий voice_id',
      category: TestCategory.Scenes,
      success: true,
      message: 'Тест успешно пройден',
    }
  } catch (error) {
    logger.error('Ошибка в тесте:', error)
    return {
      name: 'TextToSpeechWizard: Отсутствующий voice_id',
      category: TestCategory.Scenes,
      success: false,
      message: String(error),
    }
  }
}

/**
 * Запуск всех тестов для сцены TextToSpeechWizard
 */
export async function runTextToSpeechWizardTests(): Promise<TestResult[]> {
  const results: TestResult[] = []

  try {
    results.push(await testTextToSpeechWizard_Enter())
    results.push(await testTextToSpeechWizard_EnterEnglish())
    results.push(await testTextToSpeechWizard_ProcessText())
    results.push(await testTextToSpeechWizard_NoVoiceId())
  } catch (error) {
    logger.error('Ошибка при запуске тестов TextToSpeechWizard:', error)
    results.push({
      name: 'TextToSpeechWizard: Общая ошибка',
      category: TestCategory.Scenes,
      success: false,
      message: String(error),
    })
  }

  return results
}

export default runTextToSpeechWizardTests
