import { Scenes, Markup } from 'telegraf'
import { upgradePrompt } from '@/core/openai/upgradePrompt'
import { MyContext } from '@/interfaces'
import { generateTextToImageDirect } from '@/services/generateTextToImageDirect'
import { generateNeuroImage } from '@/services/generateNeuroImage'
import { generateTextToVideo } from '@/modules/videoGenerator/generateTextToVideo'
import { sendPromptImprovementMessage } from '@/menu/sendPromptImprovementMessage'
import { sendPromptImprovementFailureMessage } from '@/menu/sendPromptImprovementFailureMessage'
import { sendGenericErrorMessage } from '@/menu'
import { ModeEnum } from '@/interfaces/modes'
import { getUserProfileAndSettings } from '@/db/userSettings'
import { logger } from '@/utils/logger'
import { getUserBalance } from '@/core/supabase'
const MAX_ATTEMPTS = 10

export const improvePromptWizard = new Scenes.WizardScene<MyContext>(
  ModeEnum.ImprovePromptWizard,
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
          try {
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
                  ctx.from.id.toString(),
                  ctx.from.username || 'unknown',
                  isRu,
                  ctx.botInfo?.username || 'unknown_bot',
                  ctx.session.videoModel
                )

                break
              case 'text_to_image': {
                if (!ctx.session.selectedImageModel) {
                  logger.error(
                    'Не найдена выбранная модель изображения в сессии в improvePromptWizard',
                    { telegramId: ctx.from.id }
                  )
                  await ctx.reply(
                    isRu
                      ? 'Ошибка: Не удалось определить выбранную модель изображения.'
                      : 'Error: Could not determine the selected image model.'
                  )
                  return ctx.scene.leave()
                }
                await generateTextToImageDirect(
                  ctx.session.prompt,
                  ctx.session.selectedImageModel,
                  1,
                  ctx.from.id.toString(),
                  ctx.from.username || 'unknown',
                  isRu,
                  ctx
                )

                const currentBalance = await getUserBalance(
                  ctx.from.id.toString()
                )

                await ctx.reply(
                  isRu
                    ? `Ваши изображения сгенерированы!\n\nЕсли хотите сгенерировать еще, то выберите количество изображений в меню 1️⃣, 2️⃣, 3️⃣, 4️⃣.\n\nВаш новый баланс: ${currentBalance.toFixed(2)} ⭐️`
                    : `Your images have been generated!\n\nGenerate more?\n\nYour new balance: ${currentBalance.toFixed(2)} ⭐️`,
                  {
                    reply_markup: {
                      keyboard: [
                        [
                          { text: '1️⃣' },
                          { text: '2️⃣' },
                          { text: '3️⃣' },
                          { text: '4️⃣' },
                        ],
                        [
                          {
                            text: isRu
                              ? '⬆️ Улучшить промпт'
                              : '⬆️ Improve prompt',
                          },
                          {
                            text: isRu
                              ? '📐 Изменить размер'
                              : '📐 Change size',
                          },
                        ],
                        [{ text: isRu ? '🏠 Главное меню' : '🏠 Main menu' }],
                      ],
                      resize_keyboard: true,
                    },
                  }
                )
                break
              }
              default:
                throw new Error(
                  isRu
                    ? 'improvePromptWizard: Неизвестный режим'
                    : 'improvePromptWizard: Unknown mode'
                )
            }
          } catch (error) {
            logger.error('Ошибка при генерации после улучшения промпта', {
              error,
              telegramId: ctx.from.id,
            })
            await sendGenericErrorMessage(ctx, isRu)
            return ctx.scene.leave()
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
