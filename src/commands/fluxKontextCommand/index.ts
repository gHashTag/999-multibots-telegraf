import { MyContext } from '@/interfaces'
import {
  generateFluxKontext,
  FluxKontextParams,
} from '@/services/generateFluxKontext'
import { Markup } from 'telegraf'
import { logger } from '@/utils/logger'
import { cancelMenu } from '@/menu/cancelMenu'
import { cancelHelpArray } from '@/menu/cancelHelpArray'
import { ModeEnum } from '@/interfaces'
import { handleHelpCancel } from '@/handlers/handleHelpCancel'
import { FLUX_KONTEXT_CONFIG } from './config'
import { generateFluxKontextImage } from '@/services/generateFluxKontextImage'
import { sendGenericErrorMessage } from '@/menu'
import { handleMenu } from '@/handlers/handleMenu'
import { isRussianFromState } from '@/helpers/centralizedLanguage'

// Создание клавиатуры выбора модели
const createModelSelectionKeyboard = (is_ru: boolean) => {
  return Markup.keyboard([
    [
      { text: is_ru ? '💼 FLUX Kontext Pro' : '💼 FLUX Kontext Pro' },
      { text: is_ru ? '🚀 FLUX Kontext Max' : '🚀 FLUX Kontext Max' },
    ],
    ...cancelHelpArray(is_ru),
  ])
    .resize()
    .oneTime(true)
}

// Создание инструкций для пользователя
const getInstructions = (is_ru: boolean) => {
  if (is_ru) {
    return `🎨 *FLUX Kontext* - Редактирование изображений с ИИ

✨ *Что можно делать:*
• Изменить стиль изображения ("сделай в стиле 90-х")
• Добавить элементы ("добавь золотое ожерелье")
• Изменить причёску ("сделай пикси стрижку")
• Заменить фон ("поставь на пляж")
• Редактировать текст на изображении
• Стилизация и художественные эффекты

💡 *Советы для лучших результатов:*
• Будьте конкретными в описании
• Используйте кавычки для точного текста
• Для сохранения лица: "сохраняя те же черты лица"
• Начинайте с простых изменений

🔄 *Как использовать:*
1️⃣ Отправьте изображение
2️⃣ Выберите модель
3️⃣ Опишите изменения
4️⃣ Получите результат!`
  } else {
    return `🎨 *FLUX Kontext* - AI Image Editing

✨ *What you can do:*
• Change image style ("make this a 90s cartoon")
• Add elements ("give her a gold necklace")
• Change hairstyle ("give her a pixie haircut")
• Replace background ("put her on a beach")
• Edit text in images
• Stylization and artistic effects

💡 *Tips for best results:*
• Be specific in descriptions
• Use quotes for exact text
• To preserve identity: "while keeping the same facial features"
• Start with simple changes

🔄 *How to use:*
1️⃣ Send an image
2️⃣ Choose model
3️⃣ Describe changes
4️⃣ Get result!`
  }
}

export const handleFluxKontextCommand = async (ctx: MyContext) => {
  try {
    logger.info('🎨 [FLUX Kontext] Starting image editing workflow', {
      userId: ctx.from?.id,
    })

    // ✅ ИСПОЛЬЗУЕМ НОВУЮ ЦЕНТРАЛИЗОВАННУЮ СИСТЕМУ (БЕЗ ЗАПРОСОВ К БД!)
    const is_ru = isRussianFromState(ctx)

    const instructions = getInstructions(is_ru)

    await ctx.reply(instructions, {
      parse_mode: 'Markdown',
      reply_markup: {
        remove_keyboard: true,
      },
    })

    await ctx.reply(
      is_ru
        ? '🎨 Добро пожаловать в FLUX Kontext!\n\n📷 Пожалуйста, отправьте изображение, которое вы хотите отредактировать:'
        : '🎨 Welcome to FLUX Kontext!\n\n📷 Please send an image you want to edit:',
      Markup.keyboard([
        [is_ru ? 'Отмена' : 'Cancel'],
        [is_ru ? 'Справка по команде' : 'Help for the command'],
      ]).resize()
    )

    // Устанавливаем флаг ожидания изображения
    ctx.session.awaitingFluxKontextImage = true
    delete ctx.session.awaitingFluxKontextPrompt
  } catch (error) {
    logger.error('❌ [FLUX Kontext] Error in handleFluxKontextCommand:', error)
    // ✅ ИСПОЛЬЗУЕМ НОВУЮ ЦЕНТРАЛИЗОВАННУЮ СИСТЕМУ (БЕЗ ЗАПРОСОВ К БД!)
    const is_ru = isRussianFromState(ctx)
    await sendGenericErrorMessage(ctx, is_ru, error)
  }
}

export const handleFluxKontextImage = async (ctx: MyContext) => {
  try {
    // ✅ ИСПОЛЬЗУЕМ НОВУЮ ЦЕНТРАЛИЗОВАННУЮ СИСТЕМУ (БЕЗ ЗАПРОСОВ К БД!)
    const is_ru = isRussianFromState(ctx)

    logger.info('📷 [FLUX Kontext] Processing uploaded image', {
      userId: ctx.from?.id,
    })

    const telegram_id = ctx.from?.id?.toString()
    if (!telegram_id) {
      return
    }

    // Проверяем, что пользователь в процессе Kontext редактирования
    if (!ctx.session?.awaitingFluxKontextImage) {
      return
    }

    // Получаем URL изображения
    let imageUrl: string | undefined

    if (ctx.message && 'photo' in ctx.message && ctx.message.photo) {
      const photo = ctx.message.photo[ctx.message.photo.length - 1]
      // Используем getFileLink вместо ручного построения URL и преобразуем URL в строку
      imageUrl = (await ctx.telegram.getFileLink(photo.file_id)).toString()
    }

    if (!imageUrl) {
      await ctx.reply(
        is_ru
          ? '❌ Не удалось получить изображение. Попробуйте ещё раз.'
          : '❌ Failed to get image. Please try again.'
      )
      return
    }

    // Сохраняем изображение в сессии
    if (ctx.session) {
      ctx.session.kontextImageUrl = imageUrl
      ctx.session.awaitingFluxKontextImage = false

      // Проверяем, была ли модель уже выбрана в сцене
      if (ctx.session.kontextSelectedModel) {
        // Модель уже выбрана, переходим сразу к вводу промпта
        ctx.session.kontextModelType = ctx.session.kontextSelectedModel
        ctx.session.awaitingFluxKontextPrompt = true
        ctx.session.kontextSelectedModel = undefined // Очищаем предвыбор

        const modelName =
          ctx.session.kontextModelType === 'pro'
            ? 'FLUX Kontext Pro'
            : 'FLUX Kontext Max'

        await ctx.reply(
          is_ru
            ? `✅ Выбрана модель: ${modelName}\n\n📝 Теперь опишите, что вы хотите изменить в изображении:\n\n💡 Примеры:\n• "добавь золотое ожерелье"\n• "сделай фон в виде пляжа"\n• "измени цвет волос на рыжий"\n• "сделай в стиле винтажной фотографии"\n\n🌐 *Совет: Для лучших результатов пишите промпт на английском языке*`
            : `✅ Selected model: ${modelName}\n\n📝 Now describe what you want to change in the image:\n\n💡 Examples:\n• "add a gold necklace"\n• "change background to a beach"\n• "change hair color to red"\n• "make it vintage photography style"\n\n🌐 *Tip: For best results, write your prompt in English*`,
          {
            reply_markup: cancelMenu(is_ru).reply_markup,
            parse_mode: 'Markdown',
          }
        )
      } else {
        // Модель не выбрана, показываем выбор модели как обычно
        ctx.session.awaitingFluxKontextModel = true

        await ctx.reply(
          is_ru
            ? '🎯 Выберите модель для редактирования:'
            : '🎯 Choose a model for editing:',
          {
            reply_markup: createModelSelectionKeyboard(is_ru).reply_markup,
          }
        )
      }
    }
  } catch (error) {
    logger.error('❌ [FLUX Kontext] Error in handleFluxKontextImage:', error)
    // ✅ ИСПОЛЬЗУЕМ НОВУЮ ЦЕНТРАЛИЗОВАННУЮ СИСТЕМУ (БЕЗ ЗАПРОСОВ К БД!)
    const is_ru = isRussianFromState(ctx)
    await sendGenericErrorMessage(ctx, is_ru, error)
  }
}

export const handleFluxKontextModelSelection = async (
  ctx: MyContext,
  modelType: 'pro' | 'max'
) => {
  try {
    const telegram_id = ctx.from?.id?.toString()
    if (!telegram_id) {
      return
    }

    const is_ru = isRussianFromState(ctx)

    // Проверяем, что пользователь выбирает модель для Kontext
    if (
      !ctx.session?.awaitingFluxKontextModel ||
      !ctx.session?.kontextImageUrl
    ) {
      return
    }

    // Сохраняем выбранную модель
    if (ctx.session) {
      ctx.session.kontextModelType = modelType
      ctx.session.awaitingFluxKontextModel = false
      ctx.session.awaitingFluxKontextPrompt = true
    }

    const modelName =
      modelType === 'pro' ? 'FLUX Kontext Pro' : 'FLUX Kontext Max'

    await ctx.reply(
      is_ru
        ? `✅ Выбрана модель: ${modelName}\n\n📝 Теперь опишите, что вы хотите изменить в изображении:\n\n💡 Примеры:\n• "добавь золотое ожерелье"\n• "сделай фон в виде пляжа"\n• "измени цвет волос на рыжий"\n• "сделай в стиле винтажной фотографии"\n\n🌐 *Совет: Для лучших результатов пишите промпт на английском языке*`
        : `✅ Selected model: ${modelName}\n\n📝 Now describe what you want to change in the image:\n\n💡 Examples:\n• "add a gold necklace"\n• "change background to a beach"\n• "change hair color to red"\n• "make it vintage photography style"\n\n🌐 *Tip: For best results, write your prompt in English*`,
      {
        reply_markup: cancelMenu(is_ru).reply_markup,
        parse_mode: 'Markdown',
      }
    )
  } catch (error) {
    logger.error('Error handling FLUX Kontext model selection', {
      error: error instanceof Error ? error.message : 'Unknown error',
      telegram_id: ctx.from?.id,
      modelType,
    })

    const is_ru = isRussianFromState(ctx)
    await sendGenericErrorMessage(ctx, is_ru, error)
  }
}

export const handleFluxKontextPrompt = async (
  ctx: MyContext,
  prompt: string
) => {
  try {
    // ✅ ИСПОЛЬЗУЕМ НОВУЮ ЦЕНТРАЛИЗОВАННУЮ СИСТЕМУ (БЕЗ ЗАПРОСОВ К БД!)
    const is_ru = isRussianFromState(ctx)

    const telegram_id = ctx.from?.id?.toString()
    if (!telegram_id) {
      return
    }

    // Проверяем, что пользователь вводит промпт для Kontext
    if (
      !ctx.session?.awaitingFluxKontextPrompt ||
      !ctx.session?.kontextImageUrl ||
      !ctx.session?.kontextModelType
    ) {
      return
    }

    const imageUrl = ctx.session.kontextImageUrl
    const modelType = ctx.session.kontextModelType

    // Очищаем сессию
    if (ctx.session) {
      ctx.session.awaitingFluxKontextPrompt = false
      ctx.session.kontextImageUrl = undefined
      ctx.session.kontextModelType = undefined
    }

    const username = ctx.from?.username || 'unknown'

    // Параметры для генерации
    const params: FluxKontextParams = {
      prompt,
      inputImageUrl: imageUrl,
      modelType,
      telegram_id,
      username,
      is_ru,
      ctx,
    }

    // Запускаем редактирование
    await generateFluxKontext(params)
  } catch (error) {
    logger.error('❌ [FLUX Kontext] Error in handleFluxKontextPrompt:', error)
    // ✅ ИСПОЛЬЗУЕМ НОВУЮ ЦЕНТРАЛИЗОВАННУЮ СИСТЕМУ (БЕЗ ЗАПРОСОВ К БД!)
    const is_ru = isRussianFromState(ctx)
    await sendGenericErrorMessage(ctx, is_ru, error)
  }
}

export const handleFluxKontextCallback = async (ctx: MyContext) => {
  try {
    // ✅ ИСПОЛЬЗУЕМ НОВУЮ ЦЕНТРАЛИЗОВАННУЮ СИСТЕМУ (БЕЗ ЗАПРОСОВ К БД!)
    const is_ru = isRussianFromState(ctx)

    // ... existing code ...
  } catch (error) {
    logger.error('❌ [FLUX Kontext] Error in handleFluxKontextCallback:', error)
    // ✅ ИСПОЛЬЗУЕМ НОВУЮ ЦЕНТРАЛИЗОВАННУЮ СИСТЕМУ (БЕЗ ЗАПРОСОВ К БД!)
    const is_ru = isRussianFromState(ctx)
    await sendGenericErrorMessage(ctx, is_ru, error)
  }
}

export const processFluxKontextGeneration = async (ctx: MyContext) => {
  try {
    // ✅ ИСПОЛЬЗУЕМ НОВУЮ ЦЕНТРАЛИЗОВАННУЮ СИСТЕМУ (БЕЗ ЗАПРОСОВ К БД!)
    const is_ru = isRussianFromState(ctx)

    // ... existing code ...
  } catch (error) {
    logger.error(
      '❌ [FLUX Kontext] Error in processFluxKontextGeneration:',
      error
    )
    // ✅ ИСПОЛЬЗУЕМ НОВУЮ ЦЕНТРАЛИЗОВАННУЮ СИСТЕМУ (БЕЗ ЗАПРОСОВ К БД!)
    const is_ru = isRussianFromState(ctx)
    await sendGenericErrorMessage(ctx, is_ru, error)
  }
}

export const cleanupFluxKontextSession = (ctx: MyContext) => {
  delete ctx.session.awaitingFluxKontextImage
  delete ctx.session.awaitingFluxKontextPrompt
  delete ctx.session.fluxKontextImageUrl
  delete ctx.session.fluxKontextPrompt
}
