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
    const telegram_id = ctx.from?.id?.toString()
    if (!telegram_id) {
      return
    }

    // Используем стандартный способ определения языка
    const is_ru = ctx.from?.language_code === 'ru'

    const instructions = getInstructions(is_ru)

    await ctx.reply(instructions, {
      parse_mode: 'Markdown',
      reply_markup: {
        remove_keyboard: true,
      },
    })

    await ctx.reply(
      is_ru
        ? '📷 Отправьте изображение, которое хотите отредактировать:'
        : '📷 Send an image you want to edit:',
      {
        reply_markup: cancelMenu(is_ru).reply_markup,
      }
    )

    // Устанавливаем сессию для ожидания изображения
    if (ctx.session) {
      ctx.session.awaitingFluxKontextImage = true
      ctx.session.mode = ModeEnum.FluxKontext // Устанавливаем режим для справки
    }
  } catch (error) {
    logger.error('Error in FLUX Kontext command', {
      error: error instanceof Error ? error.message : 'Unknown error',
      telegram_id: ctx.from?.id,
    })

    const is_ru = ctx.from?.language_code === 'ru'
    await ctx.reply(
      is_ru
        ? '❌ Произошла ошибка. Попробуйте ещё раз.'
        : '❌ An error occurred. Please try again.'
    )
  }
}

export const handleFluxKontextImageUpload = async (ctx: MyContext) => {
  try {
    const telegram_id = ctx.from?.id?.toString()
    if (!telegram_id) {
      return
    }

    const is_ru = ctx.from?.language_code === 'ru'

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
    logger.error('Error handling FLUX Kontext image upload', {
      error: error instanceof Error ? error.message : 'Unknown error',
      telegram_id: ctx.from?.id,
    })

    const is_ru = ctx.from?.language_code === 'ru'
    await ctx.reply(
      is_ru
        ? '❌ Произошла ошибка при обработке изображения.'
        : '❌ Error processing image.'
    )
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

    const is_ru = ctx.from?.language_code === 'ru'

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

    const is_ru = ctx.from?.language_code === 'ru'
    await ctx.reply(
      is_ru
        ? '❌ Произошла ошибка при выборе модели.'
        : '❌ Error selecting model.'
    )
  }
}

export const handleFluxKontextPrompt = async (
  ctx: MyContext,
  prompt: string
) => {
  try {
    const telegram_id = ctx.from?.id?.toString()
    if (!telegram_id) {
      return
    }

    const is_ru = ctx.from?.language_code === 'ru'

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
    logger.error('Error handling FLUX Kontext prompt', {
      error: error instanceof Error ? error.message : 'Unknown error',
      telegram_id: ctx.from?.id,
      prompt,
    })

    const is_ru = ctx.from?.language_code === 'ru'
    await ctx.reply(
      is_ru
        ? '❌ Произошла ошибка при редактировании изображения.'
        : '❌ Error editing image.'
    )
  }
}
