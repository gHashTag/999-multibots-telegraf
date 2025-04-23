import makeMockContext from '../utils/mockTelegrafContext'
import { handleSelectStars } from '@/handlers/handleSelectStars'
import { MyContext } from '@/interfaces'

describe('handleSelectStars', () => {
  let ctx: ReturnType<typeof makeMockContext>
  const starAmounts = [10, 20, 30]

  beforeEach(() => {
    jest.clearAllMocks()
    ctx = makeMockContext()
    ctx.reply = jest.fn(() => Promise.resolve()) as any
  })

  it('renders a single row of three stars in English', async () => {
    await handleSelectStars({
      ctx: ctx as unknown as MyContext,
      starAmounts,
      isRu: false,
    })

    expect(ctx.reply).toHaveBeenCalledWith(
      'Choose the number of stars to buy:',
      expect.objectContaining({
        reply_markup: {
          inline_keyboard: [
            [
              { text: '10⭐️', callback_data: 'top_up_10' },
              { text: '20⭐️', callback_data: 'top_up_20' },
              { text: '30⭐️', callback_data: 'top_up_30' },
            ],
          ],
        },
      })
    )
  })

  it('renders a single row of two stars in Russian', async () => {
    const ruStarAmounts = [5, 15]

    await handleSelectStars({
      ctx: ctx as unknown as MyContext,
      starAmounts: ruStarAmounts,
      isRu: true,
    })

    expect(ctx.reply).toHaveBeenCalledWith(
      'Выберите количество звезд для покупки:',
      expect.objectContaining({
        reply_markup: {
          inline_keyboard: [
            [
              { text: '5⭐️', callback_data: 'top_up_5' },
              { text: '15⭐️', callback_data: 'top_up_15' },
            ],
          ],
        },
      })
    )
  })

  it('renders multiple rows with leftover items', async () => {
    const multiRowStarAmounts = [1, 2, 3, 4]

    await handleSelectStars({
      ctx: ctx as unknown as MyContext,
      starAmounts: multiRowStarAmounts,
      isRu: false,
    })

    expect(ctx.reply).toHaveBeenCalledWith(
      'Choose the number of stars to buy:',
      expect.objectContaining({
        reply_markup: {
          inline_keyboard: [
            [
              { text: '1⭐️', callback_data: 'top_up_1' },
              { text: '2⭐️', callback_data: 'top_up_2' },
              { text: '3⭐️', callback_data: 'top_up_3' },
            ],
            [{ text: '4⭐️', callback_data: 'top_up_4' }],
          ],
        },
      })
    )
  })

  it('throws error when ctx.reply fails', async () => {
    const err = new Error('reply failed')
    ctx.reply = jest.fn(() => Promise.reject(err)) as any

    await expect(
      handleSelectStars({
        ctx: ctx as unknown as MyContext,
        starAmounts: [1],
        isRu: false,
      })
    ).rejects.toThrow(err)
  })
})
