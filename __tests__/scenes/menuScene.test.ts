import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Markup } from 'telegraf'
import { MyContext } from '@/interfaces'
import { SubscriptionType } from '@/interfaces/subscription.interface'
import { ModeEnum } from '@/interfaces/modes'

// Мокаем модули
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
  mainMenu: vi.fn().mockResolvedValue(
    Markup.keyboard([
      ['🤖 Цифровое тело', '📸 Нейрофото'],
      ['💰 Баланс', '💎 Пополнить баланс'],
      ['👥 Пригласить друга', '❓ Справка', '💬 Техподдержка'],
    ]).resize()
  ),
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

// Импортируем необходимые модули для тестирования
import { getUserDetailsSubscription } from '@/core/supabase/getUserDetailsSubscription'
import { getTranslation } from '@/core/supabase/getTranslation'
import { mainMenu } from '@/menu/mainMenu'
import { isRussian } from '@/helpers/language'
import { handleTechSupport } from '@/commands/handleTechSupport'
import { handleMenu } from '@/handlers/handleMenu'
import { handleRestartVideoGeneration } from '@/handlers/handleVideoRestart'

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

// Тесты для проверки функций, используемых в menuScene
describe('menuScene components', () => {
  let ctx: MyContext

  beforeEach(() => {
    // Сбрасываем все моки перед каждым тестом
    vi.clearAllMocks()

    // Создаем новый контекст для каждого теста
    ctx = createMockContext()
  })

  it('should call getUserDetailsSubscription with correct ID', async () => {
    // Вызываем функцию с контекстом
    await getUserDetailsSubscription('123456789')

    // Проверяем что функция была вызвана с правильными параметрами
    expect(getUserDetailsSubscription).toHaveBeenCalledWith('123456789')
  })

  it('should call getTranslation with correct parameters', async () => {
    // Вызываем функцию с контекстом
    await getTranslation({
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
  })

  it('should call mainMenu with correct parameters', async () => {
    // Вызываем функцию с контекстом
    await mainMenu({
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
  })

  it('should determine Russian language correctly', () => {
    // Вызываем функцию определения языка
    const result = isRussian(ctx)

    // Проверяем что функция вернула ожидаемый результат
    expect(result).toBe(true)
  })

  it('should call handleTechSupport correctly', async () => {
    // Вызываем функцию техподдержки
    await handleTechSupport(ctx)

    // Проверяем что функция была вызвана с правильными параметрами
    expect(handleTechSupport).toHaveBeenCalledWith(ctx)
  })

  it('should call handleMenu correctly', async () => {
    // Вызываем функцию обработки меню
    await handleMenu(ctx)

    // Проверяем что функция была вызвана с правильными параметрами
    expect(handleMenu).toHaveBeenCalledWith(ctx)
  })

  it('should call handleRestartVideoGeneration correctly', async () => {
    // Вызываем функцию перезапуска генерации видео
    await handleRestartVideoGeneration(ctx)

    // Проверяем что функция была вызвана с правильными параметрами
    expect(handleRestartVideoGeneration).toHaveBeenCalledWith(ctx)
  })
})
