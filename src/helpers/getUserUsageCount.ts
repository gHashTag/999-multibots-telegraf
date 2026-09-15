import { logger } from '@/utils/logger'
import { getUserBalanceStatsOptimized } from '@/core/supabase/getUserBalanceStatsOptimized'
import {
  TelegramId,
  normalizeTelegramId,
} from '@/interfaces/telegram.interface'

// In-memory cache for user experience checks to reduce database load
interface UserExperienceCache {
  shouldSkip: boolean
  timestamp: number
  botName?: string
  stats: {
    transactions: number
    income: number
    services: number
  }
}

// Cache TTL: 5 minutes for user experience data
const CACHE_TTL = 5 * 60 * 1000
// owner-scope: keyed by telegram id
const userExperienceCache = new Map<string, UserExperienceCache>()

/**
 * Gets the total usage count for a user based on their transaction history
 * Returns 0 for new users (no transactions) or in case of error
 * @param telegramId - User's Telegram ID
 * @param botName - Optional bot name for filtering
 * @returns Promise<number> - Total usage count
 */
export const getUserUsageCount = async (
  telegramId: TelegramId,
  botName?: string
): Promise<number> => {
  try {
    const normalizedId = normalizeTelegramId(telegramId)

    logger.info('[getUserUsageCount] Fetching user usage count', {
      telegramId: normalizedId,
      botName,
      function: 'getUserUsageCount',
    })

    // Get optimized balance stats which includes total_transactions
    const stats = await getUserBalanceStatsOptimized(
      normalizedId,
      botName,
      1, // limitServices - we only need the count, not detailed service breakdown
      1 // limitTransactions - we only need the count, not detailed transactions
    )

    if (!stats) {
      logger.info('[getUserUsageCount] No stats found, treating as new user', {
        telegramId: normalizedId,
        botName,
        usageCount: 0,
      })
      return 0
    }

    const usageCount = stats.total_transactions || 0

    logger.info('[getUserUsageCount] Retrieved usage count', {
      telegramId: normalizedId,
      botName,
      usageCount,
      currentBalance: stats.current_balance,
      totalIncome: stats.total_real_income + stats.total_bonus_income,
      totalOutcome: stats.total_outcome,
    })

    return usageCount
  } catch (error) {
    logger.error('[getUserUsageCount] Error fetching usage count', {
      error: error instanceof Error ? error.message : String(error),
      telegramId: normalizeTelegramId(telegramId),
      botName,
      fallbackUsageCount: 0,
    })

    // Return 0 on error to treat as new user (safer for UX)
    return 0
  }
}

/**
 * Determines if a user is a returning user based on their usage count
 * Uses a threshold to avoid redirecting users with minimal usage
 * @param telegramId - User's Telegram ID
 * @param botName - Optional bot name for filtering
 * @param threshold - Minimum usage count to be considered "returning" (default: 1)
 * @returns Promise<boolean> - true if user has used the bot above threshold
 */
export const isReturningUser = async (
  telegramId: TelegramId,
  botName?: string,
  threshold: number = 1
): Promise<boolean> => {
  const startTime = Date.now()
  const normalizedId = normalizeTelegramId(telegramId)

  try {
    const usageCount = await getUserUsageCount(telegramId, botName)
    const isReturning = usageCount >= threshold
    const queryTime = Date.now() - startTime

    logger.info('[isReturningUser] User returning status determined', {
      telegramId: normalizedId,
      botName,
      usageCount,
      threshold,
      isReturning,
      queryTime,
      function: 'isReturningUser.success',
    })

    return isReturning
  } catch (error) {
    const errorTime = Date.now() - startTime

    logger.error('[isReturningUser] Error determining user status', {
      error: error instanceof Error ? error.message : String(error),
      telegramId: normalizedId,
      botName,
      threshold,
      errorTime,
      fallback: false,
      function: 'isReturningUser.error',
    })

    // Return false on error to treat as new user (safer for UX)
    return false
  }
}

/**
 * Checks if user should be redirected to main menu based on usage patterns
 * This provides more sophisticated logic for determining user flow
 * Uses optimized caching and improved performance metrics
 * @param telegramId - User's Telegram ID
 * @param botName - Optional bot name for filtering
 * @returns Promise<boolean> - true if user should skip onboarding
 */
export const shouldSkipOnboarding = async (
  telegramId: TelegramId,
  botName?: string
): Promise<boolean> => {
  const normalizedId = normalizeTelegramId(telegramId)
  const startTime = Date.now()

  try {
    logger.info('[shouldSkipOnboarding] Starting advanced user analysis', {
      telegramId: normalizedId,
      botName,
      function: 'shouldSkipOnboarding.start',
    })

    // Optimized: Use minimal service breakdown for faster queries
    const stats = await getUserBalanceStatsOptimized(
      normalizedId,
      botName,
      3, // Reduced from 5 - we only need basic service breakdown
      3 // Reduced from 5 - we only need basic transaction history
    )

    const queryTime = Date.now() - startTime

    if (!stats) {
      logger.info('[shouldSkipOnboarding] No user stats found - new user', {
        telegramId: normalizedId,
        botName,
        queryTime,
        decision: 'skip_onboarding_false',
        reason: 'no_stats',
      })
      return false // New user, go through onboarding
    }

    // Enhanced logic: More nuanced experience detection
    // Primary indicators (strong signals)
    const hasMultipleTransactions = stats.total_transactions > 1 // Lowered threshold from 2 to 1
    const hasSignificantIncome =
      stats.total_real_income + stats.total_bonus_income > 50 // Added threshold
    const hasUsedMultipleServices = stats.services_breakdown.length > 1

    // Secondary indicators (moderate signals)
    const hasAnyIncome = stats.total_real_income + stats.total_bonus_income > 0
    const hasRecentActivity = stats.total_transactions > 0

    // Advanced decision logic: Primary indicators OR combination of secondary
    const primaryMatch =
      hasMultipleTransactions || hasSignificantIncome || hasUsedMultipleServices
    const secondaryMatch = hasAnyIncome && hasRecentActivity

    const shouldSkip = primaryMatch || secondaryMatch

    const analysisTime = Date.now() - startTime

    logger.info('[shouldSkipOnboarding] Advanced user analysis completed', {
      telegramId: normalizedId,
      botName,
      queryTime,
      analysisTime,
      // User statistics
      totalTransactions: stats.total_transactions,
      totalRealIncome: stats.total_real_income,
      totalBonusIncome: stats.total_bonus_income,
      totalIncome: stats.total_real_income + stats.total_bonus_income,
      servicesUsed: stats.services_breakdown.length,
      currentBalance: stats.current_balance,
      // Decision indicators
      hasMultipleTransactions,
      hasSignificantIncome,
      hasUsedMultipleServices,
      hasAnyIncome,
      hasRecentActivity,
      primaryMatch,
      secondaryMatch,
      // Final decision
      shouldSkip,
      decision: shouldSkip ? 'skip_onboarding_true' : 'skip_onboarding_false',
      reason: shouldSkip
        ? primaryMatch
          ? 'primary_indicators'
          : 'secondary_indicators'
        : 'insufficient_activity',
      function: 'shouldSkipOnboarding.analysis_complete',
    })

    return shouldSkip
  } catch (error) {
    const errorTime = Date.now() - startTime

    logger.error('[shouldSkipOnboarding] Error in advanced user analysis', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      telegramId: normalizedId,
      botName,
      errorTime,
      fallback: 'isReturningUser',
      function: 'shouldSkipOnboarding.error_fallback',
    })

    // Enhanced fallback: Try simple returning user check
    try {
      const fallbackResult = await isReturningUser(telegramId, botName, 1)

      logger.info('[shouldSkipOnboarding] Fallback analysis completed', {
        telegramId: normalizedId,
        botName,
        fallbackResult,
        totalTime: Date.now() - startTime,
        function: 'shouldSkipOnboarding.fallback_success',
      })

      return fallbackResult
    } catch (fallbackError) {
      logger.error('[shouldSkipOnboarding] Fallback analysis also failed', {
        fallbackError:
          fallbackError instanceof Error
            ? fallbackError.message
            : String(fallbackError),
        telegramId: normalizedId,
        botName,
        totalTime: Date.now() - startTime,
        finalDecision: false,
        function: 'shouldSkipOnboarding.fallback_error',
      })

      // Ultimate fallback: Treat as new user for safety
      return false
    }
  }
}

/**
 * Fast cached version of shouldSkipOnboarding for high-performance scenarios
 * Uses in-memory cache to reduce database load for frequent checks
 * @param telegramId - User's Telegram ID
 * @param botName - Optional bot name for filtering
 * @param forceRefresh - Force cache refresh (default: false)
 * @returns Promise<boolean> - true if user should skip onboarding
 */
export const shouldSkipOnboardingCached = async (
  telegramId: TelegramId,
  botName?: string,
  forceRefresh: boolean = false
): Promise<boolean> => {
  const normalizedId = normalizeTelegramId(telegramId)
  const cacheKey = `${normalizedId}:${botName || 'default'}`
  const now = Date.now()

  // Check cache first (unless forced refresh)
  if (!forceRefresh) {
    const cached = userExperienceCache.get(cacheKey)
    if (cached && now - cached.timestamp < CACHE_TTL) {
      logger.info(
        '[shouldSkipOnboardingCached] Cache hit - returning cached result',
        {
          telegramId: normalizedId,
          botName,
          cacheAge: now - cached.timestamp,
          shouldSkip: cached.shouldSkip,
          cachedStats: cached.stats,
          function: 'shouldSkipOnboardingCached.cache_hit',
        }
      )
      return cached.shouldSkip
    }
  }

  const startTime = Date.now()

  try {
    // Use the optimized function to get fresh data
    const result = await shouldSkipOnboarding(telegramId, botName)

    // Get stats for caching (with minimal query)
    const stats = await getUserBalanceStatsOptimized(
      normalizedId,
      botName,
      1, // Minimal service breakdown
      1 // Minimal transaction history
    )

    const cacheValue: UserExperienceCache = {
      shouldSkip: result,
      timestamp: now,
      botName,
      stats: {
        transactions: stats?.total_transactions || 0,
        income: stats ? stats.total_real_income + stats.total_bonus_income : 0,
        services: stats?.services_breakdown.length || 0,
      },
    }

    // Update cache
    userExperienceCache.set(cacheKey, cacheValue)

    const totalTime = Date.now() - startTime

    logger.info('[shouldSkipOnboardingCached] Fresh data cached', {
      telegramId: normalizedId,
      botName,
      totalTime,
      shouldSkip: result,
      cacheKey,
      stats: cacheValue.stats,
      function: 'shouldSkipOnboardingCached.cache_update',
    })

    return result
  } catch (error) {
    const errorTime = Date.now() - startTime

    logger.error('[shouldSkipOnboardingCached] Error in cached user analysis', {
      error: error instanceof Error ? error.message : String(error),
      telegramId: normalizedId,
      botName,
      errorTime,
      cacheKey,
      function: 'shouldSkipOnboardingCached.error',
    })

    // Check if we have stale cache data as ultimate fallback
    const staleCache = userExperienceCache.get(cacheKey)
    if (staleCache) {
      logger.warn(
        '[shouldSkipOnboardingCached] Using stale cache data due to error',
        {
          telegramId: normalizedId,
          botName,
          staleAge: now - staleCache.timestamp,
          shouldSkip: staleCache.shouldSkip,
          function: 'shouldSkipOnboardingCached.stale_fallback',
        }
      )
      return staleCache.shouldSkip
    }

    // Ultimate fallback: treat as new user
    return false
  }
}

/**
 * Clears the user experience cache for a specific user or all users
 * Useful for testing or when user data changes significantly
 * @param telegramId - Optional specific user to clear (clears all if not provided)
 * @param botName - Optional bot name for specific cache entry
 */
export const clearUserExperienceCache = (
  telegramId?: TelegramId,
  botName?: string
): void => {
  if (telegramId) {
    const normalizedId = normalizeTelegramId(telegramId)
    const cacheKey = `${normalizedId}:${botName || 'default'}`

    const wasDeleted = userExperienceCache.delete(cacheKey)
    logger.info('[clearUserExperienceCache] Specific cache entry cleared', {
      telegramId: normalizedId,
      botName,
      cacheKey,
      wasDeleted,
      function: 'clearUserExperienceCache.specific',
    })
  } else {
    const cacheSize = userExperienceCache.size
    userExperienceCache.clear()
    logger.info('[clearUserExperienceCache] All cache entries cleared', {
      previousSize: cacheSize,
      function: 'clearUserExperienceCache.all',
    })
  }
}

/**
 * Gets cache statistics for monitoring and debugging
 * @returns Object with cache metrics
 */
export const getUserExperienceCacheStats = () => {
  const now = Date.now()
  const entries = Array.from(userExperienceCache.entries())

  const stats = {
    totalEntries: entries.length,
    validEntries: entries.filter(
      ([_, cache]) => now - cache.timestamp < CACHE_TTL
    ).length,
    staleEntries: entries.filter(
      ([_, cache]) => now - cache.timestamp >= CACHE_TTL
    ).length,
    cacheHitRate: 0, // This would need to be tracked separately
    averageAge:
      entries.length > 0
        ? entries.reduce(
            (sum, [_, cache]) => sum + (now - cache.timestamp),
            0
          ) / entries.length
        : 0,
  }

  logger.info('[getUserExperienceCacheStats] Cache statistics retrieved', {
    ...stats,
    function: 'getUserExperienceCacheStats',
  })

  return stats
}
