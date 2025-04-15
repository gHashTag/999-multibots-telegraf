import { Mode, MyContext, Subscription } from '../../interfaces'
import { sendGenericErrorMessage } from '@/menu'
import { levels, mainMenu } from '../../menu/mainMenu'
import { getReferalsCountAndUserData } from '@/core/supabase/getReferalsCountAndUserData'
import { isDev, isRussian } from '@/helpers'
import { sendReplyWithKeyboard } from './sendReplyWithKeyboard'
import { getText } from './getText'

import { WizardScene } from 'telegraf/scenes'

import { handleMenu } from '@/handlers'
import { checkFullAccess } from '@/handlers/checkFullAccess'
import { getTranslation } from '@/core'
import { sendTutorialMessage } from '@/handlers/sendTutorialMessage'
import { ModeEnum } from '@/price/helpers/modelsCost'

export const menuCommandStep = async (ctx: MyContext): Promise<void> => {
  console.log('CASE 📲: menuCommand')
  const isRu = isRussian(ctx)
  try {
    const telegram_id = ctx.from?.id?.toString() || ''

    let newCount = 0
    let newSubscription: Subscription
    let newLevel: number

    if (isDev) {
      console.log('CASE 🦄: isDev')
      newCount = 0
      newSubscription = 'neurobase'
      newLevel = 0
    } else {
      const { count, subscription, level } =
        await getReferalsCountAndUserData(telegram_id)
      newCount = count
      newSubscription = subscription || 'stars'
      newLevel = level
    }

    console.log('newSubscription', newSubscription)
    const additionalButtons = [
      levels[100], // Пополнить баланс
      levels[101], // Баланс
      levels[102], // Пригласить друга
      levels[103], // Помощь
      levels[104], // Техподдержка
    ]

    const keyboardMarkup = mainMenu({
      isRu,
      inviteCount: newCount,
      subscription: newSubscription,
      ctx,
      level: newLevel,
      additionalButtons:
        newSubscription === 'neurophoto' ? additionalButtons : [],
    })

    // Проверка условий для отправки сообщения
    if (newLevel === 3 && newSubscription === 'neurophoto') {
      console.log('CASE: newLevel === 3 && newSubscription === neurophoto')
      const message = getText(isRu, 'mainMenu')
      console.log('message', message)
      await ctx.reply(message, { reply_markup: keyboardMarkup.reply_markup })
      return
    }

    // Проверка условий для отправки сообщения
    if (newSubscription === 'neurotester') {
      console.log('CASE: newSubscription === neurotester')
      const message = getText(isRu, 'mainMenu')
      console.log('message', message)
      await ctx.reply(message, { reply_markup: keyboardMarkup.reply_markup })
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

    console.log('nameStep 1', nameStep)
    const hasFullAccess = checkFullAccess(newSubscription)
    let message = ''

    if (!hasFullAccess) {
      console.log('CASE: !hasFullAccess - stars level')
      const { translation, url } = await getTranslation('digitalAvatar', ctx)

      message = translation
      const photo_url = url
      await sendReplyWithKeyboard(
        ctx,
        message,
        inlineKeyboard,
        keyboardMarkup.reply_markup,
        photo_url
      )
      await sendTutorialMessage(ctx, isRu)
    } else {
      const levelKeys: { [key: number]: Mode } = {
        0: ModeEnum.Subscribe,
        1: ModeEnum.DigitalAvatarBody,
        2: ModeEnum.NeuroPhoto,
        3: ModeEnum.ImageToPrompt,
        4: ModeEnum.Avatar,
        5: ModeEnum.ChatWithAvatar,
        6: ModeEnum.SelectModel,
        7: ModeEnum.Voice,
        8: ModeEnum.TextToSpeech,
        9: ModeEnum.ImageToVideo,
        10: ModeEnum.TextToVideo,
        11: ModeEnum.TextToImage,
      }

      const key = levelKeys[newLevel + 1]
      console.log('key', key)
      if (key) {
        console.log(`CASE ${newLevel}: ${key}`)

        const { translation } = await getTranslation(key, ctx)
        await sendReplyWithKeyboard(
          ctx,
          translation,
          inlineKeyboard,
          keyboardMarkup.reply_markup
        )
      } else {
        console.log(`CASE: default ${newCount}`)
        // const message = getText(isRu, 'mainMenu')
        // console.log('message', message)
        // await ctx.reply(message, { reply_markup: keyboard })
        ctx.wizard.next()
        return
      }
    }

    const finalKeyboardMarkup = mainMenu({
      isRu,
      inviteCount: newCount,
      subscription: newSubscription || 'stars',
      ctx,
      level: newLevel,
    })

    await ctx.reply(
      isRu
        ? `Ваш уровень: ${newLevel}/\n🌟 ${newCount}`
        : `Your level: ${newLevel}/\n🌟 ${newCount}`,
      {
        reply_markup: finalKeyboardMarkup.reply_markup,
      }
    )
  } catch (error) {
    console.error('Error in menuCommandStep:', error)
    await sendGenericErrorMessage(ctx, isRu, error as Error)
    ctx.scene.leave()
    throw error
  }
}

export const menuNextStep = async (ctx: MyContext): Promise<void> => {
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

    // Handle language selection
    const isRu = isRussian(ctx)
    if (text === '🌐 Выбор языка' || text === '🌐 Language') {
      await ctx.scene.enter('languageScene')
      return
    }

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
