import makeMockContext from '../utils/mockTelegrafContext'
import handleMenu from '@/handlers/handleMenu'
import { levels } from '@/menu/mainMenu'
import { priceCommand } from '@/commands/priceCommand'

// Mock priceCommand to avoid real logic
jest.mock('@/commands/priceCommand', () => ({ priceCommand: jest.fn() }))

describe('handleMenu all English branches', () => {
  let ctx: ReturnType<typeof makeMockContext>
  beforeEach(() => {
    jest.clearAllMocks()
    ctx = makeMockContext()
    ctx.from.language_code = 'en'
    ctx.session = {} as any
    ctx.scene.enter = jest.fn()
  })

  const cases = [
    { text: levels[0].title_en, mode: 'subscribe', enter: 'subscriptionScene' },
    { text: levels[1].title_en, mode: 'digital_avatar_body', enter: 'checkBalanceScene' },
    { text: '🤖 Digital Body 2', mode: 'digital_avatar_body_2', enter: 'checkBalanceScene' },
    { text: levels[2].title_en, mode: 'neuro_photo', enter: 'checkBalanceScene' },
    { text: '📸 NeuroPhoto 2', mode: 'neuro_photo_2', enter: 'checkBalanceScene' },
    { text: levels[3].title_en, mode: 'image_to_prompt', enter: 'checkBalanceScene' },
    { text: levels[4].title_en, mode: 'avatar_brain', enter: 'checkBalanceScene' },
    { text: levels[5].title_en, mode: 'chat_with_avatar', enter: 'checkBalanceScene' },
    { text: levels[6].title_en, mode: 'select_model', enter: 'checkBalanceScene' },
    { text: levels[7].title_en, mode: 'voice', enter: 'checkBalanceScene' },
    { text: levels[8].title_en, mode: 'text_to_speech', enter: 'checkBalanceScene' },
    { text: levels[9].title_en, mode: 'image_to_video', enter: 'checkBalanceScene' },
    { text: levels[10].title_en, mode: 'text_to_video', enter: 'checkBalanceScene' },
    { text: levels[11].title_en, mode: 'text_to_image', enter: 'checkBalanceScene' },
    { text: levels[100].title_en, mode: 'top_up_balance', enter: 'paymentScene' },
    { text: levels[101].title_en, mode: 'balance', enter: 'balanceScene' },
    { text: levels[102].title_en, mode: 'invite', enter: 'inviteScene' },
    { text: levels[103].title_en, mode: 'help', enter: 'helpScene' },
    { text: levels[104].title_en, mode: 'main_menu', enter: 'menuScene' },
    { text: '/invite', mode: 'invite', enter: 'inviteScene' },
    { text: '/price', mode: 'price', command: true },
    { text: '/buy', mode: 'top_up_balance', enter: 'paymentScene' },
    { text: '/balance', mode: 'balance', enter: 'balanceScene' },
    { text: '/help', mode: 'help', enter: 'helpScene' },
    { text: '/menu', mode: 'main_menu', enter: 'menuScene' },
    { text: '/start', enter: 'startScene' },
  ]

  for (const c of cases) {
    it(`handles '${c.text}'`, async () => {
      ctx.message = { text: c.text }
      await handleMenu(ctx as any)
      if (c.mode) expect(ctx.session.mode).toBe(c.mode)
      if (c.enter) expect(ctx.scene.enter).toHaveBeenCalledWith(c.enter)
      if (c.command) expect(priceCommand).toHaveBeenCalledWith(ctx)
    })
  }

  it('ignores unknown text', async () => {
    ctx.message = { text: 'unknown' }
    await handleMenu(ctx as any)
    expect(ctx.scene.enter).not.toHaveBeenCalled()
    expect(priceCommand).not.toHaveBeenCalled()
  })
})