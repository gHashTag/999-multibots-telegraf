import { describe, it, expect, beforeAll, jest } from '@jest/globals'
// Mock BOT_TOKENS to distinct values for coverage
jest.mock('@/core/bot', () => ({
  BOT_TOKENS: ['firstToken', 'secondToken', 'thirdToken'],
}))
import { getBotToken } from '@/handlers/getBotToken'
import { BOT_TOKENS } from '@/core/bot'
import { MyContext } from '@/interfaces'

describe('getBotToken', () => {
  let ctx: Partial<MyContext>
  beforeAll(() => {
    // Ensure BOT_TOKENS has at least two entries
    expect(BOT_TOKENS.length).toBeGreaterThanOrEqual(2)
  })
  beforeEach(() => {
    // create minimal ctx
    ctx = { telegram: { token: '' } as any }
  })

  it('returns first BOT_TOKENS[0] by default', () => {
    ctx.telegram!.token = 'unknown'
    expect(getBotToken(ctx as MyContext)).toBe(BOT_TOKENS[0])
  })
  it('returns BOT_TOKENS[0] when token matches', () => {
    ctx.telegram!.token = BOT_TOKENS[0]!
    expect(getBotToken(ctx as MyContext)).toBe(BOT_TOKENS[0])
  })
  it('returns BOT_TOKENS[1] when token matches second', () => {
    ctx.telegram!.token = BOT_TOKENS[1]!
    expect(getBotToken(ctx as MyContext)).toBe(BOT_TOKENS[1])
  })
})