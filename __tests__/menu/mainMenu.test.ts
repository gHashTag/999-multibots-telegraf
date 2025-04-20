import makeMockContext from '../utils/mockTelegrafContext'
import { defaultSession } from '@/store'
import { SubscriptionType } from '@/interfaces'

// Mock dependencies
jest.mock('@/core/supabase', () => ({ checkPaymentStatus: jest.fn() }))
import { mainMenu, levels } from '@/menu/mainMenu'
import { checkPaymentStatus } from '@/core/supabase'

describe('mainMenu', () => {
  let ctx: ReturnType<typeof makeMockContext>
  beforeEach(() => {
    jest.clearAllMocks()
    ctx = makeMockContext({
      message: {
        from: {
          id: 1,
          username: 'u',
          language_code: 'ru',
          is_bot: false,
          first_name: 'Test',
        },
      },
    } as any)
    ctx.session = {
      ...defaultSession,
      subscription: SubscriptionType.STARS,
    }
    process.env.ADMIN_IDS = ''
    ctx.reply = jest.fn(() => Promise.resolve({} as any))
  })

  it('shows only subscribe button when stars subscription and inviteCount=0 and no full access', async () => {
    ;(checkPaymentStatus as jest.Mock).mockResolvedValue(false)
    const markup = await mainMenu({
      isRu: true,
      subscription: SubscriptionType.STARS,
      level: 0,
      ctx: ctx as any,
    })
    // @ts-ignore
    const kb = markup.reply_markup.keyboard
    expect(kb).toEqual([[{ text: levels[0].title_ru }]])
  })

  it('adds admin buttons when user is admin', async () => {
    ;(checkPaymentStatus as jest.Mock).mockResolvedValue(true)
    process.env.ADMIN_IDS = '1,2'
    const markup = await mainMenu({
      isRu: false,
      subscription: SubscriptionType.NEUROTESTER,
      level: 0,
      ctx: ctx as any,
    })
    // should include two extra buttons for admin
    // @ts-ignore
    const texts = markup.reply_markup.keyboard.flat().map((b: any) => b.text)
    expect(texts).toContain('🤖 Digital Body 2')
    expect(texts).toContain('📸  NeuroPhoto 2')
  })

  it('shows multiple levels for neurotester with full access', async () => {
    ;(checkPaymentStatus as jest.Mock).mockResolvedValue(true)
    const markup = await mainMenu({
      isRu: false,
      subscription: SubscriptionType.NEUROTESTER,
      level: 2,
      ctx: ctx as any,
    })
    // should contain at least levels[0], levels[1], levels[2]
    // @ts-ignore
    const texts = markup.reply_markup.keyboard.flat().map((b: any) => b.text)
    expect(texts).toContain(levels[0].title_en)
    expect(texts).toContain(levels[1].title_en)
    expect(texts).toContain(levels[2].title_en)
  })

  it('fallbacks when no available levels', async () => {
    ;(checkPaymentStatus as jest.Mock).mockResolvedValue(false)
    // subscription unknown, so subscriptionLevelsMap returns undefined => availableLevels empty
    const markup = await mainMenu({
      isRu: true,
      subscription: 'unknown' as any,
      level: 0,
      ctx: ctx as any,
    })
    // @ts-ignore
    const kb = markup.reply_markup.keyboard
    expect(kb).toEqual([[{ text: levels[0].title_ru }]])
  })
})
