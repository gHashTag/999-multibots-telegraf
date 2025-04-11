import { logger } from '@/utils/logger'

/**
 * Функция для создания мок-функции, которую можно использовать вместо jest.fn()
 * @param returnValue - Значение, которое должна вернуть мок-функция
 * @returns Мок-функция
 */
export function createMockFn<T = any>(returnValue?: T) {
  const calls: any[][] = []
  let implementation: Function | null = null

  const fn = (...args: any[]) => {
    calls.push(args)
    if (implementation) {
      return implementation(...args)
    }
    return returnValue
  }

  fn.mock = {
    calls,
    instances: [],
    invocationCallOrder: [],
    results: [],
  }

  fn.mockClear = () => {
    calls.length = 0
    fn.mock.instances.length = 0
    fn.mock.invocationCallOrder.length = 0
  }

  fn.mockReset = () => {
    fn.mockClear()
    implementation = null
  }

  fn.mockRestore = () => {
    fn.mockClear()
    implementation = null
  }

  fn.mockReturnValue = (value: any) => {
    returnValue = value
    return fn
  }

  fn.mockResolvedValue = (value: any) => {
    return fn.mockReturnValue(Promise.resolve(value))
  }

  fn.mockRejectedValue = (error: any) => {
    return fn.mockReturnValue(Promise.reject(error))
  }

  fn.mockImplementation = (impl: Function) => {
    implementation = impl
    return fn
  }

  Object.defineProperty(fn, 'mock', {
    writable: true,
    value: {
      calls,
      instances: [],
      invocationCallOrder: [],
      results: [],
    },
  })

  return fn
}

/**
 * Мок-объект телеграм-бота для тестирования сцен
 */
export class MockTelegram {
  token = 'mock-token'
  sentMessages: Array<{
    chatId: string | number
    text: string
    options?: any
  }> = []

  // Реализация методов Telegram API
  sendMessage = createMockFn().mockImplementation(
    async (chatId: string | number, text: string, options?: any) => {
      logger.info('🤖 Мок-бот отправляет сообщение:', {
        description: 'Mock bot sending message',
        chatId,
        text,
        options,
      })
      this.sentMessages.push({ chatId, text, options })
      return { message_id: Date.now(), chat: { id: chatId }, text }
    }
  )

  sendPhoto = createMockFn().mockImplementation(
    async (chatId: string | number, photo: any, options?: any) => {
      logger.info('🤖 Мок-бот отправляет фото:', {
        description: 'Mock bot sending photo',
        chatId,
        photoType: typeof photo,
        options,
      })
      return { message_id: Date.now(), chat: { id: chatId } }
    }
  )

  sendVideo = createMockFn().mockImplementation(
    async (chatId: string | number, video: any, options?: any) => {
      logger.info('🤖 Мок-бот отправляет видео:', {
        description: 'Mock bot sending video',
        chatId,
        videoType: typeof video,
        options,
      })
      return { message_id: Date.now(), chat: { id: chatId } }
    }
  )

  deleteMessage = createMockFn().mockImplementation(
    async (chatId: string | number, messageId: number) => {
      logger.info('🤖 Мок-бот удаляет сообщение:', {
        description: 'Mock bot deleting message',
        chatId,
        messageId,
      })
      return true
    }
  )

  editMessageText = createMockFn().mockImplementation(
    async (text: string, options?: any) => {
      logger.info('🤖 Мок-бот редактирует сообщение:', {
        description: 'Mock bot editing message',
        text,
        options,
      })
      return true
    }
  )

  getMe = createMockFn().mockResolvedValue({
    id: 123456789,
    is_bot: true,
    first_name: 'Тестовый Бот',
    username: 'test_bot',
    can_join_groups: true,
    can_read_all_group_messages: true,
    supports_inline_queries: false,
  })

  getFile = createMockFn().mockResolvedValue({
    file_id: 'test-file-id',
    file_size: 1024,
    file_path: 'test-file-path',
  })

  getFileLink = createMockFn().mockResolvedValue(
    'https://example.com/test-file-path'
  )

  getUpdates = createMockFn().mockResolvedValue([])
}

/**
 * Мок-класс для сцен Telegraf
 */
export class MockScene {
  state: Record<string, any> = {}
  current: string | undefined = undefined

  enter = createMockFn().mockImplementation(
    async (sceneId: string, defaultState?: any, silent?: boolean) => {
      logger.info(`🎬 Вход в сцену [${sceneId}]`, {
        description: `Entering scene [${sceneId}]`,
        defaultState,
        silent,
      })
      this.current = sceneId
      this.state = defaultState || {}
      return Promise.resolve()
    }
  )

  reenter = createMockFn().mockImplementation(async () => {
    logger.info('🔄 Повторный вход в сцену', {
      description: 'Re-entering scene',
    })
    return Promise.resolve()
  })

  leave = createMockFn().mockImplementation(async () => {
    logger.info(`🚪 Выход из сцены [${this.current}]`, {
      description: `Leaving scene [${this.current}]`,
    })
    this.current = undefined
    return Promise.resolve()
  })
}

/**
 * Мок-объект для Telegraf
 */
export class MockTelegraf {
  telegram: MockTelegram

  constructor(token?: string) {
    this.telegram = new MockTelegram()
    if (token) {
      this.telegram.token = token
    }
  }

  launch = createMockFn().mockImplementation(async () => {
    logger.info('🚀 Мок-бот запущен', { description: 'Mock bot launched' })
    return Promise.resolve()
  })

  stop = createMockFn().mockImplementation(async () => {
    logger.info('🛑 Мок-бот остановлен', { description: 'Mock bot stopped' })
    return Promise.resolve()
  })
}

/**
 * Создает мок-бот для тестирования
 */
export function createMockBot(token?: string): MockTelegraf {
  return new MockTelegraf(token)
}

/**
 * Создает мок-объект Inngest
 */
export const createMockInngest = () => {
  return {
    send: createMockFn().mockResolvedValue({
      id: 'mock-event-id',
      ts: new Date().toISOString(),
    }),
  }
}

// Экспортируем экземпляр мока для Inngest
export const inngestMock = createMockInngest()
