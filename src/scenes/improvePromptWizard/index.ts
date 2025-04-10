import { Scenes, Markup } from 'telegraf'
import { upgradePrompt } from '@/core/openai/upgradePrompt'
import { MyContext } from '@/types'
import { generateTextToImage } from '@/services/generateTextToImage'
import { generateNeuroImage } from '@/services/generateNeuroImage'
import { generateTextToVideo } from '@/services/generateTextToVideo'
import { sendPromptImprovementMessage } from '@/menu/sendPromptImprovementMessage'
import { sendPromptImprovementFailureMessage } from '@/menu/sendPromptImprovementFailureMessage'
import { sendGenericErrorMessage } from '@/menu'
import { ModeEnum } from '@/types/modes'
import { logger } from '@/utils/logger'

const MAX_ATTEMPTS = 10

export const improvePromptWizard = new Scenes.WizardScene<MyContext>(
  ModeEnum.ImprovePrompt,
  async ctx => {
    const isRu = ctx.from?.language_code === 'ru'
    ctx.session.mode = ModeEnum.ImprovePrompt
    logger.info('🎯 Вход в сцену улучшения промпта', {
      telegram_id: ctx.from?.id,
      mode: ctx.session?.mode,
      prompt: ctx.session?.prompt,
    })

    if (!ctx.from) {
      await ctx.reply(
        isRu ? 'Ошибка идентификации пользователя' : 'User identification error'
      )
      return ctx.scene.leave()
    }

    ctx.session.attempts = 0 // Инициализируем счетчик попыток

    await sendPromptImprovementMessage(ctx, isRu)

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
    ctx.wizard.next()
    return
  },
  async ctx => {
    const isRu = ctx.from?.language_code === 'ru'
    const message = ctx.message

    if (message && 'text' in message) {
      const text = message.text
      logger.info('📩 Получено сообщение в сцене улучшения промпта', {
        telegram_id: ctx.from?.id,
        text: text,
        mode: ctx.session?.mode,
      })

      if (!ctx.from?.id) {
        await ctx.reply(
          isRu
            ? 'Ошибка идентификации пользователя'
            : 'User identification error'
        )
        return ctx.scene.leave()
      }

      switch (text) {
        case isRu ? '✅ Да. Cгенерировать?' : '✅ Yes. Generate?': {
          const mode = ctx.session.mode
          if (!mode) {
            logger.error('❌ Не удалось определить режим', {
              telegram_id: ctx.from.id,
              mode: mode,
            })
            throw new Error(
              isRu ? 'Не удалось определить режим' : 'Could not identify mode'
            )
          }

          if (!ctx.from.username) {
            logger.error('❌ Не удалось определить username', {
              telegram_id: ctx.from.id,
            })
            throw new Error(
              isRu
                ? 'improvePromptWizard: Не удалось определить username'
                : 'improvePromptWizard: Could not identify username'
            )
          }

          logger.info('🎯 Генерация контента после улучшения промпта', {
            telegram_id: ctx.from.id,
            mode: mode,
            prompt: ctx.session.prompt,
          })

          // Устанавливаем режим NeuroPhoto для генерации
          const previousMode = ctx.session.mode
          ctx.session.mode = ModeEnum.NeuroPhoto

          logger.info('🔄 Изменение режима для генерации', {
            telegram_id: ctx.from.id,
            previous_mode: previousMode,
            new_mode: ctx.session.mode,
          })

          switch (previousMode) {
            case ModeEnum.NeuroPhoto:
            case ModeEnum.ImprovePrompt:
              if (!ctx.session.userModel?.model_url) {
                logger.error('❌ Не удалось определить URL модели', {
                  telegram_id: ctx.from.id,
                  mode: previousMode,
                })
                throw new Error(
                  isRu
                    ? 'improvePromptWizard: Не удалось определить URL модели'
                    : 'improvePromptWizard: Could not identify model URL'
                )
              }
              await generateNeuroImage(
                ctx.session.prompt,
                ctx.session.userModel.model_url,
                1,
                ctx.from.id.toString(),
                ctx,
                ctx.botInfo?.username
              )
              break
            case ModeEnum.TextToVideo:
              if (!ctx.session.videoModel) {
                logger.error('❌ Не удалось определить видео модель', {
                  telegram_id: ctx.from.id,
                  mode: previousMode,
                })
                throw new Error(
                  isRu
                    ? 'improvePromptWizard: Не удалось определить видео модель'
                    : 'improvePromptWizard: Could not identify video model'
                )
              }
              await generateTextToVideo(
                ctx.session.prompt,
                ctx.session.videoModel,
                ctx.from.id.toString(),
                ctx.from.username,
                isRu,
                ctx.botInfo?.username
              )
              break
            case ModeEnum.TextToImage:
              if (!ctx.session.selected_model) {
                logger.error('❌ Не удалось определить модель', {
                  telegram_id: ctx.from.id,
                  mode: previousMode,
                })
                throw new Error(
                  isRu
                    ? 'improvePromptWizard: Не удалось определить модель'
                    : 'improvePromptWizard: Could not identify model'
                )
              }
              await generateTextToImage(
                ctx.session.prompt,
                ctx.session.selected_model,
                1,
                ctx.from.id.toString(),
                isRu,
                ctx,
                ctx.botInfo?.username
              )
              break
            default:
              logger.error('❌ Неизвестный режим', {
                telegram_id: ctx.from.id,
                mode: previousMode,
              })
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
            logger.warn('⚠️ Достигнут лимит попыток улучшения', {
              telegram_id: ctx.from.id,
              attempts: ctx.session.attempts,
            })
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
          logger.info('🚫 Отмена улучшения промпта', {
            telegram_id: ctx.from.id,
          })
          await ctx.reply(isRu ? 'Операция отменена' : 'Operation cancelled')
          return ctx.scene.leave()
        }

        default: {
          logger.warn('⚠️ Неизвестная команда', {
            telegram_id: ctx.from.id,
            text: text,
          })
          await sendGenericErrorMessage(ctx, isRu)
          return ctx.scene.leave()
        }
      }
    }
  }
)

export default improvePromptWizard
