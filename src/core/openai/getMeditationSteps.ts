import { openai, model } from '.'

export async function getMeditationSteps({ prompt }: { prompt: string }) {
  try {
    const completion = await openai.chat.completions.create({
      model,
      messages: [
        {
          role: 'system',
          content:
            'You are a helpful assistant that creates meditation steps with LeelaChakra application integration.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.7,
      response_format: { type: 'json_object' },
    })
    console.log(completion, 'completion')

    const content = completion.choices[0].message.content
    if (content === null) {
      throw new Error('Received null content from OpenAI')
    }

    console.log(content)
    return JSON.parse(content)
  } catch (error) {
    console.error('Error:', error)
    throw error // Перебрасываем ошибку, чтобы она могла быть обработана выше
  }
}
