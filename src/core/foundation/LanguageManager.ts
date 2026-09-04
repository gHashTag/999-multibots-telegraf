/**
 * 🌍 ЕДИНАЯ СИСТЕМА УПРАВЛЕНИЯ ЯЗЫКАМИ
 * Устраняет хаос с множественными системами определения языка
 * Централизованное кеширование и консистентность
 */

import { MyContext } from '@/interfaces'
import { isRussianLanguageCode } from '@/helpers/isRussianLanguageCode'
import { logger } from '@/utils/logger'

export interface LanguageData {
  isRussian: boolean
  languageCode: string
  source: 'session' | 'telegram' | 'database' | 'default'
}

export class LanguageManager {
  private static instance: LanguageManager
  private languageCache: Map<string, LanguageData> = new Map()
  private cacheExpiry: Map<string, number> = new Map()
  private readonly CACHE_DURATION = 5 * 60 * 1000 // 5 минут

  private constructor() {}

  public static getInstance(): LanguageManager {
    if (!LanguageManager.instance) {
      LanguageManager.instance = new LanguageManager()
    }
    return LanguageManager.instance
  }

  /**
   * ГЛАВНАЯ ФУНКЦИЯ: Определение языка пользователя
   * Приоритеты: Session > Database > Telegram > Default
   */
  public async getUserLanguage(ctx: MyContext): Promise<LanguageData> {
    const telegramId = ctx.from?.id?.toString()
    if (!telegramId) {
      return this.getDefaultLanguageData()
    }

    // Проверяем кеш
    const cachedLanguage = this.getCachedLanguage(telegramId)
    if (cachedLanguage) {
      return cachedLanguage
    }

    // Определяем язык по приоритету
    let languageData: LanguageData

    // 1. Приоритет: Session (самый быстрый)
    if (ctx.session?.userLanguage) {
      languageData = {
        isRussian: ctx.session.userLanguage === 'ru',
        languageCode: ctx.session.userLanguage,
        source: 'session',
      }
      logger.debug('Language determined from session', {
        telegramId,
        ...languageData,
      })
    }
    // 2. Приоритет: Database (если нет в сессии)
    else {
      const dbLanguage = await this.getLanguageFromDatabase(telegramId)
      if (dbLanguage) {
        languageData = dbLanguage
        // Сохраняем в сессию для следующих запросов
        if (ctx.session) {
          ctx.session.userLanguage = dbLanguage.languageCode as 'ru' | 'en'
        }
        logger.debug('Language determined from database', {
          telegramId,
          ...languageData,
        })
      }
      // 3. Приоритет: Telegram (если нет в БД)
      else {
        const telegramLanguage = ctx.from?.language_code
        const isRussian =
          isRussianLanguageCode(telegramLanguage) ||
          telegramLanguage?.startsWith('ru-') ||
          false

        languageData = {
          isRussian,
          languageCode: isRussian ? 'ru' : 'en',
          source: 'telegram',
        }

        // Сохраняем в БД и сессию
        await this.saveLanguageToDatabase(telegramId, languageData.languageCode)
        if (ctx.session) {
          ctx.session.userLanguage = languageData.languageCode as 'ru' | 'en'
        }
        logger.debug('Language determined from Telegram', {
          telegramId,
          telegramLanguage,
          ...languageData,
        })
      }
    }

    // Кешируем результат
    this.cacheLanguage(telegramId, languageData)

    return languageData
  }

  /**
   * ПРОСТАЯ ФУНКЦИЯ: Только проверка русский/английский (для совместимости)
   */
  public async isRussian(ctx: MyContext): Promise<boolean> {
    const languageData = await this.getUserLanguage(ctx)
    return languageData.isRussian
  }

  /**
   * БЫСТРАЯ ФУНКЦИЯ: Определение языка из состояния (без БД запросов)
   * Использует только session и telegram данные
   */
  public isRussianFromState(ctx: MyContext): boolean {
    // 1. Проверяем сессию
    if (ctx.session?.userLanguage) {
      return ctx.session.userLanguage === 'ru'
    }

    // 2. Проверяем Telegram
    const telegramLanguage = ctx.from?.language_code
    return (
      isRussianLanguageCode(telegramLanguage) ||
      telegramLanguage?.startsWith('ru-') ||
      false
    )
  }

  /**
   * Изменение языка пользователя
   */
  public async setUserLanguage(
    ctx: MyContext,
    languageCode: string
  ): Promise<void> {
    const telegramId = ctx.from?.id?.toString()
    if (!telegramId) return

    const isRussian = languageCode === 'ru'
    const languageData: LanguageData = {
      isRussian,
      languageCode,
      source: 'database',
    }

    // Сохраняем в БД
    await this.saveLanguageToDatabase(telegramId, languageCode)

    // Сохраняем в сессию
    if (ctx.session) {
      ctx.session.userLanguage = languageCode as 'ru' | 'en'
    }

    // Обновляем кеш
    this.cacheLanguage(telegramId, languageData)

    logger.info('User language changed', {
      telegramId,
      newLanguage: languageCode,
      isRussian,
    })
  }

  /**
   * Получение языка из кеша
   */
  private getCachedLanguage(telegramId: string): LanguageData | null {
    const cached = this.languageCache.get(telegramId)
    const expiry = this.cacheExpiry.get(telegramId)

    if (!cached || !expiry || Date.now() > expiry) {
      // Кеш устарел
      this.languageCache.delete(telegramId)
      this.cacheExpiry.delete(telegramId)
      return null
    }

    return cached
  }

  /**
   * Кеширование языка
   */
  private cacheLanguage(telegramId: string, languageData: LanguageData): void {
    this.languageCache.set(telegramId, languageData)
    this.cacheExpiry.set(telegramId, Date.now() + this.CACHE_DURATION)
  }

  /**
   * Получение языка из базы данных
   */
  private async getLanguageFromDatabase(
    telegramId: string
  ): Promise<LanguageData | null> {
    try {
      const { getUserLanguageFromDB } = await import(
        '@/core/supabase/getUserLanguage'
      )
      const dbLanguage = await getUserLanguageFromDB(telegramId)

      if (dbLanguage) {
        const isRussian = dbLanguage === 'ru'
        return {
          isRussian,
          languageCode: dbLanguage,
          source: 'database',
        }
      }
    } catch (error) {
      logger.error('Error getting language from database', {
        telegramId,
        error: error instanceof Error ? error.message : String(error),
      })
    }

    return null
  }

  /**
   * Сохранение языка в базу данных
   */
  private async saveLanguageToDatabase(
    telegramId: string,
    languageCode: string
  ): Promise<void> {
    try {
      const { updateUserLanguage } = await import(
        '@/core/supabase/updateUserLanguage'
      )
      await updateUserLanguage(
        parseInt(telegramId),
        languageCode as 'ru' | 'en'
      )
    } catch (error) {
      logger.error('Error saving language to database', {
        telegramId,
        languageCode,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  /**
   * Язык по умолчанию
   */
  private getDefaultLanguageData(): LanguageData {
    return {
      isRussian: true, // По умолчанию русский для вашей аудитории
      languageCode: 'ru',
      source: 'default',
    }
  }

  /**
   * Очистка кеша (для тестов или административных целей)
   */
  public clearCache(telegramId?: string): void {
    if (telegramId) {
      this.languageCache.delete(telegramId)
      this.cacheExpiry.delete(telegramId)
    } else {
      this.languageCache.clear()
      this.cacheExpiry.clear()
    }
  }

  /**
   * Статистика кеша
   */
  public getCacheStats(): { size: number; hitRate?: number } {
    return {
      size: this.languageCache.size,
    }
  }
}

// Экспорт singleton экземпляра
export const languageManager = LanguageManager.getInstance()

// Функции для совместимости с существующим кодом
export const isRussianFromState = (ctx: MyContext): boolean => {
  return languageManager.isRussianFromState(ctx)
}

export const getUserLanguageData = async (
  ctx: MyContext
): Promise<LanguageData> => {
  return await languageManager.getUserLanguage(ctx)
}

export const isRussianUniversal = async (ctx: MyContext): Promise<boolean> => {
  return await languageManager.isRussian(ctx)
}
