import { supabase } from './client'
import { logger } from '@/utils/logger'
import { ADMIN_IDS_ARRAY } from '@/config'
import { getUserDetailsSubscription } from './getUserDetailsSubscription'

/**
 * 🦸‍♂️ НОВАЯ СИСТЕМА ЛИМИТОВ ГЕНЕРАЦИИ СУПЕРГЕРОЕВ
 *
 * Логика лимитов:
 * - Админы: Безлимитный доступ
 * - NEUROTESTER подписка: Безлимитный доступ
 * - Обычные пользователи: 3 генерации в месяц
 *
 * @param telegram_id - ID пользователя в Telegram
 * @returns Объект с информацией о возможности генерации
 */
export const checkSuperheroGenerationUsage = async (
  telegram_id: string | number
): Promise<{
  canGenerate: boolean
  isAdmin: boolean
  hasUnlimitedAccess: boolean
  currentUsage: number
  maxUsage: number
  resetDate?: string
  reason?: string
  /**
   * `false` when the monthly count could not be read and this answer is a
   * fail-open guess rather than a measurement.
   *
   * The two error paths below return `canGenerate: true` and call it a "safe
   * default". That was safe only while the thing it gates was broken: the free
   * AvatarTransform bypass compared session.mode against the enum KEY instead
   * of its value, so it never fired and every "free" generation was paid for
   * anyway. Repairing the bypass makes these paths mean "unlimited free paid
   * generations during a database hiccup". Callers must keep letting the person
   * generate when this is `false` -- that is the access decision, and staying
   * open there is deliberate -- but must NOT hand out the free one on a count
   * nobody could read.
   */
  quotaKnown: boolean
}> => {
  const telegramIdStr = telegram_id.toString()
  const numericTelegramId = parseInt(telegramIdStr, 10)

  logger.info(
    '[checkSuperheroGenerationUsage] Checking superhero generation limits',
    {
      telegram_id: telegramIdStr,
    }
  )

  // Проверяем админский статус
  const isAdmin = ADMIN_IDS_ARRAY.includes(numericTelegramId)

  if (isAdmin) {
    logger.info(
      '[checkSuperheroGenerationUsage] Admin detected - unlimited access',
      {
        telegram_id: telegramIdStr,
      }
    )
    return {
      canGenerate: true,
      isAdmin: true,
      hasUnlimitedAccess: true,
      currentUsage: 0,
      maxUsage: -1, // -1 означает безлимит
      reason: 'Admin privileges',
      quotaKnown: true,
    }
  }

  try {
    // Проверяем активную подписку
    const subscriptionDetails = await getUserDetailsSubscription(telegramIdStr)

    // NEUROTESTER подписка даёт безлимитный доступ
    if (
      subscriptionDetails?.subscriptionType === 'NEUROTESTER' &&
      subscriptionDetails?.isSubscriptionActive
    ) {
      logger.info(
        '[checkSuperheroGenerationUsage] NEUROTESTER subscription - unlimited access',
        {
          telegram_id: telegramIdStr,
          subscriptionType: subscriptionDetails.subscriptionType,
        }
      )
      return {
        canGenerate: true,
        isAdmin: false,
        hasUnlimitedAccess: true,
        currentUsage: 0,
        maxUsage: -1,
        reason: 'NEUROTESTER subscription',
        quotaKnown: true,
      }
    }

    // Для обычных пользователей проверяем месячный лимит (3 генерации)
    const now = new Date()
    const currentMonth = now.getMonth() + 1 // 1-12
    const currentYear = now.getFullYear()

    // Следующий месяц для resetDate
    const nextMonth = currentMonth === 12 ? 1 : currentMonth + 1
    const nextYear = currentMonth === 12 ? currentYear + 1 : currentYear
    const resetDate = new Date(nextYear, nextMonth - 1, 1)
      .toISOString()
      .split('T')[0]

    // Получаем текущее использование
    const { data: usageData, error } = await supabase
      .from('superhero_generations')
      .select('generation_count')
      .eq('telegram_id', telegramIdStr)
      .eq('month', currentMonth)
      .eq('year', currentYear)
      .single()

    const currentUsage = usageData?.generation_count || 0
    const maxUsage = 3

    if (error && error.code !== 'PGRST116') {
      logger.error('[checkSuperheroGenerationUsage] Database error', {
        telegram_id: telegramIdStr,
        error: error.message,
      })
      // При ошибке разрешаем использование (safe default)
      return {
        canGenerate: true,
        isAdmin: false,
        hasUnlimitedAccess: false,
        currentUsage: 0,
        maxUsage: maxUsage,
        reason: 'Database error - allowing generation',
        // Access stays open; the FREE generation does not ride on a count
        // nobody could read.
        quotaKnown: false,
      }
    }

    const canGenerate = currentUsage < maxUsage

    logger.info('[checkSuperheroGenerationUsage] Usage check completed', {
      telegram_id: telegramIdStr,
      currentUsage,
      maxUsage,
      canGenerate,
      subscriptionType: subscriptionDetails?.subscriptionType || 'none',
      isSubscriptionActive: subscriptionDetails?.isSubscriptionActive || false,
    })

    return {
      canGenerate,
      isAdmin: false,
      hasUnlimitedAccess: false,
      currentUsage,
      maxUsage,
      resetDate,
      reason: canGenerate
        ? `${currentUsage}/${maxUsage} generations used`
        : `Monthly limit reached (${currentUsage}/${maxUsage})`,
      quotaKnown: true,
    }
  } catch (error) {
    logger.error('[checkSuperheroGenerationUsage] Unexpected error', {
      telegram_id: telegramIdStr,
      error: error instanceof Error ? error.message : 'Unknown error',
    })

    // При неожиданной ошибке разрешаем использование
    return {
      canGenerate: true,
      isAdmin: false,
      hasUnlimitedAccess: false,
      currentUsage: 0,
      maxUsage: 3,
      reason: 'Error occurred - allowing generation',
      quotaKnown: false,
    }
  }
}
