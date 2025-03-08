import { Markup, Scenes } from 'telegraf'
import { MyContext } from '../../interfaces'
import { handleMenu } from '@/handlers'
import { getTranslation } from '@/core/supabase'
import { isRussian } from '@/helpers'

export const subscriptionScene = new Scenes.WizardScene<MyContext>(
  'subscriptionScene',
  async ctx => {
    console.log('CASE: subscriptionScene', ctx)

    const { translation, buttons } = await getTranslation({
      key: 'subscriptionScene',
      ctx,
    })
    console.log('buttons', buttons)
    // Формируем клавиатуру на основе кнопок
    const keyboardRows = []
    buttons.forEach(button => {
      const row = button.row || 0
      if (!keyboardRows[row]) {
        keyboardRows[row] = []
      }

      keyboardRows[row].push({
        text: button.text,
        callback_data: button.callback_data,
      })
    })

    // Очистка от пустых элементов
    const cleanedKeyboardRows = keyboardRows.filter(
      row => row && row.length > 0
    )
    const isRu = isRussian(ctx)

    // Если нет кнопок совсем, добавляем кнопку "Назад"
    if (cleanedKeyboardRows.length === 0) {
      cleanedKeyboardRows.push([
        {
          text: isRu ? '🏠 Главное меню' : '🏠 Main menu',
          callback_data: 'mainmenu',
        },
      ])
    }

    const inlineKeyboard = Markup.inlineKeyboard(cleanedKeyboardRows)

    await ctx.reply(translation, {
      reply_markup: inlineKeyboard.reply_markup,
      parse_mode: 'Markdown',
    })

    return ctx.wizard.next()
  },
  async ctx => {
    console.log('CASE: subscriptionScene.next', ctx)
    if ('callback_query' in ctx.update && 'data' in ctx.update.callback_query) {
      const text = ctx.update.callback_query.data
      console.log('text', text)
      if (text === 'neurobase') {
        console.log('CASE: 📚 НейроБаза')
        ctx.session.subscription = 'neurobase'
        return ctx.scene.enter('paymentScene')
      } else if (text === 'neuromeeting') {
        console.log('CASE: 🧠 НейроВстреча')
        ctx.session.subscription = 'neuromeeting'
        return ctx.scene.enter('paymentScene')
      } else if (text === 'neuroblogger') {
        console.log('CASE: 🤖 НейроБлогер')
        ctx.session.subscription = 'neuroblogger'
        return ctx.scene.enter('paymentScene')
      } else if (text === 'neurophoto') {
        console.log('CASE: 🎨 НейроФото')
        ctx.session.subscription = 'neurophoto'
        return ctx.scene.enter('paymentScene')
      } else if (text === 'neuromentor') {
        console.log('CASE: 🧠 НейроМентор')
        ctx.session.subscription = 'neuromentor'
        return ctx.scene.enter('paymentScene')
      } else if (text === 'mainmenu') {
        console.log('CASE: 🏠 Главное меню')
        return ctx.scene.enter('menuScene')
      } else {
        console.warn('Unknown subscription type:', text)
        await ctx.reply(
          'Неизвестный тип подписки. Пожалуйста, выберите другой вариант.'
        )
      }
    } else {
      handleMenu(ctx)
      return ctx.scene.leave()
    }
  }
)
