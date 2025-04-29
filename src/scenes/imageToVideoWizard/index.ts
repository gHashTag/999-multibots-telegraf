import { Composer, Scenes, Markup } from 'telegraf'
import { generateImageToVideo as generateImageToVideoPlanB } from '@/services/plan_b/generateImageToVideo'
import { MyContext } from '@/interfaces'
import {
  cancelMenu,
  createHelpCancelKeyboard,
  sendGenerationCancelledMessage,
  sendGenericErrorMessage,
  videoModelKeyboard,
} from '@/menu'
import { isRussian } from '@/helpers/language'
import { ModeEnum } from '@/interfaces/modes'
import { getBotToken, handleHelpCancel } from '@/handlers'
import { VIDEO_MODELS_CONFIG } from '@/price/models/VIDEO_MODELS_CONFIG'
import { logger } from '@/utils/logger'
import { calculateFinalStarPrice, CalculationParams } from '@/price/calculator'
import { getUserBalance } from '@/core/supabase'
import { SYSTEM_CONFIG } from '@/price/constants/index'
import {
  getUserDetailsSubscription,
  UserDetailsResult,
} from '@/core/supabase/getUserDetailsSubscription'
import { updateUserModel } from '@/core/supabase'

// Определяем тип ключей конфига
type VideoModelKey = keyof typeof VIDEO_MODELS_CONFIG
const MORPHING_MODEL_KEY = 'fofr-video-morpher' // Constant for the morphing model (backend uses this)

// --- Wizard Steps --- //

// Step 0: Ask for Model (Entry Point)
const askModelStep = new Composer<MyContext>()
askModelStep.on('message', async ctx => {
  const isRu = isRussian(ctx) // Determine language once
  // Check if we entered specifically for morphing via menu button
  if (ctx.session.current_action === 'morphing') {
    logger.info('[I2V Wizard] Morphing mode entered directly', {
      telegramId: ctx.from?.id,
    })
    // Set model and flag
    ctx.session.videoModel = MORPHING_MODEL_KEY
    ctx.session.is_morphing = true

    // Check balance for morphing
    const morphingCostResult = calculateFinalStarPrice(
      ModeEnum.ImageToVideo, // Assuming morphing is part of ImageToVideo mode price calculation
      { modelId: MORPHING_MODEL_KEY } // Pass modelId for accurate calculation
    )

    if (!morphingCostResult) {
      logger.error('[I2V Wizard] Failed to calculate morphing cost')
      await sendGenericErrorMessage(ctx, isRu)
      return ctx.scene.leave()
    }
    const morphingCost = morphingCostResult.stars // Extract stars

    const userDetails: UserDetailsResult = await getUserDetailsSubscription(
      String(ctx.from?.id)
    )
    const currentBalance = userDetails?.stars || 0

    if (!(currentBalance >= morphingCost)) {
      // HARDCODED TEXT
      const text = isRu
        ? `❌ Ошибка: Недостаточно звезд для морфинга (${morphingCost} ★). Ваш баланс: ${Math.floor(currentBalance)} ★.`
        : `❌ Error: Insufficient stars for morphing (${morphingCost} ★). Your balance: ${Math.floor(currentBalance)} ★.`
      await ctx.replyWithHTML(text)
      return ctx.scene.leave()
    }
    ctx.session.paymentAmount = morphingCost // Save morphing cost

    // Ask for first image (image_a)
    // HARDCODED TEXT
    const text = isRu
      ? '🖼️ Пожалуйста, отправьте первое изображение для морфинга.'
      : '🖼️ Please send the first image for morphing.'
    await ctx.replyWithHTML(text)
    return ctx.wizard.selectStep(ctx.wizard.cursor + 3) // Jump to handleMorphImageA (step index 3)
  } else {
    // Standard flow: Ask to select model
    const keyboardMarkup = videoModelKeyboard(isRu)
    // HARDCODED TEXT
    const text = isRu
      ? '🤔 Выберите модель для генерации видео:'
      : '🤔 Choose a model for video generation:'
    await ctx.reply(text, {
      reply_markup: keyboardMarkup.reply_markup,
    })
    return ctx.wizard.next() // Go to handleModelSelection (step index 1)
  }
})

// Step 1: Handle Model Selection (Standard Flow)
const handleModelSelection = new Composer<MyContext>()
handleModelSelection.on('text', async ctx => {
  const isRu = isRussian(ctx)
  const selectedButtonText = ctx.message?.text

  if (!selectedButtonText) {
    // HARDCODED TEXT
    const text = isRu
      ? '👇 Пожалуйста, выберите модель, нажав одну из кнопок внизу.'
      : '👇 Please select a model by pressing one of the buttons below.'
    await ctx.reply(text)
    return // Stay on this step
  }

  // Handle Help/Cancel first
  const isCancel = await handleHelpCancel(ctx)
  if (isCancel) {
    return ctx.scene.leave()
  }

  // Find model key by button text
  let foundModelKey: VideoModelKey | null = null
  for (const [key, config] of Object.entries(VIDEO_MODELS_CONFIG)) {
    const costResult = calculateFinalStarPrice(ModeEnum.ImageToVideo, {
      modelId: key,
    })
    if (!costResult) continue // Skip if calculation failed
    const finalPriceInStars = costResult.stars // Extract stars

    const expectedButtonText = `${config.title} (${finalPriceInStars} ⭐)`
    if (expectedButtonText === selectedButtonText) {
      foundModelKey = key as VideoModelKey
      break
    }
  }

  if (!foundModelKey) {
    logger.warn('Could not map button text to model key:', {
      selectedButtonText,
    })
    // HARDCODED TEXT
    const text = isRu
      ? '👇 Пожалуйста, выберите модель из предложенных кнопок ВНИЗУ.'
      : '👇 Please select a model using the provided buttons BELOW.'
    await ctx.reply(text)
    return // Stay on this step
  }

  // --- Check if Kling model is selected --- Restore this logic
  if (foundModelKey.startsWith('kling-')) {
    logger.info('[I2V Wizard] Kling model selected', {
      telegramId: ctx.from?.id,
      model: foundModelKey,
    })
    ctx.session.videoModel = foundModelKey // Store the selected Kling model key for now

    // --- Check if Kling v2.0 is selected before showing mode buttons ---
    const selectedModelConfig = VIDEO_MODELS_CONFIG[foundModelKey]
    const canMorph = selectedModelConfig?.canMorph ?? false // Default to false if config missing

    // Ask for mode: Standard or Morphing - Only show Morphing if canMorph is true
    const buttons = [
      Markup.button.callback(
        isRu ? '🎬 Стандарт' : '🎬 Standard',
        'kling_standard'
      ),
    ]

    if (canMorph) {
      buttons.push(
        Markup.button.callback(
          isRu ? '✨ Морфинг' : '✨ Morphing',
          'kling_morphing'
        )
      )
    }

    const inlineKeyboard = Markup.inlineKeyboard(buttons)
    // -----------------------------------------------------------------

    // HARDCODED TEXT
    const text = isRu
      ? '🎬 Выберите режим для Kling модели:'
      : '🎬 Select mode for the Kling model:'
    // Send ONLY the inline keyboard for now to ensure it appears
    await ctx.replyWithHTML(text, inlineKeyboard)
    return ctx.wizard.next() // Go to handleKlingModeSelection (step index 2) - Restore this transition
  } else {
    // --- Logic for NON-Kling models (Standard Flow) ---
    logger.info('[I2V Wizard] Non-Kling model selected', {
      telegramId: ctx.from?.id,
      model: foundModelKey,
    })
    if (!ctx.from) {
      logger.error('imageToVideoWizard: Could not identify user')
      await sendGenericErrorMessage(ctx, isRu) // Keep generic error
      return ctx.scene.leave()
    }

    const telegram_id = ctx.from.id.toString()
    const bot_name = ctx.botInfo.username

    // 1. Вычисляем ФИНАЛЬНУЮ СТОИМОСТЬ в звездах (с интересом)
    const costParams: CalculationParams = { modelId: foundModelKey }
    const costResult = calculateFinalStarPrice(
      ModeEnum.ImageToVideo,
      costParams
    )
    const finalPriceInStars = costResult ? costResult.stars : 0
    // Получаем баланс из уже полученных данных
    const userDetails: UserDetailsResult =
      await getUserDetailsSubscription(telegram_id) // Используем существующие данные
    const currentBalance = userDetails?.stars || 0

    if (!(currentBalance >= finalPriceInStars)) {
      logger.info(
        `Insufficient balance for ${telegram_id}. Has: ${currentBalance}, Needs (final): ${finalPriceInStars}`
      )
      // HARDCODED TEXT
      const text = isRu
        ? `😕 Недостаточно звезд (${finalPriceInStars} ★). Баланс: ${Math.floor(currentBalance)} ★.`
        : `😕 Insufficient stars (${finalPriceInStars} ★). Balance: ${Math.floor(currentBalance)} ★.`
      await ctx.reply(text)

      // Reshow model selection
      const keyboardMarkup = videoModelKeyboard(isRu)
      // HARDCODED TEXT
      const textSelectAnother = isRu
        ? '🤔 Выберите другую модель:'
        : '🤔 Choose another model:'
      await ctx.reply(textSelectAnother, {
        reply_markup: keyboardMarkup.reply_markup,
      })
      return ctx.wizard.selectStep(ctx.wizard.cursor - 1) // Go back to model selection
    }

    logger.info(
      `Sufficient balance for ${telegram_id}. Has: ${currentBalance}, Needs (final): ${finalPriceInStars}.`
    )
    ctx.session.videoModel = foundModelKey
    ctx.session.paymentAmount = finalPriceInStars
    ctx.session.is_morphing = false // Ensure flag is false for standard

    const selectedModelTitle =
      VIDEO_MODELS_CONFIG[foundModelKey]?.title || foundModelKey

    // HARDCODED TEXT
    const textModelChosen = isRu
      ? `✅ Вы выбрали: ${selectedModelTitle}.`
      : `✅ You chose: ${selectedModelTitle}.`
    await ctx.reply(textModelChosen, Markup.removeKeyboard())

    // HARDCODED TEXT
    const textRequestImage = isRu
      ? '🖼️ Теперь отправьте изображение для генерации видео'
      : '🖼️ Now send an image for video generation'
    await ctx.reply(textRequestImage, {
      reply_markup: createHelpCancelKeyboard(isRu).reply_markup,
    })
    // Jump to handleStandardImage (step index 4)
    return ctx.wizard.selectStep(ctx.wizard.cursor + 3) // Adjust step index if needed (should be 4)
  }
})
// Fallback for non-text messages in this step
handleModelSelection.use(async ctx => {
  const isRu = isRussian(ctx)
  // HARDCODED TEXT
  const text = isRu
    ? '👇 Пожалуйста, выберите модель кнопкой.'
    : '👇 Please select a model using a button.'
  await ctx.reply(text)
})

// Step 2: Handle Kling Mode Selection (Callback Query)
const handleKlingModeSelection = new Composer<MyContext>()
handleKlingModeSelection.action('kling_standard', async ctx => {
  const isRu = isRussian(ctx)
  await ctx.answerCbQuery()
  await ctx.editMessageReplyMarkup(undefined) // Remove inline keyboard

  const modelKey = ctx.session.videoModel as VideoModelKey // Should be a Kling key
  if (!modelKey || !modelKey.startsWith('kling-')) {
    logger.error('[I2V Wizard] Invalid/missing Kling model key in session', {
      modelKey,
    })
    await sendGenericErrorMessage(ctx, isRu) // Keep generic error
    return ctx.scene.leave()
  }

  const costResult = calculateFinalStarPrice(ModeEnum.ImageToVideo, {
    modelId: modelKey,
  })
  if (!costResult) {
    logger.error('[I2V Wizard] Failed to calculate Kling standard cost', {
      modelKey,
    })
    await sendGenericErrorMessage(ctx, isRu)
    return ctx.scene.leave()
  }
  const finalPriceInStars = costResult.stars // Extract stars

  const userDetails: UserDetailsResult = await getUserDetailsSubscription(
    String(ctx.from?.id)
  )
  const currentBalance = userDetails?.stars || 0

  if (!(currentBalance >= finalPriceInStars)) {
    logger.info(
      `Insufficient balance for ${ctx.from?.id}. Has: ${currentBalance}, Needs (final): ${finalPriceInStars}`
    )
    // HARDCODED TEXT
    const textInsufficient = isRu
      ? `😕 Недостаточно звезд (${finalPriceInStars} ★). Баланс: ${Math.floor(currentBalance)} ★.`
      : `😕 Insufficient stars (${finalPriceInStars} ★). Balance: ${Math.floor(currentBalance)} ★.`
    await ctx.reply(textInsufficient)

    // Reshow model selection
    const keyboardMarkup = videoModelKeyboard(isRu)
    // HARDCODED TEXT
    const textSelectAnother = isRu
      ? '🤔 Выберите другую модель:'
      : '🤔 Choose another model:'
    await ctx.reply(textSelectAnother, {
      reply_markup: keyboardMarkup.reply_markup,
    })
    return ctx.wizard.selectStep(0)
  }

  // Standard Kling flow
  ctx.session.is_morphing = false
  ctx.session.paymentAmount = finalPriceInStars

  const selectedModelTitle = VIDEO_MODELS_CONFIG[modelKey]?.title || modelKey
  // HARDCODED TEXT
  const textModelChosen = isRu
    ? `✅ Режим: Стандарт. Модель: ${selectedModelTitle}.`
    : `✅ Mode: Standard. Model: ${selectedModelTitle}.`
  await ctx.reply(textModelChosen)

  // HARDCODED TEXT
  const textRequestImage = isRu
    ? '🖼️ Теперь отправьте изображение для генерации видео'
    : '🖼️ Now send an image for video generation'
  await ctx.reply(textRequestImage, {
    reply_markup: createHelpCancelKeyboard(isRu).reply_markup,
  })
  // Jump to handleStandardImage (step index 4)
  return ctx.wizard.selectStep(4) // Explicitly set step index 4
})

handleKlingModeSelection.action('kling_morphing', async ctx => {
  const isRu = isRussian(ctx)
  await ctx.answerCbQuery()
  await ctx.editMessageReplyMarkup(undefined) // Remove inline keyboard

  const modelKey = ctx.session.videoModel as VideoModelKey // Should be a Kling key
  if (!modelKey || !modelKey.startsWith('kling-')) {
    logger.error(
      '[I2V Wizard] Invalid/missing Kling model key in session for morphing',
      { modelKey }
    )
    await sendGenericErrorMessage(ctx, isRu)
    return ctx.scene.leave()
  }

  const costResult = calculateFinalStarPrice(ModeEnum.ImageToVideo, {
    modelId: modelKey,
  })
  if (!costResult) {
    logger.error('[I2V Wizard] Failed to calculate Kling morphing cost', {
      modelKey,
    })
    await sendGenericErrorMessage(ctx, isRu)
    return ctx.scene.leave()
  }
  const finalPriceInStars = costResult.stars // Extract stars

  const userDetails: UserDetailsResult = await getUserDetailsSubscription(
    String(ctx.from?.id)
  )
  const currentBalance = userDetails?.stars || 0

  if (!(currentBalance >= finalPriceInStars)) {
    const textInsufficient = isRu
      ? `😕 Недостаточно звезд для морфинга (${finalPriceInStars} ★). Баланс: ${Math.floor(currentBalance)} ★.`
      : `😕 Insufficient stars for morphing (${finalPriceInStars} ★). Balance: ${Math.floor(currentBalance)} ★.`
    await ctx.reply(textInsufficient)

    // Reshow model selection
    const keyboardMarkup = videoModelKeyboard(isRu)
    const textSelectAnother = isRu
      ? '🤔 Выберите другую модель:'
      : '🤔 Choose another model:'
    await ctx.reply(textSelectAnother, {
      reply_markup: keyboardMarkup.reply_markup,
    })
    return ctx.wizard.selectStep(0)
  }

  // Morphing Kling flow
  ctx.session.is_morphing = true
  ctx.session.paymentAmount = finalPriceInStars

  const selectedModelTitle = VIDEO_MODELS_CONFIG[modelKey]?.title || modelKey
  // HARDCODED TEXT
  const textModeChosen = isRu
    ? `✅ Режим: Морфинг. Модель: ${selectedModelTitle}.`
    : `✅ Mode: Morphing. Model: ${selectedModelTitle}.`
  await ctx.reply(textModeChosen)

  // HARDCODED TEXT
  const textRequestImageA = isRu
    ? '🖼️ Теперь отправьте ПЕРВОЕ изображение для морфинга (Image A)'
    : '🖼️ Now send the FIRST image for morphing (Image A)'
  await ctx.reply(textRequestImageA, {
    reply_markup: createHelpCancelKeyboard(isRu).reply_markup, // Show cancel on first image request
  })
  // Jump to handleMorphImageA (step index 3)
  return ctx.wizard.selectStep(3) // Explicitly set step index 3
})
// Fallback for unexpected actions/text in this step
handleKlingModeSelection.use(async ctx => {
  const isRu = isRussian(ctx)
  logger.warn('[I2V Wizard] Unexpected input on Kling mode selection step', {
    input: ctx.message || ctx.callbackQuery,
  })
  // HARDCODED TEXT
  const text = isRu
    ? '👇 Пожалуйста, выберите режим (Стандарт/Морфинг), нажав кнопку выше.'
    : '👇 Please select a mode (Standard/Morphing) using the buttons above.'
  await ctx.reply(text)
})

// Step 3: Handle Morph Image A
const handleMorphImageA = new Composer<MyContext>()
handleMorphImageA.on('photo', async ctx => {
  const isRu = isRussian(ctx)

  // Check if it's actually a photo message FIRST
  if (!ctx.message || !ctx.message.photo) {
    // Check for text message for Help/Cancel
    if (ctx.message && 'text' in ctx.message) {
      const isCancel = await handleHelpCancel(ctx)
      if (isCancel) {
        return ctx.scene.leave()
      }
    }
    // If not cancel and not photo, ask for photo
    // HARDCODED TEXT
    const text = isRu
      ? '🧐 Кажется, это не фото. Пожалуйста, отправьте ПЕРВОЕ изображение.'
      : "🧐 That doesn't seem to be a photo. Please send the FIRST image."
    await ctx.reply(text)
    return // Stay on this step
  }

  // Now we know it's a photo message
  const photo = ctx.message.photo.pop() // Get the highest resolution
  if (!photo) {
    // HARDCODED TEXT
    const text = isRu
      ? '❌ Не удалось получить фото А.'
      : '❌ Failed to get photo A.'
    await ctx.reply(text)
    return // Stay on this step
  }

  const fileLink = await ctx.telegram.getFileLink(photo.file_id)
  ctx.session.imageAUrl = fileLink.href
  logger.info('[I2V Wizard] Received Image A for morphing', {
    telegramId: ctx.from?.id,
    url: fileLink.href,
  })

  // HARDCODED TEXT
  const textRequestImageB = isRu
    ? '🖼️ Отлично! Теперь отправьте ВТОРОЕ изображение для морфинга (Image B)'
    : '🖼️ Great! Now send the SECOND image for morphing (Image B)'
  // Remove cancel keyboard for the second image to avoid clutter
  await ctx.reply(textRequestImageB, Markup.removeKeyboard()) // Remove keyboard here
  return ctx.wizard.next() // Go to handleMorphImageB (step index 4) - Check this index!
})
// Fallback for non-photo messages in this step
handleMorphImageA.use(async ctx => {
  const isRu = isRussian(ctx)
  // Handle Help/Cancel first
  const isCancel = await handleHelpCancel(ctx)
  if (isCancel) {
    return ctx.scene.leave()
  }
  // HARDCODED TEXT
  const text = isRu
    ? '🖼️ Пожалуйста, отправьте ПЕРВОЕ изображение.'
    : '🖼️ Please send the FIRST image.'
  await ctx.reply(text)
})

// Step 4: Handle Morph Image B OR Standard Image
const handleMorphImageBOrStandardImage = new Composer<MyContext>()
handleMorphImageBOrStandardImage.on('photo', async ctx => {
  const isRu = isRussian(ctx)

  // Check if it's actually a photo message FIRST
  if (!ctx.message || !ctx.message.photo) {
    // Check for text message for Help/Cancel
    if (ctx.message && 'text' in ctx.message) {
      const isCancel = await handleHelpCancel(ctx)
      if (isCancel) {
        return ctx.scene.leave()
      }
    }
    // If not cancel and not photo, ask for photo
    // HARDCODED TEXT
    const text = isRu
      ? ctx.session.is_morphing
        ? '🧐 Кажется, это не фото. Пожалуйста, отправьте ВТОРОЕ изображение.'
        : '🧐 Кажется, это не фото. Пожалуйста, отправьте изображение.'
      : ctx.session.is_morphing
        ? "🧐 That doesn't seem to be a photo. Please send the SECOND image."
        : "🧐 That doesn't seem to be a photo. Please send an image."
    await ctx.reply(text)
    return // Stay on this step
  }

  // Now we know it's a photo message
  const photo = ctx.message.photo.pop() // Get the highest resolution
  if (!photo) {
    // HARDCODED TEXT
    const text = isRu
      ? '❌ Не удалось получить фото.'
      : '❌ Failed to get photo.'
    await ctx.reply(text)
    return // Stay on this step
  }

  const fileLink = await ctx.telegram.getFileLink(photo.file_id)

  if (ctx.session.is_morphing) {
    // This is Image B for morphing
    ctx.session.imageBUrl = fileLink.href
    logger.info('[I2V Wizard] Received Image B for morphing', {
      telegramId: ctx.from?.id,
      url: fileLink.href,
    })
    // HARDCODED TEXT
    const textRequestPrompt = isRu
      ? '📝 Теперь введите промпт (описание), что должно происходить в видео:'
      : '📝 Now enter a prompt (description) of what should happen in the video:'
    await ctx.reply(textRequestPrompt, {
      reply_markup: createHelpCancelKeyboard(isRu).reply_markup,
    })
    return ctx.wizard.next() // Go to handlePrompt (step index 5)
  } else {
    // This is the image for standard generation
    ctx.session.imageUrl = fileLink.href
    logger.info('[I2V Wizard] Received Image for standard generation', {
      telegramId: ctx.from?.id,
      url: fileLink.href,
    })
    // HARDCODED TEXT
    const textRequestPrompt = isRu
      ? '📝 Теперь введите промпт (описание), что должно происходить в видео:'
      : '📝 Now enter a prompt (description) of what should happen in the video:'
    await ctx.reply(textRequestPrompt, {
      reply_markup: createHelpCancelKeyboard(isRu).reply_markup,
    })
    return ctx.wizard.next() // Go to handlePrompt (step index 5)
  }
})
// Fallback for non-photo messages in this step
handleMorphImageBOrStandardImage.use(async ctx => {
  const isRu = isRussian(ctx)
  // Handle Help/Cancel first
  const isCancel = await handleHelpCancel(ctx)
  if (isCancel) {
    return ctx.scene.leave()
  }
  // HARDCODED TEXT
  const text = isRu
    ? ctx.session.is_morphing
      ? '🖼️ Пожалуйста, отправьте ВТОРОЕ изображение.'
      : '🖼️ Пожалуйста, отправьте изображение.'
    : ctx.session.is_morphing
      ? '🖼️ Please send the SECOND image.'
      : '🖼️ Please send an image.'
  await ctx.reply(text)
})

// Step 5: Handle Prompt
const handlePrompt = new Composer<MyContext>()
handlePrompt.on('text', async ctx => {
  const isRu = isRussian(ctx)
  const prompt = ctx.message?.text

  // Handle Help/Cancel first
  const isCancel = await handleHelpCancel(ctx)
  if (isCancel) {
    return ctx.scene.leave()
  }

  if (!prompt) {
    // HARDCODED TEXT
    const text = isRu
      ? '✍️ Пожалуйста, введите текстовый промпт.'
      : '✍️ Please enter a text prompt.'
    await ctx.reply(text)
    return // Stay on this step
  }

  ctx.session.prompt = prompt
  logger.info('[I2V Wizard] Received prompt', {
    telegramId: ctx.from?.id,
    prompt,
  })

  // Final confirmation and generation start
  return handleSubmit(ctx) // Call the final submission logic
})
// Fallback for non-text messages
handlePrompt.use(async ctx => {
  const isRu = isRussian(ctx)
  // HARDCODED TEXT
  const text = isRu
    ? '✍️ Пожалуйста, введите промпт текстом.'
    : '✍️ Please enter the prompt as text.'
  await ctx.reply(text)
})

// --- Final Submission Logic --- //
async function handleSubmit(ctx: MyContext) {
  const isRu = isRussian(ctx)
  const {
    videoModel,
    is_morphing,
    imageAUrl,
    imageBUrl,
    imageUrl,
    prompt,
    paymentAmount, // Note: paymentAmount is in session but not used by plan_b function directly
  } = ctx.session
  const telegram_id = ctx.from?.id.toString()
  const username = ctx.from?.username || 'unknown'
  const botInfo = await ctx.telegram.getMe()
  const bot_name = botInfo.username

  // Type assertion for videoModel
  const videoModelKey = videoModel as VideoModelKey | undefined

  if (!videoModelKey || !telegram_id || !bot_name) {
    // Check videoModelKey
    logger.error(
      '[I2V Wizard] Missing essential data in session for submission',
      { session: ctx.session }
    )
    await sendGenericErrorMessage(ctx, isRu)
    return ctx.scene.leave()
  }

  // Validate required fields based on mode (already done before, but good to double-check)
  if (is_morphing) {
    if (!imageAUrl || !imageBUrl || !prompt) {
      logger.error('[I2V Wizard] Missing morphing data for submission', {
        imageAUrl: imageAUrl ? 'present' : 'absent',
        imageBUrl: imageBUrl ? 'present' : 'absent',
        prompt: prompt ? 'present' : 'absent',
      })
      await sendGenericErrorMessage(ctx, isRu)
      return ctx.scene.leave()
    }
  } else {
    if (!imageUrl || !prompt) {
      logger.error('[I2V Wizard] Missing standard data for submission', {
        imageUrl: imageUrl ? 'present' : 'absent',
        prompt: prompt ? 'present' : 'absent',
      })
      await sendGenericErrorMessage(ctx, isRu)
      return ctx.scene.leave()
    }
  }

  // --- HARDCODED TEXT: Start Generation --- //
  const textStart = isRu
    ? '⏳ Начинаем генерацию видео... Это может занять некоторое время.'
    : '⏳ Starting video generation... This might take a while.'
  await ctx.reply(textStart, Markup.removeKeyboard())

  try {
    // --- Log parameters being sent --- //
    logger.info('[I2V Wizard] Calling generateImageToVideoPlanB service', {
      // Updated log
      videoModel: videoModelKey,
      telegram_id,
      username,
      is_ru: isRu,
      bot_name,
      is_morphing,
      imageUrl: imageUrl ? 'present' : 'absent',
      prompt: prompt ? 'present' : 'absent', // Log prompt presence
      imageAUrl: imageAUrl ? 'present' : 'absent',
      imageBUrl: imageBUrl ? 'present' : 'absent',
    })

    // --- Call the Plan B service (no await needed if handled async) --- //
    generateImageToVideoPlanB(
      // Changed function call
      ctx, // Pass the full context
      imageUrl, // null for morphing
      prompt, // Pass prompt for both modes now
      videoModelKey, // Pass the validated model key
      telegram_id,
      username,
      isRu,
      bot_name,
      is_morphing,
      imageAUrl,
      imageBUrl
    ).catch(error => {
      // Log error from the async background task if it fails early
      logger.error(
        '[I2V Wizard] Error during async generateImageToVideoPlanB call', // Updated log
        {
          error,
          telegram_id,
        }
      )
      // Consider sending an admin notification here as well if needed
    })

    // Leave the scene immediately after starting the background task
    logger.info('[I2V Wizard] Left scene after initiating background task', {
      telegramId: telegram_id,
    })
    return ctx.scene.leave()
  } catch (error) {
    logger.error(
      '[I2V Wizard] Error in handleSubmit before calling Plan B service',
      {
        // Updated log
        error,
        telegram_id,
      }
    )
    await sendGenericErrorMessage(ctx, isRu)
    return ctx.scene.leave()
  }
}

// --- Wizard Definition --- //
export const imageToVideoWizard = new Scenes.WizardScene<MyContext>(
  ModeEnum.ImageToVideo, // Scene ID
  askModelStep, // Step 0: Ask Model (or jump if morphing)
  handleModelSelection, // Step 1: Handle standard model selection / Kling choice
  handleKlingModeSelection, // Step 2: Handle Kling mode (standard/morphing) action
  handleMorphImageA, // Step 3: Handle Image A for morphing
  handleMorphImageBOrStandardImage, // Step 4: Handle Image B (morph) OR Standard Image
  handlePrompt // Step 5: Handle Prompt
  // Step 6 (Implicit): handleSubmit is called from handlePrompt
)

// Add HELP and CANCEL handlers to the scene
imageToVideoWizard.help(handleHelpCancel)
imageToVideoWizard.command('cancel', handleHelpCancel)

logger.info(
  '⚡️ ImageToVideo Wizard Scene initialized with Morphing logic and localized texts'
)
