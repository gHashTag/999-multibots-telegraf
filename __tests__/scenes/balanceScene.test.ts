/**
 * Tests for balanceScene
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals'
import { balanceScene } from '../../src/scenes/balanceScene'
import makeMockContext from '../utils/mockTelegrafContext'

// Mock getUserBalance from Supabase
jest.mock('../../src/core/supabase', () => ({
  getUserBalance: jest.fn(),
}))
import { getUserBalance } from '../../src/core/supabase'

describe('balanceScene', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('replies with balance in Russian and enters menuScene', async () => {
    const ctx = makeMockContext()
    // Default ctx.from.language_code is 'ru'
    ;(getUserBalance as jest.Mock).mockResolvedValueOnce(456)

    // Invoke the scene step
    // @ts-ignore steps is private
    const step = balanceScene.steps[0]
    await step(ctx)

    // Expect getUserBalance called with telegram ID
    expect(getUserBalance).toHaveBeenCalledWith(ctx.from.id)
    // Expect reply with Russian text and HTML parse mode
    expect(ctx.reply).toHaveBeenCalledWith(
      '💰✨ <b>Ваш баланс:</b> 456 ⭐️',
      { parse_mode: 'HTML' }
    )
    // Expect to enter menuScene
    expect(ctx.scene.enter).toHaveBeenCalledWith('menuScene')
  })

  it('replies with balance in English and enters menuScene', async () => {
    const ctx = makeMockContext()
    // Override language to English
    ctx.from.language_code = 'en'
    ;(getUserBalance as jest.Mock).mockResolvedValueOnce(789)

    // Invoke the scene step
    // @ts-ignore
    const step = balanceScene.steps[0]
    await step(ctx)

    // Expect getUserBalance called with telegram ID
    expect(getUserBalance).toHaveBeenCalledWith(ctx.from.id)
    // Expect reply with English text
    expect(ctx.reply).toHaveBeenCalledWith(
      '💰✨ <b>Your balance:</b> 789 ⭐️',
      { parse_mode: 'HTML' }
    )
    // Expect to enter menuScene
    expect(ctx.scene.enter).toHaveBeenCalledWith('menuScene')
  })
  
  it('throws error when getUserBalance rejects', async () => {
    const ctx = makeMockContext()
    const error = new Error('fetch failed')
    ;(getUserBalance as jest.Mock).mockRejectedValueOnce(error)
    // @ts-ignore
    const step = balanceScene.steps[0]
    await expect(step(ctx)).rejects.toThrow('fetch failed')
  })
})