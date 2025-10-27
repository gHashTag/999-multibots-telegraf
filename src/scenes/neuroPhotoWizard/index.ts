import { MyContext } from '@/interfaces'
import { ModelUrl, UserModel, ModelTraining } from '@/interfaces'

import { generateNeuroPhotoHybrid } from '@/services/generateNeuroPhotoHybrid'
import {
  getActiveUserModelsByType,
  getReferalsCountAndUserData,
  getUserData,
} from '@/core/supabase'
// ✅ ИМПОРТИРУЕМ НОВУЮ ФУНКЦИЮ ДЛЯ HAIM GROUP MEDIA
import { getActiveUserModelsByTypeForHaim } from '@/core/supabase/getActiveUserModelsByTypeForHaim'
import {
  levels,
  mainMenu,
  sendGenericErrorMessage,
  sendPhotoDescriptionRequest,
} from '@/menu'
import { handleHelpCancel } from '@/handlers/handleHelpCancel'
import { Scenes, Markup } from 'telegraf'
import { getUserInfo } from '@/handlers/getUserInfo'
import { isRussianFromState } from '@/helpers/centralizedLanguage'
import { handleMenu } from '@/handlers'
import { ModeEnum } from '@/interfaces/modes'
// ✅ ИМПОРТИРУЕМ getBotNameByToken ДЛЯ ОПРЕДЕЛЕНИЯ ТЕКУЩЕГО БОТА
import { getBotNameByToken } from '@/core/bot'
// ✅ ИМПОРТИРУЕМ LOGGER И WIZARD HELPERS
import { logger } from '@/utils/enhancedLogger'
import { getMessageText } from '@/middleware/wizardHelpers'

interface NeuroPhotoWizardSession extends Scenes.WizardSessionData {
  userModels?: ModelTraining[]
}

const neuroPhotoConversationStep = async (ctx: MyContext) => {
  // ✅ ИСПОЛЬЗУЕМ НОВУЮ ЦЕНТРАЛИЗОВАННУЮ СИСТЕМУ (БЕЗ ЗАПРОСОВ К БД!)
  const isRu = isRussianFromState(ctx)
  try {
    logger.info('[NeuroPhotoWizard] Starting conversation step', {
      telegramId: ctx.from?.id,
      step: 1,
    })

    const { telegramId } = await getUserInfo(ctx)

    // ✅ ОПРЕДЕЛЯЕМ ТЕКУЩИЙ БОТ
    const botToken = ctx.telegram.token
    const { bot_name } = getBotNameByToken(botToken)
    logger.info('[NeuroPhotoWizard] Bot identified', {
      botName: bot_name,
      telegramId,
    })

    // ✅ ИСПОЛЬЗУЕМ НОВУЮ ФУНКЦИЮ ДЛЯ HAIM GROUP MEDIA, ИНАЧЕ СТАНДАРТНУЮ
    let userModels: ModelTraining[] | null = null

    if (bot_name === 'HaimGroupMedia_bot') {
      logger.debug('[NeuroPhotoWizard] Using extended function for HaimGroupMedia_bot', {
        telegramId,
      })
      userModels = await getActiveUserModelsByTypeForHaim(
        Number(telegramId),
        'replicate',
        bot_name
      )
    } else {
      logger.debug('[NeuroPhotoWizard] Using standard function for regular bot', {
        telegramId,
      })
      userModels = await getActiveUserModelsByType(
        Number(telegramId),
        'replicate'
      )
    }

    const { subscriptionType } = await getReferalsCountAndUserData(telegramId)

    if (!userModels || userModels.length === 0) {
      await ctx.reply(
        isRu
          ? '❌ У вас нет обученных моделей для нейрофото.\n\nИспользуйте команду "🤖 Цифровое тело аватара", в главном меню, чтобы создать свою ИИ модель для генерации нейрофото с вашим лицом. '
          : "❌ You don't have any trained models for neurophotos.\n\nUse the '🤖  Digital avatar body' command in the main menu to create your AI model for generating neurophotos with your face.",
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
    } else if (userModels.length === 1) {
      ctx.session.userModel = userModels[0] as UserModel
      await sendPhotoDescriptionRequest(ctx, isRu, 'neuro_photo')
      const isCancel = await handleHelpCancel(ctx)
      if (isCancel) {
        return ctx.scene.leave()
      }
      ctx.wizard.next()
      return
    } else {
      ;(ctx.scene.state as NeuroPhotoWizardSession).userModels = userModels

      const modelButtons = userModels.map((model, index) => {
        let buttonText = `${index + 1}. `
        const dateString = new Date(model.created_at).toLocaleDateString(
          isRu ? 'ru-RU' : 'en-US'
        )

        // ✅ ПРОВЕРЯЕМ, ЯВЛЯЕТСЯ ЛИ МОДЕЛЬ ОБЩЕЙ (ИМЕЕТ ПРЕФИКС shared_)
        const isSharedModel = model.id.toString().startsWith('shared_')

        if (isRu) {
          if (isSharedModel) {
            // Для общих моделей используем уже модифицированное название
            buttonText += model.model_name
          } else {
            buttonText += `Модель ${dateString}`
            if (model.steps && model.steps > 0) {
              buttonText += `, ${model.steps} шагов`
            }
          }
        } else {
          if (isSharedModel) {
            // Для общих моделей используем уже модифицированное название
            buttonText += model.model_name.replace(
              '(Общая модель команды)',
              '(Team Shared Model)'
            )
          } else {
            buttonText += `Model ${dateString}`
            if (model.steps && model.steps > 0) {
              buttonText += `, ${model.steps} steps`
            }
          }
        }

        return [
          { text: buttonText, callback_data: `select_neuro_model_${model.id}` },
        ]
      })

      // Добавляем кнопку отмены
      modelButtons.push([
        {
          text: isRu ? 'Отмена' : 'Cancel',
          callback_data: 'cancel_neuro_photo',
        },
      ])

      await ctx.reply(
        isRu
          ? 'Выберите модель для генерации:'
          : 'Select a model for generation:',
        {
          reply_markup: {
            inline_keyboard: modelButtons,
          },
        }
      )
      return
    }
  } catch (error) {
    logger.error('[NeuroPhotoWizard] Error in conversation step', {
      error: error instanceof Error ? error.message : String(error),
      telegramId: ctx.from?.id,
    })
    await sendGenericErrorMessage(ctx, isRu, error)
    return ctx.scene.leave()
  }
}

const neuroPhotoPromptStep = async (ctx: MyContext) => {
  logger.info('[NeuroPhotoWizard] Starting prompt step', {
    telegramId: ctx.from?.id,
    step: 2,
  })
  if (ctx.message && 'text' in ctx.message) {
    const promptText = ctx.message.text.trim()
    logger.debug('[NeuroPhotoWizard] Prompt entered', {
      telegramId: ctx.from?.id,
      promptLength: promptText.length,
    })
    if (promptText.length < 3) {
      // ✅ ИСПОЛЬЗУЕМ НОВУЮ ЦЕНТРАЛИЗОВАННУЮ СИСТЕМУ (БЕЗ ЗАПРОСОВ К БД!)
      const isRu = isRussianFromState(ctx)
      await ctx.reply(
        isRu
          ? 'Промпт слишком короткий. Пожалуйста, введите более подробное описание (минимум 3 символа).'
          : 'Prompt is too short. Please provide a more detailed description (minimum 3 characters).'
      )
      return
    }

    logger.debug('[NeuroPhotoWizard] Prompt validation passed', {
      telegramId: ctx.from?.id,
    })
    ctx.session.prompt = promptText
    const userId = ctx.from?.id
    logger.debug('[NeuroPhotoWizard] User ID extracted', {
      userId,
    })

    if (!ctx.session.userModel || !ctx.session.userModel.model_url) {
      logger.error('[NeuroPhotoWizard] UserModel not found in session', {
        telegramId: ctx.from?.id,
      })
      // ✅ ИСПОЛЬЗУЕМ НОВУЮ ЦЕНТРАЛИЗОВАННУЮ СИСТЕМУ (БЕЗ ЗАПРОСОВ К БД!)
      const isRu = isRussianFromState(ctx)
      await ctx.reply(
        isRu
          ? '❌ Произошла ошибка: модель не выбрана. Попробуйте начать заново.'
          : '❌ Error: model not selected. Please start over.'
      )
      // handleMenu сам определит язык и подписку
      await handleMenu(ctx)
      return
    }

    logger.debug('[NeuroPhotoWizard] UserModel found in session', {
      telegramId: ctx.from?.id,
    })
    const model_url = ctx.session.userModel.model_url as string
    const trigger_word = ctx.session.userModel.trigger_word as string
    logger.debug('[NeuroPhotoWizard] Model details extracted', {
      modelUrl: model_url,
      triggerWord: trigger_word,
      telegramId: ctx.from?.id,
    })

    const userData = await getUserData(userId?.toString() ?? '')
    let genderPromptPart = 'person'
    if (userData?.gender === 'female') {
      genderPromptPart = 'female'
    } else if (userData?.gender === 'male') {
      genderPromptPart = 'male'
    }

    logger.info('[NeuroPhotoWizard] Gender determined for prompt', {
      gender: genderPromptPart,
      telegramId: ctx.from?.id,
    })

    const detailPrompt = `Cinematic Lighting, ethereal light, intricate details, extremely detailed, incredible details, full colored, complex details, insanely detailed and intricate, hypermaximalist, extremely detailed with rich colors. masterpiece, best quality, aerial view, HDR, UHD, unreal engine, Representative, fair skin, beautiful face, Rich in details High quality, gorgeous, glamorous, 8k, super detail, gorgeous light and shadow, detailed decoration, detailed lines`

    const fullPrompt = `Fashionable ${trigger_word} ${genderPromptPart}, ${promptText}, ${detailPrompt}`
    logger.debug('[NeuroPhotoWizard] Full prompt generated', {
      promptPreview: fullPrompt.substring(0, 100),
      telegramId: ctx.from?.id,
    })

    logger.info('[NeuroPhotoWizard] Starting image generation', {
      telegramId: ctx.from?.id,
    })
    try {
      // ГЕНЕРИРУЕМ СРАЗУ 1 ИЗОБРАЖЕНИЕ КАК БЫЛО РАНЬШЕ!
      const result = await generateNeuroPhotoHybrid(
        fullPrompt,
        model_url as any,
        1,
        userId?.toString() ?? '',
        ctx,
        ctx.botInfo?.username
      )
      logger.info('[NeuroPhotoWizard] Image generation completed successfully', {
        telegramId: ctx.from?.id,
        result: result ? 'success' : 'no_result',
      })
    } catch (error) {
      logger.error('[NeuroPhotoWizard] Error in image generation', {
        error: error instanceof Error ? error.message : String(error),
        telegramId: ctx.from?.id,
      })
      const isRu = isRussianFromState(ctx)
      await ctx.reply(
        isRu
          ? '❌ Произошла ошибка при генерации изображения. Попробуйте позже.'
          : '❌ Error occurred during image generation. Please try again later.'
      )
      return
    }

    // После генерации переходим к следующему шагу (для обработки кнопок типа "Новый промпт")
    logger.debug('[NeuroPhotoWizard] Moving to next wizard step', {
      telegramId: ctx.from?.id,
    })
    ctx.wizard.next()
    return
  }
}

const neuroPhotoButtonStep = async (ctx: MyContext) => {
  logger.info('[NeuroPhotoWizard] Starting button step', {
    telegramId: ctx.from?.id,
    step: 3,
  })
  if (ctx.message && 'text' in ctx.message) {
    const text = ctx.message.text
    logger.debug('[NeuroPhotoWizard] Button pressed', {
      buttonText: text,
      telegramId: ctx.from?.id,
    })
    // ✅ ИСПОЛЬЗУЕМ НОВУЮ ЦЕНТРАЛИЗОВАННУЮ СИСТЕМУ (БЕЗ ЗАПРОСОВ К БД!)
    const isRu = isRussianFromState(ctx)

    if (text === '🆕 Новый промпт' || text === '🆕 New prompt') {
      logger.info('[NeuroPhotoWizard] New prompt - returning to beginning', {
        telegramId: ctx.from?.id,
      })
      ctx.session.prompt = undefined
      ctx.wizard.selectStep(0)
      return neuroPhotoConversationStep(ctx)
    }

    if (text === '⬆️ Улучшить промпт' || text === '⬆️ Improve prompt') {
      logger.info('[NeuroPhotoWizard] Improve prompt selected', {
        telegramId: ctx.from?.id,
      })
      await ctx.scene.enter(ModeEnum.ImprovePromptWizard)
      return
    }

    if (text === '📐 Изменить размер' || text === '📐 Change size') {
      logger.info('[NeuroPhotoWizard] Change size selected', {
        telegramId: ctx.from?.id,
      })
      await ctx.scene.enter(ModeEnum.SizeWizard)
      return
    }

    if (text === levels[104].title_ru || text === levels[104].title_en) {
      logger.info('[NeuroPhotoWizard] Main menu selected', {
        telegramId: ctx.from?.id,
      })
      await handleMenu(ctx)
      return
    }

    const numImages = parseInt(text[0])
    const prompt = ctx.session.prompt
    const userId = ctx.from?.id

    if (!prompt || !ctx.session.userModel || !ctx.session.userModel.model_url) {
      logger.error('[NeuroPhotoWizard] Prompt or userModel not found in session', {
        telegramId: ctx.from?.id,
      })
      await ctx.reply(
        isRu
          ? '❌ Произошла ошибка: данные для генерации не найдены. Попробуйте начать заново.'
          : '❌ Error: generation data not found. Please start over.'
      )
      // handleMenu сам определит язык и подписку
      await handleMenu(ctx)
      return
    }

    const generate = async (num: number) => {
      // ИСПРАВЛЕНИЕ: Формируем правильный промпт с учетом пола
      const trigger_word = ctx.session.userModel.trigger_word as string

      const userData = await getUserData(userId?.toString() ?? '')
      let genderPromptPart = 'person'
      if (userData?.gender === 'female') {
        genderPromptPart = 'female'
      } else if (userData?.gender === 'male') {
        genderPromptPart = 'male'
      }

      logger.debug('[NeuroPhotoWizard] Gender determined in button step', {
        gender: genderPromptPart,
        telegramId: ctx.from?.id,
      })

      const detailPrompt = `Cinematic Lighting, ethereal light, intricate details, extremely detailed, incredible details, full colored, complex details, insanely detailed and intricate, hypermaximalist, extremely detailed with rich colors. masterpiece, best quality, aerial view, HDR, UHD, unreal engine, Representative, fair skin, beautiful face, Rich in details High quality, gorgeous, glamorous, 8k, super detail, gorgeous light and shadow, detailed decoration, detailed lines`

      const fullPrompt = `Fashionable ${trigger_word} ${genderPromptPart}, ${prompt}, ${detailPrompt}`

      await generateNeuroPhotoHybrid(
        fullPrompt,
        ctx.session.userModel.model_url as any,
        num,
        userId?.toString() ?? '',
        ctx,
        ctx.botInfo?.username
      )
    }

    if (numImages >= 1 && numImages <= 4) {
      await generate(numImages)
      return ctx.scene.leave()
    } else {
      logger.warn('[NeuroPhotoWizard] Unknown input in button step', {
        telegramId: ctx.from?.id,
      })
      // handleMenu сам определит язык и подписку
      await handleMenu(ctx)
      return
    }
  } else {
    logger.warn('[NeuroPhotoWizard] Non-text or missing input in button step', {
      telegramId: ctx.from?.id,
    })
    // handleMenu сам определит язык и подписку
    await handleMenu(ctx)
    return
  }
}

export const neuroPhotoWizard = new Scenes.WizardScene<MyContext>(
  ModeEnum.NeuroPhoto,
  neuroPhotoConversationStep,
  neuroPhotoPromptStep,
  neuroPhotoButtonStep
)

neuroPhotoWizard.on('callback_query', async (ctx: MyContext) => {
  if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) {
    // ✅ ИСПОЛЬЗУЕМ НОВУЮ ЦЕНТРАЛИЗОВАННУЮ СИСТЕМУ (БЕЗ ЗАПРОСОВ К БД!)
    const isRuLocal = isRussianFromState(ctx)
    const message = isRuLocal
      ? 'Произошла ошибка ответа от кнопки'
      : 'Button callback error'
    return ctx.answerCbQuery(message)
  }
  const callbackData = ctx.callbackQuery.data
  // ✅ ИСПОЛЬЗУЕМ НОВУЮ ЦЕНТРАЛИЗОВАННУЮ СИСТЕМУ (БЕЗ ЗАПРОСОВ К БД!)
  const isRu = isRussianFromState(ctx)

  await ctx.answerCbQuery()

  if (callbackData === 'cancel_neuro_photo') {
    await ctx.reply(isRu ? "Отменено. Возвращаю в главное меню." : "Cancelled. Returning to main menu.")
    await handleMenu(ctx)
    return ctx.scene.leave()
  } else if (callbackData.startsWith('select_neuro_model_')) {
    let modelId = callbackData.replace('select_neuro_model_', '')

    // ✅ ОБРАБАТЫВАЕМ ОБЩИЕ МОДЕЛИ (УБИРАЕМ ПРЕФИКС shared_)
    const isSharedModel = modelId.startsWith('shared_')
    if (isSharedModel) {
      modelId = modelId.replace('shared_', '')
    }

    const userModels = (ctx.scene.state as NeuroPhotoWizardSession).userModels
    const selectedModel = userModels?.find(
      (model) => model.id.toString() === modelId
    )

    if (selectedModel) {
      ctx.session.userModel = selectedModel as UserModel
      await sendPhotoDescriptionRequest(ctx, isRu, ModeEnum.NeuroPhoto)
      const isCancel = await handleHelpCancel(ctx)
      if (isCancel) {
        return ctx.scene.leave()
      }
      ctx.wizard.next()
    } else {
      await ctx.reply(
        isRu
          ? '❌ Модель не найдена. Попробуйте снова.'
          : '❌ Model not found. Please try again.'
      )
    }
  }
})

// ✅ ОБРАБАТЫВАЕМ УНИВЕРСАЛЬНЫЕ КОМАНДЫ ВОКРУГ СЦЕНЫ (МЕНЮ, HELP И Т.Д.)
neuroPhotoWizard.command('menu', async (ctx) => {
  // handleMenu сам определит язык и подписку
  await handleMenu(ctx)
  return ctx.scene.leave()
})

neuroPhotoWizard.command('help', async (ctx) => {
  // ✅ ИСПОЛЬЗУЕМ НОВУЮ ЦЕНТРАЛИЗОВАННУЮ СИСТЕМУ (БЕЗ ЗАПРОСОВ К БД!)
  const isRu = isRussianFromState(ctx)
  await ctx.reply(
    isRu
      ? 'Это сцена создания нейрофото. Введите описание на английском языке для генерации.'
      : 'This is the neurophoto creation scene. Enter a description in English to generate.'
  )
})