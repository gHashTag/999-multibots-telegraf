import { openai } from '.'

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
  try {
    const initialPrompt = `Respond in the language: ${languageCode} You communicate with: ${JSON.stringify(
      userData
    )}`

    const response = await openai.chat.completions.create({
      model,
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
    console.log('Response:', response)

    // Проверяем наличие ошибки в ответе
    if ('error' in response) {
      const error = response.error as { message: string; code: number }
      if (error.code === 402) {
        return languageCode === 'ru'
          ? 'Извините, у нас закончились кредиты для обработки запросов. Пожалуйста, попробуйте позже.'
          : 'Sorry, we are out of credits to process requests. Please try again later.'
      }
      throw new Error(error.message)
    }

    const content = response.choices[0].message.content
    if (!content) {
      throw new Error('Empty response from GPT')
    }

    return content
  } catch (error) {
    console.error('Error:', error)
    if (error instanceof Error && error.message.includes('credits')) {
      return languageCode === 'ru'
        ? 'Извините, у нас закончились кредиты для обработки запросов. Пожалуйста, попробуйте позже.'
        : 'Sorry, we are out of credits to process requests. Please try again later.'
    }
    throw error
  }
}
