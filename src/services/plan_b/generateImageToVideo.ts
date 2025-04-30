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
import { MyContext, VideoModelKey } from '@/interfaces' // <-- Added for ctx type
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
      throw new Error(
        `Серверная ошибка: Конфигурация для модели ${videoModel} не найдена.`
      )
    }

    // ---> 🕉️ ПРОВЕРКА СОВМЕСТИМОСТИ МОДЕЛИ ПЕРЕМЕЩЕНА ВЫШЕ 🕉️ <---
    if (is_morphing) {
      if (!imageAUrl || !imageBUrl) {
        throw new Error(
          'Серверная ошибка: imageAUrl и imageBUrl обязательны для морфинга'
        )
      }
      // ---> ПРОВЕРКА НА canMorph <---
      if (!modelConfig.canMorph) {
        logger.warn(
          'API Server (Task): Attempt to use non-morphable model for morphing',
          { telegram_id, videoModel }
        )
        throw new Error(
          is_ru
            ? `Модель ${modelConfig.title} не поддерживает режим морфинга.`
            : `Model ${modelConfig.title} does not support morphing mode.`
        )
      }
      logger.info('API Server (Task): Morphing mode detected', { telegram_id })
    } else {
      // Стандартный режим
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
      // ---> ПРОВЕРКА НА imageKey <---
      if (!modelConfig.imageKey) {
        logger.warn(
          'API Server (Task): Attempt to use model without imageKey for standard mode',
          { telegram_id, videoModel }
        )
        throw new Error(
          `Серверная ошибка: Отсутствует imageKey в конфигурации для модели ${videoModel}`
        )
      }
      logger.info('API Server (Task): Standard mode detected', { telegram_id })
    }
    // Общая валидация
    if (!videoModel || !telegram_id || !username || !bot_name) {
      throw new Error(
        'Серверная ошибка: Отсутствуют общие обязательные параметры'
      )
    }
    // ---> Старая проверка canMorph и imageKey удалена отсюда <---

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
      ctx,
      videoModel,
      is_ru
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
      if (!imageUrl || !prompt) {
        throw new Error(
          'Серверная ошибка: Внутренняя проверка imageUrl/prompt провалена'
        ) // Доп. проверка
      }
      if (!modelConfig.imageKey) {
        // Добавим проверку наличия imageKey для стандартного режима
        throw new Error(
          `Серверная ошибка: Отсутствует imageKey в конфигурации для модели ${videoModel}`
        )
      }
      // УБИРАЕМ СКАЧИВАНИЕ И КОНВЕРТАЦИЮ В DATA URI
      // const imageBuffer = await downloadFile(imageUrl)
      // // Convert buffer to data URI string
      // const imageMimeType = 'image/jpeg'; // Assuming JPEG, adjust if needed or detect dynamically
      // const imageDataUri = `data:${imageMimeType};base64,${imageBuffer.toString('base64')}`;

      modelInput = {
        ...modelConfig.api.input,
        prompt,
        aspect_ratio: userExists.aspect_ratio, // Сохраняем aspect_ratio
        [modelConfig.imageKey]: imageUrl, // <--- ПЕРЕДАЕМ ОРИГИНАЛЬНЫЙ imageUrl
      }
      logger.info(
        'API Server (Task): Prepared Replicate input for standard (with direct URL)',
        {
          // Updated log message
          telegram_id,
          inputKeys: Object.keys(modelInput),
        }
      )
    }

    // --- Запуск модели Replicate ---
    const replicateResult = await runModel(replicateModelId as any, modelInput) // Вызываем runModel, получаем unknown

    // --- Обработка результата Replicate ---
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
      logger.error(
        'API Server (Task): Failed to extract video URL from Replicate',
        {
          telegram_id,
          replicateResult,
        }
      )
      // Бросаем ошибку, которая будет поймана ниже
      throw new Error(
        'Server Error: Failed to extract video URL from Replicate response'
      )
    }

    logger.info('API Server (Task): Video URL extracted', {
      telegram_id,
      videoUrl,
    })

    // --- Скачивание и сохранение видео --- ПОРЯДОК ИСПРАВЛЕН
    const videoFileName = `${Date.now()}_${path.basename(videoUrl || 'video.mp4')}`
    const userUploadDir = path.join('uploads', telegram_id, 'image-to-video')
    const localVideoPath = path.join(userUploadDir, videoFileName)

    // 1. Скачиваем видео
    const videoBuffer = await downloadFile(videoUrl)
    logger.info('API Server (Task): Video downloaded', {
      telegram_id,
      url: videoUrl,
    })

    // 2. Создаем директорию
    await mkdir(userUploadDir, { recursive: true })
    logger.info('API Server (Task): Directory created/ensured', {
      telegram_id,
      path: userUploadDir,
    })

    // 3. Записываем файл
    await writeFile(localVideoPath, videoBuffer)
    logger.info('API Server (Task): Video saved locally', {
      telegram_id,
      path: localVideoPath,
    })

    // --- Сохранение в БД --- Исправляем на 4 аргумента
    await saveVideoUrlToSupabase(
      telegram_id,
      videoUrl,
      localVideoPath,
      modelConfig.id as VideoModelKey
    )
    logger.info('API Server (Task): Video URL saved to DB', { telegram_id })

    // --- Отправка пользователю --- ИСПРАВЛЯЕМ ДОСТУП К TELEGRAM
    const botInstanceData = getBotByName(bot_name)
    if (!botInstanceData || !botInstanceData.bot) {
      // Проверяем и botInstanceData и botInstanceData.bot
      throw new Error(
        `Bot instance or bot object not found for name: ${bot_name}`
      )
    }
    const bot = botInstanceData.bot // Получаем сам объект Telegraf

    await bot.telegram.sendVideo(
      telegram_id,
      { source: localVideoPath },
      {
        // ... опции ...
      }
    )
    logger.info('API Server (Task): Video sent to user', { telegram_id })

    // --- ИСПРАВЛЕНО: Отправка сообщения о балансе ПОСЛЕ видео ---
    await bot.telegram.sendMessage(
      telegram_id,
      is_ru
        ? `✅ Готово! Стоимость: ${paymentAmount.toFixed(2)} ⭐️. Ваш новый баланс: ${newBalance.toFixed(2)} ⭐️.`
        : `✅ Done! Cost: ${paymentAmount.toFixed(2)} ⭐️. Your new balance: ${newBalance.toFixed(2)} ⭐️.`
    )
    logger.info('API Server (Task): Balance message sent to user', {
      telegram_id,
    })

    // --- Логика Pulse (Закомментировано, т.к. не используется) ---
    // if (pulse) {
    //   await pulse(...);
    //   logger.info('API Server (Task): Sent to Pulse', { telegram_id });
    // }

    return { videoUrl } // Возвращаем URL
  } catch (error: any) {
    logger.error('API Server (Task): Error in generateImageToVideo task', {
      telegram_id,
      errorType: typeof error,
      errorDetails: { message: error.message, stack: error.stack },
    })
    // Send error message to admin - Исправляем аргументы
    errorMessageAdmin(ctx, error)
    throw error // Re-throw the error to reject the promise
  }
}
