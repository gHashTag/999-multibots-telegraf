import { supabase } from '@/core/supabase'
import { ModelTraining } from '@/interfaces'

/**
 * Получает все активные модели пользователя + общие модели для HaimGroupMedia команды.
 * Общие модели добавляются с префиксом shared_ в ID и специальным названием.
 * @param telegram_id - Telegram ID пользователя.
 * @param apiType - Тип API модели, например, 'replicate'.
 * @param bot_name - Название бота для определения правил доступа.
 * @returns Промис с массивом объектов ModelTraining или null в случае ошибки.
 */
export async function getActiveUserModelsByTypeForHaim(
  telegram_id: number,
  apiType: string,
  bot_name: string
): Promise<ModelTraining[] | null> {
  try {
    // Получаем обычные модели пользователя
    const { data: userModels, error: userError } = await supabase
      .from('model_trainings')
      .select('*')
      .eq('telegram_id', telegram_id)
      .eq('status', 'SUCCESS')
      .eq('api', apiType)
      .order('created_at', { ascending: false })

    if (userError) {
      console.error('Error getting user models for Haim:', userError)
      return null
    }

    let allModels: ModelTraining[] = userModels || []

    // Добавляем общие модели только для HaimGroupMedia_bot и только если пользователь не владелец общей модели
    if (bot_name === 'HaimGroupMedia_bot' && telegram_id !== 352374518) {
      console.log('🎯 Добавляем общие модели для HaimGroupMedia команды')

      // Получаем общую модель "Метамуза Наташа" (ID: 352374518)
      const { data: sharedModels, error: sharedError } = await supabase
        .from('model_trainings')
        .select('*')
        .eq('telegram_id', 352374518)
        .eq('status', 'SUCCESS')
        .eq('api', apiType)
        .order('created_at', { ascending: false })

      if (!sharedError && sharedModels && sharedModels.length > 0) {
        // Добавляем общие модели с префиксом и специальным названием
        const modifiedSharedModels = sharedModels.map(model => ({
          ...model,
          id: `shared_${model.id}`, // Добавляем префикс shared_
          model_name: `👥 ${model.model_name} (Общая модель команды)`,
        }))

        // Добавляем общие модели в начало списка
        allModels = [...modifiedSharedModels, ...allModels]
        console.log(`✅ Добавлено ${modifiedSharedModels.length} общих моделей`)
      }
    }

    return allModels
  } catch (error) {
    console.error(
      'Unexpected error in getActiveUserModelsByTypeForHaim:',
      error
    )
    return null
  }
}
