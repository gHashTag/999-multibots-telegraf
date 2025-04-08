import { Scenes, Markup } from 'telegraf'
import { MyContext } from '../../interfaces'
import { getAvailableModels } from '../../commands/selectModelCommand/getAvailableModels'
import { sendGenericErrorMessage } from '@/menu'
import { isRussian } from '@/helpers/language'
import { getUserByTelegramIdString, setModel } from '@/core/supabase'
import { handleHelpCancel } from '@/handlers'
import { getUserByTelegramId, updateUserLevelPlusOne } from '@/core/supabase'
import { ModeEnum } from '@/price/helpers/modelsCost'
import { Logger as logger } from '@/utils/logger'

export const selectModelWizard = new Scenes.WizardScene<MyContext>(
  ModeEnum.SelectModelWizard,
  async ctx => {
    const isRu = ctx.from?.language_code === 'ru'

    try {
      const models = await getAvailableModels()
      logger.info('🔄 Получены доступные модели:', {
        description: 'Available models fetched',
        models
      })

      // Создаем кнопки для каждой модели, по 3 в ряд
      const buttons: string[][] = []
      for (let i = 0; i < models.length; i += 3) {
        const row: string[] = []
        if (models[i]) {
          row.push(models[i])
        }
        if (models[i + 1]) {
          row.push(models[i + 1])
        }
        if (models[i + 2]) {
          row.push(models[i + 2])
        }
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

      return ctx.wizard.next()
    } catch (error) {
      logger.error('❌ Ошибка при создании меню выбора модели:', {
        description: 'Error creating model selection menu',
        error: error instanceof Error ? error.message : String(error)
      })
      await ctx.reply(
        isRu
          ? '❌ Ошибка при получении списка моделей'
          : '❌ Error fetching models list'
      )
      return ctx.scene.leave()
    }
  },
  async ctx => {
    const isRu = isRussian(ctx)
    const message = ctx.message

    if (!message || !('text' in message)) {
      await sendGenericErrorMessage(ctx, isRu)
      return ctx.scene.leave()
    }

    const isCancel = await handleHelpCancel(ctx)
    if (isCancel) {
      return ctx.scene.leave()
    }

    const model = message.text
    const models = await getAvailableModels()
    
    if (!models.includes(model)) {
      await ctx.reply(isRu ? '❌ Модель не найдена' : '❌ Model not found')
      return ctx.scene.leave()
    }

    const telegramId = ctx.from?.id.toString()
    if (!telegramId) {
      await ctx.reply(
        isRu
          ? '❌ Ошибка: не удалось получить ID пользователя'
          : '❌ Error: User ID not found'
      )
      return ctx.scene.leave()
    }

    try {
      // Проверяем существование пользователя
      const user = await getUserByTelegramIdString(telegramId)
      if (!user) {
        logger.error('❌ Пользователь не найден:', {
          description: 'User not found',
          telegramId
        })
        await ctx.reply(
          isRu
            ? '❌ Ошибка: пользователь не найден'
            : '❌ Error: User not found'
        )
        return ctx.scene.leave()
      }

      // Устанавливаем модель
      await setModel(telegramId, model)
      logger.info('✅ Модель успешно установлена:', {
        description: 'Model successfully set',
        telegramId,
        model
      })

      // Обновляем уровень пользователя если нужно
      if (user.level === 5) {
        await updateUserLevelPlusOne(telegramId, user.level)
        logger.info('✅ Уровень пользователя обновлен:', {
          description: 'User level updated',
          telegramId,
          newLevel: user.level + 1
        })
      }

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

      // Переходим в сцену чата с аватаром
      return ctx.scene.enter(ModeEnum.ChatWithAvatar)
    } catch (error) {
      logger.error('❌ Ошибка при установке модели:', {
        description: 'Error setting model',
        error: error instanceof Error ? error.message : String(error),
        telegramId,
        model
      })
      await ctx.reply(
        isRu
          ? '❌ Ошибка при установке модели'
          : '❌ Error setting model'
      )
      return ctx.scene.leave()
    }
  }
)

export default selectModelWizard
