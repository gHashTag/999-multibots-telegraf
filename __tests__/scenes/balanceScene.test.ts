/**
 * Tests for balanceScene
 */
import { balanceScene } from '../../src/scenes/balanceScene'
import makeMockContext from '../utils/mockTelegrafContext'
import { MyContext } from '@/interfaces'

// Mock getUserBalance from Supabase
jest.mock('../../src/core/supabase', () => ({
  getUserBalance: jest.fn(),
}))
import { getUserBalance } from '../../src/core/supabase'

describe('balanceScene', () => {
  let ctx: MyContext

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('replies with balance in Russian and enters menuScene', async () => {
    ctx = makeMockContext()
    ;(getUserBalance as jest.Mock).mockResolvedValueOnce(456)

    await balanceScene.enter(ctx as any)

    expect(getUserBalance).toHaveBeenCalledWith(ctx.from.id.toString())
    expect(ctx.reply).toHaveBeenCalledWith('💰✨ <b>Ваш баланс:</b> 456 ⭐️', {
      parse_mode: 'HTML',
    })
    expect(ctx.scene.enter).toHaveBeenCalledWith('menuScene')
  })

  it('replies with balance in English and enters menuScene', async () => {
    ctx = makeMockContext({
      update_id: 1,
      message: {
        from: { id: 1, language_code: 'en', is_bot: false, first_name: 'Test' },
        chat: { id: 1, type: 'private', first_name: 'Test' },
        date: 0,
        message_id: 1,
      },
    })
    ;(getUserBalance as jest.Mock).mockResolvedValueOnce(789)

    await balanceScene.enter(ctx as any)

    expect(getUserBalance).toHaveBeenCalledWith(ctx.from.id.toString())
    expect(ctx.reply).toHaveBeenCalledWith(
      '💰✨ <b>Your balance:</b> 789 ⭐️',
      { parse_mode: 'HTML' }
    )
    expect(ctx.scene.enter).toHaveBeenCalledWith('menuScene')
  })

  it('throws error when getUserBalance rejects', async () => {
    ctx = makeMockContext()
    const error = new Error('fetch failed')
    ;(getUserBalance as jest.Mock).mockRejectedValueOnce(error)

    await expect(balanceScene.enter(ctx as any)).rejects.toThrow('fetch failed')
    expect(getUserBalance).toHaveBeenCalledWith(ctx.from.id.toString())
  })
})
