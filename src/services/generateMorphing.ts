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
    // URL для отправки запроса на отдельный API сервер
    const url = `${API_URL}/generate/morph-images`

    // Создаем FormData для отправки файла
    const FormData = require('form-data')
    const formData = new FormData()

    // Добавляем файл архива
    formData.append('images_zip', fs.createReadStream(requestData.filePath))

    // Добавляем остальные параметры
    formData.append('type', 'morphing')
    formData.append('telegram_id', requestData.telegram_id)
    formData.append('image_count', requestData.imageCount.toString())
    formData.append('morphing_type', requestData.morphingType)
    formData.append('model', 'kling-v1.6-pro')
    formData.append('is_ru', requestData.is_ru ? 'true' : 'false')
    formData.append('bot_name', requestData.botName)
    formData.append('username', 'telegram_bot')

    console.log('🚨 [MORPHING SERVICE] ABOUT TO SEND HTTP REQUEST:', {
      url,
      telegram_id: requestData.telegram_id,
      imageCount: requestData.imageCount,
      morphingType: requestData.morphingType,
      model: 'kling-v1.6-pro',
      fileExists: fs.existsSync(requestData.filePath),
      fileSize: fs.statSync(requestData.filePath).size,
      hasSecretKey: !!SECRET_API_KEY,
      secretKeyLength: SECRET_API_KEY?.length || 0,
    })

    // Отправляем запрос и ждем результат (увеличиваем таймаут для морфинга)
    const response = await axios.post<MorphingApiResponse>(url, formData, {
      headers: {
        ...formData.getHeaders(),
        'x-secret-key': SECRET_API_KEY,
      },
      timeout: 300000, // 5 минут таймаут для морфинга
    })

    logger.info('[MORPHING SERVICE] Response received', {
      telegramId: requestData.telegram_id,
      status: response.status,
      data: response.data,
    })

    const apiResponse = response.data

    // Проверяем успешность ответа
    if (!apiResponse.success || !apiResponse.video_url) {
      throw new Error(apiResponse.error || 'Морфинг не удался - нет URL видео')
    }

    // ✅ Морфинг успешно завершен - отправляем пользователю
    try {
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
          { url: apiResponse.video_url },
          { caption }
        )

        logger.info('✅ Morphing video sent to user directly', {
          telegramId: requestData.telegram_id,
          videoUrl: apiResponse.video_url,
        })
      } catch (sendVideoError: any) {
        // Проверяем, является ли это ошибкой "файл слишком большой"
        const isTooLargeError =
          sendVideoError?.response?.error_code === 413 ||
          sendVideoError?.message?.includes('Request Entity Too Large') ||
          sendVideoError?.message?.includes('file too large') ||
          sendVideoError?.message?.includes('413')

        if (isTooLargeError) {
          logger.info(
            '📁 Video file too large for Telegram, sending download link',
            {
              telegramId: requestData.telegram_id,
              videoUrl: apiResponse.video_url,
              error: sendVideoError.message,
            }
          )

          // Отправляем ссылку на скачивание
          const downloadMessage = requestData.is_ru
            ? `🧬 <b>Ваше морфинг-видео готово!</b>

📁 <b>Файл слишком большой для прямой отправки в Telegram</b>
🔗 <b>Скачайте видео по ссылке:</b>

<a href="${apiResponse.video_url}">📥 Скачать морфинг-видео</a>

💡 <b>Совет:</b> Нажмите на ссылку выше или скопируйте её в браузер для скачивания`
            : `🧬 <b>Your morphing video is ready!</b>

📁 <b>File too large for direct Telegram delivery</b>
🔗 <b>Download your video using this link:</b>

<a href="${apiResponse.video_url}">📥 Download Morphing Video</a>

💡 <b>Tip:</b> Click the link above or copy it to your browser to download`

          await bot.telegram.sendMessage(
            requestData.telegram_id,
            downloadMessage,
            {
              parse_mode: 'HTML',
              link_preview_options: { is_disabled: false },
            }
          )

          logger.info('✅ Download link sent to user due to large file size', {
            telegramId: requestData.telegram_id,
            videoUrl: apiResponse.video_url,
          })
        } else {
          // Если это другая ошибка - пробрасываем её дальше
          throw sendVideoError
        }
      }

      // ✅ Отправляем в pulse группу
      const pulseOptions: MediaPulseOptions = {
        mediaType: 'video',
        mediaSource: apiResponse.video_url,
        telegramId: requestData.telegram_id,
        username: 'telegram_bot', // Используем то же значение что отправляем на API
        language: requestData.is_ru ? 'ru' : 'en',
        serviceType: 'Morphing (Direct)',
        prompt: 'Морфинг видео',
        botName: requestData.botName,
        additionalInfo: {
          images_count: requestData.imageCount.toString(),
          morphing_type: requestData.morphingType,
          model: 'kling-v1.6-pro',
        },
      }

      await sendMediaToPulse(pulseOptions)

      logger.info('✅ Morphing video sent to pulse group', {
        telegramId: requestData.telegram_id,
      })
    } catch (sendError) {
      logger.error('❌ Error sending morphing video', {
        telegramId: requestData.telegram_id,
        error: sendError instanceof Error ? sendError.message : 'Unknown error',
      })

      // Не пробрасываем ошибку отправки, так как видео уже создано
      // Просто логируем и продолжаем
    }

    return {
      message: 'Морфинг успешно создан и отправлен',
      status: 'completed' as const,
      video_url: apiResponse.video_url,
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
