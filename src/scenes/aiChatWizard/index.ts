/**
 * AI Chat Wizard Scene
 *
 * Lets users chat with AI models directly in Telegram.
 * Supports model selection, persistent memory, and Hermes-style features.
 */

import { Scenes, Markup } from 'telegraf'
import { MyContext } from '@/interfaces'
import { ModeEnum } from '@/interfaces/modes'
import { isRussianFromState } from '@/helpers/centralizedLanguage'
import {
  chatWithAI,
  ChatMessage,
  AI_CHAT_MODELS,
  getModelLabel,
} from '@/services/aiChatService'
import {
  loadHistory,
  clearHistory,
  getUserContext,
} from '@/services/chatMemoryService'
import { sendGenericErrorMessage } from '@/navigation'
import { logger } from '@/utils/logger'

/** Resolve bot_name for memory scoping. */
function botName(ctx: MyContext): string {
  return ctx.botInfo?.username ?? 'default'
}

// Step 1: Welcome + model selection
const welcomeStep = async (ctx: MyContext) => {
  const isRu = isRussianFromState(ctx)

  ctx.session.wizardData = {
    chatHistory: [] as ChatMessage[],
    selectedModel: AI_CHAT_MODELS.gpt4.id,
  }

  const keyboard = Markup.inlineKeyboard([
    ...Object.entries(AI_CHAT_MODELS).map(([key, m]) => [
      Markup.button.callback(
        isRu ? m.label_ru : m.label_en,
        `ai_chat_model_${key}`
      ),
    ]),
    [
      Markup.button.callback(
        isRu ? '🧹 Очистить историю' : '🧹 Clear history',
        'ai_chat_clear'
      ),
      Markup.button.callback(
        isRu ? '🧠 Моя память' : '🧠 My memory',
        'ai_chat_memory'
      ),
    ],
    [
      Markup.button.callback(
        isRu ? '🏠 Главное меню' : '🏠 Main menu',
        'go_main_menu'
      ),
    ],
  ])

  await ctx.reply(
    isRu
      ? '🤖 AI Ассистент (powered by Hermes)\nЯ помню наши предыдущие разговоры и учусь на ваших запросах.\n\nВыберите модель ИИ для общения:'
      : '🤖 AI Assistant (powered by Hermes)\nI remember our previous conversations and learn from your requests.\n\nSelect an AI model to chat with:',
    keyboard
  )

  return ctx.wizard.next()
}

// Step 2: Conversation loop - receive text, send to AI, reply
const conversationStep = async (ctx: MyContext) => {
  const isRu = isRussianFromState(ctx)

  if (!ctx.message || !('text' in ctx.message)) {
    await ctx.reply(
      isRu ? 'Отправьте текстовое сообщение.' : 'Please send a text message.'
    )
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
    await ctx.reply(
      isRu ? 'Сообщение не может быть пустым.' : 'Message cannot be empty.'
    )
    return
  }

  const wizardData = ctx.session.wizardData || {}
  const history: ChatMessage[] = wizardData.chatHistory || []
  const model: string = wizardData.selectedModel || AI_CHAT_MODELS.gpt4.id
  const tid = String(ctx.from?.id ?? '')

  // In-flight guard: conversationStep calls the paid chatWithAI (a Replicate
  // prediction, ~30s) once per message with no serialization, so a user
  // sending several messages in quick succession fired several concurrent
  // paid predictions on the platform token. Reject the re-entry while a reply
  // is still being generated; set synchronously so there is no await between
  // the check and the set (same shape as the voice-avatar guard).
  if (ctx.session.aiChatInProgress) {
    await ctx.reply(
      isRu
        ? '⏳ Уже обрабатываю ваше сообщение, подождите немного...'
        : '⏳ Already processing your message, please wait a moment...'
    )
    return
  }
  ctx.session.aiChatInProgress = true

  // Add user message to session history
  history.push({ role: 'user', content: userText })

  const thinkingMsg = await ctx.reply(isRu ? '🤔 Думаю...' : '🤔 Thinking...')

  try {
    const systemPrompt: ChatMessage = {
      role: 'system',
      content:
        'You are a helpful AI assistant (Hermes). You have persistent memory of previous conversations. Reply in the same language the user writes in.',
    }

    // chatWithAI now loads DB history and saves messages automatically
    const response = await chatWithAI([systemPrompt, ...history], model, {
      telegramId: tid,
      botName: botName(ctx),
    })

    // Add assistant response to session history
    history.push({ role: 'assistant', content: response })
    ctx.session.wizardData = { ...wizardData, chatHistory: history }

    // Delete "thinking" message and send response with model tag
    await ctx.telegram
      .deleteMessage(ctx.chat!.id, thinkingMsg.message_id)
      .catch(() => {})
    const modelTag = `[${getModelLabel(model)}]`
    const fullReply = `${response}\n\n_${modelTag}_`
    await ctx.reply(fullReply, { parse_mode: 'Markdown' }).catch(async () => {
      await ctx.reply(`${response}\n\n${modelTag}`)
    })
  } catch (error) {
    await ctx.telegram
      .deleteMessage(ctx.chat!.id, thinkingMsg.message_id)
      .catch(() => {})
    logger.error('AI Chat error', {
      error: error instanceof Error ? error.message : String(error),
      telegramId: ctx.from?.id,
    })
    await sendGenericErrorMessage(ctx, isRu)
  } finally {
    ctx.session.aiChatInProgress = false
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
  aiChatWizard.action(`ai_chat_model_${key}`, async ctx => {
    await ctx.answerCbQuery()

    const isRu = isRussianFromState(ctx)
    const tid = String(ctx.from?.id ?? '')
    const wizardData = ctx.session.wizardData || {}
    wizardData.selectedModel = model.id

    // Load previous conversation from DB instead of starting empty
    const dbHistory = await loadHistory(tid, botName(ctx))
    wizardData.chatHistory = dbHistory.map(h => ({
      role: h.role,
      content: h.content,
    }))

    ctx.session.wizardData = wizardData

    const memNote =
      dbHistory.length > 0
        ? isRu
          ? `\n\nЗагружено ${dbHistory.length} сообщений из памяти.`
          : `\n\nLoaded ${dbHistory.length} messages from memory.`
        : ''

    await ctx.reply(
      (isRu
        ? `Модель: ${model.label_ru}\n\nОтправьте сообщение для начала диалога.`
        : `Model: ${model.label_en}\n\nSend a message to start chatting.`) +
        memNote,
      Markup.keyboard([[isRu ? '🏠 Главное меню' : '🏠 Main menu']]).resize()
    )
  })
})

// Clear history action
aiChatWizard.action('ai_chat_clear', async ctx => {
  await ctx.answerCbQuery()
  const isRu = isRussianFromState(ctx)
  const tid = String(ctx.from?.id ?? '')

  await clearHistory(tid, botName(ctx))

  const wizardData = ctx.session.wizardData || {}
  wizardData.chatHistory = []
  ctx.session.wizardData = wizardData

  await ctx.reply(
    isRu ? '🧹 История разговоров очищена.' : '🧹 Conversation history cleared.'
  )
})

// Show memory action
aiChatWizard.action('ai_chat_memory', async ctx => {
  await ctx.answerCbQuery()
  const isRu = isRussianFromState(ctx)
  const tid = String(ctx.from?.id ?? '')

  const context = await getUserContext(tid, botName(ctx))
  if (!context) {
    await ctx.reply(
      isRu
        ? '🧠 У меня пока нет воспоминаний о вас.'
        : "🧠 I don't have any memories about you yet."
    )
    return
  }

  await ctx.reply(
    (isRu ? '🧠 Что я помню о вас:\n\n' : '🧠 What I remember about you:\n\n') +
      context
  )
})

// Handle /menu command inside the scene
aiChatWizard.command('menu', async ctx => {
  const { CancelButtonService } = await import('@/navigation')
  await CancelButtonService.executeMainMenu(ctx)
})

export default aiChatWizard
