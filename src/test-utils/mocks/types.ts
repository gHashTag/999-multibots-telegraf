export interface User {
  id: string
  telegram_id: string
  balance: number
  subscription_end_date: string | null
  username?: string
  is_ru: boolean
  bot_name: string
  level: number
  created_at: string
  updated_at: string
}

export interface Operation {
  id: string
  user_id: string
  amount: number
  type: string
  status: string
  description?: string
  bot_name?: string
  metadata?: any
  created_at: string
  updated_at: string
}

export interface MockSupabaseClient {
  getUserByTelegramId: (telegramId: string) => Promise<User | null>
  setUserBalance: (userId: string, balance: number) => Promise<void>
  createOperation: (operation: Partial<Operation>) => Promise<Operation>
  updateOperation: (id: string, data: Partial<Operation>) => Promise<Operation>
  reset: () => void
  setMockUser: (user: User) => void
  createUser: (user: Partial<User>) => Promise<User>
}