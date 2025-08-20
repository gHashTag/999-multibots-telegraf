import { logger } from '@/utils/logger'
import { ADMIN_IDS_ARRAY } from '@/config'
import { queryNeon, testNeonConnection } from '../neon/client'

export interface UserProject {
  id: number
  name: string
  description: string
  industry: string
}

// 💾 CACHE МЕХАНИЗМ - Кэш проектов на 5 минут
interface CacheEntry {
  data: UserProject[]
  timestamp: number
  telegramId: string
}

const projectsCache = new Map<string, CacheEntry>()
const CACHE_TTL = 5 * 60 * 1000 // 5 минут

function getCachedProjects(telegramId: string): UserProject[] | null {
  const entry = projectsCache.get(telegramId)
  if (!entry) return null

  const now = Date.now()
  if (now - entry.timestamp > CACHE_TTL) {
    projectsCache.delete(telegramId)
    return null
  }

  console.log('🚀 [getUserProjects] CACHE HIT! Returning cached projects')
  return entry.data
}

function setCachedProjects(telegramId: string, data: UserProject[]): void {
  projectsCache.set(telegramId, {
    data,
    timestamp: Date.now(),
    telegramId,
  })
  console.log('💾 [getUserProjects] CACHED projects for future use')
}

export const getUserProjects = async (
  telegram_id: string | number
): Promise<UserProject[]> => {
  console.log('🚨 [getUserProjects] FUNCTION ENTERED!', { telegram_id })

  if (!telegram_id) {
    console.log(
      '🚨 [getUserProjects] Missing telegram_id - returning empty array'
    )
    logger.error('[getUserProjects] Missing telegram_id')
    return []
  }

  const telegramIdStr = telegram_id.toString()

  // 🚀 ПРОВЕРКА КЭША - Возвращаем закэшированные данные если есть
  const cachedProjects = getCachedProjects(telegramIdStr)
  if (cachedProjects) {
    return cachedProjects
  }

  const numericTelegramId =
    typeof telegram_id === 'string' ? parseInt(telegram_id) : telegram_id
  const isAdmin = ADMIN_IDS_ARRAY.includes(numericTelegramId)

  console.log('🚨 [getUserProjects] Parsed data:', {
    telegram_id,
    numericTelegramId,
    isAdmin,
    ADMIN_IDS_ARRAY,
  })

  logger.info(
    `[getUserProjects] Fetching projects for telegram_id ${telegram_id}, isAdmin: ${isAdmin}`,
    {
      telegram_id,
      numericTelegramId,
      isAdmin,
      ADMIN_IDS_ARRAY,
    }
  )

  try {
    // Сначала тестируем соединение и проверяем таблицы
    console.log('🚨 [getUserProjects] Testing Neon connection...')
    await testNeonConnection()

    if (isAdmin) {
      // ДЛЯ АДМИНОВ: Получаем ВСЕ проекты из базы данных
      console.log(
        '🚨 [getUserProjects] ADMIN BRANCH - executing query to fetch all projects from NEON'
      )
      logger.info(
        `[getUserProjects] Admin access - executing query to fetch all projects from NEON`
      )

      console.log('🚨 [getUserProjects] About to query NEON...')
      const result = await queryNeon(`
        SELECT id, name, description, industry 
        FROM projects 
        ORDER BY name ASC
      `)
      console.log('🚨 [getUserProjects] NEON query completed!')

      const projects = result.rows

      console.log('🚨 [getUserProjects] NEON query RESULTS:', {
        hasError: false,
        projectsLength: projects?.length || 0,
        firstThreeProjects: projects?.slice(0, 3) || [],
      })

      console.log(
        '🚨 [getUserProjects] About to call logger.info for Admin query completed'
      )
      console.log(`🚨 [getUserProjects] Admin query completed (CONSOLE LOG)`, {
        hasError: false,
        errorMessage: null,
        projectsLength: projects?.length || 0,
        projectsData: projects?.slice(0, 3) || [],
      })
      console.log(
        '🚨 [getUserProjects] logger.info for Admin query completed - DONE'
      )

      console.log(
        '🚨 [getUserProjects] NO ERROR - proceeding with projects processing'
      )

      logger.info(
        `[getUserProjects] Admin access: Found ${projects?.length || 0} total projects`,
        {
          projectNames: projects?.map(p => p.name) || [],
        }
      )

      console.log('🚨 [getUserProjects] ADMIN BRANCH - returning projects:', {
        projectsLength: projects?.length || 0,
        projectNames: projects?.map(p => p.name) || [],
      })

      // 💾 КЭШИРУЕМ РЕЗУЛЬТАТ ДЛЯ АДМИНА
      const resultProjects = projects || []
      setCachedProjects(telegramIdStr, resultProjects)

      return resultProjects
    } else {
      console.log(
        '🚨 [getUserProjects] REGULAR USER BRANCH - fetching user projects from NEON'
      )
      // ДЛЯ ОБЫЧНЫХ ПОЛЬЗОВАТЕЛЕЙ: Получаем только их проекты
      const userResult = await queryNeon(
        `
        SELECT id 
        FROM users 
        WHERE telegram_id = $1
      `,
        [telegram_id.toString()]
      )

      if (userResult.rows.length === 0) {
        logger.info(
          `[getUserProjects] User with telegram_id ${telegram_id} not found`,
          { telegram_id }
        )
        return []
      }

      const userId = userResult.rows[0].id

      const projectsResult = await queryNeon(
        `
        SELECT id, name, description, industry 
        FROM projects 
        WHERE user_id = $1 
        ORDER BY name ASC
      `,
        [userId]
      )

      logger.info(
        `[getUserProjects] Regular user access: Found ${projectsResult.rows.length} projects`,
        {
          telegram_id,
          userId,
          projectNames: projectsResult.rows.map(p => p.name),
        }
      )

      // 💾 КЭШИРУЕМ РЕЗУЛЬТАТ ДЛЯ ОБЫЧНОГО ПОЛЬЗОВАТЕЛЯ
      const userProjects = projectsResult.rows || []
      setCachedProjects(telegramIdStr, userProjects)

      return userProjects
    }
  } catch (error) {
    console.log('🚨 [getUserProjects] CAUGHT ERROR:', {
      telegram_id,
      error: error instanceof Error ? error.message : String(error),
    })
    logger.error(
      `[getUserProjects] Unexpected error for telegram_id ${telegram_id}:`,
      { error }
    )
    return []
  }
}
