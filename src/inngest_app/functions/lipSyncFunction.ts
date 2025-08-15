import { inngest } from '../client'
import { logger } from '@/utils/logger'
import { generateKlingLipSync, getKlingLipSyncStatus } from '@/core/replicate/generateKlingLipSync'
import { bot } from '@/index'
import { Input } from 'telegraf'

/**
 * 🎬 Inngest функция для обработки липсинка с поддержкой webhook
 * Эта функция:
 * 1. Принимает видео и аудио URL
 * 2. Запускает генерацию через Replicate
 * 3. Отслеживает статус через webhook
 * 4. Отправляет результат пользователю в Telegram
 */
export const lipSyncFunction = inngest.createFunction(
  {
    id: 'process-lipsync',
    name: 'Process LipSync Video',
    retries: 3,
  },
  { event: 'lipsync/process' },
  async ({ event, step, logger: inngestLogger }) => {
    const { videoUrl, audioUrl, telegramId, chatId, username, isRu } = event.data

    inngestLogger.info('🎬 Starting LipSync processing', {
      telegramId,
      username,
      eventId: event.id,
    })

    // Шаг 1: Запуск генерации
    const generation = await step.run('start-generation', async () => {
      logger.info('[LipSync] Starting generation', {
        telegramId,
        videoUrl: videoUrl.substring(0, 100),
        audioUrl: audioUrl.substring(0, 100),
      })

      const result = await generateKlingLipSync(
        telegramId,
        videoUrl,
        audioUrl,
        isRu
      )

      if ('error' in result) {
        throw new Error(result.message || 'Failed to start generation')
      }

      return result
    })

    // Шаг 2: Ожидание webhook или проверка статуса
    const finalResult = await step.run('wait-for-completion', async () => {
      // Если у нас уже есть результат
      if (generation.status === 'succeeded' && generation.output) {
        return generation
      }

      // Ждем webhook события или таймаут
      const maxAttempts = 60 // 5 минут максимум
      let attempts = 0

      while (attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 5000)) // Ждем 5 секунд

        const status = await getKlingLipSyncStatus(generation.id)
        
        if ('error' in status) {
          throw new Error(status.message || 'Failed to check status')
        }

        logger.info('[LipSync] Status check', {
          predictionId: generation.id,
          status: status.status,
          attempt: attempts + 1,
        })

        if (status.status === 'succeeded' && status.output) {
          return status
        }

        if (status.status === 'failed' || status.status === 'canceled') {
          throw new Error(`Generation ${status.status}: ${status.error || 'Unknown error'}`)
        }

        attempts++
      }

      throw new Error('Generation timeout - exceeded 5 minutes')
    })

    // Шаг 3: Отправка результата пользователю
    await step.run('send-result', async () => {
      if (!finalResult.output) {
        throw new Error('No output URL in final result')
      }

      logger.info('[LipSync] Sending result to user', {
        telegramId,
        chatId,
        outputUrl: finalResult.output.substring(0, 100),
      })

      try {
        // Отправляем видео через Telegram bot
        await bot.telegram.sendVideo(
          chatId,
          Input.fromURL(finalResult.output),
          {
            caption: isRu
              ? '✅ Ваше видео с липсинком готово!\n\n🎬 Сгенерировано с помощью Kling LipSync'
              : '✅ Your lip-sync video is ready!\n\n🎬 Generated with Kling LipSync',
            parse_mode: 'Markdown',
          }
        )

        logger.info('[LipSync] Result sent successfully', {
          telegramId,
          chatId,
        })

        return {
          success: true,
          outputUrl: finalResult.output,
          predictionId: finalResult.id,
        }
      } catch (error) {
        logger.error('[LipSync] Failed to send result', {
          error: error instanceof Error ? error.message : String(error),
          telegramId,
          chatId,
        })
        throw error
      }
    })

    return {
      success: true,
      predictionId: generation.id,
      outputUrl: finalResult.output,
      telegramId,
      processedAt: new Date().toISOString(),
    }
  }
)

/**
 * 🔔 Webhook handler для Replicate
 * Эта функция вызывается когда Replicate отправляет webhook о завершении
 */
export const lipSyncWebhookFunction = inngest.createFunction(
  {
    id: 'lipsync-webhook',
    name: 'Handle LipSync Webhook',
  },
  { event: 'replicate/webhook' },
  async ({ event, step, logger: inngestLogger }) => {
    const { id, status, output, error } = event.data

    inngestLogger.info('📡 Received Replicate webhook', {
      predictionId: id,
      status,
      hasOutput: !!output,
      error,
    })

    // Сохраняем статус в базе или кеше для основной функции
    await step.run('update-status', async () => {
      logger.info('[Webhook] Updating prediction status', {
        predictionId: id,
        status,
        hasOutput: !!output,
      })

      // Здесь можно обновить статус в Supabase или Redis
      // для того чтобы основная функция могла его получить
      
      return {
        predictionId: id,
        status,
        output,
        updatedAt: new Date().toISOString(),
      }
    })

    return {
      success: true,
      predictionId: id,
      status,
    }
  }
)
