import { supabase } from '@/core/supabase'
import { ModelTraining } from '@/interfaces' // Убедимся, что ModelTraining - это правильный интерфейс

/**
 * Получает все активные (успешно обученные) модели пользователя заданного типа API.
 * Модели упорядочены по дате создания (сначала новые).
 * @param telegram_id - Telegram ID пользователя.
 * @param apiType - Тип API модели, например, 'replicate'.
 * @returns Промис, который разрешается массивом объектов ModelTraining или null в случае ошибки.
 */
export async function getActiveUserModelsByType(
  telegram_id: number,
  apiType: string
): Promise<ModelTraining[] | null> {
  try {
    const { data, error } = await supabase
      .from('model_trainings')
      .select('*')
      .eq('telegram_id', telegram_id)
      .eq('status', 'SUCCESS') // Только успешно обученные модели
      .eq('api', apiType)
      .order('created_at', { ascending: false }) // Сначала новые

    if (error) {
      console.error(
        `Error getting active user models by type (${apiType}):`,
        error
      )
      return null
    }

    return data as ModelTraining[] // Если ModelTraining это правильный тип, иначе нужно будет привести к нему или изменить его
  } catch (error) {
    console.error(
      `Unexpected error in getActiveUserModelsByType (${apiType}):`,
      error
    )
    return null
  }
}
