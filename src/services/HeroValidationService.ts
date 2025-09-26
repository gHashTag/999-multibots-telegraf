/**
 * 🦸‍♂️ HERO VALIDATION SERVICE
 *
 * Сервис для валидации героев и обработки ошибок
 * Обеспечивает типобезопасность и надёжность системы героев
 */

import { MyContext } from '@/interfaces'
import { ModeEnum } from '@/interfaces/modes'
import { logger } from '@/utils/logger'
import {
  HeroName,
  Gender,
  HeroValidationResult,
  HeroValidationError,
  HeroErrorDetails,
  validateHero,
  HEROES_REGISTRY,
  getCriticalMissingHeroes,
  getHeroSystemStats
} from '@/types/heroes'

export class HeroValidationService {
  private static errorLog: HeroErrorDetails[] = []

  /**
   * 🔍 ВАЛИДАЦИЯ ГЕРОЯ С ПОЛНЫМ ЛОГИРОВАНИЕМ
   */
  static async validateHeroWithLogging(
    heroName: string,
    userId: string,
    context: string
  ): Promise<HeroValidationResult> {
    const result = validateHero(heroName)

    if (!result.isValid && result.error) {
      // Логируем ошибку
      const errorDetails: HeroErrorDetails = {
        heroName: heroName as HeroName,
        error: result.error,
        timestamp: new Date(),
        userId,
        context
      }

      this.errorLog.push(errorDetails)

      // Системное логирование
      console.error(`🚨 [HERO VALIDATION ERROR] Hero validation failed`, {
        heroName,
        error: result.error,
        userId,
        context,
        hasPrompt: HEROES_REGISTRY[heroName as HeroName]?.hasPrompt,
        heroExists: heroName in HEROES_REGISTRY
      })

      // Отправляем метрики (если подключена аналитика)
      await this.sendValidationMetrics(errorDetails)
    } else {
      console.log(`✅ [HERO VALIDATION SUCCESS] Hero validated successfully`, {
        heroName,
        userId,
        context
      })
    }

    return result
  }

  /**
   * 🚨 БЕЗОПАСНЫЙ ВЫБОР ГЕРОЯ С FALLBACK
   */
  static async safeHeroSelection(
    ctx: MyContext,
    heroName: string,
    gender: Gender
  ): Promise<{ success: boolean; prompt?: string; shouldRedirect?: boolean }> {
    const userId = ctx.from?.id?.toString() || 'unknown'
    const validation = await this.validateHeroWithLogging(
      heroName,
      userId,
      'hero_selection'
    )

    if (!validation.isValid) {
      // Показываем пользователю ошибку и перенаправляем в главное меню
      await this.handleHeroValidationError(ctx, validation, heroName)
      return { success: false, shouldRedirect: true }
    }

    return { success: true, prompt: validation.fallbackPrompt }
  }

  /**
   * 🔄 ОБРАБОТКА ОШИБОК ВАЛИДАЦИИ
   */
  static async handleHeroValidationError(
    ctx: MyContext,
    validation: HeroValidationResult,
    heroName: string
  ): Promise<void> {
    const isRu = true // Заглушка, нужно получать из контекста

    let errorMessage = ''
    let shouldRedirect = true

    switch (validation.error) {
      case 'HERO_NOT_FOUND':
        errorMessage = isRu
          ? `🚫 Ошибка: Герой "${heroName}" не найден в системе.\n\n🔄 Перенаправляем вас в главное меню для выбора доступного героя.`
          : `🚫 Error: Hero "${heroName}" not found in system.\n\n🔄 Redirecting you to main menu to select available hero.`
        break

      case 'PROMPT_MISSING':
        errorMessage = isRu
          ? `⚠️ Временная недоступность: Герой "${heroName}" пока не готов.\n\n🔧 Наши разработчики работают над добавлением этого героя.\n\n🔄 Перенаправляем вас в главное меню для выбора другого героя.`
          : `⚠️ Temporarily unavailable: Hero "${heroName}" is not ready yet.\n\n🔧 Our developers are working on adding this hero.\n\n🔄 Redirecting you to main menu to select another hero.`
        break

      case 'SYSTEM_ERROR':
        errorMessage = isRu
          ? `🚨 Системная ошибка при обработке героя "${heroName}".\n\n🔄 Перенаправляем вас в главное меню.`
          : `🚨 System error processing hero "${heroName}".\n\n🔄 Redirecting you to main menu.`
        break

      default:
        errorMessage = isRu
          ? `❌ Неизвестная ошибка с героем "${heroName}".\n\n🔄 Перенаправляем вас в главное меню.`
          : `❌ Unknown error with hero "${heroName}".\n\n🔄 Redirecting you to main menu.`
    }

    // Отправляем сообщение об ошибке пользователю
    await ctx.reply(errorMessage)

    if (shouldRedirect) {
      // Перенаправляем в главное меню
      await this.redirectToMainMenu(ctx)
    }
  }

  /**
   * 🏠 ПЕРЕНАПРАВЛЕНИЕ В ГЛАВНОЕ МЕНЮ
   */
  static async redirectToMainMenu(ctx: MyContext): Promise<void> {
    try {
      // Очищаем сессию
      if (ctx.session) {
        ctx.session.mode = ModeEnum.MainMenu
        delete ctx.session.selectedHero
        delete ctx.session.selectedGender
      }

      // Выходим из текущей сцены и переходим в главное меню
      await ctx.scene.leave()

      // Небольшая задержка для лучшего UX
      setTimeout(async () => {
        try {
          await ctx.scene.enter('menu_scene')
        } catch (error) {
          logger.error('Failed to redirect to main menu', { error })
          // Fallback - просто отправляем команду меню
          await ctx.reply('/menu')
        }
      }, 1000)

      console.log('🏠 [HERO VALIDATION] User redirected to main menu', {
        userId: ctx.from?.id?.toString(),
        timestamp: new Date().toISOString()
      })

    } catch (error) {
      console.error('🚨 [HERO VALIDATION] Failed to redirect to main menu', {
        error,
        userId: ctx.from?.id?.toString()
      })
    }
  }

  /**
   * 📊 ОТПРАВКА МЕТРИК ВАЛИДАЦИИ
   */
  static async sendValidationMetrics(errorDetails: HeroErrorDetails): Promise<void> {
    try {
      // Здесь можно интегрироваться с аналитическими системами
      // Например: Amplitude, Mixpanel, собственная аналитика

      const metrics = {
        event: 'hero_validation_error',
        properties: {
          hero_name: errorDetails.heroName,
          error_type: errorDetails.error,
          user_id: errorDetails.userId,
          context: errorDetails.context,
          timestamp: errorDetails.timestamp.toISOString()
        }
      }

      // Пример интеграции (раскомментировать при подключении аналитики):
      // await analytics.track(metrics)

      console.log('📊 [ANALYTICS] Hero validation error tracked', metrics)
    } catch (error) {
      console.error('Failed to send validation metrics', { error })
    }
  }

  /**
   * 📋 ПОЛУЧИТЬ СТАТИСТИКУ ОШИБОК
   */
  static getErrorStats(): {
    totalErrors: number
    errorsByType: Record<HeroValidationError, number>
    errorsByHero: Record<string, number>
    recentErrors: HeroErrorDetails[]
  } {
    const errorsByType: Record<HeroValidationError, number> = {
      'HERO_NOT_FOUND': 0,
      'PROMPT_MISSING': 0,
      'INVALID_GENDER': 0,
      'SYSTEM_ERROR': 0
    }

    const errorsByHero: Record<string, number> = {}

    this.errorLog.forEach(error => {
      errorsByType[error.error]++
      errorsByHero[error.heroName] = (errorsByHero[error.heroName] || 0) + 1
    })

    return {
      totalErrors: this.errorLog.length,
      errorsByType,
      errorsByHero,
      recentErrors: this.errorLog.slice(-10) // Последние 10 ошибок
    }
  }

  /**
   * 🚨 СИСТЕМНАЯ ДИАГНОСТИКА
   */
  static async runSystemDiagnostics(): Promise<{
    systemHealth: 'healthy' | 'warning' | 'critical'
    stats: ReturnType<typeof getHeroSystemStats>
    criticalMissingHeroes: HeroName[]
    recommendations: string[]
  }> {
    const stats = getHeroSystemStats()
    const criticalMissing = getCriticalMissingHeroes()
    const errorStats = this.getErrorStats()

    let systemHealth: 'healthy' | 'warning' | 'critical' = 'healthy'
    const recommendations: string[] = []

    // Определяем здоровье системы
    if (stats.coveragePercentage < 50) {
      systemHealth = 'critical'
      recommendations.push('🚨 КРИТИЧНО: Менее 50% героев имеют промпты')
    } else if (stats.coveragePercentage < 80) {
      systemHealth = 'warning'
      recommendations.push('⚠️ ВНИМАНИЕ: Менее 80% героев имеют промпты')
    }

    if (criticalMissing.length > 0) {
      systemHealth = 'critical'
      recommendations.push(`🚨 КРИТИЧНО: Отсутствуют промпты для критических героев: ${criticalMissing.join(', ')}`)
    }

    if (errorStats.totalErrors > 100) {
      systemHealth = 'warning'
      recommendations.push('⚠️ ВНИМАНИЕ: Много ошибок валидации героев за последнее время')
    }

    return {
      systemHealth,
      stats,
      criticalMissingHeroes: criticalMissing,
      recommendations
    }
  }
}