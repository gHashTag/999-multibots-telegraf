import { logger } from '@/utils/logger'
import { fal } from '@fal-ai/client'
import { ELEVENLABS_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from '@/config'
import { getVoiceId } from '@/core/supabase/getVoiceId'
import { createClient } from '@supabase/supabase-js'
import type { ILipSyncProvider } from '../interfaces/lipsync-provider.interface'
import type {
  LipSyncOutput,
  LipSyncError,
  LipSyncModelConfig,
  VeedFabricInput,
} from '../schemas/lipsync-schemas'
import { getLipSyncModelById } from '@/config/lipsync-models.config'

/**
 * Провайдер для FAL.ai VEED/fabric-1.0 модели
 * Замена Kie.ai - использует FAL.ai API для lip-sync генерации
 * Генерирует аудио через ElevenLabs с голосом пользователя, затем создает lip-sync видео
 */
export class FalVeedFabricProvider implements ILipSyncProvider {
  readonly providerId = 'fal' as const
  readonly providerName = 'FAL.ai VEED Fabric'
  readonly supportedModels = ['fal-veed-fabric']

  private config: {
    timeout: number
    retryAttempts: number
    defaultResolution: '480p' | '720p'
  }

  constructor(
    config?: Partial<typeof FalVeedFabricProvider.prototype.config>
  ) {
    const FAL_KEY = process.env.FAL_KEY

    if (!FAL_KEY) {
      throw new Error('FAL_KEY is not set in environment variables')
    }

    if (!ELEVENLABS_API_KEY) {
      throw new Error('ELEVENLABS_API_KEY is not set for audio generation')
    }

    // Configure FAL client
    fal.config({
      credentials: FAL_KEY
    })

    this.config = {
      timeout: 300000, // 5 минут
      retryAttempts: 3,
      defaultResolution: '720p',
      ...config,
    }

    logger.info('🎭 FAL.ai VEED Fabric Provider инициализирован', {
      supportedModels: this.supportedModels,
      timeout: this.config.timeout,
      defaultResolution: this.config.defaultResolution,
      hasApiKey: !!FAL_KEY,
    })
  }

  /**
   * Генерирует аудио через ElevenLabs и загружает в Supabase Storage
   */
  private async generateAudio(
    text: string,
    voiceId: string,
    telegramId: string
  ): Promise<string | null> {
    try {
      logger.info('🎤 [FAL PROVIDER] Генерация аудио через ElevenLabs', {
        voiceId,
        textLength: text.length,
      })

      const axios = (await import('axios')).default
      const response = await axios.post(
        `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
        {
          text,
          model_id: 'eleven_multilingual_v2',
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
          },
        },
        {
          headers: {
            'xi-api-key': ELEVENLABS_API_KEY!,
            'Content-Type': 'application/json',
          },
          responseType: 'arraybuffer',
          timeout: 60000,
        }
      )

      logger.info('✅ [FAL PROVIDER] Аудио сгенерировано, загружаем в Supabase Storage...')

      // Загружаем в Supabase Storage для получения публичного URL
      const audioBuffer = Buffer.from(response.data)
      const fileName = `lipsync-audio/${telegramId}/${Date.now()}.mp3`

      const serviceClient = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!)

      const { data: uploadData, error: uploadError } = await serviceClient.storage
        .from('images')
        .upload(fileName, audioBuffer, {
          contentType: 'audio/mpeg',
          upsert: false,
        })

      if (uploadError) {
        logger.error('❌ [FAL PROVIDER] Ошибка загрузки аудио в Supabase', { uploadError })
        return null
      }

      // Получаем публичный URL
      const { data: urlData } = serviceClient.storage
        .from('images')
        .getPublicUrl(fileName)

      logger.info('✅ [FAL PROVIDER] Аудио загружено в Supabase', {
        fileName,
        publicUrl: urlData.publicUrl,
      })

      return urlData.publicUrl
    } catch (error) {
      logger.error('❌ [FAL PROVIDER] Ошибка генерации аудио через ElevenLabs', {
        error,
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
      })
      return null
    }
  }

  /**
   * Генерирует lip-sync видео через FAL.ai VEED Fabric
   */
  async generate(input: VeedFabricInput): Promise<LipSyncOutput | LipSyncError> {
    try {
      const startTime = Date.now()

      // Проверяем входные данные
      if (input.provider !== 'fal' || input.modelId !== 'fal-veed-fabric') {
        return {
          message: 'Invalid input for FAL.ai VEED Fabric provider',
          error: `Expected provider: fal, modelId: fal-veed-fabric`,
          code: 'INVALID_INPUT',
          provider: 'fal',
          modelId: input.modelId,
        }
      }

      const veedInput = input

      logger.info('🎬 [FAL PROVIDER] Запуск FAL.ai VEED Fabric генерации', {
        telegramId: veedInput.telegramId,
        modelId: veedInput.modelId,
        resolution: veedInput.resolution || this.config.defaultResolution,
        hasAudioUrl: !!veedInput.audioUrl,
        hasText: !!veedInput.text,
      })

      // Определяем audio URL (готовый или генерируем через ElevenLabs)
      let audioUrl: string
      let voiceId: string | null = null

      if (veedInput.audioUrl) {
        // Используем готовый audioUrl от голосового сообщения
        audioUrl = veedInput.audioUrl
        logger.info('🎤 [FAL PROVIDER] Используем готовое аудио от пользователя', { audioUrl: audioUrl.substring(0, 100) })

      } else {
        // Генерируем аудио через ElevenLabs для текста
        voiceId = await getVoiceId(veedInput.telegramId)
        if (!voiceId) {
          return {
            message: 'User voice ID not found',
            error: 'Cannot generate audio without user voice ID',
            code: 'MISSING_VOICE_ID',
            provider: 'fal',
            modelId: veedInput.modelId,
          }
        }

        logger.info('✅ [FAL PROVIDER] Voice ID получен', { voiceId })

        const generatedAudio = await this.generateAudio(veedInput.text!, voiceId, veedInput.telegramId)
        if (!generatedAudio) {
          return {
            message: 'Failed to generate audio',
            error: 'ElevenLabs audio generation failed',
            code: 'AUDIO_GENERATION_FAILED',
            provider: 'fal',
            modelId: veedInput.modelId,
          }
        }

        audioUrl = generatedAudio
      }

      // Вызываем FAL.ai API для создания lip-sync видео
      logger.info('📤 [FAL PROVIDER] Отправка запроса в FAL.ai', {
        model: 'fal-ai/VEED/fabric-1.0',
        imageUrl: veedInput.imageUrl.substring(0, 100),
        audioUrl: audioUrl.substring(0, 100),
        resolution: veedInput.resolution || this.config.defaultResolution,
      })

      const result = await fal.subscribe('fal-ai/VEED/fabric-1.0', {
        input: {
          image_url: veedInput.imageUrl,
          audio_url: audioUrl,
          resolution: veedInput.resolution || this.config.defaultResolution,
        },
        logs: true,
        onQueueUpdate: (update) => {
          if (update.status === 'IN_PROGRESS') {
            logger.info('⏳ [FAL PROVIDER] Processing in progress', {
              status: update.status,
              logs: update.logs.map((log) => log.message),
            })
          } else {
            logger.info('📊 [FAL PROVIDER] Status update', {
              status: update.status,
            })
          }
        },
      })

      const processingTime = Date.now() - startTime

      logger.info('✅ [FAL PROVIDER] Генерация завершена успешно', {
        telegramId: veedInput.telegramId,
        processingTime: Math.round(processingTime / 1000),
        resultKeys: Object.keys(result),
      })

      // Извлекаем video URL из результата FAL.ai
      let videoUrl: string | null = null

      if (result.data?.video?.url) {
        videoUrl = result.data.video.url
      } else if (result.data?.video) {
        videoUrl = typeof result.data.video === 'string' ? result.data.video : null
      } else if (result.video) {
        videoUrl = typeof result.video === 'string' ? result.video : result.video?.url
      }

      if (!videoUrl) {
        logger.error('❌ [FAL PROVIDER] Video URL not found in result', {
          resultStructure: JSON.stringify(result, null, 2),
        })

        return {
          message: 'Video URL not found in FAL.ai response',
          error: 'Could not extract video URL from API response',
          code: 'INVALID_RESPONSE',
          provider: 'fal',
          modelId: veedInput.modelId,
        }
      }

      logger.info('🎥 [FAL PROVIDER] Video URL extracted', {
        videoUrl: videoUrl.substring(0, 100),
      })

      // Возвращаем успешный результат
      return {
        id: `fal-${Date.now()}`, // Генерируем уникальный ID
        output: videoUrl,
        modelUsed: 'FAL.ai VEED Fabric 1.0',
        provider: 'fal',
        status: 'completed',
        metadata: {
          processingTime,
          resolution: veedInput.resolution || this.config.defaultResolution,
          voiceId: voiceId || 'user_audio',
        },
      }
    } catch (error) {
      logger.error('❌ [FAL PROVIDER] Критическая ошибка', {
        error: error instanceof Error ? error.message : 'Unknown error',
        telegramId: input.telegramId,
        modelId: input.modelId,
      })

      // Check for specific errors
      let errorCode = 'CRITICAL_ERROR'
      let errorMessage = error instanceof Error ? error.message : 'Unknown error'

      if (error instanceof Error) {
        if (error.message.includes('Forbidden') || error.message.includes('403')) {
          errorCode = 'FORBIDDEN'
          errorMessage = 'Access forbidden. Check FAL.ai account credits and permissions.'
        } else if (error.message.includes('Unauthorized') || error.message.includes('401')) {
          errorCode = 'UNAUTHORIZED'
          errorMessage = 'API key is invalid or expired.'
        } else if (error.message.includes('timeout')) {
          errorCode = 'TIMEOUT'
          errorMessage = 'Request timed out. Please try again.'
        }
      }

      return {
        message: 'Critical error in FAL.ai Veed Fabric provider',
        error: errorMessage,
        code: errorCode,
        provider: 'fal',
        modelId: input.modelId,
      }
    }
  }

  /**
   * Получает статус обработки
   * FAL.ai использует subscribe pattern, поэтому polling не нужен
   */
  async getStatus(predictionId: string): Promise<LipSyncOutput | LipSyncError> {
    logger.warn('⚠️ [FAL PROVIDER] Status polling не поддерживается', {
      predictionId,
      info: 'FAL.ai использует subscribe pattern, результат возвращается сразу',
    })

    return {
      message: 'Status polling not supported for FAL.ai',
      error: 'FAL.ai uses subscribe pattern. Results are returned directly from generate() method.',
      code: 'POLLING_NOT_SUPPORTED',
      provider: 'fal',
      modelId: 'fal-veed-fabric',
    }
  }

  /**
   * Проверяет доступность провайдера
   */
  async isAvailable(): Promise<boolean> {
    return !!(process.env.FAL_KEY && ELEVENLABS_API_KEY)
  }

  /**
   * Проверяет поддержку модели
   */
  supportsModel(modelId: string): boolean {
    return this.supportedModels.includes(modelId)
  }

  /**
   * Получает конфигурацию моделей
   */
  getModelsConfig(): LipSyncModelConfig[] {
    const model = getLipSyncModelById('fal_veed_fabric')
    return model ? [model] : []
  }

  /**
   * Рассчитывает стоимость обработки
   */
  calculateCost(durationSeconds: number, modelId: string): number {
    const model = getLipSyncModelById('fal_veed_fabric')
    if (!model) return 0
    return model.costPerSecond * durationSeconds
  }

  /**
   * Отменяет генерацию
   */
  async cancel(predictionId: string): Promise<boolean> {
    // FAL.ai синхронный subscribe, отмена не поддерживается
    logger.warn('⚠️ [FAL PROVIDER] Cancellation не поддерживается')
    return false
  }
}
