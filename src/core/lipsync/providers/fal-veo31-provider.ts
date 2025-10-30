/**
 * Fal.ai Google Veo 3.1 Reference-to-Video Provider
 * Генерация видео из изображения с продолжением истории через Google Veo 3.1
 * Поддерживает 720p/1080p, 8s duration
 */

import { fal } from '@fal-ai/client'
import { logger } from '@/utils/logger'
import { openai } from '@/core/openai'
import type {
  UniversalLipSyncInput,
  LipSyncOutput,
} from '../schemas/lipsync-schemas'

/**
 * Interface для input Veo 3.1
 */
interface FalVeo31Input {
  image_urls: string[] // массив URL изображений
  prompt: string
  duration?: '8s'
  resolution?: '720p' | '1080p'
  generate_audio?: boolean
}

/**
 * Interface для output Veo 3.1
 */
interface FalVeo31Output {
  video: {
    url: string
    content_type: string
    file_name: string
    file_size: number
    width: number
    height: number
  }
  seed?: number
  timings?: any
}

/**
 * Fal.ai Google Veo 3.1 Provider
 * Reference-to-video с умной генерацией промптов для продолжения истории
 */
export class FalVeo31Provider {
  private readonly modelId = 'fal-ai/veo3.1/reference-to-video'

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

      logger.info('🌐 [VEO 3.1 TRANSLATE] Text translated to English', {
        originalLength: text.length,
        translatedLength: translation.length,
      })

      return translation
    } catch (error) {
      logger.error('❌ [VEO 3.1 TRANSLATE] Translation failed', { error })
      return text // Возвращаем оригинал если не получилось перевести
    }
  }

  /**
   * Генерирует story continuation промпт для Veo 3.1
   * КЛЮЧЕВАЯ ОСОБЕННОСТЬ: промпт продолжает историю с изображения аватара
   */
  async generateStoryPrompt(userText: string, language: 'ru' | 'en' = 'ru'): Promise<string> {
    console.log('📖📖📖 [VEO 3.1 STORY] generateStoryPrompt CALLED', {
      userTextLength: userText.length,
      userTextPreview: userText.substring(0, 100),
      language,
    })

    try {
      // ШАГ 1: Перевод на английский (если текст на русском)
      let englishText = userText
      if (language === 'ru') {
        console.log('🌐 [VEO 3.1 STORY] Translating Russian text to English...')
        englishText = await this.translateToEnglish(userText)
        console.log('✅ [VEO 3.1 STORY] Translation complete:', {
          original: userText.substring(0, 100),
          translated: englishText.substring(0, 100),
        })
      } else {
        console.log('🌐 [VEO 3.1 STORY] Text already in English, skipping translation')
      }

      console.log('📝 [VEO 3.1 STORY] English text ready for story generation:', {
        length: englishText.length,
        preview: englishText.substring(0, 100),
      })

      // ШАГ 2: Генерация story continuation промпта
      const systemPrompt = `You are an expert at creating cinematic story continuation prompts for Google Veo 3.1 video generation.

CRITICAL CONTEXT:
- The reference image shows a person/avatar speaking directly to camera
- The user's text is what this person is SAYING in the video
- Your task: create a visual story that ILLUSTRATES and EXPANDS on what they're talking about
- The video should SHOW the concept visually while the person explains it

Task: Based on the spoken text, create a compelling visual narrative prompt that:
1. CONTINUES THE STORY from the avatar speaking to showing the concept
2. VISUALIZES THE IDEA - turn spoken words into concrete visual scenes
3. Creates SMOOTH TRANSITION from talking head to illustrative scenes
4. Maintains CINEMATIC QUALITY with dynamic camera work
5. Tells a VISUAL STORY that enhances the spoken message

FORMAT REQUIREMENTS:
- Duration: 8 seconds (perfect for social media Reels)
- Style: Cinematic, professional, engaging
- Camera: Dynamic movements (zoom, pan, reveal, transition)
- Lighting: Natural and atmospheric
- Composition: Vertical 9:16 format optimized

STORY STRUCTURE (8 seconds):
- Seconds 0-2: Person speaking (reference image), establishing context
- Seconds 2-5: Smooth transition to visual illustration of the concept
- Seconds 5-8: Show the concept in action, creating impact

PROMPT STYLE:
- Start: "The person from the reference image speaks to camera..."
- Then: Transition to visual scenes that illustrate their message
- Focus: Concrete visuals, not abstract concepts
- Length: 100-150 words
- Language: English only

Examples:

User says: "Today I'll teach you how to create photorealistic AI avatars"
Story prompt: "The person from the reference image speaks confidently to camera in a modern studio setup. Camera smoothly transitions to reveal a computer screen showing AI avatar creation software interface. Close-up shots of neural networks visualizing in 3D space, with glowing nodes connecting. The scene shifts to show multiple AI-generated faces appearing on holographic displays, each transforming from sketch to photorealistic. Final shot pulls back to show the person gesturing toward the finished avatars, professional lighting creating depth. Cinematic vertical composition, tech-focused aesthetic, smooth camera movements throughout."

User says: "I'll show you the best places to travel in Europe"
Story prompt: "The person from the reference image speaks enthusiastically to camera against a soft-focus travel background. Camera elegantly transitions to sweeping aerial drone footage over European landmarks - the Eiffel Tower gleaming at sunset, Venice canals reflecting golden hour light, ancient Roman Colosseum in dramatic lighting. Quick but smooth cuts between iconic locations, each shot 2-3 seconds. Return to the person pointing at an animated map showing travel routes. Natural documentary style, warm color grading, vertical composition perfect for Reels."

Create ONLY the story prompt based on what the person is saying. No explanations.`

      console.log('✨ [VEO 3.1 STORY] About to call OpenAI API...')
      console.log('🔑 [VEO 3.1 STORY] OpenAI client configured:', {
        hasOpenaiClient: !!openai,
        model: 'gpt-4o-mini',
      })

      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: englishText },
        ],
        temperature: 0.8,
        max_tokens: 300,
      })

      console.log('✅ [VEO 3.1 STORY] OpenAI API call successful!', {
        hasResponse: !!response,
        hasChoices: !!response.choices,
        choicesLength: response.choices?.length,
      })

      const generatedPrompt = response.choices[0]?.message?.content?.trim()

      console.log('🔍 [VEO 3.1 STORY] Extracted prompt:', {
        hasPrompt: !!generatedPrompt,
        promptLength: generatedPrompt?.length,
      })

      if (!generatedPrompt) {
        throw new Error('OpenAI returned empty prompt')
      }

      logger.info('✨ [VEO 3.1 STORY] Story prompt generated (English)', {
        originalText: userText.substring(0, 100),
        englishText: englishText.substring(0, 100),
        promptLength: generatedPrompt.length,
        promptPreview: generatedPrompt.substring(0, 150),
      })

      console.log('🎉🎉🎉 [VEO 3.1 STORY] Returning generated story prompt:', {
        preview: generatedPrompt.substring(0, 200),
      })

      return generatedPrompt
    } catch (error) {
      console.error('❌❌❌ [VEO 3.1 STORY] ERROR in generateStoryPrompt:', {
        error,
        errorMessage: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : undefined,
      })
      logger.error('❌ [VEO 3.1 STORY] Failed to generate story prompt', { error })

      // Fallback промпт (всегда на английском)
      return 'The person from the reference image speaks to camera with confidence and clarity. Camera smoothly transitions to reveal dynamic visual scenes that illustrate their message. Cinematic lighting, smooth camera movements, professional production quality. Vertical 9:16 composition perfect for social media.'
    }
  }

  /**
   * Генерация видео через Google Veo 3.1
   */
  async generate(input: UniversalLipSyncInput): Promise<LipSyncOutput> {
    const startTime = Date.now()

    logger.info('🎬 [FAL VEO 3.1] Starting reference-to-video generation', {
      modelId: this.modelId,
      imageUrl: input.imageUrl?.substring(0, 100),
      prompt: input.prompt?.substring(0, 100),
    })

    if (!process.env.FAL_KEY) {
      throw new Error('FAL_KEY environment variable is not set')
    }

    if (!input.imageUrl) {
      throw new Error('Image URL is required for Veo 3.1')
    }

    if (!input.prompt) {
      throw new Error('Prompt is required for Veo 3.1')
    }

    try {
      // Подготовка input для Veo 3.1
      const falInput: FalVeo31Input = {
        image_urls: [input.imageUrl], // Veo 3.1 принимает массив изображений
        prompt: input.prompt,
        duration: '8s', // фиксированная длительность
        resolution: (input as any).resolution === '1080p' ? '1080p' : '720p',
        generate_audio: false, // без аудио (уже есть в lip-sync видео)
      }

      console.log('🚨 [FAL VEO 3.1] Calling fal.subscribe', {
        modelId: this.modelId,
        resolution: falInput.resolution,
        duration: falInput.duration,
        generateAudio: falInput.generate_audio,
        input: {
          prompt: falInput.prompt.substring(0, 150) + '...',
          image_urls: falInput.image_urls.map(url => url.substring(0, 100) + '...'),
        },
      })

      // Синхронный вызов Fal.ai Veo 3.1
      const result = await fal.subscribe(this.modelId, {
        input: falInput,
        logs: true,
        onQueueUpdate: update => {
          if (update.status === 'IN_PROGRESS') {
            console.log(`[VEO 3.1 Progress] ${update.status}`)
            update.logs?.map(log => log.message).forEach(console.log)
          }
        },
      })

      console.log('✅ [FAL VEO 3.1] Received response from Fal.ai API', {
        hasData: !!result.data,
        hasVideo: !!(result.data as any)?.video,
        videoUrl: (result.data as any)?.video?.url?.substring(0, 100),
        duration: Date.now() - startTime,
      })

      const resultData = result.data as FalVeo31Output
      if (!resultData?.video?.url) {
        return {
          message: 'No video generated by Fal.ai Veo 3.1 API',
          error: 'Missing video output in API response',
        }
      }

      const videoUrl = resultData.video.url

      logger.info('✅ [FAL VEO 3.1] Video successfully generated', {
        videoUrl: videoUrl.substring(0, 100),
        width: resultData.video.width,
        height: resultData.video.height,
        fileSize: resultData.video.file_size,
        totalTime: Date.now() - startTime,
      })

      return {
        videoUrl,
        requestId: result.requestId,
        output: videoUrl,
      }
    } catch (error) {
      logger.error('❌ [FAL VEO 3.1] Generation error', {
        error,
        errorMessage: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : undefined,
        duration: Date.now() - startTime,
      })

      return {
        message: `Fal.ai Veo 3.1 error: ${error instanceof Error ? error.message : String(error)}`,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }

  /**
   * Расчет стоимости в звездах для Veo 3.1
   */
  calculateCost(resolution: '720p' | '1080p', duration: number = 8): number {
    // Цены Fal.ai Veo 3.1 (примерные)
    const pricePerSecond: Record<string, number> = {
      '720p': 0.15, // $0.15/сек (примерно)
      '1080p': 0.25, // $0.25/сек (примерно)
    }

    const usdCost = pricePerSecond[resolution] * duration
    const stars = Math.ceil(usdCost * 60) // $1 = ~60 звезд

    return stars
  }
}
