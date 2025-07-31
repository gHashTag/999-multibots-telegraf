import fs from 'fs'
import AdmZip from 'adm-zip'
import axios from 'axios'
import { API_URL, SECRET_API_KEY } from '@/config'
import { logger } from '@/utils/logger'
import { sendMediaToPulse, MediaPulseOptions } from '@/helpers/pulse'
import { getBotTokenByName } from '@/core/getBotTokenByName'
import { Telegraf } from 'telegraf'

interface MorphingRequest {
  filePath: string
  telegram_id: string
  is_ru: boolean
  botName: string
  imageCount: number
  morphingType: 'seamless' | 'loop'
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
 * Сервис для создания морфинга - отправляет ZIP архив на отдельный API сервер
 */
export async function generateMorphing(
  requestData: MorphingRequest
): Promise<MorphingResponse> {
  console.log('🚨 [MORPHING SERVICE] ABOUT TO PROCESS ZIP:', {
    telegram_id: requestData.telegram_id,
    imageCount: requestData.imageCount,
    morphingType: requestData.morphingType,
    fileExists: fs.existsSync(requestData.filePath),
    fileSize: fs.statSync(requestData.filePath).size,
  })

  try {
    // ✅ ЛОКАЛЬНАЯ ОБРАБОТКА МОРФИНГА - чистый JavaScript без Inngest
    logger.info('🧬 [MORPHING SERVICE] Starting local JavaScript processing', {
      telegram_id: requestData.telegram_id,
      imageCount: requestData.imageCount,
      morphingType: requestData.morphingType,
    })

    // Извлекаем изображения из ZIP файла
    const zip = new AdmZip(requestData.filePath)
    const zipEntries = zip.getEntries()

    if (zipEntries.length < 2) {
      throw new Error('Недостаточно изображений для морфинга (минимум 2)')
    }

    // Создаем временную директорию для изображений
    const tempDir = `temp/morphing_${requestData.telegram_id}_${Date.now()}`
    const fullTempDir = `${process.cwd()}/${tempDir}`

    // Создаем директорию если не существует
    if (!fs.existsSync(fullTempDir)) {
      fs.mkdirSync(fullTempDir, { recursive: true })
    }

    // Сохраняем изображения из ZIP
    const imagePaths: string[] = []
    for (let i = 0; i < zipEntries.length; i++) {
      const entry = zipEntries[i]
      if (!entry.isDirectory && entry.entryName.match(/\.(jpg|jpeg|png)$/i)) {
        const imagePath = `${fullTempDir}/image_${i}.jpg`
        fs.writeFileSync(imagePath, entry.getData())
        imagePaths.push(imagePath)

        logger.info(`📸 Extracted image ${i + 1}`, { imagePath })
      }
    }

    if (imagePaths.length < 2) {
      throw new Error('Не найдено достаточно валидных изображений в ZIP файле')
    }

    // ✅ ПРЯМАЯ ОБРАБОТКА МОРФИНГА через Replicate API
    const { createMorphingVideo } = await import(
      '@/services/localMorphingProcessor'
    )

    const finalVideoPath = await createMorphingVideo({
      imagePaths,
      tempDir: fullTempDir,
      telegram_id: requestData.telegram_id,
    })

    // ✅ ОТПРАВКА ГОТОВОГО ВИДЕО В TELEGRAM
    const botToken = getBotTokenByName(requestData.botName)
    if (!botToken) {
      throw new Error(`Bot token not found for: ${requestData.botName}`)
    }

    const bot = new Telegraf(botToken)
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

        // Создаем URL для скачивания
        const videoUrl = `http://localhost:2999/${tempDir.replace('temp/', 'temp/')}/final_video.mp4`
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
        })
      } else {
        throw sendVideoError
      }
    }

    // ✅ ОТПРАВКА В PULSE ГРУППУ
    try {
      await sendMediaToPulse({
        mediaType: 'video',
        filePath: finalVideoPath,
        prompt: 'Morphing Loop (Kling)',
        userId: requestData.telegram_id,
        typeName: 'Morphing Loop (Kling)',
        parameters: {
          image_count: requestData.imageCount,
          model: 'kling-v1.6-pro',
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

    if (axios.isAxiosError(error)) {
      console.error('🚨 [MORPHING SERVICE] AXIOS ERROR DETAILS:', {
        telegramId: requestData.telegram_id,
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        headers: error.response?.headers,
        url: error.config?.url,
        method: error.config?.method,
        message: error.message,
        code: error.code,
      })

      throw new Error(`Произошла ошибка при создании морфинга на сервере`)
    }

    throw new Error('Произошла ошибка при создании морфинга')
  }
}
