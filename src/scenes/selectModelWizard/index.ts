import { Scenes, Markup } from 'telegraf'
import { MyContext } from '../../interfaces'
import { getAvailableModels } from '../../commands/selectModelCommand/getAvailableModels'
import { sendGenericErrorMessage } from '@/menu'
import { isRussianFromState } from '@/helpers/centralizedLanguage'
import { updateUserModel } from '@/core/supabase'
import { handleHelpCancel } from '@/handlers'
import { getUserByTelegramId, updateUserLevelPlusOne } from '@/core/supabase'
import { ModeEnum } from '@/interfaces/modes'

export const selectModelWizard = new Scenes.WizardScene<MyContext>(
  'select_model',
  async ctx => {
    const isRu = isRussianFromState(ctx)

    console.log('🔍 [selectModelWizard] Step 1: Starting model selection', {
      telegramId: ctx.from?.id,
      isRu,
    })

    try {
      // ✅ Получаем топ-10 моделей для агентного кодинга
      const models = await getAvailableModels({ maxResults: 10 })
      console.log('✅ [selectModelWizard] Top 10 models loaded:', {
        count: models.length,
        models: models.map(m => m.name),
      })

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

      console.log('📤 [selectModelWizard] Sending message with keyboard', {
        buttonsCount: buttons.length,
        totalButtons: buttons.flat().length,
      })

      // ✅ FIX: Показываем топ-10 моделей для агента
      await ctx.reply(
        isRu
          ? '🤖 <b>Топ-10 моделей для агента</b>\n\n' +
              'Выберите одну из лучших моделей для работы с кодом и агентами:\n\n' +
              '💻 Модели оптимизированы для:\n' +
              '• Генерации и рефакторинга кода\n' +
              '• Работы с агентами и автономными системами\n' +
              '• Сложных технических задач\n\n' +
              '💡 Выберите модель из списка ниже:'
          : '🤖 <b>Top 10 Models for Agent</b>\n\n' +
              'Choose one of the best models for code and agent work:\n\n' +
              '💻 Models optimized for:\n' +
              '• Code generation and refactoring\n' +
              '• Working with agents and autonomous systems\n' +
              '• Complex technical tasks\n\n' +
              '💡 Select a model from the list below:',
        {
          parse_mode: 'HTML',
          reply_markup: {
            ...keyboard.reply_markup,
            remove_keyboard: false, // Показываем новую клавиатуру
          },
        }
      )

      console.log('✅ [selectModelWizard] Message sent successfully')
      return ctx.wizard.next()
    } catch (error) {
      console.error(
        '❌ [selectModelWizard] Error creating model selection menu:',
        error
      )
      await ctx.reply(
        isRu
          ? '❌ Ошибка при получении списка моделей'
          : '❌ Error fetching models list',
        {
          reply_markup: { remove_keyboard: true },
        }
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
        console.error('❌ Telegram ID не найден')
        await ctx.reply(
          isRu
            ? 'Произошла ошибка, попробуйте позже.'
            : 'An error occurred, please try again later.'
        )
        return ctx.scene.leave()
      }

      console.log('💾 [selectModelWizard] Saving model to database', {
        telegramId: ctx.from.id.toString(),
        modelId: selectedModelObject.id,
        modelName: selectedModelObject.name,
      })

      await updateUserModel(ctx.from.id.toString(), selectedModelObject.id)

      console.log('✅ [selectModelWizard] Model saved successfully', {
        telegramId: ctx.from.id.toString(),
        modelId: selectedModelObject.id,
      })

      await ctx.reply(
        isRu
          ? `✅ Модель успешно изменена на <b>${selectedModelObject.name}</b>\n\n💡 Переходим в чат с аватаром для тестирования...`
          : `✅ Model successfully changed to <b>${selectedModelObject.name}</b>\n\n💡 Going to avatar chat for testing...`,
        {
          parse_mode: 'HTML',
          reply_markup: { remove_keyboard: true },
        }
      )

      const telegram_id = ctx.from?.id
      if (!telegram_id) {
        console.error('❌ Telegram ID не найден на этапе обновления уровня')
        return ctx.scene.leave()
      }

      const userObject = await getUserByTelegramId(ctx)
      if (!userObject) {
        console.error(`User with ID ${telegram_id} does not exist.`)
        return ctx.scene.leave()
      }
      const level = userObject.level
      if (level === 5) {
        await updateUserLevelPlusOne(telegram_id.toString(), level)
      }

      // ✅ Автоматически переходим в чат с аватаром для тестирования выбранной модели
      console.log(
        '🚀 [selectModelWizard] Transitioning to ChatWithAvatar scene',
        {
          telegramId: telegram_id.toString(),
          model: selectedModelObject.name,
        }
      )

      return ctx.scene.enter(ModeEnum.ChatWithAvatar)
    } else if (ctx.callbackQuery) {
      await ctx
        .answerCbQuery()
        .catch(e => console.error('Failed to answer CB query', e))
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
