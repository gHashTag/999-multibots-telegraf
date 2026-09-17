/**
 * 🎬 AI REELS RENDER WIZARD
 *
 * AI Reels генерация через render-server на Render Server с выбором аватара
 *
 * Процесс:
 * 1. Загрузка фото аватара
 * 2. Ввод текста или голосового сообщения
 * 3. ВЫБОР АВАТАРА: Hedra или HeyGen
 * 4. Отправка на render-server через Inngest
 * 5. Получение результата через webhook
 */

import { resolveAvatarPhoto } from '@/helpers/resolveAvatarPhoto'
import { Scenes, Markup } from 'telegraf'
import { MyContext } from '@/interfaces'
import { isRussianFromState } from '@/helpers/centralizedLanguage'
import { logger } from '@/utils/logger'
import { secretFingerprint } from '@/utils/secretFingerprint'
import { getUserBalance } from '@/core/supabase/getUserBalance'
import { updateUserBalance } from '@/core/supabase/updateUserBalance'
import { PaymentType } from '@/interfaces/payments.interface'
import {
  sendRenderAvatarVideoEvent,
  createRenderAvatarPayload,
} from '@/inngest_app/render-server-client'
import {
  HEYGEN_AVATAR_SETS,
  getVoiceIdForAvatar,
} from './heygen-avatars-config'
import { videoTaskStore } from '@/services/video-task-store'
import { refundAndTell } from '@/price/helpers/refundAndTell'
import { standardButtons } from '@/navigation/helpers/actionButtons'
import { showMainMenu } from '@/navigation/helpers/menuKeyboard'
import {
  isUserCausedTelegramError,
  telegramErrorInfo,
} from '@/helpers/telegramErrors'

logger.info('📦 [AI REELS RENDER WIZARD] Module loaded')

export const aiReelsRenderWizard = new Scenes.WizardScene<MyContext>(
  'ai_reels_render_wizard',

  // Step 0: ВЫБОР СЕРВИСА (Hedra/HeyGen) - ПЕРВЫЙ ШАГ
  async ctx => {
    const isRu = isRussianFromState(ctx)
    const telegramId = ctx.from?.id?.toString()

    logger.info('🎬 [AI REELS RENDER] Wizard started - Service selection', {
      telegramId,
    })

    if (!telegramId) {
      await ctx.reply(
        isRu
          ? '❌ Ошибка: не удалось определить ваш ID'
          : '❌ Error: could not determine your ID'
      )
      return ctx.scene.leave()
    }

    // ✅ УБРАЛИ ПРОВЕРКУ: render-server имеет очередь, поэтому отправляем запрос всегда
    // Сервер сам управляет очередью и обработает запрос когда станет доступным

    // Инициализируем сессию
    ctx.session.aiReelsRender = {
      step: 'avatar_service',
      startTime: Date.now(),
    }

    await ctx.reply(
      isRu
        ? '🎬 <b>AI Reels - Шаблон 2</b>\n\n' +
            '🎯 Выберите сервис для генерации аватара:\n\n' +
            '🎭 <b>Hedra</b>\n' +
            '• Загрузите свое фото\n' +
            '• Быстрая генерация (2-3 мин)\n' +
            '• Хорошее качество\n\n' +
            '🎬 <b>HeyGen</b>\n' +
            '• Готовые профессиональные аватары\n' +
            '• Премиум качество (4-5 мин)\n' +
            '• Выбор из коллекции\n\n' +
            '🎯 <b>Fal (Fabric)</b>\n' +
            '• Загрузите свое фото\n' +
            '• Высокое качество lip-sync\n' +
            '• Оптимальная скорость (3-4 мин)'
        : '🎬 <b>AI Reels - Template 2</b>\n\n' +
            '🎯 Choose avatar generation service:\n\n' +
            '🎭 <b>Hedra</b>\n' +
            '• Upload your photo\n' +
            '• Fast generation (2-3 min)\n' +
            '• Good quality\n\n' +
            '🎬 <b>HeyGen</b>\n' +
            '• Ready professional avatars\n' +
            '• Premium quality (4-5 min)\n' +
            '• Choose from collection\n\n' +
            '🎯 <b>Fal (Fabric)</b>\n' +
            '• Upload your photo\n' +
            '• High quality lip-sync\n' +
            '• Optimal speed (3-4 min)',
      {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
          [
            Markup.button.callback(
              isRu ? '🎭 Hedra' : '🎭 Hedra',
              'service_hedra'
            ),
          ],
          [
            Markup.button.callback(
              isRu ? '🎬 HeyGen' : '🎬 HeyGen',
              'service_heygen'
            ),
          ],
          [
            Markup.button.callback(
              isRu ? '🎯 Fal (Fabric)' : '🎯 Fal (Fabric)',
              'service_fal'
            ),
          ],
          [
            Markup.button.callback(
              isRu ? 'Отмена' : 'Cancel',
              'ai_reels_cancel'
            ),
          ],
        ]),
      }
    )

    return ctx.wizard.next()
  },

  // Step 1: РОУТИНГ по выбору сервиса (Hedra/HeyGen)
  async ctx => {
    const isRu = isRussianFromState(ctx)
    const telegramId = ctx.from?.id?.toString()

    logger.info('🎬 [AI REELS RENDER] Step 1 - Service routing', {
      telegramId,
      hasCallbackQuery: 'callback_query' in ctx.update,
    })

    // Обрабатываем только callback_query
    if (!('callback_query' in ctx.update)) {
      await ctx.reply(
        isRu
          ? '❌ Пожалуйста, нажмите одну из кнопок.'
          : '❌ Please press one of the buttons.'
      )
      return
    }

    if (!telegramId) {
      await ctx.reply(
        isRu
          ? '❌ Ошибка: не удалось определить ваш ID'
          : '❌ Error: could not determine your ID'
      )
      return ctx.scene.leave()
    }

    const callbackData =
      'data' in ctx.update.callback_query ? ctx.update.callback_query.data : ''

    if (callbackData === 'service_hedra') {
      // ВЕТКА HEDRA: Запрос фото пользователя
      ctx.session.aiReelsRender = {
        ...ctx.session.aiReelsRender,
        avatarService: 'hedra',
        step: 'image',
      }

      await ctx.answerCbQuery()
      await ctx.editMessageText(
        isRu
          ? '✅ Выбран: 🎭 Hedra\n\n📸 Отправьте фото или URL изображения с лицом для аватара.'
          : '✅ Selected: 🎭 Hedra\n\n📸 Send a photo or image URL with a face for avatar.'
      )

      logger.info('🎬 [AI REELS RENDER] Hedra selected, requesting photo', {
        telegramId,
      })

      // ✅ ИСПРАВЛЕНИЕ: Переход напрямую на Step 2 (индекс 4), пропуская HeyGen шаги
      // Структура: 0, 1, 1a, 1b, 2, 2.5(cover), 3, 4, 5, 6
      // Step 2 (Hedra photo) = индекс 4
      ctx.wizard.selectStep(4)
      return
    } else if (callbackData === 'service_fal') {
      // ВЕТКА FAL: Запрос фото пользователя (похоже на Hedra)
      // ✅ ИСПРАВЛЕНИЕ: Берем FAL API key из конфига (Infisical)
      const { FAL_KEY } = await import('@/config')

      ctx.session.aiReelsRender = {
        ...ctx.session.aiReelsRender,
        avatarService: 'fal',
        step: 'image',
        falApiKey: FAL_KEY, // ✅ Из Infisical через централизованный config
        falResolution: '720p', // Default resolution
      }

      await ctx.answerCbQuery()
      await ctx.editMessageText(
        isRu
          ? '✅ Выбран: 🎯 Fal (Fabric)\n\n📸 Отправьте фото или URL изображения с лицом для аватара.'
          : '✅ Selected: 🎯 Fal (Fabric)\n\n📸 Send a photo or image URL with a face for avatar.'
      )

      logger.info('🎬 [AI REELS RENDER] Fal selected, requesting photo', {
        telegramId,
      })

      // Переход на Step 2 (индекс 4), как у Hedra
      ctx.wizard.selectStep(4)
      return
    } else if (callbackData === 'service_heygen') {
      // ВЕТКА HEYGEN: Показываем выбор набора аватаров
      ctx.session.aiReelsRender = {
        ...ctx.session.aiReelsRender,
        avatarService: 'heygen',
        step: 'avatar_set_selection',
        imageUrl: '', // HeyGen не требует фото пользователя
      }

      await ctx.answerCbQuery()
      await ctx.editMessageText(
        isRu
          ? '✅ Выбран: 🎬 HeyGen\n\n👥 Выберите набор аватаров:'
          : '✅ Selected: 🎬 HeyGen\n\n👥 Choose avatar set:',
        {
          parse_mode: 'HTML',
          ...Markup.inlineKeyboard([
            [
              Markup.button.callback(
                `${isRu ? '👤 Cocoage' : '👤 Cocoage'} (8)`,
                'heygen_set_cocoage'
              ),
            ],
            [
              Markup.button.callback(
                `${isRu ? '👥 Haim' : '👥 Haim'} (11)`,
                'heygen_set_haim'
              ),
            ],
            [
              Markup.button.callback(
                isRu ? 'Отмена' : 'Cancel',
                'ai_reels_cancel'
              ),
            ],
          ]),
        }
      )

      logger.info('🎬 [AI REELS RENDER] HeyGen selected, showing avatar sets', {
        telegramId,
      })

      // Переходим к Step 1a (выбор набора аватаров)
      return ctx.wizard.next()
    } else {
      await ctx.reply(
        isRu
          ? '❌ Неизвестная опция. Попробуйте еще раз.'
          : '❌ Unknown option. Try again.'
      )
      return ctx.scene.leave()
    }
  },

  // Step 1a: HEYGEN - Выбор набора аватаров (Cocoage/Haim)
  async ctx => {
    const isRu = isRussianFromState(ctx)
    const telegramId = ctx.from?.id?.toString()

    logger.info('🎬 [AI REELS RENDER] Step 1a - Avatar set selection', {
      telegramId,
      hasCallbackQuery: 'callback_query' in ctx.update,
    })

    if (!('callback_query' in ctx.update)) {
      await ctx.reply(
        isRu
          ? '❌ Пожалуйста, нажмите одну из кнопок.'
          : '❌ Please press one of the buttons.'
      )
      return
    }

    if (!telegramId) {
      await ctx.reply(
        isRu
          ? '❌ Ошибка: не удалось определить ваш ID'
          : '❌ Error: could not determine your ID'
      )
      return ctx.scene.leave()
    }

    const callbackData =
      'data' in ctx.update.callback_query ? ctx.update.callback_query.data : ''

    if (
      callbackData === 'heygen_set_cocoage' ||
      callbackData === 'heygen_set_haim'
    ) {
      const setName = callbackData === 'heygen_set_cocoage' ? 'cocoage' : 'haim'
      const avatarSet = HEYGEN_AVATAR_SETS[setName]

      ctx.session.aiReelsRender = {
        ...ctx.session.aiReelsRender,
        heygenAvatarSet: setName,
        heygenApiKey: avatarSet.apiKey,
      }

      await ctx.answerCbQuery()

      // Создаем кнопки с аватарами (по 2 в ряд)
      const avatarButtons = []
      for (let i = 0; i < avatarSet.avatars.length; i += 2) {
        const row = []
        const avatar1 = avatarSet.avatars[i]
        row.push(
          Markup.button.callback(
            `${avatar1.emoji} ${avatar1.name}`,
            `heygen_avatar_${avatar1.id}`
          )
        )

        if (i + 1 < avatarSet.avatars.length) {
          const avatar2 = avatarSet.avatars[i + 1]
          row.push(
            Markup.button.callback(
              `${avatar2.emoji} ${avatar2.name}`,
              `heygen_avatar_${avatar2.id}`
            )
          )
        }
        avatarButtons.push(row)
      }

      // Добавляем кнопку отмены
      avatarButtons.push([
        Markup.button.callback(isRu ? 'Отмена' : 'Cancel', 'ai_reels_cancel'),
      ])

      await ctx.editMessageText(
        isRu
          ? `✅ Набор: ${avatarSet.name}\n\n` +
              `🎭 Выберите аватар (${avatarSet.avatars.length} доступно):`
          : `✅ Set: ${avatarSet.name}\n\n` +
              `🎭 Choose avatar (${avatarSet.avatars.length} available):`,
        {
          parse_mode: 'HTML',
          ...Markup.inlineKeyboard(avatarButtons),
        }
      )

      logger.info('🎬 [AI REELS RENDER] Avatar set selected, showing avatars', {
        telegramId,
        setName,
        avatarsCount: avatarSet.avatars.length,
      })

      return ctx.wizard.next()
    } else {
      await ctx.reply(
        isRu
          ? '❌ Неизвестная опция. Попробуйте еще раз.'
          : '❌ Unknown option. Try again.'
      )
      return ctx.scene.leave()
    }
  },

  // Step 1b: HEYGEN - Выбор конкретного аватара из набора
  async ctx => {
    const isRu = isRussianFromState(ctx)
    const telegramId = ctx.from?.id?.toString()

    logger.info('🎬 [AI REELS RENDER] Step 1b - Specific avatar selection', {
      telegramId,
      hasCallbackQuery: 'callback_query' in ctx.update,
    })

    if (!('callback_query' in ctx.update)) {
      await ctx.reply(
        isRu
          ? '❌ Пожалуйста, нажмите одну из кнопок.'
          : '❌ Please press one of the buttons.'
      )
      return
    }

    if (!telegramId) {
      await ctx.reply(
        isRu
          ? '❌ Ошибка: не удалось определить ваш ID'
          : '❌ Error: could not determine your ID'
      )
      return ctx.scene.leave()
    }

    const callbackData =
      'data' in ctx.update.callback_query ? ctx.update.callback_query.data : ''

    if (callbackData.startsWith('heygen_avatar_')) {
      const avatarId = callbackData.replace('heygen_avatar_', '')
      const { findAvatarById } = await import('./heygen-avatars-config')
      const avatarInfo = findAvatarById(avatarId)

      if (!avatarInfo) {
        await ctx.reply(
          isRu
            ? '❌ Аватар не найден. Попробуйте еще раз.'
            : '❌ Avatar not found. Try again.'
        )
        return ctx.scene.leave()
      }

      ctx.session.aiReelsRender = {
        ...ctx.session.aiReelsRender,
        heygenAvatarId: avatarId,
        heygenApiKey: avatarInfo.apiKey, // ✅ Сохраняем API ключ набора аватара
        step: 'text',
      }

      await ctx.answerCbQuery()
      await ctx.editMessageText(
        isRu
          ? `✅ Выбран аватар: ${avatarInfo.avatar.emoji} ${avatarInfo.avatar.name}\n\n🖼️ Теперь отправьте обложку (фото для превью видео):`
          : `✅ Avatar selected: ${avatarInfo.avatar.emoji} ${avatarInfo.avatar.name}\n\n🖼️ Now send cover image (video preview thumbnail):`
      )

      logger.info(
        '🎬 [AI REELS RENDER] Avatar selected, requesting cover image',
        {
          telegramId,
          avatarId,
          setName: ctx.session.aiReelsRender.heygenAvatarSet,
        }
      )

      // Переходим к Step 2.5 (cover) - новый шаг для обложки
      // Структура: 0, 1, 1a, 1b, 2, 2.5(cover), 3, 4, 5, 6
      // Индекс 5 = Step 2.5 (cover)
      ctx.wizard.selectStep(5) // Индекс 5 = Step 2.5 (cover для HeyGen)
      return
    } else {
      await ctx.reply(
        isRu
          ? '❌ Неизвестная опция. Попробуйте еще раз.'
          : '❌ Unknown option. Try again.'
      )
      return ctx.scene.leave()
    }
  },

  // Step 2: HEDRA/FAL - Обработка изображения
  async ctx => {
    const isRu = isRussianFromState(ctx)
    const message = ctx.message
    let imageUrl: string | null = null
    const avatarService = ctx.session.aiReelsRender?.avatarService

    logger.info('🎬 [AI REELS RENDER] Step 2 - Processing image', {
      telegramId: ctx.from?.id?.toString(),
      avatarService,
    })

    try {
      // Обработка фото из Telegram
      if (message && 'photo' in message && message.photo.length > 0) {
        const photo = message.photo[message.photo.length - 1]
        const telegramId = ctx.from?.id?.toString()

        const fileLink = await ctx.telegram.getFileLink(photo.file_id)
        const response = await fetch(fileLink.href, {
          signal: AbortSignal.timeout(60_000),
        })

        if (!response.ok) {
          throw new Error(`Failed to download photo: ${response.statusText}`)
        }

        const imageBuffer = Buffer.from(await response.arrayBuffer())

        // Загружаем в Supabase Storage
        const { createClient } = await import('@supabase/supabase-js')
        const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = await import(
          '@/config'
        )

        const serviceClient = createClient(
          SUPABASE_URL!,
          SUPABASE_SERVICE_ROLE_KEY!
        )
        const fileName = `ai-reels-render/${telegramId}/${Date.now()}.jpg`

        const { error: uploadError } = await serviceClient.storage
          .from('images')
          .upload(fileName, imageBuffer, {
            contentType: 'image/jpeg',
            upsert: false,
          })

        if (uploadError) {
          throw new Error(`Upload failed: ${uploadError.message}`)
        }

        const { data: urlData } = serviceClient.storage
          .from('images')
          .getPublicUrl(fileName)
        imageUrl = urlData.publicUrl

        logger.info('✅ [AI REELS RENDER] Photo uploaded', {
          telegramId,
          imageUrl: imageUrl.substring(0, 100),
        })
      }
      // Обработка URL
      else if (message && 'text' in message) {
        const text = message.text.trim()
        if (text.startsWith('http://') || text.startsWith('https://')) {
          imageUrl = text
        }
      }

      if (!imageUrl) {
        await ctx.reply(
          isRu
            ? '❌ Некорректное изображение. Отправьте фото или URL.'
            : '❌ Invalid image. Send a photo or URL.'
        )
        return ctx.scene.leave()
      }

      ctx.session.aiReelsRender = {
        ...ctx.session.aiReelsRender,
        imageUrl,
        step: 'text',
      }

      await ctx.reply(
        isRu
          ? '✅ Изображение аватара получено!\n\n' +
              '🖼️ Теперь отправьте обложку (фото для превью видео):'
          : '✅ Avatar image received!\n\n' +
              '🖼️ Now send cover image (video preview thumbnail):'
      )

      return ctx.wizard.next() // Переход к Step 2.5 (cover)
    } catch (error) {
      logger.error('❌ [AI REELS RENDER] Image processing error', { error })
      await ctx.reply(
        isRu
          ? '❌ Произошла ошибка при обработке изображения.'
          : '❌ Error processing image.'
      )
      return ctx.scene.leave()
    }
  },

  // Step 2.5: Загрузка обложки (cover) для всех типов
  async ctx => {
    const isRu = isRussianFromState(ctx)
    const message = ctx.message
    const telegramId = ctx.from?.id?.toString()

    logger.info('🎬 [AI REELS RENDER] Step 2.5 - Processing cover image', {
      telegramId,
    })

    if (!telegramId) {
      await ctx.reply(
        isRu
          ? '❌ Ошибка: не удалось определить ваш ID'
          : '❌ Error: could not determine your ID'
      )
      return ctx.scene.leave()
    }

    try {
      let coverUrl: string | null = null

      // Обработка фото обложки
      if (message && 'photo' in message && message.photo.length > 0) {
        const photo = message.photo[message.photo.length - 1]
        const fileLink = await ctx.telegram.getFileLink(photo.file_id)
        const response = await fetch(fileLink.href, {
          signal: AbortSignal.timeout(60_000),
        })

        if (!response.ok) {
          throw new Error(`Failed to download cover: ${response.statusText}`)
        }

        const imageBuffer = Buffer.from(await response.arrayBuffer())

        // Загружаем в Supabase Storage
        const { createClient } = await import('@supabase/supabase-js')
        const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = await import(
          '@/config'
        )

        const serviceClient = createClient(
          SUPABASE_URL!,
          SUPABASE_SERVICE_ROLE_KEY!
        )
        const fileName = `ai-reels-covers/${telegramId}/${Date.now()}.jpg`

        const { error: uploadError } = await serviceClient.storage
          .from('images')
          .upload(fileName, imageBuffer, {
            contentType: 'image/jpeg',
            upsert: false,
          })

        if (uploadError) {
          throw new Error(`Supabase upload failed: ${uploadError.message}`)
        }

        const { data: urlData } = serviceClient.storage
          .from('images')
          .getPublicUrl(fileName)

        coverUrl = urlData.publicUrl

        logger.info('✅ [AI REELS RENDER] Cover image uploaded', {
          telegramId,
          coverUrl,
        })
      } else {
        await ctx.reply(
          isRu
            ? '❌ Пожалуйста, отправьте фото для обложки.'
            : '❌ Please send a photo for the cover.'
        )
        return
      }

      // Сохраняем URL обложки в сессию
      ctx.session.aiReelsRender = {
        ...ctx.session.aiReelsRender,
        coverUrl,
        step: 'text',
      }

      await ctx.reply(
        isRu
          ? '✅ Обложка получена!\n\n' +
              '📝 Теперь отправьте текст (до 5000 символов) или голосовое сообщение (до 30 сек):'
          : '✅ Cover received!\n\n' +
              '📝 Now send text (up to 5000 characters) or voice message (up to 30 sec):'
      )

      return ctx.wizard.next() // Переход к Step 3 (текст)
    } catch (error) {
      logger.error('❌ [AI REELS RENDER] Cover processing error', { error })
      await ctx.reply(
        isRu
          ? '❌ Произошла ошибка при обработке обложки.'
          : '❌ Error processing cover.'
      )
      return ctx.scene.leave()
    }
  },

  // Step 3: Обработка текста/голоса (для Hedra и HeyGen)
  async ctx => {
    const isRu = isRussianFromState(ctx)
    const message = ctx.message
    const telegramId = ctx.from?.id?.toString()

    logger.info('🎬 [AI REELS RENDER] Step 3 - Processing text/voice', {
      telegramId,
    })

    if (!telegramId) {
      await ctx.reply(
        isRu
          ? '❌ Ошибка: не удалось определить ваш ID'
          : '❌ Error: could not determine your ID'
      )
      return ctx.scene.leave()
    }

    try {
      let text: string = ''
      let audioUrl: string | null = null

      // Обработка голосового сообщения
      if (message && 'voice' in message) {
        const voice = message.voice

        if ((voice as any).duration > 30) {
          await ctx.reply(
            isRu
              ? `❌ Голосовое сообщение слишком длинное (${(voice as any).duration} сек). Максимум: 30 секунд.`
              : `❌ Voice message is too long (${(voice as any).duration} sec). Maximum: 30 seconds.`
          )
          return ctx.scene.leave()
        }

        // Скачиваем и загружаем голос
        const fileLink = await ctx.telegram.getFileLink(voice.file_id)
        const response = await fetch(fileLink.href, {
          signal: AbortSignal.timeout(60_000),
        })
        const audioBuffer = Buffer.from(await response.arrayBuffer())

        const { createClient } = await import('@supabase/supabase-js')
        const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = await import(
          '@/config'
        )

        const serviceClient = createClient(
          SUPABASE_URL!,
          SUPABASE_SERVICE_ROLE_KEY!
        )
        const fileName = `ai-reels-render-audio/${telegramId}/${Date.now()}.ogg`

        const { error: uploadError } = await serviceClient.storage
          .from('images')
          .upload(fileName, audioBuffer, {
            contentType: 'audio/ogg',
            upsert: false,
          })

        if (uploadError) {
          throw new Error(`Upload failed: ${uploadError.message}`)
        }

        const { data: urlData } = serviceClient.storage
          .from('images')
          .getPublicUrl(fileName)
        audioUrl = urlData.publicUrl
        text = `voice_message_${(voice as any).duration}`
      }
      // Обработка текста
      else if (message && 'text' in message) {
        text = message.text.trim()

        if (text.length === 0 || text.length > 5000) {
          await ctx.reply(
            isRu
              ? '❌ Текст должен быть от 1 до 5000 символов.'
              : '❌ Text must be between 1 and 5000 characters.'
          )
          return ctx.scene.leave()
        }

        // ✅ ИСПРАВЛЕНИЕ: Генерируем аудио из текста через централизованную систему
        logger.info('🎤 [AI REELS RENDER] Генерируем аудио из текста', {
          telegramId,
          textLength: text.length,
        })

        try {
          const { createAudioFileFromText } = await import(
            '@/core/elevenlabs/createAudioFileFromText'
          )
          const { getVoiceId } = await import('@/core/supabase/getVoiceId')

          // Получаем voice_id пользователя через централизованную систему
          const voiceId = await getVoiceId(telegramId)

          if (!voiceId) {
            throw new Error('User voice ID not found for audio generation')
          }

          logger.info(
            '🎤 [AI REELS RENDER] Используем централизованную систему голосов',
            {
              telegramId,
              voiceId,
              textLength: text.length,
            }
          )

          // Генерируем аудио через централизованную систему
          const audioPath = await createAudioFileFromText({
            text,
            voice_id: voiceId,
            telegram_id: telegramId,
          })

          if (!audioPath) {
            throw new Error('Failed to generate audio from text')
          }

          // Загружаем сгенерированное аудио в Supabase Storage
          const fs = await import('fs/promises')
          const audioBuffer = await fs.readFile(audioPath)

          const { createClient } = await import('@supabase/supabase-js')
          const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = await import(
            '@/config'
          )

          const serviceClient = createClient(
            SUPABASE_URL!,
            SUPABASE_SERVICE_ROLE_KEY!
          )
          const fileName = `ai-reels-render-generated-audio/${telegramId}/${Date.now()}.mp3`

          const { error: uploadError } = await serviceClient.storage
            .from('images')
            .upload(fileName, audioBuffer, {
              contentType: 'audio/mpeg',
              upsert: false,
            })

          if (uploadError) {
            throw new Error(`Upload failed: ${uploadError.message}`)
          }

          const { data: urlData } = serviceClient.storage
            .from('images')
            .getPublicUrl(fileName)

          audioUrl = urlData.publicUrl

          // Удаляем временный файл
          try {
            await fs.unlink(audioPath)
          } catch (cleanupError) {
            logger.warn(
              '⚠️ [AI REELS RENDER] Не удалось удалить временный файл',
              {
                audioPath,
                error: cleanupError,
              }
            )
          }

          logger.info(
            '✅ [AI REELS RENDER] Аудио сгенерировано через централизованную систему',
            {
              telegramId,
              voiceId,
              audioUrl: audioUrl.substring(0, 100),
            }
          )
        } catch (audioError) {
          logger.error(
            '❌ [AI REELS RENDER] Ошибка генерации аудио из текста',
            {
              error: audioError,
              telegramId,
            }
          )

          await ctx.reply(
            isRu
              ? '❌ Ошибка генерации аудио из текста. Попробуйте отправить голосовое сообщение.'
              : '❌ Error generating audio from text. Try sending a voice message.'
          )
          return ctx.scene.leave()
        }
      } else {
        await ctx.reply(
          isRu
            ? '❌ Пожалуйста, отправьте текст или голосовое сообщение.'
            : '❌ Please send text or voice message.'
        )
        return ctx.scene.leave()
      }

      ctx.session.aiReelsRender = {
        ...ctx.session.aiReelsRender,
        text,
        audioUrl,
        step: 'intro_text',
      }

      // Оценка длительности для расчета стоимости
      let estimatedDuration = 10 // секунд по умолчанию

      if (audioUrl && 'voice' in message) {
        // Для голоса - точная длительность
        estimatedDuration = (message.voice as any).duration || 10
      } else {
        // Для текста - оценка (~2.5 слова в секунду, среднее чтение)
        const words = text.split(/\s+/).length
        estimatedDuration = Math.ceil(words / 2.5)
      }

      // Сохраняем длительность для расчета цены
      ctx.session.aiReelsRender = {
        ...ctx.session.aiReelsRender,
        estimatedDuration,
      }

      // 💰 Динамический расчет цены:
      // - VEO3 Fast (4 видео): 160⭐ × 1.5 = 240⭐
      // - Hedra lip-sync: ~4.9⭐/сек себестоимость × 1.5 = ~7⭐/сек
      // - Формула: 240 + (duration × 7)
      const veo3Cost = 240 // с наценкой x1.5
      const hedraPerSecond = 7 // с наценкой x1.5
      const finalCost = veo3Cost + estimatedDuration * hedraPerSecond
      const finalCostUSD = (finalCost / 100).toFixed(2)

      // Запрос первой части заголовка для обложки
      await ctx.reply(
        isRu
          ? `✅ Текст получен!\n\n` +
              `📝 Теперь введите <b>первую часть</b> заголовка для обложки:\n\n` +
              `🎨 <b>Это будет составной заголовок из двух частей:</b>\n` +
              `• Первая часть: [ваш текст] (до 50 символов)\n` +
              `• Вторая часть: [будет запрошена далее]\n\n` +
              `💡 <i>Например: "ФОТОРЕАЛЬНЫЙ АВАТАР"</i>`
          : `✅ Text received!\n\n` +
              `📝 Now enter the <b>first part</b> of the cover title:\n\n` +
              `🎨 <b>This will be a composite title with two parts:</b>\n` +
              `• First part: [your text] (up to 50 characters)\n` +
              `• Second part: [will be requested next]\n\n` +
              `💡 <i>For example: "PHOTOREALISTIC AVATAR"</i>`,
        { parse_mode: 'HTML' }
      )

      return ctx.wizard.next()
    } catch (error) {
      logger.error('❌ [AI REELS RENDER] Text/voice processing error', {
        error,
      })
      await ctx.reply(
        isRu
          ? '❌ Произошла ошибка при обработке данных.'
          : '❌ Error processing data.'
      )
      return ctx.scene.leave()
    }
  },

  // Step 4: Ввод текста интро для обложки
  async ctx => {
    const isRu = isRussianFromState(ctx)
    const telegramId = ctx.from?.id?.toString()

    logger.info('🎬 [AI REELS RENDER] Step 4 - Intro text input', {
      telegramId,
      step: 'intro_text',
    })

    if (!telegramId) {
      await ctx.reply(
        isRu
          ? '❌ Ошибка: не удалось определить ваш ID'
          : '❌ Error: could not determine your ID'
      )
      return ctx.scene.leave()
    }

    // Обработка текста интро
    if (ctx.message && 'text' in ctx.message) {
      const introText = ctx.message.text.trim()

      if (introText.length === 0 || introText.length > 50) {
        await ctx.reply(
          isRu
            ? '❌ Текст интро должен быть от 1 до 50 символов.'
            : '❌ Intro text must be between 1 and 50 characters.'
        )
        return ctx.scene.leave()
      }

      // Сохраняем первый текст интро
      ctx.session.aiReelsRender = {
        ...ctx.session.aiReelsRender,
        introText1: introText,
        step: 'intro_text_2', // Переходим к вводу второго текста
      }

      // Запрос второго текста интро
      await ctx.reply(
        isRu
          ? `✅ Первая часть заголовка: "${introText}"\n\n` +
              `📝 Теперь введите <b>вторую часть</b> заголовка (до 50 символов):\n\n` +
              `🎨 <b>Это будет составной заголовок:</b>\n` +
              `• Первая часть: "${introText}"\n` +
              `• Вторая часть: [ваш текст]\n\n` +
              `💡 <i>Например: "АВАТАР", "NEWS", "TECH"</i>`
          : `✅ First part of title: "${introText}"\n\n` +
              `📝 Now enter the <b>second part</b> of title (up to 50 characters):\n\n` +
              `🎨 <b>This will be a composite title:</b>\n` +
              `• First part: "${introText}"\n` +
              `• Second part: [your text]\n\n` +
              `💡 <i>For example: "AVATAR", "NEWS", "TECH"</i>`,
        { parse_mode: 'HTML' }
      )

      return ctx.wizard.next()
    } else {
      await ctx.reply(
        isRu
          ? '❌ Пожалуйста, отправьте текст для интро (до 50 символов).'
          : '❌ Please send intro text (up to 50 characters).'
      )
      return ctx.scene.leave()
    }
  },

  // Step 5: Ввод второго текста интро
  async ctx => {
    const isRu = isRussianFromState(ctx)
    const telegramId = ctx.from?.id?.toString()

    logger.info('🎬 [AI REELS RENDER] Step 5 - Second intro text input', {
      telegramId,
      step: 'intro_text_2',
    })

    if (!telegramId) {
      await ctx.reply(
        isRu
          ? '❌ Ошибка: не удалось определить ваш ID'
          : '❌ Error: could not determine your ID'
      )
      return ctx.scene.leave()
    }

    // Обработка второго текста интро
    if (ctx.message && 'text' in ctx.message) {
      const introText2 = ctx.message.text.trim()

      if (introText2.length === 0 || introText2.length > 50) {
        await ctx.reply(
          isRu
            ? '❌ Второй текст интро должен быть от 1 до 50 символов.'
            : '❌ Second intro text must be between 1 and 50 characters.'
        )
        return ctx.scene.leave()
      }

      // Сохраняем второй текст интро
      ctx.session.aiReelsRender = {
        ...ctx.session.aiReelsRender,
        introText2: introText2,
        upperIntroText: introText2, // Используем второй текст как верхний
        step: 'processing', // Переходим к обработке
      }

      // Оценка длительности для расчета стоимости
      let estimatedDuration = 10 // секунд по умолчанию

      if (ctx.session.aiReelsRender.audioUrl && 'voice' in ctx.message) {
        // Для голоса - точная длительность
        estimatedDuration = (ctx.message.voice as any).duration || 10
      } else {
        // Для текста - оценка (~2.5 слова в секунду, среднее чтение)
        const words = (ctx.session.aiReelsRender.text || '').split(/\s+/).length
        estimatedDuration = Math.ceil(words / 2.5)
      }

      // Сохраняем длительность для расчета цены
      ctx.session.aiReelsRender = {
        ...ctx.session.aiReelsRender,
        estimatedDuration,
      }

      // Dynamic price display. MUST equal the actual Step 6 charge
      // (veo3Cost=240, hedraPerSecond=7, estimatedCost = 240 + dur*7), otherwise
      // the user is quoted one price and charged another. This block previously
      // used a stale formula ceil((160 + dur*14) * 2) -- it showed ~600 stars
      // while Step 6 deducted ~310. The x1.5 markup is already baked into 240/7.
      const veo3Cost = 240
      const hedraPerSecond = 7
      const baseCost = veo3Cost + estimatedDuration * hedraPerSecond
      const finalCost = baseCost // matches the Step 6 charge exactly
      const finalCostUSD = (finalCost / 100).toFixed(2)

      // ✅ ПРОВЕРКА: Если avatarService УЖЕ выбран (HeyGen с аватаром или Hedra с фото)
      if (ctx.session.aiReelsRender.avatarService) {
        const service = ctx.session.aiReelsRender.avatarService
        const serviceName = service === 'hedra' ? '🎭 Hedra' : '🎬 HeyGen'

        logger.info(
          '🎬 [AI REELS RENDER] Service already selected, skipping duplicate choice',
          {
            telegramId,
            avatarService: service,
            heygenAvatarId: ctx.session.aiReelsRender.heygenAvatarId,
          }
        )

        await ctx.reply(
          isRu
            ? `✅ <b>Составной заголовок создан:</b>\n` +
                `🎨 "${ctx.session.aiReelsRender.introText1}" + "${introText2}"\n\n` +
                `📊 <b>Расчет стоимости:</b>\n` +
                `• Длительность: ~${estimatedDuration} сек\n` +
                `• 4 видео VEO3 Fast: 240⭐\n` +
                `• Hedra lip-sync: ${estimatedDuration} × 7⭐/сек = ${estimatedDuration * hedraPerSecond}⭐\n` +
                `• <b>Итого: ${finalCost}⭐ ($${finalCostUSD})</b>\n\n` +
                `✅ Генерация через ${serviceName}\n\n⏳ Отправляем запрос на render-server...`
            : `✅ <b>Composite title created:</b>\n` +
                `🎨 "${ctx.session.aiReelsRender.introText1}" + "${introText2}"\n\n` +
                `📊 <b>Cost calculation:</b>\n` +
                `• Duration: ~${estimatedDuration} sec\n` +
                `• 4 VEO3 Fast videos: 240⭐\n` +
                `• Hedra lip-sync: ${estimatedDuration} × 7⭐/sec = ${estimatedDuration * hedraPerSecond}⭐\n` +
                `• <b>Total: ${finalCost}⭐ ($${finalCostUSD})</b>\n\n` +
                `✅ Generating with ${serviceName}\n\n⏳ Sending request to render-server...`,
          { parse_mode: 'HTML' }
        )

        // ✅ ИСПРАВЛЕНИЕ: Переходим к Step 6
        logger.info(
          '🎬 [AI REELS RENDER] Service already selected, proceeding to Step 6',
          {
            telegramId,
            avatarService: service,
          }
        )

        // Переключаем на Step 6 (индекс 9, после добавления cover шага)
        ctx.wizard.selectStep(9)

        // ✅ Вызываем handler Step 6 напрямую
        // @ts-ignore - steps is private but we need direct invocation
        return await (ctx.wizard as any).steps[ctx.wizard.cursor](ctx)
      }

      // ❌ УСТАРЕВШИЙ ПУТЬ: Если сервис НЕ выбран (только для Hedra flow из старого кода)
      // Запрос выбора сервиса аватара
      await ctx.reply(
        isRu
          ? `✅ <b>Составной заголовок создан:</b>\n` +
              `🎨 "${ctx.session.aiReelsRender.introText1}" + "${introText2}"\n\n` +
              `📊 <b>Расчет стоимости:</b>\n` +
              `• Длительность: ~${estimatedDuration} сек\n` +
              `• 4 видео VEO3 Fast: 240⭐\n` +
              `• Hedra lip-sync: ${estimatedDuration} × 7⭐/сек = ${estimatedDuration * hedraPerSecond}⭐\n` +
              `• <b>Итого: ${finalCost}⭐ ($${finalCostUSD})</b>\n\n` +
              `🎭 Выберите сервис для генерации аватара:\n\n` +
              `🎭 <b>Hedra</b> - качественная генерация\n` +
              `   • Стоимость: ${finalCost}⭐\n` +
              `   • Время: 2-3 минуты\n\n` +
              `🎬 <b>HeyGen</b> - премиум качество\n` +
              `   • Стоимость: ${finalCost}⭐\n` +
              `   • Время: 4-5 минут`
          : `✅ <b>Composite title created:</b>\n` +
              `🎨 "${ctx.session.aiReelsRender.introText1}" + "${introText2}"\n\n` +
              `📊 <b>Cost calculation:</b>\n` +
              `• Duration: ~${estimatedDuration} sec\n` +
              `• 4 VEO3 Fast videos: 240⭐\n` +
              `• Hedra lip-sync: ${estimatedDuration} × 7⭐/sec = ${estimatedDuration * hedraPerSecond}⭐\n` +
              `• <b>Total: ${finalCost}⭐ ($${finalCostUSD})</b>\n\n` +
              `🎭 Choose avatar generation service:\n\n` +
              `🎭 <b>Hedra</b> - quality generation\n` +
              `   • Cost: ${finalCost}⭐\n` +
              `   • Time: 2-3 minutes\n\n` +
              `🎬 <b>HeyGen</b> - premium quality\n` +
              `   • Cost: ${finalCost}⭐\n` +
              `   • Time: 4-5 minutes`,
        {
          parse_mode: 'HTML',
          ...Markup.inlineKeyboard([
            [
              Markup.button.callback(
                isRu
                  ? `🎭 Hedra (${finalCost}⭐)`
                  : `🎭 Hedra (${finalCost}⭐)`,
                'avatar_hedra'
              ),
              Markup.button.callback(
                isRu
                  ? `🎬 HeyGen (${finalCost}⭐)`
                  : `🎬 HeyGen (${finalCost}⭐)`,
                'avatar_heygen'
              ),
            ],
            [
              Markup.button.callback(
                isRu ? 'Отмена' : 'Cancel',
                'ai_reels_cancel'
              ),
            ],
          ]),
        }
      )

      return ctx.wizard.next()
    } else {
      await ctx.reply(
        isRu
          ? '❌ Пожалуйста, отправьте второй текст для интро (до 50 символов).'
          : '❌ Please send second intro text (up to 50 characters).'
      )
      return ctx.scene.leave()
    }
  },

  // Step 6: Отправка на render-server (avatarService уже выбран в Step 1)
  async ctx => {
    console.log('🔴🔴🔴 [RENDER WIZARD STEP 6] FUNCTION EXECUTING!!!')
    console.log('🔴 [RENDER WIZARD STEP 6] Update type:', ctx.updateType)

    try {
      const isRu = isRussianFromState(ctx)
      const telegramId = ctx.from?.id?.toString()

      logger.info('🎬 [AI REELS RENDER] Step 6 - Sending to render-server', {
        telegramId,
        avatarService: ctx.session.aiReelsRender.avatarService,
      })

      if (!telegramId) {
        await ctx.reply(
          isRu
            ? '❌ Ошибка: не удалось определить ваш ID'
            : '❌ Error: could not determine your ID'
        )
        return ctx.scene.leave()
      }

      // Получаем avatarService из сессии (был установлен в Step 1)
      const avatarService = ctx.session.aiReelsRender.avatarService || 'hedra'
      console.log('🔴 [STEP 6] Avatar service from session:', avatarService)

      await ctx.reply(
        isRu
          ? `✅ Генерация через ${avatarService === 'hedra' ? '🎭 Hedra' : '🎬 HeyGen'}\n\n⏳ Отправляем запрос на render-server...`
          : `✅ Generating with ${avatarService === 'hedra' ? '🎭 Hedra' : '🎬 HeyGen'}\n\n⏳ Sending request to render-server...`
      )

      console.log('🔴 [STEP 6] Creating payload...')

      // ✅ ИСПРАВЛЕНИЕ: Для HeyGen используем voice_id набора аватара, для Hedra - voice_id пользователя
      let voiceIdToUse: string

      if (avatarService === 'heygen') {
        // Для HeyGen получаем voice_id на основе выбранного аватара
        const heygenAvatarId = ctx.session.aiReelsRender.heygenAvatarId

        if (!heygenAvatarId) {
          console.log('🔴 [STEP 6] ERROR: No HeyGen avatar ID in session!')
          await ctx.reply(
            isRu
              ? '❌ Ошибка: аватар HeyGen не выбран'
              : '❌ Error: HeyGen avatar not selected'
          )
          return ctx.scene.leave()
        }

        const heygenVoiceId = getVoiceIdForAvatar(heygenAvatarId)

        if (!heygenVoiceId) {
          console.log(
            '🔴 [STEP 6] ERROR: Could not find voice_id for avatar:',
            heygenAvatarId
          )
          await ctx.reply(
            isRu
              ? '❌ Ошибка: не найден voice_id для выбранного аватара'
              : '❌ Error: voice_id not found for selected avatar'
          )
          return ctx.scene.leave()
        }

        voiceIdToUse = heygenVoiceId
        console.log('🔴 [STEP 6] Using HeyGen voice_id for avatar:', {
          avatarId: heygenAvatarId.substring(0, 15),
          voiceId: voiceIdToUse,
        })
      } else {
        // Для Hedra используем voice_id пользователя из БД
        const { getVoiceId } = await import('@/core/supabase/getVoiceId')
        const userVoiceId = await getVoiceId(telegramId)

        if (!userVoiceId) {
          console.log('🔴 [STEP 6] ERROR: No user voice ID found for Hedra!')
          await ctx.reply(
            isRu
              ? '❌ У вас не настроен голос аватара. Создайте голос сначала.'
              : '❌ You dont have avatar voice configured. Create voice first.'
          )
          return ctx.scene.leave()
        }

        voiceIdToUse = userVoiceId
        console.log('🔴 [STEP 6] Using user voice ID for Hedra:', voiceIdToUse)
      }

      // ✅ Для HeyGen используем выбранный пользователем аватар из сессии
      let heygenAvatarId = ctx.session.aiReelsRender.heygenAvatarId
      let heygenApiKey = ctx.session.aiReelsRender.heygenApiKey

      if (avatarService === 'heygen') {
        if (!heygenAvatarId || !heygenApiKey) {
          logger.error('🔴 [STEP 6] HeyGen avatar data missing!', {
            telegramId,
            hasAvatarId: !!heygenAvatarId,
            hasApiKey: !!heygenApiKey,
          })
          // Используем дефолтный аватар Cocoage как fallback
          const defaultAvatar = HEYGEN_AVATAR_SETS.cocoage.avatars[0]
          ctx.session.aiReelsRender.heygenAvatarId = defaultAvatar.id
          ctx.session.aiReelsRender.heygenApiKey =
            HEYGEN_AVATAR_SETS.cocoage.apiKey

          // ✅ Перечитываем значения после fallback
          heygenAvatarId = ctx.session.aiReelsRender.heygenAvatarId
          heygenApiKey = ctx.session.aiReelsRender.heygenApiKey
        }
      }

      // The avatar id is not a credential and stays readable. The key is one:
      // the digest still tells the cocoage fallback apart from a user key,
      // which is the only question this line was ever asked to answer.
      console.log('🔴 [STEP 6] HeyGen config:', {
        avatarId: heygenAvatarId?.substring(0, 15),
        apiKey: secretFingerprint(heygenApiKey),
        fromSession: true,
      })

      // Создание payload с ПРАВИЛЬНЫМ voice_id (HeyGen default или user) и NEW API STRUCTURE
      /*
       * A person who never uploaded a picture still has one: the Telegram
       * avatar stored on their user row at registration. Without this the
       * Hedra branch of the event schema refuses the whole render, which reads
       * as the feature being broken rather than a step being missing.
       */
      const avatarPhoto = await resolveAvatarPhoto(
        ctx,
        ctx.session.aiReelsRender.imageUrl
      )
      const payload = createRenderAvatarPayload(
        telegramId,
        ctx.session.aiReelsRender.text || '',
        avatarPhoto,
        voiceIdToUse, // ✅ Используем дефолтный voice_id для HeyGen или user voice_id для Hedra/Fal
        {
          coverUrl:
            ctx.session.aiReelsRender.coverUrl ||
            'https://be8b1c6e-6556-4865-825b-43e40385848f.selstorage.ru/assets/agentsmd.jpg', // ✅ Используем обложку от пользователя или дефолтную
          introText1: ctx.session.aiReelsRender.introText1 || 'Ai-Stars',
          introText2: ctx.session.aiReelsRender.introText2 || 'News',
          // ✅ NEW API: avatarService, heygenApiKey, heygenAvatarId, falApiKey, falResolution - используем из сессии!
          avatarService,
          heygenApiKey: avatarService === 'heygen' ? heygenApiKey : undefined,
          heygenAvatarId:
            avatarService === 'heygen' ? heygenAvatarId : undefined,
          heygenAvatarSet:
            avatarService === 'heygen'
              ? ctx.session.aiReelsRender.heygenAvatarSet
              : undefined,
          // ✅ FAL support
          falApiKey:
            avatarService === 'fal'
              ? ctx.session.aiReelsRender.falApiKey
              : undefined,
          falResolution:
            avatarService === 'fal'
              ? ctx.session.aiReelsRender.falResolution
              : undefined,
          // ✅ Передаем имя бота для правильной отправки видео через callback
          botName: ctx.botInfo?.username || 'MetaMuse_Manifest_bot',
        }
      )
      // ✅ ВАЛИДАЦИЯ: Проверяем что токен ElevenLabs есть
      const elevenLabsToken = process.env.ELEVENLABS_API_KEY
      if (!elevenLabsToken) {
        console.log('🔴 [STEP 6] ERROR: ELEVENLABS_API_KEY not found in ENV!')
        logger.error('[AI REELS RENDER] Missing ELEVENLABS_API_KEY', {
          telegramId,
        })
        await ctx.reply(
          isRu
            ? '❌ Ошибка конфигурации сервера (ElevenLabs token). Обратитесь к администратору.'
            : '❌ Server configuration error (ElevenLabs token). Contact admin.'
        )
        return ctx.scene.leave()
      }

      console.log('🔴 [STEP 6] Payload created with voice ID:', voiceIdToUse)
      console.log(
        '🔴 [STEP 6] ElevenLabs token (masked):',
        elevenLabsToken.substring(0, 10) + '...'
      )

      // ✅ ЛОГИРОВАНИЕ: Проверяем payload перед отправкой
      logger.info('[AI REELS RENDER] Payload validation', {
        telegramId,
        hasElevenLabsToken: !!payload.eleven_labs_api_key,
        elevenLabsTokenPrefix: payload.eleven_labs_api_key.substring(0, 10),
        voiceId: voiceIdToUse,
        voiceIdType:
          avatarService === 'heygen' ? 'heygen_default' : 'user_voice',
        avatarService,
        avatarPhotoUrl: ctx.session.aiReelsRender.imageUrl?.substring(0, 50),
        textLength: ctx.session.aiReelsRender.text?.length,
        heygenEnabled: avatarService === 'heygen',
        hedraEnabled: avatarService === 'hedra',
        falEnabled: avatarService === 'fal',
      })

      console.log('🔴 [STEP 6] Payload structure:', {
        hasHeygenSettings: payload.avatar_gen_service === 'heygen',
        hasHedraSettings: payload.avatar_gen_service === 'hedra',
        hasFalSettings: payload.avatar_gen_service === 'fal',
      })

      // 💰 Шаблон 2: Динамическая стоимость по длине lip-sync
      // Наценка x1.5 применена к базовым ценам
      const duration = ctx.session.aiReelsRender.estimatedDuration || 10
      const veo3Cost = 240 // 160⭐ × 1.5
      const hedraPerSecond = 7 // ~4.9⭐/сек × 1.5
      const estimatedCost = veo3Cost + duration * hedraPerSecond

      console.log('🔴 [STEP 6] Dynamic cost calculation:', {
        duration,
        veo3Cost,
        hedraPerSecond,
        estimatedCost,
        markup: 1.5,
      })

      // Проверка баланса
      console.log('🔴 [STEP 6] Getting user balance...')
      const currentBalance = await getUserBalance(telegramId)
      console.log('🔴 [STEP 6] Current balance:', currentBalance)

      console.log('🔴 [STEP 6] Checking if balance sufficient...')
      if (currentBalance === null || currentBalance < estimatedCost) {
        console.log('🔴 [STEP 6] INSUFFICIENT BALANCE!')
        // A refusal that names the price hands over the way to pay it: the
        // person asked for something paid and was told the only obstacle is
        // money, and it carried nothing to press.
        await ctx.reply(
          isRu
            ? `💰 Недостаточно средств\n\nТребуется: ${estimatedCost}⭐\nУ вас: ${(currentBalance || 0).toFixed(2)}⭐`
            : `💰 Insufficient funds\n\nRequired: ${estimatedCost}⭐\nYou have: ${(currentBalance || 0).toFixed(2)}⭐`,
          standardButtons(isRu)
        )
        return ctx.scene.leave()
      }

      console.log('🔴 [STEP 6] Balance sufficient! Charging user...')
      if (ctx.session.aiReelsRenderInProgress) {
        await ctx.reply(
          isRu
            ? '⏳ Уже обрабатываю, подождите...'
            : '⏳ Already processing, please wait...'
        )
        return
      }
      ctx.session.aiReelsRenderInProgress = true
      // Списание средств
      const charged = await updateUserBalance(
        telegramId,
        estimatedCost,
        PaymentType.MONEY_OUTCOME,
        `AI Reels Render (${avatarService})`,
        {
          bot_name: ctx.botInfo?.username || 'unknown_bot',
          service_type: 'ai_reels_render',
          avatar_service: avatarService,
        }
      )
      // updateUserBalance returns false on a failed debit (it does NOT throw).
      // Without capturing it, a charge that fails -- e.g. a concurrent spend
      // depletes the balance between the pre-check and here, or a DB error --
      // still fell through to the render-server dispatch below: a FREE video.
      if (!charged) {
        console.log('🔴 [STEP 6] CHARGE FAILED -- aborting render')
        await ctx.reply(
          isRu
            ? '💰 Ошибка списания средств. Попробуйте позже.'
            : '💰 Error charging payment. Try again later.'
        )
        return ctx.scene.leave()
      }
      console.log('🔴 [STEP 6] User charged successfully!')

      console.log('🔴 [STEP 6] Sending event to render-server...')
      // dispatched: once sendRenderAvatarVideoEvent returns, the render job is
      // queued and the callback owns its outcome; a throw in the confirmation
      // reply AFTER this must NOT refund (heygen-render is the oracle). See #1331.
      let dispatched = false
      // Отправка на render-server
      try {
        console.log('🔴 [STEP 6] Inside sendEvent try block')
        console.log('🔴 [STEP 6] Payload job_id:', payload.job_id)
        console.log('🔴 [STEP 6] Payload keys:', Object.keys(payload))

        // ✅ ДЕТАЛЬНОЕ ЛОГИРОВАНИЕ: Полный payload перед отправкой на render-server
        logger.info('🎬 [AI REELS RENDER] Starting event send', {
          telegramId,
          avatarService,
          payloadJobId: payload.job_id,
          payloadKeys: Object.keys(payload),
          imageUrl: ctx.session.aiReelsRender.imageUrl?.substring(0, 100),
          text: ctx.session.aiReelsRender.text?.substring(0, 50),
        })

        logger.info('🎬 [AI REELS RENDER] FULL PAYLOAD DETAILS', {
          telegramId,
          job_id: payload.job_id,
          avatarService, // ✅ NEW: avatarService вместо avatar_gen_service
          eleven_labs_api_key_present: !!payload.eleven_labs_api_key,
          eleven_labs_api_key_prefix:
            payload.eleven_labs_api_key?.substring(0, 10) || 'MISSING',
          kie_api_key_present: !!payload.kie_api_key,
          // Плоская форма: avatar_settings больше не разделён по сервисам,
          // сервис указан отдельным полем avatar_gen_service.
          avatar_gen_service: payload.avatar_gen_service,
          avatar_settings: {
            avatar_id: payload.avatar_settings.avatar_id,
            voice_id: payload.avatar_settings.voice_id,
            avatar_speech_length: payload.avatar_settings.avatar_speech.length,
            avatar_photo_url_present:
              !!payload.avatar_settings.avatar_photo_url,
            api_key_present: !!payload.avatar_settings.api_key,
          },
          intro_text_1: payload.intro_text_1.text,
          intro_text_2: payload.intro_text_2.text,
        })

        console.log('🔴 [STEP 6] CRITICAL: Payload voice_id:', {
          heygen: payload.avatar_settings.voice_id || null,
          hedra: payload.avatar_settings.voice_id || null,
        })
        console.log(
          '🔴 [STEP 6] CRITICAL: Payload eleven_labs_api_key:',
          secretFingerprint(payload.eleven_labs_api_key)
        )

        // ✅ СОХРАНЯЕМ TASK CONTEXT В STORE ПЕРЕД ОТПРАВКОЙ
        // Это гарантирует что webhook найдёт context даже если придёт раньше ожидаемого
        console.log('🔴 [STEP 6] Saving task to videoTaskStore...')
        const statusMessage = await ctx.reply(
          isRu
            ? '⏳ Отправляем запрос на render-server...'
            : '⏳ Sending request to render-server...'
        )

        videoTaskStore.saveTask(payload.job_id, {
          telegramId: telegramId,
          chatId: ctx.chat?.id || parseInt(telegramId),
          messageId: statusMessage.message_id,
          prompt: ctx.session.aiReelsRender.text || 'AI Reels generation',
          modelId: `ai-reels-${avatarService}`,
          duration: duration,
          createdAt: Date.now(),
          botName: ctx.botInfo?.username || undefined,
        })
        console.log('✅ [STEP 6] Task saved to videoTaskStore:', payload.job_id)

        logger.info('💾 [AI REELS RENDER] Task context saved before send', {
          telegramId,
          jobId: payload.job_id,
          botName: ctx.botInfo?.username,
          chatId: ctx.chat?.id,
          messageId: statusMessage.message_id,
        })

        console.log('🔴 [STEP 6] About to call sendRenderAvatarVideoEvent()...')
        const { eventId } = await sendRenderAvatarVideoEvent(payload)
        dispatched = true
        console.log('🔴 [STEP 6] Event sent! Event ID:', eventId)

        console.log('🔴 [STEP 6] Updating status message for user...')
        await ctx.telegram.editMessageText(
          ctx.chat?.id || parseInt(telegramId),
          statusMessage.message_id,
          undefined,
          isRu
            ? `✅ Запрос отправлен на render-server!\n\n` +
                `🔄 Event ID: ${eventId}\n` +
                `🎭 Сервис: ${avatarService === 'hedra' ? 'Hedra' : avatarService === 'fal' ? 'Fal (Fabric)' : 'HeyGen'}\n` +
                `⏱️ Ожидаемое время: 2-5 минут\n` +
                `📢 Вы получите уведомление когда видео будет готово\n\n` +
                `💰 Списано: ${estimatedCost}⭐\n` +
                `💳 Новый баланс: ${(currentBalance - estimatedCost).toFixed(2)}⭐`
            : `✅ Request sent to render-server!\n\n` +
                `🔄 Event ID: ${eventId}\n` +
                `🎭 Service: ${avatarService === 'hedra' ? 'Hedra' : avatarService === 'fal' ? 'Fal (Fabric)' : 'HeyGen'}\n` +
                `⏱️ Expected time: 2-5 minutes\n` +
                `📢 You will receive notification when video is ready\n\n` +
                `💰 Charged: ${estimatedCost}⭐\n` +
                `💳 New balance: ${(currentBalance - estimatedCost).toFixed(2)}⭐`
        )
        console.log('🔴 [STEP 6] Status message updated!')

        logger.info('✅ [AI REELS RENDER] Event sent successfully', {
          telegramId,
          eventId,
          avatarService,
          cost: estimatedCost,
        })

        console.log('🔴 [STEP 6] All done! Cleaning up...')
      } catch (error) {
        console.log('🔴🔴🔴 [STEP 6] CAUGHT ERROR IN SEND EVENT!')
        console.log('🔴 [STEP 6] Error:', error)
        console.log(
          '🔴 [STEP 6] Error message:',
          error instanceof Error ? error.message : String(error)
        )

        logger.error('❌ [AI REELS RENDER] Error sending event', { error })

        // Возврат средств при ошибке. Говорим человеку то, что
        // произошло: начисление может не пройти — updateUserBalance
        // при неудаче не бросает, а возвращает false.
        // Only a PRE-dispatch throw warrants a refund. If the job was already
        // dispatched and only the confirmation reply threw, the render job keeps
        // running and will deliver -- refunding here would mint. See #1331.
        if (!dispatched) {
          await refundAndTell({
            ctx,
            telegramId,
            amount: estimatedCost,
            description: 'Refund: AI Reels Render error',
            reason: {
              ru: 'Произошла ошибка при отправке запроса',
              en: 'An error occurred while sending the request',
            },
            isRu,
          })
        } else {
          logger.warn(
            '[RENDER] Post-dispatch reply threw; NOT refunding (render job owns its outcome)',
            { telegramId }
          )
        }
      }

      // Очистка сессии
      delete ctx.session.aiReelsRender

      return ctx.scene.leave()
    } catch (error) {
      console.log('🔴🔴🔴 [STEP 6] CAUGHT ERROR!')
      console.log('🔴 [STEP 6] Error:', error)
      console.log(
        '🔴 [STEP 6] Error message:',
        error instanceof Error ? error.message : String(error)
      )
      console.log(
        '🔴 [STEP 6] Error stack:',
        error instanceof Error ? error.stack : 'NO STACK'
      )

      logger.error('❌ [AI REELS RENDER] Step 6 ERROR', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        telegramId: ctx.from?.id,
      })

      const isRu = isRussianFromState(ctx)
      await ctx.reply(
        isRu
          ? '❌ Произошла критическая ошибка. Попробуйте позже.'
          : '❌ Critical error occurred. Try again later.'
      )
      return ctx.scene.leave()
    }
  }
)

// Обработчик кнопки отмены
aiReelsRenderWizard.leave(async ctx => {
  if (ctx.session) ctx.session.aiReelsRenderInProgress = false
})

aiReelsRenderWizard.action('ai_reels_cancel', async ctx => {
  try {
    // Best-effort. Telegram answers '400: query is too old and response
    // timeout expired' when somebody taps Cancel on yesterday's message, and
    // the unguarded await made that one customer action cost two things: the
    // cancel below never ran, so the person stayed in a paid wizard, and the
    // catch paged the owner about it.
    await ctx.answerCbQuery().catch(() => {})
    const isRu = isRussianFromState(ctx)

    logger.info('🎬 [AI REELS RENDER] User cancelled wizard', {
      telegramId: ctx.from?.id,
    })

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

    // Очистка сессии
    if (ctx.session.aiReelsRender) {
      delete ctx.session.aiReelsRender
    }

    await ctx.scene.leave()
  } catch (error) {
    // The reply above promises a menu; a Telegram rejection on it means the
    // person is gone (blocked, kicked, chat deleted) and there is nothing an
    // operator could do at 3am. A broken scene transition is ours and pages.
    if (isUserCausedTelegramError(error)) {
      logger.warn('[AI REELS RENDER] cancel: the customer is gone', {
        telegramId: ctx.from?.id,
        description: telegramErrorInfo(error).description,
      })
      return
    }
    logger.error('❌ [AI REELS RENDER] Error handling cancel', {
      error: error instanceof Error ? error.message : 'Unknown error',
      telegramId: ctx.from?.id,
    })
    return
  }

  /*
   * THE SENTENCE ABOVE NAMED A SCREEN THIS HANDLER NEVER SHOWED.
   *
   * The reply above (see the two-language literal in this handler) tells the
   * person the bot is returning to the main menu and sets remove_keyboard;
   * then the handler left the scene and stopped -- so somebody cancelling a
   * paid render was promised a menu and got a blank composer instead.
   * fluxKontextScene and aiPhotoshopScene already end their cancels with
   * showMainMenu; this one just did not.
   *
   * OUTSIDE THE TRY, ON PURPOSE. showMainMenu owns its own failure reporting
   * (navigation/helpers/menuKeyboard.ts logs at error and then retries the
   * reply, which rethrows), so calling it inside the try would route a
   * blocked customer's failed greeting into the catch above and page twice
   * for one person leaving. A menu that does not render is not an incident:
   * the scene is already left and the session already cleared.
   */
  await showMainMenu(ctx).catch(error => {
    logger.warn('[AI REELS RENDER] cancel: main menu was not shown', {
      telegramId: ctx.from?.id,
      description: telegramErrorInfo(error).description,
    })
  })
})

export default aiReelsRenderWizard
