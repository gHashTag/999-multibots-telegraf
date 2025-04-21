// Mock supabase client
const mockSingle = jest.fn()
const mockEq = jest.fn(() => ({ single: mockSingle }))
const mockSelect = jest.fn(() => ({ eq: mockEq }))
const mockFrom = jest.fn(() => ({ select: mockSelect }))
jest.mock('@/core/supabase', () => ({ supabase: { from: mockFrom } }))

import { getAspectRatio } from '@/core/supabase/getAspectRatio'

describe('getAspectRatio', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('returns aspect_ratio when data exists and no error', async () => {
    mockSingle.mockResolvedValue({
      data: { aspect_ratio: '16:9' },
      error: null,
    })
    const result = await getAspectRatio(42)
    expect(mockFrom).toHaveBeenCalledWith('users')
    expect(mockSelect).toHaveBeenCalledWith('aspect_ratio')
    expect(mockEq).toHaveBeenCalledWith('telegram_id', '42')
    expect(result).toBe('16:9')
  })

  it('returns null when supabase returns error', async () => {
    mockSingle.mockResolvedValue({ data: null, error: { message: 'fail' } })
    const result = await getAspectRatio(7)
    expect(result).toBeNull()
  })

  it('returns null when single throws', async () => {
    mockSingle.mockRejectedValue(new Error('exception'))
    const result = await getAspectRatio(0)
    expect(result).toBeNull()
  })
})
