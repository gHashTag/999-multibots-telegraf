import { Scenes, Markup } from 'telegraf'
import { MyContext } from '../../interfaces'
import { getAvailableModels } from '../../commands/selectModelCommand/getAvailableModels'
import { sendGenericErrorMessage } from '@/menu'
import { isRussian } from '@/helpers/language'
import { updateUserModel } from '@/core/supabase'
import { handleHelpCancel } from '@/handlers'
import { getUserByTelegramId, updateUserLevelPlusOne } from '@/core/supabase'

export const selectModelWizard = new Scenes.WizardScene<MyContext>(
  'select_model',
  async ctx => {
    const isRu = ctx.from?.language_code === 'ru'

    try {
      const models = await getAvailableModels()

      // Создаем кнопки для каждой модели, по 3 в ряд
      const buttons: ReturnType<typeof Markup.button.text>[][] = []
      for (let i = 0; i < models.length; i += 3) {
        const row: ReturnType<typeof Markup.button.text>[] = []
        if (models[i]) {
          row.push(Markup.button.text(models[i]))
        }
        if (models[i + 1]) {
          row.push(Markup.button.text(models[i + 1]))
        }
        if (models[i + 2]) {
          row.push(Markup.button.text(models[i + 2]))
        }
        buttons.push(row)
      }

      // Добавляем кнопки "Отмена" и "Справка по команде" в конце
      const cancelHelpButtons = [
        Markup.button.text(
          isRu ? 'Справка по команде' : 'Help for the command'
        ),
        Markup.button.text(isRu ? 'Отмена' : 'Cancel'),
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

      if (!ctx.from?.id) {
        console.error('❌ Telegram ID не найден')
        return
      }
      await updateUserModel(ctx.from.id.toString(), model)

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

      const telegram_id = ctx.from?.id
      if (!telegram_id) {
        console.error('❌ Telegram ID не найден')
        return
      }

      const userExists = await getUserByTelegramId(ctx)
      if (!userExists.data) {
        throw new Error(`User with ID ${telegram_id} does not exist.`)
      }
      const level = userExists.data.level
      if (level === 5) {
        await updateUserLevelPlusOne(telegram_id.toString(), level)
      }

      return ctx.scene.leave()
    }
  }
)

export default selectModelWizard
