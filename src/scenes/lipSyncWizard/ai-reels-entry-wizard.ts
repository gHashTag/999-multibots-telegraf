/**
 * 🎬 AI REELS ENTRY WIZARD
 *
 * Точка входа для выбора метода генерации AI Reels
 * - Локальная генерация (lip-sync + WAN 2.5 + merging)
 * - Render Server (Hedra/HeyGen через Railway)
 */

import { Scenes, Markup } from 'telegraf'
import { MyContext } from '@/interfaces'
import { isRussianFromState } from '@/helpers/centralizedLanguage'
import { logger } from '@/utils/logger'

export const aiReelsEntryWizard = new Scenes.WizardScene<MyContext>(
  'ai_reels_entry',

  // Step 0: Выбор метода генерации
  async ctx => {
    console.log('🚀🚀🚀 [AI REELS ENTRY] STEP 0 EXECUTING!')
    const isRu = isRussianFromState(ctx)
    const telegramId = ctx.from?.id?.toString()

    console.log('🚀 [AI REELS ENTRY] Step 0 data:', {
      telegramId,
      hasFrom: !!ctx.from,
      updateType: ctx.updateType,
    })

    logger.info('🎬 [AI REELS ENTRY] Wizard started', {
      telegramId,
      function: 'aiReelsEntryWizard.step0',
    })

    if (!telegramId) {
      await ctx.reply(
        isRu ? '❌ Ошибка: не удалось определить ваш ID' : '❌ Error: could not determine your ID'
      )
      return ctx.scene.leave()
    }

    // Показываем выбор метода
    await ctx.reply(
      isRu
        ? '🎬 <b>AI Reels Generator</b>\n\n' +
          '🎯 Выберите метод генерации:\n\n' +
          '<b>🎬 Локальная генерация</b>\n' +
          '• Создадим lip-sync видео\n' +
          '• Добавим WAN 2.5 видео\n' +
          '• Склеим в единый ролик\n' +
          '• Все этапы локально\n\n' +
          '<b>🚀 Render Server (Premium)</b>\n' +
          '• Hedra - быстрая генерация (50⭐, 2-3 мин)\n' +
          '• HeyGen - премиум качество (100⭐, 4-5 мин)\n' +
          '• Профессиональная обработка\n' +
          '• Автоматические интро и обложки'
        : '🎬 <b>AI Reels Generator</b>\n\n' +
          '🎯 Choose generation method:\n\n' +
          '<b>🎬 Local Generation</b>\n' +
          '• Create lip-sync video\n' +
          '• Add WAN 2.5 video\n' +
          '• Merge into single reel\n' +
          '• All steps locally\n\n' +
          '<b>🚀 Render Server (Premium)</b>\n' +
          '• Hedra - fast generation (50⭐, 2-3 min)\n' +
          '• HeyGen - premium quality (100⭐, 4-5 min)\n' +
          '• Professional processing\n' +
          '• Automatic intros and covers',
      {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
          [Markup.button.callback(isRu ? '🎬 Локальная генерация' : '🎬 Local Generation', 'ai_reels_method_local')],
          [Markup.button.callback(isRu ? '🚀 Render Server' : '🚀 Render Server', 'ai_reels_method_render')],
        ]),
      }
    )

    console.log('🚀 [AI REELS ENTRY] Step 0 - About to call ctx.wizard.next()')
    // Переходим к Step 1 для обработки callback
    const result = ctx.wizard.next()
    console.log('🚀 [AI REELS ENTRY] Step 0 - ctx.wizard.next() returned:', result)
    return result
  },

  // Step 1: Обработка выбора метода и роутинг
  async ctx => {
    console.log('🚀🚀🚀 [AI REELS ENTRY] STEP 1 EXECUTING!')
    console.log('🚀 [AI REELS ENTRY] Step 1 update:', {
      hasUpdate: !!ctx.update,
      updateKeys: ctx.update ? Object.keys(ctx.update) : [],
      hasCallbackQuery: 'callback_query' in ctx.update,
      callbackData: 'callback_query' in ctx.update && 'data' in ctx.update.callback_query
        ? ctx.update.callback_query.data
        : 'NO DATA',
    })

    logger.info('🎬 [AI REELS ENTRY] Step 1 FUNCTION CALLED', {
      hasUpdate: !!ctx.update,
      updateKeys: ctx.update ? Object.keys(ctx.update) : [],
      hasCallbackQuery: 'callback_query' in ctx.update,
    })

    const isRu = isRussianFromState(ctx)
    const telegramId = ctx.from?.id?.toString()

    logger.info('🎬 [AI REELS ENTRY] Step 1 - Processing method selection', {
      telegramId,
      hasCallbackQuery: !!ctx.callbackQuery,
      hasCallbackInUpdate: 'callback_query' in ctx.update,
    })

    // Обрабатываем только callback_query
    if (!('callback_query' in ctx.update)) {
      await ctx.reply(
        isRu
          ? '❌ Пожалуйста, нажмите одну из кнопок.'
          : '❌ Please press one of the buttons.'
      )
      return // Остаемся в том же шаге
    }

    if (!telegramId) {
      await ctx.reply(
        isRu ? '❌ Ошибка: не удалось определить ваш ID' : '❌ Error: could not determine your ID'
      )
      return ctx.scene.leave()
    }

    const choice = 'data' in ctx.update.callback_query ? ctx.update.callback_query.data : ''

    logger.info('🎯 [AI REELS ENTRY] PROCESSING CALLBACK - choice extracted', {
      telegramId,
      choice,
    })

    await ctx.answerCbQuery()

    if (choice === 'ai_reels_method_local') {
      // Локальная генерация
      await ctx.editMessageText(
        isRu
          ? '✅ Выбрана локальная генерация!\n\n⏳ Переходим к настройке...'
          : '✅ Local generation selected!\n\n⏳ Proceeding to setup...'
      )

      // Переходим к локальному wizard
      await ctx.scene.enter('ai_reels_wizard')
      return
    } else if (choice === 'ai_reels_method_render') {
      // Render Server
      logger.info('🚀 [AI REELS ENTRY] Entering RENDER wizard', {
        telegramId,
        targetScene: 'ai_reels_render_wizard',
      })

      await ctx.editMessageText(
        isRu
          ? '✅ Выбран Render Server!\n\n⏳ Переходим к настройке...'
          : '✅ Render Server selected!\n\n⏳ Proceeding to setup...'
      )

      // Переходим к render wizard
      await ctx.scene.enter('ai_reels_render_wizard')

      logger.info('✅ [AI REELS ENTRY] Entered render wizard', {
        telegramId,
        currentScene: ctx.scene.current?.id,
      })

      return
    } else {
      // Неизвестный выбор
      await ctx.reply(
        isRu
          ? '❌ Неизвестная опция. Попробуйте еще раз.'
          : '❌ Unknown option. Try again.'
      )
      return ctx.scene.leave()
    }

    // Если не callback query, ждем
    await ctx.reply(
      isRu
        ? '❌ Пожалуйста, выберите метод генерации из кнопок выше.'
        : '❌ Please select generation method from buttons above.'
    )
    return ctx.scene.leave()
  }
)

export default aiReelsEntryWizard
