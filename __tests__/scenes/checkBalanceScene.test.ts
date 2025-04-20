import makeMockContext from '../utils/mockTelegrafContext'
// import {
//   checkBalanceSceneEnterHandler,
//   ModeEnum,
// } from '../../src/scenes/checkBalanceScene' // Закомментировано
import * as supabase from '../../src/core/supabase'
import * as priceHelpers from '../../src/price/helpers'
import * as userInfo from '../../src/handlers/getUserInfo'
import { checkBalanceScene } from '../../src/scenes/checkBalanceScene'

jest.mock('../../src/core/supabase', () => ({
  getUserBalance: jest.fn(),
}))
jest.mock('../../src/price/helpers', () => ({
  sendBalanceMessage: jest.fn(),
  sendInsufficientStarsMessage: jest.fn(),
  calculateCostInStars: jest.fn().mockReturnValue(5),
}))
jest.mock('../../src/handlers/getUserInfo', () => ({
  getUserInfo: jest.fn().mockReturnValue({ userId: 42 }),
}))

describe('checkBalanceSceneEnterHandler', () => {
  let ctx = makeMockContext()
  beforeEach(() => {
    ctx = makeMockContext()
    jest.clearAllMocks()
    ctx.from.id = 42
    ctx.session = { mode: ModeEnum.NeuroPhoto }
  })

  it('sends balance and enters scene when balance sufficient', async () => {
    ;(supabase.getUserBalance as jest.Mock).mockResolvedValue(10)
    await checkBalanceSceneEnterHandler(ctx as any)
    expect(priceHelpers.sendBalanceMessage).toHaveBeenCalledWith(
      ctx,
      10,
      5,
      true
    )
    expect(ctx.scene.enter).toHaveBeenCalledWith(ModeEnum.NeuroPhoto)
  })

  it('sends insufficient message and leaves when balance insufficient', async () => {
    ;(supabase.getUserBalance as jest.Mock).mockResolvedValue(2)
    await checkBalanceSceneEnterHandler(ctx as any)
    expect(priceHelpers.sendInsufficientStarsMessage).toHaveBeenCalledWith(
      ctx,
      2,
      true
    )
    expect(ctx.scene.leave).toHaveBeenCalled()
  })

  it('throws error when getUserBalance rejects', async () => {
    const err = new Error('DB error')(
      supabase.getUserBalance as jest.Mock
    ).mockRejectedValue(err)
    await expect(checkBalanceSceneEnterHandler(ctx as any)).rejects.toThrow(
      'DB error'
    )
  })
})
