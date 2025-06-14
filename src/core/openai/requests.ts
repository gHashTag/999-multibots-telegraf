import { openai, deepseekClient, openaiClient } from '.'

type UserData = {
  username: string
  first_name: string
  last_name: string
  company: string
  position: string
  designation: string
}

export const answerAi = async (
  model: string,
  userData: UserData,
  prompt: string,
  languageCode: string,
  systemPrompt?: string
): Promise<string> => {
  const initialPrompt = `Respond in the language: ${languageCode} You communicate with: ${JSON.stringify(
    userData
  )}`

  // Выбираем правильный клиент в зависимости от модели
  let client: any
  if (model === 'deepseek-chat' && deepseekClient) {
    client = deepseekClient
  } else if (model.startsWith('gpt') && openaiClient) {
    client = openaiClient
  } else {
    // Используем основной клиент по умолчанию
    client = openai
  }

  try {
    const response = await client.chat.completions.create({
      model: model,
      messages: [
        {
          role: 'system',
          content: systemPrompt
            ? systemPrompt + '\n' + initialPrompt
            : initialPrompt,
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
    })

    const content = response.choices[0].message.content
    if (!content) {
      throw new Error('Empty response from AI')
    }

    return content
  } catch (error) {
    console.error(`[answerAi] Error with model ${model}:`, error)
    
    // Если ошибка с основной моделью, пробуем резервную
    if (error instanceof Error && error.message.includes('model')) {
      console.log('[answerAi] Trying fallback to deepseek-chat')
      
      // Если есть DeepSeek клиент, пробуем его
      if (deepseekClient && model !== 'deepseek-chat') {
        const fallbackResponse = await deepseekClient.chat.completions.create({
          model: 'deepseek-chat',
          messages: [
            {
              role: 'system',
              content: systemPrompt
                ? systemPrompt + '\n' + initialPrompt
                : initialPrompt,
            },
            {
              role: 'user',
              content: prompt,
            },
          ],
        })

        const fallbackContent = fallbackResponse.choices[0].message.content
        if (!fallbackContent) {
          throw new Error('Empty response from fallback AI')
        }

        return fallbackContent
      }
    }
    
    throw error
  }
}
