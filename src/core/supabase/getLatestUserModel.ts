import { supabase } from '.'
import { ModelTraining } from '@/interfaces'

export async function getLatestUserModel(
  userId: number
): Promise<ModelTraining | null> {
  const { data, error } = await supabase
    .from('model_trainings')
    .select('model_name, trigger_word, model_url')
    .eq('telegram_id', userId)
    .eq('status', 'SUCCESS')
    .order('created_at', { ascending: false })
    .limit(1)
    .single()
  console.log(data, 'getLatestUserModel')
  if (error) {
    console.error('Error getting user model:', error)
    return null
  }

  return data as ModelTraining
}
