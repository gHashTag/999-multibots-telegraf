import { mkdir, writeFile } from 'fs/promises'
import path from 'path'
import { Telegraf } from 'telegraf'
import { MyContext } from '@/interfaces'
import {
  VIDEO_MODELS_CONFIG,
  type VideoModelConfig,
} from '@/modules/videoGenerator/config/models.config'
import { logger } from '@/utils/logger'
import { replicate } from '@/core/replicate'
import {
  downloadFileHelper,
  getUserHelper,
  processBalanceVideoOperationHelper,
  saveVideoUrlHelper,
  updateUserLevelHelper,
} from './helpers'
import { updateUserBalance } from '@/core/supabase/updateUserBalance'
import { calculateFinalPrice } from '@/price/helpers'
import { PaymentType } from '@/interfaces/payments.interface'
import { Markup } from 'telegraf'
import axios from 'axios'
import { isAxiosError } from 'axios'
import { API_URL, SECRET_API_KEY } from '@/config'

// Функция для отправки уведомления админу
async function notifyAdminAboutServerIssue(
  error: string,
  telegram_id: string,
  videoModel: string
) {
  try {
    const adminIds = process.env.ADMIN_TELEGRAM_ID?.split(',') || ['144022504']
    const { getBotByName } = await import('@/core/bot')
    const botResult = getBotByName('neuro_blogger_bot')
    
    if (!botResult.bot) return
    
    const errorMessage = `🚨 **SERVER DOWN ALERT (I2V)**\n\n` +
      `📍 План Б АКТИВИРОВАН для Image to Video\n` +
      `👤 User: ${telegram_id}\n` +
      `🎬 Model: ${videoModel}\n` +
      `❌ Server Error: ${error}\n` +
      `✅ Используется прямой API Veo 3 (Plan B)\n\n` +
      `⚠️ Проверьте сервер: https://ai-server-production-production-8e2d.up.railway.app`
    
    for (const adminId of adminIds) {
      await botResult.bot.telegram.sendMessage(adminId, errorMessage, {
        parse_mode: 'Markdown'
      })
    }
    
    logger.warn('[ADMIN NOTIFICATION] Server issue reported to admins', {
      adminIds,
      error
    })
  } catch (notifyError) {
    logger.error('[ADMIN NOTIFICATION] Failed to notify admins', notifyError)
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
  selectedAspectRatio?: string // Добавлен параметр для соотношения сторон Kie.ai моделей
): Promise<void> => {
  let localVideoPath: string | undefined
  const notificationMessage = isRu
    ? 'Генерация видео...'
    : 'Generating video...'
  let paymentAmountForNotification: number | undefined
  let newBalanceForNotification: number | undefined

  try {
    const modelConfig = VIDEO_MODELS_CONFIG[modelId]
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
      hasPrompt: !!prompt,
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
      if (!modelConfig.canMorph) {
        await telegramInstance.sendMessage(
          chatId,
          isRu
            ? `❌ Модель ${modelConfig.title} не поддерживает морфинг.`
            : `❌ Model ${modelConfig.title} does not support morphing.`
        )
        return
      }
      logger.info('[I2V BG] Morphing mode validated', { telegramId })
    } else {
      if (!imageUrl || !prompt) {
        await telegramInstance.sendMessage(
          chatId,
          '❌ Ошибка: Изображение и промпт обязательны для стандартного режима.'
        )
        return
      }
      if (!modelConfig.imageKey) {
        await telegramInstance.sendMessage(
          chatId,
          `❌ Ошибка: Отсутствует imageKey для модели ${modelConfig.title}.`
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
    const userAspectRatio =
      selectedAspectRatio || (userExists.aspect_ratio ?? '9:16')

    const balanceResult = await processBalanceVideoOperationHelper(
      telegramId,
      modelId,
      isRu,
      botName,
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
    paymentAmountForNotification = balanceResult.paymentAmount
    newBalanceForNotification = balanceResult.newBalance
    logger.info('[I2V BG] Balance sufficient and deducted', {
      telegramId,
      paymentAmount: paymentAmountForNotification,
      newBalance: newBalanceForNotification,
    })

    const replicateModelId: string = modelConfig.api.model
    let modelInput: any = {}

    if (isMorphing) {
      if (modelConfig.id.startsWith('kling-') && modelConfig.imageKey) {
        modelInput = {
          ...modelConfig.api.input,
          [modelConfig.imageKey]: imageAUrl,
          end_image: imageBUrl,
          prompt: prompt || '',
        }
        logger.info('[I2V BG] Prepared Replicate input for Kling morphing', {
          telegramId,
          inputKeys: Object.keys(modelInput),
        })
      } else {
        modelInput = {
          ...modelConfig.api.input,
          image_a: imageAUrl,
          image_b: imageBUrl,
          prompt: prompt || '',
        }
        logger.info('[I2V BG] Prepared Replicate input for generic morphing', {
          telegramId,
          inputKeys: Object.keys(modelInput),
        })
      }
    } else {
      if (!imageUrl || !prompt || !modelConfig.imageKey) {
        logger.error('[I2V BG] Internal validation failed (standard mode)', {
          telegramId,
        })
        throw new Error(
          'Internal validation failed (standard mode) after balance check'
        )
      }

      // Специальная обработка для Google Veo 3 моделей (используем План А/Б)
      if (modelConfig.id === 'veo-3' || modelConfig.id === 'veo-3-fast') {
        // Флаг для переключения планов: true = План А (сервер), false = План Б (локальный)
        const USE_PLAN_A = process.env.USE_PLAN_A !== 'false' // По умолчанию true (План А), только если явно установлено 'false'

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
            serverUrl: API_URL
          })

          try {
          const baseUrl = API_URL
          
          // Проверяем доступность сервера (пропускаем localhost для тестов)
          if (baseUrl && baseUrl !== 'undefined' && !baseUrl.includes('localhost')) {
            const url = `${baseUrl}/api/v1/veo/generate`
            
            const requestBody = {
              model: modelConfig.id === 'veo-3-fast' ? 'veo3_fast' : 'veo3',
              prompt: prompt || '',
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
                prompt: `[PROMPT LENGTH: ${prompt?.length || 0} chars]`,
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
              logger.info('[PLAN A] Server returned video URL - processing video', {
                telegramId,
                videoUrl: response.data.videoUrl
              })

              // Скачиваем видео с сервера
              const videoUrl = response.data.videoUrl
              const videoBuffer = await downloadFileHelper(videoUrl)
              logger.info('[PLAN A] Video downloaded from server', { telegramId, url: videoUrl })

              // Сохраняем видео локально
              const dirPath = path.join('uploads', String(telegramId), 'image-to-video')
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
              await saveVideoUrlHelper(telegramId, videoUrl, localVideoPath, modelId)
              logger.info('[PLAN A] Video info saved to DB from server', { telegramId })

              // Отправляем видео пользователю
              const caption = isRu
                ? `✨ Ваше видео (${modelConfig.title}) готово через сервер!\n💰 Списано: ${paymentAmountForNotification} ✨\n💎 Остаток: ${newBalanceForNotification} ✨`
                : `✨ Your video (${modelConfig.title}) is ready via server!\n💰 Cost: ${paymentAmountForNotification} ✨\n💎 Balance: ${newBalanceForNotification} ✨`

              await telegramInstance.sendVideo(
                chatId,
                { source: localVideoPath },
                { caption }
              )

              // Добавляем финальные кнопки
              logger.info('[PLAN A] Sending final buttons to user after server video', { telegramId })

              const keyboard = Markup.keyboard([
                [
                  isRu
                    ? '✨ Создать еще (Изображение в Видео)'
                    : '✨ Create More (Image to Video)',
                ],
                [
                  isRu
                    ? '🖼 Выбрать другую модель (Видео)'
                    : '🖼 Select Another Model (Video)',
                ],
                [isRu ? '🏠 Главное меню' : '🏠 Main Menu'],
              ]).resize()

              await telegramInstance.sendMessage(
                chatId,
                isRu
                  ? 'Ваше видео готово через сервер! Что дальше?'
                  : 'Your video is ready via server! What next?',
                keyboard
              )
              return // Выходим из функции, так как видео уже отправлено
            }

            // Если сервер ответил success но без videoUrl - переходим к плану Б
            if (response.data.success && !response.data.videoUrl) {
              logger.warn('[PLAN A] Server success but no videoUrl - switching to PLAN B', {
                telegramId,
                hasJobId: !!response.data.jobId
              })
              // Продолжаем к плану Б
            }
          }
        } catch (serverError) {
          // Сервер недоступен, переключаемся на План Б
          const errorMessage = serverError instanceof Error ? serverError.message : 'Server unavailable'
          
          // ДЕТАЛЬНАЯ ДИАГНОСТИКА ОШИБКИ СЕРВЕРА
          if (isAxiosError(serverError)) {
            logger.error('[PLAN A] ДЕТАЛИ ОШИБКИ СЕРВЕРА:', {
              status: serverError.response?.status,
              statusText: serverError.response?.statusText,
              data: serverError.response?.data,
              url: serverError.config?.url,
              code: serverError.code,
              message: serverError.message,
              fullError: JSON.stringify(serverError.response?.data || {}, null, 2)
            })
          }
          
          logger.warn('[PLAN A] Server failed, switching to PLAN B', {
            error: errorMessage,
            modelId: modelConfig.id
          })
          
          // Уведомляем админа о проблеме с сервером
          await notifyAdminAboutServerIssue(errorMessage, telegramId, modelConfig.id)
        }
        } else {
          // План А отключен, сразу переходим к Плану Б
          logger.info('[PLAN A] Skipped - going directly to PLAN B', {
            modelId: modelConfig.id
          })
        }

        // ПЛАН Б: Используем прямую интеграцию с API Veo 3
        logger.info('[PLAN B] Using direct Veo 3 API', {
          modelId: modelConfig.id,
          aspectRatio: userAspectRatio,
          hasImage: !!imageUrl,
          telegramId,
          username
        })

        // Уведомляем пользователя о переходе к Плану Б
        await telegramInstance.sendMessage(
          chatId,
          isRu
            ? '🔄 План Б: Использую прямой API Veo 3...'
            : '🔄 Plan B: Using direct Veo 3 API...'
        )
        
        // Импортируем KieAiProvider
        const { KieAiProvider } = await import('@/services/video-providers/KieAiProvider')
        const kieProvider = new KieAiProvider()
        
        // Преобразуем aspectRatio в формат Kie.ai
        const kieAspectRatio = userAspectRatio as '16:9' | '9:16' | '1:1' | undefined
        
        logger.info('[PLAN B] Calling Veo 3 generateVideo with params:', {
          model: modelConfig.id,
          promptLength: prompt?.length || 0,
          aspectRatio: kieAspectRatio || '9:16',
          hasImage: !!imageUrl
        })

        // Уведомляем пользователя о начале генерации видео через План Б
        await telegramInstance.sendMessage(
          chatId,
          isRu
            ? `🎬 План Б: Генерирую видео через ${modelConfig.title}...`
            : `🎬 Plan B: Generating video via ${modelConfig.title}...`
        )
        
        // Генерируем видео через Kie.ai
        const kieResponse = await kieProvider.generateVideo({
          model: modelConfig.id,
          prompt: prompt || '',
          aspectRatio: kieAspectRatio || '9:16',
          imageUrl: imageUrl,
        })
        
        logger.info('[PLAN B] Veo 3 API response received:', {
          success: kieResponse.success,
          hasData: !!kieResponse.data,
          hasVideoUrl: !!kieResponse.data?.videoUrl,
          hasTaskId: !!kieResponse.data?.taskId,
          taskId: kieResponse.data?.taskId,
          error: kieResponse.error
        })
        
        if (kieResponse.success) {
          if (kieResponse.data?.videoUrl) {
            // Видео готово сразу - обрабатываем его
            const videoUrl = kieResponse.data.videoUrl
            const videoBuffer = await downloadFileHelper(videoUrl)
            logger.info('[I2V BG] Video downloaded from Plan B', { telegramId, url: videoUrl })
            
            const dirPath = path.join('uploads', String(telegramId), 'image-to-video')
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
            
            await saveVideoUrlHelper(telegramId, videoUrl, localVideoPath, modelId)
            logger.info('[I2V BG] Video info saved to DB', { telegramId })
            
            const caption = isRu
              ? `✨ Ваше видео (${modelConfig.title}) готово через План Б!\n💰 Списано: ${paymentAmountForNotification} ✨\n💎 Остаток: ${newBalanceForNotification} ✨`
              : `✨ Your video (${modelConfig.title}) is ready via Plan B!\n💰 Cost: ${paymentAmountForNotification} ✨\n💎 Balance: ${newBalanceForNotification} ✨`
            
            await telegramInstance.sendVideo(
              chatId,
              { source: localVideoPath },
              { caption }
            )
            
            // Добавляем финальные кнопки
            logger.info('[I2V BG] Sending final buttons to user', { telegramId })
            
            const keyboard = Markup.keyboard([
              [
                isRu
                  ? '✨ Создать еще (Изображение в Видео)'
                  : '✨ Create More (Image to Video)',
              ],
              [
                isRu
                  ? '🖼 Выбрать другую модель (Видео)'
                  : '🖼 Select Another Model (Video)',
              ],
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
              taskId: kieResponse.data.taskId
            })

            // Реализуем polling для Kie.ai API
            const taskId = kieResponse.data.taskId
            const maxPollingAttempts = 30 // 30 попыток = ~5 минут (10 сек * 30)
            const pollingInterval = 10000 // 10 секунд между проверками

            let attempts = 0
            let lastProgressMessage = ''

            while (attempts < maxPollingAttempts) {
              attempts++

              try {
                // Проверяем статус задачи
                const statusResponse = await kieProvider.checkVideoStatus(taskId)

                logger.info(`[I2V BG] Plan B polling attempt ${attempts}/${maxPollingAttempts}`, {
                  telegramId,
                  taskId,
                  success: statusResponse.success,
                  hasVideoUrl: !!statusResponse.data?.videoUrl,
                  error: statusResponse.error
                })

                if (statusResponse.success && statusResponse.data?.videoUrl) {
                  // Видео готово! Обрабатываем результат
                  logger.info('[I2V BG] Plan B: Video is ready!', {
                    telegramId,
                    taskId,
                    videoUrl: statusResponse.data.videoUrl
                  })

                  // Отправляем финальное уведомление о готовности
                  await telegramInstance.sendMessage(
                    chatId,
                    isRu
                      ? `✅ Видео готово через План Б!`
                      : `✅ Video is ready via Plan B!`
                  )

                  // Скачиваем и обрабатываем видео
                  const videoUrl = statusResponse.data.videoUrl
                  const videoBuffer = await downloadFileHelper(videoUrl)
                  logger.info('[I2V BG] Video downloaded from Plan B polling', { telegramId, url: videoUrl })

                  // Сохраняем видео локально
                  const dirPath = path.join('uploads', String(telegramId), 'image-to-video')
                  await mkdir(dirPath, { recursive: true })
                  const timestamp = Date.now()
                  const uniqueFilename = `${timestamp}_plan_b_polling.mp4`
                  localVideoPath = path.join(dirPath, uniqueFilename)
                  const u8 = new Uint8Array(videoBuffer)
                  await writeFile(localVideoPath, u8)
                  logger.info('[I2V BG] Video saved locally from Plan B polling', {
                    telegramId,
                    path: localVideoPath,
                  })

                  // Сохраняем информацию о видео в БД
                  await saveVideoUrlHelper(telegramId, videoUrl, localVideoPath, modelId)
                  logger.info('[I2V BG] Video info saved to DB from Plan B polling', { telegramId })

                  // Отправляем видео пользователю
                  const caption = isRu
                    ? `✨ Ваше видео (${modelConfig.title}) готово через План Б!\n💰 Списано: ${paymentAmountForNotification} ✨\n💎 Остаток: ${newBalanceForNotification} ✨`
                    : `✨ Your video (${modelConfig.title}) is ready via Plan B!\n💰 Cost: ${paymentAmountForNotification} ✨\n💎 Balance: ${newBalanceForNotification} ✨`

                  await telegramInstance.sendVideo(
                    chatId,
                    { source: localVideoPath },
                    { caption }
                  )

                  // Добавляем финальные кнопки
                  logger.info('[I2V BG] Sending final buttons after Plan B polling', { telegramId })

                  const keyboard = Markup.keyboard([
                    [
                      isRu
                        ? '✨ Создать еще (Изображение в Видео)'
                        : '✨ Create More (Image to Video)',
                    ],
                    [
                      isRu
                        ? '🖼 Выбрать другую модель (Видео)'
                        : '🖼 Select Another Model (Video)',
                    ],
                    [isRu ? '🏠 Главное меню' : '🏠 Main Menu'],
                  ]).resize()

                  await telegramInstance.sendMessage(
                    chatId,
                    isRu
                      ? 'Ваше видео готово через План Б! Что дальше?'
                      : 'Your video is ready via Plan B! What next?',
                    keyboard
                  )
                  return // Выходим из функции, так как видео уже отправлено
                }

                // Отправляем уведомление о прогрессе каждые 3 попытки
                if (attempts % 3 === 0) {
                  const progressMessage = isRu
                    ? `⏳ Видео генерируется через План Б... (${Math.round((attempts / maxPollingAttempts) * 100)}%)`
                    : `⏳ Video is being generated via Plan B... (${Math.round((attempts / maxPollingAttempts) * 100)}%)`

                  if (progressMessage !== lastProgressMessage) {
                    await telegramInstance.sendMessage(chatId, progressMessage)
                    lastProgressMessage = progressMessage
                  }
                }

                // Ждем перед следующей проверкой
                if (attempts < maxPollingAttempts) {
                  await new Promise(resolve => setTimeout(resolve, pollingInterval))
                }

              } catch (pollError) {
                logger.error('[I2V BG] Plan B polling error', {
                  telegramId,
                  taskId,
                  attempt: attempts,
                  error: pollError instanceof Error ? pollError.message : 'Unknown polling error'
                })

                // При ошибке polling'а отправляем уведомление и переходим к следующей попытке
                if (attempts % 5 === 0) { // Каждые 5 попыток отправляем уведомление об ошибке
                  await telegramInstance.sendMessage(
                    chatId,
                    isRu
                      ? `⚠️ Временная ошибка проверки статуса видео. Продолжаю попытки...`
                      : `⚠️ Temporary error checking video status. Continuing attempts...`
                  )
                }

                // Ждем перед следующей попыткой даже при ошибке
                if (attempts < maxPollingAttempts) {
                  await new Promise(resolve => setTimeout(resolve, pollingInterval))
                }
              }
            }

            // Если после всех попыток видео не готово
            logger.error('[I2V BG] Plan B polling timeout - video not ready', {
              telegramId,
              taskId,
              attempts,
              maxPollingAttempts
            })

            await telegramInstance.sendMessage(
              chatId,
              isRu
                ? `❌ Видео не удалось сгенерировать в отведенное время через План Б. Попробуйте еще раз.`
                : `❌ Video generation timed out via Plan B. Please try again.`
            )

            throw new Error('Plan B polling timeout - video generation failed')
          }
        }
        
        // Если Plan B не сработал, продолжаем с обычным Replicate API
        logger.warn('[I2V BG] Plan B failed, falling back to standard Replicate API', {
          telegramId,
          error: kieResponse.error
        })
      }
      
      // Специальная обработка для Seedance-1-Pro моделей
      else if (modelConfig.id === 'seedance-1-pro' && selectedResolution) {
        modelInput = {
          ...modelConfig.api.input, // ИСПРАВЛЕНИЕ: Включаем базовые параметры API
          prompt,
          resolution: selectedResolution, // ИСПРАВЛЕНО: используем 'resolution' вместо 'target_resolution'
          [modelConfig.imageKey]: imageUrl,
        }
        logger.info('[I2V BG] Seedance model input prepared:', {
          telegramId,
          resolution: selectedResolution, // ИСПРАВЛЕНО: логируем 'resolution'
          hasImage: !!imageUrl,
          imageKey: modelConfig.imageKey,
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
          ...modelConfig.api.input,
          prompt,
          target_resolution: wanResolution, // WAN использует специфичный формат
          [modelConfig.imageKey]: imageUrl,
        }
        logger.info('[I2V BG] WAN 2.2 I2V model input prepared:', {
          telegramId,
          selectedResolution,
          userAspectRatio,
          wanResolution,
          hasImage: !!imageUrl,
          imageKey: modelConfig.imageKey,
          fullInput: modelInput,
        })
      } else {
        // Стандартная обработка для остальных моделей
        modelInput = {
          ...modelConfig.api.input,
          prompt,
          aspect_ratio: userAspectRatio,
          [modelConfig.imageKey]: imageUrl,
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

    logger.info('[I2V BG] Calling replicate.run', {
      model: replicateModelId,
      telegramId,
    })
    const replicateResult = await replicate.run(replicateModelId as any, {
      input: modelInput,
    })
    logger.info('[I2V BG] replicate.run finished', { telegramId })

    let videoUrl: string | undefined
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

    const dirPath = path.join('uploads', String(telegramId), 'image-to-video')
    await mkdir(dirPath, { recursive: true })
    const timestamp = Date.now()
    let baseFilename = 'video.mp4'
    try {
      baseFilename = path.basename(new URL(videoUrl).pathname)
    } catch (urlError) {
      logger.warn('[I2V BG] Could not parse filename from URL, using default', {
        videoUrl,
        urlError,
      })
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

    logger.info('[I2V BG] Success, sending video', {
      telegramId,
      videoUrl,
      localVideoPath,
    })
    const caption = isRu
      ? `✨ Ваше видео (${modelConfig.title}) готово!\n💰 Списано: ${paymentAmountForNotification} ✨\n💎 Остаток: ${newBalanceForNotification} ✨`
      : `✨ Your video (${modelConfig.title}) is ready!\n💰 Cost: ${paymentAmountForNotification} ✨\n💎 Balance: ${newBalanceForNotification} ✨`

    await telegramInstance.sendVideo(
      chatId,
      { source: localVideoPath },
      { caption }
    )

    // Добавляем финальные кнопки после успешной генерации видео
    logger.info('[I2V BG] Sending final buttons to user', { telegramId })

    const keyboard = Markup.keyboard([
      [
        isRu
          ? '✨ Создать еще (Изображение в Видео)'
          : '✨ Create More (Image to Video)',
      ],
      [
        isRu
          ? '🖼 Выбрать другую модель (Видео)'
          : '🖼 Select Another Model (Video)',
      ],
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

    // Универсальный возврат средств для всех моделей при ошибке
    const modelConfig = VIDEO_MODELS_CONFIG[modelId]
    if (modelConfig && paymentAmountForNotification) {
      logger.warn(
        '[I2V BG] Image-to-video generation failed, attempting refund',
        {
          telegramId,
          model: modelConfig.id,
          error: error.message,
          refundAmount: paymentAmountForNotification,
        }
      )

      try {
        // Возвращаем средства обратно
        const refundResult = await updateUserBalance(
          telegramId,
          paymentAmountForNotification,
          PaymentType.MONEY_INCOME,
          `Refund for failed ${modelConfig.title} generation (I2V)`,
          {
            bot_name: botName,
            service_type: 'image-to-video-refund',
            model_name: modelConfig.id,
            original_error: error.message,
            refund_amount: paymentAmountForNotification,
          }
        )

        logger.info(
          '[I2V BG] Refund processed for image-to-video generation failure',
          {
            telegramId,
            model: modelConfig.id,
            refund_amount: paymentAmountForNotification,
            refund_result: refundResult,
          }
        )
      } catch (refundError) {
        logger.error('[I2V BG] Failed to process refund', {
          telegramId,
          model: modelConfig.id,
          refund_error: refundError.message,
        })
      }
    }

    const errorMessage =
      error?.message ||
      (isRu ? 'Произошла неизвестная ошибка' : 'An unknown error occurred')

    // Уведомляем пользователя об ошибке и возврате средств
    const refundMessage = isRu
      ? ' Средства возвращены на ваш баланс.'
      : ' Funds have been refunded to your balance.'

    try {
      await telegramInstance.sendMessage(
        chatId,
        isRu
          ? `❌ Ошибка генерации видео: ${errorMessage}${refundMessage}`
          : `❌ Video generation error: ${errorMessage}${refundMessage}`
      )
    } catch (sendError: any) {
      logger.error('[I2V BG] Failed to send error message to user', {
        originalError: error?.message,
        sendError: sendError?.message,
        telegramId,
      })
    }
  }
}
