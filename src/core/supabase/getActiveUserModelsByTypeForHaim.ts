import { supabase } from '@/core/supabase'
import { ModelTraining } from '@/interfaces'
import { HAIM_GROUP_STAFF_IDS } from '@/navigation'

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

      // 🎯 ПОЛУЧАЕМ ВСЕ ОБЩИЕ МОДЕЛИ ДЛЯ HAIM GROUP СОТРУДНИКОВ
      console.log('🔍 Загружаем общие модели для HAIM сотрудников...')

      // 1️⃣ Модель Вячеслава Неклюдова
      const { data: vyacheslavModel, error: vyacheslavError } = await supabase
        .from('model_trainings')
        .select('*')
        .eq('id', 'cf5f2b0f-4b86-478c-b4c3-88ca77f95fbc')
        .eq('status', 'SUCCESS')
        .single()

      // 2️⃣ CocoAge модель
      const { data: cocoAgeModel, error: cocoAgeError } = await supabase
        .from('model_trainings')
        .select('*')
        .eq('id', 'ed2c6365-e782-4816-a1ef-1e26b79f6da0')
        .eq('status', 'SUCCESS')
        .single()

      // Добавляем модель Вячеслава
      if (!vyacheslavError && vyacheslavModel) {
        const vyacheslavShared = {
          ...vyacheslavModel,
          model_name: `👨‍💼 Вячеслав (Общая модель)`,
          id: `shared_vyacheslav_${vyacheslavModel.id}`,
        }
        allModels.unshift(vyacheslavShared)
        console.log(`✅ Добавлена общая модель Вячеслава для ${telegram_id}`)
      }

      // Добавляем CocoAge модель
      if (!cocoAgeError && cocoAgeModel) {
        const cocoAgeShared = {
          ...cocoAgeModel,
          model_name: `🥥 CocoAge (Общая модель)`,
          id: `shared_cocoage_${cocoAgeModel.id}`,
        }
        allModels.unshift(cocoAgeShared)
        console.log(`✅ Добавлена общая CocoAge модель для ${telegram_id}`)
      }

      console.log(
        `🎯 Всего общих моделей добавлено: ${[vyacheslavModel, cocoAgeModel].filter(Boolean).length}`
      )
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
