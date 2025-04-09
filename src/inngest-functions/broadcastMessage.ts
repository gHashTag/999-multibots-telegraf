import { inngest } from '@/inngest-functions/clients'
import { broadcastService } from '@/services/broadcast.service'
import { logger } from '@/utils/logger'
import { Telegraf } from 'telegraf'
import { MyContext } from '@/interfaces'
import { BroadcastService } from '@/services/broadcast.class'

// Интерфейс для данных события
export interface BroadcastEventData {
  imageUrl?: string
  textRu: string // Текст на русском
  textEn: string // Текст на английском
  bot_name?: string
  sender_telegram_id?: string
  test_mode?: boolean
  test_telegram_id?: string
  contentType?: 'photo' | 'video' | 'post_link'
  postLink?: string
  videoFileId?: string
  parse_mode?: 'HTML' | 'Markdown' // Добавляем поддержку разных режимов разметки
}

interface BotResults {
  [key: string]: Telegraf<MyContext>
}

interface BroadcastError extends Error {
  step?: string
}

// Функция для рассылки сообщений
export const broadcastMessage = inngest.createFunction(
  {
    id: 'broadcast-message',
    retries: 3,
  },
  { event: 'broadcast/send-message' },
  async ({ event, step }) => {
    try {
      // Шаг 1: Валидация входных данных
      const params = await step.run('validate-input', async () => {
        const data = event.data as BroadcastEventData

        if (!data.textRu || !data.textEn) {
          throw new Error('Текст сообщения отсутствует на одном из языков')
        }

        if (data.contentType === 'photo' && !data.imageUrl) {
          throw new Error('URL изображения отсутствует для фото-рассылки')
        } else if (data.contentType === 'video' && !data.videoFileId) {
          throw new Error('ID видео отсутствует для видео-рассылки')
        } else if (data.contentType === 'post_link' && !data.postLink) {
          throw new Error('URL поста отсутствует для рассылки ссылки')
        }

        return data
      })

      // Шаг 2: Проверка прав доступа
      await step.run('check-permissions', async () => {
        if (params.sender_telegram_id && params.bot_name) {
          const service = new BroadcastService(
            params.bot_name,
            process.env.BOT_TOKEN || ''
          )
          const users = await service.getBotUsers()
          const hasPermission = users.includes(params.sender_telegram_id)
          if (!hasPermission) {
            throw new Error('Нет прав для выполнения рассылки')
          }
        }
      })

      // Шаг 3: Загрузка списка пользователей
      const users = await step.run('fetch-users', async () => {
        let userList: string[] = []

        if (params.test_mode && params.test_telegram_id) {
          userList = [params.test_telegram_id]
        } else if (params.bot_name) {
          userList = await broadcastService.getBotUsers(params.bot_name)
        } else {
          userList = await broadcastService.getAllBotUsers('all')
        }

        if (!userList || userList.length === 0) {
          throw new Error('Нет пользователей для рассылки')
        }

        logger.info(`👥 Загружено пользователей: ${userList.length}`, {
          description: `Fetched users count: ${userList.length}`,
          bot_name: params.bot_name || 'all',
          test_mode: params.test_mode || false,
        })

        return userList.map(id => ({
          telegram_id: id,
          bot_name: params.bot_name || 'all',
        }))
      })

      // Шаг 4: Подготовка ботов
      await step.run('prepare-bots', async () => {
        const uniqueBotNames = [...new Set(users.map(u => u.bot_name))]
        const results: BotResults = {}

        for (const botName of uniqueBotNames) {
          const bot = new Telegraf<MyContext>(process.env.BOT_TOKEN || '')
          results[botName] = bot
        }

        return results
      })

      // Шаг 5: Отправка сообщений
      const result = await step.run('send-messages', async () => {
        let successCount = 0
        let errorCount = 0

        for (const user of users) {
          try {
            if (params.contentType === 'photo') {
              await broadcastService.sendBroadcastWithImage(
                process.env.BOT_TOKEN || '',
                params.textRu,
                params.imageUrl || '',
                user.telegram_id
              )
              successCount++
            } else if (params.contentType === 'video') {
              await broadcastService.sendBroadcastWithVideo(
                process.env.BOT_TOKEN || '',
                params.textRu,
                params.videoFileId || '',
                user.telegram_id
              )
              successCount++
            }
          } catch (error) {
            errorCount++
            logger.error('❌ Ошибка при отправке сообщения пользователю:', {
              description: 'Error sending message to user',
              error: error instanceof Error ? error.message : 'Unknown error',
              user_id: user.telegram_id,
              bot_name: user.bot_name,
            })
          }
        }

        return { successCount, errorCount }
      })

      // Шаг 6: Анализ результатов
      const summary = await step.run('analyze-results', async () => {
        const totalUsers = users.length
        const successRate = (result.successCount / totalUsers) * 100

        logger.info('📊 Итоги рассылки:', {
          description: 'Broadcast summary',
          totalUsers,
          successCount: result.successCount,
          errorCount: result.errorCount,
          successRate: `${successRate.toFixed(2)}%`,
          bot_name: params.bot_name || 'all',
          test_mode: params.test_mode || false,
        })

        return {
          totalUsers,
          successCount: result.successCount,
          errorCount: result.errorCount,
          successRate,
        }
      })

      return {
        success: true,
        timestamp: new Date().toISOString(),
        message: params.test_mode
          ? 'Test broadcast completed'
          : params.bot_name
            ? `Broadcast completed for bot ${params.bot_name}`
            : 'Broadcast completed for all users',
        statistics: summary,
        contentType: params.contentType || 'photo',
        bot_name: params.bot_name || 'all',
        sender: params.sender_telegram_id || 'system',
        test_mode: params.test_mode || false,
      }
    } catch (error) {
      const broadcastError = error as BroadcastError
      logger.error('❌ Ошибка при выполнении рассылки:', {
        description: 'Error during broadcast execution',
        error: broadcastError.message || 'Unknown error',
        step: broadcastError.step || 'unknown',
        contentType: (event.data as BroadcastEventData).contentType || 'photo',
        bot_name: (event.data as BroadcastEventData).bot_name || 'all',
        test_mode: (event.data as BroadcastEventData).test_mode || false,
      })

      throw error // Позволяем Inngest обработать повторные попытки
    }
  }
)
