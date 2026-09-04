import axios, { isAxiosError } from 'axios'
import { PUBLIC_URL, SECRET_API_KEY } from '@/config'
import { logger } from '@/utils/logger'
import { replicate } from '@/core/replicate'
import {
  UNIFIED_VIDEO_MODELS as VIDEO_MODELS_CONFIG,
  type UnifiedVideoModelConfig as VideoModelConfig,
} from '@/config/unified-video-models.config'
import { getUserHelper } from './helpers'

interface ModuleTextToVideoResponse {
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
  selectedResolution?: string, // Добавлен параметр для разрешения Seedance
  selectedDuration?: number, // Добавлен параметр для длительности Veo моделей
  selectedAspectRatio?: string // Добавлен параметр для соотношения сторон Kie.ai моделей
): Promise<string | null> {
  logger.info('[generateTextToVideo] Starting local generation with modelId:', {
    telegram_id,
    username,
    modelId,
    promptLength: prompt.length,
  })

  // Получаем конфигурацию модели вне try-catch для доступа в обработчике ошибок
  const modelConfig = VIDEO_MODELS_CONFIG[modelId]
  if (!modelConfig || !modelConfig.apiModel) {
    logger.error(
      '[generateTextToVideo] Invalid modelId or modelConfig, or apiModel missing:',
      { modelId, modelConfig }
    )
    return null
  }

  try {
    if (!modelConfig.inputTypes.includes('text')) {
      logger.error(
        `[generateTextToVideo] Model "${modelId}" does not support text input.`,
        { modelId, inputTypes: modelConfig.inputTypes }
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

    const replicateModelId: string = modelConfig.apiModel

    // Специальная обработка для Google Veo 3
    let modelInput: any
    if (modelConfig.id === 'veo3' || modelConfig.id === 'veo3_fast') {
      const finalDuration =
        selectedDuration || modelConfig.apiSettings?.durations?.[0] || 8
      modelInput = {
        prompt,
        duration_seconds: finalDuration,
        aspect_ratio: userAspectRatio, // Используем пользовательские настройки
        enable_audio: true,
      }
      // Добавляем prompt_optimizer только если он есть в apiSettings
      if (modelConfig.apiSettings?.promptOptimizer) {
        modelInput.prompt_optimizer = true
      }
      logger.info(
        `[generateTextToVideo] ${modelConfig.name} model input prepared:`,
        {
          telegram_id,
          modelId: modelConfig.id,
          fullInput: modelInput,
        }
      )
    }
    // Специальная обработка для Kie.ai моделей
    else if (modelConfig.id.startsWith('kie-')) {
      const finalDuration =
        selectedDuration || modelConfig.apiSettings?.durations?.[0] || 5

      // Определяем aspect_ratio
      let aspectRatio = selectedAspectRatio || userAspectRatio
      if (modelConfig.apiSettings?.aspectRatios) {
        // Проверяем, что выбранный aspectRatio поддерживается
        if (
          !modelConfig.apiSettings.aspectRatios.includes(aspectRatio as any)
        ) {
          aspectRatio = modelConfig.apiSettings.aspectRatios[0]
        }
      }

      modelInput = {
        prompt,
        duration_seconds: finalDuration,
        aspect_ratio: aspectRatio,
        enable_audio: true,
      }
      // Добавляем prompt_optimizer только если он есть в apiSettings
      if (modelConfig.apiSettings?.promptOptimizer) {
        modelInput.prompt_optimizer = true
      }
      logger.info(
        `[generateTextToVideo] ${modelConfig.name} model input prepared:`,
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
        prompt,
        resolution: selectedResolution, // Используем 'resolution'
      }
      logger.info('[generateTextToVideo] Seedance model input prepared:', {
        telegram_id,
        resolution: selectedResolution,
        fullInput: modelInput,
      })
    }
    // Специальная обработка для WAN 2.5 моделей
    else if (modelConfig.id === 'wan-2.5-t2v') {
      // WAN 2.5 использует Kie.ai API формат
      const finalDuration = selectedDuration || 5 // По умолчанию 5 секунд
      const finalResolution = selectedResolution || '720p' // По умолчанию 720p

      modelInput = {
        prompt,
        duration: String(finalDuration), // duration как строка
        resolution: finalResolution, // '720p' или '1080p'
        enable_prompt_expansion: true, // Включаем расширение промпта через LLM
      }

      logger.info('[generateTextToVideo] WAN 2.5 T2V model input prepared:', {
        telegram_id,
        duration: finalDuration,
        resolution: finalResolution,
        fullInput: modelInput,
      })
    }
    // Специальная обработка для WAN 2.2-fast моделей (устаревшие)
    else if (modelConfig.id === 'wan-2.2-t2v-fast') {
      // Определяем разрешение из выбора пользователя или aspect_ratio
      let wanResolution: string

      if (
        selectedResolution &&
        ['480p', '720p', '1080p'].includes(selectedResolution)
      ) {
        // Пользователь выбрал конкретное разрешение
        if (selectedResolution === '480p') {
          wanResolution = userAspectRatio === '16:9' ? '832x480' : '480x832'
        } else if (selectedResolution === '720p') {
          wanResolution = userAspectRatio === '16:9' ? '1280x720' : '720x1280'
        } else {
          // 1080p
          wanResolution = userAspectRatio === '16:9' ? '1920x1080' : '1080x1920'
        }
      } else {
        // Fallback: используем 720p по умолчанию с aspect_ratio
        wanResolution = userAspectRatio === '16:9' ? '1280x720' : '720x1280'
      }

      modelInput = {
        prompt,
        target_resolution: wanResolution, // WAN использует специфичный формат
      }
      logger.info('[generateTextToVideo] WAN 2.2 T2V model input prepared:', {
        telegram_id,
        selectedResolution,
        userAspectRatio,
        wanResolution,
        fullInput: modelInput,
      })
    } else {
      // Стандартная обработка для других моделей
      modelInput = {
        prompt,
        aspect_ratio: userAspectRatio, // Добавляем aspect_ratio и для других моделей
      }
      logger.info('[generateTextToVideo] Standard model input prepared:', {
        telegram_id,
        modelId: modelConfig.id,
        fullInput: modelInput,
      })
    }

    // Для Kie.ai моделей используем обычный Replicate, но с измененным именем модели
    let finalReplicateModelId = replicateModelId
    if (modelConfig.id.startsWith('kie-')) {
      // Извлекаем базовое имя модели (например, 'veo3_fast' из 'kie-veo3_fast')
      const baseModel = modelConfig.id.replace('kie-', '')
      // Сервер будет обрабатывать эти модели как обычные, но с маппингом на Kie.ai
      finalReplicateModelId = modelConfig.apiModel

      logger.info(
        '[generateTextToVideo] Using server routing for economy model:',
        {
          telegram_id,
          originalModelId: modelConfig.id,
          serverModelId: finalReplicateModelId,
          modelInput,
        }
      )
    }

    // ✅ FIX: Проверяем provider и используем KieAiProvider для WAN 2.5 и других Kie.ai моделей
    let videoUrl: string | undefined

    if (modelConfig.provider === 'kie') {
      logger.info('[generateTextToVideo] Using KieAiProvider for model:', {
        modelId: modelConfig.id,
        telegram_id,
        hasPrompt: !!prompt,
      })

      // Импортируем KieAiProvider
      const { KieAiProvider } = await import(
        '@/services/video-providers/KieAiProvider'
      )
      const kieProvider = new KieAiProvider()

      // Преобразуем aspectRatio в формат Kie.ai
      const rawAspectRatio = selectedAspectRatio || userAspectRatio
      const kieAspectRatio: '16:9' | '9:16' | '1:1' =
        rawAspectRatio === '16:9' ||
        rawAspectRatio === '9:16' ||
        rawAspectRatio === '1:1'
          ? rawAspectRatio
          : '9:16'

      logger.info('[generateTextToVideo] Calling KieAiProvider.generateVideo', {
        model: modelConfig.id,
        promptLength: prompt.length,
        aspectRatio: kieAspectRatio,
        duration: selectedDuration,
      })

      // Генерируем видео через Kie.ai
      const kieResponse = await kieProvider.generateVideo({
        model: modelConfig.id,
        prompt: prompt,
        aspectRatio: kieAspectRatio,
        duration: selectedDuration,
        telegram_id, // ✅ Передаём telegram_id для callback URL
      })

      logger.info('[generateTextToVideo] KieAiProvider response received', {
        success: kieResponse.success,
        hasData: !!kieResponse.data,
        hasVideoUrl: !!kieResponse.data?.videoUrl,
        hasTaskId: !!kieResponse.data?.taskId,
        error: kieResponse.error,
      })

      if (!kieResponse.success || !kieResponse.data) {
        throw new Error(kieResponse.error || 'Kie.ai API returned no data')
      }

      // Если видео готово сразу (синхронный ответ)
      if (kieResponse.data.videoUrl) {
        videoUrl = kieResponse.data.videoUrl
        logger.info('[generateTextToVideo] Video URL received from KieAi', {
          telegram_id,
          videoUrl,
        })
      }
      // Если асинхронная генерация (taskId) - для WAN моделей это нормально
      else if (kieResponse.data.taskId) {
        logger.info(
          '[generateTextToVideo] Async generation started via KieAi',
          {
            telegram_id,
            taskId: kieResponse.data.taskId,
            modelId: modelConfig.id,
          }
        )
        // Для WAN и других асинхронных моделей возвращаем taskId
        // Вызывающая функция должна обработать это через jobId polling
        return kieResponse.data.taskId
      } else {
        throw new Error('Kie.ai API returned neither videoUrl nor taskId')
      }
    } else {
      // Для моделей БЕЗ provider: 'kie' используем стандартный Replicate API
      logger.info('[generateTextToVideo] Calling replicate.run with input:', {
        replicateModelId: finalReplicateModelId,
        modelInput,
        isVeo3Family:
          modelConfig.id === 'veo3' ||
          modelConfig.id === 'veo3_fast' ||
          modelConfig.id === 'runway-aleph',
      })

      const replicateResult = await replicate.run(
        finalReplicateModelId as any,
        {
          input: modelInput,
        }
      )

      logger.info('[generateTextToVideo] replicate.run finished.', {
        telegram_id,
        replicateResultType: typeof replicateResult,
      })

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

    // ✅ FIX: Специальная обработка для ошибки 403 (Wan API)
    if (isAxiosError(error) && error.response?.status === 403) {
      logger.error(
        '[generateTextToVideo] WAN API 403 error - authorization failed',
        {
          telegram_id,
          modelId: modelConfig.id,
          status: error.response.status,
          statusText: error.response.statusText,
          data: error.response.data,
        }
      )

      errorMessage = is_ru
        ? '🚫 Ошибка авторизации API. Проверьте настройки API ключей или обратитесь к администратору.'
        : '🚫 API authorization error. Check API key settings or contact administrator.'
    } else if (
      error.response &&
      error.response.data &&
      error.response.data.detail
    ) {
      errorMessage = `Replicate error: ${error.response.data.detail}`
    } else if (error.message) {
      errorMessage = error.message
    }

    // NO REFUND HERE. There is nothing to refund: this path never charges.
    //
    // The only caller of this function is the improvePromptWizard scene, and
    // neither the scene nor any module it imports performs a debit -- measured
    // across every charge primitive in the repo (updateUserBalance,
    // directPaymentProcessor, setPayments, processBalanceOperation). The single
    // balance mutation reachable from here used to be the credit below, so
    // every failed generation handed the user stars that were never taken.
    //
    // The neighbouring live path, handleTextToVideoDirect, charges AFTER
    // delivering the video; a failure there costs the user nothing, so it has
    // nothing to give back either. The two paths also price differently --
    // that one uses getUnifiedModelPrice(id, {duration}), this credit used
    // calculateFinalPrice(id) with no duration -- so the amount returned was
    // not even the amount any path would have charged.
    //
    // Refusing to credit is the safe direction. Restoring money to a user who
    // WAS charged is the owner's call, not this function's.
    logger.error(
      '[generateTextToVideo] generation failed; no refund is due because this path never charges',
      {
        telegram_id,
        model: modelConfig.id,
        error: error.message,
      }
    )

    // В любом случае возвращаем null, чтобы вызывающая функция знала об ошибке
    return null
  }
}
