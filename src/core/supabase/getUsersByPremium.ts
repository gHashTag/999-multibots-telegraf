import { supabase } from '.'
import { logger } from '@/utils/logger'

export interface GetUsersByPremiumParams {
  is_premium: boolean
  limit?: number
  offset?: number
  order?: 'asc' | 'desc'
  orderBy?: string
}

export const getUsersByPremium = async ({
  is_premium,
  limit = 10,
  offset = 0,
  order = 'desc',
  orderBy = 'created_at',
}: GetUsersByPremiumParams) => {
  try {
    if (is_premium === undefined) {
      throw new Error('is_premium is required')
    }

    logger.info('🔍 Получение пользователей по премиум-статусу:', {
      description: 'Getting users by premium status',
      is_premium,
      limit,
      offset,
      order,
      orderBy,
    })

    const { data: users, error } = await supabase
      .from('users')
      .select('*')
      .eq('is_premium', is_premium)
      .order(orderBy, { ascending: order === 'asc' })
      .range(offset, offset + limit - 1)

    if (error) {
      logger.error('❌ Ошибка при получении пользователей:', {
        description: 'Error getting users',
        error: error.message,
        is_premium,
      })
      throw error
    }

    logger.info('✅ Пользователи успешно получены:', {
      description: 'Users retrieved successfully',
      is_premium,
      count: users?.length || 0,
    })

    return users || []
  } catch (error) {
    logger.error('❌ Ошибка в getUsersByPremium:', {
      description: 'Error in getUsersByPremium function',
      error: error instanceof Error ? error.message : String(error),
      is_premium,
    })
    throw error
  }
}
