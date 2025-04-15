import { Scenes, Markup } from 'telegraf'
import { MyContext } from '@/interfaces/telegram-bot.interface'
import { logger } from '@/utils/logger'
import {
  getUserLanguage,
  setUserLanguage,
  getSupportedLanguages,
} from '@/helpers/language'

export const languageScene = new Scenes.BaseScene<MyContext>('languageScene')

languageScene.enter(async ctx => {
  const currentLanguage = getUserLanguage(ctx)

  logger.info({
    message: '🌐 Language selection',
    description: 'User entered language selection scene',
    telegram_id: ctx.from?.id,
    current_language: currentLanguage,
  })

  await showLanguageMenu(ctx, currentLanguage)
})

languageScene.action(/^language:(.+)$/, async ctx => {
  try {
    const language = ctx.match[1]

    if (!getSupportedLanguages().includes(language)) {
      await ctx.answerCbQuery('Unsupported language')
      return
    }

    setUserLanguage(ctx, language)

    logger.info({
      message: '🌐 Language changed',
      description: `User changed language to ${language}`,
      telegram_id: ctx.from?.id,
      language,
    })

    const isRu = language === 'ru'

    await ctx.answerCbQuery(
      isRu ? 'Язык изменен на Русский' : 'Language set to English'
    )
    await showLanguageMenu(ctx, language)
  } catch (error) {
    logger.error({
      message: '❌ Error changing language',
      description: error instanceof Error ? error.message : String(error),
      telegram_id: ctx.from?.id,
    })

    await ctx.reply('Error changing language. Please try again.')
  }
})

languageScene.action('back_to_menu', async ctx => {
  await ctx.answerCbQuery()
  await ctx.scene.enter('menuScene')
})

/**
 * Helper function to show language selection menu
 */
async function showLanguageMenu(ctx: MyContext, currentLanguage: string) {
  const isRu = currentLanguage === 'ru'

  const message = isRu
    ? '🌐 <b>Выбор языка</b>\n\nВыберите предпочитаемый язык интерфейса:'
    : '🌐 <b>Language Selection</b>\n\nSelect your preferred interface language:'

  const keyboard = Markup.inlineKeyboard([
    [
      Markup.button.callback(
        `English ${currentLanguage === 'en' ? '✓' : ''}`,
        'language:en'
      ),
      Markup.button.callback(
        `Русский ${currentLanguage === 'ru' ? '✓' : ''}`,
        'language:ru'
      ),
    ],
    [
      Markup.button.callback(
        isRu ? '↩️ Назад в меню' : '↩️ Back to menu',
        'back_to_menu'
      ),
    ],
  ])

  // Edit message if callback query, send new message if entering scene
  if (ctx.callbackQuery) {
    await ctx.editMessageText(message, {
      parse_mode: 'HTML',
      reply_markup: keyboard.reply_markup,
    })
  } else {
    await ctx.reply(message, {
      parse_mode: 'HTML',
      reply_markup: keyboard.reply_markup,
    })
  }
}
