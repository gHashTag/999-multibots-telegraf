import axios, { AxiosError } from 'axios'
import { logger } from '@/utils/logger'

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
        provider: 'Veo 3 API',
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

    // КРИТИЧЕСКАЯ ПРОВЕРКА: Для image-to-video ОБЯЗАТЕЛЬНО наличие изображения
    // НО veo3_fast и veo-3 поддерживают text-to-video!
    // Удаляем эту проверку, так как она блокирует text-to-video

    // Преобразуем название модели в формат Kie.ai
    let kieModel = model
    if (model === 'veo3_fast') {
      // ВСЕГДА используем veo3_fast для Veo 3 Fast (и для text-to-video, и для image-to-video)
      kieModel = 'veo3_fast'
      logger.info('[KieAiProvider] Veo 3 Fast selected:', {
        originalModel: model,
        selectedModel: kieModel,
        hasImage: !!imageUrl,
        mode: imageUrl ? 'image-to-video' : 'text-to-video',
        expectedCost: '40 stars'
      })
    } else if (model === 'veo3') {
      // Для обычной Veo 3 используем veo3
      kieModel = 'veo3'
      logger.info('[KieAiProvider] Veo 3 selected:', {
        originalModel: model,
        selectedModel: kieModel,
        hasImage: !!imageUrl,
        mode: imageUrl ? 'image-to-video' : 'text-to-video',
        expectedCost: '120 stars'
      })
    } else if (model === 'runway-aleph') {
      kieModel = 'runway_aleph'
    }
    
    // Формируем правильный callback URL
    const callbackUrl = process.env.BASE_WEBHOOK_URL
      ? `${process.env.BASE_WEBHOOK_URL}/api/kie-ai/callback`
      : 'https://ai-server-production-production-8e2d.up.railway.app/api/kie-ai/callback'

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
      callbackUrl: callbackUrl // Логируем callback URL
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
        usingDualFormat: true
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
      firstImageUrl: requestData.imageUrls?.[0]?.substring(0, 100) + '...' || 'none',
      hasImageKey: !!requestData.imageKey,
      imageKey: requestData.imageKey || 'none',
      aspectRatio: requestData.aspectRatio,
      enableFallback: requestData.enableFallback,
      enableTranslation: requestData.enableTranslation,
      hasCallbackUrl: !!requestData.callBackUrl,
      callbackUrl: requestData.callBackUrl,
      requestKeys: Object.keys(requestData)
    })

    try {
      const response = await this.makeRequest<any>(
        '/veo/generate',
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
        pricePerSecond: costUSD / duration
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

      // Проверяем различные форматы ответа
      if (data.successFlag === 1) {
        // Видео готово - проверяем разные форматы URL
        const videoUrl = data.response?.resultUrls?.[0] ||
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
          logger.warn('[KieAiProvider] Video marked as ready but no URL found', { taskId, data })
          throw new Error('Video marked as ready but no video URL provided')
        }
      } else if (data.successFlag === 0) {
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
      } else if (data.successFlag === 3) {
        // Ошибка политики контента Google
        logger.error('[KieAiProvider] Video generation rejected by content policy', { taskId, errorCode: data.errorCode, errorMessage: data.errorMessage });
        throw new Error(data.errorMessage || 'Content rejected by Google policy. Please try different prompt or image.');
      } else if (data.successFlag === 2) {
        // Ошибка генерации
        logger.error('[KieAiProvider] Video generation failed', { taskId, data })
        throw new Error(data.errorMessage || data.response?.errorMessage || 'Video generation failed')
      } else {
        logger.warn('[KieAiProvider] Unknown successFlag value', { taskId, successFlag: data.successFlag })
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
      logger.error('[KieAiProvider] Error checking video status', { taskId, error })
      return {
        success: false,
        cost: { usd: 0, stars: 0 },
        provider: 'Veo 3 API',
        model: 'veo3',
        error: error instanceof Error ? error.message : 'Unknown error',
      }
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

    const requestData: any = {
      model,
      prompt,
      duration,
      instrumental,
    }

    if (genre) {
      requestData.genre = genre
    }

    if (lyrics) {
      requestData.lyrics = lyrics
    }

    try {
      const response = await this.makeRequest<any>(
        '/music/generate',
        requestData
      )

      const costUSD = this.calculateMusicCost(model, duration)
      const costStars = this.usdToStars(costUSD)

      return {
        success: true,
        data: {
          audioUrl: response.audio_url,
          duration: response.duration || duration,
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

  private calculateVideoCost(model: string, duration: number): number {
    const pricing: Record<string, number> = {
      'veo3_fast': 0.08, // $0.08 per second = 40⭐ for 8 seconds
      'veo3': 0.24, // $0.24 per second = 120⭐ for 8 seconds (FIXED PRICE)
      'runway-aleph': 0.3, // $0.30 per second
    }

    const pricePerSecond = pricing[model] || 0.05
    return pricePerSecond * duration
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
