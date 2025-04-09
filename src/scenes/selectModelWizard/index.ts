import { Scenes, Markup } from 'telegraf'
import { MyContext } from '../../interfaces'
import { getAvailableModels } from '../../commands/selectModelCommand/getAvailableModels'
import { sendGenericErrorMessage } from '@/menu'
import { isRussian } from '@/helpers/language'
import { setModel } from '@/core/supabase'
import { handleHelpCancel } from '@/handlers'
import { ModeEnum } from '@/price/helpers/modelsCost'
import { logger } from '@/utils/logger'
//
export const selectModelWizard = new Scenes.WizardScene<MyContext>(
  ModeEnum.SelectModelWizard,
  async ctx => {
    const isRu = ctx.from?.language_code === 'ru'

    logger.info('🎯 Вход в сцену выбора модели', {
      description: 'Entering model selection scene',
      telegram_id: ctx.from?.id,
      language: ctx.from?.language_code,
    })

    try {
      const models = await getAvailableModels()
      logger.info('✅ Получен список доступных моделей', {
        description: 'Retrieved available models',
        telegram_id: ctx.from?.id,
        models_count: models.length,
      })

      // Создаем кнопки для каждой модели, по 3 в ряд
      const buttons: string[][] = []
      for (let i = 0; i < models.length; i += 3) {
        const row: string[] = []
        if (models[i]) row.push(models[i])
        if (models[i + 1]) row.push(models[i + 1])
        if (models[i + 2]) row.push(models[i + 2])
        buttons.push(row)
      }

      // Добавляем кнопки "Отмена" и "Справка по команде" в конце
      const cancelHelpButtons = [
        isRu ? 'Справка по команде' : 'Help for the command',
        isRu ? 'Отмена' : 'Cancel',
      ]
      buttons.push(cancelHelpButtons)

      const keyboard = Markup.keyboard(buttons).resize().oneTime()

      await ctx.reply(
        isRu ? '🧠 Выберите модель:' : '🧠 Select AI Model:',
        keyboard
      )

      logger.info('✅ Отправлено меню выбора модели', {
        description: 'Sent model selection menu',
        telegram_id: ctx.from?.id,
        buttons_count: buttons.length,
      })

      return ctx.wizard.next()
    } catch (error) {
      logger.error('❌ Ошибка при создании меню выбора модели:', {
        description: 'Error creating model selection menu',
        telegram_id: ctx.from?.id,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      })
      await sendGenericErrorMessage(ctx, isRu, error as Error)
      return ctx.scene.leave()
    }
  },
  async ctx => {
    const isRu = isRussian(ctx)
    const message = ctx.message

    logger.info('📝 Получено сообщение в сцене выбора модели', {
      description: 'Received message in model selection scene',
      telegram_id: ctx.from?.id,
      message_content: message
        ? 'text' in message
          ? 'text'
          : 'non-text'
        : 'none',
    })

    if (!message || !('text' in message)) {
      logger.warn('⚠️ Получено не текстовое сообщение', {
        description: 'Non-text message received',
        telegram_id: ctx.from?.id,
        message_content: message ? 'non-text' : 'none',
      })
      await sendGenericErrorMessage(ctx, isRu)
      return ctx.scene.leave()
    }

    try {
      const isCancel = await handleHelpCancel(ctx)
      if (isCancel) {
        logger.info('🚫 Отмена выбора модели', {
          description: 'Model selection cancelled',
          telegram_id: ctx.from?.id,
        })
        return ctx.scene.leave()
      }

      const model = message.text
      const models = await getAvailableModels()

      if (!models.includes(model)) {
        logger.warn('⚠️ Выбрана несуществующая модель', {
          description: 'Invalid model selected',
          telegram_id: ctx.from?.id,
          selected_model: model,
        })
        await ctx.reply(isRu ? '❌ Модель не найдена' : '❌ Model not found')
        return ctx.scene.leave()
      }

      const telegramId = ctx.from?.id.toString()
      if (!telegramId) {
        logger.error('❌ Не удалось получить ID пользователя', {
          description: 'Failed to get user ID',
          telegram_id: ctx.from?.id,
        })
        await ctx.reply(
          isRu
            ? '❌ Ошибка: не удалось получить ID пользователя'
            : '❌ Error: User ID not found'
        )
        return ctx.scene.leave()
      }

      await setModel(telegramId, model)

      logger.info('✅ Модель успешно установлена', {
        description: 'Model set successfully',
        telegram_id: telegramId,
        selected_model: model,
      })

      await ctx.reply(
        isRu
          ? `✅ Модель успешно изменена на ${model}`
          : `✅ Model successfully changed to ${model}`,
        {
          reply_markup: {
            remove_keyboard: true,
          },
        }
      )

      // Сохраняем выбранную модель в сессии
      ctx.session.selectedModel = model

      // Устанавливаем режим DigitalAvatarBody
      ctx.session.mode = ModeEnum.DigitalAvatarBody

      logger.info('✅ Модель выбрана, переход к проверке баланса', {
        description: 'Model selected, transitioning to balance check',
        telegram_id: telegramId,
        selected_model: model,
        new_mode: ctx.session.mode,
      })

      // Переходим к проверке баланса
      return ctx.scene.enter('check_balance')
    } catch (error) {
      logger.error('❌ Ошибка при выборе модели:', {
        description: 'Error selecting model',
        telegram_id: ctx.from?.id,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      })
      await sendGenericErrorMessage(ctx, isRu, error as Error)
      return ctx.scene.leave()
    }
  }
)

export default selectModelWizard
