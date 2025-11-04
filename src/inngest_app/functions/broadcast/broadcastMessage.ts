import { inngest } from '../../../inngest_app/client'
import { broadcastService } from '@/services/broadcast.service'
import { logger } from '@utils/logger'
import { slugify } from 'inngest' // For v3 migration
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

// Функция для рассылки сообщений
export const broadcastMessage = inngest.createFunction(
  {
    id: slugify('broadcast-message'), // v3 requires id, using slugify for existing name
    name: '📢 Broadcast Message', // Optional display name for v3
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
          const broadcastResult = await broadcastService.checkOwnerPermissions(
            params.sender_telegram_id,
            params.bot_name
          )
          if (!broadcastResult.success) {
            throw new Error('Нет прав для выполнения рассылки')
          }
        }
      })

      // Шаг 3: Загрузка списка пользователей
      const users = await step.run('fetch-users', async () => {
        const result = await broadcastService.fetchUsers({
          bot_name: params.bot_name,
          test_mode: params.test_mode,
          test_telegram_id: params.test_telegram_id,
          sender_telegram_id: params.sender_telegram_id,
        })

        if (!result.users || result.users.length === 0) {
          throw new Error('Нет пользователей для рассылки')
        }

        logger.info(`👥 Загружено пользователей: ${result.users.length}`, {
          description: `Fetched users count: ${result.users.length}`,
          bot_name: params.bot_name || 'all',
          test_mode: params.test_mode || false,
        })

        return result.users
      })

      // Шаг 4: Отправка сообщений
      const result = await step.run('send-messages', async () => {
        const broadcastResult = await broadcastService.sendToAllUsers(
          params.imageUrl,
          params.textRu,
          {
            ...params,
            bot_name: params.bot_name,
            textEn: params.textEn,
          }
        )
        return broadcastResult || { successCount: 0, errorCount: 0 }
      })

      // Шаг 5: Анализ результатов
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
      logger.error('❌ Ошибка при выполнении рассылки:', {
        description: 'Error during broadcast execution',
        error: error?.message || 'Unknown error',
        step: error?.step || 'unknown',
        contentType: event.data.contentType || 'photo',
        bot_name: event.data.bot_name || 'all',
        test_mode: event.data.test_mode || false,
      })

      throw error // Позволяем Inngest обработать повторные попытки
    }
  }
)
