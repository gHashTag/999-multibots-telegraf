import { MyContext } from '@/interfaces'

export const sendTutorialMessage = async (ctx: MyContext, isRu: boolean) => {
  const botName = ctx.botInfo.username
  console.log('botName', botName)

  if (botName === 'neuro_blogger_bot' || botName === 'ai_koshey_bot') {
    const postUrl = 'https://t.me/neuro_coder_ai/1212'

    console.log('📹 Отправляем видео-инструкцию... [Sending tutorial video]')

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
    console.log('🤖 Неверный бот')
  }
}
