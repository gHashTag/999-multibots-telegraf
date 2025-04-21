import {
  getPendingPayment,
  getPaymentByInvId,
  updatePaymentStatus,
} from '@/core/supabase/payments'
import { supabaseAdmin } from '@/core/supabase/client'

// Мокаем клиент supabaseAdmin
jest.mock('@/core/supabase/client', () => ({
  supabase: {},
  supabaseAdmin: { from: jest.fn() },
}))

describe('getPendingPayment', () => {
  const fromMock = supabaseAdmin.from as jest.Mock
  let query: any
  beforeEach(() => {
    jest.clearAllMocks()
    // Подготовка цепочки вызовов: select -> eq -> eq -> single
    query = {
      select: jest.fn(),
      eq: jest.fn(),
      single: jest.fn(),
    }
    fromMock.mockReturnValue(query)
    query.select.mockReturnValue(query)
    query.eq.mockReturnValue(query)
  })

  it('returns data on success', async () => {
    const fake = { id: '1', invId: 'inv1' }
    query.single.mockResolvedValue({ data: fake, error: null })
    const res = await getPendingPayment('inv1')
    expect(fromMock).toHaveBeenCalledWith('payments_v2')
    expect(query.select).toHaveBeenCalledWith('*')
    expect(query.eq).toHaveBeenNthCalledWith(1, 'InvId', 'inv1')
    expect(query.eq).toHaveBeenNthCalledWith(2, 'status', 'PENDING')
    expect(res).toEqual({ data: fake, error: null })
  })

  it('returns null data and null error on PGRST116', async () => {
    const err = { code: 'PGRST116' }
    query.single.mockResolvedValue({ data: null, error: err })
    const res = await getPendingPayment('inv2')
    expect(res).toEqual({ data: null, error: null })
  })

  it('returns error on other errors', async () => {
    const err = { code: 'OTHER' }
    query.single.mockResolvedValue({ data: null, error: err })
    const res = await getPendingPayment('inv3')
    expect(res).toEqual({ data: null, error: err })
  })
})

describe('getPaymentByInvId', () => {
  const fromMock = supabaseAdmin.from as jest.Mock
  let query: any
  beforeEach(() => {
    jest.clearAllMocks()
    // Подготовка цепочки: select -> eq -> maybeSingle
    query = {
      select: jest.fn(),
      eq: jest.fn(),
      maybeSingle: jest.fn(),
    }
    fromMock.mockReturnValue(query)
    query.select.mockReturnValue(query)
    query.eq.mockReturnValue(query)
  })

  it('returns data on success', async () => {
    const fake = { id: '2', invId: 'invX' }
    query.maybeSingle.mockResolvedValue({ data: fake, error: null })
    const res = await getPaymentByInvId('invX')
    expect(fromMock).toHaveBeenCalledWith('payments_v2')
    expect(query.select).toHaveBeenCalledWith('*')
    expect(query.maybeSingle).toHaveBeenCalled()
    expect(res).toEqual({ data: fake, error: null })
  })

  it('returns null data and null error on PGRST116', async () => {
    const err = { code: 'PGRST116' }
    query.maybeSingle.mockResolvedValue({ data: null, error: err })
    const res = await getPaymentByInvId('invY')
    expect(res).toEqual({ data: null, error: null })
  })

  it('returns error on other errors', async () => {
    const err = { code: 'OTHER' }
    query.maybeSingle.mockResolvedValue({ data: null, error: err })
    const res = await getPaymentByInvId('invZ')
    expect(res).toEqual({ data: null, error: err })
  })
})

describe('updatePaymentStatus', () => {
  const fromMock = supabaseAdmin.from as jest.Mock
  let query: any
  beforeEach(() => {
    jest.clearAllMocks()
    // Подготовка цепочки: update -> eq -> select
    query = {
      update: jest.fn(),
      eq: jest.fn(),
      select: jest.fn(),
    }
    fromMock.mockReturnValue(query)
    query.update.mockReturnValue(query)
    query.eq.mockReturnValue(query)
  })

  it('returns updated data on success', async () => {
    const fakeData = [{ status: 'SUCCESS' }]
    query.select.mockResolvedValue({ data: fakeData, error: null })
    const res = await updatePaymentStatus('inv1', 'SUCCESS')
    expect(fromMock).toHaveBeenCalledWith('payments_v2')
    expect(query.update).toHaveBeenCalled()
    expect(res).toEqual({ data: fakeData, error: null })
  })

  it('returns null data and error message when no rows', async () => {
    query.select.mockResolvedValue({ data: [], error: null })
    const res = await updatePaymentStatus('inv2', 'FAILED')
    expect(res.data).toBeNull()
    expect(res.error).toMatch(/not found/)
  })

  it('returns error on update failure', async () => {
    const err = { message: 'db error' }
    query.select.mockResolvedValue({ data: null, error: err })
    const res = await updatePaymentStatus('inv3', 'PENDING')
    expect(res.data).toBeNull()
    expect(res.error).toEqual(err)
  })
})
