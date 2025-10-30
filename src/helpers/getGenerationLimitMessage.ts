/**
 * 🦸‍♂️ СООБЩЕНИЯ И БЕЙДЖИ ДЛЯ СИСТЕМЫ ЛИМИТОВ ГЕНЕРАЦИИ
 */
import { checkSuperheroGenerationUsage } from '@/core/supabase/checkSuperheroGenerationUsage'
import { logger } from '@/utils/logger'

/**
 * Получает бейдж статуса для отображения в меню
 */
export const getGenerationStatusBadge = (
  hasUnlimitedAccess: boolean,
  currentUsage: number,
  maxUsage: number
): string => {
  if (hasUnlimitedAccess) {
    return '♾️' // Бесконечность для админов и NEUROTESTER
  }

  if (currentUsage >= maxUsage) {
    return '🚫' // Запрет при достижении лимита
  }

  return `${currentUsage}/${maxUsage}` // Показываем прогресс
}

/**
 * Получает подробное сообщение о лимитах для пользователя
 */
export const getGenerationLimitMessage = (
  isRussian: boolean,
  hasUnlimitedAccess: boolean,
  currentUsage: number,
  maxUsage: number,
  resetDate?: string,
  isAdmin?: boolean,
  subscriptionType?: string
): string => {
  if (hasUnlimitedAccess) {
    if (isAdmin) {
      return isRussian
        ? '👑 У вас безлимитный доступ как у администратора!'
        : '👑 You have unlimited access as an administrator!'
    }

    if (subscriptionType === 'NEUROTESTER') {
      return isRussian
        ? '🚀 У вас безлимитный доступ благодаря подписке NEUROTESTER!'
        : '🚀 You have unlimited access with NEUROTESTER subscription!'
    }

    return isRussian
      ? '♾️ У вас безлимитный доступ!'
      : '♾️ You have unlimited access!'
  }

  if (currentUsage >= maxUsage) {
    const resetInfo = resetDate
      ? (isRussian ? ` Лимит обновится 1 числа следующего месяца.` : ` Limit resets on the 1st of next month.`)
      : ''

    return isRussian
      ? `🚫 Достигнут месячный лимит генераций (${currentUsage}/${maxUsage}).${resetInfo}\n\n💎 Получите безлимитный доступ с подпиской NEUROTESTER!`
      : `🚫 Monthly generation limit reached (${currentUsage}/${maxUsage}).${resetInfo}\n\n💎 Get unlimited access with NEUROTESTER subscription!`
  }

  const remaining = maxUsage - currentUsage
  return isRussian
    ? `✨ Доступно генераций: ${remaining} из ${maxUsage}\n📅 Лимит обновляется каждый месяц`
    : `✨ Generations available: ${remaining} of ${maxUsage}\n📅 Limit resets monthly`
}

/**
 * Получает сообщение об успешной генерации с остатком лимита
 */
export const getSuccessGenerationMessage = (
  isRussian: boolean,
  hasUnlimitedAccess: boolean,
  newUsage: number,
  maxUsage: number
): string => {
  if (hasUnlimitedAccess) {
    return isRussian
      ? '✅ Генерация завершена! У вас безлимитный доступ.'
      : '✅ Generation complete! You have unlimited access.'
  }

  const remaining = maxUsage - newUsage
  if (remaining > 0) {
    return isRussian
      ? `✅ Генерация завершена! Осталось генераций: ${remaining}`
      : `✅ Generation complete! Generations remaining: ${remaining}`
  } else {
    return isRussian
      ? '✅ Генерация завершена! Это была ваша последняя бесплатная генерация в этом месяце.\n\n💎 Получите безлимитный доступ с NEUROTESTER!'
      : '✅ Generation complete! This was your last free generation this month.\n\n💎 Get unlimited access with NEUROTESTER!'
  }
}

/**
 * Получает кнопку для обновления статуса в меню
 */
export const getHeroesMenuTitle = (
  isRussian: boolean,
  statusBadge: string
): string => {
  const baseTitle = isRussian ? '🦸‍♂️ ИИ Герои' : '🦸‍♂️ AI Heroes'

  if (statusBadge === '♾️') {
    return `${baseTitle} ${statusBadge}`
  }

  if (statusBadge === '🚫') {
    return `${baseTitle} ${statusBadge}`
  }

  return `${baseTitle} ${statusBadge}`
}

/**
 * Async обертка для получения бейджа статуса с проверкой в базе данных
 * Используется в главном меню
 */
export const getGenerationStatusBadgeAsync = async (
  telegramId: string | number,
  isRussian: boolean
): Promise<string> => {
  try {
    const generationCheck = await checkSuperheroGenerationUsage(telegramId)
    
    return getGenerationStatusBadge(
      generationCheck.hasUnlimitedAccess,
      generationCheck.currentUsage,
      generationCheck.maxUsage
    )
  } catch (error) {
    logger.warn('[getGenerationStatusBadgeAsync] Failed to get generation status', {
      telegramId,
      error: error instanceof Error ? error.message : 'Unknown error'
    })
    
    // В случае ошибки возвращаем нейтральную иконку
    return '🎮'
  }
}