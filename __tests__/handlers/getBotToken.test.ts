// Mock BOT_TOKENS to distinct values for coverage
jest.mock('@/core/bot', () => ({
  BOT_TOKENS: ['firstToken', 'secondToken', 'thirdToken'],
}))
import { getBotToken } from '@/handlers/getBotToken'
import { BOT_TOKENS } from '@/core/bot'
import { MyContext } from '@/interfaces'

describe('getBotToken', () => {
  beforeAll(() => {
    // Ensure BOT_TOKENS has at least two entries
    expect(BOT_TOKENS.length).toBeGreaterThanOrEqual(2)
  })

  it('returns first BOT_TOKENS[0] by default', () => {
    const ctx: Partial<MyContext> = {
      telegram: { token: 'unknown' } as any,
    }
    expect(getBotToken(ctx as MyContext)).toBe(BOT_TOKENS[0])
  })
  it('returns BOT_TOKENS[0] when token matches', () => {
    const ctx: Partial<MyContext> = {
      telegram: { token: BOT_TOKENS[0]! } as any,
    }
    expect(getBotToken(ctx as MyContext)).toBe(BOT_TOKENS[0])
  })
  it('returns BOT_TOKENS[1] when token matches second', () => {
    const ctx: Partial<MyContext> = {
      telegram: { token: BOT_TOKENS[1]! } as any,
    }
    expect(getBotToken(ctx as MyContext)).toBe(BOT_TOKENS[1])
  })
})
