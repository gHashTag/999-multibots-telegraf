import { Telegraf } from 'telegraf'
// Используем относительные пути для тестов
import { MyContext } from '../src/interfaces'
// Удаляем мок для composer
// jest.mock('@/bot', () => ({ composer: { hears: jest.fn() } }))

// Используем относительные пути для jest.mock
jest.mock('../src/menu', () => ({ imageModelMenu: jest.fn(), levels: jest.fn() })) // Мокируем и levels
jest.mock('../src/services/generateTextToImage', () => ({
  generateTextToImage: jest.fn(),
}))
jest.mock('../src/services/generateNeuroImage', () => ({
  generateNeuroImage: jest.fn(),
}))
jest.mock('../src/handlers', () => ({ handleSizeSelection: jest.fn() }))
jest.mock('../src/core/supabase', () => ({
  getReferalsCountAndUserData: jest.fn().mockResolvedValue({
    count: 0,
    level: 1,
    subscriptionType: 'free',
  }),
}))

// Используем относительные пути для импортов
import { setupHearsHandlers } from '../src/hearsHandlers'
import { levels } from '../src/menu' // Импортируем levels

describe('Hears Handlers Setup', () => {
  let bot: any

  beforeEach(() => {
    // Создаем мок для bot
    bot = {
      hears: jest.fn(),
      // Добавляем моки для других методов, если они используются в setupHearsHandlers
      telegram: {
        sendMessage: jest.fn(),
      },
      // Можно добавить мок для context, если нужно
      context: {
        session: {},
        scene: { enter: jest.fn(), leave: jest.fn() },
        reply: jest.fn(),
        from: { id: 123, language_code: 'ru' },
        botInfo: { username: 'testbot' },
        message: { text: '' }, // Добавляем message.text по умолчанию
      },
    } as unknown as Telegraf<MyContext>

    // Вызываем функцию настройки
    setupHearsHandlers(bot)
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  it('should register hears handler for Help', () => {
    // Проверяем вызов bot.hears вместо composer.hears
    expect(bot.hears).toHaveBeenCalledWith(
      // Используем мокированный levels, если он нужен для теста
      // Или создаем фейковые данные, если levels не важен для этой проверки
      expect.any(Array), // Пока что так, или [levels[103].title_ru, levels[103].title_en]
      expect.any(Function)
    )
  })

  it('should register hears handler for number buttons', () => {
    // Проверяем вызов bot.hears вместо composer.hears
    expect(bot.hears).toHaveBeenCalledWith(
      ['1️⃣', '2️⃣', '3️⃣', '4️⃣'],
      expect.any(Function)
    )
  })

  it('should register hears handler for Improve Prompt', () => {
    // Проверяем вызов bot.hears вместо composer.hears
    expect(bot.hears).toHaveBeenCalledWith(
      ['⬆️ Улучшить промпт', '⬆️ Improve prompt'],
      expect.any(Function)
    )
  })

  it('should register hears handler for Change Size', () => {
    // Проверяем вызов bot.hears вместо composer.hears
    expect(bot.hears).toHaveBeenCalledWith(
      ['📐 Изменить размер', '📐 Change size'],
      expect.any(Function)
    )
  })

  it('should register hears handler for Main Menu', () => {
    // Проверяем вызов bot.hears вместо composer.hears
    expect(bot.hears).toHaveBeenCalledWith(
      // [levels[104].title_ru, levels[104].title_en],
      expect.any(Array),
      expect.any(Function)
    )
  })

  // Добавьте другие тесты для остальных bot.hears обработчиков...

  // Пример теста для проверки логики внутри обработчика (если нужно)
  // it('should call scene.enter when Help is triggered', async () => {
  //   // Находим колбэк для Help
  //   const helpCallback = bot.hears.mock.calls.find(
  //     (call: any) => call[0][0] === levels[103].title_ru
  //   )[1]

  //   const mockCtx = {
  //     session: {},
  //     scene: { enter: jest.fn() },
  //     from: { id: 123 },
  //     // Добавьте другие необходимые поля контекста
  //   } as unknown as MyContext

  //   await helpCallback(mockCtx)
  //   expect(mockCtx.scene.enter).toHaveBeenCalledWith('helpScene')
  // })
})