import { mkdir, writeFile } from 'fs/promises'
import path from 'path'
import { Telegraf } from 'telegraf'
import { MyContext } from '@/interfaces'
import {
  VIDEO_MODELS_CONFIG,
  type VideoModelConfig,
} from '@/modules/videoGenerator/config/models.config'
import { logger } from '@/utils/logger'
import { replicate } from '@/core/replicate'
import {
  downloadFileHelper,
  getUserHelper,
  processBalanceVideoOperationHelper,
  saveVideoUrlHelper,
  updateUserLevelHelper,
} from './helpers'
import { updateUserBalance } from '@/core/supabase/updateUserBalance'
import { calculateFinalPrice } from '@/price/helpers'
import { PaymentType } from '@/interfaces/payments.interface'
import { Markup } from 'telegraf'

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
  imageBUrl: string | null,
  telegramInstance: Telegraf<MyContext>['telegram'],
  chatId: number,
  selectedResolution?: string, // Добавлен параметр для разрешения Seedance
  selectedAspectRatio?: string // Добавлен параметр для соотношения сторон Kie.ai моделей
): Promise<void> => {
  let localVideoPath: string | undefined
  const notificationMessage = isRu
    ? 'Генерация видео...'
    : 'Generating video...'
  let paymentAmountForNotification: number | undefined
  let newBalanceForNotification: number | undefined

  try {
    const modelConfig = VIDEO_MODELS_CONFIG[modelId]
    if (!modelConfig) {
      logger.error(
        '[generateImageToVideo BG] Invalid modelId, config not found:',
        { modelId }
      )
      await telegramInstance.sendMessage(
        chatId,
        isRu
          ? `❌ Ошибка: Конфигурация для модели ${modelId} не найдена.`
          : `❌ Error: Configuration for model ${modelId} not found.`
      )
      return
    }

    logger.info('[I2V BG] Start', {
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
        await telegramInstance.sendMessage(
          chatId,
          '❌ Ошибка: Image A и Image B обязательны для морфинга.'
        )
        return
      }
      if (!modelConfig.canMorph) {
        await telegramInstance.sendMessage(
          chatId,
          isRu
            ? `❌ Модель ${modelConfig.title} не поддерживает морфинг.`
            : `❌ Model ${modelConfig.title} does not support morphing.`
        )
        return
      }
      logger.info('[I2V BG] Morphing mode validated', { telegramId })
    } else {
      if (!imageUrl || !prompt) {
        await telegramInstance.sendMessage(
          chatId,
          '❌ Ошибка: Изображение и промпт обязательны для стандартного режима.'
        )
        return
      }
      if (!modelConfig.imageKey) {
        await telegramInstance.sendMessage(
          chatId,
          `❌ Ошибка: Отсутствует imageKey для модели ${modelConfig.title}.`
        )
        return
      }
      logger.info('[I2V BG] Standard mode validated', { telegramId })
    }

    const userExists = await getUserHelper(telegramId)
    if (!userExists) {
      logger.warn(
        '[I2V BG] User not found, cannot check level or get aspect ratio.',
        { telegramId }
      )
      await telegramInstance.sendMessage(
        chatId,
        `❌ Ошибка: Пользователь ${telegramId} не найден.`
      )
      return
    } else {
      const level = userExists.level
      if (level === 8) {
        await updateUserLevelHelper(telegramId)
        logger.info('[I2V BG] User level updated', {
          telegramId,
          oldLevel: level,
        })
      }
    }
    const userAspectRatio =
      selectedAspectRatio || (userExists.aspect_ratio ?? '9:16')

    const balanceResult = await processBalanceVideoOperationHelper(
      telegramId,
      modelId,
      isRu,
      botName,
      'image_to_video'
    )

    if (
      !balanceResult.success ||
      balanceResult.newBalance === undefined ||
      balanceResult.paymentAmount === undefined
    ) {
      logger.error('[I2V BG] Balance check failed', {
        telegramId,
        error: balanceResult.error,
      })
      await telegramInstance.sendMessage(
        chatId,
        balanceResult.error ||
          (isRu ? '❌ Ошибка проверки баланса' : '❌ Balance check failed')
      )
      return
    }
    paymentAmountForNotification = balanceResult.paymentAmount
    newBalanceForNotification = balanceResult.newBalance
    logger.info('[I2V BG] Balance sufficient and deducted', {
      telegramId,
      paymentAmount: paymentAmountForNotification,
      newBalance: newBalanceForNotification,
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
        logger.info('[I2V BG] Prepared Replicate input for Kling morphing', {
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
        logger.info('[I2V BG] Prepared Replicate input for generic morphing', {
          telegramId,
          inputKeys: Object.keys(modelInput),
        })
      }
    } else {
      if (!imageUrl || !prompt || !modelConfig.imageKey) {
        logger.error('[I2V BG] Internal validation failed (standard mode)', {
          telegramId,
        })
        throw new Error(
          'Internal validation failed (standard mode) after balance check'
        )
      }

      // Специальная обработка для Google Veo 3 моделей (используем План А/Б)
      if (modelConfig.id === 'veo-3' || modelConfig.id === 'veo-3-fast') {
        // Используем Plan A/B систему для Veo моделей
        logger.info(`[I2V BG] Using Plan A/B for ${modelConfig.title}`, {
          telegramId,
          modelId: modelConfig.id,
          aspectRatio: userAspectRatio,
          hasImage: !!imageUrl,
        })
        
        // Импортируем и используем новую функцию с Plan A/B
        const { generateImageToVideo: generateI2VWithPlanAB } = await import('@/services/generateImageToVideo')
        
        const planABResponse = await generateI2VWithPlanAB({
          imageUrl,
          prompt,
          videoModel: modelConfig.id,
          aspectRatio: userAspectRatio, // Используем правильное название параметра
          duration: modelConfig.api.input.duration_seconds || 8,
          telegram_id: telegramId,
          username,
          is_ru: isRu,
          bot_name: botName,
        })
        
        if (!planABResponse.success) {
          throw new Error(planABResponse.error || 'Plan A/B failed for Veo model')
        }
        
        // Если получили videoUrl сразу
        if (planABResponse.videoUrl) {
          const videoUrl = planABResponse.videoUrl
          const videoBuffer = await downloadFileHelper(videoUrl)
          logger.info('[I2V BG] Video downloaded from Plan A/B', { telegramId, url: videoUrl })
          
          const dirPath = path.join('uploads', String(telegramId), 'image-to-video')
          await mkdir(dirPath, { recursive: true })
          const timestamp = Date.now()
          const uniqueFilename = `${timestamp}_video.mp4`
          localVideoPath = path.join(dirPath, uniqueFilename)
          const u8 = new Uint8Array(videoBuffer)
          await writeFile(localVideoPath, u8)
          logger.info('[I2V BG] Video saved locally from Plan A/B', {
            telegramId,
            path: localVideoPath,
          })
          
          await saveVideoUrlHelper(telegramId, videoUrl, localVideoPath, modelId)
          logger.info('[I2V BG] Video info saved to DB', { telegramId })
          
          const caption = isRu
            ? `✨ Ваше видео (${modelConfig.title}) готово!\n💰 Списано: ${paymentAmountForNotification} ✨\n💎 Остаток: ${newBalanceForNotification} ✨`
            : `✨ Your video (${modelConfig.title}) is ready!\n💰 Cost: ${paymentAmountForNotification} ✨\n💎 Balance: ${newBalanceForNotification} ✨`
          
          await telegramInstance.sendVideo(
            chatId,
            { source: localVideoPath },
            { caption }
          )
          
          // Добавляем финальные кнопки
          logger.info('[I2V BG] Sending final buttons to user', { telegramId })
          
          const keyboard = Markup.keyboard([
            [
              isRu
                ? '✨ Создать еще (Изображение в Видео)'
                : '✨ Create More (Image to Video)',
            ],
            [
              isRu
                ? '🖼 Выбрать другую модель (Видео)'
                : '🖼 Select Another Model (Video)',
            ],
            [isRu ? '🏠 Главное меню' : '🏠 Main Menu'],
          ]).resize()
          
          await telegramInstance.sendMessage(
            chatId,
            isRu
              ? 'Ваше видео готово! Что дальше?'
              : 'Your video is ready! What next?',
            keyboard
          )
          return // Выходим из функции, так как видео уже отправлено
        }
        
        // Если получили jobId, нужно дождаться завершения
        if (planABResponse.jobId) {
          // TODO: Implement polling logic for jobId
          throw new Error('Job polling not implemented yet for Plan A/B')
        }
        
        throw new Error('No video URL or job ID received from Plan A/B')
      }
      // Специальная обработка для Seedance-1-Pro моделей
      else if (modelConfig.id === 'seedance-1-pro' && selectedResolution) {
        modelInput = {
          ...modelConfig.api.input, // ИСПРАВЛЕНИЕ: Включаем базовые параметры API
          prompt,
          resolution: selectedResolution, // ИСПРАВЛЕНО: используем 'resolution' вместо 'target_resolution'
          [modelConfig.imageKey]: imageUrl,
        }
        logger.info('[I2V BG] Seedance model input prepared:', {
          telegramId,
          resolution: selectedResolution, // ИСПРАВЛЕНО: логируем 'resolution'
          hasImage: !!imageUrl,
          imageKey: modelConfig.imageKey,
          imageUrl: imageUrl, // Логируем URL изображения для отладки
          fullInput: modelInput, // Логируем полный input для отладки
        })
      }
      // Специальная обработка для WAN 2.2 I2V Fast модели
      else if (modelConfig.id === 'wan-2.2-i2v-fast') {
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
            wanResolution =
              userAspectRatio === '16:9' ? '1920x1080' : '1080x1920'
          }
        } else {
          // Fallback: используем 720p по умолчанию с aspect_ratio
          wanResolution = userAspectRatio === '16:9' ? '1280x720' : '720x1280'
        }

        modelInput = {
          ...modelConfig.api.input,
          prompt,
          target_resolution: wanResolution, // WAN использует специфичный формат
          [modelConfig.imageKey]: imageUrl,
        }
        logger.info('[I2V BG] WAN 2.2 I2V model input prepared:', {
          telegramId,
          selectedResolution,
          userAspectRatio,
          wanResolution,
          hasImage: !!imageUrl,
          imageKey: modelConfig.imageKey,
          fullInput: modelInput,
        })
      } else {
        // Стандартная обработка для остальных моделей
        modelInput = {
          ...modelConfig.api.input,
          prompt,
          aspect_ratio: userAspectRatio,
          [modelConfig.imageKey]: imageUrl,
        }
        logger.info('[I2V BG] Standard model input prepared:', {
          telegramId,
          modelId: modelConfig.id,
          inputKeys: Object.keys(modelInput),
        })
      }

      logger.info('[I2V BG] Prepared Replicate input for standard', {
        telegramId,
        inputKeys: Object.keys(modelInput),
      })
    }

    logger.info('[I2V BG] Calling replicate.run', {
      model: replicateModelId,
      telegramId,
    })
    const replicateResult = await replicate.run(replicateModelId as any, {
      input: modelInput,
    })
    logger.info('[I2V BG] replicate.run finished', { telegramId })

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
      logger.error('[I2V BG] Failed to extract video URL from Replicate', {
        telegramId,
        replicateResult,
      })
      throw new Error(
        isRu
          ? 'Ошибка: Не удалось получить URL видео от Replicate'
          : 'Error: Failed to get video URL from Replicate'
      )
    }

    logger.info('[I2V BG] Video URL extracted', { telegramId, videoUrl })

    const videoBuffer = await downloadFileHelper(videoUrl)
    logger.info('[I2V BG] Video downloaded', { telegramId, url: videoUrl })

    const dirPath = path.join('uploads', String(telegramId), 'image-to-video')
    await mkdir(dirPath, { recursive: true })
    const timestamp = Date.now()
    let baseFilename = 'video.mp4'
    try {
      baseFilename = path.basename(new URL(videoUrl).pathname)
    } catch (urlError) {
      logger.warn('[I2V BG] Could not parse filename from URL, using default', {
        videoUrl,
        urlError,
      })
    }
    const uniqueFilename = `${timestamp}_${baseFilename}`
    localVideoPath = path.join(dirPath, uniqueFilename)
    const u8 = new Uint8Array(videoBuffer)
    await writeFile(localVideoPath, u8)
    logger.info('[I2V BG] Video saved locally', {
      telegramId,
      path: localVideoPath,
    })

    await saveVideoUrlHelper(telegramId, videoUrl, localVideoPath, modelId)
    logger.info('[I2V BG] Video info saved to DB', { telegramId })

    logger.info('[I2V BG] Success, sending video', {
      telegramId,
      videoUrl,
      localVideoPath,
    })
    const caption = isRu
      ? `✨ Ваше видео (${modelConfig.title}) готово!\n💰 Списано: ${paymentAmountForNotification} ✨\n💎 Остаток: ${newBalanceForNotification} ✨`
      : `✨ Your video (${modelConfig.title}) is ready!\n💰 Cost: ${paymentAmountForNotification} ✨\n💎 Balance: ${newBalanceForNotification} ✨`

    await telegramInstance.sendVideo(
      chatId,
      { source: localVideoPath },
      { caption }
    )

    // Добавляем финальные кнопки после успешной генерации видео
    logger.info('[I2V BG] Sending final buttons to user', { telegramId })

    const keyboard = Markup.keyboard([
      [
        isRu
          ? '✨ Создать еще (Изображение в Видео)'
          : '✨ Create More (Image to Video)',
      ],
      [
        isRu
          ? '🖼 Выбрать другую модель (Видео)'
          : '🖼 Select Another Model (Video)',
      ],
      [isRu ? '🏠 Главное меню' : '🏠 Main Menu'],
    ]).resize()

    await telegramInstance.sendMessage(
      chatId,
      isRu
        ? 'Ваше видео готово! Что дальше?'
        : 'Your video is ready! What next?',
      keyboard
    )
  } catch (error: any) {
    logger.error('[I2V BG] General error in generateImageToVideo', {
      error: error?.message,
      stack: error?.stack,
      telegramId,
    })

    // Универсальный возврат средств для всех моделей при ошибке
    const modelConfig = VIDEO_MODELS_CONFIG[modelId]
    if (modelConfig && paymentAmountForNotification) {
      logger.warn(
        '[I2V BG] Image-to-video generation failed, attempting refund',
        {
          telegramId,
          model: modelConfig.id,
          error: error.message,
          refundAmount: paymentAmountForNotification,
        }
      )

      try {
        // Возвращаем средства обратно
        const refundResult = await updateUserBalance(
          telegramId,
          paymentAmountForNotification,
          PaymentType.MONEY_INCOME,
          `Refund for failed ${modelConfig.title} generation (I2V)`,
          {
            bot_name: botName,
            service_type: 'image-to-video-refund',
            model_name: modelConfig.id,
            original_error: error.message,
            refund_amount: paymentAmountForNotification,
          }
        )

        logger.info(
          '[I2V BG] Refund processed for image-to-video generation failure',
          {
            telegramId,
            model: modelConfig.id,
            refund_amount: paymentAmountForNotification,
            refund_result: refundResult,
          }
        )
      } catch (refundError) {
        logger.error('[I2V BG] Failed to process refund', {
          telegramId,
          model: modelConfig.id,
          refund_error: refundError.message,
        })
      }
    }

    const errorMessage =
      error?.message ||
      (isRu ? 'Произошла неизвестная ошибка' : 'An unknown error occurred')

    // Уведомляем пользователя об ошибке и возврате средств
    const refundMessage = isRu
      ? ' Средства возвращены на ваш баланс.'
      : ' Funds have been refunded to your balance.'

    try {
      await telegramInstance.sendMessage(
        chatId,
        isRu
          ? `❌ Ошибка генерации видео: ${errorMessage}${refundMessage}`
          : `❌ Video generation error: ${errorMessage}${refundMessage}`
      )
    } catch (sendError: any) {
      logger.error('[I2V BG] Failed to send error message to user', {
        originalError: error?.message,
        sendError: sendError?.message,
        telegramId,
      })
    }
  }
}
