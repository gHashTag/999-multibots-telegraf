import makeMockContext from '../utils/mockTelegrafContext'
import { MyContext, SubscriptionType } from '@/interfaces'
import { Markup } from 'telegraf'
// import { MainMenuKeyboard } from 'telegraf-inline-menu' // УДАЛЕНО

// Mock dependencies
jest.mock('@/core/supabase', () => ({ getReferalsCountAndUserData: jest.fn() }))
jest.mock('@/menu/mainMenu', () => ({ mainMenu: jest.fn() }))
import { sendGenerationCancelledMessage } from '@/menu/sendGenerationCancelledMessage'
import { getReferalsCountAndUserData } from '@/core/supabase'
import { mainMenu } from '@/menu/mainMenu'

// Типизируем моки
const mockedGetReferals = jest.mocked(getReferalsCountAndUserData)
const mockedMainMenu = jest.mocked(mainMenu)

describe('sendGenerationCancelledMessage', () => {
  let ctx: MyContext // Используем MyContext

  beforeEach(() => {
    jest.clearAllMocks()
    // Создаем контекст с правильными типами
    ctx = makeMockContext(
      {
        update_id: 1,
        message: {
          message_id: 1,
          from: {
            id: 7,
            language_code: 'ru',
            is_bot: false,
            first_name: 'TestRu',
          },
          chat: { id: 7, type: 'private', first_name: 'TestRu' },
          date: Date.now(),
        },
      },
      {
        userModel: {
          model_name: '',
          trigger_word: '',
          model_url: 'placeholder/placeholder:placeholder',
        },
        targetUserId: '7',
      } // Исправлен model_url
    )

    // Мокаем функции отдельно
    mockedGetReferals.mockResolvedValue({
      count: 2,
      subscriptionType: SubscriptionType.STARS, // Исправлено на subscriptionType
      level: 1,
      // Добавим недостающие поля для полного типа
      userData: {} as any, // Placeholder, т.к. не используется в тесте
      isExist: true, // Placeholder
    })
    // Ожидаем, что mainMenu возвращает клавиатуру Markup
    mockedMainMenu.mockResolvedValue(
      Markup.keyboard([['a']]) // Используем Markup.keyboard
    )
  })

  it('replies with Russian message and keyboard', async () => {
    await sendGenerationCancelledMessage(ctx, true) // Возвращаем ctx
    expect(mockedGetReferals).toHaveBeenCalledWith('7')
    expect(mockedMainMenu).toHaveBeenCalledWith({
      isRu: true,
      inviteCount: 2,
      subscription: SubscriptionType.STARS,
      ctx,
      level: 1,
    })
    expect(ctx.reply).toHaveBeenCalledWith(
      '❌ Генерация отменена',
      Markup.keyboard([['a']]) // Ожидаем Markup.keyboard
    )
  })

  it('replies with English message when isRu false', async () => {
    // Создаем контекст для EN
    const ctxEn = makeMockContext(
      {
        update_id: 2,
        message: {
          message_id: 2,
          from: {
            id: 8,
            language_code: 'en',
            is_bot: false,
            first_name: 'TestEn',
          },
          chat: { id: 8, type: 'private', first_name: 'TestEn' },
          date: Date.now(),
        },
      },
      {
        userModel: {
          model_name: '',
          trigger_word: '',
          model_url: 'placeholder/placeholder:placeholder',
        },
        targetUserId: '8',
      } // Исправлен model_url
    )

    // Мокаем для EN теста
    mockedGetReferals.mockResolvedValue({
      count: 3,
      subscriptionType: SubscriptionType.STARS, // Исправлено на subscriptionType и STARS
      level: 0,
      userData: {} as any,
      isExist: true,
    })
    mockedMainMenu.mockResolvedValue(
      Markup.keyboard([['b']]) // Используем Markup.keyboard
    )

    await sendGenerationCancelledMessage(ctxEn, false) // Возвращаем ctxEn
    expect(mockedGetReferals).toHaveBeenCalledWith('8')
    expect(mockedMainMenu).toHaveBeenCalledWith({
      isRu: false,
      inviteCount: 3,
      subscription: SubscriptionType.STARS, // Исправлено на STARS
      ctx: ctxEn,
      level: 0,
    })
    expect(ctxEn.reply).toHaveBeenCalledWith(
      '❌ Generation cancelled',
      Markup.keyboard([['b']]) // Ожидаем Markup.keyboard
    )
  })
})
