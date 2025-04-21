import { CreateUserData } from '@/interfaces'
import { supabase } from '@/core/supabase'

export const createUser = async ({
  username,
  telegram_id,
  first_name,
  last_name,
  is_bot,
  language_code,
  photo_url,
  chat_id,
  mode,
  model,
  count,
  aspect_ratio,
  inviter,
  bot_name,
}: CreateUserData) => {
  console.log('createUser:', username, telegram_id)
  const { data, error } = await supabase
    .from('users')
    .insert([
      {
        username,
        telegram_id,
        first_name,
        last_name,
        is_bot,
        language_code,
        photo_url,
        chat_id,
        mode,
        model,
        count,
        aspect_ratio,
        inviter,
        bot_name,
      },
    ])
    .select()

  if (error) {
    console.error('Error creating user:', error)
    throw error
  }

  return data
}
