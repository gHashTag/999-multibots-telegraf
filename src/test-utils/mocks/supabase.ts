import { TelegramId } from '@/interfaces/telegram.interface'
import { logger } from '../../utils/logger'

export interface User {
  id: string
  telegram_id: TelegramId
  level: number
}

const mockUser: User = {
  id: '123',
  telegram_id: '123456789',
  level: 7,
}

export async function getUserByTelegramId(
  telegram_id: TelegramId
): Promise<User | null> {
  logger.info({
    message: '🔍 Поиск пользователя в базе данных (мок)',
    description: 'Looking up user in database (mock)',
    telegram_id,
  })
  return mockUser
}

export async function updateUserLevelPlusOne(
  telegram_id: TelegramId,
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
  telegram_id: TelegramId,
  newBalance: number
): Promise<void> {
  logger.info({
    message: '💰 Обновление записей платежей (мок)',
    description: 'Updating payment records (mock)',
    telegram_id,
    newBalance,
  })
}
