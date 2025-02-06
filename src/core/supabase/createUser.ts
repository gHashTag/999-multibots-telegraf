import { CreateUserData } from '@/interfaces'
import { supabase } from '.'

export const createUser = async (userData: CreateUserData) => {
  const {
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
    balance,
    inviter,
  } = userData

  let inviterUser
  if (inviter) {
    const { data: checkInviter, error: fetchError } = await supabase
      .from('users')
      .select('user_id')
      .eq('user_id', inviter)
      .maybeSingle()

    if (fetchError)
      throw new Error(`Ошибка при проверке инвайтера: ${fetchError.message}`)
    inviterUser = checkInviter
  }

  const isInviter = inviter && inviterUser

  const { data: existingUser, error } = await supabase
    .from('users')
    .select('*')
    .eq('telegram_id', telegram_id.toString())
    .maybeSingle()

  if (error) {
    throw new Error(
      `Ошибка при проверке существующего пользователя: ${error.message}`
    )
  }

  if (existingUser) {
    const updates = {
      username,
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
      balance,
      ...(!existingUser.inviter && isInviter ? { inviter } : {}),
    }

    const { error: updateError } = await supabase
      .from('users')
      .update(updates)
      .eq('telegram_id', telegram_id.toString())

    if (updateError) {
      throw new Error(
        `Ошибка при обновлении пользователя: ${updateError.message}`
      )
    }
  } else {
    // Создаем базовый объект пользователя без inviter
    const newUser = {
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
      balance,
      ...(isInviter ? { inviter } : {}),
    }

    const { error: insertError } = await supabase
      .from('users')
      .insert([newUser])

    if (insertError) {
      throw new Error(
        `Ошибка при добавлении пользователя: ${insertError.message}`
      )
    }
  }

  return existingUser
}
