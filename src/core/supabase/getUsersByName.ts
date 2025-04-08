import { supabase } from '.'
import { Logger as logger } from '@/utils/logger'

export interface GetUsersByNameParams {
  name: string
  limit?: number
  offset?: number
  order?: 'asc' | 'desc'
  orderBy?: string
}

export const getUsersByName = async ({
  name,
  limit = 10,
  offset = 0,
  order = 'desc',
  orderBy = 'created_at',
}: GetUsersByNameParams) => {
  try {
    if (!name) {
      throw new Error('name is required')
    }

    logger.info('🔍 Получение пользователей по имени:', {
      description: 'Getting users by name',
      name,
      limit,
      offset,
      order,
      orderBy,
    })

    const { data: users, error } = await supabase
      .from('users')
      .select('*')
      .or(`first_name.ilike.%${name}%,last_name.ilike.%${name}%`)
      .order(orderBy, { ascending: order === 'asc' })
      .range(offset, offset + limit - 1)

    if (error) {
      logger.error('❌ Ошибка при получении пользователей:', {
        description: 'Error getting users',
        error: error.message,
        name,
      })
      throw error
    }

    logger.info('✅ Пользователи успешно получены:', {
      description: 'Users retrieved successfully',
      name,
      count: users?.length || 0,
    })

    return users || []
  } catch (error) {
    logger.error('❌ Ошибка в getUsersByName:', {
      description: 'Error in getUsersByName function',
      error: error instanceof Error ? error.message : String(error),
      name,
    })
    throw error
  }
}
