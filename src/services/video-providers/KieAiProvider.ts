import axios, { AxiosError } from 'axios'
import { logger } from '@/utils/logger'
import { getAvailableCallbackUrl } from '@/utils/webhookHealthCheck'
import { inngest } from '@/inngest_app/client'
import { KIE_JOBS, readKieJobRecord } from '@/config/kie-jobs'

interface KieAiCredits {
  credits: number
}

interface KieAiApiResponse<T> {
  code: number
  msg: string
  data: T
}

interface KieAiVideoRequest {
  model: string
  prompt: string
  duration?: number
  aspectRatio?: '16:9' | '9:16' | '1:1'
  imageUrl?: string
  telegram_id?: string | number
}

interface KieAiVideoResponse {
  success: boolean
  data?: {
    videoUrl: string
    duration: number
    taskId?: string
  }
  cost: {
    usd: number
    stars: number
  }
  provider: string
  model: string
  processingTime?: number
  error?: string
}

interface SoraCreateTaskRequest {
  model:
    | 'sora-2-text-to-video'
    | 'sora-2-pro-text-to-video'
    | 'sora-2-image-to-video'
    | 'sora-2-pro-image-to-video'
  callBackUrl?: string
  input: {
    prompt?: string // Optional for image-to-video
    image_urls?: string[] // For image-to-video
    aspect_ratio?: 'landscape' | 'portrait'
    remove_watermark?: boolean
    n_frames?: '10' | '15' // Required for Pro models
    size?: 'standard' | 'high' // Video quality
  }
}

interface SoraCreateTaskResponse {
  code: number
  msg: string
  data: {
    taskId: string
  }
}

interface SoraTaskStatusResponse {
  code: number
  msg: string
  data: {
    taskId: string
    status: 'pending' | 'processing' | 'completed' | 'failed'
    successFlag?: number
    videoUrl?: string
    resultUrls?: string[]
    errorMessage?: string
    duration?: number
  }
}

interface KieAiImageRequest {
  model: string
  prompt: string
  width?: number
  height?: number
  numImages?: number
  style?: string
  imageUrl?: string
}

interface KieAiImageResponse {
  success: boolean
  data?: {
    imageUrls: string[]
  }
  cost: {
    usd: number
    stars: number
  }
  provider: string
  model: string
  processingTime?: number
  error?: string
}

interface KieAiMusicRequest {
  model: string
  prompt: string
  duration?: number
  genre?: string
  lyrics?: string
  instrumental?: boolean
}

interface KieAiMusicResponse {
  success: boolean
  data?: {
    audioUrl: string
    duration: number
  }
  cost: {
    usd: number
    stars: number
  }
  provider: string
  model: string
  processingTime?: number
  error?: string
}

export class KieAiProvider {
  private apiKey: string
  private baseUrl = 'https://api.kie.ai/api/v1'
  private timeout = 300000 // 5 minutes
  private maxRetries = 3

  constructor() {
    this.apiKey = process.env.KIE_AI_API_KEY || ''
    if (!this.apiKey) {
      console.warn(
        '⚠️  KIE_AI_API_KEY not provided - provider will work in test mode only'
      )
    }
  }

  private async makeRequest<T>(
    endpoint: string,
    data: any,
    retryCount = 0
  ): Promise<T> {
    try {
      const startTime = Date.now()

      const response = await axios.post(`${this.baseUrl}${endpoint}`, data, {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: this.timeout,
      })

      const processingTime = Date.now() - startTime

      logger.info(`🎬 Veo 3 API request successful`, {
        endpoint,
        processingTime,
        model: data.model,
        provider: 'Veo 3 API',
      })

      return { ...response.data, processingTime }
    } catch (error) {
      if (
        retryCount < this.maxRetries &&
        this.shouldRetry(error as AxiosError)
      ) {
        const delay = Math.pow(2, retryCount) * 1000 // Exponential backoff
        logger.warn(
          `🔄 Retrying Veo 3 API request in ${delay}ms (attempt ${
            retryCount + 1
          }/${this.maxRetries})`
        )

        await new Promise(resolve => setTimeout(resolve, delay))
        return this.makeRequest<T>(endpoint, data, retryCount + 1)
      }

      this.handleError(error as AxiosError, endpoint)
      throw error
    }
  }

  private shouldRetry(error: AxiosError): boolean {
    // Retry on temporary network errors or rate limits
    return (
      !error.response ||
      error.response.status === 429 ||
      error.response.status >= 500
    )
  }

  private handleError(error: AxiosError, endpoint: string): void {
    const errorCode = error.response?.status
    const errorMessage = error.response?.data || error.message

    logger.error(`❌ Veo 3 API error`, {
      endpoint,
      errorCode,
      errorMessage,
      provider: 'Veo 3 API',
    })
  }

  async getAccountBalance(): Promise<KieAiCredits> {
    if (!this.apiKey) {
      throw new Error('KIE_AI_API_KEY is required for account balance check')
    }

    try {
      const response = await axios.get(`${this.baseUrl}/chat/credit`, {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
      })

      const apiResponse: KieAiApiResponse<number> = response.data

      if (apiResponse.code !== 200) {
        throw new Error(`API Error: ${apiResponse.msg}`)
      }

      return { credits: apiResponse.data }
    } catch (error) {
      logger.error('Failed to get Veo 3 API account balance', { error })
      throw error
    }
  }

  async generateVideo(request: KieAiVideoRequest): Promise<KieAiVideoResponse> {
    if (!this.apiKey) {
      return {
        success: false,
        cost: { usd: 0, stars: 0 },
        provider: 'Kie.ai',
        model: request.model,
        error: 'KIE_AI_API_KEY is required for video generation',
      }
    }

    const {
      model,
      prompt,
      duration = 5,
      aspectRatio = '16:9',
      imageUrl,
    } = request

    // Определяем провайдера на основе модели
    const isSoraModel = model.includes('sora')
    const isVeoModel = model.includes('veo')
    const isRunwayModel = model.includes('runway')
    const isWanModel = model.includes('wan')

    // Преобразуем название модели в формат Kie.ai
    let kieModel = model
    let provider = 'Kie.ai'
    let endpoint = '/veo/generate'

    if (isSoraModel) {
      // ✅ FIX: Проверяем imageUrl ПЕРВЫМ (до общих условий)
      // Sora 2 Image-to-Video
      if ((model === 'sora-2' || model === 'sora2') && imageUrl) {
        kieModel = 'sora-2-image-to-video'
        provider = 'Sora 2 I2V API'
        endpoint = '/jobs/createTask'
        logger.info('[KieAiProvider] Sora 2 Image-to-Video selected:', {
          originalModel: model,
          selectedModel: kieModel,
          hasImage: !!imageUrl,
          mode: 'image-to-video',
          expectedCost: '~9 stars per 10sec',
        })
      }
      // Sora 2 Text-to-Video
      else if (
        model === 'sora-2' ||
        model === 'sora2' ||
        model === 'sora-2-text-to-video'
      ) {
        kieModel = 'sora-2-text-to-video'
        provider = 'Sora 2 API'
        endpoint = '/sora/generate'
        logger.info('[KieAiProvider] Sora 2 Text-to-Video selected:', {
          originalModel: model,
          selectedModel: kieModel,
          hasImage: !!imageUrl,
          mode: 'text-to-video',
          expectedCost: '~9 stars per 10sec',
        })
      }
      // Sora 2 Pro Image-to-Video
      else if ((model === 'sora-2-pro' || model === 'sora2-pro') && imageUrl) {
        kieModel = 'sora-2-pro-image-to-video'
        provider = 'Sora 2 Pro I2V API'
        endpoint = '/jobs/createTask'
        logger.info('[KieAiProvider] Sora 2 Pro Image-to-Video selected:', {
          originalModel: model,
          selectedModel: kieModel,
          hasImage: !!imageUrl,
          mode: 'image-to-video',
          expectedCost: '~19 stars per 10sec',
        })
      }
      // Sora 2 Pro Text-to-Video
      else if (
        model === 'sora-2-pro' ||
        model === 'sora2-pro' ||
        model === 'sora-2-pro-text-to-video'
      ) {
        kieModel = 'sora-2-pro-text-to-video'
        provider = 'Sora 2 Pro API'
        endpoint = '/sora/generate'
        logger.info('[KieAiProvider] Sora 2 Pro Text-to-Video selected:', {
          originalModel: model,
          selectedModel: kieModel,
          hasImage: !!imageUrl,
          mode: 'text-to-video',
          expectedCost: '~19 stars per 10sec',
        })
      }
      // LEGACY: Handle old model names (обратная совместимость)
      else if (model === 'sora-2-i2v' || model === 'sora-2-image-to-video') {
        kieModel = 'sora-2-image-to-video'
        provider = 'Sora 2 I2V API'
        endpoint = '/jobs/createTask'
        logger.info('[KieAiProvider] Sora 2 I2V (legacy) selected:', {
          originalModel: model,
          selectedModel: kieModel,
          hasImage: !!imageUrl,
          mode: 'image-to-video',
        })
      } else if (
        model === 'sora-2-pro-i2v' ||
        model === 'sora-2-pro-image-to-video'
      ) {
        // ✅ LEGACY: Handle old model names (обратная совместимость)
        kieModel = 'sora-2-pro-image-to-video'
        provider = 'Sora 2 Pro I2V API'
        endpoint = '/jobs/createTask'
        logger.info('[KieAiProvider] Sora 2 Pro I2V (legacy) selected:', {
          originalModel: model,
          selectedModel: kieModel,
          hasImage: !!imageUrl,
          mode: 'image-to-video',
          expectedCost: '~280 stars per 10sec',
        })
      }
    } else if (model === 'veo3_fast') {
      // ВСЕГДА используем veo3_fast для Veo 3 Fast (и для text-to-video, и для image-to-video)
      kieModel = 'veo3_fast'
      provider = 'Veo 3 Fast API'
      logger.info('[KieAiProvider] Veo 3 Fast selected:', {
        originalModel: model,
        selectedModel: kieModel,
        hasImage: !!imageUrl,
        mode: imageUrl ? 'image-to-video' : 'text-to-video',
        expectedCost: '40 stars',
      })
    } else if (model === 'veo3') {
      // Для обычной Veo 3 используем veo3
      kieModel = 'veo3'
      provider = 'Veo 3 API'
      logger.info('[KieAiProvider] Veo 3 selected:', {
        originalModel: model,
        selectedModel: kieModel,
        hasImage: !!imageUrl,
        mode: imageUrl ? 'image-to-video' : 'text-to-video',
        expectedCost: '120 stars',
      })
    } else if (model === 'runway-aleph') {
      kieModel = 'runway_aleph'
      provider = 'Runway API'
    } else if (isWanModel) {
      // WAN 2.5 models use Jobs API
      if (model === 'wan-2.5-t2v') {
        kieModel = 'wan/2-5-text-to-video'
        provider = 'WAN 2.5 API'
        endpoint = '/jobs/createTask'
        logger.info('[KieAiProvider] WAN 2.5 T2V selected:', {
          originalModel: model,
          selectedModel: kieModel,
          mode: 'text-to-video',
          duration: duration || 5,
        })
      } else if (model === 'wan-2.5-i2v') {
        kieModel = 'wan/2-5-image-to-video'
        provider = 'WAN 2.5 API'
        endpoint = '/jobs/createTask'
        logger.info('[KieAiProvider] WAN 2.5 I2V selected:', {
          originalModel: model,
          selectedModel: kieModel,
          hasImage: !!imageUrl,
          mode: 'image-to-video',
          duration: duration || 5,
        })
      }
    }

    // ✅ FIX: Handle async generation models using Jobs API
    if (endpoint === '/jobs/createTask') {
      logger.info('[KieAiProvider] Using jobs API for async generation:', {
        model: kieModel,
        hasImage: !!imageUrl,
        promptLength: prompt.length,
      })

      // Delegate to generateSoraVideo method for Sora models
      if (isSoraModel) {
        // ✅ CRITICAL: Validate webhook before generation
        if (request.telegram_id) {
          await inngest.send({
            name: 'video/generation-validate-webhook',
            data: {
              telegramId: request.telegram_id,
              modelId: model,
              provider: 'Kie.ai',
            },
          })
        }

        return await this.generateSoraVideo(
          prompt,
          kieModel as any,
          aspectRatio === '9:16' ? 'portrait' : 'landscape',
          true, // removeWatermark - по умолчанию БЕЗ ватермарки
          10, // duration
          'standard', // size
          imageUrl,
          request.telegram_id // ✅ Передаём telegram_id для callback URL
        )
      }
    }

    // ✅ FIX: Handle WAN models separately using /jobs/createTask
    if (endpoint === '/jobs/createTask') {
      logger.info('[KieAiProvider] Using WAN Jobs API:', {
        model: kieModel,
        hasImage: !!imageUrl,
        promptLength: prompt.length,
        duration: duration || 5,
        resolution: '720p',
      })

      // 🛡️ BULLETPROOF: Validate webhook availability before sending request
      if (request.telegram_id) {
        await inngest.send({
          name: 'video/generation-validate-webhook',
          data: {
            telegramId: request.telegram_id,
            modelId: model,
            provider: 'Kie.ai',
          },
        })
      }

      const callbackUrl = await getAvailableCallbackUrl(request.telegram_id)

      // WAN 2.5 имеет лимит на длину промпта - обрезаем до 500 символов
      const maxPromptLength = 500
      const truncatedPrompt =
        prompt.length > maxPromptLength
          ? prompt.substring(0, maxPromptLength) + '...'
          : prompt

      if (prompt.length > maxPromptLength) {
        logger.warn('[KieAiProvider] Prompt truncated for WAN API:', {
          originalLength: prompt.length,
          truncatedLength: truncatedPrompt.length,
          maxLength: maxPromptLength,
        })
      }

      const wanRequestData: any = {
        model: kieModel,
        input: {
          prompt: truncatedPrompt,
          duration: String(duration || 5), // "5" или "10"
          resolution: '720p', // "720p" или "1080p"
          enable_prompt_expansion: true,
        },
      }

      // Для I2V добавляем изображение
      if (imageUrl && model === 'wan-2.5-i2v') {
        wanRequestData.input.image_url = imageUrl
      }

      if (callbackUrl) {
        wanRequestData.callBackUrl = callbackUrl
      }

      logger.info('[KieAiProvider] WAN request data prepared:', {
        model: wanRequestData.model,
        inputKeys: Object.keys(wanRequestData.input),
        hasCallback: !!callbackUrl,
        duration: wanRequestData.input.duration,
        resolution: wanRequestData.input.resolution,
      })

      try {
        const response = await this.makeRequest<
          KieAiApiResponse<{ taskId: string }>
        >(endpoint, wanRequestData)

        logger.info('[KieAiProvider] WAN API response received:', {
          hasData: !!response.data,
          taskId: response.data?.taskId,
          code: response.code,
        })

        // ✅ Проверяем code ПЕРЕД проверкой data
        if (response.code !== 200) {
          logger.error('[KieAiProvider] WAN API returned error code:', {
            code: response.code,
            msg: response.msg,
            isInsufficientCredits: response.code === 402,
          })

          return {
            success: false,
            error: `${response.msg || 'WAN API error'} (code: ${response.code})`,
            cost: { usd: 0, stars: 0 },
            provider: 'WAN 2.5 API',
            model: kieModel,
          } as KieAiVideoResponse
        }

        // WAN Jobs API возвращает taskId для асинхронной генерации
        if (response.data && response.data.taskId) {
          return {
            success: true,
            data: {
              taskId: response.data.taskId,
              videoUrl: '', // Видео будет готово позже
              duration: duration || 5,
            },
            cost: {
              usd: 0.32, // Минимальная цена для WAN 2.5 (720p 5s)
              stars: 19,
            },
            provider: 'WAN 2.5 API',
            model: kieModel,
          }
        }

        logger.error('[KieAiProvider] WAN API returned unexpected format:', {
          responseData: response,
        })

        return {
          success: false,
          error: 'WAN API returned unexpected response format',
          cost: { usd: 0, stars: 0 },
          provider: 'WAN 2.5 API',
          model: kieModel,
        }
      } catch (error: any) {
        logger.error('[KieAiProvider] WAN API request failed:', {
          error: error.message,
          response: error.response?.data,
          status: error.response?.status,
        })

        return {
          success: false,
          error: error.response?.data?.msg || error.message,
          cost: { usd: 0, stars: 0 },
          provider: 'WAN 2.5 API',
          model: kieModel,
        }
      }
    }

    // 🛡️ BULLETPROOF: Validate webhook availability BEFORE sending request to Kie.ai
    if (request.telegram_id) {
      await inngest.send({
        name: 'video/generation-validate-webhook',
        data: {
          telegramId: request.telegram_id,
          modelId: model,
          provider: 'Kie.ai',
        },
      })
    }

    const callbackUrl = await getAvailableCallbackUrl(request.telegram_id)

    if (!callbackUrl) {
      logger.warn(
        '[KieAiProvider] No webhook URLs available - webhook notifications will not work'
      )
    } else {
      logger.info('[KieAiProvider] Using callback URL', {
        url: callbackUrl.substring(0, 50) + '...',
        hasTelegramId: !!request.telegram_id,
      })
    }

    const requestData: any = {
      model: kieModel,
      prompt, // Отправляем ПОЛНЫЙ промпт без обрезки
      aspectRatio: aspectRatio,
      enableFallback: true,
      enableTranslation: true,
      // Добавляем callbackUrl для webhook уведомлений
      callBackUrl: callbackUrl,
    }

    // Логируем полный промпт для отладки
    logger.info('[KieAiProvider] Sending full prompt to Veo 3 API:', {
      model: kieModel,
      promptLength: prompt.length,
      aspectRatio: aspectRatio,
      mode: imageUrl ? 'image-to-video' : 'text-to-video',
      hasImageUrl: !!imageUrl,
      imageUrlValue: imageUrl || 'no image provided',
      callbackUrl: callbackUrl, // Логируем callback URL
    })

    // Только добавляем изображение если оно есть (для image-to-video)
    if (imageUrl) {
      // Пробуем разные форматы для Kie.ai API
      requestData.imageUrls = [imageUrl]

      // Для imageKey пробуем извлечь file_id из Telegram URL
      let imageKey = imageUrl
      if (imageUrl.includes('telegram.org')) {
        // Извлекаем file_id из Telegram URL
        const urlParts = imageUrl.split('/')
        const fileName = urlParts[urlParts.length - 1]
        if (fileName && fileName.includes('.')) {
          imageKey = fileName.split('.')[0] // Берем только file_id без расширения
        }
      } else {
        // Для других URL используем последний сегмент пути
        const urlParts = imageUrl.split('/')
        imageKey = urlParts[urlParts.length - 1]?.split('.')[0] || imageUrl
      }

      requestData.imageKey = imageKey

      logger.info('[KieAiProvider] Image parameters added to request:', {
        imageUrlsCount: requestData.imageUrls.length,
        firstImageUrl: imageUrl.substring(0, 100) + '...',
        imageKey: imageKey,
        extractedFromTelegram: imageUrl.includes('telegram.org'),
        usingDualFormat: true,
      })
    } else {
      logger.info('[KieAiProvider] Text-to-video mode - no image needed')
    }

    // Логируем полный request перед отправкой
    logger.info('[KieAiProvider] Full request data to Kie.ai API:', {
      model: kieModel,
      hasPrompt: !!requestData.prompt,
      promptLength: requestData.prompt?.length || 0,
      hasImageUrls: !!requestData.imageUrls && requestData.imageUrls.length > 0,
      imageUrlsCount: requestData.imageUrls?.length || 0,
      firstImageUrl:
        requestData.imageUrls?.[0]?.substring(0, 100) + '...' || 'none',
      hasImageKey: !!requestData.imageKey,
      imageKey: requestData.imageKey || 'none',
      aspectRatio: requestData.aspectRatio,
      enableFallback: requestData.enableFallback,
      enableTranslation: requestData.enableTranslation,
      hasCallbackUrl: !!requestData.callBackUrl,
      callbackUrl: requestData.callBackUrl,
      requestKeys: Object.keys(requestData),
    })

    try {
      const response = await this.makeRequest<any>(
        endpoint, // Use dynamic endpoint based on model
        requestData
      )

      // Calculate cost based on model and duration
      const costUSD = this.calculateVideoCost(model, duration)
      const costStars = this.usdToStars(costUSD)

      logger.info('[KieAiProvider] Cost calculation:', {
        model,
        kieModel,
        duration,
        costUSD,
        costStars,
        pricePerSecond: costUSD / duration,
      })

      logger.info('[KieAiProvider] Veo generate response:', {
        responseKeys: Object.keys(response),
        code: response.code,
        msg: response.msg,
        hasData: !!response.data,
        dataKeys: response.data ? Object.keys(response.data) : [],
      })

      // Проверяем успешность запроса
      if (response.code !== 200) {
        throw new Error(response.msg || 'Failed to generate video')
      }

      // Обрабатываем различные форматы ответа
      const taskId = response.data?.taskId || response.taskId
      const videoUrl = response.data?.videoUrl || response.data?.resultUrls?.[0]

      return {
        success: true,
        data: {
          videoUrl: videoUrl,
          duration: duration,
          taskId: taskId,
        },
        cost: {
          usd: costUSD,
          stars: costStars,
        },
        provider: provider,
        model,
        processingTime: response.processingTime,
      }
    } catch (error) {
      return {
        success: false,
        cost: {
          usd: 0,
          stars: 0,
        },
        provider: provider,
        model,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }

  async generateImage(request: KieAiImageRequest): Promise<KieAiImageResponse> {
    const {
      model,
      prompt,
      width = 1024,
      height = 1024,
      numImages = 1,
      style,
      imageUrl,
    } = request

    const requestData: any = {
      model,
      prompt,
      width,
      height,
      num_images: numImages,
    }

    if (style) {
      requestData.style = style
    }

    if (imageUrl) {
      requestData.image_url = imageUrl
    }

    try {
      const response = await this.makeRequest<any>(
        '/image/generate',
        requestData
      )

      const costUSD = this.calculateImageCost(model, numImages)
      const costStars = this.usdToStars(costUSD)

      return {
        success: true,
        data: {
          imageUrls: Array.isArray(response.images)
            ? response.images
            : [response.image_url],
        },
        cost: {
          usd: costUSD,
          stars: costStars,
        },
        provider: 'Veo 3 API',
        model,
        processingTime: response.processingTime,
      }
    } catch (error) {
      return {
        success: false,
        cost: {
          usd: 0,
          stars: 0,
        },
        provider: 'Veo 3 API',
        model,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }

  async checkVideoStatus(taskId: string): Promise<KieAiVideoResponse> {
    try {
      const response = await axios.get(`${this.baseUrl}/veo/record-info`, {
        params: { taskId },
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: this.timeout,
      })

      logger.info('[KieAiProvider] Veo status check response:', {
        code: response.data.code,
        msg: response.data.msg,
        successFlag: response.data.data?.successFlag,
        hasResultUrls: !!response.data.data?.response?.resultUrls,
        fullResponse: response.data,
      })

      if (response.data.code !== 200) {
        throw new Error(response.data.msg || 'Failed to check video status')
      }

      const data = response.data.data

      // ✅ Нормализация successFlag: поддерживаем числа (1,2,3,0) и булевы значения (true/false)
      let normalizedSuccessFlag: number
      if (data.successFlag !== undefined) {
        if (typeof data.successFlag === 'boolean') {
          normalizedSuccessFlag = data.successFlag ? 1 : 2
        } else if (typeof data.successFlag === 'number') {
          normalizedSuccessFlag = data.successFlag
        } else {
          // Неизвестный тип - считаем ошибкой
          normalizedSuccessFlag = 2
        }
      } else {
        // Если successFlag не указан, считаем успехом если code === 200
        normalizedSuccessFlag = response.data.code === 200 ? 1 : 2
      }

      // Проверяем различные форматы ответа
      if (normalizedSuccessFlag === 1) {
        // Видео готово - проверяем разные форматы URL
        const videoUrl =
          data.response?.resultUrls?.[0] ||
          data.response?.result_url ||
          data.resultUrls?.[0] ||
          data.result_url

        if (videoUrl) {
          logger.info('[KieAiProvider] Video is ready!', { taskId, videoUrl })
          return {
            success: true,
            data: {
              videoUrl: videoUrl,
              duration: data.response?.duration || data.duration || 8,
              taskId: taskId,
            },
            cost: { usd: 0, stars: 0 },
            provider: 'Veo 3 API',
            model: 'veo3',
          }
        } else {
          logger.warn(
            '[KieAiProvider] Video marked as ready but no URL found',
            { taskId, data }
          )
          throw new Error('Video marked as ready but no video URL provided')
        }
      } else if (normalizedSuccessFlag === 0) {
        // Still processing
        logger.info('[KieAiProvider] Video still processing', { taskId })
        return {
          success: true,
          data: {
            videoUrl: undefined,
            duration: 8,
            taskId: taskId,
          },
          cost: { usd: 0, stars: 0 },
          provider: 'Veo 3 API',
          model: 'veo3',
        }
      } else if (normalizedSuccessFlag === 3) {
        // Ошибка политики контента Google
        logger.error(
          '[KieAiProvider] Video generation rejected by content policy',
          { taskId, errorCode: data.errorCode, errorMessage: data.errorMessage }
        )
        throw new Error(
          data.errorMessage ||
            'Content rejected by Google policy. Please try different prompt or image.'
        )
      } else if (normalizedSuccessFlag === 2) {
        // Ошибка генерации
        logger.error('[KieAiProvider] Video generation failed', {
          taskId,
          data,
        })
        throw new Error(
          data.errorMessage ||
            data.response?.errorMessage ||
            'Video generation failed'
        )
      } else {
        logger.warn('[KieAiProvider] Unknown successFlag value', {
          taskId,
          successFlag: data.successFlag,
          normalizedSuccessFlag,
        })
        // Продолжаем polling для неизвестных статусов
        return {
          success: true,
          data: {
            videoUrl: undefined,
            duration: 8,
            taskId: taskId,
          },
          cost: { usd: 0, stars: 0 },
          provider: 'Veo 3 API',
          model: 'veo3',
        }
      }
    } catch (error) {
      logger.error('[KieAiProvider] Error checking video status', {
        taskId,
        error,
      })
      return {
        success: false,
        cost: { usd: 0, stars: 0 },
        provider: 'Veo 3 API',
        model: 'veo3',
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }

  /**
   * Generate Sora 2 video using job-based flow
   * Supports both text-to-video and image-to-video
   * Pricing: 30 credits ($0.15) per 10 seconds (Sora 2), 90 credits ($0.45) per 10 seconds (Sora 2 Pro)
   * @param prompt - Text prompt for video generation (optional for image-to-video)
   * @param model - Sora model variant
   * @param aspectRatio - Video aspect ratio ('landscape' or 'portrait')
   * @param removeWatermark - Whether to remove watermark (default: false)
   * @param duration - Video duration in seconds (10 or 15)
   * @param size - Video quality ('standard' or 'high')
   * @param imageUrl - Image URL for image-to-video (optional)
   * @returns KieAiVideoResponse with taskId for polling
   */
  async generateSoraVideo(
    prompt: string = '',
    model:
      | 'sora-2-text-to-video'
      | 'sora-2-pro-text-to-video'
      | 'sora-2-image-to-video'
      | 'sora-2-pro-image-to-video' = 'sora-2-text-to-video',
    aspectRatio: 'landscape' | 'portrait' = 'landscape',
    removeWatermark: boolean = true,
    duration: 10 | 15 = 10,
    size: 'standard' | 'high' = 'standard',
    imageUrl?: string,
    telegram_id?: string | number
  ): Promise<KieAiVideoResponse> {
    if (!this.apiKey) {
      return {
        success: false,
        cost: { usd: 0, stars: 0 },
        provider: 'Kie.ai Sora 2',
        model,
        error: 'KIE_AI_API_KEY is required for Sora video generation',
      }
    }

    const startTime = Date.now()
    const isImageToVideo = model.includes('image-to-video')
    const isPro = model.includes('pro')
    const provider = isPro ? 'Sora 2 Pro API' : 'Sora 2 API'

    // 🛡️ BULLETPROOF: Check webhook availability BEFORE sending Sora request
    const callbackUrl = await getAvailableCallbackUrl(telegram_id)

    const requestData: SoraCreateTaskRequest = {
      model,
      input: {
        aspect_ratio: aspectRatio,
        remove_watermark: removeWatermark,
        n_frames: duration.toString() as '10' | '15',
        size: size,
      },
    }

    // Добавляем prompt или image_urls в зависимости от типа
    if (isImageToVideo) {
      if (!imageUrl) {
        throw new Error('imageUrl is required for image-to-video models')
      }
      requestData.input.image_urls = [imageUrl]
      // Для image-to-video промпт опционален
      if (prompt) {
        requestData.input.prompt = prompt
      }
    } else {
      if (!prompt) {
        throw new Error('prompt is required for text-to-video models')
      }
      requestData.input.prompt = prompt
    }

    if (callbackUrl) {
      requestData.callBackUrl = callbackUrl
    }

    logger.info('[KieAiProvider] Creating Sora 2 video task:', {
      model,
      provider,
      mode: isImageToVideo ? 'image-to-video' : 'text-to-video',
      promptLength: prompt?.length || 0,
      hasImage: !!imageUrl,
      aspectRatio,
      removeWatermark,
      duration,
      size,
      hasCallback: !!callbackUrl,
    })

    try {
      const response = await axios.post<SoraCreateTaskResponse>(
        `${this.baseUrl}/jobs/createTask`,
        requestData,
        {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: this.timeout,
        }
      )

      const processingTime = Date.now() - startTime

      if (response.data.code !== 200) {
        throw new Error(response.data.msg || 'Failed to create Sora video task')
      }

      const taskId = response.data.data.taskId

      // Calculate cost based on model, duration, and quality
      const costUSD = this.calculateSoraCost(
        model as 'sora-2-text-to-video' | 'sora-2-pro-text-to-video',
        duration,
        size
      )
      const costStars = this.usdToStars(costUSD)

      logger.info('[KieAiProvider] Sora 2 task created successfully:', {
        taskId,
        provider,
        model,
        costUSD,
        costStars,
        processingTime,
      })

      return {
        success: true,
        data: {
          videoUrl: '', // Will be populated by polling or webhook
          duration,
          taskId,
        },
        cost: {
          usd: costUSD,
          stars: costStars,
        },
        provider,
        model,
        processingTime,
      }
    } catch (error) {
      logger.error('[KieAiProvider] Sora 2 video generation failed:', {
        error: error instanceof Error ? error.message : 'Unknown error',
        model,
        provider,
      })

      return {
        success: false,
        cost: { usd: 0, stars: 0 },
        provider,
        model,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }

  /**
   * Check Sora 2 task status
   * Max polling time: 3 minutes (180 seconds)
   * @param taskId - Task ID returned from generateSoraVideo
   * @returns KieAiVideoResponse with video URL when completed
   */
  async checkSoraTaskStatus(taskId: string): Promise<KieAiVideoResponse> {
    if (!this.apiKey) {
      return {
        success: false,
        cost: { usd: 0, stars: 0 },
        provider: 'Kie.ai Sora 2',
        model: 'sora-2-text-to-video',
        error: 'KIE_AI_API_KEY is required for checking task status',
      }
    }

    try {
      // Two things were wrong here at once, and each hid the other.
      //
      // The URL was `${baseUrl}/jobs/taskStatus`, a route kie.ai does not have:
      // it answers 404 to every request, so this method threw a network error
      // on every poll and pollSoraTaskStatus below turned that into a failed
      // generation. See src/config/kie-jobs.ts for the measurement.
      //
      // Under the 404 sat a second defect that could never be observed: the
      // branches below read `status`, `videoUrl`, `resultUrls` and
      // `errorMessage`, which are the WEBHOOK callback's field names. The
      // status query answers with `state` and a `resultJson` STRING. Had the
      // route existed, every response would have fallen into the final
      // "unknown status" branch and polled until it timed out. Fixing only the
      // URL would have traded a loud failure for a silent one, so both move
      // together, through the one reader that knows every spelling.
      const response = await axios.get<SoraTaskStatusResponse>(
        `${KIE_JOBS.BASE_URL}${KIE_JOBS.RECORD_INFO}`,
        {
          params: { taskId },
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 30000, // 30 seconds timeout for status check
        }
      )

      const record = readKieJobRecord(response.data?.data)

      logger.info('[KieAiProvider] Sora task status response:', {
        taskId,
        code: response.data.code,
        msg: response.data.msg,
        state: record.state,
        hasVideoUrl: record.urls.length > 0,
      })

      if (response.data.code !== 200) {
        throw new Error(response.data.msg || 'Failed to check Sora task status')
      }

      const data = response.data.data

      if (record.state === 'fail') {
        const errorMessage = record.failMsg || 'Sora video generation failed'
        logger.error('[KieAiProvider] Sora video generation failed', {
          taskId,
          errorMessage,
        })
        throw new Error(errorMessage)
      }

      if (record.state === 'success') {
        const videoUrl = record.urls[0]
        logger.info('[KieAiProvider] Sora video is ready!', {
          taskId,
          videoUrl,
        })
        return {
          success: true,
          data: {
            videoUrl,
            duration: data?.duration || 10,
            taskId,
          },
          cost: { usd: 0, stars: 0 }, // Cost already calculated in generateSoraVideo
          provider: 'Kie.ai Sora 2',
          model: 'sora-2-text-to-video',
        }
      }

      // Still running. An empty videoUrl is how this method has always said
      // "keep polling", and pollSoraTaskStatus reads it that way.
      logger.info('[KieAiProvider] Sora video still processing', {
        taskId,
        state: record.state,
      })
      return {
        success: true,
        data: {
          videoUrl: '',
          duration: 10,
          taskId,
        },
        cost: { usd: 0, stars: 0 },
        provider: 'Kie.ai Sora 2',
        model: 'sora-2-text-to-video',
      }
    } catch (error) {
      logger.error('[KieAiProvider] Error checking Sora task status', {
        taskId,
        error: error instanceof Error ? error.message : 'Unknown error',
      })
      return {
        success: false,
        cost: { usd: 0, stars: 0 },
        provider: 'Kie.ai Sora 2',
        model: 'sora-2-text-to-video',
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }

  /**
   * Poll Sora task status with exponential backoff
   * Max polling time: 3 minutes (180 seconds)
   * @param taskId - Task ID to poll
   * @param maxWaitTime - Maximum time to wait in milliseconds (default: 180000 = 3 minutes)
   * @returns KieAiVideoResponse with video URL when completed
   */
  async pollSoraTaskStatus(
    taskId: string,
    maxWaitTime: number = 180000
  ): Promise<KieAiVideoResponse> {
    const startTime = Date.now()
    let attempt = 0
    const maxAttempts = 20 // Maximum number of polling attempts

    logger.info('[KieAiProvider] Starting Sora task polling:', {
      taskId,
      maxWaitTime,
      maxAttempts,
    })

    while (Date.now() - startTime < maxWaitTime && attempt < maxAttempts) {
      attempt++

      const result = await this.checkSoraTaskStatus(taskId)

      // If video is ready or failed, return result
      if (!result.success || result.data?.videoUrl) {
        logger.info('[KieAiProvider] Sora polling completed:', {
          taskId,
          attempt,
          elapsedTime: Date.now() - startTime,
          success: result.success,
          hasVideo: !!result.data?.videoUrl,
        })
        return result
      }

      // Calculate exponential backoff delay: 5s, 7.5s, 11.25s, etc.
      const delay = Math.min(5000 * Math.pow(1.5, attempt - 1), 30000)

      logger.info('[KieAiProvider] Sora task still processing, waiting...', {
        taskId,
        attempt,
        elapsedTime: Date.now() - startTime,
        nextDelay: delay,
      })

      await new Promise(resolve => setTimeout(resolve, delay))
    }

    // Timeout reached
    logger.warn('[KieAiProvider] Sora polling timeout reached', {
      taskId,
      attempts: attempt,
      elapsedTime: Date.now() - startTime,
    })

    return {
      success: false,
      cost: { usd: 0, stars: 0 },
      provider: 'Kie.ai Sora 2',
      model: 'sora-2-text-to-video',
      error: `Video generation timeout after ${Math.floor((Date.now() - startTime) / 1000)} seconds`,
    }
  }

  async generateMusic(request: KieAiMusicRequest): Promise<KieAiMusicResponse> {
    const {
      model,
      prompt,
      duration = 120,
      genre,
      lyrics,
      instrumental = false,
    } = request

    // Kie AI music is the Suno API. CREATE is POST /generate and returns ONLY a
    // taskId; the audio is produced asynchronously and must be polled from
    // /generate/record-info. The old code POSTed /music/generate and read
    // response.audio_url synchronously, so it always returned no audio.
    // Model must be the documented Suno enum, not the config slug.
    const SUNO_MODEL_MAP: Record<string, string> = {
      'suno-v5': 'V5',
      'suno-v4.5-plus': 'V4_5PLUS',
      'suno-v4.5': 'V4_5',
      'suno-v4': 'V4',
    }
    const sunoModel = SUNO_MODEL_MAP[model] || 'V4_5PLUS'

    // Simple mode (customMode:false) needs only prompt/model/instrumental. Fold
    // user lyrics into the prompt so intent is not lost without requiring
    // customMode's mandatory title/style fields.
    const description =
      lyrics && !instrumental ? `${prompt}\n\nLyrics:\n${lyrics}` : prompt

    const requestData: Record<string, unknown> = {
      prompt: description,
      customMode: false,
      instrumental,
      model: sunoModel,
      // Kie requires callBackUrl to be present; polling retrieves the result
      // regardless of whether the callback ever fires (same as Veo/Sora).
      callBackUrl: process.env.BASE_WEBHOOK_URL
        ? `${process.env.BASE_WEBHOOK_URL}/api/music-callback`
        : 'https://api.kie.ai/callback',
    }
    if (genre) {
      requestData.style = genre
    }

    try {
      const createResp = await this.makeRequest<any>('/generate', requestData)
      const taskId = createResp?.data?.taskId
      if (!taskId) {
        throw new Error(
          createResp?.msg || 'Kie music: CREATE returned no taskId'
        )
      }
      logger.info('[KieAiProvider] Suno music task created, polling', {
        taskId,
        model: sunoModel,
      })
      return await this.pollMusicTaskStatus(taskId, model, duration)
    } catch (error) {
      return {
        success: false,
        cost: { usd: 0, stars: 0 },
        provider: 'Kie.ai Suno',
        model,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }

  /**
   * Poll a Suno music task until it produces audio. Mirrors pollSoraTaskStatus:
   * GET /generate/record-info until status is SUCCESS/FIRST_SUCCESS (audio
   * ready) or a terminal failure. Suno takes ~1-3 minutes.
   */
  async pollMusicTaskStatus(
    taskId: string,
    model: string,
    fallbackDuration: number
  ): Promise<KieAiMusicResponse> {
    const maxWaitTime = 300000 // 5 minutes
    const maxAttempts = 40
    const startTime = Date.now()
    let attempt = 0
    const SUCCESS = new Set(['SUCCESS', 'FIRST_SUCCESS'])
    const FAILED = new Set([
      'CREATE_TASK_FAILED',
      'GENERATE_AUDIO_FAILED',
      'CALLBACK_EXCEPTION',
      'SENSITIVE_WORD_ERROR',
    ])

    while (Date.now() - startTime < maxWaitTime && attempt < maxAttempts) {
      attempt++
      const status = await this.checkMusicStatus(taskId)

      if (SUCCESS.has(status.status) && status.audioUrl) {
        const finalDuration = status.duration || fallbackDuration
        const costUSD = this.calculateMusicCost(model, finalDuration)
        return {
          success: true,
          data: { audioUrl: status.audioUrl, duration: finalDuration },
          cost: { usd: costUSD, stars: this.usdToStars(costUSD) },
          provider: 'Kie.ai Suno',
          model,
        }
      }
      if (FAILED.has(status.status)) {
        throw new Error(
          status.error || `Music generation failed: ${status.status}`
        )
      }

      const delay = Math.min(5000 * Math.pow(1.5, attempt - 1), 30000)
      await new Promise(resolve => setTimeout(resolve, delay))
    }

    throw new Error(
      `Music generation timeout after ${Math.floor(
        (Date.now() - startTime) / 1000
      )} seconds`
    )
  }

  /**
   * One status read for a Suno music task via GET /generate/record-info.
   * Success payload carries data.response.sunoData[0].audioUrl.
   */
  async checkMusicStatus(taskId: string): Promise<{
    status: string
    audioUrl?: string
    duration?: number
    error?: string
  }> {
    const response = await axios.get(`${this.baseUrl}/generate/record-info`, {
      params: { taskId },
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: this.timeout,
    })

    if (response.data.code !== 200) {
      throw new Error(response.data.msg || 'Failed to check music status')
    }

    const data = response.data.data
    const first = data?.response?.sunoData?.[0]
    return {
      status: data?.status ?? 'PENDING',
      audioUrl: first?.audioUrl,
      duration: first?.duration,
      error: data?.errorMessage,
    }
  }

  private calculateVideoCost(model: string, duration: number): number {
    const pricing: Record<string, number> = {
      // Kie.ai Sora pricing: $0.15 per 10 seconds = $0.015/sec
      'sora-2': 0.015, // ~94⭐ per 10 seconds
      sora2: 0.015,
      'sora-2-pro': 0.02, // ~125⭐ per 10 seconds
      'sora2-pro': 0.02,
      // Veo pricing
      veo3_fast: 0.08, // 40⭐ for 8 seconds
      veo3: 0.24, // 120⭐ for 8 seconds (FIXED PRICE)
      'runway-aleph': 0.3, // $0.30 per second
    }

    const pricePerSecond = pricing[model] || 0.05
    return pricePerSecond * duration
  }

  /**
   * Calculate cost for Sora 2 video generation
   * Pricing:
   * - Sora 2: 30 credits ($0.15) per 10 seconds
   * - Sora 2 Pro Standard: 90 credits ($0.45) per 10 seconds
   * - Sora 2 Pro HD: 200 credits ($1) per 10 seconds
   * @param model - Sora model variant
   * @param duration - Video duration in seconds (default: 10)
   * @param size - Video quality ('standard' or 'high')
   * @returns Cost in USD
   */
  private calculateSoraCost(
    model: 'sora-2-text-to-video' | 'sora-2-pro-text-to-video',
    duration: number = 10,
    size: 'standard' | 'high' = 'standard'
  ): number {
    // Pricing per 10 seconds based on Kie.ai documentation
    let costPer10Seconds: number

    if (model === 'sora-2-text-to-video') {
      costPer10Seconds = 0.15 // 30 credits = $0.15
    } else {
      // Sora 2 Pro
      if (size === 'high') {
        costPer10Seconds = 1.0 // 200 credits = $1.0
      } else {
        costPer10Seconds = 0.45 // 90 credits = $0.45
      }
    }

    // Calculate based on actual duration (10 or 15 seconds)
    const multiplier = duration / 10
    return costPer10Seconds * multiplier
  }

  private calculateImageCost(model: string, numImages: number): number {
    const pricing: Record<string, number> = {
      'gpt-4o-image': 0.1,
      'midjourney-v7': 0.15,
      'flux-1-kontext': 0.08,
    }

    const pricePerImage = pricing[model] || 0.1
    return pricePerImage * numImages
  }

  private calculateMusicCost(model: string, duration: number): number {
    const pricing: Record<string, number> = {
      'suno-v3.5': 0.2,
      'suno-v4': 0.25,
      'suno-v4.5': 0.3,
      'suno-v4.5-plus': 0.4,
    }

    const basePrice = pricing[model] || 0.2
    const durationMinutes = duration / 60
    return basePrice * durationMinutes
  }

  private usdToStars(usdCost: number): number {
    // Using the markup from unified-pricing.config.ts
    const STAR_COST_USD = 0.016
    // NO MARKUP for Veo models - fixed prices already include everything
    // For Veo models we use direct conversion without markup
    const starsWithoutMarkup = usdCost / STAR_COST_USD
    return Math.floor(starsWithoutMarkup)
  }
}
