export type TelegramId = string

export interface TelegramUser {
  telegram_id: TelegramId
  username?: string
  first_name?: string
  last_name?: string
  language_code?: string
  is_bot?: boolean
}

/**
 * Нормализует telegram_id в строку
 */
export const normalizeTelegramId = (id: string | number | bigint): string => {
  if (typeof id === 'string') return id
  if (typeof id === 'number') return id.toString()
  if (typeof id === 'bigint') return id.toString()
  return String(id)
}

// Хелпер для проверки валидности telegram_id
export const isValidTelegramId = (id: any): boolean => {
  if (!id) return false
  const normalized = normalizeTelegramId(id)
  return /^\d+$/.test(normalized)
}
