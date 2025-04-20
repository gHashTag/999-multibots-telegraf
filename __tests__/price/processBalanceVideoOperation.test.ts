import makeMockContext from '../utils/mockTelegrafContext'
import { processBalanceVideoOperation, VIDEO_MODELS } from '../../src/price/helpers/processBalanceVideoOperation'
import * as supabase from '../../src/core/supabase'

describe('processBalanceVideoOperation', () => {
  const telegram_id = 1
  let ctx = makeMockContext()
  beforeEach(() => {
    ctx = makeMockContext()
    jest.clearAllMocks()
  })

  it('should return error for invalid model', async () => {
    jest.spyOn(supabase, 'getUserBalance').mockResolvedValue(100)
    const res = await processBalanceVideoOperation({
      ctx,
      videoModel: 'invalid',
      telegram_id,
      is_ru: true,
    })
    expect(res.success).toBe(false)
    expect(res.error).toBe('Invalid model')
    expect(ctx.telegram.sendMessage).toHaveBeenCalled()
  })

  it('should return error when insufficient funds', async () => {
    const modelName = VIDEO_MODELS[0].name
    const price = require('../../src/price/helpers/calculateFinalPrice').calculateFinalPrice(modelName)
    jest.spyOn(supabase, 'getUserBalance').mockResolvedValue(price - 1)
    const res = await processBalanceVideoOperation({
      ctx,
      videoModel: modelName,
      telegram_id,
      is_ru: false,
    })
    expect(res.success).toBe(false)
    expect(res.error).toBeDefined()
    expect(ctx.telegram.sendMessage).toHaveBeenCalledWith(
      ctx.from.id.toString(),
      'Insufficient funds. Top up your balance by calling the /buy command.'
    )
  })

  it('should succeed and return new balance for valid model and funds', async () => {
    const modelName = VIDEO_MODELS[1].name
    const price = require('../../src/price/helpers/calculateFinalPrice').calculateFinalPrice(modelName)
    jest.spyOn(supabase, 'getUserBalance').mockResolvedValue(price + 10)
    const res = await processBalanceVideoOperation({
      ctx,
      videoModel: modelName,
      telegram_id,
      is_ru: false,
    })
    expect(res.success).toBe(true)
    expect(res.modePrice).toBe(price)
    expect(res.newBalance).toBe((price + 10) - price)
  })
})