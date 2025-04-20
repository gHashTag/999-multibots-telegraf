import makeMockContext from '../utils/mockTelegrafContext'
import { priceCommand } from '../../src/commands/priceCommand'

describe('priceCommand', () => {
  let ctx: ReturnType<typeof makeMockContext>
  beforeEach(() => {
    ctx = makeMockContext()
    jest.clearAllMocks()
  })

  it('replies with English price message for non-Russian user', async () => {
    ctx.from.language_code = 'en'
    await priceCommand(ctx as any)
    expect(ctx.reply).toHaveBeenCalledWith(
      expect.stringContaining('<b>💰 Price of all services:</b>'),
      { parse_mode: 'HTML' }
    )
  })

  it('replies with Russian price message for Russian user', async () => {
    ctx.from.language_code = 'ru'
    await priceCommand(ctx as any)
    expect(ctx.reply).toHaveBeenCalledWith(
      expect.stringContaining('<b>💰 Стоимость всех услуг:</b>'),
      { parse_mode: 'HTML' }
    )
  })
})