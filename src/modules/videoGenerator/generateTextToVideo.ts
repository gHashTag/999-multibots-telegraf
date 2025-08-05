import axios, { isAxiosError } from 'axios'
import { API_URL, SECRET_API_KEY } from '@/config'
import { logger } from '@/utils/logger'
import { replicate } from '@/core/replicate'
import {
  VIDEO_MODELS_CONFIG,
  type VideoModelConfig,
} from './config/models.config'
import { updateUserBalance } from '@/core/supabase/updateUserBalance'
import { calculateFinalPrice } from '@/price/helpers'
import { PaymentType } from '@/interfaces/payments.interface'
import { getUserHelper } from './helpers'

interface TextToVideoResponse {
  success: boolean
  videoUrl?: string
  message?: string
  prompt_id?: number
}

export async function generateTextToVideo(
  prompt: string,
  telegram_id: string,
  username: string,
  is_ru: boolean,
  bot_name: string,
  modelId: string,
  selectedResolution?: string // Добавлен параметр для разрешения Seedance
): Promise<string | null> {
  logger.info('[generateTextToVideo] Starting local generation with modelId:', {
    telegram_id,
    username,
    modelId,
    promptLength: prompt.length,
  })

  // Получаем конфигурацию модели вне try-catch для доступа в обработчике ошибок
  const modelConfig = VIDEO_MODELS_CONFIG[modelId]
  if (!modelConfig || !modelConfig.api?.model) {
    logger.error(
      '[generateTextToVideo] Invalid modelId or modelConfig, or api.model missing:',
      { modelId, modelConfig }
    )
    return null
  }

  try {
    if (!modelConfig.inputType.includes('text')) {
      logger.error(
        `[generateTextToVideo] Model "${modelId}" does not support text input.`,
        { modelId, inputType: modelConfig.inputType }
      )
      return null
    }

    // Получаем пользовательские настройки для aspect_ratio
    const userExists = await getUserHelper(telegram_id)
    const userAspectRatio = userExists?.aspect_ratio ?? '9:16'

    logger.info('[generateTextToVideo] User aspect ratio retrieved:', {
      telegram_id,
      userAspectRatio,
      hasUserData: !!userExists,
    })

    const replicateModelId: string = modelConfig.api.model

    // Специальная обработка для Google Veo 3
    let modelInput: any
    if (modelConfig.id === 'veo-3' || modelConfig.id === 'veo-3-fast') {
      modelInput = {
        prompt,
        duration_seconds: modelConfig.api.input.duration_seconds || 8,
        aspect_ratio: userAspectRatio, // Используем пользовательские настройки
        enable_audio: modelConfig.api.input.enable_audio || true,
      }
      // Добавляем prompt_optimizer только если он есть в конфиге
      if (modelConfig.api.input.prompt_optimizer) {
        modelInput.prompt_optimizer = true
      }
      logger.info(
        `[generateTextToVideo] ${modelConfig.title} model input prepared:`,
        {
          telegram_id,
          modelId: modelConfig.id,
          fullInput: modelInput,
        }
      )
    }
    // ✅ ИСПРАВЛЕНО: Добавлен `else if` для корректной обработки Seedance
    else if (modelConfig.id === 'seedance-1-pro') {
      // Специальная обработка для Seedance-1-Pro моделей
      modelInput = {
        ...(modelConfig.api.input || {}), // Включаем базовые параметры API
        prompt,
        resolution: selectedResolution, // Используем 'resolution'
      }
      logger.info('[generateTextToVideo] Seedance model input prepared:', {
        telegram_id,
        resolution: selectedResolution,
        fullInput: modelInput,
      })
    }
    // Специальная обработка для WAN 2.2-fast моделей
    else if (modelConfig.id === 'wan-2.2-t2v-fast') {
      // Преобразуем aspect_ratio пользователя в формат WAN
      const wanResolution = userAspectRatio === '16:9' ? '1280x720' : '720x1280'
      modelInput = {
        ...modelConfig.api.input,
        prompt,
        target_resolution: wanResolution, // WAN использует специфичный формат
      }
      logger.info('[generateTextToVideo] WAN 2.2 T2V model input prepared:', {
        telegram_id,
        userAspectRatio,
        wanResolution,
        fullInput: modelInput,
      })
    } else {
      // Стандартная обработка для других моделей
      modelInput = {
        ...(modelConfig.api.input || {}),
        prompt,
        aspect_ratio: userAspectRatio, // Добавляем aspect_ratio и для других моделей
      }
      logger.info('[generateTextToVideo] Standard model input prepared:', {
        telegram_id,
        modelId: modelConfig.id,
        fullInput: modelInput,
      })
    }

    logger.info('[generateTextToVideo] Calling replicate.run with input:', {
      replicateModelId,
      modelInput,
      isVeo3Family:
        modelConfig.id === 'veo-3' || modelConfig.id === 'veo-3-fast',
    })

    const replicateResult = await replicate.run(replicateModelId as any, {
      input: modelInput,
    })

    logger.info('[generateTextToVideo] replicate.run finished.', {
      telegram_id,
      replicateResultType: typeof replicateResult,
    })

    let videoUrl: string | undefined
    if (
      Array.isArray(replicateResult) &&
      replicateResult.length > 0 &&
      typeof replicateResult[0] === 'string'
    ) {
      videoUrl = replicateResult[0]
    } else if (typeof replicateResult === 'string') {
      videoUrl = replicateResult
    } else {
      logger.error(
        '[generateTextToVideo] Failed to extract video URL from Replicate result:',
        { telegram_id, replicateResult }
      )
      return null
    }

    if (!videoUrl) {
      logger.error(
        '[generateTextToVideo] Extracted videoUrl is undefined or empty.',
        { telegram_id }
      )
      return null
    }
    logger.info('[generateTextToVideo] Video URL extracted successfully:', {
      telegram_id,
      videoUrl,
    })

    // Возвращаем URL, чтобы он мог быть обработан вызывающей функцией
    return videoUrl
  } catch (error: any) {
    logger.error('[generateTextToVideo] Error during local generation:', {
      telegram_id,
      modelId: modelConfig.id, // Добавлено для ясности
      error: error.message,
      stack: error.stack,
      axiosError: isAxiosError(error) ? error.toJSON() : undefined,
    })

    let errorMessage = is_ru
      ? 'Произошла ошибка при создании видео на стороне Replicate.'
      : 'An error occurred while creating the video via Replicate.'

    if (error.response && error.response.data && error.response.data.detail) {
      errorMessage = `Replicate error: ${error.response.data.detail}`
    } else if (error.message) {
      errorMessage = error.message
    }

    // Универсальный возврат средств для всех моделей при ошибке
    logger.warn(
      '[generateTextToVideo] Video generation failed, attempting refund',
      {
        telegram_id,
        model: modelConfig.id,
        error: error.message,
      }
    )

    try {
      // Вычисляем стоимость модели для возврата
      const modelCost = calculateFinalPrice(modelConfig.id)

      // Возвращаем средства обратно
      const refundResult = await updateUserBalance(
        telegram_id,
        modelCost,
        PaymentType.MONEY_INCOME,
        `Refund for failed ${modelConfig.title} generation`,
        {
          bot_name: bot_name,
          service_type: 'video-generation-refund',
          model_name: modelConfig.id,
          original_error: error.message,
          refund_amount: modelCost,
        }
      )

      logger.info(
        '[generateTextToVideo] Refund processed for video generation failure',
        {
          telegram_id,
          model: modelConfig.id,
          refund_amount: modelCost,
          refund_result: refundResult,
        }
      )
    } catch (refundError) {
      logger.error('[generateTextToVideo] Failed to process refund', {
        telegram_id,
        model: modelConfig.id,
        refund_error: refundError.message,
      })
    }

    // В любом случае возвращаем null, чтобы вызывающая функция знала об ошибке
    return null
  }
}
