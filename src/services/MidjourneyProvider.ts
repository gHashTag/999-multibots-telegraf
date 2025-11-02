import axios, { AxiosError } from 'axios'
import { logger } from '@/utils/logger'

interface MidjourneyRequest {
  prompt: string
  aspectRatio?: string
  version?: string
  style?: string
}

interface MidjourneyResponse {
  success: boolean
  data?: {
    imageUrl: string
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

export class MidjourneyProvider {
  private apiKey: string
  private baseUrl = 'https://api.midjourney.com/v1'
  private timeout = 60000 // 1 minute
  private maxRetries = 3

  constructor() {
    this.apiKey = process.env.MIDJOURNEY_API_KEY || ''
    if (!this.apiKey) {
      console.warn('⚠️  MIDJOURNEY_API_KEY not provided - provider will work in test mode only')
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

      logger.info(`🎨 Midjourney API request successful`, {
        endpoint,
        processingTime,
        model: data.model,
        provider: 'Midjourney API',
      })

      return { ...response.data, processingTime }
    } catch (error) {
      if (
        retryCount < this.maxRetries &&
        this.shouldRetry(error as AxiosError)
      ) {
        const delay = Math.pow(2, retryCount) * 1000 // Exponential backoff
        logger.warn(
          `🔄 Retrying Midjourney API request in ${delay}ms (attempt ${
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

    logger.error(`❌ Midjourney API error`, {
      endpoint,
      errorCode,
      errorMessage,
      provider: 'Midjourney API',
    })
  }

  async generateImage(request: MidjourneyRequest): Promise<MidjourneyResponse> {
    if (!this.apiKey) {
      return {
        success: false,
        cost: { usd: 0, stars: 0 },
        provider: 'Midjourney',
        model: 'midjourney-v6',
        error: 'MIDJOURNEY_API_KEY is required for image generation',
      }
    }

    const { prompt, aspectRatio = '1:1', version = 'v6', style = 'raw' } = request

    const requestData = {
      model: `midjourney-${version}`,
      prompt,
      aspect_ratio: aspectRatio,
      style: style,
    }

    try {
      const response = await this.makeRequest<any>('/images/generations', requestData)

      const costUSD = this.calculateImageCost(version)
      const costStars = this.usdToStars(costUSD)

      logger.info('[MidjourneyProvider] Cost calculation:', {
        version,
        costUSD,
        costStars,
      })

      logger.info('[MidjourneyProvider] Midjourney response:', {
        responseKeys: Object.keys(response),
        hasData: !!response.data,
      })

      // Проверяем успешность запроса
      if (response.code !== 200) {
        throw new Error(response.msg || 'Failed to generate image')
      }

      const imageUrl = response.data?.url || response.url

      return {
        success: true,
        data: {
          imageUrl: imageUrl,
          taskId: response.data?.id || response.id,
        },
        cost: {
          usd: costUSD,
          stars: costStars,
        },
        provider: 'Midjourney API',
        model: `midjourney-${version}`,
        processingTime: response.processingTime,
      }
    } catch (error) {
      return {
        success: false,
        cost: {
          usd: 0,
          stars: 0,
        },
        provider: 'Midjourney API',
        model: `midjourney-${version}`,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }

  async checkImageStatus(taskId: string): Promise<MidjourneyResponse> {
    try {
      const response = await axios.get(`${this.baseUrl}/images/${taskId}`, {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: this.timeout,
      })

      logger.info('[MidjourneyProvider] Image status response:', {
        taskId,
        status: response.data.status,
        hasUrl: !!response.data.url,
      })

      if (response.data.status === 'completed' && response.data.url) {
        return {
          success: true,
          data: {
            imageUrl: response.data.url,
            taskId: taskId,
          },
          cost: { usd: 0, stars: 0 },
          provider: 'Midjourney API',
          model: 'midjourney-v6',
        }
      } else if (response.data.status === 'failed') {
        throw new Error('Image generation failed')
      } else {
        // Still processing
        return {
          success: true,
          data: {
            imageUrl: undefined,
            taskId: taskId,
          },
          cost: { usd: 0, stars: 0 },
          provider: 'Midjourney API',
          model: 'midjourney-v6',
        }
      }
    } catch (error) {
      logger.error('[MidjourneyProvider] Error checking image status', { taskId, error })
      return {
        success: false,
        cost: { usd: 0, stars: 0 },
        provider: 'Midjourney API',
        model: 'midjourney-v6',
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }

  private calculateImageCost(version: string): number {
    const pricing: Record<string, number> = {
      'v5': 0.15,
      'v6': 0.20,
    }

    const price = pricing[version] || 0.20
    return price
  }

  private usdToStars(usdCost: number): number {
    const STAR_COST_USD = 0.016
    const starsWithoutMarkup = usdCost / STAR_COST_USD
    return Math.floor(starsWithoutMarkup)
  }
}
