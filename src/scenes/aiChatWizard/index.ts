/**
 * AI Chat Wizard Scene
 *
 * Lets users chat with AI models directly in Telegram.
 * Supports model selection and maintains conversation history in session.
 */

import { Scenes, Markup } from 'telegraf'
import { MyContext } from '@/interfaces'
import { ModeEnum } from '@/interfaces/modes'
import { isRussianFromState } from '@/helpers/centralizedLanguage'
import { chatWithAI, ChatMessage, AI_CHAT_MODELS } from '@/services/aiChatService'
import { sendGenericErrorMessage } from '@/navigation'
import { logger } from '@/utils/logger'

// Step 1: Welcome + model selection
const welcomeStep = async (ctx: MyContext) => {
  const isRu = isRussianFromState(ctx)

  ctx.session.wizardData = {
    chatHistory: [] as ChatMessage[],
    selectedModel: AI_CHAT_MODELS.gpt4.id,
  }

  const keyboard = Markup.inlineKeyboard([
    ...Object.entries(AI_CHAT_MODELS).map(([key, m]) => [
      Markup.button.callback(isRu ? m.label_ru : m.label_en, `ai_chat_model_${key}`),
    ]),
    [Markup.button.callback(isRu ? '🏠 Главное меню' : '🏠 Main menu', 'go_main_menu')],
  ])

  await ctx.reply(
    isRu
      ? '💬 Добро пожаловать в AI Чат!\n\nВыберите модель ИИ для общения:'
      : '💬 Welcome to AI Chat!\n\nSelect an AI model to chat with:',
    keyboard
  )

  return ctx.wizard.next()
}

// Step 2: Conversation loop - receive text, send to AI, reply
const conversationStep = async (ctx: MyContext) => {
  const isRu = isRussianFromState(ctx)

  if (!ctx.message || !('text' in ctx.message)) {
    await ctx.reply(isRu ? 'Отправьте текстовое сообщение.' : 'Please send a text message.')
    return
  }

  const userText = ctx.message.text.trim()

  // Check for main menu request
  if (userText === (isRu ? '🏠 Главное меню' : '🏠 Main menu')) {
    await ctx.scene.leave()
    const { showMainMenu } = await import('@/navigation')
    await showMainMenu(ctx)
    return
  }

  if (userText.length === 0) {
    await ctx.reply(isRu ? 'Сообщение не может быть пустым.' : 'Message cannot be empty.')
    return
  }

  const wizardData = ctx.session.wizardData || {}
  const history: ChatMessage[] = wizardData.chatHistory || []
  const model: string = wizardData.selectedModel || AI_CHAT_MODELS.gpt4.id

  // Add user message
  history.push({ role: 'user', content: userText })

  const thinkingMsg = await ctx.reply(isRu ? '🤔 Думаю...' : '🤔 Thinking...')

  try {
    const systemPrompt: ChatMessage = {
      role: 'system',
      content: 'You are a helpful assistant. Reply in the same language the user writes in.',
    }

    const response = await chatWithAI([systemPrompt, ...history], model)

    // Add assistant response to history
    history.push({ role: 'assistant', content: response })
    ctx.session.wizardData = { ...wizardData, chatHistory: history }

    // Delete "thinking" message and send response
    await ctx.telegram.deleteMessage(ctx.chat!.id, thinkingMsg.message_id).catch(() => {})
    await ctx.reply(response, { parse_mode: 'Markdown' }).catch(async () => {
      // Fallback: send without Markdown if parsing fails
      await ctx.reply(response)
    })
  } catch (error) {
    await ctx.telegram.deleteMessage(ctx.chat!.id, thinkingMsg.message_id).catch(() => {})
    logger.error('AI Chat error', {
      error: error instanceof Error ? error.message : String(error),
      telegramId: ctx.from?.id,
    })
    await sendGenericErrorMessage(ctx, isRu, error as Error)
  }
}

// Create the wizard scene
export const aiChatWizard = new Scenes.WizardScene<MyContext>(
  ModeEnum.AiChat,
  welcomeStep,
  conversationStep
)

// Model selection action handlers
Object.entries(AI_CHAT_MODELS).forEach(([key, model]) => {
  aiChatWizard.action(`ai_chat_model_${key}`, async (ctx) => {
    await ctx.answerCbQuery()

    const isRu = isRussianFromState(ctx)
    const wizardData = ctx.session.wizardData || {}
    wizardData.selectedModel = model.id
    wizardData.chatHistory = []
    ctx.session.wizardData = wizardData

    await ctx.reply(
      isRu
        ? `Модель: ${model.label_ru}\n\nОтправьте сообщение для начала диалога.`
        : `Model: ${model.label_en}\n\nSend a message to start chatting.`,
      Markup.keyboard([
        [isRu ? '🏠 Главное меню' : '🏠 Main menu'],
      ]).resize()
    )
  })
})

// Handle /menu command inside the scene
aiChatWizard.command('menu', async (ctx) => {
  const { CancelButtonService } = await import('@/navigation')
  await CancelButtonService.executeMainMenu(ctx)
})

export default aiChatWizard
