import { supabase } from './'

export const getTrainingCancelUrl = async (
  trainingId: string
): Promise<string | null> => {
  try {
    const { data, error } = await supabase
      .from('model_trainings')
      .select('cancel_url')
      .eq('replicate_training_id', trainingId)
      .single()

    if (error) {
      console.log(`⚠️ Ошибка Supabase: ${error.message}`)
      return null
    }

    if (!data || !data.cancel_url) {
      console.log(`⚠️ URL отмены не найден для тренировки: ${trainingId}`)
      return null
    }

    console.log(`🔗 Получен URL отмены для тренировки ${trainingId}`)
    return data.cancel_url
  } catch (error) {
    console.error(`🚨 Ошибка при получении URL отмены: ${error}`)
    return null
  }
}
