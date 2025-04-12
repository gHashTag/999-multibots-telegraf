import { MyContext } from '@/interfaces'
import { Markup, Scenes } from 'telegraf'
import {
  checkPaymentStatus,
  getReferalsCountAndUserData,
  getTranslation,
} from '@/core/supabase'
import { mainMenuButton } from '@/menu/mainMenu'
import { BOT_URLS } from '@/core/bot'
import { ModeEnum } from '@/interfaces/modes'
import { logger } from '@/utils/logger'

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
  ModeEnum.StartScene,
  async ctx => {
    try {
      const isRu = ctx.from?.language_code === 'ru'
      const { translation } = await getTranslation('start', ctx)

      // Отправляем только текстовое сообщение, без фото
      await ctx.reply(
        translation ||
          (isRu
            ? '🤖 Привет! Я ваш помощник с технологиями нейросетей. Давайте начнем!'
            : "🤖 Hello! I am your assistant with neural network technologies. Let's get started!"),
        {
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
        }
      )

      await sendTutorialMessage(ctx, isRu)

      ctx.wizard.next()
    } catch (error) {
      logger.error({
        message: '❌ Ошибка в сцене старта',
        description: 'Error in start scene',
        error: error instanceof Error ? error.message : String(error),
      })

      // Запасной вариант, если произошла ошибка
      const isRu = ctx.from?.language_code === 'ru'
      await ctx.reply(
        isRu
          ? '🤖 Привет! Добро пожаловать в нейросистему. Нажмите кнопку ниже, чтобы продолжить.'
          : '🤖 Hello! Welcome to the neural system. Press the button below to continue.',
        {
          reply_markup: Markup.keyboard([
            [
              Markup.button.text(
                isRu ? mainMenuButton.title_ru : mainMenuButton.title_en
              ),
            ],
          ])
            .resize()
            .oneTime().reply_markup,
        }
      )
      ctx.wizard.next()
    }
  },
  async (ctx: MyContext) => {
    const isRu = ctx.from?.language_code === 'ru'
    const telegram_id = ctx.from?.id?.toString() || ''
    const { subscription, isExist } =
      await getReferalsCountAndUserData(telegram_id)
    console.log('isExist', isExist)
    if (!isExist) {
      await ctx.scene.enter(ModeEnum.CreateUserScene)
      return
    }
    const telegramId = ctx.from?.id.toString()
    if (!telegramId) {
      await ctx.reply(
        isRu
          ? '❌ Ошибка: не удалось получить ID пользователя'
          : '❌ Error: User ID not found'
      )
      return ctx.scene.leave()
    }
    if (!subscription) {
      await ctx.scene.enter('subscriptionScene')
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
