import { MyContext } from '@/interfaces'
import {
  createMockUser,
  createTypedContext,
  createMockFunction,
  runSceneStep,
  createMockEventOutput,
} from '../../core/mockHelper'
import { TestResult } from '../../core/types'
import {
  assertReplyContains,
  assertReplyMarkupContains,
} from '../../core/assertions'
import { create as mockFunction } from '../../core/mock'
import { logger } from '@/utils/logger'
import { TestCategory } from '../../core/categories'
import { getUserBalance } from '@/core/supabase'
import { handleHelpCancel } from '@/handlers'
import { inngest } from '@/inngest-functions/clients'
import {
  mockInngestSend,
  verifyInngestEvent,
  expect as testExpect,
  runTest,
} from '../../core/testHelpers'

// Мокируем необходимые функции
const mockedGetUserBalance = createMockFunction<typeof getUserBalance>()
const mockedHandleHelpCancel = createMockFunction<typeof handleHelpCancel>()
const mockedGetFile = createMockFunction<() => Promise<{ file_path: string }>>()

// Константы для тестирования
const TEST_USER_ID = 123456789
const TEST_USERNAME = 'test_user'
const TEST_VOICE_FILE_ID = 'test_voice_file_id'
const TEST_BALANCE = 100
const TEST_AVATAR_PRICE = 50
const TEST_BOT_USERNAME = 'test_bot'
const TEST_BOT_TOKEN = '123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11'

/**
 * Настройка тестового окружения
 */
function setupTest() {
  // Мокируем getUserBalance
  mockedGetUserBalance.mockReturnValue(Promise.resolve(TEST_BALANCE))

  // Мокируем handleHelpCancel
  mockedHandleHelpCancel.mockReturnValue(Promise.resolve(false))

  // Мокируем getFile
  mockedGetFile.mockReturnValue(
    Promise.resolve({
      file_path: 'voices/test_voice.ogg',
    })
  )

  // Сбрасываем моки между тестами
  mockedGetUserBalance.mockClear()
  mockedHandleHelpCancel.mockClear()
  mockedGetFile.mockClear()
}

/**
 * Тест входа в сцену voiceAvatarWizard
 */
export async function testVoiceAvatarWizard_EnterScene(): Promise<TestResult> {
  return runTest(
    async () => {
      setupTest()

      // Создаем правильно типизированный мок контекст
      const ctx = createTypedContext({
        from: {
          id: TEST_USER_ID,
          is_bot: false,
          first_name: 'Test',
          username: TEST_USERNAME,
          language_code: 'ru',
        },
        botInfo: { username: TEST_BOT_USERNAME },
        message: { text: '/voice_avatar', message_id: 1 },
      })

      // Запускаем первый шаг сцены
      const { voiceAvatarWizard } = await import('@/scenes/voiceAvatarWizard')
      await runSceneStep(voiceAvatarWizard.steps[0], ctx)

      // Проверяем, что бот отправил правильное сообщение с инструкциями
      assertReplyContains(ctx, 'отправьте голосовое сообщение')

      // Проверяем, что была вызвана функция проверки баланса с правильным ID пользователя
      testExpect(mockedGetUserBalance).toHaveBeenCalled()
      testExpect(mockedGetUserBalance.mock.calls[0][0]).toBe(
        TEST_USER_ID.toString()
      )

      return {
        message: 'Успешно отображены инструкции по созданию голосового аватара',
      }
    },
    {
      name: 'voiceAvatarWizard: Вход в сцену',
      category: TestCategory.All,
    }
  )
}

/**
 * Тест обработки голосового сообщения
 */
export async function testVoiceAvatarWizard_ProcessVoiceMessage(): Promise<TestResult> {
  return runTest(
    async () => {
      setupTest()

      // Создаем правильно типизированный мок контекст с голосовым сообщением
      const ctx = createTypedContext({
        from: {
          id: TEST_USER_ID,
          is_bot: false,
          first_name: 'Test',
          username: TEST_USERNAME,
          language_code: 'ru',
        },
        botInfo: {
          username: TEST_BOT_USERNAME,
          id: 123456,
          is_bot: true,
          first_name: 'Test Bot',
        },
        telegram: {
          token: TEST_BOT_TOKEN,
          getFile: mockedGetFile,
        },
        message: {
          message_id: 1,
          voice: {
            file_id: TEST_VOICE_FILE_ID,
            duration: 10,
            mime_type: 'audio/ogg',
          },
        },
        session: {},
      })

      // Используем мок для inngest.send
      const restoreInngest = mockInngestSend()

      try {
        // Запускаем второй шаг сцены (обработка голосового сообщения)
        const { voiceAvatarWizard } = await import('@/scenes/voiceAvatarWizard')
        await runSceneStep(voiceAvatarWizard.steps[1], ctx)

        // Проверяем, что была вызвана функция getFile для получения файла
        testExpect(ctx.telegram.getFile).toHaveBeenCalled()
        testExpect(ctx.telegram.getFile.mock.calls[0][0]).toBe(
          TEST_VOICE_FILE_ID
        )

        // Проверяем, что было отправлено событие в Inngest
        verifyInngestEvent(inngest.send, {
          eventName: 'voice-avatar.requested',
          requiredData: {
            telegram_id: TEST_USER_ID.toString(),
            username: TEST_USERNAME,
            bot_name: TEST_BOT_USERNAME,
          },
        })

        return {
          message:
            'Успешно обработано голосовое сообщение и отправлен запрос на создание аватара',
        }
      } finally {
        // Восстанавливаем оригинальную функцию, даже если тест не прошел
        restoreInngest()
      }
    },
    {
      name: 'voiceAvatarWizard: Обработка голосового сообщения',
      category: TestCategory.All,
    }
  )
}

/**
 * Тест обработки аудио сообщения
 */
export async function testVoiceAvatarWizard_ProcessAudioMessage(): Promise<TestResult> {
  return runTest(
    async () => {
      setupTest()

      // Создаем правильно типизированный мок контекст с аудио сообщением
      const ctx = createTypedContext({
        from: {
          id: TEST_USER_ID,
          is_bot: false,
          first_name: 'Test',
          username: TEST_USERNAME,
          language_code: 'ru',
        },
        botInfo: {
          username: TEST_BOT_USERNAME,
          id: 123456,
          is_bot: true,
          first_name: 'Test Bot',
        },
        telegram: {
          token: TEST_BOT_TOKEN,
          getFile: mockedGetFile,
        },
        message: {
          message_id: 1,
          audio: {
            file_id: TEST_VOICE_FILE_ID,
            duration: 10,
            file_name: 'audio.mp3',
            mime_type: 'audio/mp3',
            title: 'Test Audio',
          },
        },
        session: {},
      })

      // Используем мок для inngest.send
      const restoreInngest = mockInngestSend()

      try {
        // Запускаем второй шаг сцены (обработка аудио сообщения)
        const { voiceAvatarWizard } = await import('@/scenes/voiceAvatarWizard')
        await runSceneStep(voiceAvatarWizard.steps[1], ctx)

        // Проверяем, что была вызвана функция getFile для получения файла
        testExpect(ctx.telegram.getFile).toHaveBeenCalled()
        testExpect(ctx.telegram.getFile.mock.calls[0][0]).toBe(
          TEST_VOICE_FILE_ID
        )

        // Проверяем, что было отправлено событие в Inngest
        verifyInngestEvent(inngest.send, {
          eventName: 'voice-avatar.requested',
          requiredData: {
            telegram_id: TEST_USER_ID.toString(),
            username: TEST_USERNAME,
            bot_name: TEST_BOT_USERNAME,
          },
        })

        return {
          message:
            'Успешно обработано аудио сообщение и отправлен запрос на создание аватара',
        }
      } finally {
        // Восстанавливаем оригинальную функцию, даже если тест не прошел
        restoreInngest()
      }
    },
    {
      name: 'voiceAvatarWizard: Обработка аудио сообщения',
      category: TestCategory.All,
    }
  )
}

/**
 * Тест недостаточного баланса
 */
export async function testVoiceAvatarWizard_InsufficientBalance(): Promise<TestResult> {
  return runTest(
    async () => {
      setupTest()

      // Мокируем getUserBalance для возврата недостаточного баланса
      mockedGetUserBalance.mockReturnValue(Promise.resolve(10)) // Меньше, чем цена

      // Создаем правильно типизированный мок контекст
      const ctx = createTypedContext({
        from: {
          id: TEST_USER_ID,
          is_bot: false,
          first_name: 'Test',
          username: TEST_USERNAME,
          language_code: 'ru',
        },
        botInfo: { username: TEST_BOT_USERNAME },
        message: { text: '/voice_avatar', message_id: 1 },
      })

      // Запускаем первый шаг сцены
      const { voiceAvatarWizard } = await import('@/scenes/voiceAvatarWizard')
      await runSceneStep(voiceAvatarWizard.steps[0], ctx)

      // Проверяем, что бот отправил сообщение о недостаточном балансе
      assertReplyContains(ctx, 'недостаточно')

      // Проверяем, что сцена была покинута
      testExpect(ctx.scene.leave).toHaveBeenCalled()

      return {
        message: 'Успешно обработан случай недостаточного баланса',
      }
    },
    {
      name: 'voiceAvatarWizard: Недостаточный баланс',
      category: TestCategory.All,
    }
  )
}

/**
 * Тест отмены создания голосового аватара
 */
export async function testVoiceAvatarWizard_Cancel(): Promise<TestResult> {
  return runTest(
    async () => {
      setupTest()

      // Мокируем handleHelpCancel для отмены
      mockedHandleHelpCancel.mockReturnValue(Promise.resolve(true))

      // Создаем правильно типизированный мок контекст
      const ctx = createTypedContext({
        from: {
          id: TEST_USER_ID,
          is_bot: false,
          first_name: 'Test',
          username: TEST_USERNAME,
          language_code: 'ru',
        },
        botInfo: { username: TEST_BOT_USERNAME },
        message: { text: 'Отмена', message_id: 1 },
      })

      // Запускаем второй шаг сцены
      const { voiceAvatarWizard } = await import('@/scenes/voiceAvatarWizard')
      await runSceneStep(voiceAvatarWizard.steps[1], ctx)

      // Проверяем, что handleHelpCancel был вызван
      testExpect(mockedHandleHelpCancel).toHaveBeenCalled()

      // Проверяем, что сцена была покинута
      testExpect(ctx.scene.leave).toHaveBeenCalled()

      return {
        message: 'Успешно обработана отмена создания голосового аватара',
      }
    },
    {
      name: 'voiceAvatarWizard: Отмена',
      category: TestCategory.All,
    }
  )
}

/**
 * Тест обработки ошибки получения файла
 */
export async function testVoiceAvatarWizard_FileError(): Promise<TestResult> {
  return runTest(
    async () => {
      setupTest()

      // Мокируем getFile для возвращения ошибки
      mockedGetFile.mockReturnValue(
        Promise.resolve({
          file_path: null as any,
        })
      )

      // Создаем правильно типизированный мок контекст
      const ctx = createTypedContext({
        from: {
          id: TEST_USER_ID,
          is_bot: false,
          first_name: 'Test',
          username: TEST_USERNAME,
          language_code: 'ru',
        },
        botInfo: {
          username: TEST_BOT_USERNAME,
          id: 123456,
          is_bot: true,
          first_name: 'Test Bot',
        },
        telegram: {
          token: TEST_BOT_TOKEN,
          getFile: mockedGetFile,
        },
        message: {
          message_id: 1,
          voice: {
            file_id: TEST_VOICE_FILE_ID,
            duration: 10,
            mime_type: 'audio/ogg',
          },
        },
        session: {},
      })

      // Запускаем второй шаг сцены
      const { voiceAvatarWizard } = await import('@/scenes/voiceAvatarWizard')
      await runSceneStep(voiceAvatarWizard.steps[1], ctx)

      // Проверяем, что была вызвана функция getFile
      testExpect(ctx.telegram.getFile).toHaveBeenCalled()

      // Проверяем, что бот отправил сообщение об ошибке
      assertReplyContains(ctx, 'ошибка')

      // Проверяем, что сцена была покинута
      testExpect(ctx.scene.leave).toHaveBeenCalled()

      return {
        message:
          'Успешно обработана ошибка получения файла голосового сообщения',
      }
    },
    {
      name: 'voiceAvatarWizard: Ошибка файла',
      category: TestCategory.All,
    }
  )
}

/**
 * Запуск всех тестов voiceAvatarWizard
 */
export async function runVoiceAvatarWizardTests(): Promise<TestResult[]> {
  const results: TestResult[] = []

  try {
    // Запускаем все тестовые функции и собираем результаты
    results.push(await testVoiceAvatarWizard_EnterScene())
    results.push(await testVoiceAvatarWizard_ProcessVoiceMessage())
    results.push(await testVoiceAvatarWizard_ProcessAudioMessage())
    results.push(await testVoiceAvatarWizard_InsufficientBalance())
    results.push(await testVoiceAvatarWizard_Cancel())
    results.push(await testVoiceAvatarWizard_FileError())
  } catch (error) {
    logger.error('Ошибка при запуске тестов voiceAvatarWizard:', error)
    results.push({
      name: 'Тесты voiceAvatarWizard',
      category: TestCategory.All,
      success: false,
      message: String(error),
    })
  }

  return results
}

export default runVoiceAvatarWizardTests
