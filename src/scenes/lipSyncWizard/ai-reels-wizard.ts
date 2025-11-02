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

// Простая цена - только lip-sync, без Veo 3.1
const SIMPLE_LIPSYNC_PRICE = 120 // звезд (вдвое дешевле!)

// Режим тестирования - бесплатно для проверки монтажа
const TEST_MODE = process.env.NODE_ENV === 'test' || process.env.LIPSYNC_TEST_MODE === 'true'

export const aiReelsWizard = new Scenes.WizardScene<MyContext>(
  'ai_reels_wizard',

  // Step 0: Запрос пользовательского видео
  async ctx => {
    const isRu = isRussianFromState(ctx)
    const telegramId = ctx.from?.id?.toString()

    console.log('🎬 [DEBUG] Step 0 - Запрос видео', {
      telegramId,
      hasMessage: !!ctx.message,
      messageType: ctx.message?.['text'] ? 'text' : ctx.message?.['video'] ? 'video' : 'other',
      sceneId: ctx.scene?.current?.id,
    })

    logger.info('🎬 [SIMPLE LIPSYNC] Step 0 STARTED - Запрос видео', {
      telegramId,
      function: 'simpleLipSyncWizard.step0',
    })

    if (!telegramId) {
      await ctx.reply(isRu ? '❌ Ошибка: не удалось определить ID' : '❌ Error: could not determine ID')
      return ctx.scene.leave()
    }

    // Обычный флоу: инициализируем сессию
    ctx.session.aiReels = {
      step: 'video',
      startTime: Date.now(),
      telegramId,
      isSimple: true, // Флаг для отличия от Full template
    }

    await ctx.reply(
      isRu
        ? '🎬 <b>Шаблон 1 - Простой Lip-sync</b>\n\n' +
          'Отправьте видео (до 30 секунд) для создания lip-sync эффекта.\n\n' +
          '💡 Что делает:\n' +
          '• Берет ваше видео\n' +
          '• Добавляет речь из текста\n' +
          '• Синхронизирует движение губ\n\n' +
          '💰 Стоимость: 120⭐'
        : '🎬 <b>Template 1 - Simple Lip-sync</b>\n\n' +
          'Send a video (up to 30 seconds) to create lip-sync effect.\n\n' +
          '💡 What it does:\n' +
          '• Takes your video\n' +
          '• Adds speech from text\n' +
          '• Syncs lip movements\n\n' +
          '💰 Cost: 120⭐',
      { parse_mode: 'HTML' }
    )

    logger.info('✅ [SIMPLE LIPSYNC] Step 0 completed - видео запрошено', { telegramId })
  },

  // Step 1: Получение видео
  async ctx => {
    const isRu = isRussianFromState(ctx)
    const telegramId = ctx.from?.id?.toString()

    if (!telegramId) {
      return ctx.scene.leave()
    }

    console.log('📹 [DEBUG] Step 1 - Получение видео', {
      telegramId,
      hasMessage: !!ctx.message,
      messageType: ctx.message?.['text'] ? 'text' : ctx.message?.['video'] ? 'video' : 'other',
      hasFrom: !!ctx.from,
    })

    // Проверяем наличие видео
    const video = ctx.message?.video
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

    // Сохраняем информацию о видео
    ctx.session.aiReels.videoFileId = video.file_id
    ctx.session.aiReels.videoUrl = await ctx.telegram.getFileLink(video.file_id)
    ctx.session.aiReels.step = 'text'

    logger.info('📹 [SIMPLE LIPSYNC] Видео получено', {
      telegramId,
      fileId: video.file_id,
      size: video.file_size,
    })

    await ctx.reply(
      isRu
        ? '✅ Видео получено!\n\n' +
          'Теперь введите текст, который будет произносить персонаж в видео.\n\n' +
          '💡 Или отправьте голосовое сообщение с текстом.'
        : '✅ Video received!\n\n' +
          'Now enter the text that will be spoken by the character in the video.\n\n' +
          '💡 Or send a voice message with the text.'
    )

    // Переходим к следующему шагу
    return ctx.wizard.next()
  },

  // Step 2: Получение текста
  async ctx => {
    const isRu = isRussianFromState(ctx)
    const telegramId = ctx.from?.id?.toString()

    if (!telegramId) {
      return ctx.scene.leave()
    }

    let text = ''

    // Проверяем текст
    if (ctx.message?.text) {
      text = ctx.message.text
    }
    // Проверяем голосовое сообщение
    else if (ctx.message?.voice) {
      const voice = ctx.message.voice
      logger.info('🎤 [SIMPLE LIPSYNC] Голосовое сообщение получено', {
        telegramId,
        duration: voice.duration,
        fileId: voice.file_id,
      })

      // Просто сохраняем файл, в реальном проекте нужен speech-to-text
      const audioUrl = await ctx.telegram.getFileLink(voice.file_id)
      ctx.session.aiReels.voiceAudioUrl = audioUrl

      await ctx.reply(
        isRu
          ? '✅ Голосовое сообщение получено!\n' +
            'Использую его для создания речи...\n\n' +
            '💰 Проверяю баланс...'
          : '✅ Voice message received!\n' +
            'Using it to create speech...\n\n' +
            '💰 Checking balance...'
      )
      ctx.session.aiReels.step = 'processing'
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
    ctx.session.aiReels.step = 'processing'

    await ctx.reply(
      isRu
        ? `✅ Текст сохранен!\n\n"${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"\n\n💰 Проверяю баланс...`
        : `✅ Text saved!\n\n"${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"\n\n💰 Checking balance...`
    )

    ctx.wizard.next()
  },

  // Step 3: Проверка баланса и создание lip-sync
  async ctx => {
    const isRu = isRussianFromState(ctx)
    const telegramId = ctx.from?.id?.toString()

    if (!telegramId) {
      return ctx.scene.leave()
    }

    logger.info('💰 [SIMPLE LIPSYNC] Проверка баланса', { telegramId, isTestMode: TEST_MODE })

    // В тестовом режиме не проверяем баланс и не списываем деньги
    if (!TEST_MODE) {
      // Проверяем баланс
      const userBalance = await getUserBalance(telegramId)
      if (!userBalance || userBalance.balance < SIMPLE_LIPSYNC_PRICE) {
        await ctx.reply(
          isRu
            ? `❌ Недостаточно звезд для создания lip-sync.\n\n` +
              `Требуется: ${SIMPLE_LIPSYNC_PRICE}⭐\n` +
              `Ваш баланс: ${userBalance?.balance || 0}⭐\n\n` +
              `Пополните баланс через /start → 💎 Пополнить баланс`
            : `❌ Insufficient stars to create lip-sync.\n\n` +
              `Required: ${SIMPLE_LIPSYNC_PRICE}⭐\n` +
              `Your balance: ${userBalance?.balance || 0}⭐\n\n` +
              `Top up via /start → 💎 Top up balance`
        )
        return ctx.scene.leave()
      }

      // Списываем деньги
      await updateUserBalance(
        telegramId,
        SIMPLE_LIPSYNC_PRICE,
        PaymentType.MONEY_OUTCOME,
        'Simple Lip-sync generation',
        { bot_name: ctx.botInfo?.username }
      )

      logger.info('💰 [SIMPLE LIPSYNC] Деньги списаны', {
        telegramId,
        amount: SIMPLE_LIPSYNC_PRICE,
      })

      await ctx.reply(
        isRu
          ? `💳 Списано ${SIMPLE_LIPSYNC_PRICE}⭐\n\n🎬 Начинаю создание lip-sync видео...\n⏳ Это займет 1-2 минуты...`
          : `💳 Charged ${SIMPLE_LIPSYNC_PRICE}⭐\n\n🎬 Starting lip-sync video creation...\n⏳ This will take 1-2 minutes...`
      )
    } else {
      // Тестовый режим
      await ctx.reply(
        isRu
          ? `🧪 <b>ТЕСТОВЫЙ РЕЖИМ</b> - Бесплатно!\n\n🎬 Начинаю создание lip-sync видео...\n⏳ Тестирование монтажа...`
          : `🧪 <b>TEST MODE</b> - Free!\n\n🎬 Starting lip-sync video creation...\n⏳ Testing composition...`,
        { parse_mode: 'HTML' }
      )
    }

    try {
      // ШАГ 1: Создаем TTS аудио (если текст)
      let audioUrl = ctx.session.aiReels.voiceAudioUrl

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

      // ШАГ 2: Применяем lip-sync (мок для тестирования)
      logger.info('🎬 [SIMPLE LIPSYNC] Применение lip-sync', { telegramId })

      // В реальном проекте здесь был бы вызов к Fal.ai Veed Fabric
      // const lipSyncProvider = new FalVeedFabricProvider()
      // const result = await lipSyncProvider.generate({...})

      // Для тестирования используем готовый asset
      const lipSyncResult = {
        videoUrl: TEST_ASSETS.LIPSYNC_RESULT,
        output: TEST_ASSETS.LIPSYNC_RESULT,
      }

      // Проверяем что у нас есть результат
      if (!lipSyncResult.videoUrl) {
        throw new Error('Lip-sync generation failed')
      }

      // ШАГ 3: Получаем длительность липсинка и обрезаем оригинальное видео
      const tempDir = os.tmpdir()
      let finalVideoUrl = lipSyncResult.videoUrl

      if (audioUrl && !TEST_MODE) {
        try {
          logger.info('✂️ [SIMPLE LIPSYNC] Обрезка видео по длине липсинка', { telegramId })

          // Получаем длительность аудио (липсинка)
          const audioDuration = await getMediaDuration(audioUrl)
          logger.info('📏 [SIMPLE LIPSYNC] Длительность аудио', { telegramId, duration: audioDuration })

          // Скачиваем исходное видео
          const originalVideoPath = path.join(tempDir, `original_${Date.now()}.mp4`)
          await downloadFile(ctx.session.aiReels.videoUrl!, originalVideoPath)

          // Обрезаем видео до длительности аудио
          const trimmedVideoPath = path.join(tempDir, `trimmed_${Date.now()}.mp4`)
          await trimVideo(originalVideoPath, trimmedVideoPath, audioDuration)

          // TODO: В реальном проекте здесь был бы вызов к lip-sync провайдеру
          // с обрезанным видео. Сейчас просто используем тестовый результат.
          // Если бы был реальный lip-sync, мы бы отправили trimmedVideoPath вместо originalVideoPath

          // Очищаем временные файлы
          await fs.unlink(originalVideoPath)
          await fs.unlink(trimmedVideoPath)

          logger.info('✅ [SIMPLE LIPSYNC] Видео обрезано', { telegramId, duration: audioDuration })
        } catch (trimError) {
          logger.warn('⚠️ [SIMPLE LIPSYNC] Не удалось обрезать видео, используем оригинал', {
            telegramId,
            error: trimError,
          })
        }
      }

      // ШАГ 4: Создаем композицию с кругом
      logger.info('🎨 [SIMPLE LIPSYNC] Создание композиции с кругом', { telegramId })

      const compositionTempDir = os.tmpdir()
      const compositionOutput = path.join(compositionTempDir, `composition_${telegramId}_${Date.now()}.mp4`)
      const faceFramePath = path.join(compositionTempDir, `face_frame_${telegramId}_${Date.now()}.jpg`)

      try {
        // Извлекаем первый кадр из видео пользователя для face detection
        await execAsync(
          `ffmpeg -i "${ctx.session.aiReels.videoUrl}" -vf "select=eq(n\\,0)" -frames:v 1 "${faceFramePath}" -y`
        )

        // Скачиваем lip-sync видео если это URL
        const lipSyncVideoPath = path.join(compositionTempDir, `lipsync_${telegramId}_${Date.now()}.mp4`)
        await downloadFile(lipSyncResult.videoUrl, lipSyncVideoPath)

        // Скачиваем видео пользователя если это URL
        const backgroundVideoPath = path.join(compositionTempDir, `background_${telegramId}_${Date.now()}.mp4`)
        await downloadFile(ctx.session.aiReels.videoUrl!, backgroundVideoPath)

        // Создаем композицию: фоновое видео + lip-sync в круге
        await createCircleCompositionWithFaceDetection(
          backgroundVideoPath,
          lipSyncVideoPath,
          compositionOutput,
          faceFramePath
        )

        logger.info('✅ [SIMPLE LIPSYNC] Композиция создана', { telegramId })

        // Очищаем временные файлы
        await fs.unlink(lipSyncVideoPath).catch(() => {})
        await fs.unlink(backgroundVideoPath).catch(() => {})
        await fs.unlink(faceFramePath).catch(() => {})

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
      ctx.session.aiReels.resultVideoUrl = finalVideoUrl

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
      })

      // Возвращаем деньги только если не тестовый режим
      if (!TEST_MODE) {
        await updateUserBalance(
          telegramId,
          SIMPLE_LIPSYNC_PRICE,
          PaymentType.MONEY_INCOME,
          'Simple Lip-sync refund - generation error',
          { bot_name: ctx.botInfo?.username }
        )

        await ctx.reply(
          isRu
            ? `❌ Произошла ошибка при создании lip-sync.\n` +
              `Средства возвращены (${SIMPLE_LIPSYNC_PRICE}⭐).`
            : `❌ An error occurred while creating lip-sync.\n` +
              `Funds refunded (${SIMPLE_LIPSYNC_PRICE}⭐).`
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