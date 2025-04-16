import { TelegramId } from '@/types/common'

/**
 * Normalizes a Telegram ID by converting it to a string
 * @param id The Telegram ID to normalize
 * @returns The normalized ID as a string
 */
export const normalizeId = (id: TelegramId): string => {
  return String(id)
}
