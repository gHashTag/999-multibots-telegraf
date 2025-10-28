import { Scenes } from 'telegraf'
import { logger } from '@/utils/enhancedLogger'
import { getReferalsCountAndUserData } from '../../core/supabase'
import { MyContext } from '../../interfaces'
import { ModeEnum } from '@/interfaces/modes'
import { isRussianFromState } from '@/helpers/centralizedLanguage'

export const inviteScene = new Scenes.BaseScene<MyContext>('inviteScene')

inviteScene.enter(async ctx => {
  const isRu = isRussianFromState(ctx)

  const botUsername = ctx.botInfo.username
  const telegram_id = ctx.from?.id?.toString() || ''

  try {
    const { count } = await getReferalsCountAndUserData(telegram_id)

    const introText = isRu
      ? `🎁 Пригласите друга и откройте для себя новые возможности! Отправьте ему эту ссылку, и пусть он присоединится к нашему сообществу. 
      \nЧто вы получите?
      - Бонусные звезды для использования в боте.
      - Доступ к эксклюзивным функциям и возможностям.
      - Повышение уровня и доступ к новым функциям.
      \n<b>Рефаралы:</b> ${count}`
      : `🎁 Invite a friend and unlock new opportunities! Send them this link and let them join our community. 🎁 What do you get?
      - Bonus stars for use in the bot.
      - Access to exclusive features and capabilities.
      - Level up and access to new features.
      \n<b>Referrals:</b> ${count}`

    const linkText = `<a href="https://t.me/${botUsername}?start=${telegram_id}">https://t.me/${botUsername}?start=${telegram_id}</a>`

    await ctx.reply(introText, { parse_mode: 'HTML' })
    await ctx.reply(linkText, { parse_mode: 'HTML' })
    await ctx.scene.enter(ModeEnum.MainMenu)
  } catch (error) {
    logger.error('Error fetching referral count:', error)
    await ctx.reply(
      isRu
        ? 'Произошла ошибка при получении данных о рефералах. Пожалуйста, попробуйте позже.'
        : 'An error occurred while fetching referral data. Please try again later.'
    )
  }
})

export default inviteScene
