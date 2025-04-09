import { BroadcastService as BroadcastServiceClass } from './broadcast.class'
import { TelegramId } from '@/interfaces/telegram.interface'

export interface BroadcastResult {
  success: boolean
  successCount: number
  errorCount: number
  reason?: string
}

// Экспортируем функции для обратной совместимости
export const broadcastService = {
  async getBotUsers(
    botName: string,
    ignoreActiveFlag = false
  ): Promise<TelegramId[]> {
    const service = new BroadcastServiceClass(
      botName,
      process.env.BOT_TOKEN || ''
    )
    return service.getBotUsers(ignoreActiveFlag)
  },

  async getAllBotUsers(botName: string): Promise<TelegramId[]> {
    const service = new BroadcastServiceClass(
      botName,
      process.env.BOT_TOKEN || ''
    )
    return service.getAllBotUsers()
  },

  async sendBroadcastWithImage(
    botToken: string,
    text: string,
    imageUrl: string,
    ownerTelegramId?: TelegramId
  ): Promise<BroadcastResult> {
    const service = new BroadcastServiceClass('', botToken)
    return service.sendBroadcastWithImage(text, imageUrl, ownerTelegramId)
  },

  async sendBroadcastWithVideo(
    botToken: string,
    text: string,
    videoUrl: string,
    ownerTelegramId?: TelegramId
  ): Promise<BroadcastResult> {
    const service = new BroadcastServiceClass('', botToken)
    return service.sendBroadcastWithVideo(text, videoUrl, ownerTelegramId)
  },
}
