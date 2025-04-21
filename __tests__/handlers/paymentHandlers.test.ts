/**
 * Tests for payment-related handlers: handleBuySubscription and handleSelectStars
 */
import makeMockContext from '../utils/mockTelegrafContext'
import { handleBuySubscription } from '../../src/handlers/handleBuySubscription'
import { handleSelectStars } from '../../src/handlers/handleSelectStars'
import { SubscriptionType } from '@/interfaces'

describe('handleBuySubscription', () => {
  let ctx: ReturnType<typeof makeMockContext>

  beforeEach(() => {
    jest.clearAllMocks()
    ctx = makeMockContext()
    // Mock Date.now for predictable payload
    jest.spyOn(Date, 'now').mockReturnValue(123456 as unknown as number)
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('sends invoice and leaves scene for neurophoto subscription (RU)', async () => {
    ctx.session.subscription = SubscriptionType.NEUROPHOTO
    const replyInv = ctx.replyWithInvoice as jest.Mock
    await handleBuySubscription({ ctx, isRu: true })
    expect(replyInv).toHaveBeenCalledTimes(1)
    const arg = replyInv.mock.calls[0][0]
    // Payload should include amount and mocked timestamp
    expect(arg.payload).toBe('476_123456')
    expect(arg.currency).toBe('XTR')
    expect(arg.prices).toEqual([{ label: 'Цена', amount: 476 }])
    expect(ctx.scene.leave).toHaveBeenCalled()
  })

  it('sends invoice and leaves scene for neurobase subscription (EN)', async () => {
    ctx.session.subscription = SubscriptionType.NEUROBASE
    const replyInv = ctx.replyWithInvoice as jest.Mock
    await handleBuySubscription({ ctx, isRu: false })
    expect(replyInv).toHaveBeenCalledTimes(1)
    const arg = replyInv.mock.calls[0][0]
    expect(arg.payload).toBe('1303_123456')
    expect(arg.prices).toEqual([{ label: 'Price', amount: 1303 }])
    expect(ctx.scene.leave).toHaveBeenCalled()
  })
})

describe('handleSelectStars', () => {
  let ctx: ReturnType<typeof makeMockContext>
  beforeEach(() => {
    jest.clearAllMocks()
    ctx = makeMockContext()
  })

  it('sends inline keyboard with star packages (RU)', async () => {
    await handleSelectStars({ ctx, starAmounts: [5, 10, 15, 20], isRu: true })
    const reply = ctx.debug.replies[0]
    const markup = reply.extra.reply_markup
    expect(markup.inline_keyboard.length).toBe(2)
    expect(markup.inline_keyboard[0].map((b: any) => b.callback_data)).toEqual([
      'top_up_5',
      'top_up_10',
      'top_up_15',
    ])
    expect(markup.inline_keyboard[1].map((b: any) => b.callback_data)).toEqual([
      'top_up_20',
    ])
    expect(reply.message).toBe('Выберите количество звезд для покупки:')
  })

  it('sends inline keyboard with star packages (EN)', async () => {
    await handleSelectStars({ ctx, starAmounts: [1, 2, 3], isRu: false })
    const reply = ctx.debug.replies[0]
    const markup = reply.extra.reply_markup
    expect(markup.inline_keyboard.length).toBe(1)
    expect(markup.inline_keyboard[0].map((b: any) => b.text)).toEqual([
      '1⭐️',
      '2⭐️',
      '3⭐️',
    ])
    expect(reply.message).toBe('Choose the number of stars to buy:')
  })
})
