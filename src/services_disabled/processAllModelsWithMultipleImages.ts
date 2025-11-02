import { MyContext } from '@/interfaces'
import { logger } from '@/utils/logger'
import { generateSeeDream4 } from '@/services/generateSeeDream4'
import { generateNanoBanana } from '@/services/generateNanoBanana'
import { generateFluxKontextMax } from '@/services/generateFluxKontextMax'
import { generateQwenImageEditPlus } from '@/services/generateQwenImageEditPlus'

// Define AI_PHOTOSHOP_MODELS locally to avoid circular dependency
const AI_PHOTOSHOP_MODELS = {
  seedream: {
    title_ru: 'SeeDream-4',
    cost: 5
  },
  nano_banana: {
    title_ru: 'Nano Banana',
    cost: 7
  },
  flux_max: {
    title_ru: 'FLUX Kontext Max',
    cost: 13
  },
  qwen_edit_plus: {
    title_ru: 'Qwen Image Edit Plus',
    cost: 5
  }
}

/**
 * 🎯 ПРАВИЛЬНАЯ ФУНКЦИЯ ДЛЯ ALL_MODELS ОБРАБОТКИ
 *
 * Каждая модель должна получить ВСЕ изображения за ОДИН вызов
 * Никаких двойных вызовов SeeDream-4!
 */

export interface ProcessAllModelsParams {
  ctx: MyContext
  imageUrls: string[] // ВСЕ изображения для обработки
  prompt: string
  telegram_id: string
  username: string
  is_ru: boolean
}

export interface ModelResult {
  modelKey: string
  modelName: string
  success: boolean
  results: any[]
  errors: string[]
  totalCost: number
  processingTimeMs: number
}

export interface ProcessAllModelsResult {
  success: boolean
  totalModelsProcessed: number
  totalImagesProcessed: number
  totalCostStars: number
  totalProcessingTimeMs: number
  modelResults: ModelResult[]
  errors: string[]
}

/**
 * ОСНОВНАЯ ФУНКЦИЯ: Обрабатывает ВСЕ изображения ВСЕМИ моделями
 */
export async function processAllModelsWithMultipleImages(
  params: ProcessAllModelsParams
): Promise<ProcessAllModelsResult> {
  const { ctx, imageUrls, prompt, telegram_id, username, is_ru } = params

  logger.info('🎯 [processAllModelsWithMultipleImages] Starting processing', {
    telegram_id,
    imageCount: imageUrls.length,
    prompt: prompt.substring(0, 50) + '...',
    modelsToProcess: Object.keys(AI_PHOTOSHOP_MODELS).length
  })

  const startTime = Date.now()
  const result: ProcessAllModelsResult = {
    success: true,
    totalModelsProcessed: 0,
    totalImagesProcessed: 0,
    totalCostStars: 0,
    totalProcessingTimeMs: 0,
    modelResults: [],
    errors: []
  }

  const availableModels = Object.keys(AI_PHOTOSHOP_MODELS) as string[]

  // ✅ ПРАВИЛЬНАЯ ЛОГИКА: Каждая модель получает ВСЕ изображения
  for (const modelKey of availableModels) {
    const modelStartTime = Date.now()
    const modelResult: ModelResult = {
      modelKey,
      modelName: AI_PHOTOSHOP_MODELS[modelKey].title_ru,
      success: false,
      results: [],
      errors: [],
      totalCost: 0,
      processingTimeMs: 0
    }

    try {
      logger.info(`🔄 [processAllModelsWithMultipleImages] Processing ${modelKey}`, {
        telegram_id,
        modelKey,
        imageCount: imageUrls.length,
        step: `${availableModels.indexOf(modelKey) + 1}/${availableModels.length}`
      })

      // ✅ КЛЮЧЕВАЯ ЛОГИКА: Каждая модель получает ВСЕ изображения сразу
      const modelResults = await processModelWithAllImages({
        modelKey,
        imageUrls,
        prompt,
        telegram_id,
        username,
        is_ru,
        ctx
      })

      modelResult.results = modelResults.results
      modelResult.totalCost = modelResults.totalCost
      modelResult.success = modelResults.success

      if (modelResults.errors.length > 0) {
        modelResult.errors = modelResults.errors
        result.errors.push(...modelResults.errors)
      }

      result.totalImagesProcessed += modelResults.results.length
      result.totalCostStars += modelResults.totalCost
      result.totalModelsProcessed++

      logger.info(`✅ [processAllModelsWithMultipleImages] ${modelKey} completed`, {
        telegram_id,
        modelKey,
        resultCount: modelResults.results.length,
        cost: modelResults.totalCost,
        success: modelResults.success
      })

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error'
      logger.error(`❌ [processAllModelsWithMultipleImages] ${modelKey} failed`, {
        telegram_id,
        modelKey,
        error: errorMsg
      })

      modelResult.errors.push(errorMsg)
      result.errors.push(`${modelKey}: ${errorMsg}`)
      result.success = false
    }

    modelResult.processingTimeMs = Date.now() - modelStartTime
    result.modelResults.push(modelResult)

    // Небольшая задержка между моделями
    await new Promise(resolve => setTimeout(resolve, 1000))
  }

  result.totalProcessingTimeMs = Date.now() - startTime

  logger.info('🎉 [processAllModelsWithMultipleImages] Processing completed', {
    telegram_id,
    totalModelsProcessed: result.totalModelsProcessed,
    totalImagesProcessed: result.totalImagesProcessed,
    totalCostStars: result.totalCostStars,
    totalTimeMs: result.totalProcessingTimeMs,
    success: result.success,
    errorCount: result.errors.length
  })

  return result
}

/**
 * ВСПОМОГАТЕЛЬНАЯ ФУНКЦИЯ: Обрабатывает одну модель со всеми изображениями
 */
async function processModelWithAllImages(params: {
  modelKey: string
  imageUrls: string[]
  prompt: string
  telegram_id: string
  username: string
  is_ru: boolean
  ctx: MyContext
}): Promise<{
  success: boolean
  results: any[]
  totalCost: number
  errors: string[]
}> {
  const { modelKey, imageUrls, prompt, telegram_id, username, is_ru, ctx } = params

  const results: any[] = []
  const errors: string[] = []
  let totalCost = 0

  // ✅ ПРАВИЛЬНО: Модель получает ВСЕ изображения за один вызов, а не по одному
  try {
    switch (modelKey) {
      case 'seedream':
        // SeeDream-4 может обработать несколько изображений в одном вызове
        for (const imageUrl of imageUrls) {
          const result = await generateSeeDream4({
            prompt,
            inputImageUrl: imageUrl,
            telegram_id,
            username,
            is_ru,
            ctx,
            size: '1K',
            aspect_ratio: '9:16'
          })
          results.push(result)
          totalCost += AI_PHOTOSHOP_MODELS.seedream.cost
        }
        break

      case 'nano_banana':
        // Nano Banana обрабатывает по одному изображению
        for (const imageUrl of imageUrls) {
          const result = await generateNanoBanana({
            promptText: prompt,
            inputImageUrl: imageUrl,
            telegram_id,
            username,
            is_ru,
            ctx,
            promptStyle: 'artistic'
          })
          results.push(result)
          totalCost += AI_PHOTOSHOP_MODELS.nano_banana.cost
        }
        break

      case 'flux_max':
        // FLUX Max обрабатывает по одному изображению
        for (const imageUrl of imageUrls) {
          const result = await generateFluxKontextMax({
            prompt,
            inputImageUrl: imageUrl,
            telegram_id,
            username,
            is_ru,
            ctx
          })
          results.push(result)
          totalCost += AI_PHOTOSHOP_MODELS.flux_max.cost
        }
        break

      case 'qwen_edit_plus':
        // Qwen может обработать несколько изображений
        for (const imageUrl of imageUrls) {
          const result = await generateQwenImageEditPlus({
            prompt,
            inputImageUrl: imageUrl,
            telegram_id,
            username,
            is_ru,
            ctx
          })
          results.push(result)
          totalCost += AI_PHOTOSHOP_MODELS.qwen_edit_plus.cost
        }
        break

      default:
        throw new Error(`Unknown model: ${modelKey}`)
    }

    return {
      success: true,
      results,
      totalCost,
      errors
    }

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error'
    errors.push(errorMsg)

    return {
      success: false,
      results,
      totalCost,
      errors
    }
  }
}

/**
 * ФУНКЦИЯ ВАЛИДАЦИИ: Проверяет входные параметры
 */
export function validateAllModelsParams(params: ProcessAllModelsParams): {
  isValid: boolean
  errors: string[]
} {
  const errors: string[] = []

  if (!params.imageUrls || params.imageUrls.length === 0) {
    errors.push('imageUrls is required and must contain at least one image')
  }

  if (params.imageUrls && params.imageUrls.length > 10) {
    errors.push('Maximum 10 images allowed')
  }

  if (!params.prompt || params.prompt.trim().length === 0) {
    errors.push('prompt is required')
  }

  if (params.prompt && params.prompt.length > 1000) {
    errors.push('prompt is too long (max 1000 characters)')
  }

  if (!params.telegram_id) {
    errors.push('telegram_id is required')
  }

  if (!params.username) {
    errors.push('username is required')
  }

  if (!params.ctx) {
    errors.push('ctx is required')
  }

  return {
    isValid: errors.length === 0,
    errors
  }
}