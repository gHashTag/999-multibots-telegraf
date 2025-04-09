import { createClient } from '@supabase/supabase-js'
import { vi } from 'vitest'

interface User {
  telegram_id: string
  username: string
  is_ru: boolean
  bot_name: string
  balance: number
  subscription_end_date: string | null
  created_at: string
  updated_at: string
}

class MockSupabase {
  private users: User[] = []

  async createUser(user: User) {
    this.users.push(user)
  }

  async getUser(telegram_id: string) {
    return this.users.find(u => u.telegram_id === telegram_id)
  }

  async updateUser(telegram_id: string, updates: Partial<User>) {
    const userIndex = this.users.findIndex(u => u.telegram_id === telegram_id)
    if (userIndex === -1) return null

    this.users[userIndex] = {
      ...this.users[userIndex],
      ...updates,
      updated_at: new Date().toISOString()
    }
    return this.users[userIndex]
  }
}

export const mockSupabase = new MockSupabase()

// Mock the Supabase client
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: await mockSupabase.getUser('test_id') })
        }),
        update: (updates: Partial<User>) => ({
          eq: () => ({
            select: () => ({
              single: async () => ({ 
                data: await mockSupabase.updateUser('test_id', updates)
              })
            })
          })
        })
      })
    })
  })
})) 