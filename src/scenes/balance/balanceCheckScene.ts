import { Scenes } from 'telegraf'
import { MyContext } from '@/interfaces'
// Для тестирования:
import * as dbModule from '@/libs/database'

const getUserByTelegramIdString = dbModule.getUserByTelegramIdString

/**
 * Сцена для проверки текущего баланса пользователя
 */
export const balanceCheckScene = new Scenes.BaseScene<MyContext>(
  'balance-check'
)

balanceCheckScene.enter(async ctx => {
  try {
    const userId = ctx.from?.id
    if (!userId) {
      await ctx.reply('Error: User not found')
      return await ctx.scene.leave()
    }

    // Получаем информацию о пользователе
    const user = await getUserByTelegramIdString(userId.toString())

    if (!user) {
      await ctx.reply(
        'User not found in database. Please start the bot with /start command.'
      )
      return await ctx.scene.leave()
    }

    // Показываем информацию о балансе
    const balance = user.balance || 0

    // Определяем язык пользователя
    const isRu = user.is_ru || false

    if (ctx.chat) {
      await ctx.telegram.sendMessage(
        ctx.chat.id,
        isRu
          ? `💰 Ваш текущий баланс: *${balance} звезд*\n\nИспользуйте /topup чтобы пополнить баланс.`
          : `💰 Your current balance: *${balance} stars*\n\nUse /topup to add more stars to your balance.`,
        { parse_mode: 'Markdown' }
      )
    }

    await ctx.scene.leave()
  } catch (error) {
    console.error('Error in balance check scene:', error)
    await ctx.reply(
      'An error occurred while checking your balance. Please try again later.'
    )
    await ctx.scene.leave()
  }
})

// Позволяем пользователю выйти из сцены с помощью команды /cancel
balanceCheckScene.command('cancel', async ctx => {
  await ctx.reply('Balance check cancelled.')
  await ctx.scene.leave()
})

// Обработчик по умолчанию для любого текста
balanceCheckScene.on('text', async ctx => {
  await ctx.reply('Use /cancel to exit balance check.')
})
