import { MyContext } from '@/interfaces/telegram-bot.interface'
import { createMockBot, MockTelegraf } from '../mocks/botMock'
import { logger } from '@/utils/logger'

/**
 * Создает мок-контекст Telegram для тестирования сцен
 * @param options - Опции для настройки контекста
 * @returns Мок-контекст MyContext
 */
export function createMockContext(options: {
  userId?: number
  username?: string
  firstName?: string
  lastName?: string
  languageCode?: string
  sessionData?: Partial<MyContext['session']>
  messageText?: string
  mockReplies?: boolean
  chatId?: number
}): MyContext {
  const {
    userId = 12345678,
    username = 'test_user',
    firstName = 'Test',
    lastName = 'User',
    languageCode = 'ru',
    sessionData = {},
    messageText = '',
    mockReplies = true,
    chatId = userId,
  } = options

  const mockBot = createMockBot('mock_token') as MockTelegraf
  const sentReplies: any[] = []

  const mockContext: Partial<MyContext> = {
    telegram: mockBot.telegram,
    from: {
      id: userId,
      is_bot: false,
      first_name: firstName,
      last_name: lastName,
      username: username,
      language_code: languageCode,
    },
    chat: {
      id: chatId,
      type: 'private',
      first_name: firstName,
      last_name: lastName,
      username: username,
    },
    message: messageText
      ? {
          message_id: 1,
          from: {
            id: userId,
            is_bot: false,
            first_name: firstName,
            last_name: lastName,
            username: username,
            language_code: languageCode,
          },
          chat: {
            id: chatId,
            type: 'private',
            first_name: firstName,
            last_name: lastName,
            username: username,
          },
          date: Math.floor(Date.now() / 1000),
          text: messageText,
        }
      : undefined,
    session: {
      __scenes: {
        current: undefined,
        state: {},
      },
      ...sessionData,
    },
    scene: {
      state: {},
      enter: async (sceneId: string, defaultState?: any, silent?: boolean) => {
        logger.info(`🎬 Вход в сцену [${sceneId}]`, {
          description: `Entering scene [${sceneId}]`,
          defaultState,
          silent,
        })
        mockContext.session!.__scenes.current = sceneId
        mockContext.session!.__scenes.state = defaultState || {}
        return Promise.resolve()
      },
      reenter: async () => {
        logger.info('🔄 Повторный вход в сцену', {
          description: 'Re-entering scene',
        })
        return Promise.resolve()
      },
      leave: async () => {
        const currentScene = mockContext.session!.__scenes.current
        logger.info(`🚪 Выход из сцены [${currentScene}]`, {
          description: `Leaving scene [${currentScene}]`,
        })
        mockContext.session!.__scenes.current = undefined
        return Promise.resolve()
      },
    },
  }

  // Добавляем метод reply, если требуется мокирование ответов
  if (mockReplies) {
    mockContext.reply = async (text: string, extra?: any) => {
      const reply = { text, extra, timestamp: Date.now() }
      sentReplies.push(reply)
      logger.info('📩 Мок-ответ бота:', {
        description: 'Mock bot reply',
        text,
        extra,
      })
      return { message_id: sentReplies.length } as any
    }

    // Добавляем доступ к отправленным ответам для проверки в тестах
    ;(mockContext as any).sentReplies = sentReplies
  }

  return mockContext as MyContext
}
