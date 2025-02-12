import { MyContext, Subscription } from '../../interfaces'
import { sendGenericErrorMessage } from '@/menu'
import { levels, mainMenu } from '../../menu/mainMenu'
import { getReferalsCountAndUserData } from '@/core/supabase/getReferalsCountAndUserData'
import { isDev, isRussian } from '@/helpers'
import { sendReplyWithKeyboard } from './sendReplyWithKeyboard'
import { getText } from './getText'

import { WizardScene } from 'telegraf/scenes'
import { getPhotoUrl } from '@/handlers/getPhotoUrl'

import { handleMenu } from '@/handlers'
import { checkFullAccess } from '@/handlers/checkFullAccess'

const menuCommandStep = async (ctx: MyContext) => {
  console.log('CASE 📲: menuCommand')
  const isRu = isRussian(ctx)
  try {
    const telegram_id = ctx.from?.id?.toString() || ''
    let newCount = 0
    let newSubscription: Subscription = 'stars'
    console.log('CASE: ctx.session', ctx.session)
    if (isDev) {
      newCount = 0
      newSubscription = 'neurobase'
    } else {
      const { count, subscription } = await getReferalsCountAndUserData(
        telegram_id
      )
      newCount = count
      newSubscription = subscription
    }

    const keyboard = await mainMenu({
      isRu,
      inviteCount: newCount,
      subscription: newSubscription,
      ctx,
    })

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

    switch (true) {
      case !hasFullAccess: {
        console.log('CASE: !hasFullAccess')
        message = getText(isRu, 'digitalAvatar')
        const photo_url = getPhotoUrl(ctx, 1)
        await sendReplyWithKeyboard(
          ctx,
          message,
          inlineKeyboard,
          keyboard,
          photo_url
        )
        break
      }

      case nameStep === (isRu ? levels[2].title_ru : levels[2].title_en): {
        console.log('CASE: neurophoto')
        message = getText(isRu, 'neurophoto', newCount)
        await sendReplyWithKeyboard(ctx, message, inlineKeyboard, keyboard)
        break
      }
      // TODO: Добавить аватарку и текст для первого уровня
      // case newCount === 1: {
      //   console.log('CASE: avatarLevel')
      //   message = getText(isRu, 'avatarLevel', newCount)
      //   const photo_url = getPhotoUrl(ctx, 2)
      //   await sendReplyWithKeyboard(
      //     ctx,
      //     message,
      //     inlineKeyboard,
      //     menu,
      //     photo_url
      //   )
      //   break
      // }

      // case newCount > 2 && newCount <= 10: {
      //   console.log('CASE: avatarLevel')
      //   message = getText(isRu, 'avatarLevel', newCount)

      //   const inlineKeyboardWithInvite = [
      //     ...inlineKeyboard,
      //     [{ text: getText(isRu, 'inviteLink'), callback_data: 'invite' }],
      //   ]

      //   await sendReplyWithKeyboard(
      //     ctx,
      //     message,
      //     inlineKeyboardWithInvite,
      //     menu
      //   )
      //   ctx.wizard.next()
      //   return
      // }

      default: {
        console.log(`CASE: default ${newCount}`)
        const message = getText(isRu, 'mainMenu')
        console.log('message', message)
        await ctx.reply(message, keyboard)
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
