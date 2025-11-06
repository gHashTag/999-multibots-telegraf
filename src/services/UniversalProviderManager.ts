import { KieAiProvider } from './video-providers/KieAiProvider'
import { generateFaceSwap, FaceSwapRequest } from './generateFaceSwap'
import { logger } from '@/utils/logger'

interface VideoGenerationRequest {
  prompt: string
  duration?: number
  aspectRatio?: '16:9' | '9:16' | '1:1'
  imageUrl?: string
  userId?: string
  projectId?: number
}

interface FaceSwapGenerationRequest extends FaceSwapRequest {
  userId?: string
  projectId?: number
}

interface ImageGenerationRequest {
  prompt: string
  width?: number
  height?: number
  numImages?: number
  style?: string
  imageUrl?: string
  userId?: string
  projectId?: number
}

interface MusicGenerationRequest {
  prompt: string
  duration?: number
  genre?: string
  lyrics?: string
  instrumental?: boolean
  userId?: string
  projectId?: number
}

interface ModelInfo {
  id: string
  name: string
  type: 'video' | 'image' | 'music' | 'faceswap'
  provider: string
  description: string
  pricePerUnit: number
  supportedFeatures: string[]
}

export class UniversalProviderManager {
  private kieAiProvider: KieAiProvider

  // Model registry
  private models: Map<string, ModelInfo> = new Map()

  constructor() {
    this.kieAiProvider = new KieAiProvider()
    this.initializeModels()
  }

  private initializeModels(): void {
    // Video models
    const videoModels: ModelInfo[] = [
      {
        id: 'veo3_fast',
        name: 'Google Veo 3 Fast',
        type: 'video',
        provider: 'Kie.ai',
        description: 'Fast video generation with Google Veo 3',
        pricePerUnit: 0.05, // per second
        supportedFeatures: ['text-to-video', 'image-to-video'],
      },
      {
        id: 'veo3',
        name: 'Google Veo 3 Quality',
        type: 'video',
        provider: 'Kie.ai',
        description: 'Premium quality video generation',
        pricePerUnit: 0.25, // per second
        supportedFeatures: ['text-to-video'],
      },
      {
        id: 'runway-aleph',
        name: 'Runway Aleph',
        type: 'video',
        provider: 'Kie.ai',
        description: 'Advanced video editing and generation',
        pricePerUnit: 0.3, // per second
        supportedFeatures: ['text-to-video', 'image-to-video'],
      },
      {
        id: 'sora-2',
        name: 'Sora 2',
        type: 'video',
        provider: 'Kie.ai',
        description: 'OpenAI Sora 2 text-to-video generation',
        pricePerUnit: 0.015, // ~94⭐ per 10 seconds
        supportedFeatures: ['text-to-video'],
      },
      {
        id: 'sora-2-pro',
        name: 'Sora 2 Pro',
        type: 'video',
        provider: 'Kie.ai',
        description: 'OpenAI Sora 2 Pro high-quality text-to-video',
        pricePerUnit: 0.02, // ~125⭐ per 10 seconds
        supportedFeatures: ['text-to-video'],
      },
      {
        id: 'sora-2-i2v',
        name: 'Sora 2 Image-to-Video',
        type: 'video',
        provider: 'Kie.ai',
        description: 'OpenAI Sora 2 image-to-video generation',
        pricePerUnit: 0.015, // ~94⭐ per 10 seconds
        supportedFeatures: ['image-to-video'],
      },
      {
        id: 'sora-2-pro-i2v',
        name: 'Sora 2 Pro Image-to-Video',
        type: 'video',
        provider: 'Kie.ai',
        description: 'OpenAI Sora 2 Pro high-quality image-to-video',
        pricePerUnit: 0.028, // ~280⭐ per 10 seconds
        supportedFeatures: ['image-to-video'],
      },
    ]

    // Image models
    const imageModels: ModelInfo[] = [
      {
        id: 'gpt-4o-image',
        name: 'GPT-4o Image',
        type: 'image',
        provider: 'Kie.ai',
        description: 'Accurate text rendering in images',
        pricePerUnit: 0.1, // per image
        supportedFeatures: ['text-to-image', 'text-rendering'],
      },
      {
        id: 'midjourney-v7',
        name: 'Midjourney v7',
        type: 'image',
        provider: 'Replicate',
        description: 'Artistic styles and high quality via tstramer/midjourney-diffusion (1.6M runs)',
        pricePerUnit: 0.072, // per image ($0.072 per run)
        supportedFeatures: ['text-to-image', 'artistic-styles', 'aspect-ratio'],
      },
      {
        id: 'flux-1-kontext',
        name: 'FLUX.1 Kontext',
        type: 'image',
        provider: 'Kie.ai',
        description: 'Consistent character generation',
        pricePerUnit: 0.08, // per image
        supportedFeatures: ['text-to-image', 'character-consistency'],
      },
    ]

    // Music models
    const musicModels: ModelInfo[] = [
      {
        id: 'suno-v3.5',
        name: 'Suno v3.5',
        type: 'music',
        provider: 'Kie.ai',
        description: 'Basic music generation',
        pricePerUnit: 0.2, // per generation
        supportedFeatures: ['text-to-music', 'lyrics'],
      },
      {
        id: 'suno-v4',
        name: 'Suno v4',
        type: 'music',
        provider: 'Kie.ai',
        description: 'Enhanced quality music',
        pricePerUnit: 0.25, // per generation
        supportedFeatures: ['text-to-music', 'lyrics'],
      },
      {
        id: 'suno-v4.5',
        name: 'Suno v4.5',
        type: 'music',
        provider: 'Kie.ai',
        description: 'Smart prompts music generation',
        pricePerUnit: 0.3, // per generation
        supportedFeatures: ['text-to-music', 'smart-prompts', 'lyrics'],
      },
      {
        id: 'suno-v4.5-plus',
        name: 'Suno v4.5+',
        type: 'music',
        provider: 'Kie.ai',
        description: 'Premium quality music generation',
        pricePerUnit: 0.4, // per generation
        supportedFeatures: ['text-to-music', 'premium-quality', 'lyrics'],
      },
    ]

    // FaceSwap models
    const faceSwapModels: ModelInfo[] = [
      {
        id: 'face-swap',
        name: 'FaceSwap',
        type: 'faceswap',
        provider: 'Replicate',
        description: 'Swap faces between two images using AI',
        pricePerUnit: 0.01, // per swap
        supportedFeatures: ['face-swap', 'image-processing'],
      },
    ]

    // Register all models
    ;[...videoModels, ...imageModels, ...musicModels, ...faceSwapModels].forEach(model => {
      this.models.set(model.id, model)
    })

    logger.info(
      `📋 Initialized ${this.models.size} models across ${
        new Set([...this.models.values()].map(m => m.provider)).size
      } providers`
    )
  }

  async generateVideo(
    modelId: string,
    request: VideoGenerationRequest
  ): Promise<any> {
    const model = this.models.get(modelId)

    if (!model) {
      throw new Error(`Unknown model: ${modelId}`)
    }

    if (model.type !== 'video') {
      throw new Error(`Model ${modelId} is not a video model`)
    }

    logger.info(`🎬 Starting video generation`, {
      model: modelId,
      provider: model.provider,
      prompt: request.prompt.substring(0, 100),
    })

    switch (model.provider) {
      case 'Kie.ai':
        return await this.kieAiProvider.generateVideo({
          model: modelId,
          prompt: request.prompt,
          duration: request.duration,
          aspectRatio: request.aspectRatio,
          imageUrl: request.imageUrl,
        })

      default:
        throw new Error(
          `Provider ${model.provider} not supported for video generation`
        )
    }
  }

  async generateImage(
    modelId: string,
    request: ImageGenerationRequest
  ): Promise<any> {
    const model = this.models.get(modelId)

    if (!model) {
      throw new Error(`Unknown model: ${modelId}`)
    }

    if (model.type !== 'image') {
      throw new Error(`Model ${modelId} is not an image model`)
    }

    logger.info(`🖼️ Starting image generation`, {
      model: modelId,
      provider: model.provider,
      prompt: request.prompt.substring(0, 100),
    })

    switch (model.provider) {
      case 'Kie.ai':
        return await this.kieAiProvider.generateImage({
          model: modelId,
          prompt: request.prompt,
          width: request.width,
          height: request.height,
          numImages: request.numImages,
          style: request.style,
          imageUrl: request.imageUrl,
        })

      case 'Replicate':
        // Import and use Midjourney generator
        const { generateMidjourneyImage } = await import('./generateMidjourneyImage')
        return await generateMidjourneyImage({
          prompt: request.prompt,
          imageUrl: request.imageUrl,
          width: request.width,
          height: request.height,
          aspectRatio: request.style, // Can pass aspect ratio via style parameter
          numImages: request.numImages,
          telegramId: request.userId || 'unknown',
        })

      default:
        throw new Error(
          `Provider ${model.provider} not supported for image generation`
        )
    }
  }

  async generateMusic(
    modelId: string,
    request: MusicGenerationRequest
  ): Promise<any> {
    const model = this.models.get(modelId)

    if (!model) {
      throw new Error(`Unknown model: ${modelId}`)
    }

    if (model.type !== 'music') {
      throw new Error(`Model ${modelId} is not a music model`)
    }

    logger.info(`🎵 Starting music generation`, {
      model: modelId,
      provider: model.provider,
      prompt: request.prompt.substring(0, 100),
    })

    switch (model.provider) {
      case 'Kie.ai':
        return await this.kieAiProvider.generateMusic({
          model: modelId,
          prompt: request.prompt,
          duration: request.duration,
          genre: request.genre,
          lyrics: request.lyrics,
          instrumental: request.instrumental,
        })

      default:
        throw new Error(
          `Provider ${model.provider} not supported for music generation`
        )
    }
  }

  async performFaceSwap(
    modelId: string,
    request: FaceSwapGenerationRequest
  ): Promise<any> {
    const model = this.models.get(modelId)

    if (!model) {
      throw new Error(`Unknown model: ${modelId}`)
    }

    if (model.type !== 'faceswap') {
      throw new Error(`Model ${modelId} is not a face-swap model`)
    }

    logger.info(`👤 Starting face swap`, {
      model: modelId,
      provider: model.provider,
      targetImageUrl: request.targetImageUrl.substring(0, 100),
      swapImageUrl: request.swapImageUrl.substring(0, 100),
    })

    switch (model.provider) {
      case 'Replicate':
        return await generateFaceSwap({
          targetImageUrl: request.targetImageUrl,
          swapImageUrl: request.swapImageUrl,
        })

      default:
        throw new Error(
          `Provider ${model.provider} not supported for face-swap`
        )
    }
  }

  getProviderForModel(modelId: string): string | null {
    const model = this.models.get(modelId)
    return model ? model.provider : null
  }

  getAllModels(): ModelInfo[] {
    return Array.from(this.models.values())
  }

  getModelsByType(type: 'video' | 'image' | 'music' | 'faceswap'): ModelInfo[] {
    return Array.from(this.models.values()).filter(model => model.type === type)
  }

  getModelsByProvider(provider: string): ModelInfo[] {
    return Array.from(this.models.values()).filter(
      model => model.provider === provider
    )
  }

  isModelSupported(modelId: string): boolean {
    return this.models.has(modelId)
  }

  getModelInfo(modelId: string): ModelInfo | null {
    return this.models.get(modelId) || null
  }

  async checkProviderHealth(provider: string): Promise<boolean> {
    try {
      switch (provider) {
        case 'Kie.ai':
          await this.kieAiProvider.getAccountBalance()
          return true
        default:
          return false
      }
    } catch (error) {
      logger.error(`Health check failed for provider ${provider}`, { error })
      return false
    }
  }

  async getProviderBalance(provider: string): Promise<any> {
    switch (provider) {
      case 'Kie.ai':
        return await this.kieAiProvider.getAccountBalance()
      default:
        throw new Error(`Provider ${provider} balance check not supported`)
    }
  }
}

// Export singleton instance
export const providerManager = new UniversalProviderManager()
