/**
 * 🎤 RVC (Realistic Voice Cloning) Service
 *
 * Сервис для обучения голосовых моделей и создания AI Cover
 * Использует Replicate API:
 * - replicate/train-rvc-model - обучение голоса
 * - zsxkib/realistic-voice-cloning - конверсия вокала
 */

import Replicate from 'replicate'
import { logger } from '@/utils/logger'
import {
  VOICE_TRAINING_CONFIG,
  AI_COVER_CONFIG,
} from '@/price/helpers/modelsCost'

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface VoiceTrainingParams {
  telegram_id: string
  audioUrl: string
  modelName: string
  webhookUrl?: string
}

export interface VoiceTrainingResult {
  trainingId: string
  status: 'starting' | 'processing' | 'succeeded' | 'failed'
}

export interface AICoverParams {
  songUrl: string
  voiceModelUrl: string
  pitchChange?: number
  indexRate?: number
  filterRadius?: number
  rmsMixRate?: number
  protect?: number
}

export interface AICoverResult {
  audioUrl: string
  duration?: number
}

// ═══════════════════════════════════════════════════════════════════════════
// REPLICATE CLIENT
// ═══════════════════════════════════════════════════════════════════════════

let _replicateClient: Replicate | null = null

function getReplicateClient(): Replicate {
  if (!_replicateClient) {
    const token = process.env.REPLICATE_API_TOKEN
    if (!token) {
      throw new Error(
        '❌ CRITICAL: REPLICATE_API_TOKEN not found in process.env'
      )
    }
    _replicateClient = new Replicate({ auth: token })
    logger.info('[RVC] Replicate client initialized')
  }
  return _replicateClient
}

// ═══════════════════════════════════════════════════════════════════════════
// VOICE TRAINING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Запускает обучение голосовой модели RVC
 *
 * @param params - параметры обучения
 * @returns ID тренировки и статус
 *
 * Модель: replicate/train-rvc-model
 * Время: 5-10 минут
 * Стоимость: ~$1.07
 */
export async function startVoiceTraining(
  params: VoiceTrainingParams
): Promise<VoiceTrainingResult> {
  const { telegram_id, audioUrl, modelName, webhookUrl } = params

  logger.info('[RVC] Starting voice training', {
    telegram_id,
    modelName,
    audioUrl: audioUrl.substring(0, 50) + '...',
  })

  const replicate = getReplicateClient()

  try {
    // Создаем тренировку через Replicate API
    const training = await replicate.trainings.create(
      'replicate',
      'train-rvc-model',
      '1.0.0', // версия модели
      {
        destination: `${telegram_id}/${modelName}`,
        input: {
          dataset: audioUrl,
          model_name: modelName,
          // Параметры обучения RVC
          sample_rate: 48000,
          f0_method: 'rmvpe', // лучший метод для определения pitch
          epochs: 100,
          batch_size: 8,
        },
        webhook: webhookUrl,
        webhook_events_filter: ['completed'],
      }
    )

    logger.info('[RVC] Voice training started', {
      telegram_id,
      trainingId: training.id,
      status: training.status,
    })

    return {
      trainingId: training.id,
      status: training.status as VoiceTrainingResult['status'],
    }
  } catch (error) {
    logger.error('[RVC] Voice training failed to start', {
      telegram_id,
      error: error instanceof Error ? error.message : String(error),
    })
    throw error
  }
}

/**
 * Проверяет статус тренировки
 */
export async function checkTrainingStatus(trainingId: string): Promise<{
  status: string
  modelUrl?: string
  error?: string
}> {
  const replicate = getReplicateClient()

  try {
    const training = await replicate.trainings.get(trainingId)

    return {
      status: training.status,
      modelUrl: training.output?.version
        ? `${training.model}:${training.output.version}`
        : undefined,
      error: training.error || undefined,
    }
  } catch (error) {
    logger.error('[RVC] Failed to check training status', {
      trainingId,
      error: error instanceof Error ? error.message : String(error),
    })
    throw error
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// AI COVER (Voice Conversion)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Создает AI Cover - конвертирует вокал песни в голос пользователя
 *
 * @param params - параметры конверсии
 * @returns URL готового аудио
 *
 * Модель: zsxkib/realistic-voice-cloning
 * Время: 1-3 минуты
 * Стоимость: ~$0.20
 */
export async function generateAICover(
  params: AICoverParams
): Promise<AICoverResult> {
  const {
    songUrl,
    voiceModelUrl,
    pitchChange = 0,
    indexRate = 0.5,
    filterRadius = 3,
    rmsMixRate = 0.25,
    protect = 0.33,
  } = params

  logger.info('[RVC] Starting AI Cover generation', {
    songUrl: songUrl.substring(0, 50) + '...',
    voiceModelUrl: voiceModelUrl.substring(0, 50) + '...',
    pitchChange,
  })

  const replicate = getReplicateClient()

  try {
    const output = await replicate.run(
      'zsxkib/realistic-voice-cloning:latest' as `${string}/${string}:${string}`,
      {
        input: {
          song_input: songUrl,
          rvc_model: voiceModelUrl,
          pitch_change: pitchChange,
          index_rate: indexRate,
          filter_radius: filterRadius,
          rms_mix_rate: rmsMixRate,
          protect: protect,
          // Дополнительные параметры
          f0_method: 'rmvpe',
          output_format: 'mp3',
        },
      }
    )

    // Replicate возвращает URL или массив URL
    let audioUrl: string
    if (Array.isArray(output)) {
      audioUrl = String(output[0])
    } else if (typeof output === 'string') {
      audioUrl = output
    } else {
      // Handle object output (e.g., { audio: "url" })
      audioUrl = String((output as Record<string, unknown>).audio || output)
    }

    logger.info('[RVC] AI Cover generated successfully', {
      audioUrl: audioUrl.substring(0, 50) + '...',
    })

    return {
      audioUrl,
    }
  } catch (error) {
    logger.error('[RVC] AI Cover generation failed', {
      error: error instanceof Error ? error.message : String(error),
    })
    throw error
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Проверяет длительность аудио (30 сек - 3 мин для обучения)
 */
export function validateAudioDuration(durationSeconds: number): {
  valid: boolean
  error?: string
} {
  const { minAudioDuration, maxAudioDuration } = VOICE_TRAINING_CONFIG

  if (durationSeconds < minAudioDuration) {
    return {
      valid: false,
      error: `Audio too short. Minimum ${minAudioDuration} seconds required.`,
    }
  }

  if (durationSeconds > maxAudioDuration) {
    return {
      valid: false,
      error: `Audio too long. Maximum ${maxAudioDuration} seconds (${maxAudioDuration / 60} minutes) allowed.`,
    }
  }

  return { valid: true }
}

/**
 * Проверяет длительность песни (макс 10 мин для AI Cover)
 */
export function validateSongDuration(durationSeconds: number): {
  valid: boolean
  error?: string
} {
  const { maxSongDuration } = AI_COVER_CONFIG

  if (durationSeconds > maxSongDuration) {
    return {
      valid: false,
      error: `Song too long. Maximum ${maxSongDuration / 60} minutes allowed.`,
    }
  }

  return { valid: true }
}

/**
 * Поддерживаемые форматы аудио
 */
export const SUPPORTED_AUDIO_FORMATS = [
  'audio/mpeg', // mp3
  'audio/mp3',
  'audio/wav',
  'audio/x-wav',
  'audio/ogg',
  'audio/flac',
  'audio/m4a',
  'audio/mp4',
]

/**
 * Проверяет формат аудио файла
 */
export function validateAudioFormat(mimeType: string): boolean {
  return SUPPORTED_AUDIO_FORMATS.includes(mimeType.toLowerCase())
}

export default {
  startVoiceTraining,
  checkTrainingStatus,
  generateAICover,
  validateAudioDuration,
  validateSongDuration,
  validateAudioFormat,
  SUPPORTED_AUDIO_FORMATS,
}
