import { mkdir, writeFile } from 'fs/promises'
import path from 'path'
import {
  VIDEO_MODELS_CONFIG,
  type VideoModelConfig,
} from '@/modules/imageToVideoGenerator/config/models.config'
import { logger } from '@/utils/logger'
import { replicate } from '@/core/replicate'
import {
  downloadFileHelper,
  getUserHelper,
  processBalanceVideoOperationHelper,
  saveVideoUrlHelper,
  updateUserLevelHelper,
} from './helpers'

// --- Возвращаем старое название и сигнатуру (без deps, с прямыми данными) ---
export const generateImageToVideo = async (
  telegramId: string,
  username: string,
  isRu: boolean,
  botName: string,
  modelId: string,
  imageUrl: string | null,
  prompt: string | null,
  isMorphing: boolean,
  imageAUrl: string | null,
  imageBUrl: string | null
): Promise<
  | {
      videoUrl: string
      localVideoPath: string
      paymentAmount: number
      newBalance: number
    }
  | { error: string }
> => {
  try {
    const modelConfig = VIDEO_MODELS_CONFIG[modelId]
    if (!modelConfig) {
      logger.error(
        '[generateImageToVideo] Invalid modelId, config not found:',
        {
          modelId,
        }
      )
      return {
        error: `Ошибка: Конфигурация для модели ${modelId} не найдена.`,
      }
    }

    logger.info('[I2V] Start', {
      modelId,
      telegramId,
      isMorphing,
      hasImageUrl: !!imageUrl,
      hasPrompt: !!prompt,
      hasImageA: !!imageAUrl,
      hasImageB: !!imageBUrl,
    })

    if (isMorphing) {
      if (!imageAUrl || !imageBUrl) {
        return {
          error: 'Ошибка: imageAUrl и imageBUrl обязательны для морфинга',
        }
      }
      if (!modelConfig.canMorph) {
        logger.info('[I2V] Attempt to morph non-morphable model', {
          telegramId,
          modelId,
        })
        return {
          error: isRu
            ? `Модель ${modelConfig.title} не поддерживает режим морфинга.`
            : `Model ${modelConfig.title} does not support morphing mode.`,
        }
      }
      logger.info('[I2V] Morphing mode validated', { telegramId })
    } else {
      if (!imageUrl) {
        return { error: 'Ошибка: imageUrl обязателен для стандартного режима' }
      }
      if (!prompt) {
        return { error: 'Ошибка: prompt обязателен для стандартного режима' }
      }
      if (!modelConfig.imageKey) {
        logger.error('[I2V] Missing imageKey in config for standard mode', {
          telegramId,
          modelId,
        })
        return {
          error: `Ошибка: Отсутствует imageKey для модели ${modelConfig.title}`,
        }
      }
      logger.info('[I2V] Standard mode validated', { telegramId })
    }

    const userExists = await getUserHelper(telegramId)
    if (!userExists) {
      logger.warn(
        '[I2V] User not found, cannot check level or get aspect ratio.',
        { telegramId }
      )
      return { error: `Ошибка: Пользователь ${telegramId} не найден.` }
    } else {
      const level = userExists.level
      if (level === 8) {
        await updateUserLevelHelper(telegramId)
        logger.info('[I2V] User level updated', { telegramId, oldLevel: level })
      }
    }
    const userAspectRatio = userExists.aspect_ratio ?? '16:9'

    const balanceResult = await processBalanceVideoOperationHelper(
      telegramId,
      modelId,
      isRu,
      botName
    )

    if (
      !balanceResult.success ||
      balanceResult.newBalance === undefined ||
      balanceResult.paymentAmount === undefined
    ) {
      logger.error('[I2V] Balance check failed', {
        telegramId,
        error: balanceResult.error,
        success: balanceResult.success,
      })
      return {
        error: balanceResult.error || 'Ошибка: Проверка баланса не удалась',
      }
    }
    const { newBalance, paymentAmount } = balanceResult
    logger.info('[I2V] Balance sufficient and deducted', {
      telegramId,
      paymentAmount,
      newBalance,
    })

    const replicateModelId: string = modelConfig.api.model
    let modelInput: any = {}

    if (isMorphing) {
      if (modelConfig.id.startsWith('kling-') && modelConfig.imageKey) {
        modelInput = {
          ...modelConfig.api.input,
          [modelConfig.imageKey]: imageAUrl,
          end_image: imageBUrl,
          prompt: prompt || '',
        }
        logger.info('[I2V] Prepared Replicate input for Kling morphing', {
          telegramId,
          inputKeys: Object.keys(modelInput),
        })
      } else {
        modelInput = {
          ...modelConfig.api.input,
          image_a: imageAUrl,
          image_b: imageBUrl,
          prompt: prompt || '',
        }
        logger.info('[I2V] Prepared Replicate input for generic morphing', {
          telegramId,
          inputKeys: Object.keys(modelInput),
        })
      }
    } else {
      if (!imageUrl || !prompt || !modelConfig.imageKey) {
        logger.error('[I2V] Internal validation failed (standard mode)', {
          telegramId,
        })
        return {
          error:
            'Внутренняя ошибка: Недостаточно данных для стандартного режима.',
        }
      }
      modelInput = {
        ...modelConfig.api.input,
        prompt,
        aspect_ratio: userAspectRatio,
        [modelConfig.imageKey]: imageUrl,
      }
      logger.info('[I2V] Prepared Replicate input for standard', {
        telegramId,
        inputKeys: Object.keys(modelInput),
      })
    }

    logger.info('[I2V] Calling replicate.run', {
      model: replicateModelId,
      telegramId,
    })
    const replicateResult = await replicate.run(replicateModelId as any, {
      input: modelInput,
    })
    logger.info('[I2V] replicate.run finished', { telegramId })

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
      logger.error('[I2V] Failed to extract video URL from Replicate', {
        telegramId,
        replicateResult,
      })
      return {
        error: 'Ошибка: Не удалось получить URL видео от Replicate',
      }
    }

    logger.info('[I2V] Video URL extracted', { telegramId, videoUrl })

    let videoBuffer: Buffer
    try {
      videoBuffer = await downloadFileHelper(videoUrl)
      logger.info('[I2V] Video downloaded', { telegramId, url: videoUrl })
    } catch (downloadError: any) {
      logger.error('[I2V] Video download failed', {
        telegramId,
        url: videoUrl,
        error: downloadError?.message,
      })
      return {
        error: isRu ? 'Ошибка скачивания видео' : 'Error downloading video',
      }
    }

    const dirPath = path.join('uploads', String(telegramId), 'image-to-video')
    let localVideoPath: string
    try {
      await mkdir(dirPath, { recursive: true })
      logger.info('[I2V] Directory created/ensured', {
        telegramId,
        path: dirPath,
      })

      const timestamp = Date.now()
      let baseFilename = 'video.mp4'
      try {
        baseFilename = path.basename(new URL(videoUrl).pathname)
      } catch (urlError) {
        logger.error('[I2V] Could not parse video URL for basename', {
          videoUrl,
          error: urlError,
        })
      }
      const filename = `${timestamp}_${baseFilename}`
      localVideoPath = path.join(dirPath, filename)

      await writeFile(localVideoPath, videoBuffer)
      logger.info('[I2V] Video saved locally', {
        telegramId,
        path: localVideoPath,
      })
    } catch (fsError: any) {
      logger.error('[I2V] Failed to save video locally', {
        telegramId,
        path: dirPath,
        error: fsError?.message,
      })
      return {
        error: isRu ? 'Ошибка сохранения видео' : 'Error saving video locally',
      }
    }

    try {
      await saveVideoUrlHelper(telegramId, videoUrl, localVideoPath, modelId)
      logger.info('[I2V] Video info saved to DB', { telegramId })
    } catch (dbError: any) {
      logger.error('[I2V] Failed to save video info to DB', {
        telegramId,
        error: dbError?.message,
      })
      return {
        error: isRu
          ? 'Ошибка сохранения информации о видео'
          : 'Error saving video info',
      }
    }

    logger.info('[I2V] Success', { telegramId, videoUrl, localVideoPath })
    return {
      videoUrl,
      localVideoPath,
      paymentAmount,
      newBalance,
    }
  } catch (error: any) {
    logger.error('[I2V] Unexpected error', {
      telegramId,
      modelId: modelId ?? 'unknown',
      error: error?.message,
      stack: error?.stack,
    })
    return {
      error: isRu ? 'Внутренняя ошибка сервера' : 'Internal server error',
    }
  }
}
