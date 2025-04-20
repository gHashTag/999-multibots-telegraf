import { describe, it, expect, beforeEach, jest } from '@jest/globals'
import makeMockContext from '../utils/mockTelegrafContext'
import { handleSelectStars } from '@/handlers/handleSelectStars'

describe('handleSelectStars', () => {
  let ctx: ReturnType<typeof makeMockContext>
  beforeEach(() => {
    jest.clearAllMocks()
    ctx = makeMockContext()
    ctx.reply = jest.fn(() => Promise.resolve()) as any
  })

  it('renders a single row of three stars in English', async () => {
    await handleSelectStars({ ctx: ctx as any, starAmounts: [10, 20, 30], isRu: false })
    expect(ctx.reply).toHaveBeenCalledWith(
      'Choose the number of stars to buy:',
      {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '10⭐️', callback_data: 'top_up_10' },
              { text: '20⭐️', callback_data: 'top_up_20' },
              { text: '30⭐️', callback_data: 'top_up_30' },
            ],
          ],
        },
      }
    )
  })

  it('renders a single row of two stars in Russian', async () => {
    await handleSelectStars({ ctx: ctx as any, starAmounts: [5, 15], isRu: true })
    expect(ctx.reply).toHaveBeenCalledWith(
      'Выберите количество звезд для покупки:',
      {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '5⭐️', callback_data: 'top_up_5' },
              { text: '15⭐️', callback_data: 'top_up_15' },
            ],
          ],
        },
      }
    )
  })

  it('renders multiple rows with leftover items', async () => {
    await handleSelectStars({ ctx: ctx as any, starAmounts: [1, 2, 3, 4], isRu: false })
    expect(ctx.reply).toHaveBeenCalledWith(
      'Choose the number of stars to buy:',
      {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '1⭐️', callback_data: 'top_up_1' },
              { text: '2⭐️', callback_data: 'top_up_2' },
              { text: '3⭐️', callback_data: 'top_up_3' },
            ],
            [
              { text: '4⭐️', callback_data: 'top_up_4' },
            ],
          ],
        },
      }
    )
  })

  it('throws error when ctx.reply fails', async () => {
    const err = new Error('reply failed')
    ctx.reply = jest.fn(() => Promise.reject(err)) as any
    await expect(
      handleSelectStars({ ctx: ctx as any, starAmounts: [1], isRu: false })
    ).rejects.toThrow(err)
  })
})