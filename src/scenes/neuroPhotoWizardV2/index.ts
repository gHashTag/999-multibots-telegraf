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
// ✅ ЗАМЕНЯЕМ НА НОВУЮ ЦЕНТРАЛИЗОВАННУЮ СИСТЕМУ
import { isRussianFromState } from '@/helpers/centralizedLanguage'
// ✅ ИМПОРТИРУЕМ getBotNameByToken ДЛЯ ОПРЕДЕЛЕНИЯ ТЕКУЩЕГО БОТА
import { getBotNameByToken } from '@/core/bot'

const neuroPhotoConversationStep = async (ctx: MyContext) => {
  // ✅ ИСПОЛЬЗУЕМ НОВУЮ ЦЕНТРАЛИЗОВАННУЮ СИСТЕМУ (БЕЗ ЗАПРОСОВ К БД!)
  const isRu = isRussianFromState(ctx)
  try {
    console.log('CASE 1: neuroPhotoConversationV2')

    // ✅ CHECK FOR PENDING MULTI-PHOTO EVENTS
    const hasMultiPhotoEvent = await checkMultiPhotoEvents(ctx)
    if (hasMultiPhotoEvent) {
      console.log('✅ Multi-photo event detected, handled')
      return
    }

    const { telegramId } = await getUserInfo(ctx)

    // ✅ ОПРЕДЕЛЯЕМ ТЕКУЩИЙ БОТ
    const botToken = ctx.telegram.token
    const { bot_name } = getBotNameByToken(botToken)
    console.log(
      `🤖 Определен бот V2: ${bot_name} для пользователя ${telegramId}`
    )

    // ✅ ИСПОЛЬЗУЕМ НОВУЮ ФУНКЦИЮ ДЛЯ HAIM GROUP MEDIA, ИНАЧЕ СТАНДАРТНУЮ
    let userModel = null

    if (bot_name === 'HaimGroupMedia_bot') {
      console.log('🎯 Используем расширенную функцию V2 для HaimGroupMedia_bot')
      userModel = await getLatestUserModelForHaim(
        Number(telegramId),
        'bfl',
        bot_name
      )

      // Если нет BFL модели, пробуем replicate
      if (!userModel) {
        console.log(
          '🔄 BFL модель не найдена, пробуем replicate для HaimGroupMedia_bot'
        )
        userModel = await getLatestUserModelForHaim(
          Number(telegramId),
          'replicate',
          bot_name
        )
      }
    } else {
      console.log('🔧 Используем стандартную функцию V2 для обычного бота')
      // Сначала пробуем BFL модели
      userModel = await getLatestUserModel(Number(telegramId), 'bfl')
    }

    console.log('userModel V2', userModel)

    const { subscriptionType } = await getReferalsCountAndUserData(telegramId)

    if (!userModel) {
      await ctx.reply(
        isRu
          ? '❌ У вас нет обученных моделей.\n\nИспользуйте команду "🤖 Цифровое тело аватара", в главном меню, чтобы создать свою ИИ модель для генерации нейрофото в вашим лицом. '
          : "❌ You don't have any trained models.\n\nUse the '🤖  Digital avatar body' command in the main menu to create your AI model for generating neurophotos with your face.",
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
      console.log(`✅ Используем общую модель V2: ${userModel.model_name}`)
    }

    ctx.session.userModel = modelToUse as UserModel

    await sendPhotoDescriptionRequest(ctx, isRu, ModeEnum.NeuroPhoto)

    // ✅ ENHANCED MESSAGE FOR MULTI-PHOTO SUPPORT
    await ctx.reply(
      isRu
        ? '📷 Вы можете отправить как одно фото, так и несколько изображений сразу (альбом) для создания серии нейрофото!'
        : '📷 You can send either a single photo or multiple images at once (album) to create a neurophoto series!'
    )

    const isCancel = await handleHelpCancel(ctx)
    console.log('isCancel', isCancel)
    if (isCancel) {
      return ctx.scene.leave()
    }
    console.log('CASE: neuroPhotoConversation V2 next')

    return ctx.wizard.next()
  } catch (error) {
    console.error('Error in neuroPhotoConversationStep V2:', error)
    await sendGenericErrorMessage(ctx, isRu, error as Error)
    throw error
  }
}

const neuroPhotoPromptStep = async (ctx: MyContext) => {
  console.log('CASE 2: neuroPhotoPromptStep')
  // ✅ ИСПОЛЬЗУЕМ НОВУЮ ЦЕНТРАЛИЗОВАННУЮ СИСТЕМУ (БЕЗ ЗАПРОСОВ К БД!)
  const isRu = isRussianFromState(ctx)
  const promptMsg = ctx.message
  console.log(promptMsg, 'promptMsg')

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
        console.error('❌ User ID не найден')
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

        console.log(
          `[neuroPhotoWizardV2] Determined gender for prompt: ${genderPromptPart}`
        )

        const fullPrompt = `Fashionable ${trigger_word} ${genderPromptPart}, ${promptText}, ${detailPrompt}`

        // ✅ CHECK FOR MULTI-IMAGE PROCESSING
        const multiPhotoUrls = ctx.session?.multiPhotoUrls
        const multiPhotoCount = ctx.session?.multiPhotoCount

        if (multiPhotoUrls && multiPhotoCount && multiPhotoCount > 1) {
          console.log('🎨 Processing multi-image neurophoto series')
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
          console.log('🎨 Processing single neurophoto')
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
  console.log('CASE 3: neuroPhotoButtonStep')
  if (ctx.message && 'text' in ctx.message) {
    const text = ctx.message.text
    console.log(`CASE: Нажата кнопка ${text}`)
    // ✅ ИСПОЛЬЗУЕМ НОВУЮ ЦЕНТРАЛИЗОВАННУЮ СИСТЕМУ (БЕЗ ЗАПРОСОВ К БД!)
    const isRu = isRussianFromState(ctx)

    // НОВАЯ ОБРАБОТКА: кнопка "🆕 Новый промпт"
    if (text === '🆕 Новый промпт' || text === '🆕 New prompt') {
      console.log('CASE: Новый промпт - возврат к началу сцены V2')
      // Сбрасываем состояние и возвращаемся к первому шагу
      ctx.session.prompt = undefined
      ctx.wizard.selectStep(0) // Возвращаемся к neuroPhotoConversationStep
      // Явно вызываем первый шаг
      return neuroPhotoConversationStep(ctx)
    }

    // Обработка кнопок "Улучшить промпт" и "Изменить размер"
    if (text === '⬆️ Улучшить промпт' || text === '⬆️ Improve prompt') {
      console.log('CASE: Улучшить промпт')
      await ctx.scene.enter(ModeEnum.ImprovePromptWizard)
      return
    }

    if (text === '📐 Изменить размер' || text === '📐 Change size') {
      console.log('CASE: Изменить размер')
      await ctx.scene.enter(ModeEnum.SizeWizard)
      return
    }

    if (text === levels[104].title_ru || text === levels[104].title_en) {
      console.log('CASE: Главное меню')
      await handleMenu(ctx)
      return
    }

    await handleMenu(ctx)

    // Обработка кнопок с числами
    const numImages = parseInt(text[0])
    const prompt = ctx.session.prompt
    const userId = ctx.from?.id
    const trigger_word = ctx.session.userModel.trigger_word as string

    if (!userId) {
      console.error('❌ User ID не найден')
      return
    }
    if (!ctx.botInfo?.username) {
      console.error('❌ Bot username не найден')
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

    console.log(
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
        console.log(`🎨 Generating ${num} images for each of ${multiPhotoCount} input photos`)
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
        console.log(`🎨 Generating ${num} single neurophoto(s)`)
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
