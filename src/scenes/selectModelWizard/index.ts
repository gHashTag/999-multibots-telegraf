import { Scenes, Markup } from 'telegraf'
import { MyContext } from '../../interfaces'
import { getAvailableModels } from '../../commands/selectModelCommand/getAvailableModels'
import { sendGenericErrorMessage } from '@/menu'
import { isRussian } from '@/helpers/language'
import { setModel } from '@/core/supabase'
import { handleHelpCancel } from '@/handlers'
import { getUserByTelegramId, updateUserLevelPlusOne } from '@/core/supabase'
import { ModeEnum } from '@/interfaces/modes.interface'

export const selectModelWizard = new Scenes.WizardScene<MyContext>(
  ModeEnum.SelectModelWizard,
  async ctx => {
    const isRu = ctx.from?.language_code === 'ru'

    try {
      const models = await getAvailableModels()
      console.log('models', models)

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
      console.error('Error creating model selection menu:', error)
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
    console.log('CASE: select_model', isCancel)
    if (isCancel) {
      console.log('CASE: select_model', isCancel)
      return ctx.scene.leave()
    } else {
      const model = message.text
      console.log('CASE: select_model', model)
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

      await setModel(telegramId, model)

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

      const userExists = await getUserByTelegramId(telegramId)

      if (!userExists) {
        throw new Error(`User with ID ${telegramId} does not exist.`)
      }
      const level = userExists.level
      if (level === 5) {
        await updateUserLevelPlusOne(telegramId, level)
      }
      ctx.scene.enter('chat_with_avatar')
      return
    }
  }
)

export default selectModelWizard
