import dotenv from 'dotenv'
import path from 'path'
import { vi } from 'vitest'

// Загружаем переменные из .env.test
dotenv.config({ path: path.resolve(__dirname, '../../.env.test') }) // Path relative to src/__tests__/setup.ts

// Мокируем Supabase клиент глобально
vi.mock('@/core/supabase/client.ts', () => {
  return {
    supabase: {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          data: [],
          error: null,
        }),
        insert: vi.fn().mockReturnValue({
          data: [{ id: 'mocked-id' }],
          error: null,
        }),
      }),
    },
  }
})

// Можно добавить другую глобальную настройку тестов здесь, если нужно
// Например, мокирование глобальных функций
// vi.mock('some-module');
