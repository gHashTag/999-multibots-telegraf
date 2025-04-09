import { mockSupabase } from '../mocks/supabase'

interface TestUser {
  telegram_id: string
  username: string
  is_ru: boolean
  bot_name: string
}

export const createTestUser = async (user: TestUser) => {
  await mockSupabase.createUser({
    telegram_id: user.telegram_id,
    username: user.username,
    is_ru: user.is_ru,
    bot_name: user.bot_name,
    balance: 0,
    subscription_end_date: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  })
} 