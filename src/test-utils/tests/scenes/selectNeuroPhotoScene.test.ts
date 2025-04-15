import { MyContext } from '../../../interfaces'
import { selectNeuroPhotoScene } from '../../../scenes/selectNeuroPhotoScene'
import { createMockContext } from '../../helpers/createMockContext'
import { TestResult } from '../../core/types'
import { ModeEnum } from '../../../price/helpers/modelsCost'
import * as handlers from '../../../handlers'
import { logger } from '../../../utils/logger'

// Функция для создания моков
const mockFn = () => {
  return {
    mockReturnValue: (val: any) => ({
      mock: { calls: [] },
      mockReturnValue: () => val,
    }),
    mock: { calls: [] },
  }
}

// Импортируем необходимые функции для тестирования
const assertReplyContains = (ctx: any, expectedText: string) => {
  const replyCall = ctx.reply.mock.calls.find(
    (call: any[]) =>
      call[0] && typeof call[0] === 'string' && call[0].includes(expectedText)
  )
  if (!replyCall) {
    throw new Error(
      `Expected reply with text containing "${expectedText}" but not found`
    )
  }
}

const assertReplyKeyboard = (ctx: any, expectedButtons: string[][]) => {
  const replyCall = ctx.reply.mock.calls.find(
    (call: any[]) =>
      call[1] && call[1].reply_markup && call[1].reply_markup.keyboard
  )

  if (!replyCall) {
    throw new Error('Expected reply with keyboard but not found')
  }

  const keyboard = replyCall[1].reply_markup.keyboard

  expectedButtons.forEach((expectedRow, rowIndex) => {
    expectedRow.forEach((expectedButton, buttonIndex) => {
      const buttonFound = keyboard.some((row: string[]) =>
        row.some((button: string) => button.includes(expectedButton))
      )
      if (!buttonFound) {
        throw new Error(
          `Expected button "${expectedButton}" but not found in keyboard`
        )
      }
    })
  })
}

/**
 * Вспомогательная функция для создания тестового контекста
 */
const createTestContext = (
  options: { language?: string; text?: string } = {}
) => {
  // Создаем тестового пользователя
  const testUser = {
    telegram_id: '123456789',
    username: 'testuser',
  }

  // Создаем мок контекста с тестовым пользователем
  const ctx = createMockContext({
    user: testUser,
    text: options.text,
  })

  // Добавляем функциональность сцены в контекст
  ;(ctx as any).session = {
    __scenes: {
      current: 'selectNeuroPhotoScene',
      state: {},
    },
    language: options.language || 'en',
    mode: undefined,
  }

  // Добавляем методы сцены
  ;(ctx as any).scene = {
    enter: mockFn(),
    leave: mockFn(),
  }

  // Добавляем методы мастера (для WizardScene)
  ;(ctx as any).wizard = {
    back: mockFn(),
    next: mockFn(),
  }

  return { ctx }
}

/**
 * Функция для выполнения шага сцены
 */
async function executeStep(step: any, ctx: any) {
  if (typeof step === 'function') {
    await step(ctx, async () => Promise.resolve())
  } else if (step && typeof step.middleware === 'function') {
    const middleware = step.middleware()
    await middleware(ctx, async () => Promise.resolve())
  }
}

/**
 * Тестирование входа в сцену выбора нейрофото
 */
export async function testSelectNeuroPhotoScene_EnterScene(): Promise<TestResult> {
  try {
    // Создаем тестовый контекст
    const { ctx } = createTestContext()

    // Вызываем первый обработчик сцены (шаг 0)
    await executeStep(selectNeuroPhotoScene.steps[0], ctx)

    // Проверяем, что сообщение содержит информацию о выборе версии
    assertReplyContains(ctx, 'Which Neuro Photo version')

    // Проверяем, что кнопки содержат нужные опции
    assertReplyKeyboard(ctx, [['Neuro Photo Flux', 'Neuro Photo Flux Pro']])

    return {
      name: 'selectNeuroPhotoScene: Enter Scene',
      success: true,
      message: 'Успешно отображен экран выбора версии нейрофото',
    }
  } catch (error) {
    logger.error('Ошибка в тесте входа в сцену выбора нейрофото:', error)
    return {
      name: 'selectNeuroPhotoScene: Enter Scene',
      success: false,
      message: String(error),
    }
  }
}

/**
 * Тестирование выбора версии Flux
 */
export async function testSelectNeuroPhotoScene_SelectFlux(): Promise<TestResult> {
  try {
    // Создаем тестовый контекст
    const { ctx } = createTestContext({ text: 'Neuro Photo Flux' })

    // Сохраняем оригинальную функцию для восстановления
    const originalHandleHelpCancel = handlers.handleHelpCancel

    // Создаем spy на handleHelpCancel
    const spy = {
      original: originalHandleHelpCancel,
      value: false,
    }

    // Переопределяем функцию для тестирования
    Object.defineProperty(handlers, 'handleHelpCancel', {
      value: async () => spy.value,
      configurable: true,
    })

    // Вызываем обработчик для шага 1
    await executeStep(selectNeuroPhotoScene.steps[1], ctx)

    // Восстанавливаем оригинальную функцию
    Object.defineProperty(handlers, 'handleHelpCancel', {
      value: originalHandleHelpCancel,
      configurable: true,
    })

    // Проверяем, что был установлен правильный режим
    if ((ctx as any).session.mode !== ModeEnum.NeuroPhoto) {
      throw new Error(
        `Expected session.mode to be ${ModeEnum.NeuroPhoto} but got ${(ctx as any).session.mode}`
      )
    }

    // Проверяем, что произошел переход на сцену CheckBalanceScene
    if (
      !(ctx as any).scene.enter.mock.calls.some(
        (call: any[]) => call[0] === ModeEnum.CheckBalanceScene
      )
    ) {
      throw new Error(
        'Expected scene.enter to be called with CheckBalanceScene'
      )
    }

    return {
      name: 'selectNeuroPhotoScene: Select Flux',
      success: true,
      message: 'Успешно обработан выбор версии Flux',
    }
  } catch (error) {
    logger.error('Ошибка в тесте выбора версии Flux:', error)
    return {
      name: 'selectNeuroPhotoScene: Select Flux',
      success: false,
      message: String(error),
    }
  }
}

/**
 * Тестирование выбора версии Flux Pro
 */
export async function testSelectNeuroPhotoScene_SelectFluxPro(): Promise<TestResult> {
  try {
    // Создаем тестовый контекст
    const { ctx } = createTestContext({ text: 'Neuro Photo Flux Pro' })

    // Сохраняем оригинальную функцию для восстановления
    const originalHandleHelpCancel = handlers.handleHelpCancel

    // Создаем spy на handleHelpCancel
    const spy = {
      original: originalHandleHelpCancel,
      value: false,
    }

    // Переопределяем функцию для тестирования
    Object.defineProperty(handlers, 'handleHelpCancel', {
      value: async () => spy.value,
      configurable: true,
    })

    // Вызываем обработчик для шага 1
    await executeStep(selectNeuroPhotoScene.steps[1], ctx)

    // Восстанавливаем оригинальную функцию
    Object.defineProperty(handlers, 'handleHelpCancel', {
      value: originalHandleHelpCancel,
      configurable: true,
    })

    // Проверяем, что был установлен правильный режим
    if ((ctx as any).session.mode !== ModeEnum.NeuroPhotoV2) {
      throw new Error(
        `Expected session.mode to be ${ModeEnum.NeuroPhotoV2} but got ${(ctx as any).session.mode}`
      )
    }

    // Проверяем, что произошел переход на сцену CheckBalanceScene
    if (
      !(ctx as any).scene.enter.mock.calls.some(
        (call: any[]) => call[0] === ModeEnum.CheckBalanceScene
      )
    ) {
      throw new Error(
        'Expected scene.enter to be called with CheckBalanceScene'
      )
    }

    return {
      name: 'selectNeuroPhotoScene: Select Flux Pro',
      success: true,
      message: 'Успешно обработан выбор версии Flux Pro',
    }
  } catch (error) {
    logger.error('Ошибка в тесте выбора версии Flux Pro:', error)
    return {
      name: 'selectNeuroPhotoScene: Select Flux Pro',
      success: false,
      message: String(error),
    }
  }
}

/**
 * Тестирование неверного выбора версии
 */
export async function testSelectNeuroPhotoScene_InvalidSelection(): Promise<TestResult> {
  try {
    // Создаем тестовый контекст
    const { ctx } = createTestContext({ text: 'Invalid Option' })

    // Сохраняем оригинальную функцию для восстановления
    const originalHandleHelpCancel = handlers.handleHelpCancel

    // Создаем spy на handleHelpCancel
    const spy = {
      original: originalHandleHelpCancel,
      value: false,
    }

    // Переопределяем функцию для тестирования
    Object.defineProperty(handlers, 'handleHelpCancel', {
      value: async () => spy.value,
      configurable: true,
    })

    // Вызываем обработчик для шага 1
    await executeStep(selectNeuroPhotoScene.steps[1], ctx)

    // Восстанавливаем оригинальную функцию
    Object.defineProperty(handlers, 'handleHelpCancel', {
      value: originalHandleHelpCancel,
      configurable: true,
    })

    // Проверяем, что было отправлено сообщение об ошибке
    assertReplyContains(ctx, 'Please select a version')

    // Проверяем, что был вызван возврат на предыдущий шаг
    if (!(ctx as any).wizard.back.mock.calls.length) {
      throw new Error('Expected wizard.back to be called')
    }

    return {
      name: 'selectNeuroPhotoScene: Invalid Selection',
      success: true,
      message: 'Успешно обработан неверный выбор версии',
    }
  } catch (error) {
    logger.error('Ошибка в тесте неверного выбора:', error)
    return {
      name: 'selectNeuroPhotoScene: Invalid Selection',
      success: false,
      message: String(error),
    }
  }
}

/**
 * Тестирование команд отмены/помощи
 */
export async function testSelectNeuroPhotoScene_HelpCancel(): Promise<TestResult> {
  try {
    // Создаем тестовый контекст для команды /help
    const { ctx: ctxHelp } = createTestContext({ text: '/help' })

    // Сохраняем оригинальную функцию для восстановления
    const originalHandleHelpCancel = handlers.handleHelpCancel

    // Создаем spy на handleHelpCancel
    const spy = {
      original: originalHandleHelpCancel,
      value: true,
    }

    // Переопределяем функцию для тестирования
    Object.defineProperty(handlers, 'handleHelpCancel', {
      value: async () => spy.value,
      configurable: true,
    })

    // Вызываем обработчик для шага 1
    await executeStep(selectNeuroPhotoScene.steps[1], ctxHelp)

    // Проверяем, что сцена была покинута
    if (!(ctxHelp as any).scene.leave.mock.calls.length) {
      throw new Error('Expected scene.leave to be called for /help command')
    }

    // Создаем тестовый контекст для команды /cancel
    const { ctx: ctxCancel } = createTestContext({ text: '/cancel' })

    // Вызываем обработчик для шага 1
    await executeStep(selectNeuroPhotoScene.steps[1], ctxCancel)

    // Восстанавливаем оригинальную функцию
    Object.defineProperty(handlers, 'handleHelpCancel', {
      value: originalHandleHelpCancel,
      configurable: true,
    })

    // Проверяем, что сцена была покинута
    if (!(ctxCancel as any).scene.leave.mock.calls.length) {
      throw new Error('Expected scene.leave to be called for /cancel command')
    }

    return {
      name: 'selectNeuroPhotoScene: Help/Cancel',
      success: true,
      message: 'Успешно обработаны команды /help и /cancel',
    }
  } catch (error) {
    logger.error('Ошибка в тесте обработки команд отмены/помощи:', error)
    return {
      name: 'selectNeuroPhotoScene: Help/Cancel',
      success: false,
      message: String(error),
    }
  }
}

/**
 * Тестирование локализации сцены
 */
export async function testSelectNeuroPhotoScene_Localization(): Promise<TestResult> {
  try {
    // Создаем тестовый контекст с русским языком
    const { ctx: ctxRussian } = createTestContext({ language: 'ru' })

    // Вызываем первый обработчик сцены
    await executeStep(selectNeuroPhotoScene.steps[0], ctxRussian)

    // Проверяем, что сообщение на русском языке
    assertReplyContains(ctxRussian, 'Какую версию Нейрофото')

    // Проверяем, что кнопки на русском языке
    assertReplyKeyboard(ctxRussian, [['Нейрофото Flux', 'Нейрофото Flux Pro']])

    // Создаем тестовый контекст с английским языком
    const { ctx: ctxEnglish } = createTestContext({ language: 'en' })

    // Вызываем первый обработчик сцены
    await executeStep(selectNeuroPhotoScene.steps[0], ctxEnglish)

    // Проверяем, что сообщение на английском языке
    assertReplyContains(ctxEnglish, 'Which Neuro Photo version')

    // Проверяем, что кнопки на английском языке
    assertReplyKeyboard(ctxEnglish, [
      ['Neuro Photo Flux', 'Neuro Photo Flux Pro'],
    ])

    return {
      name: 'selectNeuroPhotoScene: Localization',
      success: true,
      message: 'Локализация сцены работает корректно',
    }
  } catch (error) {
    logger.error('Ошибка в тесте локализации:', error)
    return {
      name: 'selectNeuroPhotoScene: Localization',
      success: false,
      message: String(error),
    }
  }
}

/**
 * Тестирование обработки сообщения без текста
 */
export async function testSelectNeuroPhotoScene_NoTextMessage(): Promise<TestResult> {
  try {
    // Создаем тестовый контекст без текста
    const { ctx } = createTestContext()

    // Модифицируем сообщение, чтобы удалить текст
    delete (ctx.message as any).text

    // Сохраняем оригинальную функцию для восстановления
    const originalHandleHelpCancel = handlers.handleHelpCancel

    // Переопределяем функцию для тестирования
    Object.defineProperty(handlers, 'handleHelpCancel', {
      value: async () => false,
      configurable: true,
    })

    // Вызываем обработчик для шага 1
    await executeStep(selectNeuroPhotoScene.steps[1], ctx)

    // Восстанавливаем оригинальную функцию
    Object.defineProperty(handlers, 'handleHelpCancel', {
      value: originalHandleHelpCancel,
      configurable: true,
    })

    // Проверяем, что было отправлено сообщение об ошибке для сообщения без текста
    const expectedText = 'Please select a version using the buttons'
    assertReplyContains(ctx, expectedText)

    // Проверяем, что был вызван возврат на предыдущий шаг
    if (!(ctx as any).wizard.back.mock.calls.length) {
      throw new Error('Expected wizard.back to be called')
    }

    return {
      name: 'selectNeuroPhotoScene: No Text Message',
      success: true,
      message: 'Успешно обработан случай сообщения без текста',
    }
  } catch (error) {
    logger.error('Ошибка в тесте обработки сообщения без текста:', error)
    return {
      name: 'selectNeuroPhotoScene: No Text Message',
      success: false,
      message: String(error),
    }
  }
}

/**
 * Тестирование распознавания ключевых слов в сообщении
 */
export async function testSelectNeuroPhotoScene_KeywordRecognition(): Promise<TestResult> {
  try {
    // Тестируем разные варианты фраз для выбора Flux
    const fluxVariants = [
      'I want flux',
      'choose flux please',
      'FLUX',
      'I prefer the basic flux version',
    ]

    for (const text of fluxVariants) {
      // Создаем тестовый контекст
      const { ctx } = createTestContext({ text })

      // Сохраняем оригинальную функцию для восстановления
      const originalHandleHelpCancel = handlers.handleHelpCancel

      // Переопределяем функцию для тестирования
      Object.defineProperty(handlers, 'handleHelpCancel', {
        value: async () => false,
        configurable: true,
      })

      // Вызываем обработчик для шага 1
      await executeStep(selectNeuroPhotoScene.steps[1], ctx)

      // Восстанавливаем оригинальную функцию
      Object.defineProperty(handlers, 'handleHelpCancel', {
        value: originalHandleHelpCancel,
        configurable: true,
      })

      // Проверяем, что был установлен правильный режим
      if ((ctx as any).session.mode !== ModeEnum.NeuroPhoto) {
        throw new Error(
          `Expected session.mode to be ${ModeEnum.NeuroPhoto} for text "${text}" but got ${(ctx as any).session.mode}`
        )
      }
    }

    // Тестируем разные варианты фраз для выбора Flux Pro
    const fluxProVariants = [
      'I want pro',
      'choose pro please',
      'FLUX PRO',
      'I prefer the advanced flux pro version',
    ]

    for (const text of fluxProVariants) {
      // Создаем тестовый контекст
      const { ctx } = createTestContext({ text })

      // Сохраняем оригинальную функцию для восстановления
      const originalHandleHelpCancel = handlers.handleHelpCancel

      // Переопределяем функцию для тестирования
      Object.defineProperty(handlers, 'handleHelpCancel', {
        value: async () => false,
        configurable: true,
      })

      // Вызываем обработчик для шага 1
      await executeStep(selectNeuroPhotoScene.steps[1], ctx)

      // Восстанавливаем оригинальную функцию
      Object.defineProperty(handlers, 'handleHelpCancel', {
        value: originalHandleHelpCancel,
        configurable: true,
      })

      // Проверяем, что был установлен правильный режим
      if ((ctx as any).session.mode !== ModeEnum.NeuroPhotoV2) {
        throw new Error(
          `Expected session.mode to be ${ModeEnum.NeuroPhotoV2} for text "${text}" but got ${(ctx as any).session.mode}`
        )
      }
    }

    return {
      name: 'selectNeuroPhotoScene: Keyword Recognition',
      success: true,
      message: 'Успешно распознаны ключевые слова во всех вариантах фраз',
    }
  } catch (error) {
    logger.error('Ошибка в тесте распознавания ключевых слов:', error)
    return {
      name: 'selectNeuroPhotoScene: Keyword Recognition',
      success: false,
      message: String(error),
    }
  }
}

/**
 * Тестирование интеграции с CheckBalanceScene
 */
export async function testSelectNeuroPhotoScene_CheckBalanceIntegration(): Promise<TestResult> {
  try {
    // Создаем тестовый контекст
    const { ctx } = createTestContext({ text: 'Neuro Photo Flux' })

    // Сохраняем оригинальную функцию для восстановления
    const originalHandleHelpCancel = handlers.handleHelpCancel

    // Переопределяем функцию для тестирования
    Object.defineProperty(handlers, 'handleHelpCancel', {
      value: async () => false,
      configurable: true,
    })

    // Вызываем обработчик для шага 1
    await executeStep(selectNeuroPhotoScene.steps[1], ctx)

    // Восстанавливаем оригинальную функцию
    Object.defineProperty(handlers, 'handleHelpCancel', {
      value: originalHandleHelpCancel,
      configurable: true,
    })

    // Проверяем, что режим был установлен
    if ((ctx as any).session.mode !== ModeEnum.NeuroPhoto) {
      throw new Error(
        `Expected session.mode to be ${ModeEnum.NeuroPhoto} but got ${(ctx as any).session.mode}`
      )
    }

    // Проверяем, что произошел переход на сцену CheckBalanceScene
    const enterCalls = (ctx as any).scene.enter.mock.calls
    if (!enterCalls.length) {
      throw new Error('Expected scene.enter to be called')
    }

    const balanceSceneCall = enterCalls.find(
      (call: any[]) => call[0] === ModeEnum.CheckBalanceScene
    )

    if (!balanceSceneCall) {
      throw new Error(
        `Expected scene.enter to be called with ${ModeEnum.CheckBalanceScene} but got ${enterCalls
          .map((call: any[]) => call[0])
          .join(', ')}`
      )
    }

    return {
      name: 'selectNeuroPhotoScene: CheckBalance Integration',
      success: true,
      message: 'Успешно проверена интеграция с CheckBalanceScene',
    }
  } catch (error) {
    logger.error('Ошибка в тесте интеграции с CheckBalanceScene:', error)
    return {
      name: 'selectNeuroPhotoScene: CheckBalance Integration',
      success: false,
      message: String(error),
    }
  }
}

/**
 * Тестирование обработки пустой строки
 */
export async function testSelectNeuroPhotoScene_EmptyString(): Promise<TestResult> {
  try {
    // Создаем тестовый контекст с пустой строкой
    const { ctx } = createTestContext({ text: '' })

    // Сохраняем оригинальную функцию для восстановления
    const originalHandleHelpCancel = handlers.handleHelpCancel

    // Переопределяем функцию для тестирования
    Object.defineProperty(handlers, 'handleHelpCancel', {
      value: async () => false,
      configurable: true,
    })

    // Вызываем обработчик для шага 1
    await executeStep(selectNeuroPhotoScene.steps[1], ctx)

    // Восстанавливаем оригинальную функцию
    Object.defineProperty(handlers, 'handleHelpCancel', {
      value: originalHandleHelpCancel,
      configurable: true,
    })

    // Проверяем, что пользователю было отправлено сообщение о некорректном выборе
    assertReplyContains(ctx, 'Invalid option')

    return {
      name: 'selectNeuroPhotoScene: Empty String',
      success: true,
      message: 'Успешно обработана пустая строка',
    }
  } catch (error) {
    logger.error('Ошибка в тесте обработки пустой строки:', error)
    return {
      name: 'selectNeuroPhotoScene: Empty String',
      success: false,
      message: String(error),
    }
  }
}

/**
 * Тестирование обработки специальных символов
 */
export async function testSelectNeuroPhotoScene_SpecialCharacters(): Promise<TestResult> {
  try {
    // Создаем тестовый контекст со специальными символами
    const { ctx } = createTestContext({ text: '!@#$%^&*()_+' })

    // Сохраняем оригинальную функцию для восстановления
    const originalHandleHelpCancel = handlers.handleHelpCancel

    // Переопределяем функцию для тестирования
    Object.defineProperty(handlers, 'handleHelpCancel', {
      value: async () => false,
      configurable: true,
    })

    // Вызываем обработчик для шага 1
    await executeStep(selectNeuroPhotoScene.steps[1], ctx)

    // Восстанавливаем оригинальную функцию
    Object.defineProperty(handlers, 'handleHelpCancel', {
      value: originalHandleHelpCancel,
      configurable: true,
    })

    // Проверяем, что пользователю было отправлено сообщение о некорректном выборе
    assertReplyContains(ctx, 'Invalid option')

    return {
      name: 'selectNeuroPhotoScene: Special Characters',
      success: true,
      message: 'Успешно обработаны специальные символы',
    }
  } catch (error) {
    logger.error('Ошибка в тесте обработки специальных символов:', error)
    return {
      name: 'selectNeuroPhotoScene: Special Characters',
      success: false,
      message: String(error),
    }
  }
}

/**
 * Тестирование обработки очень длинного ввода
 */
export async function testSelectNeuroPhotoScene_VeryLongInput(): Promise<TestResult> {
  try {
    // Создаем тестовый контекст с очень длинным вводом
    const { ctx } = createTestContext({
      text: 'This is a very long input that exceeds normal message length limits and should still be properly handled by the scene. '.repeat(
        10
      ),
    })

    // Сохраняем оригинальную функцию для восстановления
    const originalHandleHelpCancel = handlers.handleHelpCancel

    // Переопределяем функцию для тестирования
    Object.defineProperty(handlers, 'handleHelpCancel', {
      value: async () => false,
      configurable: true,
    })

    // Вызываем обработчик для шага 1
    await executeStep(selectNeuroPhotoScene.steps[1], ctx)

    // Восстанавливаем оригинальную функцию
    Object.defineProperty(handlers, 'handleHelpCancel', {
      value: originalHandleHelpCancel,
      configurable: true,
    })

    // Проверяем, что пользователю было отправлено сообщение о некорректном выборе
    assertReplyContains(ctx, 'Invalid option')

    return {
      name: 'selectNeuroPhotoScene: Very Long Input',
      success: true,
      message: 'Успешно обработан очень длинный ввод',
    }
  } catch (error) {
    logger.error('Ошибка в тесте обработки очень длинного ввода:', error)
    return {
      name: 'selectNeuroPhotoScene: Very Long Input',
      success: false,
      message: String(error),
    }
  }
}

/**
 * Тестирование сохранения состояния между шагами
 */
export async function testSelectNeuroPhotoScene_StatePersistence(): Promise<TestResult> {
  try {
    // Создаем тестовый контекст
    const { ctx } = createTestContext()

    // Устанавливаем начальное состояние
    ;(ctx as any).session.__scenes.state = {
      testValue: 'test-state-persistence',
    }

    // Вызываем первый обработчик сцены
    await executeStep(selectNeuroPhotoScene.steps[0], ctx)

    // Проверяем, что состояние сохранилось
    if (
      (ctx as any).session.__scenes.state.testValue !== 'test-state-persistence'
    ) {
      throw new Error('Expected session state to persist between steps')
    }

    return {
      name: 'selectNeuroPhotoScene: State Persistence',
      success: true,
      message: 'Успешно сохранено состояние между шагами',
    }
  } catch (error) {
    logger.error('Ошибка в тесте сохранения состояния:', error)
    return {
      name: 'selectNeuroPhotoScene: State Persistence',
      success: false,
      message: String(error),
    }
  }
}

/**
 * Запуск всех тестов сцены выбора нейрофото
 */
export async function runSelectNeuroPhotoSceneTests(): Promise<TestResult[]> {
  console.log(
    '🧪 Запуск тестов сцены выбора нейрофото (selectNeuroPhotoScene)...'
  )

  const results: TestResult[] = []

  try {
    results.push(await testSelectNeuroPhotoScene_EnterScene())
    results.push(await testSelectNeuroPhotoScene_SelectFlux())
    results.push(await testSelectNeuroPhotoScene_SelectFluxPro())
    results.push(await testSelectNeuroPhotoScene_InvalidSelection())
    results.push(await testSelectNeuroPhotoScene_HelpCancel())
    results.push(await testSelectNeuroPhotoScene_Localization())
    results.push(await testSelectNeuroPhotoScene_NoTextMessage())
    results.push(await testSelectNeuroPhotoScene_KeywordRecognition())
    results.push(await testSelectNeuroPhotoScene_CheckBalanceIntegration())

    // Добавляем новые тесты для достижения 100% покрытия
    results.push(await testSelectNeuroPhotoScene_EmptyString())
    results.push(await testSelectNeuroPhotoScene_SpecialCharacters())
    results.push(await testSelectNeuroPhotoScene_VeryLongInput())
    results.push(await testSelectNeuroPhotoScene_StatePersistence())
  } catch (error) {
    console.error('❌ Ошибка при запуске тестов selectNeuroPhotoScene:', error)
    results.push({
      name: 'selectNeuroPhotoScene Tests',
      success: false,
      message: String(error),
    })
  }

  // Вывод результатов
  const successful = results.filter(r => r.success).length
  const failed = results.length - successful

  console.log(
    `📊 Результаты тестов selectNeuroPhotoScene: всего ${results.length}, успешно ${successful}, с ошибками ${failed}`
  )

  return results
}

// Запускаем тесты, если файл запущен напрямую
if (require.main === module) {
  runSelectNeuroPhotoSceneTests()
    .then(() => {
      console.log('✅ Тесты selectNeuroPhotoScene завершены')
    })
    .catch(error => {
      console.error(
        '❌ Критическая ошибка при запуске тестов selectNeuroPhotoScene:',
        error
      )
      process.exit(1)
    })
}
