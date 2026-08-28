import { Context } from 'telegraf'
import { supabase } from './client'
import { logger } from '@/utils/logger'
import { User } from '@/interfaces/user.interface'
import { MyContext } from '@/interfaces'
import { deduplicateUsers } from './deduplicateUsers'

export async function getUserByTelegramId(
  ctxOrTelegramId: MyContext | string
): Promise<User | null> {
  try {
    let telegramId: string
    if (typeof ctxOrTelegramId === 'string') {
      telegramId = ctxOrTelegramId
    } else {
      if (!ctxOrTelegramId.from) {
        logger.error('[getUserByTelegramId] User not found in context', {
          telegramId: 'unknown',
        })
        throw new Error('User not found in context')
      }
      telegramId = ctxOrTelegramId.from.id.toString()
    }
    logger.info('[getUserByTelegramId] Fetching user', { telegramId })

    // 🛡️ BEST PRACTICE: Robust query with duplicate handling
    const { data: users, error: dbError } = await supabase
      .from('users')
      .select('*')
      .eq('telegram_id', telegramId)
      .order('updated_at', { ascending: false }) // Latest first
      .limit(10) // Safety limit

    if (dbError) {
      logger.error(
        `[getUserByTelegramId] Supabase error for telegramId ${telegramId}:`,
        dbError
      )
      return null
    }

    if (!users || users.length === 0) {
      logger.info(
        `[getUserByTelegramId] No user found for telegramId ${telegramId}`
      )
      return null
    }

    // 🚨 BEST PRACTICE: Handle duplicates gracefully
    if (users.length > 1) {
      logger.warn(
        `[getUserByTelegramId] DUPLICATE WARNING: Found ${users.length} users for telegramId ${telegramId}. Using most recent.`,
        {
          telegramId,
          duplicateCount: users.length,
          userIds: users.map(u => u.id),
          createdDates: users.map(u => u.created_at),
        }
      )

      // 🧹 BEST PRACTICE: Auto-cleanup duplicates in background
      deduplicateUsers(telegramId).catch(error => {
        logger.error(
          `[getUserByTelegramId] Failed to deduplicate users for ${telegramId}:`,
          error
        )
      })
    }

    const user = users[0] // Most recent user
    logger.info(
      `[getUserByTelegramId] User found for telegramId ${telegramId}`,
      {
        telegramId,
        userId: user.id,
        duplicatesFound: users.length > 1,
      }
    )

    return user
  } catch (error) {
    logger.error('[getUserByTelegramId] Caught error', {
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

    // 🛡️ BEST PRACTICE: Check for existing user with duplicate handling
    const { data: existingUsers } = await supabase
      .from('users')
      .select('*')
      .eq('telegram_id', telegramId)
      .order('updated_at', { ascending: false })
      .limit(5)

    if (existingUsers && existingUsers.length > 0) {
      if (existingUsers.length > 1) {
        logger.warn(
          `[createUserByTelegramId] DUPLICATE WARNING: Found ${existingUsers.length} existing users for telegramId ${telegramId}`,
          {
            telegramId,
            duplicateCount: existingUsers.length,
            userIds: existingUsers.map(u => u.id),
          }
        )
      }
      return existingUsers[0] // Return most recent
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
