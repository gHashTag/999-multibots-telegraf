import { jest, describe, beforeEach, it, expect } from '@jest/globals'
import makeMockContext from '../utils/mockTelegrafContext'
import { createUserStep } from '../../src/scenes/createUserScene'
import {
  getReferalsCountAndUserData,
  createUser,
  incrementBalance,
} from '@/core/supabase'
import { getPhotoUrl } from '@/handlers/getPhotoUrl'
import { getSubScribeChannel } from '@/handlers/getSubScribeChannel'
import { isRussian } from '@/helpers/language'

// Мокаем зависимости
jest.mock('@/core/supabase', () => ({
  getReferalsCountAndUserData: jest.fn(),
  createUser: jest.fn(),
  incrementBalance: jest.fn(),
}))
jest.mock('@/handlers/getPhotoUrl', () => ({
  getPhotoUrl: jest.fn(),
}))
jest.mock('@/handlers/getSubScribeChannel', () => ({
  getSubScribeChannel: jest.fn(),
}))
jest.mock('@/helpers/language', () => ({
  isRussian: jest.fn(),
}))

describe('createUserStep', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(isRussian as jest.Mock).mockReturnValue(true)
    ;(getPhotoUrl as jest.Mock).mockReturnValue('photo_url')
    ;(getSubScribeChannel as jest.Mock).mockReturnValue('channel123')
  })

  it('creates user without invite code', async () => {
    const ctx = makeMockContext(
      {},
      {
        session: {},
        message: { text: '/start' },
        botInfo: { username: 'botName' },
        chat: { id: 999 },
      }
    )
    // Симулируем ответ getReferalsCountAndUserData для no-invite branch
    ;(getReferalsCountAndUserData as jest.Mock).mockResolvedValueOnce({ count: 5, userData: { user_id: 'X', username: 'u', balance: 0 } })
    await createUserStep(ctx)
    // Проверяем вызовы фоток
    expect(getPhotoUrl).toHaveBeenCalledWith(ctx, 1)
    expect(getSubScribeChannel).toHaveBeenCalledWith(ctx)
    // Ветка без inviteCode: getReferalsCount called with telegram_id
    expect(getReferalsCountAndUserData).toHaveBeenCalledWith('12345')
    // Сообщение в канал подписки
    expect(ctx.telegram.sendMessage).toHaveBeenCalledWith(
      '@channel123',
      expect.stringContaining('Новый пользователь зарегистрировался')
    )
    // Создание пользователя
    expect(createUser).toHaveBeenCalledWith(
      expect.objectContaining({
        username: '12345',
        telegram_id: '12345',
        photo_url: 'photo_url',
        chat_id: 999,
        bot_name: 'botName',
      })
    )
    // Ответ и переход
    expect(ctx.reply).toHaveBeenCalledWith('✅ Аватар успешно создан!')
    expect(ctx.scene.enter).toHaveBeenCalledWith('subscriptionCheckScene')
  })

  it('creates user with invite code and referral flow', async () => {
    const ctx = makeMockContext(
      {},
      {
        session: {},
        message: { text: '/start 777' },
        botInfo: { username: 'botName' },
        chat: { id: 1000 },
      }
    )
    // Мокаем данные реферала
    ;(getReferalsCountAndUserData as jest.Mock).mockResolvedValueOnce({
      count: 2,
      userData: { user_id: 'inviterId', username: 'invUser', balance: 300 },
    })
    await createUserStep(ctx)
    // Invite code сохранён
    expect(ctx.session.inviteCode).toBe('777')
    // Отправка сообщения пригласителю
    expect(ctx.telegram.sendMessage).toHaveBeenCalledWith(
      '777',
      expect.stringContaining('Новый пользователь зарегистрировался по вашей ссылке')
    )
    // Пополнение баланса
    expect(incrementBalance).toHaveBeenCalledWith({ telegram_id: '777', amount: 100 })
    // Отправка сообщения в канал подписки
    expect(ctx.telegram.sendMessage).toHaveBeenCalledWith(
      '@channel123',
      expect.stringContaining('По реферальной ссылке от: @invUser')
    )
    // Создание пользователя и ответ
    expect(createUser).toHaveBeenCalled()
    expect(ctx.reply).toHaveBeenCalledWith('✅ Аватар успешно создан!')
    expect(ctx.scene.enter).toHaveBeenCalledWith('subscriptionCheckScene')
  })
})