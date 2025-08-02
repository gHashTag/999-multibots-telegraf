import { ApiResponse, GenerationResult } from '@/interfaces'
import { replicate } from '@/core/replicate'
import { savePrompt } from '@/core/supabase'
import { downloadFile } from '@/helpers'
import { processApiResponse } from '@/helpers/error'
import { pulse } from '@/helpers/pulse'
import {
  getUserByTelegramIdString,
  updateUserLevelPlusOne,
} from '@/core/supabase'
import { FLUX_KONTEXT_MODELS } from '@/price/models'
import { calculateFinalImageCostInStars } from '@/price/models/IMAGES_MODELS'
import { logger, logSessionSafely } from '@/utils/logger'
import { ModeEnum } from '@/interfaces/modes'
import { processBalanceOperation } from '@/price/helpers'
import { refundUser } from '@/price/helpers/refundUser'
import { calculateFinalPriceInStars } from '@/interfaces/paidServices'
import { MyContext } from '@/interfaces'
import { saveFileLocally } from '@/helpers/saveFileLocally'
import path from 'path'
import fs from 'fs'
import { Markup } from 'telegraf'

// Больше не нужна функция createEditResultKeyboard для лид-магнета
// Убрана чтобы упростить интерфейс

export interface FluxKontextParams {
  prompt: string
  inputImageUrl: string
  modelType: 'pro' | 'max'
  telegram_id: string
  username: string
  is_ru: boolean
  ctx: MyContext
}

// Новый интерфейс для продвинутого FLUX Kontext
export interface AdvancedFluxKontextParams {
  prompt: string
  mode:
    | 'quick'
    | 'single'
    | 'multi'
    | 'portrait_series'
    | 'haircut'
    | 'landmarks'
    | 'headshot'
  imageA: string // Первое изображение (обязательно)
  imageB?: string // Второе изображение (для multi режима)
  modelType: 'pro' | 'max'
  telegram_id: string
  username: string
  is_ru: boolean
  ctx: MyContext
  cameraSettings?: string // Настройки камеры для FLUX Kontext
}

export const generateFluxKontext = async (
  params: FluxKontextParams
): Promise<GenerationResult> => {
  console.log('🔥 [CRITICAL] generateFluxKontext CALLED with params:', {
    telegram_id: params.telegram_id,
    modelType: params.modelType,
    promptLength: params.prompt?.length,
    inputImageUrl: params.inputImageUrl ? 'present' : 'missing',
    username: params.username,
    is_ru: params.is_ru,
  })

  try {
    const {
      prompt,
      inputImageUrl,
      modelType,
      telegram_id,
      username,
      is_ru,
      ctx,
    } = params

    console.log(
      '🔥 [CRITICAL] generateFluxKontext params destructured successfully'
    )

    const modelKey = `black-forest-labs/flux-kontext-${modelType}`
    const modelConfig = FLUX_KONTEXT_MODELS[modelKey]

    console.log('🔥 [CRITICAL] Model config:', {
      modelKey,
      configExists: !!modelConfig,
      costPerImage: modelConfig?.costPerImage,
    })

    if (!modelConfig) {
      console.error('🚨 [CRITICAL] Model config not found for:', modelKey)
      throw new Error(`Неподдерживаемый тип модели: ${modelKey}`)
    }

    // Проверка существования пользователя
    const userExists = await getUserByTelegramIdString(telegram_id)
    if (!userExists) {
      throw new Error(`User with ID ${telegram_id} does not exist.`)
    }

    const level = userExists.level
    if (level === 10) {
      await updateUserLevelPlusOne(telegram_id, level)
    }

    // Проверка баланса
    const balanceCheck = await processBalanceOperation({
      ctx,
      telegram_id: Number(telegram_id),
      paymentAmount: modelConfig.costPerImage,
      is_ru,
    })

    console.log('🔥 [CRITICAL] Balance check completed:', {
      success: balanceCheck.success,
      telegram_id,
    })

    if (!balanceCheck.success) {
      console.error('🚨 [CRITICAL] Balance check failed:', {
        telegram_id,
        balanceCheck,
      })
      throw new Error('Not enough stars')
    }

    logger.info(
      '[generateFluxKontext] Balance check passed, sending status message',
      {
        telegram_id,
        balanceSuccess: balanceCheck.success,
      }
    )

    console.log(
      '🔥 [CRITICAL] About to send status message to telegram_id:',
      telegram_id
    )

    // Отправка сообщения о начале редактирования с обработкой ошибок
    try {
      console.log('🔥 [CRITICAL] Calling ctx.telegram.sendMessage...')

      await ctx.telegram.sendMessage(
        telegram_id,
        is_ru
          ? '✨ Редактирую изображение с помощью FLUX Kontext...'
          : '✨ Editing image with FLUX Kontext...',
        {
          reply_markup: { remove_keyboard: true },
        }
      )

      console.log('🔥 [CRITICAL] Status message sent successfully!')

      logger.info('[generateFluxKontext] Status message sent successfully', {
        telegram_id,
      })
    } catch (messageError) {
      console.error('🚨 [CRITICAL] Status message failed:', {
        telegram_id,
        error: messageError,
        errorMessage:
          messageError instanceof Error
            ? messageError.message
            : 'Unknown error',
      })

      logger.error('[generateFluxKontext] Failed to send status message:', {
        telegram_id,
        error: messageError,
      })
      // Продолжаем выполнение даже если сообщение не отправилось
    }

    // Подготовка параметров для API
    const inputParams = {
      prompt,
      input_image: inputImageUrl,
      aspect_ratio: '9:16', // Формат для Instagram Stories
    }

    console.log('🔥 [CRITICAL] About to call Replicate API:', {
      modelKey,
      inputParams: {
        prompt: prompt.substring(0, 100) + '...',
        input_image: inputImageUrl ? 'present' : 'missing',
      },
      telegram_id,
    })

    logger.info(`FLUX Kontext editing started`, {
      modelKey,
      prompt,
      telegram_id,
      inputParams,
    })

    console.log('🔥 [CRITICAL] Calling replicate.run...')

    let output: ApiResponse
    try {
      // Первая попытка с оригинальным промптом
      output = (await replicate.run(modelKey as any, {
        input: inputParams,
      })) as ApiResponse
    } catch (error: any) {
      console.log('🚨 [CRITICAL] First attempt failed, checking error type:', {
        errorMessage: error?.message,
        isSensitiveContent: error?.message?.includes('E005'),
      })

      // Если ошибка связана с чувствительным контентом, пробуем упрощенный промпт
      if (
        error?.message?.includes('E005') ||
        error?.message?.includes('sensitive')
      ) {
        console.log('🔄 [CRITICAL] Retrying with safer prompt...')

        // Создаем безопасный fallback промпт
        const safePrompt = `[Portrait. Aspect ratio 9:16] Professional headshot of a person in stylish modern clothing. Clean studio lighting, neutral background, fashionable appearance.`

        const safeInputParams = {
          ...inputParams,
          prompt: safePrompt,
        }

        try {
          output = (await replicate.run(modelKey as any, {
            input: safeInputParams,
          })) as ApiResponse

          console.log('✅ [CRITICAL] Fallback prompt succeeded!')
        } catch (fallbackError: any) {
          console.error('🚨 [CRITICAL] Even fallback failed:', fallbackError)
          throw error // Бросаем оригинальную ошибку
        }
      } else {
        throw error // Бросаем оригинальную ошибку для других типов ошибок
      }
    }

    console.log('🔥 [CRITICAL] Replicate API completed!')

    logger.info('[generateFluxKontext] API generation completed', {
      telegram_id,
      outputReceived: !!output,
      modelKey,
    })

    const editedImageUrl = await processApiResponse(output)

    logger.info('[generateFluxKontext] Image URL processed', {
      telegram_id,
      editedImageUrl: editedImageUrl ? 'received' : 'failed',
    })

    // Сохранение локально
    const imageLocalPath = await saveFileLocally(
      telegram_id,
      editedImageUrl,
      'flux-kontext-edit',
      '.jpeg'
    )

    console.log('🔥 [CRITICAL] File saved locally:', {
      imageLocalPath,
      telegram_id,
      fileExists: fs.existsSync(imageLocalPath),
    })

    const imageLocalUrl = `/uploads/${telegram_id}/flux-kontext-edit/${path.basename(
      imageLocalPath
    )}`

    console.log('🔥 [CRITICAL] Local URL created:', {
      imageLocalUrl,
      telegram_id,
    })

    // Сохранение промпта
    const prompt_id = await savePrompt(
      `KONTEXT EDIT: ${prompt}`,
      modelKey,
      imageLocalUrl,
      Number(telegram_id)
    )

    console.log('🔥 [CRITICAL] Prompt saved:', {
      prompt_id,
      telegram_id,
    })

    if (prompt_id === null) {
      console.error('🚨 [CRITICAL] prompt_id is null!', { telegram_id })
      throw new Error('prompt_id is null')
    }

    console.log('🔥 [CRITICAL] About to download file for sending:', {
      editedImageUrl,
      telegram_id,
    })

    // Скачивание для отправки
    const image = await downloadFile(editedImageUrl)

    console.log('🔥 [CRITICAL] File downloaded for sending:', {
      imageSize: image?.length || 'unknown',
      telegram_id,
    })

    logger.info('[generateFluxKontext] About to send photo to user', {
      telegram_id,
      imageLocalPath,
      fileExists: fs.existsSync(imageLocalPath),
      mode: 'edit',
      modelType,
    })

    console.log('🔥 [CRITICAL] About to call ctx.telegram.sendPhoto:', {
      telegram_id,
      imageLocalPath,
      fileExists: fs.existsSync(imageLocalPath),
      mode: 'edit',
    })

    // Отправка отредактированного изображения с обработкой ошибок
    try {
      console.log('🔥 [CRITICAL] Calling ctx.telegram.sendPhoto now...')

      // Укорачиваем промпт для подписи (Telegram лимит: 1024 символа)
      const maxPromptLength = 600 // Оставляем больше места для рекламы бота
      const shortPrompt =
        prompt.length > maxPromptLength
          ? prompt.substring(0, maxPromptLength) + '...'
          : prompt

      // Получаем имя бота для рекламы
      const botUsername = ctx.botInfo?.username || 'neuroblogger_bot'

      // Лид-магнет: призыв к покупке полной версии
      const leadMagnetPromo = is_ru
        ? `\n\n🎯 <b>Вам понравилось?</b>\n\n💡 Это лишь ДЕМО наших AI-возможностей!\n🔥 В полной версии доступны:\n• ЛЮБЫЕ стили и образы\n• Неограниченные трансформации\n• Эксклюзивные AI-модели\n• Приоритетная обработка\n\n💰 Оформите подписку и получите доступ ко ВСЕМ функциям бота!\n📱 Нажмите /start для покупки\n\n🤖 Создано в @${botUsername}`
        : `\n\n🎯 <b>Did you like it?</b>\n\n💡 This is just a DEMO of our AI capabilities!\n🔥 In full version available:\n• ANY styles and looks\n• Unlimited transformations\n• Exclusive AI models\n• Priority processing\n\n💰 Get subscription and access ALL bot features!\n📱 Press /start to purchase\n\n🤖 Created by @${botUsername}`

      await ctx.telegram.sendPhoto(
        telegram_id,
        {
          source: fs.createReadStream(imageLocalPath),
        },
        {
          caption: is_ru
            ? `🎨 <b>Демо-трансформация завершена!</b>\n\n✨ Пример стиля применён успешно\n🚀 Технология: FLUX Kontext ${modelType.toUpperCase()}${leadMagnetPromo}`
            : `🎨 <b>Demo transformation completed!</b>\n\n✨ Example style applied successfully\n🚀 Technology: FLUX Kontext ${modelType.toUpperCase()}${leadMagnetPromo}`,
          parse_mode: 'HTML',
          // Убираем reply_markup - больше никаких кнопок!
        }
      )

      console.log(
        '🔥 [CRITICAL] ctx.telegram.sendPhoto completed successfully!'
      )

      logger.info('[generateFluxKontext] Photo sent successfully', {
        telegram_id,
        mode: 'edit',
        modelType,
      })
    } catch (photoError) {
      console.error('🚨 [CRITICAL] ctx.telegram.sendPhoto FAILED:', {
        telegram_id,
        error: photoError,
        errorMessage:
          photoError instanceof Error ? photoError.message : 'Unknown error',
        errorStack: photoError instanceof Error ? photoError.stack : undefined,
      })

      logger.error('[generateFluxKontext] Failed to send photo:', {
        telegram_id,
        error: photoError,
        imageLocalPath,
        mode: 'edit',
      })

      console.log('🔥 [CRITICAL] Sending fallback error message...')

      await ctx.reply(
        is_ru
          ? `❌ *Ошибка при отправке изображения*\n\n🔄 Изображение было создано, но произошла ошибка при отправке\n💡 Попробуйте позже или обратитесь в поддержку\n\n📝 Запрос: ${prompt}\n🤖 Модель: FLUX Kontext ${modelType.toUpperCase()}`
          : `❌ *Error sending image*\n\n🔄 Image was created but failed to send\n💡 Try later or contact support\n\n📝 Prompt: ${prompt}\n🤖 Model: FLUX Kontext ${modelType.toUpperCase()}`,
        { parse_mode: 'Markdown' }
      )

      console.log('🔥 [CRITICAL] Fallback message sent')

      // НЕ выбрасываем ошибку - позволяем процессу завершиться нормально
    }

    // Сохраняем информацию о последнем изображении для upscaling
    if (ctx.session) {
      ctx.session.lastGeneratedImageUrl = editedImageUrl
      ctx.session.lastGeneratedPrompt = prompt
      logSessionSafely(
        {
          telegram_id,
          lastImageUrl: editedImageUrl,
          lastPrompt: prompt,
          sessionExists: !!ctx.session,
        },
        '🔍 SAVE SESSION: Standard FLUX Kontext'
      )
    } else {
      console.log(
        '❌ SAVE SESSION: ctx.session is null for standard FLUX Kontext',
        { telegram_id }
      )
    }

    // Pulse для аналитики
    await pulse(
      imageLocalPath,
      `KONTEXT: ${prompt}`,
      `/flux-kontext-${modelType}`,
      telegram_id,
      username,
      is_ru,
      ctx.botInfo?.username ?? 'unknown_bot'
    )

    logger.info(`FLUX Kontext editing completed successfully`, {
      prompt_id,
      telegram_id,
      modelKey,
    })

    return { image, prompt_id }
  } catch (error) {
    logger.error('FLUX Kontext editing failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      telegram_id: params.telegram_id,
      prompt: params.prompt,
    })

    let errorMessageToUser = '❌ Произошла ошибка при редактировании.'
    if (error instanceof Error) {
      if (error.message && error.message.includes('NSFW content detected')) {
        errorMessageToUser = params.is_ru
          ? '❌ Обнаружен NSFW контент. Пожалуйста, попробуйте другой запрос.'
          : '❌ NSFW content detected. Please try another prompt.'
      } else if (error.message && error.message.includes('Not enough stars')) {
        errorMessageToUser = params.is_ru
          ? '❌ Недостаточно звёзд для редактирования изображения.'
          : '❌ Not enough stars for image editing.'
      } else if (error.message) {
        const match = error.message.match(/{"detail":"(.*?)"/)
        if (match) {
          errorMessageToUser = `❌ ${match[1]}`
        }
      }
    }

    params.ctx.telegram.sendMessage(params.telegram_id, errorMessageToUser)
    throw error
  }
}

// Продвинутая функция для FLUX Kontext с поддержкой нескольких изображений
export const generateAdvancedFluxKontext = async (
  params: AdvancedFluxKontextParams
): Promise<GenerationResult> => {
  try {
    const {
      prompt,
      mode,
      imageA,
      imageB,
      modelType,
      telegram_id,
      username,
      is_ru,
      ctx,
    } = params

    // Выбираем модель в зависимости от режима
    let modelKey: string
    if (mode === 'multi') {
      // Для режима объединения двух изображений используем специальную модель
      modelKey = 'flux-kontext-apps/multi-image-kontext-pro'
    } else {
      // Для остальных режимов используем стандартные модели
      modelKey = `black-forest-labs/flux-kontext-${modelType}`
    }

    const modelConfig = FLUX_KONTEXT_MODELS[modelKey]

    if (!modelConfig) {
      throw new Error(`Неподдерживаемый тип модели: ${modelKey}`)
    }

    // Проверка существования пользователя
    const userExists = await getUserByTelegramIdString(telegram_id)
    if (!userExists) {
      throw new Error(`User with ID ${telegram_id} does not exist.`)
    }

    const level = userExists.level
    if (level === 10) {
      await updateUserLevelPlusOne(telegram_id, level)
    }

    // Определяем стоимость в зависимости от режима
    let cost = modelConfig.costPerImage
    const originalCost = cost

    if (mode === 'multi' || mode === 'portrait_series') {
      cost = Math.round(cost * 1.5) // Увеличиваем стоимость для сложных режимов

      logger.info(`Advanced FLUX Kontext pricing applied`, {
        mode,
        originalCost,
        finalCost: cost,
        markup: '50%',
        telegram_id,
      })
    } else {
      logger.info(`Standard FLUX Kontext pricing`, {
        mode,
        cost,
        telegram_id,
      })
    }

    // Проверка баланса
    const balanceCheck = await processBalanceOperation({
      ctx,
      telegram_id: Number(telegram_id),
      paymentAmount: cost,
      is_ru,
    })

    console.log('🔥 [CRITICAL] Balance check completed:', {
      success: balanceCheck.success,
      telegram_id,
    })

    if (!balanceCheck.success) {
      console.error('🚨 [CRITICAL] Balance check failed:', {
        telegram_id,
        balanceCheck,
      })
      throw new Error('Not enough stars')
    }

    // Получаем название режима для отображения
    const modeNames = {
      quick: is_ru ? '⚡ Быстрое редактирование' : '⚡ Quick Edit',
      single: is_ru ? 'Одиночное редактирование' : 'Single Image Edit',
      multi: is_ru ? '🔗 Объединение изображений' : '🔗 Multi-Image Combine',
      portrait_series: is_ru ? 'Серия портретов' : 'Portrait Series',
      haircut: is_ru ? 'Изменение стрижки' : 'Change Haircut',
      landmarks: is_ru ? 'Знаменитые места' : 'Iconic Locations',
      headshot: is_ru ? 'Профессиональный портрет' : 'Professional Headshot',
    }

    // Получаем название режима с fallback
    const modeName =
      modeNames[mode as keyof typeof modeNames] ||
      (is_ru ? 'Стандартное редактирование' : 'Standard Edit')

    // Отправка сообщения о начале обработки
    await ctx.telegram.sendMessage(
      telegram_id,
      is_ru
        ? `✨ Обрабатываю изображение в режиме "${modeName}"...\n\n💎 Стоимость: ${cost} ⭐${cost > originalCost ? ` (базовая ${originalCost}⭐ + наценка ${cost - originalCost}⭐)` : ''}`
        : `✨ Processing image in "${modeName}" mode...\n\n💎 Cost: ${cost} ⭐${cost > originalCost ? ` (base ${originalCost}⭐ + markup ${cost - originalCost}⭐)` : ''}`,
      {
        reply_markup: { remove_keyboard: true },
      }
    )

    // Подготовка параметров в зависимости от режима
    const inputParams: any = {
      prompt: enhancePromptForMode(prompt, mode, is_ru),
      input_image: imageA,
    }

    // Для мульти-режима добавляем второе изображение
    if (mode === 'multi' && imageB) {
      // Для модели flux-kontext-apps/multi-image-kontext-pro используем второе изображение
      inputParams.input_image_2 = imageB
      inputParams.prompt = `Combine and merge these two images seamlessly: ${prompt}. Create a natural composition that blends both images while maintaining coherent lighting, perspective, and artistic style.`

      logger.info('Multi-image mode: Using both images', {
        telegram_id,
        hasImageA: !!imageA,
        hasImageB: !!imageB,
        modelKey,
      })
    }

    logger.info(`Advanced FLUX Kontext editing started`, {
      modelKey,
      mode,
      prompt: inputParams.prompt,
      telegram_id,
      hasImageB: !!imageB,
    })

    // Генерация отредактированного изображения
    const output: ApiResponse = (await replicate.run(modelKey as any, {
      input: inputParams,
    })) as ApiResponse

    const editedImageUrl = await processApiResponse(output)

    // Сохранение локально
    const imageLocalPath = await saveFileLocally(
      telegram_id,
      editedImageUrl,
      `flux-kontext-${mode}`,
      '.jpeg'
    )

    const imageLocalUrl = `/uploads/${telegram_id}/flux-kontext-${mode}/${path.basename(
      imageLocalPath
    )}`

    // Сохранение промпта с указанием режима
    const prompt_id = await savePrompt(
      `FLUX KONTEXT [${mode.toUpperCase()}]: ${prompt}`,
      modelKey,
      imageLocalUrl,
      Number(telegram_id)
    )

    if (prompt_id === null) {
      throw new Error('prompt_id is null')
    }

    // Скачивание для отправки
    const image = await downloadFile(editedImageUrl)

    // Создание упрощенной клавиатуры для результатов
    const advancedKeyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback(
          is_ru ? '✨ Ещё редактирование' : '✨ More editing',
          'more_editing'
        ),
        Markup.button.callback(
          is_ru ? '🔄 Другой режим' : '🔄 Different mode',
          'different_mode'
        ),
      ],
      [
        Markup.button.callback(
          is_ru ? '⬆️ Увеличить качество' : '⬆️ Upscale',
          'upscale_image'
        ),
      ],
      [
        Markup.button.callback(
          is_ru ? '🏠 Главное меню' : '🏠 Main menu',
          'go_main_menu'
        ),
      ],
    ])

    // Отправка результата
    await ctx.telegram.sendPhoto(
      telegram_id,
      {
        source: fs.createReadStream(imageLocalPath),
      },
      {
        caption: is_ru
          ? `✨ Изображение обработано!\n\n🎯 Режим: ${modeName}\n📝 Запрос: ${prompt}\n🤖 Модель: ${mode === 'multi' ? 'FLUX Multi-Kontext' : `FLUX Kontext ${modelType.toUpperCase()}`}\n💎 Стоимость: ${cost} ⭐${cost > originalCost ? ` (базовая ${originalCost}⭐ + наценка ${cost - originalCost}⭐)` : ''}`
          : `✨ Image processed!\n\n🎯 Mode: ${modeName}\n📝 Prompt: ${prompt}\n🤖 Model: ${mode === 'multi' ? 'FLUX Multi-Kontext' : `FLUX Kontext ${modelType.toUpperCase()}`}\n💎 Cost: ${cost} ⭐${cost > originalCost ? ` (base ${originalCost}⭐ + markup ${cost - originalCost}⭐)` : ''}`,
        reply_markup: advancedKeyboard.reply_markup,
      }
    )

    // Сохраняем информацию о последнем изображении для upscaling
    if (ctx.session) {
      ctx.session.lastGeneratedImageUrl = editedImageUrl
      ctx.session.lastGeneratedPrompt = prompt
      logSessionSafely(
        {
          telegram_id,
          lastImageUrl: editedImageUrl,
          lastPrompt: prompt,
          sessionExists: !!ctx.session,
        },
        '🔍 SAVE SESSION: Advanced FLUX Kontext'
      )
    } else {
      console.log(
        '❌ SAVE SESSION: ctx.session is null for advanced FLUX Kontext',
        { telegram_id }
      )
    }

    // Pulse для аналитики
    await pulse(
      imageLocalPath,
      `FLUX KONTEXT [${mode.toUpperCase()}]: ${prompt}`,
      `/flux-kontext-advanced-${mode}`,
      telegram_id,
      username,
      is_ru,
      ctx.botInfo?.username ?? 'unknown_bot'
    )

    logger.info(`Advanced FLUX Kontext editing completed successfully`, {
      prompt_id,
      telegram_id,
      modelKey,
      mode,
    })

    return { image, prompt_id }
  } catch (error) {
    logger.error('Advanced FLUX Kontext editing failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      telegram_id: params.telegram_id,
      prompt: params.prompt,
      mode: params.mode,
    })

    let errorMessageToUser = '❌ Произошла ошибка при обработке изображения.'
    if (error instanceof Error) {
      if (error.message && error.message.includes('NSFW content detected')) {
        errorMessageToUser = params.is_ru
          ? '❌ Обнаружен NSFW контент. Пожалуйста, попробуйте другой запрос.'
          : '❌ NSFW content detected. Please try another prompt.'
      } else if (error.message && error.message.includes('Not enough stars')) {
        errorMessageToUser = params.is_ru
          ? '❌ Недостаточно звёзд для обработки изображения.'
          : '❌ Not enough stars for image processing.'
      } else if (
        error.message &&
        error.message.includes('flagged as sensitive')
      ) {
        errorMessageToUser = params.is_ru
          ? '🚫 Изображение или промпт содержат чувствительный контент.\n\n💡 Попробуйте:\n• Изменить описание\n• Использовать другое изображение\n• Упростить запрос\n\n🔄 Можете попробовать еще раз!'
          : '🚫 The image or prompt contains sensitive content.\n\n💡 Try:\n• Change the description\n• Use a different image\n• Simplify the request\n\n🔄 You can try again!'
      } else if (
        (error.message && error.message.includes('Prediction interrupted')) ||
        (error.message && error.message.includes('code: PA'))
      ) {
        errorMessageToUser = params.is_ru
          ? '⏸️ Обработка была прервана сервером.\n\n🔄 Это временная проблема - можете попробовать еще раз!\n\n💡 Совет: попробуйте через несколько секунд.'
          : '⏸️ Processing was interrupted by the server.\n\n🔄 This is a temporary issue - you can try again!\n\n💡 Tip: try again in a few seconds.'
      }
    }

    // Создаем клавиатуру с кнопкой "Попробовать снова" для определенных ошибок
    let replyMarkup: any = { remove_keyboard: true }

    if (
      error instanceof Error &&
      (error.message.includes('flagged as sensitive') ||
        error.message.includes('Prediction interrupted') ||
        error.message.includes('code: PA'))
    ) {
      replyMarkup = {
        inline_keyboard: [
          [
            {
              text: params.is_ru ? '🔄 Попробовать снова' : '🔄 Try Again',
              callback_data: 'flux_kontext_retry',
            },
          ],
          [
            {
              text: params.is_ru ? '🏠 Главное меню' : '🏠 Main Menu',
              callback_data: 'go_main_menu',
            },
          ],
        ],
      }
    }

    await params.ctx.telegram.sendMessage(
      params.telegram_id,
      errorMessageToUser,
      {
        reply_markup: replyMarkup,
      }
    )

    throw error
  }
}

// Функция для улучшения промпта в зависимости от режима
const enhancePromptForMode = (
  prompt: string,
  mode: string,
  is_ru: boolean
): string => {
  const enhancements = {
    single: prompt, // Обычное редактирование
    multi: `Combine and merge elements: ${prompt}. Seamlessly blend the composition, lighting, and style to create a cohesive single image.`,
    portrait_series: `Create a professional portrait series: ${prompt}. Generate multiple high-quality portrait variations with different expressions, lighting, and angles while maintaining the same person's identity.`,
    haircut: `Hair and hairstyle transformation: ${prompt}. Focus on changing the hairstyle, hair color, or hair length while preserving the person's facial features and identity perfectly.`,
    landmarks: `Place in iconic location: ${prompt}. Seamlessly integrate the person into a famous landmark or tourist destination background while maintaining realistic lighting and perspective.`,
    headshot: `Professional business headshot: ${prompt}. Create a clean, professional portrait suitable for business use with neutral background, professional lighting, and polished appearance.`,
  }

  return enhancements[mode as keyof typeof enhancements] || prompt
}

// Функция для upscaling изображения с помощью Real-ESRGAN
export const upscaleFluxKontextImage = async (params: {
  imageUrl: string
  telegram_id: string
  username: string
  is_ru: boolean
  ctx: MyContext
  originalPrompt?: string
}): Promise<GenerationResult> => {
  const { imageUrl, telegram_id, username, is_ru, ctx, originalPrompt } = params

  // Стоимость upscaling - Clarity Upscaler с обновленной ценой $0.04 и наценкой 50%
  const clarityUpscalerCostUSD = 0.04 // Обновленная себестоимость Clarity Upscaler для разумной наценки
  const upscaleCost = calculateFinalPriceInStars(clarityUpscalerCostUSD) // Автоматический расчет с наценкой 50%

  // Объявляем переменную для проверки баланса в области видимости функции
  let balanceCheck: any = null

  try {
    // Проверка существования пользователя
    const userExists = await getUserByTelegramIdString(telegram_id)
    if (!userExists) {
      throw new Error(`User with ID ${telegram_id} does not exist.`)
    }

    // Проверка баланса
    balanceCheck = await processBalanceOperation({
      ctx,
      telegram_id: Number(telegram_id),
      paymentAmount: upscaleCost,
      is_ru,
    })

    console.log('🔥 [CRITICAL] Balance check completed:', {
      success: balanceCheck.success,
      telegram_id,
    })

    if (!balanceCheck.success) {
      console.error('🚨 [CRITICAL] Balance check failed:', {
        telegram_id,
        balanceCheck,
      })
      throw new Error('Not enough stars')
    }

    // Отправка сообщения о начале upscaling
    await ctx.telegram.sendMessage(
      telegram_id,
      is_ru
        ? `⬆️ Увеличиваю качество изображения с помощью Clarity Upscaler...\n\n🎯 Режим: Максимальное сохранение оригинала\n💎 Стоимость: ${upscaleCost} ⭐`
        : `⬆️ Upscaling image quality with Clarity Upscaler...\n\n🎯 Mode: Maximum original preservation\n💎 Cost: ${upscaleCost} ⭐`,
      {
        reply_markup: { remove_keyboard: true },
      }
    )

    logger.info(`Image upscaling started`, {
      model: 'philz1337x/clarity-upscaler',
      telegram_id,
      originalPrompt,
    })

    // Параметры для philz1337x/clarity-upscaler - используем только базовое изображение
    // Модель автоматически применит оптимальные настройки для качественного апскейлинга без креативных изменений
    const inputParams = {
      image: imageUrl,
      creativity: 0.1,
    }

    // Генерация upscaled изображения
    const output: ApiResponse = (await replicate.run(
      'philz1337x/clarity-upscaler:dfad41707589d68ecdccd1dfa600d55a208f9310748e44bfe35b4a6291453d5e',
      {
        input: inputParams,
      }
    )) as ApiResponse

    const upscaledImageUrl = await processApiResponse(output)

    // Сохранение локально
    const imageLocalPath = await saveFileLocally(
      telegram_id,
      upscaledImageUrl,
      'flux-kontext-upscaled',
      '.webp'
    )

    const imageLocalUrl = `/uploads/${telegram_id}/flux-kontext-upscaled/${path.basename(
      imageLocalPath
    )}`

    // Сохранение промпта
    const prompt_id = await savePrompt(
      `FLUX KONTEXT UPSCALED: ${originalPrompt || 'Image upscaling'}`,
      'philz1337x/clarity-upscaler',
      imageLocalUrl,
      Number(telegram_id)
    )

    if (prompt_id === null) {
      throw new Error('prompt_id is null')
    }

    // Отправка upscaled изображения (используем уже сохраненный локальный файл)
    await ctx.telegram.sendPhoto(
      telegram_id,
      {
        source: fs.createReadStream(imageLocalPath),
      },
      {
        caption: is_ru
          ? `⬆️ Качество изображения увеличено в 2 раза!\n\n🔧 Модель: Clarity Upscaler\n🎯 Режим: Сохранение оригинала\n✨ Качество: Высокое без искажений\n💎 Стоимость: ${upscaleCost} ⭐${originalPrompt ? `\n📝 Исходный запрос: ${originalPrompt}` : ''}`
          : `⬆️ Image quality enhanced 2x!\n\n🔧 Model: Clarity Upscaler\n🎯 Mode: Original preservation\n✨ Quality: High without distortion\n💎 Cost: ${upscaleCost} ⭐${originalPrompt ? `\n📝 Original prompt: ${originalPrompt}` : ''}`,
        reply_markup: Markup.inlineKeyboard([
          [
            Markup.button.callback(
              is_ru ? '✨ Ещё редактирование' : '✨ More editing',
              'more_editing'
            ),
          ],
          [
            Markup.button.callback(
              is_ru ? '⬆️ Увеличить качество' : '⬆️ Upscale',
              'upscale_image'
            ),
          ],
          [
            Markup.button.callback(
              is_ru ? '🏠 Главное меню' : '🏠 Main menu',
              'go_main_menu'
            ),
          ],
        ]).reply_markup,
      }
    )

    // Pulse для аналитики
    await pulse(
      imageLocalPath,
      `UPSCALED: ${originalPrompt || 'Image upscaling'}`,
      '/flux-kontext-upscale',
      telegram_id,
      username,
      is_ru,
      ctx.botInfo?.username ?? 'unknown_bot'
    )

    logger.info(`Image upscaling completed successfully`, {
      prompt_id,
      telegram_id,
      model: 'philz1337x/clarity-upscaler',
    })

    return { image: Buffer.alloc(0), prompt_id } // Возвращаем пустой буфер, т.к. файл уже отправлен
  } catch (error) {
    logger.error('Image upscaling failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      telegram_id: params.telegram_id,
      originalPrompt: params.originalPrompt,
    })

    // Возврат средств при ошибке (если деньги уже списались)
    if (balanceCheck?.success) {
      logger.info('Refunding user due to upscaling failure', {
        telegram_id: params.telegram_id,
        amount: upscaleCost,
      })
      try {
        await refundUser(params.ctx, upscaleCost)
      } catch (refundError) {
        logger.error('Failed to refund user after upscaling failure', {
          telegram_id: params.telegram_id,
          refundError:
            refundError instanceof Error
              ? refundError.message
              : 'Unknown refund error',
        })
      }
    }

    let errorMessageToUser = '❌ Произошла ошибка при увеличении качества.'
    if (error instanceof Error) {
      if (error.message && error.message.includes('Not enough stars')) {
        errorMessageToUser = params.is_ru
          ? '❌ Недостаточно звёзд для увеличения качества изображения.'
          : '❌ Not enough stars for image upscaling.'
      } else if (error.message) {
        const match = error.message.match(/{"detail":"(.*?)"/)
        if (match) {
          errorMessageToUser = `❌ ${match[1]}`
        }
      } else {
        // Добавляем информацию о возврате средств при ошибке
        errorMessageToUser = params.is_ru
          ? '❌ Произошла ошибка при увеличении качества. Средства возвращены на баланс.'
          : '❌ Error occurred during upscaling. Funds have been refunded.'
      }
    }

    await params.ctx.telegram.sendMessage(
      params.telegram_id,
      errorMessageToUser,
      {
        reply_markup: { remove_keyboard: true },
      }
    )

    throw error
  }
}
