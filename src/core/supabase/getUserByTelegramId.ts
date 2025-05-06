import { Context } from 'telegraf'
import { supabase } from './client'
import { logger } from '@/utils/logger'
import { User } from '@/interfaces/user.interface'
import { MyContext } from '@/interfaces'

export async function getUserByTelegramId(
  ctxOrTelegramId: MyContext | string
): Promise<User | null> {
  try {
    let telegramId: string
    if (typeof ctxOrTelegramId === 'string') {
      telegramId = ctxOrTelegramId
    } else {
      if (!ctxOrTelegramId.from) {
        logger.error({
          message: '[getUserByTelegramId] User not found in context',
          telegramId: 'unknown',
        })
        throw new Error('User not found in context')
      }
      telegramId = ctxOrTelegramId.from.id.toString()
    }
    logger.info({ message: '[getUserByTelegramId] Fetching user', telegramId })

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
    logger.error({
      message: '[getUserByTelegramId] Caught error',
      error: error instanceof Error ? error.message : 'Unknown error',
      telegramId:
        typeof ctxOrTelegramId === 'string'
          ? ctxOrTelegramId
          : ctxOrTelegramId.from?.id.toString() || 'unknown',
    })
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
