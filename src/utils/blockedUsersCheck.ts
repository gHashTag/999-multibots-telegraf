import { Context } from 'telegraf'
import { logger } from '@/utils/logger'

/**
 * Кэш заблокированных пользователей
 * Хранит ID пользователей и время последней проверки
 */
const blockedUsersCache = new Map<string, { blockedAt: Date; lastCheck: Date }>()

/**
 * Время жизни кэша в миллисекундах (1 час)
 */
const CACHE_TTL = 60 * 60 * 1000

/**
 * Очищает устаревшие записи из кэша
 */
function cleanupCache() {
  const now = new Date()
  for (const [userId, data] of blockedUsersCache.entries()) {
    if (now.getTime() - data.lastCheck.getTime() > CACHE_TTL) {
      blockedUsersCache.delete(userId)
    }
  }
}

/**
 * Проверяет, заблокировал ли пользователь бота
 * @param ctx - Контекст Telegraf
 * @param userId - ID пользователя для проверки
 * @returns true если пользователь заблокировал бота, false если нет
 */
export async function isUserBlockedBot(
  ctx: Context,
  userId: number | string
): Promise<boolean> {
  const userIdStr = userId.toString()
  
  // Проверяем кэш
  const cached = blockedUsersCache.get(userIdStr)
  if (cached) {
    const now = new Date()
    // Если запись свежая, возвращаем результат из кэша
    if (now.getTime() - cached.lastCheck.getTime() < CACHE_TTL) {
      return true
    }
  }
  
  try {
    // Пытаемся отправить getChatMember запрос
    const chatMember = await ctx.telegram.getChatMember(userIdStr, parseInt(userIdStr))
    
    // Если запрос успешен и пользователь покинул чат или был забанен
    if (chatMember.status === 'kicked' || chatMember.status === 'left') {
      // Добавляем в кэш
      blockedUsersCache.set(userIdStr, {
        blockedAt: new Date(),
        lastCheck: new Date()
      })
      
      logger.info(`User ${userIdStr} has blocked the bot`, {
        status: chatMember.status
      })
      
      return true
    }
    
    // Если пользователь активен, удаляем из кэша если был там
    blockedUsersCache.delete(userIdStr)
    return false
    
  } catch (error: any) {
    // Ошибка 403 означает, что бот заблокирован пользователем
    if (error?.response?.error_code === 403 || 
        error?.message?.includes('bot was blocked') ||
        error?.message?.includes('Forbidden')) {
      
      // Добавляем в кэш
      blockedUsersCache.set(userIdStr, {
        blockedAt: new Date(),
        lastCheck: new Date()
      })
      
      logger.info(`User ${userIdStr} has blocked the bot (403 error)`)
      return true
    }
    
    // Для других ошибок считаем, что пользователь не заблокирован
    logger.debug(`Error checking if user ${userIdStr} blocked bot:`, {
      error: error?.message || error
    })
    
    return false
  }
}

/**
 * Обертка для безопасной отправки сообщений с проверкой блокировки
 * @param ctx - Контекст Telegraf
 * @param userId - ID пользователя
 * @param message - Сообщение для отправки
 * @param options - Опции для sendMessage
 * @returns true если сообщение отправлено успешно, false если пользователь заблокировал бота
 */
export async function safeSendMessage(
  ctx: Context,
  userId: number | string,
  message: string,
  options?: any
): Promise<boolean> {
  const userIdStr = userId.toString()
  
  // Сначала проверяем кэш
  if (blockedUsersCache.has(userIdStr)) {
    logger.info(`Skipping message to blocked user ${userIdStr}`)
    return false
  }
  
  try {
    await ctx.telegram.sendMessage(userId, message, options)
    // Если отправка успешна, удаляем из кэша заблокированных
    blockedUsersCache.delete(userIdStr)
    return true
    
  } catch (error: any) {
    // Если получили ошибку блокировки
    if (error?.response?.error_code === 403 || 
        error?.message?.includes('bot was blocked') ||
        error?.message?.includes('Forbidden')) {
      
      // Добавляем в кэш
      blockedUsersCache.set(userIdStr, {
        blockedAt: new Date(),
        lastCheck: new Date()
      })
      
      logger.info(`User ${userIdStr} has blocked the bot, message not sent`)
      return false
    }
    
    // Пробрасываем другие ошибки
    throw error
  }
}

/**
 * Помечает пользователя как заблокировавшего бота
 * Используется когда мы точно знаем, что пользователь заблокировал бота
 */
export function markUserAsBlocked(userId: number | string) {
  const userIdStr = userId.toString()
  blockedUsersCache.set(userIdStr, {
    blockedAt: new Date(),
    lastCheck: new Date()
  })
  
  logger.info(`User ${userIdStr} marked as blocked`)
}

/**
 * Удаляет пользователя из списка заблокированных
 * Используется когда пользователь разблокировал бота
 */
export function unmarkUserAsBlocked(userId: number | string) {
  const userIdStr = userId.toString()
  const wasBlocked = blockedUsersCache.delete(userIdStr)
  
  if (wasBlocked) {
    logger.info(`User ${userIdStr} unmarked as blocked`)
  }
}

/**
 * Возвращает список заблокированных пользователей
 */
export function getBlockedUsers(): string[] {
  cleanupCache()
  return Array.from(blockedUsersCache.keys())
}

// Периодическая очистка кэша каждый час
setInterval(cleanupCache, CACHE_TTL)