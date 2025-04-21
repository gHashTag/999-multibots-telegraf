// Mock supabase client
jest.mock('@/core/supabase', () => ({ supabase: { from: jest.fn() } }))
import { supabase } from '@/core/supabase'
import { getHistory } from '@/core/supabase/getHistory'

describe('getHistory', () => {
  const brand = 'b1'
  const command = 'cmd'
  const type = 't1'
  beforeEach(() => {
    jest.resetModules()
    jest.clearAllMocks()
  })

  it('returns empty array on error', async () => {
    const mockError = { message: 'fail' }
    // Build chain: select -> order -> limit -> eq
    const chain: any = {}
    chain.order = jest.fn().mockReturnValue(chain)
    chain.limit = jest.fn().mockReturnValue(chain)
    chain.eq = jest.fn().mockReturnValue({ data: null, error: mockError })
    const selectMock = jest.fn().mockReturnValue(chain)
    ;(supabase.from as jest.Mock).mockReturnValue({ select: selectMock })
    const consoleErrorSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => {})
    const result = await getHistory(brand, command, type)
    expect(result).toEqual([])
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Error fetching lifehacks history:',
      mockError
    )
    consoleErrorSpy.mockRestore()
  })

  it('returns data on success', async () => {
    const sampleData = [{ id: 1 }, { id: 2 }]
    // Build success chain
    const chain: any = {}
    chain.order = jest.fn().mockReturnValue(chain)
    chain.limit = jest.fn().mockReturnValue(chain)
    chain.eq = jest.fn().mockReturnValue({ data: sampleData, error: null })
    const selectMock = jest.fn().mockReturnValue(chain)
    ;(supabase.from as jest.Mock).mockReturnValue({ select: selectMock })
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {})
    const result = await getHistory(brand, command, type)
    expect(result).toBe(sampleData)
    expect(consoleLogSpy).toHaveBeenCalledWith(sampleData)
    consoleLogSpy.mockRestore()
  })
})
