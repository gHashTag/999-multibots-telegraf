import { supabase } from '.'
import { Logger as logger } from '@/utils/logger'

export interface GetUsersByStatusParams {
  status: string
  limit?: number
  offset?: number
  order?: 'asc' | 'desc'
  orderBy?: string
}

export const getUsersByStatus = async ({
  status,
  limit = 10,
  offset = 0,
  order = 'desc',
  orderBy = 'created_at',
}: GetUsersByStatusParams) => {
  try {
    if (!status) {
      throw new Error('status is required')
    }

    logger.info('🔍 Получение пользователей по статусу:', {
      description: 'Getting users by status',
      status,
      limit,
      offset,
      order,
      orderBy,
    })

    const { data: users, error } = await supabase
      .from('users')
      .select('*')
      .eq('status', status)
      .order(orderBy, { ascending: order === 'asc' })
      .range(offset, offset + limit - 1)

    if (error) {
      logger.error('❌ Ошибка при получении пользователей:', {
        description: 'Error getting users',
        error: error.message,
        status,
      })
      throw error
    }

    logger.info('✅ Пользователи успешно получены:', {
      description: 'Users retrieved successfully',
      status,
      count: users?.length || 0,
    })

    return users || []
  } catch (error) {
    logger.error('❌ Ошибка в getUsersByStatus:', {
      description: 'Error in getUsersByStatus function',
      error: error instanceof Error ? error.message : String(error),
      status,
    })
    throw error
  }
}
