import { Composer, Scenes, Markup, Telegraf } from 'telegraf'
import {
  generateImageToVideo,
  type VideoModelConfig,
} from '@/modules/videoGenerator'
import { MyContext, MySession } from '@/interfaces'
import {
  createHelpCancelKeyboard,
  sendGenericErrorMessage,
  videoModelKeyboard,
} from '@/menu'
// ✅ ИМПОРТИРУЕМ НОВУЮ ЦЕНТРАЛИЗОВАННУЮ СИСТЕМУ ЯЗЫКОВ!
import { isRussianFromState } from '@/helpers/centralizedLanguage'
import { ModeEnum } from '@/interfaces/modes'
import { handleHelpCancel } from '@/handlers'
import { VIDEO_MODELS_CONFIG } from '@/modules/videoGenerator/config/models.config'
import { logger } from '@/utils/logger'
import { calculateFinalPrice } from '@/price/helpers'

import {
  getUserDetailsSubscription,
  UserDetailsResult,
} from '@/core/supabase/getUserDetailsSubscription'

// Определяем тип ключей конфига
type VideoModelKey = keyof typeof VIDEO_MODELS_CONFIG
const MORPHING_MODEL_KEY = 'kling-v1.6-pro' // Constant for the morphing model

// --- Wizard Steps --- //

// Step 0: Ask for Model (Entry Point)
const askModelStep = new Composer<MyContext>()
askModelStep.on('message', async ctx => {
  // ✅ ИСПОЛЬЗУЕМ НОВУЮ ЦЕНТРАЛИЗОВАННУЮ СИСТЕМУ (БЕЗ ЗАПРОСОВ К БД!)
  const isRu = isRussianFromState(ctx) // Determine language once
  // Check if we entered specifically for morphing via menu button
  if (ctx.session.current_action === 'morphing') {
    logger.info('[I2V Wizard] Morphing mode entered directly', {
      telegramId: ctx.from?.id,
    })
    // Set model and flag
    ctx.session.videoModel = MORPHING_MODEL_KEY
    ctx.session.is_morphing = true

    // Check balance for morphing
    const morphingCost = calculateFinalPrice(MORPHING_MODEL_KEY)
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
    const keyboardMarkup = videoModelKeyboard(isRu, 'image')
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
  // ✅ ИСПОЛЬЗУЕМ НОВУЮ ЦЕНТРАЛИЗОВАННУЮ СИСТЕМУ (БЕЗ ЗАПРОСОВ К БД!)
  const isRu = isRussianFromState(ctx)
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
    const finalPriceInStars = calculateFinalPrice(key)
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
    return ctx.wizard.selectStep(3) // Go to handleKlingModeSelection (step index 3)
  } else if (foundModelKey === 'seedance-1-pro') {
    // --- Check if Seedance model is selected ---
    logger.info('[I2V Wizard] Seedance model selected', {
      telegramId: ctx.from?.id,
      model: foundModelKey,
    })
    ctx.session.videoModel = foundModelKey // Store the selected Seedance model key

    // Ask for resolution: 480p or 1080p
    const buttons = [
      Markup.button.callback(
        isRu ? '📺 480p (23 ⭐)' : '📺 480p (23 ⭐)',
        'seedance_480p'
      ),
      Markup.button.callback(
        isRu ? '🔥 1080p (117 ⭐)' : '🔥 1080p (117 ⭐)',
        'seedance_1080p'
      ),
    ]

    const inlineKeyboard = Markup.inlineKeyboard(buttons)

    const text = isRu
      ? '🎬 Выберите разрешение для Seedance Pro:'
      : '🎬 Select resolution for Seedance Pro:'
    await ctx.replyWithHTML(text, inlineKeyboard)
    return ctx.wizard.next() // Go to handleSeedanceResolutionSelection
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
    const finalPriceInStars = calculateFinalPrice(foundModelKey)
    const userDetails: UserDetailsResult =
      await getUserDetailsSubscription(telegram_id)
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
      const keyboardMarkup = videoModelKeyboard(isRu, 'image')
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
    // Jump to handleStandardImage (step index 5)
    return ctx.wizard.selectStep(ctx.wizard.cursor + 4) // Adjust step index if needed (should be 5)
  }
})
// Fallback for non-text messages in this step
handleModelSelection.use(async ctx => {
  const isRu = isRussianFromState(ctx)
  // HARDCODED TEXT
  const text = isRu
    ? '👇 Пожалуйста, выберите модель кнопкой.'
    : '👇 Please select a model using a button.'
  await ctx.reply(text)
})

// Step 2: Handle Kling Mode Selection (Callback Query)
const handleKlingModeSelection = new Composer<MyContext>()
handleKlingModeSelection.action('kling_standard', async ctx => {
  const isRu = isRussianFromState(ctx)
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

  const finalPriceInStars = calculateFinalPrice(modelKey)
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
    const keyboardMarkup = videoModelKeyboard(isRu, 'image')
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
  // Jump to handleStandardImage (step index 5)
  return ctx.wizard.selectStep(5) // Explicitly set step index 5
})

handleKlingModeSelection.action('kling_morphing', async ctx => {
  const isRu = isRussianFromState(ctx)
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

  const finalPriceInStars = calculateFinalPrice(modelKey)
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
    const keyboardMarkup = videoModelKeyboard(isRu, 'morph')
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
    ? '🖼️ Отправьте ПЕРВОЕ изображение для морфинга'
    : '🖼️ Send the FIRST image for morphing'
  await ctx.reply(textRequestImageA, {
    reply_markup: createHelpCancelKeyboard(isRu).reply_markup,
  })
  // Jump to handleMorphingImageA (step index 4)
  return ctx.wizard.selectStep(4) // Explicitly set step index 4
})

// Error handler for unhandled callback queries
handleKlingModeSelection.use(async ctx => {
  const isRu = isRussianFromState(ctx)
  logger.warn(
    '[I2V Wizard] Unexpected action in handleKlingModeSelection:',
    ctx.callbackQuery
  )
  await ctx.answerCbQuery()
  await sendGenericErrorMessage(ctx, isRu)
  return ctx.scene.leave()
})

// Step 2.5: Handle Seedance Resolution Selection (Callback Query)
const handleSeedanceResolutionSelection = new Composer<MyContext>()
handleSeedanceResolutionSelection.action('seedance_480p', async ctx => {
  const isRu = isRussianFromState(ctx)
  await ctx.answerCbQuery()
  await ctx.editMessageReplyMarkup(undefined) // Remove inline keyboard

  const modelKey = ctx.session.videoModel as VideoModelKey
  if (!modelKey || modelKey !== 'seedance-1-pro') {
    logger.error('[I2V Wizard] Invalid/missing Seedance model key in session', {
      modelKey,
    })
    await sendGenericErrorMessage(ctx, isRu)
    return ctx.scene.leave()
  }

  // Set resolution and calculate price
  ctx.session.selectedResolution = '480p'
  const finalPriceInStars = 23 // 0.03 * 5 seconds * 150 multiplier (approximately)

  const userDetails: UserDetailsResult = await getUserDetailsSubscription(
    String(ctx.from?.id)
  )
  const currentBalance = userDetails?.stars || 0

  if (!(currentBalance >= finalPriceInStars)) {
    logger.info(
      `Insufficient balance for ${ctx.from?.id}. Has: ${currentBalance}, Needs (final): ${finalPriceInStars}`
    )
    const textInsufficient = isRu
      ? `😕 Недостаточно звезд (${finalPriceInStars} ⭐). Баланс: ${Math.floor(currentBalance)} ⭐.`
      : `😕 Insufficient stars (${finalPriceInStars} ⭐). Balance: ${Math.floor(currentBalance)} ⭐.`
    await ctx.reply(textInsufficient)

    // Reshow model selection
    const keyboardMarkup = videoModelKeyboard(isRu, 'image')
    const textSelectAnother = isRu
      ? '🤔 Выберите другую модель:'
      : '🤔 Choose another model:'
    await ctx.reply(textSelectAnother, {
      reply_markup: keyboardMarkup.reply_markup,
    })
    return ctx.wizard.selectStep(0)
  }

  ctx.session.paymentAmount = finalPriceInStars
  ctx.session.is_morphing = false

  const textResolutionChosen = isRu
    ? `✅ Выбрано: Seedance Pro 480p (${finalPriceInStars} ⭐).`
    : `✅ Selected: Seedance Pro 480p (${finalPriceInStars} ⭐).`
  await ctx.reply(textResolutionChosen)

  const textRequestImage = isRu
    ? '🖼️ Теперь отправьте изображение для генерации видео'
    : '🖼️ Now send an image for video generation'
  await ctx.reply(textRequestImage, {
    reply_markup: createHelpCancelKeyboard(isRu).reply_markup,
  })
  return ctx.wizard.selectStep(5) // Jump to handleStandardImage
})

handleSeedanceResolutionSelection.action('seedance_1080p', async ctx => {
  const isRu = isRussianFromState(ctx)
  await ctx.answerCbQuery()
  await ctx.editMessageReplyMarkup(undefined) // Remove inline keyboard

  const modelKey = ctx.session.videoModel as VideoModelKey
  if (!modelKey || modelKey !== 'seedance-1-pro') {
    logger.error('[I2V Wizard] Invalid/missing Seedance model key in session', {
      modelKey,
    })
    await sendGenericErrorMessage(ctx, isRu)
    return ctx.scene.leave()
  }

  // Set resolution and calculate price
  ctx.session.selectedResolution = '1080p'
  const finalPriceInStars = 117 // 0.15 * 5 seconds * 150 multiplier (approximately)

  const userDetails: UserDetailsResult = await getUserDetailsSubscription(
    String(ctx.from?.id)
  )
  const currentBalance = userDetails?.stars || 0

  if (!(currentBalance >= finalPriceInStars)) {
    logger.info(
      `Insufficient balance for ${ctx.from?.id}. Has: ${currentBalance}, Needs (final): ${finalPriceInStars}`
    )
    const textInsufficient = isRu
      ? `😕 Недостаточно звезд (${finalPriceInStars} ⭐). Баланс: ${Math.floor(currentBalance)} ⭐.`
      : `😕 Insufficient stars (${finalPriceInStars} ⭐). Balance: ${Math.floor(currentBalance)} ⭐.`
    await ctx.reply(textInsufficient)

    // Reshow model selection
    const keyboardMarkup = videoModelKeyboard(isRu, 'image')
    const textSelectAnother = isRu
      ? '🤔 Выберите другую модель:'
      : '🤔 Choose another model:'
    await ctx.reply(textSelectAnother, {
      reply_markup: keyboardMarkup.reply_markup,
    })
    return ctx.wizard.selectStep(0)
  }

  ctx.session.paymentAmount = finalPriceInStars
  ctx.session.is_morphing = false

  const textResolutionChosen = isRu
    ? `✅ Выбрано: Seedance Pro 1080p (${finalPriceInStars} ⭐).`
    : `✅ Selected: Seedance Pro 1080p (${finalPriceInStars} ⭐).`
  await ctx.reply(textResolutionChosen)

  const textRequestImage = isRu
    ? '🖼️ Теперь отправьте изображение для генерации видео'
    : '🖼️ Now send an image for video generation'
  await ctx.reply(textRequestImage, {
    reply_markup: createHelpCancelKeyboard(isRu).reply_markup,
  })
  return ctx.wizard.selectStep(5) // Jump to handleStandardImage
})

// Error handler for unhandled callback queries in Seedance resolution selection
handleSeedanceResolutionSelection.use(async ctx => {
  const isRu = isRussianFromState(ctx)
  logger.warn(
    '[I2V Wizard] Unexpected action in handleSeedanceResolutionSelection:',
    ctx.callbackQuery
  )
  await ctx.answerCbQuery()
  await sendGenericErrorMessage(ctx, isRu)
  return ctx.scene.leave()
})

// Step 3: Handle Morph Image A
const handleMorphImageA = new Composer<MyContext>()
handleMorphImageA.on('photo', async ctx => {
  const isRu = isRussianFromState(ctx)

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
  return ctx.wizard.next() // Go to handleMorphImageB (step index 5) - Check this index!
})
// Fallback for non-photo messages in this step
handleMorphImageA.use(async ctx => {
  const isRu = isRussianFromState(ctx)
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
  const isRu = isRussianFromState(ctx)

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
  const isRu = isRussianFromState(ctx)
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
  const isRu = isRussianFromState(ctx)
  const prompt = ctx.message?.text

  // Handle Help/Cancel first
  const isCancel = await handleHelpCancel(ctx)
  if (isCancel) {
    return ctx.scene.leave()
  }

  // --- Added: Command Check ---
  if (prompt?.startsWith('/')) {
    logger.info('[I2V Wizard] Command received instead of prompt, ignoring.', {
      telegramId: ctx.from?.id,
      command: prompt,
    })
    const text = isRu
      ? '❗️ Пожалуйста, введите текстовое описание (промпт), а не команду. Для выхода используйте /cancel.'
      : '❗️ Please enter a text description (prompt), not a command. Use /cancel to exit.'
    await ctx.reply(text)
    return // Stay on this step
  }
  // --- End Added Check ---

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

  // --- Modified: Start Background Generation ---
  // Send confirmation message
  const textStart = isRu
    ? '✅ Запрос принят! Начинаю генерацию видео... Это может занять некоторое время. О результате сообщу отдельно.'
    : '✅ Request accepted! Starting video generation... This might take a while. I will notify you separately about the result.'
  await ctx.reply(textStart, Markup.removeKeyboard())

  // Start the generation in the background (no await)
  startGenerateImageToVideoInBackground(ctx)

  // Leave the scene immediately after starting the background task
  return ctx.scene.leave()
  // --- End Modification ---
})
// Fallback for non-text messages
handlePrompt.use(async ctx => {
  const isRu = isRussianFromState(ctx)
  // HARDCODED TEXT
  const text = isRu
    ? '✍️ Пожалуйста, введите промпт текстом.'
    : '✍️ Please enter the prompt as text.'
  await ctx.reply(text)
})

// --- New Function to Start Generation in Background ---
async function startGenerateImageToVideoInBackground(ctx: MyContext) {
  const isRu = isRussianFromState(ctx)
  const { videoModel, is_morphing, imageAUrl, imageBUrl, imageUrl, prompt } =
    ctx.session
  const telegram_id = ctx.from?.id.toString()
  const username = ctx.from?.username || 'unknown'
  const botInfo = await ctx.telegram.getMe()
  const bot_name = botInfo.username

  if (!videoModel || !telegram_id || !bot_name || !ctx.from?.id) {
    logger.error(
      '[I2V Wizard BG] Missing essential data in session for submission',
      { session: ctx.session }
    )
    // We can't easily send an error back to the user here as the original interaction finished
    // Log the error thoroughly
    return
  }

  // Validate required fields based on mode
  let validationError = null
  if (is_morphing) {
    if (!imageAUrl || !imageBUrl || !prompt) {
      validationError = '[I2V Wizard BG] Missing morphing data for submission'
      logger.error(validationError, { imageAUrl, imageBUrl, prompt })
    }
  } else {
    if (!imageUrl || !prompt) {
      validationError = '[I2V Wizard BG] Missing standard data for submission'
      logger.error(validationError, { imageUrl, prompt })
    }
  }

  if (validationError) {
    // Log the error, can't easily notify the user at this point
    return
  }

  try {
    logger.info('[I2V Wizard BG] Starting background generation job', {
      modelId: videoModel,
      telegram_id: ctx.from.id,
      username: ctx.from.username,
      isRu,
      botName: ctx.botInfo.username,
      imageUrl, // Log all relevant data
      prompt,
      isMorphing: is_morphing ?? false,
      imageAUrl,
      imageBUrl,
    })

    // Call generateImageToVideo - this will be modified later
    // to handle the background execution and result sending
    // For now, just call it. The key is NO AWAIT here on this specific call
    // if generateImageToVideo itself becomes fully async internally.
    // If generateImageToVideo still has awaits for replicate, etc.,
    // we need to wrap this call itself, e.g., `Promise.resolve().then(() => generateImageToVideo(...))`
    // or use a dedicated job queue if we had one.
    // Let's assume for now `generateImageToVideo` will be refactored to handle its own async nature.
    // We pass necessary context for sending the final message.

    // IMPORTANT: generateImageToVideo signature will change in the next step!
    // It will need ctx.telegram and ctx.from.id to send the result back.
    // We pass them now in preparation.
    generateImageToVideo(
      String(ctx.from.id),
      ctx.from.username ?? 'unknown',
      isRu,
      ctx.botInfo.username,
      videoModel,
      imageUrl, // Pass imageUrl directly
      prompt!, // Prompt is validated to exist
      is_morphing ?? false,
      imageAUrl, // Pass imageAUrl directly
      imageBUrl, // Pass imageBUrl directly
      ctx.telegram, // Pass telegram instance
      ctx.from.id, // Pass chat id (which is the user id for private chat)
      ctx.session.selectedResolution // Pass selected resolution for Seedance
    ).catch(bgError => {
      // Catch errors specifically from the background execution of generateImageToVideo
      logger.error(
        '[I2V Wizard BG] Error during generateImageToVideo execution',
        {
          error: bgError,
          telegram_id: ctx.from?.id,
        }
      )
      // Attempt to notify user about the background failure
      ctx.telegram
        .sendMessage(
          ctx.from!.id,
          isRu
            ? '❌ Произошла фоновая ошибка при генерации вашего видео.'
            : '❌ A background error occurred during your video generation.'
        )
        .catch(sendError => {
          logger.error(
            '[I2V Wizard BG] Failed to send background error notification',
            { sendError, telegram_id: ctx.from?.id }
          )
        })
    })

    logger.info('[I2V Wizard BG] Background generation initiated', {
      telegram_id: ctx.from.id,
    })
  } catch (error) {
    logger.error('[I2V Wizard BG] Error setting up background generation', {
      error,
      telegram_id,
    })
    // Attempt to notify user about the setup failure
    try {
      await ctx.telegram.sendMessage(
        ctx.from!.id,
        isRu
          ? '❌ Не удалось запустить фоновую генерацию видео.'
          : '❌ Failed to start background video generation.'
      )
    } catch (sendError) {
      logger.error('[I2V Wizard BG] Failed to send setup error notification', {
        sendError,
        telegram_id,
      })
    }
  }
}

// --- Wizard Definition --- //
export const imageToVideoWizard = new Scenes.WizardScene<MyContext>(
  ModeEnum.ImageToVideo, // Scene ID
  askModelStep, // Step 0: Ask Model (or jump if morphing)
  handleModelSelection, // Step 1: Handle standard model selection / Kling choice / Seedance choice
  handleSeedanceResolutionSelection, // Step 2: Handle Seedance resolution selection (480p/1080p)
  handleKlingModeSelection, // Step 3: Handle Kling mode (standard/morphing) action
  handleMorphImageA, // Step 4: Handle Image A for morphing
  handleMorphImageBOrStandardImage, // Step 5: Handle Image B (morph) OR Standard Image
  handlePrompt // Step 6: Handle Prompt (now starts background task and leaves)
  // Step 7 is now handled by the background task initiated in Step 6
)

// Add HELP and CANCEL handlers to the scene
imageToVideoWizard.help(handleHelpCancel)
imageToVideoWizard.command('cancel', handleHelpCancel)

logger.info(
  '⚡️ ImageToVideo Wizard Scene initialized with Morphing logic and localized texts - Refactored for background generation'
)
