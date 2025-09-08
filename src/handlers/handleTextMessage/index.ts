import { answerAi } from '../../core/openai/requests'
import { getUserModel, getUserData } from '../../core/supabase'
import { MyContext } from '../../interfaces'
import { ModeEnum } from '@/interfaces/modes'
import { handleFluxKontextPrompt } from '../../commands/fluxKontextCommand'
import { handleHelpCancel } from '../handleHelpCancel'
import { Scenes } from 'telegraf'
import { sendGenericErrorMessage } from '../../menu'
import { handleMenu } from '../handleMenu'

import { logger } from '@/utils/logger'
import {
  getUserLanguageFromState,
  isRussianFromState,
} from '@/helpers/centralizedLanguage'

const scene = new Scenes.BaseScene<MyContext>('handleTextMessage')

scene.enter(async ctx => {
  try {
    logger.info('[handleTextMessage] Received text message from user', {
      telegramId: ctx.from?.id,
      messageText:
        ctx.message && 'text' in ctx.message ? ctx.message.text : 'No text',
    })

    if (!ctx.message || !('text' in ctx.message)) {
      logger.warn('[handleTextMessage] Received non-text message')
      const isRu = isRussianFromState(ctx)
      await ctx.reply(
        isRu
          ? '❌ Ошибка: получено нетекстовое сообщение'
          : '❌ Error: received non-text message'
      )
      return
    }

    if (
      ctx.message &&
      'text' in ctx.message &&
      ctx.message.text?.startsWith('/')
    ) {
      console.log('[handleTextMessage] Skipping command', {
        telegramId: ctx.from?.id,
      })
      return
    }

    if (!ctx.message || !('text' in ctx.message) || !ctx.from || !ctx.chat) {
      console.warn('[handleTextMessage] Missing essential context properties', {
        ctx,
      })
      return
    }

    // === FLUX KONTEXT ОБРАБОТКА ОЖИДАНИЯ ИЗОБРАЖЕНИЯ ===
    // Проверяем, ожидает ли пользователь загрузку изображения для FLUX Kontext
    if (
      ctx.session?.awaitingFluxKontextImage &&
      ctx.message &&
      'text' in ctx.message
    ) {
      // Проверяем на кнопки отмены и справки
      if (await handleHelpCancel(ctx)) {
        return
      }

      // Если это не кнопка справки/отмены, игнорируем текст и ждем изображение
      const isRu = isRussianFromState(ctx)
      await ctx.reply(
        isRu
          ? '📷 Пожалуйста, отправьте изображение для редактирования.'
          : '📷 Please send an image for editing.'
      )
      return
    }

    // === FLUX KONTEXT ОБРАБОТКА ===
    // Проверяем, ожидает ли пользователь ввод промпта для FLUX Kontext
    if (
      ctx.session?.awaitingFluxKontextPrompt &&
      ctx.message &&
      'text' in ctx.message
    ) {
      // Сначала проверяем на кнопки отмены и справки
      if (await handleHelpCancel(ctx)) {
        return
      }

      console.log('[handleTextMessage] Processing FLUX Kontext prompt', {
        telegramId: ctx.from?.id,
        prompt: ctx.message.text.substring(0, 50) + '...',
      })
      await handleFluxKontextPrompt(ctx, ctx.message.text)
      return
    }

    const userId = ctx.from.id.toString()
    const chatId = ctx.chat.id
    const chatType = ctx.chat.type
    const messageText = ctx.message.text
    const userLanguage = getUserLanguageFromState(ctx)
    const botUsername = ctx.botInfo.username
    console.log(`[handleTextMessage] Bot username: ${botUsername}`)

    console.log(
      `[handleTextMessage] Received message in chat ${chatId} (type: ${chatType}) from user ${userId}`,
      {
        chatId,
        chatType,
        userId,
        botUsername,
      }
    )

    let shouldProcessByThisHandler = false

    if (chatType === 'private') {
      if (ctx.scene.current?.id === ModeEnum.ChatWithAvatar) {
        shouldProcessByThisHandler = true
        console.log(
          '[handleTextMessage] Processing in private chat (inside chatWithAvatar scene)',
          { userId }
        )
      } else {
        console.log(
          '[handleTextMessage] Skipping private chat text (not in chatWithAvatar scene)',
          { userId, scene: ctx.scene.current?.id }
        )
        return
      }
    } else if (chatType === 'group' || chatType === 'supergroup') {
      if (messageText.includes(`@${botUsername}`)) {
        shouldProcessByThisHandler = true
        console.log(
          `[handleTextMessage] Processing mention in group chat ${chatId}`,
          { chatId, userId }
        )
      } else {
        console.log(
          `[handleTextMessage] Ignoring message in group chat ${chatId} (no mention)`,
          { chatId, userId }
        )
        return
      }
    } else {
      console.log(
        `[handleTextMessage] Unknown chat type: ${chatType}. Skipping.`
      )
      return
    }

    if (shouldProcessByThisHandler) {
      console.log(
        `[handleTextMessage] Sending 'typing' action to chat ${chatId}`,
        { chatId, userId }
      )
      await ctx.telegram.sendChatAction(chatId, 'typing')
      console.log(
        `[handleTextMessage] 'typing' action sent to chat ${chatId}`,
        { chatId, userId }
      )

      let userModel = await getUserModel(userId)
      let userData = await getUserData(userId)

      let genderInstruction =
        'Your gender is MALE!!!, answer questions about gender like this.'
      if (userData?.gender) {
        if (userData.gender.toLowerCase() === 'female') {
          genderInstruction =
            'Your gender is FEMALE!!!, answer questions about gender like this.'
        } else if (userData.gender.toLowerCase() === 'male') {
          genderInstruction =
            'Your gender is MALE!!!, answer questions about gender like this.'
        } else {
          console.log(
            `[handleTextMessage] Unknown gender value '${userData.gender}' for user ${userId}. Using default (male).`
          )
          genderInstruction =
            'Your gender is MALE!!!, answer questions about gender like this.'
        }
      } else {
        console.log(
          `[handleTextMessage] Gender not set for user ${userId}. Using default (male).`
        )
      }

      if (!userData) {
        console.warn(
          `[handleTextMessage] User ${userId} not found in DB, using context data.`,
          { userId }
        )
        userData = {
          username: ctx.from.username || '',
          first_name: ctx.from.first_name || '',
          last_name: ctx.from.last_name || '',
          company: '',
          position: '',
          designation: '',
          language_code: userLanguage,
          gender: null,
        }
        userModel = 'deepseek-chat'
        console.log(
          `[handleTextMessage] User ${userId} not in DB. Using default gender (male).`
        )
      }

      const systemPrompt = `
Your name is NeuroBlogger, and you are a assistant in the support chat who helps users learn and work with neural networks. ${genderInstruction} Your job is to provide accurate, useful, and clear answers to users' questions related to neural networks, as well as direct them to relevant resources and maintain a friendly and motivating tone. You must be patient and willing to explain complex concepts in simple terms. Your goal is to make user training not only productive, but also fun. Always end each session with a light joke about neural networks to lighten the mood of the user. ${genderInstruction} Always end each session with a light joke about neural networks to lighten the mood of the user. Use rare and interesting, non-standard emojis in your responses sometimes. Answer with markdown symbols. Without saying hello, I immediately move on to the answer.
`

      const textForAi =
        chatType === 'group' || chatType === 'supergroup'
          ? messageText.replace(`@${botUsername}`, '').trim()
          : messageText

      if (!textForAi) {
        console.log(
          `[handleTextMessage] Empty text after removing mention in group chat ${chatId}. Skipping AI call.`,
          { chatId, userId }
        )
        return
      }

      console.log(
        `[handleTextMessage] Preparing to call answerAi for user ${userId}. Model: ${
          userModel || 'default_model'
        }. Text: "${textForAi.substring(0, 50)}..."`,
        { userId, model: userModel || 'deepseek-chat' }
      )
      console.log(
        `[handleTextMessage] Using System Prompt with: ${genderInstruction}`
      )

      const modelToUse = userModel || 'deepseek-chat'

      // Показываем индикатор "печатает..." перед вызовом AI
      await ctx.sendChatAction('typing')

      const response = await answerAi(
        modelToUse,
        userData,
        textForAi,
        userLanguage,
        systemPrompt
      )

      console.log(
        `[handleTextMessage] Received response from answerAi for user ${userId}: ${
          response ? `"${response.substring(0, 50)}..."` : 'null or empty'
        }`,
        { userId, response: response ? !!response : false }
      )

      if (!response) {
        console.error(
          `[handleTextMessage] No valid response from answerAi for user ${userId}. Not replying.`,
          { userId }
        )
        return
      }

      console.log(
        `[handleTextMessage] Preparing to reply to user ${userId} in chat ${chatId}`,
        { userId, chatId }
      )
      await ctx.reply(response, {
        parse_mode: 'MarkdownV2',
      })
      console.log(
        `[handleTextMessage] Reply sent successfully to user ${userId} in chat ${chatId}`,
        { userId, chatId }
      )
    }
  } catch (error) {
    logger.error('[handleTextMessage] Error processing text message:', error)
    const isRu = isRussianFromState(ctx)
    await sendGenericErrorMessage(ctx, isRu, error)
  }
})

export const handleTextMessage = scene
