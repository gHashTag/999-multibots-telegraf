import type { Context } from 'telegraf'
import { supabase } from './client'

export const getUserByTelegramId = async (ctx: Context) => {
  try {
    if (!ctx.from) {
      throw new Error('User not found in context')
    }

    const telegramId = ctx.from.id.toString()

    const { data: user } = await supabase
      .from('users')
      .select('*')
      .eq('telegram_id', telegramId)
      .single()

    return user
  } catch (error) {
    console.error('Error getting user by telegram id:', error)
    return null
  }
}

export const createUserByTelegramId = async (ctx: Context) => {
  try {
    if (!ctx.from) {
      throw new Error('User not found in context')
    }

    const telegramId = ctx.from.id.toString()

    const { data: existingUser } = await supabase
      .from('users')
      .select('*')
      .eq('telegram_id', telegramId)
      .single()

    if (existingUser) {
      return existingUser
    }

    const { data: newUser } = await supabase
      .from('users')
      .insert([
        {
          telegram_id: telegramId,
          first_name: ctx.from.first_name,
          last_name: ctx.from.last_name,
          username: ctx.from.username,
        },
      ])
      .select()
      .single()

    return newUser
  } catch (error) {
    console.error('Error creating user:', error)
    return null
  }
}
