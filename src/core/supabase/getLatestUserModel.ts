import { supabase } from '.'
import { ModelTraining } from '@/interfaces'

export async function getLatestUserModel(
  telegram_id: number,
  api: string
): Promise<ModelTraining | null> {
  try {
    const { data, error } = await supabase
      .from('model_trainings')
      .select('*')
      .eq('telegram_id', telegram_id)
      .eq('status', 'COMPLETED')
      .eq('api', api)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()
    console.log(data, 'getLatestUserModel')
    if (error) {
      console.error('Error getting user model:', error)
      return null
    }

    return data as ModelTraining
  } catch (error) {
    console.error('Error getting user model:', error)
    return null
  }
}
