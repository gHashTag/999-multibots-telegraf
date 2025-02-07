import { MyContext } from '@/interfaces'
import { supabase } from '.'

export async function getUserByTelegramId(ctx: MyContext) {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('telegram_id', ctx.from.id.toString())
      .single()

    if (error) {
      console.error('User not registered')
      return null
    }

    // Проверяем, отличается ли текущий токен от сохраненного
    if (data.token !== ctx.telegram.token) {
      console.log('Token changed, updating...')
      const { error: updateError } = await supabase
        .from('users')
        .update({ token: ctx.telegram.token })
        .eq('telegram_id', ctx.from.id.toString())

      if (updateError) {
        console.error('Error updating token:', updateError)
      } else {
        console.log('Token updated successfully')
      }
    }

    return data
  } catch (error) {
    console.error('Unexpected error fetching user by Telegram ID:', error)
    return null
  }
}
