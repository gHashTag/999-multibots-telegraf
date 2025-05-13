import { Scenes } from 'telegraf'
import { MyContext } from '@/interfaces'
import { createImagesZip } from '../../helpers/images/createImagesZip'
import { isRussian } from '@/helpers/language'
import { deleteFile } from '@/helpers'
import { logger } from '@/utils/logger'
import type { ModelTrainingRequest } from '@/modules/digitalAvatarBody/types'
import { COSTS } from '@/config'
import { getUserBalance, updateUserBalance } from '@/core/supabase'
import { PaymentType } from '@/interfaces/payments.interface'
import { startModelTraining } from '@/modules/digitalAvatarBody/services/modelTraining.service'

export const uploadTrainFluxModelScene = new Scenes.BaseScene<MyContext>(
  'uploadTrainFluxModelScene'
)

uploadTrainFluxModelScene.enter(async ctx => {
  const isRu = isRussian(ctx)
  logger.info('[Scene Enter] uploadTrainFluxModelScene', {
    telegramId: ctx.from?.id,
  })
  let zipPath: string | undefined = undefined

  try {
    await ctx.reply(isRu ? '⏳ Создаю архив...' : '⏳ Creating archive...')
    zipPath = await createImagesZip(ctx.session.images)
    logger.info('[ZIP Created]', { zipPath, telegramId: ctx.from?.id })

    if (!ctx.digitalAvatarAPI) {
      logger.error(
        '[DigitalAvatarAPI Missing] digitalAvatarAPI не найден в контексте.',
        { telegramId: ctx.from?.id }
      )
      await ctx.reply(
        isRu
          ? '❌ Критическая ошибка: Сервис тренировки недоступен. Сообщите администратору.'
          : '❌ Critical error: Training service unavailable. Please inform an administrator.'
      )
      return ctx.scene.leave()
    }

    const telegramId = ctx.from?.id
    if (!telegramId) {
      logger.error('[TelegramID Missing]', { session: ctx.session })
      await ctx.reply(
        isRu
          ? '❌ Ошибка: не удалось определить ваш ID.'
          : '❌ Error: could not determine your ID.'
      )
      return ctx.scene.leave()
    }

    const steps = ctx.session.steps || 1000
    const costPerStep = 0.22
    const cost = Math.round(steps * costPerStep)
    const operationTypeForCost = 'NEURO_TRAIN_LORA'

    logger.info(
      `[Cost Calculated] Operation: ${operationTypeForCost}, Steps: ${steps}, Cost: ${cost} звезд`,
      { telegramId }
    )

    const balance = await getUserBalance(telegramId.toString())
    logger.info(
      `[Balance Check] User: ${telegramId}, Balance: ${balance} звезд`,
      { cost }
    )

    if (balance === null || balance < cost) {
      logger.warn(
        `[Insufficient Funds] User: ${telegramId}, Balance: ${balance}, Cost: ${cost}`
      )
      await ctx.reply(
        isRu
          ? `⚠️ Недостаточно средств. Текущий баланс: ${balance || 0} ⭐. Требуется: ${cost} ⭐. Пожалуйста, пополните баланс.`
          : `⚠️ Insufficient funds. Current balance: ${balance || 0} ⭐. Required: ${cost} ⭐. Please top up your balance.`
      )
      return ctx.scene.enter('paymentScene')
    }

    await ctx.reply(
      isRu
        ? `⏳ Списываю ${cost} ⭐ за тренировку...`
        : `⏳ Deducting ${cost} ⭐ for training...`
    )
    const debitResult = await updateUserBalance(
      telegramId.toString(),
      cost,
      PaymentType.MONEY_OUTCOME,
      `${operationTypeForCost}_DEBIT_${steps}_STEPS`,
      { bot_name: ctx.botInfo?.username }
    )

    if (!debitResult) {
      logger.error(
        '[Debit Failed] Ошибка при вызове updateUserBalance для списания средств.',
        { telegramId, cost }
      )
      await ctx.reply(
        isRu
          ? '❌ Произошла ошибка при списании средств. Попробуйте позже.'
          : '❌ An error occurred while deducting funds. Please try again later.'
      )
      return ctx.scene.leave()
    }
    logger.info(
      `[Funds Debited Attempted] User: ${telegramId}, Amount: ${cost} звезд`
    )
    await ctx.reply(
      isRu
        ? `✅ ${cost} ⭐ успешно списано (операция зарегистрирована). Начинаю подготовку к тренировке...`
        : `✅ ${cost} ⭐ successfully deducted (operation registered). Preparing for training...`
    )

    const triggerWord = `${ctx.session.username?.toLocaleUpperCase()}`
    if (!triggerWord) {
      logger.error('[TriggerWord Missing]', {
        telegramId,
        session: ctx.session,
      })
      await ctx.reply(
        isRu
          ? '❌ Ошибка: не удалось определить ключевое слово для тренировки.'
          : '❌ Error: could not determine trigger word for training.'
      )
      await updateUserBalance(
        telegramId.toString(),
        cost,
        PaymentType.MONEY_INCOME,
        `${operationTypeForCost}_REFUND_TRIGGERWORD_ERROR_${steps}_STEPS`,
        { bot_name: ctx.botInfo?.username }
      )
      logger.info(
        `[Funds Refunded Attempted] TriggerWord error. User: ${telegramId}, Amount: ${cost}`,
        { operationTypeForCost, steps }
      )
      return ctx.scene.leave()
    }

    const requestData: ModelTrainingRequest = {
      telegram_id: telegramId.toString(),
      bot_name: ctx.botInfo?.username || 'unknown_bot',
      model_name: ctx.session.modelName || 'defaultModelName',
      trigger_word: triggerWord,
      file_path: zipPath,
      steps: steps,
      is_ru: isRu,
    }

    logger.info('[Module Call] Вызов digitalAvatarAPI.startModelTraining', {
      requestData: { ...requestData, file_path: 'local_zip_path_omitted' },
      telegramId,
    })

    logger.info(
      `[uploadTrainFluxModelScene] Sending training request for user ${ctx.from.id}`
    )

    try {
      const moduleResponse = await startModelTraining(requestData, ctx)

      if (moduleResponse.success) {
        logger.info(
          `[uploadTrainFluxModelScene] Training started successfully for user ${ctx.from.id}, replicate ID: ${moduleResponse.replicateTrainingId}`
        )
        const successMessage = isRu
          ? `✅ Тренировка успешно запущена!\n   ID задачи: ${moduleResponse.replicateTrainingId || 'N/A'}\n   Списано: ${moduleResponse.cost || cost} ⭐`
          : `✅ Training started successfully!\n   Task ID: ${moduleResponse.replicateTrainingId || 'N/A'}\n   Cost: ${moduleResponse.cost || cost} ⭐`
        await ctx.reply(successMessage)
      } else {
        throw new Error(
          moduleResponse.message || 'Unknown error starting training'
        )
      }
    } catch (error: any) {
      logger.error(
        `[uploadTrainFluxModelScene] Error starting training for user ${ctx.from.id}: ${error.message}`
      )
      await updateUserBalance(
        telegramId.toString(),
        cost,
        PaymentType.MONEY_INCOME,
        `${operationTypeForCost}_REFUND_START_ERROR_${steps}_STEPS`,
        { bot_name: ctx.botInfo?.username, error_message: error.message }
      )
      logger.info(
        `[Funds Refunded Attempted] Start error. User: ${telegramId}, Amount: ${cost}`
      )
      const errorMessageText = isRu
        ? `❌ Ошибка при запуске тренировки: ${error.message}`
        : `❌ Error starting training: ${error.message}`
      await ctx.reply(errorMessageText)
      return ctx.scene.leave()
    }
  } catch (error: any) {
    logger.error('[Scene Error] uploadTrainFluxModelScene', {
      telegramId: ctx.from?.id,
      error: error.message,
      stack: error.stack,
      session: ctx.session,
    })
    const userMessage = isRu
      ? '❌ Произошла непредвиденная ошибка в сцене загрузки. Попробуйте позже или обратитесь в поддержку.'
      : '❌ An unexpected error occurred in the upload scene. Please try again later or contact support.'
    await ctx
      .reply(userMessage)
      .catch(e =>
        logger.error(
          '[Reply Error] Failed to send error message in upload scene',
          { error: e.message }
        )
      )
  } finally {
    if (zipPath) {
      await deleteFile(zipPath).catch(e =>
        logger.warn('[ZIP Cleanup Error]', {
          zipPath,
          error: e.message,
          telegramId: ctx.from?.id,
        })
      )
    }
    logger.info('[Scene Leave] uploadTrainFluxModelScene', {
      telegramId: ctx.from?.id,
    })
    await ctx.scene.leave().catch(e =>
      logger.warn('[Scene Leave Error]', {
        sceneId: ctx.scene.current?.id,
        error: e.message,
      })
    )
  }
})

export default uploadTrainFluxModelScene
