import { logger } from '@/utils/logger'
import { lipSyncOrchestrator } from './lipsync-orchestrator'
import { updateUserBalance } from '@/core/supabase/updateUserBalance'
import { PaymentType } from '@/interfaces/payments.interface'
import type {
  UniversalLipSyncInput,
  LipSyncOutput,
  LipSyncError,
} from './schemas/lipsync-schemas'

interface AsyncLipSyncJob {
  id: string
  telegramId: string
  chatId: number
  startTime: number
  input: UniversalLipSyncInput
  cost: number
  botInfo?: any
  status: 'pending' | 'processing' | 'completed' | 'failed'
  result?: LipSyncOutput | LipSyncError
  taskId?: string // Kie.ai taskId для webhook correlation
}

/**
 * Асинхронный менеджер для обработки долгих LipSync задач
 * Решает проблему таймаутов HTTP-соединений
 */
export class AsyncLipSyncManager {
  private static instance: AsyncLipSyncManager
  private jobs = new Map<string, AsyncLipSyncJob>()
  private bot: any = null

  private constructor() {}

  static getInstance(): AsyncLipSyncManager {
    if (!AsyncLipSyncManager.instance) {
      AsyncLipSyncManager.instance = new AsyncLipSyncManager()
    }
    return AsyncLipSyncManager.instance
  }

  /**
   * Устанавливает ссылку на бота для отправки результатов
   */
  setBotInstance(bot: any) {
    this.bot = bot
  }

  /**
   * Запускает асинхронную генерацию LipSync
   */
  async startAsyncGeneration(
    input: UniversalLipSyncInput,
    cost: number,
    telegramId: string,
    chatId: number,
    botInfo?: any
  ): Promise<string> {
    const jobId = `lipsync_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    const job: AsyncLipSyncJob = {
      id: jobId,
      telegramId,
      chatId,
      startTime: Date.now(),
      input,
      cost,
      botInfo,
      status: 'pending',
    }

    this.jobs.set(jobId, job)

    logger.info('🚀 [ASYNC LIPSYNC] Запущена асинхронная задача', {
      jobId,
      telegramId,
      modelId: input.modelId,
      provider: input.provider,
    })

    // Запускаем обработку в фоне (не await!)
    this.processJobAsync(jobId).catch(error => {
      logger.error('❌ [ASYNC LIPSYNC] Ошибка в фоновой обработке', {
        jobId,
        error: error.message,
      })
    })

    return jobId
  }

  /**
   * Фоновая обработка задачи
   */
  private async processJobAsync(jobId: string): Promise<void> {
    const job = this.jobs.get(jobId)
    if (!job) {
      logger.error('❌ [ASYNC LIPSYNC] Задача не найдена', { jobId })
      return
    }

    try {
      // Обновляем статус
      job.status = 'processing'
      this.jobs.set(jobId, job)

      logger.info('⏳ [ASYNC LIPSYNC] Начало обработки', {
        jobId,
        telegramId: job.telegramId,
        modelId: job.input.modelId,
      })

      // ✅ ДЕТАЛЬНОЕ ЛОГИРОВАНИЕ: Проверяем входные данные перед генерацией
      logger.info('🔍 [ASYNC LIPSYNC] Детальная проверка входных данных', {
        jobId,
        telegramId: job.telegramId,
        provider: job.input.provider,
        modelId: job.input.modelId,
        imageUrl: (job.input as any).imageUrl?.substring(0, 100) + '...',
        hasText: !!(job.input as any).text,
        textLength: (job.input as any).text?.length || 0,
        hasAudioUrl: !!(job.input as any).audioUrl,
        audioUrl: (job.input as any).audioUrl?.substring(0, 100) + '...',
        resolution: (job.input as any).resolution,
        isAudioUrl: (job.input as any).isAudioUrl,
      })

      // Запускаем генерацию через orchestrator
      const result = await lipSyncOrchestrator.generate(job.input)

      logger.info('🔍 [ASYNC LIPSYNC] Результат генерации получен', {
        jobId,
        hasId: 'id' in result,
        resultKeys: Object.keys(result),
        resultPreview: JSON.stringify(result).substring(0, 300),
        fullResult: result, // ✅ Добавляем полный результат для анализа
      })

      // ✅ WEBHOOK INTEGRATION: Если результат содержит taskId, сохраняем связь
      if ('taskId' in result && result.taskId) {
        this.setTaskId(jobId, result.taskId as string)
        logger.info('🔗 [ASYNC LIPSYNC] TaskId связан с job для webhook', {
          jobId,
          taskId: result.taskId,
          telegramId: job.telegramId,
        })

        // ✅ WEBHOOK MODE: Если status = 'processing', не завершаем job - ждем webhook
        if ('status' in result && result.status === 'processing') {
          logger.info('⏳ [ASYNC LIPSYNC] Job в режиме ожидания webhook', {
            jobId,
            taskId: result.taskId,
            telegramId: job.telegramId,
          })

          // ✅ FALLBACK POLLING: Запускаем проверку статуса через 2 минуты, если webhook не пришел
          this.startFallbackPolling(jobId, result.taskId as string)

          // НЕ обновляем job.status и НЕ отправляем сообщение пользователю
          // Webhook или polling сделает это позже
          return
        }
      }

      // Сохраняем результат и определяем статус
      job.result = result

      // ✅ ИСПРАВЛЕНО: Правильно определяем статус на основе результата
      if ('id' in result) {
        // Успешная генерация
        job.status = 'completed'
        this.jobs.set(jobId, job)

        logger.info('✅ [ASYNC LIPSYNC] Успешная генерация', {
          jobId,
          output: (result as any).output?.substring(0, 100),
          processingTime: Date.now() - job.startTime,
        })

        await this.sendSuccessResult(job, result)
      } else {
        // Ошибка генерации
        job.status = 'failed'
        this.jobs.set(jobId, job)

        logger.error('❌ [ASYNC LIPSYNC] Ошибка генерации', {
          jobId,
          errorMessage: (result as any).message,
          errorCode: (result as any).code,
          processingTime: Date.now() - job.startTime,
        })

        await this.sendErrorResult(job, result)
      }
    } catch (error) {
      console.log(
        '🚨 [ASYNC LIPSYNC] CRITICAL DEBUG: Критическая ошибка обработки',
        {
          jobId,
          error: error instanceof Error ? error.message : 'Unknown error',
          errorName: error instanceof Error ? error.name : typeof error,
          errorStack: error instanceof Error ? error.stack : undefined,
          telegramId: job.telegramId,
          provider: job.input.provider,
          modelId: job.input.modelId,
        }
      )

      job.status = 'failed'
      job.result = {
        message: 'Async processing failed',
        error: error instanceof Error ? error.message : 'Unknown error',
        code: 'ASYNC_PROCESSING_FAILED',
        provider: job.input.provider,
        modelId: job.input.modelId,
      }
      this.jobs.set(jobId, job)

      await this.sendCriticalError(job, error)

      logger.error('❌ [ASYNC LIPSYNC] Критическая ошибка обработки', {
        jobId,
        error: error instanceof Error ? error.message : 'Unknown error',
        telegramId: job.telegramId,
      })
    } finally {
      // Очищаем задачу через час для экономии памяти
      setTimeout(
        () => {
          this.jobs.delete(jobId)
          logger.info('🗑️ [ASYNC LIPSYNC] Задача удалена из памяти', { jobId })
        },
        60 * 60 * 1000
      ) // 1 час
    }
  }

  /**
   * Отправляет результат успешной генерации
   */
  private async sendSuccessResult(
    job: AsyncLipSyncJob,
    result: LipSyncOutput
  ): Promise<void> {
    if (!this.bot) {
      logger.error('❌ [ASYNC LIPSYNC] Bot instance не установлен')
      return
    }

    try {
      const processingTime = Math.round((Date.now() - job.startTime) / 1000)

      // Send completion notification with sound first
      await this.bot.telegram.sendMessage(job.chatId, '✅ Готово!', {
        disable_notification: false, // Enable sound notification
      })

      // Then send the detailed result
      await this.bot.telegram.sendMessage(
        job.chatId,
        `🎬 Видео готово!\n\n` +
          `📥 Скачать: ${result.output}\n` +
          `⏱ Время обработки: ${processingTime} сек\n` +
          `🤖 Модель: ${result.modelUsed}`,
        {
          parse_mode: 'HTML',
          disable_web_page_preview: false,
        }
      )

      logger.info('📬 [ASYNC LIPSYNC] Успешный результат отправлен', {
        jobId: job.id,
        telegramId: job.telegramId,
        processingTime,
      })
    } catch (sendError) {
      logger.error('❌ [ASYNC LIPSYNC] Ошибка отправки успешного результата', {
        jobId: job.id,
        sendError:
          sendError instanceof Error ? sendError.message : 'Unknown error',
      })
    }
  }

  /**
   * Отправляет ошибку генерации с возвратом средств
   */
  private async sendErrorResult(
    job: AsyncLipSyncJob,
    result: LipSyncError
  ): Promise<void> {
    console.log('🚨 [ASYNC LIPSYNC] CRITICAL DEBUG: sendErrorResult вызван', {
      jobId: job.id,
      telegramId: job.telegramId,
      errorMessage: result.message,
      errorCode: result.code,
      errorProvider: result.provider,
      errorModelId: result.modelId,
      fullResult: result,
    })

    if (!this.bot) {
      logger.error('❌ [ASYNC LIPSYNC] Bot instance не установлен')
      return
    }

    try {
      // Возврат средств
      await updateUserBalance(
        job.telegramId,
        job.cost,
        PaymentType.MONEY_INCOME,
        'LipSync refund - generation error',
        {
          bot_name: job.botInfo?.username || 'unknown_bot',
          error_code: result.code,
          job_id: job.id,
        }
      )

      await this.bot.telegram.sendMessage(
        job.chatId,
        `❌ Ошибка генерации: ${result.message}\n\n` +
          `💰 Средства возвращены: ${job.cost.toFixed(2)}⭐\n` +
          `🔍 Код ошибки: ${result.code}`,
        { parse_mode: 'HTML' }
      )

      logger.info('💰 [ASYNC LIPSYNC] Средства возвращены за ошибку', {
        jobId: job.id,
        telegramId: job.telegramId,
        refundAmount: job.cost,
        errorCode: result.code,
      })
    } catch (sendError) {
      logger.error('❌ [ASYNC LIPSYNC] Ошибка отправки сообщения об ошибке', {
        jobId: job.id,
        sendError:
          sendError instanceof Error ? sendError.message : 'Unknown error',
      })
    }
  }

  /**
   * Отправляет критическую ошибку с возвратом средств
   */
  private async sendCriticalError(
    job: AsyncLipSyncJob,
    error: any
  ): Promise<void> {
    if (!this.bot) {
      logger.error('❌ [ASYNC LIPSYNC] Bot instance не установлен')
      return
    }

    try {
      // Возврат средств
      await updateUserBalance(
        job.telegramId,
        job.cost,
        PaymentType.MONEY_INCOME,
        'LipSync refund - critical error',
        {
          bot_name: job.botInfo?.username || 'unknown_bot',
          job_id: job.id,
        }
      )

      await this.bot.telegram.sendMessage(
        job.chatId,
        `❌ Произошла критическая ошибка при генерации.\n\n` +
          `💰 Средства возвращены: ${job.cost.toFixed(2)}⭐\n` +
          `🛠️ Попробуйте позже или обратитесь в поддержку.`,
        { parse_mode: 'HTML' }
      )

      logger.info(
        '💰 [ASYNC LIPSYNC] Средства возвращены за критическую ошибку',
        {
          jobId: job.id,
          telegramId: job.telegramId,
          refundAmount: job.cost,
        }
      )
    } catch (sendError) {
      logger.error('❌ [ASYNC LIPSYNC] Ошибка отправки критической ошибки', {
        jobId: job.id,
        sendError:
          sendError instanceof Error ? sendError.message : 'Unknown error',
      })
    }
  }

  /**
   * Получает статус задачи
   */
  getJobStatus(jobId: string): AsyncLipSyncJob | null {
    return this.jobs.get(jobId) || null
  }

  /**
   * Получает активные задачи пользователя
   */
  getUserActiveJobs(telegramId: string): AsyncLipSyncJob[] {
    return Array.from(this.jobs.values()).filter(
      job =>
        job.telegramId === telegramId &&
        ['pending', 'processing'].includes(job.status)
    )
  }

  /**
   * Получает статистику менеджера
   */
  getStats() {
    const stats = {
      total: this.jobs.size,
      pending: 0,
      processing: 0,
      completed: 0,
      failed: 0,
    }

    for (const job of this.jobs.values()) {
      stats[job.status]++
    }

    return stats
  }

  /**
   * Устанавливает taskId для задачи (для webhook correlation)
   */
  setTaskId(jobId: string, taskId: string): boolean {
    const job = this.jobs.get(jobId)
    if (!job) {
      logger.error('❌ [ASYNC LIPSYNC] Job not found for taskId update', {
        jobId,
        taskId,
      })
      return false
    }

    job.taskId = taskId
    this.jobs.set(jobId, job)

    logger.info('🔗 [ASYNC LIPSYNC] TaskId linked to job', {
      jobId,
      taskId,
      telegramId: job.telegramId,
    })

    return true
  }

  /**
   * Находит задачу по taskId (для webhook processing)
   */
  getJobByTaskId(taskId: string): AsyncLipSyncJob | null {
    for (const job of this.jobs.values()) {
      if (job.taskId === taskId) {
        return job
      }
    }

    logger.warn('🔍 [ASYNC LIPSYNC] Job not found by taskId', {
      taskId,
      totalJobs: this.jobs.size,
      activeJobs: Array.from(this.jobs.values()).filter(j =>
        ['pending', 'processing'].includes(j.status)
      ).length,
    })

    return null
  }

  /**
   * Обновляет результат задачи через webhook (от Kie.ai)
   */
  async completeJobByTaskId(
    taskId: string,
    result: LipSyncOutput | LipSyncError
  ): Promise<boolean> {
    const job = this.getJobByTaskId(taskId)
    if (!job) {
      return false
    }

    // Определяем статус на основе результата
    const isSuccess = 'id' in result
    job.status = isSuccess ? 'completed' : 'failed'
    job.result = result
    this.jobs.set(job.id, job)

    logger.info(
      `${isSuccess ? '✅' : '❌'} [ASYNC LIPSYNC] Job updated via webhook`,
      {
        jobId: job.id,
        taskId,
        telegramId: job.telegramId,
        success: isSuccess,
        processingTime: Date.now() - job.startTime,
      }
    )

    // Отправляем результат пользователю
    if (isSuccess) {
      await this.sendSuccessResult(job, result as LipSyncOutput)
    } else {
      await this.sendErrorResult(job, result as LipSyncError)
    }

    return true
  }

  /**
   * ✅ FALLBACK POLLING: Проверяет статус задачи, если webhook не пришел
   * Запускается через 2 минуты после создания задачи
   * Проверяет каждые 30 секунд до 10 минут
   */
  private startFallbackPolling(jobId: string, taskId: string): void {
    const INITIAL_DELAY = 2 * 60 * 1000 // 2 минуты ожидания webhook
    const POLLING_INTERVAL = 30 * 1000 // 30 секунд между проверками
    const MAX_POLLING_TIME = 10 * 60 * 1000 // 10 минут максимум

    logger.info('🔄 [FALLBACK POLLING] Запланирована проверка статуса', {
      jobId,
      taskId,
      initialDelayMs: INITIAL_DELAY,
      pollingIntervalMs: POLLING_INTERVAL,
      maxPollingTimeMs: MAX_POLLING_TIME,
    })

    // ✅ Запускаем первую проверку через 2 минуты
    setTimeout(async () => {
      const job = this.jobs.get(jobId)
      if (!job) {
        logger.warn('⚠️ [FALLBACK POLLING] Job не найден', { jobId, taskId })
        return
      }

      // ✅ Если webhook уже пришел (job.status изменился), прекращаем polling
      if (job.status === 'completed' || job.status === 'failed') {
        logger.info(
          '✅ [FALLBACK POLLING] Webhook уже обработан, polling не нужен',
          {
            jobId,
            taskId,
            status: job.status,
          }
        )
        return
      }

      logger.info(
        '🔍 [FALLBACK POLLING] Webhook не пришел, начинаем проверку статуса',
        {
          jobId,
          taskId,
          elapsedTime: Date.now() - job.startTime,
        }
      )

      // ✅ Запускаем периодическую проверку
      const startPollingTime = Date.now()
      const pollingInterval = setInterval(async () => {
        const currentJob = this.jobs.get(jobId)
        if (!currentJob) {
          logger.warn(
            '⚠️ [FALLBACK POLLING] Job удален, останавливаем polling',
            { jobId, taskId }
          )
          clearInterval(pollingInterval)
          return
        }

        // ✅ Если webhook пришел, останавливаем polling
        if (
          currentJob.status === 'completed' ||
          currentJob.status === 'failed'
        ) {
          logger.info(
            '✅ [FALLBACK POLLING] Webhook пришел, останавливаем polling',
            {
              jobId,
              taskId,
              status: currentJob.status,
            }
          )
          clearInterval(pollingInterval)
          return
        }

        // ✅ Проверяем максимальное время polling
        const elapsedPollingTime = Date.now() - startPollingTime
        if (elapsedPollingTime > MAX_POLLING_TIME) {
          logger.error('❌ [FALLBACK POLLING] Превышено время ожидания', {
            jobId,
            taskId,
            elapsedPollingTime,
            maxPollingTime: MAX_POLLING_TIME,
          })

          // ✅ Возвращаем средства пользователю
          currentJob.status = 'failed'
          currentJob.result = {
            message: 'Task timeout exceeded',
            error: `Task exceeded maximum processing time (${MAX_POLLING_TIME / 1000 / 60} minutes)`,
            code: 'TIMEOUT_EXCEEDED',
            provider: currentJob.input.provider,
            modelId: currentJob.input.modelId,
          }
          this.jobs.set(jobId, currentJob)
          await this.sendErrorResult(
            currentJob,
            currentJob.result as LipSyncError
          )

          clearInterval(pollingInterval)
          return
        }

        try {
          logger.info('🔄 [FALLBACK POLLING] Проверка статуса через provider', {
            jobId,
            taskId,
            attemptTime: elapsedPollingTime,
          })

          // ✅ Используем исправленный getStatus() метод провайдера
          const statusResult = await lipSyncOrchestrator.checkStatus(
            currentJob.input.provider,
            currentJob.input.modelId,
            taskId
          )

          logger.info('📥 [FALLBACK POLLING] Получен статус от provider', {
            jobId,
            taskId,
            statusResult,
          })

          // ✅ Если задача завершена - обрабатываем результат
          if ('status' in statusResult && statusResult.status === 'completed') {
            logger.info('✅ [FALLBACK POLLING] Задача завершена успешно', {
              jobId,
              taskId,
              output: statusResult.output,
            })

            currentJob.status = 'completed'
            currentJob.result = statusResult
            this.jobs.set(jobId, currentJob)
            await this.sendSuccessResult(
              currentJob,
              statusResult as LipSyncOutput
            )

            clearInterval(pollingInterval)
            return
          }

          // ✅ Если произошла ошибка - обрабатываем
          if ('error' in statusResult && statusResult.error) {
            logger.error('❌ [FALLBACK POLLING] Задача завершилась с ошибкой', {
              jobId,
              taskId,
              error: statusResult.error,
            })

            currentJob.status = 'failed'
            currentJob.result = statusResult
            this.jobs.set(jobId, currentJob)
            await this.sendErrorResult(currentJob, statusResult as LipSyncError)

            clearInterval(pollingInterval)
            return
          }

          // ✅ Если задача еще в процессе - продолжаем polling
          logger.info(
            '⏳ [FALLBACK POLLING] Задача еще в процессе, продолжаем проверку',
            {
              jobId,
              taskId,
              nextCheckInSeconds: POLLING_INTERVAL / 1000,
            }
          )
        } catch (error) {
          logger.error('❌ [FALLBACK POLLING] Ошибка при проверке статуса', {
            jobId,
            taskId,
            error: error instanceof Error ? error.message : 'Unknown error',
          })

          // ✅ Обрабатываем ошибку как критическую
          const currentJob = this.jobs.get(jobId)
          if (currentJob) {
            currentJob.status = 'failed'
            currentJob.result = {
              message: 'Failed to check task status',
              error: error instanceof Error ? error.message : 'Unknown error',
              code: 'STATUS_CHECK_FAILED',
            }
            this.jobs.set(jobId, currentJob)
            await this.sendErrorResult(
              currentJob,
              currentJob.result as LipSyncError
            )
            clearInterval(pollingInterval)
            return
          }
        }
      }, POLLING_INTERVAL)
    }, INITIAL_DELAY)
  }
}

/**
 * Singleton экземпляр для удобного доступа
 */
export const asyncLipSyncManager = AsyncLipSyncManager.getInstance()
