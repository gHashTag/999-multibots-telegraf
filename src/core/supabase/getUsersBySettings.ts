import { supabase } from '.'
import { logger } from '@/utils/logger'

export interface GetUsersBySettingsParams {
  settings: Record<string, any>
  limit?: number
  offset?: number
  order?: 'asc' | 'desc'
  orderBy?: string
}

export const getUsersBySettings = async ({
  settings,
  limit = 10,
  offset = 0,
  order = 'desc',
  orderBy = 'created_at',
}: GetUsersBySettingsParams) => {
  try {
    if (!settings || Object.keys(settings).length === 0) {
      throw new Error('settings is required and should not be empty')
    }

    logger.info('🔍 Получение пользователей по настройкам:', {
      description: 'Getting users by settings',
      settings,
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

    // Добавляем фильтры по настройкам
    Object.entries(settings).forEach(([key, value]) => {
      query = query.contains('settings', { [key]: value })
    })

    const { data: users, error } = await query

    if (error) {
      logger.error('❌ Ошибка при получении пользователей:', {
        description: 'Error getting users',
        error: error.message,
        settings,
      })
      throw error
    }

    logger.info('✅ Пользователи успешно получены:', {
      description: 'Users retrieved successfully',
      settings,
      count: users?.length || 0,
    })

    return users || []
  } catch (error) {
    logger.error('❌ Ошибка в getUsersBySettings:', {
      description: 'Error in getUsersBySettings function',
      error: error instanceof Error ? error.message : String(error),
      settings,
    })
    throw error
  }
}
