import { supabase } from '@/core/supabase'
import { logger } from '@/utils/logger'
import { Ambassador } from './createMockAmbassador'

/**
 * Интерфейс для аватара бота
 */
export interface AvatarBot {
  id: string
  ambassador_id: string
  bot_name: string
  created_at: string
  is_active: boolean
}

/**
 * Параметры для создания тестового аватара бота
 */
export interface CreateMockAvatarBotParams {
  ambassadorId: string
  botName: string
  isActive?: boolean
}

/**
 * Создает тестовый аватар бота в базе данных
 *
 * @param params Параметры для создания аватара бота
 * @returns Объект созданного аватара бота
 */
export async function createMockAvatarBot(
  params: CreateMockAvatarBotParams
): Promise<AvatarBot> {
  try {
    // Проверяем, существует ли уже аватар бота с такими параметрами
    const { data: existingAvatar } = await supabase
      .from('avatar_bots')
      .select('*')
      .eq('ambassador_id', params.ambassadorId)
      .eq('bot_name', params.botName)
      .single()

    if (existingAvatar) {
      logger.info('ℹ️ Аватар бота уже существует, используем его', {
        description: 'Avatar bot already exists, using it',
        ambassadorId: params.ambassadorId,
        botName: params.botName,
      })
      return existingAvatar as AvatarBot
    }

    // Создаем новый аватар бота
    const avatarData = {
      ambassador_id: params.ambassadorId,
      bot_name: params.botName,
      is_active: params.isActive !== undefined ? params.isActive : true,
      created_at: new Date().toISOString(),
    }

    const { data, error } = await supabase
      .from('avatar_bots')
      .insert(avatarData)
      .select()
      .single()

    if (error) {
      throw new Error(
        `Ошибка при создании тестового аватара бота: ${error.message}`
      )
    }

    if (!data) {
      throw new Error('Не удалось создать тестовый аватар бота')
    }

    logger.info('✅ Успешно создан тестовый аватар бота', {
      description: 'Test avatar bot created successfully',
      avatarId: data.id,
      ambassadorId: data.ambassador_id,
      botName: data.bot_name,
    })

    return data as AvatarBot
  } catch (error: any) {
    logger.error('❌ Ошибка при создании тестового аватара бота', {
      description: 'Error creating test avatar bot',
      error: error.message,
      stack: error.stack,
    })
    throw error
  }
}

/**
 * Удаляет тестовый аватар бота из базы данных
 *
 * @param avatarId ID аватара бота для удаления
 */
export async function deleteMockAvatarBot(avatarId: string): Promise<void> {
  try {
    const { error } = await supabase
      .from('avatar_bots')
      .delete()
      .eq('id', avatarId)

    if (error) {
      throw new Error(
        `Ошибка при удалении тестового аватара бота: ${error.message}`
      )
    }

    logger.info('✅ Успешно удален тестовый аватар бота', {
      description: 'Test avatar bot deleted successfully',
      avatarId: avatarId,
    })
  } catch (error: any) {
    logger.error('❌ Ошибка при удалении тестового аватара бота', {
      description: 'Error deleting test avatar bot',
      error: error.message,
      stack: error.stack,
    })
    throw error
  }
}
