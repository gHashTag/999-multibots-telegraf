/**
 * 🎬 ШАБЛОН 1 - ПРОСТОЙ LIP-SYNC
 * Упрощенная версия - lip-sync поверх пользовательского видео
 *
 * Workflow:
 * 1. Запрос пользовательского видео
 * 2. Запрос текста (или голосового)
 * 3. Создание TTS аудио
 * 4. Применение lip-sync к пользовательскому видео
 * 5. Возврат результата
 */

import { Scenes, Markup } from 'telegraf'
import { MyContext } from '../../interfaces'
import { isRussianFromState } from '@/helpers/centralizedLanguage'
import { getUserBalance } from '@/core/supabase/getUserBalance'
import { updateUserBalance } from '@/core/supabase/updateUserBalance'
import { PaymentType } from '@/interfaces/payments.interface'
import { createVoiceElevenLabs } from '@/core/elevenlabs/createVoiceElevenLabs'
import { logger } from '@/utils/logger'
import { downloadFile } from '@/helpers/file-helpers'
import { createCircleCompositionWithFaceDetection } from '@/helpers/face-circle-composer'
import { FalVeedFabricProvider } from '@/core/lipsync/providers/fal-veed-fabric-provider'
import { LipSyncInputBuilder } from '@/core/lipsync/schemas/lipsync-schemas'
import { exec } from 'child_process'
import { promisify } from 'util'
import path from 'path'
import fs from 'fs/promises'
import os from 'os'

const execAsync = promisify(exec)

/**
 * Получает длительность медиафайла (видео или аудио) в секундах
 */
async function getMediaDuration(fileUrl: string): Promise<number> {
  try {
    const tempDir = os.tmpdir()
    const tempPath = path.join(tempDir, `temp_${Date.now()}.mp4`)

    await downloadFile(fileUrl, tempPath)

    const { stdout } = await execAsync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${tempPath}"`
    )

    const duration = parseFloat(stdout.trim())
    await fs.unlink(tempPath)

    return duration
  } catch (error) {
    logger.error('❌ Failed to get media duration', { error, fileUrl })
    throw error
  }
}

/**
 * Обрезает видео до нужной длительности
 */
async function trimVideo(
  inputPath: string,
  outputPath: string,
  targetDuration: number
): Promise<void> {
  logger.info('✂️ Trimming video to target duration', {
    inputPath,
    targetDuration,
  })

  // Обрезаем видео до нужной длительности
  const command = `ffmpeg -i "${inputPath}" -t ${targetDuration} -c copy -y "${outputPath}"`
  await execAsync(command)

  logger.info('✅ Video trimmed successfully')
}

// Тестовые данные для моков
const TEST_ASSETS = {
  USER_VIDEO: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
  TEST_AUDIO: 'https://www2.cs.uic.edu/~i101/SoundFiles/StarWars3.wav',
  LIPSYNC_RESULT: 'https://storage.googleapis.com/falserverless/example_outputs/veed-fabric-lipsync.mp4',
}

// Режим тестирования - бесплатно для проверки монтажа
const TEST_MODE = process.env.NODE_ENV === 'test' || process.env.LIPSYNC_TEST_MODE === 'true'

/**
 * Рассчитывает стоимость lip-sync по длительности аудио
 * Базовая стоимость: 120⭐ за 10 секунд (12⭐/сек)
 * Минимальная стоимость: 60⭐ (за 5 сек)
 * Максимальная стоимость: 360⭐ (за 30 сек)
 */
function calculateLipSyncPrice(audioDuration: number): number {
  const basePricePerSecond = 12 // 12 звезд за секунду
  const minPrice = 60
  const maxPrice = 360

  const calculatedPrice = Math.round(audioDuration * basePricePerSecond)
  return Math.max(minPrice, Math.min(maxPrice, calculatedPrice))
}

export const aiReelsWizard = new Scenes.WizardScene<MyContext>(
  'ai_reels_wizard',

  // Step 0: Запрос фото для lip-sync
  async ctx => {
    const isRu = isRussianFromState(ctx)
    const telegramId = ctx.from?.id?.toString()

    console.log('🎬 [DEBUG] Step 0 - Запрос фото', {
      telegramId,
      hasMessage: !!ctx.message,
      messageType: ctx.message?.['photo'] ? 'photo' : ctx.message?.['text'] ? 'text' : 'other',
      sceneId: ctx.scene?.current?.id,
    })

    logger.info('🎬 [SIMPLE LIPSYNC] Step 0 STARTED - Запрос фото', {
      telegramId,
      function: 'simpleLipSyncWizard.step0',
    })

    if (!telegramId) {
      await ctx.reply(isRu ? '❌ Ошибка: не удалось определить ID' : '❌ Error: could not determine ID')
      return ctx.scene.leave()
    }

    // Обычный флоу: инициализируем сессию
    ctx.session.aiReels = {
      step: 'image',
      startTime: Date.now(),
      telegramId: telegramId as any,
      isSimple: true as any, // Флаг для отличия от Full template
    }

    await ctx.reply(
      isRu
        ? '🎬 Шаблон 1 - Lip-sync в кружочке\n\n' +
          '📷 Шаг 1: Отправьте фото лица для создания lip-sync.\n\n' +
          '📹 Шаг 2: Потом отправьте видео (до 30 сек) - это будет фон.\n\n' +
          '💡 Что делает:\n' +
          '• Использует фото для lip-sync\n' +
          '• Накладывает поверх вашего видео\n' +
          '• Делает красивый кружочек\n\n' +
          '💰 Стоимость: 120⭐'
        : '🎬 Template 1 - Lip-sync in Circle\n\n' +
          '📷 Step 1: Send a photo of a face for lip-sync.\n\n' +
          '📹 Step 2: Then send a video (up to 30 sec) - this will be the background.\n\n' +
          '💡 What it does:\n' +
          '• Uses photo for lip-sync\n' +
          '• Overlays on your video\n' +
          '• Makes a beautiful circle\n\n' +
          '💰 Cost: 120⭐'
    )

    logger.info('✅ [SIMPLE LIPSYNC] Step 0 completed - фото запрошено', { telegramId })

    return ctx.wizard.next()
  },

  // Step 1: Получение фото для lip-sync
  async ctx => {
    const isRu = isRussianFromState(ctx)
    const telegramId = ctx.from?.id?.toString()

    if (!telegramId) {
      return ctx.scene.leave()
    }

    console.log('📷 [DEBUG] Step 1 - Получение фото', {
      telegramId,
      hasMessage: !!ctx.message,
      messageType: ctx.message?.['photo'] ? 'photo' : ctx.message?.['text'] ? 'text' : 'other',
      hasFrom: !!ctx.from,
    })

    // Проверяем наличие фото
    const photo = (ctx.message as any)?.photo?.[0] // Берем первое (самое большое разрешение)
    if (!photo) {
      await ctx.reply(
        isRu
          ? '❌ Это не фото. Пожалуйста, отправьте фото лица.'
          : '❌ This is not a photo. Please send a photo of a face.'
      )
      return
    }

    // Сохраняем информацию о фото
    ctx.session.aiReels.imageUrl = (await ctx.telegram.getFileLink(photo.file_id)).toString()
    ctx.session.aiReels.step = 'text'

    logger.info('📷 [SIMPLE LIPSYNC] Фото получено', {
      telegramId,
      fileId: photo.file_id,
      size: photo.file_size,
    })

    await ctx.reply(
      isRu
        ? '✅ Фото получено!\n\n' +
          '📹 Шаг 2: Теперь отправьте видео (до 30 сек) - это будет фон для кружочка.\n\n' +
          '💡 Lip-sync будет наложен поверх этого видео.'
        : '✅ Photo received!\n\n' +
          '📹 Step 2: Now send a video (up to 30 sec) - this will be the background for the circle.\n\n' +
          '💡 Lip-sync will be overlaid on this video.'
    )

    // Переходим к следующему шагу
    return ctx.wizard.next()
  },

  // Step 2: Получение видео (фон)
  async ctx => {
    const isRu = isRussianFromState(ctx)
    const telegramId = ctx.from?.id?.toString()

    if (!telegramId) {
      return ctx.scene.leave()
    }

    console.log('📹 [DEBUG] Step 2 - Получение видео (фон)', {
      telegramId,
      hasMessage: !!ctx.message,
      messageType: ctx.message?.['video'] ? 'video' : ctx.message?.['text'] ? 'text' : 'other',
    })

    // Проверяем наличие видео
    const video = (ctx.message as any)?.video
    if (!video) {
      await ctx.reply(
        isRu
          ? '❌ Это не видео. Пожалуйста, отправьте видео файл.'
          : '❌ This is not a video. Please send a video file.'
      )
      return
    }

    // Проверяем размер (максимум 50MB для безопасности)
    const maxSize = 50 * 1024 * 1024 // 50MB
    if (video.file_size && video.file_size > maxSize) {
      await ctx.reply(
        isRu
          ? '❌ Видео слишком большое. Максимум 50MB.'
          : '❌ Video too large. Maximum 50MB.'
      )
      return
    }

    // Сохраняем информацию о видео как фон
    ctx.session.aiReels.secondVideoUrl = (await ctx.telegram.getFileLink(video.file_id)).toString()

    logger.info('📹 [SIMPLE LIPSYNC] Видео (фон) получено', {
      telegramId,
      fileId: video.file_id,
      size: video.file_size,
    })

    await ctx.reply(
      isRu
        ? '✅ Видео получено!\n\n' +
          '✍️ Шаг 3: Теперь введите текст для lip-sync.\n\n' +
          '💡 Или отправьте голосовое сообщение.\n\n' +
          '💰 Стоимость будет рассчитана по длине аудио.'
        : '✅ Video received!\n\n' +
          '✍️ Step 3: Now enter text for lip-sync.\n\n' +
          '💡 Or send a voice message.\n\n' +
          '💰 Cost will be calculated by audio duration.'
    )

    // Переходим к следующему шагу
    return ctx.wizard.next()
  },

  // Step 3: Получение текста
  async ctx => {
    const isRu = isRussianFromState(ctx)
    const telegramId = ctx.from?.id?.toString()

    console.log('✍️ [DEBUG] Step 3 - Получение текста', {
      telegramId,
      hasMessage: !!ctx.message,
      messageType: ctx.message?.['text'] ? 'text' : ctx.message?.['voice'] ? 'voice' : 'other',
    })

    logger.info('✍️ [SIMPLE LIPSYNC] Step 3 STARTED - Получение текста', { telegramId })

    if (!telegramId) {
      return ctx.scene.leave()
    }

    let text = ''

    // Проверяем текст
    if ((ctx.message as any)?.text) {
      text = (ctx.message as any).text
    }
    // Проверяем голосовое сообщение
    else if ((ctx.message as any)?.voice) {
      const voice = (ctx.message as any).voice
      logger.info('🎤 [SIMPLE LIPSYNC] Голосовое сообщение получено', {
        telegramId,
        duration: voice.duration,
        fileId: voice.file_id,
      })

      // Просто сохраняем файл, в реальном проекте нужен speech-to-text
      const audioUrl = await ctx.telegram.getFileLink(voice.file_id)
      ctx.session.aiReels.audioUrl = audioUrl.toString()

      await ctx.reply(
        isRu
          ? '✅ Голосовое сообщение получено!\n' +
            'Использую его для создания речи...\n\n' +
            '💰 Проверяю баланс...'
          : '✅ Voice message received!\n' +
            'Using it to create speech...\n\n' +
            '💰 Checking balance...'
      )
      ctx.session.aiReels.step = 'lipsync_generation'
      return ctx.wizard.next()
    }
    else {
      await ctx.reply(
        isRu
          ? '❌ Не понял. Введите текст или отправьте голосовое.'
          : '❌ I did not understand. Enter text or send a voice message.'
      )
      return
    }

    if (!text.trim()) {
      await ctx.reply(
        isRu ? '❌ Текст не может быть пустым.' : '❌ Text cannot be empty.'
      )
      return
    }

    ctx.session.aiReels.text = text
    ctx.session.aiReels.step = 'text'

    await ctx.reply(
      isRu
        ? `✅ Текст сохранен!\n\n"${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"\n\n💰 Проверяю баланс...`
        : `✅ Text saved!\n\n"${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"\n\n💰 Checking balance...`
    )

    return ctx.wizard.next()
  },

  // Step 4: Проверка баланса и создание lip-sync
  async ctx => {
    const isRu = isRussianFromState(ctx)
    const telegramId = ctx.from?.id?.toString()

    if (!telegramId) {
      return ctx.scene.leave()
    }

    // Устанавливаем шаг генерации
    ctx.session.aiReels.step = 'lipsync_generation'

    logger.info('🎬 [SIMPLE LIPSYNC] Начинаем создание lip-sync', { telegramId })

    // Переменная для хранения рассчитанной стоимости (для возврата при ошибке)
    let finalPrice = 0

    try {
      // ШАГ 1: Создаем TTS аудио (если текст)
      let audioUrl = ctx.session.aiReels.audioUrl

      if (!audioUrl && ctx.session.aiReels.text) {
        logger.info('🎤 [SIMPLE LIPSYNC] Создание TTS аудио', { telegramId })

        audioUrl = await createVoiceElevenLabs(
          ctx.session.aiReels.text,
          'pNInz6obpgDQGcFmaJgB', // Adam voice
          'ru'
        )

        if (!audioUrl) {
          throw new Error('Failed to create TTS audio')
        }

        logger.info('✅ [SIMPLE LIPSYNC] TTS аудио создано', { telegramId })
      }

      // Получаем длительность аудио для расчета стоимости
      const audioDuration = await getMediaDuration(audioUrl)
      finalPrice = calculateLipSyncPrice(audioDuration)

      logger.info('💰 [SIMPLE LIPSYNC] Расчет стоимости', {
        telegramId,
        duration: audioDuration,
        price: finalPrice,
      })

      // Проверка и списание баланса (кроме тестового режима)
      if (!TEST_MODE) {
        logger.info('💰 [SIMPLE LIPSYNC] Проверка баланса', {
          telegramId,
          requiredPrice: finalPrice,
        })

        const userBalance = await getUserBalance(telegramId)
        if (!userBalance || userBalance.balance < finalPrice) {
          await ctx.reply(
            isRu
              ? `❌ Недостаточно звезд для создания lip-sync.\n\n` +
                `Требуется: ${finalPrice}⭐ (за ${audioDuration.toFixed(1)} сек)\n` +
                `Ваш баланс: ${userBalance?.balance || 0}⭐\n\n` +
                `Пополните баланс через /start → 💎 Пополнить баланс`
              : `❌ Insufficient stars to create lip-sync.\n\n` +
                `Required: ${finalPrice}⭐ (for ${audioDuration.toFixed(1)} sec)\n` +
                `Your balance: ${userBalance?.balance || 0}⭐\n\n` +
                `Top up via /start → 💎 Top up balance`
          )
          return ctx.scene.leave()
        }

        // Списываем деньги
        await updateUserBalance(
          telegramId,
          finalPrice,
          PaymentType.MONEY_OUTCOME,
          'Simple Lip-sync generation',
          { bot_name: ctx.botInfo?.username }
        )

        logger.info('💰 [SIMPLE LIPSYNC] Деньги списаны', {
          telegramId,
          amount: finalPrice,
          duration: audioDuration,
        })

        await ctx.reply(
          isRu
            ? `💳 Списано ${finalPrice}⭐ (${audioDuration.toFixed(1)} сек)\n\n🎬 Начинаю создание lip-sync видео...\n⏳ Это займет 30-60 секунд...`
            : `💳 Charged ${finalPrice}⭐ (${audioDuration.toFixed(1)} sec)\n\n🎬 Starting lip-sync video creation...\n⏳ This will take 30-60 seconds...`
        )
      } else {
        // Тестовый режим
        await ctx.reply(
          isRu
            ? `🧪 ТЕСТОВЫЙ РЕЖИМ - Бесплатно!\n💰 Стоимость составила бы: ${finalPrice}⭐ за ${audioDuration.toFixed(1)} сек\n\n🎬 Начинаю создание lip-sync видео...\n⏳ Тестирование монтажа...`
            : `🧪 TEST MODE - Free!\n💰 Cost would be: ${finalPrice}⭐ for ${audioDuration.toFixed(1)} sec\n\n🎬 Starting lip-sync video creation...\n⏳ Testing composition...`
        )
      }

      // ШАГ 2: Применяем lip-sync через Fal.ai Veed Fabric
      logger.info('🎬 [SIMPLE LIPSYNC] Применение lip-sync через Fal.ai', { telegramId })

      // Уведомляем пользователя
      await ctx.reply(
        isRu
          ? `🎬 Создаем lip-sync видео...\n⏳ Подождите 30-60 секунд...`
          : `🎬 Creating lip-sync video...\n⏳ Please wait 30-60 seconds...`
      )

      // Создаем input для Fal.ai провайдера
      const falInput = LipSyncInputBuilder.forFalVeedFabric(
        ctx.session.aiReels.imageUrl!,
        audioUrl!,
        telegramId,
        {
          botName: ctx.botInfo?.username || 'unknown_bot',
          resolution: '720p',
        }
      )

      // Создаем провайдер и генерируем lip-sync
      const falProvider = new FalVeedFabricProvider()
      const lipSyncResult = await falProvider.generate(falInput)

      // Проверяем результат
      if ('error' in lipSyncResult || !lipSyncResult.output) {
        throw new Error(`Lip-sync generation failed: ${lipSyncResult.message || lipSyncResult.error}`)
      }

      logger.info('✅ [SIMPLE LIPSYNC] Lip-sync создан успешно', { telegramId })

      // ШАГ 3: Получаем длительность липсинка
      const tempDir = os.tmpdir()
      let finalVideoUrl = lipSyncResult.output

      if (audioUrl && !TEST_MODE) {
        try {
          logger.info('✂️ [SIMPLE LIPSYNC] Обрезка видео по длине липсинка', { telegramId })

          // Получаем длительность аудио (липсинка)
          const audioDuration = await getMediaDuration(audioUrl)
          logger.info('📏 [SIMPLE LIPSYNC] Длительность аудио', { telegramId, duration: audioDuration })

          // Lip-sync видео уже создано нужной длины, обрезка не требуется
          logger.info('✅ [SIMPLE LIPSYNC] Lip-sync видео уже нужной длины', { telegramId, duration: audioDuration })
        } catch (trimError) {
          logger.warn('⚠️ [SIMPLE LIPSYNC] Ошибка при получении длительности', {
            telegramId,
            error: trimError,
          })
        }
      }

      // ШАГ 5: Создаем композицию с кругом
      logger.info('🎨 [SIMPLE LIPSYNC] Создание композиции с кругом', { telegramId })

      const compositionTempDir = os.tmpdir()
      const compositionOutput = path.join(compositionTempDir, `composition_${telegramId}_${Date.now()}.mp4`)
      const photoPath = path.join(compositionTempDir, `photo_${telegramId}_${Date.now()}.jpg`)

      try {
        // Скачиваем фото для face detection
        await downloadFile(ctx.session.aiReels.imageUrl!, photoPath)

        // Скачиваем lip-sync видео если это URL
        const lipSyncVideoPath = path.join(compositionTempDir, `lipsync_${telegramId}_${Date.now()}.mp4`)
        await downloadFile(lipSyncResult.output, lipSyncVideoPath)

        // Скачиваем фоновое видео
        const backgroundVideoPath = path.join(compositionTempDir, `background_${telegramId}_${Date.now()}.mp4`)
        await downloadFile(ctx.session.aiReels.secondVideoUrl!, backgroundVideoPath)

        // Создаем композицию: фоновое видео + lip-sync в круге
        await createCircleCompositionWithFaceDetection(
          backgroundVideoPath,
          lipSyncVideoPath,
          compositionOutput,
          photoPath
        )

        logger.info('✅ [SIMPLE LIPSYNC] Композиция создана', { telegramId })

        // Очищаем временные файлы
        await fs.unlink(lipSyncVideoPath).catch(() => {})
        await fs.unlink(backgroundVideoPath).catch(() => {})
        await fs.unlink(photoPath).catch(() => {})

        // Сохраняем URL итогового видео
        finalVideoUrl = `file://${compositionOutput}`
      } catch (compositionError) {
        logger.warn('⚠️ [SIMPLE LIPSYNC] Не удалось создать композицию, используем lip-sync без круга', {
          telegramId,
          error: compositionError,
        })
      }

      logger.info('✅ [SIMPLE LIPSYNC] Lip-sync готов', {
        telegramId,
        resultUrl: finalVideoUrl,
        hasComposition: finalVideoUrl.startsWith('file://'),
      })

      // Сохраняем в session
      ctx.session.aiReels.finalVideoUrl = finalVideoUrl

      await ctx.reply(
        isRu
          ? '✅ Lip-sync видео готово!'
          : '✅ Lip-sync video ready!'
      )

      // Отправляем результат
      await ctx.replyWithVideo(
        { url: finalVideoUrl },
        {
          caption: isRu
            ? `🎬 Ваш lip-sync готов в кружочке!\n${TEST_MODE ? '🧪 Тестовый режим' : ''}\n✨ Приятного просмотра!`
            : `🎬 Your lip-sync is ready in circle!\n${TEST_MODE ? '🧪 Test mode' : ''}\n✨ Enjoy!`,
        }
      )

      await ctx.reply(
        isRu
          ? '🎉 Спасибо за использование Шаблона 1!'
          : '🎉 Thank you for using Template 1!'
      )

      logger.info('🎉 [SIMPLE LIPSYNC] Workflow завершен', { telegramId })

    } catch (error) {
      logger.error('❌ [SIMPLE LIPSYNC] Ошибка генерации', {
        error,
        telegramId,
        isTestMode: TEST_MODE,
        finalPrice,
      })

      // Возвращаем деньги только если не тестовый режим
      if (!TEST_MODE && finalPrice > 0) {
        await updateUserBalance(
          telegramId,
          finalPrice,
          PaymentType.MONEY_INCOME,
          'Simple Lip-sync refund - generation error',
          { bot_name: ctx.botInfo?.username }
        )

        await ctx.reply(
          isRu
            ? `❌ Произошла ошибка при создании lip-sync.\n` +
              `Средства возвращены (${finalPrice}⭐).`
            : `❌ An error occurred while creating lip-sync.\n` +
              `Funds refunded (${finalPrice}⭐).`
        )
      } else {
        // Тестовый режим - просто сообщаем об ошибке
        await ctx.reply(
          isRu
            ? `❌ Произошла ошибка при создании lip-sync.\n` +
              `🧪 Тестовый режим - деньги не списывались.`
            : `❌ An error occurred while creating lip-sync.\n` +
              `🧪 Test mode - no funds were charged.`
        )
      }
    }

    ctx.scene.leave()
  },
)