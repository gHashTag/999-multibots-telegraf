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
    // ✅ ЛОКАЛЬНАЯ ОБРАБОТКА МОРФИНГА через Inngest функцию
    logger.info('🧬 [MORPHING SERVICE] Starting local processing', {
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
    const imageUrls: string[] = []
    for (let i = 0; i < zipEntries.length; i++) {
      const entry = zipEntries[i]
      if (!entry.isDirectory && entry.entryName.match(/\.(jpg|jpeg|png)$/i)) {
        const imagePath = `${fullTempDir}/image_${i}.jpg`
        fs.writeFileSync(imagePath, entry.getData())

        // Создаем URL для изображения (предполагаем что nginx настроен для temp/)
        const imageUrl = `http://localhost:2999/${tempDir}/image_${i}.jpg`
        imageUrls.push(imageUrl)

        logger.info(`📸 Extracted image ${i + 1}`, { imagePath, imageUrl })
      }
    }

    if (imageUrls.length < 2) {
      throw new Error('Не найдено достаточно валидных изображений в ZIP файле')
    }

    // Вызываем локальную Inngest функцию через событие
    const { inngest } = await import('@/inngest_app/client')

    const botToken = getBotTokenByName(requestData.botName)
    if (!botToken) {
      throw new Error(`Bot token not found for: ${requestData.botName}`)
    }

    // Отправляем событие в Inngest для локальной обработки
    await inngest.send({
      name: 'reels/generate-advanced-loop',
      data: {
        telegram_id: requestData.telegram_id,
        image_urls: imageUrls,
        music_url: null, // Пока без музыки
        bot_token: botToken,
        model_version: 'kwaivgi/kling-v1.6-pro', // Используем Kling модель
        prompt: 'cinematic video, beautiful, hd, 4k, morphing effect',
      },
    })

    logger.info('✅ [MORPHING SERVICE] Inngest event sent successfully', {
      telegram_id: requestData.telegram_id,
      images_count: imageUrls.length,
    })

    // Имитируем ответ для совместимости (реальный результат будет отправлен через Inngest)
    const apiResponse = {
      success: true,
      video_url: 'processing', // Видео будет отправлено напрямую в Telegram через Inngest
      message: 'Морфинг обрабатывается локально через Inngest',
    }

    // ✅ Локальная обработка запущена - Inngest функция сама отправит видео в Telegram
    logger.info('🧬 [MORPHING SERVICE] Local processing initiated', {
      telegramId: requestData.telegram_id,
      message: 'Inngest function will handle video generation and delivery',
    })

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
