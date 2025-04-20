import { MyContext } from '@/interfaces'
import { ModelUrl, UserModel } from '../../interfaces'

import { generateNeuroImage } from '@/services/generateNeuroImage'
import {
  getLatestUserModel,
  getReferalsCountAndUserData,
} from '@/core/supabase'
import {
  levels,
  mainMenu,
  sendGenericErrorMessage,
  sendPhotoDescriptionRequest,
} from '@/menu'
import { handleHelpCancel } from '@/handlers/handleHelpCancel'
import { WizardScene } from 'telegraf/scenes'
import { getUserInfo } from '@/handlers/getUserInfo'
import { handleMenu } from '@/handlers'
import { ModeEnum } from '@/interfaces/modes'
import { logger } from '@/utils/logger'

const neuroPhotoConversationStep = async (ctx: MyContext) => {
  const isRu = ctx.from?.language_code === 'ru'
  const telegramId = ctx.from?.id?.toString() || 'unknown'
  logger.info({
    message: '🚀 [NeuroPhoto] Начало сцены neuroPhotoConversationStep',
    telegramId,
    currentScene: ModeEnum.NeuroPhoto,
    step: 'conversation',
    sessionData: JSON.stringify(ctx.session || {}),
  })

  try {
    console.log('CASE 1: neuroPhotoConversation')

    const { telegramId } = getUserInfo(ctx)
    logger.info({
      message: '🔍 [NeuroPhoto] Получение модели пользователя',
      telegramId,
      step: 'getting_user_model',
    })

    const userModel = await getLatestUserModel(Number(telegramId), 'replicate')
    logger.info({
      message: '📋 [NeuroPhoto] Получение данных о рефералах и пользователе',
      telegramId,
      hasUserModel: !!userModel,
      modelUrl: userModel?.model_url || 'none',
    })

    const { count, subscriptionType, level } =
      await getReferalsCountAndUserData(telegramId)

    logger.info({
      message: '📊 [NeuroPhoto] Данные пользователя получены',
      telegramId,
      referralCount: count,
      subscriptionType,
      level,
    })

    if (!userModel || !userModel.model_url) {
      logger.warn({
        message: '❌ [NeuroPhoto] У пользователя нет обученных моделей',
        telegramId,
      })

      await ctx.reply(
        isRu
          ? '❌ У вас нет обученных моделей.\n\nИспользуйте команду "🤖 Цифровое тело аватара", в главном меню, чтобы создать свою ИИ модель для генерации нейрофото в вашим лицом. '
          : "❌ You don't have any trained models.\n\nUse the '🤖  Digital avatar body' command in the main menu to create your AI model for generating neurophotos with your face.",
        {
          reply_markup: {
            keyboard: (
              await mainMenu({
                isRu,
                inviteCount: count,
                subscription: subscriptionType,
                ctx,
                level,
              })
            ).reply_markup.keyboard,
          },
        }
      )

      logger.info({
        message: '🔄 [NeuroPhoto] Возврат в главное меню (нет моделей)',
        telegramId,
        action: 'leaving_scene',
      })

      return ctx.scene.leave()
    }

    ctx.session.userModel = userModel as UserModel
    logger.info({
      message: '💾 [NeuroPhoto] Модель пользователя сохранена в сессии',
      telegramId,
      modelUrl: userModel.model_url,
      triggerWord: userModel.trigger_word,
    })

    await sendPhotoDescriptionRequest(ctx, isRu, ModeEnum.NeuroPhoto)
    const isCancel = await handleHelpCancel(ctx)
    logger.info({
      message: `🔄 [NeuroPhoto] Обработка команды отмены: ${
        isCancel ? 'отменено' : 'продолжение'
      }`,
      telegramId,
      isCancel,
    })

    console.log('isCancel', isCancel)
    if (isCancel) {
      logger.info({
        message: '🛑 [NeuroPhoto] Отмена операции пользователем',
        telegramId,
        action: 'leaving_scene',
      })
      return ctx.scene.leave()
    }
    console.log('CASE: neuroPhotoConversation next')
    logger.info({
      message: '⏭️ [NeuroPhoto] Переход к следующему шагу',
      telegramId,
      nextStep: 'neuroPhotoPromptStep',
    })
    ctx.wizard.next()
    return
  } catch (error) {
    console.error('Error in neuroPhotoConversationStep:', error)
    logger.error({
      message: '❌ [NeuroPhoto] Ошибка в neuroPhotoConversationStep',
      telegramId,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    })
    await sendGenericErrorMessage(ctx, isRu, error)
    throw error
  }
}

const neuroPhotoPromptStep = async (ctx: MyContext) => {
  console.log('CASE 2: neuroPhotoPromptStep')
  const isRu = ctx.from?.language_code === 'ru'
  const telegramId = ctx.from?.id?.toString() || 'unknown'

  logger.info({
    message: '🚀 [NeuroPhoto] Начало сцены neuroPhotoPromptStep',
    telegramId,
    currentScene: ModeEnum.NeuroPhoto,
    step: 'prompt',
    sessionData: JSON.stringify(ctx.session || {}),
  })

  const promptMsg = ctx.message
  console.log(promptMsg, 'promptMsg')
  logger.info({
    message: '📝 [NeuroPhoto] Получено сообщение с промптом',
    telegramId,
    messageType: promptMsg
      ? 'text' in promptMsg
        ? 'text'
        : 'non-text'
      : 'none',
  })

  if (promptMsg && 'text' in promptMsg) {
    const promptText = promptMsg.text
    logger.info({
      message: '📋 [NeuroPhoto] Текст промпта получен',
      telegramId,
      promptLength: promptText.length,
    })

    const isCancel = await handleHelpCancel(ctx)
    logger.info({
      message: `🔄 [NeuroPhoto] Проверка на отмену: ${
        isCancel ? 'отменено' : 'продолжение'
      }`,
      telegramId,
      isCancel,
    })

    if (isCancel) {
      logger.info({
        message: '🛑 [NeuroPhoto] Отмена операции пользователем',
        telegramId,
        action: 'leaving_scene',
      })
      return ctx.scene.leave()
    } else {
      ctx.session.prompt = promptText
      const model_url = ctx.session.userModel.model_url as ModelUrl
      const trigger_word = ctx.session.userModel.trigger_word as string
      logger.info({
        message:
          '💾 [NeuroPhoto] Данные для генерации изображения подготовлены',
        telegramId,
        prompt: promptText,
        hasModelUrl: !!model_url,
        hasTriggerWord: !!trigger_word,
      })

      const userId = ctx.from?.id

      if (model_url && trigger_word) {
        const fullPrompt = `Fashionable ${trigger_word}, ${promptText}`
        logger.info({
          message: '🎨 [NeuroPhoto] Начало генерации изображения',
          telegramId,
          fullPrompt,
          userId: userId?.toString(),
        })

        await generateNeuroImage(
          fullPrompt,
          model_url,
          1,
          userId.toString(),
          ctx,
          ctx.botInfo?.username
        )

        logger.info({
          message:
            '✅ [NeuroPhoto] Генерация изображения завершена, переход к следующему шагу',
          telegramId,
          nextStep: 'neuroPhotoButtonStep',
        })
        ctx.wizard.next()
        return
      } else {
        logger.error({
          message: '❌ [NeuroPhoto] Отсутствует URL модели или триггер-слово',
          telegramId,
          model_url,
          trigger_word,
        })
        await ctx.reply(isRu ? '❌ Некорректный промпт' : '❌ Invalid prompt')
        logger.info({
          message: '🔄 [NeuroPhoto] Выход из сцены из-за ошибки данных',
          telegramId,
          action: 'leaving_scene',
        })
        ctx.scene.leave()
        return
      }
    }
  }
}

const neuroPhotoButtonStep = async (ctx: MyContext) => {
  console.log('CASE 3: neuroPhotoButtonStep')
  const telegramId = ctx.from?.id?.toString() || 'unknown'
  logger.info({
    message: '🚀 [NeuroPhoto] Начало сцены neuroPhotoButtonStep',
    telegramId,
    currentScene: ModeEnum.NeuroPhoto,
    step: 'button',
    sessionData: JSON.stringify(ctx.session || {}),
  })

  if (ctx.message && 'text' in ctx.message) {
    const text = ctx.message.text
    logger.info({
      message: `🔘 [NeuroPhoto] Нажата кнопка: "${text}"`,
      telegramId,
      buttonText: text,
    })

    console.log(`CASE: Нажата кнопка ${text}`)
    const isRu = ctx.from?.language_code === 'ru'

    // Обработка кнопок "Улучшить промпт" и "Изменить размер"
    if (text === '⬆️ Улучшить промпт' || text === '⬆️ Improve prompt') {
      console.log('CASE: Улучшить промпт')
      logger.info({
        message: '🔄 [NeuroPhoto] Переход к сцене улучшения промпта',
        telegramId,
        nextScene: 'improvePromptWizard',
      })
      await ctx.scene.enter('improvePromptWizard')
      return
    }

    if (text === '📐 Изменить размер' || text === '📐 Change size') {
      console.log('CASE: Изменить размер')
      logger.info({
        message: '🔄 [NeuroPhoto] Переход к сцене изменения размера',
        telegramId,
        nextScene: 'sizeWizard',
      })
      await ctx.scene.enter('sizeWizard')
      return
    }

    if (text === levels[104].title_ru || text === levels[104].title_en) {
      console.log('CASE: Главное меню')
      logger.info({
        message: '🏠 [NeuroPhoto] Запрос на возврат в главное меню',
        telegramId,
        buttonText: text,
      })
      await handleMenu(ctx)
      return
    }

    await handleMenu(ctx)

    // Обработка кнопок с числами
    const numImages = parseInt(text[0])
    const prompt = ctx.session.prompt
    const userId = ctx.from?.id

    const generate = async (num: number) => {
      logger.info({
        message: `🖼️ [NeuroPhoto] Генерация ${num} изображений`,
        telegramId,
        numberOfImages: num,
        prompt: prompt,
      })
      await generateNeuroImage(
        prompt,
        ctx.session.userModel.model_url,
        num,
        userId.toString(),
        ctx,
        ctx.botInfo?.username
      )
    }

    if (numImages >= 1 && numImages <= 4) {
      logger.info({
        message: `🔢 [NeuroPhoto] Определено количество изображений: ${numImages}`,
        telegramId,
        numImages,
      })
      await generate(numImages)
    } else {
      logger.info({
        message: '🔄 [NeuroPhoto] Возврат в главное меню (неизвестная команда)',
        telegramId,
        buttonText: text,
      })
      const { count, subscriptionType, level } =
        await getReferalsCountAndUserData(ctx.from?.id?.toString() || '')
      await mainMenu({
        isRu,
        inviteCount: count,
        subscription: subscriptionType,
        ctx,
        level,
      })
    }
  }
}

export const neuroPhotoWizard = new WizardScene<MyContext>(
  ModeEnum.NeuroPhoto,
  neuroPhotoConversationStep,
  neuroPhotoPromptStep,
  neuroPhotoButtonStep
)
