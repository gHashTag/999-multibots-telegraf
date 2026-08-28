import { Scenes } from 'telegraf'
import { getReferalsCountAndUserData } from '../../core/supabase'
import { MyContext } from '../../interfaces'
import { ModeEnum } from '@/interfaces/modes'
import { isRussianFromState } from '@/helpers/centralizedLanguage'
import { REFERRAL_BONUS_STARS } from '@/core/referral/rewardInviter'

export const inviteScene = new Scenes.BaseScene<MyContext>('inviteScene')

inviteScene.enter(async ctx => {
  const isRu = isRussianFromState(ctx)

  const botUsername = ctx.botInfo.username
  const telegram_id = ctx.from?.id?.toString() || ''

  try {
    const { count } = await getReferalsCountAndUserData(telegram_id)

    // Обещаем ровно то, что выполняем.
    //
    // Прежний текст обещал три вещи: бонусные звёзды, доступ к эксклюзивным
    // функциям и повышение уровня. Проверено по данным: наград за приглашение
    // в реестре платежей НЕТ НИ ОДНОЙ (17 136 строк), а `level` равен нулю у
    // 2351 профиля из 2354. Не выполнялась ни одна из трёх.
    //
    // Теперь про звёзды написано, только если награда включена
    // (REFERRAL_BONUS_STARS), и названа настоящая сумма.
    const bonus = REFERRAL_BONUS_STARS
    const rewardLine =
      bonus > 0
        ? isRu
          ? `\n\n🎁 За каждого друга, который запустит бота по вашей ссылке, вы получаете ${bonus} звёзд.`
          : `\n\n🎁 For every friend who starts the bot via your link you get ${bonus} stars.`
        : ''

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
