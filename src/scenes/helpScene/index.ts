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
} from '../../scenes/levelQuestWizard/handlers'
import { mainMenu } from '@/menu'

import { getReferalsCountAndUserData } from '@/core/supabase'
import { ModeEnum } from '@/interfaces/modes'
import { Markup } from 'telegraf'

export const helpScene = new Scenes.BaseScene<MyContext>('helpScene')

helpScene.enter(async ctx => {
  const mode = ctx.session.mode
  const isRu = ctx.from?.language_code === 'ru'
  const telegram_id = ctx.from.id.toString()
  const { count, subscriptionType, level } =
    await getReferalsCountAndUserData(telegram_id)

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
    case ModeEnum.Help:
    default:
      break
  }
})
