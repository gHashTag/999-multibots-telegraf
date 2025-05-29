import { MyContext } from '@/interfaces'
import { Markup } from 'telegraf'

export async function handleSubscriptionMessage(
  ctx: MyContext,
  language_code: string,
  telegram_channel_id: string
): Promise<void> {
  const message =
    language_code === 'ru'
      ? `🚫 ДОСТУП ОГРАНИЧЕН

❗️ Для продолжения работы с ботом необходимо оформить платную подписку

🎯 ЧТО ВЫ ПОЛУЧИТЕ:
• 💬 Полный доступ ко всем функциям бота
• 🔥 Неограниченное использование нейросетей
• 📢 Доступ к закрытому сообществу @${telegram_channel_id}
• 🤝 Общение с экспертами и единомышленниками
• 🎁 Эксклюзивные материалы и бонусы

💳 Оформите подписку для полного доступа!

👇 Нажмите /menu для выбора тарифа`
      : `🚫 ACCESS LIMITED

❗️ To continue using the bot, you need to get a paid subscription

🎯 WHAT YOU GET:
• 💬 Full access to all bot features
• 🔥 Unlimited use of neural networks
• 📢 Access to private community @${telegram_channel_id}
• 🤝 Communication with experts and like-minded people
• 🎁 Exclusive materials and bonuses

💳 Get a subscription for full access!

👇 Press /menu to choose a plan`

  await ctx.reply(message, {
    reply_markup: Markup.inlineKeyboard([
      [
        Markup.button.url(
          language_code === 'ru'
            ? '📢 Подписаться на канал'
            : '📢 Subscribe to Channel',
          `https://t.me/${telegram_channel_id}`
        ),
      ],
      [
        Markup.button.callback(
          language_code === 'ru'
            ? '💳 Оформить подписку'
            : '💳 Get Subscription',
          'go_to_subscription_scene'
        ),
      ],
    ]).reply_markup,
  })
}
