import { Scenes } from 'telegraf'
import { MyContext } from '@/interfaces/telegram-bot.interface'
import { isRussianFromState, setUserLanguageInState } from '@/helpers/centralizedLanguage'
import { logger } from '@/utils/logger'

export const changeLanguageScene = new Scenes.BaseScene<MyContext>('changeLanguageScene')

changeLanguageScene.enter(async (ctx) => {
  const isRu = isRussianFromState(ctx)
  const telegramId = ctx.from?.id

  logger.info('🌐 [ChangeLanguage] Language selection screen opened', {
    telegramId,
    currentLanguage: isRu ? 'ru' : 'en'
  })

  const message = isRu
    ? '🌐 *Выберите язык / Choose language*\n\nВыберите предпочитаемый язык интерфейса:'
    : '🌐 *Choose language*\n\nSelect your preferred interface language:'

  const keyboard = {
    inline_keyboard: [
      [
        { text: '🇷🇺 Русский', callback_data: 'lang_ru' },
        { text: '🇺🇸 English', callback_data: 'lang_en' }
      ],
      [
        { text: '◀️ Назад', callback_data: 'back_to_menu' }
      ]
    ]
  }

  await ctx.reply(message, {
    parse_mode: 'Markdown',
    reply_markup: keyboard
  })
})

// Обработчики выбора языка
changeLanguageScene.action('lang_ru', async (ctx) => {
  const telegramId = ctx.from?.id

  try {
    logger.info('🌐 [ChangeLanguage] Russian language selected', { telegramId })

    await ctx.answerCbQuery()
    await setUserLanguageInState(ctx, 'ru')

    // Удаляем сообщение с выбором языка
    await ctx.deleteMessage()

    // Выходим из сцены
    await ctx.scene.leave()

    // Показываем главное меню с обновлённым языком
    const { showMainMenu } = await import('@/navigation')
    await showMainMenu(ctx)
  } catch (error) {
    logger.error('❌ [ChangeLanguage] Error setting Russian language:', {
      error,
      telegramId
    })
    await ctx.answerCbQuery('❌ Ошибка при смене языка')
  }
})

changeLanguageScene.action('lang_en', async (ctx) => {
  const telegramId = ctx.from?.id

  try {
    logger.info('🌐 [ChangeLanguage] English language selected', { telegramId })

    await ctx.answerCbQuery()
    await setUserLanguageInState(ctx, 'en')

    // Удаляем сообщение с выбором языка
    await ctx.deleteMessage()

    // Выходим из сцены
    await ctx.scene.leave()

    // Показываем главное меню с обновлённым языком
    const { showMainMenu } = await import('@/navigation')
    await showMainMenu(ctx)
  } catch (error) {
    logger.error('❌ [ChangeLanguage] Error setting English language:', {
      error,
      telegramId
    })
    await ctx.answerCbQuery('❌ Error changing language')
  }
})

changeLanguageScene.action('back_to_menu', async (ctx) => {
  await ctx.answerCbQuery()
  await ctx.scene.leave()
  const { showMainMenu } = await import('@/navigation')
  await showMainMenu(ctx)
})

export default changeLanguageScene
