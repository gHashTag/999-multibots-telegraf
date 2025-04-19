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
import { SubscriptionType } from '@/interfaces/subscription.interface'

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
    logger.info('➡️ [StartScene Step 1] Entered scene', {
      userId: ctx.from?.id,
    })
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

      logger.info('➡️ [StartScene Step 1] Sending tutorial message...')
      await sendTutorialMessage(ctx, isRu)

      logger.info('➡️ [StartScene Step 1] Moving to next step...')
      ctx.wizard.next()
    } catch (error) {
      logger.error('💥 [StartScene Step 1] Error:', {
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
      logger.info('➡️ [StartScene Step 1] Moving to next step after error...')
      ctx.wizard.next()
    }
  },
  async (ctx: MyContext) => {
    logger.info('➡️ [StartScene Step 2] Entered step', { userId: ctx.from?.id })
    const isRu = ctx.from?.language_code === 'ru'
    const telegram_id = ctx.from?.id?.toString() || ''
    logger.info('➡️ [StartScene Step 2] Calling getReferalsCountAndUserData...')
    const { userData, isExist } = await getReferalsCountAndUserData(telegram_id)
    logger.info(
      '➡️ [StartScene Step 2] Result from getReferalsCountAndUserData',
      { isExist, subscription: userData?.subscription }
    )
    console.log('isExist', isExist)
    if (!isExist) {
      logger.info(
        '➡️ [StartScene Step 2] User does not exist. Intending to enter CreateUserScene...'
      )
      await ctx.scene.enter(ModeEnum.CreateUserScene)
      return
    }
    const telegramId = ctx.from?.id.toString()
    if (!telegramId) {
      logger.error('💥 [StartScene Step 2] Telegram ID not found')
      await ctx.reply(
        isRu
          ? '❌ Ошибка: не удалось получить ID пользователя'
          : '❌ Error: User ID not found'
      )
      logger.info('➡️ [StartScene Step 2] Leaving scene due to missing ID...')
      return ctx.scene.leave()
    }
    if (!userData?.subscription) {
      logger.info(
        '➡️ [StartScene Step 2] User has no subscription. Intending to enter SubscriptionScene...'
      )
      await ctx.scene.enter(ModeEnum.SubscriptionScene)
      return
    }
    if (userData.subscription === SubscriptionType.STARS) {
      logger.info(
        '➡️ [StartScene Step 2] User has STARS subscription. Intending to enter SubscriptionScene...'
      )
      await ctx.scene.enter(ModeEnum.SubscriptionScene)
      return
    }
    logger.info('➡️ [StartScene Step 2] Checking payment status...')
    const hasFullAccess = await checkPaymentStatus(ctx, userData.subscription)
    logger.info('➡️ [StartScene Step 2] Payment status check result', {
      hasFullAccess,
    })
    if (hasFullAccess) {
      logger.info(
        '➡️ [StartScene Step 2] User has full access. Intending to enter MainMenu...'
      )
      await ctx.scene.enter(ModeEnum.MainMenu)
    } else {
      logger.info(
        '➡️ [StartScene Step 2] User does not have full access. Intending to enter SubscriptionScene...'
      )
      await ctx.scene.enter(ModeEnum.SubscriptionScene)
    }
  }
)
