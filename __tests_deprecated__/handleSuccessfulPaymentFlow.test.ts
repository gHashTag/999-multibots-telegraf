import makeMockContext from '../utils/mockTelegrafContext'

// Mock dependencies
jest.mock('@/helpers/language', () => ({ isRussian: jest.fn() }))
jest.mock('@/core/supabase', () => ({ incrementBalance: jest.fn(), setPayments: jest.fn() }))

import { handleSuccessfulPayment } from '@/handlers/paymentHandlers'
import { isRussian } from '@/helpers/language'
import { incrementBalance, setPayments } from '@/core/supabase'

describe('handleSuccessfulPayment', () => {
  let ctx: any
  beforeEach(() => {
    jest.clearAllMocks()
    ctx = makeMockContext()
    ctx.chat = { id: 10 } as any
    ctx.from = { id: 5, username: 'userX', language_code: 'ru' } as any
    ctx.session = { subscription: '', telegram_id: 5 } as any
    ctx.botInfo = { username: 'botN' } as any
    ctx.message = { successful_payment: { total_amount: 50, invoice_payload: 'inv123' } } as any
    ctx.reply = jest.fn(() => Promise.resolve())
    ctx.telegram.sendMessage = jest.fn(() => Promise.resolve())
    ;(isRussian as jest.Mock).mockReturnValue(true)
  })

  it('processes known subscription type', async () => {
    ctx.session.subscription = 'neurophoto'
    await handleSuccessfulPayment(ctx)
    // For neurophoto: amount=1110, stars=50
    expect(incrementBalance).toHaveBeenCalledWith({ telegram_id: '5', amount: 1110 })
    // Two notifications
    expect(ctx.telegram.sendMessage).toHaveBeenCalledTimes(2)
    expect(setPayments).toHaveBeenCalledWith(expect.objectContaining({ InvId: 'inv123', stars: 50 }))
  })

  it('processes fallback for unknown subscription', async () => {
    ctx.session.subscription = 'other'
    await handleSuccessfulPayment(ctx)
    // Fallback: incrementBalance with stars
    expect(incrementBalance).toHaveBeenCalledWith({ telegram_id: '5', amount: 50 })
    // Reply to user
    expect(ctx.reply).toHaveBeenCalledWith(
      '💫 Ваш баланс пополнен на 50⭐️ звезд!'
    )
    // One notification
    expect(ctx.telegram.sendMessage).toHaveBeenCalledWith(
      '@neuro_blogger_pulse',
      expect.stringContaining('пополнил баланс на 50')
    )
    expect(setPayments).toHaveBeenCalledWith(expect.objectContaining({ InvId: 'inv123', stars: 50 }))
  })

  it('handles missing chat gracefully', async () => {
    delete ctx.chat
    // Should not throw
    await expect(handleSuccessfulPayment(ctx)).resolves.toBeUndefined()
  })
})