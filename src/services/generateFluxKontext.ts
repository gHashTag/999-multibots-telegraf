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

// Создание клавиатуры для результатов редактирования
const createEditResultKeyboard = (is_ru: boolean) => {
  return Markup.inlineKeyboard([
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
  ])
}

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
}

export const generateFluxKontext = async (
  params: FluxKontextParams
): Promise<GenerationResult> => {
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

    const modelKey = `black-forest-labs/flux-kontext-${modelType}`
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

    // Проверка баланса
    const balanceCheck = await processBalanceOperation({
      ctx,
      telegram_id: Number(telegram_id),
      paymentAmount: modelConfig.costPerImage,
      is_ru,
    })

    if (!balanceCheck.success) {
      throw new Error('Not enough stars')
    }

    // Отправка сообщения о начале редактирования
    ctx.telegram.sendMessage(
      telegram_id,
      is_ru
        ? '✨ Редактирую изображение с помощью FLUX Kontext...'
        : '✨ Editing image with FLUX Kontext...',
      {
        reply_markup: { remove_keyboard: true },
      }
    )

    // Подготовка параметров для API
    const inputParams = {
      prompt,
      input_image: inputImageUrl,
    }

    logger.info(`FLUX Kontext editing started`, {
      modelKey,
      prompt,
      telegram_id,
      inputParams,
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
      'flux-kontext-edit',
      '.jpeg'
    )

    const imageLocalUrl = `/uploads/${telegram_id}/flux-kontext-edit/${path.basename(
      imageLocalPath
    )}`

    // Сохранение промпта
    const prompt_id = await savePrompt(
      `KONTEXT EDIT: ${prompt}`,
      modelKey,
      imageLocalUrl,
      Number(telegram_id)
    )

    if (prompt_id === null) {
      throw new Error('prompt_id is null')
    }

    // Скачивание для отправки
    const image = await downloadFile(editedImageUrl)

    // Отправка отредактированного изображения
    await ctx.telegram.sendPhoto(
      telegram_id,
      {
        source: fs.createReadStream(imageLocalPath),
      },
      {
        caption: is_ru
          ? `✨ Изображение отредактировано!\n\n📝 Запрос: ${prompt}\n🤖 Модель: FLUX Kontext ${modelType.toUpperCase()}`
          : `✨ Image edited!\n\n📝 Prompt: ${prompt}\n🤖 Model: FLUX Kontext ${modelType.toUpperCase()}`,
        reply_markup: createEditResultKeyboard(is_ru).reply_markup,
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

    const modelKey = `black-forest-labs/flux-kontext-${modelType}`
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

    if (!balanceCheck.success) {
      throw new Error('Not enough stars')
    }

    // Получаем название режима для отображения
    const modeNames = {
      single: is_ru ? 'Одиночное редактирование' : 'Single Image Edit',
      multi: is_ru ? 'Объединение изображений' : 'Multi-Image Combine',
      portrait_series: is_ru ? 'Серия портретов' : 'Portrait Series',
      haircut: is_ru ? 'Изменение стрижки' : 'Change Haircut',
      landmarks: is_ru ? 'Знаменитые места' : 'Iconic Locations',
      headshot: is_ru ? 'Профессиональный портрет' : 'Professional Headshot',
    }

    // Отправка сообщения о начале обработки
    await ctx.telegram.sendMessage(
      telegram_id,
      is_ru
        ? `✨ Обрабатываю изображение в режиме "${modeNames[mode]}"...\n\n💎 Стоимость: ${cost} ⭐${cost > originalCost ? ` (базовая ${originalCost}⭐ + наценка ${cost - originalCost}⭐)` : ''}`
        : `✨ Processing image in "${modeNames[mode]}" mode...\n\n💎 Cost: ${cost} ⭐${cost > originalCost ? ` (base ${originalCost}⭐ + markup ${cost - originalCost}⭐)` : ''}`,
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
      // В FLUX Kontext для объединения изображений может использоваться специальный подход
      // Пока используем первое изображение и модифицируем промпт
      inputParams.prompt = `Combine with second image: ${prompt}. Merge the elements, people, or objects from both images seamlessly while maintaining natural lighting and composition.`

      // TODO: Здесь можно добавить специальную логику для обработки второго изображения
      // Например, создать композитное изображение или использовать специальные техники
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
          ? `✨ Изображение обработано!\n\n🎯 Режим: ${modeNames[mode]}\n📝 Запрос: ${prompt}\n🤖 Модель: FLUX Kontext ${modelType.toUpperCase()}\n💎 Стоимость: ${cost} ⭐${cost > originalCost ? ` (базовая ${originalCost}⭐ + наценка ${cost - originalCost}⭐)` : ''}`
          : `✨ Image processed!\n\n🎯 Mode: ${modeNames[mode]}\n📝 Prompt: ${prompt}\n🤖 Model: FLUX Kontext ${modelType.toUpperCase()}\n💎 Cost: ${cost} ⭐${cost > originalCost ? ` (base ${originalCost}⭐ + markup ${cost - originalCost}⭐)` : ''}`,
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

    if (!balanceCheck.success) {
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
        reply_markup: createEditResultKeyboard(is_ru).reply_markup,
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
