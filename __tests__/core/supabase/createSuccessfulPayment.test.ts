import { createSuccessfulPayment } from '@/core/supabase/createSuccessfulPayment'
import * as supabaseModule from '@/core/supabase'
import { ADMIN_IDS_ARRAY } from '@/config'

jest.mock('@/core/supabase', () => ({
  supabase: { from: jest.fn() },
  getUserByTelegramIdString: jest.fn(),
}))

// Сохраняем оригинальный ADMIN_IDS_ARRAY и подменяем, если нужно
jest.mock('@/config', () => ({ ADMIN_IDS_ARRAY: [999] }))

describe('createSuccessfulPayment', () => {
  const fromMock = supabaseModule.supabase.from as jest.Mock
  const getUserByTelegramIdStringMock =
    supabaseModule.getUserByTelegramIdString as jest.Mock
  const dummyParams = {
    telegram_id: '1',
    amount: 10,
    type: 'money_income',
    description: 'desc',
    bot_name: 'bot',
    service_type: 'svc',
    metadata: {},
    inv_id: 'inv1',
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('returns existing payment on duplicate inv_id', async () => {
    const existing = { id: 42, inv_id: 'inv1' }
    // Первый вызов maybeSingle возвращает existingPayment
    const fakeMaybe = jest
      .fn()
      .mockResolvedValue({ data: existing, error: null })
    // Второй вызов single возвращает paymentData
    const fakeSingle = jest
      .fn()
      .mockResolvedValue({ data: existing, error: null })
    const chain1 = {
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({ maybeSingle: fakeMaybe }),
      }),
    }
    const chain2 = {
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({ single: fakeSingle }),
      }),
    }
    fromMock.mockReturnValueOnce(chain1).mockReturnValueOnce(chain2)
    const res = await createSuccessfulPayment(dummyParams)
    expect(chain1.select).toHaveBeenCalledWith('id, inv_id')
    expect(chain2.select).toHaveBeenCalledWith('*')
    expect(res).toEqual(existing)
  })

  it('throws when user not found', async () => {
    // Duplicate stage returns null, then getUserByTelegramIdString returns null
    const fakeMaybe = jest.fn().mockResolvedValue({ data: null, error: null })
    fromMock.mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({ maybeSingle: fakeMaybe }),
      }),
      insert: jest.fn(),
    })
    getUserByTelegramIdStringMock.mockResolvedValue(null)
    await expect(createSuccessfulPayment(dummyParams)).rejects.toThrow(
      'User not found for telegram_id: 1'
    )
  })

  it('inserts new payment and returns data on success', async () => {
    // No duplicate
    const fakeMaybe = jest.fn().mockResolvedValue({ data: null, error: null })
    const fakeSingle = jest
      .fn()
      .mockResolvedValue({ data: { id: 99 }, error: null })
    const fakeSelect = jest.fn().mockReturnValue({
      single: fakeSingle,
    })

    const insertMock = jest.fn().mockReturnValue({
      select: fakeSelect,
    })

    // Первый вызов from для поиска дубликатов
    fromMock.mockReturnValueOnce({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({ maybeSingle: fakeMaybe }),
      }),
    })

    // Второй вызов from для вставки
    fromMock.mockReturnValueOnce({
      insert: insertMock,
    })

    getUserByTelegramIdStringMock.mockResolvedValue({ id: 'u1' })
    const res = await createSuccessfulPayment(dummyParams)
    expect(insertMock).toHaveBeenCalled()
    expect(res).toEqual({ id: 99 })
  })

  it('throws on insert error code 23505', async () => {
    // No duplicate
    const fakeMaybe = jest.fn().mockResolvedValue({ data: null, error: null })
    const fakeSingle = jest.fn().mockResolvedValue({
      data: null,
      error: { code: '23505', message: 'dup' },
    })

    const fakeSelect = jest.fn().mockReturnValue({
      single: fakeSingle,
    })

    const insertMock = jest.fn().mockReturnValue({
      select: fakeSelect,
    })

    // Первый вызов from для поиска дубликатов
    fromMock.mockReturnValueOnce({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({ maybeSingle: fakeMaybe }),
      }),
    })

    // Второй вызов from для вставки
    fromMock.mockReturnValueOnce({
      insert: insertMock,
    })

    getUserByTelegramIdStringMock.mockResolvedValue({ id: 'u2' })
    await expect(createSuccessfulPayment(dummyParams)).rejects.toMatchObject({
      code: '23505',
    })
  })
})
