import { Telegraf } from 'telegraf'
import { MyContext } from '@/interfaces'
import { logger } from '@/utils/logger'

/**
 * Интерфейс для адаптера сцены Telegram
 */
export interface TelegramSceneAdapter {
  onGenerationStart: (chatId: number, isRu: boolean) => Promise<void>
  onGenerationComplete: (
    chatId: number,
    isRu: boolean,
    videoPath: string,
    caption: string
  ) => Promise<void>
  onError: (
    chatId: number,
    isRu: boolean,
    errorMessage: string
  ) => Promise<void>
}

/**
 * Создает адаптер для отправки сообщений через Telegram
 * @param telegramInstance Экземпляр Telegram бота
 * @returns Адаптер для сцены Telegram
 */
export function createTelegramSceneAdapter(
  telegramInstance: Telegraf<MyContext>
): TelegramSceneAdapter {
  return {
    onGenerationStart: async (chatId: number, isRu: boolean) => {
      const text = isRu
        ? '🎥 Генерация видео началась. Пожалуйста, подождите...'
        : '🎥 Video generation started. Please wait...'
      await (telegramInstance as any).sendMessage(chatId, text)
      logger.info('[Telegram Adapter] Generation started notification sent', {
        chatId,
      })
    },
    onGenerationComplete: async (
      chatId: number,
      isRu: boolean,
      videoPath: string,
      caption: string
    ) => {
      await (telegramInstance as any).sendVideo(
        chatId,
        { source: videoPath },
        { caption }
      )
      logger.info('[Telegram Adapter] Video sent to user', {
        chatId,
        videoPath,
      })
    },
    onError: async (chatId: number, isRu: boolean, errorMessage: string) => {
      const text = isRu
        ? `❌ Ошибка при генерации видео: ${errorMessage}`
        : `❌ Error during video generation: ${errorMessage}`
      await (telegramInstance as any).sendMessage(chatId, text)
      logger.error('[Telegram Adapter] Error notification sent', {
        chatId,
        errorMessage,
      })
    },
  }
}
