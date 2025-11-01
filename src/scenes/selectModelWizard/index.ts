import { Scenes, Markup } from 'telegraf'
import { logger } from '@/utils/enhancedLogger'
import { MyContext } from '../../interfaces'
import { getAvailableModels } from '../../commands/selectModelCommand/getAvailableModels'
import { sendGenericErrorMessage } from '@/menu'
import { isRussianFromState } from '@/helpers/centralizedLanguage'
import { updateUserModel } from '@/core/supabase'
import { handleHelpCancel } from '@/handlers'
import { getUserByTelegramId, updateUserLevelPlusOne } from '@/core/supabase'

export const selectModelWizard = new Scenes.WizardScene<MyContext>(
  'select_model',
  async ctx => {
    const isRu = isRussianFromState(ctx)

    try {
      const models = await getAvailableModels()

      // Создаем кнопки для каждой модели, по 3 в ряд
      const buttons: ReturnType<typeof Markup.button.text>[][] = []
      for (let i = 0; i < models.length; i += 3) {
        const row: ReturnType<typeof Markup.button.text>[] = []
        if (models[i]) {
          row.push(Markup.button.text(models[i].name))
        }
        if (models[i + 1]) {
          row.push(Markup.button.text(models[i + 1].name))
        }
        if (models[i + 2]) {
          row.push(Markup.button.text(models[i + 2].name))
        }
        buttons.push(row)
      }

      // Добавляем кнопки "Отмена" и "Справка по команде" в конце
      const cancelHelpButtons: ReturnType<typeof Markup.button.text>[] = [
        Markup.button.text(
          isRu ? 'Справка по команде' : 'Help for the command'
        ),
        Markup.button.text(isRu ? 'Отмена' : 'Cancel'),
      ]
      buttons.push(cancelHelpButtons)

      const keyboard = Markup.keyboard(buttons).resize().oneTime()

      // ✅ FIX: Добавляем описание к выбору модели ИИ
      await ctx.reply(
        isRu
          ? '🤖 <b>Выбор модели ИИ</b>\n\n' +
              'Здесь вы можете выбрать модель искусственного интеллекта для генерации контента.\n' +
              'Каждая модель имеет свои особенности и специализацию:\n\n' +
              '• <b>GPT-4</b> - для текстов и сложных задач\n' +
              '• <b>DALL-E</b> - для генерации изображений\n' +
              '• <b>Claude</b> - для анализа и помощи\n\n' +
              '💡 Выберите модель из списка ниже:'
          : '🤖 <b>Choose AI Model</b>\n\n' +
              'Here you can select an AI model for content generation.\n' +
              'Each model has its own features and specialization:\n\n' +
              '• <b>GPT-4</b> - for texts and complex tasks\n' +
              '• <b>DALL-E</b> - for image generation\n' +
              '• <b>Claude</b> - for analysis and assistance\n\n' +
              '💡 Select a model from the list below:',
        {
          parse_mode: 'HTML',
          ...keyboard.reply_markup,
        }
      )

      return ctx.wizard.next()
    } catch (error) {
      logger.error('Error creating model selection menu:', error)
      await ctx.reply(
        isRu
          ? '❌ Ошибка при получении списка моделей'
          : '❌ Error fetching models list'
      )
      return ctx.scene.leave()
    }
  },
  async ctx => {
    const isRu = isRussianFromState(ctx)
    const message = ctx.message

    if (message && 'text' in message) {
      const text = message.text

      if (
        text === (isRu ? 'Отмена' : 'Cancel') ||
        text === (isRu ? 'Справка по команде' : 'Help for the command')
      ) {
        const isCancel = await handleHelpCancel(ctx)
        if (isCancel) {
          return ctx.scene.leave()
        }
        if (text === (isRu ? 'Справка по команде' : 'Help for the command')) {
          // Дополнительная логика для справки, если handleHelpCancel ее не покрывает полностью
          // Например, можно отправить еще одно сообщение и оставить в сцене или выйти.
          // Пока оставим как есть, предполагая, что handleHelpCancel достаточен.
        }
        return
      }

      const models = await getAvailableModels()
      const selectedModelObject = models.find(m => m.name === text)

      if (!selectedModelObject) {
        await ctx.reply(
          isRu
            ? '❌ Модель не найдена, выберите из списка.'
            : '❌ Model not found, please select from the list.'
        )
        return ctx.wizard.selectStep(ctx.wizard.cursor)
      }

      if (!ctx.from?.id) {
        logger.error('❌ Telegram ID не найден')
        await ctx.reply(
          isRu
            ? 'Произошла ошибка, попробуйте позже.'
            : 'An error occurred, please try again later.'
        )
        return ctx.scene.leave()
      }

      await updateUserModel(ctx.from.id.toString(), selectedModelObject.id)

      await ctx.reply(
        isRu
          ? `✅ Модель успешно изменена на ${selectedModelObject.name}`
          : `✅ Model successfully changed to ${selectedModelObject.name}`,
        {
          reply_markup: { remove_keyboard: true },
        }
      )

      const telegram_id = ctx.from?.id
      if (!telegram_id) {
        logger.error('❌ Telegram ID не найден на этапе обновления уровня')
        return ctx.scene.leave()
      }

      const userObject = await getUserByTelegramId(ctx)
      if (!userObject) {
        logger.error(`User with ID ${telegram_id} does not exist.`)
        return ctx.scene.leave()
      }
      const level = userObject.level
      if (level === 5) {
        await updateUserLevelPlusOne(telegram_id.toString(), level)
      }
      return ctx.scene.leave()
    } else if (ctx.callbackQuery) {
      await ctx
        .answerCbQuery()
        .catch(e => logger.error('Failed to answer CB query', e))
      await ctx.reply(
        isRu
          ? 'Пожалуйста, выберите модель кнопкой.'
          : 'Please select a model using the buttons.'
      )
      return ctx.wizard.selectStep(ctx.wizard.cursor)
    } else {
      await sendGenericErrorMessage(ctx, isRu)
      return ctx.scene.leave()
    }
  }
)

export default selectModelWizard
