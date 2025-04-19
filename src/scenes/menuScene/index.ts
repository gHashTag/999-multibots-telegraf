import { Mode, MyContext, Subscription } from '../../interfaces'
import { sendGenericErrorMessage } from '@/menu'
import { levels, mainMenu } from '../../menu/mainMenu'
import { getReferalsCountAndUserData } from '@/core/supabase'
import { isDev, isRussian } from '@/helpers'
import { sendReplyWithKeyboard } from './sendReplyWithKeyboard'
import { getText } from './getText'
import { SubscriptionType } from '@/interfaces/subscription.interface'
import { WizardScene } from 'telegraf/scenes'
import { getPhotoUrl } from '@/handlers/getPhotoUrl'

import { handleMenu } from '@/handlers'
import { checkFullAccess } from '@/handlers/checkFullAccess'
import { getTranslation } from '@/core'

const menuCommandStep = async (ctx: MyContext) => {
  console.log('CASE 📲: menuCommand')
  const isRu = isRussian(ctx)
  try {
    const telegram_id = ctx.from?.id?.toString() || ''

    let newCount = 0
    let newSubscription: SubscriptionType = SubscriptionType.STARS
    let newLevel: number

    if (isDev) {
      newCount = 0
      newSubscription = SubscriptionType.NEUROTESTER
      newLevel = 0
    } else {
      const { count, subscriptionType, level, userData } =
        await getReferalsCountAndUserData(telegram_id)
      newCount = count
      newSubscription = subscriptionType
      newLevel = level
    }

    // Фильтрация уровней для подписки neurophoto
    if (newSubscription === SubscriptionType.NEUROPHOTO && newLevel > 3) {
      newLevel = 3
    }

    const keyboard = await mainMenu({
      isRu,
      inviteCount: newCount,
      subscription: newSubscription,
      ctx,
      level: newLevel,
    })

    // Проверка условий для отправки сообщения
    if (newLevel === 3 && newSubscription === SubscriptionType.NEUROPHOTO) {
      const message = getText(isRu, 'mainMenu')
      console.log('message', message)
      await ctx.reply(message, keyboard)
      return
    }

    // Проверка условий для отправки сообщения
    if (newSubscription === SubscriptionType.NEUROTESTER) {
      const message = getText(isRu, 'mainMenu')
      console.log('message', message)
      await ctx.reply(message, keyboard)
      ctx.wizard.next()
      return
    }

    const url = `https://neuro-blogger-web-u14194.vm.elestio.app/neuro_sage/1/1/1/1/1/${
      newCount + 1
    }`

    const nextLevel = levels[newCount + 1]
    const nameStep = nextLevel
      ? isRu
        ? nextLevel.title_ru
        : nextLevel.title_en
      : isRu
      ? 'Неизвестный уровень'
      : 'Unknown level'

    const inlineKeyboard = [
      ...(newCount >= 1
        ? [
            [
              {
                text: isRu ? '🚀 Открыть нейроквест' : '🚀 Open neuroquest',
                web_app: { url },
              },
            ],
          ]
        : []),
    ]

    console.log('nameStep', nameStep)
    const hasFullAccess = checkFullAccess(newSubscription)
    let message = ''

    if (!hasFullAccess) {
      console.log('CASE: !hasFullAccess - stars level')
      message = getText(isRu, 'digitalAvatar')
      const photo_url = getPhotoUrl(ctx, 1)
      await sendReplyWithKeyboard(
        ctx,
        message,
        inlineKeyboard,
        keyboard,
        photo_url
      )
    } else {
      const levelKeys: { [key: number]: Mode } = {
        0: 'subscribe',
        1: 'digital_avatar_body',
        2: 'neuro_photo',
        3: 'image_to_prompt',
        4: 'avatar_brain',
        5: 'chat_with_avatar',
        6: 'select_model',
        7: 'voice',
        8: 'text_to_speech',
        9: 'image_to_video',
        10: 'text_to_video',
        11: 'text_to_image',
      }

      const key = levelKeys[newLevel + 1]
      console.log('key', key)
      if (key) {
        console.log(`CASE ${newLevel}: ${key}`)
        const { translation } = await getTranslation({
          key,
          ctx,
          bot_name: ctx.botInfo?.username,
        })
        await sendReplyWithKeyboard(ctx, translation, inlineKeyboard, keyboard)
      } else {
        console.log(`CASE: default ${newCount}`)
        // const message = getText(isRu, 'mainMenu')
        // console.log('message', message)
        // await ctx.reply(message, keyboard)
        ctx.wizard.next()
        return
      }
    }
  } catch (error) {
    console.error('Error in menu command:', error)
    await sendGenericErrorMessage(ctx, isRu, error)
    ctx.scene.leave()
    throw error
  }
}

const menuNextStep = async (ctx: MyContext) => {
  console.log('CASE 1: menuScene.next')
  if ('callback_query' in ctx.update && 'data' in ctx.update.callback_query) {
    const text = ctx.update.callback_query.data
    console.log('text 1', text)
    if (text === 'unlock_features') {
      console.log('CASE: 🔓 Разблокировать все функции')
      await ctx.scene.enter('subscriptionScene')
    }
  } else if ('message' in ctx.update && 'text' in ctx.update.message) {
    const text = ctx.update.message.text
    console.log('CASE menuNextStep: text 2', text)
    await handleMenu(ctx)
    return
  } else {
    console.log('CASE: menuScene.next.else')
  }
  ctx.scene.leave()
}

export const menuScene = new WizardScene(
  'menuScene',
  menuCommandStep,
  menuNextStep
)
