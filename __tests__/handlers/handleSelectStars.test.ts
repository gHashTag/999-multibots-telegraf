import makeMockContext from '../utils/mockTelegrafContext'
import { handleSelectStars } from '@/handlers/handleSelectStars'
import { MyContext } from '@/interfaces'

describe('handleSelectStars', () => {
  let ctx: ReturnType<typeof makeMockContext>
  const starAmounts = [10, 20, 30]

  beforeEach(() => {
    jest.clearAllMocks()
    ctx = makeMockContext()
    
    // Дополняем сессию минимальным набором необходимых свойств
    ctx.session = { 
      cursor: 0,
      images: [],
      targetUserId: '12345',
      userModel: {
        name: 'Test Model',
        url: 'test-url',
        description: 'Test Description',
        imageUrl: 'test-image-url'
      }
    } as any;
    
    ctx.reply = jest.fn(() => Promise.resolve()) as any
  })

  it('renders stars with correct format in English', async () => {
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
            [{ text: '⭐️ 10', callback_data: 'top_up_10', hide: false }],
            [{ text: '⭐️ 20', callback_data: 'top_up_20', hide: false }],
            [{ text: '⭐️ 30', callback_data: 'top_up_30', hide: false }],
          ],
        },
      })
    )
  })

  it('renders stars with correct format in Russian', async () => {
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
            [{ text: '⭐️ 5', callback_data: 'top_up_5', hide: false }],
            [{ text: '⭐️ 15', callback_data: 'top_up_15', hide: false }],
          ],
        },
      })
    )
  })

  it('renders multiple buttons on separate rows', async () => {
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
            [{ text: '⭐️ 1', callback_data: 'top_up_1', hide: false }],
            [{ text: '⭐️ 2', callback_data: 'top_up_2', hide: false }],
            [{ text: '⭐️ 3', callback_data: 'top_up_3', hide: false }],
            [{ text: '⭐️ 4', callback_data: 'top_up_4', hide: false }],
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
