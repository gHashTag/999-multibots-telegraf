import { MyContext } from '@/interfaces'
import { UserModel } from '../../interfaces'

// ✅ УДАЛЯЕМ СТАРЫЕ ИМПОРТЫ - теперь используем Inngest!
import {
  getLatestUserModel,
  getReferalsCountAndUserData,
  getUserData,
  supabase,
} from '@/core/supabase'
// ✅ ИМПОРТИРУЕМ НОВУЮ ФУНКЦИЮ ДЛЯ HAIM GROUP MEDIA
import { getLatestUserModelForHaim } from '@/core/supabase/getLatestUserModelForHaim'
import {
  levels,
  mainMenu,
  sendGenericErrorMessage,
  sendPhotoDescriptionRequest,
} from '@/menu'
import { handleHelpCancel } from '@/handlers/handleHelpCancel'
import { Scenes } from 'telegraf'

import { getUserInfo } from '@/handlers/getUserInfo'
import { handleMenu } from '@/handlers'
import { ModeEnum } from '@/interfaces/modes'
import { isRussianFromState } from '@/helpers/centralizedLanguage'
import { getBotNameByToken } from '@/core/bot'

// ✅ НОВЫЙ ИМПОРТ - Inngest!
import { sendInngestEvent, INNGEST_EVENTS } from '@/inngest_app/inngestClient'
import { logger } from '@/utils/logger'

const neuroPhotoConversationStep = async (ctx: MyContext) => {
  const isRu = isRussianFromState(ctx)
  try {
    logger.info('🖼️ [NEURO-PHOTO-V2] Starting conversation', {
      userId: ctx.from?.id,
    })

    const { telegramId } = await getUserInfo(ctx)

    // ✅ ОПРЕДЕЛЯЕМ ТЕКУЩИЙ БОТ
    const botToken = ctx.telegram.token
    const { bot_name } = getBotNameByToken(botToken)

    logger.info('🤖 [NEURO-PHOTO-V2] Bot determined', {
      bot_name,
      telegramId,
    })

    // ✅ УНИВЕРСАЛЬНАЯ ЛОГИКА ДЛЯ ВСЕХ БОТОВ - ИЩЕМ И BFL И REPLICATE МОДЕЛИ
    let userModel = null

    // Сначала пробуем replicate модели
    if (bot_name === 'HaimGroupMedia_bot') {
      userModel = await getLatestUserModelForHaim(
        Number(telegramId),
        'replicate',
        bot_name
      )
    } else {
      userModel = await getLatestUserModel(Number(telegramId), 'replicate')
    }

    // Если нет replicate модели, пробуем BFL
    if (!userModel) {
      logger.info('🔄 [NEURO-PHOTO-V2] Replicate model not found, trying BFL', {
        telegramId,
      })
      if (bot_name === 'HaimGroupMedia_bot') {
        userModel = await getLatestUserModelForHaim(
          Number(telegramId),
          'bfl',
          bot_name
        )
      } else {
        userModel = await getLatestUserModel(Number(telegramId), 'bfl')
      }
    }

    // ✅ ОБРАБАТЫВАЕМ ОБЩИЕ МОДЕЛИ
    let modelToUse = userModel
    const isSharedModel = userModel?.id?.toString().startsWith('shared_')
    if (isSharedModel) {
      modelToUse = {
        ...userModel,
        id: userModel.id.toString().replace('shared_', ''),
      }
      logger.info('✅ [NEURO-PHOTO-V2] Using shared model', {
        modelName: userModel.model_name,
      })
    }

    if (!userModel) {
      const { subscriptionType } = await getReferalsCountAndUserData(telegramId)

      await ctx.reply(
        isRu
          ? `❌ У вас нет обученных моделей для этого бота (${bot_name}).\n\nВозможно, модели были созданы на другом боте или с другим API.\n\nИспользуйте команду "🤖 Цифровое тело аватара", чтобы создать новую модель.`
          : `❌ You don't have any trained models for this bot (${bot_name}).\n\nPerhaps models were created on another bot or with different API.\n\nUse "🤖 Digital avatar body" to create a new model.`,
        {
          reply_markup: {
            keyboard: (
              await mainMenu({
                isRu,
                subscription: subscriptionType,
                ctx,
              })
            ).reply_markup.keyboard,
          },
        }
      )

      return ctx.scene.leave()
    }

    ctx.session.userModel = modelToUse as UserModel

    await sendPhotoDescriptionRequest(ctx, isRu, ModeEnum.NeuroPhoto)

    const isCancel = await handleHelpCancel(ctx)
    if (isCancel) {
      return ctx.scene.leave()
    }

    return ctx.wizard.next()
  } catch (error) {
    logger.error('❌ [NEURO-PHOTO-V2] Error in conversation step', {
      error: error instanceof Error ? error.message : String(error),
      userId: ctx.from?.id,
    })
    await sendGenericErrorMessage(ctx, isRu, error as Error)
    throw error
  }
}

const neuroPhotoPromptStep = async (ctx: MyContext) => {
  logger.info('📝 [NEURO-PHOTO-V2] Prompt step', {
    userId: ctx.from?.id,
  })

  const isRu = isRussianFromState(ctx)
  const promptMsg = ctx.message

  if (promptMsg && 'text' in promptMsg) {
    const promptText = promptMsg.text

    const isCancel = await handleHelpCancel(ctx)

    if (isCancel) {
      return ctx.scene.leave()
    }

    ctx.session.prompt = promptText

    const trigger_word = ctx.session.userModel.trigger_word as string
    const userId = ctx.from?.id

    if (!userId) {
      logger.error('❌ [NEURO-PHOTO-V2] User ID not found')
      return
    }

    if (trigger_word) {
      const userData = await getUserData(userId.toString())
      let genderPromptPart = 'person'
      if (userData?.gender === 'female') {
        genderPromptPart = 'female'
      } else if (userData?.gender === 'male') {
        genderPromptPart = 'male'
      }

      const detailPrompt = `Cinematic Lighting, ethereal light, intricate details, extremely detailed, incredible details, full colored, complex details, insanely detailed and intricate, hypermaximalist, extremely detailed with rich colors. masterpiece, best quality, aerial view, HDR, UHD, unreal engine, Representative, fair skin, beautiful face, Rich in details High quality, gorgeous, glamorous, 8k, super detail, gorgeous light and shadow, detailed decoration, detailed lines`

      const fullPrompt = `Fashionable ${trigger_word} ${genderPromptPart}, ${promptText}, ${detailPrompt}`

      // ✅ НОВАЯ ЛОГИКА С INNGEST - Вместо прямого вызова API!
      try {
        // Проверяем multi-photo
        const multiPhotoUrls = ctx.session?.multiPhotoUrls
        const multiPhotoCount = ctx.session?.multiPhotoCount

        if (multiPhotoUrls && multiPhotoCount && multiPhotoCount > 1) {
          logger.info('🎨 [NEURO-PHOTO-V2] Processing multi-image', {
            userId,
            count: multiPhotoCount,
          })

          // ✅ Отправляем событие в Inngest для multi-photo
          const eventId = await sendInngestEvent(
            INNGEST_EVENTS.NEURO_IMAGE_GENERATION,
            {
              prompt: fullPrompt,
              modelUrl: ctx.session.userModel.model_url,
              count: multiPhotoCount,
              userId: userId.toString(),
              telegramId: userId.toString(),
              botUsername: ctx.botInfo?.username,
              multiPhotoUrls,
              metadata: {
                type: 'multi-photo',
                triggerWord: trigger_word,
                gender: genderPromptPart,
              },
            }
          )

          // ✅ Мгновенно отвечаем пользователю
          await ctx.reply(
            isRu
              ? `⏳ Создаю ${multiPhotoCount} изображения...\n\nID задачи: ${eventId.substring(0, 8)}...\n\nВы получите уведомление когда будет готово! 🎉`
              : `⏳ Creating ${multiPhotoCount} images...\n\nTask ID: ${eventId.substring(0, 8)}...\n\nYou'll receive a notification when ready! 🎉`,
            {
              reply_markup: {
                inline_keyboard: [
                  [
                    {
                      text: isRu ? '🔄 Проверить статус' : '🔄 Check status',
                      callback_data: `status_${eventId}`,
                    },
                  ],
                  [
                    {
                      text: isRu ? '🏠 Главное меню' : '🏠 Main menu',
                      callback_data: 'go_main_menu',
                    },
                  ],
                ],
              },
            }
          )

          // Очищаем multi-photo данные
          ctx.session.multiPhotoUrls = undefined
          ctx.session.multiPhotoCount = undefined
          ctx.session.awaitingMultiPhotoConfirmation = false
        } else {
          logger.info('🎨 [NEURO-PHOTO-V2] Processing single image', {
            userId,
          })

          // ✅ Отправляем событие в Inngest для single photo
          const eventId = await sendInngestEvent(
            INNGEST_EVENTS.NEURO_IMAGE_GENERATION,
            {
              prompt: fullPrompt,
              modelUrl: ctx.session.userModel.model_url,
              count: 1,
              userId: userId.toString(),
              telegramId: userId.toString(),
              botUsername: ctx.botInfo?.username,
              metadata: {
                type: 'single-photo',
                triggerWord: trigger_word,
                gender: genderPromptPart,
              },
            }
          )

          // ✅ Мгновенно отвечаем пользователю
          await ctx.reply(
            isRu
              ? `⏳ Создаю изображение...\n\nID задачи: ${eventId.substring(0, 8)}...\n\nВы получите уведомление когда будет готово! 🎉`
              : `⏳ Creating image...\n\nTask ID: ${eventId.substring(0, 8)}...\n\nYou'll receive a notification when ready! 🎉`,
            {
              reply_markup: {
                inline_keyboard: [
                  [
                    {
                      text: isRu ? '🔄 Проверить статус' : '🔄 Check status',
                      callback_data: `status_${eventId}`,
                    },
                  ],
                  [
                    {
                      text: isRu ? '🏠 Главное меню' : '🏠 Main menu',
                      callback_data: 'go_main_menu',
                    },
                  ],
                ],
              },
            }
          )
        }

        ctx.wizard.next()
        return
      } catch (error) {
        logger.error('❌ [NEURO-PHOTO-V2] Failed to send Inngest event', {
          error: error instanceof Error ? error.message : String(error),
          userId,
        })

        await ctx.reply(
          isRu
            ? '❌ Произошла ошибка при запуске генерации. Попробуйте позже.'
            : '❌ An error occurred while starting generation. Please try again later.'
        )
        ctx.scene.leave()
        return
      }
    } else {
      await ctx.reply(isRu ? '❌ Некорректный промпт' : '❌ Invalid prompt')
      ctx.scene.leave()
      return
    }
  }
}

const neuroPhotoButtonStep = async (ctx: MyContext) => {
  logger.info('🔘 [NEURO-PHOTO-V2] Button step', {
    userId: ctx.from?.id,
  })

  if (ctx.message && 'text' in ctx.message) {
    const text = ctx.message.text

    const isRu = isRussianFromState(ctx)

    // Обработка кнопки "🆕 Новый промпт"
    if (text === '🆕 Новый промпт' || text === '🆕 New prompt') {
      logger.info('🔄 [NEURO-PHOTO-V2] New prompt requested', {
        userId: ctx.from?.id,
      })
      ctx.session.prompt = undefined
      ctx.wizard.selectStep(0)
      return neuroPhotoConversationStep(ctx)
    }

    // Обработка кнопок "Улучшить промпт" и "Изменить размер"
    if (text === '⬆️ Улучшить промпт' || text === '⬆️ Improve prompt') {
      await ctx.scene.enter(ModeEnum.ImprovePromptWizard)
      return
    }

    if (text === '📐 Изменить размер' || text === '📐 Change size') {
      await ctx.scene.enter(ModeEnum.SizeWizard)
      return
    }

    if (text === levels[104].title_ru || text === levels[104].title_en) {
      await handleMenu(ctx)
      return
    }

    await handleMenu(ctx)
  }
}

// ✅ СОЗДАЕМ СЦЕНУ С НОВОЙ ЛОГИКОЙ
export const neuroPhotoWizardV2 = new Scenes.WizardScene<MyContext>(
  'neuro_photo_v2',
  neuroPhotoConversationStep,
  neuroPhotoPromptStep,
  neuroPhotoButtonStep
)

export default neuroPhotoWizardV2
