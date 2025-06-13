import { Scenes, Markup } from 'telegraf'
import { MyContext } from '../../interfaces'
import { FLUX_KONTEXT_MODELS } from '../../price/models/FLUX_KONTEXT_MODELS'
import { isRussian } from '../../helpers/language'
import { getUserBalance } from '../../core/supabase'
import { logger } from '../../utils/logger'
import { handleFluxKontextCommand } from '@/commands/fluxKontextCommand'
import { levels } from '@/menu/mainMenu'
import { sendBalanceMessage } from '@/price/helpers'
import { ModeEnum } from '@/interfaces'

// Конфигурация режимов FLUX Kontext
const FLUX_MODES = {
  single: {
    title_ru: '🖼️ Одиночное редактирование',
    title_en: '🖼️ Single Image Edit',
    description_ru: 'Редактирование одного изображения',
    description_en: 'Edit a single image',
    images_required: 1,
  },
  multi: {
    title_ru: '🔗 Объединение изображений',
    title_en: '🔗 Multi-Image Combine',
    description_ru: 'Объединение двух изображений в одно',
    description_en: 'Combine two images into one',
    images_required: 2,
  },
  portrait_series: {
    title_ru: '👤 Серия портретов',
    title_en: '👤 Portrait Series',
    description_ru: 'Создание серии портретов из одного изображения',
    description_en: 'Generate a series of portraits from one image',
    images_required: 1,
  },
  haircut: {
    title_ru: '💇 Изменить стрижку',
    title_en: '💇 Change Haircut',
    description_ru: 'Изменить прическу и цвет волос',
    description_en: 'Change hairstyle and hair color',
    images_required: 1,
  },
  landmarks: {
    title_ru: '🏛️ Знаменитые места',
    title_en: '🏛️ Iconic Locations',
    description_ru: 'Поместить себя на фоне известных достопримечательностей',
    description_en: 'Put yourself in front of famous landmarks',
    images_required: 1,
  },
  headshot: {
    title_ru: '📸 Профессиональный портрет',
    title_en: '📸 Professional Headshot',
    description_ru: 'Создать профессиональный портрет из любого изображения',
    description_en: 'Generate a professional headshot from any image',
    images_required: 1,
  },
}

// Создание сцены
export const fluxKontextScene = new Scenes.BaseScene<MyContext>(
  'flux_kontext_scene'
)

// Функция для создания клавиатуры выбора режима
const createModeSelectionKeyboard = (isRu: boolean) => {
  const keyboard = []

  // Добавляем режимы по 2 в ряд
  const modes = Object.entries(FLUX_MODES)
  for (let i = 0; i < modes.length; i += 2) {
    const row = []
    const [modeKey1, mode1] = modes[i]
    row.push(
      Markup.button.callback(
        isRu ? mode1.title_ru : mode1.title_en,
        `flux_mode_${modeKey1}`
      )
    )

    if (i + 1 < modes.length) {
      const [modeKey2, mode2] = modes[i + 1]
      row.push(
        Markup.button.callback(
          isRu ? mode2.title_ru : mode2.title_en,
          `flux_mode_${modeKey2}`
        )
      )
    }

    keyboard.push(row)
  }

  // Добавляем кнопку отмены
  keyboard.push([
    Markup.button.callback(isRu ? 'Отмена' : 'Cancel', 'flux_kontext_cancel'),
  ])

  return Markup.inlineKeyboard(keyboard)
}

// Функция для создания клавиатуры выбора модели
const createModelSelectionKeyboard = (isRu: boolean) => {
  const proModel = FLUX_KONTEXT_MODELS['black-forest-labs/flux-kontext-pro']
  const maxModel = FLUX_KONTEXT_MODELS['black-forest-labs/flux-kontext-max']

  return Markup.inlineKeyboard([
    [
      Markup.button.callback(
        `💼 Pro (${proModel.costPerImage}⭐)`,
        'flux_model_pro'
      ),
    ],
    [
      Markup.button.callback(
        `🚀 Max (${maxModel.costPerImage}⭐)`,
        'flux_model_max'
      ),
    ],
    [Markup.button.callback(isRu ? 'Отмена' : 'Cancel', 'flux_kontext_cancel')],
  ])
}

// Вход в сцену
fluxKontextScene.enter(async ctx => {
  try {
    const isRu = isRussian(ctx)

    if (!ctx.from?.id) {
      await ctx.reply(
        isRu
          ? '❌ Ошибка получения ID пользователя'
          : '❌ Error getting user ID'
      )
      await ctx.scene.leave()
      return
    }

    // Сброс состояния
    if (ctx.session) {
      ctx.session.fluxKontextMode = undefined
      ctx.session.fluxKontextImageA = undefined
      ctx.session.fluxKontextImageB = undefined
      ctx.session.awaitingFluxKontextImageA = false
      ctx.session.awaitingFluxKontextImageB = false
      ctx.session.fluxKontextStep = 'mode_select'
      ctx.session.kontextModelType = undefined
    }

    const title = isRu
      ? '🎨 *FLUX Kontext* - Продвинутое ИИ редактирование изображений'
      : '🎨 *FLUX Kontext* - Advanced AI Image Editing'

    const description = isRu
      ? `Выберите режим редактирования:

🖼️ *Одиночное редактирование* - классическое редактирование одного изображения
🔗 *Объединение изображений* - объединение двух изображений в одно
👤 *Серия портретов* - создание серии портретов из одного изображения  
💇 *Изменить стрижку* - изменение прически и цвета волос
🏛️ *Знаменитые места* - помещение себя на фоне достопримечательностей
📸 *Профессиональный портрет* - создание профессионального портрета

💡 *Для лучших результатов пишите промпты на английском языке*`
      : `Choose editing mode:

🖼️ *Single Image Edit* - classic editing of one image
🔗 *Multi-Image Combine* - combine two images into one
👤 *Portrait Series* - generate a series of portraits from one image
💇 *Change Haircut* - change hairstyle and hair color  
🏛️ *Iconic Locations* - put yourself in front of famous landmarks
📸 *Professional Headshot* - generate a professional headshot

💡 *For best results, write prompts in English*`

    await ctx.reply(title + '\n\n' + description, {
      parse_mode: 'Markdown',
      reply_markup: createModeSelectionKeyboard(isRu).reply_markup,
    })
  } catch (error) {
    logger.error('Error in FLUX Kontext scene enter', {
      error: error instanceof Error ? error.message : 'Unknown error',
      telegramId: ctx.from?.id,
    })
    await ctx.scene.leave()
  }
})

// Обработка выбора режима
Object.keys(FLUX_MODES).forEach(modeKey => {
  fluxKontextScene.action(`flux_mode_${modeKey}`, async ctx => {
    try {
      await ctx.answerCbQuery()
      const isRu = isRussian(ctx)

      if (ctx.session) {
        ctx.session.fluxKontextMode = modeKey as any
        ctx.session.fluxKontextStep = 'image_a'
      }

      const mode = FLUX_MODES[modeKey as keyof typeof FLUX_MODES]
      const modeTitle = isRu ? mode.title_ru : mode.title_en
      const modeDescription = isRu ? mode.description_ru : mode.description_en

      await ctx.editMessageText(
        isRu
          ? `✅ *Выбран режим:* ${modeTitle}\n\n${modeDescription}\n\n📷 Отправьте ${mode.images_required === 1 ? 'изображение' : 'первое изображение'}:`
          : `✅ *Selected mode:* ${modeTitle}\n\n${modeDescription}\n\n📷 Send ${mode.images_required === 1 ? 'an image' : 'the first image'}:`,
        {
          parse_mode: 'Markdown',
          reply_markup: createModelSelectionKeyboard(isRu).reply_markup,
        }
      )

      // Устанавливаем ожидание первого изображения
      if (ctx.session) {
        ctx.session.awaitingFluxKontextImageA = true
      }
    } catch (error) {
      logger.error('Error handling FLUX Kontext mode selection', {
        error: error instanceof Error ? error.message : 'Unknown error',
        telegramId: ctx.from?.id,
        mode: modeKey,
      })
    }
  })
})

// Обработка выбора модели
fluxKontextScene.action('flux_model_pro', async ctx => {
  try {
    await ctx.answerCbQuery()
    if (ctx.session) {
      ctx.session.kontextModelType = 'pro'
      logger.info('FLUX Kontext Pro model selected - session updated', {
        telegramId: ctx.from?.id,
        modelType: ctx.session.kontextModelType,
        mode: ctx.session.fluxKontextMode,
        hasImageA: !!ctx.session.fluxKontextImageA,
        sessionExists: !!ctx.session,
      })
    }
    await handleModelSelection(ctx, 'pro')
  } catch (error) {
    logger.error('Error selecting FLUX Kontext Pro', {
      error: error instanceof Error ? error.message : 'Unknown error',
      telegramId: ctx.from?.id,
    })
  }
})

fluxKontextScene.action('flux_model_max', async ctx => {
  try {
    await ctx.answerCbQuery()
    if (ctx.session) {
      ctx.session.kontextModelType = 'max'
      logger.info('FLUX Kontext Max model selected - session updated', {
        telegramId: ctx.from?.id,
        modelType: ctx.session.kontextModelType,
        mode: ctx.session.fluxKontextMode,
        hasImageA: !!ctx.session.fluxKontextImageA,
        sessionExists: !!ctx.session,
      })
    }
    await handleModelSelection(ctx, 'max')
  } catch (error) {
    logger.error('Error selecting FLUX Kontext Max', {
      error: error instanceof Error ? error.message : 'Unknown error',
      telegramId: ctx.from?.id,
    })
  }
})

// Функция обработки выбора модели
const handleModelSelection = async (
  ctx: MyContext,
  modelType: 'pro' | 'max'
) => {
  const isRu = isRussian(ctx)
  const model =
    FLUX_KONTEXT_MODELS[`black-forest-labs/flux-kontext-${modelType}`]

  await ctx.editMessageText(
    isRu
      ? `✅ *Выбрана модель:* FLUX Kontext ${modelType.toUpperCase()} (${model.costPerImage}⭐)\n\n📷 Теперь отправьте изображение:`
      : `✅ *Selected model:* FLUX Kontext ${modelType.toUpperCase()} (${model.costPerImage}⭐)\n\n📷 Now send an image:`,
    {
      parse_mode: 'Markdown',
      reply_markup: Markup.inlineKeyboard([
        [
          Markup.button.callback(
            isRu ? 'Отмена' : 'Cancel',
            'flux_kontext_cancel'
          ),
        ],
      ]).reply_markup,
    }
  )
}

// Обработка изображений
fluxKontextScene.on('photo', async ctx => {
  try {
    const isRu = isRussian(ctx)

    if (
      !ctx.session?.awaitingFluxKontextImageA &&
      !ctx.session?.awaitingFluxKontextImageB
    ) {
      await ctx.reply(
        isRu
          ? '❌ Сначала выберите режим редактирования.'
          : '❌ Please select an editing mode first.'
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

    if (ctx.session?.awaitingFluxKontextImageA) {
      // Обработка первого изображения
      if (ctx.session) {
        ctx.session.fluxKontextImageA = fileLink.href
        ctx.session.awaitingFluxKontextImageA = false
      }

      const mode =
        FLUX_MODES[ctx.session?.fluxKontextMode as keyof typeof FLUX_MODES]

      if (mode?.images_required === 2) {
        // Нужно второе изображение
        if (ctx.session) {
          ctx.session.awaitingFluxKontextImageB = true
          ctx.session.fluxKontextStep = 'image_b'
        }

        await ctx.reply(
          isRu
            ? '✅ Первое изображение получено!\n\n📷 Теперь отправьте второе изображение:'
            : '✅ First image received!\n\n📷 Now send the second image:',
          {
            reply_markup: Markup.inlineKeyboard([
              [
                Markup.button.callback(
                  isRu ? 'Отмена' : 'Cancel',
                  'flux_kontext_cancel'
                ),
              ],
            ]).reply_markup,
          }
        )
      } else {
        // Достаточно одного изображения, переходим к промпту
        await requestPrompt(ctx)
      }
    } else if (ctx.session?.awaitingFluxKontextImageB) {
      // Обработка второго изображения
      if (ctx.session) {
        ctx.session.fluxKontextImageB = fileLink.href
        ctx.session.awaitingFluxKontextImageB = false
      }

      await ctx.reply(
        isRu ? '✅ Второе изображение получено!' : '✅ Second image received!'
      )

      await requestPrompt(ctx)
    }
  } catch (error) {
    logger.error('Error handling FLUX Kontext image', {
      error: error instanceof Error ? error.message : 'Unknown error',
      telegramId: ctx.from?.id,
    })
  }
})

// Функция запроса промпта
const requestPrompt = async (ctx: MyContext) => {
  const isRu = isRussian(ctx)
  const mode =
    FLUX_MODES[ctx.session?.fluxKontextMode as keyof typeof FLUX_MODES]

  if (ctx.session) {
    ctx.session.fluxKontextStep = 'prompt'
    ctx.session.awaitingFluxKontextPrompt = true
  }

  let promptExamples = ''

  // Добавляем специфичные примеры для каждого режима
  switch (ctx.session?.fluxKontextMode) {
    case 'multi':
      promptExamples = isRu
        ? `\n\n💡 *Примеры для объединения:*\n• "combine these two people in one photo"\n• "merge the backgrounds seamlessly"\n• "blend the lighting from both images"`
        : `\n\n💡 *Examples for combining:*\n• "combine these two people in one photo"\n• "merge the backgrounds seamlessly"\n• "blend the lighting from both images"`
      break
    case 'portrait_series':
      promptExamples = isRu
        ? `\n\n💡 *Примеры для серии портретов:*\n• "create 4 different professional portraits"\n• "show different emotions and expressions"\n• "various lighting setups"`
        : `\n\n💡 *Examples for portrait series:*\n• "create 4 different professional portraits"\n• "show different emotions and expressions"\n• "various lighting setups"`
      break
    case 'haircut':
      promptExamples = isRu
        ? `\n\n💡 *Примеры для стрижки:*\n• "give her a bob haircut"\n• "change hair color to blonde"\n• "modern short hairstyle"`
        : `\n\n💡 *Examples for haircut:*\n• "give her a bob haircut"\n• "change hair color to blonde"\n• "modern short hairstyle"`
      break
    case 'landmarks':
      promptExamples = isRu
        ? `\n\n💡 *Примеры для достопримечательностей:*\n• "put in front of Eiffel Tower"\n• "Times Square background"\n• "standing at the Great Wall of China"`
        : `\n\n💡 *Examples for landmarks:*\n• "put in front of Eiffel Tower"\n• "Times Square background"\n• "standing at the Great Wall of China"`
      break
    case 'headshot':
      promptExamples = isRu
        ? `\n\n💡 *Примеры для профессионального портрета:*\n• "professional business headshot"\n• "corporate portrait with neutral background"\n• "LinkedIn profile photo style"`
        : `\n\n💡 *Examples for professional headshot:*\n• "professional business headshot"\n• "corporate portrait with neutral background"\n• "LinkedIn profile photo style"`
      break
    default:
      promptExamples = isRu
        ? `\n\n💡 *Общие примеры:*\n• "add sunglasses"\n• "change background to beach"\n• "make it vintage style"`
        : `\n\n💡 *General examples:*\n• "add sunglasses"\n• "change background to beach"\n• "make it vintage style"`
  }

  await ctx.reply(
    isRu
      ? `📝 *Опишите изменения:*\n\nТеперь опишите, что вы хотите изменить или как обработать изображение${mode ? ` в режиме "${isRu ? mode.title_ru : mode.title_en}"` : ''}.${promptExamples}\n\n🌐 *Для лучших результатов пишите на английском языке*`
      : `📝 *Describe changes:*\n\nNow describe what you want to change or how to process the image${mode ? ` in "${isRu ? mode.title_ru : mode.title_en}" mode` : ''}.${promptExamples}\n\n🌐 *For best results, write in English*`,
    {
      parse_mode: 'Markdown',
      reply_markup: Markup.inlineKeyboard([
        [
          Markup.button.callback(
            isRu ? 'Отмена' : 'Cancel',
            'flux_kontext_cancel'
          ),
        ],
      ]).reply_markup,
    }
  )
}

// Обработка текстовых сообщений (промптов)
fluxKontextScene.on('text', async ctx => {
  try {
    const isRu = isRussian(ctx)

    // Логируем состояние сессии при получении промпта
    logger.info('FLUX Kontext text handler - session state', {
      telegramId: ctx.from?.id,
      awaitingPrompt: ctx.session?.awaitingFluxKontextPrompt,
      mode: ctx.session?.fluxKontextMode,
      hasImageA: !!ctx.session?.fluxKontextImageA,
      hasImageB: !!ctx.session?.fluxKontextImageB,
      modelType: ctx.session?.kontextModelType,
      step: ctx.session?.fluxKontextStep,
      sessionExists: !!ctx.session,
      sessionKeys: ctx.session ? Object.keys(ctx.session) : [],
    })

    if (!ctx.session?.awaitingFluxKontextPrompt) {
      await ctx.reply(
        isRu
          ? '❌ Сначала отправьте изображение.'
          : '❌ Please send an image first.'
      )
      return
    }

    const prompt = ctx.message.text

    if (!prompt) {
      await ctx.reply(isRu ? '❌ Пустой промпт.' : '❌ Empty prompt.')
      return
    }

    // Очищаем состояние ожидания
    if (ctx.session) {
      ctx.session.awaitingFluxKontextPrompt = false
      ctx.session.fluxKontextStep = 'processing'
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

    // Здесь будет вызов функции генерации
    await processFluxKontextRequest(ctx, prompt)
  } catch (error) {
    logger.error('Error handling FLUX Kontext prompt', {
      error: error instanceof Error ? error.message : 'Unknown error',
      telegramId: ctx.from?.id,
    })
  }
})

// Функция обработки запроса (теперь с реальной интеграцией)
const processFluxKontextRequest = async (ctx: MyContext, prompt: string) => {
  const isRu = isRussian(ctx)

  // Получаем данные из сессии
  const {
    fluxKontextMode,
    fluxKontextImageA,
    fluxKontextImageB,
    kontextModelType,
  } = ctx.session || {}

  // Валидация данных
  if (
    !fluxKontextMode ||
    !fluxKontextImageA ||
    !kontextModelType ||
    !ctx.from?.id
  ) {
    logger.error('Missing required data for FLUX Kontext processing', {
      telegramId: ctx.from?.id,
      mode: fluxKontextMode,
      hasImageA: !!fluxKontextImageA,
      hasImageB: !!fluxKontextImageB,
      modelType: kontextModelType,
      sessionExists: !!ctx.session,
      sessionKeys: ctx.session ? Object.keys(ctx.session) : [],
      fullSession: ctx.session,
    })

    await ctx.reply(
      isRu
        ? '❌ Ошибка: недостаточно данных для обработки.'
        : '❌ Error: insufficient data for processing.'
    )
    return
  }

  logger.info('Processing FLUX Kontext request', {
    telegramId: ctx.from?.id,
    mode: fluxKontextMode,
    modelType: kontextModelType,
    hasImageA: !!fluxKontextImageA,
    hasImageB: !!fluxKontextImageB,
    prompt: prompt.substring(0, 100) + '...',
  })

  try {
    // Импортируем и используем продвинутый сервис
    const { generateAdvancedFluxKontext } = await import(
      '../../services/generateFluxKontext'
    )

    const result = await generateAdvancedFluxKontext({
      prompt,
      mode: fluxKontextMode,
      imageA: fluxKontextImageA,
      imageB: fluxKontextImageB,
      modelType: kontextModelType,
      telegram_id: ctx.from.id.toString(),
      username: ctx.from.username || 'unknown',
      is_ru: isRu,
      ctx,
    })

    logger.info('FLUX Kontext processing completed successfully', {
      telegramId: ctx.from.id,
      promptId: result.prompt_id,
    })

    // Очищаем сессию после успешной обработки
    if (ctx.session) {
      ctx.session.fluxKontextMode = undefined
      ctx.session.fluxKontextImageA = undefined
      ctx.session.fluxKontextImageB = undefined
      ctx.session.fluxKontextStep = undefined
      ctx.session.kontextModelType = undefined
    }
  } catch (error) {
    logger.error('Error in FLUX Kontext processing', {
      error: error instanceof Error ? error.message : 'Unknown error',
      telegramId: ctx.from?.id,
    })

    // Ошибка уже обработана в сервисе, но добавляем дополнительную обработку если нужно
    if (ctx.session) {
      ctx.session.fluxKontextMode = undefined
      ctx.session.fluxKontextImageA = undefined
      ctx.session.fluxKontextImageB = undefined
      ctx.session.fluxKontextStep = undefined
      ctx.session.kontextModelType = undefined
    }
  }
}

// Обработка кнопки "Ещё редактирование"
fluxKontextScene.action('flux_more_editing', async ctx => {
  try {
    await ctx.answerCbQuery()

    // Сброс состояния и возврат к выбору режима
    if (ctx.session) {
      ctx.session.fluxKontextMode = undefined
      ctx.session.fluxKontextImageA = undefined
      ctx.session.fluxKontextImageB = undefined
      ctx.session.awaitingFluxKontextImageA = false
      ctx.session.awaitingFluxKontextImageB = false
      ctx.session.awaitingFluxKontextPrompt = false
      ctx.session.fluxKontextStep = 'mode_select'
      ctx.session.kontextModelType = undefined
    }

    // Перезапускаем сцену
    await ctx.scene.reenter()
  } catch (error) {
    logger.error('Error handling more editing', {
      error: error instanceof Error ? error.message : 'Unknown error',
      telegramId: ctx.from?.id,
    })
  }
})

// Обработка отмены
fluxKontextScene.action('flux_kontext_cancel', async ctx => {
  try {
    await ctx.answerCbQuery()
    const isRu = isRussian(ctx)

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
    logger.error('Error handling FLUX Kontext cancel', {
      error: error instanceof Error ? error.message : 'Unknown error',
      telegramId: ctx.from?.id,
    })
  }
})
