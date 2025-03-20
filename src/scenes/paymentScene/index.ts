import { Markup, Scenes } from 'telegraf'
import { MyContext } from '@/interfaces'
import { isRussian } from '@/helpers'
import { handleSelectStars } from '@/handlers/handleSelectStars'
import { starAmounts } from '@/price/helpers/starAmounts'
import { handleBuySubscription } from '@/handlers/handleBuySubscription'

export const paymentScene = new Scenes.BaseScene<MyContext>('paymentScene')

paymentScene.enter(async ctx => {
  const isRu = isRussian(ctx)
  try {
    const message = isRu ? 'Как вы хотите оплатить?' : 'How do you want to pay?'

    const keyboard = Markup.keyboard([
      [
        Markup.button.text(isRu ? '⭐️ Звездами' : '⭐️ Stars'),
        {
          text: isRu ? 'Что такое звезды❓' : 'What are stars❓',
          web_app: {
            url: `https://telegram.org/blog/telegram-stars/${
              isRu ? 'ru' : 'en'
            }?ln=a`,
          },
        },
      ],
      [
        Markup.button.text(isRu ? '💳 Рублями' : '💳 In rubles'),
        Markup.button.text(isRu ? '🏠 Главное меню' : '🏠 Main menu'),
      ],
    ]).resize()

    // Отправка сообщения с клавиатурой
    await ctx.reply(message, {
      reply_markup: keyboard.reply_markup,
    })
  } catch (error) {
    console.error('Error in paymentScene.enter:', error)
    await ctx.reply(
      isRu
        ? 'Произошла ошибка. Пожалуйста, попробуйте снова.'
        : 'An error occurred. Please try again.'
    )
  }
})

paymentScene.hears(['⭐️ Звездами', '⭐️ Stars'], async ctx => {
  console.log('CASE 1: ⭐️ Звездами', ctx.match)
  const isRu = isRussian(ctx)
  const subscription = ctx.session.subscription
  console.log('CASE 1: ⭐️ Звездами: subscription', subscription)
  if (subscription) {
    if (subscription === 'neurobase') {
      await handleBuySubscription({ ctx, isRu })
      await ctx.scene.leave()
    } else if (subscription === 'neuromeeting') {
      await handleBuySubscription({ ctx, isRu })
      await ctx.scene.leave()
    } else if (subscription === 'neuroblogger') {
      await handleBuySubscription({ ctx, isRu })
      await ctx.scene.leave()
    } else if (subscription === 'neurotester') {
      await handleBuySubscription({ ctx, isRu })
      await ctx.scene.leave()
    } else if (subscription === 'neurophoto') {
      await handleBuySubscription({ ctx, isRu })
      await ctx.scene.leave()
    } else if (subscription === 'neuromentor') {
      await handleBuySubscription({ ctx, isRu })
      await ctx.scene.leave()
    } else if (subscription === 'stars') {
      await handleSelectStars({ ctx, isRu, starAmounts })
      await ctx.scene.leave()
    }
  } else {
    await handleSelectStars({ ctx, isRu, starAmounts })
    await ctx.scene.leave()
  }
})

paymentScene.hears(['💳 Рублями', '💳 In rubles'], async ctx => {
  console.log('CASE: 💳 Рублями', ctx.match)

  const subscription = ctx.session.subscription
  console.log('CASE 💳 Рублями: subscription', subscription)

  if (
    subscription === 'neurobase' ||
    subscription === 'neurophoto' ||
    subscription === 'neuromentor' ||
    subscription === 'neuromeeting' ||
    subscription === 'neuroblogger'
  ) {
    console.log('CASE: 📚 НейроБаза - getEmailWizard')
    ctx.scene.enter('getEmailWizard')
    return
  } else {
    console.log('CASE: 💳 Рублями - menuScene')
    await ctx.scene.enter('emailWizard')
    return
  }
})

paymentScene.hears(['🏠 Главное меню', '🏠 Main menu'], async ctx => {
  console.log('CASE: 🏠 Главное меню', ctx.match)
  await ctx.scene.enter('menuScene')
})
