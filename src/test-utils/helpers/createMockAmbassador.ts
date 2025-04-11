import { supabase } from '@/core/supabase'
import { logger } from '@/utils/logger'

/**
 * Тип для представления амбассадора в тестах
 */
export interface Ambassador {
  id: string
  telegram_id: string
  username: string
  full_name: string
  status: string
  commission_rate: number
  created_at: string
}

/**
 * Параметры для создания тестового амбассадора
 */
export interface CreateMockAmbassadorParams {
  telegramId: string
  username: string
  fullName: string
  status?: string
  commissionRate?: number
}

/**
 * Создает тестового амбассадора в базе данных
 *
 * @param params Параметры для создания амбассадора
 * @returns Объект созданного амбассадора
 */
export async function createMockAmbassador(
  params: CreateMockAmbassadorParams
): Promise<Ambassador> {
  try {
    // Проверяем, существует ли уже амбассадор с таким telegram_id
    const { data: existingAmbassador } = await supabase
      .from('ambassadors')
      .select('*')
      .eq('telegram_id', params.telegramId)
      .single()

    if (existingAmbassador) {
      logger.info('ℹ️ Амбассадор уже существует, используем его', {
        description: 'Ambassador already exists, using it',
        telegramId: params.telegramId,
        username: params.username,
      })
      return existingAmbassador as Ambassador
    }

    // Создаем нового амбассадора
    const ambassadorData = {
      telegram_id: params.telegramId,
      username: params.username,
      full_name: params.fullName,
      status: params.status || 'active',
      commission_rate:
        params.commissionRate !== undefined ? params.commissionRate : 0.1, // 10% по умолчанию
      created_at: new Date().toISOString(),
    }

    const { data, error } = await supabase
      .from('ambassadors')
      .insert(ambassadorData)
      .select()
      .single()

    if (error) {
      throw new Error(
        `Ошибка при создании тестового амбассадора: ${error.message}`
      )
    }

    if (!data) {
      throw new Error('Не удалось создать тестового амбассадора')
    }

    logger.info('✅ Успешно создан тестовый амбассадор', {
      description: 'Test ambassador created successfully',
      ambassadorId: data.id,
      telegramId: data.telegram_id,
    })

    return data as Ambassador
  } catch (error: any) {
    logger.error('❌ Ошибка при создании тестового амбассадора', {
      description: 'Error creating test ambassador',
      error: error.message,
      stack: error.stack,
    })
    throw error
  }
}

/**
 * Удаляет тестового амбассадора из базы данных
 *
 * @param ambassadorId ID амбассадора для удаления
 */
export async function deleteMockAmbassador(
  ambassadorId: string
): Promise<void> {
  try {
    const { error } = await supabase
      .from('ambassadors')
      .delete()
      .eq('id', ambassadorId)

    if (error) {
      throw new Error(
        `Ошибка при удалении тестового амбассадора: ${error.message}`
      )
    }

    logger.info('✅ Успешно удален тестовый амбассадор', {
      description: 'Test ambassador deleted successfully',
      ambassadorId: ambassadorId,
    })
  } catch (error: any) {
    logger.error('❌ Ошибка при удалении тестового амбассадора', {
      description: 'Error deleting test ambassador',
      error: error.message,
      stack: error.stack,
    })
    throw error
  }
}
