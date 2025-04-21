// Mock supabase and logger
jest.mock('@/core/supabase', () => ({ supabase: { from: jest.fn() } }))
jest.mock('@/utils/logger', () => ({ logger: { error: jest.fn() } }))
import { supabase } from '@/core/supabase'
import { logger } from '@/utils/logger'
import { getReferalsCountAndUserData } from '@/core/supabase/getReferalsCountAndUserData'

describe('getReferalsCountAndUserData', () => {
  const telegram_id = '100'
  beforeEach(() => {
    jest.resetModules()
    jest.clearAllMocks()
  })

  it('returns defaults when user fetch errors', async () => {
    const eqMock = jest.fn().mockReturnValue({
      single: jest
        .fn()
        .mockResolvedValue({ data: null, error: { message: 'uerr' } }),
    })
    const selectMock = jest.fn().mockReturnValue({ eq: eqMock })
    ;(supabase.from as jest.Mock).mockReturnValue({ select: selectMock })
    const result = await getReferalsCountAndUserData(telegram_id)
    expect(result).toEqual({
      count: 0,
      subscription: 'stars',
      level: 0,
      userData: null,
      isExist: false,
    })
  })

  it('returns defaults when referals fetch errors', async () => {
    // user ok
    const userData = { user_id: 5, level: 2, subscription: 'gold' }
    const singleUser = jest
      .fn()
      .mockResolvedValue({ data: userData, error: null })
    const eqUser = jest.fn().mockReturnValue({ single: singleUser })
    const selectUser = jest.fn().mockReturnValue({ eq: eqUser })
    // referals error
    const selectRefs = jest.fn().mockReturnValue({
      eq: jest
        .fn()
        .mockResolvedValue({ data: null, error: { message: 'referr' } }),
    })
    const fromMock = supabase.from as jest.Mock
    fromMock.mockReturnValueOnce({ select: selectUser })
    fromMock.mockReturnValueOnce({ select: selectRefs })
    const result = await getReferalsCountAndUserData(telegram_id)
    expect(result).toEqual({
      count: 0,
      subscription: 'stars',
      level: 0,
      userData: null,
      isExist: false,
    })
  })

  it('returns correct data on success', async () => {
    const userData = { user_id: 10, level: 3, subscription: 'silver' }
    const singleUser = jest
      .fn()
      .mockResolvedValue({ data: userData, error: null })
    const eqUser = jest.fn().mockReturnValue({ single: singleUser })
    const selectUser = jest.fn().mockReturnValue({ eq: eqUser })
    const refData = [{ inviter: 10 }, { inviter: 10 }]
    const selectRefs = jest.fn().mockReturnValue({
      eq: jest.fn().mockResolvedValue({ data: refData, error: null }),
    })
    const fromMock = supabase.from as jest.Mock
    fromMock.mockReturnValueOnce({ select: selectUser })
    fromMock.mockReturnValueOnce({ select: selectRefs })
    const result = await getReferalsCountAndUserData(telegram_id)
    expect(result).toEqual({
      count: 2,
      level: 3,
      subscription: 'silver',
      userData,
      isExist: true,
    })
  })

  it('returns defaults on exception', async () => {
    ;(supabase.from as jest.Mock).mockImplementation(() => {
      throw new Error('boom')
    })
    const result = await getReferalsCountAndUserData(telegram_id)
    expect(result).toEqual({
      count: 0,
      subscription: 'stars',
      level: 0,
      userData: null,
      isExist: false,
    })
    expect(logger.error).toHaveBeenCalledWith(
      'Ошибка в getReferalsCountAndUserData:',
      expect.any(Error)
    )
  })
})
