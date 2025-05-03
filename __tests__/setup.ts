import { vi } from 'vitest'
import { Telegraf } from 'telegraf'
import { MyContext } from '@/interfaces'
// Импортируем оригинальный модуль, чтобы сохранить его экспорты
import * as originalBotModule from '@/core/bot'

console.log('--- Executing Vitest Setup File: __tests__/setup.ts ---')

// --- Мок для клиента Supabase ---
vi.mock('@/core/supabase/client', () => {
  console.log('[Setup] Mocking @/core/supabase/client')
  return {
    supabase: {},
    supabaseAdmin: {},
  }
})

// --- УДАЛЕНО: Глобальный мок OpenAI (вызывал ошибку резолва пакета) ---
// vi.mock('@/core/openai/index.ts', () => {
//   console.log('[Setup] Mocking @/core/openai/index.ts')
//   return {}
// })

vi.mock('@/core/supabase/getAiFeedbackFromSupabase.ts', () => {
  console.log('[Setup] Mocking @/core/supabase/getAiFeedbackFromSupabase.ts')
  return {
    getAiFeedbackFromSupabase: vi.fn(),
  }
})

// --- Мок для @/core/bot (сначала объявляем переменные) ---
const mockSendMessage = vi.fn()
const mockTelegram = { sendMessage: mockSendMessage }
const mockBotInstance = {
  telegram: mockTelegram,
} as unknown as Telegraf<MyContext>
// Экспортируем mockGetBotByName, чтобы использовать в тестах
export const mockGetBotByName = vi
  .fn()
  .mockReturnValue({ bot: mockBotInstance, error: null })

// Mock @/core/bot, preserving original exports
// Use vi.doMock instead of vi.mock to avoid hoisting issues with originalBotModule
vi.doMock('@/core/bot', async importOriginal => {
  console.log('[Setup] Mocking @/core/bot using doMock')
  const actual = await importOriginal() // Import the actual module
  return {
    ...(actual as typeof originalBotModule), // Spread the actual exports
    getBotByName: mockGetBotByName, // Override only getBotByName
    // If other functions from @/core/bot need mocking, do it here
  }
})

// --- Другие глобальные моки (если нужны) ---
vi.mock('@/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

console.log('--- Vitest Setup File Execution Finished ---')
