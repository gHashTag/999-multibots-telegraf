import { supabase } from '.' // Предполагаемый путь к инициализированному клиенту Supabase
import { logger } from '../../utils/logger' // Предполагаемый путь к логгеру

export async function getTrainingWithUser(trainingId: string) {
  try {
    const { data, error } = await supabase
      .from('model_trainings')
      .select(
        `*,
        users (
          bot_name,
          telegram_id,
          language_code
        )
      `
      )
      .eq('replicate_training_id', trainingId)
      .single()

    if (error) {
      console.error('❌ Training fetch error:', error)
      // Логируем ошибку через основной логгер, а не только в консоль
      logger.error({
        message: 'Supabase error in getTrainingWithUser',
        error: error.message,
        details: error.details,
        hint: error.hint,
      })
      return null
    }
    console.log('data', data) // Оставим для отладки, если нужно
    logger.debug({
      message: 'Successfully fetched training with user',
      trainingId,
      dataCount: data ? 1 : 0,
    })

    return data as {
      id: string
      model_name: string
      // Добавим другие поля из model_trainings, если они нужны контроллеру
      status?: string
      model_url?: string
      weights?: string
      replicate_training_id?: string
      api?: string
      users: {
        bot_name: string
        telegram_id: number
        language_code: string
      } | null
    } | null // Указываем, что и сам объект может быть null
  } catch (error: any) {
    console.error('❌ Training fetch error (catch block):', error)
    logger.error({
      message: 'Exception in getTrainingWithUser',
      error: error.message,
      stack: error.stack,
    })
    return null
  }
}

// Определяем тип для обновлений и экспортируем его
export type UpdateLatestModelTrainingData = {
  status?: string
  error?: string | null // Replicate может прислать null в поле error
  model_url?: string | null
  replicate_training_id?: string
  weights?: string | null
  // api?: string; // api будет передаваться отдельным параметром
}

export const updateLatestModelTrainingQuick = async (
  updates: UpdateLatestModelTrainingData,
  api: string // api теперь обязательный параметр
) => {
  if (!updates.replicate_training_id) {
    logger.error(
      'updateLatestModelTrainingQuick: replicate_training_id is required for update'
    )
    return false // или throw new Error(...)
  }
  try {
    logger.debug({
      message: 'Updating model training status in DB',
      updates,
      api,
    })
    // Обновляем последнюю запись
    const { error: updateError } = await supabase
      .from('model_trainings')
      .update({ ...updates, api }) // api добавляется здесь
      .eq('replicate_training_id', updates.replicate_training_id)

    if (updateError) {
      logger.error({
        message: 'Supabase error in updateLatestModelTrainingQuick',
        error: updateError.message,
        details: updateError.details,
        hint: updateError.hint,
        replicate_training_id: updates.replicate_training_id,
      })
      // throw new Error(
      //   `Ошибка при обновлении последней записи о тренировке: ${updateError.message}`
      // )
      return false
    }
    logger.info({
      message: 'Successfully updated model training status',
      replicate_training_id: updates.replicate_training_id,
      status: updates.status,
    })
    return true // Возвращаем boolean для индикации успеха
  } catch (error: any) {
    logger.error({
      message: 'Exception in updateLatestModelTrainingQuick',
      error: error.message,
      stack: error.stack,
      replicate_training_id: updates.replicate_training_id,
    })
    return false
  }
}
