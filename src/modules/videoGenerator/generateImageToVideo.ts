import { mkdir, writeFile } from 'fs/promises'
import { assertSafePathSegment } from '@/utils/pathSegment'
import path from 'path'
import { createHash } from 'crypto'
import { Telegraf } from 'telegraf'
import { MyContext } from '@/interfaces'
import {
  UNIFIED_VIDEO_MODELS as VIDEO_MODELS_CONFIG,
  type UnifiedVideoModelConfig,
} from '@/config/unified-video-models.config'
import { logger } from '@/utils/logger'
import { replicate } from '@/core/replicate'
import {
  downloadFileHelper,
  getUserHelper,
  checkBalanceVideoOperationHelper,
  deductBalanceAfterSuccess,
  saveVideoUrlHelper,
  updateUserLevelHelper,
} from './helpers'
import { calculateFinalPrice } from '@/price/helpers'
import { videoTaskStore } from '@/services/video-task-store'
import { Markup } from 'telegraf'
import axios from 'axios'
import { isAxiosError } from 'axios'
import { PUBLIC_URL, SECRET_API_KEY } from '@/config'
import { safeSendMessage, markUserAsBlocked } from '@/utils/blockedUsersCheck'
import { videoTaskCache } from './taskCache'

// Константа для директории uploads (используем /tmp для Docker совместимости)
const UPLOADS_DIR = process.env.UPLOADS_DIR || '/tmp/uploads'

// Функция для отправки уведомления админу
// Cooldown to prevent an admin-alert storm. The I2V Plan-B alerts below each fan
// out to EVERY admin, and Plan-B events can burst (many videos fail Plan-A /
// succeed Plan-B in one window), so without this a single degraded window floods
// admin chats (and risks Telegram flood limits). Suppress repeat alerts of the
// same kind within the window; returns true when the caller should skip sending.
const ADMIN_NOTIFY_COOLDOWN_MS = 60_000
const lastAdminNotifyAt = new Map<string, number>()
function adminNotifyOnCooldown(key: string): boolean {
  const now = Date.now()
  const prev = lastAdminNotifyAt.get(key)
  if (prev !== undefined && now - prev < ADMIN_NOTIFY_COOLDOWN_MS) return true
  lastAdminNotifyAt.set(key, now)
  return false
}

async function notifyAdminAboutServerIssue(
  error: string,
  telegram_id: string,
  videoModel: string
) {
  try {
    if (adminNotifyOnCooldown('i2v-server-issue')) return
    const adminIds = process.env.ADMIN_TELEGRAM_ID?.split(',') || ['144022504']
    const { getBotByName } = await import('@/core/bot')
    const botResult = getBotByName('neuro_blogger_bot')

    if (!botResult.bot) return

    // Экранируем специальные символы для HTML
    const escapeHtml = (text: string) => {
      return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;')
    }

    const errorMessage =
      `🚨 <b>SERVER DOWN ALERT (I2V)</b>\n\n` +
      `📍 План Б АКТИВИРОВАН для Image to Video\n` +
      `👤 User: ${escapeHtml(telegram_id)}\n` +
      `🎬 Model: ${escapeHtml(videoModel)}\n` +
      `❌ Server Error: ${escapeHtml(error)}\n` +
      `✅ Используется прямой API Veo 3 (Plan B)\n\n` +
      `⚠️ Проверьте доступность сервера генерации`

    for (const adminId of adminIds) {
      await botResult.bot.telegram.sendMessage(adminId, errorMessage, {
        parse_mode: 'HTML',
      })
    }

    logger.warn('[ADMIN NOTIFICATION] Server issue reported to admins', {
      adminIds,
      error,
    })
  } catch (notifyError) {
    logger.error('[ADMIN NOTIFICATION] Failed to notify admins', notifyError)
  }
}

async function notifyAdminAboutPlanBSuccess(
  telegram_id: string,
  videoModel: string,
  taskId: string,
  videoUrl: string
) {
  try {
    if (adminNotifyOnCooldown('i2v-plan-b-success')) return
    const adminIds = process.env.ADMIN_TELEGRAM_ID?.split(',') || ['144022504']
    const { getBotByName } = await import('@/core/bot')
    const botResult = getBotByName('neuro_blogger_bot')

    if (!botResult.bot) return

    // Экранируем специальные символы для HTML
    const escapeHtml = (text: string) => {
      return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;')
    }

    const successMessage =
      `✅ <b>PLAN B SUCCESS (I2V)</b>\n\n` +
      `📍 Видео успешно сгенерировано через Plan B\n` +
      `👤 User: ${escapeHtml(telegram_id)}\n` +
      `🎬 Model: ${escapeHtml(videoModel)}\n` +
      `🔗 Task ID: ${escapeHtml(taskId)}\n` +
      `🎥 Video URL: ${escapeHtml(videoUrl.substring(0, 50))}...\n\n` +
      `✅ Fallback механизм работает корректно`

    for (const adminId of adminIds) {
      await botResult.bot.telegram.sendMessage(adminId, successMessage, {
        parse_mode: 'HTML',
      })
    }

    logger.info('[ADMIN NOTIFICATION] Plan B success reported to admins', {
      adminIds,
      telegram_id,
      taskId,
    })
  } catch (notifyError) {
    logger.error(
      '[ADMIN NOTIFICATION] Failed to notify admins about Plan B success',
      notifyError
    )
  }
}

export const generateImageToVideo = async (
  telegramId: string,
  username: string,
  isRu: boolean,
  botName: string,
  modelId: string,
  imageUrl: string | null,
  prompt: string | null,
  isMorphing: boolean,
  imageAUrl: string | null,
  imageBUrl: string | null,
  telegramInstance: Telegraf<MyContext>['telegram'],
  chatId: number,
  selectedResolution?: string, // Добавлен параметр для разрешения Seedance
  selectedAspectRatio?: string, // Добавлен параметр для соотношения сторон Kie.ai моделей
  ctx?: MyContext // ✅ FIX: Added ctx to save videoJobId in session
): Promise<void> => {
  assertSafePathSegment(telegramId, 'telegramId')
  let localVideoPath: string | undefined
  const notificationMessage = isRu
    ? 'Генерация видео...'
    : 'Generating video...'
  let paymentAmountForNotification: number | undefined
  let newBalanceForNotification: number | undefined

  try {
    // Усекаем длинный промпт, чтобы избежать ошибок Telegram "message too long"
    const maxPromptLength = 2000 // Безопасный лимит для промпта
    let processedPrompt = prompt
    if (processedPrompt && processedPrompt.length > maxPromptLength) {
      processedPrompt = processedPrompt.substring(0, maxPromptLength) + '...'
      logger.warn('[I2V BG] Prompt truncated due to length', {
        telegramId,
        originalLength: prompt.length,
        truncatedLength: processedPrompt.length,
      })
    }

    // ✅ FIX: Проверка на дублирующиеся запросы генерации через новый кеш
    // Проверяем, есть ли уже активная задача для этого пользователя и модели
    const modelConfig = VIDEO_MODELS_CONFIG[modelId]
    if (videoTaskCache.hasActiveTask(telegramId, modelId)) {
      const existingTask = videoTaskCache.getActiveTask(telegramId, modelId)
      logger.warn(
        '[I2V BG] ⚠️ Duplicate request detected - blocking multiple generation',
        {
          telegramId,
          existingTaskId: existingTask?.taskId,
          modelId,
          cacheStats: videoTaskCache.getStats(),
        }
      )

      await telegramInstance.sendMessage(
        chatId,
        isRu
          ? `⚠️ Видео с моделью ${modelConfig.nameRu} уже генерируется для вас. Пожалуйста, дождитесь завершения (обычно 2-3 минуты).`
          : `⚠️ Video with ${modelConfig.name} model is already being generated for you. Please wait for completion (usually 2-3 minutes).`
      )
      return
    }

    if (!modelConfig) {
      logger.error(
        '[generateImageToVideo BG] Invalid modelId, config not found:',
        { modelId }
      )
      await telegramInstance.sendMessage(
        chatId,
        isRu
          ? `❌ Ошибка: Конфигурация для модели ${modelId} не найдена.`
          : `❌ Error: Configuration for model ${modelId} not found.`
      )
      return
    }

    logger.info('[I2V BG] Start', {
      modelId,
      telegramId,
      isMorphing,
      hasImageUrl: !!imageUrl,
      hasPrompt: !!processedPrompt,
      hasImageA: !!imageAUrl,
      hasImageB: !!imageBUrl,
    })

    if (isMorphing) {
      if (!imageAUrl || !imageBUrl) {
        await telegramInstance.sendMessage(
          chatId,
          '❌ Ошибка: Image A и Image B обязательны для морфинга.'
        )
        return
      }
      if (!modelConfig.apiSettings?.canMorph) {
        await telegramInstance.sendMessage(
          chatId,
          isRu
            ? `❌ Модель ${modelConfig.nameRu} не поддерживает морфинг.`
            : `❌ Model ${modelConfig.name} does not support morphing.`
        )
        return
      }
      logger.info('[I2V BG] Morphing mode validated', { telegramId })
    } else {
      if (!imageUrl || !processedPrompt) {
        await telegramInstance.sendMessage(
          chatId,
          '❌ Ошибка: Изображение и промпт обязательны для стандартного режима.'
        )
        return
      }
      // ✅ ПРОВЕРЯЕМ ПОДДЕРЖКУ IMAGE INPUT
      const supportsImageInput = modelConfig.inputTypes.includes('image')
      if (!supportsImageInput) {
        await telegramInstance.sendMessage(
          chatId,
          isRu
            ? `❌ Ошибка: Модель ${modelConfig.nameRu} не поддерживает генерацию из изображения. Поддерживает только текст.`
            : `❌ Error: Model ${modelConfig.name} does not support image-to-video generation. Text-to-video only.`
        )
        return
      }

      if (!modelConfig.apiSettings?.imageKey) {
        await telegramInstance.sendMessage(
          chatId,
          isRu
            ? `❌ Ошибка: Отсутствует imageKey для модели ${modelConfig.nameRu}.`
            : `❌ Error: Missing imageKey for model ${modelConfig.name}.`
        )
        return
      }
      logger.info('[I2V BG] Standard mode validated', { telegramId })
    }

    const userExists = await getUserHelper(telegramId)
    if (!userExists) {
      logger.warn(
        '[I2V BG] User not found, cannot check level or get aspect ratio.',
        { telegramId }
      )
      await telegramInstance.sendMessage(
        chatId,
        `❌ Ошибка: Пользователь ${telegramId} не найден.`
      )
      return
    } else {
      const level = userExists.level
      if (level === 8) {
        await updateUserLevelHelper(telegramId)
        logger.info('[I2V BG] User level updated', {
          telegramId,
          oldLevel: level,
        })
      }
    }
    // Определяем aspect ratio с учетом вертикальных фото
    let userAspectRatio =
      selectedAspectRatio || (userExists.aspect_ratio ?? '9:16')

    // Если модель поддерживает разные соотношения сторон, используем оптимальное для вертикальных фото
    if (
      modelConfig.apiSettings.aspectRatios &&
      modelConfig.apiSettings.aspectRatios.includes('9:16')
    ) {
      // Для моделей с поддержкой 9:16 используем вертикальное соотношение по умолчанию
      if (!selectedAspectRatio) {
        userAspectRatio = '9:16'
        logger.info(
          '[I2V BG] Using vertical aspect ratio for better compatibility',
          {
            telegramId,
            modelId,
            aspectRatio: userAspectRatio,
          }
        )
      }
    }

    const balanceResult = await checkBalanceVideoOperationHelper(
      telegramId,
      modelId,
      isRu,
      'image_to_video'
    )

    if (
      !balanceResult.success ||
      balanceResult.newBalance === undefined ||
      balanceResult.paymentAmount === undefined
    ) {
      logger.error('[I2V BG] Balance check failed', {
        telegramId,
        error: balanceResult.error,
      })
      await telegramInstance.sendMessage(
        chatId,
        balanceResult.error ||
          (isRu ? '❌ Ошибка проверки баланса' : '❌ Balance check failed')
      )
      return
    }
    // Баланс проверен, деньги будут сняты только после успешной генерации
    logger.info(
      '[I2V BG] Balance check passed, payment will be deducted after successful generation',
      {
        telegramId,
        currentBalance: balanceResult.currentBalance,
        paymentAmount: balanceResult.paymentAmount,
      }
    )

    // Инициализируем значения для уведомлений (будут обновлены после снятия денег)
    paymentAmountForNotification = balanceResult.paymentAmount || 0
    newBalanceForNotification = balanceResult.currentBalance

    const replicateModelId: string = modelConfig.apiModel
    let modelInput: any = {}

    if (isMorphing) {
      const imageKey = modelConfig.apiSettings?.imageKey
      if (modelConfig.id.startsWith('kling-') && imageKey) {
        modelInput = {
          ...(modelConfig.apiSettings?.baseInput || {}),
          [imageKey]: imageAUrl,
          end_image: imageBUrl,
          prompt: processedPrompt || '',
        }
        logger.info('[I2V BG] Prepared Replicate input for Kling morphing', {
          telegramId,
          inputKeys: Object.keys(modelInput),
        })
      } else {
        modelInput = {
          ...(modelConfig.apiSettings?.baseInput || {}),
          image_a: imageAUrl,
          image_b: imageBUrl,
          prompt: processedPrompt || '',
        }
        logger.info('[I2V BG] Prepared Replicate input for generic morphing', {
          telegramId,
          inputKeys: Object.keys(modelInput),
        })
      }
    } else {
      if (!imageUrl || !processedPrompt || !modelConfig.apiSettings?.imageKey) {
        logger.error('[I2V BG] Internal validation failed (standard mode)', {
          telegramId,
        })
        throw new Error(
          'Internal validation failed (standard mode) after balance check'
        )
      }

      // Специальная обработка для Google Veo 3 моделей (используем План А/Б)
      if (modelConfig.id === 'veo3' || modelConfig.id === 'veo3_fast') {
        // Флаг для переключения планов: true = План А (сервер), false = План Б (локальный)
        // ✅ FIX: PLAN A отключен - endpoint /api/v1/veo/generate не существует
        // Webhook-first система работает корректно через Plan B
        const USE_PLAN_A = false // PLAN A disabled - endpoint doesn't exist

        logger.info(`[I2V BG] Veo model detected, using Plan A/B system`, {
          telegramId,
          modelId: modelConfig.id,
          aspectRatio: userAspectRatio,
          hasImage: !!imageUrl,
        })

        // ПЛАН А: Сначала пробуем через наш сервер
        if (USE_PLAN_A) {
          logger.info('[PLAN A] Trying server first for Veo model', {
            modelId: modelConfig.id,
            serverUrl: PUBLIC_URL,
          })

          try {
            const baseUrl = PUBLIC_URL

            // Проверяем доступность сервера (пропускаем localhost для тестов)
            if (
              baseUrl &&
              baseUrl !== 'undefined' &&
              !baseUrl.includes('localhost')
            ) {
              const url = `${baseUrl}/api/v1/veo/generate`

              const requestBody = {
                model: modelConfig.id === 'veo3_fast' ? 'veo3_fast' : 'veo3',
                prompt: processedPrompt || '',
                imageUrl: imageUrl,
                aspectRatio: userAspectRatio || '9:16',
                enableFallback: false,
                enableTranslation: true,
                telegram_id: telegramId,
                username: username || 'unknown',
                is_ru: isRu || false,
                bot_name: botName || 'unknown',
              }

              logger.info('[PLAN A] ТОЧНЫЙ ЗАПРОС НА СЕРВЕР:', {
                url,
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'x-secret-key': SECRET_API_KEY ? 'PRESENT' : 'MISSING',
                },
                requestBody: {
                  ...requestBody,
                  prompt: `[PROMPT LENGTH: ${processedPrompt?.length || 0} chars]`,
                  imageUrl: imageUrl ? 'PRESENT' : 'MISSING',
                },
                serverBaseUrl: baseUrl,
              })

              const response = await axios.post(url, requestBody, {
                headers: {
                  'Content-Type': 'application/json',
                  'x-secret-key': SECRET_API_KEY,
                },
                timeout: 10000, // 10 секунд таймаут для проверки сервера
              })

              logger.info('[PLAN A] Server response received', {
                status: response.status,
                success: response.data.success,
                hasJobId: !!response.data.jobId,
                hasVideoUrl: !!response.data.videoUrl,
              })

              // Если сервер ответил успешно с videoUrl - обрабатываем видео
              if (response.data.success && response.data.videoUrl) {
                logger.info(
                  '[PLAN A] Server returned video URL - processing video',
                  {
                    telegramId,
                    videoUrl: response.data.videoUrl,
                  }
                )

                // Скачиваем видео с сервера
                const videoUrl = response.data.videoUrl
                const videoBuffer = await downloadFileHelper(videoUrl)
                logger.info('[PLAN A] Video downloaded from server', {
                  telegramId,
                  url: videoUrl,
                })

                // Сохраняем видео локально
                const dirPath = path.join(
                  UPLOADS_DIR,
                  String(telegramId),
                  'image-to-video'
                )
                await mkdir(dirPath, { recursive: true })
                const timestamp = Date.now()
                const uniqueFilename = `${timestamp}_server_video.mp4`
                localVideoPath = path.join(dirPath, uniqueFilename)
                const u8 = new Uint8Array(videoBuffer)
                await writeFile(localVideoPath, u8)
                logger.info('[PLAN A] Video saved locally from server', {
                  telegramId,
                  path: localVideoPath,
                })

                // Сохраняем информацию о видео в БД
                await saveVideoUrlHelper(
                  telegramId,
                  videoUrl,
                  localVideoPath,
                  modelId
                )
                logger.info('[PLAN A] Video info saved to DB from server', {
                  telegramId,
                })

                // Снимаем деньги ТОЛЬКО после успешного получения видео
                const deductSuccess = await deductBalanceAfterSuccess(
                  telegramId,
                  modelId,
                  botName,
                  balanceResult.paymentAmount || 0,
                  'image_to_video'
                )

                if (!deductSuccess) {
                  logger.error(
                    '[PLAN A] Failed to deduct payment after successful video generation',
                    {
                      telegramId,
                      modelId,
                      paymentAmount: balanceResult.paymentAmount,
                    }
                  )
                  // Все равно отправляем видео, но логируем ошибку
                } else {
                  logger.info(
                    '[PLAN A] Payment deducted after successful video generation',
                    {
                      telegramId,
                      modelId,
                      paymentAmount: balanceResult.paymentAmount,
                    }
                  )
                }

                // Отправляем видео пользователю
                const caption = isRu
                  ? `✨ Ваше видео (${modelConfig.name}) готово через сервер!\n💰 Списано: ${paymentAmountForNotification} ✨\n💎 Остаток: ${newBalanceForNotification} ✨`
                  : `✨ Your video (${modelConfig.name}) is ready via server!\n💰 Cost: ${paymentAmountForNotification} ✨\n💎 Balance: ${newBalanceForNotification} ✨`

                await telegramInstance.sendVideo(
                  chatId,
                  { source: localVideoPath },
                  { caption }
                )

                // Отправляем видео в pulse канал (Plan A)
                try {
                  const { sendMediaToPulse } = await import('@/helpers/pulse')
                  await sendMediaToPulse({
                    mediaType: 'video',
                    mediaSource: videoUrl,
                    telegramId: telegramId,
                    username: username,
                    language: isRu ? 'ru' : 'en',
                    serviceType: modelConfig.name,
                    prompt: processedPrompt || '',
                    botName: botName,
                    additionalInfo: {
                      Model: modelConfig.name,
                      Price: `${paymentAmountForNotification} stars`,
                      'Generation Type': 'Image to Video (Plan A)',
                    },
                  })

                  logger.info('[PLAN A] Video sent to pulse channel', {
                    telegramId,
                    modelId: modelConfig.id,
                    videoUrl,
                  })
                } catch (pulseError) {
                  logger.error(
                    '[PLAN A] Error sending to pulse channel:',
                    pulseError
                  )
                }

                // Добавляем финальные кнопки
                logger.info(
                  '[PLAN A] Sending final buttons to user after server video',
                  { telegramId }
                )

                const keyboard = Markup.keyboard([
                  [isRu ? '🎬 Новое видео' : '🎬 New Video'],
                  [isRu ? '🏠 Главное меню' : '🏠 Main Menu'],
                ]).resize()

                await telegramInstance.sendMessage(
                  chatId,
                  isRu
                    ? 'Ваше видео готово! Что дальше?'
                    : 'Your video is ready! What next?',
                  keyboard
                )
                return // Выходим из функции, так как видео уже отправлено
              }

              // Если сервер ответил success но без videoUrl - переходим к плану Б
              if (response.data.success && !response.data.videoUrl) {
                logger.warn(
                  '[PLAN A] Server success but no videoUrl - switching to PLAN B',
                  {
                    telegramId,
                    hasJobId: !!response.data.jobId,
                  }
                )
                // Продолжаем к плану Б
              }
            }
          } catch (serverError) {
            // Сервер недоступен, переключаемся на План Б
            const errorMessage =
              serverError instanceof Error
                ? serverError.message
                : 'Server unavailable'

            // ДЕТАЛЬНАЯ ДИАГНОСТИКА ОШИБКИ СЕРВЕРА
            if (isAxiosError(serverError)) {
              logger.error('[PLAN A] ДЕТАЛИ ОШИБКИ СЕРВЕРА:', {
                status: serverError.response?.status,
                statusText: serverError.response?.statusText,
                data: serverError.response?.data,
                url: serverError.config?.url,
                code: serverError.code,
                message: serverError.message,
                fullError: JSON.stringify(
                  serverError.response?.data || {},
                  null,
                  2
                ),
              })
            }

            logger.warn('[PLAN A] Server failed, switching to PLAN B', {
              error: errorMessage,
              modelId: modelConfig.id,
            })

            // Уведомляем админа о проблеме с сервером
            await notifyAdminAboutServerIssue(
              errorMessage,
              telegramId,
              modelConfig.id
            )
          }
        } else {
          // План А отключен, сразу переходим к Плану Б
          logger.info('[PLAN A] Skipped - going directly to PLAN B', {
            modelId: modelConfig.id,
          })
        }

        // ПЛАН Б: Используем прямую интеграцию с API Veo 3
        logger.info('[PLAN B] Using direct Veo 3 API', {
          modelId: modelConfig.id,
          aspectRatio: userAspectRatio,
          hasImage: !!imageUrl,
          telegramId,
          username,
        })

        // Уведомляем пользователя о переходе к Плану Б
        // M-Admin: План Б активирован - прямой API Veo 3
        logger.info('[M-Admin] 🔄 Plan B activated - using direct Veo 3 API', {
          telegramId,
          modelId,
          userAspectRatio,
        })

        // Импортируем KieAiProvider
        const { KieAiProvider } = await import(
          '@/services/video-providers/KieAiProvider'
        )
        const kieProvider = new KieAiProvider()

        // Преобразуем aspectRatio в формат Kie.ai
        const kieAspectRatio = userAspectRatio as
          | '16:9'
          | '9:16'
          | '1:1'
          | undefined

        logger.info('[PLAN B] Calling Veo 3 generateVideo with params:', {
          model: modelConfig.id,
          promptLength: processedPrompt?.length || 0,
          aspectRatio: kieAspectRatio || '9:16',
          hasImage: !!imageUrl,
        })

        // M-Admin: Начинаем генерацию видео через Kie.ai
        logger.info('[M-Admin] 🎬 Starting video generation via Kie.ai', {
          telegramId,
          modelId: modelConfig.id,
          modelTitle: modelConfig.name,
          prompt: processedPrompt?.substring(0, 100) + '...',
          aspectRatio: kieAspectRatio,
          hasImage: !!imageUrl,
        })

        // Проверяем наличие изображения перед отправкой в Kie.ai
        if (!imageUrl) {
          logger.error(
            '[PLAN B] CRITICAL ERROR: No image URL provided for image-to-video generation',
            {
              telegramId,
              modelId: modelConfig.id,
              prompt: processedPrompt || 'no prompt',
            }
          )

          await telegramInstance.sendMessage(
            chatId,
            isRu
              ? `❌ Ошибка: Для генерации видео из изображения необходимо предоставить изображение!`
              : `❌ Error: Image is required for image-to-video generation!`
          )

          // NO refund here: nothing has been deducted at this point.
          // checkBalanceVideoOperationHelper is check-only, and billing is
          // centralized on the delivered-success branches. The MONEY_INCOME
          // "refund" that used to live here credited stars that were never
          // charged (free money).
          return
        }

        // Генерируем видео через Kie.ai
        logger.info('[PLAN B] Sending request to Kie.ai:', {
          model: modelConfig.id,
          prompt: processedPrompt
            ? `${processedPrompt.substring(0, 100)}...`
            : 'no prompt',
          aspectRatio: kieAspectRatio || '9:16',
          hasImageUrl: !!imageUrl,
          imageUrl: imageUrl ? `${imageUrl.substring(0, 100)}...` : 'no image',
        })

        const kieResponse = await kieProvider.generateVideo({
          model: modelConfig.id,
          prompt: processedPrompt || '',
          aspectRatio: kieAspectRatio || '9:16',
          imageUrl: imageUrl,
          telegram_id: telegramId, // ✅ Передаём telegram_id для callback URL
        })

        logger.info('[PLAN B] Veo 3 API response received:', {
          success: kieResponse.success,
          hasData: !!kieResponse.data,
          hasVideoUrl: !!kieResponse.data?.videoUrl,
          hasTaskId: !!kieResponse.data?.taskId,
          taskId: kieResponse.data?.taskId,
          error: kieResponse.error,
        })

        if (kieResponse.success) {
          if (kieResponse.data?.videoUrl) {
            // Видео готово сразу - обрабатываем его
            const videoUrl = kieResponse.data.videoUrl
            const videoBuffer = await downloadFileHelper(videoUrl)
            logger.info('[I2V BG] Video downloaded from Plan B', {
              telegramId,
              url: videoUrl,
            })

            const dirPath = path.join(
              UPLOADS_DIR,
              String(telegramId),
              'image-to-video'
            )
            await mkdir(dirPath, { recursive: true })
            const timestamp = Date.now()
            const uniqueFilename = `${timestamp}_video.mp4`
            localVideoPath = path.join(dirPath, uniqueFilename)
            const u8 = new Uint8Array(videoBuffer)
            await writeFile(localVideoPath, u8)
            logger.info('[I2V BG] Video saved locally from Plan B', {
              telegramId,
              path: localVideoPath,
            })

            await saveVideoUrlHelper(
              telegramId,
              videoUrl,
              localVideoPath,
              modelId
            )
            logger.info('[I2V BG] Video info saved to DB', { telegramId })

            const caption = isRu
              ? `✨ Ваше видео (${modelConfig.name}) готово!\n💰 Списано: ${paymentAmountForNotification} ✨\n💎 Остаток: ${newBalanceForNotification} ✨`
              : `✨ Your video (${modelConfig.name}) is ready!\n💰 Cost: ${paymentAmountForNotification} ✨\n💎 Balance: ${newBalanceForNotification} ✨`

            // Логируем для админа, что видео было создано через Plan B
            logger.info(
              '[M-Admin] 🎬 Video successfully generated via Plan B',
              {
                telegramId,
                modelId: modelConfig.id,
                videoUrl: videoUrl.substring(0, 100) + '...',
              }
            )

            await telegramInstance.sendVideo(
              chatId,
              { source: localVideoPath },
              { caption }
            )

            // Billing is centralized in this module: charge only after the
            // video is actually delivered (mirrors the veo3 polling branch).
            // The caller no longer charges unconditionally.
            const deductSuccess = await deductBalanceAfterSuccess(
              telegramId,
              modelId,
              botName,
              balanceResult.paymentAmount || 0,
              'image_to_video'
            )
            if (!deductSuccess) {
              // The video was already delivered above, so a silent charge failure
              // is a free generation (house loss). We can't un-deliver, but surface
              // it instead of discarding the result (mirrors the PLAN A branch).
              logger.error(
                '[PLAN B] Failed to deduct payment after successful video generation',
                {
                  telegramId,
                  modelId,
                  paymentAmount: balanceResult.paymentAmount,
                }
              )
            }

            // Отправляем видео в pulse канал (Plan B - direct)
            try {
              const { sendMediaToPulse } = await import('@/helpers/pulse')
              await sendMediaToPulse({
                mediaType: 'video',
                mediaSource: videoUrl,
                telegramId: telegramId,
                username: username,
                language: isRu ? 'ru' : 'en',
                serviceType: modelConfig.name,
                prompt: processedPrompt || '',
                botName: botName,
                additionalInfo: {
                  Model: modelConfig.name,
                  Price: `${paymentAmountForNotification} stars`,
                  'Generation Type': 'Image to Video (Plan B - Direct)',
                },
              })

              logger.info('[PLAN B] Video sent to pulse channel (direct)', {
                telegramId,
                modelId: modelConfig.id,
                videoUrl,
              })
            } catch (pulseError) {
              logger.error(
                '[PLAN B] Error sending to pulse channel:',
                pulseError
              )
            }

            // Добавляем финальные кнопки
            logger.info('[I2V BG] Sending final buttons to user', {
              telegramId,
            })

            const keyboard = Markup.keyboard([
              [isRu ? '🎬 Новое видео' : '🎬 New Video'],
              [isRu ? '🏠 Главное меню' : '🏠 Main Menu'],
            ]).resize()

            await telegramInstance.sendMessage(
              chatId,
              isRu
                ? 'Ваше видео готово! Что дальше?'
                : 'Your video is ready! What next?',
              keyboard
            )
            return // Выходим из функции, так как видео уже отправлено
          } else if (kieResponse.data?.taskId) {
            // Если есть taskId, но нет videoUrl - видео еще генерируется
            logger.info('[I2V BG] Plan B: Starting job polling for taskId', {
              telegramId,
              taskId: kieResponse.data.taskId,
            })

            // Реализуем polling для Kie.ai API
            const taskId = kieResponse.data.taskId

            // ✅ FIX: Сохраняем taskId в новый кеш для предотвращения дублирующихся запросов
            videoTaskCache.addTask(
              telegramId,
              modelId,
              taskId,
              processedPrompt || prompt || '',
              imageUrl || undefined
            )
            logger.info('[I2V BG] ✅ TaskId saved to cache for deduplication', {
              telegramId,
              taskId,
              modelId,
            })

            // ✅ FIX: Save taskId to session so "Update status" button works
            if (ctx && ctx.session) {
              ctx.session.videoJobId = taskId
              ctx.session.videoPrompt = processedPrompt || prompt || ''
              ctx.session.videoModelId = modelId as any
              ctx.session.videoMessageId = 0 // Will be updated later
              logger.info(
                '[I2V BG] ✅ Saved taskId to session for status updates',
                {
                  telegramId,
                  taskId,
                  sessionHasContext: !!ctx.session,
                }
              )
            } else {
              logger.warn(
                '[I2V BG] ⚠️ Cannot save taskId - ctx or session missing',
                {
                  telegramId,
                  taskId,
                  hasCtx: !!ctx,
                  hasSession: !!ctx?.session,
                }
              )
            }

            // ✅ FIX: Увеличено время polling - видео генерируется ~70 секунд
            // Webhook все равно основной способ, но polling теперь резервный с адекватным таймаутом
            const maxPollingAttempts = 120 // 120 попыток = ~240 секунд (4 минуты)
            const pollingInterval = 2000 // 2 секунды между проверками

            let attempts = 0
            let lastProgressMessage = ''

            // M-Admin: Начато polling для отслеживания статуса генерации
            logger.info(
              '[M-Admin] 🎬 Started polling for video generation status',
              {
                telegramId,
                taskId,
                maxPollingAttempts,
                pollingInterval,
                estimatedTime: '~10 minutes',
              }
            )

            // Idempotency guard: a completed task can re-enter this poll loop
            // if a post-charge delivery step throws (caught below by
            // catch(pollError), which continues the loop). Charge at most once.
            let charged = false
            while (attempts < maxPollingAttempts) {
              attempts++

              try {
                // Проверяем статус задачи
                const statusResponse =
                  await kieProvider.checkVideoStatus(taskId)

                logger.info(
                  `[I2V BG] Plan B polling attempt ${attempts}/${maxPollingAttempts}`,
                  {
                    telegramId,
                    taskId,
                    success: statusResponse.success,
                    hasVideoUrl: !!statusResponse.data?.videoUrl,
                    error: statusResponse.error,
                  }
                )

                // Проверяем на ошибки генерации
                if (!statusResponse.success) {
                  // Ошибка генерации (например, unsafe image upload)
                  const errorMessage =
                    statusResponse.error || 'Unknown generation error'

                  logger.error('[I2V BG] Plan B: Video generation failed', {
                    telegramId,
                    taskId,
                    error: errorMessage,
                    attempts,
                  })

                  // ✅ FIX: Очищаем кеш при ошибке генерации
                  videoTaskCache.removeTask(telegramId, modelId)
                  logger.info('[I2V BG] 🧹 Cache cleaned on error', {
                    telegramId,
                    taskId,
                    modelId,
                    error: errorMessage,
                  })

                  // Создаем клавиатуру для ошибки
                  const errorKeyboard = Markup.keyboard([
                    [isRu ? '🎬 Попробовать снова' : '🎬 Try Again'],
                    [isRu ? '🏠 Главное меню' : '🏠 Main Menu'],
                  ])
                    .resize()
                    .oneTime()

                  // Уведомляем пользователя об ошибке
                  const { getBotByName } = await import('@/core/bot')
                  const botResult = getBotByName('neuro_blogger_bot')

                  if (botResult.bot) {
                    const errorMessage = isRu
                      ? `❌ Ошибка генерации видео: ${statusResponse.error || 'Unknown generation error'}\n\n${
                          statusResponse.error?.includes('English prompts')
                            ? '🔤 Пожалуйста, используйте английский язык для промпта.\n💰 Деньги НЕ были списаны.'
                            : 'Попробуйте другое изображение или измените промпт.'
                        }`
                      : `❌ Video generation error: ${statusResponse.error || 'Unknown generation error'}\n\n${
                          statusResponse.error?.includes('English prompts')
                            ? '🔤 Please use English language for prompts.\n💰 No money was charged.'
                            : 'Try a different image or modify the prompt.'
                        }`

                    // Используем безопасную отправку с проверкой блокировки
                    await safeSendMessage(ctx, errorMessage)
                  }
                  return // Выходим из функции
                }

                if (statusResponse.success && statusResponse.data?.videoUrl) {
                  // Видео готово! Обрабатываем результат
                  logger.info('[I2V BG] Plan B: Video is ready!', {
                    telegramId,
                    taskId,
                    videoUrl: statusResponse.data.videoUrl,
                  })

                  // M-Admin: Видео успешно сгенерировано
                  logger.info(
                    '[M-Admin] ✅ Video successfully generated via Plan B',
                    {
                      telegramId,
                      taskId,
                      totalAttempts: attempts,
                      videoUrl: statusResponse.data.videoUrl,
                      generationTime:
                        (attempts * pollingInterval) / 1000 + ' seconds',
                    }
                  )

                  // Уведомляем админа об успешном завершении Plan B
                  await notifyAdminAboutPlanBSuccess(
                    telegramId,
                    modelConfig.id,
                    taskId,
                    statusResponse.data.videoUrl
                  )

                  // Скачиваем и обрабатываем видео
                  const videoUrl = statusResponse.data.videoUrl
                  const videoBuffer = await downloadFileHelper(videoUrl)
                  logger.info('[I2V BG] Video downloaded from Plan B polling', {
                    telegramId,
                    url: videoUrl,
                  })

                  // Сохраняем видео локально
                  const dirPath = path.join(
                    UPLOADS_DIR,
                    String(telegramId),
                    'image-to-video'
                  )
                  await mkdir(dirPath, { recursive: true })
                  const timestamp = Date.now()
                  const uniqueFilename = `${timestamp}_plan_b_polling.mp4`
                  localVideoPath = path.join(dirPath, uniqueFilename)
                  const u8 = new Uint8Array(videoBuffer)
                  await writeFile(localVideoPath, u8)
                  logger.info(
                    '[I2V BG] Video saved locally from Plan B polling',
                    {
                      telegramId,
                      path: localVideoPath,
                    }
                  )

                  // Сохраняем информацию о видео в БД
                  await saveVideoUrlHelper(
                    telegramId,
                    videoUrl,
                    localVideoPath,
                    modelId
                  )
                  logger.info(
                    '[I2V BG] Video info saved to DB from Plan B polling',
                    { telegramId }
                  )

                  // Снимаем деньги ТОЛЬКО после успешного получения видео
                  let deductSuccess = true
                  if (!charged) {
                    deductSuccess = await deductBalanceAfterSuccess(
                      telegramId,
                      modelId,
                      botName,
                      balanceResult.paymentAmount || 0,
                      'image_to_video'
                    )
                    if (deductSuccess) charged = true
                  }

                  if (!deductSuccess) {
                    logger.error(
                      '[I2V BG] Failed to deduct payment after successful video generation',
                      {
                        telegramId,
                        modelId,
                        paymentAmount: balanceResult.paymentAmount,
                      }
                    )
                    // Все равно отправляем видео, но логируем ошибку
                  } else {
                    logger.info(
                      '[I2V BG] Payment deducted after successful video generation',
                      {
                        telegramId,
                        modelId,
                        paymentAmount: balanceResult.paymentAmount,
                      }
                    )
                  }

                  // Обновляем значения для уведомления
                  paymentAmountForNotification =
                    balanceResult.paymentAmount || 0
                  newBalanceForNotification =
                    balanceResult.currentBalance -
                    (balanceResult.paymentAmount || 0)

                  // Отправляем видео пользователю
                  const caption = isRu
                    ? `✨ Ваше видео (${modelConfig.name}) готово!\n💰 Списано: ${paymentAmountForNotification} ✨\n💎 Остаток: ${newBalanceForNotification} ✨`
                    : `✨ Your video (${modelConfig.name}) is ready!\n💰 Cost: ${paymentAmountForNotification} ✨\n💎 Balance: ${newBalanceForNotification} ✨`

                  // Логируем для админа, что видео было создано через Plan B polling
                  logger.info(
                    '[M-Admin] 🎬 Video successfully generated via Plan B polling',
                    {
                      telegramId,
                      modelId: modelConfig.id,
                      taskId,
                      videoUrl: videoUrl.substring(0, 100) + '...',
                    }
                  )

                  // Уведомляем админа об успешном завершении Plan B polling
                  await notifyAdminAboutPlanBSuccess(
                    telegramId,
                    modelConfig.id,
                    taskId,
                    videoUrl
                  )

                  try {
                    await telegramInstance.sendVideo(
                      chatId,
                      { source: localVideoPath },
                      { caption }
                    )
                  } catch (sendError) {
                    // Delivery failed after the one-time charge. Stop polling so
                    // the loop cannot re-enter and re-charge/re-send the same
                    // completed task. Refunding the single charged-but-
                    // undelivered video is an add-credit path, left for owner
                    // review rather than done here.
                    logger.error(
                      '[I2V BG] sendVideo failed after charge; stopping poll',
                      {
                        telegramId,
                        taskId,
                        error:
                          sendError instanceof Error
                            ? sendError.message
                            : String(sendError),
                      }
                    )
                    return
                  }

                  // Отправляем видео в pulse канал (Plan B - polling)
                  try {
                    const { sendMediaToPulse } = await import('@/helpers/pulse')
                    await sendMediaToPulse({
                      mediaType: 'video',
                      mediaSource: videoUrl,
                      telegramId: telegramId,
                      username: username,
                      language: isRu ? 'ru' : 'en',
                      serviceType: modelConfig.name,
                      prompt: processedPrompt || '',
                      botName: botName,
                      additionalInfo: {
                        Model: modelConfig.name,
                        Price: `${paymentAmountForNotification} stars`,
                        'Generation Type': 'Image to Video (Plan B - Polling)',
                        'Task ID': taskId,
                        'Polling Attempts': attempts.toString(),
                      },
                    })

                    logger.info(
                      '[PLAN B] Video sent to pulse channel (polling)',
                      {
                        telegramId,
                        modelId: modelConfig.id,
                        taskId,
                        videoUrl,
                      }
                    )
                  } catch (pulseError) {
                    logger.error(
                      '[PLAN B] Error sending to pulse channel (polling):',
                      pulseError
                    )
                  }

                  // Добавляем финальные кнопки
                  logger.info(
                    '[I2V BG] Sending final buttons after Plan B polling',
                    { telegramId }
                  )

                  const keyboard = Markup.keyboard([
                    [isRu ? '🎬 Новое видео' : '🎬 New Video'],
                    [isRu ? '🏠 Главное меню' : '🏠 Main Menu'],
                  ]).resize()

                  await telegramInstance.sendMessage(
                    chatId,
                    isRu
                      ? 'Ваше видео готово! Что дальше?'
                      : 'Your video is ready! What next?',
                    keyboard
                  )

                  // ✅ FIX: Очищаем кеш после успешной генерации и отправки видео
                  videoTaskCache.removeTask(telegramId, modelId)
                  logger.info('[I2V BG] 🧹 Cache cleaned on success', {
                    telegramId,
                    taskId,
                    modelId,
                    videoUrl: videoUrl.substring(0, 50) + '...',
                  })

                  // Consume the "Update status" button: this poll set
                  // ctx.session.videoJobId=taskId up front (so the button worked
                  // while polling) and has now delivered AND charged inline. If
                  // videoJobId stays armed, a later tap runs handleVideoReady,
                  // whose claimVideoJobDelivery(taskId) is UNCLAIMED (this poll
                  // charges via deductBalanceAfterSuccess, a different path that
                  // never populates that Set) and charges a SECOND time for the
                  // same taskId. Clearing it makes the button a no-op after
                  // inline delivery, exactly as handleTextToVideoDirect does on
                  // its terminal paths.
                  if (ctx?.session) {
                    delete ctx.session.videoJobId
                    delete ctx.session.videoModelId
                    delete ctx.session.videoPrompt
                  }

                  return // Выходим из функции, так как видео уже отправлено
                }

                // Отправляем уведомление о прогрессе каждые 15 попыток (30 секунд)
                if (attempts % 15 === 0 && attempts > 0) {
                  const progressPercent = Math.round(
                    (attempts / maxPollingAttempts) * 100
                  )
                  const progressMessage = isRu
                    ? `⏳ Видео генерируется... (${progressPercent}%)`
                    : `⏳ Video is being generated... (${progressPercent}%)`

                  if (progressMessage !== lastProgressMessage) {
                    // M-Admin: Прогресс генерации видео через Plan B
                    logger.info(
                      '[M-Admin] ⏳ Video generation progress (Plan B)',
                      {
                        telegramId,
                        taskId,
                        attempt: attempts,
                        progress: progressPercent + '%',
                        remainingAttempts: maxPollingAttempts - attempts,
                      }
                    )
                    lastProgressMessage = progressMessage
                  }
                }

                // Ждем перед следующей проверкой
                if (attempts < maxPollingAttempts) {
                  await new Promise(resolve =>
                    setTimeout(resolve, pollingInterval)
                  )
                }
              } catch (pollError: any) {
                // Проверяем, заблокировал ли пользователь бота
                if (
                  pollError?.message?.includes('bot was blocked') ||
                  pollError?.message?.includes('Forbidden') ||
                  pollError?.response?.error_code === 403
                ) {
                  markUserAsBlocked(telegramId)
                  logger.info('[I2V BG] User blocked bot, stopping polling', {
                    telegramId,
                    taskId,
                    attempt: attempts,
                  })

                  // Прекращаем polling для заблокированного пользователя
                  return
                }

                logger.error('[I2V BG] Plan B polling error', {
                  telegramId,
                  taskId,
                  attempt: attempts,
                  error:
                    pollError instanceof Error
                      ? pollError.message
                      : 'Unknown polling error',
                })

                // M-Admin: Ошибка при проверке статуса видео
                if (attempts % 5 === 0) {
                  // Каждые 5 попыток логируем ошибку
                  logger.warn('[M-Admin] ⚠️ Video status check error', {
                    telegramId,
                    taskId,
                    attempt: attempts,
                    error:
                      pollError instanceof Error
                        ? pollError.message
                        : 'Unknown polling error',
                    willRetry: attempts < maxPollingAttempts,
                  })
                }

                // Ждем перед следующей попыткой даже при ошибке
                if (attempts < maxPollingAttempts) {
                  await new Promise(resolve =>
                    setTimeout(resolve, pollingInterval)
                  )
                }
              }
            }

            // Если после всех попыток видео не готово
            logger.error('[I2V BG] Plan B polling timeout - video not ready', {
              telegramId,
              taskId,
              attempts,
              maxPollingAttempts,
            })

            // M-Admin: Превышено время ожидания генерации видео
            logger.error('[M-Admin] ❌ Video generation timeout via Plan B', {
              telegramId,
              taskId,
              attempts,
              maxPollingAttempts,
              totalTime: (attempts * pollingInterval) / 1000 + ' seconds',
              reason: 'Maximum polling attempts exceeded',
            })

            // Уведомляем пользователя о превышении времени ожидания
            const timeoutMessage = isRu
              ? `⏱️ Превышено время ожидания генерации видео (${(attempts * pollingInterval) / 1000} секунд).\n\n` +
                `🔄 Видео все еще генерируется. Task ID: ${taskId}\n` +
                `💡 Попробуйте проверить статус позже или создайте новое видео.\n` +
                `💰 Деньги НЕ были списаны.`
              : `⏱️ Video generation timeout exceeded (${(attempts * pollingInterval) / 1000} seconds).\n\n` +
                `🔄 Video is still being generated. Task ID: ${taskId}\n` +
                `💡 Try checking status later or create a new video.\n` +
                `💰 No money was charged.`

            await telegramInstance.sendMessage(chatId, timeoutMessage)

            throw new Error('Plan B polling timeout - video generation failed')
          }
        }

        // Если Plan B не сработал, продолжаем с обычным Replicate API
        logger.warn(
          '[I2V BG] Plan B failed, falling back to standard Replicate API',
          {
            telegramId,
            error: kieResponse.error,
          }
        )
      }

      // Специальная обработка для Seedance-1-Pro моделей
      else if (modelConfig.id === 'seedance-1-pro' && selectedResolution) {
        modelInput = {
          ...(modelConfig.apiSettings?.baseInput || {}), // ИСПРАВЛЕНИЕ: Включаем базовые параметры API
          prompt: processedPrompt,
          resolution: selectedResolution, // ИСПРАВЛЕНО: используем 'resolution' вместо 'target_resolution'
          [modelConfig.apiSettings?.imageKey || 'image']: imageUrl,
        }
        logger.info('[I2V BG] Seedance model input prepared:', {
          telegramId,
          resolution: selectedResolution, // ИСПРАВЛЕНО: логируем 'resolution'
          hasImage: !!imageUrl,
          imageKey: modelConfig.apiSettings?.imageKey,
          imageUrl: imageUrl, // Логируем URL изображения для отладки
          fullInput: modelInput, // Логируем полный input для отладки
        })
      }
      // Специальная обработка для WAN 2.2 I2V Fast модели
      else if (modelConfig.id === 'wan-2.2-i2v-fast') {
        // Определяем разрешение из выбора пользователя или aspect_ratio
        let wanResolution: string

        if (
          selectedResolution &&
          ['480p', '720p', '1080p'].includes(selectedResolution)
        ) {
          // Пользователь выбрал конкретное разрешение
          if (selectedResolution === '480p') {
            wanResolution = userAspectRatio === '16:9' ? '832x480' : '480x832'
          } else if (selectedResolution === '720p') {
            wanResolution = userAspectRatio === '16:9' ? '1280x720' : '720x1280'
          } else {
            // 1080p
            wanResolution =
              userAspectRatio === '16:9' ? '1920x1080' : '1080x1920'
          }
        } else {
          // Fallback: используем 720p по умолчанию с aspect_ratio
          wanResolution = userAspectRatio === '16:9' ? '1280x720' : '720x1280'
        }

        modelInput = {
          ...(modelConfig.apiSettings?.baseInput || {}),
          prompt: processedPrompt,
          target_resolution: wanResolution, // WAN использует специфичный формат
          [modelConfig.apiSettings?.imageKey || 'image']: imageUrl,
        }
        logger.info('[I2V BG] WAN 2.2 I2V model input prepared:', {
          telegramId,
          selectedResolution,
          userAspectRatio,
          wanResolution,
          hasImage: !!imageUrl,
          imageKey: modelConfig.apiSettings?.imageKey,
          fullInput: modelInput,
        })
      } else {
        // Стандартная обработка для остальных моделей
        modelInput = {
          ...(modelConfig.apiSettings?.baseInput || {}),
          prompt: processedPrompt,
          aspect_ratio: userAspectRatio,
          [modelConfig.apiSettings?.imageKey || 'image']: imageUrl,
        }
        logger.info('[I2V BG] Standard model input prepared:', {
          telegramId,
          modelId: modelConfig.id,
          inputKeys: Object.keys(modelInput),
        })
      }

      logger.info('[I2V BG] Prepared Replicate input for standard', {
        telegramId,
        inputKeys: Object.keys(modelInput),
      })
    }

    // ✅ FIX: Для моделей с provider: 'kie' используем KieAiProvider вместо Replicate
    let videoUrl: string | undefined // Объявляем переменную заранее для обоих веток

    if (modelConfig.provider === 'kie') {
      logger.info('[I2V BG] Using KieAiProvider for Sora I2V model', {
        modelId: modelConfig.id,
        telegramId,
        hasImageUrl: !!imageUrl,
        hasPrompt: !!processedPrompt,
      })

      // Импортируем KieAiProvider
      const { KieAiProvider } = await import(
        '@/services/video-providers/KieAiProvider'
      )
      const kieProvider = new KieAiProvider()

      // Преобразуем aspectRatio в формат Kie.ai
      const kieAspectRatio = userAspectRatio as
        | '16:9'
        | '9:16'
        | '1:1'
        | undefined

      logger.info('[I2V BG] Calling KieAiProvider.generateVideo for Sora I2V', {
        model: modelConfig.id,
        promptLength: processedPrompt?.length || 0,
        aspectRatio: kieAspectRatio || '9:16',
        hasImage: !!imageUrl,
        imageUrl: imageUrl ? `${imageUrl.substring(0, 100)}...` : 'no image',
      })

      // Генерируем видео через Kie.ai
      const kieResponse = await kieProvider.generateVideo({
        model: modelConfig.id,
        prompt: processedPrompt || '',
        aspectRatio: kieAspectRatio || '9:16',
        imageUrl: imageUrl,
        telegram_id: telegramId, // ✅ Передаём telegram_id для callback URL
      })

      logger.info('[I2V BG] KieAiProvider response received for Sora I2V', {
        success: kieResponse.success,
        hasData: !!kieResponse.data,
        hasVideoUrl: !!kieResponse.data?.videoUrl,
        hasTaskId: !!kieResponse.data?.taskId,
        taskId: kieResponse.data?.taskId,
        error: kieResponse.error,
      })

      if (!kieResponse.success || !kieResponse.data) {
        throw new Error(
          kieResponse.error || 'Kie.ai API returned no data for Sora I2V model'
        )
      }

      // Если видео готово сразу (синхронный ответ)
      if (kieResponse.data.videoUrl) {
        videoUrl = kieResponse.data.videoUrl
        const videoBuffer = await downloadFileHelper(videoUrl)
        logger.info('[I2V BG] Sora I2V video downloaded via KieAi', {
          telegramId,
          url: videoUrl,
        })

        const dirPath = path.join(
          UPLOADS_DIR,
          String(telegramId),
          'image-to-video'
        )
        await mkdir(dirPath, { recursive: true })
        const timestamp = Date.now()
        const uniqueFilename = `${timestamp}_video.mp4`
        localVideoPath = path.join(dirPath, uniqueFilename)
        const u8 = new Uint8Array(videoBuffer)
        await writeFile(localVideoPath, u8)
        logger.info('[I2V BG] Sora I2V video saved locally via KieAi', {
          telegramId,
          path: localVideoPath,
        })

        await saveVideoUrlHelper(telegramId, videoUrl, localVideoPath, modelId)
        logger.info('[I2V BG] Sora I2V video info saved to DB', { telegramId })
      }
      // ✅ WEBHOOK-ONLY: УБРАЛИ polling timeout! Полностью полагаемся на webhook
      else if (kieResponse.data.taskId) {
        const taskId = kieResponse.data.taskId

        logger.info(
          '[I2V BG] Sora I2V async generation started (WEBHOOK-ONLY)',
          {
            telegramId,
            taskId,
            isWebhookMode: true,
          }
        )

        // ✅ FIX: Сохраняем taskId в кеш для предотвращения дублирующихся запросов
        videoTaskCache.addTask(
          telegramId,
          modelId,
          taskId,
          processedPrompt || prompt || '',
          imageUrl || undefined
        )
        logger.info('[I2V BG] ✅ TaskId saved to cache for deduplication', {
          telegramId,
          taskId,
          modelId,
        })

        // The Kie webhook is the SINGLE charger for this path (it gets the task
        // via videoTaskStore.saveTask below). Do NOT arm ctx.session.videoJobId
        // here, and clear any stale one: with videoJobId armed the "Update status"
        // button polls and charges AGAIN via handleTextToVideoDirect's own
        // claimVideoJobDelivery Set — a separate idempotency Set the webhook never
        // populates — so a tap after webhook delivery double-debits and re-sends.
        // Cleared, the button takes the safe "webhook will deliver" branch. (The
        // poll path arms it only for its in-loop window and clears it after; this
        // webhook-only path has no such window.)
        if (ctx?.session) {
          delete ctx.session.videoJobId
          delete ctx.session.videoModelId
          delete ctx.session.videoPrompt
        }
        logger.info(
          '[I2V BG] Sora task queued; webhook will charge + deliver',
          {
            telegramId,
            taskId,
          }
        )

        // Give the webhook the task context it needs to CHARGE.
        //
        // The comment below is right that billing waits for the webhook — but
        // nothing saved the task, so the webhook always fell into direct mode
        // and charged with a literal model id that is not in the price table:
        // the video was delivered for free. Mirrors handleTextToVideoDirect.ts
        // (which saves the task for exactly this reason).
        videoTaskStore.saveTask(taskId, {
          telegramId: Number(telegramId) || 0,
          chatId: ctx?.chat?.id || Number(telegramId) || 0,
          messageId: ctx?.session?.videoMessageId || 0,
          prompt: processedPrompt || prompt || '',
          modelId,
          duration: 0, // not tracked on this path; the price comes from modelId
          createdAt: Date.now(),
          botName: ctx?.botInfo?.username,
        })

        // ✅ Снимаем деньги ТОЛЬКО после успешного получения видео через webhook
        // НЕ снимаем здесь! Ждем webhook!

        // ✅ ВЫХОДИМ - дальше все через webhook!
        // Сообщение уже отправлено в handleImageToVideoDirect.ts
        return
      } else {
        throw new Error(
          'Kie.ai API returned neither videoUrl nor taskId for Sora I2V model'
        )
      }

      // Пропускаем вызов replicate.run() для Kie.ai моделей
      logger.info('[I2V BG] Skipping replicate.run for Kie.ai model', {
        modelId: modelConfig.id,
        telegramId,
      })
    } else {
      // Для моделей БЕЗ provider: 'kie' используем стандартный Replicate API
      logger.info('[I2V BG] Calling replicate.run', {
        model: replicateModelId,
        telegramId,
      })
      const replicateResult = await replicate.run(replicateModelId as any, {
        input: modelInput,
      })
      logger.info('[I2V BG] replicate.run finished', { telegramId })

      // videoUrl уже объявлена выше
      if (
        Array.isArray(replicateResult) &&
        replicateResult.length > 0 &&
        typeof replicateResult[0] === 'string'
      ) {
        videoUrl = replicateResult[0]
      } else if (typeof replicateResult === 'string') {
        videoUrl = replicateResult
      } else {
        logger.error('[I2V BG] Failed to extract video URL from Replicate', {
          telegramId,
          replicateResult,
        })
        throw new Error(
          isRu
            ? 'Ошибка: Не удалось получить URL видео от Replicate'
            : 'Error: Failed to get video URL from Replicate'
        )
      }

      logger.info('[I2V BG] Video URL extracted', { telegramId, videoUrl })

      const videoBuffer = await downloadFileHelper(videoUrl)
      logger.info('[I2V BG] Video downloaded', { telegramId, url: videoUrl })

      const dirPath = path.join(
        UPLOADS_DIR,
        String(telegramId),
        'image-to-video'
      )
      await mkdir(dirPath, { recursive: true })
      const timestamp = Date.now()
      let baseFilename = 'video.mp4'
      try {
        baseFilename = path.basename(new URL(videoUrl).pathname)
      } catch (urlError) {
        logger.warn(
          '[I2V BG] Could not parse filename from URL, using default',
          {
            videoUrl,
            urlError,
          }
        )
      }
      const uniqueFilename = `${timestamp}_${baseFilename}`
      localVideoPath = path.join(dirPath, uniqueFilename)
      const u8 = new Uint8Array(videoBuffer)
      await writeFile(localVideoPath, u8)
      logger.info('[I2V BG] Video saved locally', {
        telegramId,
        path: localVideoPath,
      })

      await saveVideoUrlHelper(telegramId, videoUrl, localVideoPath, modelId)
      logger.info('[I2V BG] Video info saved to DB', { telegramId })
    } // Закрываем блок else для Replicate моделей

    logger.info('[I2V BG] Success, sending video', {
      telegramId,
      videoUrl,
      localVideoPath,
    })
    const caption = isRu
      ? `✨ Ваше видео (${modelConfig.name}) готово!\n💰 Списано: ${paymentAmountForNotification} ✨\n💎 Остаток: ${newBalanceForNotification} ✨`
      : `✨ Your video (${modelConfig.name}) is ready!\n💰 Cost: ${paymentAmountForNotification} ✨\n💎 Balance: ${newBalanceForNotification} ✨`

    await telegramInstance.sendVideo(
      chatId,
      { source: localVideoPath },
      { caption }
    )

    // Billing is centralized in this module: the standard-Replicate branch
    // previously relied on the caller's unconditional charge (which also fired
    // on failures). Charge here, only after the video is delivered.
    const deductSuccess = await deductBalanceAfterSuccess(
      telegramId,
      modelId,
      botName,
      balanceResult.paymentAmount || 0,
      'image_to_video'
    )
    if (!deductSuccess) {
      // Video already delivered above; a silent charge failure is a free
      // generation. Surface it instead of discarding the result (mirrors PLAN A).
      logger.error(
        '[Standard Replicate] Failed to deduct payment after successful video generation',
        {
          telegramId,
          modelId,
          paymentAmount: balanceResult.paymentAmount,
        }
      )
    }

    // Отправляем видео в pulse канал (Standard Replicate)
    try {
      const { sendMediaToPulse } = await import('@/helpers/pulse')
      await sendMediaToPulse({
        mediaType: 'video',
        mediaSource: videoUrl,
        telegramId: telegramId,
        username: username,
        language: isRu ? 'ru' : 'en',
        serviceType: modelConfig.name,
        prompt: processedPrompt || '',
        botName: botName,
        additionalInfo: {
          Model: modelConfig.name,
          Price: `${paymentAmountForNotification} stars`,
          'Generation Type': 'Image to Video (Standard Replicate)',
        },
      })

      logger.info('[I2V BG] Video sent to pulse channel (standard)', {
        telegramId,
        modelId: modelConfig.id,
        videoUrl,
      })
    } catch (pulseError) {
      logger.error(
        '[I2V BG] Error sending to pulse channel (standard):',
        pulseError
      )
    }

    // Добавляем финальные кнопки после успешной генерации видео
    logger.info('[I2V BG] Sending final buttons to user', { telegramId })

    const keyboard = Markup.keyboard([
      [isRu ? '🎬 Новое видео' : '🎬 New Video'],
      [isRu ? '🏠 Главное меню' : '🏠 Main Menu'],
    ]).resize()

    await telegramInstance.sendMessage(
      chatId,
      isRu
        ? 'Ваше видео готово! Что дальше?'
        : 'Your video is ready! What next?',
      keyboard
    )
  } catch (error: any) {
    logger.error('[I2V BG] General error in generateImageToVideo', {
      error: error?.message,
      stack: error?.stack,
      telegramId,
    })

    // Деньги не снимались заранее, поэтому возврат не требуется
    logger.warn(
      '[I2V BG] Image-to-video generation failed - no payment was deducted',
      {
        telegramId,
        modelId,
        error: error?.message,
      }
    )

    const errorMessage =
      error?.message ||
      (isRu ? 'Произошла неизвестная ошибка' : 'An unknown error occurred')

    // Уведомляем пользователя об ошибке и возврате средств
    const refundMessage = isRu
      ? ' Средства возвращены на ваш баланс.'
      : ' Funds have been refunded to your balance.'

    try {
      const fullErrorMessage = isRu
        ? `❌ Ошибка генерации видео: ${errorMessage}${refundMessage}`
        : `❌ Video generation error: ${errorMessage}${refundMessage}`

      // Усекаем сообщение, если оно слишком длинное для Telegram (4096 символов)
      const truncatedMessage =
        fullErrorMessage.length > 4000
          ? fullErrorMessage.substring(0, 4000) + '...'
          : fullErrorMessage

      await telegramInstance.sendMessage(chatId, truncatedMessage)
    } catch (sendError: any) {
      logger.error('[I2V BG] Failed to send error message to user', {
        originalError: error?.message,
        sendError: sendError?.message,
        telegramId,
      })
    }
  }
}
