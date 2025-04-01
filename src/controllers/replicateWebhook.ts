import { Request, Response } from 'express'
import { logger } from '@/utils/logger'
import { inngest } from '@/core/inngest/clients'
import { updateLatestModelTraining, getTrainingWithUser } from '@/core/supabase'
import { NotificationService } from '@/services'

interface ReplicateWebhookPayload {
  id: string
  model: string
  version: string
  status: 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled'
  output?: {
    uri?: string
    version?: string
    weights?: string
    [key: string]: any
  }
  error?: string
  logs?: string
  metrics?: {
    predict_time?: number
    [key: string]: any
  }
  webhook_events_filter?: string[]
  metadata?: Record<string, any>
}

// Сервис для отправки уведомлений
const notificationService = new NotificationService()

export const handleReplicateWebhook = async (req: Request, res: Response) => {
  try {
    const payload = req.body as ReplicateWebhookPayload

    logger.info({
      message: '📨 Получен веб-хук от Replicate',
      trainingId: payload.id,
      status: payload.status,
      model: payload.model,
      requestId: req.headers['x-request-id'],
    })

    // 🔒 Улучшенная валидация
    if (!payload.id) {
      logger.error({
        message: '❌ Некорректные данные в веб-хуке',
        payload: JSON.stringify(payload).substring(0, 500) + '...', // Ограничиваем размер для логов
      })
      return res.status(400).json({ error: 'Invalid webhook payload' })
    }

    try {
      // Получаем данные о тренировке и пользователе за один запрос
      const training = await getTrainingWithUser(payload.id)

      if (!training || !training.users) {
        logger.error({
          message: '❌ Тренировка не найдена в базе данных',
          trainingId: payload.id,
        })
        // Отправляем успешный статус, чтобы Replicate не пытался повторить запрос
        return res.status(200).json({
          success: false,
          message: 'Training not found in database, but webhook acknowledged',
        })
      }

      logger.info({
        message: '✅ Тренировка найдена в базе данных',
        trainingId: payload.id,
        telegram_id: training.users.telegram_id,
        model_name: training.model_name,
        status: payload.status,
      })

      // Определяем новый статус
      const newStatus =
        payload.status === 'succeeded'
          ? 'SUCCESS'
          : payload.status === 'failed'
          ? 'FAILED'
          : payload.status === 'canceled'
          ? 'CANCELED'
          : 'PROCESSING'

      // Обновляем статус в базе данных и кэше
      await updateLatestModelTraining(
        training.users.telegram_id.toString(),
        training.model_name,
        {
          status: newStatus,
          output_url: payload.output?.uri || payload.output?.version || null,
          weights: payload.output?.weights || null,
          error: payload.error || null,
          replicate_training_id: payload.id,
        },
        'replicate'
      )

      logger.info({
        message: '📝 Статус тренировки обновлен в базе данных',
        trainingId: payload.id,
        telegram_id: training.users.telegram_id,
        model_name: training.model_name,
        newStatus,
      })

      // Обрабатываем терминальные статусы
      const terminalStatuses = ['succeeded', 'failed', 'canceled']
      const isTerminal = terminalStatuses.includes(payload.status)

      if (isTerminal) {
        try {
          const isSuccessful = payload.status === 'succeeded'
          const isRussian = training.users.language_code === 'ru'

          // Отправляем событие для обработки завершения тренировки
          await inngest.send({
            name: 'model-training/completed',
            data: {
              trainingId: payload.id,
              recordId: training.id,
              telegramId: training.users.telegram_id.toString(),
              modelName: training.model_name,
              status: payload.status,
              isSuccessful,
              isTerminal,
              output: payload.output,
              error: payload.error,
              botName: training.users.bot_name,
              metadata: payload.metadata || {},
            },
          })

          logger.info({
            message: '🚀 Отправлено событие в Inngest',
            event_name: 'model-training/completed',
            trainingId: payload.id,
            status: payload.status,
          })

          // Отправляем уведомления пользователю в зависимости от результата
          if (isSuccessful) {
            await notificationService.sendSuccessNotification(
              training.users.telegram_id.toString(),
              training.users.bot_name,
              isRussian
            )
          } else if (payload.error) {
            await notificationService.sendTrainingError(
              training.users.telegram_id.toString(),
              training.users.bot_name,
              payload.error
            )
          }
        } catch (notificationError) {
          logger.error({
            message:
              '❌ Ошибка при отправке уведомления о завершении тренировки',
            error: notificationError.message,
            trainingId: payload.id,
          })
        }
      }

      // Отправляем ответ Replicate
      return res.status(200).json({
        success: true,
        message: 'Webhook processed successfully',
        trainingId: payload.id,
        status: newStatus,
      })
    } catch (dbError) {
      logger.error({
        message: '❌ Ошибка запроса к базе данных',
        error: dbError.message,
        stack: dbError.stack,
        trainingId: payload.id,
      })

      // При ошибке БД все равно отвечаем 200, чтобы Replicate не повторял запрос
      return res.status(200).json({
        success: false,
        message: 'Database error, but webhook acknowledged',
        error: dbError.message,
      })
    }
  } catch (error) {
    logger.error({
      message: '❌ Критическая ошибка при обработке веб-хука Replicate',
      error: error.message,
      stack: error.stack,
      requestId: req.headers['x-request-id'],
    })

    // Даже при критической ошибке отвечаем 200, чтобы избежать повторных запросов
    return res.status(200).json({
      success: false,
      message: 'Critical error but webhook acknowledged',
      requestId: req.headers['x-request-id'],
      timestamp: new Date().toISOString(),
    })
  }
}
