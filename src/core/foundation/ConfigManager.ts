/**
 * 🏗️ ЖЕЛЕЗОБЕТОННАЯ КОНФИГУРАЦИЯ
 * Единственное место для всех конфигурационных переменных
 * Исключает дублирование импортов и race conditions
 */

import { config } from 'dotenv'
import path from 'path'
import { logger } from '@/utils/logger'

export class ConfigManager {
  private static instance: ConfigManager
  private _config: Record<string, any> = {}
  private _initialized = false

  private constructor() {}

  public static getInstance(): ConfigManager {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager()
    }
    return ConfigManager.instance
  }

  /**
   * Инициализация конфигурации (вызывается ОДИН раз при старте)
   */
  public async initialize(): Promise<void> {
    if (this._initialized) {
      logger.warn('ConfigManager already initialized')
      return
    }

    try {
      // Загружаем .env файл
      const envPath = path.join(process.cwd(), '.env')
      const result = config({ path: envPath })

      if (result.error) {
        throw new Error(`Failed to load .env: ${result.error.message}`)
      }

      // Валидация обязательных переменных
      this.validateRequiredEnvVars()

      // Кешируем часто используемые значения
      this._config = {
        isDev: process.env.NODE_ENV === 'development',
        adminIds: this.parseAdminIds(),
        apiServerUrl: process.env.API_SERVER_URL,
        localServerUrl: process.env.LOCAL_SERVER_URL,
        secretApiKey: process.env.SECRET_API_KEY,
        supabaseUrl: process.env.SUPABASE_URL,
        supabaseServiceKey: process.env.SUPABASE_SERVICE_KEY,
        // ... другие конфиги
      }

      this._initialized = true
      logger.info('ConfigManager initialized successfully', {
        environmentVarsCount: Object.keys(process.env).length,
        isDev: this._config.isDev,
        hasApiServerUrl: !!this._config.apiServerUrl,
      })
    } catch (error) {
      logger.error('ConfigManager initialization failed', { error })
      throw error
    }
  }

  /**
   * Получение конфигурационного значения (БЕЗОПАСНО)
   */
  public get<T = any>(key: string): T {
    if (!this._initialized) {
      throw new Error('ConfigManager not initialized. Call initialize() first.')
    }
    return this._config[key]
  }

  /**
   * Получение URL API сервера с fallback логикой
   */
  public getApiServerUrl(): string {
    const apiUrl = this._config.apiServerUrl || this._config.localServerUrl
    if (!apiUrl) {
      throw new Error('Neither API_SERVER_URL nor LOCAL_SERVER_URL is configured')
    }
    return apiUrl
  }

  /**
   * Парсинг ADMIN_IDS в массив чисел
   */
  private parseAdminIds(): number[] {
    const adminIdsString = process.env.ADMIN_IDS || ''
    return adminIdsString
      .split(',')
      .map(id => parseInt(id.trim(), 10))
      .filter(id => !isNaN(id))
  }

  /**
   * Валидация обязательных переменных окружения
   */
  private validateRequiredEnvVars(): void {
    const required = [
      'SECRET_API_KEY',
      'SUPABASE_URL', 
      'SUPABASE_SERVICE_KEY'
    ]

    const missing = required.filter(key => !process.env[key])
    if (missing.length > 0) {
      throw new Error(`Missing required environment variables: ${missing.join(', ')}`)
    }
  }

  /**
   * Проверка, является ли пользователь админом
   */
  public isAdmin(telegramId: string | number): boolean {
    const adminIds: number[] = this.get('adminIds')
    const id = typeof telegramId === 'string' ? parseInt(telegramId, 10) : telegramId
    return adminIds.includes(id)
  }
}

// Экспорт singleton экземпляра
export const configManager = ConfigManager.getInstance()