import Replicate from 'replicate'
import axios from 'axios'
import { logger } from '@/utils/logger'
import { saveVideoUrlToSupabase } from '@/core/supabase/saveVideoUrlToSupabase'
import {
  type ProviderConfig,
  type LipSyncResult,
  type UniversalLipSyncInput,
  type LipSyncModelConfig,
  type KlingLipSyncInput,
  type SyncLipSyncInput,
} from './types'
import { isKlingInput, isSyncInput } from './validators'
import {
  uploadTelegramFileLocal,
  generateLocalFileName,
} from '@/helpers/uploadTelegramFileLocal'

/**
 * Функциональные провайдеры Lip-Sync
 * Чистые функции без состояния и побочных эффектов
 */

// ==================== REPLICATE KLING PROVIDER ====================

/**
 * Создает Replicate клиент
 */
const createReplicateClient = (): Replicate => {
  console.log('🔍 [createReplicateClient] Checking API token...')
  console.log(
    '🔍 [createReplicateClient] Token exists:',
    !!process.env.REPLICATE_API_TOKEN
  )

  if (!process.env.REPLICATE_API_TOKEN) {
    console.error('❌ [createReplicateClient] REPLICATE_API_TOKEN is not set')
    throw new Error('REPLICATE_API_TOKEN is not set')
  }

  console.log(
    '✅ [createReplicateClient] Creating Replicate client with token length:',
    process.env.REPLICATE_API_TOKEN.length
  )
  return new Replicate({
    auth: process.env.REPLICATE_API_TOKEN,
  })
}

/**
 * Генерирует видео через Kling модель
 */
const generateKlingLipSync = async (
  input: UniversalLipSyncInput
): Promise<LipSyncResult> => {
  console.log('🚀 [generateKlingLipSync] Starting generation with input:', {
    videoUrl: input.videoUrl?.substring(0, 50) + '...',
    audioUrl: input.audioUrl?.substring(0, 50) + '...',
    text: input.text?.substring(0, 50) + '...',
    inputType: input.audioUrl ? 'audio' : 'text',
    telegramId: input.telegramId,
    modelId: input.modelId,
  })

  if (!isKlingInput(input)) {
    return {
      success: false,
      error: {
        message: 'Invalid input for Replicate Kling provider',
        error: `Expected provider: replicate, modelId: kwaivgi/kling-lip-sync`,
        code: 'INVALID_INPUT',
        provider: 'replicate',
        modelId: (input as any)?.modelId || 'unknown',
      },
    }
  }

  try {
    const replicate = createReplicateClient()

    logger.info('🎬 Запуск Replicate Kling генерации', {
      telegramId: input.telegramId,
      modelId: input.modelId,
      hasParameters: !!input.parameters,
    })

    // 🚀 НОВАЯ ЛОГИКА: Загружаем файлы ИЛИ используем text
    let replicateInput: any

    if (input.text) {
      // 📝 РЕЖИМ ТЕКСТА: используем только video + text
      console.log(
        '📝 [generateKlingLipSync] Using TEXT mode - no audio upload needed'
      )

      const videoFileName = generateLocalFileName(
        input.telegramId,
        'video',
        input.videoUrl
      )

      const publicVideoUrl = await uploadTelegramFileLocal(
        input.videoUrl,
        videoFileName
      )

      console.log('✅ [generateKlingLipSync] Video uploaded for TEXT mode:', {
        video: publicVideoUrl.substring(0, 100) + '...',
        text: input.text.substring(0, 100) + '...',
      })

      replicateInput = {
        input: {
          video_url: publicVideoUrl,
          text: input.text, // 🎯 ИСПОЛЬЗУЕМ ТЕКСТ НАПРЯМУЮ!
        },
        webhook: input.parameters?.webhookUrl,
      }
    } else if (input.audioUrl) {
      // 🎵 РЕЖИМ АУДИО: загружаем video + audio
      console.log(
        '🎵 [generateKlingLipSync] Using AUDIO mode - uploading files'
      )

      const videoFileName = generateLocalFileName(
        input.telegramId,
        'video',
        input.videoUrl
      )
      const audioFileName = generateLocalFileName(
        input.telegramId,
        'audio',
        input.audioUrl
      )

      const [publicVideoUrl, publicAudioUrl] = await Promise.all([
        uploadTelegramFileLocal(input.videoUrl, videoFileName),
        uploadTelegramFileLocal(input.audioUrl, audioFileName),
      ])

      console.log('✅ [generateKlingLipSync] Files uploaded for AUDIO mode:', {
        video: publicVideoUrl.substring(0, 100) + '...',
        audio: publicAudioUrl.substring(0, 100) + '...',
      })

      replicateInput = {
        input: {
          video_url: publicVideoUrl,
          audio_url: publicAudioUrl,
        },
        webhook: input.parameters?.webhookUrl,
      }
    } else {
      throw new Error('Either text or audioUrl must be provided')
    }

    console.log('🎯 [generateKlingLipSync] Prepared Replicate input:', {
      modelId: 'kwaivgi/kling-lip-sync',
      video_url: replicateInput.input.video_url?.substring(0, 100) + '...',
      ...(replicateInput.input.audio_url && {
        audio_url: replicateInput.input.audio_url.substring(0, 100) + '...',
      }),
      ...(replicateInput.input.text && {
        text: replicateInput.input.text.substring(0, 100) + '...',
      }),
      webhook: input.parameters?.webhookUrl ? 'SET' : 'NOT_SET',
    })

    console.log('🚀 [generateKlingLipSync] Calling replicate.run...')
    const prediction = await replicate.run(
      'kwaivgi/kling-lip-sync',
      replicateInput
    )
    console.log('📥 [generateKlingLipSync] Replicate API responded!')

    logger.info('✅ Получен ответ от Replicate', {
      predictionId: (prediction as any)?.id || 'unknown',
      hasOutput: !!prediction,
    })

    // Синхронный режим - результат готов
    if (prediction && typeof prediction === 'string') {
      const resultUrl = prediction

      // Сохраняем в Supabase если включено
      if (input.parameters?.saveOutput !== false) {
        const uniqueId = `kling_lipsync_${Date.now()}_${input.telegramId}`
        await saveVideoUrlToSupabase(
          input.telegramId,
          uniqueId,
          resultUrl,
          'kling_lipsync'
        )
      }

      return {
        success: true,
        data: {
          id: `kling_${Date.now()}_${input.telegramId}`,
          status: 'succeeded',
          output: resultUrl,
          modelUsed: 'Replicate Kling Lip-Sync',
          costEstimate: 0.014 * 10, // Предполагаем 10 секунд
        },
      }
    }

    // Асинхронный режим
    const predictionId = (prediction as any)?.id || `kling_${Date.now()}`
    return {
      success: true,
      data: {
        id: predictionId,
        status: 'starting',
        modelUsed: 'Replicate Kling Lip-Sync',
        costEstimate: 0.014 * 10,
      },
    }
  } catch (error) {
    console.error('💥 [generateKlingLipSync] Caught error:', error)
    console.error('💥 [generateKlingLipSync] Error details:', {
      name: error instanceof Error ? error.name : 'Unknown',
      message: error instanceof Error ? error.message : String(error),
      stack:
        error instanceof Error ? error.stack?.substring(0, 500) : 'No stack',
    })

    logger.error('❌ Ошибка Replicate Kling генерации', {
      error: error instanceof Error ? error.message : String(error),
      telegramId: input.telegramId,
    })

    return {
      success: false,
      error: {
        message: 'Ошибка при генерации видео с липсинком',
        error: error instanceof Error ? error.message : String(error),
        code: 'REPLICATE_ERROR',
        provider: 'replicate',
        modelId: input.modelId,
      },
    }
  }
}

/**
 * Получает статус генерации Kling
 */
const getKlingStatus = async (predictionId: string): Promise<LipSyncResult> => {
  try {
    const replicate = createReplicateClient()

    logger.info('🔍 Проверка статуса Replicate', { predictionId })

    const prediction = await replicate.predictions.get(predictionId)

    return {
      success: true,
      data: {
        id: prediction.id,
        status: prediction.status as any,
        output: prediction.output as string,
        error: prediction.error as string,
        modelUsed: 'Replicate Kling Lip-Sync',
        costEstimate: 0.014 * 10,
      },
    }
  } catch (error) {
    logger.error('❌ Ошибка получения статуса Replicate', {
      predictionId,
      error: error instanceof Error ? error.message : String(error),
    })

    return {
      success: false,
      error: {
        message: 'Ошибка при получении статуса',
        error: error instanceof Error ? error.message : String(error),
        code: 'STATUS_ERROR',
        provider: 'replicate',
      },
    }
  }
}

/**
 * Проверяет доступность Replicate
 */
const checkKlingAvailability = async (): Promise<boolean> => {
  try {
    const replicate = createReplicateClient()
    await replicate.models.get('kwaivgi', 'kling-lip-sync')
    return true
  } catch (error) {
    logger.warn('⚠️ Replicate недоступен', {
      error: error instanceof Error ? error.message : String(error),
    })
    return false
  }
}

/**
 * Рассчитывает стоимость Kling
 */
const calculateKlingCost = (
  durationSeconds: number,
  modelId: string
): number => {
  if (modelId !== 'kling') {
    throw new Error(`Model ${modelId} not supported by Kling provider`)
  }
  return 0.014 * durationSeconds
}

/**
 * Отменяет генерацию Kling
 */
const cancelKlingGeneration = async (
  predictionId: string
): Promise<boolean> => {
  try {
    const replicate = createReplicateClient()
    await replicate.predictions.cancel(predictionId)
    logger.info('✅ Replicate предсказание отменено', { predictionId })
    return true
  } catch (error) {
    logger.error('❌ Не удалось отменить Replicate предсказание', {
      predictionId,
      error: error instanceof Error ? error.message : String(error),
    })
    return false
  }
}

// ==================== SYNC PROVIDER ====================

/**
 * Генерирует видео через Sync модель
 */
const generateSyncLipSync = async (
  input: UniversalLipSyncInput
): Promise<LipSyncResult> => {
  if (!isSyncInput(input)) {
    return {
      success: false,
      error: {
        message: 'Invalid input for Sync LipSync provider',
        error: `Expected provider: sync, modelId: sync/lipsync-2`,
        code: 'INVALID_INPUT',
        provider: 'sync',
        modelId: (input as any)?.modelId || 'unknown',
      },
    }
  }

  if (!process.env.SYNC_API_KEY) {
    return {
      success: false,
      error: {
        message: 'Sync API key not configured',
        error: 'SYNC_API_KEY environment variable is not set',
        code: 'CONFIGURATION_ERROR',
        provider: 'sync',
        modelId: input.modelId,
      },
    }
  }

  try {
    logger.info('🎬 Запуск Sync LipSync-2 генерации', {
      telegramId: input.telegramId,
      modelId: input.modelId,
      hasParameters: !!input.parameters,
    })

    const syncApiData = {
      model: 'lipsync-2',
      input: {
        face: input.videoUrl, // Исправлено: используем videoUrl для лица
        audio: input.audioUrl,
        ...input.parameters,
      },
    }

    const response = await axios.post(
      'https://api.sync.so/predictions',
      syncApiData,
      {
        headers: {
          Authorization: `Bearer ${process.env.SYNC_API_KEY}`,
          'Content-Type': 'application/json',
        },
        timeout: 600000, // 10 минут
      }
    )

    const prediction = response.data

    logger.info('✅ Получен ответ от Sync API', {
      telegramId: input.telegramId,
      predictionId: prediction.id,
      status: prediction.status,
    })

    // Синхронный режим - результат готов
    if (prediction?.output && typeof prediction.output === 'string') {
      const resultUrl = prediction.output

      // Сохраняем в Supabase
      const uniqueId = `sync_lipsync2_${Date.now()}_${input.telegramId}`
      await saveVideoUrlToSupabase(
        input.telegramId,
        uniqueId,
        resultUrl,
        'sync_lipsync2'
      )

      return {
        success: true,
        data: {
          id: uniqueId,
          status: 'succeeded',
          output: resultUrl,
          modelUsed: 'Sync LipSync-2',
          costEstimate: 0.05 * 10, // Предполагаем 10 секунд
        },
      }
    }

    // Асинхронный режим
    return {
      success: true,
      data: {
        id: prediction.id,
        status: prediction.status || 'starting',
        modelUsed: 'Sync LipSync-2',
        costEstimate: 0.05 * 10,
        metadata: {
          urls: prediction.urls,
        },
      },
    }
  } catch (error: any) {
    logger.error('❌ Ошибка Sync LipSync-2 генерации', {
      telegramId: input.telegramId,
      error: error.message,
    })

    return {
      success: false,
      error: {
        message: 'Ошибка при генерации Sync LipSync-2',
        error: error.message || 'Unknown error',
        code: 'SYNC_ERROR',
        provider: 'sync',
        modelId: input.modelId,
      },
    }
  }
}

/**
 * Получает статус генерации Sync
 */
const getSyncStatus = async (predictionId: string): Promise<LipSyncResult> => {
  if (!process.env.SYNC_API_KEY) {
    return {
      success: false,
      error: {
        message: 'Sync API key not configured',
        error: 'SYNC_API_KEY environment variable is not set',
        code: 'CONFIGURATION_ERROR',
        provider: 'sync',
      },
    }
  }

  try {
    logger.info('🔍 Проверка статуса Sync LipSync-2', { predictionId })

    const response = await axios.get(
      `https://api.sync.so/predictions/${predictionId}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.SYNC_API_KEY}`,
        },
        timeout: 30000,
      }
    )

    const prediction = response.data

    return {
      success: true,
      data: {
        id: prediction.id,
        status: prediction.status,
        output: prediction.output,
        error: prediction.error,
        modelUsed: 'Sync LipSync-2',
        costEstimate: 0.05 * 10,
      },
    }
  } catch (error: any) {
    logger.error('❌ Ошибка получения статуса Sync LipSync-2', {
      predictionId,
      error: error.message,
    })

    return {
      success: false,
      error: {
        message: 'Ошибка при получении статуса Sync LipSync-2',
        error: error.message || 'Unknown error',
        code: 'STATUS_ERROR',
        provider: 'sync',
      },
    }
  }
}

/**
 * Проверяет доступность Sync API
 */
const checkSyncAvailability = async (): Promise<boolean> => {
  try {
    if (!process.env.SYNC_API_KEY) {
      return false
    }

    const response = await axios.get('https://api.sync.so/health', {
      headers: {
        Authorization: `Bearer ${process.env.SYNC_API_KEY}`,
      },
      timeout: 10000,
    })

    return response.status === 200
  } catch (error) {
    logger.warn('⚠️ Sync API недоступен', {
      error: error instanceof Error ? error.message : String(error),
    })
    return false
  }
}

/**
 * Рассчитывает стоимость Sync
 */
const calculateSyncCost = (
  durationSeconds: number,
  modelId: string
): number => {
  if (modelId !== 'sync_v2') {
    throw new Error(`Model ${modelId} not supported by Sync provider`)
  }
  return 0.05 * durationSeconds
}

// ==================== КОНФИГУРАЦИИ МОДЕЛЕЙ ====================

/**
 * Конфигурация Kling модели
 */
const klingModelConfig: LipSyncModelConfig = {
  id: 'kling',
  name: '🚀 Kling Lip-Sync',
  description:
    'Быстрая и точная модель от Replicate. Отличное качество по доступной цене.',
  provider: 'replicate',
  modelId: 'kwaivgi/kling-lip-sync',
  costPerSecond: 0.014,
  maxDuration: 30,
  quality: 'high',
  isAvailable: true,
  features: [
    'Высокая скорость обработки',
    'Точная синхронизация',
    'Поддержка различных типов лиц',
    'Экономичная цена',
  ],
  supportedFormats: {
    video: ['mp4', 'avi', 'mov'],
    audio: ['mp3', 'wav', 'aac'],
  },
  limitations: {
    maxFileSize: 50 * 1024 * 1024, // 50MB
    maxResolution: '1920x1080',
    minDuration: 1,
    maxDuration: 30,
  },
}

/**
 * Конфигурация Sync модели
 */
const syncModelConfig: LipSyncModelConfig = {
  id: 'sync_v2',
  name: '⭐ Sync LipSync-2',
  description:
    'Премиум модель с сохранением уникального стиля говорящего. Лучшее качество для профессионалов.',
  provider: 'sync',
  modelId: 'sync/lipsync-2',
  costPerSecond: 0.05,
  maxDuration: 60,
  quality: 'premium',
  isAvailable: true,
  features: [
    'Сохранение уникального стиля речи',
    'Премиум качество',
    'Улучшенная работа с зубами',
    'Устойчивость к поворотам головы',
    'Работа с бородой и усами',
  ],
  supportedFormats: {
    video: ['mp4', 'avi', 'mov', 'webm'],
    audio: ['mp3', 'wav', 'aac', 'm4a'],
  },
  limitations: {
    maxFileSize: 100 * 1024 * 1024, // 100MB
    maxResolution: '4096x4096',
    minDuration: 1,
    maxDuration: 60,
  },
}

// ==================== КОНФИГУРАЦИИ ПРОВАЙДЕРОВ ====================

/**
 * Конфигурация Replicate провайдера
 */
export const replicateProviderConfig: ProviderConfig = {
  providerId: 'replicate',
  providerName: 'Replicate Kling Lip-Sync',
  supportedModels: ['kling'],
  modelsConfig: [klingModelConfig],
  generateFn: generateKlingLipSync,
  getStatusFn: getKlingStatus,
  isAvailableFn: checkKlingAvailability,
  calculateCostFn: calculateKlingCost,
  cancelFn: cancelKlingGeneration,
}

/**
 * Конфигурация Sync провайдера
 */
export const syncProviderConfig: ProviderConfig = {
  providerId: 'sync',
  providerName: 'Sync LipSync-2',
  supportedModels: ['sync_v2'],
  modelsConfig: [syncModelConfig],
  generateFn: generateSyncLipSync,
  getStatusFn: getSyncStatus,
  isAvailableFn: checkSyncAvailability,
  calculateCostFn: calculateSyncCost,
}

/**
 * Все доступные провайдеры
 */
export const allProviders: readonly ProviderConfig[] = [
  replicateProviderConfig,
  syncProviderConfig,
] as const
