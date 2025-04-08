import { supabase } from '.'
import { Logger as logger } from '@/utils/logger'

export interface GetUsersByMetadataParams {
  metadata: Record<string, any>
  limit?: number
  offset?: number
  order?: 'asc' | 'desc'
  orderBy?: string
}

export const getUsersByMetadata = async ({
  metadata,
  limit = 10,
  offset = 0,
  order = 'desc',
  orderBy = 'created_at',
}: GetUsersByMetadataParams) => {
  try {
    if (!metadata || Object.keys(metadata).length === 0) {
      throw new Error('metadata is required and should not be empty')
    }

    logger.info('🔍 Получение пользователей по метаданным:', {
      description: 'Getting users by metadata',
      metadata,
      limit,
      offset,
      order,
      orderBy,
    })

    let query = supabase
      .from('users')
      .select('*')
      .order(orderBy, { ascending: order === 'asc' })
      .range(offset, offset + limit - 1)

    // Добавляем фильтры по метаданным
    Object.entries(metadata).forEach(([key, value]) => {
      query = query.contains('metadata', { [key]: value })
    })

    const { data: users, error } = await query

    if (error) {
      logger.error('❌ Ошибка при получении пользователей:', {
        description: 'Error getting users',
        error: error.message,
        metadata,
      })
      throw error
    }

    logger.info('✅ Пользователи успешно получены:', {
      description: 'Users retrieved successfully',
      metadata,
      count: users?.length || 0,
    })

    return users || []
  } catch (error) {
    logger.error('❌ Ошибка в getUsersByMetadata:', {
      description: 'Error in getUsersByMetadata function',
      error: error instanceof Error ? error.message : String(error),
      metadata,
    })
    throw error
  }
}
