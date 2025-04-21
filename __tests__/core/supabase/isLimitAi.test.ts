

// Sequential mocking of supabase.from for isLimitAi
async function runIsLimitAiWithBuilders(builders: any[]) {
  jest.resetModules()
  const supabaseModule = require('@/core/supabase')
  // Sequence builders
  const spy = jest.spyOn(supabaseModule.supabase, 'from')
  builders.forEach(builder => spy.mockImplementationOnce(() => builder))
  // import after mock
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { isLimitAi } = require('@/core/supabase/isLimitAi')
  return await isLimitAi('42')
}

describe('isLimitAi', () => {
  it('returns false when user lookup error', async () => {
    const builderUsers = { select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(), single: jest.fn().mockResolvedValue({ data: null, error: { message: 'uerr' } }) }
    const res = await runIsLimitAiWithBuilders([builderUsers])
    expect(res).toBe(false)
  })

  it('inserts new record when no limitData or stale date and returns false', async () => {
    const today = new Date().toISOString().split('T')[0]
    const builderUsers = { select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(), single: jest.fn().mockResolvedValue({ data: { user_id: 'u1' }, error: null }) }
    const builderLimit = { select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(), order: jest.fn().mockReturnThis(), limit: jest.fn().mockReturnThis(), single: jest.fn().mockResolvedValue({ data: null, error: null }) }
    const builderInsert = { insert: jest.fn().mockReturnValue(Promise.resolve({ error: null })) }
    const res = await runIsLimitAiWithBuilders([builderUsers, builderLimit, builderInsert])
    expect(builderInsert.insert).toHaveBeenCalledWith({ user_id: 'u1', count: 1, created_at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}/) })
    expect(res).toBe(false)
  })

  it('updates count when under daily limit and returns false', async () => {
    const today = new Date().toISOString().split('T')[0]
    const builderUsers = { select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(), single: jest.fn().mockResolvedValue({ data: { user_id: 'u2' }, error: null }) }
    const builderLimit = { select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(), order: jest.fn().mockReturnThis(), limit: jest.fn().mockReturnThis(), single: jest.fn().mockResolvedValue({ data: { id: 'r1', count: 2, created_at: today + 'T00:00:00Z' }, error: null }) }
    const builderUpdate = { update: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnValue(Promise.resolve({ error: null })) }
    const res = await runIsLimitAiWithBuilders([builderUsers, builderLimit, builderUpdate])
    expect(builderUpdate.update).toHaveBeenCalledWith({ count: 3 })
    expect(res).toBe(false)
  })

  it('returns true when daily limit reached', async () => {
    const today = new Date().toISOString().split('T')[0]
    const builderUsers = { select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(), single: jest.fn().mockResolvedValue({ data: { user_id: 'u3' }, error: null }) }
    const builderLimit = { select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(), order: jest.fn().mockReturnThis(), limit: jest.fn().mockReturnThis(), single: jest.fn().mockResolvedValue({ data: { id: 'r2', count: 3, created_at: today + 'T12:00:00Z' }, error: null }) }
    const res = await runIsLimitAiWithBuilders([builderUsers, builderLimit])
    expect(res).toBe(true)
  })
})