import { answerAi, model } from '../../core/openai'
import { getUserData } from '../../core/supabase'
import { MyContext } from '../../interfaces'
import { Context } from 'telegraf'
import { normalizeTelegramId } from '@/interfaces/telegram.interface'

/**
 * Функция для безопасной обработки Markdown в сообщениях Telegram
 */
export function sanitizeMarkdownV2(text: string): string {
  console.log(
    '🧹 Очищаем MarkdownV2 для Telegram... [Sanitizing MarkdownV2 for Telegram]'
  )

  // Экранируем специальные символы для MarkdownV2
  // Символы, требующие экранирования: _*[]()~`>#+-=|{}.!
  const escapeChars = '_*[]()~`>#+-=|{}.!'.split('')

  let result = text

  // Заменяем заголовки ## на жирный текст, так как заголовки не поддерживаются
  result = result.replace(/^##\s+(.+)$/gm, '*$1*')

  // Экранируем специальные символы
  escapeChars.forEach(char => {
    const regex = new RegExp('\\' + char, 'g')
    result = result.replace(regex, '\\' + char)
  })

  return result
}

/**
 * Конвертирует Markdown в HTML формат для Telegram
 */
export function markdownToHtml(text: string): string {
  console.log(
    '🔄 Конвертируем Markdown в HTML... [Converting Markdown to HTML]'
  )

  // Заменяем основные элементы Markdown на HTML
  const result = text
    // Заголовки
    .replace(/^##\s+(.+)$/gm, '<b>$1</b>')
    // Жирный текст
    .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')
    // Курсив
    .replace(/\*(.*?)\*/g, '<i>$1</i>')
    // Код
    .replace(/`(.*?)`/g, '<code>$1</code>')
    // Зачеркнутый текст
    .replace(/~~(.*?)~~/g, '<s>$1</s>')
    // Горизонтальные линии
    .replace(/^\*\*\*$|^---$/gm, '<i>—————</i>')

  return result
}

/**
 * Отправляет сообщение с правильным форматированием,
 * пытаясь использовать различные форматы в случае ошибки
 */
export async function sendSafeFormattedMessage(
  ctx: Context,
  text: string
): Promise<any> {
  try {
    console.log(
      '📤 Отправляем безопасное форматированное сообщение... [Sending safe formatted message]'
    )

    // Сначала пробуем HTML как наиболее надежный вариант
    return await ctx.reply(markdownToHtml(text), {
      parse_mode: 'HTML',
    })
  } catch (error) {
    console.error('⚠️ Ошибка при отправке HTML: [Error sending HTML:]', error)

    try {
      // Если не получилось с HTML, пробуем MarkdownV2 с экранированием
      return await ctx.reply(sanitizeMarkdownV2(text), {
        parse_mode: 'MarkdownV2',
      })
    } catch (error) {
      console.error(
        '⚠️ Ошибка при отправке MarkdownV2: [Error sending MarkdownV2:]',
        error
      )

      // Если и это не сработало, отправляем как обычный текст, убрав разметку
      return await ctx.reply(text.replace(/[*_`#~>]/g, ''))
    }
  }
}

export async function handleTextMessage(ctx: Context) {
  console.log('CASE: handleTextMessage')
  const userLanguage = ctx.from?.language_code || 'ru'
  console.log('User language:', userLanguage)
  if (ctx.message && 'text' in ctx.message) {
    if (ctx.message?.text?.startsWith('/')) {
      console.log('SKIP')
      return
    }
  }
  try {
    const userId = ctx.from?.id?.toString() || ''
    console.log('User ID:', userId)

    let userModel = model // TODO: DEEPSEEK /await getUserModel(userId)
    console.log('User model:', userModel)
    let userData = await getUserData(normalizeTelegramId(userId))

    // Если пользователь не найден, используем данные из контекста
    if (!userData) {
      console.log('User not found, using context data:', userId)
      userData = {
        username: ctx.from?.username || '',
        first_name: ctx.from?.first_name || '',
        last_name: ctx.from?.last_name || '',
        company: '',
        position: '',
        designation: '',
        language_code: userLanguage,
      }
      userModel = model
    }
    if (ctx.message && 'text' in ctx.message) {
      if (!ctx.message?.text || ctx.message.text.trim() === '') {
        console.log('Empty message text found')
        await ctx.reply(
          userLanguage === 'ru'
            ? 'Пожалуйста, напишите сообщение'
            : 'Please write a message'
        )
        return
      }
      if (!ctx.chat?.id) {
        throw new Error('Chat ID is not defined')
      }
      await ctx.telegram.sendChatAction(ctx.chat.id, 'typing')

      const systemPrompt = `
    You are a digital avatar assistant named NeuroBlogger. Your role is to engage in natural, friendly conversations with users while maintaining a professional and helpful demeanor. You should:

    1. Be conversational and engaging, but not overly casual
    2. Use appropriate emojis to enhance communication
    3. Provide clear and concise responses
    4. Maintain context throughout the conversation
    5. Be knowledgeable about neural networks and AI
    6. Use markdown formatting for better readability
    7. End responses with a light, relevant comment or question to encourage further interaction

    Remember to:
    - Keep responses focused and relevant
    - Use proper grammar and punctuation
    - Be helpful and supportive
    - Maintain a consistent personality
    - Adapt your tone to the user's language and style
    `

      const response = await answerAi(
        userModel,
        userData,
        ctx.message.text,
        userLanguage,
        systemPrompt
      )
      console.log('AI response:', response)

      if (!response) {
        await ctx.reply(
          userLanguage === 'ru'
            ? 'Не удалось получить ответ от GPT. Пожалуйста, попробуйте позже.'
            : 'Failed to get response from GPT. Please try again later.'
        )
        return
      }

      // Вместо прямой отправки с MarkdownV2 используем безопасную функцию
      await sendSafeFormattedMessage(ctx, response)
      return
    } else {
      console.log('No message text found')
      await ctx.reply(
        userLanguage === 'ru'
          ? 'Не удалось получить текст сообщения'
          : 'Failed to get message text'
      )
      return
    }
  } catch (error) {
    console.error('Error in GPT response:', error)
    await ctx.reply(
      userLanguage === 'ru'
        ? 'Произошла ошибка при обработке запроса. Пожалуйста, попробуйте позже.'
        : 'An error occurred while processing your request. Please try again later.'
    )
    throw error
  }
}
