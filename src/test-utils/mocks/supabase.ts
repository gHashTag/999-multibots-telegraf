import { logger } from '../../utils/logger'

export interface User {
  id: string
  telegram_id: string
  balance: number
  level: number
}

const mockUser: User = {
  id: '123',
  telegram_id: '123456789',
  balance: 1000,
  level: 7,
}

export async function getUserByTelegramId(
  telegram_id: string
): Promise<User | null> {
  logger.info({
    message: '🔍 Поиск пользователя в базе данных (мок)',
    description: 'Looking up user in database (mock)',
    telegram_id,
  })
  return mockUser
}

export async function updateUserLevelPlusOne(
  telegram_id: string,
  level: number
): Promise<void> {
  logger.info({
    message: '📈 Обновление уровня пользователя (мок)',
    description: 'Updating user level (mock)',
    telegram_id,
    oldLevel: level,
    newLevel: level + 1,
  })
}

export async function updateUserBalance(
  telegram_id: string,
  newBalance: number
): Promise<void> {
  logger.info({
    message: '💰 Обновление баланса пользователя (мок)',
    description: 'Updating user balance (mock)',
    telegram_id,
    newBalance,
  })
}
