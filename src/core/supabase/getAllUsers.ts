import { supabase } from '.'
import { Logger as logger } from '@/utils/logger'

export interface GetAllUsersParams {
  limit?: number
  offset?: number
  order?: 'asc' | 'desc'
  orderBy?: string
}

export const getAllUsers = async ({
  limit = 10,
  offset = 0,
  order = 'desc',
  orderBy = 'created_at',
}: GetAllUsersParams = {}) => {
  try {
    logger.info('🔍 Получение списка пользователей:', {
      description: 'Getting users list',
      limit,
      offset,
      order,
      orderBy,
    })

    const { data: users, error } = await supabase
      .from('users')
      .select('*')
      .order(orderBy, { ascending: order === 'asc' })
      .range(offset, offset + limit - 1)

    if (error) {
      logger.error('❌ Ошибка при получении пользователей:', {
        description: 'Error getting users',
        error: error.message,
      })
      throw error
    }

    logger.info('✅ Список пользователей успешно получен:', {
      description: 'Users list retrieved successfully',
      count: users?.length || 0,
    })

    return users || []
  } catch (error) {
    logger.error('❌ Ошибка в getAllUsers:', {
      description: 'Error in getAllUsers function',
      error: error instanceof Error ? error.message : String(error),
    })
    throw error
  }
}
