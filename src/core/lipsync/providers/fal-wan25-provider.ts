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
   * Генерирует визуальный промпт на основе текста пользователя через OpenAI
   */
  async generateVisualPrompt(userText: string, language: 'ru' | 'en' = 'ru'): Promise<string> {
    const systemPrompt = language === 'ru'
      ? `Ты - эксперт по созданию визуальных промптов для AI видео генерации.

Задача: На основе текста пользователя создай короткий, но детальный визуальный промпт для генерации видео, который:
1. РАСКРЫВАЕТ ИДЕЮ сказанного визуально
2. Описывает конкретные образы, сцены, движения
3. Подходит для вертикального видео 9:16 (для соцсетей)
4. Создает кинематографичную, динамичную картинку

Правила:
- Промпт должен быть на английском
- Длина: 100-150 слов
- Используй визуальные детали: освещение, камера, движения, эмоции
- Избегай абстрактных концепций, фокусируйся на КОНКРЕТНОМ визуале

Примеры:
Текст: "Сегодня я расскажу о путешествиях"
Промпт: "A dynamic cinematic shot starting with a close-up of a vintage world map, camera slowly zooms out revealing scattered passport stamps, old photographs, and a compass. Soft golden hour lighting streams through a window, creating warm shadows. The scene transitions to show gentle hand movements over the map, tracing routes. Vertical composition 9:16, nostalgic travel vibes, natural documentary style."

Текст: "В этом видео разберем технологии будущего"
Промпт: "Futuristic tech lab environment, vertical composition. Camera starts on glowing holographic displays showing AI neural networks. Smooth pan to reveal sleek robotic arms in motion, processing data. Blue and purple neon lighting, high-tech atmosphere. Cinematic close-ups of circuit boards coming to life, digital particles floating. Modern, sci-fi aesthetic, dynamic camera movements, 9:16 vertical format."

Создай промпт ТОЛЬКО на основе идеи текста, без лишних объяснений.`
      : `You are an expert at creating visual prompts for AI video generation.

Task: Based on user's text, create a short but detailed visual prompt for video generation that:
1. UNPACKS THE IDEA visually
2. Describes specific images, scenes, movements
3. Fits vertical 9:16 video (for social media)
4. Creates cinematic, dynamic picture

Rules:
- Prompt must be in English
- Length: 100-150 words
- Use visual details: lighting, camera, movements, emotions
- Avoid abstract concepts, focus on CONCRETE visuals

Create prompt ONLY based on text idea, no extra explanations.`

    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userText },
        ],
        temperature: 0.8,
        max_tokens: 300,
      })

      const generatedPrompt = response.choices[0]?.message?.content?.trim()

      if (!generatedPrompt) {
        throw new Error('OpenAI returned empty prompt')
      }

      logger.info('✨ [WAN PROMPT] Visual prompt generated', {
        userText: userText.substring(0, 100),
        promptLength: generatedPrompt.length,
      })

      return generatedPrompt
    } catch (error) {
      logger.error('❌ [WAN PROMPT] Failed to generate visual prompt', { error })

      // Fallback промпт
      return language === 'ru'
        ? 'A dynamic cinematic scene with expressive movements, natural lighting, vertical composition 9:16 format for social media, high quality production value, engaging visual storytelling.'
        : 'A dynamic cinematic scene with expressive movements, natural lighting, vertical composition 9:16 format for social media, high quality production value, engaging visual storytelling.'
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
