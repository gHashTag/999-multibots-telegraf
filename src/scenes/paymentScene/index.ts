import { Markup, Scenes } from 'telegraf'
import { MyContext } from '@/interfaces'
import { isRussian } from '@/helpers'
import { handleSelectStars } from '@/handlers/handleSelectStars'
import { starAmounts } from '@/price/helpers/starAmounts'
import { handleBuySubscription } from '@/handlers/handleBuySubscription'
import { handleBuy } from '@/handlers'

export const paymentScene = new Scenes.BaseScene<MyContext>('paymentScene')

paymentScene.enter(async ctx => {
  console.log(
    '[PaymentScene] Entered scene. Session subscription:',
    ctx.session.subscription
  )
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

// Добавляем обработчик колбэка top_up_X непосредственно в сцену
paymentScene.action(/top_up_\d+/, async ctx => {
  try {
    console.log('[PaymentScene] Обработка callback top_up в сцене')
    const data = ctx.match[0]
    console.log('[PaymentScene] Callback data:', data)
    const isRu = isRussian(ctx)

    try {
      await ctx.answerCbQuery()
    } catch (e) {
      console.error('[PaymentScene] Ошибка при ответе на callback:', e)
    }

    await handleBuy({ ctx, data, isRu })
    console.log('[PaymentScene] Обработка callback top_up успешно завершена')
  } catch (error) {
    console.error('[PaymentScene] Ошибка обработки callback top_up:', error)
    const isRu = isRussian(ctx)
    await ctx.reply(
      isRu
        ? 'Произошла ошибка при обработке покупки звезд. Пожалуйста, попробуйте позже.'
        : 'An error occurred while processing star purchase. Please try again later.'
    )
  }
})

paymentScene.hears(['⭐️ Звездами', '⭐️ Stars'], async ctx => {
  console.log('[PaymentScene] Hears: ⭐️ Звездами triggered')
  const isRu = isRussian(ctx)
  const subscription = ctx.session.subscription
  console.log(
    '[PaymentScene] Hears: ⭐️ Звездами. Session subscription:',
    subscription
  )
  try {
    if (subscription) {
      if (['neurobase', 'neuroblogger', 'neurophoto'].includes(subscription)) {
        await handleBuySubscription({ ctx, isRu })
        await ctx.scene.leave()
        return
      } else if (subscription === 'stars') {
        await handleSelectStars({ ctx, isRu, starAmounts })
        return
      }
    } else {
      await handleSelectStars({ ctx, isRu, starAmounts })
      return
    }
    console.warn(
      '[PaymentScene] Hears: ⭐️ Звездами. Unknown state for subscription:',
      subscription
    )
    await ctx.scene.leave()
    return
  } catch (error) {
    console.error("[PaymentScene] Error in Hears '⭐️ Звездами':", error)
    await ctx.reply(
      isRu
        ? 'Ошибка обработки оплаты звездами.'
        : 'Error processing star payment.'
    )
    await ctx.scene.leave()
    return
  }
})

paymentScene.hears(['💳 Рублями', '💳 In rubles'], async ctx => {
  console.log('[PaymentScene] Hears: 💳 Рублями triggered')
  const isRu = isRussian(ctx)
  const subscription = ctx.session.subscription
  console.log(
    '[PaymentScene] Hears: 💳 Рублями. Session subscription:',
    subscription
  )
  try {
    if (
      [
        'neurobase',
        'neurophoto',
        'neuromeeting',
        'neuromentor',
        'neuroblogger',
      ].includes(subscription)
    ) {
      console.log(`[PaymentScene] Entering getEmailWizard for ${subscription}`)
      return ctx.scene.enter('getEmailWizard')
    } else if (subscription === 'stars') {
      console.log('[PaymentScene] Entering emailWizard for stars')
      await ctx.scene.enter('emailWizard')
      return
    } else {
      console.warn(
        '[PaymentScene] Hears: 💳 Рублями. Unknown or missing subscription:',
        subscription
      )
      await ctx.reply(
        isRu
          ? 'Сначала выберите подписку или пакет звезд для покупки.'
          : 'Please select a subscription or star package first.'
      )
      await ctx.scene.leave()
      return
    }
  } catch (error) {
    console.error("[PaymentScene] Error in Hears '💳 Рублями':", error)
    await ctx.reply(
      isRu
        ? 'Ошибка обработки оплаты рублями.'
        : 'Error processing ruble payment.'
    )
    await ctx.scene.leave()
    return
  }
})

paymentScene.hears(['🏠 Главное меню', '🏠 Main menu'], async ctx => {
  console.log('[PaymentScene] Hears: 🏠 Главное меню triggered')
  await ctx.scene.enter('menuScene')
  return
})
