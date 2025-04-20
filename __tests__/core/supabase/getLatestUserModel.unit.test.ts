import { jest, describe, it, expect, beforeEach } from '@jest/globals'
// Mock supabase client
jest.mock('@/core/supabase', () => ({ supabase: { from: jest.fn() } }))
import { supabase } from '@/core/supabase'
import { getLatestUserModel } from '@/core/supabase/getLatestUserModel'

describe('getLatestUserModel', () => {
  const telegram_id = 10
  const api = 'apiX'
  beforeEach(() => {
    jest.resetModules()
    jest.clearAllMocks()
  })

  it('returns null on error', async () => {
    const mockSingle = jest.fn().mockResolvedValue({ data: null, error: { message: 'err' } })
    const selectMock = jest.fn().mockReturnValue({ order: () => ({ limit: () => ({ single: mockSingle }) }) })
    ;(supabase.from as jest.Mock).mockReturnValue({ select: selectMock })
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
    const result = await getLatestUserModel(telegram_id, api)
    expect(result).toBeNull()
    expect(consoleErrorSpy).toHaveBeenCalledWith('Error getting user model:', { message: 'err' })
    consoleErrorSpy.mockRestore()
  })

  it('returns data on success', async () => {
    const modelTraining = { id: 'x', telegram_id, status: 'SUCCESS', api }
    const mockSingle = jest.fn().mockResolvedValue({ data: modelTraining, error: null })
    const selectMock = jest.fn().mockReturnValue({ order: () => ({ limit: () => ({ single: mockSingle }) }) })
    ;(supabase.from as jest.Mock).mockReturnValue({ select: selectMock })
    const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {})
    const result = await getLatestUserModel(telegram_id, api)
    expect(result).toEqual(modelTraining)
    expect(consoleLogSpy).toHaveBeenCalledWith(modelTraining, 'getLatestUserModel')
    consoleLogSpy.mockRestore()
  })

  it('returns null on exception', async () => {
    (supabase.from as jest.Mock).mockImplementation(() => { throw new Error('boom2') })
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
    const result = await getLatestUserModel(telegram_id, api)
    expect(result).toBeNull()
    expect(consoleErrorSpy).toHaveBeenCalledWith('Error getting user model:', expect.any(Error))
    consoleErrorSpy.mockRestore()
  })
})