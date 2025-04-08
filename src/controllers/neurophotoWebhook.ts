import { Request, Response } from 'express'
import { getTaskData } from '@/core/supabase/'
import { logger } from '@/utils/logger'
import { NeurophotoWebhookBody } from '@/types/api'
import { sendMessageToUser } from '@/core/telegram/sendMessageToUser'

// Множество для хранения обработанных задач, чтобы избежать дублирования
const processedTaskIds = new Set<string>()

/**
 * Обработчик вебхука от нейрофото-сервиса
 */
export async function handleWebhookNeurophoto(
  req: Request<{}, {}, NeurophotoWebhookBody>,
  res: Response
): Promise<void> {
  const { task_id, status, result } = req.body

  logger.info('🎨 Received neurophoto webhook', { task_id, status })

  // Проверяем, не обрабатывали ли мы уже эту задачу
  if (processedTaskIds.has(task_id)) {
    logger.info('🔄 Task already processed', { task_id })
    res.status(200).json({ message: 'Task already processed' })
    return
  }

  try {
    const taskData = await getTaskData(task_id)
    if (!taskData) {
      throw new Error('Task data not found')
    }

    const { telegram_id, bot_name } = taskData

    if (
      status === 'Content Moderated' ||
      status === 'GENERATED CONTENT MODERATED'
    ) {
      logger.warn('⚠️ Content moderated', { task_id })
      await sendMessageToUser({
        telegram_id,
        bot_name,
        text: 'Content moderated. Please try again with different prompt.',
      })
    } else if (status === 'completed' && result?.urls) {
      logger.info('✅ Task completed', { task_id })
      // Обработка успешного результата
    } else if (status === 'failed') {
      logger.error('❌ Task failed', { task_id, error: result?.error })
      await sendMessageToUser({
        telegram_id,
        bot_name,
        text: 'Generation failed. Please try again.',
      })
    }

    // Добавляем задачу в список обработанных
    processedTaskIds.add(task_id)
    res.status(200).json({ message: 'Webhook processed' })
  } catch (error) {
    logger.error('❌ Error processing webhook', { task_id, error })
    res.status(500).json({ error: 'Internal server error' })
  }
}

// Очистка множества обработанных задач раз в сутки
setInterval(
  () => {
    if (processedTaskIds.size > 0) {
      processedTaskIds.clear()
      logger.info({
        message: '🧹 Очищен список обработанных задач',
        description: 'Processed tasks cleared',
        count: processedTaskIds.size,
      })
    }
  },
  24 * 60 * 60 * 1000
)

/**
 * Обработчик вебхука нейрофото в режиме отладки
 * Просто логирует запрос и возвращает успешный статус
 */
export const handleWebhookNeurophotoDebug = async (
  req: Request,
  res: Response
) => {
  try {
    const payload = req.body

    logger.info({
      message: '🔍 Входящий вебхук нейрофото (ОТЛАДКА)',
      description: 'Debug neurophoto webhook request',
      payload,
    })

    // Просто возвращаем успех
    return res.status(200).json({
      message: 'Webhook processed in debug mode',
      payload,
    })
  } catch (error) {
    logger.error({
      message: '❌ Ошибка в режиме отладки вебхука нейрофото',
      description: 'Error in debug neurophoto webhook handler',
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    })

    return res
      .status(500)
      .json({ error: 'Internal server error in debug mode' })
  }
}
