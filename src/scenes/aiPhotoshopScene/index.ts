import { Scenes, Markup } from 'telegraf'
import { MyContext } from '../../interfaces'
import { isRussianFromState } from '@/helpers/centralizedLanguage'
import { logger } from '../../utils/logger'
import { generateSeeDream4 } from '@/services/generateSeeDream4'
import { generateNanoBanana } from '@/services/generateNanoBanana'
import { generateFluxKontextMax } from '@/services/generateFluxKontextMax'

// 🎨 AI PHOTOSHOP MODELS CONFIGURATION
const AI_PHOTOSHOP_MODELS = {
  seedream: {
    title_ru: '🎭 SeeDream-4',
    title_en: '🎭 SeeDream-4',
    description_ru: 'ByteDance SeeDream-4 - Продвинутая генерация и трансформация изображений',
    description_en: 'ByteDance SeeDream-4 - Advanced image generation and transformation',
    cost: 15, // stars
    key: 'seedream',
    supports_image_input: true,
    supports_text_only: true
  },
  nano_banana: {
    title_ru: '🍌 Nano Banana',
    title_en: '🍌 Nano Banana',
    description_ru: 'Google Nano Banana - ИИ редактирование на базе Gemini 2.5',
    description_en: 'Google Nano Banana - AI editing powered by Gemini 2.5',
    cost: 12, // stars
    key: 'nano_banana',
    supports_image_input: true,
    supports_text_only: false
  },
  flux_max: {
    title_ru: '🚀 FLUX Kontext Max',
    title_en: '🚀 FLUX Kontext Max',
    description_ru: 'Black Forest Labs FLUX Kontext Max - Профессиональное редактирование',
    description_en: 'Black Forest Labs FLUX Kontext Max - Professional editing',
    cost: 8, // stars
    key: 'flux_max',
    supports_image_input: true,
    supports_text_only: false
  }
}

// 🎨 PROMPT TEMPLATES FOR DIFFERENT STYLES
const AI_PHOTOSHOP_STYLES = {
  portrait: {
    title_ru: '👤 Портрет',
    title_en: '👤 Portrait',
    template: 'professional portrait, high quality, studio lighting, detailed face'
  },
  artistic: {
    title_ru: '🎨 Художественный',
    title_en: '🎨 Artistic',
    template: 'artistic style, creative composition, vibrant colors, detailed artwork'
  },
  photorealistic: {
    title_ru: '📸 Фотореализм',
    title_en: '📸 Photorealistic',
    template: 'photorealistic, ultra detailed, high resolution, professional photography'
  },
  fantasy: {
    title_ru: '🧙‍♂️ Фэнтези',
    title_en: '🧙‍♂️ Fantasy',
    template: 'fantasy style, magical atmosphere, mystical elements, epic composition'
  },
  cyberpunk: {
    title_ru: '🤖 Киберпанк',
    title_en: '🤖 Cyberpunk',
    template: 'cyberpunk style, neon lights, futuristic, technological atmosphere'
  },
  vintage: {
    title_ru: '📻 Винтаж',
    title_en: '📻 Vintage',
    template: 'vintage style, retro aesthetic, classic composition, nostalgic mood'
  }
}

// Create the scene
export const aiPhotoshopScene = new Scenes.BaseScene<MyContext>('ai_photoshop_scene')

// Function to create model selection keyboard
const createModelSelectionKeyboard = (isRu: boolean) => {
  const keyboard = []

  // Add models 2 per row
  const models = Object.entries(AI_PHOTOSHOP_MODELS)
  for (let i = 0; i < models.length; i += 2) {
    const row = []
    const [modelKey1, model1] = models[i]
    row.push(
      Markup.button.callback(
        `${isRu ? model1.title_ru : model1.title_en} (${model1.cost}⭐)`,
        `ai_photoshop_model_${modelKey1}`
      )
    )

    if (i + 1 < models.length) {
      const [modelKey2, model2] = models[i + 1]
      row.push(
        Markup.button.callback(
          `${isRu ? model2.title_ru : model2.title_en} (${model2.cost}⭐)`,
          `ai_photoshop_model_${modelKey2}`
        )
      )
    }

    keyboard.push(row)
  }

  // Add cancel button
  keyboard.push([
    Markup.button.callback(isRu ? 'Отмена' : 'Cancel', 'ai_photoshop_cancel')
  ])

  return Markup.inlineKeyboard(keyboard)
}

// Function to create style selection keyboard
const createStyleSelectionKeyboard = (isRu: boolean) => {
  const keyboard = []

  // Add styles 2 per row
  const styles = Object.entries(AI_PHOTOSHOP_STYLES)
  for (let i = 0; i < styles.length; i += 2) {
    const row = []
    const [styleKey1, style1] = styles[i]
    row.push(
      Markup.button.callback(
        isRu ? style1.title_ru : style1.title_en,
        `ai_photoshop_style_${styleKey1}`
      )
    )

    if (i + 1 < styles.length) {
      const [styleKey2, style2] = styles[i + 1]
      row.push(
        Markup.button.callback(
          isRu ? style2.title_ru : style2.title_en,
          `ai_photoshop_style_${styleKey2}`
        )
      )
    }

    keyboard.push(row)
  }

  // Add custom prompt and cancel buttons
  keyboard.push([
    Markup.button.callback(
      isRu ? '✍️ Свой промпт' : '✍️ Custom Prompt',
      'ai_photoshop_custom_prompt'
    )
  ])

  keyboard.push([
    Markup.button.callback(isRu ? 'Назад' : 'Back', 'ai_photoshop_back_to_models'),
    Markup.button.callback(isRu ? 'Отмена' : 'Cancel', 'ai_photoshop_cancel')
  ])

  return Markup.inlineKeyboard(keyboard)
}

// Scene entry
aiPhotoshopScene.enter(async ctx => {
  try {
    const isRu = isRussianFromState(ctx)

    if (!ctx.from?.id) {
      await ctx.reply(
        isRu
          ? '❌ Ошибка получения ID пользователя'
          : '❌ Error getting user ID'
      )
      await ctx.scene.leave()
      return
    }

    // Reset session state
    if (ctx.session) {
      ctx.session.aiPhotoshopModel = undefined
      ctx.session.aiPhotoshopStyle = undefined
      ctx.session.aiPhotoshopImage = undefined
      ctx.session.aiPhotoshopPrompt = undefined
      ctx.session.awaitingAiPhotoshopImage = false
      ctx.session.awaitingAiPhotoshopPrompt = false
      ctx.session.aiPhotoshopStep = 'model_select'
    }

    const title = isRu
      ? '🎨 *ИИ Фотошоп* - Продвинутая обработка изображений'
      : '🎨 *AI Photoshop* - Advanced Image Processing'

    const description = isRu
      ? `Выберите модель ИИ для обработки:

🎭 *SeeDream-4* - Генерация и трансформация изображений (15⭐)
🍌 *Nano Banana* - ИИ редактирование на базе Gemini 2.5 (12⭐)
🚀 *FLUX Kontext Max* - Профессиональное редактирование (8⭐)

💡 *Каждая модель имеет уникальные возможности для создания потрясающих результатов*`
      : `Choose an AI model for processing:

🎭 *SeeDream-4* - Image generation and transformation (15⭐)
🍌 *Nano Banana* - AI editing powered by Gemini 2.5 (12⭐)
🚀 *FLUX Kontext Max* - Professional editing (8⭐)

💡 *Each model has unique capabilities for creating amazing results*`

    await ctx.reply(title + '\n\n' + description, {
      parse_mode: 'Markdown',
      reply_markup: createModelSelectionKeyboard(isRu).reply_markup,
    })
  } catch (error) {
    logger.error('Error in AI Photoshop scene enter', {
      error: error instanceof Error ? error.message : 'Unknown error',
      telegramId: ctx.from?.id,
    })
    await ctx.scene.leave()
  }
})

// Handle model selection
Object.keys(AI_PHOTOSHOP_MODELS).forEach(modelKey => {
  aiPhotoshopScene.action(`ai_photoshop_model_${modelKey}`, async ctx => {
    try {
      await ctx.answerCbQuery()
      const isRu = isRussianFromState(ctx)

      if (ctx.session) {
        ctx.session.aiPhotoshopModel = modelKey as any
        ctx.session.aiPhotoshopStep = 'style_select'
      }

      const model = AI_PHOTOSHOP_MODELS[modelKey as keyof typeof AI_PHOTOSHOP_MODELS]
      const modelTitle = isRu ? model.title_ru : model.title_en
      const modelDescription = isRu ? model.description_ru : model.description_en

      await ctx.editMessageText(
        isRu
          ? `✅ *Выбрана модель:* ${modelTitle}\n\n${modelDescription}\n\n🎨 *Выберите стиль обработки:*`
          : `✅ *Selected model:* ${modelTitle}\n\n${modelDescription}\n\n🎨 *Choose processing style:*`,
        {
          parse_mode: 'Markdown',
          reply_markup: createStyleSelectionKeyboard(isRu).reply_markup,
        }
      )
    } catch (error) {
      logger.error('Error handling AI Photoshop model selection', {
        error: error instanceof Error ? error.message : 'Unknown error',
        telegramId: ctx.from?.id,
        model: modelKey,
      })
    }
  })
})

// Handle style selection
Object.keys(AI_PHOTOSHOP_STYLES).forEach(styleKey => {
  aiPhotoshopScene.action(`ai_photoshop_style_${styleKey}`, async ctx => {
    try {
      await ctx.answerCbQuery()
      const isRu = isRussianFromState(ctx)

      if (ctx.session) {
        ctx.session.aiPhotoshopStyle = styleKey as any
        ctx.session.aiPhotoshopStep = 'image_upload'
        ctx.session.awaitingAiPhotoshopImage = true
      }

      const style = AI_PHOTOSHOP_STYLES[styleKey as keyof typeof AI_PHOTOSHOP_STYLES]
      const styleTitle = isRu ? style.title_ru : style.title_en
      const model = AI_PHOTOSHOP_MODELS[ctx.session?.aiPhotoshopModel as keyof typeof AI_PHOTOSHOP_MODELS]

      await ctx.editMessageText(
        isRu
          ? `✅ *Модель:* ${isRu ? model?.title_ru : model?.title_en}\n🎨 *Стиль:* ${styleTitle}\n\n📷 Отправьте изображение для обработки:`
          : `✅ *Model:* ${isRu ? model?.title_ru : model?.title_en}\n🎨 *Style:* ${styleTitle}\n\n📷 Send an image for processing:`,
        {
          parse_mode: 'Markdown',
          reply_markup: Markup.inlineKeyboard([
            [
              Markup.button.callback(
                isRu ? 'Назад' : 'Back',
                'ai_photoshop_back_to_styles'
              ),
              Markup.button.callback(
                isRu ? 'Отмена' : 'Cancel',
                'ai_photoshop_cancel'
              ),
            ],
          ]).reply_markup,
        }
      )
    } catch (error) {
      logger.error('Error handling style selection', {
        error: error instanceof Error ? error.message : 'Unknown error',
        telegramId: ctx.from?.id,
        style: styleKey,
      })
    }
  })
})

// Handle custom prompt selection
aiPhotoshopScene.action('ai_photoshop_custom_prompt', async ctx => {
  try {
    await ctx.answerCbQuery()
    const isRu = isRussianFromState(ctx)

    if (ctx.session) {
      ctx.session.aiPhotoshopStyle = 'custom'
      ctx.session.aiPhotoshopStep = 'custom_prompt'
      ctx.session.awaitingAiPhotoshopPrompt = true
    }

    const model = AI_PHOTOSHOP_MODELS[ctx.session?.aiPhotoshopModel as keyof typeof AI_PHOTOSHOP_MODELS]

    await ctx.editMessageText(
      isRu
        ? `✅ *Модель:* ${isRu ? model?.title_ru : model?.title_en}\n✍️ *Стиль:* Пользовательский\n\n📝 Опишите, как обработать изображение:\n\n💡 *Для лучших результатов пишите на английском языке*`
        : `✅ *Model:* ${isRu ? model?.title_ru : model?.title_en}\n✍️ *Style:* Custom\n\n📝 Describe how to process the image:\n\n💡 *For best results, write in English*`,
      {
        parse_mode: 'Markdown',
        reply_markup: Markup.inlineKeyboard([
          [
            Markup.button.callback(
              isRu ? 'Назад' : 'Back',
              'ai_photoshop_back_to_styles'
            ),
            Markup.button.callback(
              isRu ? 'Отмена' : 'Cancel',
              'ai_photoshop_cancel'
            ),
          ],
        ]).reply_markup,
      }
    )
  } catch (error) {
    logger.error('Error handling custom prompt selection', {
      error: error instanceof Error ? error.message : 'Unknown error',
      telegramId: ctx.from?.id,
    })
  }
})

// Handle photo upload
aiPhotoshopScene.on('photo', async ctx => {
  try {
    const isRu = isRussianFromState(ctx)

    logger.info('🎨 AI Photoshop: Photo received', {
      telegramId: ctx.from?.id,
      awaitingImage: ctx.session?.awaitingAiPhotoshopImage,
      step: ctx.session?.aiPhotoshopStep,
      model: ctx.session?.aiPhotoshopModel,
    })

    if (!ctx.session?.awaitingAiPhotoshopImage) {
      await ctx.reply(
        isRu
          ? '❌ Сначала выберите модель и стиль обработки.'
          : '❌ Please select a model and processing style first.'
      )
      return
    }

    const photo = ctx.message.photo?.pop()
    if (!photo) {
      await ctx.reply(
        isRu ? '❌ Не удалось получить изображение.' : '❌ Failed to get image.'
      )
      return
    }

    const fileLink = await ctx.telegram.getFileLink(photo.file_id)

    if (ctx.session) {
      ctx.session.aiPhotoshopImage = fileLink.href
      ctx.session.awaitingAiPhotoshopImage = false
    }

    // If style is custom, we need to wait for the prompt
    if (ctx.session?.aiPhotoshopStyle === 'custom') {
      if (ctx.session) {
        ctx.session.aiPhotoshopStep = 'custom_prompt'
        ctx.session.awaitingAiPhotoshopPrompt = true
      }

      await ctx.reply(
        isRu
          ? '✅ Изображение получено!\n\n📝 Теперь опишите, как его обработать:'
          : '✅ Image received!\n\n📝 Now describe how to process it:',
        {
          reply_markup: Markup.inlineKeyboard([
            [
              Markup.button.callback(
                isRu ? 'Отмена' : 'Cancel',
                'ai_photoshop_cancel'
              ),
            ],
          ]).reply_markup,
        }
      )
    } else {
      // Process with predefined style
      await processAiPhotoshopRequest(ctx)
    }
  } catch (error) {
    logger.error('Error handling AI Photoshop image', {
      error: error instanceof Error ? error.message : 'Unknown error',
      telegramId: ctx.from?.id,
    })
  }
})

// Handle text messages (custom prompts)
aiPhotoshopScene.on('text', async ctx => {
  try {
    const isRu = isRussianFromState(ctx)
    const messageText = ctx.message.text

    // Skip commands
    if (messageText.startsWith('/')) {
      return
    }

    // Handle menu button click
    if (messageText === '🎨 ИИ Фотошоп' || messageText === '🎨 AI Photoshop') {
      await ctx.scene.reenter()
      return
    }

    if (!ctx.session?.awaitingAiPhotoshopPrompt) {
      await ctx.reply(
        isRu
          ? '❌ Сначала выберите модель и загрузите изображение.'
          : '❌ Please select a model and upload an image first.'
      )
      return
    }

    const prompt = ctx.message.text

    if (!prompt) {
      await ctx.reply(isRu ? '❌ Пустой промпт.' : '❌ Empty prompt.')
      return
    }

    if (ctx.session) {
      ctx.session.aiPhotoshopPrompt = prompt
      ctx.session.awaitingAiPhotoshopPrompt = false
      ctx.session.aiPhotoshopStep = 'processing'
    }

    await ctx.reply(
      isRu
        ? '✅ Промпт получен! Начинаю обработку изображения...'
        : '✅ Prompt received! Starting image processing...',
      {
        reply_markup: {
          remove_keyboard: true,
        },
      }
    )

    await processAiPhotoshopRequest(ctx, prompt)
  } catch (error) {
    logger.error('Error handling AI Photoshop prompt', {
      error: error instanceof Error ? error.message : 'Unknown error',
      telegramId: ctx.from?.id,
    })
  }
})

// Function to process AI Photoshop request
const processAiPhotoshopRequest = async (ctx: MyContext, customPrompt?: string) => {
  const isRu = isRussianFromState(ctx)

  // Get data from session
  const {
    aiPhotoshopModel,
    aiPhotoshopStyle,
    aiPhotoshopImage,
  } = ctx.session || {}

  // Validate data
  if (!aiPhotoshopModel || !aiPhotoshopImage || !ctx.from?.id) {
    logger.error('Missing required data for AI Photoshop processing', {
      telegramId: ctx.from?.id,
      model: aiPhotoshopModel,
      hasImage: !!aiPhotoshopImage,
    })

    await ctx.reply(
      isRu
        ? '❌ Ошибка: недостаточно данных для обработки.'
        : '❌ Error: insufficient data for processing.'
    )
    return
  }

  logger.info('Processing AI Photoshop request', {
    telegramId: ctx.from?.id,
    model: aiPhotoshopModel,
    style: aiPhotoshopStyle,
    hasImage: !!aiPhotoshopImage,
    hasCustomPrompt: !!customPrompt,
  })

  try {
    // Build prompt
    let finalPrompt = ''

    if (customPrompt) {
      finalPrompt = customPrompt
    } else if (aiPhotoshopStyle && aiPhotoshopStyle !== 'custom') {
      const style = AI_PHOTOSHOP_STYLES[aiPhotoshopStyle as keyof typeof AI_PHOTOSHOP_STYLES]
      finalPrompt = style?.template || 'enhance this image'
    } else {
      finalPrompt = 'enhance this image'
    }

    logger.info('AI Photoshop enhanced prompt generated', {
      telegramId: ctx.from.id,
      model: aiPhotoshopModel,
      style: aiPhotoshopStyle,
      finalPrompt: finalPrompt.substring(0, 100) + '...',
    })

    // Call appropriate service based on selected model
    let result: any = null

    switch (aiPhotoshopModel) {
      case 'seedream':
        result = await generateSeeDream4({
          prompt: finalPrompt,
          inputImageUrl: aiPhotoshopImage,
          telegram_id: ctx.from.id.toString(),
          username: ctx.from.username || 'unknown',
          is_ru: isRu,
          ctx,
          size: '2K',
          max_images: 1,
          aspect_ratio: '9:16'
        })
        break

      case 'nano_banana':
        result = await generateNanoBanana({
          telegram_id: ctx.from.id.toString(),
          promptText: finalPrompt,
          inputImageUrl: aiPhotoshopImage,
          ctx,
          username: ctx.from.username || 'unknown',
          is_ru: isRu,
          promptStyle: 'artistic'
        })
        break

      case 'flux_max':
        result = await generateFluxKontextMax({
          prompt: finalPrompt,
          inputImageUrl: aiPhotoshopImage,
          telegram_id: ctx.from.id.toString(),
          username: ctx.from.username || 'unknown',
          is_ru: isRu,
          ctx,
          aspect_ratio: 'match_input_image',
          output_format: 'png',
          safety_tolerance: 2
        })
        break

      default:
        throw new Error(`Unknown model: ${aiPhotoshopModel}`)
    }

    logger.info('AI Photoshop processing completed successfully', {
      telegramId: ctx.from.id,
      model: aiPhotoshopModel,
      hasResult: !!result,
    })

    // Clear session after successful processing
    if (ctx.session) {
      ctx.session.aiPhotoshopModel = undefined
      ctx.session.aiPhotoshopStyle = undefined
      ctx.session.aiPhotoshopImage = undefined
      ctx.session.aiPhotoshopPrompt = undefined
      ctx.session.aiPhotoshopStep = undefined
    }

    // Exit scene after successful processing
    logger.info('🎨 AI Photoshop: Leaving scene after successful processing', {
      telegramId: ctx.from.id,
    })
    await ctx.scene.leave()
  } catch (error) {
    logger.error('Error in AI Photoshop processing', {
      error: error instanceof Error ? error.message : 'Unknown error',
      telegramId: ctx.from?.id,
      model: aiPhotoshopModel,
    })

    // Clear session on error
    if (ctx.session) {
      ctx.session.aiPhotoshopModel = undefined
      ctx.session.aiPhotoshopStyle = undefined
      ctx.session.aiPhotoshopImage = undefined
      ctx.session.aiPhotoshopPrompt = undefined
      ctx.session.aiPhotoshopStep = undefined
    }

    // Exit scene on error
    logger.info('🎨 AI Photoshop: Leaving scene after error', {
      telegramId: ctx.from?.id,
    })
    await ctx.scene.leave()
  }
}

// Navigation buttons
aiPhotoshopScene.action('ai_photoshop_back_to_models', async ctx => {
  try {
    await ctx.answerCbQuery()
    const isRu = isRussianFromState(ctx)

    if (ctx.session) {
      ctx.session.aiPhotoshopModel = undefined
      ctx.session.aiPhotoshopStyle = undefined
    }

    const title = isRu
      ? '🎨 *ИИ Фотошоп* - Продвинутая обработка изображений'
      : '🎨 *AI Photoshop* - Advanced Image Processing'

    const description = isRu
      ? `Выберите модель ИИ для обработки:

🎭 *SeeDream-4* - Генерация и трансформация изображений (15⭐)
🍌 *Nano Banana* - ИИ редактирование на базе Gemini 2.5 (12⭐)
🚀 *FLUX Kontext Max* - Профессиональное редактирование (8⭐)`
      : `Choose an AI model for processing:

🎭 *SeeDream-4* - Image generation and transformation (15⭐)
🍌 *Nano Banana* - AI editing powered by Gemini 2.5 (12⭐)
🚀 *FLUX Kontext Max* - Professional editing (8⭐)`

    await ctx.editMessageText(title + '\n\n' + description, {
      parse_mode: 'Markdown',
      reply_markup: createModelSelectionKeyboard(isRu).reply_markup,
    })
  } catch (error) {
    logger.error('Error returning to models', {
      error: error instanceof Error ? error.message : 'Unknown error',
      telegramId: ctx.from?.id,
    })
  }
})

aiPhotoshopScene.action('ai_photoshop_back_to_styles', async ctx => {
  try {
    await ctx.answerCbQuery()
    const isRu = isRussianFromState(ctx)

    if (ctx.session) {
      ctx.session.aiPhotoshopStyle = undefined
      ctx.session.aiPhotoshopImage = undefined
      ctx.session.awaitingAiPhotoshopImage = false
      ctx.session.awaitingAiPhotoshopPrompt = false
    }

    const model = AI_PHOTOSHOP_MODELS[ctx.session?.aiPhotoshopModel as keyof typeof AI_PHOTOSHOP_MODELS]

    await ctx.editMessageText(
      isRu
        ? `✅ *Выбрана модель:* ${isRu ? model?.title_ru : model?.title_en}\n\n🎨 *Выберите стиль обработки:*`
        : `✅ *Selected model:* ${isRu ? model?.title_ru : model?.title_en}\n\n🎨 *Choose processing style:*`,
      {
        parse_mode: 'Markdown',
        reply_markup: createStyleSelectionKeyboard(isRu).reply_markup,
      }
    )
  } catch (error) {
    logger.error('Error returning to styles', {
      error: error instanceof Error ? error.message : 'Unknown error',
      telegramId: ctx.from?.id,
    })
  }
})

// Cancel button
aiPhotoshopScene.action('ai_photoshop_cancel', async ctx => {
  try {
    await ctx.answerCbQuery()
    const isRu = isRussianFromState(ctx)

    await ctx.reply(
      isRu
        ? '❌ Процесс отменён. Возвращаюсь в главное меню.'
        : '❌ Process cancelled. Returning to main menu.',
      {
        reply_markup: {
          remove_keyboard: true,
        },
      }
    )

    await ctx.scene.leave()
    await ctx.scene.enter('main_menu')
  } catch (error) {
    logger.error('Error handling AI Photoshop cancel', {
      error: error instanceof Error ? error.message : 'Unknown error',
      telegramId: ctx.from?.id,
    })
  }
})