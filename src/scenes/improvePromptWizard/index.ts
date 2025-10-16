import { Scenes, Markup } from 'telegraf'
import { upgradePrompt } from '@/core/openai/upgradePrompt'
import { MyContext } from '@/interfaces'
import { generateTextToImageDirect } from '@/services/generateTextToImageDirect'
import { generateNeuroPhotoHybrid } from '@/services/generateNeuroPhotoHybrid'
import { generateTextToVideo } from '@/modules/videoGenerator/generateTextToVideo'
import { sendPromptImprovementMessage } from '@/menu/sendPromptImprovementMessage'
import { sendPromptImprovementFailureMessage } from '@/menu/sendPromptImprovementFailureMessage'
import { sendGenericErrorMessage } from '@/menu'
import { ModeEnum } from '@/interfaces/modes'
import { getUserProfileAndSettings } from '@/db/userSettings'
import { logger, logSessionSafely } from '@/utils/logger'
import { getUserBalance, getUserData } from '@/core/supabase'
import { isRussianFromState } from '@/helpers/centralizedLanguage'
import { sendImprovedPrompt } from '@/helpers/sendLongMessage'
import { sendCompletionNotification } from '@/helpers/completionNotification'
const MAX_ATTEMPTS = 10

export const improvePromptWizard = new Scenes.WizardScene<MyContext>(
  ModeEnum.ImprovePromptWizard,
  async ctx => {
    const isRu = isRussianFromState(ctx)
    logSessionSafely(ctx.session, 'ctx.session')

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

    // Проверяем, был ли mode передан через state
    if (
      !ctx.session.mode && // Если в сессии еще нет mode
      ctx.scene.state &&
      'mode' in ctx.scene.state &&
      typeof ctx.scene.state.mode === 'string' // Убедимся, что это строка (или нужный тип)
    ) {
      console.log('improvePromptWizard: Получен mode из ctx.scene.state')
      ctx.session.mode = ctx.scene.state.mode as ModeEnum // Приводим к типу
    } else if (ctx.session.mode) {
      console.log('improvePromptWizard: Mode уже есть в ctx.session')
    } else {
      console.log(
        'improvePromptWizard: Mode не найден ни в session, ни в state'
      )
      // Можно добавить обработку, если mode не найден и он критичен уже здесь
      // Например, отправить сообщение пользователю и выйти из сцены
      // await ctx.reply(isRu ? 'Ошибка: не удалось определить режим работы.' : 'Error: Could not determine operation mode.');
      // return ctx.scene.leave();
    }

    const prompt = ctx.session.prompt

    console.log(prompt, 'prompt')

    if (!ctx.from) {
      await ctx.reply(
        isRu ? 'Ошибка идентификации пользователя' : 'User identification error'
      )
      await ctx.scene.leave()
      return ctx.scene.enter(ModeEnum.MainMenu)
    }

    ctx.session.attempts = 0 // Инициализируем счетчик попыток

    await sendPromptImprovementMessage(ctx, isRu)

    if (!prompt) {
      await sendPromptImprovementFailureMessage(ctx, isRu)
      await ctx.scene.leave()
      return ctx.scene.enter(ModeEnum.MainMenu)
    }

    const improvedPrompt = await upgradePrompt(prompt)
    if (!improvedPrompt) {
      await sendPromptImprovementFailureMessage(ctx, isRu)
      await ctx.scene.leave()
      return ctx.scene.enter(ModeEnum.MainMenu)
    }

    ctx.session.prompt = improvedPrompt

    await sendImprovedPrompt(
      ctx,
      improvedPrompt,
      isRu,
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
    const isRu = isRussianFromState(ctx)
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
        await ctx.scene.leave()
        return ctx.scene.enter(ModeEnum.MainMenu)
      }

      if (!ctx.session.prompt) {
        await sendPromptImprovementFailureMessage(ctx, isRu)
        await ctx.scene.leave()
        return ctx.scene.enter(ModeEnum.MainMenu)
      }
      if (!ctx.session.mode) {
        await sendPromptImprovementFailureMessage(ctx, isRu)
        await ctx.scene.leave()
        return ctx.scene.enter(ModeEnum.MainMenu)
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
            await ctx.scene.leave()
            return ctx.scene.enter(ModeEnum.MainMenu)
          }

          console.log(mode, 'mode')
          try {
            switch (mode) {
              case ModeEnum.NeuroPhoto: {
                // ИСПРАВЛЕНИЕ: Формируем правильный промпт с учетом пола и trigger_word
                const trigger_word = ctx.session.userModel
                  .trigger_word as string

                const userData = await getUserData(ctx.from.id.toString())
                let genderPromptPart = 'person'
                if (userData?.gender === 'female') {
                  genderPromptPart = 'female'
                } else if (userData?.gender === 'male') {
                  genderPromptPart = 'male'
                }

                console.log(
                  `[improvePromptWizard] Determined gender for prompt: ${genderPromptPart}`
                )

                const detailPrompt = `Cinematic Lighting, ethereal light, intricate details, extremely detailed, incredible details, full colored, complex details, insanely detailed and intricate, hypermaximalist, extremely detailed with rich colors. masterpiece, best quality, aerial view, HDR, UHD, unreal engine, Representative, fair skin, beautiful face, Rich in details High quality, gorgeous, glamorous, 8k, super detail, gorgeous light and shadow, detailed decoration, detailed lines`

                const fullPrompt = `Fashionable ${trigger_word} ${genderPromptPart}, ${ctx.session.prompt}, ${detailPrompt}`

                await generateNeuroPhotoHybrid(
                  fullPrompt,
                  ctx.session.userModel.model_url,
                  1,
                  ctx.from.id.toString(),
                  ctx,
                  ctx.botInfo?.username
                )

                // Send completion notification
                await sendCompletionNotification(ctx, isRu, 'neuro_photo')
                break
              }
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
                  ctx.session.videoModel,
                  ctx.session.selectedResolution // Добавляем недостающий параметр
                )

                // Send completion notification
                await sendCompletionNotification(ctx, isRu, 'text_to_video')
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
                  await ctx.scene.leave()
                  return ctx.scene.enter(ModeEnum.MainMenu)
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

                // Send completion notification
                await sendCompletionNotification(ctx, isRu, 'text_to_image')

                await ctx.reply(
                  isRu
                    ? `Ваши изображения сгенерированы!\n\nЕсли хотите сгенерировать еще, то выберите количество изображений в меню 1️⃣, 2️⃣, 3️⃣, 4️⃣.\n\nВаш новый баланс: ${currentBalance.toFixed(
                        2
                      )} ⭐️`
                    : `Your images have been generated!\n\nGenerate more?\n\nYour new balance: ${currentBalance.toFixed(
                        2
                      )} ⭐️`,
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
            await ctx.scene.leave()
            return ctx.scene.enter(ModeEnum.MainMenu)
          }
          await ctx.scene.leave()
          return ctx.scene.enter(ModeEnum.MainMenu)
        }

        case isRu ? '🔄 Еще раз улучшить' : '🔄 Improve again': {
          ctx.session.attempts = (ctx.session.attempts || 0) + 1

          if (ctx.session.attempts >= MAX_ATTEMPTS) {
            await ctx.reply(
              isRu
                ? 'Достигнуто максимальное количество попыток улучшения промпта.'
                : 'Maximum number of prompt improvement attempts reached.'
            )
            await ctx.scene.leave()
            return ctx.scene.enter(ModeEnum.MainMenu)
          }

          await ctx.reply(
            isRu
              ? '⏳ Повторное улучшение промпта...'
              : '⏳ Re-improving prompt...'
          )
          if (!ctx.session.prompt) {
            await sendPromptImprovementFailureMessage(ctx, isRu)
            await ctx.scene.leave()
            return ctx.scene.enter(ModeEnum.MainMenu)
          }
          const improvedPrompt = await upgradePrompt(ctx.session.prompt)
          if (!improvedPrompt) {
            await sendPromptImprovementFailureMessage(ctx, isRu)
            await ctx.scene.leave()
            return ctx.scene.enter(ModeEnum.MainMenu)
          }

          ctx.session.prompt = improvedPrompt

          await sendImprovedPrompt(
            ctx,
            improvedPrompt,
            isRu,
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
          await ctx.scene.leave()
          return ctx.scene.enter(ModeEnum.MainMenu)
        }

        default: {
          await sendGenericErrorMessage(ctx, isRu)
          await ctx.scene.leave()
          return ctx.scene.enter(ModeEnum.MainMenu)
        }
      }
    }
  }
)

export default improvePromptWizard
