describe('updateUserSubscription', () => {
  let updateUserSubscription: typeof import('@/core/supabase/updateUserSubscription').updateUserSubscription
  const userId = 'userX'
  const subscription = 'vip'
  let builder: any

  beforeEach(() => {
    jest.resetModules()
    // Mock supabase client
    const { supabase } = require('@/core/supabase')
    builder = { update: jest.fn().mockReturnThis(), eq: jest.fn() }
    // Spy on supabase.from
    jest.spyOn(supabase, 'from').mockReturnValue(builder)
    // Mock console.error
    jest.spyOn(console, 'error').mockImplementation(() => {})
    // Import function under test
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    updateUserSubscription =
      require('@/core/supabase/updateUserSubscription').updateUserSubscription
  })

  it('updates subscription and returns data on success', async () => {
    const resultData = [{ subscription }]
    builder.eq.mockResolvedValue({ data: resultData, error: null })
    const res = await updateUserSubscription(userId, subscription)
    expect(res).toEqual(resultData)
    const { supabase } = require('@/core/supabase')
    expect(supabase.from).toHaveBeenCalledWith('users')
    expect(builder.update).toHaveBeenCalledWith({ subscription })
    expect(builder.eq).toHaveBeenCalledWith('telegram_id', userId)
  })

  it('throws and logs error when update error occurs', async () => {
    const err = { message: 'fail' }
    builder.eq.mockResolvedValue({ data: null, error: err })
    await expect(updateUserSubscription(userId, subscription)).rejects.toEqual(
      err
    )
    expect(console.error).toHaveBeenCalledWith(
      'Error updating subscription:',
      err
    )
  })

  it('throws and logs error when exception occurs', async () => {
    builder.update.mockImplementation(() => {
      throw new Error('oops')
    })
    await expect(updateUserSubscription(userId, subscription)).rejects.toThrow(
      'oops'
    )
    expect(console.error).toHaveBeenCalledWith(
      'Error updating subscription:',
      expect.any(Error)
    )
  })
})
