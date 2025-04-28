import { Context } from 'telegraf'
import { supabase } from './client'
import { logger } from '@/utils/logger'

export const getUserByTelegramId = async (ctx: Context) => {
  logger.info('[getUserByTelegramId] Function called')
  try {
    if (!ctx.from) {
      logger.error('[getUserByTelegramId] ctx.from is missing!')
      throw new Error('User not found in context')
    }

    const telegramId = ctx.from.id.toString()
    logger.info(
      `[getUserByTelegramId] Attempting to find user with telegramId: ${telegramId}`
    )

    const { data: user, error: dbError } = await supabase
      .from('users')
      .select('*')
      .eq('telegram_id', telegramId)
      .single()

    if (dbError) {
      logger.error(
        `[getUserByTelegramId] Supabase error for telegramId ${telegramId}:`,
        dbError
      )
    } else {
      logger.info(
        `[getUserByTelegramId] Supabase result for telegramId ${telegramId}: ${user ? 'User found' : 'User not found'}`
      )
    }

    if (!user && !dbError) {
      logger.warn(
        `[getUserByTelegramId] No user data returned from Supabase for telegramId ${telegramId}, but no DB error reported.`
      )
    }

    return user
  } catch (error) {
    logger.error('[getUserByTelegramId] Caught error:', error)
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
