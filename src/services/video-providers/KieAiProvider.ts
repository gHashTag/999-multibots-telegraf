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

      logger.info(`🎬 Kie.ai API request successful`, {
        endpoint,
        processingTime,
        model: data.model,
        provider: 'Kie.ai',
      })

      return { ...response.data, processingTime }
    } catch (error) {
      if (
        retryCount < this.maxRetries &&
        this.shouldRetry(error as AxiosError)
      ) {
        const delay = Math.pow(2, retryCount) * 1000 // Exponential backoff
        logger.warn(
          `🔄 Retrying Kie.ai request in ${delay}ms (attempt ${retryCount + 1}/${this.maxRetries})`
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

    logger.error(`❌ Kie.ai API error`, {
      endpoint,
      errorCode,
      errorMessage,
      provider: 'Kie.ai',
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
      logger.error('Failed to get Kie.ai account balance', { error })
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

    const requestData: any = {
      model,
      prompt,
      duration,
      aspect_ratio: aspectRatio,
    }

    if (imageUrl) {
      requestData.image_url = imageUrl
    }

    try {
      const response = await this.makeRequest<any>(
        '/video/generate',
        requestData
      )

      // Calculate cost based on model and duration
      const costUSD = this.calculateVideoCost(model, duration)
      const costStars = this.usdToStars(costUSD)

      return {
        success: true,
        data: {
          videoUrl: response.video_url,
          duration: response.duration || duration,
          taskId: response.task_id,
        },
        cost: {
          usd: costUSD,
          stars: costStars,
        },
        provider: 'Kie.ai',
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
        provider: 'Kie.ai',
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
        provider: 'Kie.ai',
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
        provider: 'Kie.ai',
        model,
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
        provider: 'Kie.ai',
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
        provider: 'Kie.ai',
        model,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }

  private calculateVideoCost(model: string, duration: number): number {
    const pricing: Record<string, number> = {
      'veo-3-fast': 0.05, // $0.05 per second
      'veo-3': 0.25, // $0.25 per second
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
    const MARKUP_MULTIPLIER = 1.5

    const starsBeforeMarkup = usdCost / STAR_COST_USD
    const starsWithMarkup = starsBeforeMarkup * MARKUP_MULTIPLIER
    return Math.floor(starsWithMarkup)
  }
}
