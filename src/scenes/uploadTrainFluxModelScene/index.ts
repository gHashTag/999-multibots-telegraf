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
    await ctx.reply(
      isRu
        ? '🤖 Отправляю данные на тренировку... Это может занять некоторое время.'
        : '🤖 Sending data for training... This may take some time.'
    )

    const moduleResponse = await ctx.digitalAvatarAPI.startModelTraining(
      requestData,
      ctx
    )

    logger.info('[Module Response]', { response: moduleResponse, telegramId })

    if (moduleResponse.success) {
      await ctx.reply(moduleResponse.message)
      if (moduleResponse.replicateTrainingId) {
        logger.info(
          `[Plan B Success] Replicate ID: ${moduleResponse.replicateTrainingId}`,
          { telegramId }
        )
      } else if (moduleResponse.eventId) {
        logger.info(
          `[Plan A Success] Inngest Event ID: ${moduleResponse.eventId}`,
          { telegramId }
        )
      }
    } else {
      logger.error('[Module Error]', {
        telegramId,
        error: moduleResponse.error,
        details: moduleResponse.details,
        message: moduleResponse.message,
      })
      await ctx.reply(
        `${isRu ? '❌ Произошла ошибка во время запуска тренировки' : '❌ An error occurred during training startup'}: ${moduleResponse.message}${moduleResponse.details ? ` (${moduleResponse.details})` : ''}`
      )

      if (moduleResponse.cost && moduleResponse.cost > 0) {
        logger.info(
          `[Refunding after Module Error Attempted] User: ${telegramId}, Amount: ${moduleResponse.cost}`
        )
        await updateUserBalance(
          telegramId.toString(),
          moduleResponse.cost,
          PaymentType.MONEY_INCOME,
          `${operationTypeForCost}_REFUND_MODULE_ERROR_${steps}_STEPS`,
          { bot_name: ctx.botInfo?.username }
        )
        await ctx.reply(
          isRu
            ? `✅ Средства (${moduleResponse.cost} ⭐) были возвращены на ваш баланс (операция зарегистрирована).`
            : `✅ Funds (${moduleResponse.cost} ⭐) have been refunded to your balance (operation registered).`
        )
      } else {
        logger.warn(
          '[Module Error, No Refund Cost] Не удалось определить сумму для возврата из ответа модуля.',
          { moduleResponse, telegramId, steps }
        )
        await ctx.reply(
          isRu
            ? 'Пожалуйста, свяжитесь с поддержкой для проверки баланса.'
            : 'Please contact support to check your balance.'
        )
      }
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
