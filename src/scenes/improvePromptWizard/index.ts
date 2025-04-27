import { Scenes, Markup } from 'telegraf'
import { upgradePrompt } from '@/core/openai/upgradePrompt'
import { MyContext } from '@/interfaces'
import { generateTextToImage } from '@/services/generateTextToImage'
import { generateNeuroImage } from '@/services/generateNeuroImage'
import { generateTextToVideo } from '@/services/generateTextToVideo'
import { sendPromptImprovementMessage } from '@/menu/sendPromptImprovementMessage'
import { sendPromptImprovementFailureMessage } from '@/menu/sendPromptImprovementFailureMessage'
import { sendGenericErrorMessage } from '@/menu'
import { ModeEnum } from '@/interfaces/modes'
import { getUserProfileAndSettings } from '@/db/userSettings'
import { logger } from '@/utils/logger'
const MAX_ATTEMPTS = 10

export const improvePromptWizard = new Scenes.WizardScene<MyContext>(
  'improvePromptWizard',
  async ctx => {
    const isRu = ctx.from?.language_code === 'ru'
    console.log(ctx.session, 'ctx.session')
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
    const isRu = ctx.from?.language_code === 'ru'
    const message = ctx.message

    if (message && 'text' in message) {
      const text = message.text
      console.log(text, 'text')

      if (!ctx.from?.id) {
        await ctx.reply(
          isRu
            ? 'Ошибка идентификации пользователя'
            : 'User identification error'
        )
        return ctx.scene.leave()
      }

      if (!ctx.session.prompt) {
        await sendPromptImprovementFailureMessage(ctx, isRu)
        return ctx.scene.leave()
      }
      if (!ctx.session.mode) {
        await sendPromptImprovementFailureMessage(ctx, isRu)
        return ctx.scene.leave()
      }
      switch (text) {
        case isRu ? '✅ Да. Cгенерировать?' : '✅ Yes. Generate?': {
          const mode = ctx.session.mode
          if (!mode)
            throw new Error(
              isRu ? 'Не удалось определить режим' : 'Could not identify mode'
            )

          if (!ctx.from.id)
            throw new Error(
              isRu
                ? 'improvePromptWizard: Не удалось определить telegram_id'
                : 'improvePromptWizard: Could not identify telegram_id'
            )
          if (!ctx.from.username)
            throw new Error(
              isRu
                ? 'improvePromptWizard: Не удалось определить username'
                : 'improvePromptWizard: Could not identify username'
            )
          if (!isRu)
            throw new Error(
              isRu
                ? 'improvePromptWizard: Не удалось определить isRu'
                : 'improvePromptWizard: Could not identify isRu'
            )

          const { profile, settings } = await getUserProfileAndSettings(
            ctx.from.id
          )
          if (!profile || !settings) {
            logger.error(
              'Не удалось получить профиль или настройки в improvePromptWizard',
              { telegramId: ctx.from.id }
            )
            await ctx.reply(
              isRu
                ? 'Ошибка: Не удалось получить данные пользователя.'
                : 'Error: Could not retrieve user data.'
            )
            return ctx.scene.leave()
          }

          console.log(mode, 'mode')
          switch (mode) {
            case ModeEnum.NeuroPhoto:
              await generateNeuroImage(
                ctx.session.prompt,
                ctx.session.userModel.model_url,
                1,
                ctx.from.id.toString(),
                ctx,
                ctx.botInfo?.username
              )
              break
            case 'text_to_video':
              if (!ctx.session.videoModel)
                throw new Error(
                  isRu
                    ? 'improvePromptWizard: Не удалось определить видео модель'
                    : 'improvePromptWizard: Could not identify video model'
                )

              console.log(ctx.session.videoModel, 'ctx.session.videoModel')
              if (!ctx.session.videoModel)
                throw new Error(
                  isRu
                    ? 'improvePromptWizard: Не удалось определить видео модель'
                    : 'improvePromptWizard: Could not identify video model'
                )
              await generateTextToVideo(
                ctx.session.prompt,
                ctx.session.videoModel,
                ctx.from.id.toString(),
                ctx.from.username || 'unknown',
                isRu
              )
              break
            case 'text_to_image':
              await generateTextToImage(
                ctx.session.prompt,
                settings.imageModel,
                1,
                ctx.from.id.toString(),
                isRu,
                ctx,
                ctx.botInfo?.username || 'unknown_bot'
              )
              break
            default:
              throw new Error(
                isRu
                  ? 'improvePromptWizard: Неизвестный режим'
                  : 'improvePromptWizard: Unknown mode'
              )
          }
          return ctx.scene.leave()
        }

        case isRu ? '🔄 Еще раз улучшить' : '🔄 Improve again': {
          ctx.session.attempts = (ctx.session.attempts || 0) + 1

          if (ctx.session.attempts >= MAX_ATTEMPTS) {
            await ctx.reply(
              isRu
                ? 'Достигнуто максимальное количество попыток улучшения промпта.'
                : 'Maximum number of prompt improvement attempts reached.'
            )
            return ctx.scene.leave()
          }

          await ctx.reply(
            isRu
              ? '⏳ Повторное улучшение промпта...'
              : '⏳ Re-improving prompt...'
          )
          if (!ctx.session.prompt) {
            await sendPromptImprovementFailureMessage(ctx, isRu)
            return ctx.scene.leave()
          }
          const improvedPrompt = await upgradePrompt(ctx.session.prompt)
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
          break
        }

        case isRu ? '❌ Отмена' : '❌ Cancel': {
          await ctx.reply(isRu ? 'Операция отменена' : 'Operation cancelled')
          return ctx.scene.leave()
        }

        default: {
          await sendGenericErrorMessage(ctx, isRu)
          return ctx.scene.leave()
        }
      }
    }
  }
)

export default improvePromptWizard
