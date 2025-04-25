import makeMockContext from '../utils/mockTelegrafContext'
import { handleBuySubscription } from '@/handlers/handleBuySubscription'
import { levels } from '@/menu/mainMenu'
import { MyContext } from '@/interfaces'
import { SubscriptionType } from '@/interfaces/subscription.interface'

describe('handleBuySubscription', () => {
  let ctx: ReturnType<typeof makeMockContext>
  
  beforeEach(() => {
    jest.clearAllMocks()
    ctx = makeMockContext()
    
    // Переопределяем методы для тестирования
    ctx.replyWithInvoice = jest.fn(() => Promise.resolve()) as any
    ctx.scene.leave = jest.fn(() => Promise.resolve()) as any
    
    // Устанавливаем минимальную сессию
    ctx.session = { 
      subscription: SubscriptionType.NEUROPHOTO,
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
  })

  it('should send invoice for neurophoto subscription and leave scene', async () => {
    await handleBuySubscription({ 
      ctx: ctx as unknown as MyContext, 
      isRu: false 
    })
    
    const amount = 476
    expect(ctx.replyWithInvoice).toHaveBeenCalledWith(
      expect.objectContaining({
        title: levels[2].title_en,
        description: expect.stringContaining('Creating photos'),
        currency: 'XTR',
        prices: [{ label: 'Price', amount }],
      })
    )
    expect(ctx.scene.leave).toHaveBeenCalled()
  })

  it('should default title and description when subscription type unknown', async () => {
    // Используем неизвестный тип
    ctx.session.subscription = 'unknown' as any;
    
    await handleBuySubscription({ 
      ctx: ctx as unknown as MyContext, 
      isRu: true 
    })
    
    // amount undefined => payload amount_NaN, but title fallback is `${amount} ⭐️`, so title contains 'NaN ⭐️'
    expect(ctx.replyWithInvoice).toHaveBeenCalledWith(
      expect.objectContaining({
        title: expect.stringContaining('⭐️'),
        description: expect.stringContaining('Получите'),
        currency: 'XTR',
        prices: [{ label: 'Цена', amount: undefined }],
      })
    )
    expect(ctx.scene.leave).toHaveBeenCalled()
  })
})
