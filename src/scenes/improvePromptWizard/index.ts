import { Scenes, Markup, Telegraf } from 'telegraf'
import { upgradePrompt } from '@/core/openai/upgradePrompt'
import { MyContext } from '@/interfaces'
import { generateTextToImage } from '@/services/generateTextToImage'
import { generateNeuroImage } from '@/services/generateNeuroImage'
import { sendPromptImprovementMessage } from '@/menu/sendPromptImprovementMessage'
import { sendPromptImprovementFailureMessage } from '@/menu/sendPromptImprovementFailureMessage'
import { sendGenericErrorMessage } from '@/menu'
import { ModeEnum } from '@/interfaces/modes'
import { getUserProfileAndSettings } from '@/db/userSettings'
import { logger } from '@/utils/logger'
import { handleHelpCancel } from '@/handlers'
import { isRussian } from '@/helpers'
import { imageModelPrices } from '@/price/models'
import { validateAndCalculateImageModelPrice } from '@/price/helpers'
import { bots } from '@/bot'
const MAX_ATTEMPTS = 10

export const improvePromptWizard = new Scenes.WizardScene<MyContext>(
  'improvePromptWizard',
  async ctx => {
    const isRu = ctx.from?.language_code === 'ru'
    console.log(ctx.session, 'ctx.session')

    // Проверяем, был ли промпт передан через state
    if (
      !ctx.session.prompt &&
      ctx.scene.state &&
      'prompt' in ctx.scene.state &&
      typeof ctx.scene.state.prompt === 'string'
    ) {
      console.log('improvePromptWizard: Получен промпт из ctx.scene.state')
      ctx.session.prompt = ctx.scene.state.prompt
    } else if (ctx.session.prompt) {
      console.log('improvePromptWizard: Промпт уже есть в ctx.session')
    } else {
      console.log(
        'improvePromptWizard: Промпт не найден ни в session, ни в state'
      )
    }

    const prompt = ctx.session.prompt

    console.log(prompt, 'prompt')

    if (!ctx.from) {
      await ctx.reply(
        isRu ? 'Ошибка идентификации пользователя' : 'User identification error'
      )
      return ctx.scene.leave()
    }

    ctx.session.attempts = 0 // Инициализируем счетчик попыток

    await sendPromptImprovementMessage(ctx, isRu)

    if (!prompt) {
      await sendPromptImprovementFailureMessage(ctx, isRu)
      return ctx.scene.leave()
    }

    const improvedPrompt = await upgradePrompt(prompt)
    if (!improvedPrompt) {
      await sendPromptImprovementFailureMessage(ctx, isRu)
      return ctx.scene.leave()
    }

    ctx.session.prompt = improvedPrompt

    await ctx.reply(
      isRu
        ? 'Улучшенный промпт:\n```\n' + improvedPrompt + '\n```'
        : 'Improved prompt:\n```\n' + improvedPrompt + '\n```',
      {
        reply_markup: Markup.keyboard([
          [
            Markup.button.text(
              isRu ? '✅ Да. Cгенерировать?' : '✅ Yes. Generate?'
            ),
          ],
          [
            Markup.button.text(
              isRu ? '🔄 Еще раз улучшить' : '🔄 Improve again'
            ),
          ],
          [Markup.button.text(isRu ? '❌ Отмена' : '❌ Cancel')],
        ]).resize().reply_markup,
        parse_mode: 'MarkdownV2',
      }
    )

    return ctx.wizard.next()
  },
  async ctx => {
    const isRu = isRussian(ctx)
    const message = ctx.message

    if (!message || !('text' in message)) {
      await sendGenericErrorMessage(ctx, isRu)
      return ctx.scene.leave()
    }

    if (!ctx.from?.id) {
      console.error('❌ Telegram ID не найден')
      await sendGenericErrorMessage(ctx, isRu)
      return ctx.scene.leave()
    }

    const isCancel = await handleHelpCancel(ctx)
    if (isCancel) {
      return ctx.scene.leave()
    }

    const improvedPrompt = message.text

    // Используем улучшенный промпт для генерации изображения
    if (!ctx.session.selectedModel) {
      logger.error(
        'Не найдена выбранная модель в сессии в improvePromptWizard',
        {
          telegramId: ctx.from.id,
        }
      )
      await ctx.reply(
        isRu
          ? 'Ошибка: Не удалось определить выбранную модель.'
          : 'Error: Could not determine the selected model.'
      )
      return ctx.scene.leave()
    }

    // Находим нужный инстанс бота
    const currentBotName = ctx.botInfo?.username
    const currentBotInstance = bots.find(
      b => b.context.botName === currentBotName
    )

    if (!currentBotInstance) {
      logger.error(
        'Не удалось найти инстанс Telegraf для бота в improvePromptWizard',
        {
          botName: currentBotName,
          telegramId: ctx.from.id,
        }
      )
      await ctx.reply(
        isRu
          ? 'Ошибка: Не удалось инициализировать бота.'
          : 'Error: Could not initialize the bot.'
      )
      return ctx.scene.leave()
    }

    try {
      await ctx.reply(
        isRu
          ? `⏳ Генерирую изображение с улучшенным промптом...`
          : `⏳ Generating image with improved prompt...`
      )

      // Передаем найденный инстанс бота
      await generateTextToImage(
        improvedPrompt,
        ctx.session.selectedModel,
        1,
        ctx.from.id.toString(),
        isRu,
        ctx,
        currentBotInstance // Передаем инстанс
      )
      // Результат (GenerationResult[]) не обрабатываем, т.к. generateTextToImage сама отправляет сообщение
    } catch (error) {
      logger.error('Ошибка при генерации изображения в improvePromptWizard:', {
        error,
      })
      await sendGenericErrorMessage(ctx, isRu)
    }

    return ctx.scene.leave()
  }
)

export default improvePromptWizard
