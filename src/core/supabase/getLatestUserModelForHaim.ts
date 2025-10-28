import { supabase } from '@/core/supabase'
import { logger } from '@/utils/enhancedLogger'
import { ModelTraining } from '@/interfaces'
import { HAIM_GROUP_STAFF_IDS } from '@/menu/mainMenu'

/**
 * Получает последнюю активную модель пользователя + общие модели для сотрудников HaimGroupMedia
 * @param telegram_id - Telegram ID пользователя
 * @param api - Тип API модели, например, 'bfl' или 'replicate'
 * @param botName - Имя бота для определения контекста
 * @returns Промис с ModelTraining или null в случае ошибки
 */
export async function getLatestUserModelForHaim(
  telegram_id: number,
  api: string,
  botName?: string
): Promise<ModelTraining | null> {
  try {
    // Получаем последнюю персональную модель пользователя
    const { data: userModel, error: userError } = await supabase
      .from('model_trainings')
      .select('*')
      .eq('telegram_id', telegram_id)
      .eq('status', 'SUCCESS')
      .eq('api', api)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    // Проверяем, является ли пользователь сотрудником HaimGroupMedia
    const isHaimStaff = HAIM_GROUP_STAFF_IDS.includes(telegram_id.toString())

    // Если у пользователя есть собственная модель, возвращаем её
    if (!userError && userModel) {
      logger.debug(
        `✅ Найдена персональная модель для пользователя ${telegram_id}`
      )
      return userModel as ModelTraining
    }

    // Если у пользователя нет собственной модели, но он сотрудник HaimGroupMedia
    if (isHaimStaff && botName === 'HaimGroupMedia_bot') {
      logger.debug(
        `🎯 Ищем общую модель для сотрудника HaimGroupMedia: ${telegram_id}`
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
          // Помечаем как общую модель для последующей обработки
          id: `shared_${sharedModel.id}`,
        }

        logger.debug(
          `✅ Предоставлена общая модель "${sharedModel.model_name}" для пользователя ${telegram_id}`
        )
        return modifiedSharedModel as ModelTraining
      }
    }

    // Если ничего не найдено
    if (userError) {
      logger.error(`Error getting user model (${api}):`, userError)
    }

    return null
  } catch (error) {
    logger.error(
      `Unexpected error in getLatestUserModelForHaim (${api}):`,
      error
    )
    return null
  }
}
