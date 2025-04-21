// Mock supabase client
jest.mock('@/core/supabase', () => ({ supabase: { from: jest.fn() } }))
import { supabase } from '@/core/supabase'
import { getLatestUserModel } from '@/core/supabase/getLatestUserModel'
import { createMockSupabaseClient } from '@/core/supabase/createMockSupabaseClient'
import { SupabaseClient } from '@supabase/supabase-js'

describe('getLatestUserModel', () => {
  let mockSupabase: SupabaseClient

  beforeEach(() => {
    jest.clearAllMocks()
    mockSupabase = createMockSupabaseClient() as unknown as SupabaseClient
    ;(supabase as any) = mockSupabase // Assign mock
  })

  it('should return the latest user model if found', async () => {
    const mockTelegramId = '12345'
    const mockModels = [
      {
        id: 1,
        user_id: 'user1',
        model_id: 'modelA',
        created_at: '2023-01-01T10:00:00Z',
      },
      {
        id: 2,
        user_id: 'user1',
        model_id: 'modelB',
        created_at: '2023-01-02T12:00:00Z',
      }, // latest
    ]
    // Mock the chain of Supabase calls
    const selectMock = jest.fn().mockReturnThis()
    const eqMock = jest.fn().mockReturnThis()
    const orderMock = jest.fn().mockResolvedValue({ data: mockModels, error: null })

    mockSupabase.from = jest.fn().mockReturnValue({
      select: selectMock,
      eq: eqMock,
      order: orderMock,
    })

    const result = await getLatestUserModel(mockTelegramId)

    expect(result).toBe('modelB')
    expect(mockSupabase.from).toHaveBeenCalledWith('user_models')
    expect(selectMock).toHaveBeenCalledWith('model_id, created_at')
    expect(eqMock).toHaveBeenCalledWith('user_id', mockTelegramId)
    expect(orderMock).toHaveBeenCalledWith('created_at', { ascending: false })
  })

  it('should return null if no models are found for the user', async () => {
    const mockTelegramId = '67890'

    // Mock the chain of Supabase calls to return empty data
    const selectMock = jest.fn().mockReturnThis()
    const eqMock = jest.fn().mockReturnThis()
    const orderMock = jest.fn().mockResolvedValue({ data: [], error: null })

    mockSupabase.from = jest.fn().mockReturnValue({
      select: selectMock,
      eq: eqMock,
      order: orderMock,
    })

    const result = await getLatestUserModel(mockTelegramId)

    expect(result).toBeNull()
    expect(mockSupabase.from).toHaveBeenCalledWith('user_models')
    expect(selectMock).toHaveBeenCalledWith('model_id, created_at')
    expect(eqMock).toHaveBeenCalledWith('user_id', mockTelegramId)
    expect(orderMock).toHaveBeenCalledWith('created_at', { ascending: false })
  })

  it('should throw an error if Supabase query fails', async () => {
    const mockTelegramId = '11223'
    const mockError = new Error('Supabase query failed')

    // Mock the chain of Supabase calls to return an error
    const selectMock = jest.fn().mockReturnThis()
    const eqMock = jest.fn().mockReturnThis()
    const orderMock = jest.fn().mockResolvedValue({ data: null, error: mockError })

    mockSupabase.from = jest.fn().mockReturnValue({
      select: selectMock,
      eq: eqMock,
      order: orderMock,
    })

    await expect(getLatestUserModel(mockTelegramId)).rejects.toThrow(
      'Supabase query failed'
    )

    expect(mockSupabase.from).toHaveBeenCalledWith('user_models')
    expect(selectMock).toHaveBeenCalledWith('model_id, created_at')
    expect(eqMock).toHaveBeenCalledWith('user_id', mockTelegramId)
    expect(orderMock).toHaveBeenCalledWith('created_at', { ascending: false })
  })
})
