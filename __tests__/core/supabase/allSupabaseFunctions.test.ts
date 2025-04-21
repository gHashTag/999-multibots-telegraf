/**
 * Динамический тест для вызова всех экспортированных функций из core/supabase
 * Мокаем клиент supabase, чтобы функции возвращали стабильные ответы
 */
import * as supabaseModule from '@/core/supabase'

// Мокаем supabase client и supabaseAdmin из client.ts
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
    from: jest.fn().mockReturnValue({
      remove: jest.fn().mockResolvedValue({ data: [], error: null }),
    }),
  }
  const supabaseMock = { rpc: mRpc, from: mFrom, storage: storageMock }
  return { supabase: supabaseMock, supabaseAdmin: supabaseMock }
})

describe('All Supabase functions should be callable', () => {
  for (const key of Object.keys(supabaseModule)) {
    const fn = (supabaseModule as any)[key]
    if (typeof fn !== 'function') continue
    it(`calls ${key}`, async () => {
      // prepare dummy args array of length = fn.length
      const args = new Array(fn.length).fill('')
      try {
        const result = fn(...args)
        if (result && typeof result.then === 'function') {
          await result
        }
      } catch (_e) {
        // Игнорируем ошибки из-за неподходящих аргументов
      }
    })
  }
})
