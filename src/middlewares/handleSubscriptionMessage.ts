import { MyContext } from '@/types'
import { Markup } from 'telegraf'

export async function handleSubscriptionMessage(
  ctx: MyContext,
  language_code: string,
  telegram_channel_id: string
): Promise<void> {
  const message =
    language_code === 'ru'
      ? `❗️ВНИМАНИЕ\nВы видите это сообщение потому что не подписаны на канал ${telegram_channel_id}\n Группа нужна для того чтобы вы могли задать вопросы и получить помощь. Пожалуйста, подпишитесь на наш канал, чтобы продолжить использование бота и после нажатия на кнопку "Подписаться" вернитесь в бот и нажмите команду /start.`
      : `❗️ATTENTION\nYou see this message because you are not subscribed to the channel ${telegram_channel_id}\nThe group is needed so that you can ask questions and get help. Please subscribe to our channel to continue using the bot and after clicking the "Subscribe" button, return to the bot and click the /start command.`

  await ctx.reply(message, {
    reply_markup: Markup.inlineKeyboard([
      Markup.button.url(
        language_code === 'ru' ? 'Подписаться' : 'Subscribe',
        `https://t.me/${telegram_channel_id}`
      ),
    ]).reply_markup,
  })
}
