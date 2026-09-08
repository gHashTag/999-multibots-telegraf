import { MyContext } from '@/interfaces'
import { UserModel } from '../../interfaces'

import { generateNeuroPhotoHybrid } from '@/services/generateNeuroPhotoHybrid'
// ✅ IMPORT MULTI-PHOTO SUPPORT
import { generateNeuroPhotoMulti } from '@/services/generateNeuroPhotoMulti'
import {
  detectMultiPhotoUpload,
  handleMultiPhotoNeurophoto,
  checkMultiPhotoEvents,
} from '@/handlers/multiPhotoHandler'
import {
  getLatestUserModel,
  getReferalsCountAndUserData,
  getUserData,
  supabase,
} from '@/core/supabase'
// ✅ ИМПОРТИРУЕМ НОВУЮ ФУНКЦИЮ ДЛЯ HAIM GROUP MEDIA
import { getLatestUserModelForHaim } from '@/core/supabase/getLatestUserModelForHaim'
import {
  sendGenericErrorMessage,
  sendPhotoDescriptionRequest,
} from '@/navigation'
import {
  getButtonTextsByMode,
  showMainMenu,
  createMainMenuKeyboard,
  handleHelpCancel,
  mainMenu,
} from '@/navigation'
import { Scenes } from 'telegraf'

import { getUserInfo } from '@/handlers/getUserInfo'
import { ModeEnum } from '@/interfaces/modes'
// ✅ ЗАМЕНЯЕМ НА НОВУЮ ЦЕНТРАЛИЗОВАННУЮ СИСТЕМУ
import { isRussianFromState } from '@/helpers/centralizedLanguage'
// ✅ ИМПОРТИРУЕМ getBotNameByToken ДЛЯ ОПРЕДЕЛЕНИЯ ТЕКУЩЕГО БОТА
import { getBotNameByToken } from '@/core/bot'
import { reportDeadEnd } from '@/helpers/error/reportDeadEnd'

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

    // ✅ ОПРЕДЕЛЯЕМ ТЕКУЩИЙ БОТ (используем botInfo.username вместо токена)
    const bot_name =
      ctx.botInfo?.username || getBotNameByToken(ctx.telegram.token).bot_name
    console.log(
      `🤖 Определен бот V2: ${bot_name} для пользователя ${telegramId}`
    )

    // ✅ ПОЛУЧАЕМ ВСЕ МОДЕЛИ ПОЛЬЗОВАТЕЛЯ ДЛЯ ВЫБОРА
    console.log(
      `🔍 [V2] Получаем все модели для бота: ${bot_name}, пользователь: ${telegramId}`
    )

    const { data: allModels, error: allModelsError } = await supabase
      .from('model_trainings')
      // ✅ FIXED: Only select columns that exist in database schema
      .select(
        'id, api, status, result, model_name, model_url, trigger_word, bot_name, created_at, replicate_training_id, steps, gender, zip_url'
      )
      .eq('telegram_id', telegramId)
      // ✅ ИСПРАВЛЕНО: Принимаем разные варианты успешного статуса
      .in('status', ['SUCCESS', 'completed', 'SUCCEEDED', 'succeeded'])
      // A version-less training success is flipped to SUCCESS but leaves
      // model_url null (see #1349); such a row is unusable, so do not offer it
      // for selection (it would feed a null model_url into generation). #1351
      .not('model_url', 'is', null)
      // A version-less training success is flipped to SUCCESS but leaves
      // model_url null (see #1349); such a row is unusable, so do not offer it
      // for selection (it would feed a null model_url into generation). #1351
      .order('created_at', { ascending: false })
      .limit(20)

    // 🔍 ДИАГНОСТИКА: Логируем результаты запроса
    console.log(`🔍 [V2 DEBUG] Результат запроса:`, {
      found: allModels?.length || 0,
      error: allModelsError?.message,
      models: allModels?.map(m => ({
        name: m.model_name,
        status: m.status,
        api: m.api,
        id: m.id,
      })),
    })

    if (allModelsError || !allModels || allModels.length === 0) {
      console.log(`❌ [V2] Модели НЕ НАЙДЕНЫ для пользователя ${telegramId}`)
      if (allModelsError) {
        console.error('❌ [V2] Ошибка запроса:', allModelsError)
      }

      const { subscriptionType } = await getReferalsCountAndUserData(telegramId)

      // «Моделей нет» — не вся правда, если обучение шло и застряло.
      // Подробности — в core/supabase/getStuckTrainings.ts.
      const { getStuckTrainings, stuckTrainingsMessage } = await import(
        '@/core/supabase/getStuckTrainings'
      )
      const stuck = await getStuckTrainings(telegramId)

      await ctx.reply(
        (isRu
          ? `❌ У вас пока нет обученных моделей.\n\n💡 Используйте "🤖 Цифровое тело аватара", чтобы создать свою первую модель!\n\nА пока можете попробовать тестовую модель.`
          : `❌ You don't have any trained models yet.\n\n💡 Use "🤖 Digital avatar body" to create your first model!\n\nMeanwhile, you can try the test model.`) +
          (stuck.length ? '\n\n' + stuckTrainingsMessage(stuck, isRu) : ''),
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

    console.log(`✅ [V2] Найдено ${allModels.length} моделей`)

    // ✅ ЕСЛИ МОДЕЛЬ ОДНА - СРАЗУ ИСПОЛЬЗУЕМ ЕЁ
    if (allModels.length === 1) {
      const model = allModels[0]
      console.log(
        `📍 Только одна модель, используем автоматически: ${model.model_name}`
      )

      ctx.session.userModel = model as UserModel
      await sendPhotoDescriptionRequest(ctx, isRu, ModeEnum.NeuroPhoto)

      const isCancel = await handleHelpCancel(ctx)
      console.log('isCancel', isCancel)
      if (isCancel) {
        return ctx.scene.leave()
      }
      console.log('CASE: neuroPhotoConversation V2 next (single model)')

      return ctx.wizard.next()
    }

    // ✅ ЕСЛИ МОДЕЛЕЙ НЕСКОЛЬКО - ПОКАЗЫВАЕМ ВЫБОР
    console.log(`🎯 Несколько моделей (${allModels.length}), показываем выбор`)

    // Сохраняем список моделей в сессию для обработчика выбора
    ctx.session.availableModels = allModels

    // ✅ Формируем кнопки для выбора модели (по 1 в ряд - чтобы название влезало)
    const { Markup } = require('telegraf')
    const modelButtons = allModels.map(model => {
      const formattedDate = new Date(model.created_at).toLocaleDateString(
        isRu ? 'ru-RU' : 'en-US',
        {
          day: '2-digit',
          month: '2-digit',
        }
      )
      return [
        Markup.button.callback(
          `${model.model_name || 'Модель'} (${formattedDate})`,
          `select_model:${model.id}`
        ),
      ]
    })

    await ctx.reply(
      isRu
        ? `🎨 Выберите модель для генерации:\n\n📋 Всего моделей: ${allModels.length}`
        : `🎨 Choose model for generation:\n\n📋 Total models: ${allModels.length}`,
      Markup.inlineKeyboard(modelButtons)
    )

    console.log('CASE: neuroPhotoConversation V2 waiting for model selection')
    // Не переходим на следующий шаг - ждем выбора модели через action handler
    return
  } catch (error) {
    console.error('Error in neuroPhotoConversationStep V2:', error)
    await sendGenericErrorMessage(ctx, isRu)
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

      // V1 guards this; the V2 rewrite dropped the check and dereferences
      // userModel straight away, which throws and kills the step when no trained
      // model is in the session (#1027 class). Guard it like V1 does.
      if (!ctx.session.userModel || !ctx.session.userModel.trigger_word) {
        // The prompt was just written into the session and dies with the scene.
        // This guard replaced a throw (#1027 class); the throw at least reached
        // bot.catch, so without a report the fix removed the owner's only signal.
        await reportDeadEnd(ctx, 'neuroPhotoWizardV2 prompt step', [
          'userModel.trigger_word',
        ])
        await ctx.reply(
          isRu
            ? '❌ Модель не выбрана. Пожалуйста, начните заново.'
            : '❌ Model not selected. Please start over.'
        )
        return ctx.scene.leave()
      }

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

        // In-flight guard: the paid generation below is awaited BEFORE
        // ctx.wizard.next(), so without this a second prompt during the
        // ~10-30s generation re-enters this step and double-charges. Mirror of
        // the V1 sibling. Reject-before-set (sync), release in finally. #1342
        if (ctx.session.neuroPhotoInProgress) {
          await ctx.reply(
            isRu
              ? '⏳ Уже генерирую, подождите...'
              : '⏳ Already generating, please wait...'
          )
          return
        }
        ctx.session.neuroPhotoInProgress = true
        try {
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
              ctx.botInfo?.username || 'neuro_blogger_bot', // ✅ Use botInfo username
              null, // aspect ratio
              ctx.session.userModel // ✅ Pass full model object for FAL support
            )
          }

          ctx.wizard.next()
          return
        } finally {
          ctx.session.neuroPhotoInProgress = false
        }
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

    const mainMenuTexts = getButtonTextsByMode('main_menu')
    if (text === mainMenuTexts?.ru || text === mainMenuTexts?.en) {
      console.log('CASE: Главное меню')
      return
    }

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
        console.log(
          `🎨 Generating ${num} images for each of ${multiPhotoCount} input photos`
        )
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
          ctx.botInfo?.username || 'neuro_blogger_bot', // ✅ Use botInfo username
          null, // aspect ratio
          ctx.session.userModel // ✅ Pass full model object for FAL support
        )
      }
    }

    if (numImages >= 1 && numImages <= 4) {
      // In-flight guard: mirror of the V1 sibling; prevents a second number
      // tap during the paid generation from double-charging. #1342
      if (ctx.session.neuroPhotoInProgress) {
        await ctx.reply(
          isRu
            ? '⏳ Уже генерирую, подождите...'
            : '⏳ Already generating, please wait...'
        )
        return
      }
      ctx.session.neuroPhotoInProgress = true
      try {
        await generate(numImages)
        return ctx.scene.leave()
      } finally {
        ctx.session.neuroPhotoInProgress = false
      }
    } else {
      await showMainMenu(ctx)
    }
  }
}

// ✅ ЗАМЕНЯЕМ СТАРЫЙ neuroPhotoWizard - теперь V2 является основной версией
export const neuroPhotoWizardV2 = new Scenes.WizardScene<MyContext>(
  'neuro_photo', // Используем старый ID для совместимости
  neuroPhotoConversationStep,
  neuroPhotoPromptStep,
  neuroPhotoButtonStep
)

// ✅ Action handler для выбора модели из списка
neuroPhotoWizardV2.action(/^select_model:(.+)$/, async ctx => {
  await ctx.answerCbQuery() // FIRST LINE!

  const isRu = isRussianFromState(ctx)
  const modelId = ctx.match[1]

  console.log(`✅ [Model Selection] User selected model ID: ${modelId}`)

  // Находим выбранную модель из сохраненного списка
  const availableModels = ctx.session.availableModels
  if (!availableModels || availableModels.length === 0) {
    await reportDeadEnd(ctx, 'neuroPhotoWizardV2 model selection', [
      'availableModels',
    ])
    await ctx.reply(
      isRu
        ? '❌ Ошибка: список моделей не найден. Попробуйте начать заново.'
        : '❌ Error: models list not found. Please start over.'
    )
    return ctx.scene.leave()
  }

  const selectedModel = availableModels.find(
    (m: any) => m.id.toString() === modelId
  )
  if (!selectedModel) {
    // The bot rendered this keyboard itself, so a miss means the list and
    // the buttons disagree -- worth knowing about, not just apologising for.
    await reportDeadEnd(ctx, 'neuroPhotoWizardV2 model lookup', [
      'the selected id is not in availableModels',
    ])
    await ctx.reply(
      isRu
        ? '❌ Ошибка: модель не найдена. Попробуйте выбрать другую.'
        : '❌ Error: model not found. Please choose another one.'
    )
    return
  }

  console.log(
    `✅ [Model Selection] Selected model: ${selectedModel.model_name}`
  )

  // Сохраняем выбранную модель в сессию
  ctx.session.userModel = selectedModel as UserModel

  // Очищаем временный список
  ctx.session.availableModels = undefined

  // Отправляем запрос на описание фото
  await sendPhotoDescriptionRequest(ctx, isRu, ModeEnum.NeuroPhoto)

  const isCancel = await handleHelpCancel(ctx)
  if (isCancel) {
    return ctx.scene.leave()
  }

  // Переходим на следующий шаг (ввод промпта)
  return ctx.wizard.next()
})
