import { MyContext } from '@/interfaces'

export const sendTutorialMessage = async (ctx: MyContext, isRu: boolean) => {
  const botName = ctx.botInfo.username
  console.log('🤖 Bot name detected:', botName)

  const BOT_URLS = {
    MetaMuse_Manifest_bot: 'https://t.me/MetaMuse_manifestation/16',
    neuro_blogger_bot: 'https://t.me/neuro_coder_ai/1212',
    ai_koshey_bot: 'https://t.me/neuro_coder_ai/1212',
  }

  if (Object.keys(BOT_URLS).includes(botName)) {
    const postUrl = BOT_URLS[botName as keyof typeof BOT_URLS]
    console.log('📤 Отправляем ссылку:', postUrl)

    await ctx.reply(
      isRu
        ? '🎥 Смотри видео-инструкцию и узнай, как:\n- Создать цифрового двойника за 4 шага\n- Генерировать нейрофото из текста\n- Стать цифровым художником без навыков!'
        : '🎥 Watch tutorial and learn how to:\n- Create a digital twin in 4 steps\n- Generate a neural photo from text\n- Become a digital artist without skills!',
      {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: isRu
                  ? '🎬 Посмотреть видео-инструкцию'
                  : '🎬 Watch tutorial',
                url: postUrl,
              },
            ],
          ],
        },
        parse_mode: 'Markdown',
      }
    )
  } else {
    console.log('🚫 Бот не найден в списке разрешенных:', botName)
  }
}
