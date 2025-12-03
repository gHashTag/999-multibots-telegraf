import { Scenes } from 'telegraf'
import { MyContext } from '../../interfaces'
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
  handleFluxKontextHelp,
  handleVideoTranscriptionHelp,
  handleImageUpscalerHelp,
} from '../../scenes/levelQuestWizard/handlers'
import { mainMenu } from '@/menu'

import { getReferalsCountAndUserData } from '@/core/supabase'
import { ModeEnum } from '@/interfaces/modes'
import { Markup } from 'telegraf'
// ✅ ИМПОРТИРУЕМ НОВУЮ ЦЕНТРАЛИЗОВАННУЮ СИСТЕМУ ЯЗЫКОВ!
import { isRussianFromState } from '@/helpers/centralizedLanguage'

export const helpScene = new Scenes.BaseScene<MyContext>('helpScene')

// ✅ КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Обработчик для кнопок меню
helpScene.on('message', async ctx => {
  const messageText = (ctx.message as any)?.text
  const isRu = isRussianFromState(ctx)

  // Проверяем кнопки меню
  try {
    const { NAVIGATION_BUTTONS } = await import('@/navigation/unified-navigation.config')
    const button = NAVIGATION_BUTTONS.find(btn => btn.ru === messageText || btn.en === messageText)

    if (button) {
      // Это кнопка меню! Выходим из сцены и позволяем глобальному обработчику её обработать
      console.log('🔄 [helpScene] Menu button detected, exiting scene', {
        telegramId: ctx.from?.id,
        buttonText: messageText
      })
      return ctx.scene.leave()
    }
  } catch (error) {
    // Если не удалось импортировать, продолжаем с обычной обработкой
    console.warn('⚠️ [helpScene] Failed to import NAVIGATION_BUTTONS', {
      error: error instanceof Error ? error.message : String(error),
      telegramId: ctx.from?.id
    })
  }

  // Игнорируем другие сообщения
  await ctx.reply(
    isRu ? '❓ Для получения справки используйте кнопки главного меню' : '❓ Use main menu buttons for help',
    { reply_markup: { remove_keyboard: true } }
  )
  return ctx.scene.leave()
})

helpScene.enter(async ctx => {
  const mode = ctx.session.mode
  // ✅ ИСПОЛЬЗУЕМ НОВУЮ ЦЕНТРАЛИЗОВАННУЮ СИСТЕМУ (БЕЗ ЗАПРОСОВ К БД!)
  const isRu = isRussianFromState(ctx)
  const telegram_id = ctx.from.id.toString()
  const { count, subscriptionType, level } = await getReferalsCountAndUserData(
    telegram_id
  )

  let helpText = isRu ? 'Общая справка...' : 'General help...'

  switch (mode) {
    case ModeEnum.DigitalAvatarBody:
      helpText = isRu
        ? 'Справка по Цифровому телу...'
        : 'Help for Digital Body...'
      await handleLevel1(ctx)
      break
    case ModeEnum.NeuroPhoto:
      helpText = isRu ? 'Справка по Нейрофото...' : 'Help for NeuroPhoto...'
      await handleLevel2(ctx)
      break
    case ModeEnum.ImageToPrompt:
      helpText = isRu
        ? 'Справка по Промпту из фото...'
        : 'Help for Prompt from Photo...'
      await handleLevel3(ctx)
      break
    case ModeEnum.Avatar:
      helpText = isRu
        ? 'Справка по Мозгу аватара...'
        : 'Help for Avatar Brain...'
      await handleLevel4(ctx)
      break
    case ModeEnum.ChatWithAvatar:
      helpText = isRu
        ? 'Справка по Чату с аватаром...'
        : 'Help for Chat with Avatar...'
      await handleLevel5(ctx)
      break
    case ModeEnum.SelectModel:
      helpText = isRu
        ? 'Справка по Выбору модели ИИ...'
        : 'Help for Choose AI Model...'
      await handleLevel6(ctx)
      break
    case ModeEnum.Voice:
      helpText = isRu
        ? 'Справка по Голосу аватара...'
        : 'Help for Avatar Voice...'
      await handleLevel7(ctx)
      break
    case ModeEnum.TextToSpeech:
      helpText = isRu
        ? 'Справка по Тексту в голос...'
        : 'Help for Text to Voice...'
      await handleLevel8(ctx)
      break
    case ModeEnum.ImageToVideo:
      helpText = isRu
        ? 'Справка по Фото в видео...'
        : 'Help for Photo to Video...'
      await handleLevel9(ctx)
      break
    case ModeEnum.TextToImage:
      helpText = isRu
        ? 'Справка по Тексту в фото...'
        : 'Help for Text to Image...'
      await handleLevel10(ctx)
      break
    case ModeEnum.TextToVideo:
      helpText = isRu
        ? 'Справка по Видео из текста...'
        : 'Help for Text to Video...'
      await handleLevel11(ctx)
      break
    case ModeEnum.ChangeSize:
      helpText = isRu
        ? 'Справка по Изменению размера...'
        : 'Help for Change Size...'
      await handleLevel12(ctx)
      break
    case ModeEnum.Invite:
      helpText = isRu
        ? 'Справка по Приглашению друга...'
        : 'Help for Invite a Friend...'
      await handleLevel13(ctx)
      break
    case ModeEnum.FluxKontext:
      helpText = isRu
        ? 'Справка по FLUX Kontext...'
        : 'Help for FLUX Kontext...'
      await handleFluxKontextHelp(ctx)
      break
    case ModeEnum.VideoTranscription:
      helpText = isRu
        ? 'Справка по Транскрибации Reels...'
        : 'Help for Reels Transcription...'
      await handleVideoTranscriptionHelp(ctx)
      break
    case ModeEnum.ImageUpscaler:
      helpText = isRu
        ? 'Справка по Увеличению качества...'
        : 'Help for Image Upscaling...'
      await handleImageUpscalerHelp(ctx)
      break
    case ModeEnum.Help:
    default:
      break
  }
})
