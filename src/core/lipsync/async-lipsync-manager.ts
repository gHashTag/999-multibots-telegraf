import { logger } from '@/utils/logger'
import { lipSyncOrchestrator } from './lipsync-orchestrator'
import { updateUserBalance } from '@/core/supabase/updateUserBalance'
import { PaymentType } from '@/interfaces/payments.interface'
import axios from 'axios'
import { getBotByNameAdapter } from '@/inngest_app/services/bot-adapter'
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
  refundIssued?: boolean // guards against a double refund (poller/webhook race)
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
   * Resolves the bot that OWNS this job. The manager is a process-wide
   * singleton, so this.bot is only the LAST bot that called setBotInstance;
   * delivering a completed job through it would send a user's result via the
   * wrong bot (cross-bot misdelivery). Resolve the per-job bot by its name and
   * fall back to this.bot only when the job carries no bot identity.
   */
  private getBotForJob(job: AsyncLipSyncJob): any {
    const botName = job.botInfo?.username
    if (botName) {
      const resolved = getBotByNameAdapter(botName)
      if (resolved.bot) return resolved.bot
      logger.error(
        '❌ [ASYNC LIPSYNC] Failed to resolve per-job bot, falling back',
        { botName, jobId: job.id, error: resolved.error }
      )
    }
    return this.bot
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
        console.log('🔗 [ASYNC LIPSYNC] TaskId связан с job для webhook', {
          jobId,
          taskId: result.taskId,
          telegramId: job.telegramId,
          resultPreview: JSON.stringify(result).substring(0, 200),
        })

        logger.info('🔗 [ASYNC LIPSYNC] TaskId связан с job для webhook', {
          jobId,
          taskId: result.taskId,
          telegramId: job.telegramId,
        })

        // ✅ WEBHOOK MODE: Если status = 'processing', не завершаем job - ждем webhook
        if ('status' in result && result.status === 'processing') {
          console.log('⏳ [ASYNC LIPSYNC] Job в режиме ожидания webhook', {
            jobId,
            taskId: result.taskId,
            telegramId: job.telegramId,
            provider: job.input.provider,
            modelId: job.input.modelId,
          })

          logger.info('⏳ [ASYNC LIPSYNC] Job в режиме ожидания webhook', {
            jobId,
            taskId: result.taskId,
            telegramId: job.telegramId,
          })

          // ✅ FALLBACK POLLING: Запускаем проверку статуса через 2 минуты, если webhook не пришел
          console.log('🔄 [ASYNC LIPSYNC] Запускаем fallback polling', {
            jobId,
            taskId: result.taskId,
            willCheckAfterMs: 120000, // 2 минуты
          })

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
   * Проверяет размер файла по URL
   */
  private async getFileSize(url: string): Promise<number> {
    try {
      const response = await axios({
        method: 'HEAD',
        url,
        timeout: 10000,
      })
      // После обновления axios тип заголовка — объединение
      // (string | number | true | string[] | AxiosHeaders), поэтому приводим
      // к строке явно, а не полагаемся на прежний `string`.
      const contentLength = response.headers['content-length']
      return contentLength ? parseInt(String(contentLength), 10) : 0
    } catch (error) {
      logger.warn('⚠️ [ASYNC LIPSYNC] Не удалось получить размер файла', {
        url: url.substring(0, 100),
        error: error instanceof Error ? error.message : 'Unknown error',
      })
      return 0
    }
  }

  /**
   * Отправляет результат успешной генерации
   * Отправляет файл если < 50 МБ, иначе ссылку
   */
  private async sendSuccessResult(
    job: AsyncLipSyncJob,
    result: LipSyncOutput
  ): Promise<void> {
    const bot = this.getBotForJob(job)
    if (!bot) {
      logger.error('❌ [ASYNC LIPSYNC] Bot instance не установлен')
      return
    }

    try {
      const processingTime = Math.round((Date.now() - job.startTime) / 1000)

      // Send completion notification with sound first
      await bot.telegram.sendMessage(job.chatId, '✅ Готово!', {
        disable_notification: false, // Enable sound notification
      })

      // Проверяем размер файла
      const fileSize = await this.getFileSize(result.output)
      const fileSizeMB = fileSize / (1024 * 1024)
      const maxSizeMB = 50

      logger.info('📊 [ASYNC LIPSYNC] Размер видео файла', {
        jobId: job.id,
        fileSize,
        fileSizeMB: fileSizeMB.toFixed(2),
        maxSizeMB,
        willSendAsFile: fileSizeMB < maxSizeMB && fileSize > 0,
      })

      // Если размер < 50 МБ - отправляем файлом
      if (fileSize > 0 && fileSizeMB < maxSizeMB) {
        try {
          await bot.telegram.sendVideo(
            job.chatId,
            { url: result.output },
            {
              caption:
                `🎬 Видео готово!\n` +
                `⏱ Время обработки: ${processingTime} сек\n` +
                `📦 Размер: ${fileSizeMB.toFixed(1)} МБ`,
              supports_streaming: true,
            }
          )

          logger.info('📹 [ASYNC LIPSYNC] Видео отправлено как файл', {
            jobId: job.id,
            telegramId: job.telegramId,
            fileSizeMB: fileSizeMB.toFixed(2),
            processingTime,
          })
        } catch (videoError) {
          // Если не получилось отправить как video, отправляем ссылку
          logger.warn(
            '⚠️ [ASYNC LIPSYNC] Не удалось отправить как видео, отправляем ссылку',
            {
              jobId: job.id,
              error:
                videoError instanceof Error
                  ? videoError.message
                  : 'Unknown error',
            }
          )

          await bot.telegram.sendMessage(
            job.chatId,
            `🎬 Видео готово!\n\n` +
              `📥 Скачать: ${result.output}\n` +
              `⏱ Время обработки: ${processingTime} сек\n` +
              `📦 Размер: ${fileSizeMB.toFixed(1)} МБ`,
            {
              parse_mode: 'HTML',
              disable_web_page_preview: false,
            }
          )
        }
      } else {
        // Если размер >= 50 МБ или не удалось определить - отправляем ссылку
        await bot.telegram.sendMessage(
          job.chatId,
          `🎬 Видео готово!\n\n` +
            `📥 Скачать: ${result.output}\n` +
            `⏱ Время обработки: ${processingTime} сек` +
            (fileSizeMB > 0
              ? `\n📦 Размер: ${fileSizeMB.toFixed(1)} МБ (слишком большой для отправки файлом)`
              : ''),
          {
            parse_mode: 'HTML',
            disable_web_page_preview: false,
          }
        )

        logger.info('📬 [ASYNC LIPSYNC] Видео отправлено как ссылка', {
          jobId: job.id,
          telegramId: job.telegramId,
          reason:
            fileSizeMB >= maxSizeMB
              ? 'Файл слишком большой'
              : 'Размер неизвестен',
          fileSizeMB: fileSizeMB > 0 ? fileSizeMB.toFixed(2) : 'unknown',
          processingTime,
        })
      }

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

    const bot = this.getBotForJob(job)
    if (!bot) {
      logger.error('❌ [ASYNC LIPSYNC] Bot instance не установлен')
      return
    }

    try {
      // Возврат средств. Текст зависит от того, прошло ли начисление.
      const moneyLine = await this.refundAndDescribe(
        job,
        'LipSync refund - generation error',
        { error_code: result.code }
      )

      await bot.telegram.sendMessage(
        job.chatId,
        `❌ Ошибка генерации: ${result.message}\n\n` +
          `${moneyLine}\n` +
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
   * Возврат с честным сообщением.
   *
   * Раньше в обоих местах ниже стояло: вызвать updateUserBalance, выбросить
   * результат и написать человеку «Средства возвращены». А функция при неудаче
   * НЕ бросает — она возвращает false: не прошла проверка схемы, не удалась
   * вставка или у человека нет строки в `users` (таких плательщиков 44,
   * docs/audit/ghost-payers.md). То есть фраза говорилась и тем, кому не
   * вернули, и заметить это было нельзя.
   *
   * Тот же дефект уже исправлен в пяти визардах (PR #544) — здесь шестое и
   * седьмое места того же класса.
   *
   * @returns строка о деньгах для сообщения человеку
   */
  private async refundAndDescribe(
    job: AsyncLipSyncJob,
    description: string,
    extraMetadata: Record<string, unknown> = {}
  ): Promise<string> {
    // Idempotency: a job must be refunded at most once. Two paths can race to
    // refund the same job -- the 30s fallback poller (below) can overlap itself
    // when a provider status check hangs longer than the interval, and it can
    // also race the webhook path. A second refund double-credits the user (money
    // loss). Set the flag BEFORE the await so a concurrent caller is rejected
    // synchronously; reset it only if the refund did not actually happen, so a
    // genuine failure can still be retried.
    if (job.refundIssued) {
      return `💰 Средства возвращены: ${job.cost.toFixed(2)}⭐`
    }
    job.refundIssued = true

    const refunded = await updateUserBalance(
      job.telegramId,
      job.cost,
      PaymentType.MONEY_INCOME,
      description,
      {
        bot_name: job.botInfo?.username || 'unknown_bot',
        job_id: job.id,
        ...extraMetadata,
      } as any
    )

    if (!refunded) {
      job.refundIssued = false
      logger.error('💸❌ REFUND FAILED — деньги НЕ возвращены', {
        alert: 'ЧЕЛОВЕКУ НЕ ВЕРНУЛИ ЗВЁЗДЫ ПОСЛЕ НЕУДАЧНОЙ ГЕНЕРАЦИИ',
        jobId: job.id,
        telegramId: job.telegramId,
        amount: job.cost,
        description,
      })
      return '💰 Вернуть звёзды автоматически не удалось — напишите в поддержку, приложив это сообщение.'
    }

    return `💰 Средства возвращены: ${job.cost.toFixed(2)}⭐`
  }

  /**
   * Отправляет критическую ошибку с возвратом средств
   */
  private async sendCriticalError(
    job: AsyncLipSyncJob,
    error: any
  ): Promise<void> {
    const bot = this.getBotForJob(job)
    if (!bot) {
      logger.error('❌ [ASYNC LIPSYNC] Bot instance не установлен')
      return
    }

    try {
      // Возврат средств. Текст зависит от того, прошло ли начисление.
      const moneyLine = await this.refundAndDescribe(
        job,
        'LipSync refund - critical error'
      )

      await bot.telegram.sendMessage(
        job.chatId,
        `❌ Произошла критическая ошибка при генерации.\n\n` +
          `${moneyLine}\n` +
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

    // A settled job has already told the person what happened and, on a
    // failure, already moved money (see refundIssued). The fallback poller
    // gives up 12 minutes in; a webhook arriving after that would flip a
    // refunded job to 'completed' and send the video anyway, so the person
    // would keep the refund AND get the product. Refuse to contradict a
    // settled outcome; record it instead, because the generation was paid for
    // upstream and the owner needs to see how often it is thrown away.
    if (job.status === 'completed' || job.status === 'failed') {
      logger.warn(
        '[ASYNC LIPSYNC] Webhook arrived for an already settled job, not re-delivering',
        {
          jobId: job.id,
          taskId,
          telegramId: job.telegramId,
          settledStatus: job.status,
          refundIssued: job.refundIssued === true,
          webhookReportsSuccess: 'id' in result,
          ageMs: Date.now() - job.startTime,
        }
      )
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
      let checkInFlight = false
      // Re-entrancy guard: a provider status check can hang longer than the
      // 30s interval; without this a second tick would start while the first
      // is still awaiting, and both could handle the same terminal state
      // (double delivery). checkInFlight makes the interval skip a tick until
      // the previous one returns.
      const pollTick = async () => {
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
      }
      const pollingInterval = setInterval(() => {
        if (checkInFlight) return
        checkInFlight = true
        void pollTick().finally(() => {
          checkInFlight = false
        })
      }, POLLING_INTERVAL)
    }, INITIAL_DELAY)
  }
}

/**
 * Singleton экземпляр для удобного доступа
 */
export const asyncLipSyncManager = AsyncLipSyncManager.getInstance()
