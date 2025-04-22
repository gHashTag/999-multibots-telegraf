import { Telegraf, Scenes, session } from 'telegraf'
import { MyContext } from '../src/interfaces' // Используем относительный путь
import { registerCommands, stage } from '../src/registerCommands' // Используем относительный путь
import { handleTechSupport } from '../src/commands/handleTechSupport' // Используем относительный путь
import { get100Command } from '../src/commands/get100Command' // Используем относительный путь
import { getUserDetails } from '../src/core/supabase' // Используем относительный путь
import { ModeEnum } from '../src/interfaces/modes' // Используем относительный путь
import { SubscriptionType } from '../src/interfaces/subscription.interface' // Используем относительный путь
import { levels } from '../src/menu/mainMenu' // Используем реальный levels
import { defaultSession } from '../src/store' // Используем defaultSession
import { WizardScene } from 'telegraf/scenes'
import { makeMockContext } from './utils/makeMockContext' // Исправлен путь

// Mocking dependencies
jest.mock('../src/handlers/setupLevelHandlers') // Используем относительный путь
jest.mock('../src/commands/handleTechSupport') // Используем относительный путь
jest.mock('../src/commands/get100Command') // Используем относительный путь
jest.mock('../src/core/supabase', () => ({
  getUserDetails: jest.fn(),
  // Добавьте другие моки, если нужны
})) // Используем относительный путь
// Убираем мок для ../src/menu, чтобы использовать реальные levels
// jest.mock('../src/menu', () => ({ ... }))

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
      hears: jest.fn(), // Добавляем мок
      action: jest.fn(), // Добавляем мок
      context: {}, // Убираем избыточный мок контекста здесь
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
    // Используем реальные levels
    expect(bot.hears).toHaveBeenCalledWith(
      [levels[103].title_ru, levels[103].title_en],
      expect.any(Function)
    )
    expect(bot.hears).toHaveBeenCalledWith(
      [levels[105].title_ru, levels[105].title_en],
      expect.any(Function)
    )
    // Добавим проверку для 100 уровня
    expect(bot.hears).toHaveBeenCalledWith(
      [levels[100].title_ru, levels[100].title_en],
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
    it('/start should reset session and enter CreateUserScene', async () => {
      const startCallback = bot.command.mock.calls.find(
        (call: any) => call[0] === 'start'
      )[1]
      const mockCtx = makeMockContext(
        {
          update_id: 1,
          message: {
            from: { id: 123, first_name: 'Start', is_bot: false },
            chat: { id: 123, type: 'private', first_name: 'Start' },
            date: 0,
            message_id: 1,
            text: '/start',
          },
        },
        { email: 'initial@test.com' }
      )

      await startCallback(mockCtx)
      expect(mockCtx.session).toEqual(expect.objectContaining(defaultSession))
      expect(mockCtx.scene.enter).toHaveBeenCalledWith(ModeEnum.CreateUserScene)
    })

    it('/support should call handleTechSupport', async () => {
      const supportCallback = bot.command.mock.calls.find(
        (call: any) => call[0] === 'support'
      )[1]
      const mockCtx = makeMockContext({ update_id: 2 })
      await supportCallback(mockCtx)
      expect(handleTechSupport).toHaveBeenCalledWith(mockCtx)
    })

    it('/menu should check subscription and enter correct scene (active)', async () => {
      ;(getUserDetails as jest.Mock).mockResolvedValueOnce({
        isSubscriptionActive: true,
      })
      const menuCallback = bot.command.mock.calls.find(
        (call: any) => call[0] === 'menu'
      )[1]
      const userId = '456'
      const mockCtx = makeMockContext({
        update_id: 3,
        message: {
          from: { id: Number(userId), first_name: 'MenuUser', is_bot: false },
          chat: { id: Number(userId), type: 'private', first_name: 'MenuUser' },
          date: 0,
          message_id: 2,
          text: '/menu',
        },
      })
      await menuCallback(mockCtx)
      expect(getUserDetails).toHaveBeenCalledWith(userId)
      expect(mockCtx.scene.enter).toHaveBeenCalledWith(ModeEnum.MainMenu)
    })

    it('/menu should check subscription and enter correct scene (inactive)', async () => {
      ;(getUserDetails as jest.Mock).mockResolvedValueOnce({
        isSubscriptionActive: false,
      })
      const menuCallback = bot.command.mock.calls.find(
        (call: any) => call[0] === 'menu'
      )[1]
      const userId = '789'
      const mockCtx = makeMockContext({
        update_id: 4,
        message: {
          from: { id: Number(userId), first_name: 'MenuUser2', is_bot: false },
          chat: {
            id: Number(userId),
            type: 'private',
            first_name: 'MenuUser2',
          },
          date: 0,
          message_id: 3,
          text: '/menu',
        },
      })
      await menuCallback(mockCtx)
      expect(getUserDetails).toHaveBeenCalledWith(userId)
      expect(mockCtx.scene.enter).toHaveBeenCalledWith(
        ModeEnum.SubscriptionScene
      )
    })

    it('/buy should set session and enter payment scene', async () => {
      const buyCallback = bot.command.mock.calls.find(
        (call: any) => call[0] === 'buy'
      )[1]
      const userId = '111'
      const mockCtx = makeMockContext({
        update_id: 5,
        message: {
          from: { id: Number(userId), first_name: 'BuyUser', is_bot: false },
          chat: { id: Number(userId), type: 'private', first_name: 'BuyUser' },
          date: 0,
          message_id: 4,
          text: '/buy',
        },
      })
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

    it('/get100 should call get100Command', async () => {
      const get100Callback = bot.command.mock.calls.find(
        (call: any) => call[0] === 'get100'
      )[1]
      // Создаем mockCtx
      const mockCtx = makeMockContext({ update_id: 6 })
      await get100Callback(mockCtx)
      expect(get100Command).toHaveBeenCalledWith(mockCtx)
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

  // --- Тесты для логики action ---
  describe('action callbacks', () => {
    it('top_up action should set session and enter payment scene', async () => {
      const topUpActionCallback = bot.action.mock.calls.find(
        (call: any) => call[0] instanceof RegExp && call[0].test('top_up_500')
      )[1]
      const userId = '222'
      const amount = 500
      const mockCtx = makeMockContext(
        {
          update_id: 7,
          callback_query: {
            id: 'cb1',
            from: {
              id: Number(userId),
              first_name: 'ActionUser',
              is_bot: false,
            },
            chat_instance: 'inst1',
            data: `top_up_${amount}`,
          },
        },
        {
          userModel: {
            model_name: '',
            trigger_word: '',
            model_url: 'placeholder/placeholder:placeholder',
          },
          targetUserId: userId,
        } // Исправлен model_url
      )
      // Добавляем match и answerCbQuery вручную
      ;(mockCtx as any).match = [`top_up_${amount}`, amount.toString()]
      mockCtx.answerCbQuery = jest.fn()

      await topUpActionCallback(mockCtx)

      expect(mockCtx.answerCbQuery).toHaveBeenCalled()
      expect((mockCtx.session as MyContext['session']).subscription).toBe(
        SubscriptionType.STARS
      )
      expect((mockCtx.session as MyContext['session']).paymentAmount).toBe(
        amount
      )
      expect(mockCtx.scene.enter).toHaveBeenCalledWith(ModeEnum.PaymentScene)
    })
  })
})
