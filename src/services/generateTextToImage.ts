import { type MyContext } from '@/interfaces'
import { logger } from '../utils/logger'

/**
 * Генерирует изображение на основе текстового промпта
 * @param prompt Текстовый промпт для генерации
 * @param model Модель для генерации изображения
 * @param count Количество изображений
 * @param userId ID пользователя
 * @param isRu Флаг русского языка
 * @param ctx Контекст телеграм сообщения
 * @param botName Имя бота
 * @returns Promise<void>
 */
export async function generateTextToImage(
  prompt: string,
  model: string,
  count: number,
  userId: string,
  isRu: boolean,
  ctx: MyContext,
  botName: string
): Promise<void> {
  logger.info('Генерация изображения:', {
    prompt,
    model,
    count,
    userId,
    isRu,
    botName,
  })

  // Отправляем пользователю сообщение о заглушке
  await ctx.reply(
    isRu
      ? 'Функция генерации изображений временно недоступна.'
      : 'Image generation function is temporarily unavailable.'
  )

  return Promise.resolve()
}
