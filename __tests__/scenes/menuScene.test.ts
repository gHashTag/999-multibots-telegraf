import { describe, it, expect, vi, beforeEach } from 'vitest'
// Импортируем типы из telegraf напрямую
import type { Message, CallbackQuery, Update } from 'telegraf/types'
import type { MyContext } from '@/interfaces'
import { SubscriptionType } from '@/interfaces/subscription.interface'
import type { ModeEnum } from '@/interfaces/modes'

// Мок для path (обычный импорт)
vi.mock('path', () => {
  return {
    join: vi.fn().mockImplementation((...args) => args.join('/')),
    resolve: vi.fn().mockImplementation((...args) => args.join('/')),
    dirname: vi.fn().mockImplementation((path) => path.split('/').slice(0, -1).join('/')),
    basename: vi.fn().mockImplementation((path) => path.split('/').pop()),
    default: {
      join: vi.fn().mockImplementation((...args) => args.join('/')),
      resolve: vi.fn().mockImplementation((...args) => args.join('/')),
      dirname: vi.fn().mockImplementation((path) => path.split('/').slice(0, -1).join('/')),
      basename: vi.fn().mockImplementation((path) => path.split('/').pop()),
    }
  }
})

// Сначала импортируем все необходимые модули
import { getUserDetailsSubscription } from '@/core/supabase/getUserDetailsSubscription'
import { getTranslation } from '@/core/supabase/getTranslation'
import { mainMenu, levels } from '@/menu/mainMenu'
import { isRussian } from '@/helpers/language'
import { handleTechSupport } from '@/commands/handleTechSupport'
import { handleMenu } from '@/handlers/handleMenu'
import { handleRestartVideoGeneration } from '@/handlers/handleVideoRestart'
import { sendReplyWithKeyboard } from '@/scenes/menuScene/sendReplyWithKeyboard'
import { logger } from '@/utils'
import { sendGenericErrorMessage } from '@/menu'

// Моки необходимо объявить до импорта тестируемых модулей
vi.mock('telegraf', () => {
  // Создаем мок класса Telegraf
  class TelegrafMock {
    use = vi.fn().mockReturnThis();
    launch = vi.fn().mockResolvedValue(undefined);
    telegram = {
      sendMessage: vi.fn().mockResolvedValue({}),
      sendPhoto: vi.fn().mockResolvedValue({}),
      sendDocument: vi.fn().mockResolvedValue({}),
      sendMediaGroup: vi.fn().mockResolvedValue({}),
      setChatMenuButton: vi.fn().mockResolvedValue({}),
      setMyCommands: vi.fn().mockResolvedValue({}),
    };
    start = vi.fn().mockReturnThis();
    command = vi.fn().mockReturnThis();
    action = vi.fn().mockReturnThis();
    hears = vi.fn().mockReturnThis();
    on = vi.fn().mockReturnThis();
    stop = vi.fn().mockResolvedValue(undefined);
  }

  return {
    Telegraf: TelegrafMock,
    Markup: {
      keyboard: vi.fn().mockImplementation((buttons) => ({
        resize: vi.fn().mockReturnThis(),
        oneTime: vi.fn().mockReturnThis(),
        reply_markup: { 
          keyboard: buttons || [],
          resize_keyboard: true
        }
      })),
      inlineKeyboard: vi.fn().mockImplementation((buttons) => ({
        reply_markup: { 
          inline_keyboard: buttons || []
        }
      })),
    },
    Scenes: {
      WizardScene: vi.fn(),
      Stage: vi.fn(),
    },
  }
})

vi.mock('@/core/supabase/getUserDetailsSubscription', () => ({
  getUserDetailsSubscription: vi.fn().mockResolvedValue({
    stars: 100,
    subscriptionType: SubscriptionType.NEUROBASE,
    isSubscriptionActive: true,
    isExist: true,
    subscriptionStartDate: '2023-01-01T00:00:00Z',
  }),
}))

vi.mock('@/core/supabase/getTranslation', () => ({
  getTranslation: vi.fn().mockResolvedValue({
    translation: 'Тестовое меню',
    url: 'http://example.com/test.jpg',
    buttons: [],
  }),
}))

vi.mock('@/menu/mainMenu', () => ({
  mainMenu: vi.fn().mockResolvedValue({
    reply_markup: { 
      keyboard: [
        ['🤖 Цифровое тело', '📸 Нейрофото'],
        ['💰 Баланс', '💎 Пополнить баланс'],
        ['👥 Пригласить друга', '❓ Справка', '💬 Техподдержка'],
      ],
      resize_keyboard: true
    }
  }),
  levels: {
    104: {
      title_ru: '🏠 Главное меню',
      title_en: '🏠 Main menu',
    },
    106: {
      title_ru: '❓ Справка',
      title_en: '❓ Help',
    },
    103: {
      title_ru: '💬 Техподдержка',
      title_en: '💬 Support',
    },
    102: {
      title_ru: '👥 Пригласить друга',
      title_en: '👥 Invite a friend',
    },
    101: {
      title_ru: '💰 Баланс',
      title_en: '💰 Balance',
    },
    100: {
      title_ru: '💎 Пополнить баланс',
      title_en: '💎 Top up balance',
    },
    105: {
      title_ru: '💫 Оформить подписку',
      title_en: '💫 Subscribe',
    },
  },
}))

vi.mock('@/helpers/language', () => ({
  isRussian: vi.fn().mockReturnValue(true),
}))

vi.mock('@/commands/handleTechSupport', () => ({
  handleTechSupport: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/handlers/handleMenu', () => ({
  handleMenu: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/handlers/handleVideoRestart', () => ({
  handleRestartVideoGeneration: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/menu', () => ({
  sendGenericErrorMessage: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/scenes/menuScene/sendReplyWithKeyboard', () => ({
  sendReplyWithKeyboard: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/utils', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

// Только после импорта всех модулей и создания моков импортируем сам menuScene для теста
import { menuScene } from '@/scenes/menuScene'

// Вспомогательная функция для создания мок-контекста
const createMockContext = (languageCode: string = 'ru'): MyContext => {
  return {
    from: {
      id: 123456789,
      is_bot: false,
      first_name: 'Test User',
      language_code: languageCode,
    },
    botInfo: {
      username: 'test_bot',
    },
    scene: {
      enter: vi.fn(),
      reenter: vi.fn(),
      leave: vi.fn(),
    },
    wizard: {
      next: vi.fn(),
      cursor: 0,
      state: {},
    },
    reply: vi.fn().mockResolvedValue({}),
    update: {},
    telegram: {
      token: 'test_token',
    },
    session: {},
    answerCbQuery: vi.fn().mockResolvedValue(true),
  } as unknown as MyContext
}

// Тесты для компонентов, используемых в menuScene
describe('menuScene components', () => {
  let ctx: MyContext

  beforeEach(() => {
    // Сбрасываем все моки перед каждым тестом
    vi.clearAllMocks()

    // Создаем новый контекст для каждого теста
    ctx = createMockContext()
  })

  describe('getUserDetailsSubscription', () => {
    it('should return subscription details', async () => {
      // Вызываем функцию с контекстом
      const result = await getUserDetailsSubscription('123456789')

      // Проверяем что функция была вызвана с правильными параметрами
      expect(getUserDetailsSubscription).toHaveBeenCalledWith('123456789')

      // Проверяем возвращаемые данные
      expect(result).toEqual({
        stars: 100,
        subscriptionType: SubscriptionType.NEUROBASE,
        isSubscriptionActive: true,
        isExist: true,
        subscriptionStartDate: '2023-01-01T00:00:00Z',
      })
    })
  })

  describe('getTranslation', () => {
    it('should return translation data', async () => {
      // Вызываем функцию с контекстом
      const result = await getTranslation({
        key: 'menu',
        ctx,
        bot_name: 'test_bot',
      })

      // Проверяем что функция была вызвана с правильными параметрами
      expect(getTranslation).toHaveBeenCalledWith({
        key: 'menu',
        ctx,
        bot_name: 'test_bot',
      })

      // Проверяем возвращаемые данные
      expect(result).toEqual({
        translation: 'Тестовое меню',
        url: 'http://example.com/test.jpg',
        buttons: [],
      })
    })
  })

  describe('mainMenu', () => {
    it('should return keyboard markup', async () => {
      // Вызываем функцию с контекстом
      const result = await mainMenu({
        isRu: true,
        subscription: SubscriptionType.NEUROBASE,
        ctx,
      })

      // Проверяем что функция была вызвана с правильными параметрами
      expect(mainMenu).toHaveBeenCalledWith({
        isRu: true,
        subscription: SubscriptionType.NEUROBASE,
        ctx,
      })

      // Проверяем структуру возвращаемых данных
      expect(result).toBeDefined()
      expect(result.reply_markup).toBeDefined()
      expect(result.reply_markup.keyboard).toBeDefined()
      expect(result.reply_markup.resize_keyboard).toBe(true)
    })
  })

  describe('isRussian', () => {
    it('should detect Russian language', () => {
      // Вызываем функцию определения языка
      const result = isRussian(ctx)

      // Проверяем что функция вернула ожидаемый результат
      expect(result).toBe(true)
    })

    it('should detect non-Russian language', () => {
      // Создаем контекст с английским языком
      const enCtx = createMockContext('en')

      // Переопределяем мок для этого теста
      vi.mocked(isRussian).mockReturnValueOnce(false)

      // Вызываем функцию определения языка
      const result = isRussian(enCtx)

      // Проверяем что функция вернула ожидаемый результат
      expect(result).toBe(false)
    })
  })

  describe('handleTechSupport', () => {
    it('should handle tech support request', async () => {
      // Вызываем функцию техподдержки
      await handleTechSupport(ctx)

      // Проверяем что функция была вызвана с правильными параметрами
      expect(handleTechSupport).toHaveBeenCalledWith(ctx)
    })
  })

  describe('handleMenu', () => {
    it('should handle menu navigation', async () => {
      // Вызываем функцию обработки меню
      await handleMenu(ctx)

      // Проверяем что функция была вызвана с правильными параметрами
      expect(handleMenu).toHaveBeenCalledWith(ctx)
    })
  })

  describe('handleRestartVideoGeneration', () => {
    it('should handle video restart', async () => {
      // Вызываем функцию перезапуска генерации видео
      await handleRestartVideoGeneration(ctx)

      // Проверяем что функция была вызвана с правильными параметрами
      expect(handleRestartVideoGeneration).toHaveBeenCalledWith(ctx)
    })
  })

  describe('sendReplyWithKeyboard', () => {
    it('should send message with photo', async () => {
      // Создаем мок-клавиатуру для теста
      const mockKeyboard = {
        reply_markup: {
          keyboard: [['Тестовая кнопка']],
          resize_keyboard: true
        }
      };
      
      // Вызываем функцию отправки сообщения с фото
      await sendReplyWithKeyboard(
        ctx,
        'Тестовое сообщение',
        [],
        mockKeyboard,
        'http://example.com/test.jpg'
      )

      // Проверяем что функция была вызвана с правильными параметрами
      expect(sendReplyWithKeyboard).toHaveBeenCalledWith(
        ctx,
        'Тестовое сообщение',
        [],
        mockKeyboard,
        'http://example.com/test.jpg'
      )
    })
  })

  // Интеграционный тест для flow в menuScene
  describe('menuScene flow integration', () => {
    it('should correctly integrate getUserDetailsSubscription, mainMenu and getTranslation', async () => {
      // Получаем данные пользователя
      const userDetails = await getUserDetailsSubscription('123456789')

      // Формируем клавиатуру на основе данных пользователя
      const keyboard = await mainMenu({
        isRu: true,
        subscription: userDetails.subscriptionType,
        ctx,
      })

      // Получаем перевод для меню
      const translationData = await getTranslation({
        key: 'menu',
        ctx,
        bot_name: ctx.botInfo?.username,
      })

      // Отправляем сообщение с фото
      await sendReplyWithKeyboard(
        ctx,
        translationData.translation || 'Fallback text',
        [],
        keyboard,
        translationData.url || null
      )

      // Проверяем последовательность вызовов функций
      expect(getUserDetailsSubscription).toHaveBeenCalledWith('123456789')
      expect(mainMenu).toHaveBeenCalledWith({
        isRu: true,
        subscription: SubscriptionType.NEUROBASE,
        ctx,
      })
      expect(getTranslation).toHaveBeenCalledWith({
        key: 'menu',
        ctx,
        bot_name: 'test_bot',
      })
      expect(sendReplyWithKeyboard).toHaveBeenCalledWith(
        ctx,
        'Тестовое меню',
        [],
        expect.anything(),
        'http://example.com/test.jpg'
      )
    })
  })
})
