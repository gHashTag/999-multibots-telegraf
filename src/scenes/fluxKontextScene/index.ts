import { Scenes, Markup } from 'telegraf'
import { MyContext } from '../../interfaces'
import { FLUX_KONTEXT_MODELS } from '../../price/models/FLUX_KONTEXT_MODELS'
// ✅ ЗАМЕНИЛИ НА НОВУЮ ЦЕНТРАЛИЗОВАННУЮ СИСТЕМУ!
import { isRussianFromState } from '@/helpers/centralizedLanguage'
import { getUserBalance } from '../../core/supabase'
import { logger } from '../../utils/logger'
import { handleFluxKontextCommand } from '@/commands/fluxKontextCommand'
import { levels } from '@/menu/simpleMenu'
import { sendBalanceMessage } from '@/price/helpers'
import { ModeEnum } from '@/interfaces'

// 🎬 PROFESSIONAL CAMERA ANGLES (Enhanced with Reels functionality)
export const FLUX_CAMERA_ANGLES = {
  medium_shot:
    '[camera: medium shot, balanced composition, natural perspective]',
  close_up: '[camera: close-up shot, intimate detail, emotional connection]',
  extreme_close_up:
    '[camera: extreme close-up, fine detail focus, artistic impact]',
  wide_shot: '[camera: wide shot, environmental context, spacious composition]',
  high_angle: '[camera: high angle shot, looking down, vulnerable perspective]',
  low_angle: '[camera: low angle shot, looking up, empowering perspective]',
  dutch_angle: '[camera: dutch angle, dynamic tilt, creative composition]',
  over_shoulder: '[camera: over-the-shoulder shot, intimate perspective]',
  profile_shot: '[camera: profile shot, sculptural beauty, classic elegance]',
  three_quarter:
    '[camera: three-quarter view, dimensional depth, natural pose]',
  bird_eye: "[camera: bird's eye view, top-down perspective, unique angle]",
  macro_beauty:
    '[camera: macro beauty shot, skin texture perfection, luxury detail]',
}

// 🖼️ FRAME COMPOSITION (Professional Photography)
export const FLUX_FRAME_COMPOSITION = {
  center_weighted:
    '[composition: center-weighted balance, professional stability]',
  rule_thirds:
    '[composition: rule of thirds, dynamic balance, photographic standard]',
  golden_ratio:
    '[composition: golden ratio portrait, mathematical beauty, perfect proportion]',
  symmetrical:
    '[composition: symmetrical perfection, luxury brand precision, flawless geometry]',
  negative_space:
    '[composition: negative space elegant, minimalist sophistication]',
  leading_lines:
    '[composition: leading lines flow, premium visual journey, luxury storytelling]',
}

// ✨ PROFESSIONAL LIGHTING SETUPS
export const FLUX_LIGHTING_SETUPS = {
  soft_natural:
    '[lighting: soft natural light, gentle illumination, flattering glow]',
  dramatic: '[lighting: dramatic lighting, high contrast, artistic shadows]',
  golden_hour:
    '[lighting: golden hour warmth, magical illumination, perfect timing]',
  studio:
    '[lighting: professional studio setup, perfect illumination, commercial quality]',
  rembrandt:
    '[lighting: rembrandt lighting, classic portrait technique, artistic shadows]',
  butterfly:
    '[lighting: butterfly lighting, glamour technique, facial contouring]',
  split: '[lighting: split lighting, dramatic contrast, artistic division]',
  rim: '[lighting: rim lighting, edge illumination, subject separation]',
  candlelight:
    '[lighting: warm candlelight, intimate atmosphere, cozy ambiance]',
  neon_noir: '[lighting: neon noir, urban atmosphere, cyberpunk aesthetic]',
  morning:
    '[lighting: fresh morning light, clean illumination, new day energy]',
  sunset:
    "[lighting: warm sunset glow, romantic illumination, day's end beauty]",
}

// Конфигурация режимов FLUX Kontext с добавленными настройками камеры
const FLUX_MODES = {
  quick: {
    title_ru: '⚡ Быстрое редактирование',
    title_en: '⚡ Quick Edit',
    description_ru: 'Простое редактирование изображения без настроек камеры',
    description_en: 'Simple image editing without camera settings',
    images_required: 1,
    skip_camera_selection: true, // Пропускаем выбор углов камеры
    default_lighting: 'soft_natural',
  },
  single: {
    title_ru: '🖼️ Профессиональное редактирование',
    title_en: '🖼️ Professional Edit',
    description_ru:
      'Редактирование одного изображения с профессиональными настройками камеры',
    description_en: 'Edit a single image with professional camera settings',
    images_required: 1,
    camera_angles: ['medium_shot', 'close_up', 'wide_shot', 'profile_shot'],
    default_lighting: 'soft_natural',
  },
  multi: {
    title_ru: '🔗 Объединение изображений',
    title_en: '🔗 Multi-Image Combine',
    description_ru:
      'Объединение двух изображений с кинематографическими эффектами',
    description_en: 'Combine two images with cinematic effects',
    images_required: 2,
    camera_angles: ['medium_shot', 'wide_shot', 'three_quarter'],
    default_lighting: 'golden_hour',
  },
  portrait_series: {
    title_ru: '👤 Серия портретов',
    title_en: '👤 Portrait Series',
    description_ru: 'Создание серии портретов с разными углами камеры',
    description_en:
      'Generate a series of portraits with different camera angles',
    images_required: 1,
    camera_angles: [
      'close_up',
      'three_quarter',
      'profile_shot',
      'high_angle',
      'low_angle',
    ],
    default_lighting: 'rembrandt',
  },
  haircut: {
    title_ru: '💇 Изменить стрижку',
    title_en: '💇 Change Haircut',
    description_ru: 'Изменить прическу с профессиональными ракурсами',
    description_en: 'Change hairstyle with professional angles',
    images_required: 1,
    camera_angles: ['close_up', 'three_quarter', 'profile_shot'],
    default_lighting: 'studio',
  },
  landmarks: {
    title_ru: '🏛️ Знаменитые места',
    title_en: '🏛️ Iconic Locations',
    description_ru:
      'Поместить себя на фоне известных достопримечательностей с кинематографическими ракурсами',
    description_en:
      'Put yourself in front of famous landmarks with cinematic angles',
    images_required: 1,
    camera_angles: ['wide_shot', 'medium_shot', 'low_angle', 'dutch_angle'],
    default_lighting: 'golden_hour',
  },
  headshot: {
    title_ru: '📸 Профессиональный портрет',
    title_en: '📸 Professional Headshot',
    description_ru: 'Создать профессиональный портрет с выбором ракурса камеры',
    description_en:
      'Generate a professional headshot with camera angle selection',
    images_required: 1,
    camera_angles: [
      'close_up',
      'three_quarter',
      'macro_beauty',
      'profile_shot',
    ],
    default_lighting: 'butterfly',
  },
}

// Функция для создания клавиатуры выбора угла камеры
const createCameraAngleKeyboard = (mode: string, isRu: boolean) => {
  const modeConfig = FLUX_MODES[mode as keyof typeof FLUX_MODES]
  if (
    !modeConfig ||
    !('camera_angles' in modeConfig) ||
    !modeConfig.camera_angles
  ) {
    return null
  }

  const keyboard = []
  const angles = modeConfig.camera_angles

  // Добавляем углы камеры по 2 в ряд
  for (let i = 0; i < angles.length; i += 2) {
    const row = []

    const angle1 = angles[i]
    const angle1Label = getCameraAngleLabel(angle1, isRu)
    row.push(
      Markup.button.callback(angle1Label, `flux_camera_${mode}_${angle1}`)
    )

    if (i + 1 < angles.length) {
      const angle2 = angles[i + 1]
      const angle2Label = getCameraAngleLabel(angle2, isRu)
      row.push(
        Markup.button.callback(angle2Label, `flux_camera_${mode}_${angle2}`)
      )
    }

    keyboard.push(row)
  }

  // Добавляем кнопки управления
  keyboard.push([
    Markup.button.callback(
      isRu ? '🎬 Автовыбор' : '🎬 Auto Select',
      `flux_camera_${mode}_auto`
    ),
    Markup.button.callback(isRu ? 'Назад' : 'Back', 'flux_kontext_modes'),
  ])

  return Markup.inlineKeyboard(keyboard)
}

// Функция для получения названия угла камеры на нужном языке
const getCameraAngleLabel = (angle: string, isRu: boolean): string => {
  const labels: Record<string, { ru: string; en: string }> = {
    medium_shot: { ru: '🎥 Средний план', en: '🎥 Medium Shot' },
    close_up: { ru: '🔍 Крупный план', en: '🔍 Close-up' },
    extreme_close_up: { ru: '🔎 Сверхкрупный план', en: '🔎 Extreme Close-up' },
    wide_shot: { ru: '🌐 Общий план', en: '🌐 Wide Shot' },
    high_angle: { ru: '📐 Верхний ракурс', en: '📐 High Angle' },
    low_angle: { ru: '📐 Нижний ракурс', en: '📐 Low Angle' },
    dutch_angle: { ru: '🎭 Голландский угол', en: '🎭 Dutch Angle' },
    over_shoulder: { ru: '👤 Через плечо', en: '👤 Over Shoulder' },
    profile_shot: { ru: '👤 Профиль', en: '👤 Profile' },
    three_quarter: { ru: '📐 Три четверти', en: '📐 Three Quarter' },
    bird_eye: { ru: '🦅 Птичий взгляд', en: "🦅 Bird's Eye" },
    macro_beauty: { ru: '💎 Макро красота', en: '💎 Macro Beauty' },
  }

  return labels[angle] ? (isRu ? labels[angle].ru : labels[angle].en) : angle
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

  // Добавляем кнопку управления камерой
  keyboard.push([
    Markup.button.callback(
      isRu ? '🎬 Управление камерой' : '🎬 Camera Control',
      'flux_camera_control'
    ),
  ])

  // Добавляем кнопку отмены
  keyboard.push([
    Markup.button.callback(isRu ? 'Отмена' : 'Cancel', 'flux_kontext_cancel'),
  ])

  return Markup.inlineKeyboard(keyboard)
}

// Функция для создания клавиатуры выбора модели
const createModelSelectionKeyboard = (isRu: boolean) => {
  const maxModel = FLUX_KONTEXT_MODELS['black-forest-labs/flux-kontext-max']

  return Markup.inlineKeyboard([
    [
      Markup.button.callback(
        `🚀 Max - Лучшая модель (${maxModel.costPerImage}⭐)`,
        'flux_model_max'
      ),
    ],
    [Markup.button.callback(isRu ? 'Отмена' : 'Cancel', 'flux_kontext_cancel')],
  ])
}

// Вход в сцену
fluxKontextScene.enter(async ctx => {
  try {
    // ✅ ИСПОЛЬЗУЕМ НОВУЮ ЦЕНТРАЛИЗОВАННУЮ СИСТЕМУ (БЕЗ ЗАПРОСОВ К БД!)
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

⚡ *Быстрое редактирование* - простое редактирование без сложных настроек
🖼️ *Профессиональное редактирование* - с выбором углов камеры
🔗 *Объединение изображений* - объединение двух изображений в одно
👤 *Серия портретов* - создание серии портретов из одного изображения  
💇 *Изменить стрижку* - изменение прически и цвета волос
🏛️ *Знаменитые места* - помещение себя на фоне достопримечательностей
📸 *Профессиональный портрет* - создание профессионального портрета

💡 *Для лучших результатов пишите промпты на английском языке*`
      : `Choose editing mode:

⚡ *Quick Edit* - simple editing without complex settings
🖼️ *Professional Edit* - with camera angle selection
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
      const isRu = isRussianFromState(ctx)

      if (ctx.session) {
        ctx.session.fluxKontextMode = modeKey as any
      }

      const mode = FLUX_MODES[modeKey as keyof typeof FLUX_MODES]
      const modeTitle = isRu ? mode.title_ru : mode.title_en
      const modeDescription = isRu ? mode.description_ru : mode.description_en

      // 🚀 СПЕЦИАЛЬНАЯ ОБРАБОТКА ДЛЯ БЫСТРОГО РЕЖИМА
      if (modeKey === 'quick') {
        // Для быстрого режима пропускаем выбор углов камеры
        if (ctx.session) {
          ctx.session.fluxKontextStep = 'image_a'
          ctx.session.awaitingFluxKontextImageA = true
        }

        await ctx.editMessageText(
          isRu
            ? `✅ *Выбран режим:* ${modeTitle}\n\n${modeDescription}\n\n📷 Отправьте изображение:`
            : `✅ *Selected mode:* ${modeTitle}\n\n${modeDescription}\n\n📷 Send an image:`,
          {
            parse_mode: 'Markdown',
            reply_markup: createModelSelectionKeyboard(isRu).reply_markup,
          }
        )
        return
      }

      // Показываем выбор угла камеры для остальных режимов
      const cameraKeyboard = createCameraAngleKeyboard(modeKey, isRu)

      await ctx.editMessageText(
        isRu
          ? `✅ *Выбран режим:* ${modeTitle}\n\n${modeDescription}\n\n🎬 *Выберите ракурс камеры для профессиональной съёмки:*`
          : `✅ *Selected mode:* ${modeTitle}\n\n${modeDescription}\n\n🎬 *Choose camera angle for professional shooting:*`,
        {
          parse_mode: 'Markdown',
          reply_markup:
            cameraKeyboard?.reply_markup ||
            createModelSelectionKeyboard(isRu).reply_markup,
        }
      )
    } catch (error) {
      logger.error('Error handling FLUX Kontext mode selection', {
        error: error instanceof Error ? error.message : 'Unknown error',
        telegramId: ctx.from?.id,
        mode: modeKey,
      })
    }
  })
})

// Обработка выбора угла камеры
Object.keys(FLUX_MODES).forEach(modeKey => {
  const mode = FLUX_MODES[modeKey as keyof typeof FLUX_MODES]
  if ('camera_angles' in mode && mode.camera_angles) {
    // Обработка конкретных углов камеры
    mode.camera_angles.forEach(angle => {
      fluxKontextScene.action(`flux_camera_${modeKey}_${angle}`, async ctx => {
        try {
          await ctx.answerCbQuery()
          const isRu = isRussianFromState(ctx)

          if (ctx.session) {
            ctx.session.fluxKontextCameraAngle = angle
            ctx.session.fluxKontextStep = 'image_a'
          }

          const modeTitle = isRu ? mode.title_ru : mode.title_en
          const angleLabel = getCameraAngleLabel(angle, isRu)

          await ctx.editMessageText(
            isRu
              ? `✅ *Режим:* ${modeTitle}\n🎬 *Ракурс:* ${angleLabel}\n\n📷 Отправьте ${
                  mode.images_required === 1
                    ? 'изображение'
                    : 'первое изображение'
                }:`
              : `✅ *Mode:* ${modeTitle}\n🎬 *Angle:* ${angleLabel}\n\n📷 Send ${
                  mode.images_required === 1 ? 'an image' : 'the first image'
                }:`,
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
          logger.error('Error handling camera angle selection', {
            error: error instanceof Error ? error.message : 'Unknown error',
            telegramId: ctx.from?.id,
            mode: modeKey,
            angle: angle,
          })
        }
      })
    })

    // Обработка автовыбора ракурса
    fluxKontextScene.action(`flux_camera_${modeKey}_auto`, async ctx => {
      try {
        await ctx.answerCbQuery()
        const isRu = isRussianFromState(ctx)

        if (ctx.session && 'camera_angles' in mode && mode.camera_angles) {
          // Выбираем первый доступный угол как автовыбор
          ctx.session.fluxKontextCameraAngle = mode.camera_angles[0]
          ctx.session.fluxKontextStep = 'image_a'
        }

        const modeTitle = isRu ? mode.title_ru : mode.title_en

        await ctx.editMessageText(
          isRu
            ? `✅ *Режим:* ${modeTitle}\n🎬 *Ракурс:* Автовыбор (адаптивный)\n\n📷 Отправьте ${
                mode.images_required === 1
                  ? 'изображение'
                  : 'первое изображение'
              }:`
            : `✅ *Mode:* ${modeTitle}\n🎬 *Angle:* Auto Select (adaptive)\n\n📷 Send ${
                mode.images_required === 1 ? 'an image' : 'the first image'
              }:`,
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
        logger.error('Error handling auto camera angle selection', {
          error: error instanceof Error ? error.message : 'Unknown error',
          telegramId: ctx.from?.id,
          mode: modeKey,
        })
      }
    })
  }
})

// Кнопка возврата к выбору режимов
fluxKontextScene.action('flux_kontext_modes', async ctx => {
  try {
    await ctx.answerCbQuery()
    const isRu = isRussianFromState(ctx)

    await ctx.editMessageText(
      isRu
        ? '🎨 *FLUX Kontext* - профессиональное редактирование изображений\n\nВыберите режим работы:'
        : '🎨 *FLUX Kontext* - professional image editing\n\nChoose your mode:',
      {
        parse_mode: 'Markdown',
        reply_markup: createModeSelectionKeyboard(isRu).reply_markup,
      }
    )

    // Сбрасываем выбранные настройки
    if (ctx.session) {
      ctx.session.fluxKontextMode = undefined
      ctx.session.fluxKontextCameraAngle = undefined
    }
  } catch (error) {
    logger.error('Error returning to modes selection', {
      error: error instanceof Error ? error.message : 'Unknown error',
      telegramId: ctx.from?.id,
    })
  }
})

// Обработка выбора модели
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
  const isRu = isRussianFromState(ctx)
  const model =
    FLUX_KONTEXT_MODELS[`black-forest-labs/flux-kontext-${modelType}`]

  await ctx.editMessageText(
    isRu
      ? `✅ *Выбрана модель:* FLUX Kontext ${modelType.toUpperCase()} (${
          model.costPerImage
        }⭐)\n\n📷 Теперь отправьте изображение:`
      : `✅ *Selected model:* FLUX Kontext ${modelType.toUpperCase()} (${
          model.costPerImage
        }⭐)\n\n📷 Now send an image:`,
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
    const isRu = isRussianFromState(ctx)

    logger.info('🎯 FLUX Kontext: Photo received', {
      telegramId: ctx.from?.id,
      awaitingImageA: ctx.session?.awaitingFluxKontextImageA,
      awaitingImageB: ctx.session?.awaitingFluxKontextImageB,
      step: ctx.session?.fluxKontextStep,
      mode: ctx.session?.fluxKontextMode,
      sessionExists: !!ctx.session,
      currentScene: ctx.scene?.current?.id,
    })

    if (
      !ctx.session?.awaitingFluxKontextImageA &&
      !ctx.session?.awaitingFluxKontextImageB
    ) {
      logger.info('🎯 FLUX Kontext: Photo received but not awaiting images', {
        telegramId: ctx.from?.id,
        step: ctx.session?.fluxKontextStep,
        mode: ctx.session?.fluxKontextMode,
      })
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
  const isRu = isRussianFromState(ctx)
  const mode =
    FLUX_MODES[ctx.session?.fluxKontextMode as keyof typeof FLUX_MODES]

  // 🎯 ПРОВЕРЯЕМ: Если пользователь уже выбрал настройки камеры - сразу генерируем!
  if (
    ctx.session?.fluxKontextCameraSettings &&
    ctx.session.fluxKontextCameraSettings !== 'auto'
  ) {
    const [settingType, settingValue] =
      ctx.session.fluxKontextCameraSettings.split(':')

    // Создаем автоматический промпт на основе выбранных настроек камеры
    let autoPrompt = ''

    if (settingType === 'angle') {
      const angleDescriptions: Record<string, string> = {
        medium_shot: 'professional medium shot photography',
        close_up: 'close-up shot with detailed focus',
        extreme_closeup:
          'extreme close-up with ultra detailed macro perspective',
        wide_shot: 'wide angle shot showing full scene',
        american_shot:
          'american shot 3/4 length framing, classic cinematography',
        cowboy_shot: 'cowboy shot hip level framing, western cinema style',
        profile_shot: 'profile view portrait photography',
        three_quarter: 'three-quarter view with dimensional depth',
        back_shot: 'mysterious back view, over shoulder perspective',
        over_shoulder: 'over-the-shoulder shot, classic conversation angle',
        eye_level: 'natural eye level shot, neutral human perspective',
        dutch_angle: 'dynamic dutch angle with tilted composition',
        high_angle: 'dramatic high angle shot looking down',
        low_angle: 'powerful low angle shot looking up',
        birds_eye: "bird's eye view, overhead aerial perspective",
        worms_eye: "worm's eye view, extreme low angle from ground looking up",
        macro_beauty: 'macro beauty shot with perfect details',
      }
      autoPrompt = angleDescriptions[settingValue] || 'professional photography'
    }

    logger.info(
      '🎬 [CAMERA AUTO-GENERATION] Camera settings detected, generating automatically',
      {
        telegramId: ctx.from?.id,
        cameraSettings: ctx.session.fluxKontextCameraSettings,
        settingType,
        settingValue,
        autoPrompt,
        skipPromptRequest: true,
      }
    )

    // Показываем сообщение о начале обработки
    await ctx.reply(
      isRu
        ? `🎬 Применяю выбранные настройки камеры!\n\n✨ Начинаю обработку изображения...`
        : `🎬 Applying selected camera settings!\n\n✨ Starting image processing...`,
      {
        reply_markup: {
          remove_keyboard: true,
        },
      }
    )

    // Сразу вызываем обработку с автоматическим промптом
    await processFluxKontextRequest(ctx, autoPrompt)
    return
  }

  // Если настроек камеры нет - показываем обычный запрос промпта
  if (ctx.session) {
    ctx.session.fluxKontextStep = 'prompt'
    ctx.session.awaitingFluxKontextPrompt = true
  }

  let promptExamples = ''

  // Добавляем специфичные примеры для каждого режима
  switch (ctx.session?.fluxKontextMode) {
    case 'quick':
      promptExamples = isRu
        ? `\n\n💡 *Примеры для быстрого редактирования:*\n• "add sunglasses"\n• "change background to beach"\n• "make it vintage style"\n• "add a hat"\n• "change hair color to blonde"`
        : `\n\n💡 *Examples for quick editing:*\n• "add sunglasses"\n• "change background to beach"\n• "make it vintage style"\n• "add a hat"\n• "change hair color to blonde"`
      break
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
      ? `📝 *Опишите изменения:*\n\nТеперь опишите, что вы хотите изменить или как обработать изображение${
          mode ? ` в режиме "${isRu ? mode.title_ru : mode.title_en}"` : ''
        }.${promptExamples}\n\n🌐 *Для лучших результатов пишите на английском языке*`
      : `📝 *Describe changes:*\n\nNow describe what you want to change or how to process the image${
          mode ? ` in "${isRu ? mode.title_ru : mode.title_en}" mode` : ''
        }.${promptExamples}\n\n🌐 *For best results, write in English*`,
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
    const isRu = isRussianFromState(ctx)
    const messageText = ctx.message.text

    // 🚨 ВАЖНО: Проверяем, не является ли это командой
    if (messageText.startsWith('/')) {
      logger.info('🎯 FLUX Kontext: Command detected, ignoring in scene', {
        telegramId: ctx.from?.id,
        command: messageText,
        scene: 'flux_kontext_scene',
      })
      // Не обрабатываем команды в этой сцене - пропускаем дальше
      return
    }

    // 🔧 ИСПРАВЛЕНИЕ: Обработка кнопки меню "🎨 FLUX Kontext"
    if (messageText === '🎨 FLUX Kontext') {
      logger.info('🎯 FLUX Kontext: Menu button clicked, restarting scene', {
        telegramId: ctx.from?.id,
        messageText,
        currentStep: ctx.session?.fluxKontextStep,
      })

      // Перезапускаем сцену с самого начала
      await ctx.scene.reenter()
      return
    }

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
      logger.info('🎯 FLUX Kontext: Not awaiting prompt, asking for image', {
        telegramId: ctx.from?.id,
        messageText: messageText.substring(0, 50),
      })
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
  const isRu = isRussianFromState(ctx)

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
    // Применяем настройки камеры к промпту
    const cameraAngle = ctx.session?.fluxKontextCameraAngle || 'medium_shot'
    const modeConfig = FLUX_MODES[fluxKontextMode as keyof typeof FLUX_MODES]
    const defaultLighting = modeConfig?.default_lighting || 'soft_natural'

    // Используем промпт как есть, настройки камеры будут применены в сервисе generateFluxKontext
    const enhancedPrompt = prompt

    logger.info('FLUX Kontext enhanced prompt generated', {
      telegramId: ctx.from.id,
      originalPrompt: prompt.substring(0, 50) + '...',
      cameraAngle,
      lighting: defaultLighting,
      enhancedPrompt: enhancedPrompt.substring(0, 100) + '...',
    })

    // Импортируем и используем продвинутый сервис
    const { generateAdvancedFluxKontext } = await import(
      '../../services/generateFluxKontext'
    )

    const result = await generateAdvancedFluxKontext({
      prompt: enhancedPrompt, // используем улучшенный промпт
      mode: fluxKontextMode,
      imageA: fluxKontextImageA,
      imageB: fluxKontextImageB,
      modelType: kontextModelType,
      telegram_id: ctx.from.id.toString(),
      username: ctx.from.username || 'unknown',
      is_ru: isRu,
      ctx,
      cameraSettings: ctx.session?.fluxKontextCameraSettings, // Передаем настройки камеры из сессии
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

    // 🚨 ВАЖНО: Выходим из сцены после успешной обработки
    logger.info('🎯 FLUX Kontext: Leaving scene after successful processing', {
      telegramId: ctx.from.id,
      currentScene: ctx.scene?.current?.id,
    })
    await ctx.scene.leave()
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

    // 🚨 ВАЖНО: Выходим из сцены при ошибке
    logger.info('🎯 FLUX Kontext: Leaving scene after error', {
      telegramId: ctx.from?.id,
      currentScene: ctx.scene?.current?.id,
    })
    await ctx.scene.leave()
  }
}

// Обработка кнопки "Попробовать снова"
fluxKontextScene.action('flux_kontext_retry', async ctx => {
  try {
    await ctx.answerCbQuery()
    const isRu = isRussianFromState(ctx)

    await ctx.reply(
      isRu
        ? '🔄 Попробуем снова! Отправьте изображение для редактирования.'
        : "🔄 Let's try again! Send an image for editing.",
      {
        reply_markup: {
          remove_keyboard: true,
        },
      }
    )

    // Перезапускаем сцену с самого начала
    await ctx.scene.reenter()
  } catch (error) {
    logger.error('Error handling FLUX Kontext retry', {
      error: error instanceof Error ? error.message : 'Unknown error',
      telegramId: ctx.from?.id,
    })
  }
})

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

// Обработка управления камерой
fluxKontextScene.action('flux_camera_control', async ctx => {
  try {
    await ctx.answerCbQuery()
    const isRu = isRussianFromState(ctx)

    // 🎯 ИСПРАВЛЯЕМ: Устанавливаем режим single по умолчанию для управления камерой
    if (ctx.session) {
      ctx.session.fluxKontextMode = 'single' // Используем режим одиночного редактирования
    }

    const cameraControlMenu = isRu
      ? `🎥 *Углы камеры*\n\nВыберите подходящий ракурс для вашего изображения:`
      : `🎥 *Camera Angles*\n\nChoose the right angle for your image:`

    // Создаем клавиатуру сразу со всеми углами камеры
    const angles = [
      { key: 'medium_shot', ru: '📷 Средний план', en: '📷 Medium Shot' },
      { key: 'close_up', ru: '🔍 Крупный план', en: '🔍 Close Up' },
      {
        key: 'extreme_closeup',
        ru: '🔬 Экстра крупный',
        en: '🔬 Extreme Close-Up',
      },
      { key: 'wide_shot', ru: '🌐 Общий план', en: '🌐 Wide Shot' },
      {
        key: 'american_shot',
        ru: '🇺🇸 Американский план',
        en: '🇺🇸 American Shot',
      },
      { key: 'cowboy_shot', ru: '🤠 Ковбойский план', en: '🤠 Cowboy Shot' },
      { key: 'profile_shot', ru: '👤 Профиль', en: '👤 Profile' },
      {
        key: 'three_quarter',
        ru: '📐 3/4 ракурс',
        en: '📐 Three-Quarter View',
      },
      { key: 'back_shot', ru: '🔄 Сзади', en: '🔄 Back Shot' },
      {
        key: 'over_shoulder',
        ru: '🏔️ Через плечо',
        en: '🏔️ Over-the-Shoulder',
      },
      { key: 'eye_level', ru: '👁️ На уровне глаз', en: '👁️ Eye Level' },
      { key: 'dutch_angle', ru: '🎭 Голландский угол', en: '🎭 Dutch Angle' },
      { key: 'high_angle', ru: '📐 Верхний ракурс', en: '📐 High Angle' },
      { key: 'low_angle', ru: '📐 Нижний ракурс', en: '📐 Low Angle' },
      { key: 'birds_eye', ru: '🦅 Вид с высоты', en: "🦅 Bird's Eye View" },
      { key: 'worms_eye', ru: '🐛 Вид снизу вверх', en: "🐛 Worm's Eye View" },
      { key: 'macro_beauty', ru: '💎 Макро красота', en: '💎 Macro Beauty' },
    ]

    const keyboard = []

    // Добавляем углы камеры по два в ряд
    for (let i = 0; i < angles.length; i += 2) {
      const row = []
      row.push(
        Markup.button.callback(
          isRu ? angles[i].ru : angles[i].en,
          `flux_select_angle_${angles[i].key}`
        )
      )
      if (i + 1 < angles.length) {
        row.push(
          Markup.button.callback(
            isRu ? angles[i + 1].ru : angles[i + 1].en,
            `flux_select_angle_${angles[i + 1].key}`
          )
        )
      }
      keyboard.push(row)
    }

    // Кнопки навигации
    keyboard.push([
      Markup.button.callback(
        isRu ? '⬅️ Назад к режимам' : '⬅️ Back to Modes',
        'flux_back_to_modes'
      ),
    ])

    keyboard.push([
      Markup.button.callback(isRu ? 'Отмена' : 'Cancel', 'flux_kontext_cancel'),
    ])

    await ctx.editMessageText(cameraControlMenu, {
      parse_mode: 'Markdown',
      reply_markup: Markup.inlineKeyboard(keyboard).reply_markup,
    })
  } catch (error) {
    logger.error('Error in camera control handler', {
      error: error instanceof Error ? error.message : 'Unknown error',
      telegramId: ctx.from?.id,
    })
  }
})

// Обработка возврата к режимам
fluxKontextScene.action('flux_back_to_modes', async ctx => {
  try {
    await ctx.answerCbQuery()
    const isRu = isRussianFromState(ctx)

    const title = isRu
      ? '🎨 *FLUX Kontext* - Продвинутое ИИ редактирование изображений'
      : '🎨 *FLUX Kontext* - Advanced AI Image Editing'

    const description = isRu
      ? `Выберите режим редактирования:

⚡ *Быстрое редактирование* - простое редактирование без сложных настроек
🖼️ *Профессиональное редактирование* - с выбором углов камеры
🔗 *Объединение изображений* - объединение двух изображений в одно
👤 *Серия портретов* - создание серии портретов из одного изображения  
💇 *Изменить стрижку* - изменение прически и цвета волос
🏛️ *Знаменитые места* - помещение себя на фоне достопримечательностей
📸 *Профессиональный портрет* - создание профессионального портрета

💡 *Для лучших результатов пишите промпты на английском языке*`
      : `Choose editing mode:

⚡ *Quick Edit* - simple editing without complex settings
🖼️ *Professional Edit* - with camera angle selection
🔗 *Multi-Image Combine* - combine two images into one
👤 *Portrait Series* - generate a series of portraits from one image
💇 *Change Haircut* - change hairstyle and hair color  
🏛️ *Iconic Locations* - put yourself in front of famous landmarks
📸 *Professional Headshot* - generate a professional headshot

💡 *For best results, write prompts in English*`

    await ctx.editMessageText(title + '\n\n' + description, {
      parse_mode: 'Markdown',
      reply_markup: createModeSelectionKeyboard(isRu).reply_markup,
    })
  } catch (error) {
    logger.error('Error returning to modes', {
      error: error instanceof Error ? error.message : 'Unknown error',
      telegramId: ctx.from?.id,
    })
  }
})

// Обработка отмены
fluxKontextScene.action('flux_kontext_cancel', async ctx => {
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
    logger.error('Error handling FLUX Kontext cancel', {
      error: error instanceof Error ? error.message : 'Unknown error',
      telegramId: ctx.from?.id,
    })
  }
})

// Обработчики конкретных выборов настроек камеры

// Создаем функцию для обработки выбора настройки камеры
const handleCameraSetting = async (
  ctx: MyContext,
  settingType: 'angle',
  settingValue: string
) => {
  const isRu = isRussianFromState(ctx)

  // Создаём настройку в формате "type:value"
  const cameraSettings = `${settingType}:${settingValue}`

  // Сохраняем настройки камеры в сессии
  if (ctx.session) {
    ctx.session.fluxKontextCameraSettings = cameraSettings
    ctx.session.kontextModelType = 'max' // 🔧 ТЕСТИРУЕМ: Модель FLUX Kontext Max для всех 17 ракурсов!
    ctx.session.fluxKontextStep = 'image_a'
    ctx.session.awaitingFluxKontextImageA = true

    // 🎬 TRIPLE MODEL BENCHMARK MODE: Uncomment one of these lines for testing
    // ctx.session.kontextModelType = 'max'   // For MAX model tests
    // ctx.session.kontextModelType = 'pro'   // For PRO model tests
    // ctx.session.kontextModelType = 'ultra' // For ULTRA model tests

    logger.info('🎬 Camera setting applied', {
      telegramId: ctx.from?.id,
      settingType,
      settingValue,
      cameraSettings,
      modelType: ctx.session.kontextModelType,
    })
  }

  // Создаем описание выбранной настройки
  const settingDescriptions: Record<string, { ru: string; en: string }> = {
    // Углы камеры
    'angle:medium_shot': { ru: '📷 Средний план', en: '📷 Medium Shot' },
    'angle:close_up': { ru: '🔍 Крупный план', en: '🔍 Close Up' },
    'angle:extreme_closeup': {
      ru: '🔬 Экстра крупный план',
      en: '🔬 Extreme Close-Up',
    },
    'angle:wide_shot': { ru: '🌐 Общий план', en: '🌐 Wide Shot' },
    'angle:american_shot': {
      ru: '🇺🇸 Американский план',
      en: '🇺🇸 American Shot',
    },
    'angle:cowboy_shot': { ru: '🤠 Ковбойский план', en: '🤠 Cowboy Shot' },
    'angle:profile_shot': { ru: '👤 Профиль', en: '👤 Profile' },
    'angle:three_quarter': { ru: '📐 3/4 ракурс', en: '📐 Three-Quarter View' },
    'angle:back_shot': { ru: '🔄 Съемка сзади', en: '🔄 Back Shot' },
    'angle:over_shoulder': { ru: '🏔️ Через плечо', en: '🏔️ Over-the-Shoulder' },
    'angle:eye_level': { ru: '👁️ На уровне глаз', en: '👁️ Eye Level' },
    'angle:dutch_angle': { ru: '🎭 Голландский угол', en: '🎭 Dutch Angle' },
    'angle:high_angle': { ru: '📐 Верхний ракурс', en: '📐 High Angle' },
    'angle:low_angle': { ru: '📐 Нижний ракурс', en: '📐 Low Angle' },
    'angle:birds_eye': {
      ru: '🦅 Вид с высоты птичьего полета',
      en: "🦅 Bird's Eye View",
    },
    'angle:worms_eye': { ru: '🐛 Вид снизу вверх', en: "🐛 Worm's Eye View" },
    'angle:macro_beauty': { ru: '💎 Макро красота', en: '💎 Macro Beauty' },
  }

  const settingKey = `${settingType}:${settingValue}`
  const settingDescription = settingDescriptions[settingKey]

  await ctx.editMessageText(
    isRu
      ? `✅ *Выбрана настройка камеры:* ${
          settingDescription?.ru || settingValue
        }

🎬 Отличный выбор! Эта настройка будет применена к вашему изображению.

📷 Теперь отправьте изображение для обработки:`
      : `✅ *Camera setting selected:* ${settingDescription?.en || settingValue}

🎬 Excellent choice! This setting will be applied to your image.

📷 Now send an image for processing:`,
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

// Обработчики для углов камеры
const angles = [
  'medium_shot',
  'close_up',
  'extreme_closeup',
  'wide_shot',
  'american_shot',
  'cowboy_shot',
  'profile_shot',
  'three_quarter',
  'back_shot',
  'over_shoulder',
  'eye_level',
  'dutch_angle',
  'high_angle',
  'low_angle',
  'birds_eye',
  'worms_eye',
  'macro_beauty',
]
angles.forEach(angle => {
  fluxKontextScene.action(`flux_select_angle_${angle}`, async ctx => {
    try {
      await ctx.answerCbQuery()
      await handleCameraSetting(ctx, 'angle', angle)
    } catch (error) {
      logger.error(`Error selecting camera angle ${angle}`, {
        error: error instanceof Error ? error.message : 'Unknown error',
        telegramId: ctx.from?.id,
      })
    }
  })
})
