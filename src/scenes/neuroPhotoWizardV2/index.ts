import { logger } from '@/utils/enhancedLogger'
import { MyContext } from '@/interfaces'
import { UserModel } from '../../interfaces'

import { generateNeuroPhotoHybrid } from '@/services/generateNeuroPhotoHybrid'
// ✅ IMPORT MULTI-PHOTO SUPPORT
import { generateNeuroPhotoMulti } from '@/services/generateNeuroPhotoMulti'
import { detectMultiPhotoUpload, handleMultiPhotoNeurophoto, checkMultiPhotoEvents } from '@/handlers/multiPhotoHandler'
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
import { ModeEnum } from '@/interfaces/modes'
// ✅ ЗАМЕНЯЕМ НА НОВУЮ ЦЕНТРАЛИЗОВАННУЮ СИСТЕМУ
import { isRussianFromState } from '@/helpers/centralizedLanguage'
// ✅ ИМПОРТИРУЕМ getBotNameByToken ДЛЯ ОПРЕДЕЛЕНИЯ ТЕКУЩЕГО БОТА
import { getBotNameByToken } from '@/core/bot'

const neuroPhotoConversationStep = async (ctx: MyContext) => {
  // ✅ ИСПОЛЬЗУЕМ НОВУЮ ЦЕНТРАЛИЗОВАННУЮ СИСТЕМУ (БЕЗ ЗАПРОСОВ К БД!)
  const isRu = isRussianFromState(ctx)
  try {
    logger.debug('CASE 1: neuroPhotoConversationV2')

    // ✅ CHECK FOR PENDING MULTI-PHOTO EVENTS
    const hasMultiPhotoEvent = await checkMultiPhotoEvents(ctx)
    if (hasMultiPhotoEvent) {
      logger.debug('✅ Multi-photo event detected, handled')
      return
    }

    const { telegramId } = await getUserInfo(ctx)

    // ✅ ОПРЕДЕЛЯЕМ ТЕКУЩИЙ БОТ
    const botToken = ctx.telegram.token
    const { bot_name } = getBotNameByToken(botToken)
    logger.debug(
      `🤖 Определен бот V2: ${bot_name} для пользователя ${telegramId}`
    )

    // ✅ УНИВЕРСАЛЬНАЯ ЛОГИКА ДЛЯ ВСЕХ БОТОВ - ИЩЕМ И BFL И REPLICATE МОДЕЛИ
    let userModel = null

    logger.debug(`🔍 [V2] Ищем модель для бота: ${bot_name}, пользователь: ${telegramId}`)

    // Сначала пробуем replicate модели (они более распространены)
    logger.debug('🔄 Пробуем replicate модели...')
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
      logger.debug('🔄 Replicate модель не найдена, пробуем BFL')
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

    logger.debug('userModel V2', userModel)

    // 🔍 ДИАГНОСТИКА: Проверяем все модели пользователя для диагностики
    try {
      const { data: allModels, error: allModelsError } = await supabase
        .from('model_trainings')
        .select('id, api, status, model_name, bot_name, created_at')
        .eq('telegram_id', telegramId)
        .order('created_at', { ascending: false })
        .limit(10)

      if (allModels && allModels.length > 0) {
        logger.debug(`🔍 [DIAGNOSTIC] Найдено ${allModels.length} моделей для пользователя ${telegramId}:`, allModels)
      } else {
        logger.debug(`❌ [DIAGNOSTIC] Модели НЕ НАЙДЕНЫ для пользователя ${telegramId}`)
      }
    } catch (diagError) {
      logger.error(`❌ [DIAGNOSTIC] Ошибка при получении всех моделей:`, diagError)
    }

    const { subscriptionType } = await getReferalsCountAndUserData(telegramId)

    if (!userModel) {
      // Более детальное сообщение об ошибке с информацией о боте
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

    // ✅ ОБРАБАТЫВАЕМ ОБЩИЕ МОДЕЛИ (УБИРАЕМ ПРЕФИКС shared_ ДЛЯ ИСПОЛЬЗОВАНИЯ)
    let modelToUse = userModel
    const isSharedModel = userModel.id.toString().startsWith('shared_')
    if (isSharedModel) {
      modelToUse = {
        ...userModel,
        id: userModel.id.toString().replace('shared_', ''), // Убираем префикс для использования
      }
      logger.debug(`✅ Используем общую модель V2: ${userModel.model_name}`)
    }

    ctx.session.userModel = modelToUse as UserModel

    await sendPhotoDescriptionRequest(ctx, isRu, ModeEnum.NeuroPhoto)

    // ✅ STANDARD MESSAGE - MULTI-PHOTO MOVED TO AI PHOTOSHOP
    // Multi-photo functionality moved to AI Photoshop scene

    const isCancel = await handleHelpCancel(ctx)
    logger.debug('isCancel', isCancel)
    if (isCancel) {
      return ctx.scene.leave()
    }
    logger.debug('CASE: neuroPhotoConversation V2 next')

    return ctx.wizard.next()
  } catch (error) {
    logger.error('Error in neuroPhotoConversationStep V2:', error)
    await sendGenericErrorMessage(ctx, isRu, error as Error)
    throw error
  }
}

const neuroPhotoPromptStep = async (ctx: MyContext) => {
  logger.debug('CASE 2: neuroPhotoPromptStep')
  // ✅ ИСПОЛЬЗУЕМ НОВУЮ ЦЕНТРАЛИЗОВАННУЮ СИСТЕМУ (БЕЗ ЗАПРОСОВ К БД!)
  const isRu = isRussianFromState(ctx)
  const promptMsg = ctx.message
  logger.debug(promptMsg, 'promptMsg')

  if (promptMsg && 'text' in promptMsg) {
    const promptText = promptMsg.text

    const isCancel = await handleHelpCancel(ctx)

    if (isCancel) {
      return ctx.scene.leave()
    } else {
      ctx.session.prompt = promptText

      const trigger_word = ctx.session.userModel.trigger_word as string

      const userId = ctx.from?.id
      if (!userId) {
        logger.error('❌ User ID не найден')
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

        logger.debug(
          `[neuroPhotoWizardV2] Determined gender for prompt: ${genderPromptPart}`
        )

        const fullPrompt = `Fashionable ${trigger_word} ${genderPromptPart}, ${promptText}, ${detailPrompt}`

        // ✅ CHECK FOR MULTI-IMAGE PROCESSING
        const multiPhotoUrls = ctx.session?.multiPhotoUrls
        const multiPhotoCount = ctx.session?.multiPhotoCount

        if (multiPhotoUrls && multiPhotoCount && multiPhotoCount > 1) {
          logger.debug('🎨 Processing multi-image neurophoto series')
          await generateNeuroPhotoMulti(
            fullPrompt,
            ctx.session.userModel.model_url as any,
            multiPhotoCount,
            userId.toString(),
            ctx,
            ctx.botInfo?.username,
            undefined,
            multiPhotoUrls // Pass multiple image URLs
          )

          // Clear multi-photo session data
          ctx.session.multiPhotoUrls = undefined
          ctx.session.multiPhotoCount = undefined
          ctx.session.awaitingMultiPhotoConfirmation = false
        } else {
          logger.debug('🎨 Processing single neurophoto')
          await generateNeuroPhotoHybrid(
            fullPrompt,
            ctx.session.userModel.model_url as any,
            1,
            userId.toString(),
            ctx,
            ctx.botInfo?.username
          )
        }

        ctx.wizard.next()
        return
      } else {
        await ctx.reply(isRu ? '❌ Некорректный промпт' : '❌ Invalid prompt')
        ctx.scene.leave()
        return
      }
    }
  }
}

const neuroPhotoButtonStep = async (ctx: MyContext) => {
  logger.debug('CASE 3: neuroPhotoButtonStep')
  if (ctx.message && 'text' in ctx.message) {
    const text = ctx.message.text
    logger.debug(`CASE: Нажата кнопка ${text}`)
    // ✅ ИСПОЛЬЗУЕМ НОВУЮ ЦЕНТРАЛИЗОВАННУЮ СИСТЕМУ (БЕЗ ЗАПРОСОВ К БД!)
    const isRu = isRussianFromState(ctx)

    // НОВАЯ ОБРАБОТКА: кнопка "🆕 Новый промпт"
    if (text === '🆕 Новый промпт' || text === '🆕 New prompt') {
      logger.debug('CASE: Новый промпт - возврат к началу сцены V2')
      // Сбрасываем состояние и возвращаемся к первому шагу
      ctx.session.prompt = undefined
      ctx.wizard.selectStep(0) // Возвращаемся к neuroPhotoConversationStep
      // Явно вызываем первый шаг
      return neuroPhotoConversationStep(ctx)
    }

    // Обработка кнопок "Улучшить промпт" и "Изменить размер"
    if (text === '⬆️ Улучшить промпт' || text === '⬆️ Improve prompt') {
      logger.debug('CASE: Улучшить промпт')
      await ctx.scene.enter(ModeEnum.ImprovePromptWizard)
      return
    }

    if (text === '📐 Изменить размер' || text === '📐 Change size') {
      logger.debug('CASE: Изменить размер')
      await ctx.scene.enter(ModeEnum.SizeWizard)
      return
    }

    if (text === levels[104].title_ru || text === levels[104].title_en) {
      logger.debug('CASE: Главное меню')
      return
      return
    }

    return

    // Обработка кнопок с числами
    const numImages = parseInt(text[0])
    const prompt = ctx.session.prompt
    const userId = ctx.from?.id
    const trigger_word = ctx.session.userModel.trigger_word as string

    if (!userId) {
      logger.error('❌ User ID не найден')
      return
    }
    if (!ctx.botInfo?.username) {
      logger.error('❌ Bot username не найден')
      return
    }

    // ИСПРАВЛЕНИЕ: Получаем пол пользователя для правильного промпта
    const userData = await getUserData(userId.toString())
    let genderPromptPart = 'person'
    if (userData?.gender === 'female') {
      genderPromptPart = 'female'
    } else if (userData?.gender === 'male') {
      genderPromptPart = 'male'
    }

    logger.debug(
      `[neuroPhotoWizardV2 ButtonStep] Determined gender for prompt: ${genderPromptPart}`
    )

    const detailPrompt = `Cinematic Lighting, ethereal light, intricate details, extremely detailed, incredible details, full colored, complex details, insanely detailed and intricate, hypermaximalist, extremely detailed with rich colors. masterpiece, best quality, aerial view, HDR, UHD, unreal engine, Representative, fair skin, beautiful face, Rich in details High quality, gorgeous, glamorous, 8k, super detail, gorgeous light and shadow, detailed decoration, detailed lines`

    // ПРАВИЛЬНЫЙ промпт с учетом пола
    const fullPrompt = `Fashionable ${trigger_word} ${genderPromptPart}, ${prompt}, ${detailPrompt}`

    const generate = async (num: number) => {
      // ✅ CHECK FOR MULTI-IMAGE PROCESSING
      const multiPhotoUrls = ctx.session?.multiPhotoUrls
      const multiPhotoCount = ctx.session?.multiPhotoCount

      if (multiPhotoUrls && multiPhotoCount && multiPhotoCount > 1) {
        logger.debug(`🎨 Generating ${num} images for each of ${multiPhotoCount} input photos`)
        await generateNeuroPhotoMulti(
          fullPrompt,
          ctx.session.userModel.model_url as any,
          num,
          userId.toString(),
          ctx,
          ctx.botInfo?.username,
          undefined,
          multiPhotoUrls // Pass multiple image URLs
        )

        // Clear multi-photo session data
        ctx.session.multiPhotoUrls = undefined
        ctx.session.multiPhotoCount = undefined
        ctx.session.awaitingMultiPhotoConfirmation = false
      } else {
        logger.debug(`🎨 Generating ${num} single neurophoto(s)`)
        await generateNeuroPhotoHybrid(
          fullPrompt,
          ctx.session.userModel.model_url as any,
          num,
          userId.toString(),
          ctx,
          ctx.botInfo?.username
        )
      }
    }

    if (numImages >= 1 && numImages <= 4) {
      await generate(numImages)
      return ctx.scene.leave()
    } else {
      const { subscriptionType } = await getReferalsCountAndUserData(
        ctx.from?.id?.toString() || ''
      )
      await mainMenu({
        isRu,
        subscription: subscriptionType,
        ctx,
      })
    }
  }
}

export const neuroPhotoWizardV2 = new Scenes.WizardScene<MyContext>(
  'neuro_photo_v2',
  neuroPhotoConversationStep,
  neuroPhotoPromptStep,
  neuroPhotoButtonStep
)
