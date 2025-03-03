import { openai, model } from '.'

export async function getCaptionForNews({ prompt }: { prompt: string }) {
  try {
    const completion = await openai.chat.completions.create({
      model,
      messages: [
        {
          role: 'system',
          content: `Ты профессиональный SSM специалист. 
            Твоя задача написать два вида описания для роликов.
            Примеры: 100 символов: Midjourney запускает AI-редактор: 
            редактируйте фото по тексту! #нейроСети #ИИ #искусственныйИнтеллект
            300 символов: Midjourney анонсировала революционный AI фото-редактор! 
            Теперь пользователи могут загружать свои изображения и редактировать их по текстовым описаниям. 
            Просто выделите фрагмент, дайте инструкции нейросети, и она перерисует его, сохраняя композицию, но меняя окружение, текстуры и цвета. 
            #нейроСети #ИИ #искусственныйИнтеллект
            на 300 символов. 
            `,
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.7,
    })
    console.log(completion, 'completion')

    const content = completion.choices[0].message.content
    if (content === null) {
      throw new Error('Received null content from OpenAI')
    }

    console.log(content)
    return content
  } catch (error) {
    console.error('Error:', error)
    throw error // Перебрасываем ошибку, чтобы она могла быть обработана выше
  }
}
