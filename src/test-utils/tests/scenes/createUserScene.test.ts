import { MyContext } from '@/interfaces'
import { TestResult } from '@/test-utils/core/types'
import { TestCategory } from '@/test-utils/core/categories'
import mockApi from '@/test-utils/core/mock'
import { createMockContext } from '@/test-utils/helpers/createMockContext'
import { createUserScene } from '@/scenes/createUserScene'
import { logger } from '@/utils/logger'
import * as supabaseModule from '@/core/supabase'
import { ModeEnum } from '@/price/helpers/modelsCost'

// Создаем моки для функций из core/supabase
const mockCreateUser = mockApi.create({
  name: 'createUser',
  implementation: async (userData: any) => ({
    id: 'test-user-id',
    ...userData,
  }),
})

const mockGetReferalsCountAndUserData = mockApi.create({
  name: 'getReferalsCountAndUserData',
  implementation: async (telegram_id: string) => ({
    userData: {
      user_id: 'referrer-user-id',
      username: 'referrer-username',
    },
    count: 5,
    subscription: 'stars',
    level: 1,
    isExist: true,
  }),
})

const mockGetUserByTelegramIdString = mockApi.create({
  name: 'getUserByTelegramIdString',
  implementation: async (telegram_id: string) => ({
    user_id: 'test-user-id',
    username: 'test-username',
    telegram_id,
  }),
})

/**
 * Настройка тестового окружения
 */
const setupTest = () => {
  // Переопределяем функции для тестов
  ;(supabaseModule as any).createUser = mockCreateUser
  ;(supabaseModule as any).getReferalsCountAndUserData =
    mockGetReferalsCountAndUserData
  ;(supabaseModule as any).getUserByTelegramIdString =
    mockGetUserByTelegramIdString

  // Сбрасываем историю вызовов моков
  mockCreateUser.mock.clear()
  mockGetReferalsCountAndUserData.mock.clear()
  mockGetUserByTelegramIdString.mock.clear()
}

/**
 * Создание тестового контекста
 */
const createTestContext = (
  options: { startCommand?: string; inviteCode?: string } = {}
) => {
  const startCommand = options.startCommand || '/start'

  // Создаем тестового пользователя
  const testUser = {
    id: 123456789,
    telegram_id: '123456789',
    username: 'testuser',
    first_name: 'Test',
    last_name: 'User',
    language_code: 'en',
    is_bot: false,
  }

  // Создаем мок контекста с тестовым пользователем и текстом сообщения
  const ctx = createMockContext({
    user: testUser,
    text: startCommand,
  }) as unknown as MyContext

  // Имитируем botInfo
  Object.defineProperty(ctx, 'botInfo', {
    get: () => ({
      id: 987654321,
      first_name: 'Test Bot',
      username: 'neuro_blogger_bot',
      is_bot: true,
    }),
  })

  // Имитируем telegram для вызова sendMessage
  const sendMessageMock = mockApi.create({
    name: 'sendMessage',
    implementation: async () => true,
  })

  Object.defineProperty(ctx, 'telegram', {
    get: () => ({
      sendMessage: sendMessageMock,
    }),
  })

  // Добавляем поле chat
  ctx.chat = {
    id: 123456789,
    type: 'private',
    first_name: 'Test',
    last_name: 'User',
    username: 'testuser',
  } as any

  // Добавляем функциональность сцены в контекст
  ctx.session = {
    __scenes: {
      current: ModeEnum.CreateUserScene,
      state: {},
    },
    inviteCode: options.inviteCode,
  } as any

  // Создаем моки для методов сцены
  const enterMock = mockApi.create({
    name: 'scene.enter',
    implementation: async () => true,
  })

  const leaveMock = mockApi.create({
    name: 'scene.leave',
    implementation: async () => true,
  })

  // Добавляем методы для работы со сценой
  ctx.scene = {
    enter: enterMock,
    leave: leaveMock,
  } as any

  // Мокируем методы Telegraf для проверки отправленных сообщений
  const replyMock = mockApi.create({
    name: 'reply',
    implementation: async () => true,
  })

  ctx.reply = replyMock as any

  // Добавляем message с текстом
  ctx.message = {
    message_id: 123,
    date: Date.now(),
    chat: ctx.chat,
    from: testUser,
    text: startCommand,
  } as any

  return {
    ctx,
    replyMock,
    sendMessageMock,
    enterMock,
    leaveMock,
  }
}

/**
 * Проверка наличия определенного текста в сообщении
 */
const assertReplyContains = (
  replyMock: any,
  expectedText: string,
  errorMessage: string
) => {
  // Проверяем все вызовы метода reply
  const calls = replyMock?.mock?.calls || []
  const replyCall = calls.find(
    (call: any[]) =>
      call &&
      Array.isArray(call) &&
      call[0] &&
      typeof call[0] === 'string' &&
      call[0].includes(expectedText)
  )

  if (!replyCall) {
    throw new Error(errorMessage)
  }
}

/**
 * Тест для создания нового пользователя без реферальной ссылки
 */
export async function testCreateUserScene_CreateUserWithoutReferral(): Promise<TestResult> {
  const testName = 'createUserScene: Create User Without Referral'

  try {
    logger.info(`[TEST] Начало теста: ${testName}`)
    setupTest()

    // Создаем тестовый контекст
    const { ctx, replyMock, enterMock, sendMessageMock } = createTestContext({
      startCommand: '/start',
    })

    // Получаем обработчик для сцены
    const handlers = createUserScene.steps
    if (!handlers || !handlers.length) {
      throw new Error('Не найдены обработчики сцены createUserScene')
    }

    // Вызываем обработчик создания пользователя
    await handlers[0](ctx)

    // Проверяем, что был вызван метод createUser
    if (mockCreateUser.mock.calls.length === 0) {
      throw new Error('Метод createUser не был вызван')
    }

    // Проверяем, что создан пользователь с правильными данными
    const createUserCall = mockCreateUser.mock.calls[0][0]
    if (!createUserCall || createUserCall.telegram_id !== '123456789') {
      throw new Error('Метод createUser был вызван с неверными параметрами')
    }

    // Проверяем, что был вызван метод sendMessage для уведомления канала
    if (sendMessageMock.mock.calls.length === 0) {
      throw new Error('Метод sendMessage не был вызван')
    }

    // Проверяем, что было отправлено сообщение о успешном создании аватара
    assertReplyContains(
      replyMock,
      'created successfully',
      'Сообщение о успешном создании аватара не найдено'
    )

    // Проверяем, что был вызван метод scene.enter для перехода на следующую сцену
    const enterCalls = enterMock.mock.calls
    if (enterCalls.length === 0) {
      throw new Error('Метод scene.enter не был вызван')
    }

    if (enterCalls[0][0] !== ModeEnum.SubscriptionCheckScene) {
      throw new Error(
        `Неверная сцена: ожидалась '${ModeEnum.SubscriptionCheckScene}', получена '${enterCalls[0][0]}'`
      )
    }

    logger.info(`[TEST] Тест успешно завершен: ${testName}`)
    return {
      name: testName,
      category: TestCategory.All,
      success: true,
      message:
        'Тест создания пользователя без реферальной ссылки успешно выполнен',
    }
  } catch (error) {
    logger.error(`[TEST] Ошибка в тесте ${testName}:`, error)
    return {
      name: testName,
      category: TestCategory.All,
      success: false,
      message: `Ошибка в тесте: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
}

/**
 * Тест для создания пользователя с реферальной ссылкой
 */
export async function testCreateUserScene_CreateUserWithReferral(): Promise<TestResult> {
  const testName = 'createUserScene: Create User With Referral'

  try {
    logger.info(`[TEST] Начало теста: ${testName}`)
    setupTest()

    // Создаем тестовый контекст с реферальным кодом
    const { ctx, replyMock, enterMock, sendMessageMock } = createTestContext({
      startCommand: '/start 987654321',
      inviteCode: '987654321',
    })

    // Получаем обработчик для сцены
    const handlers = createUserScene.steps
    if (!handlers || !handlers.length) {
      throw new Error('Не найдены обработчики сцены createUserScene')
    }

    // Вызываем обработчик создания пользователя
    await handlers[0](ctx)

    // Проверяем, что был вызван метод getReferalsCountAndUserData для получения данных пригласившего
    if (mockGetReferalsCountAndUserData.mock.calls.length === 0) {
      throw new Error('Метод getReferalsCountAndUserData не был вызван')
    }

    // Проверяем, что был вызван метод createUser
    if (mockCreateUser.mock.calls.length === 0) {
      throw new Error('Метод createUser не был вызван')
    }

    // Проверяем, что sendMessage был вызван для уведомления реферера
    if (sendMessageMock.mock.calls.length < 2) {
      throw new Error(
        'Метод sendMessage не был вызван для уведомления реферера'
      )
    }

    // Одно из сообщений должно быть отправлено пригласившему пользователю
    const hasMessageToReferrer = sendMessageMock.mock.calls.some(
      call => call[0] === '987654321'
    )

    if (!hasMessageToReferrer) {
      throw new Error('Сообщение пригласившему пользователю не было отправлено')
    }

    // Проверяем, что было отправлено сообщение о успешном создании аватара
    assertReplyContains(
      replyMock,
      'created successfully',
      'Сообщение о успешном создании аватара не найдено'
    )

    // Проверяем, что был вызван метод scene.enter для перехода на следующую сцену
    const enterCalls = enterMock.mock.calls
    if (enterCalls.length === 0) {
      throw new Error('Метод scene.enter не был вызван')
    }

    if (enterCalls[0][0] !== ModeEnum.SubscriptionCheckScene) {
      throw new Error(
        `Неверная сцена: ожидалась '${ModeEnum.SubscriptionCheckScene}', получена '${enterCalls[0][0]}'`
      )
    }

    logger.info(`[TEST] Тест успешно завершен: ${testName}`)
    return {
      name: testName,
      category: TestCategory.All,
      success: true,
      message:
        'Тест создания пользователя с реферальной ссылкой успешно выполнен',
    }
  } catch (error) {
    logger.error(`[TEST] Ошибка в тесте ${testName}:`, error)
    return {
      name: testName,
      category: TestCategory.All,
      success: false,
      message: `Ошибка в тесте: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
}

/**
 * Тест для обработки ошибки - отсутствие информации о пользователе
 */
export async function testCreateUserScene_HandleMissingUserData(): Promise<TestResult> {
  const testName = 'createUserScene: Handle Missing User Data'

  try {
    logger.info(`[TEST] Начало теста: ${testName}`)
    setupTest()

    // Создаем тестовый контекст без данных пользователя
    const { ctx, replyMock } = createTestContext()

    // Получаем обработчик для сцены
    const handlers = createUserScene.steps
    if (!handlers || !handlers.length) {
      throw new Error('Не найдены обработчики сцены createUserScene')
    }

    // Удаляем данные о пользователе
    ;(ctx as any).from = undefined

    // Проверяем, что обработчик корректно обрабатывает ошибку
    try {
      await handlers[0](ctx)
      throw new Error('Ожидалась ошибка из-за отсутствия данных пользователя')
    } catch (error) {
      // Проверяем, что ошибка содержит ожидаемое сообщение
      if (
        !(error instanceof Error) ||
        !error.message.includes('User data not found')
      ) {
        throw new Error(
          `Неожиданный текст ошибки: ${error instanceof Error ? error.message : String(error)}`
        )
      }
    }

    logger.info(`[TEST] Тест успешно завершен: ${testName}`)
    return {
      name: testName,
      category: TestCategory.All,
      success: true,
      message:
        'Тест обработки ошибки при отсутствии данных пользователя успешно выполнен',
    }
  } catch (error) {
    logger.error(`[TEST] Ошибка в тесте ${testName}:`, error)
    return {
      name: testName,
      category: TestCategory.All,
      success: false,
      message: `Ошибка в тесте: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
}

/**
 * Тест для обработки ошибки - отсутствие текста сообщения
 */
export async function testCreateUserScene_HandleMissingMessageText(): Promise<TestResult> {
  const testName = 'createUserScene: Handle Missing Message Text'

  try {
    logger.info(`[TEST] Начало теста: ${testName}`)
    setupTest()

    // Создаем тестовый контекст
    const { ctx, replyMock } = createTestContext()

    // Получаем обработчик для сцены
    const handlers = createUserScene.steps
    if (!handlers || !handlers.length) {
      throw new Error('Не найдены обработчики сцены createUserScene')
    }

    // Удаляем текст сообщения
    ctx.message = {
      ...ctx.message,
      text: undefined,
    } as any

    // Проверяем, что обработчик корректно обрабатывает ошибку
    try {
      await handlers[0](ctx)
      throw new Error('Ожидалась ошибка из-за отсутствия текста сообщения')
    } catch (error) {
      // Проверяем, что ошибка содержит ожидаемое сообщение
      if (
        !(error instanceof Error) ||
        !error.message.includes('Message text not found')
      ) {
        throw new Error(
          `Неожиданный текст ошибки: ${error instanceof Error ? error.message : String(error)}`
        )
      }
    }

    logger.info(`[TEST] Тест успешно завершен: ${testName}`)
    return {
      name: testName,
      category: TestCategory.All,
      success: true,
      message:
        'Тест обработки ошибки при отсутствии текста сообщения успешно выполнен',
    }
  } catch (error) {
    logger.error(`[TEST] Ошибка в тесте ${testName}:`, error)
    return {
      name: testName,
      category: TestCategory.All,
      success: false,
      message: `Ошибка в тесте: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
}

/**
 * Тест для создания пользователя с полной реферальной ссылкой
 */
export async function testCreateUserScene_CreateUserWithFullReferralLink(): Promise<TestResult> {
  const testName = 'createUserScene: Create User With Full Referral Link'

  try {
    logger.info(`[TEST] Начало теста: ${testName}`)
    setupTest()

    // Создаем тестовый контекст с полной реферальной ссылкой
    const { ctx, replyMock, enterMock } = createTestContext({
      startCommand: '/start https://t.me/neuro_blogger_bot?start=987654321',
    })

    // Получаем обработчик для сцены
    const handlers = createUserScene.steps
    if (!handlers || !handlers.length) {
      throw new Error('Не найдены обработчики сцены createUserScene')
    }

    // Вызываем обработчик создания пользователя
    await handlers[0](ctx)

    // Проверяем, что был вызван метод createUser
    if (mockCreateUser.mock.calls.length === 0) {
      throw new Error('Метод createUser не был вызван')
    }

    // Проверяем, что создан пользователь с правильным именем бота
    const createUserCall = mockCreateUser.mock.calls[0][0]
    if (!createUserCall || createUserCall.bot_name !== 'neuro_blogger_bot') {
      throw new Error('Метод createUser был вызван с неверным именем бота')
    }

    // Проверяем, что был установлен код приглашения
    if (ctx.session.inviteCode !== '987654321') {
      throw new Error('Не был установлен код приглашения')
    }

    // Проверяем, что было отправлено сообщение о успешном создании аватара
    assertReplyContains(
      replyMock,
      'created successfully',
      'Сообщение о успешном создании аватара не найдено'
    )

    logger.info(`[TEST] Тест успешно завершен: ${testName}`)
    return {
      name: testName,
      category: TestCategory.All,
      success: true,
      message:
        'Тест создания пользователя с полной реферальной ссылкой успешно выполнен',
    }
  } catch (error) {
    logger.error(`[TEST] Ошибка в тесте ${testName}:`, error)
    return {
      name: testName,
      category: TestCategory.All,
      success: false,
      message: `Ошибка в тесте: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
}
