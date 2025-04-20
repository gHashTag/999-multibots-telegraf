import { jest, describe, it, expect, beforeEach } from '@jest/globals'
import makeMockContext from '../utils/mockTelegrafContext'

// Mock dependencies
jest.mock('@/core/supabase', () => ({ getReferalsCountAndUserData: jest.fn() }))
jest.mock('@/menu/mainMenu', () => ({ mainMenu: jest.fn() }))
import { sendGenerationCancelledMessage } from '@/menu/sendGenerationCancelledMessage'
import { getReferalsCountAndUserData } from '@/core/supabase'
import { mainMenu } from '@/menu/mainMenu'

describe('sendGenerationCancelledMessage', () => {
  let ctx: ReturnType<typeof makeMockContext>
  beforeEach(() => {
    jest.clearAllMocks()
    ctx = makeMockContext()
    ctx.reply = jest.fn(() => Promise.resolve()) as any
    ctx.from = { id: 7, language_code: 'ru' } as any
    (getReferalsCountAndUserData as jest.Mock).mockResolvedValue({ count: 2, subscription: 'stars', level: 1 })
    (mainMenu as jest.Mock).mockResolvedValue({ reply_markup: { keyboard: [['a']] } })
  })

  it('replies with Russian message and keyboard', async () => {
    await sendGenerationCancelledMessage(ctx as any, true)
    expect(getReferalsCountAndUserData).toHaveBeenCalledWith('7')
    expect(mainMenu).toHaveBeenCalledWith({ isRu: true, inviteCount: 2, subscription: 'stars', ctx, level: 1 })
    expect(ctx.reply).toHaveBeenCalledWith('❌ Генерация отменена', {
      reply_markup: { keyboard: [['a']] }
    })
  })

  it('replies with English message when isRu false', async () => {
    ctx.from.language_code = 'en'
    await sendGenerationCancelledMessage(ctx as any, false)
    expect(ctx.reply).toHaveBeenCalledWith('❌ Generation cancelled', {
      reply_markup: { keyboard: [['a']] }
    })
  })
})