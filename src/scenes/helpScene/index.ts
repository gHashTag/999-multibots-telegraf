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
} from '../../scenes/levelQuestWizard/handlers'
import { mainMenu } from '@/menu'
import { isRussian } from '@/helpers'
import { getReferalsCountAndUserData } from '@/core/supabase'
import { ModeEnum } from '@/price/helpers/modelsCost'

export const helpScene = new Scenes.BaseScene<MyContext>('helpScene')

helpScene.enter(async ctx => {
  const mode = ctx.session.mode
  const isRu = isRussian(ctx)
  const telegram_id = ctx.from?.id?.toString() || ''
  const { count, subscription, level } =
    await getReferalsCountAndUserData(telegram_id)
  const newSub = subscription || 'stars'

  try {
    switch (mode) {
      case ModeEnum.DigitalAvatarBody:
        await handleLevel1(ctx)
        const keyboard = mainMenu({
          isRu,
          inviteCount: count,
          subscription: newSub,
          ctx,
          level,
        })
        await ctx.reply(isRu ? '👆 Справка по команде' : '👆 Command help', {
          reply_markup: keyboard.reply_markup,
        })
        break
      case ModeEnum.DigitalAvatarBodyV2:
        await handleLevel1(ctx)
        const keyboardBodyV2 = mainMenu({
          isRu,
          inviteCount: count,
          subscription: newSub,
          ctx,
          level,
        })
        await ctx.reply(isRu ? '👆 Справка по команде' : '👆 Command help', {
          reply_markup: keyboardBodyV2.reply_markup,
        })
        break
      case ModeEnum.NeuroPhoto:
        await handleLevel2(ctx)
        const keyboardNeuroPhoto = mainMenu({
          isRu,
          inviteCount: count,
          subscription: newSub,
          ctx,
          level,
        })
        await ctx.reply(isRu ? '👆 Справка по команде' : '👆 Command help', {
          reply_markup: keyboardNeuroPhoto.reply_markup,
        })
        break
      case ModeEnum.ImageToPrompt:
        await handleLevel3(ctx)
        const keyboardImageToPrompt = mainMenu({
          isRu,
          inviteCount: count,
          subscription: newSub,
          ctx,
          level,
        })
        await ctx.reply(isRu ? '👆 Справка по команде' : '👆 Command help', {
          reply_markup: keyboardImageToPrompt.reply_markup,
        })
        break
      case ModeEnum.Avatar:
        await handleLevel4(ctx)
        const keyboardAvatar = mainMenu({
          isRu,
          inviteCount: count,
          subscription: newSub,
          ctx,
          level,
        })
        await ctx.reply(isRu ? '👆 Справка по команде' : '👆 Command help', {
          reply_markup: keyboardAvatar.reply_markup,
        })
        break
      case ModeEnum.ChatWithAvatar:
        await handleLevel5(ctx)
        const keyboardChatWithAvatar = mainMenu({
          isRu,
          inviteCount: count,
          subscription: newSub,
          ctx,
          level,
        })
        await ctx.reply(isRu ? '👆 Справка по команде' : '👆 Command help', {
          reply_markup: keyboardChatWithAvatar.reply_markup,
        })
        break
      case ModeEnum.SelectModel:
        await handleLevel6(ctx)
        const keyboardSelectModel = mainMenu({
          isRu,
          inviteCount: count,
          subscription: newSub,
          ctx,
          level,
        })
        await ctx.reply(isRu ? '👆 Справка по команде' : '👆 Command help', {
          reply_markup: keyboardSelectModel.reply_markup,
        })
        break
      case ModeEnum.Voice:
        await handleLevel7(ctx)
        const keyboardVoice = mainMenu({
          isRu,
          inviteCount: count,
          subscription: newSub,
          ctx,
          level,
        })
        await ctx.reply(isRu ? '👆 Справка по команде' : '👆 Command help', {
          reply_markup: keyboardVoice.reply_markup,
        })
        break
      case ModeEnum.TextToSpeech:
        await handleLevel8(ctx)
        const keyboardTextToSpeech = mainMenu({
          isRu,
          inviteCount: count,
          subscription: newSub,
          ctx,
          level,
        })
        await ctx.reply(isRu ? '👆 Справка по команде' : '👆 Command help', {
          reply_markup: keyboardTextToSpeech.reply_markup,
        })
        break
      case ModeEnum.ImageToVideo:
        await handleLevel9(ctx)
        const keyboardImageToVideo = mainMenu({
          isRu,
          inviteCount: count,
          subscription: newSub,
          ctx,
          level,
        })
        await ctx.reply(isRu ? '👆 Справка по команде' : '👆 Command help', {
          reply_markup: keyboardImageToVideo.reply_markup,
        })
        break
      case ModeEnum.TextToImage:
        await handleLevel10(ctx)
        const keyboardTextToImage = mainMenu({
          isRu,
          inviteCount: count,
          subscription: newSub,
          ctx,
          level,
        })
        await ctx.reply(isRu ? '👆 Справка по команде' : '👆 Command help', {
          reply_markup: keyboardTextToImage.reply_markup,
        })
        break
      case ModeEnum.TextToVideo:
        await handleLevel11(ctx)
        const keyboardTextToVideo = mainMenu({
          isRu,
          inviteCount: count,
          subscription: newSub,
          ctx,
          level,
        })
        await ctx.reply(isRu ? '👆 Справка по команде' : '👆 Command help', {
          reply_markup: keyboardTextToVideo.reply_markup,
        })
        break
      case ModeEnum.ChangeSize:
        await handleLevel12(ctx)
        const keyboardChangeSize = mainMenu({
          isRu,
          inviteCount: count,
          subscription: newSub,
          ctx,
          level,
        })
        await ctx.reply(isRu ? '👆 Справка по команде' : '👆 Command help', {
          reply_markup: keyboardChangeSize.reply_markup,
        })
        break
      case ModeEnum.Invite:
        await handleLevel13(ctx)
        const keyboardInvite = mainMenu({
          isRu,
          inviteCount: count,
          subscription: newSub,
          ctx,
          level,
        })
        await ctx.reply(isRu ? '👆 Справка по команде' : '👆 Command help', {
          reply_markup: keyboardInvite.reply_markup,
        })
        break
      case ModeEnum.Help:
        ctx.scene.enter('step0')
        break
      default:
        ctx.scene.enter('step0')
        break
    }
  } catch (error) {
    console.error('Error in helpScene:', error)
    await ctx.reply('Произошла ошибка. Пожалуйста, попробуйте снова.')
  }
})
