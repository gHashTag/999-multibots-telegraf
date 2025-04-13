/**
 * ⚠️⚠️⚠️ ВНИМАНИЕ! КРИТИЧЕСКИ ВАЖНЫЙ ФАЙЛ! ⚠️⚠️⚠️
 *
 * КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО МЕНЯТЬ МАРШРУТИЗАЦИЮ
 * БЕЗ СОГЛАСОВАНИЯ С ВЕДУЩИМ РАЗРАБОТЧИКОМ!
 *
 * Данный файл содержит корректную маршрутизацию всех
 * команд меню, нарушение которой может привести к
 * некорректной работе бота.
 */

import { MyContext } from '@/interfaces'
import { levels } from '@/menu/mainMenu'
import { isRussian } from '@/helpers/language'
import { priceCommand } from '@/commands/priceCommand'
import { handleTechSupport } from '@/commands/handleTechSupport'
import { mainMenuButton } from '@/menu/mainMenu'
import { get100Command } from '@/commands'
import { getStatsCommand } from '@/commands/stats'
import { ModeEnum } from '@/price/helpers/modelsCost'
import { logger } from '@/utils/logger'

const levelsInverse: Record<string, number> = {
  // ru
  '🤖 Цифровое тело': 1,
  '📸 Нейрофото': 2,
  '🔍 Промпт из фото': 3,
  '🧠 Мозг аватара': 4,
  '💭 Чат с аватаром': 5,
  '🤖 Выбор модели ИИ': 6,
  '🎤 Голос аватара': 7,
  '🎙️ Текст в голос': 8,
  '🎥 Фото в видео': 9,
  '🎥 Видео из текста': 10,
  '🖼️ Текст в фото': 11,
  '💎 Пополнить баланс': 100,
  '🤑 Баланс': 101,
  '👥 Пригласить друга': 102,
  '❓ Помощь': 103,
  '🛠 Техподдержка': 104,
  '💫 Оформить подписку': 105,
  '🌐 Выбор языка': 106,
  '🎙️ Аудио в текст': 12,

  // en
  '🤖 Digital Body': 1,
  '📸 NeuroPhoto': 2,
  '🔍 Prompt from Photo': 3,
  '🧠 Avatar Brain': 4,
  '💭 Chat with avatar': 5,
  '🤖 Choose AI Model': 6,
  '🎤 Avatar Voice': 7,
  '🎙️ Text to Voice': 8,
  '🎥 Photo to Video': 9,
  '🎥 Text to Video': 10,
  '🖼️ Text to Image': 11,
  '💎 Top up balance': 100,
  '🤑 Balance': 101,
  '👥 Invite a friend': 102,
  '❓ Help': 103,
  '🛠 Tech Support': 104,
  '💫 Subscribe': 105,
  '🌐 Language': 106,
  '🎙️ Audio to Text': 12,
}

// Функция, которая обрабатывает логику сцены
export async function handleMenu(ctx: MyContext) {
  if (!ctx.message || !('text' in ctx.message)) {
    return
  }

  const text = ctx.message.text
  const isRu = isRussian(ctx)

  // Get level from the menu text
  const level = levelsInverse[text]
  
  console.log(`MENU SELECTED: ${text} (Level: ${level})`)

  // Language command
  if (level === 106) {
    console.log('CASE 🌐: languageCommand')
    await ctx.scene.enter('languageScene')
    return
  }

  // Handle other menu options
  switch (level) {
    case 1:
      console.log('CASE: 🤖 Цифровое тело')
      await ctx.scene.enter(ModeEnum.SelectModelWizard)
      break
    case 2:
      console.log('CASE handleMenu: 📸 Нейрофото')
      logger.info({
        message: '📸 Выбрана команда Нейрофото из меню',
        description: 'NeuroPhoto command selected from menu',
        telegram_id: ctx.from?.id,
        should_enter: ModeEnum.SelectNeuroPhoto,
        action: 'Entering selection scene',
      })
      await ctx.scene.enter(ModeEnum.SelectNeuroPhoto)
      break
    case 3:
      console.log('CASE: 🔍 Промпт из фото')
      ctx.session.mode = ModeEnum.ImageToPrompt
      await ctx.scene.enter(ModeEnum.CheckBalanceScene)
      break
    case 4:
      console.log('CASE: 🧠 Мозг аватара')
      ctx.session.mode = ModeEnum.Avatar
      await ctx.scene.enter(ModeEnum.CheckBalanceScene)
      break
    case 5:
      console.log('CASE: 💭 Чат с аватаром')
      ctx.session.mode = ModeEnum.ChatWithAvatar
      await ctx.scene.enter(ModeEnum.CheckBalanceScene)
      break
    case 6:
      console.log('CASE: 🤖 Выбор модели ИИ')
      ctx.session.mode = ModeEnum.SelectModelWizard
      await ctx.scene.enter(ModeEnum.CheckBalanceScene)
      break
    case 7:
      console.log('CASE: 🎤 Голос аватара')
      ctx.session.mode = ModeEnum.Voice
      await ctx.scene.enter(ModeEnum.CheckBalanceScene)
      break
    case 8:
      console.log('CASE: 🎙️ Текст в голос')
      ctx.session.mode = ModeEnum.TextToSpeech
      await ctx.scene.enter(ModeEnum.CheckBalanceScene)
      break
    case 9:
      console.log('CASE: 🎥 Фото в видео')
      ctx.session.mode = ModeEnum.ImageToVideo
      await ctx.scene.enter(ModeEnum.CheckBalanceScene)
      break
    case 10:
      console.log('CASE:  Видео из текста')
      ctx.session.mode = ModeEnum.TextToVideo
      await ctx.scene.enter(ModeEnum.CheckBalanceScene)
      break
    case 11:
      console.log('CASE: 🖼️ Текст в фото')
      ctx.session.mode = ModeEnum.TextToImage
      await ctx.scene.enter(ModeEnum.CheckBalanceScene)
      break
    case 100:
      console.log('CASE: 💎 Пополнить баланс')
      ctx.session.mode = 'top_up_balance' as any
      await ctx.scene.enter('paymentScene')
      break
    case 101:
      console.log('CASE: 🤑 Баланс')
      ctx.session.mode = 'balance' as any
      await ctx.scene.enter(ModeEnum.BalanceScene)
      break
    case 102:
      console.log('CASE: 👥 Пригласить друга')
      ctx.session.mode = 'invite' as any
      await ctx.scene.enter('inviteScene')
      break
    case 103:
      console.log('CASE: ❓ Помощь')
      ctx.session.mode = 'help' as any
      await ctx.scene.enter('helpScene')
      break
    case 104:
      console.log('CASE: 🛠 Техподдержка')
      ctx.session.mode = 'tech' as any
      await handleTechSupport(ctx)
      break
    case 105:
      console.log('CASE: 💫 Оформление подписки')
      ctx.session.mode = 'subscribe' as any
      await ctx.scene.enter(ModeEnum.SubscriptionScene)
      break
    case 12:
      console.log('CASE: 🎙️ Аудио в текст')
      logger.info({
        message: '🎙️ Выбрана команда Аудио в текст из меню',
        description: 'Audio to Text command selected from menu',
        telegram_id: ctx.from?.id,
        action: 'Entering audio to text scene',
      })
      await ctx.scene.enter('audioToTextScene')
      return
    default:
      if (text === '/get100') {
        console.log('CASE: handleMenuCommand.100', text)
        await get100Command(ctx)
      } else {
        console.log('CASE: handleMenuCommand.else', text)
      }
  }
}

export default handleMenu
