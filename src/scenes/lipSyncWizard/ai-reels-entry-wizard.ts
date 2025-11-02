/**
 * 🎬 AI REELS ENTRY WIZARD
 *
 * Точка входа для выбора метода генерации AI Reels
 * - Локальная генерация (lip-sync + Google Veo 3.1 + merging)
 * - Render Server (Hedra/HeyGen через Railway)
 */

import { Scenes, Markup } from 'telegraf'
import { MyContext } from '@/interfaces'
import { isRussianFromState } from '@/helpers/centralizedLanguage'
import { logger } from '@/utils/logger'
import { AI_REELS_TEMPLATES, AIReelsTemplate } from './ai-reels-templates'

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
        isRu
          ? '❌ Ошибка: не удалось определить ваш ID'
          : '❌ Error: could not determine your ID'
      )
      return ctx.scene.leave()
    }

    // Показываем выбор шаблона
    const template1 = AI_REELS_TEMPLATES[AIReelsTemplate.WAN25] // Шаблон 1 - Простой Lip-sync
    const template2 = AI_REELS_TEMPLATES[AIReelsTemplate.INNGEST] // Шаблон 2

    await ctx.reply(
      isRu
        ? '🎬 <b>ИИ Рилс — Выбор шаблона</b>\n\n' +
            '🎯 Выберите шаблон генерации:\n\n' +
            `<b>${template1.name.ru}</b>\n` +
            `${template1.description.ru}\n` +
            `${template1.features.ru.join('\n')}\n\n` +
            `<b>${template2.name.ru}</b>\n` +
            `${template2.description.ru}\n` +
            `${template2.features.ru.join('\n')}\n\n` +
            `⚠️ <i>Цена Шаблона 2 зависит от длины lip-sync видео</i>`
        : '🎬 <b>AI Reels - Template Selection</b>\n\n' +
            '🎯 Choose template:\n\n' +
            `<b>${template1.name.en}</b>\n` +
            `${template1.description.en}\n` +
            `${template1.features.en.join('\n')}\n\n` +
            `<b>${template2.name.en}</b>\n` +
            `${template2.description.en}\n` +
            `${template2.features.en.join('\n')}\n\n` +
            `⚠️ <i>Template 2 price depends on lip-sync video length</i>`,
      {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
          [
            Markup.button.callback(
              isRu
                ? `${template1.icon} ${template1.name.ru}`
                : `${template1.icon} ${template1.name.en}`,
              'ai_reels_template_wan25'
            ),
          ],
          [
            Markup.button.callback(
              isRu
                ? `${template2.icon} ${template2.name.ru}`
                : `${template2.icon} ${template2.name.en}`,
              'ai_reels_template_inngest'
            ),
          ],
        ]),
      }
    )

    console.log('🚀 [AI REELS ENTRY] Step 0 - About to call ctx.wizard.next()')
    // Переходим к Step 1 для обработки callback
    const result = ctx.wizard.next()
    console.log(
      '🚀 [AI REELS ENTRY] Step 0 - ctx.wizard.next() returned:',
      result
    )
    return result
  },

  // Step 1: Обработка выбора метода и роутинг
  async ctx => {
    console.log('🚀🚀🚀 [AI REELS ENTRY] STEP 1 EXECUTING!')
    console.log('🚀 [AI REELS ENTRY] Step 1 update:', {
      hasUpdate: !!ctx.update,
      updateKeys: ctx.update ? Object.keys(ctx.update) : [],
      hasCallbackQuery: 'callback_query' in ctx.update,
      callbackData:
        'callback_query' in ctx.update && 'data' in ctx.update.callback_query
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
      // Повторно показываем меню, чтобы пользователь мог нажать кнопки
      const template1 = AI_REELS_TEMPLATES[AIReelsTemplate.WAN25] // Шаблон 1 - Простой Lip-sync
      const template2 = AI_REELS_TEMPLATES[AIReelsTemplate.INNGEST] // Шаблон 2

      await ctx.reply(
        isRu
          ? '❌ Пожалуйста, выберите одну из предложенных моделей\n\n' +
              `<b>${template1.icon} ${template1.name.ru}</b> — ${template1.description.ru}\n\n` +
              `<b>${template2.icon} ${template2.name.ru}</b> — ${template2.description.ru}`
          : '❌ Please choose one of the models\n\n' +
              `${template1.icon} ${template1.name.en} — ${template1.description.en}\n\n` +
              `${template2.icon} ${template2.name.en} — ${template2.description.en}`,
        {
          parse_mode: 'HTML',
          ...Markup.inlineKeyboard([
            [
              Markup.button.callback(
                isRu
                  ? `${template1.icon} ${template1.name.ru}`
                  : `${template1.icon} ${template1.name.en}`,
                'ai_reels_template_wan25'
              ),
            ],
            [
              Markup.button.callback(
                isRu
                  ? `${template2.icon} ${template2.name.ru}`
                  : `${template2.icon} ${template2.name.en}`,
                'ai_reels_template_inngest'
              ),
            ],
          ]),
        }
      )
      return // Остаемся в том же шаге
    }

    if (!telegramId) {
      await ctx.reply(
        isRu
          ? '❌ Ошибка: не удалось определить ваш ID'
          : '❌ Error: could not determine your ID'
      )
      return ctx.scene.leave()
    }

    const choice =
      'data' in ctx.update.callback_query ? ctx.update.callback_query.data : ''

    logger.info('🎯 [AI REELS ENTRY] PROCESSING CALLBACK - choice extracted', {
      telegramId,
      choice,
    })

    await ctx.answerCbQuery()

    if (choice === 'ai_reels_template_wan25') {
      // Шаблон 1 - Простой Lip-sync
      await ctx.editMessageText(
        isRu
          ? '✅ Выбран Шаблон 1 - Простой Lip-sync!\n\n⏳ Переходим к настройке...'
          : '✅ Template 1 - Simple Lip-sync selected!\n\n⏳ Proceeding to setup...'
      )

      // Переходим к wizard для Шаблона 1
      await ctx.scene.enter('ai_reels_wizard')
      return
    } else if (choice === 'ai_reels_template_inngest') {
      // Шаблон 2
      logger.info('🎬 [AI REELS ENTRY] Entering Template 2 wizard', {
        telegramId,
        targetScene: 'ai_reels_render_wizard',
      })

      await ctx.editMessageText(
        isRu
          ? '✅ Выбран Шаблон 2!\n\n⏳ Переходим к настройке...'
          : '✅ Template 2 selected!\n\n⏳ Proceeding to setup...'
      )

      // ✅ ВАЖНО: Очищаем сессию wizard'а чтобы начать с Step 0
      delete ctx.session.aiReelsRender
      delete (ctx.session as any).__scenes

      // Переходим к render wizard (Inngest)
      await ctx.scene.enter('ai_reels_render_wizard')

      logger.info('✅ [AI REELS ENTRY] Entered Inngest template wizard', {
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
