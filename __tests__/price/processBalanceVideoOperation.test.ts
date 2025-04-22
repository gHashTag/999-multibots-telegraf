import { jest, describe, it, expect, beforeEach } from '@jest/globals'
import {
  processBalanceVideoOperation,
  VIDEO_MODELS,
} from '@/price/helpers/processBalanceVideoOperation'
import { getUserBalance } from '@/core/supabase/getUserBalance'
import { updateUserBalance } from '@/core/supabase/updateUserBalance'
import { calculateFinalPrice } from '@/price/helpers/calculateFinalPrice'
import {
  VideoModel,
  BalanceOperationResult,
  UserType,
  MyContext,
} from '@/interfaces'
import { makeMockContext } from '../utils/makeMockContext'
import { logger } from '@/utils/logger'
import { sendBalanceMessage } from '@/price/helpers/sendBalanceMessage'

// Mock dependencies
jest.mock('@/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}))

jest.mock('@/core/supabase/getUserBalance')
jest.mock('@/core/supabase/updateUserBalance')
jest.mock('@/price/helpers/sendBalanceMessage')

// Type the mocks correctly
const mockedGetUserBalance = getUserBalance as jest.MockedFunction<
  typeof getUserBalance
>
const mockedUpdateUserBalance = updateUserBalance as jest.MockedFunction<
  typeof updateUserBalance
>
const mockedLogger = logger as jest.Mocked<typeof logger>

// Mock UserType object
const mockUser: UserType = {
  id: BigInt(12345),
  telegram_id: BigInt(12345), // Используем BigInt как в UserType
  first_name: 'Test',
  is_bot: false,
  username: 'testuser',
  language_code: 'ru',
  created_at: new Date(),
  user_id: 'uuid-123',
  // Добавляем другие поля UserType по необходимости
}

describe('processBalanceVideoOperation', () => {
  const userIdString = mockUser.telegram_id.toString() // Преобразуем BigInt в строку
  const videoModelName: VideoModel = 'i2vgen-xl'
  let ctx: MyContext

  beforeEach(() => {
    jest.clearAllMocks()
    ctx = makeMockContext()
    ctx.update = {
      update_id: 1,
      message: {
        message_id: 1,
        from: mockUser as any,
        chat: {
          id: Number(mockUser.telegram_id),
          type: 'private',
          first_name: mockUser.first_name,
        },
        date: Date.now(),
        text: 'test',
      },
    }

    mockedGetUserBalance.mockClear()
    mockedUpdateUserBalance.mockClear()
    mockedLogger.info.mockClear()
    mockedLogger.error.mockClear()
  })

  it('should return INSUFFICIENT_FUNDS if user balance is lower than required', async () => {
    mockedGetUserBalance.mockResolvedValue(5)
    const result = await processBalanceVideoOperation(ctx, videoModelName, true) // Передаем isRu
    expect(mockedGetUserBalance).toHaveBeenCalledWith(userIdString)
    expect(mockedUpdateUserBalance).not.toHaveBeenCalled()
    expect(mockedLogger.info).toHaveBeenCalledWith(
      expect.stringContaining('Insufficient funds'),
      expect.objectContaining({
        telegram_id: userIdString,
        requiredCost: 10,
        currentBalance: 5,
      })
    )
    expect(result).toEqual(
      expect.objectContaining({
        success: false,
        error: expect.stringContaining('Insufficient funds'),
      })
    )
  })

  it('should return ERROR if getUserBalance fails', async () => {
    mockedGetUserBalance.mockRejectedValue(new Error('Supabase error'))
    const result = await processBalanceVideoOperation(ctx, videoModelName, true) // Передаем isRu
    expect(mockedGetUserBalance).toHaveBeenCalledWith(userIdString)
    expect(mockedUpdateUserBalance).not.toHaveBeenCalled()
    expect(mockedLogger.error).toHaveBeenCalledWith(
      'Error processing video balance operation:',
      expect.objectContaining({ telegram_id: userIdString })
    )
    expect(result).toEqual(
      expect.objectContaining({ success: false, error: expect.any(String) })
    )
  })

  it('should return SUCCESS and call updateUserBalance if balance is sufficient', async () => {
    mockedGetUserBalance.mockResolvedValue(20)
    mockedUpdateUserBalance.mockResolvedValue(10)
    const result = await processBalanceVideoOperation(ctx, videoModelName, true) // Передаем isRu
    expect(mockedGetUserBalance).toHaveBeenCalledWith(userIdString)
    expect(mockedUpdateUserBalance).toHaveBeenCalledWith(userIdString, -10)
    expect(mockedLogger.info).toHaveBeenCalledWith(
      expect.stringContaining('Sufficient funds'),
      expect.objectContaining({
        telegram_id: userIdString,
        requiredCost: 10,
        currentBalance: 20,
      })
    )
    expect(mockedLogger.info).toHaveBeenCalledWith(
      expect.stringContaining('Balance updated successfully')
    )
    expect(result).toEqual(
      expect.objectContaining({ success: true, newBalance: 10 })
    )
  })

  it('should return ERROR if updateUserBalance returns null', async () => {
    mockedGetUserBalance.mockResolvedValue(20)
    mockedUpdateUserBalance.mockResolvedValue(null)
    const result = await processBalanceVideoOperation(ctx, videoModelName, true) // Передаем isRu
    expect(mockedGetUserBalance).toHaveBeenCalledWith(userIdString)
    expect(mockedUpdateUserBalance).toHaveBeenCalledWith(userIdString, -10)
    expect(mockedLogger.error).toHaveBeenCalledWith(
      expect.stringContaining('Error updating user balance')
    )
    expect(result).toEqual(
      expect.objectContaining({
        success: false,
        error: expect.stringContaining('Failed to update balance'),
      })
    )
  })

  it('should return ERROR for invalid video model', async () => {
    const invalidModelName = 'invalid_model' as VideoModel
    const result = await processBalanceVideoOperation(
      ctx,
      invalidModelName,
      true
    ) // Передаем isRu
    expect(mockedGetUserBalance).not.toHaveBeenCalled()
    expect(mockedUpdateUserBalance).not.toHaveBeenCalled()
    expect(mockedLogger.error).toHaveBeenCalledWith(
      expect.stringContaining('Invalid video model selected'),
      expect.objectContaining({
        telegram_id: userIdString,
        videoModelName: invalidModelName,
      })
    )
    expect(result).toEqual(
      expect.objectContaining({ success: false, error: 'Invalid model' })
    )
  })

  it('should return ERROR if userId is not found in context', async () => {
    const ctxWithoutUser = makeMockContext()
    ctxWithoutUser.update = {
      update_id: 2,
      message: {
        message_id: 2,
        from: undefined,
        chat: { id: 999, type: 'private', first_name: 'NoUser' },
        date: Date.now(),
        text: 'test',
      },
    }

    const result = await processBalanceVideoOperation(
      ctxWithoutUser,
      videoModelName,
      false
    )
    expect(result).toEqual(
      expect.objectContaining({ success: false, error: 'User ID not found' })
    )
    expect(mockedLogger.error).toHaveBeenCalledWith(
      expect.stringContaining('User ID not found')
    )
    expect(mockedGetUserBalance).not.toHaveBeenCalled()
    expect(mockedUpdateUserBalance).not.toHaveBeenCalled()
  })
})
