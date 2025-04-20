import makeMockContext from '../utils/mockTelegrafContext'
import { handleSubscriptionMessage } from '@/middlewares/handleSubscriptionMessage'

describe('handleSubscriptionMessage', () => {
  let ctx: ReturnType<typeof makeMockContext>
  beforeEach(() => {
    jest.clearAllMocks()
    ctx = makeMockContext({
      message: {
        from: {
          id: 10,
          language_code: 'ru',
          is_bot: false,
          first_name: 'Test',
        },
      },
    } as any)
    ctx.reply = jest.fn(() => Promise.resolve({} as any))
  })

  it('sends Russian subscription message with inline keyboard', async () => {
    await handleSubscriptionMessage(ctx as any, 'ru', 'chan')
    expect(ctx.reply).toHaveBeenCalledWith(
      expect.stringContaining('Вы видите это сообщение'),
      expect.objectContaining({
        reply_markup: expect.objectContaining({
          inline_keyboard: expect.any(Array),
        }),
      })
    )
  })

  it('sends English subscription message with inline keyboard', async () => {
    await handleSubscriptionMessage(ctx as any, 'en', 'chan')
    expect(ctx.reply).toHaveBeenCalledWith(
      expect.stringContaining('You see this message'),
      expect.objectContaining({ reply_markup: expect.any(Object) })
    )
  })
})
