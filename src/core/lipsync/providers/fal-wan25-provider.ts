/**
 * Fal.ai WAN v2.2-5b Image-to-Video Provider
 * Синхронный провайдер для генерации видео из изображений через Fal.ai WAN v2.2-5b
 * Поддерживает 9:16 (вертикальное видео для соцсетей)
 */

import { fal } from '@fal-ai/client'
import { logger } from '@/utils/logger'
import { openai } from '@/core/openai'
import type {
  UniversalLipSyncInput,
  LipSyncOutput,
} from '../schemas/lipsync-schemas'

/**
 * Interface для input WAN v2.2-5b
 */
interface FalWAN25Input {
  prompt: string
  image_url: string
  aspect_ratio?: '16:9' | '9:16' | '1:1'
  duration?: number
  seed?: number
  num_inference_steps?: number
  guidance_scale?: number
}

/**
 * Interface для output WAN v2.2-5b
 */
interface FalWAN25Output {
  video: {
    url: string
    content_type: string
    file_name: string
    file_size: number
    width: number
    height: number
  }
  seed: number
  timings: any
}

/**
 * Fal.ai WAN v2.2-5b Provider
 * Синхронный image-to-video через Fal.ai с поддержкой 9:16
 */
export class FalWAN25Provider {
  private readonly modelId = 'fal-ai/wan/v2.2-5b/image-to-video'

  /**
   * Переводит текст на английский через OpenAI
   */
  async translateToEnglish(text: string): Promise<string> {
    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are a professional translator. Translate the following text to English. Keep the meaning and style. Return ONLY the translation, no explanations.',
          },
          { role: 'user', content: text },
        ],
        temperature: 0.3,
        max_tokens: 500,
      })

      const translation = response.choices[0]?.message?.content?.trim()

      if (!translation) {
        throw new Error('OpenAI returned empty translation')
      }

      logger.info('🌐 [WAN TRANSLATE] Text translated to English', {
        originalLength: text.length,
        translatedLength: translation.length,
      })

      return translation
    } catch (error) {
      logger.error('❌ [WAN TRANSLATE] Translation failed', { error })
      return text // Возвращаем оригинал если не получилось перевести
    }
  }

  /**
   * Генерирует визуальный промпт на основе текста пользователя через OpenAI
   * ВСЕГДА генерирует промпт на английском (для WAN v2.2-5b от Alibaba)
   */
  async generateVisualPrompt(userText: string, language: 'ru' | 'en' = 'ru'): Promise<string> {
    try {
      // ШАГ 1: Перевод на английский (если текст на русском)
      let englishText = userText
      if (language === 'ru') {
        console.log('🌐 [WAN PROMPT] Translating Russian text to English...')
        englishText = await this.translateToEnglish(userText)
        console.log('✅ [WAN PROMPT] Translation complete:', {
          original: userText.substring(0, 100),
          translated: englishText.substring(0, 100),
        })
      }

      // ШАГ 2: Генерация визуального промпта на английском
      const systemPrompt = `You are an expert at creating visual prompts for AI video generation.

Task: Based on user's text, create a short but detailed visual prompt for video generation that:
1. UNPACKS THE IDEA visually - turn the spoken concept into concrete visual scenes
2. Describes specific images, scenes, movements, and actions
3. Fits vertical 9:16 video format (for social media like TikTok, Instagram Reels)
4. Creates cinematic, dynamic picture with camera movements

Rules:
- Prompt MUST be in English (for Alibaba WAN v2.2-5b model)
- Length: 100-150 words
- Use visual details: lighting, camera angles, movements, emotions, atmosphere
- Avoid abstract concepts, focus on CONCRETE visuals
- Include vertical composition 9:16 format
- Add camera movements and transitions

Examples:
User text: "Today I'll talk about traveling"
Visual prompt: "A dynamic cinematic shot starting with a close-up of a vintage world map, camera slowly zooms out revealing scattered passport stamps, old photographs, and a compass. Soft golden hour lighting streams through a window, creating warm shadows. The scene transitions to show gentle hand movements over the map, tracing routes. Vertical composition 9:16, nostalgic travel vibes, natural documentary style."

User text: "In this video we'll explore future technologies"
Visual prompt: "Futuristic tech lab environment, vertical composition. Camera starts on glowing holographic displays showing AI neural networks. Smooth pan to reveal sleek robotic arms in motion, processing data. Blue and purple neon lighting, high-tech atmosphere. Cinematic close-ups of circuit boards coming to life, digital particles floating. Modern, sci-fi aesthetic, dynamic camera movements, 9:16 vertical format."

Create visual prompt ONLY based on the idea, no extra explanations.`

      console.log('✨ [WAN PROMPT] Generating visual prompt from English text...')

      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: englishText },
        ],
        temperature: 0.8,
        max_tokens: 300,
      })

      const generatedPrompt = response.choices[0]?.message?.content?.trim()

      if (!generatedPrompt) {
        throw new Error('OpenAI returned empty prompt')
      }

      logger.info('✨ [WAN PROMPT] Visual prompt generated (English)', {
        originalText: userText.substring(0, 100),
        englishText: englishText.substring(0, 100),
        promptLength: generatedPrompt.length,
        promptPreview: generatedPrompt.substring(0, 150),
      })

      return generatedPrompt
    } catch (error) {
      logger.error('❌ [WAN PROMPT] Failed to generate visual prompt', { error })

      // Fallback промпт (всегда на английском)
      return 'A dynamic cinematic scene with expressive movements, natural lighting, vertical composition 9:16 format for social media, high quality production value, engaging visual storytelling, smooth camera movements.'
    }
  }

  /**
   * Генерация видео из изображения через Fal.ai WAN v2.2-5b
   */
  async generate(input: UniversalLipSyncInput): Promise<LipSyncOutput> {
    const startTime = Date.now()

    // Aspect ratio из input или по умолчанию 9:16 для соцсетей
    const aspectRatio = (input as any).aspectRatio || '9:16'

    logger.info('🎬 [FAL WAN v2.2-5b] Starting image-to-video generation', {
      modelId: this.modelId,
      imageUrl: input.imageUrl?.substring(0, 100),
      prompt: input.prompt?.substring(0, 100),
      aspectRatio,
    })

    if (!process.env.FAL_KEY) {
      throw new Error('FAL_KEY environment variable is not set')
    }

    if (!input.imageUrl) {
      throw new Error('Image URL is required for WAN v2.2-5b')
    }

    if (!input.prompt) {
      throw new Error('Prompt is required for WAN v2.2-5b')
    }

    try {
      // Подготовка input для Fal.ai WAN v2.2-5b
      const falInput: FalWAN25Input = {
        prompt: input.prompt,
        image_url: input.imageUrl,
        aspect_ratio: aspectRatio as '16:9' | '9:16' | '1:1',
        duration: 121, // ~5 секунд (API использует frames, 121 frames = ~5s at 24fps)
        num_inference_steps: 50, // качество генерации
        guidance_scale: 7.5, // следование промпту
      }

      console.log('🚨 [FAL WAN v2.2-5b] Calling fal.subscribe', {
        modelId: this.modelId,
        aspectRatio: falInput.aspect_ratio,
        duration: falInput.duration,
        input: {
          prompt: falInput.prompt.substring(0, 150) + '...',
          image_url: falInput.image_url.substring(0, 100) + '...',
        },
      })

      // Синхронный вызов Fal.ai WAN v2.2-5b
      const result = await fal.subscribe(this.modelId, {
        input: falInput,
        logs: true,
        onQueueUpdate: update => {
          if (update.status === 'IN_PROGRESS') {
            console.log(`[WAN v2.2-5b Progress] ${update.status}`)
            update.logs?.map(log => log.message).forEach(console.log)
          }
        },
      })

      console.log('✅ [FAL WAN v2.2-5b] Received response from Fal.ai API', {
        hasData: !!result.data,
        hasVideo: !!(result.data as any)?.video,
        videoUrl: (result.data as any)?.video?.url?.substring(0, 100),
        duration: Date.now() - startTime,
      })

      const resultData = result.data as FalWAN25Output
      if (!resultData?.video?.url) {
        return {
          message: 'No video generated by Fal.ai WAN v2.2-5b API',
          error: 'Missing video output in API response',
        }
      }

      const videoUrl = resultData.video.url

      logger.info('✅ [FAL WAN v2.2-5b] Video successfully generated', {
        videoUrl: videoUrl.substring(0, 100),
        width: resultData.video.width,
        height: resultData.video.height,
        fileSize: resultData.video.file_size,
        aspectRatio: '9:16',
        totalTime: Date.now() - startTime,
      })

      return {
        videoUrl,
        requestId: result.requestId,
        output: videoUrl,
      }
    } catch (error) {
      logger.error('❌ [FAL WAN v2.2-5b] Generation error', {
        error,
        errorMessage: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : undefined,
        duration: Date.now() - startTime,
      })

      return {
        message: `Fal.ai WAN v2.2-5b error: ${error instanceof Error ? error.message : String(error)}`,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }

  /**
   * Расчет стоимости в звездах
   */
  calculateCost(resolution: '480p' | '720p' | '1080p', duration: number = 5): number {
    // Цены Fal.ai WAN 2.5 за секунду
    const pricePerSecond: Record<string, number> = {
      '480p': 0.05, // $0.05/сек
      '720p': 0.10, // $0.10/сек
      '1080p': 0.15, // $0.15/сек
    }

    const usdCost = pricePerSecond[resolution] * duration
    const stars = Math.ceil(usdCost * 60) // $1 = ~60 звезд

    return stars
  }
}
