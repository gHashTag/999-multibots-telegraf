import { supabase } from '.'
import { Logger as logger } from '@/utils/logger'

export interface GetUsersByLastLoginParams {
  start_date: Date
  end_date: Date
  limit?: number
  offset?: number
  order?: 'asc' | 'desc'
  orderBy?: string
}

export const getUsersByLastLogin = async ({
  start_date,
  end_date,
  limit = 10,
  offset = 0,
  order = 'desc',
  orderBy = 'last_login',
}: GetUsersByLastLoginParams) => {
  try {
    if (!start_date || !end_date) {
      throw new Error('start_date and end_date are required')
    }

    logger.info('🔍 Получение пользователей по дате последнего входа:', {
      description: 'Getting users by last login date',
      start_date,
      end_date,
      limit,
      offset,
      order,
      orderBy,
    })

    const { data: users, error } = await supabase
      .from('users')
      .select('*')
      .gte('last_login', start_date.toISOString())
      .lte('last_login', end_date.toISOString())
      .order(orderBy, { ascending: order === 'asc' })
      .range(offset, offset + limit - 1)

    if (error) {
      logger.error('❌ Ошибка при получении пользователей:', {
        description: 'Error getting users',
        error: error.message,
        start_date,
        end_date,
      })
      throw error
    }

    logger.info('✅ Пользователи успешно получены:', {
      description: 'Users retrieved successfully',
      start_date,
      end_date,
      count: users?.length || 0,
    })

    return users || []
  } catch (error) {
    logger.error('❌ Ошибка в getUsersByLastLogin:', {
      description: 'Error in getUsersByLastLogin function',
      error: error instanceof Error ? error.message : String(error),
      start_date,
      end_date,
    })
    throw error
  }
}
