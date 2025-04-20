import { describe, test, expect, beforeEach, jest } from '@jest/globals'
import makeMockContext from '../utils/mockTelegrafContext'

// Mock dependencies
jest.mock('@/handlers/getPhotoUrl', () => ({ getPhotoUrl: jest.fn(() => 'photoUrl') }))
jest.mock('@/handlers/getSubScribeChannel', () => ({ getSubScribeChannel: jest.fn(() => 'channelId') }))
jest.mock('@/helpers/language', () => ({ isRussian: (ctx: any) => ctx.from.language_code === 'ru' }))
jest.mock('@/core/supabase', () => ({
  getReferalsCountAndUserData: jest.fn().mockResolvedValue({ count: 1, userData: { user_id: 'inviter', balance: 50, username: 'inv' } }),
  incrementBalance: jest.fn(),
  createUser: jest.fn(),
}))

import { createUserStep } from '@/scenes/createUserScene'
import { getPhotoUrl } from '@/handlers/getPhotoUrl'
import { getSubScribeChannel } from '@/handlers/getSubScribeChannel'
import { getReferalsCountAndUserData, incrementBalance, createUser } from '@/core/supabase'

describe('createUserStep', () => {
  let ctx: any
  beforeEach(() => {
    jest.clearAllMocks()
    ctx = makeMockContext({ text: '/start 123' }, {})
    ctx.botInfo = { username: 'botName' }
    // set from
    ctx.from.language_code = 'ru'
  })

  test('handles invite link start with code', async () => {
    await createUserStep(ctx)
    expect(getPhotoUrl).toHaveBeenCalledWith(ctx, 1)
    expect(getSubScribeChannel).toHaveBeenCalledWith(ctx)
    expect(getReferalsCountAndUserData).toHaveBeenCalledWith('123')
    expect(incrementBalance).toHaveBeenCalledWith({ telegram_id: '123', amount: 100 })
    expect(ctx.telegram.sendMessage).toHaveBeenCalledWith('@channelId', expect.stringContaining('🔗 Новый пользователь зарегистрировался'))
    expect(createUser).toHaveBeenCalledWith(expect.objectContaining({ inviter: 'inviter', photo_url: 'photoUrl' }))
    expect(ctx.reply).toHaveBeenCalledWith('✅ Аватар успешно создан!')
    expect(ctx.scene.enter).toHaveBeenCalledWith('subscriptionCheckScene')
  })

  test('handles /start without code', async () => {
    ctx = makeMockContext({ text: '/start' }, {})
    ctx.botInfo = { username: 'botName' }
    ctx.from.language_code = 'en'
    await createUserStep(ctx)
    expect(getReferalsCountAndUserData).toHaveBeenCalledWith(ctx.from.id.toString())
    expect(incrementBalance).not.toHaveBeenCalled()
    expect(ctx.telegram.sendMessage).toHaveBeenCalledWith('@channelId', expect.stringContaining('New user registered'))
    expect(createUser).toHaveBeenCalled()
    expect(ctx.reply).toHaveBeenCalledWith('✅ Avatar created successfully!')
  })
})