describe('setPayments', () => {
  let setPayments: typeof import('@/core/supabase/setPayments').setPayments
  const paymentArgs = {
    telegram_id: '42',
    OutSum: '15.5',
    InvId: 'inv123',
    currency: 'USD' as const,
    stars: 100,
    status: 'COMPLETED' as const,
    payment_method: 'Stripe' as const,
    bot_name: 'bot1',
    language: 'en',
    subscription: 'NEUROPHOTO' as string | null,
  }
  beforeEach(() => {
    jest.resetModules()
    const { supabase } = require('@/core/supabase')
    const mockInsert = jest.fn()
    // builder for insert
    const builder = { insert: mockInsert }
    // spy on supabase.from to return builder
    jest.spyOn(supabase, 'from').mockReturnValue(builder)
    // import function under test
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    setPayments = require('@/core/supabase/setPayments').setPayments
  })

  it('inserts payment and resolves on success', async () => {
    const { supabase } = require('@/core/supabase')
    const builder = supabase.from('payments_v2')
    builder.insert.mockResolvedValue({ error: null })
    await expect(setPayments(paymentArgs)).resolves.toBeUndefined()
    expect(supabase.from).toHaveBeenCalledWith('payments_v2')
    expect(builder.insert).toHaveBeenCalledWith({
      telegram_id: paymentArgs.telegram_id,
      amount: parseFloat(paymentArgs.OutSum),
      inv_id: paymentArgs.InvId,
      currency: paymentArgs.currency,
      status: paymentArgs.status,
      payment_method: paymentArgs.payment_method,
      description: `Purchase and sale:: ${paymentArgs.stars}`,
      stars: paymentArgs.stars,
      bot_name: paymentArgs.bot_name,
      type: 'money_income',
      language: paymentArgs.language,
      subscription_type: paymentArgs.subscription,
    })
  })

  it('throws error when insert error', async () => {
    const { supabase } = require('@/core/supabase')
    const builder = supabase.from('payments_v2')
    const err = new Error('db fail')
    builder.insert.mockResolvedValue({ error: err })
    await expect(setPayments(paymentArgs)).rejects.toBe(err)
  })
})
