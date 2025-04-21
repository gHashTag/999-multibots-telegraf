import { Telegraf, Scenes, session } from 'telegraf'
import { MyContext } from '../src/interfaces' // Используем относительный путь
import { registerCommands, stage } from '../src/registerCommands' // Используем относительный путь
import { handleTechSupport } from '../src/commands/handleTechSupport' // Используем относительный путь
import { get100Command } from '../src/commands/get100Command' // Используем относительный путь
import { getUserDetails } from '../src/core/supabase' // Используем относительный путь
import { ModeEnum } from '../src/interfaces/modes' // Используем относительный путь
import { SubscriptionType } from '../src/interfaces/subscription.interface' // Используем относительный путь
import { levels } from '../src/menu' // Используем относительный путь

// Mocking dependencies
jest.mock('../src/handlers/setupLevelHandlers') // Используем относительный путь
jest.mock('../src/commands/handleTechSupport') // Используем относительный путь
jest.mock('../src/commands/get100Command') // Используем относительный путь
jest.mock('../src/core/supabase', () => ({
  getUserDetails: jest.fn(),
  // Добавьте другие моки, если нужны
})) // Используем относительный путь
jest.mock('../src/menu', () => ({
  levels: new Proxy([], {
    get: (_target, prop) => {
      if (typeof prop === 'string' && !isNaN(parseInt(prop))) {
        return { title_ru: `level_${prop}_ru`, title_en: `level_${prop}_en` }
      }
      return undefined
    },
  }),
})) // Используем относительный путь

// Mock stage middleware directly
jest.mock('telegraf', () => {
  const originalTelegraf = jest.requireActual('telegraf')
  return {
    ...originalTelegraf,
    Scenes: {
      ...originalTelegraf.Scenes,
      Stage: class MockStage {
        middleware = jest.fn(() => (ctx: any, next: any) => next())
        // Add other methods if needed
      },
    },
    session: jest.fn(() => (ctx: any, next: any) => next()),
  }
})

describe('registerCommands', () => {
  let bot: any
  // Убираем composer
  // let composer: any

  beforeEach(() => {
    // Reset mocks and create fresh bot stub
    jest.clearAllMocks()
    ;(handleTechSupport as jest.Mock).mockClear()
    ;(get100Command as jest.Mock).mockClear()
    ;(getUserDetails as jest.Mock).mockResolvedValue({
      isSubscriptionActive: false,
    }) // Default mock value

    bot = {
      use: jest.fn(),
      command: jest.fn(),
      hears: jest.fn(),
      action: jest.fn(), // Добавляем мок для action
      // Мокируем контекст, если он используется в registerCommands
      context: {
        session: {},
        scene: { enter: jest.fn() },
        reply: jest.fn(),
        from: { id: 123 },
        callbackQuery: undefined, // Инициализируем callbackQuery
        answerCbQuery: jest.fn(), // Добавляем мок для answerCbQuery
      },
    } as unknown as Telegraf<MyContext>

    // Убираем composer из вызова registerCommands
    registerCommands({ bot })
  })

  it('should register session middleware', () => {
    expect(bot.use).toHaveBeenCalledWith(expect.any(Function)) // Проверяем вызов session
  })

  it('should register stage middleware', () => {
    expect(bot.use).toHaveBeenCalledTimes(2) // session + stage
    expect(bot.use).toHaveBeenNthCalledWith(2, expect.any(Function)) // Проверяем вызов stage.middleware
  })

  it('should register basic commands', () => {
    // Проверяем вызовы bot.command вместо composer.command
    expect(bot.command).toHaveBeenCalledWith('start', expect.any(Function))
    expect(bot.command).toHaveBeenCalledWith('support', expect.any(Function))
    expect(bot.command).toHaveBeenCalledWith('menu', expect.any(Function))
    expect(bot.command).toHaveBeenCalledWith('get100', expect.any(Function))
    expect(bot.command).toHaveBeenCalledWith('buy', expect.any(Function))
    expect(bot.command).toHaveBeenCalledWith('invite', expect.any(Function))
    expect(bot.command).toHaveBeenCalledWith('balance', expect.any(Function))
    expect(bot.command).toHaveBeenCalledWith('help', expect.any(Function))
    expect(bot.command).toHaveBeenCalledWith(
      'neuro_coder',
      expect.any(Function)
    )
  })

  it('should register hears handlers for menu items', () => {
    expect(bot.hears).toHaveBeenCalledWith(
      [levels[103].title_ru, levels[103].title_en],
      expect.any(Function)
    )
    expect(bot.hears).toHaveBeenCalledWith(
      [levels[105].title_ru, levels[105].title_en],
      expect.any(Function)
    )
  })

  it('should register action handler for top_up', () => {
    expect(bot.action).toHaveBeenCalledWith(
      /top_up_(\d+)$/,
      expect.any(Function)
    )
  })

  // --- Тесты для логики колбэков ---

  describe('command callbacks', () => {
    it('/start should reset session and enter startScene', async () => {
      const startCallback = bot.command.mock.calls.find(
        (call: any) => call[0] === 'start'
      )[1]
      const mockCtx = {
        session: { someData: 'test' },
        scene: { enter: jest.fn() },
      }
      await startCallback(mockCtx)
      expect(mockCtx.session).toEqual({}) // Session should be reset
      expect(mockCtx.scene.enter).toHaveBeenCalledWith(ModeEnum.StartScene)
    })

    it('/support should call handleTechSupport', async () => {
      const supportCallback = bot.command.mock.calls.find(
        (call: any) => call[0] === 'support'
      )[1]
      const mockCtx = {}
      await supportCallback(mockCtx)
      expect(handleTechSupport).toHaveBeenCalledWith(mockCtx)
    })

    it('/menu should check subscription and enter correct scene (active)', async () => {
      ;(getUserDetails as jest.Mock).mockResolvedValue({
        isSubscriptionActive: true,
      })
      const menuCallback = bot.command.mock.calls.find(
        (call: any) => call[0] === 'menu'
      )[1]
      const mockCtx = {
        session: {},
        scene: { enter: jest.fn() },
        from: { id: 456 },
      }
      await menuCallback(mockCtx)
      expect(getUserDetails).toHaveBeenCalledWith(456)
      expect(mockCtx.scene.enter).toHaveBeenCalledWith(ModeEnum.MainMenu) // Должен войти в главное меню
    })

    it('/menu should check subscription and enter correct scene (inactive)', async () => {
      ;(getUserDetails as jest.Mock).mockResolvedValue({
        isSubscriptionActive: false,
      })
      const menuCallback = bot.command.mock.calls.find(
        (call: any) => call[0] === 'menu'
      )[1]
      const mockCtx = {
        session: {},
        scene: { enter: jest.fn() },
        from: { id: 789 },
      }
      await menuCallback(mockCtx)
      expect(getUserDetails).toHaveBeenCalledWith(789)
      expect(mockCtx.scene.enter).toHaveBeenCalledWith(
        ModeEnum.SubscriptionScene
      ) // Должен войти в сцену подписки
    })

    it('/buy should set session and enter payment scene', async () => {
      const buyCallback = bot.command.mock.calls.find(
        (call: any) => call[0] === 'buy'
      )[1]
      const mockCtx = {
        session: {},
        scene: { enter: jest.fn() },
        from: { id: 111 },
      }
      await buyCallback(mockCtx)
      expect((mockCtx.session as MyContext['session']).subscription).toBe(
        SubscriptionType.STARS
      )
      expect(mockCtx.scene.enter).toHaveBeenCalledWith(ModeEnum.PaymentScene)
    })

    // Добавьте тесты для других команд (/invite, /balance, /help, /neuro_coder)

    it('/invite should reply with invite message', async () => {
      const inviteCallback = bot.command.mock.calls.find(
        (call: any) => call[0] === 'invite'
      )[1]
      const mockCtx = { reply: jest.fn() }
      await inviteCallback(mockCtx)
      expect(mockCtx.reply).toHaveBeenCalledWith(
        'Пригласительная ссылка пока не настроена. Следите за обновлениями!'
      ) // Проверяем сообщение
    })

    it('/balance should reply with balance info', async () => {
      const balanceCallback = bot.command.mock.calls.find(
        (call: any) => call[0] === 'balance'
      )[1]
      const mockCtx = { reply: jest.fn() }
      await balanceCallback(mockCtx)
      expect(mockCtx.reply).toHaveBeenCalledWith(
        'Баланс пока не реализован. Следите за обновлениями!'
      ) // Проверяем сообщение
    })

    it('/help should reply with help message', async () => {
      const helpCallback = bot.command.mock.calls.find(
        (call: any) => call[0] === 'help'
      )[1]
      const mockCtx = { reply: jest.fn() }
      await helpCallback(mockCtx)
      expect(mockCtx.reply).toHaveBeenCalledWith(
        expect.stringContaining('Список команд')
      ) // Проверяем, что сообщение содержит "Список команд"
    })

    it('/neuro_coder should reply with neuro_coder info', async () => {
      const neuroCoderCallback = bot.command.mock.calls.find(
        (call: any) => call[0] === 'neuro_coder'
      )[1]
      const mockCtx = { reply: jest.fn() }
      await neuroCoderCallback(mockCtx)
      expect(mockCtx.reply).toHaveBeenCalledWith(
        expect.stringContaining('НейроКодер')
      ) // Проверяем, что сообщение содержит "НейроКодер"
    })
  })

  describe('hears callbacks', () => {
    it('support hears should call handleTechSupport', async () => {
      const supportHearsCallback = bot.hears.mock.calls.find(
        (call: any) => call[0][0] === levels[103].title_ru
      )[1]
      const mockCtx = {}
      await supportHearsCallback(mockCtx)
      expect(handleTechSupport).toHaveBeenCalledWith(mockCtx)
    })

    it('subscribe hears should enter SubscriptionScene', async () => {
      const subscribeHearsCallback = bot.hears.mock.calls.find(
        (call: any) => call[0][0] === levels[105].title_ru
      )[1]
      const mockCtx = { scene: { enter: jest.fn() } }
      await subscribeHearsCallback(mockCtx)
      expect(mockCtx.scene.enter).toHaveBeenCalledWith(
        ModeEnum.SubscriptionScene
      )
    })
  })

  describe('action callbacks', () => {
    it('top_up action should enter PaymentScene with correct subscription type', async () => {
      const topUpActionCallback = bot.action.mock.calls.find(
        (call: any) => call[0] instanceof RegExp && call[0].test('top_up_123')
      )[1]

      const mockCtx = {
        scene: { enter: jest.fn() },
        callbackQuery: { data: 'top_up_stars' }, // Симулируем callbackQuery.data
        answerCbQuery: jest.fn(),
      } as any // Приводим к any, чтобы не было ошибок типов

      await topUpActionCallback(mockCtx)

      expect(mockCtx.scene.enter).toHaveBeenCalledWith(ModeEnum.PaymentScene, {
        subscriptionType: 'stars', // Проверяем, что передается правильный тип подписки
      })
      expect(mockCtx.answerCbQuery).toHaveBeenCalled() // Проверяем, что answerCbQuery был вызван
    })
  })

  describe('command callbacks for /get100', () => {
    it('/get100 command should send "get100"', async () => {
      const get100CommandCallback = bot.command.mock.calls.find(
        (call: any) => call[0] === 'get100'
      )[1]
      const mockCtx = { reply: jest.fn() }
      await get100CommandCallback(mockCtx)
      expect(mockCtx.reply).toHaveBeenCalledWith('get100')
    })
  })
})
