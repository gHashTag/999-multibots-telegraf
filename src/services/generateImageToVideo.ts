// В файле, где находится generateImageToVideo на api-server

import { replicate } from '@/core/replicate'
// ... другие импорты ...
import { VIDEO_MODELS_CONFIG } from '@/price/models/VIDEO_MODELS_CONFIG'
import { logger } from '@/utils/logger' // Добавляем логгер
import { downloadFile } from '@/helpers/downloadFile'
import { getUserByTelegramId, updateUserLevelPlusOne } from '@/core/supabase'
import { getBotByName } from '@/core/bot'
import { processBalanceVideoOperation } from '@/price/helpers'
import { saveVideoUrlToSupabase } from '@/core/supabase/saveVideoUrlToSupabase'
import { mkdir, writeFile } from 'fs/promises'
import path from 'path'
// import { errorMessageAdmin } from '@/helpers/errorMessageAdmin' <-- Removed
import { MyContext } from '@/interfaces' // <-- Added for ctx type
import { Update } from 'telegraf/types' // <-- Added for ctx type
import { errorMessageAdmin } from '@/helpers/error/errorMessageAdmin' // <-- Corrected path
import { Markup } from 'telegraf' // Added import

interface ReplicateResponse {
  id: string // ID может не возвращаться для replicate.run, но output точно есть
  output: string | string[] // Output может быть строкой или массивом строк
}

// Обновляем сигнатуру: добавляем опциональные параметры для морфинга
export const generateImageToVideo = async (
  ctx: MyContext, // <-- Added ctx
  imageUrl: string | null, // null для морфинга
  prompt: string | null, // null для морфинга
  videoModel: string,
  telegram_id: string,
  username: string,
  is_ru: boolean,
  bot_name: string,
  is_morphing = false, // Новый флаг, по умолчанию false
  imageAUrl: string | null = null, // Новый URL A для морфинга
  imageBUrl: string | null = null // Новый URL B для морфинга
): Promise<{ videoUrl?: string; prediction_id?: string } | string> => {
  // Тип возврата пока оставим
  try {
    // Логируем все полученные параметры
    logger.info('API Server: Start generateImageToVideo (Task)', {
      imageUrl: imageUrl ? 'present' : 'absent',
      prompt: prompt ? 'present' : 'absent',
      videoModel,
      telegram_id,
      username,
      is_ru,
      bot_name,
      is_morphing,
      imageAUrl: imageAUrl ? 'present' : 'absent',
      imageBUrl: imageBUrl ? 'present' : 'absent',
    })

    // --- Валидация параметров в зависимости от режима ---
    const modelConfig = VIDEO_MODELS_CONFIG[videoModel]
    if (!modelConfig) {
      // Добавим проверку на существование конфига модели
      throw new Error(
        `Серверная ошибка: Конфигурация для модели ${videoModel} не найдена.`
      )
    }

    if (is_morphing) {
      if (!imageAUrl || !imageBUrl) {
        throw new Error(
          'Серверная ошибка: imageAUrl и imageBUrl обязательны для морфинга'
        )
      }
      // imageUrl и prompt не нужны
      logger.info('API Server (Task): Morphing mode detected', { telegram_id })
    } else {
      if (!imageUrl) {
        throw new Error(
          'Серверная ошибка: imageUrl обязателен для стандартного режима'
        )
      }
      if (!prompt) {
        throw new Error(
          'Серверная ошибка: prompt обязателен для стандартного режима'
        )
      }
      // imageAUrl и imageBUrl не нужны
      logger.info('API Server (Task): Standard mode detected', { telegram_id })
    }
    // Общая валидация
    if (!videoModel || !telegram_id || !username || !bot_name) {
      throw new Error(
        'Серверная ошибка: Отсутствуют общие обязательные параметры'
      )
    }

    // --- Логика получения пользователя (Используем ctx) ---
    const userExists = await getUserByTelegramId(ctx) // Pass ctx
    if (!userExists) {
      throw new Error(
        `Серверная ошибка: Пользователь ${telegram_id} не найден.`
      )
    }
    const level = userExists.level
    if (level === 8) {
      // Или какая тут логика проверки уровня? Оставляем как было.
      await updateUserLevelPlusOne(telegram_id, level) // Keep using telegram_id here for DB consistency
      logger.info('API Server (Task): User level updated', {
        telegram_id,
        oldLevel: level,
      })
    }

    // --- Проверка и списание баланса (Используем ctx) ---
    const balanceResult = await processBalanceVideoOperation(
      ctx, // Pass ctx
      videoModel, // Pass videoModel as configKey
      is_ru // Pass is_ru
    )

    if (!balanceResult.success) {
      // Не отправляем сообщение пользователю, т.к. ответ 202 уже ушел
      // Просто логируем и выбрасываем ошибку
      logger.error('API Server (Task): Balance check failed', {
        telegram_id,
        error: balanceResult.error,
      })
      throw new Error(
        balanceResult.error || 'Серверная ошибка: Проверка баланса не удалась'
      )
    }
    const { newBalance, paymentAmount } = balanceResult
    logger.info('API Server (Task): Balance sufficient and deducted', {
      telegram_id,
      paymentAmount,
      newBalance,
    })

    // --- Удаляем отправку сообщения "Генерация видео..." ---
    // await ctx.telegram.sendMessage(...) // Use ctx.reply or ctx.telegram if needed

    // --- Вызов Replicate (остается replicate.run) ---
    // Используем существующую вспомогательную функцию, если она есть, или вызываем напрямую
    const runModel = async (
      model: `${string}/${string}` | `${string}/${string}:${string}`,
      input: any
    ): Promise<unknown> => {
      logger.info('API Server (Task): Calling replicate.run', {
        model,
        inputKeys: Object.keys(input),
        telegram_id,
      })
      const result = await replicate.run(model, {
        input,
      })
      logger.info('API Server (Task): replicate.run finished', { telegram_id })
      return result
    }

    // --- Подготовка Input для Replicate ---
    const replicateModelId: string = modelConfig.api.model // Полный ID модели 'owner/model:version'

    let modelInput: any = {}

    if (is_morphing) {
      // --- Input для Морфинга --- UPDATED for Kling
      if (videoModel.startsWith('kling-') && modelConfig.imageKey) {
        // Specific handling for Kling based on error -> Re-adding end_image
        modelInput = {
          ...modelConfig.api.input,
          [modelConfig.imageKey]: imageAUrl, // Use imageA as the start_image
          end_image: imageBUrl, // Try adding imageB as end_image
          prompt: prompt || '', // Use provided prompt or empty string
        }
        logger.info(
          'API Server (Task): Prepared Replicate input for Kling morphing (with start_image and end_image)',
          {
            telegram_id,
            inputKeys: Object.keys(modelInput),
          }
        )
      } else {
        // Default morphing input for other potential models
        modelInput = {
          ...modelConfig.api.input,
          image_a: imageAUrl, // Передаем URL
          image_b: imageBUrl, // Передаем URL
          prompt: prompt || '', // Используем промпт или пустую строку
        }
        logger.info(
          'API Server (Task): Prepared Replicate input for generic morphing',
          {
            telegram_id,
            inputKeys: Object.keys(modelInput),
          }
        )
      }
    } else {
      // --- Input для Стандартной Генерации (существующая логика) ---
      // Скачиваем исходное изображение
      if (!imageUrl || !prompt)
        throw new Error(
          'Missing imageUrl or prompt for standard mode internal check'
        ) // Доп. проверка
      if (!modelConfig.imageKey) {
        // Добавим проверку наличия imageKey для стандартного режима
        throw new Error(
          `Серверная ошибка: Отсутствует imageKey в конфигурации для модели ${videoModel}`
        )
      }
      const imageBuffer = await downloadFile(imageUrl)
      // Convert buffer to data URI string
      const imageMimeType = 'image/jpeg' // Assuming JPEG, adjust if needed or detect dynamically
      const imageDataUri = `data:${imageMimeType};base64,${imageBuffer.toString('base64')}`

      modelInput = {
        ...modelConfig.api.input,
        prompt,
        aspect_ratio: userExists.aspect_ratio, // Сохраняем aspect_ratio
        [modelConfig.imageKey]: imageDataUri, // Передаем Data URI строку
      }
      logger.info(
        'API Server (Task): Prepared Replicate input for standard (with Data URI)',
        {
          // Updated log message
          telegram_id,
          inputKeys: Object.keys(modelInput),
        }
      )
    }

    // --- Запуск модели Replicate ---
    const replicateResult = await runModel(replicateModelId as any, modelInput) // Вызываем runModel, получаем unknown

    // --- Обработка результата ---
    let videoUrl: string | null = null

    if (typeof replicateResult === 'string' && replicateResult.trim() !== '') {
      // Если результат - непустая строка, используем её
      videoUrl = replicateResult.trim()
    } else if (
      Array.isArray(replicateResult) &&
      replicateResult.length > 0 &&
      typeof replicateResult[0] === 'string'
    ) {
      // Если результат - массив и первый элемент строка, используем его
      videoUrl = replicateResult[0].trim()
    }
    // В противном случае videoUrl останется null

    logger.info('API Server (Task): Received video URL from Replicate', {
      videoUrl: videoUrl ? 'present' : 'absent',
      telegram_id,
    })

    // Check videoUrl AFTER extraction logic
    if (!videoUrl) {
      // Check the extracted videoUrl
      logger.error(
        'API Server (Task): Video URL could not be extracted from Replicate response', // Updated error message
        { telegram_id, result: replicateResult } // Log the raw result
      )
      throw new Error(
        is_ru
          ? 'Серверная ошибка: Не удалось извлечь URL видео из ответа Replicate' // Updated user message
          : 'Server Error: Failed to extract video URL from Replicate response' // Updated user message
      )
    }
    // --- Теперь используем извлеченный и проверенный videoUrl ---
    logger.info(
      `API Server (Task): Processing extracted video URL`, // Changed log message
      { videoUrl, telegram_id }
    )

    // --- Логика сохранения и отправки (использует videoUrl) ---
    const videoLocalPath = path.join(
      __dirname, // Убедись, что __dirname доступен, или используй другой способ определения пути
      '../uploads', // Путь к папке uploads на сервере
      telegram_id.toString(),
      'image-to-video',
      `${new Date().toISOString()}.mp4`
    )
    await mkdir(path.dirname(videoLocalPath), { recursive: true })

    const originalBuffer = await downloadFile(videoUrl as string)
    await writeFile(videoLocalPath, originalBuffer)
    await saveVideoUrlToSupabase(
      // Сохраняем в БД
      telegram_id,
      videoUrl as string,
      videoLocalPath,
      videoModel
    )
    logger.info('API Server (Task): Video saved locally and to DB', {
      telegram_id,
      videoLocalPath,
    })

    // --- Используем ctx.telegram для отправки ---
    logger.info('[generateI2V] Attempting to send video to user', {
      telegram_id,
    })
    await ctx.telegram.sendVideo(telegram_id, { source: videoLocalPath })
    logger.info('API Server (Task): Video sent to user', { telegram_id })

    // Отправляем сообщение об успехе и балансе
    logger.info('[generateI2V] Attempting to send success message to user', {
      telegram_id,
    })
    await ctx.telegram.sendMessage(
      telegram_id,
      is_ru
        ? `✅ Ваше видео готово!\n\nСтоимость: ${paymentAmount.toFixed(
            2 // Используем paymentAmount из balanceResult
          )} ⭐️\nВаш новый баланс: ${newBalance.toFixed(2)} ⭐️` // Используем newBalance из balanceResult
        : `✅ Your video is ready!\n\nCost: ${paymentAmount.toFixed(
            2
          )} ⭐️\nYour new balance: ${newBalance.toFixed(2)} ⭐️`,
      // Добавляем клавиатуру
      Markup.keyboard([
        [is_ru ? '🎥 Сгенерировать новое видео?' : '🎥 Generate new video?'],
        [is_ru ? '🏠 Главное меню' : '🏠 Main menu'],
      ]).resize()
    )
    logger.info('API Server (Task): Success message sent to user', {
      telegram_id,
    })

    // Отправляем видео в канал Pulse
    logger.info('[generateI2V] Attempting to send video to Pulse channel', {
      telegram_id,
    })
    await ctx.telegram.sendVideo(
      '@neuro_blogger_pulse', // Канал Pulse
      { source: videoLocalPath },
      {
        caption: (is_ru
          ? `${username} (ID: ${telegram_id}) ${
              is_morphing ? 'сморфил' : 'сгенерировал'
            } видео.\nМодель: ${videoModel}\nБот: @${bot_name}`
          : `${username} (ID: ${telegram_id}) generated a ${
              is_morphing ? 'morph' : 'standard'
            } video.\nModel: ${videoModel}\nBot: @${bot_name}`
        ).slice(0, 1000), // Укоротил сообщение для Pulse
      }
    )
    logger.info('API Server (Task): Video sent to Pulse channel', {
      telegram_id,
    })

    // Возвращаем URL (хотя он уже отправлен).
    return { videoUrl: videoUrl } // Return the extracted URL
  } catch (error) {
    // Логируем ошибку фоновой задачи с большей детализацией
    const errorDetails =
      error instanceof Error
        ? { message: error.message, stack: error.stack }
        : JSON.stringify(error)
    logger.error('API Server (Task): Error in generateImageToVideo task', {
      telegram_id,
      errorType: typeof error,
      errorDetails,
    })
    // --- Используем errorMessageAdmin ---
    logger.warn('[generateI2V] Attempting to send error message to admin', {
      telegram_id,
    })
    errorMessageAdmin(
      ctx,
      error instanceof Error ? error : new Error(String(error))
    ) // Pass ctx and error
    logger.info('[generateI2V] Error message sent to admin', { telegram_id })
    // Отправляем сообщение пользователю через ctx, если нужно (раньше этого не было в catch)
    // await ctx.reply(is_ru ? 'Произошла ошибка при генерации.' : 'An error occurred during generation.');
    return 'error' // Возвращаем маркер ошибки
  }
}
