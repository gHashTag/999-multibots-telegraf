import { createClient } from '@supabase/supabase-js'
import mock from '@/test-utils/core/mock'
import { User, Operation } from './types'
import { mockSupabase } from './mockSupabase'

class MockSupabase {
  private users: User[] = []
  private operations: Operation[] = []

  async createUser(user: Partial<User>) {
    const newUser: User = {
      id: user.id || 'test_id',
      telegram_id: user.telegram_id || 'test_id',
      username: user.username || 'test_user',
      is_ru: user.is_ru || false,
      bot_name: user.bot_name || 'test_bot',
      balance: user.balance || 0,
      subscription_end_date: user.subscription_end_date || null,
      created_at: user.created_at || new Date().toISOString(),
      updated_at: user.updated_at || new Date().toISOString(),
    }
    this.users.push(newUser)
    return newUser
  }

  async getUserByTelegramId(telegram_id: string) {
    return this.users.find(u => u.telegram_id === telegram_id) || null
  }

  async updateUser(telegram_id: string, updates: Partial<User>) {
    const userIndex = this.users.findIndex(u => u.telegram_id === telegram_id)
    if (userIndex === -1) return null

    this.users[userIndex] = {
      ...this.users[userIndex],
      ...updates,
      updated_at: new Date().toISOString(),
    }
    return this.users[userIndex]
  }

  async setUserBalance(telegram_id: string, balance: number) {
    const user = await this.getUserByTelegramId(telegram_id)
    if (!user) return null

    return this.updateUser(telegram_id, { balance })
  }

  async createOperation(operation: Partial<Operation>) {
    const newOperation: Operation = {
      id: operation.id || 'test_op_id',
      user_id: operation.user_id || 'test_id',
      amount: operation.amount || 0,
      type: operation.type || 'test',
      status: operation.status || 'completed',
      description: operation.description,
      bot_name: operation.bot_name,
      metadata: operation.metadata,
      created_at: operation.created_at || new Date().toISOString(),
      updated_at: operation.updated_at || new Date().toISOString(),
    }
    this.operations.push(newOperation)
    return newOperation
  }

  async updateOperation(id: string, updates: Partial<Operation>) {
    const opIndex = this.operations.findIndex(op => op.id === id)
    if (opIndex === -1) return null

    this.operations[opIndex] = {
      ...this.operations[opIndex],
      ...updates,
      updated_at: new Date().toISOString(),
    }
    return this.operations[opIndex]
  }

  reset() {
    this.users = []
    this.operations = []
  }
}

export const mockSupabase = new MockSupabase()

// Mock the Supabase client
mock.object({
  createClient: () => ({
    from: (table: string) => ({
      select: () => ({
        eq: (field: string, value: any) => ({
          single: async () => {
            if (table === 'users') {
              const user = await mockSupabase.getUserByTelegramId(value)
              return { data: user }
            }
            return { data: null }
          },
        }),
        update: (updates: any) => ({
          eq: (field: string, value: any) => ({
            select: () => ({
              single: async () => {
                if (table === 'users') {
                  const user = await mockSupabase.updateUser(value, updates)
                  return { data: user }
                }
                return { data: null }
              },
            }),
          }),
        }),
      }),
      insert: (data: any) => ({
        select: () => ({
          single: async () => {
            if (table === 'operations') {
              const operation = await mockSupabase.createOperation(data)
              return { data: operation }
            }
            return { data: null }
          },
        }),
      }),
    }),
    rpc: async (functionName: string, params: any) => {
      if (functionName === 'get_user_balance') {
        const user = await mockSupabase.getUserByTelegramId(
          params.user_telegram_id
        )
        return { data: user?.balance || 0, error: null }
      }
      return { data: null, error: null }
    },
  }),
})

export const supabase = mockSupabase
