import { supabase } from '.'
import { logger } from '@/utils/logger'

export interface GetUsersByLanguageParams {
  language_code: string
  limit?: number
  offset?: number
  order?: 'asc' | 'desc'
  orderBy?: string
}

export const getUsersByLanguage = async ({
  language_code,
  limit = 10,
  offset = 0,
  order = 'desc',
  orderBy = 'created_at',
}: GetUsersByLanguageParams) => {
  try {
    if (!language_code) {
      throw new Error('language_code is required')
    }

    logger.info('🔍 Получение пользователей по языку:', {
      description: 'Getting users by language',
      language_code,
      limit,
      offset,
      order,
      orderBy,
    })

    const { data: users, error } = await supabase
      .from('users')
      .select('*')
      .eq('language_code', language_code)
      .order(orderBy, { ascending: order === 'asc' })
      .range(offset, offset + limit - 1)

    if (error) {
      logger.error('❌ Ошибка при получении пользователей:', {
        description: 'Error getting users',
        error: error.message,
        language_code,
      })
      throw error
    }

    logger.info('✅ Пользователи успешно получены:', {
      description: 'Users retrieved successfully',
      language_code,
      count: users?.length || 0,
    })

    return users || []
  } catch (error) {
    logger.error('❌ Ошибка в getUsersByLanguage:', {
      description: 'Error in getUsersByLanguage function',
      error: error instanceof Error ? error.message : String(error),
      language_code,
    })
    throw error
  }
}
