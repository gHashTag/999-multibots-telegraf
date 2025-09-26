import { Scenes, Markup } from 'telegraf'
import { MyContext } from '../../interfaces'
import { isRussianFromState } from '@/helpers/centralizedLanguage'
import { logger } from '../../utils/logger'

// Log when this module loads
logger.info('🚨 AI Photoshop: Scene module loading...');
import { generateSeeDream4 } from '@/services/generateSeeDream4'
import { generateNanoBanana } from '@/services/generateNanoBanana'
import { generateFluxKontextMax } from '@/services/generateFluxKontextMax'
// ✅ IMPORT MULTI-PHOTO SUPPORT FOR AI PHOTOSHOP
import { detectMultiPhotoUpload, handleMultiPhotoNeurophoto, checkMultiPhotoEvents } from '@/handlers/multiPhotoHandler'
import { getBotToken } from '@/handlers/getBotToken'

// 🎨 AI PHOTOSHOP MODELS CONFIGURATION WITH MULTI-IMAGE SUPPORT
const AI_PHOTOSHOP_MODELS = {
  seedream: {
    title_ru: '🎭 SeeDream-4',
    title_en: '🎭 SeeDream-4',
    description_ru: 'ByteDance SeeDream-4 - Продвинутая генерация и трансформация изображений',
    description_en: 'ByteDance SeeDream-4 - Advanced image generation and transformation',
    cost: 15, // stars
    key: 'seedream',
    supports_image_input: true,
    supports_text_only: true,
    supports_multi_image: true, // ✅ NEW: Multi-image support
    max_images: 5
  },
  nano_banana: {
    title_ru: '🍌 Nano Banana',
    title_en: '🍌 Nano Banana',
    description_ru: 'Google Nano Banana - ИИ редактирование на базе Gemini 2.5',
    description_en: 'Google Nano Banana - AI editing powered by Gemini 2.5',
    cost: 12, // stars
    key: 'nano_banana',
    supports_image_input: true,
    supports_text_only: false,
    supports_multi_image: true, // ✅ NEW: Multi-image support
    max_images: 3
  },
  flux_max: {
    title_ru: '🚀 FLUX Kontext Max',
    title_en: '🚀 FLUX Kontext Max',
    description_ru: 'Black Forest Labs FLUX Kontext Max - Профессиональное редактирование',
    description_en: 'Black Forest Labs FLUX Kontext Max - Professional editing',
    cost: 5, // stars - matching production generateFluxKontextMax.ts (0.03 USD)
    key: 'flux_max',
    supports_image_input: true,
    supports_text_only: false,
    supports_multi_image: true, // ✅ NEW: Multi-image support
    max_images: 10
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
  },
  figure_3d: {
    title_ru: '🖨️ 3D Фигурка',
    title_en: '🖨️ 3D Figure',
    template: 'turn this photo into a character figure. Behind it, place a box with the character\'s image printed on it, and a computer showing the Blender modeling process on its screen. In front of the box, add a round plastic base with the character figure standing on it. set the scene indoors if possible'
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
    logger.info('🚨 AI Photoshop: Entering scene', {
      telegramId: ctx.from?.id,
      sessionExists: !!ctx.session
    })

    const isRu = isRussianFromState(ctx)

    // ✅ CHECK FOR PENDING MULTI-PHOTO EVENTS IN AI PHOTOSHOP
    const hasMultiPhotoEvent = await checkMultiPhotoEvents(ctx)
    if (hasMultiPhotoEvent) {
      logger.info('✅ AI Photoshop: Multi-photo event detected and handled')
      return
    }

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

🎭 *SeeDream-4* - Генерация и трансформация изображений (15⭐, до 5 фото)
🍌 *Nano Banana* - ИИ редактирование на базе Gemini 2.5 (12⭐, до 3 фото)
🚀 *FLUX Kontext Max* - Профессиональное редактирование (5⭐, до 10 фото)

📸 *Или сразу отправьте фото/альбом для быстрой обработки через SeeDream-4*
💡 *Каждая модель поддерживает несколько фотографий одновременно!*
✨ *Загружайте альбомы для пакетной обработки*`
      : `Choose an AI model for processing:

🎭 *SeeDream-4* - Image generation and transformation (15⭐, up to 5 photos)
🍌 *Nano Banana* - AI editing powered by Gemini 2.5 (12⭐, up to 3 photos)
🚀 *FLUX Kontext Max* - Professional editing (5⭐, up to 10 photos)

📸 *Or send photos/album directly for quick processing with SeeDream-4*
💡 *Each model supports multiple photos simultaneously!*
✨ *Upload albums for batch processing*`

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
    logger.info('🚨 AI Photoshop: Custom prompt button clicked!', {
      telegramId: ctx.from?.id,
      callbackData: (ctx.callbackQuery as any)?.data
    })

    await ctx.answerCbQuery()
    const isRu = isRussianFromState(ctx)

    if (ctx.session) {
      ctx.session.aiPhotoshopStyle = 'custom'
      ctx.session.aiPhotoshopStep = 'custom_prompt'
      ctx.session.awaitingAiPhotoshopImage = false
      ctx.session.awaitingAiPhotoshopPrompt = true
    }

    logger.info('🎨 AI Photoshop: Custom prompt selected, requesting prompt first', {
      telegramId: ctx.from?.id,
      newState: {
        aiPhotoshopStyle: 'custom',
        aiPhotoshopStep: 'custom_prompt',
        awaitingAiPhotoshopImage: false,
        awaitingAiPhotoshopPrompt: true
      }
    })

    const model = AI_PHOTOSHOP_MODELS[ctx.session?.aiPhotoshopModel as keyof typeof AI_PHOTOSHOP_MODELS]

    await ctx.editMessageText(
      isRu
        ? `✅ *Модель:* ${isRu ? model?.title_ru : model?.title_en}\n✍️ *Стиль:* Пользовательский промпт\n\n💬 Опишите, как обработать изображение:\n\n💡 *После ввода промпта вы отправите фото для обработки*`
        : `✅ *Model:* ${isRu ? model?.title_ru : model?.title_en}\n✍️ *Style:* Custom prompt\n\n💬 Describe how to process the image:\n\n💡 *After entering the prompt, you'll send the photo for processing*`,
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

// Handle photo upload with multi-photo support
aiPhotoshopScene.on('photo', async ctx => {
  try {
    const isRu = isRussianFromState(ctx)

    // ✅ CHECK FOR MULTI-PHOTO EVENTS FIRST
    const hasMultiPhotoEvent = await checkMultiPhotoEvents(ctx)
    if (hasMultiPhotoEvent) {
      logger.info('✅ AI Photoshop: Multi-photo event detected and handled')
      return
    }

    // ✅ DETECT MULTI-PHOTO UPLOAD FOR AI PHOTOSHOP
    const isMultiPhoto = await detectMultiPhotoAiPhotoshop(ctx)
    if (isMultiPhoto) {
      logger.info('🎨 AI Photoshop: Multi-photo upload detected', {
        telegramId: ctx.from?.id,
        mediaGroupId: ctx.message?.media_group_id,
      })
      return // Will be handled by multi-photo system
    }

    logger.info('🎨 AI Photoshop: Single photo received', {
      telegramId: ctx.from?.id,
      awaitingImage: ctx.session?.awaitingAiPhotoshopImage,
      step: ctx.session?.aiPhotoshopStep,
      model: ctx.session?.aiPhotoshopModel,
    })

    // Show loading indicator like Infinity Morphing
    const loadingMsg = await ctx.reply(
      isRu
        ? '📸 Загружаю изображение...'
        : '📸 Uploading image...',
      {
        reply_markup: {
          inline_keyboard: [[
            {
              text: isRu ? '⏳ Загрузка...' : '⏳ Loading...',
              callback_data: 'loading_indicator'
            }
          ]]
        }
      }
    )

    // Если пользователь отправил фото без выбора модели - используем SeeDream-4 по умолчанию
    if (!ctx.session?.awaitingAiPhotoshopImage && !ctx.session?.aiPhotoshopModel) {
      logger.info('🎨 AI Photoshop: Photo sent without model selection, using SeeDream-4 default', {
        telegramId: ctx.from?.id,
      })

      // Устанавливаем значения по умолчанию
      if (ctx.session) {
        ctx.session.aiPhotoshopModel = 'seedream'
        ctx.session.aiPhotoshopStyle = 'artistic'
        ctx.session.awaitingAiPhotoshopImage = true
        ctx.session.aiPhotoshopStep = 'processing'
      }

      await ctx.telegram.editMessageText(
        ctx.chat?.id,
        loadingMsg.message_id,
        undefined,
        isRu
          ? '✨ Отлично! Обрабатываю ваше фото с помощью SeeDream-4 в художественном стиле...'
          : '✨ Great! Processing your photo with SeeDream-4 in artistic style...'
      )
    } else if (!ctx.session?.awaitingAiPhotoshopImage) {
      await ctx.telegram.editMessageText(
        ctx.chat?.id,
        loadingMsg.message_id,
        undefined,
        isRu
          ? '❌ Сначала выберите модель и стиль обработки.'
          : '❌ Please select a model and processing style first.'
      )
      return
    }

    const photo = ctx.message.photo?.pop()
    if (!photo) {
      await ctx.telegram.editMessageText(
        ctx.chat?.id,
        loadingMsg.message_id,
        undefined,
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

      await ctx.telegram.editMessageText(
        ctx.chat?.id,
        loadingMsg.message_id,
        undefined,
        isRu
          ? '✅ Изображение загружено!\n\n📝 Теперь опишите, как его обработать:\n\n💡 *Для лучших результатов пишите на английском языке*'
          : '✅ Image uploaded!\n\n📝 Now describe how to process it:\n\n💡 *For best results, write in English*',
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [[
              {
                text: isRu ? 'Отмена' : 'Cancel',
                callback_data: 'ai_photoshop_cancel'
              }
            ]]
          }
        }
      )
    } else {
      // Update loading message to processing status
      await ctx.telegram.editMessageText(
        ctx.chat?.id,
        loadingMsg.message_id,
        undefined,
        isRu
          ? '✅ Изображение загружено! Начинаю обработку...'
          : '✅ Image uploaded! Starting processing...'
      )

      // Process with predefined style
      await processAiPhotoshopRequest(ctx)

      // Remove loading message after processing starts
      try {
        await ctx.telegram.deleteMessage(ctx.chat?.id!, loadingMsg.message_id)
      } catch (error) {
        // Ignore deletion errors
      }
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

    // Debug logging for session state
    logger.info('🚨 AI Photoshop: Text message received', {
      telegramId: ctx.from?.id,
      text: messageText.substring(0, 20) + '...',
      sessionState: {
        awaitingAiPhotoshopPrompt: ctx.session?.awaitingAiPhotoshopPrompt,
        aiPhotoshopStep: ctx.session?.aiPhotoshopStep,
        hasImage: !!ctx.session?.aiPhotoshopImage,
        aiPhotoshopStyle: ctx.session?.aiPhotoshopStyle,
        aiPhotoshopModel: ctx.session?.aiPhotoshopModel
      }
    })

    // STRICT validation: reject if ANY condition is not met
    if (!ctx.session?.awaitingAiPhotoshopPrompt) {
      logger.error('🚨 AI Photoshop: REJECTED - not awaiting prompt', {
        telegramId: ctx.from?.id,
        awaitingAiPhotoshopPrompt: ctx.session?.awaitingAiPhotoshopPrompt
      })
      await ctx.reply(
        isRu
          ? '❌ Сначала выберите модель, стиль и загрузите изображение.'
          : '❌ Please select a model, style and upload an image first.'
      )
      return
    }

    if (ctx.session?.aiPhotoshopStep !== 'custom_prompt') {
      logger.error('🚨 AI Photoshop: REJECTED - wrong step', {
        telegramId: ctx.from?.id,
        currentStep: ctx.session?.aiPhotoshopStep,
        expectedStep: 'custom_prompt'
      })
      await ctx.reply(
        isRu
          ? '❌ Сначала выберите модель, стиль и загрузите изображение.'
          : '❌ Please select a model, style and upload an image first.'
      )
      return
    }

    // Handle custom prompt input (no image required yet)
    if (ctx.session?.aiPhotoshopStep === 'custom_prompt') {
      logger.info('🎯 AI Photoshop: Processing custom prompt input', {
        telegramId: ctx.from?.id,
        promptLength: ctx.message.text?.length
      })

      const prompt = ctx.message.text

      if (!prompt || prompt.trim().length === 0) {
        await ctx.reply(isRu ? '❌ Пустой промпт. Попробуйте еще раз.' : '❌ Empty prompt. Please try again.')
        return
      }

      if (ctx.session) {
        ctx.session.aiPhotoshopPrompt = prompt
        ctx.session.awaitingAiPhotoshopPrompt = false
        ctx.session.aiPhotoshopStep = 'image_upload'
        ctx.session.awaitingAiPhotoshopImage = true

        logger.info('✅ AI Photoshop: Custom prompt saved successfully', {
          telegramId: ctx.from?.id,
          promptLength: prompt.length,
          promptPreview: prompt.substring(0, 100) + '...',
          step: ctx.session.aiPhotoshopStep
        })
      }

      const model = AI_PHOTOSHOP_MODELS[ctx.session?.aiPhotoshopModel as keyof typeof AI_PHOTOSHOP_MODELS]

      await ctx.reply(
        isRu
          ? `✅ Промпт сохранен: "${prompt}"\n\n📷 Теперь отправьте изображение${model?.supports_multi_image ? ' (можно несколько)' : ''} для обработки:`
          : `✅ Prompt saved: "${prompt}"\n\n📷 Now send an image${model?.supports_multi_image ? ' (multiple allowed)' : ''} for processing:`,
        {
          parse_mode: 'Markdown',
          reply_markup: Markup.inlineKeyboard([
            [
              Markup.button.callback(
                isRu ? 'Изменить промпт' : 'Change prompt',
                'ai_photoshop_custom_prompt'
              ),
              Markup.button.callback(
                isRu ? 'Отмена' : 'Cancel',
                'ai_photoshop_cancel'
              )
            ]
          ]).reply_markup
        }
      )
      return
    }

    // For other steps, require image to be present
    if (!ctx.session?.aiPhotoshopImage && !ctx.session?.morphingImages?.length) {
      logger.error('🚨 AI Photoshop: REJECTED - no image', {
        telegramId: ctx.from?.id,
        hasImage: !!ctx.session?.aiPhotoshopImage,
        hasMorphingImages: !!ctx.session?.morphingImages?.length
      })
      await ctx.reply(
        isRu
          ? '❌ Сначала загрузите изображение для обработки.'
          : '❌ Please upload an image for processing first.'
      )
      return
    }

    logger.info('🚨 AI Photoshop: Text validation PASSED - processing with existing image', {
      telegramId: ctx.from?.id,
      validationStatus: 'ALL_CHECKS_PASSED'
    })

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

// ✅ SHOW AI PHOTOSHOP MODELS SELECTION
async function showAiPhotoshopModels(ctx: MyContext): Promise<void> {
  const isRu = isRussianFromState(ctx)

  const title = isRu
    ? '🎨 *ИИ Фотошоп* - Продвинутая обработка изображений'
    : '🎨 *AI Photoshop* - Advanced Image Processing'

  const description = isRu
    ? `Выберите модель ИИ для обработки:

🎭 *SeeDream-4* - Генерация и трансформация изображений (15⭐, до 5 фото)
🍌 *Nano Banana* - ИИ редактирование на базе Gemini 2.5 (12⭐, до 3 фото)
🚀 *FLUX Kontext Max* - Профессиональное редактирование (5⭐, до 10 фото)

📸 *Или сразу отправьте фото/альбом для быстрой обработки через SeeDream-4*
💡 *Каждая модель поддерживает несколько фотографий одновременно!*
✨ *Загружайте альбомы для пакетной обработки*`
    : `Choose an AI model for processing:

🎭 *SeeDream-4* - Image generation and transformation (15⭐, up to 5 photos)
🍌 *Nano Banana* - AI editing powered by Gemini 2.5 (12⭐, up to 3 photos)
🚀 *FLUX Kontext Max* - Professional editing (5⭐, up to 10 photos)

📸 *Or send photos/album directly for quick processing with SeeDream-4*
💡 *Each model supports multiple photos simultaneously!*
✨ *Upload albums for batch processing*`

  await ctx.reply(title + '\n\n' + description, {
    parse_mode: 'Markdown',
    reply_markup: createModelSelectionKeyboard(isRu).reply_markup,
  })
}

// ✅ AI PHOTOSHOP MULTI-PHOTO UTILITIES (adapted from Infinity Morphing)

// ✅ Progress bar for AI Photoshop multi-photo collection
const createAiPhotoshopProgressBar = (current: number, length = 10): string => {
  let filled: number
  if (current <= 2) {
    filled = Math.floor((current / 2) * 2)
  } else if (current <= 5) {
    filled = 2 + Math.floor(((current - 2) / 3) * 3)
  } else if (current <= 10) {
    filled = 5 + Math.floor(((current - 5) / 5) * 3)
  } else {
    filled = Math.min(9, 8 + Math.floor(Math.log10(current - 9)))
  }

  const empty = length - filled
  return `[${'▓'.repeat(filled) + '░'.repeat(empty)}] ${current} фото`
}

// ✅ Progress message for AI Photoshop multi-photo collection
const createAiPhotoshopProgressMessage = (images: any[], isRu: boolean): string => {
  const count = images.length
  const progressBar = createAiPhotoshopProgressBar(count)

  const baseMessage = isRu
    ? `🎨 <b>ИИ Фотошоп - Сбор изображений</b>\n\n📸 ${progressBar}\n\n✨ Отлично! Загружайте еще фотографии для пакетной обработки\n💡 Все модели поддерживают несколько изображений одновременно`
    : `🎨 <b>AI Photoshop - Collecting Images</b>\n\n📸 ${progressBar}\n\n✨ Great! Upload more photos for batch processing\n💡 All models support multiple images simultaneously`

  if (count >= 2) {
    const actionMessage = isRu
      ? '\n\n🚀 <b>Готово к обработке!</b> Нажмите "Обработать" или загрузите еще фото'
      : '\n\n🚀 <b>Ready to process!</b> Click "Process" or upload more photos'
    return baseMessage + actionMessage
  }

  return baseMessage
}

// ✅ Progress keyboard for AI Photoshop multi-photo collection
const createAiPhotoshopProgressKeyboard = (images: any[], isRu: boolean) => {
  const keyboard = []

  if (images.length >= 2) {
    // Ready to process - show process button
    keyboard.push([{
      text: isRu ? '🎨 Обработать изображения' : '🎨 Process Images',
      callback_data: 'ai_photoshop_multi_process'
    }])
  }

  // Always show restart option
  keyboard.push([{
    text: isRu ? '🔄 Начать заново' : '🔄 Start Over',
    callback_data: 'ai_photoshop_multi_restart'
  }])

  return Markup.inlineKeyboard(keyboard)
}

// ✅ AI PHOTOSHOP MULTI-PHOTO DETECTION AND HANDLING

/**
 * AI Photoshop multi-photo detection - collects multiple photos using buffer logic like Infinity Morphing
 */
async function detectMultiPhotoAiPhotoshop(ctx: MyContext): Promise<boolean> {
  if (!ctx.message || !('photo' in ctx.message)) return false

  const userId = ctx.from?.id?.toString()
  if (!userId) return false

  const photo = ctx.message.photo?.pop() // Get highest resolution
  if (!photo) return false

  const mediaGroupId = 'media_group_id' in ctx.message ? ctx.message.media_group_id : undefined

  // If this is part of a media group, collect photos using buffer approach like Infinity Morphing
  if (mediaGroupId) {
    try {
      const isRu = isRussianFromState(ctx)

      // Initialize session data if not exists
      if (!ctx.session.morphingImages) {
        ctx.session.morphingImages = []
      }

      // Get file and convert to buffer
      const file = await ctx.telegram.getFile(photo.file_id)
      if (!file.file_path) {
        logger.error('❌ AI Photoshop: No file path for photo')
        return false
      }

      const botToken = getBotToken(ctx)
      const response = await fetch(
        `https://api.telegram.org/file/bot${botToken}/${file.file_path}`
      )
      const buffer = Buffer.from(await response.arrayBuffer())

      // Add image with timestamp and order like Infinity Morphing
      const imageIndex = ctx.session.morphingImages.length + 1
      const currentTimestamp = Date.now() + imageIndex

      ctx.session.morphingImages.push({
        buffer: Buffer.from(buffer),
        filename: `ai_photoshop_image_${imageIndex}.jpg`,
        timestamp: currentTimestamp,
        originalOrder: imageIndex,
      })

      logger.info('🎨 AI Photoshop: Multi-photo collected', {
        userId,
        mediaGroupId,
        photoCount: ctx.session.morphingImages.length,
        imageSize: buffer.length
      })

      // Create dynamic progress message like Infinity Morphing
      const progressMessage = createAiPhotoshopProgressMessage(ctx.session.morphingImages, isRu)
      const keyboard = createAiPhotoshopProgressKeyboard(ctx.session.morphingImages, isRu)

      // Update existing message or create new one
      if (ctx.session.morphingProgressMessageId) {
        try {
          await ctx.telegram.editMessageText(
            ctx.chat?.id,
            ctx.session.morphingProgressMessageId,
            undefined,
            progressMessage,
            {
              parse_mode: 'HTML',
              reply_markup: keyboard.reply_markup,
            }
          )
        } catch (error) {
          // If edit fails, create new message
          const sentMessage = await ctx.reply(progressMessage, {
            parse_mode: 'HTML',
            reply_markup: keyboard.reply_markup,
          })
          ctx.session.morphingProgressMessageId = sentMessage.message_id
        }
      } else {
        // Create first progress message
        const sentMessage = await ctx.reply(progressMessage, {
          parse_mode: 'HTML',
          reply_markup: keyboard.reply_markup,
        })
        ctx.session.morphingProgressMessageId = sentMessage.message_id
      }

      return true
    } catch (error) {
      logger.error('❌ AI Photoshop: Error collecting multi-photo', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
      return false
    }
  }

  return false
}

/**
 * Handle AI Photoshop multi-photo processing - now unused (logic moved to callback handlers)
 */
async function handleAiPhotoshopMultiPhoto(ctx: MyContext): Promise<void> {
  // This function is now handled by callback handlers: ai_photoshop_multi_process
}

// Function to process AI Photoshop request
const processAiPhotoshopRequest = async (ctx: MyContext, customPrompt?: string) => {
  const isRu = isRussianFromState(ctx)

  // Get data from session
  const {
    aiPhotoshopModel,
    aiPhotoshopStyle,
    aiPhotoshopImage,
    multiPhotoUrls,
    multiPhotoCount,
  } = ctx.session || {}

  // Validate data - check for either aiPhotoshopImage OR morphingImages
  const hasImages = aiPhotoshopImage || (ctx.session?.morphingImages?.length && ctx.session.morphingImages.length > 0)

  if (!aiPhotoshopModel || !hasImages || !ctx.from?.id) {
    logger.error('Missing required data for AI Photoshop processing', {
      telegramId: ctx.from?.id,
      model: aiPhotoshopModel,
      hasImage: !!aiPhotoshopImage,
      hasMorphingImages: ctx.session?.morphingImages?.length || 0,
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

    // ✅ CHECK FOR MULTI-PHOTO PROCESSING
    // If we have morphingImages (buffer approach), convert them to temporary URLs
    let actualImageUrls: string[] = []
    let isMultiPhoto = false

    if (ctx.session?.morphingImages?.length && ctx.session.morphingImages.length > 0) {
      // Multi-photo via buffer approach - need to upload buffers to temporary storage
      isMultiPhoto = ctx.session.morphingImages.length > 1

      // For now, we'll use a simpler approach - convert buffers to data URLs
      // This is a temporary solution until we implement proper temporary file upload
      logger.info('AI Photoshop: Converting buffers to data URLs', {
        telegramId: ctx.from.id,
        bufferCount: ctx.session.morphingImages.length
      })

      actualImageUrls = ctx.session.morphingImages.map((img, index) => {
        const base64 = img.buffer.toString('base64')
        return `data:image/jpeg;base64,${base64}`
      })
    } else if (multiPhotoUrls && multiPhotoCount && multiPhotoCount > 1) {
      // Multi-photo via URL approach (from multiPhotoHandler)
      isMultiPhoto = true
      actualImageUrls = Array.isArray(multiPhotoUrls) ? multiPhotoUrls : [multiPhotoUrls]
    } else {
      // Single photo
      isMultiPhoto = false
      actualImageUrls = [aiPhotoshopImage || '']
    }

    const currentModel = AI_PHOTOSHOP_MODELS[aiPhotoshopModel as keyof typeof AI_PHOTOSHOP_MODELS]
    const maxImages = isMultiPhoto ? Math.min(actualImageUrls.length, currentModel?.max_images || 1) : 1

    logger.info('AI Photoshop processing setup', {
      telegramId: ctx.from.id,
      isMultiPhoto,
      imageCount: actualImageUrls.length,
      maxImages,
      modelSupportsMulti: currentModel?.supports_multi_image,
      usingBuffers: !!(ctx.session?.morphingImages?.length),
    })

    // Call appropriate service based on selected model
    let result: any = null

    switch (aiPhotoshopModel) {
      case 'seedream':
        if (isMultiPhoto && currentModel?.supports_multi_image) {
          // Use multi-photo version with array of images
          result = await generateSeeDream4({
            prompt: finalPrompt,
            inputImageUrl: actualImageUrls, // Pass array for multi-photo
            telegram_id: ctx.from.id.toString(),
            username: ctx.from.username || 'unknown',
            is_ru: isRu,
            ctx,
            size: '2K',
            max_images: maxImages,
            aspect_ratio: '9:16'
          })
        } else {
          // Single photo processing
          result = await generateSeeDream4({
            prompt: finalPrompt,
            inputImageUrl: actualImageUrls[0],
            telegram_id: ctx.from.id.toString(),
            username: ctx.from.username || 'unknown',
            is_ru: isRu,
            ctx,
            size: '2K',
            max_images: 1,
            aspect_ratio: '9:16'
          })
        }
        break

      case 'nano_banana':
        result = await generateNanoBanana({
          telegram_id: ctx.from.id.toString(),
          promptText: finalPrompt,
          inputImageUrl: actualImageUrls[0], // Nano Banana uses single image
          ctx,
          username: ctx.from.username || 'unknown',
          is_ru: isRu,
          promptStyle: 'artistic'
        })
        break

      case 'flux_max':
        result = await generateFluxKontextMax({
          prompt: finalPrompt,
          inputImageUrl: actualImageUrls[0], // FLUX Max uses single image
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
      ctx.session.awaitingAiPhotoshopImage = false
      ctx.session.awaitingAiPhotoshopPrompt = false
      // Clear multi-photo data
      ctx.session.multiPhotoUrls = undefined
      ctx.session.multiPhotoCount = undefined
      ctx.session.awaitingMultiPhotoConfirmation = false
      // Clear buffer-based images
      ctx.session.morphingImages = undefined
      ctx.session.morphingButtonsMessageId = undefined
      ctx.session.morphingProgressMessageId = undefined
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
🚀 *FLUX Kontext Max* - Профессиональное редактирование (5⭐)`
      : `Choose an AI model for processing:

🎭 *SeeDream-4* - Image generation and transformation (15⭐)
🍌 *Nano Banana* - AI editing powered by Gemini 2.5 (12⭐)
🚀 *FLUX Kontext Max* - Professional editing (5⭐)`

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

// ✅ MULTI-PHOTO CALLBACK HANDLERS

// Process multi-photo images
aiPhotoshopScene.action('ai_photoshop_multi_process', async ctx => {
  try {
    await ctx.answerCbQuery()
    const isRu = isRussianFromState(ctx)

    if (!ctx.session.morphingImages || ctx.session.morphingImages.length < 2) {
      await ctx.reply(
        isRu
          ? '❌ Недостаточно изображений для обработки'
          : '❌ Not enough images for processing'
      )
      return
    }

    // Delete progress message
    await ctx.deleteMessage()

    // Show model/style selection for multi-photo
    await ctx.reply(
      isRu
        ? `✨ Готово к обработке ${ctx.session.morphingImages.length} изображений!\n\n🎭 Модель: SeeDream-4 (по умолчанию)\n🎨 Стиль: Художественный\n💎 Стоимость: ${15 * ctx.session.morphingImages.length} ⭐`
        : `✨ Ready to process ${ctx.session.morphingImages.length} images!\n\n🎭 Model: SeeDream-4 (default)\n🎨 Style: Artistic\n💎 Cost: ${15 * ctx.session.morphingImages.length} ⭐`,
      {
        reply_markup: {
          inline_keyboard: [
            [{
              text: isRu ? '🚀 Начать обработку' : '🚀 Start Processing',
              callback_data: 'ai_photoshop_multi_confirm'
            }],
            [{
              text: isRu ? '⚙️ Выбрать модель' : '⚙️ Choose Model',
              callback_data: 'ai_photoshop_multi_choose_model'
            }],
            [{
              text: isRu ? '❌ Отмена' : '❌ Cancel',
              callback_data: 'ai_photoshop_multi_cancel'
            }]
          ]
        }
      }
    )

  } catch (error) {
    logger.error('Error processing multi-photo AI Photoshop', {
      error: error instanceof Error ? error.message : 'Unknown error',
      telegramId: ctx.from?.id,
    })
  }
})

// Restart multi-photo collection
aiPhotoshopScene.action('ai_photoshop_multi_restart', async ctx => {
  try {
    await ctx.answerCbQuery()
    const isRu = isRussianFromState(ctx)

    // Clear multi-photo session data
    if (ctx.session) {
      ctx.session.morphingImages = []
      ctx.session.morphingProgressMessageId = undefined
    }

    // Delete progress message
    await ctx.deleteMessage()

    await ctx.reply(
      isRu
        ? '🔄 Сбор изображений перезапущен. Отправьте новый альбом или фотографии.'
        : '🔄 Image collection restarted. Send a new album or photos.'
    )

    // Show model selection again
    await showAiPhotoshopModels(ctx)

  } catch (error) {
    logger.error('Error restarting multi-photo AI Photoshop', {
      error: error instanceof Error ? error.message : 'Unknown error',
      telegramId: ctx.from?.id,
    })
  }
})

// Confirm multi-photo processing
aiPhotoshopScene.action('ai_photoshop_multi_confirm', async ctx => {
  try {
    await ctx.answerCbQuery()
    const isRu = isRussianFromState(ctx)

    if (!ctx.session.morphingImages || ctx.session.morphingImages.length < 2) {
      await ctx.reply(
        isRu
          ? '❌ Недостаточно изображений для обработки'
          : '❌ Not enough images for processing'
      )
      return
    }

    // Delete confirmation message
    await ctx.deleteMessage()

    // Сохраняем текущий prompt перед настройкой session
    const currentPrompt = ctx.session.aiPhotoshopPrompt

    logger.info('🔍 AI Photoshop: Session state before processing', {
      telegramId: ctx.from?.id,
      hasPrompt: !!currentPrompt,
      promptLength: currentPrompt?.length || 0,
      currentStep: ctx.session.aiPhotoshopStep,
      currentStyle: ctx.session.aiPhotoshopStyle
    })

    // Set up session for processing, сохраняя prompt
    ctx.session.aiPhotoshopModel = 'seedream'
    ctx.session.aiPhotoshopStyle = 'artistic'
    ctx.session.aiPhotoshopStep = 'processing'
    // ✅ КРИТИЧЕСКИ ВАЖНО: восстанавливаем prompt!
    if (currentPrompt) {
      ctx.session.aiPhotoshopPrompt = currentPrompt
    }

    // Convert buffer images to URLs - need to upload to temporary storage or process directly
    const imageCount = ctx.session.morphingImages.length

    // Show processing message
    const loadingMsg = await ctx.reply(
      isRu
        ? `🎨 Обрабатываю ${imageCount} изображений...\n⏳ Это может занять некоторое время`
        : `🎨 Processing ${imageCount} images...\n⏳ This may take some time`,
      {
        reply_markup: {
          inline_keyboard: [[
            {
              text: isRu ? '⏳ Обработка...' : '⏳ Processing...',
              callback_data: 'loading_processing_indicator'
            }
          ]]
        }
      }
    )

    // Process images using existing logic
    logger.info('🚀 AI Photoshop: Starting multi-image processing', {
      telegramId: ctx.from?.id,
      imageCount: ctx.session.morphingImages?.length,
      hasPrompt: !!ctx.session.aiPhotoshopPrompt,
      promptText: ctx.session.aiPhotoshopPrompt?.substring(0, 50) + '...',
      sessionData: {
        model: ctx.session.aiPhotoshopModel,
        style: ctx.session.aiPhotoshopStyle,
        step: ctx.session.aiPhotoshopStep
      }
    })

    // Проверяем наличие промпта с подробной диагностикой
    if (!ctx.session.aiPhotoshopPrompt) {
      logger.error('🚨 AI Photoshop: No prompt found in session', {
        telegramId: ctx.from?.id,
        sessionKeys: Object.keys(ctx.session || {}),
        currentPromptValue: ctx.session.aiPhotoshopPrompt,
        savedPrompt: currentPrompt,
        session: {
          aiPhotoshopModel: ctx.session.aiPhotoshopModel,
          aiPhotoshopStyle: ctx.session.aiPhotoshopStyle,
          aiPhotoshopStep: ctx.session.aiPhotoshopStep,
          awaitingPrompt: ctx.session.awaitingAiPhotoshopPrompt,
          awaitingImage: ctx.session.awaitingAiPhotoshopImage
        }
      })

      await ctx.editMessageText(
        isRu
          ? '❌ Ошибка: промпт не найден. Попробуйте заново.'
          : '❌ Error: prompt not found. Please try again.'
      )
      return
    }

    await ctx.editMessageText(
      isRu
        ? `🚀 Начинаю обработку ${ctx.session.morphingImages?.length} изображений...\n\n⏳ Это может занять несколько минут\n\n📝 Промпт: "${ctx.session.aiPhotoshopPrompt}"`
        : `🚀 Starting to process ${ctx.session.morphingImages?.length} images...\n\n⏳ This may take several minutes\n\n📝 Prompt: "${ctx.session.aiPhotoshopPrompt}"`
    )

    // Call the actual processing function
    await processAiPhotoshopRequest(ctx, ctx.session.aiPhotoshopPrompt)

  } catch (error) {
    logger.error('Error confirming multi-photo AI Photoshop', {
      error: error instanceof Error ? error.message : 'Unknown error',
      telegramId: ctx.from?.id,
    })

    const isRu = isRussianFromState(ctx)
    await ctx.reply(
      isRu
        ? '❌ Ошибка при обработке альбома. Попробуйте еще раз.'
        : '❌ Error processing album. Please try again.'
    )
  }
})

// Cancel multi-photo processing
aiPhotoshopScene.action('ai_photoshop_multi_cancel', async ctx => {
  try {
    await ctx.answerCbQuery()
    const isRu = isRussianFromState(ctx)

    // Clear multi-photo session data
    if (ctx.session) {
      ctx.session.morphingImages = []
      ctx.session.morphingProgressMessageId = undefined
      ctx.session.aiPhotoshopModel = undefined
      ctx.session.aiPhotoshopStyle = undefined
      ctx.session.aiPhotoshopStep = undefined
    }

    // Delete message
    await ctx.deleteMessage()

    await ctx.reply(
      isRu
        ? '❌ Обработка альбома отменена. Отправьте новое изображение или альбом для обработки.'
        : '❌ Album processing cancelled. Send a new image or album for processing.'
    )

    // Show model selection again
    await showAiPhotoshopModels(ctx)

  } catch (error) {
    logger.error('Error cancelling multi-photo AI Photoshop', {
      error: error instanceof Error ? error.message : 'Unknown error',
      telegramId: ctx.from?.id,
    })
  }
})

export default aiPhotoshopScene