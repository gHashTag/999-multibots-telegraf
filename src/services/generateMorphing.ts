import fs from 'fs'
import { PUBLIC_URL } from '@/config'
import { logger } from '@/utils/logger'
import { sendMediaToPulse } from '@/helpers/pulse'
import { getBotTokenByName } from '@/core/getBotTokenByName'
import { Telegraf, Markup } from 'telegraf'
import { telegramClientOptions } from '@/services/telegramApi'

interface MorphingRequest {
  images: Array<{
    buffer: Buffer
    filename: string
    timestamp?: number // ✅ Для правильной сортировки
    originalOrder?: number // ✅ Исходный порядок добавления
  }>
  telegram_id: string
  is_ru: boolean
  botName: string
  imageCount: number
  morphingType: 'seamless' | 'loop'
  withLoop: boolean // ✅ Параметр лупа
  customPrompt?: string // ✅ Кастомный промпт для переходов (если не указан - используется дефолтный кинематографичный)
  ctx?: any // ✅ Контекст Telegraf для использования существующего бота
}

interface MorphingResponse {
  message: string
  video_url?: string
  job_id?: string
  status: 'processing' | 'completed' | 'error'
}

interface MorphingApiResponse {
  success: boolean
  video_url?: string
  error?: string
  message?: string
}

/**
 * Сервис для создания морфинга - локальная обработка без архивов
 */
export async function generateMorphing(
  requestData: MorphingRequest
): Promise<MorphingResponse> {
  console.log('🚨 [MORPHING SERVICE] ABOUT TO PROCESS IMAGES:', {
    telegram_id: requestData.telegram_id,
    imageCount: requestData.imageCount,
    morphingType: requestData.morphingType,
    imagesCount: requestData.images.length,
  })

  // Объявляем tempDir до try для доступности в catch
  const tempDir = `temp/morphing_${requestData.telegram_id}_${Date.now()}`
  const fullTempDir = `${process.cwd()}/${tempDir}`

  try {
    // ✅ ЛОКАЛЬНАЯ ОБРАБОТКА МОРФИНГА - чистый JavaScript без Inngest
    logger.info('🧬 [MORPHING SERVICE] Starting local JavaScript processing', {
      telegram_id: requestData.telegram_id,
      imageCount: requestData.imageCount,
      morphingType: requestData.morphingType,
    })

    // Проверяем количество изображений
    if (requestData.images.length < 2) {
      throw new Error('Недостаточно изображений для морфинга (минимум 2)')
    }

    // ✅ СОРТИРУЕМ ИЗОБРАЖЕНИЯ ПО ПРАВИЛЬНОМУ ПОРЯДКУ
    const sortedImages = [...requestData.images].sort((a, b) => {
      // Сначала пробуем сортировать по originalOrder
      if (a.originalOrder && b.originalOrder) {
        return a.originalOrder - b.originalOrder
      }
      // Если originalOrder нет, сортируем по timestamp
      if (a.timestamp && b.timestamp) {
        return a.timestamp - b.timestamp
      }
      // Если ничего нет, оставляем как есть
      return 0
    })

    logger.info('🔄 [MORPHING SERVICE] Image sorting completed', {
      telegram_id: requestData.telegram_id,
      originalOrder: requestData.images
        .map((img, index) => `${index + 1}:${img.originalOrder || 'none'}`)
        .join(', '),
      sortedOrder: sortedImages
        .map((img, index) => `${index + 1}:${img.originalOrder || 'none'}`)
        .join(', '),
    })

    // Создаем директорию если не существует
    if (!fs.existsSync(fullTempDir)) {
      fs.mkdirSync(fullTempDir, { recursive: true })
    }

    // ✅ СОХРАНЯЕМ ОТСОРТИРОВАННЫЕ ИЗОБРАЖЕНИЯ
    const imagePaths: string[] = []
    for (let i = 0; i < sortedImages.length; i++) {
      const imageData = sortedImages[i]

      logger.info(
        `💾 Saving image ${i + 1}/${sortedImages.length} from buffer`,
        {
          filename: imageData.filename,
          bufferSize: imageData.buffer.length,
          originalOrder: imageData.originalOrder,
          sortedPosition: i + 1,
        }
      )

      try {
        // Сохраняем файл из buffer'а
        const imagePath = `${fullTempDir}/image_${i}.jpg`
        fs.writeFileSync(imagePath, imageData.buffer)
        imagePaths.push(imagePath)

        logger.info(`✅ Saved image ${i + 1}`, { imagePath })
      } catch (saveError) {
        logger.error(`❌ Failed to save image ${i + 1}`, {
          error: saveError,
          filename: imageData.filename,
        })
        throw new Error(`Failed to save image ${i + 1}: ${saveError}`)
      }
    }

    // ✅ ИСПОЛЬЗУЕМ СУЩЕСТВУЮЩИЙ БОТ ИЗ КОНТЕКСТА ИЛИ СОЗДАЕМ НОВЫЙ
    let bot: any
    if (requestData.ctx) {
      // Используем существующий бот из контекста
      bot = { telegram: requestData.ctx.telegram }
      logger.info('✅ Using existing bot from context', {
        telegram_id: requestData.telegram_id,
      })
    } else {
      // Создаем новый экземпляр (fallback для backward compatibility)
      const botToken = getBotTokenByName(requestData.botName)
      if (!botToken) {
        throw new Error(`Bot token not found for: ${requestData.botName}`)
      }
      bot = new Telegraf(botToken, { telegram: telegramClientOptions() })
      logger.info('⚠️ Creating new Telegraf instance', {
        telegram_id: requestData.telegram_id,
        botName: requestData.botName,
      })
    }

    // ✅ ПРЯМАЯ ОБРАБОТКА МОРФИНГА через Replicate API
    const { createMorphingVideo } = await import(
      '@/services/localMorphingProcessor'
    )

    // ✅ СОЗДАЕМ CALLBACK ДЛЯ НЕМЕДЛЕННОЙ ОТПРАВКИ ПРОМЕЖУТОЧНЫХ ВИДЕО
    const sendIntermediateVideo = async (
      clipPath: string,
      clipNumber: number,
      totalClips: number
    ) => {
      // ✅ ПРОВЕРКА: Если только 1 видео, то это финальное, не промежуточное!
      if (totalClips === 1) {
        logger.info(`⏭️ Skipping intermediate video send - only 1 clip total`, {
          telegramId: requestData.telegram_id,
          totalClips,
        })
        return
      }

      console.log(
        `🚀 [IMMEDIATE SEND] Отправляю промежуточное видео ${clipNumber}/${totalClips} СРАЗУ!`
      )

      const intermediateCaption = requestData.is_ru
        ? `🧬 Промежуточное видео ${clipNumber}/${totalClips}\n\n🎬 Переход между изображениями ${clipNumber} → ${
            clipNumber + 1
          }\n\n⏳ Создание остальных видео продолжается...`
        : `🧬 Intermediate video ${clipNumber}/${totalClips}\n\n🎬 Transition between images ${clipNumber} → ${
            clipNumber + 1
          }\n\n⏳ Creating remaining videos...`

      try {
        // ✅ НЕМЕДЛЕННАЯ ОТПРАВКА БЕЗ ЗАДЕРЖЕК И ОЧЕРЕДЕЙ
        const startTime = Date.now()
        await bot.telegram.sendVideo(
          requestData.telegram_id,
          { source: clipPath },
          {
            caption: intermediateCaption,
            // Отправляем без сжатия для максимальной скорости
            supports_streaming: true,
          }
        )
        const sendTime = Date.now() - startTime
        console.log(
          `✅ [IMMEDIATE SEND] Промежуточное видео ${clipNumber} отправлено за ${sendTime}ms!`
        )
        logger.info(`✅ Intermediate video ${clipNumber} sent IMMEDIATELY`, {
          telegramId: requestData.telegram_id,
          clipPath,
          sendTimeMs: sendTime,
        })
      } catch (error) {
        console.log(
          `❌ [IMMEDIATE SEND] Ошибка отправки промежуточного видео ${clipNumber}:`,
          error
        )
        logger.warn(`⚠️ Failed to send intermediate video ${clipNumber}`, {
          error: error,
          telegramId: requestData.telegram_id,
          clipPath,
        })
        // Не бросаем ошибку, чтобы не прерывать основной процесс
      }
    }

    const finalVideoPath = await createMorphingVideo({
      imagePaths,
      tempDir: fullTempDir,
      telegram_id: requestData.telegram_id,
      onIntermediateVideo: sendIntermediateVideo,
      customPrompt: requestData.customPrompt, // ✅ Передаем кастомный промпт если указан
    })

    // ✅ ОТПРАВКА ФИНАЛЬНОГО ВИДЕО В TELEGRAM (используем тот же bot)

    const caption = requestData.is_ru
      ? '🧬 Ваше морфинг-видео готово! Наслаждайтесь плавными переходами между изображениями!'
      : '🧬 Your morphing video is ready! Enjoy the smooth transitions between images!'

    try {
      // Пытаемся отправить видео напрямую
      await bot.telegram.sendVideo(
        requestData.telegram_id,
        { source: finalVideoPath },
        { caption }
      )

      logger.info('✅ Morphing video sent to user directly', {
        telegramId: requestData.telegram_id,
        videoPath: finalVideoPath,
      })

      // ✅ ДОБАВЛЯЕМ КНОПКИ ДЛЯ ПРОДОЛЖЕНИЯ РАБОТЫ
      const keyboard = Markup.keyboard([
        [
          requestData.is_ru
            ? '🧬 Создать еще морфинг'
            : '🧬 Create Another Morphing',
        ],
        [requestData.is_ru ? '🏠 Главное меню' : '🏠 Main Menu'],
      ]).resize()

      await bot.telegram.sendMessage(
        requestData.telegram_id,
        requestData.is_ru
          ? 'Ваш морфинг готов! Что дальше?'
          : 'Your morphing is ready! What next?',
        keyboard
      )
    } catch (sendVideoError: any) {
      // Если ошибка 413 (файл слишком большой), отправляем ссылку
      if (
        sendVideoError.description?.includes('Request Entity Too Large') ||
        sendVideoError.message?.includes('413')
      ) {
        logger.warn('📁 Video too large for Telegram, sending download link', {
          telegramId: requestData.telegram_id,
          error: sendVideoError.message,
        })

        // ✅ ПРАВИЛЬНАЯ ЛОГИКА ДЛЯ ЛОКАЛЬНОЙ И ПРОДАКШЕННОЙ СРЕДЫ
        const videoFileName = `morphing_${
          requestData.telegram_id
        }_${Date.now()}.mp4`
        const isDev = process.env.NODE_ENV === 'development'

        let videoUrl: string

        if (isDev) {
          // 🏠 ЛОКАЛЬНАЯ РАЗРАБОТКА: используем temp директорию и localhost
          const tempRelativePath = finalVideoPath.replace(
            process.cwd() + '/',
            ''
          )
          videoUrl = `http://localhost:2999/${tempRelativePath}`
          logger.info('🏠 Local development: using temp directory', {
            originalPath: finalVideoPath,
            tempPath: tempRelativePath,
            localUrl: videoUrl,
          })
        } else {
          // 🌐 ПРОДАКШЕН: копируем в nginx директорию
          const serverFilesDir =
            process.env.SERVER_FILES_DIR || '/etc/nginx/html/files/'
          const targetFilePath = `${serverFilesDir}${videoFileName}`

          try {
            // Создаем серверную директорию если не существует
            if (!fs.existsSync(serverFilesDir)) {
              fs.mkdirSync(serverFilesDir, { recursive: true })
            }

            // Копируем файл в серверную директорию
            fs.copyFileSync(finalVideoPath, targetFilePath)
            logger.info('✅ Video copied to server files directory', {
              from: finalVideoPath,
              to: targetFilePath,
            })
          } catch (copyError) {
            logger.error('❌ Failed to copy video to server directory', {
              error: copyError,
              targetPath: targetFilePath,
            })
          }

          videoUrl = `${PUBLIC_URL}/files/${videoFileName}`
        }
        const downloadMessage = requestData.is_ru
          ? `🧬 Ваше морфинг-видео готово!\n\n📁 <b>Файл слишком большой для отправки в Telegram</b>\n📥 <a href="${videoUrl}">Скачать видео</a>\n\n💡 Нажмите на ссылку для скачивания`
          : `🧬 Your morphing video is ready!\n\n📁 <b>File too large to send via Telegram</b>\n📥 <a href="${videoUrl}">Download video</a>\n\n💡 Click the link to download`

        await bot.telegram.sendMessage(
          requestData.telegram_id,
          downloadMessage,
          {
            parse_mode: 'HTML',
            link_preview_options: { is_disabled: false },
          }
        )

        logger.info('✅ Download link sent to user', {
          telegramId: requestData.telegram_id,
          downloadUrl: videoUrl,
          originalVideoPath: finalVideoPath,
          environment: isDev ? 'development' : 'production',
        })

        // ✅ ДОБАВЛЯЕМ КНОПКИ ДЛЯ ПРОДОЛЖЕНИЯ РАБОТЫ (большой файл)
        const keyboardBigFile = Markup.keyboard([
          [
            requestData.is_ru
              ? '🧬 Создать еще морфинг'
              : '🧬 Create Another Morphing',
          ],
          [requestData.is_ru ? '🏠 Главное меню' : '🏠 Main Menu'],
        ]).resize()

        await bot.telegram.sendMessage(
          requestData.telegram_id,
          requestData.is_ru
            ? 'Ваш морфинг готов! Что дальше?'
            : 'Your morphing is ready! What next?',
          keyboardBigFile
        )
      } else {
        throw sendVideoError
      }
    }

    // ✅ ОТПРАВКА В PULSE ГРУППУ
    try {
      await sendMediaToPulse({
        mediaType: 'video',
        mediaSource: finalVideoPath,
        telegramId: requestData.telegram_id,
        prompt: 'Morphing Loop (Kling)',
        serviceType: 'Morphing Loop (Kling)',
        additionalInfo: {
          image_count: requestData.imageCount.toString(),
          model: 'kling-v2.1-pro',
          morphing_type: requestData.morphingType,
        },
      })

      logger.info('✅ Morphing video sent to pulse group', {
        telegramId: requestData.telegram_id,
      })
    } catch (pulseError) {
      logger.error('❌ Failed to send to pulse group', {
        telegramId: requestData.telegram_id,
        error: pulseError,
      })
    }

    // ✅ ОЧИСТКА ВРЕМЕННЫХ ФАЙЛОВ
    try {
      if (fs.existsSync(fullTempDir)) {
        fs.rmSync(fullTempDir, { recursive: true, force: true })
        logger.info('🗑️ Temp directory cleaned up', {
          telegramId: requestData.telegram_id,
          tempDir: fullTempDir,
        })
      }
    } catch (cleanupError) {
      logger.warn('⚠️ Failed to cleanup temp directory', {
        telegramId: requestData.telegram_id,
        tempDir: fullTempDir,
        error: cleanupError,
      })
    }

    return {
      message: 'Морфинг успешно создан и отправлен',
      status: 'completed' as const,
      video_url: finalVideoPath,
    }
  } catch (error) {
    logger.error('[MORPHING SERVICE] Request failed', {
      telegramId: requestData.telegram_id,
      error: error instanceof Error ? error.message : 'Unknown error',
    })

    // Дополнительная информация об ошибке
    console.error('🚨 [MORPHING SERVICE] ERROR DETAILS:', {
      telegramId: requestData.telegram_id,
      errorType: error.constructor.name,
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    })

    // ✅ ОЧИСТКА ВРЕМЕННЫХ ФАЙЛОВ ПРИ ОШИБКЕ
    try {
      if (fs.existsSync(fullTempDir)) {
        fs.rmSync(fullTempDir, { recursive: true, force: true })
        logger.info('🗑️ Temp directory cleaned up after error', {
          telegramId: requestData.telegram_id,
          tempDir: fullTempDir,
        })
      }
    } catch (cleanupError) {
      logger.warn('⚠️ Failed to cleanup temp directory after error', {
        telegramId: requestData.telegram_id,
        tempDir: fullTempDir,
        error: cleanupError,
      })
    }

    // Пробрасываем оригинальную ошибку с префиксом для контекста
    const originalMessage =
      error instanceof Error ? error.message : 'Unknown error'
    throw new Error(
      `Произошла ошибка при создании морфинга: ${originalMessage}`
    )
  }
}
