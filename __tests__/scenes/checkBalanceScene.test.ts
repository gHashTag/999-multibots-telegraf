import { jest, describe, beforeEach, it, expect } from '@jest/globals'
import makeMockContext from '../utils/mockTelegrafContext'
import { checkBalanceSceneEnterHandler, ModeEnum, modeCosts } from '../../src/scenes/checkBalanceScene'
import { getUserBalance } from '@/core/supabase'
import { sendBalanceMessage, sendInsufficientStarsMessage } from '@/price/helpers'

// Мокаем зависимости
jest.mock('@/core/supabase', () => ({
  getUserBalance: jest.fn(),
}))
jest.mock('@/price/helpers', () => {
  const actual = jest.requireActual('@/price/helpers')
  return {
    ...actual,
    sendBalanceMessage: jest.fn(),
    sendInsufficientStarsMessage: jest.fn(),
  }
})

describe('checkBalanceSceneEnterHandler', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('enters next scene when cost is 0', async () => {
    const ctx = makeMockContext({}, { session: { data: '', mode: ModeEnum.Avatar } })
    ;(getUserBalance as jest.Mock).mockResolvedValueOnce(100)
    await checkBalanceSceneEnterHandler(ctx)
    expect(sendBalanceMessage).not.toHaveBeenCalled()
    expect(sendInsufficientStarsMessage).not.toHaveBeenCalled()
    expect(ctx.scene.enter).toHaveBeenCalledWith(ModeEnum.Avatar)
  })

  it('sends balance message and enters scene when balance >= cost', async () => {
    const mode = ModeEnum.NeuroPhoto
    const cost = modeCosts[mode]
    const ctx = makeMockContext({}, { session: { data: '', mode } })
    ;(getUserBalance as jest.Mock).mockResolvedValueOnce(cost)
    await checkBalanceSceneEnterHandler(ctx)
    expect(sendBalanceMessage).toHaveBeenCalledWith(ctx, cost, cost, true)
    expect(sendInsufficientStarsMessage).not.toHaveBeenCalled()
    expect(ctx.scene.enter).toHaveBeenCalledWith(mode)
  })

  it('sends insufficient message and leaves when balance < cost', async () => {
    const mode = ModeEnum.NeuroPhoto
    const cost = modeCosts[mode]
    const ctx = makeMockContext({}, { session: { data: '', mode } })
    ;(getUserBalance as jest.Mock).mockResolvedValueOnce(cost - 1)
    await checkBalanceSceneEnterHandler(ctx)
    expect(sendBalanceMessage).toHaveBeenCalledWith(ctx, cost - 1, cost, true)
    expect(sendInsufficientStarsMessage).toHaveBeenCalledWith(ctx, cost - 1, true)
    expect(ctx.scene.leave).toHaveBeenCalled()
  })
})