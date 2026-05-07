/**
 * Работа с таблицей user_feature_views
 *
 * Отслеживание первого просмотра справки по функциям
 * для улучшения UX (показывать справку только новичкам)
 */

import { supabase } from './client'
import { logger } from '@/utils/logger'

/**
 * Проверить, видел ли пользователь справку по функции
 */
export async function hasUserSeenFeature(
  telegramId: string,
  featureMode: string
): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('user_feature_views')
      .select('id')
      .eq('telegram_id', telegramId)
      .eq('feature_mode', featureMode)
      .maybeSingle()

    if (error) {
      logger.error('❌ [featureViews] Error checking feature view', {
        telegramId,
        featureMode,
        error: error.message,
      })
      // При ошибке считаем что не видел - покажем справку
      return false
    }

    return data !== null
  } catch (error) {
    logger.error('❌ [featureViews] Exception checking feature view', {
      telegramId,
      featureMode,
      error: error instanceof Error ? error.message : String(error),
    })
    return false
  }
}

/**
 * Отметить что пользователь видел справку по функции
 */
export async function markFeatureAsSeen(
  telegramId: string,
  featureMode: string
): Promise<boolean> {
  try {
    const { error } = await supabase.from('user_feature_views').upsert(
      {
        telegram_id: telegramId,
        feature_mode: featureMode,
        first_view_at: new Date().toISOString(),
      },
      {
        onConflict: 'telegram_id,feature_mode',
        ignoreDuplicates: true,
      }
    )

    if (error) {
      logger.error('❌ [featureViews] Error marking feature as seen', {
        telegramId,
        featureMode,
        error: error.message,
      })
      return false
    }

    logger.info('✅ [featureViews] Feature marked as seen', {
      telegramId,
      featureMode,
    })
    return true
  } catch (error) {
    logger.error('❌ [featureViews] Exception marking feature as seen', {
      telegramId,
      featureMode,
      error: error instanceof Error ? error.message : String(error),
    })
    return false
  }
}

/**
 * Получить список всех функций которые пользователь уже видел
 */
export async function getUserSeenFeatures(
  telegramId: string
): Promise<string[]> {
  try {
    const { data, error } = await supabase
      .from('user_feature_views')
      .select('feature_mode')
      .eq('telegram_id', telegramId)

    if (error) {
      logger.error('❌ [featureViews] Error getting seen features', {
        telegramId,
        error: error.message,
      })
      return []
    }

    return data?.map(row => row.feature_mode) ?? []
  } catch (error) {
    logger.error('❌ [featureViews] Exception getting seen features', {
      telegramId,
      error: error instanceof Error ? error.message : String(error),
    })
    return []
  }
}

/**
 * Сбросить просмотры для пользователя (для тестирования)
 */
export async function resetUserFeatureViews(
  telegramId: string
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('user_feature_views')
      .delete()
      .eq('telegram_id', telegramId)

    if (error) {
      logger.error('❌ [featureViews] Error resetting feature views', {
        telegramId,
        error: error.message,
      })
      return false
    }

    logger.info('🔄 [featureViews] Feature views reset', { telegramId })
    return true
  } catch (error) {
    logger.error('❌ [featureViews] Exception resetting feature views', {
      telegramId,
      error: error instanceof Error ? error.message : String(error),
    })
    return false
  }
}
