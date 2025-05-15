import { Scenes, Markup } from 'telegraf'
import { createImagesZip } from '../../helpers/images/createImagesZip'
import { deleteFile } from '@/helpers'
import { logger } from '@/utils/logger'
import { getUserBalance } from '@/core/supabase'
import {
  type InitiateModelTrainingPayload,
  initiateDigitalAvatarModelTraining,
} from '@/modules/digitalAvatarBody/index'
import { PaymentType } from '@/modules/digitalAvatarBody/types'
import { TRAINING_MESSAGES as SHARED_TRAINING_MESSAGES } from '@/modules/digitalAvatarBody/constants/messages'
import { MyWizardContext } from '@/interfaces/telegram-bot.interface'

export const UPLOAD_TRAIN_FLUX_MODEL_SCENE = 'upload_train_flux_model_scene'

export const uploadTrainFluxModelScene =
  new Scenes.WizardScene<MyWizardContext>(
    UPLOAD_TRAIN_FLUX_MODEL_SCENE,
    async ctx => {
      const isRu = ctx.session.language === 'ru'
      logger.info('[Scene Enter] uploadTrainFluxModelScene - Step 1', {
        telegramId: ctx.from?.id,
      })
      const localZipPath: string | undefined = undefined

      const sessionDigitalAvatarBody = ctx.session.digitalAvatarBody

      if (!sessionDigitalAvatarBody) {
        logger.error(
          '[uploadTrainFluxModelScene] Missing digitalAvatarBody in scene session.',
          {
            telegramId: ctx.from?.id,
          }
        )
        await ctx.reply(
          '❌ Ошибка: Не удалось получить критические данные из сессии сцены. Пожалуйста, начните заново.'
        )
        return ctx.scene.leave()
      }

      const steps = sessionDigitalAvatarBody.steps
      const calculatedCost = sessionDigitalAvatarBody.calculatedCost
      const modelNameFromSession = sessionDigitalAvatarBody.model_name
      const publicUrlFromSession = sessionDigitalAvatarBody.zipPath
      const triggerWordFromSession = sessionDigitalAvatarBody.trigger_word
      const genderFromSession = sessionDigitalAvatarBody.gender
      const botNameFromCtx = ctx.botInfo.username

      if (
        steps === undefined ||
        calculatedCost === undefined ||
        !modelNameFromSession
      ) {
        logger.error(
          '[uploadTrainFluxModelScene] Missing critical fields in session.digitalAvatarBody.',
          {
            telegramId: ctx.from?.id,
            steps,
            calculatedCost,
            modelName: modelNameFromSession,
          }
        )
        await ctx.reply(
          '❌ Ошибка: Данные о шагах, стоимости или имени модели некорректны в сессии сцены. Пожалуйста, начните заново.'
        )
        return ctx.scene.leave()
      }

      try {
        let finalPublicUrl: string

        if (publicUrlFromSession) {
          finalPublicUrl = publicUrlFromSession
          logger.info(
            '[UploadScene] Using provided publicUrl (zipPath) from scene session.',
            {
              finalPublicUrl,
              telegramId: ctx.from?.id,
            }
          )
        } else {
          logger.warn(
            '[UploadScene] publicUrl (zipPath) from session.digitalAvatarBody is not available. This scene expects it to be set by a previous step or direct input.',
            { telegramId: ctx.from?.id }
          )
          await ctx.reply(
            '❌ Ошибка: URL архива (zipPath) не найден в сессии сцены. Этот шаг ожидает, что URL будет предоставлен ранее.'
          )
          return ctx.scene.leave()
        }

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

        const trainingSessionData: InitiateModelTrainingPayload = {
          telegram_id: userTelegramIdString,
          is_ru: isRu,
          bot_name: botNameFromCtx,
          bot_token: ctx.botInfo.token,
          model_name: modelNameFromSession,
          publicUrl: finalPublicUrl,
          steps: steps,
          trigger_word: triggerWordFromSession,
          gender: genderFromSession as 'male' | 'female' | 'other' | undefined,
          calculatedCost: calculatedCost,
          operation_type_for_refund: PaymentType.MONEY_OUTCOME,
        }

        logger.info(
          '[UploadScene] Calling initiateDigitalAvatarModelTraining',
          {
            trainingSessionData,
          }
        )

        const serviceResult =
          await initiateDigitalAvatarModelTraining(trainingSessionData)

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
              error_type: serviceResult.error_type,
              telegramId: ctx.from.id,
            }
          )
        } else {
          await ctx.reply(
            isRu
              ? `🚀 Запрос на обучение модели успешно отправлен! ID операции: ${serviceResult.training_id}. Вы получите уведомление, когда модель будет готова.`
              : `🚀 Model training request sent successfully! Operation ID: ${serviceResult.training_id}. You will be notified when the model is ready.`
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
            logger.info('[UploadScene] Temporary local zip file deleted.', {
              localZipPath,
            })
          } catch (delError) {
            logger.error(
              '[UploadScene] Error deleting temporary local zip file.',
              {
                localZipPath,
                error: delError,
              }
            )
          }
        }
      }
    },
    async ctx => {
      const isRu = ctx.session.language === 'ru'
      logger.info('[Scene Enter] uploadTrainFluxModelScene - Step 2', {
        telegramId: ctx.from?.id,
      })

      if (ctx.callbackQuery && 'data' in ctx.callbackQuery) {
        const gender = ctx.callbackQuery.data as 'male' | 'female' | 'other'

        if (!ctx.session.digitalAvatarBody) {
          ctx.session.digitalAvatarBody = {}
        }
        ctx.session.digitalAvatarBody.gender = gender

        await ctx.answerCbQuery()
        await ctx.editMessageReplyMarkup(undefined)

        await ctx.reply(
          isRu
            ? 'Теперь отправьте архив с фото (если еще не сделали этого ранее в диалоге).'
            : "Now, please send the photo archive (if you haven't done so earlier in the dialogue)."
        )
      } else if (ctx.message && 'document' in ctx.message) {
        await ctx.reply(SHARED_TRAINING_MESSAGES.start[isRu ? 'ru' : 'en'])

        const sessionDigitalAvatarBody = ctx.session.digitalAvatarBody
        const publicUrlFromSession = sessionDigitalAvatarBody?.zipPath

        if (!sessionDigitalAvatarBody || !publicUrlFromSession) {
          logger.error(
            'Missing critical data in uploadTrainFluxModelScene (second handler) for training initiation',
            {
              sessionDigitalAvatarBodyExists: !!sessionDigitalAvatarBody,
              publicUrlExists: !!publicUrlFromSession,
              telegramId: ctx.from?.id,
            }
          )
          await ctx.reply(
            isRu
              ? 'Произошла ошибка: не удалось получить все необходимые данные для начала тренировки. Пожалуйста, попробуйте снова.'
              : 'An error occurred: Could not retrieve all necessary data to start training. Please try again.'
          )
          return ctx.scene.leave()
        }

        const calculatedCost = sessionDigitalAvatarBody.calculatedCost
        const modelName = sessionDigitalAvatarBody.model_name
        const stepsFromSession = sessionDigitalAvatarBody.steps
        const triggerWordFromSession = sessionDigitalAvatarBody.trigger_word
        const genderFromSession = sessionDigitalAvatarBody.gender
        const botNameFromCtx = ctx.botInfo.username

        if (
          !modelName ||
          stepsFromSession === undefined ||
          calculatedCost === undefined ||
          !botNameFromCtx
        ) {
          logger.error(
            'Missing critical data fields from sessionDigitalAvatarBody or botInfo for training initiation',
            {
              modelName,
              steps: stepsFromSession,
              calculatedCost,
              botName: botNameFromCtx,
              telegramId: ctx.from?.id,
            }
          )
          await ctx.reply(
            isRu
              ? 'Произошла ошибка: некоторые данные для тренировки отсутствуют (имя модели, шаги, стоимость). Пожалуйста, попробуйте снова.'
              : 'An error occurred: Some data for training is missing (model name, steps, cost). Please try again.'
          )
          return ctx.scene.leave()
        }

        const trainingSessionData: InitiateModelTrainingPayload = {
          telegram_id: String(ctx.from!.id),
          is_ru: isRu,
          bot_name: botNameFromCtx,
          bot_token: ctx.botInfo.token,
          model_name: modelName,
          publicUrl: publicUrlFromSession,
          steps: stepsFromSession,
          trigger_word: triggerWordFromSession,
          gender: genderFromSession as 'male' | 'female' | 'other' | undefined,
          calculatedCost: calculatedCost,
          operation_type_for_refund: PaymentType.MONEY_OUTCOME,
        }

        logger.info(
          'Initiating digital avatar body training from uploadTrainFluxModelScene (second handler)',
          trainingSessionData
        )

        try {
          const result =
            await initiateDigitalAvatarModelTraining(trainingSessionData)
          if (result.success) {
            await ctx.reply(
              isRu
                ? `Тренировка модели (${modelName}) успешно запущена! ID операции: ${result.training_id}. Вы получите уведомление о завершении.`
                : `Model training (${modelName}) successfully started! Operation ID: ${result.training_id}. You will be notified upon completion.`
            )
          } else {
            await ctx.reply(
              isRu
                ? `Не удалось запустить тренировку: ${result.message || 'Неизвестная ошибка'}. Тип ошибки: ${result.error_type || 'UNKNOWN'}`
                : `Failed to start training: ${result.message || 'Unknown error'}. Error type: ${result.error_type || 'UNKNOWN'}`
            )
          }
        } catch (e: any) {
          logger.error(
            'Error calling initiateDigitalAvatarModelTraining (second handler)',
            {
              error: e.message,
              stack: e.stack,
              telegramId: ctx.from?.id,
            }
          )
          await ctx.reply(
            isRu
              ? 'Произошла критическая ошибка при запуске тренировки.'
              : 'A critical error occurred while starting the training.'
          )
        }
        return ctx.scene.leave()
      } else {
        await ctx.reply(
          isRu
            ? 'Пожалуйста, выберите пол или отправьте архив.'
            : 'Please select a gender or send an archive.'
        )
      }
    }
  )

export default uploadTrainFluxModelScene
