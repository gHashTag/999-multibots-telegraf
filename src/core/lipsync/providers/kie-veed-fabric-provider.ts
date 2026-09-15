import axios from 'axios'
import { logger } from '@/utils/logger'
import { KIE_JOBS } from '@/config/kie-jobs'
import {
  KIE_AI_API_KEY,
  ELEVENLABS_API_KEY,
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
} from '@/config'
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
import {
  LIPSYNC_MODELS,
  getLipSyncModelById,
} from '@/config/lipsync-models.config'

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

  constructor(config?: Partial<typeof KieVeedFabricProvider.prototype.config>) {
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
          timeout: 30000, // Уменьшаем timeout до 30 секунд
        }
      )

      logger.info('✅ Аудио сгенерировано, загружаем в Supabase Storage...')

      // Загружаем в Supabase Storage для получения публичного URL
      const audioBuffer = Buffer.from(response.data)
      const fileName = `lipsync-audio/${telegramId}/${Date.now()}.mp3`

      // ✅ Use service role client to bypass RLS policies
      const serviceClient = createClient(
        SUPABASE_URL!,
        SUPABASE_SERVICE_ROLE_KEY!
      )

      const { data: uploadData, error: uploadError } =
        await serviceClient.storage
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
        isTimeout: error instanceof Error && error.message.includes('timeout'),
        isNetworkError:
          error instanceof Error && error.message.includes('Network Error'),
        isApiError:
          error instanceof Error && error.message.includes('Request failed'),
      })

      // Если это timeout или network error, возвращаем специальную ошибку
      if (
        error instanceof Error &&
        (error.message.includes('timeout') ||
          error.message.includes('Network Error'))
      ) {
        throw new Error(`ElevenLabs API timeout: ${error.message}`)
      }

      return null
    }
  }

  /**
   * Генерирует lip-sync видео через Kie.ai Veed Fabric
   */
  async generate(
    input: VeedFabricInput
  ): Promise<LipSyncOutput | LipSyncError> {
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
      let voiceId: string | null = null // Объявляем снаружи для доступа в metadata

      if (veedInput.audioUrl) {
        // Используем готовый audioUrl от голосового сообщения
        audioUrl = veedInput.audioUrl
        logger.info('🎤 Используем готовое аудио от пользователя', { audioUrl })
      } else {
        // Генерируем аудио через ElevenLabs для текста
        // 1. Получаем voice_id пользователя
        voiceId = await getVoiceId(veedInput.telegramId)
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
        const generatedAudio = await this.generateAudio(
          veedInput.text!,
          voiceId,
          veedInput.telegramId
        )
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

      // ✅ ДЕТАЛЬНОЕ ЛОГИРОВАНИЕ: Проверяем URL перед отправкой
      logger.info('🔍 [KIE PROVIDER] Проверка доступности ресурсов', {
        imageUrl: veedInput.imageUrl,
        audioUrl: audioUrl,
        resolution: veedInput.resolution || this.config.defaultResolution,
      })

      // ✅ ИСПРАВЛЕНИЕ: Проверяем доступность image URL с правильными заголовками
      try {
        const imageResponse = await axios.get(veedInput.imageUrl, {
          timeout: 10000,
          responseType: 'stream',
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; LipSync-Bot/1.0)',
          },
        })
        logger.info('✅ [KIE PROVIDER] Image URL доступен', {
          status: imageResponse.status,
          contentType: imageResponse.headers['content-type'],
          contentLength: imageResponse.headers['content-length'],
        })
        // Close the socket-backed stream we only read headers from: an
        // abandoned responseType:'stream' Readable emits 'error' with no listener
        // on a later ECONNRESET -> uncaughtException -> process.exit(1) (all bots).
        // Same as the fallback GET branch below. #1334
        imageResponse.data?.destroy?.()
      } catch (imageError) {
        logger.warn(
          '⚠️ [KIE PROVIDER] Image URL HEAD request failed, trying GET...',
          {
            error:
              imageError instanceof Error
                ? imageError.message
                : 'Unknown error',
            status: (imageError as any).response?.status,
            imageUrl: veedInput.imageUrl.substring(0, 100),
          }
        )

        // ✅ FALLBACK: Если HEAD не работает, пробуем GET запрос (некоторые серверы не поддерживают HEAD)
        try {
          const getResponse = await axios.get(veedInput.imageUrl, {
            timeout: 10000,
            responseType: 'stream',
            headers: {
              'User-Agent': 'Mozilla/5.0 (compatible; LipSync-Bot/1.0)',
            },
          })

          // Прерываем поток сразу после получения заголовков
          getResponse.data.destroy()

          logger.info('✅ [KIE PROVIDER] Image URL доступен через GET', {
            status: getResponse.status,
            contentType: getResponse.headers['content-type'],
            contentLength: getResponse.headers['content-length'],
          })
        } catch (getError) {
          logger.error('❌ [KIE PROVIDER] Image URL полностью недоступен', {
            headError:
              imageError instanceof Error
                ? imageError.message
                : 'Unknown error',
            getError:
              getError instanceof Error ? getError.message : 'Unknown error',
            imageUrl: veedInput.imageUrl.substring(0, 100),
            headStatus: (imageError as any).response?.status,
            getStatus: (getError as any).response?.status,
          })

          // ✅ ОПЦИЯ: Для Supabase URL пробуем альтернативные форматы
          if (veedInput.imageUrl.includes('supabase.co')) {
            logger.info(
              '🔄 [KIE PROVIDER] Supabase URL detected, continuing without validation...'
            )
            // Продолжаем без проверки, так как Supabase может блокировать HEAD запросы
          } else {
            return {
              message: 'Image URL is not accessible',
              error: `Failed to access image: HEAD=${(imageError as any).response?.status || 'timeout'}, GET=${(getError as any).response?.status || 'timeout'}`,
              code: 'IMAGE_URL_INACCESSIBLE',
              provider: 'kie',
              modelId: veedInput.modelId,
            }
          }
        }
      }

      // ✅ ИСПРАВЛЕНИЕ: Проверяем доступность audio URL с fallback
      try {
        const audioResponse = await axios.get(audioUrl, {
          timeout: 10000,
          responseType: 'stream',
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; LipSync-Bot/1.0)',
          },
        })
        logger.info('✅ [KIE PROVIDER] Audio URL доступен', {
          status: audioResponse.status,
          contentType: audioResponse.headers['content-type'],
          contentLength: audioResponse.headers['content-length'],
        })
        // Close the abandoned availability-check stream (see image branch). #1334
        audioResponse.data?.destroy?.()
      } catch (audioError) {
        logger.warn(
          '⚠️ [KIE PROVIDER] Audio URL HEAD request failed, trying GET...',
          {
            error:
              audioError instanceof Error
                ? audioError.message
                : 'Unknown error',
            status: (audioError as any).response?.status,
            audioUrl: audioUrl.substring(0, 100),
          }
        )

        // ✅ FALLBACK: Если HEAD не работает, пробуем GET запрос
        try {
          const getResponse = await axios.get(audioUrl, {
            timeout: 10000,
            responseType: 'stream',
            headers: {
              'User-Agent': 'Mozilla/5.0 (compatible; LipSync-Bot/1.0)',
            },
          })

          // Прерываем поток сразу после получения заголовков
          getResponse.data.destroy()

          logger.info('✅ [KIE PROVIDER] Audio URL доступен через GET', {
            status: getResponse.status,
            contentType: getResponse.headers['content-type'],
            contentLength: getResponse.headers['content-length'],
          })
        } catch (getError) {
          logger.error('❌ [KIE PROVIDER] Audio URL полностью недоступен', {
            headError:
              audioError instanceof Error
                ? audioError.message
                : 'Unknown error',
            getError:
              getError instanceof Error ? getError.message : 'Unknown error',
            audioUrl: audioUrl.substring(0, 100),
            headStatus: (audioError as any).response?.status,
            getStatus: (getError as any).response?.status,
          })

          // ✅ ОПЦИЯ: Для Supabase URL пропускаем проверку
          if (audioUrl.includes('supabase.co')) {
            logger.info(
              '🔄 [KIE PROVIDER] Supabase Audio URL detected, continuing without validation...'
            )
            // Продолжаем без проверки, так как Supabase может блокировать HEAD запросы
          } else {
            return {
              message: 'Audio URL is not accessible',
              error: `Failed to access audio: HEAD=${(audioError as any).response?.status || 'timeout'}, GET=${(getError as any).response?.status || 'timeout'}`,
              code: 'AUDIO_URL_INACCESSIBLE',
              provider: 'kie',
              modelId: veedInput.modelId,
            }
          }
        }
      }

      // ✅ WEBHOOK CALLBACK: Определяем callback URL для асинхронной обработки
      // ИСПРАВЛЕНИЕ: Приоритет LOCAL_SERVER_URL для локального bot-farm сервера
      const callbackUrl = process.env.BASE_WEBHOOK_URL
        ? `${process.env.BASE_WEBHOOK_URL}/api/video-callback`
        : process.env.LOCAL_SERVER_URL
          ? `${process.env.LOCAL_SERVER_URL}/api/video-callback`
          : process.env.API_SERVER_URL
            ? `${process.env.API_SERVER_URL}/api/video-callback`
            : process.env.BASE_WEBHOOK_URL
              ? `${process.env.BASE_WEBHOOK_URL}/api/video-callback`
              : // Ни одной переменной нет — лучше без коллбэка, чем на мёртвый
                // three-head-dragon.shop (188.137.250.69, HTTP 000).
                undefined

      logger.info('🔗 [KIE PROVIDER] Callback URL определен', {
        callback_url: callbackUrl,
        source: process.env.BASE_WEBHOOK_URL
          ? 'BASE_WEBHOOK_URL'
          : process.env.LOCAL_SERVER_URL
            ? 'LOCAL_SERVER_URL'
            : process.env.API_SERVER_URL
              ? 'API_SERVER_URL'
              : 'hardcoded_fallback',
      })

      // ✅ ИСПРАВЛЕНО: Правильный endpoint и формат запроса (асинхронный API) с callback URL
      const requestPayload = {
        model: 'veed/fabric-1', // ✅ Правильное имя модели
        input: {
          image_url: veedInput.imageUrl,
          audio_url: audioUrl, // ✅ Публичный URL из Supabase Storage
          resolution: veedInput.resolution || this.config.defaultResolution,
        },
        // ✅ CALLBACK URL: Добавляем webhook для асинхронного уведомления
        callback_url: callbackUrl,
      }

      logger.info('📤 [KIE PROVIDER] Отправляем запрос в Kie.ai API', {
        endpoint: 'https://api.kie.ai/api/v1/jobs/createTask',
        payload: requestPayload,
        hasApiKey: !!KIE_AI_API_KEY,
        apiKeyPrefix: KIE_AI_API_KEY
          ? KIE_AI_API_KEY.substring(0, 10) + '...'
          : 'MISSING',
      })

      let createTaskResponse
      try {
        createTaskResponse = await axios.post(
          'https://api.kie.ai/api/v1/jobs/createTask',
          requestPayload,
          {
            headers: {
              Authorization: `Bearer ${KIE_AI_API_KEY}`,
              'Content-Type': 'application/json',
            },
            timeout: 60000,
          }
        )

        logger.info('📥 [KIE PROVIDER] Task создан успешно', {
          status: createTaskResponse.status,
          taskId: createTaskResponse.data.data?.taskId,
          recordId: createTaskResponse.data.data?.recordId,
          responseData: createTaskResponse.data,
        })
      } catch (createError) {
        logger.error('❌ [KIE PROVIDER] Ошибка создания task в Kie.ai', {
          error:
            createError instanceof Error
              ? createError.message
              : 'Unknown error',
          status: (createError as any).response?.status,
          statusText: (createError as any).response?.statusText,
          responseData: (createError as any).response?.data,
          requestPayload: requestPayload,
          isTimeout:
            createError instanceof Error &&
            createError.message.includes('timeout'),
          isNetworkError:
            createError instanceof Error &&
            createError.message.includes('Network Error'),
        })

        // Возвращаем детальную ошибку
        const errorStatus = (createError as any).response?.status
        const errorData = (createError as any).response?.data
        const isTimeout =
          createError instanceof Error &&
          createError.message.includes('timeout')

        return {
          message: `Kie.ai API error: ${isTimeout ? 'Timeout' : errorStatus || 'Connection failed'}`,
          error: errorData
            ? JSON.stringify(errorData)
            : createError instanceof Error
              ? createError.message
              : 'Unknown error',
          code: isTimeout
            ? 'TIMEOUT'
            : errorStatus
              ? errorStatus.toString()
              : 'CONNECTION_FAILED',
          provider: 'kie',
          modelId: veedInput.modelId,
        }
      }

      const taskId = createTaskResponse.data.data?.taskId
      const recordId = createTaskResponse.data.data?.recordId

      // ✅ КРИТИЧЕСКОЕ ЛОГИРОВАНИЕ: Показываем что именно вернулось
      console.log('🔴 [KIE DEBUG] Task IDs from createTask response:', {
        taskId,
        recordId,
        rawData: createTaskResponse.data.data,
        willUse: recordId || taskId,
        preferringRecordId: !!recordId,
      })

      if (!taskId && !recordId) {
        return {
          message: 'No taskId or recordId in response',
          error: 'Kie.ai did not return task identifier',
          code: 'NO_TASK_ID',
          provider: 'kie',
          modelId: veedInput.modelId,
        }
      }

      const finalTaskId = recordId || taskId

      console.log('🔴 [KIE DEBUG] Using finalTaskId for webhook correlation:', {
        finalTaskId,
        source: recordId ? 'recordId' : 'taskId',
      })

      // ✅ WEBHOOK MODE: Возвращаем немедленно с taskId для асинхронной обработки
      logger.info('🔗 [KIE PROVIDER] Task создан, ожидание webhook callback', {
        taskId: finalTaskId,
        callbackUrl,
        message: 'Task будет обработан асинхронно через webhook',
      })

      // Возвращаем результат с taskId для AsyncLipSyncManager
      return {
        id: finalTaskId, // ✅ Указываем что результат pending
        taskId: finalTaskId, // ✅ Сохраняем taskId для webhook correlation
        output: '', // Пустой до получения webhook
        modelUsed: 'Veed Fabric AI',
        provider: 'kie',
        status: 'processing', // ✅ Статус processing до webhook
        message: 'Task started, awaiting webhook notification',
      }
    } catch (error) {
      logger.error('❌ [KIE PROVIDER] Критическая ошибка', {
        error: error instanceof Error ? error.message : 'Unknown error',
        telegramId: input.telegramId,
        modelId: input.modelId,
      })

      return {
        message: 'Critical error in Veed Fabric provider',
        error: error instanceof Error ? error.message : 'Unknown error',
        code: 'CRITICAL_ERROR',
        provider: 'kie',
        modelId: input.modelId,
      }
    }
  }

  /**
   * Получает статус обработки
   * ✅ ИСПРАВЛЕНО: Kie.ai использует АСИНХРОННЫЙ API с webhook callback
   * Этот метод для fallback проверки, если webhook не пришел
   */
  async getStatus(predictionId: string): Promise<LipSyncOutput | LipSyncError> {
    try {
      // ✅ ДЕТАЛЬНОЕ ЛОГИРОВАНИЕ: Проверка перед запросом
      const statusUrl = `${KIE_JOBS.BASE_URL}${KIE_JOBS.RECORD_INFO}`

      logger.info('🔍 [KIE PROVIDER] Проверка статуса задачи', {
        taskId: predictionId,
        hasApiKey: !!KIE_AI_API_KEY,
        apiKeyPrefix: KIE_AI_API_KEY?.substring(0, 10) + '...',
        endpoint: statusUrl,
      })

      console.log('🔴 [KIE DEBUG] Full getStatus() request details:', {
        taskId: predictionId,
        recordId: predictionId,
        url: statusUrl,
        hasAuthHeader: !!KIE_AI_API_KEY,
      })

      const response = await axios.get(statusUrl, {
        params: {
          taskId: predictionId,
          recordId: predictionId,
        },
        headers: {
          Authorization: `Bearer ${KIE_AI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        timeout: 30000,
      })

      console.log('🔴 [KIE DEBUG] getStatus() response received:', {
        status: response.status,
        statusText: response.statusText,
        hasData: !!response.data,
        dataKeys: response.data ? Object.keys(response.data) : [],
      })

      logger.info('📥 [KIE PROVIDER] Получен статус задачи', {
        status: response.status,
        data: response.data,
      })

      const data = response.data.data || response.data

      // Kie's job-status query returns a unified shape: data.state
      // ('waiting'|'queuing'|'generating'|'success'|'fail'), the result URLs
      // inside the JSON string data.resultJson, and failures in data.failMsg --
      // the same shape the sibling poller wan25-helpers.ts reads against the
      // very same endpoint. The successFlag / resultUrls / errorMsg fields this
      // method used to read belong to the WEBHOOK callback payload, NOT this
      // query response, so every real terminal state fell through to the final
      // 'processing' fallback: on a lost delivery webhook the fallback poll
      // never delivered a completed job nor failed a failed one, running to the
      // 10-min timeout that refunds a job Kie had actually produced.
      const state = data.state

      // ✅ Success: the URL lives inside the resultJson string.
      if (state === 'success') {
        let videoUrl = ''
        try {
          const resultJson = data.resultJson ? JSON.parse(data.resultJson) : {}
          const urls = resultJson.resultUrls
          videoUrl = Array.isArray(urls) ? urls[0] || '' : urls || ''
        } catch {
          logger.error('❌ [KIE PROVIDER] resultJson parse failed', {
            taskId: predictionId,
            resultJson: data.resultJson,
          })
        }

        if (videoUrl) {
          logger.info('✅ [KIE PROVIDER] Задача завершена успешно', {
            taskId: predictionId,
            videoUrl,
          })

          return {
            id: predictionId,
            taskId: predictionId,
            output: videoUrl,
            modelUsed: 'Veed Fabric AI',
            provider: 'kie',
            status: 'completed',
            message: 'Task completed successfully',
          }
        }
        // success but no parseable URL yet: fall through to 'processing' and
        // keep polling rather than refunding a job that actually succeeded.
      }

      // ✅ Если произошла ошибка на стороне Kie.ai
      if (state === 'fail') {
        logger.error('❌ [KIE PROVIDER] Ошибка обработки задачи', {
          taskId: predictionId,
          error: data.failMsg || data.failCode,
        })

        return {
          message: 'Task failed on Kie.ai side',
          error: data.failMsg || data.failCode || 'Unknown error',
          code: 'TASK_FAILED',
          provider: 'kie',
          modelId: 'veed-fabric',
        }
      }

      // ✅ Task still in flight (waiting / queuing / generating / unknown).
      logger.info('⏳ [KIE PROVIDER] Задача еще в процессе', {
        taskId: predictionId,
        state,
      })

      return {
        id: predictionId,
        taskId: predictionId,
        output: '',
        modelUsed: 'Veed Fabric AI',
        provider: 'kie',
        status: 'processing',
        message: 'Task is still processing',
      }
    } catch (error) {
      // ✅ КРИТИЧЕСКОЕ ЛОГИРОВАНИЕ: Детали ошибки API запроса
      const errorStatus = (error as any).response?.status
      const errorData = (error as any).response?.data
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error'
      const isAxiosError = (error as any).isAxiosError === true
      const isTimeout = errorMessage.includes('timeout')
      const isNetworkError = errorMessage.includes('Network Error')

      console.log('🔴🔴🔴 [KIE CRITICAL ERROR] getStatus() failed:', {
        taskId: predictionId,
        errorMessage,
        isAxiosError,
        isTimeout,
        isNetworkError,
        httpStatus: errorStatus,
        httpStatusText: (error as any).response?.statusText,
        responseData: errorData,
        requestUrl: (error as any).config?.url,
        requestParams: (error as any).config?.params,
        hasAuthHeader: !!(error as any).config?.headers?.Authorization,
      })

      logger.error('❌ [KIE PROVIDER] Ошибка при проверке статуса', {
        taskId: predictionId,
        error: errorMessage,
        status: errorStatus,
        statusText: (error as any).response?.statusText,
        data: errorData,
        isTimeout,
        isNetworkError,
        fullError: isAxiosError
          ? {
              message: errorMessage,
              code: (error as any).code,
              response: {
                status: errorStatus,
                data: errorData,
              },
            }
          : errorMessage,
      })

      return {
        message: 'Failed to check task status',
        error: errorMessage,
        code: 'STATUS_CHECK_FAILED',
        provider: 'kie',
        modelId: 'veed-fabric',
      }
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
   * Генерирует lip-sync (для совместимости с интерфейсом)
   */
  async generateLipSync(params: any): Promise<any> {
    return this.generate(params)
  }

  /**
   * Отменяет генерацию
   */
  async cancel(predictionId: string): Promise<boolean> {
    // Kie.ai синхронный API, отмена не поддерживается
    return false
  }
}
