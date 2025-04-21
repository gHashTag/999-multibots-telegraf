import { MyContext } from '@/interfaces'
import { supabase } from '@/core/supabase'

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

    // Проверяем, отличается ли текущий bot_name от сохраненного
    if (data.bot_name !== ctx.botInfo.username) {
      console.log(
        'BOT_NAME changed, updating... bot_name:',
        ctx.botInfo.username
      )
      const { error: updateError } = await supabase
        .from('users')
        .update({ bot_name: ctx.botInfo.username })
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
