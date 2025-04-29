import { mock, jest } from 'bun:test'
import { Telegraf } from 'telegraf'
import { MyContext } from '@/interfaces'

console.log('--- Executing Bun Test Setup File: __tests__/setup.ts ---')

// --- Мок для клиента Supabase ---
mock.module('@/core/supabase/client', () => {
  console.log('[Setup] Mocking @/core/supabase/client')
  return {
    supabase: {},
    supabaseAdmin: {},
  }
})

// --- Мок для OpenAI/DeepSeek и зависимых модулей ---
mock.module('@/core/openai/index.ts', () => {
  console.log('[Setup] Mocking @/core/openai/index.ts')
  return {}
})
mock.module('@/core/supabase/getAiFeedbackFromSupabase.ts', () => {
  console.log('[Setup] Mocking @/core/supabase/getAiFeedbackFromSupabase.ts')
  return {
    getAiFeedbackFromSupabase: mock(),
  }
})

// --- Мок для @/core/bot (сначала объявляем переменные) ---
const mockSendMessage = mock()
const mockTelegram = { sendMessage: mockSendMessage }
const mockBotInstance = {
  telegram: mockTelegram,
} as unknown as Telegraf<MyContext>
// Экспортируем mockGetBotByName, чтобы использовать в тестах
export const mockGetBotByName = jest
  .fn()
  .mockReturnValue({ bot: mockBotInstance, error: null })

mock.module('@/core/bot', () => {
  console.log('[Setup] Mocking @/core/bot')
  return {
    getBotByName: mockGetBotByName,
    // Если нужны другие мокированные экспорты из @/core/bot, добавляем здесь
  }
})

// --- Другие глобальные моки (если нужны) ---
mock.module('@/utils/logger', () => ({
  logger: {
    info: mock(),
    warn: mock(),
    error: mock(),
    debug: mock(),
  },
}))

console.log('--- Bun Test Setup File Execution Finished ---')
