import { MyContext } from '@/interfaces'
import { UserModel } from '../../interfaces'

import { generateNeuroPhotoHybrid } from '@/services/generateNeuroPhotoHybrid'
import {
  getLatestUserModel,
  getReferalsCountAndUserData,
  getUserData,
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
// ✅ ЗАМЕНЯЕМ НА НОВУЮ ЦЕНТРАЛИЗОВАННУЮ СИСТЕМУ
import { isRussianFromState } from '@/helpers/centralizedLanguage'

const neuroPhotoConversationStep = async (ctx: MyContext) => {
  // ✅ ИСПОЛЬЗУЕМ НОВУЮ ЦЕНТРАЛИЗОВАННУЮ СИСТЕМУ (БЕЗ ЗАПРОСОВ К БД!)
  const isRu = isRussianFromState(ctx)
  try {
    console.log('CASE 1: neuroPhotoConversationV2')

    const { telegramId } = await getUserInfo(ctx)
    const userModel = await getLatestUserModel(Number(telegramId), 'bfl')
    console.log('userModel', userModel)

    const { subscriptionType } = await getReferalsCountAndUserData(telegramId)

    if (!userModel || !userModel.finetune_id) {
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

    ctx.session.userModel = userModel as UserModel

    await sendPhotoDescriptionRequest(ctx, isRu, ModeEnum.NeuroPhoto)
    const isCancel = await handleHelpCancel(ctx)
    console.log('isCancel', isCancel)
    if (isCancel) {
      return ctx.scene.leave()
    }
    console.log('CASE: neuroPhotoConversation next')

    return ctx.wizard.next()
  } catch (error) {
    console.error('Error in neuroPhotoConversationStep:', error)
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

        await generateNeuroPhotoHybrid(
          fullPrompt,
          ctx.session.userModel.model_url as any,
          1,
          userId.toString(),
          ctx,
          ctx.botInfo?.username
        )

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
      await generateNeuroPhotoHybrid(
        fullPrompt,
        ctx.session.userModel.model_url as any,
        num,
        userId.toString(),
        ctx,
        ctx.botInfo?.username
      )
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

export const neuroPhotoWizardV2 = new WizardScene<MyContext>(
  'neuro_photo_v2',
  neuroPhotoConversationStep,
  neuroPhotoPromptStep,
  neuroPhotoButtonStep
)
