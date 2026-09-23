import { Scenes } from 'telegraf'
import { getReferalsCountAndUserData } from '../../core/supabase'
import { MyContext } from '../../interfaces'
import { isRussianFromState } from '@/helpers/centralizedLanguage'
import { REFERRAL_BONUS_STARS } from '@/core/referral/rewardInviter'
import { REFERRAL_INVITED_BONUS_STARS } from '@/core/referral/rewardInvited'
import { buildRewardPromise } from './rewardPromise'

export const inviteScene = new Scenes.BaseScene<MyContext>('inviteScene')

inviteScene.enter(async ctx => {
  const isRu = isRussianFromState(ctx)

  const botUsername = ctx.botInfo.username
  const telegram_id = ctx.from?.id?.toString() || ''

  try {
    const { count } = await getReferalsCountAndUserData(telegram_id)

    // Promise exactly what gets delivered.
    //
    // The old text promised three things: bonus stars, access to exclusive
    // features and a level-up. Checked against the data: there is NOT ONE
    // referral reward in the payment ledger (17,136 rows), and `level` is zero
    // for 2,351 profiles out of 2,354. None of the three was ever delivered.
    //
    // The wording itself lives in `buildRewardPromise` so it can be tested for
    // what it produces rather than by matching the source of this file.
    const rewardLine = buildRewardPromise({
      isRu,
      inviterStars: REFERRAL_BONUS_STARS,
      invitedStars: REFERRAL_INVITED_BONUS_STARS,
    })

    const introText = isRu
      ? `🔗 Пригласите друга — отправьте ему эту ссылку.${rewardLine}\n\n<b>Приглашено:</b> ${count}`
      : `🔗 Invite a friend — send them this link.${rewardLine}\n\n<b>Invited:</b> ${count}`

    const linkText = `<a href="https://t.me/${botUsername}?start=${telegram_id}">https://t.me/${botUsername}?start=${telegram_id}</a>`

    await ctx.reply(introText, { parse_mode: 'HTML' })
    await ctx.reply(linkText, { parse_mode: 'HTML' })
    await ctx.scene.leave()
    const { showMainMenu } = await import('@/navigation')
    await showMainMenu(ctx)
  } catch (error) {
    console.error('Error fetching referral count:', error)
    await ctx.reply(
      isRu
        ? 'Произошла ошибка при получении данных о рефералах. Пожалуйста, попробуйте позже.'
        : 'An error occurred while fetching referral data. Please try again later.'
    )
  }
})

export default inviteScene
