import { supabase } from '@/core/supabase'
import { ModelTraining } from '@/interfaces'
import { HAIM_GROUP_STAFF_IDS } from '@/menu/mainMenu'

/**
 * Получает все активные модели пользователя + общие модели для сотрудников HaimGroupMedia
 * @param telegram_id - Telegram ID пользователя
 * @param apiType - Тип API модели, например, 'replicate'
 * @param botName - Имя бота для определения контекста
 * @returns Промис с массивом ModelTraining или null в случае ошибки
 */
export async function getActiveUserModelsByTypeForHaim(
  telegram_id: number,
  apiType: string,
  botName?: string
): Promise<ModelTraining[] | null> {
  try {
    // Получаем персональные модели пользователя
    const { data: userModels, error: userError } = await supabase
      .from('model_trainings')
      .select('*')
      .eq('telegram_id', telegram_id)
      .eq('status', 'SUCCESS')
      .eq('api', apiType)
      .order('created_at', { ascending: false })

    if (userError) {
      console.error(`Error getting user models (${apiType}):`, userError)
      return null
    }

    const allModels = userModels || []

    // Проверяем, является ли пользователь сотрудником HaimGroupMedia
    const isHaimStaff = HAIM_GROUP_STAFF_IDS.includes(telegram_id.toString())

    if (isHaimStaff && botName === 'HaimGroupMedia_bot') {
      console.log(
        `🎯 Добавляем общие модели для сотрудника HaimGroupMedia: ${telegram_id}`
      )

      // Получаем КОНКРЕТНУЮ модель "Метамуза Наташа" от пользователя 352374518
      // ✅ КОНКРЕТНЫЙ ID МОДЕЛИ, КОТОРУЮ ВЫДЕЛИЛ ПОЛЬЗОВАТЕЛЬ (22.07.2025)
      const { data: sharedModel, error: sharedError } = await supabase
        .from('model_trainings')
        .select('*')
        .eq('id', 'ed2c6365-e782-4816-a1ef-1e26b79f6da0') // ← КОНКРЕТНАЯ МОДЕЛЬ!
        .eq('status', 'SUCCESS')
        .single()

      if (!sharedError && sharedModel) {
        const modifiedSharedModel = {
          ...sharedModel,
          // Добавляем префикс для визуального отображения
          model_name: `👥 ${sharedModel.model_name} (Общая модель команды)`,
          // Сохраняем оригинальный ID но помечаем как общую
          id: `shared_${sharedModel.id}`,
        }

        // Добавляем общую модель в начало списка
        allModels.unshift(modifiedSharedModel)

        console.log(
          `✅ Добавлена общая модель "${sharedModel.model_name}" для пользователя ${telegram_id}`
        )
      }
    }

    return allModels as ModelTraining[]
  } catch (error) {
    console.error(
      `Unexpected error in getActiveUserModelsByTypeForHaim (${apiType}):`,
      error
    )
    return null
  }
}
