import { supabase } from './supabaseClient'
import {
  CoreModelTraining,
  CoreModelTrainingInsert,
} from '@/core/supabase/types' // Предполагаем, что такие типы существуют или будут созданы

// Тип для создания записи о тренировке в этом модуле
// Основан на CoreModelTrainingInsert, но может быть расширен специфичными полями модуля
export interface DigitalAvatarModelTrainingInsert
  extends CoreModelTrainingInsert {
  // Пока нет специфичных полей, но интерфейс создан для возможности расширения
  // Например, может быть: digitalAvatarSpecificField?: string
  telegram_id: number // Убедимся, что это поле ожидается таблицей или преобразуется в user_id
  bot_name: string
  gender: string
  steps: number
  api: string // 'replicate'
}

// Тип для обновления записи о тренировке
export interface DigitalAvatarModelTrainingUpdate {
  replicate_training_id?: string
  status?: string
  model_url?: string
  error?: string
}

/**
 * Создает запись о тренировке модели цифрового аватара в базе данных.
 */
export const createDigitalAvatarTrainingInDb = async (
  trainingData: DigitalAvatarModelTrainingInsert
): Promise<CoreModelTraining> => {
  // TODO: Преобразовать telegram_id в user_id, если таблица model_trainings ожидает user_id (UUID)
  // Пока предполагаем, что supabase сам обработает это или тип telegram_id совпадает с user_id в таблице
  const { data, error } = await supabase
    .from('model_trainings')
    .insert(trainingData as any) // Используем as any временно, пока типы не будут полностью согласованы
    .select()
    .single()

  if (error) {
    console.error('Error creating digital avatar training record:', error)
    throw new Error(
      `Ошибка при создании записи о тренировке цифрового аватара: ${error.message}`
    )
  }
  if (!data) {
    throw new Error(
      'Не удалось создать запись о тренировке и получить ее данные.'
    )
  }
  return data as CoreModelTraining
}

/**
 * Обновляет запись о тренировке модели цифрового аватара в базе данных.
 */
export const updateDigitalAvatarTrainingInDb = async (
  trainingId: string | number, // ID записи в таблице model_trainings
  updateData: DigitalAvatarModelTrainingUpdate
): Promise<CoreModelTraining> => {
  const { data, error } = await supabase
    .from('model_trainings')
    .update(updateData)
    .eq('id', trainingId)
    .select()
    .single()

  if (error) {
    console.error('Error updating digital avatar training record:', error)
    throw new Error(
      `Ошибка при обновлении записи о тренировке цифрового аватара: ${error.message}`
    )
  }
  if (!data) {
    throw new Error(
      'Не удалось обновить запись о тренировке и получить ее данные.'
    )
  }
  return data as CoreModelTraining
}
