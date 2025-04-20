import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals'

describe('sendPaymentInfo', () => {
  let builder: any
  let mockFrom: jest.Mock
  let sendPaymentInfo: (user_id: string, level: string) => Promise<any>
  let consoleError: jest.SpyInstance
  let consoleLog: jest.SpyInstance

  beforeEach(() => {
    jest.resetModules()
    // Build supabase.from chain for insert
    builder = {
      insert: jest.fn().mockReturnThis(),
      single: jest.fn()
    }
    mockFrom = jest.fn(() => builder)
    jest.doMock('@/core/supabase', () => ({ supabase: { from: mockFrom } }))
    // Spy console
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => {})
    consoleLog = jest.spyOn(console, 'log').mockImplementation(() => {})
    // Import function under test
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    sendPaymentInfo = require('@/core/supabase/sendPaymentInfo').sendPaymentInfo
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('returns data when insert succeeds', async () => {
    const dataObj = { id: 'p1', user_id: 'u1', level: 'gold' }
    builder.single.mockResolvedValueOnce({ data: dataObj, error: null })
    const result = await sendPaymentInfo('u1', 'gold')
    expect(mockFrom).toHaveBeenCalledWith('payments')
    expect(builder.insert).toHaveBeenCalledWith([{ user_id: 'u1', level: 'gold' }])
    expect(builder.single).toHaveBeenCalled()
    expect(consoleLog).toHaveBeenCalledWith('Payment info sent successfully:', dataObj)
    expect(result).toBe(dataObj)
  })

  it('throws error when insert returns error', async () => {
    const err = new Error('insert fail')
    builder.single.mockResolvedValueOnce({ data: null, error: err })
    await expect(sendPaymentInfo('u2', 'silver')).rejects.toThrow(
      `Failed to send payment info: ${err.message}`
    )
    expect(consoleError).toHaveBeenCalledWith('Error sending payment info:', err)
  })

  it('throws error when no data returned', async () => {
    builder.single.mockResolvedValueOnce({ data: null, error: null })
    await expect(sendPaymentInfo('u3', 'bronze')).rejects.toThrow(
      'No data returned after inserting payment info.'
    )
  })
})