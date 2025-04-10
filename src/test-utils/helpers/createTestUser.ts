import { mockSupabase } from '../mocks/supabase'

interface TestUser {
  telegram_id: string
  username: string
  is_ru: boolean
  bot_name: string
}

export const createTestUser = async (user: TestUser) => {
  await mockSupabase.createUser({
    ...user,
    balance: 0,
    subscription_end_date: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  })
} 