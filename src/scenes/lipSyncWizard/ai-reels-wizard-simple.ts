/**
 * 🎬 AI REELS WIZARD - ПРОСТАЯ ВЕРСИЯ
 * Шаблон 1 - Lip-sync в кружочке
 *
 * Процесс:
 * 1. Фото лица
 * 2. Фоновое видео
 * 3. Текст
 * 4. Генерация lip-sync
 */

import { Scenes, Markup } from 'telegraf'
import { MyContext } from '@/interfaces'
import { isRussianFromState } from '@/helpers/centralizedLanguage'
import { logger } from '@/utils/logger'

console.log('🎬 [SIMPLE] ИМПОРТ ВЫПОЛНЕН - ai-reels-wizard-simple.ts загружен!')

export const aiReelsWizardSimple = new Scenes.WizardScene<MyContext>(
  'ai_reels_wizard_simple',

  // Step 0: Запрос фото
  async ctx => {
    const isRu = isRussianFromState(ctx)
    const telegramId = ctx.from?.id?.toString()

    console.log('🎬 [SIMPLE] Step 0 STARTED - ПРОСТОЙ WIZARD АКТИВИРОВАН!')
    console.log('🎬 [SIMPLE] Scene ID:', ctx.scene?.current?.id)

    if (!telegramId) {
      return ctx.scene.leave()
    }

    // Инициализация session
    ctx.session.simpleLipsync = {
      step: 'photo',
      startTime: Date.now(),
    }

    await ctx.reply(
      isRu
        ? '🎬 Шаблон 1 - Lip-sync в кружочке\n\n📷 Шаг 1: Отправьте фото лица для lip-sync'
        : '🎬 Template 1 - Lip-sync in Circle\n\n📷 Step 1: Send a photo of face for lip-sync'
    )

    console.log('🎬 [SIMPLE] Step 0 - PHOTO REQUESTED')
    return ctx.wizard.next()
  },

  // Step 1: Получение фото
  async ctx => {
    const isRu = isRussianFromState(ctx)
    const telegramId = ctx.from?.id?.toString()

    console.log('📷 [SIMPLE] Step 1 STARTED - ПОЛУЧЕНИЕ ФОТО')
    console.log('📷 [SIMPLE] Scene ID:', ctx.scene?.current?.id)

    if (!telegramId) {
      return ctx.scene.leave()
    }

    // Проверяем фото
    const photo = (ctx.message as any)?.photo?.[0]
    if (!photo) {
      await ctx.reply(
        isRu
          ? '❌ Это не фото. Пожалуйста, отправьте фото.'
          : '❌ This is not a photo. Please send a photo.'
      )
      return
    }

    // Сохраняем фото
    const photoUrl = await ctx.telegram.getFileLink(photo.file_id)
    ctx.session.simpleLipsync.photoUrl = photoUrl.href
    ctx.session.simpleLipsync.step = 'video'

    console.log('📷 [SIMPLE] PHOTO RECEIVED')

    await ctx.reply(
      isRu
        ? '✅ Фото получено!\n\n📹 Шаг 2: Отправьте видео (фон до 30 сек)'
        : '✅ Photo received!\n\n📹 Step 2: Send video (background up to 30 sec)'
    )

    console.log('📷 [SIMPLE] Step 1 - VIDEO REQUESTED')
    return ctx.wizard.next()
  },

  // Step 2: Получение видео
  async ctx => {
    const isRu = isRussianFromState(ctx)
    const telegramId = ctx.from?.id?.toString()

    console.log('📹 [SIMPLE] Step 2 STARTED - ПОЛУЧЕНИЕ ВИДЕО')
    console.log('📹 [SIMPLE] Scene ID:', ctx.scene?.current?.id)

    if (!telegramId) {
      return ctx.scene.leave()
    }

    // Проверяем видео
    const video = (ctx.message as any)?.video
    if (!video) {
      await ctx.reply(
        isRu
          ? '❌ Это не видео. Пожалуйста, отправьте видео.'
          : '❌ This is not a video. Please send a video.'
      )
      return
    }

    // Сохраняем видео
    const videoUrl = await ctx.telegram.getFileLink(video.file_id)
    ctx.session.simpleLipsync.videoUrl = videoUrl.href
    ctx.session.simpleLipsync.step = 'text'

    console.log('📹 [SIMPLE] VIDEO RECEIVED')

    await ctx.reply(
      isRu
        ? '✅ Видео получено!\n\n✍️ Шаг 3: Введите текст для lip-sync'
        : '✅ Video received!\n\n✍️ Step 3: Enter text for lip-sync'
    )

    console.log('📹 [SIMPLE] Step 2 - TEXT REQUESTED')
    return ctx.wizard.next()
  },

  // Step 3: Получение текста
  async ctx => {
    const isRu = isRussianFromState(ctx)
    const telegramId = ctx.from?.id?.toString()

    console.log('✍️ [SIMPLE] Step 3 STARTED - ПОЛУЧЕНИЕ ТЕКСТА')
    console.log('✍️ [SIMPLE] Scene ID:', ctx.scene?.current?.id)

    if (!telegramId) {
      return ctx.scene.leave()
    }

    // Проверяем текст
    const text = (ctx.message as any)?.text
    if (!text) {
      await ctx.reply(
        isRu
          ? '❌ Это не текст. Пожалуйста, введите текст.'
          : '❌ This is not text. Please enter text.'
      )
      return
    }

    // Сохраняем текст
    ctx.session.simpleLipsync.text = text
    ctx.session.simpleLipsync.step = 'generate'

    console.log('✍️ [SIMPLE] TEXT RECEIVED:', text.substring(0, 50))

    await ctx.reply(
      isRu
        ? `✅ Текст сохранен!\n\n"${text.substring(0, 50)}..."\n\n🎬 Начинаю создание lip-sync...`
        : `✅ Text saved!\n\n"${text.substring(0, 50)}..."\n\n🎬 Starting lip-sync creation...`
    )

    console.log('✍️ [SIMPLE] Step 3 - GOING TO STEP 4')
    return ctx.wizard.next()
  },

  // Step 4: Генерация lip-sync
  async ctx => {
    const isRu = isRussianFromState(ctx)
    const telegramId = ctx.from?.id?.toString()

    console.log('🎬 [SIMPLE] Step 4 STARTED - ГЕНЕРАЦИЯ LIP-SYNC!')
    console.log('🎬 [SIMPLE] Scene ID:', ctx.scene?.current?.id)
    console.log('🎬 [SIMPLE] Session:', ctx.session.simpleLipsync)

    if (!telegramId) {
      return ctx.scene.leave()
    }

    await ctx.reply(
      isRu
        ? '✅ СИНХРОНИЗАЦИЯ ГУБ ГОТОВА!\n\nЭто тестовая версия. В реальной версии здесь будет Fal.ai lip-sync.'
        : '✅ LIP-SYNC READY!\n\nThis is test version. Real version will have Fal.ai lip-sync.'
    )

    console.log('🎬 [SIMPLE] Step 4 COMPLETED - ПРОСТОЙ WIZARD РАБОТАЕТ!')

    return ctx.scene.leave()
  },
)
