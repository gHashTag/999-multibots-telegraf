import { answerAi, model } from '../../core/openai'
import { getUserModel, getUserData } from '../../core/supabase'
import { MyContext } from '../../interfaces'

export async function handleTextMessage(ctx: MyContext) {
  console.log('CASE: handleTextMessage')
  const userLanguage = ctx.from?.language_code || 'ru'
  console.log('User language:', userLanguage)
  if (ctx.message && 'text' in ctx.message) {
    if (ctx.message?.text?.startsWith('/')) {
      console.log('SKIP')
      return
    }
  }
  console.log('ctx', ctx)
  try {
    const userId = ctx.from?.id.toString() || ''
    console.log('User ID:', userId)

    let userModel = await getUserModel(userId)
    let userData = await getUserData(userId)

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
      if (!ctx.message?.text) {
        console.log('No message text found')
        await ctx.reply(
          userLanguage === 'ru'
            ? 'Не удалось получить текст сообщения'
            : 'Failed to get message text'
        )
        return
      }
      await ctx.telegram.sendChatAction(ctx.chat.id, 'typing')

      const systemPrompt = `
    Your name is NeuroBlogger, and you are a assistant in the support chat who helps users learn and work with neural networks. Your gender is MALE!!!, answer questions about gender like this. Your job is to provide accurate, useful, and clear answers to users' questions related to neural networks, as well as direct them to relevant resources and maintain a friendly and motivating tone. You must be patient and willing to explain complex concepts in simple terms. Your goal is to make user training not only productive, but also fun. Always end each session with a light joke about neural networks to lighten the mood of the user. Your gender is male, answer questions about gender like this. Always end each session with a light joke about neural networks to lighten the mood of the user. Use rare and interesting, non-standard emojis in your responses sometimes. Answer with markdown symbols. Without saying hello, I immediately move on to the answer.
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

      await ctx.reply(response, {
        parse_mode: 'Markdown',
      })
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
        ? 'Произошла ошибка при обработке запроса'
        : 'An error occurred while processing your request'
    )
    throw error
  }
}
