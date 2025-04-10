import { Telegraf } from 'telegraf'
import { SupabaseClient } from '@supabase/supabase-js'
import { supabase } from '@/core/supabase'
import { TelegramId } from '@/interfaces/telegram.interface'
import { logger } from '@/utils/logger'
import { getErrorMessage, getErrorDetails } from '@/utils/error'
import { fetch } from 'undici'

export interface BroadcastResult {
  success: boolean
  successCount: number
  errorCount: number
  reason?: string
}

interface BotUser {
  telegram_id: TelegramId
}

export class BroadcastService {
  private readonly supabase: SupabaseClient
  private readonly bot: Telegraf

  constructor(
    private readonly botName: string,
    private readonly botToken: string,
    private readonly testMode: boolean = false
  ) {
    this.supabase = supabase
    this.bot = new Telegraf(botToken)
  }

  async getBotUsers(ignoreActiveFlag = false): Promise<TelegramId[]> {
    try {
      const { data, error } = await this.supabase.rpc('get_bot_users', {
        p_bot_name: this.botName,
        p_ignore_active_flag: ignoreActiveFlag,
      })

      if (error) throw error

      return (data as BotUser[]).map(user => user.telegram_id)
    } catch (err: unknown) {
      logger.error('❌ Failed to get bot users', {
        error: getErrorDetails(err),
        bot_name: this.botName,
        ignore_active_flag: ignoreActiveFlag,
      })
      return []
    }
  }

  async getAllBotUsers(): Promise<TelegramId[]> {
    return this.getBotUsers(true)
  }

  private async activateUser(userId: TelegramId): Promise<void> {
    try {
      await this.supabase.rpc('activate_user', {
        p_bot_name: this.botName,
        p_telegram_id: userId,
      })
      logger.info('✅ User activated', {
        user_id: userId,
        bot_name: this.botName,
      })
    } catch (err: unknown) {
      logger.error('❌ Failed to activate user', {
        error: getErrorDetails(err),
        user_id: userId,
        bot_name: this.botName,
      })
      throw new Error(`Failed to activate user: ${getErrorMessage(err)}`)
    }
  }

  private async updateUserStatusAfterFailure(
    userId: TelegramId,
    errorMessage: string
  ): Promise<void> {
    try {
      await this.supabase.rpc('update_user_status_after_failure', {
        p_bot_name: this.botName,
        p_telegram_id: userId,
        p_error_message: errorMessage,
      })
      logger.info('✅ User status updated after failure', {
        user_id: userId,
        bot_name: this.botName,
        error_message: errorMessage,
      })
    } catch (err: unknown) {
      logger.error('❌ Failed to update user status', {
        error: getErrorDetails(err),
        user_id: userId,
        bot_name: this.botName,
      })
      throw new Error(`Failed to update user status: ${getErrorMessage(err)}`)
    }
  }

  private async loadFile(fileId: string): Promise<Buffer> {
    try {
      const fileInfo = await this.bot.telegram.getFile(fileId)
      const fileUrl = `https://api.telegram.org/file/bot${this.botToken}/${fileInfo.file_path}`
      const response = await fetch(fileUrl)
      return Buffer.from(await response.arrayBuffer())
    } catch (err: unknown) {
      logger.error('❌ Failed to load file', {
        error: getErrorDetails(err),
        file_id: fileId,
        bot_name: this.botName,
      })
      throw new Error(`Failed to load file: ${getErrorMessage(err)}`)
    }
  }

  private async loadFileFromUrl(url: string): Promise<Buffer> {
    try {
      const response = await fetch(url)
      return Buffer.from(await response.arrayBuffer())
    } catch (err: unknown) {
      logger.error('❌ Failed to load file from URL', {
        error: getErrorDetails(err),
        url,
        bot_name: this.botName,
      })
      throw new Error(`Failed to load file from URL: ${getErrorMessage(err)}`)
    }
  }

  private async sendBroadcastDirectly(
    userIds: TelegramId[],
    text: string,
    imageUrl = 'https://i.imgur.com/4AiXzf8.jpg',
    ownerTelegramId?: TelegramId
  ): Promise<BroadcastResult> {
    let successCount = 0
    let failCount = 0
    const validImageUrl = imageUrl

    try {
      logger.info('🚀 Starting direct broadcast', {
        description: 'Starting broadcast',
        total_users: userIds.length,
        test_mode: this.testMode,
        has_image: !!imageUrl,
      })

      // Проверяем, является ли imageUrl file_id
      if (!imageUrl.startsWith('http') && !imageUrl.includes('/')) {
        logger.info('🔍 Using file_id directly', {
          description: 'Using Telegram file_id',
          file_id: imageUrl,
        })
      }

      // Для целей тестирования
      if (ownerTelegramId) {
        try {
          await this.bot.telegram.sendPhoto(ownerTelegramId, validImageUrl, {
            caption: `${text}\n\n[ТЕСТОВАЯ РАССЫЛКА]`,
            parse_mode: 'Markdown',
          })
          logger.info('✅ Test message sent', {
            description: 'Test message sent to owner',
            owner_id: ownerTelegramId,
          })
        } catch (err: unknown) {
          logger.error('❌ Failed to send test message', {
            error: getErrorDetails(err),
            owner_id: ownerTelegramId,
            bot_name: this.botName,
          })
          throw new Error(
            `Failed to send test message: ${getErrorMessage(err)}`
          )
        }
      }

      // Отправка пользователям
      for (const userId of userIds) {
        try {
          await this.bot.telegram.sendPhoto(userId, validImageUrl, {
            caption: text,
            parse_mode: 'Markdown',
          })
          successCount++

          // Активируем пользователя при успешной отправке
          await this.activateUser(userId)

          // Добавляем задержку
          await new Promise(resolve => setTimeout(resolve, 100))
        } catch (err: unknown) {
          failCount++
          logger.error('❌ Failed to send message', {
            error: getErrorDetails(err),
            user_id: userId,
            bot_name: this.botName,
          })
          await this.updateUserStatusAfterFailure(userId, getErrorMessage(err))
        }
      }

      logger.info('✅ Broadcast completed', {
        description: 'Broadcast completed',
        success_count: successCount,
        error_count: failCount,
        bot_name: this.botName,
      })

      return {
        success: true,
        successCount,
        errorCount: failCount,
        reason: `Broadcast completed. Sent: ${successCount}, Failed: ${failCount}`,
      }
    } catch (err: unknown) {
      const errorMessage = getErrorMessage(err)
      logger.error('❌ Failed to send broadcast', {
        error: getErrorDetails(err),
        bot_name: this.botName,
        test_mode: this.testMode,
      })
      return {
        success: false,
        successCount: 0,
        errorCount: 1,
        reason: errorMessage,
      }
    }
  }

  async sendBroadcastWithImage(
    text: string,
    imageUrl: string,
    ownerTelegramId?: TelegramId
  ): Promise<BroadcastResult> {
    try {
      logger.info('🚀 Starting broadcast with image', {
        description: 'Starting broadcast with image',
        image_url: imageUrl,
        test_mode: this.testMode,
      })

      const userIds = await this.getBotUsers()
      if (!userIds.length) {
        logger.warn('⚠️ No users found for broadcast', {
          description: 'No active users found',
          bot_name: this.botName,
        })
        return {
          success: false,
          successCount: 0,
          errorCount: 0,
          reason: 'No active users found',
        }
      }

      return this.sendBroadcastDirectly(
        userIds,
        text,
        imageUrl,
        ownerTelegramId
      )
    } catch (err: unknown) {
      logger.error('❌ Failed to send broadcast with image', {
        error: getErrorDetails(err),
        bot_name: this.botName,
      })
      return {
        success: false,
        successCount: 0,
        errorCount: 1,
        reason: getErrorMessage(err),
      }
    }
  }

  async sendBroadcastWithVideo(
    text: string,
    videoUrl: string,
    ownerTelegramId?: TelegramId
  ): Promise<BroadcastResult> {
    try {
      logger.info('🚀 Starting broadcast with video', {
        description: 'Starting broadcast with video',
        video_url: videoUrl,
        test_mode: this.testMode,
      })

      const userIds = await this.getBotUsers()
      if (!userIds.length) {
        logger.warn('⚠️ No users found for broadcast', {
          description: 'No active users found',
          bot_name: this.botName,
        })
        return {
          success: false,
          successCount: 0,
          errorCount: 0,
          reason: 'No active users found',
        }
      }

      let successCount = 0
      let failCount = 0

      // Для целей тестирования
      if (ownerTelegramId) {
        try {
          await this.bot.telegram.sendVideo(ownerTelegramId, videoUrl, {
            caption: `${text}\n\n[ТЕСТОВАЯ РАССЫЛКА]`,
            parse_mode: 'Markdown',
          })
          logger.info('✅ Test video message sent', {
            description: 'Test video message sent to owner',
            owner_id: ownerTelegramId,
          })
        } catch (err: unknown) {
          logger.error('❌ Failed to send test video message', {
            error: getErrorDetails(err),
            owner_id: ownerTelegramId,
            bot_name: this.botName,
          })
          throw new Error(
            `Failed to send test video message: ${getErrorMessage(err)}`
          )
        }
      }

      // Отправка пользователям
      for (const userId of userIds) {
        try {
          await this.bot.telegram.sendVideo(userId, videoUrl, {
            caption: text,
            parse_mode: 'Markdown',
          })
          successCount++

          // Активируем пользователя при успешной отправке
          await this.activateUser(userId)

          // Добавляем задержку
          await new Promise(resolve => setTimeout(resolve, 100))
        } catch (err: unknown) {
          failCount++
          logger.error('❌ Failed to send video message', {
            error: getErrorDetails(err),
            user_id: userId,
            bot_name: this.botName,
          })

          // Обновляем статус пользователя после ошибки
          await this.updateUserStatusAfterFailure(userId, getErrorMessage(err))
        }
      }

      const success = failCount === 0
      logger.info(
        success
          ? '✅ Broadcast completed'
          : '⚠️ Broadcast completed with errors',
        {
          description: 'Video broadcast completed',
          success_count: successCount,
          error_count: failCount,
          total_users: userIds.length,
        }
      )

      return {
        success,
        successCount,
        errorCount: failCount,
      }
    } catch (err: unknown) {
      logger.error('❌ Failed to send broadcast with video', {
        error: getErrorDetails(err),
        bot_name: this.botName,
      })
      return {
        success: false,
        successCount: 0,
        errorCount: 1,
        reason: getErrorMessage(err),
      }
    }
  }
}
