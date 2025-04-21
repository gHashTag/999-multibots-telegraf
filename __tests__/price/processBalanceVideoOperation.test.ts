import { jest, describe, it, expect, beforeEach } from '@jest/globals'
import { processBalanceVideoOperation, ProcessBalanceResult, VIDEO_MODELS } from '@/price/helpers/processBalanceVideoOperation'
import { getUserBalance } from '@/core/supabase/getUserBalance'
import { reduceBalance } from '@/core/supabase/reduceBalance'
import { calculateFinalPrice } from '@/price/helpers/calculateFinalPrice'
import { VideoModel, BalanceOperationResult, User } from '@/interfaces'
import { MyContext } from '@/interfaces'
import { makeMockContext } from '../utils/makeMockContext'
import { logger } from '@/utils/logger'
import { sendBalanceMessage } from '@/price/helpers/sendBalanceMessage'
import { mockBotInfo } from '../fixtures/botInfo'

// Mock dependencies
jest.mock('@/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}))

jest.mock('@/core/supabase/getUserBalance')
jest.mock('@/core/supabase/reduceBalance')
jest.mock('@/price/helpers/sendBalanceMessage')

// Type the mocks correctly
const mockedGetUserBalance = getUserBalance as jest.MockedFunction<typeof getUserBalance>
const mockedReduceBalance = reduceBalance as jest.MockedFunction<typeof reduceBalance>
const mockedLogger = logger as jest.Mocked<typeof logger>

// Mock User object
const mockUser: User = {
  id: 12345,
  first_name: 'Test',
  is_bot: false,
  username: 'testuser',
  language_code: 'ru',
}

describe('processBalanceVideoOperation', () => {
  const userId = mockUser.id
  const videoModelName: VideoModel = 'i2vgen-xl'
  const ctx = makeMockContext({ user: mockUser, botInfo: mockBotInfo })

  beforeEach(() => {
    jest.clearAllMocks()
    mockedGetUserBalance.mockClear()
    mockedReduceBalance.mockClear()
    mockedLogger.info.mockClear()
    mockedLogger.error.mockClear()
  })

  it('should return INSUFFICIENT_FUNDS if user balance is lower than required', async () => {
    mockedGetUserBalance.mockResolvedValue({ balance: 5, error: null })

    const result = await processBalanceVideoOperation(ctx, userId, videoModelName)

    expect(mockedGetUserBalance).toHaveBeenCalledWith(userId)
    expect(mockedReduceBalance).not.toHaveBeenCalled()
    expect(mockedLogger.info).toHaveBeenCalledWith(expect.stringContaining('Insufficient funds'), expect.objectContaining({ userId, required: 10, balance: 5 }))
    expect(result).toBe(ProcessBalanceResult.INSUFFICIENT_FUNDS)
  })

  it('should return ERROR if getUserBalance fails', async () => {
    const error = new Error('Supabase error')
    mockedGetUserBalance.mockResolvedValue({ balance: null, error })

    const result = await processBalanceVideoOperation(ctx, userId, videoModelName)

    expect(mockedGetUserBalance).toHaveBeenCalledWith(userId)
    expect(mockedReduceBalance).not.toHaveBeenCalled()
    expect(mockedLogger.error).toHaveBeenCalledWith('Error getting user balance:', error)
    expect(result).toBe(ProcessBalanceResult.ERROR)
  })

  it('should return SUCCESS and reduce balance if balance is sufficient', async () => {
    mockedGetUserBalance.mockResolvedValue({ balance: 20, error: null })
    mockedReduceBalance.mockResolvedValue(BalanceOperationResult.SUCCESS)

    const result = await processBalanceVideoOperation(ctx, userId, videoModelName)

    expect(mockedGetUserBalance).toHaveBeenCalledWith(userId)
    expect(mockedReduceBalance).toHaveBeenCalledWith(userId, 10, 'video', videoModelName)
    expect(mockedLogger.info).toHaveBeenCalledWith(expect.stringContaining('Sufficient funds'), expect.objectContaining({ userId, required: 10, balance: 20 }))
    expect(mockedLogger.info).toHaveBeenCalledWith(expect.stringContaining('Balance reduced successfully'), expect.objectContaining({ userId, amount: 10 }))
    expect(result).toBe(ProcessBalanceResult.SUCCESS)
  })

  it('should return ERROR if reduceBalance fails', async () => {
    mockedGetUserBalance.mockResolvedValue({ balance: 20, error: null })
    mockedReduceBalance.mockResolvedValue(BalanceOperationResult.ERROR)

    const result = await processBalanceVideoOperation(ctx, userId, videoModelName)

    expect(mockedGetUserBalance).toHaveBeenCalledWith(userId)
    expect(mockedReduceBalance).toHaveBeenCalledWith(userId, 10, 'video', videoModelName)
    expect(mockedLogger.error).toHaveBeenCalledWith('Error reducing balance:', { userId, amount: 10 })
    expect(result).toBe(ProcessBalanceResult.ERROR)
  })

  it('should return ERROR for invalid video model', async () => {
    const invalidModelName = 'invalid_model' as VideoModel
    const result = await processBalanceVideoOperation(ctx, userId, invalidModelName)

    expect(mockedGetUserBalance).not.toHaveBeenCalled()
    expect(mockedReduceBalance).not.toHaveBeenCalled()
    expect(mockedLogger.error).toHaveBeenCalledWith(expect.stringContaining('Invalid video model selected'), expect.objectContaining({ userId, model: invalidModelName }))
    expect(result).toBe(ProcessBalanceResult.ERROR)
  })

  it('should return ERROR if userId is not found in context', async () => {
    const ctxWithoutUser = makeMockContext({ user: undefined, botInfo: mockBotInfo })

    const result = await processBalanceVideoOperation(ctxWithoutUser, 0, videoModelName)

    expect(result).toBe(ProcessBalanceResult.ERROR)
    expect(mockedLogger.error).toHaveBeenCalledWith(expect.stringContaining('User ID not found in context'))
    expect(mockedGetUserBalance).not.toHaveBeenCalled()
    expect(mockedReduceBalance).not.toHaveBeenCalled()
  })
})