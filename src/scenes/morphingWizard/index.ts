import { Markup, Scenes } from 'telegraf'
import { MyContext } from '../../interfaces'
import { isRussianFromState } from '@/helpers/centralizedLanguage'
import { handleHelpCancel } from '@/handlers/handleHelpCancel'
import { getBotToken } from '@/handlers/getBotToken'
import { generateMorphing } from '../../services/generateMorphing'
import { shouldShowRubles } from '@/core/bot/shouldShowRubles'
import { logger } from '@/utils/logger'
import { calculateFinalPrice } from '@/price/helpers/calculateFinalPrice'
import { processBalanceVideoOperationHelper } from '@/modules/videoGenerator/helpers/priceHelper'
import { isValidImage } from '../../helpers/images'
import fs from 'fs'
import { ModeEnum } from '@/interfaces/modes'
import * as path from 'path'

// ✅ КОНСТАНТА ДЛЯ МОДЕЛИ МОРФИНГА (ПРЕМИУМ КАЧЕСТВО)
const MORPHING_MODEL_KEY = 'kling-v1.6-pro'

// ✅ ZIP архив больше не нужен - работаем напрямую с изображениями

// ✅ Функция для создания адаптивного прогресс бара для бесконечной загрузки
const createProgressBar = (current: number, length: number = 10): string => {
  // Логика: чем больше изображений, тем больше заполняется бар, но не ограничиваемся максимумом
  // Используем адаптивную шкалу для плавного заполнения
  let filled: number
  if (current <= 2) {
    // Первые 2 изображения = 20% бара (минимум для работы)
    filled = Math.floor((current / 2) * 2)
  } else if (current <= 5) {
    // 3-5 изображений = 20%-50% бара (хорошо)
    filled = 2 + Math.floor(((current - 2) / 3) * 3)
  } else if (current <= 10) {
    // 6-10 изображений = 50%-80% бара (отлично)
    filled = 5 + Math.floor(((current - 5) / 5) * 3)
  } else {
    // Более 10 изображений = 80%-95% бара (потрясающе, но никогда не заполняем полностью)
    filled = Math.min(9, 8 + Math.floor(Math.log10(current - 9)))
  }

  const empty = length - filled
  return `[${'▓'.repeat(filled) + '░'.repeat(empty)}] ${current}/∞`
}

// ✅ Функция для создания сообщения о прогрессе с последовательностью
const createProgressMessage = (images: any[], isRu: boolean): string => {
  const count = images.length
  const progressBar = createProgressBar(count, 10)

  const statusIcon = count >= 2 ? '✅' : '⏳'
  const statusText =
    count >= 2
      ? isRu
        ? 'Достаточно изображений для создания морфинга!'
        : 'Enough images to create morphing!'
      : isRu
      ? 'Загрузите еще изображения'
      : 'Upload more images'

  // ✅ НОВОЕ: Создание списка последовательности изображений
  let sequenceText = ''
  if (count > 0) {
    // Умное отображение: если много изображений, показываем сокращенно
    let imagesList = ''
    if (count <= 6) {
      // Показываем все изображения если их мало
      imagesList = images
        .map((_, index) => `${index + 1}️⃣ Изображение ${index + 1}`)
        .join('\n')
    } else {
      // Показываем первые 3, многоточие, и последние 2
      const first3 = images
        .slice(0, 3)
        .map((_, index) => `${index + 1}️⃣ Изображение ${index + 1}`)
        .join('\n')
      const last2 = images
        .slice(-2)
        .map(
          (_, index) =>
            `${count - 1 + index}️⃣ Изображение ${count - 1 + index}`
        )
        .join('\n')
      imagesList = `${first3}\n⋮ ... (+${count - 5} изображений) ...\n${last2}`
    }

    // Создание примера переходов
    let transitionsText = ''
    if (count >= 2) {
      let transitionsDisplay = ''
      if (count <= 8) {
        // Показываем все переходы если их немного
        const transitions = []
        for (let i = 0; i < count - 1; i++) {
          transitions.push(`${i + 1}→${i + 2}`)
        }
        transitionsDisplay = transitions.join(', ')
      } else {
        // Показываем сокращенно: первые, средние, последние
        transitionsDisplay = `1→2, 2→3, 3→4, ..., ${count - 1}→${count} (${
          count - 1
        } переходов)`
      }

      transitionsText = isRu
        ? `\n🔄 <b>Переходы:</b> ${transitionsDisplay}`
        : `\n🔄 <b>Transitions:</b> ${transitionsDisplay.replace(
            /переходов/g,
            'transitions'
          )}`
    }

    sequenceText = isRu
      ? `\n📋 <b>Последовательность склейки:</b>\n${imagesList}${transitionsText}`
      : `\n📋 <b>Sequence order:</b>\n${imagesList
          .replace(/Изображение/g, 'Image')
          .replace(/изображений/g, 'images')}${transitionsText}`
  }

  return isRu
    ? `🧬 <b>Морфинг - Загрузка изображений</b>

📸 <b>Загружено:</b> ${count} из минимум 2 изображений  
📊 <b>Прогресс:</b> ${progressBar}

${statusIcon} <b>${statusText}</b>${sequenceText}

🎬 <b>Будет создано:</b> ${Math.max(0, count - 1)} видео переходов
💡 <b>Совет:</b> Порядок загрузки = порядок склейки (без ограничений!)`
    : `🧬 <b>Morphing - Image Upload</b>

📸 <b>Uploaded:</b> ${count} of minimum 2 images  
📊 <b>Progress:</b> ${progressBar}

${statusIcon} <b>${statusText}</b>${sequenceText}

🎬 <b>Will create:</b> ${Math.max(0, count - 1)} video transitions
💡 <b>Tip:</b> Upload order = merge order (unlimited!)`
}

// ✅ Функция для создания клавиатуры прогресса
const createProgressKeyboard = (images: any[], isRu: boolean) => {
  const canGenerate = images.length >= 2

  const keyboard = []

  if (canGenerate) {
    keyboard.push([
      Markup.button.callback(
        isRu ? '✅ Создать морфинг' : '✅ Create morphing',
        'morphing_start_generation'
      ),
    ])
  }

  keyboard.push([
    Markup.button.callback(
      isRu ? '🔄 Начать заново' : '🔄 Start over',
      'morphing_restart'
    ),
  ])

  keyboard.push([
    Markup.button.callback(
      isRu ? '⚡ Продолжить незавершенное' : '⚡ Resume incomplete',
      'morphing_resume'
    ),
  ])

  return Markup.inlineKeyboard(keyboard)
}

// Создание Wizard Scene
export const morphingWizard = new Scenes.WizardScene<MyContext>(
  'morphing_wizard',

  // ✅ ШАГ 1: Приветствие и инструкции
  async ctx => {
    const isRu = isRussianFromState(ctx)

    console.log('🧬 [MORPHING WIZARD] Step 1 - Scene Entry!')
    logger.info('🧬 [MORPHING WIZARD] Step 1 - Scene Entry', {
      telegramId: ctx.from?.id,
      username: ctx.from?.username,
      sessionExists: !!ctx.session,
      currentCursor: ctx.wizard?.cursor,
    })

    // Очищаем предыдущие данные
    if (ctx.session) {
      ctx.session.morphingImages = []
      ctx.session.morphingProgressMessageId = undefined
      ctx.session.morphingRestarting = false // Сбрасываем флаг перезапуска
    }

    const welcomeMessage = isRu
      ? `🧬 <b>Добро пожаловать в Морфинг Студию!</b>

✨ Создавайте потрясающие видео переходы между изображениями
📸 Загрузите минимум 2 изображения для начала
🎯 Система создаст плавные переходы между всеми кадрами

📋 <b>Важно:</b> Порядок загрузки = порядок склейки
🔄 <b>Пример:</b> Фото 1→2→3 = переходы 1→2, 2→3

<i>📤 Отправьте первое изображение:</i>`
      : `🧬 <b>Welcome to Morphing Studio!</b>

✨ Create stunning video transitions between images
📸 Upload minimum 2 images to start
🎯 System will create smooth transitions between all frames

📋 <b>Important:</b> Upload order = merge order
🔄 <b>Example:</b> Photo 1→2→3 = transitions 1→2, 2→3

<i>📤 Send your first image:</i>`

    try {
      await ctx.reply(welcomeMessage, {
        parse_mode: 'HTML',
        reply_markup: Markup.inlineKeyboard([
          [
            Markup.button.callback(
              isRu ? 'Отмена' : 'Cancel',
              'morphing_cancel'
            ),
          ],
        ]).reply_markup,
      })

      logger.info(
        '🧬 [MORPHING WIZARD] Step 1 - Welcome message sent, moving to next step',
        {
          telegramId: ctx.from?.id,
        }
      )
    } catch (error) {
      console.log('❌ [MORPHING_WIZARD] Error sending welcome message:', error)
      logger.error('Error sending welcome message in morphing wizard', {
        error: error instanceof Error ? error.message : 'Unknown error',
        telegramId: ctx.from?.id,
      })

      // Fallback - отправляем простое сообщение без разметки
      try {
        await ctx.reply(
          isRu
            ? '🧬 Морфинг - загрузите первое изображение:'
            : '🧬 Morphing - upload first image:'
        )
      } catch (fallbackError) {
        console.log(
          '❌ [MORPHING_WIZARD] Even fallback message failed:',
          fallbackError
        )
      }
    }

    return ctx.wizard.next()
  },

  // ✅ ШАГ 2: Пакетная загрузка изображений
  async ctx => {
    const isRu = isRussianFromState(ctx)
    const message = ctx.message

    logger.info('🧬 [MORPHING WIZARD] Step 2 - Image Collection', {
      telegramId: ctx.from?.id,
      hasMessage: !!message,
      messageType: message ? Object.keys(message) : [],
      currentImagesCount: ctx.session?.morphingImages?.length || 0,
    })

    // Обработка отмены
    const isCancel = await handleHelpCancel(ctx)
    if (isCancel) {
      return ctx.scene.leave()
    }

    // Обработка фотографий
    if (message && 'photo' in message) {
      logger.info('🧬 [MORPHING WIZARD] Step 2 - Processing photo')

      if (!ctx.session.morphingImages) {
        ctx.session.morphingImages = []
      }

      const photo = message.photo[message.photo.length - 1]
      const file = await ctx.telegram.getFile(photo.file_id)

      if (!file.file_path) {
        await ctx.reply(
          isRu ? '❌ Ошибка получения файла' : '❌ Error getting file'
        )
        return
      }

      try {
        const botToken = getBotToken(ctx)
        const response = await fetch(
          `https://api.telegram.org/file/bot${botToken}/${file.file_path}`
        )
        const buffer = Buffer.from(await response.arrayBuffer())

        // Валидация изображения
        const isValid = await isValidImage(buffer)
        if (!isValid) {
          await ctx.reply(
            isRu
              ? '❌ Файл не является корректным изображением.'
              : '❌ File is not a valid image.'
          )
          return
        }

        // Проверка размера файла (максимум 10MB)
        const MAX_IMAGE_SIZE = 10 * 1024 * 1024
        if (buffer.length > MAX_IMAGE_SIZE) {
          await ctx.reply(
            isRu
              ? '❌ Изображение слишком большое (максимум 10MB).'
              : '❌ Image too large (maximum 10MB).'
          )
          return
        }

        // ✅ ДОБАВЛЯЕМ ИЗОБРАЖЕНИЕ С TIMESTAMP ДЛЯ ПРАВИЛЬНОЙ СОРТИРОВКИ
        const imageIndex = ctx.session.morphingImages.length + 1
        const currentTimestamp = Date.now() + imageIndex // Уникальный timestamp для сортировки

        ctx.session.morphingImages.push({
          buffer: Buffer.from(buffer),
          filename: `morphing_image_${imageIndex}.jpg`,
          timestamp: currentTimestamp, // ✅ Добавляем timestamp для сортировки
          originalOrder: imageIndex, // ✅ Сохраняем исходный порядок добавления
        })

        logger.info(
          `🧬 [MORPHING WIZARD] Image ${imageIndex} added successfully`,
          {
            telegramId: ctx.from?.id,
            totalImages: ctx.session.morphingImages.length,
            imageSize: buffer.length,
          }
        )

        // Создаем сообщение с прогрессом
        const progressMessage = createProgressMessage(
          ctx.session.morphingImages,
          isRu
        )
        const keyboard = createProgressKeyboard(
          ctx.session.morphingImages,
          isRu
        )

        // Обновляем сообщение о прогрессе или создаем новое
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
            logger.warn('Failed to edit progress message, creating new one', {
              telegramId: ctx.from?.id,
              error: error instanceof Error ? error.message : 'Unknown error',
            })
            // Если не удалось обновить, создаем новое сообщение
            const sentMessage = await ctx.reply(progressMessage, {
              parse_mode: 'HTML',
              reply_markup: keyboard.reply_markup,
            })
            if ('message_id' in sentMessage) {
              ctx.session.morphingProgressMessageId = sentMessage.message_id
            }
          }
        } else {
          const sentMessage = await ctx.reply(progressMessage, {
            parse_mode: 'HTML',
            reply_markup: keyboard.reply_markup,
          })
          if ('message_id' in sentMessage) {
            ctx.session.morphingProgressMessageId = sentMessage.message_id
          }
        }

        // Мотивационные сообщения на ключевых этапах
        if (imageIndex === 2) {
          setTimeout(async () => {
            await ctx.reply(
              isRu
                ? '🎉 Отлично! Уже можно создать морфинг. Добавьте еще изображения для большего количества переходов!'
                : '🎉 Great! You can now create morphing. Add more images for more transitions!'
            )
          }, 1000)
        } else if (imageIndex === 5) {
          setTimeout(async () => {
            await ctx.reply(
              isRu
                ? '⭐ Превосходно! 5 изображений дадут потрясающий результат!'
                : '⭐ Excellent! 5 images will give amazing results!'
            )
          }, 1000)
        } else if (imageIndex === 10) {
          setTimeout(async () => {
            await ctx.reply(
              isRu
                ? '🚀 Невероятно! 10 изображений = эпический морфинг! Можете продолжать добавлять!'
                : '🚀 Incredible! 10 images = epic morphing! You can keep adding more!'
            )
          }, 1000)
        } else if (imageIndex === 20) {
          setTimeout(async () => {
            await ctx.reply(
              isRu
                ? '💫 ЛЕГЕНДАРНО! 20 изображений создадут кинематографический шедевр!'
                : '💫 LEGENDARY! 20 images will create a cinematic masterpiece!'
            )
          }, 1000)
        }
      } catch (error) {
        logger.error('Error processing morphing image', {
          error: error instanceof Error ? error.message : 'Unknown error',
          telegramId: ctx.from?.id,
        })

        await ctx.reply(
          isRu
            ? '❌ Ошибка при обработке изображения. Попробуйте еще раз.'
            : '❌ Error processing image. Please try again.'
        )
      }

      return // Остаемся на том же шаге для загрузки еще изображений
    }

    // Если это не фото и не отмена - просим отправить фото
    if (message && 'text' in message && !message.text.startsWith('/')) {
      await ctx.reply(
        isRu
          ? '📸 Пожалуйста, отправьте изображение (не текст).'
          : '📸 Please send an image (not text).'
      )
    }

    return // Остаемся на том же шаге
  },

  // ✅ ШАГ 3: Выбор типа морфинга (LOOP или LINEAR)
  async ctx => {
    console.log('🔄 [STEP 3] Loop Selection step STARTED!')
    const isRu = isRussianFromState(ctx)

    console.log('🔄 [STEP 3] Current wizard cursor:', ctx.wizard.cursor)
    console.log(
      '🔄 [STEP 3] Images count:',
      ctx.session?.morphingImages?.length || 0
    )

    logger.info('🧬 [MORPHING WIZARD] Step 3 - Loop Selection', {
      telegramId: ctx.from?.id,
      imagesCount: ctx.session?.morphingImages?.length || 0,
    })

    const loopMessage = isRu
      ? `🔄 <b>Выбор типа морфинга</b>

🔄 <b>С зацикливанием (LOOP):</b>
• Последнее изображение плавно переходит в первое
• Получается бесконечная анимация
• Идеально для презентаций и фонов

➡️ <b>Линейный (БЕЗ лупа):</b>
• Простые переходы от первого к последнему
• Классический стиль морфинга
• Лучше для последовательных историй

Какой тип предпочитаете?`
      : `🔄 <b>Choose Morphing Type</b>

🔄 <b>With Loop:</b>
• Last image smoothly transitions to first
• Creates infinite animation
• Perfect for presentations and backgrounds

➡️ <b>Linear (NO loop):</b>
• Simple transitions from first to last
• Classic morphing style
• Better for sequential stories

Which type do you prefer?`

    console.log('🔄 [STEP 3] About to send loop selection message...')

    await ctx.reply(loopMessage, {
      parse_mode: 'HTML',
      reply_markup: Markup.inlineKeyboard([
        [
          Markup.button.callback(
            isRu ? '🔄 С зацикливанием' : '🔄 With Loop',
            'morphing_confirm_loop'
          ),
        ],
        [
          Markup.button.callback(
            isRu ? '➡️ Без зацикливания' : '➡️ No Loop',
            'morphing_confirm_linear'
          ),
        ],
        [
          Markup.button.callback(
            isRu ? '🔙 Назад к загрузке' : '🔙 Back to upload',
            'morphing_back_to_upload'
          ),
        ],
      ]).reply_markup,
    })

    console.log(
      '🔄 [STEP 3] Loop selection message sent! Staying on this step.'
    )
    return // Остаемся на этом шаге до выбора
  }
)

// ✅ ОБРАБОТЧИКИ КНОПОК

// Кнопка "Создать морфинг" - переход к выбору лупа
morphingWizard.action('morphing_start_generation', async ctx => {
  try {
    console.log('🚀 [MORPHING_START] Action triggered!')
    await ctx.answerCbQuery()
    const isRu = isRussianFromState(ctx)

    console.log('🚀 [MORPHING_START] Current wizard cursor:', ctx.wizard.cursor)
    console.log(
      '🚀 [MORPHING_START] Images count:',
      ctx.session?.morphingImages?.length
    )

    if (!ctx.session?.morphingImages || ctx.session.morphingImages.length < 2) {
      console.log('❌ [MORPHING_START] Not enough images!')
      await ctx.reply(
        isRu
          ? '❌ Необходимо минимум 2 изображения для создания морфинга.'
          : '❌ Minimum 2 images required to create morphing.'
      )
      return
    }

    // ✅ ПЕРЕХОДИМ К ШАГУ ВЫБОРА ЛУПА (ШАГ 2)
    console.log('🚀 [MORPHING_START] About to go to step 2 (loop selection)')
    console.log('🚀 [MORPHING_START] Current cursor before:', ctx.wizard.cursor)

    // Принудительно переходим к шагу 2 (выбор лупа)
    ctx.wizard.selectStep(2)
    console.log(
      '🚀 [MORPHING_START] After selectStep(2), new cursor:',
      ctx.wizard.cursor
    )

    // ✅ ПРИНУДИТЕЛЬНО ВЫПОЛНЯЕМ ШАГИ ПОСЛЕ СМЕНЫ КУРСОРА
    console.log('🚀 [MORPHING_START] About to execute current step...')
    const currentStepHandler = ctx.wizard.step
    if (typeof currentStepHandler === 'function') {
      console.log('🚀 [MORPHING_START] Executing current step handler...')
      await currentStepHandler(ctx, async () => {}) // Добавляем пустую next функцию
    } else {
      console.log('❌ [MORPHING_START] No step handler found!')
    }

    return
  } catch (error) {
    console.log('❌ [MORPHING_START] ERROR:', error)
    logger.error('Error in morphing_start_generation', {
      error: error instanceof Error ? error.message : 'Unknown error',
      telegramId: ctx.from?.id,
    })
  }
})

// ✅ НОВЫЕ CALLBACK'И ДЛЯ ВЫБОРА ЛУПА

// Подтверждение LOOP морфинга
morphingWizard.action('morphing_confirm_loop', async ctx => {
  try {
    console.log('🔄 [CONFIRM_LOOP] Action triggered!')
    await ctx.answerCbQuery()
    const isRu = isRussianFromState(ctx)

    // Сохраняем тип морфинга в сессии
    if (ctx.session) {
      ctx.session.morphingType = 'loop'
      console.log('🔄 [CONFIRM_LOOP] Set morphingType to loop')
    }

    console.log(
      '🔄 [CONFIRM_LOOP] About to call startMorphingGeneration with loop=true'
    )
    await startMorphingGeneration(ctx, true) // true = with loop
  } catch (error) {
    console.log('❌ [CONFIRM_LOOP] ERROR:', error)
    logger.error('Error in morphing_confirm_loop', {
      error: error instanceof Error ? error.message : 'Unknown error',
      telegramId: ctx.from?.id,
    })
  }
})

// Подтверждение LINEAR морфинга
morphingWizard.action('morphing_confirm_linear', async ctx => {
  try {
    console.log('➡️ [CONFIRM_LINEAR] Action triggered!')
    await ctx.answerCbQuery()
    const isRu = isRussianFromState(ctx)

    // Сохраняем тип морфинга в сессии
    if (ctx.session) {
      ctx.session.morphingType = 'linear'
      console.log('➡️ [CONFIRM_LINEAR] Set morphingType to linear')
    }

    console.log(
      '➡️ [CONFIRM_LINEAR] About to call startMorphingGeneration with loop=false'
    )
    await startMorphingGeneration(ctx, false) // false = no loop
  } catch (error) {
    logger.error('Error in morphing_confirm_linear', {
      error: error instanceof Error ? error.message : 'Unknown error',
      telegramId: ctx.from?.id,
    })
  }
})

// Возврат к загрузке
morphingWizard.action('morphing_back_to_upload', async ctx => {
  try {
    await ctx.answerCbQuery()
    return ctx.wizard.back() // Возвращаемся к шагу 2
  } catch (error) {
    logger.error('Error in morphing_back_to_upload', {
      error: error instanceof Error ? error.message : 'Unknown error',
      telegramId: ctx.from?.id,
    })
  }
})

// ✅ ФУНКЦИЯ ЗАПУСКА МОРФИНГА (ВЫДЕЛЕНА ИЗ CALLBACK'А)
async function startMorphingGeneration(ctx: MyContext, withLoop: boolean) {
  console.log(`🎬 [START_MORPHING] Function called with withLoop=${withLoop}`)
  const isRu = isRussianFromState(ctx)

  console.log(
    `🎬 [START_MORPHING] Images count: ${ctx.session?.morphingImages?.length}`
  )

  if (!ctx.session?.morphingImages || ctx.session.morphingImages.length < 2) {
    console.log('❌ [START_MORPHING] Not enough images!')
    await ctx.reply(
      isRu
        ? '❌ Необходимо минимум 2 изображения для создания морфинга.'
        : '❌ Minimum 2 images required to create morphing.'
    )
    return
  }

  try {
    logger.info('🧬 [MORPHING WIZARD] Starting generation', {
      telegramId: ctx.from?.id,
      imagesCount: ctx.session.morphingImages.length,
    })

    // ===== 💰 ДОБАВЛЯЕМ СПИСАНИЕ БАЛАНСА =====
    logger.info('[startMorphingGeneration] Processing balance for morphing', {
      telegramId: ctx.from?.id,
      modelId: MORPHING_MODEL_KEY,
    })

    const balanceResult = await processBalanceVideoOperationHelper(
      String(ctx.from!.id),
      MORPHING_MODEL_KEY,
      isRu,
      ctx.botInfo?.username || 'unknown_bot',
      'morphing'
    )

    if (!balanceResult.success || balanceResult.newBalance === undefined) {
      logger.error('[startMorphingGeneration] Balance check failed', {
        telegramId: ctx.from?.id,
        error: balanceResult.error,
      })
      await ctx.reply(
        balanceResult.error ||
          (isRu ? '❌ Ошибка проверки баланса' : '❌ Balance check failed')
      )
      return
    }

    logger.info('[startMorphingGeneration] Balance sufficient and deducted', {
      telegramId: ctx.from?.id,
      paymentAmount: balanceResult.paymentAmount,
      newBalance: balanceResult.newBalance,
    })
    // ===== 💰 КОНЕЦ СПИСАНИЯ БАЛАНСА =====

    // Показываем информацию о стоимости
    const imagesCount = ctx.session.morphingImages.length
    const transitionsCount = withLoop
      ? imagesCount // С лупом: 1→2, 2→3, 3→1 (включая возврат к первому)
      : imagesCount - 1 // Линейные переходы: 1→2, 2→3, 3→4 (без зацикливания)
    const finalPriceInStars = calculateFinalPrice(MORPHING_MODEL_KEY)
    const totalCost = finalPriceInStars * transitionsCount

    const morphingTypeText = isRu
      ? withLoop
        ? '🔄 С зацикливанием (LOOP)'
        : '➡️ Линейный (БЕЗ лупа)'
      : withLoop
      ? '🔄 With Loop'
      : '➡️ Linear (No Loop)'

    const costMessage = isRu
      ? `💰 <b>Информация о стоимости:</b>

📸 <b>Изображений:</b> ${imagesCount}  
🎬 <b>Тип:</b> ${morphingTypeText}
🔄 <b>Видео переходов:</b> ${transitionsCount}
💫 <b>Стоимость за переход:</b> ${finalPriceInStars}⭐  
💎 <b>Общая стоимость:</b> ${totalCost}⭐

⚠️ <b>ВАЖНО:</b> При ошибках безопасности система попробует альтернативные модели Kling (v1.6 Standard, v2.0), что может увеличить стоимость до $3-5 за клип. Это происходит автоматически для обхода фильтров с лицами.

✨ Создаю потрясающий морфинг для вас...
⏳ Может занять до 5 минут, ожидайте...`
      : `💰 <b>Cost Information:</b>

📸 <b>Images:</b> ${imagesCount}  
🎬 <b>Type:</b> ${morphingTypeText}
🔄 <b>Video transitions:</b> ${transitionsCount}
💫 <b>Cost per transition:</b> ${finalPriceInStars}⭐  
💎 <b>Total cost:</b> ${totalCost}⭐

⚠️ <b>IMPORTANT:</b> If safety filters reject content, system will automatically try alternative Kling models (v1.6 Standard, v2.0), which may increase cost to $3-5 per clip. This happens automatically to bypass face filters.

✨ Creating amazing morphing for you...
⏳ This may take up to 5 minutes, please wait...`

    await ctx.editMessageText(costMessage, {
      parse_mode: 'HTML',
    })

    // Вызываем сервис генерации морфинга (прямо с изображениями, без архива)
    const morphingResult = await generateMorphing({
      images: ctx.session.morphingImages,
      telegram_id: ctx.from!.id.toString(),
      is_ru: isRu,
      botName: ctx.botInfo?.username || 'ai_koshey_bot',
      imageCount: imagesCount,
      morphingType: 'seamless',
      withLoop: withLoop, // ✅ ПЕРЕДАЕМ ПАРАМЕТР ЛУПА
    })

    // Уведомляем о запуске обработки
    const completionMessage = isRu
      ? `🚀 Морфинг запущен в обработку! 

⏳ Создание видео займет до 5 минут
📱 Готовое видео будет отправлено вам автоматически

💡 <b>Примечание:</b> Если файл большой (>50МБ), вы получите ссылку на скачивание`
      : `🚀 Morphing processing started! 

⏳ Video creation will take up to 5 minutes
📱 Finished video will be sent to you automatically

💡 <b>Note:</b> If file is large (>50MB), you'll receive a download link`

    await ctx.editMessageText(completionMessage, {
      parse_mode: 'HTML',
    })

    // Очищаем сессию и выходим из сцены
    if (ctx.session) {
      ctx.session.morphingImages = []
      ctx.session.morphingProgressMessageId = undefined
    }

    // Временные файлы изображений будут очищены автоматически в localMorphingProcessor

    await ctx.scene.leave()
  } catch (error) {
    logger.error('Error in morphing generation', {
      error: error instanceof Error ? error.message : 'Unknown error',
      telegramId: ctx.from?.id,
    })

    const isRu = isRussianFromState(ctx)

    // Более информативное сообщение об ошибке
    const errorMessage = isRu
      ? `❌ Произошла ошибка при создании морфинг видео:

${error instanceof Error ? error.message : 'Неизвестная ошибка'}

Пожалуйста, попробуйте еще раз или свяжитесь с поддержкой.`
      : `❌ An error occurred while creating morphing video:

${error instanceof Error ? error.message : 'Unknown error'}

Please try again or contact support.`

    await ctx.reply(errorMessage)

    await ctx.scene.leave()
  }
}

// Кнопка "Начать заново"
morphingWizard.action('morphing_restart', async ctx => {
  try {
    console.log('🔄 [MORPHING_RESTART] Action triggered!')
    logger.info('🔄 [MORPHING_RESTART] Action triggered', {
      telegramId: ctx.from?.id,
      sessionExists: !!ctx.session,
      isRestarting: ctx.session?.morphingRestarting,
    })

    await ctx.answerCbQuery()

    // ✅ ЗАЩИТА ОТ СПАМА: Проверяем что не выполняется уже перезапуск
    if (ctx.session?.morphingRestarting) {
      logger.info('🔄 [MORPHING_RESTART] Already restarting, skipping', {
        telegramId: ctx.from?.id,
      })
      return
    }

    if (ctx.session) {
      ctx.session.morphingRestarting = true
      // ✅ ИСПРАВЛЕНИЕ: Очищаем сессию перед перезапуском
      ctx.session.morphingImages = []
      ctx.session.morphingProgressMessageId = undefined
    }

    // ✅ ИСПРАВЛЕНИЕ: Перезапускаем сцену БЕЗ дополнительного сообщения
    // (приветственное сообщение появится автоматически при reenter)
    console.log('🔄 [MORPHING_RESTART] Reentering scene...')
    await ctx.scene.reenter()
    console.log('🔄 [MORPHING_RESTART] Scene reentered successfully!')

    // ✅ КРИТИЧЕСКИЙ БАГФИКС: Сбрасываем флаг после успешного перезапуска
    if (ctx.session) {
      ctx.session.morphingRestarting = false
    }
    console.log('🔄 [MORPHING_RESTART] Restart completed!')
  } catch (error) {
    console.log('❌ [MORPHING_RESTART] Error occurred:', error)
    logger.error('Error restarting morphing wizard', {
      error: error instanceof Error ? error.message : 'Unknown error',
      telegramId: ctx.from?.id,
    })
    // Сбрасываем флаг перезапуска при ошибке
    if (ctx.session) {
      ctx.session.morphingRestarting = false
    }
    console.log('❌ [MORPHING_RESTART] Reset restart flag due to error')
  }
})

// Кнопка "Отмена"
morphingWizard.action('morphing_cancel', async ctx => {
  try {
    console.log('❌ [MORPHING_CANCEL] Action triggered!')
    await ctx.answerCbQuery()
    const isRu = isRussianFromState(ctx)

    await ctx.reply(
      isRu
        ? '❌ Создание морфинга отменено. Возвращаюсь в главное меню.'
        : '❌ Morphing creation cancelled. Returning to main menu.'
    )

    console.log('❌ [MORPHING_CANCEL] Leaving scene...')
    await ctx.scene.leave()
    console.log('❌ [MORPHING_CANCEL] Scene left, entering MainMenu...')

    // Принудительно возвращаемся в главное меню
    await ctx.scene.enter(ModeEnum.MainMenu)
  } catch (error) {
    logger.error('Error cancelling morphing wizard', {
      error: error instanceof Error ? error.message : 'Unknown error',
      telegramId: ctx.from?.id,
    })
  }
})

// ✅ КНОПКА "ПРОДОЛЖИТЬ НЕЗАВЕРШЕННОЕ"
morphingWizard.action('morphing_resume', async ctx => {
  try {
    console.log('⚡ [MORPHING_RESUME] Action triggered!')
    await ctx.answerCbQuery()
    const isRu = isRussianFromState(ctx)

    // Ищем checkpoint в temp директории пользователя
    const telegram_id = ctx.from!.id.toString()
    const tempDir = path.join(process.cwd(), 'temp', `morphing_${telegram_id}`)

    const { resumeMorphingFromCheckpoint } = await import(
      '@/services/localMorphingProcessor'
    )

    const resumeResult = await resumeMorphingFromCheckpoint(
      tempDir,
      telegram_id,
      // Callback для отправки промежуточных видео
      async (videoPath: string, clipNumber: number, totalClips: number) => {
        const bot = ctx.tg
        const caption = isRu
          ? `🧬 Промежуточное видео ${clipNumber}/${totalClips}\n\n🎬 Переход между изображениями ${clipNumber} → ${
              clipNumber + 1
            }\n\n⏳ Создание остальных видео продолжается...`
          : `🧬 Intermediate video ${clipNumber}/${totalClips}\n\n🎬 Transition between images ${clipNumber} → ${
              clipNumber + 1
            }\n\n⏳ Creating remaining videos...`

        await bot.sendVideo(ctx.chat!.id, { source: videoPath }, { caption })
      }
    )

    if (resumeResult) {
      await ctx.reply(
        isRu
          ? '✅ Морфинг успешно возобновлен и завершен!'
          : '✅ Morphing successfully resumed and completed!'
      )
    } else {
      await ctx.reply(
        isRu
          ? '⚠️ Не найдено незавершенных процессов морфинга для возобновления.'
          : '⚠️ No incomplete morphing processes found to resume.'
      )
    }
  } catch (error) {
    console.log('❌ [MORPHING_RESUME] Error occurred:', error)
    logger.error('Error resuming morphing', {
      error: error instanceof Error ? error.message : 'Unknown error',
      telegramId: ctx.from?.id,
    })

    const isRu = isRussianFromState(ctx)
    await ctx.reply(
      isRu
        ? '❌ Ошибка при попытке возобновить морфинг. Попробуйте начать заново.'
        : '❌ Error trying to resume morphing. Please try starting over.'
    )
  }
})

export default morphingWizard
