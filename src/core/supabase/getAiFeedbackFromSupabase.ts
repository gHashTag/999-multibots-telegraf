import { openai } from '../openai'

type GetAiSupabaseFeedbackT = {
  assistant_id: string
  report: string
  language_code: string
  full_name: string
}

function removeAnnotations(text: string): string {
  // Регулярное выражение для поиска шаблона аннотаций
  const annotationPattern = /【\d+:\d+†source】/g
  // Заменяем все совпадения на пустую строку
  return text.replace(annotationPattern, '')
}

export async function getAiFeedbackFromSupabase({
  assistant_id,
  report,
  language_code,
  full_name,
}: GetAiSupabaseFeedbackT): Promise<{ ai_response: string }> {
  if (!assistant_id) throw new Error('Assistant ID is not set')
  if (!report) throw new Error('Report is not set')
  if (!language_code) throw new Error('Language code is not set')
  if (!full_name) throw new Error('Full name is not set')

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error('OpenAI API key is not set')
  }

  try {
    // Step 1: Create a thread with necessary parameters
    const thread = await openai.beta.threads.create()

    await openai.beta.threads.messages.create(thread.id, {
      role: 'user',
      content: report,
    })

    // Step 3: Run the assistant using assistantId
    const run = await openai.beta.threads.runs.createAndPoll(thread.id, {
      assistant_id,
      instructions: `You are the host of the self-realization game Leela Chakra. You must answer the user's questions and help him in the game. Address the user by their name: ${full_name}, and respond in the language: ${language_code}. Please use Markdown tags to highlight the most important parts of your answer. Also, incorporate Vedic and spiritual emojis to enhance the response.1. Headings: Telegram only supports one level of headings. Use ** to highlight text instead of ###. Italics and bold text: For italics, use *italics*.For bold text, use **bold**. Lists: For bulleted lists, use - or *. Make sure each list item starts on a new line. Escaping characters: If you use characters that can be interpreted as Markdown, escape them with a backslash. Separators: Use --- to create horizontal lines. Emoji and special characters: Emoji can be used to add visual emphasis, but make sure they don't break the markup.`,
    })

    // Step 4: Periodically retrieve the run to check its status
    if (run.status === 'completed') {
      const messages = await openai.beta.threads.messages.list(run.thread_id)
      console.log(messages, 'messages')
      for (const message of messages.data.reverse()) {
        if (message.role === 'assistant') {
          console.log(message.content, 'message.content')

          const content = message.content[0]
          console.log(content, 'content')
          if (content && content.type === 'text' && content.text) {
            return {
              ai_response: removeAnnotations(content.text.value),
            }
          }
        }
      }
    } else {
      console.log(run.status)
    }
  } catch (error) {
    console.error('Error querying OpenAI Assistant:', error)
    throw error
  }
}
