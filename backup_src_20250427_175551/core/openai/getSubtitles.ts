import { openai } from '.'

export async function getSubtitles(prompt: string, videoDuration: number) {
  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `You are a professional subtitle writer. Write subtitles for the given text. Don't use markdown syntax. The video duration is ${videoDuration} seconds. Your answer should be in json format. this text will be used in the .srt fileю Example:
            "subtitles":
            [
              {
                "endTime": "00:00:2,000",
                "startTime": "00:00:0,000",
                "text": "This is the first sentence"
              },
              {
            "endTime": "00:00:2,000",
            "startTime": "00:00:0,000",
            "text": "This is the first sentence"
          }
  ]`,
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
