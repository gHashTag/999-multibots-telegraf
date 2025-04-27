import { openai } from '.'

export const upgradePrompt = async (prompt: string) => {
  try {
    const completion = await openai.chat.completions.create({
      model: 'chatgpt-4o-latest',
      messages: [
        {
          role: 'system',
          content:
            'You are a helpful assistant that upgrades the given prompt for image generation. Return only the upgraded prompt. Maximum detail and disclosure of meaning. ',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.4,
      max_tokens: 2000,
    })

    return completion.choices[0].message.content
  } catch (error) {
    console.error('Error in upgradePrompt:', error)
    throw error
  }
}
