import { OpenAI } from 'openai'
import { logger } from '@/utils/logger'

/**
 * Enhances a given prompt using OpenAI's GPT model
 * @param prompt - The original prompt to enhance
 * @param isRu - Whether the prompt is in Russian
 * @param openai - Optional OpenAI instance for testing
 * @returns Enhanced prompt
 */
export async function enhancePrompt(
  prompt: string,
  isRu: boolean,
  openai?: OpenAI
): Promise<string> {
  try {
    const client = openai || new OpenAI()
    
    const systemPrompt = isRu
      ? 'Ты - эксперт по улучшению промптов. Твоя задача - сделать промпт более четким, детальным и эффективным, сохраняя основную идею. Добавь детали, которые помогут получить лучший результат.'
      : 'You are a prompt enhancement expert. Your task is to make the prompt more precise, detailed and effective while maintaining the core idea. Add details that will help get better results.'

    const response = await client.chat.completions.create({
      model: 'gpt-4-turbo-preview',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt }
      ],
      temperature: 0.7,
      max_tokens: 500
    })

    const enhancedPrompt = response.choices[0]?.message?.content
    if (!enhancedPrompt) {
      throw new Error('No enhanced prompt received from OpenAI')
    }

    return enhancedPrompt
  } catch (error) {
    logger.error('Error enhancing prompt:', error)
    throw error
  }
}
