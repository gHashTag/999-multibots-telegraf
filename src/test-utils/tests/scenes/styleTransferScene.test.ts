import { Scenes } from 'telegraf'
import { Update } from 'telegraf/typings/core/types/typegram'
import { MyContext } from '@/interfaces'
import { createMockContext } from '@/test-utils/telegraf-mocks'
import { MockFunction, invokeHandler } from '@/test-utils/mocks'
import { TestResult, TestCategory } from '@/test-utils/types'
import { styleTransferScene } from '@/scenes/styleTransferScene'
import * as languageModule from '@/helpers/language'
import * as styleTransferModule from '@/services/styleTransfer'

// Интерфейс контекста для тестирования
interface TestContext extends MyContext {
  scene: {
    enter: MockFunction
    leave: MockFunction
    reenter: MockFunction
  }
  reply: MockFunction
  replyWithPhoto: MockFunction
  replyWithMarkdown: MockFunction
  replies?: Array<{ text?: string; photo?: string; extra?: any }>
  session: {
    styleTransfer?: {
      sourceImage?: string
      styleImage?: string
      strength?: number
    }
    [key: string]: any
  }
  from?: {
    id: number
    language_code?: string
  }
  message?: {
    text?: string
    message_id?: number
    photo?: Array<{
      file_id: string
      file_unique_id: string
      width: number
      height: number
      file_size?: number
    }>
  }
  wizard?: {
    next: MockFunction
    back: MockFunction
    selectStep: MockFunction
    cursor: number
  }
  telegram: {
    getFile: MockFunction
    getFileLink: MockFunction
  }
}

// Константы для тестирования
const TEST_USER_ID = 12345678
const TEST_FILE_ID = 'test-file-id-123456'
const TEST_FILE_PATH = 'photos/test-image.jpg'
const TEST_PHOTO_URL = `https://api.telegram.org/file/bot123456:ABC-DEF/photos/test-image.jpg`
const TEST_RESULT_URL = 'https://example.com/result-image.jpg'

/**
 * Настраивает контекст для тестирования
 * @param params Параметры для настройки контекста
 */
function setupContext(params: {
  language?: string
  messageText?: string
  hasPhoto?: boolean
  step?: number
  sourceImage?: string
  styleImage?: string
  strength?: number
}): TestContext {
  // Настройка языка
  const isRussian = params.language !== 'en'
  jest.spyOn(languageModule, 'isRussian').mockReturnValue(isRussian)

  // Создание мок-контекста
  const ctx = createMockContext() as TestContext

  // Настройка методов сцены
  ctx.scene.enter = jest.fn().mockResolvedValue(true)
  ctx.scene.leave = jest.fn().mockResolvedValue(true)
  ctx.scene.reenter = jest.fn().mockResolvedValue(true)

  // Настройка телеграм методов
  ctx.telegram = {
    getFile: jest.fn().mockResolvedValue({ file_path: TEST_FILE_PATH }),
    getFileLink: jest.fn().mockResolvedValue(TEST_PHOTO_URL),
  } as any

  // Настройка reply и хранение ответов
  ctx.reply = jest.fn().mockImplementation((text: string, extra?: any) => {
    console.log(`[Мок] reply вызван с текстом: ${text}`)
    if (!ctx.replies) {
      ctx.replies = []
    }
    ctx.replies.push({ text, extra })
    return true
  })

  ctx.replyWithPhoto = jest
    .fn()
    .mockImplementation((photo: string, extra?: any) => {
      console.log(`[Мок] replyWithPhoto вызван с фото: ${photo}`)
      if (!ctx.replies) {
        ctx.replies = []
      }
      ctx.replies.push({ photo, extra })
      return true
    })

  ctx.replyWithMarkdown = jest
    .fn()
    .mockImplementation((text: string, extra?: any) => {
      console.log(`[Мок] replyWithMarkdown вызван с текстом: ${text}`)
      if (!ctx.replies) {
        ctx.replies = []
      }
      ctx.replies.push({ text, extra })
      return true
    })

  // Настройка session
  ctx.session = {}

  if (!ctx.session.styleTransfer) {
    ctx.session.styleTransfer = {}
  }

  if (params.sourceImage) {
    ctx.session.styleTransfer.sourceImage = params.sourceImage
  }

  if (params.styleImage) {
    ctx.session.styleTransfer.styleImage = params.styleImage
  }

  if (params.strength !== undefined) {
    ctx.session.styleTransfer.strength = params.strength
  }

  // Настройка from
  ctx.from = {
    id: TEST_USER_ID,
    language_code: params.language === 'en' ? 'en' : 'ru',
  }

  // Настройка message
  ctx.message = {
    message_id: 1,
  }

  if (params.messageText) {
    ctx.message.text = params.messageText
  }

  if (params.hasPhoto) {
    ctx.message.photo = [
      {
        file_id: 'small-' + TEST_FILE_ID,
        file_unique_id: 'unique-small',
        width: 100,
        height: 100,
        file_size: 1024,
      },
      {
        file_id: TEST_FILE_ID,
        file_unique_id: 'unique-id',
        width: 800,
        height: 600,
        file_size: 102400,
      },
    ]
  }

  // Настройка wizard
  if (params.step !== undefined) {
    ctx.wizard = {
      next: jest.fn().mockReturnValue(undefined),
      back: jest.fn().mockReturnValue(undefined),
      selectStep: jest.fn().mockReturnValue(undefined),
      cursor: params.step,
    }
  }

  // Мок для styleTransfer
  jest.spyOn(styleTransferModule, 'applyStyleTransfer').mockResolvedValue({
    success: true,
    resultUrl: TEST_RESULT_URL,
  })

  return ctx
}

/**
 * Тест входа в сцену Style Transfer (русский язык)
 */
async function testStyleTransferScene_Enter(): Promise<TestResult> {
  console.log('🧪 Запуск теста: testStyleTransferScene_Enter')

  try {
    // Настройка контекста
    const ctx = setupContext({ language: 'ru' })

    // Вызов обработчика входа
    await invokeHandler(styleTransferScene.enterHandler, ctx as any)

    // Проверки
    if (ctx.reply.mock.calls.length === 0) {
      return {
        name: 'Вход в сцену Style Transfer (RU)',
        category: TestCategory.SCENE,
        success: false,
        message: 'Метод reply не был вызван',
      }
    }

    const replyText = ctx.replies?.[0]?.text
    if (!replyText || !replyText.includes('Отправьте изображение')) {
      return {
        name: 'Вход в сцену Style Transfer (RU)',
        category: TestCategory.SCENE,
        success: false,
        message: `Неверное сообщение: ${replyText}`,
      }
    }

    // Проверяем, что сессия была инициализирована
    if (!ctx.session.styleTransfer) {
      return {
        name: 'Вход в сцену Style Transfer (RU)',
        category: TestCategory.SCENE,
        success: false,
        message: 'Сессия не была инициализирована',
      }
    }

    return {
      name: 'Вход в сцену Style Transfer (RU)',
      category: TestCategory.SCENE,
      success: true,
      message:
        'Сцена корректно отображает приветственное сообщение на русском языке',
    }
  } catch (error) {
    console.error('Ошибка в testStyleTransferScene_Enter:', error)
    return {
      name: 'Вход в сцену Style Transfer (RU)',
      category: TestCategory.SCENE,
      success: false,
      message: 'Ошибка при тестировании входа в сцену',
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

/**
 * Тест входа в сцену Style Transfer (английский язык)
 */
async function testStyleTransferScene_EnterEnglish(): Promise<TestResult> {
  console.log('🧪 Запуск теста: testStyleTransferScene_EnterEnglish')

  try {
    // Настройка контекста
    const ctx = setupContext({ language: 'en' })

    // Вызов обработчика входа
    await invokeHandler(styleTransferScene.enterHandler, ctx as any)

    // Проверки
    if (ctx.reply.mock.calls.length === 0) {
      return {
        name: 'Вход в сцену Style Transfer (EN)',
        category: TestCategory.SCENE,
        success: false,
        message: 'Метод reply не был вызван',
      }
    }

    const replyText = ctx.replies?.[0]?.text
    if (!replyText || !replyText.includes('Send the image')) {
      return {
        name: 'Вход в сцену Style Transfer (EN)',
        category: TestCategory.SCENE,
        success: false,
        message: `Неверное сообщение: ${replyText}`,
      }
    }

    return {
      name: 'Вход в сцену Style Transfer (EN)',
      category: TestCategory.SCENE,
      success: true,
      message:
        'Сцена корректно отображает приветственное сообщение на английском языке',
    }
  } catch (error) {
    console.error('Ошибка в testStyleTransferScene_EnterEnglish:', error)
    return {
      name: 'Вход в сцену Style Transfer (EN)',
      category: TestCategory.SCENE,
      success: false,
      message: 'Ошибка при тестировании входа в сцену на английском',
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

/**
 * Тест первого шага - загрузка исходного изображения
 */
async function testStyleTransferScene_UploadSourceImage(): Promise<TestResult> {
  console.log('🧪 Запуск теста: testStyleTransferScene_UploadSourceImage')

  try {
    // Настройка контекста
    const ctx = setupContext({
      language: 'ru',
      hasPhoto: true,
      step: 0,
    })

    // Вызов обработчика первого шага
    await invokeHandler(styleTransferScene.stepHandlers[0], ctx as any)

    // Проверки
    if (ctx.telegram.getFile.mock.calls.length === 0) {
      return {
        name: 'Загрузка исходного изображения',
        category: TestCategory.SCENE,
        success: false,
        message: 'Метод telegram.getFile не был вызван',
      }
    }

    if (!ctx.session.styleTransfer?.sourceImage) {
      return {
        name: 'Загрузка исходного изображения',
        category: TestCategory.SCENE,
        success: false,
        message: 'Исходное изображение не было сохранено в сессии',
      }
    }

    if (ctx.session.styleTransfer.sourceImage !== TEST_PHOTO_URL) {
      return {
        name: 'Загрузка исходного изображения',
        category: TestCategory.SCENE,
        success: false,
        message: `Неверный URL изображения: ${ctx.session.styleTransfer.sourceImage}`,
      }
    }

    if (ctx.reply.mock.calls.length === 0) {
      return {
        name: 'Загрузка исходного изображения',
        category: TestCategory.SCENE,
        success: false,
        message: 'Метод reply не был вызван',
      }
    }

    const replyText = ctx.replies?.[0]?.text
    if (!replyText || !replyText.includes('стиль')) {
      return {
        name: 'Загрузка исходного изображения',
        category: TestCategory.SCENE,
        success: false,
        message: `Неверное сообщение: ${replyText}`,
      }
    }

    if (!ctx.wizard?.next.mock.calls.length) {
      return {
        name: 'Загрузка исходного изображения',
        category: TestCategory.SCENE,
        success: false,
        message: 'Метод wizard.next не был вызван',
      }
    }

    return {
      name: 'Загрузка исходного изображения',
      category: TestCategory.SCENE,
      success: true,
      message: 'Сцена корректно обрабатывает загрузку исходного изображения',
    }
  } catch (error) {
    console.error('Ошибка в testStyleTransferScene_UploadSourceImage:', error)
    return {
      name: 'Загрузка исходного изображения',
      category: TestCategory.SCENE,
      success: false,
      message: 'Ошибка при тестировании загрузки исходного изображения',
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

/**
 * Тест первого шага - нет фото
 */
async function testStyleTransferScene_NoSourceImage(): Promise<TestResult> {
  console.log('🧪 Запуск теста: testStyleTransferScene_NoSourceImage')

  try {
    // Настройка контекста
    const ctx = setupContext({
      language: 'ru',
      hasPhoto: false,
      messageText: 'Это текст, а не фото',
      step: 0,
    })

    // Вызов обработчика первого шага
    await invokeHandler(styleTransferScene.stepHandlers[0], ctx as any)

    // Проверки
    if (ctx.reply.mock.calls.length === 0) {
      return {
        name: 'Отсутствие исходного изображения',
        category: TestCategory.SCENE,
        success: false,
        message: 'Метод reply не был вызван',
      }
    }

    const replyText = ctx.replies?.[0]?.text
    if (
      !replyText ||
      (!replyText.includes('Пожалуйста, отправьте изображение') &&
        !replyText.includes('фото'))
    ) {
      return {
        name: 'Отсутствие исходного изображения',
        category: TestCategory.SCENE,
        success: false,
        message: `Неверное сообщение: ${replyText}`,
      }
    }

    if (ctx.wizard?.next.mock.calls.length > 0) {
      return {
        name: 'Отсутствие исходного изображения',
        category: TestCategory.SCENE,
        success: false,
        message: 'Метод wizard.next был вызван несмотря на отсутствие фото',
      }
    }

    return {
      name: 'Отсутствие исходного изображения',
      category: TestCategory.SCENE,
      success: true,
      message: 'Сцена корректно обрабатывает отсутствие исходного изображения',
    }
  } catch (error) {
    console.error('Ошибка в testStyleTransferScene_NoSourceImage:', error)
    return {
      name: 'Отсутствие исходного изображения',
      category: TestCategory.SCENE,
      success: false,
      message: 'Ошибка при тестировании отсутствия исходного изображения',
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

/**
 * Тест второго шага - загрузка изображения стиля
 */
async function testStyleTransferScene_UploadStyleImage(): Promise<TestResult> {
  console.log('🧪 Запуск теста: testStyleTransferScene_UploadStyleImage')

  try {
    // Настройка контекста
    const ctx = setupContext({
      language: 'ru',
      hasPhoto: true,
      step: 1,
      sourceImage: TEST_PHOTO_URL,
    })

    // Вызов обработчика второго шага
    await invokeHandler(styleTransferScene.stepHandlers[1], ctx as any)

    // Проверки
    if (ctx.telegram.getFile.mock.calls.length === 0) {
      return {
        name: 'Загрузка изображения стиля',
        category: TestCategory.SCENE,
        success: false,
        message: 'Метод telegram.getFile не был вызван',
      }
    }

    if (!ctx.session.styleTransfer?.styleImage) {
      return {
        name: 'Загрузка изображения стиля',
        category: TestCategory.SCENE,
        success: false,
        message: 'Изображение стиля не было сохранено в сессии',
      }
    }

    if (ctx.session.styleTransfer.styleImage !== TEST_PHOTO_URL) {
      return {
        name: 'Загрузка изображения стиля',
        category: TestCategory.SCENE,
        success: false,
        message: `Неверный URL изображения: ${ctx.session.styleTransfer.styleImage}`,
      }
    }

    if (ctx.reply.mock.calls.length === 0) {
      return {
        name: 'Загрузка изображения стиля',
        category: TestCategory.SCENE,
        success: false,
        message: 'Метод reply не был вызван',
      }
    }

    const replyText = ctx.replies?.[0]?.text
    if (!replyText || !replyText.includes('силу')) {
      return {
        name: 'Загрузка изображения стиля',
        category: TestCategory.SCENE,
        success: false,
        message: `Неверное сообщение: ${replyText}`,
      }
    }

    if (!ctx.wizard?.next.mock.calls.length) {
      return {
        name: 'Загрузка изображения стиля',
        category: TestCategory.SCENE,
        success: false,
        message: 'Метод wizard.next не был вызван',
      }
    }

    return {
      name: 'Загрузка изображения стиля',
      category: TestCategory.SCENE,
      success: true,
      message: 'Сцена корректно обрабатывает загрузку изображения стиля',
    }
  } catch (error) {
    console.error('Ошибка в testStyleTransferScene_UploadStyleImage:', error)
    return {
      name: 'Загрузка изображения стиля',
      category: TestCategory.SCENE,
      success: false,
      message: 'Ошибка при тестировании загрузки изображения стиля',
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

/**
 * Тест третьего шага - выбор силы эффекта
 */
async function testStyleTransferScene_SelectStrength(): Promise<TestResult> {
  console.log('🧪 Запуск теста: testStyleTransferScene_SelectStrength')

  try {
    // Настройка контекста
    const ctx = setupContext({
      language: 'ru',
      messageText: '75',
      step: 2,
      sourceImage: TEST_PHOTO_URL,
      styleImage: TEST_PHOTO_URL,
    })

    // Вызов обработчика третьего шага
    await invokeHandler(styleTransferScene.stepHandlers[2], ctx as any)

    // Проверки
    if (!ctx.session.styleTransfer?.strength) {
      return {
        name: 'Выбор силы эффекта',
        category: TestCategory.SCENE,
        success: false,
        message: 'Сила эффекта не была сохранена в сессии',
      }
    }

    if (ctx.session.styleTransfer.strength !== 75) {
      return {
        name: 'Выбор силы эффекта',
        category: TestCategory.SCENE,
        success: false,
        message: `Неверное значение силы эффекта: ${ctx.session.styleTransfer.strength}`,
      }
    }

    if (ctx.reply.mock.calls.length === 0) {
      return {
        name: 'Выбор силы эффекта',
        category: TestCategory.SCENE,
        success: false,
        message: 'Метод reply не был вызван',
      }
    }

    const replyText = ctx.replies?.[0]?.text
    if (!replyText || !replyText.includes('Обработка')) {
      return {
        name: 'Выбор силы эффекта',
        category: TestCategory.SCENE,
        success: false,
        message: `Неверное сообщение: ${replyText}`,
      }
    }

    if (styleTransferModule.applyStyleTransfer.mock.calls.length === 0) {
      return {
        name: 'Выбор силы эффекта',
        category: TestCategory.SCENE,
        success: false,
        message: 'Метод applyStyleTransfer не был вызван',
      }
    }

    const styleTransferArgs =
      styleTransferModule.applyStyleTransfer.mock.calls[0]
    if (
      !styleTransferArgs ||
      styleTransferArgs[0] !== TEST_PHOTO_URL ||
      styleTransferArgs[1] !== TEST_PHOTO_URL ||
      styleTransferArgs[2] !== 75
    ) {
      return {
        name: 'Выбор силы эффекта',
        category: TestCategory.SCENE,
        success: false,
        message: `Неверные аргументы вызова applyStyleTransfer: ${JSON.stringify(styleTransferArgs)}`,
      }
    }

    // Проверяем отправку результата
    let resultSent = false
    for (const reply of ctx.replies || []) {
      if (reply.photo === TEST_RESULT_URL) {
        resultSent = true
        break
      }
    }

    if (!resultSent) {
      return {
        name: 'Выбор силы эффекта',
        category: TestCategory.SCENE,
        success: false,
        message: 'Результат не был отправлен в чат',
      }
    }

    if (!ctx.scene.leave.mock.calls.length) {
      return {
        name: 'Выбор силы эффекта',
        category: TestCategory.SCENE,
        success: false,
        message: 'Метод scene.leave не был вызван',
      }
    }

    return {
      name: 'Выбор силы эффекта',
      category: TestCategory.SCENE,
      success: true,
      message:
        'Сцена корректно обрабатывает выбор силы эффекта и отправляет результат',
    }
  } catch (error) {
    console.error('Ошибка в testStyleTransferScene_SelectStrength:', error)
    return {
      name: 'Выбор силы эффекта',
      category: TestCategory.SCENE,
      success: false,
      message: 'Ошибка при тестировании выбора силы эффекта',
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

/**
 * Тест третьего шага - некорректный выбор силы эффекта
 */
async function testStyleTransferScene_InvalidStrength(): Promise<TestResult> {
  console.log('🧪 Запуск теста: testStyleTransferScene_InvalidStrength')

  try {
    // Настройка контекста
    const ctx = setupContext({
      language: 'ru',
      messageText: 'сильно',
      step: 2,
      sourceImage: TEST_PHOTO_URL,
      styleImage: TEST_PHOTO_URL,
    })

    // Вызов обработчика третьего шага
    await invokeHandler(styleTransferScene.stepHandlers[2], ctx as any)

    // Проверки
    if (ctx.reply.mock.calls.length === 0) {
      return {
        name: 'Неверный ввод силы эффекта',
        category: TestCategory.SCENE,
        success: false,
        message: 'Метод reply не был вызван',
      }
    }

    const replyText = ctx.replies?.[0]?.text
    if (!replyText || !replyText.includes('числ')) {
      return {
        name: 'Неверный ввод силы эффекта',
        category: TestCategory.SCENE,
        success: false,
        message: `Неверное сообщение: ${replyText}`,
      }
    }

    if (styleTransferModule.applyStyleTransfer.mock.calls.length > 0) {
      return {
        name: 'Неверный ввод силы эффекта',
        category: TestCategory.SCENE,
        success: false,
        message:
          'Метод applyStyleTransfer был вызван несмотря на неверный ввод',
      }
    }

    if (ctx.scene.leave.mock.calls.length > 0) {
      return {
        name: 'Неверный ввод силы эффекта',
        category: TestCategory.SCENE,
        success: false,
        message: 'Метод scene.leave был вызван несмотря на неверный ввод',
      }
    }

    return {
      name: 'Неверный ввод силы эффекта',
      category: TestCategory.SCENE,
      success: true,
      message: 'Сцена корректно обрабатывает неверный ввод силы эффекта',
    }
  } catch (error) {
    console.error('Ошибка в testStyleTransferScene_InvalidStrength:', error)
    return {
      name: 'Неверный ввод силы эффекта',
      category: TestCategory.SCENE,
      success: false,
      message: 'Ошибка при тестировании неверного ввода силы эффекта',
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

/**
 * Тест обработки ошибки при применении стиля
 */
async function testStyleTransferScene_StyleTransferError(): Promise<TestResult> {
  console.log('🧪 Запуск теста: testStyleTransferScene_StyleTransferError')

  try {
    // Настройка контекста
    const ctx = setupContext({
      language: 'ru',
      messageText: '75',
      step: 2,
      sourceImage: TEST_PHOTO_URL,
      styleImage: TEST_PHOTO_URL,
    })

    // Мок ошибки при применении стиля
    jest.spyOn(styleTransferModule, 'applyStyleTransfer').mockResolvedValue({
      success: false,
      error: 'Ошибка обработки изображения',
    })

    // Вызов обработчика третьего шага
    await invokeHandler(styleTransferScene.stepHandlers[2], ctx as any)

    // Проверки
    if (ctx.reply.mock.calls.length === 0) {
      return {
        name: 'Ошибка при применении стиля',
        category: TestCategory.SCENE,
        success: false,
        message: 'Метод reply не был вызван',
      }
    }

    let errorMessageSent = false
    for (const reply of ctx.replies || []) {
      if (
        reply.text &&
        (reply.text.includes('ошибка') || reply.text.includes('Ошибка'))
      ) {
        errorMessageSent = true
        break
      }
    }

    if (!errorMessageSent) {
      return {
        name: 'Ошибка при применении стиля',
        category: TestCategory.SCENE,
        success: false,
        message: 'Сообщение об ошибке не было отправлено',
      }
    }

    if (!ctx.scene.leave.mock.calls.length) {
      return {
        name: 'Ошибка при применении стиля',
        category: TestCategory.SCENE,
        success: false,
        message: 'Метод scene.leave не был вызван',
      }
    }

    return {
      name: 'Ошибка при применении стиля',
      category: TestCategory.SCENE,
      success: true,
      message: 'Сцена корректно обрабатывает ошибку при применении стиля',
    }
  } catch (error) {
    console.error('Ошибка в testStyleTransferScene_StyleTransferError:', error)
    return {
      name: 'Ошибка при применении стиля',
      category: TestCategory.SCENE,
      success: false,
      message: 'Ошибка при тестировании ошибки применения стиля',
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

/**
 * Выполнение всех тестов сцены styleTransferScene
 */
export async function runStyleTransferSceneTests(): Promise<TestResult[]> {
  console.log('🚀 Запуск всех тестов для styleTransferScene')

  const results: TestResult[] = []

  try {
    // Запуск всех тестов
    results.push(await testStyleTransferScene_Enter())
    results.push(await testStyleTransferScene_EnterEnglish())
    results.push(await testStyleTransferScene_UploadSourceImage())
    results.push(await testStyleTransferScene_NoSourceImage())
    results.push(await testStyleTransferScene_UploadStyleImage())
    results.push(await testStyleTransferScene_SelectStrength())
    results.push(await testStyleTransferScene_InvalidStrength())
    results.push(await testStyleTransferScene_StyleTransferError())

    // Вывод статистики
    const successCount = results.filter(r => r.success).length
    console.log(`✅ Успешно: ${successCount}/${results.length} тестов`)

    results
      .filter(r => !r.success)
      .forEach(r => {
        console.error(`❌ Тест "${r.name}" не прошел: ${r.message}`)
        if (r.error) console.error(`   Ошибка: ${r.error}`)
      })

    return results
  } catch (error) {
    console.error('❌ Критическая ошибка при выполнении тестов:', error)
    results.push({
      name: 'Выполнение всех тестов styleTransferScene',
      category: TestCategory.SCENE,
      success: false,
      message: 'Критическая ошибка при выполнении тестов',
      error: error instanceof Error ? error.message : String(error),
    })

    return results
  }
}

// Экспорт функции запуска тестов и отдельных тестов для возможности индивидуального запуска
export default runStyleTransferSceneTests
