import { User, Operation, MockSupabaseClient } from './types'
import { v4 as uuidv4 } from 'uuid'

export class SupabaseMock implements MockSupabaseClient {
  private users: Map<string, User> = new Map()
  private operations: Map<string, Operation> = new Map()
  private operationIdCounter = 1

  async getUserByTelegramId(telegramId: string): Promise<User | null> {
    for (const user of this.users.values()) {
      if (user.telegram_id === telegramId) {
        return user
      }
    }
    return null
  }

  async setUserBalance(userId: string, balance: number): Promise<void> {
    const user = this.users.get(userId)
    if (user) {
      user.balance = balance
      this.users.set(userId, user)
    }
  }

  async createOperation(operation: Partial<Operation>): Promise<Operation> {
    const id = String(this.operationIdCounter++)
    const now = new Date().toISOString()
    const newOperation: Operation = {
      id,
      user_id: operation.user_id || '',
      amount: operation.amount || 0,
      type: operation.type || '',
      status: operation.status || '',
      created_at: now,
      updated_at: now,
    }
    this.operations.set(id, newOperation)
    return newOperation
  }

  async updateOperation(
    id: string,
    data: Partial<Operation>
  ): Promise<Operation> {
    const operation = this.operations.get(id)
    if (!operation) {
      throw new Error(`Operation with id ${id} not found`)
    }
    const updatedOperation = {
      ...operation,
      ...data,
      updated_at: new Date().toISOString(),
    }
    this.operations.set(id, updatedOperation)
    return updatedOperation
  }

  reset(): void {
    this.users.clear()
    this.operations.clear()
    this.operationIdCounter = 1
  }

  setMockUser(user: User): void {
    this.users.set(user.id, user)
  }

  async createUser(user: Partial<User>): Promise<User> {
    const now = new Date().toISOString()
    const id = uuidv4()
    const newUser: User = {
      id,
      telegram_id: user.telegram_id || '',
      balance: user.balance || 0,
      subscription_end_date: user.subscription_end_date || null,
      username: user.username,
      is_ru: user.is_ru,
      bot_name: user.bot_name,
      created_at: user.created_at || now,
      updated_at: user.updated_at || now,
    }
    this.users.set(id, newUser)
    return newUser
  }
}

export function getMockSupabase(): MockSupabaseClient {
  return new SupabaseMock()
}
