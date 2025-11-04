import { Scenes, Markup } from 'telegraf'
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

      const keyboard = Markup.keyboard(buttons).resize()

      // Отправляем текст
      await ctx.reply(
        isRu
          ? '🤖 <b>AGENTIC CODING AI Models</b>\n\n' +
              'Выбирайте специализированные модели для <b>агентного кодинга</b> и ИИ-агентов:\n\n' +
              '🔧 <b>Агентные возможности:</b>\n' +
              '• Автоматическое программирование\n' +
              '• Сложные рассуждения и анализ\n' +
              '• Многошаговые задачи\n' +
              '• Генерация и отладка кода\n' +
              '• Архитектурные решения\n\n' +
              '<b>🔥 ТОП агентные модели:</b>\n' +
              '• <b>o3 Mini</b> - новейшая reasoning модель OpenAI\n' +
              '• <b>GPT-4o</b> - мультимодальная агентная модель\n' +
              '• <b>Claude 3.5 Sonnet</b> - лучшая для кода\n' +
              '• <b>DeepSeek Reasoner</b> - специализация на рассуждениях\n' +
              '• <b>Gemini 2.0 Flash</b> - быстрая агентная модель\n\n' +
              '💡 Выберите агентную модель для продвинутого ИИ:'
          : '🤖 <b>AGENTIC CODING AI Models</b>\n\n' +
              'Choose specialized models for <b>agentic coding</b> and AI agents:\n\n' +
              '🔧 <b>Agentic capabilities:</b>\n' +
              '• Automated programming\n' +
              '• Complex reasoning and analysis\n' +
              '• Multi-step tasks\n' +
              '• Code generation and debugging\n' +
              '• Architectural solutions\n\n' +
              '<b>🔥 TOP agentic models:</b>\n' +
              '• <b>o3 Mini</b> - latest reasoning model from OpenAI\n' +
              '• <b>GPT-4o</b> - multimodal agentic model\n' +
              '• <b>Claude 3.5 Sonnet</b> - best for coding\n' +
              '• <b>DeepSeek Reasoner</b> - reasoning specialization\n' +
              '• <b>Gemini 2.0 Flash</b> - fast agentic model\n\n' +
              '💡 Choose an agentic model for advanced AI:',
        {
          parse_mode: 'HTML',
        }
      )

      // Отправляем клавиатуру отдельным сообщением
      await ctx.reply(
        isRu ? 'Выберите модель:' : 'Select model:',
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

      await updateUserModel(ctx.from.id.toString(), selectedModelObject.id)

      // Отправляем подтверждение с объяснением
      await ctx.reply(
        isRu
          ? `✅ <b>Модель успешно изменена на:</b> ${selectedModelObject.name}\n\n` +
              `<b>💡 Зачем нужна эта модель:</b>\n` +
              `Эта модель будет автоматически использоваться во ВСЕХ AI функциях бота:\n\n` +
              `🔧 <b>Агентный кодинг:</b> Генерация и отладка кода\n` +
              `📝 <b>Создание контента:</b> Статьи, посты, описания\n` +
              `🎨 <b>Анализ изображений:</b> Описание и обработка фото\n` +
              `🎬 <b>Создание Reels:</b> Сценарии и идеи для видео\n` +
              `🔍 <b>Исследования:</b> Анализ данных и поиск информации\n\n` +
              `🎯 Теперь переходим в главное меню для выбора функции!`
          : `✅ <b>Model successfully changed to:</b> ${selectedModelObject.name}\n\n` +
              `<b>💡 Why this model:</b>\n` +
              `This model will be automatically used in ALL bot AI functions:\n\n` +
              `🔧 <b>Agentic Coding:</b> Code generation and debugging\n` +
              `📝 <b>Content Creation:</b> Articles, posts, descriptions\n` +
              `🎨 <b>Image Analysis:</b> Photo description and processing\n` +
              `🎬 <b>Reels Creation:</b> Scripts and video ideas\n` +
              `🔍 <b>Research:</b> Data analysis and information search\n\n` +
              `🎯 Now let's go to the main menu to select a function!`,
        {
          parse_mode: 'HTML',
          reply_markup: { remove_keyboard: true },
        }
      )

      // Перенаправляем в главное меню
      return ctx.scene.enter('main_menu')
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
