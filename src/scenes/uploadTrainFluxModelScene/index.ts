import { Scenes, Markup } from 'telegraf'
import { MyContext, type User } from '@/interfaces'
import { createImagesZip } from '../../helpers/images/createImagesZip'
import { isRussian } from '@/helpers/language'
import { deleteFile } from '@/helpers'
import { logger } from '@/utils/logger'
import { getUserBalance } from '@/core/supabase'
import { PaymentType } from '@/interfaces/payments.interface'
import {
  type InitiateModelTrainingPayload,
  initiateDigitalAvatarModelTraining,
} from '@/modules/digitalAvatarBody/index'
import { ModeEnum } from '@/interfaces/modes'

export const uploadTrainFluxModelScene = new Scenes.BaseScene<MyContext>(
  ModeEnum.UPLOAD_TRAIN_FLUX_MODEL_SCENE
)

uploadTrainFluxModelScene.enter(async ctx => {
  const isRu = isRussian(ctx)
  logger.info('[Scene Enter] uploadTrainFluxModelScene', {
    telegramId: ctx.from?.id,
  })
  let localZipPath: string | undefined = undefined

  const sessionUser = ctx.session.user
  const sessionDigitalAvatarBody = ctx.session.digitalAvatarBody

  if (!sessionUser || !sessionDigitalAvatarBody) {
    logger.error(
      '[uploadTrainFluxModelScene] Missing user or digitalAvatarBody in session.',
      {
        telegramId: ctx.from?.id,
        sessionUserExists: !!sessionUser,
        sessionDigitalAvatarBodyExists: !!sessionDigitalAvatarBody,
      }
    )
    await ctx.reply(
      '❌ Ошибка: Не удалось получить критические данные из сессии. Пожалуйста, начните заново.'
    )
    return ctx.scene.leave()
  }

  const steps = sessionDigitalAvatarBody.steps
  const calculatedCost = sessionDigitalAvatarBody.calculatedCost

  if (typeof steps !== 'number' || typeof calculatedCost !== 'number') {
    logger.error(
      '[uploadTrainFluxModelScene] Missing steps or calculatedCost in session data.',
      {
        telegramId: ctx.from?.id,
        steps,
        calculatedCost,
      }
    )
    await ctx.reply(
      '❌ Ошибка: Данные о шагах или стоимости некорректны. Пожалуйста, начните заново.'
    )
    return ctx.scene.leave()
  }

  try {
    await ctx.reply(isRu ? '⏳ Создаю архив...' : '⏳ Creating archive...')
    localZipPath = await createImagesZip(ctx.session.images)
    logger.info('[ZIP Created]', { localZipPath, telegramId: ctx.from?.id })

    if (!ctx.from?.id) {
      logger.error(
        '[uploadTrainFluxModelScene] User Telegram ID is undefined for balance check.',
        { telegramId: ctx.from?.id }
      )
      await ctx.reply(
        isRu
          ? '❌ Критическая ошибка: Не удалось определить ваш ID для проверки баланса.'
          : '❌ Critical Error: Could not determine your ID for balance check.'
      )
      return ctx.scene.leave()
    }
    const userTelegramIdString = String(ctx.from.id)
    const userBalance = await getUserBalance(userTelegramIdString)

    if (userBalance < calculatedCost) {
      logger.info(
        `[uploadTrainFluxModelScene] Not enough balance for user ${ctx.from?.id}`,
        { calculatedCost, userBalance }
      )
      await ctx.reply(
        isRu
          ? `😔 Недостаточно средств. Стоимость: ${calculatedCost} ⭐. Ваш баланс: ${userBalance} ⭐.`
          : `😔 Insufficient funds. Cost: ${calculatedCost} ⭐. Your balance: ${userBalance} ⭐.`
      )
      return ctx.scene.leave()
    }

    await ctx.reply('✅ Processing request...', Markup.removeKeyboard())

    const { telegram_id, replicate_username } = sessionUser
    const { model_name, trigger_word, gender } = sessionDigitalAvatarBody

    if (!localZipPath) {
      logger.error(
        '[UploadScene] localZipPath is undefined before calling service.',
        { telegram_id }
      )
      await ctx.reply('Ошибка создания архива.')
      return ctx.scene.leave()
    }

    const servicePayload: InitiateModelTrainingPayload = {
      telegram_id: String(ctx.from.id),
      is_ru: isRu,
      bot_name: ctx.botInfo.username,
      model_name: model_name || `default_model_${telegram_id}`,
      zipPath: localZipPath,
      steps: steps,
      trigger_word: trigger_word || undefined,
      gender: (gender as 'male' | 'female' | 'other' | undefined) || undefined,
      calculatedCost: calculatedCost,
      payment_operation_type: PaymentType.MONEY_OUTCOME,
      user_replicate_username: replicate_username || null,
    }

    logger.info('[UploadScene] Calling initiateDigitalAvatarModelTraining', {
      servicePayload,
    })

    const serviceResult = await initiateDigitalAvatarModelTraining(
      Number(servicePayload.telegram_id),
      servicePayload.zipPath,
      servicePayload.model_name,
      servicePayload.trigger_word,
      servicePayload.is_ru,
      servicePayload.bot_name,
      servicePayload.payment_operation_type,
      servicePayload.calculatedCost,
      servicePayload.steps,
      servicePayload.gender as 'male' | 'female' | 'other' | undefined
    )

    logger.info('[UploadScene] serviceResult', { serviceResult })

    if (!serviceResult.success) {
      await ctx.reply(
        isRu
          ? `😕 Не удалось начать обучение модели: ${serviceResult.message}`
          : `😕 Failed to start model training: ${serviceResult.message}`
      )
      logger.error(
        '[UploadScene] Error from initiateDigitalAvatarModelTraining',
        {
          message: serviceResult.message,
          telegramId: ctx.from.id,
        }
      )
    } else {
      await ctx.reply(
        isRu
          ? '🚀 Запрос на обучение модели успешно отправлен! Вы получите уведомление, когда модель будет готова.'
          : '🚀 Model training request sent successfully! You will be notified when the model is ready.'
      )
    }

    return ctx.scene.leave()
  } catch (error) {
    logger.error('[uploadTrainFluxModelScene] Error in scene', {
      error,
      telegramId: ctx.from?.id,
    })
    await ctx.reply(
      isRu
        ? '❌ Произошла ошибка при отправке запроса на тренировку.'
        : '❌ An error occurred while sending the training request.'
    )
  } finally {
    if (localZipPath) {
      try {
        await deleteFile(localZipPath)
        logger.info('[UploadScene] Temporary zip file deleted.', {
          localZipPath,
        })
      } catch (delError) {
        logger.error('[UploadScene] Error deleting temporary zip file.', {
          localZipPath,
          error: delError,
        })
      }
    }
  }
})

export default uploadTrainFluxModelScene
