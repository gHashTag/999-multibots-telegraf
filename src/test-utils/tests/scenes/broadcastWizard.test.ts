import { TestResult, TestCategory } from '../../core/types'
import { MyContext } from '@/interfaces'
import { createMockContext } from '../../core/mockContext'
import {
  broadcastWizard,
  BroadcastContentType,
} from '../../../scenes/broadcastWizard'
import mockApi from '../../core/mock'
import { logger } from '@/utils/logger'
import { Middleware } from 'telegraf'

// Гибкая типизация для мок-функций
type AnyFunction = (...args: any[]) => any
type MockedFunction = AnyFunction & {
  mock: {
    calls: any[][]
  }
}

// Функция для безопасного вызова middleware
async function invokeHandler(
  handler: Middleware<MyContext> | any,
  ctx: MyContext
): Promise<void> {
  if (typeof handler === 'function') {
    await handler(ctx, () => Promise.resolve())
  } else {
    console.warn('Handler is not a function')
  }
}

// Мок для broadcastService
const mockBroadcastService = {
  sendBroadcastWithImage: mockApi.create().mockResolvedValue({
    success: true,
    successCount: 10,
    errorCount: 0,
  }) as MockedFunction,

  sendBroadcastWithVideo: mockApi.create().mockResolvedValue({
    success: true,
    successCount: 10,
    errorCount: 0,
  }) as MockedFunction,
}

// Константы для тестирования
const TEST_USER_ID = 123456789
const TEST_PHOTO_FILE_ID = 'test-photo-123456'
const TEST_VIDEO_FILE_ID = 'test-video-123456'
const TEST_POST_LINK = 'https://t.me/channel/123'
const TEST_TEXT_RU = 'Тестовое сообщение для рассылки'
const TEST_TEXT_EN = 'Test message for broadcast'

/**
 * Настройка контекста для тестирования
 */
async function setupContext(language: string = 'ru'): Promise<any> {
  const ctx: any = createMockContext()

  // Настраиваем объект from
  ctx.from = {
    id: TEST_USER_ID,
    is_bot: false,
    first_name: 'Test',
    language_code: language,
  }

  // Настраиваем объект session
  ctx.session = {
    language,
    isAdmin: true,
  }

  // Создаем массив для хранения ответов
  ctx.replies = []

  // Настраиваем scene.session
  ctx.scene = ctx.scene || {}
  ctx.scene.session = {}

  // Настраиваем wizard
  ctx.wizard = {
    next: mockApi.create() as MockedFunction,
    selectStep: mockApi.create() as MockedFunction,
  }

  // Мокируем методы для ответов
  ctx.reply = mockApi
    .create()
    .mockImplementation((text: string, extra: any) => {
      ctx.replies.push({ text, extra })
      return Promise.resolve({ message_id: ctx.replies.length })
    }) as MockedFunction

  ctx.editMessageText = mockApi.create() as MockedFunction

  // Настраиваем callbackQuery
  ctx.callbackQuery = undefined

  // Настраиваем message
  ctx.message = undefined

  // Настраиваем botInfo
  ctx.botInfo = {
    username: 'test_bot',
  }

  // Добавляем метод scene.leave
  ctx.scene.leave = mockApi.create() as MockedFunction

  return ctx
}

/**
 * Тестирование запуска визарда рассылки (шаг 1)
 */
async function testBroadcastWizard_Start(): Promise<TestResult> {
  console.log('Запуск testBroadcastWizard_Start')
  try {
    // Создаем тестовый контекст
    const ctx = await setupContext('ru')

    // Вызываем первый шаг визарда
    await invokeHandler(broadcastWizard.steps[0], ctx)

    // Проверяем, что был вызван метод reply с правильным сообщением
    const expectedMessage = 'Выберите тип контента для рассылки 📨'
    const hasReplyCalls = ctx.reply.mock?.calls?.length > 0
    if (!hasReplyCalls) {
      throw new Error('Метод reply не был вызван')
    }

    const actualMessage = ctx.reply.mock.calls[0][0]
    if (!actualMessage.includes(expectedMessage)) {
      throw new Error(
        `Неправильное сообщение: ${actualMessage}, ожидалось содержание: ${expectedMessage}`
      )
    }

    // Проверяем, что был вызван метод wizard.next
    const hasNextCalls = ctx.wizard.next.mock?.calls?.length > 0
    if (!hasNextCalls) {
      throw new Error('Метод wizard.next не был вызван')
    }

    console.log('testBroadcastWizard_Start успешно завершен')
    return {
      name: 'testBroadcastWizard_Start',
      category: TestCategory.SCENE,
      success: true,
      message: 'Успешная проверка запуска визарда рассылки',
    }
  } catch (error: any) {
    console.error('Ошибка в testBroadcastWizard_Start:', error)
    return {
      name: 'testBroadcastWizard_Start',
      category: TestCategory.SCENE,
      success: false,
      message: `Ошибка: ${error.message}`,
    }
  }
}

/**
 * Тестирование выбора типа контента (шаг 2)
 */
async function testBroadcastWizard_SelectContentType(): Promise<TestResult> {
  console.log('Запуск testBroadcastWizard_SelectContentType')
  try {
    // Создаем тестовый контекст
    const ctx = await setupContext('ru')

    // Имитируем сообщение с выбором типа контента
    ctx.message = {
      text: '📷 Фото с текстом',
    }

    // Вызываем второй шаг визарда
    await invokeHandler(broadcastWizard.steps[1], ctx)

    // Проверяем, что был сохранен правильный тип контента
    if (ctx.scene.session.contentType !== BroadcastContentType.PHOTO) {
      throw new Error(
        `Неправильный тип контента сохранен: ${ctx.scene.session.contentType}, ожидался: ${BroadcastContentType.PHOTO}`
      )
    }

    // Проверяем, что был вызван метод reply с запросом фото
    const expectedMessage = 'Пожалуйста, отправьте изображение для рассылки'
    const hasReplyCalls = ctx.reply.mock?.calls?.length > 0
    if (!hasReplyCalls) {
      throw new Error('Метод reply не был вызван')
    }

    const actualMessage = ctx.reply.mock.calls[0][0]
    if (!actualMessage.includes('изображение')) {
      throw new Error(
        `Неправильное сообщение: ${actualMessage}, ожидалось содержание: ${expectedMessage}`
      )
    }

    // Проверяем, что был вызван метод wizard.next
    const hasNextCalls = ctx.wizard.next.mock?.calls?.length > 0
    if (!hasNextCalls) {
      throw new Error('Метод wizard.next не был вызван')
    }

    console.log('testBroadcastWizard_SelectContentType успешно завершен')
    return {
      name: 'testBroadcastWizard_SelectContentType',
      category: TestCategory.SCENE,
      success: true,
      message: 'Успешная проверка выбора типа контента (фото)',
    }
  } catch (error: any) {
    console.error('Ошибка в testBroadcastWizard_SelectContentType:', error)
    return {
      name: 'testBroadcastWizard_SelectContentType',
      category: TestCategory.SCENE,
      success: false,
      message: `Ошибка: ${error.message}`,
    }
  }
}

/**
 * Тестирование отправки фото и запроса текста (шаг 3)
 */
async function testBroadcastWizard_UploadPhoto(): Promise<TestResult> {
  console.log('Запуск testBroadcastWizard_UploadPhoto')
  try {
    // Создаем тестовый контекст
    const ctx = await setupContext('ru')

    // Устанавливаем тип контента в сессии
    ctx.scene.session.contentType = BroadcastContentType.PHOTO

    // Имитируем сообщение с фото
    ctx.message = {
      photo: [{ file_id: 'small_photo' }, { file_id: TEST_PHOTO_FILE_ID }],
    }

    // Вызываем третий шаг визарда
    await invokeHandler(broadcastWizard.steps[2], ctx)

    // Проверяем, что был сохранен правильный file_id фото
    if (ctx.scene.session.photoFileId !== TEST_PHOTO_FILE_ID) {
      throw new Error(
        `Неправильный file_id фото сохранен: ${ctx.scene.session.photoFileId}, ожидался: ${TEST_PHOTO_FILE_ID}`
      )
    }

    // Проверяем, что был вызван метод reply с запросом текста на русском
    const expectedMessage = 'Теперь введите текст на РУССКОМ языке'
    const hasReplyCalls = ctx.reply.mock?.calls?.length > 0
    if (!hasReplyCalls) {
      throw new Error('Метод reply не был вызван')
    }

    const actualMessage = ctx.reply.mock.calls[0][0]
    if (!actualMessage.includes('РУССКОМ')) {
      throw new Error(
        `Неправильное сообщение: ${actualMessage}, ожидалось содержание: ${expectedMessage}`
      )
    }

    // Проверяем, что был вызван метод wizard.next
    const hasNextCalls = ctx.wizard.next.mock?.calls?.length > 0
    if (!hasNextCalls) {
      throw new Error('Метод wizard.next не был вызван')
    }

    console.log('testBroadcastWizard_UploadPhoto успешно завершен')
    return {
      name: 'testBroadcastWizard_UploadPhoto',
      category: TestCategory.SCENE,
      success: true,
      message: 'Успешная проверка загрузки фото и запроса текста',
    }
  } catch (error: any) {
    console.error('Ошибка в testBroadcastWizard_UploadPhoto:', error)
    return {
      name: 'testBroadcastWizard_UploadPhoto',
      category: TestCategory.SCENE,
      success: false,
      message: `Ошибка: ${error.message}`,
    }
  }
}

/**
 * Тестирование ввода текста на русском и английском (шаг 4)
 */
async function testBroadcastWizard_InputText(): Promise<TestResult> {
  console.log('Запуск testBroadcastWizard_InputText')
  try {
    // Создаем тестовый контекст
    const ctx = await setupContext('ru')

    // Устанавливаем тип контента и этап ввода текста в сессии
    ctx.scene.session.contentType = BroadcastContentType.PHOTO
    ctx.scene.session.textInputStep = 'russian'

    // Имитируем сообщение с текстом на русском
    ctx.message = {
      text: TEST_TEXT_RU,
    }

    // Вызываем четвертый шаг визарда для русского текста
    await invokeHandler(broadcastWizard.steps[3], ctx)

    // Проверяем, что был сохранен правильный русский текст
    if (ctx.scene.session.textRu !== TEST_TEXT_RU) {
      throw new Error(
        `Неправильный русский текст сохранен: ${ctx.scene.session.textRu}, ожидался: ${TEST_TEXT_RU}`
      )
    }

    // Проверяем, что был вызван метод reply с запросом текста на английском
    const expectedMessage = 'Теперь введите текст на АНГЛИЙСКОМ языке'
    const hasReplyCalls = ctx.reply.mock?.calls?.length > 0
    if (!hasReplyCalls) {
      throw new Error('Метод reply не был вызван')
    }

    const actualMessage = ctx.reply.mock.calls[0][0]
    if (!actualMessage.includes('АНГЛИЙСКОМ')) {
      throw new Error(
        `Неправильное сообщение: ${actualMessage}, ожидалось содержание: ${expectedMessage}`
      )
    }

    // Проверяем, что этап ввода текста изменился на английский
    if (ctx.scene.session.textInputStep !== 'english') {
      throw new Error(
        `Неправильный этап ввода текста: ${ctx.scene.session.textInputStep}, ожидался: english`
      )
    }

    // Создаем новый контекст для ввода английского текста
    const ctxEn = await setupContext('ru')
    ctxEn.scene.session.contentType = BroadcastContentType.PHOTO
    ctxEn.scene.session.textInputStep = 'english'
    ctxEn.scene.session.textRu = TEST_TEXT_RU

    // Имитируем сообщение с текстом на английском
    ctxEn.message = {
      text: TEST_TEXT_EN,
    }

    // Вызываем четвертый шаг визарда для английского текста
    await invokeHandler(broadcastWizard.steps[3], ctxEn)

    // Проверяем, что был сохранен правильный английский текст
    if (ctxEn.scene.session.textEn !== TEST_TEXT_EN) {
      throw new Error(
        `Неправильный английский текст сохранен: ${ctxEn.scene.session.textEn}, ожидался: ${TEST_TEXT_EN}`
      )
    }

    // Проверяем, что этап ввода текста изменился на завершенный
    if (ctxEn.scene.session.textInputStep !== 'completed') {
      throw new Error(
        `Неправильный этап ввода текста: ${ctxEn.scene.session.textInputStep}, ожидался: completed`
      )
    }

    console.log('testBroadcastWizard_InputText успешно завершен')
    return {
      name: 'testBroadcastWizard_InputText',
      category: TestCategory.SCENE,
      success: true,
      message: 'Успешная проверка ввода текста на русском и английском',
    }
  } catch (error: any) {
    console.error('Ошибка в testBroadcastWizard_InputText:', error)
    return {
      name: 'testBroadcastWizard_InputText',
      category: TestCategory.SCENE,
      success: false,
      message: `Ошибка: ${error.message}`,
    }
  }
}

/**
 * Тестирование подтверждения и отправки рассылки (шаг 5)
 */
async function testBroadcastWizard_Confirm(): Promise<TestResult> {
  console.log('Запуск testBroadcastWizard_Confirm')
  try {
    // Создаем тестовый контекст
    const ctx = await setupContext('ru')

    // Устанавливаем данные в сессии
    ctx.scene.session.contentType = BroadcastContentType.PHOTO
    ctx.scene.session.photoFileId = TEST_PHOTO_FILE_ID
    ctx.scene.session.textRu = TEST_TEXT_RU
    ctx.scene.session.textEn = TEST_TEXT_EN
    ctx.scene.session.ownerTelegramId = TEST_USER_ID.toString()

    // Имитируем callback query для подтверждения
    ctx.callbackQuery = {
      data: 'broadcast_confirm',
    }

    // Подменяем broadcastService на мок
    const originalBroadcastService = (broadcastWizard as any).__proto__
      .broadcastService
    ;(broadcastWizard as any).__proto__.broadcastService = mockBroadcastService

    // Вызываем пятый шаг визарда
    await invokeHandler(broadcastWizard.steps[4], ctx)

    // Проверяем, что был вызван метод sendBroadcastWithImage
    const hasSendBroadcastCalls =
      mockBroadcastService.sendBroadcastWithImage.mock?.calls?.length > 0
    if (!hasSendBroadcastCalls) {
      throw new Error('Метод sendBroadcastWithImage не был вызван')
    }

    // Проверяем, что был вызван метод reply с сообщением об успешной отправке
    const expectedMessage = 'Рассылка успешно отправлена'
    const hasReplyCalls = ctx.reply.mock?.calls?.length > 0
    if (!hasReplyCalls) {
      throw new Error('Метод reply не был вызван')
    }

    const actualMessage = ctx.reply.mock.calls[0][0]
    if (!actualMessage.includes('успешно отправлена')) {
      throw new Error(
        `Неправильное сообщение: ${actualMessage}, ожидалось содержание: ${expectedMessage}`
      )
    }

    // Проверяем, что был вызван метод scene.leave
    const hasLeaveCalls = ctx.scene.leave.mock?.calls?.length > 0
    if (!hasLeaveCalls) {
      throw new Error('Метод scene.leave не был вызван')
    }

    // Восстанавливаем broadcastService
    ;(broadcastWizard as any).__proto__.broadcastService =
      originalBroadcastService

    console.log('testBroadcastWizard_Confirm успешно завершен')
    return {
      name: 'testBroadcastWizard_Confirm',
      category: TestCategory.SCENE,
      success: true,
      message: 'Успешная проверка подтверждения и отправки рассылки',
    }
  } catch (error: any) {
    console.error('Ошибка в testBroadcastWizard_Confirm:', error)
    return {
      name: 'testBroadcastWizard_Confirm',
      category: TestCategory.SCENE,
      success: false,
      message: `Ошибка: ${error.message}`,
    }
  }
}

/**
 * Тестирование отмены рассылки на разных этапах
 */
async function testBroadcastWizard_Cancel(): Promise<TestResult> {
  console.log('Запуск testBroadcastWizard_Cancel')
  try {
    // Создаем тестовый контекст для отмены на шаге 2
    const ctx1 = await setupContext('ru')

    // Имитируем сообщение с отменой
    ctx1.message = {
      text: '❌ Отмена',
    }

    // Вызываем второй шаг визарда с отменой
    await invokeHandler(broadcastWizard.steps[1], ctx1)

    // Проверяем, что был вызван метод reply с сообщением об отмене
    const expectedMessage = 'Рассылка отменена'
    const hasReplyCalls = ctx1.reply.mock?.calls?.length > 0
    if (!hasReplyCalls) {
      throw new Error('Метод reply не был вызван')
    }

    const actualMessage = ctx1.reply.mock.calls[0][0]
    if (!actualMessage.includes('отменена')) {
      throw new Error(
        `Неправильное сообщение: ${actualMessage}, ожидалось содержание: ${expectedMessage}`
      )
    }

    // Проверяем, что был вызван метод scene.leave
    const hasLeaveCalls = ctx1.scene.leave.mock?.calls?.length > 0
    if (!hasLeaveCalls) {
      throw new Error('Метод scene.leave не был вызван')
    }

    // Создаем тестовый контекст для отмены на шаге 5
    const ctx2 = await setupContext('ru')

    // Устанавливаем данные в сессии
    ctx2.scene.session.contentType = BroadcastContentType.PHOTO
    ctx2.scene.session.photoFileId = TEST_PHOTO_FILE_ID
    ctx2.scene.session.textRu = TEST_TEXT_RU
    ctx2.scene.session.textEn = TEST_TEXT_EN

    // Имитируем callback query для отмены
    ctx2.callbackQuery = {
      data: 'broadcast_cancel',
    }

    // Вызываем пятый шаг визарда с отменой
    await invokeHandler(broadcastWizard.steps[4], ctx2)

    // Проверяем, что был вызван метод reply с сообщением об отмене
    const hasReplyCalls2 = ctx2.reply.mock?.calls?.length > 0
    if (!hasReplyCalls2) {
      throw new Error('Метод reply не был вызван')
    }

    const actualMessage2 = ctx2.reply.mock.calls[0][0]
    if (!actualMessage2.includes('отменена')) {
      throw new Error(
        `Неправильное сообщение: ${actualMessage2}, ожидалось содержание: ${expectedMessage}`
      )
    }

    // Проверяем, что был вызван метод scene.leave
    const hasLeaveCalls2 = ctx2.scene.leave.mock?.calls?.length > 0
    if (!hasLeaveCalls2) {
      throw new Error('Метод scene.leave не был вызван')
    }

    console.log('testBroadcastWizard_Cancel успешно завершен')
    return {
      name: 'testBroadcastWizard_Cancel',
      category: TestCategory.SCENE,
      success: true,
      message: 'Успешная проверка отмены рассылки на разных этапах',
    }
  } catch (error: any) {
    console.error('Ошибка в testBroadcastWizard_Cancel:', error)
    return {
      name: 'testBroadcastWizard_Cancel',
      category: TestCategory.SCENE,
      success: false,
      message: `Ошибка: ${error.message}`,
    }
  }
}

/**
 * Запуск всех тестов для визарда рассылки
 */
export async function runBroadcastWizardTests(): Promise<TestResult[]> {
  console.log('Запуск тестов для визарда рассылки...')

  const results: TestResult[] = []

  // Запускаем все тесты последовательно
  results.push(await testBroadcastWizard_Start())
  results.push(await testBroadcastWizard_SelectContentType())
  results.push(await testBroadcastWizard_UploadPhoto())
  results.push(await testBroadcastWizard_InputText())
  results.push(await testBroadcastWizard_Confirm())
  results.push(await testBroadcastWizard_Cancel())

  // Выводим результаты
  const successCount = results.filter(r => r.success).length
  console.log(
    `Тесты для визарда рассылки завершены: ${successCount}/${results.length} успешно`
  )

  return results
}

export default runBroadcastWizardTests
