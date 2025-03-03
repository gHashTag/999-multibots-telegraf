import { openai } from '@/core/openai'

export async function getAvailableModels(): Promise<string[]> {
  try {
    const models = await openai.models.list()

    // Фильтруем только GPT модели и сортируем их
    return models.data
      .filter(
        model =>
          model.id.includes('gpt') &&
          !model.id.includes('instruct') &&
          !model.id.includes('0613') &&
          !model.id.includes('0301')
      )
      .map(model => model.id)
      .sort()
  } catch (error) {
    console.error('Error fetching models:', error)
    // Возвращаем базовые модели если произошла ошибка
    return ['gpt-4', 'gpt-4-turbo', 'gpt-3.5-turbo']
  }
}
