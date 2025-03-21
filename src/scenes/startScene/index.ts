import { MyContext } from '@/interfaces'
import { Markup, Scenes } from 'telegraf'
import {
  checkPaymentStatus,
  getReferalsCountAndUserData,
  getTranslation,
} from '@/core/supabase'
import { mainMenuButton } from '@/menu/mainMenu'
import { BOT_URLS } from '@/core/bot'

async function sendTutorialMessage(ctx: MyContext, isRu: boolean) {
  const botName = ctx.botInfo.username
  let postUrl = ''
  console.log('postUrl', postUrl)
  if (Object.keys(BOT_URLS).includes(botName)) {
    postUrl = BOT_URLS[botName as keyof typeof BOT_URLS]
  } else {
    postUrl = BOT_URLS.neuro_blogger_bot
  }

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
}

export const startScene = new Scenes.WizardScene<MyContext>(
  'startScene',
  async ctx => {
    const isRu = ctx.from?.language_code === 'ru'
    const { translation, url } = await getTranslation({
      key: 'start',
      ctx,
    })

    await ctx.replyWithPhoto(url, {
      caption: translation,
      parse_mode: 'Markdown',
      reply_markup: Markup.keyboard([
        [
          Markup.button.text(
            isRu ? mainMenuButton.title_ru : mainMenuButton.title_en
          ),
        ],
      ])
        .resize()
        .oneTime().reply_markup,
    })

    await sendTutorialMessage(ctx, isRu)

    ctx.wizard.next()
  },
  async (ctx: MyContext) => {
    const telegram_id = ctx.from?.id?.toString() || ''
    const { subscription, isExist } = await getReferalsCountAndUserData(
      telegram_id
    )
    console.log('isExist', isExist)
    if (!isExist) {
      await ctx.scene.enter('createUserScene')
      return
    }
    const hasFullAccess = await checkPaymentStatus(ctx, subscription)
    if (hasFullAccess) {
      await ctx.scene.enter('menuScene')
    } else {
      await ctx.scene.enter('subscriptionScene')
    }
  }
)
