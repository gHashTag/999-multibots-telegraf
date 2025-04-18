import { supabase } from '@/core/supabase'

export async function updateUserSubscription(
  userId: string,
  subscription: string
) {
  try {
    const { data, error } = await supabase
      .from('users')
      .update({ subscription })
      .eq('telegram_id', userId)

    if (error) {
      console.error('Error updating subscription:', error)
      throw error
    }

    return data
  } catch (error) {
    console.error('Error updating subscription:', error)
    throw error
  }
}
