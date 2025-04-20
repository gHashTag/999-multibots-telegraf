import { jest, describe, it, expect, beforeEach } from '@jest/globals'

describe('getLatestUserModel', () => {
  let getLatestUserModel: typeof import('@/core/supabase/getLatestUserModel').getLatestUserModel
  let chain: any
  const mockFrom = jest.fn()
  const telegram_id = 123
  const api = 'test-api'
  const modelData = { telegram_id, api, status: 'SUCCESS', created_at: '2025-04-01T00:00:00Z' }

  beforeEach(() => {
    jest.resetModules()
    chain = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      single: jest.fn().mockReturnThis(),
      then: jest.fn(),
    }
    mockFrom.mockImplementation(() => chain)
    jest.doMock('@/core/supabase', () => ({ supabase: { from: mockFrom } }))
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      getLatestUserModel = require('@/core/supabase/getLatestUserModel').getLatestUserModel
    })
  })

  it('returns model data on success', async () => {
    chain.then.mockImplementation(resolve => resolve({ data: modelData, error: null }))
    const res = await getLatestUserModel(telegram_id, api)
    expect(mockFrom).toHaveBeenCalledWith('model_trainings')
    expect(chain.select).toHaveBeenCalledWith('*')
    expect(chain.eq).toHaveBeenCalledWith('telegram_id', telegram_id)
    expect(chain.eq).toHaveBeenCalledWith('status', 'SUCCESS')
    expect(chain.eq).toHaveBeenCalledWith('api', api)
    expect(chain.order).toHaveBeenCalledWith('created_at', { ascending: false })
    expect(chain.limit).toHaveBeenCalledWith(1)
    expect(res).toEqual(modelData)
  })

  it('returns null on error', async () => {
    chain.then.mockImplementation(resolve => resolve({ data: null, error: { message: 'fail' } }))
    const res = await getLatestUserModel(telegram_id, api)
    expect(res).toBeNull()
  })

  it('returns null on exception', async () => {
    chain.select.mockImplementation(() => { throw new Error('oops') })
    const res = await getLatestUserModel(telegram_id, api)
    expect(res).toBeNull()
  })
})