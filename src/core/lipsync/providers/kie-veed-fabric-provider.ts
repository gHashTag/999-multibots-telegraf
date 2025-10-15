import axios from 'axios'
import { logger } from '@/utils/logger'
import { KIE_AI_API_KEY, ELEVENLABS_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from '@/config'
import { getVoiceId } from '@/core/supabase/getVoiceId'
import { supabase } from '@/core/supabase'
import { createClient } from '@supabase/supabase-js'
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
   * Генерирует аудио через ElevenLabs и загружает в Supabase Storage
   */
  private async generateAudio(
    text: string,
    voiceId: string,
    telegramId: string
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

      logger.info('✅ Аудио сгенерировано, загружаем в Supabase Storage...')

      // Загружаем в Supabase Storage для получения публичного URL
      const audioBuffer = Buffer.from(response.data)
      const fileName = `lipsync-audio/${telegramId}/${Date.now()}.mp3`

      // ✅ Use service role client to bypass RLS policies
      const serviceClient = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!)

      const { data: uploadData, error: uploadError } = await serviceClient.storage
        .from('images')
        .upload(fileName, audioBuffer, {
          contentType: 'audio/mpeg',
          upsert: false,
        })

      if (uploadError) {
        logger.error('❌ Ошибка загрузки аудио в Supabase', { uploadError })
        return null
      }

      // Получаем публичный URL
      const { data: urlData } = serviceClient.storage
        .from('images')
        .getPublicUrl(fileName)

      logger.info('✅ Аудио загружено в Supabase', {
        fileName,
        publicUrl: urlData.publicUrl,
      })

      return urlData.publicUrl
    } catch (error) {
      logger.error('❌ Ошибка генерации аудио через ElevenLabs', {
        error,
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        errorStack: error instanceof Error ? error.stack : undefined,
      })
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
        hasAudioUrl: !!veedInput.audioUrl,
        hasText: !!veedInput.text,
      })

      // ✅ УЛУЧШЕНО: Если audioUrl уже есть (голосовое сообщение), пропускаем ElevenLabs
      let audioUrl: string

      if (veedInput.audioUrl) {
        // Используем готовый audioUrl от голосового сообщения
        audioUrl = veedInput.audioUrl
        logger.info('🎤 Используем готовое аудио от пользователя', { audioUrl })

      } else {
        // Генерируем аудио через ElevenLabs для текста
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

        // 2. Генерируем аудио через ElevenLabs и загружаем в Supabase
        const generatedAudio = await this.generateAudio(veedInput.text!, voiceId, veedInput.telegramId)
        if (!generatedAudio) {
          return {
            message: 'Failed to generate audio',
            error: 'ElevenLabs audio generation failed',
            code: 'AUDIO_GENERATION_FAILED',
            provider: 'kie',
            modelId: veedInput.modelId,
          }
        }

        audioUrl = generatedAudio
      }

      // 3. Вызываем Kie.ai API для создания lip-sync видео
      logger.info('📤 Отправка запроса в kie.ai', {
        imageUrlLength: veedInput.imageUrl.length,
        audioUrlLength: audioUrl.length,
        resolution: veedInput.resolution || this.config.defaultResolution,
      })

      // ✅ ИСПРАВЛЕНО: Правильный endpoint и формат запроса (асинхронный API)
      const createTaskResponse = await axios.post(
        'https://api.kie.ai/api/v1/jobs/createTask',
        {
          model: 'veed/fabric-1', // ✅ Правильное имя модели
          input: {
            image_url: veedInput.imageUrl,
            audio_url: audioUrl, // ✅ Публичный URL из Supabase Storage
            resolution: veedInput.resolution || this.config.defaultResolution,
          },
        },
        {
          headers: {
            Authorization: `Bearer ${KIE_AI_API_KEY}`,
            'Content-Type': 'application/json',
          },
          timeout: 60000,
        }
      )

      logger.info('📥 Task created, taskId:', {
        status: createTaskResponse.status,
        taskId: createTaskResponse.data.data?.taskId,
        responsePreview: JSON.stringify(createTaskResponse.data).substring(0, 200),
      })

      const taskId = createTaskResponse.data.data?.taskId
      const recordId = createTaskResponse.data.data?.recordId

      if (!taskId && !recordId) {
        return {
          message: 'No taskId or recordId in response',
          error: 'Kie.ai did not return task identifier',
          code: 'NO_TASK_ID',
          provider: 'kie',
          modelId: veedInput.modelId,
        }
      }

      // Use recordId for polling if available, otherwise taskId
      const pollId = recordId || taskId

      // ✅ Poll for task completion (асинхронный API)
      logger.info('⏳ Polling task status...', { taskId, recordId, pollId })

      let attempts = 0
      const maxAttempts = 60 // 5 минут (5сек * 60)
      let videoUrl: string | null = null

      while (attempts < maxAttempts) {
        attempts++

        // Wait 5 seconds between polls
        await new Promise(resolve => setTimeout(resolve, 5000))

        try {
          const statusResponse = await axios.get(
            `https://api.kie.ai/api/v1/jobs/recordInfo?taskId=${pollId}`,
            {
              headers: {
                Authorization: `Bearer ${KIE_AI_API_KEY}`,
              },
              timeout: 30000,
            }
          )

          const taskData = statusResponse.data.data
          const state = taskData?.state

          logger.info(`📊 Task status check #${attempts}`, {
            taskId,
            state,
            completeTime: taskData?.completeTime,
            costTime: taskData?.costTime,
          })

          if (state === 'success') {
            // Parse resultJson to get video URL
            const resultJson = JSON.parse(taskData.resultJson || '{}')
            videoUrl = resultJson.resultUrls?.[0]

            logger.info('✅ Task completed successfully!', {
              taskId,
              videoUrl,
              costTime: taskData.costTime,
              consumeCredits: taskData.consumeCredits,
            })

            break
          } else if (state === 'fail') {
            return {
              message: 'Kie.ai task failed',
              error: taskData.failMsg || 'Unknown error',
              code: taskData.failCode || 'TASK_FAILED',
              provider: 'kie',
              modelId: veedInput.modelId,
            }
          }
          // else state is 'processing' or 'waiting', continue polling
        } catch (pollError) {
          logger.error('❌ Error polling task status', {
            taskId,
            attempt: attempts,
            error: pollError,
          })
          // Continue polling even if one check fails
        }
      }

      if (!videoUrl) {
        return {
          message: 'Task timeout or no video URL',
          error: `Task did not complete after ${attempts} attempts (${attempts * 5}s)`,
          code: 'TASK_TIMEOUT',
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
