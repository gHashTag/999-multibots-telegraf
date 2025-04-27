import { Scenes, Markup } from 'telegraf'
import type { MyContext } from '../../interfaces'
import {
  handleLevel1,
  handleLevel2,
  handleLevel3,
  handleLevel4,
  handleLevel5,
  handleLevel6,
  handleLevel7,
  handleLevel8,
  handleLevel9,
  handleLevel10,
  handleLevel11,
  handleLevel12,
  handleLevel13,
} from '../../scenes/levelQuestWizard/handlers'
import { mainMenu } from '@/menu'

import { getReferalsCountAndUserData } from '@/core/supabase'
import { ModeEnum } from '@/interfaces/modes';

export const helpScene = new Scenes.BaseScene<MyContext>('help')

helpScene.enter(async ctx => {
  const mode = ctx.session.mode
  const isRu = ctx.from?.language_code === 'ru'
  const telegram_id = ctx.from.id.toString()
  // Убираем получение данных пользователя, если они не нужны для текста справки
  // const { count, subscriptionType, level } =
  //   await getReferalsCountAndUserData(telegram_id)

  let helpText = isRu ? 'Общая справка...' : 'General help...'
  let requiresLevelHandler = true // Флаг, нужно ли вызывать handleLevelX

  // Определяем текст справки и нужно ли вызывать обработчик уровня
  switch (mode) {
    case ModeEnum.DigitalAvatarBody:
      helpText = isRu
        ? 'Справка по Цифровому телу...'
        : 'Help for Digital Body...'
      // await handleLevel1(ctx) // Вызов обработчика перенесен
      break
    case ModeEnum.NeuroPhoto:
      helpText = isRu ? 'Справка по Нейрофото...' : 'Help for NeuroPhoto...'
      // await handleLevel2(ctx) // Вызов обработчика перенесен
      break
    case ModeEnum.ImageToPrompt:
      helpText = isRu
        ? 'Справка по Промпту из фото...'
        : 'Help for Prompt from Photo...'
      // await handleLevel3(ctx) // Вызов обработчика перенесен
      break
    case ModeEnum.Avatar:
      helpText = isRu
        ? 'Справка по Мозгу аватара...'
        : 'Help for Avatar Brain...'
      // await handleLevel4(ctx) // Вызов обработчика перенесен
      break
    case ModeEnum.ChatWithAvatar:
      helpText = isRu
        ? 'Справка по Чату с аватаром...'
        : 'Help for Chat with Avatar...'
      // await handleLevel5(ctx) // Вызов обработчика перенесен
      break
    case ModeEnum.SelectModel:
      helpText = isRu
        ? 'Справка по Выбору модели ИИ...'
        : 'Help for Choose AI Model...'
      // await handleLevel6(ctx) // Вызов обработчика перенесен
      break
    case ModeEnum.Voice:
      helpText = isRu
        ? 'Справка по Голосу аватара...'
        : 'Help for Avatar Voice...'
      // await handleLevel7(ctx) // Вызов обработчика перенесен
      break
    case ModeEnum.TextToSpeech:
      helpText = isRu
        ? 'Справка по Тексту в голос...'
        : 'Help for Text to Voice...'
      // await handleLevel8(ctx) // Вызов обработчика перенесен
      break
    case ModeEnum.ImageToVideo:
      helpText = isRu
        ? 'Справка по Фото в видео...'
        : 'Help for Photo to Video...'
      // await handleLevel9(ctx) // Вызов обработчика перенесен
      break
    case ModeEnum.TextToImage:
      helpText = isRu
        ? 'Справка по Тексту в фото...'
        : 'Help for Text to Image...'
      // await handleLevel10(ctx) // Вызов обработчика перенесен
      break
    case ModeEnum.TextToVideo:
      helpText = isRu
        ? 'Справка по Видео из текста...'
        : 'Help for Text to Video...'
      // await handleLevel11(ctx) // Вызов обработчика перенесен
      break
    case ModeEnum.ChangeSize:
      helpText = isRu
        ? 'Справка по Изменению размера...'
        : 'Help for Change Size...'
      // await handleLevel12(ctx) // Вызов обработчика перенесен
      break
    case ModeEnum.Invite:
      helpText = isRu
        ? 'Справка по Приглашению друга...'
        : 'Help for Invite a Friend...'
      // await handleLevel13(ctx) // Вызов обработчика перенесен
      break
    case ModeEnum.Help:
    default:
      // Для общей справки (ModeEnum.Help или неизвестный mode) не вызываем обработчик уровня
      requiresLevelHandler = false
      helpText = isRu
        ? '🤖 Общая справка по боту:\n\nВыберите интересующий раздел в главном меню.\nИспользуйте кнопки для навигации.\nКоманда /menu - возврат в главное меню.'
        : '🤖 General Bot Help:\n\nPlease select a section from the main menu.\nUse the buttons to navigate.\nCommand /menu - return to main menu.'
      break
  }

  // Отправляем текст справки С КНОПКОЙ НАЗАД
  await ctx.reply(
    helpText,
    Markup.inlineKeyboard([
      Markup.button.callback(
        isRu ? '⬅️ Назад' : '⬅️ Back',
        'leave_help' // Уникальный action для кнопки Назад
      ),
    ])
  )

  // Вызываем соответствующий handleLevelX ПОСЛЕ отправки сообщения,
  // если это требуется для конкретного режима (чтобы показать доп. информацию или кнопки)
  // ВНИМАНИЕ: Это может привести к отправке ДВУХ сообщений. Возможно, лучше интегрировать
  // логику handleLevelX прямо в switch-case выше, если она просто отправляет текст.
  // Пока оставляем так для совместимости, но это потенциальное место для рефакторинга.
  if (requiresLevelHandler) {
    switch (mode) {
      case ModeEnum.DigitalAvatarBody:
        await handleLevel1(ctx)
        break
      case ModeEnum.NeuroPhoto:
        await handleLevel2(ctx)
        break
      case ModeEnum.ImageToPrompt:
        await handleLevel3(ctx)
        break
      case ModeEnum.Avatar:
        await handleLevel4(ctx)
        break
      case ModeEnum.ChatWithAvatar:
        await handleLevel5(ctx)
        break
      case ModeEnum.SelectModel:
        await handleLevel6(ctx)
        break
      case ModeEnum.Voice:
        await handleLevel7(ctx)
        break
      case ModeEnum.TextToSpeech:
        await handleLevel8(ctx)
        break
      case ModeEnum.ImageToVideo:
        await handleLevel9(ctx)
        break
      case ModeEnum.TextToImage:
        await handleLevel10(ctx)
        break
      case ModeEnum.TextToVideo:
        await handleLevel11(ctx)
        break
      case ModeEnum.ChangeSize:
        await handleLevel12(ctx)
        break
      case ModeEnum.Invite:
        await handleLevel13(ctx)
        break
      // default не нужен, т.к. requiresLevelHandler будет false
    }
  }
})

// Добавляем обработчик для кнопки "Назад"
helpScene.action('leave_help', async ctx => {
  try {
    await ctx.answerCbQuery()
    await ctx.deleteMessage() // Удаляем сообщение со справкой и кнопкой "Назад"
  } catch (error) {
    console.error('Error handling leave_help action:', error)
    // Игнорируем ошибки удаления/ответа, если они возникли
  }
  // Просто выходим из сцены helpScene, возвращая пользователя в предыдущее состояние
  await ctx.scene.leave()
})
