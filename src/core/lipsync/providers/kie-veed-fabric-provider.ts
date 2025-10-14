import axios from 'axios'
import { logger } from '@/utils/logger'
import { KIE_AI_API_KEY, ELEVENLABS_API_KEY } from '@/config'
import { getVoiceId } from '@/core/supabase/getVoiceId'
import type { ILipSyncProvider } from '../interfaces/lipsync-provider.interface'
import type {
  LipSyncOutput,
  LipSyncError,
  LipSyncModelConfig,
  VeedFabricInput,
} from '../schemas/lipsync-schemas'
import { LIPSYNC_MODELS, getLipSyncModelById } from '@/config/lipsync-models.config'

/**
 * Провайдер для Kie.ai Veed Fabric 1.0 модели
 * Генерирует аудио через ElevenLabs с голосом пользователя, затем создает lip-sync видео
 */
export class KieVeedFabricProvider implements ILipSyncProvider {
  readonly providerId = 'kie' as const
  readonly providerName = 'Kie.ai Veed Fabric'
  readonly supportedModels = ['veed-fabric']

  private config: {
    timeout: number
    retryAttempts: number
    defaultResolution: '480p' | '720p'
  }

  constructor(
    config?: Partial<typeof KieVeedFabricProvider.prototype.config>
  ) {
    if (!KIE_AI_API_KEY) {
      throw new Error('KIE_AI_API_KEY is not set')
    }

    if (!ELEVENLABS_API_KEY) {
      throw new Error('ELEVENLABS_API_KEY is not set for audio generation')
    }

    this.config = {
      timeout: 300000, // 5 минут
      retryAttempts: 3,
      defaultResolution: '480p',
      ...config,
    }

    logger.info('🎭 Kie.ai Veed Fabric Provider инициализирован', {
      supportedModels: this.supportedModels,
      timeout: this.config.timeout,
      defaultResolution: this.config.defaultResolution,
    })
  }

  /**
   * Генерирует аудио через ElevenLabs с голосом пользователя
   */
  private async generateAudio(
    text: string,
    voiceId: string
  ): Promise<string | null> {
    try {
      logger.info('🎤 Генерация аудио через ElevenLabs', {
        voiceId,
        textLength: text.length,
      })

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

      // Конвертируем в base64 для передачи в kie.ai
      const audioBase64 = Buffer.from(response.data).toString('base64')
      const audioUrl = `data:audio/mpeg;base64,${audioBase64}`

      logger.info('✅ Аудио успешно сгенерировано')
      return audioUrl
    } catch (error) {
      logger.error('❌ Ошибка генерации аудио через ElevenLabs', { error })
      return null
    }
  }

  /**
   * Генерирует lip-sync видео через Kie.ai Veed Fabric
   */
  async generate(input: VeedFabricInput): Promise<LipSyncOutput | LipSyncError> {
    try {
      const startTime = Date.now()

      // Проверяем, что это входные данные для Veed Fabric
      if (input.provider !== 'kie' || input.modelId !== 'veed-fabric') {
        return {
          message: 'Invalid input for Kie.ai Veed Fabric provider',
          error: `Expected provider: kie, modelId: veed-fabric`,
          code: 'INVALID_INPUT',
          provider: 'kie',
          modelId: input.modelId,
        }
      }

      const veedInput = input

      logger.info('🎬 Запуск Kie.ai Veed Fabric генерации', {
        telegramId: veedInput.telegramId,
        modelId: veedInput.modelId,
        resolution: veedInput.resolution || this.config.defaultResolution,
      })

      // 1. Получаем voice_id пользователя
      const voiceId = await getVoiceId(veedInput.telegramId)
      if (!voiceId) {
        return {
          message: 'User voice ID not found',
          error: 'Cannot generate audio without user voice ID',
          code: 'MISSING_VOICE_ID',
          provider: 'kie',
          modelId: veedInput.modelId,
        }
      }

      logger.info('✅ Voice ID получен', { voiceId })

      // 2. Генерируем аудио через ElevenLabs
      const audioUrl = await this.generateAudio(veedInput.text, voiceId)
      if (!audioUrl) {
        return {
          message: 'Failed to generate audio',
          error: 'ElevenLabs audio generation failed',
          code: 'AUDIO_GENERATION_FAILED',
          provider: 'kie',
          modelId: veedInput.modelId,
        }
      }

      // 3. Вызываем Kie.ai API для создания lip-sync видео
      const kieResponse = await axios.post(
        'https://api.kie.ai/v1/generate',
        {
          model: 'veed-fabric',
          image_url: veedInput.imageUrl,
          audio_url: audioUrl,
          resolution: veedInput.resolution || this.config.defaultResolution,
        },
        {
          headers: {
            Authorization: `Bearer ${KIE_AI_API_KEY}`,
            'Content-Type': 'application/json',
          },
          timeout: this.config.timeout,
        }
      )

      const videoUrl = kieResponse.data.video_url

      if (!videoUrl) {
        return {
          message: 'No video URL in response',
          error: 'Kie.ai did not return video URL',
          code: 'NO_VIDEO_URL',
          provider: 'kie',
          modelId: veedInput.modelId,
        }
      }

      const processingTime = Date.now() - startTime
      const estimatedDuration = Math.ceil(veedInput.text.length / 50)
      const costEstimate = this.calculateCost(estimatedDuration, veedInput.modelId)

      logger.info('✅ Veed Fabric видео успешно сгенерировано', {
        videoUrl,
        telegramId: veedInput.telegramId,
        processingTime,
      })

      // Возвращаем результат в правильном формате LipSyncOutput
      return {
        id: `kie-veed-${Date.now()}`,
        status: 'succeeded',
        output: videoUrl,
        modelUsed: veedInput.modelId,
        costEstimate,
        processingTime,
        metadata: {
          resolution: veedInput.resolution || this.config.defaultResolution,
          voiceId,
          textLength: veedInput.text.length,
          provider: 'kie',
        },
      }
    } catch (error) {
      logger.error('❌ Ошибка генерации Veed Fabric', {
        error,
        telegramId: (input as VeedFabricInput).telegramId,
      })

      return {
        message: 'Veed Fabric generation failed',
        error: error instanceof Error ? error.message : 'Unknown error',
        code: 'GENERATION_FAILED',
        provider: 'kie',
        modelId: input.modelId,
      }
    }
  }

  /**
   * Получает статус обработки
   */
  async getStatus(predictionId: string): Promise<LipSyncOutput | LipSyncError> {
    // Kie.ai синхронный API, статус проверки не требуется
    return {
      message: 'Status check not supported for Veed Fabric',
      error: 'Kie.ai uses synchronous API',
      code: 'NOT_SUPPORTED',
      provider: 'kie',
      modelId: 'veed-fabric',
    }
  }

  /**
   * Проверяет доступность провайдера
   */
  async isAvailable(): Promise<boolean> {
    return !!(KIE_AI_API_KEY && ELEVENLABS_API_KEY)
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
    const model = getLipSyncModelById('veed_fabric')
    return model ? [model] : []
  }

  /**
   * Рассчитывает стоимость обработки
   */
  calculateCost(durationSeconds: number, modelId: string): number {
    const model = getLipSyncModelById('veed_fabric')
    if (!model) return 0
    return model.costPerSecond * durationSeconds
  }

  /**
   * Отменяет генерацию
   */
  async cancel(predictionId: string): Promise<boolean> {
    // Kie.ai синхронный API, отмена не поддерживается
    return false
  }
}
