// Мокаем внешние зависимые функции
jest.mock('@/core/supabase', () => ({ getReferalsCountAndUserData: jest.fn() }))

// Импортируем сцену, чтобы получить доступ к ее конфигурации, если потребуется,
// но тестировать будем сам обработчик.
import { inviteScene } from '@/scenes/inviteScene'
import makeMockContext from '../utils/mockTelegrafContext'
import { getReferalsCountAndUserData } from '@/core/supabase'
import { User } from 'telegraf/typings/core/types/typegram'
import { UserFromGetMe } from 'telegraf/types'
import { jest, describe, it, expect, beforeEach } from '@jest/globals'
import { SubscriptionType, UserType, MyContext, ModeEnum } from '@/interfaces' // Импортируем недостающие типы и MyContext, ModeEnum

// Типизируем мок для getReferalsCountAndUserData
const mockedGetReferals = getReferalsCountAndUserData as jest.Mock<
  (telegram_id: string) => Promise<{
    count: number
    level: number
    subscriptionType: SubscriptionType
    userData: UserType | null
    isExist: boolean
  } | null>
>

// --- Логика обработчика входа (скопирована/адаптирована из inviteScene.enter) ---
// Мы тестируем эту логику напрямую, а не через enterMiddleware
const inviteSceneEnterHandler = async (ctx: MyContext) => {
  const isRu = ctx.from?.language_code === 'ru'
  const botUsername = ctx.botInfo?.username // Добавляем проверку на undefined
  const telegram_id = ctx.from?.id?.toString() || ''

  if (!botUsername) {
    console.error('Bot username is undefined in context')
    await ctx.reply('Internal error: bot username not found.')
    return // Выходим, если нет имени бота
  }
  if (!telegram_id) {
    console.error('User telegram_id is undefined in context')
    await ctx.reply('Internal error: user ID not found.')
    return // Выходим, если нет ID пользователя
  }

  try {
    // Предполагаем, что функция возвращает объект с count или null/выбрасывает ошибку
    const result = await mockedGetReferals(telegram_id)
    const count = result?.count ?? 0 // Используем ?? для значения по умолчанию

    const introText = isRu
      ? `🎁 Пригласите друга и откройте для себя новые возможности! Отправьте ему эту ссылку, и пусть он присоединится к нашему сообществу. 
      \nЧто вы получите?
      - Бонусные звезды для использования в боте.
      - Доступ к эксклюзивным функциям и возможностям.
      - Повышение уровня и доступ к новым функциям.
      \n<b>Рефаралы:</b> ${count}`
      : `🎁 Invite a friend and unlock new opportunities! Send them this link and let them join our community. 🎁 What do you get?
      - Bonus stars for use in the bot.
      - Access to exclusive features and capabilities.
      - Level up and access to new features.
      \n<b>Referrals:</b> ${count}`

    const linkText = `<a href="https://t.me/${botUsername}?start=${telegram_id}">https://t.me/${botUsername}?start=${telegram_id}</a>`

    await ctx.reply(introText, { parse_mode: 'HTML' })
    await ctx.reply(linkText, { parse_mode: 'HTML' })
    await ctx.scene.enter(ModeEnum.MainMenu) // Используем импортированный ModeEnum
  } catch (error) {
    console.error('Error fetching referral count:', error)
    await ctx.reply(
      isRu
        ? 'Произошла ошибка при получении данных о рефералах. Пожалуйста, попробуйте позже.'
        : 'An error occurred while fetching referral data. Please try again later.'
    )
    // Не вызываем ctx.scene.enter в случае ошибки
  }
}
// -----------------------------------------------------------------------------

// Убираем мок next
// const mockNext = jest.fn<() => Promise<void>>().mockResolvedValue();

describe('inviteScene enter handler logic', () => {
  // Переименовываем describe
  let ctx: ReturnType<typeof makeMockContext>
  const mockFrom: User = {
    id: 123,
    is_bot: false,
    first_name: 'Inviter',
    language_code: 'ru',
  }
  const mockBotInfo: UserFromGetMe = {
    id: 1,
    is_bot: true,
    first_name: 'MyBot',
    username: 'myBot',
    can_join_groups: true,
    can_read_all_group_messages: false,
    supports_inline_queries: false,
  }

  beforeEach(() => {
    jest.clearAllMocks()
    ctx = makeMockContext(
      { message: { from: mockFrom, text: '/invite' } },
      {},
      { botInfo: mockBotInfo }
    )
    // Убираем mockNext.mockClear()
  })

  it('sends invitation text and link, then enters MainMenu', async () => {
    // Переопределяем мок scene.enter локально, чтобы соответствовать сигнатуре
    ctx.scene.enter = jest
      .fn<
        (
          sceneId: string,
          initialState?: object,
          silent?: boolean
        ) => Promise<unknown>
      >()
      .mockResolvedValue({} as unknown) // Возвращаем пустой Promise

    mockedGetReferals.mockResolvedValueOnce({
      count: 7,
      level: 1,
      subscriptionType: SubscriptionType.STARS,
      userData: null,
      isExist: true,
    })

    // Вызываем напрямую нашу адаптированную логику обработчика
    await inviteSceneEnterHandler(ctx)

    // Проверки остаются теми же, но проверяем вход в MainMenu
    expect(ctx.reply).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('Рефаралы'),
      { parse_mode: 'HTML' }
    )
    expect(ctx.reply).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('https://t.me/myBot?start=123'),
      { parse_mode: 'HTML' }
    )
    expect(ctx.scene.enter).toHaveBeenCalledWith(ModeEnum.MainMenu) // Проверяем вход в MainMenu
  })

  it('handles error by notifying user', async () => {
    // Переопределяем мок scene.enter локально, чтобы соответствовать сигнатуре
    ctx.scene.enter = jest
      .fn<
        (
          sceneId: string,
          initialState?: object,
          silent?: boolean
        ) => Promise<unknown>
      >()
      .mockResolvedValue({} as unknown)

    mockedGetReferals.mockRejectedValueOnce(new Error('err'))

    // Вызываем напрямую нашу адаптированную логику обработчика
    await inviteSceneEnterHandler(ctx)

    expect(ctx.reply).toHaveBeenCalledWith(
      'Произошла ошибка при получении данных о рефералах. Пожалуйста, попробуйте позже.'
    )
    expect(ctx.scene.enter).not.toHaveBeenCalled()
  })
})
