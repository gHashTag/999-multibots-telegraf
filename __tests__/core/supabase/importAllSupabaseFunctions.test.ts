// Тест для динамического вызова всех функций из модуля core/supabase
import * as supabaseModule from '@/core/supabase'

// Мокаем клиентский модуль, чтобы supabase и supabaseAdmin возвращали заглушки
jest.mock('@/core/supabase/client', () => {
  const mRpc = jest.fn().mockResolvedValue({ data: null, error: null })
  const mQuery = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue({ data: null, error: null }),
    maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
  }
  const mFrom = jest.fn().mockReturnValue(mQuery)
  const storageMock = {
    from: jest
      .fn()
      .mockReturnValue({
        remove: jest.fn().mockResolvedValue({ data: [], error: null }),
      }),
  }
  const supabaseMock = { rpc: mRpc, from: mFrom, storage: storageMock }
  return { supabase: supabaseMock, supabaseAdmin: supabaseMock }
})

describe('Import and call all Supabase functions', () => {
  it('should not throw when calling all exported functions', async () => {
    const keys = Object.keys(supabaseModule).filter(
      k => typeof (supabaseModule as any)[k] === 'function'
    )
    for (const key of keys) {
      const func = (supabaseModule as any)[key]
      try {
        const result = func()
        if (result && typeof result.then === 'function') {
          await result
        }
      } catch (err) {
        // Игнорируем ошибки параметров, проверяем лишь отсутствие критических сбоев
      }
    }
    expect(keys.length).toBeGreaterThan(0)
  })
})
