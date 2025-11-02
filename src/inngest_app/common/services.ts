/**
 * Common Services for Inngest Functions
 * Centralized database and external API operations
 */

import { supabase } from '@/core/supabase'
import { createInngestLogger } from './helpers'

// ===== DATABASE SERVICES =====

/**
 * Database service with enhanced error handling
 */
export class DatabaseService {
  private logger = createInngestLogger('DatabaseService')

  /**
   * Fetch single record
   */
  async fetchOne<T = any>(
    table: string,
    query: Record<string, any>,
    options: {
      telegramId?: string
      select?: string
    } = {}
  ): Promise<T | null> {
    const { select = '*', telegramId } = options
    const logger = createInngestLogger('DatabaseService', telegramId)

    logger.info(`Fetching record from table: ${table}`, {
      table,
      query: Object.keys(query),
      select,
    })

    try {
      const { data, error } = await supabase
        .from(table)
        .select(select)
        .match(query)
        .single()

      if (error) {
        logger.error(`Database error: ${error.message}`, { error })
        throw error
      }

      if (!data) {
        logger.warn(`No record found`, { table, query })
        return null
      }

      logger.info(`Record fetched successfully`, { table, recordId: data.id })
      return data as T
    } catch (error) {
      logger.error(`Failed to fetch record`, { error, table, query })
      throw error
    }
  }

  /**
   * Fetch multiple records
   */
  async fetchMany<T = any>(
    table: string,
    query: Record<string, any>,
    options: {
      telegramId?: string
      select?: string
      limit?: number
      orderBy?: string
      ascending?: boolean
    } = {}
  ): Promise<T[]> {
    const { select = '*', limit, orderBy, ascending = false, telegramId } = options
    const logger = createInngestLogger('DatabaseService', telegramId)

    logger.info(`Fetching records from table: ${table}`, {
      table,
      query: Object.keys(query),
      select,
      limit,
      orderBy,
    })

    try {
      let queryBuilder = supabase.from(table).select(select).match(query)

      if (orderBy) {
        queryBuilder = queryBuilder.order(orderBy, { ascending })
      }

      if (limit) {
        queryBuilder = queryBuilder.limit(limit)
      }

      const { data, error } = await queryBuilder

      if (error) {
        logger.error(`Database error: ${error.message}`, { error })
        throw error
      }

      logger.info(`Records fetched successfully`, {
        table,
        count: data?.length || 0,
      })

      return (data as T[]) || []
    } catch (error) {
      logger.error(`Failed to fetch records`, { error, table, query })
      throw error
    }
  }

  /**
   * Insert record
   */
  async insert<T = any>(
    table: string,
    data: Record<string, any>,
    options: {
      telegramId?: string
      select?: string
    } = {}
  ): Promise<T> {
    const { select = '*', telegramId } = options
    const logger = createInngestLogger('DatabaseService', telegramId)

    logger.info(`Inserting record into table: ${table}`, {
      table,
      dataKeys: Object.keys(data),
    })

    try {
      const { data: insertedData, error } = await supabase
        .from(table)
        .insert(data)
        .select(select)
        .single()

      if (error) {
        logger.error(`Database error: ${error.message}`, { error })
        throw error
      }

      logger.info(`Record inserted successfully`, {
        table,
        recordId: insertedData.id,
      })

      return insertedData as T
    } catch (error) {
      logger.error(`Failed to insert record`, { error, table, data })
      throw error
    }
  }

  /**
   * Update record
   */
  async update<T = any>(
    table: string,
    query: Record<string, any>,
    data: Record<string, any>,
    options: {
      telegramId?: string
      select?: string
    } = {}
  ): Promise<T> {
    const { select = '*', telegramId } = options
    const logger = createInngestLogger('DatabaseService', telegramId)

    logger.info(`Updating record in table: ${table}`, {
      table,
      query: Object.keys(query),
      dataKeys: Object.keys(data),
    })

    try {
      const { data: updatedData, error } = await supabase
        .from(table)
        .update(data)
        .match(query)
        .select(select)
        .single()

      if (error) {
        logger.error(`Database error: ${error.message}`, { error })
        throw error
      }

      logger.info(`Record updated successfully`, {
        table,
        recordId: updatedData.id,
      })

      return updatedData as T
    } catch (error) {
      logger.error(`Failed to update record`, { error, table, query, data })
      throw error
    }
  }

  /**
   * Delete record
   */
  async delete(
    table: string,
    query: Record<string, any>,
    options: {
      telegramId?: string
    } = {}
  ): Promise<void> {
    const { telegramId } = options
    const logger = createInngestLogger('DatabaseService', telegramId)

    logger.info(`Deleting record from table: ${table}`, {
      table,
      query: Object.keys(query),
    })

    try {
      const { error } = await supabase.from(table).delete().match(query)

      if (error) {
        logger.error(`Database error: ${error.message}`, { error })
        throw error
      }

      logger.info(`Record deleted successfully`, { table, query })
    } catch (error) {
      logger.error(`Failed to delete record`, { error, table, query })
      throw error
    }
  }
}

/**
 * Create database service instance
 */
export const db = new DatabaseService()

// ===== EXTERNAL API SERVICES =====

/**
 * HTTP service for external API calls
 */
export class HttpService {
  private logger = createInngestLogger('HttpService')

  /**
   * Make GET request
   */
  async get<T = any>(
    url: string,
    options: {
      headers?: Record<string, string>
      timeout?: number
      telegramId?: string
    } = {}
  ): Promise<T> {
    const { headers = {}, timeout = 10000, telegramId } = options
    const logger = createInngestLogger('HttpService', telegramId)

    logger.info(`Making GET request`, { url })

    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), timeout)

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        const errorText = await response.text()
        logger.error(`HTTP GET failed`, {
          url,
          status: response.status,
          statusText: response.statusText,
          error: errorText,
        })
        throw new Error(`HTTP GET failed: ${response.status} ${response.statusText}`)
      }

      const data = await response.json()
      logger.info(`GET request successful`, { url, hasData: !!data })
      return data as T
    } catch (error) {
      logger.error(`GET request failed`, { url, error })
      throw error
    }
  }

  /**
   * Make POST request
   */
  async post<T = any>(
    url: string,
    data: any,
    options: {
      headers?: Record<string, string>
      timeout?: number
      telegramId?: string
    } = {}
  ): Promise<T> {
    const { headers = {}, timeout = 10000, telegramId } = options
    const logger = createInngestLogger('HttpService', telegramId)

    logger.info(`Making POST request`, { url, dataKeys: Object.keys(data) })

    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), timeout)

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        body: JSON.stringify(data),
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        const errorText = await response.text()
        logger.error(`HTTP POST failed`, {
          url,
          status: response.status,
          statusText: response.statusText,
          error: errorText,
        })
        throw new Error(`HTTP POST failed: ${response.status} ${response.statusText}`)
      }

      const result = await response.json()
      logger.info(`POST request successful`, { url, hasData: !!result })
      return result as T
    } catch (error) {
      logger.error(`POST request failed`, { url, error })
      throw error
    }
  }

  /**
   * Upload file
   */
  async uploadFile(
    url: string,
    file: Blob,
    options: {
      headers?: Record<string, string>
      timeout?: number
      telegramId?: string
      fieldName?: string
    } = {}
  ): Promise<any> {
    const { headers = {}, timeout = 30000, telegramId, fieldName = 'file' } = options
    const logger = createInngestLogger('HttpService', telegramId)

    logger.info(`Uploading file`, { url, fieldName, size: file.size })

    try {
      const formData = new FormData()
      formData.append(fieldName, file)

      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), timeout)

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          ...headers,
        },
        body: formData,
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        const errorText = await response.text()
        logger.error(`File upload failed`, {
          url,
          status: response.status,
          statusText: response.statusText,
          error: errorText,
        })
        throw new Error(`File upload failed: ${response.status} ${response.statusText}`)
      }

      const result = await response.json()
      logger.info(`File uploaded successfully`, { url, hasData: !!result })
      return result
    } catch (error) {
      logger.error(`File upload failed`, { url, error })
      throw error
    }
  }
}

/**
 * Create HTTP service instance
 */
export const http = new HttpService()

// ===== NOTIFICATION SERVICES =====

/**
 * Notification service for user updates
 */
export class NotificationService {
  private logger = createInngestLogger('NotificationService')

  /**
   * Send webhook notification
   */
  async sendWebhook(
    url: string,
    data: any,
    options: {
      telegramId?: string
      timeout?: number
      retries?: number
    } = {}
  ): Promise<void> {
    const { telegramId, timeout = 5000, retries = 3 } = options
    const logger = createInngestLogger('NotificationService', telegramId)

    logger.info(`Sending webhook`, { url })

    let lastError: Error | null = null

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), timeout)

        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(data),
          signal: controller.signal,
        })

        clearTimeout(timeoutId)

        if (response.ok) {
          logger.info(`Webhook sent successfully`, { url, attempt })
          return
        }

        const errorText = await response.text()
        lastError = new Error(`Webhook failed: ${response.status} - ${errorText}`)
        logger.warn(`Webhook attempt ${attempt} failed`, {
          url,
          status: response.status,
          error: errorText,
        })
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))
        logger.warn(`Webhook attempt ${attempt} failed`, { url, error })
      }

      if (attempt < retries) {
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt))
      }
    }

    logger.error(`Webhook failed after ${retries} attempts`, {
      url,
      error: lastError?.message,
    })
    throw lastError
  }

  /**
   * Send Telegram notification
   */
  async sendTelegramNotification(
    botToken: string,
    chatId: string,
    message: string,
    options: {
      telegramId?: string
      parseMode?: 'HTML' | 'Markdown'
    } = {}
  ): Promise<void> {
    const { telegramId, parseMode = 'HTML' } = options
    const logger = createInngestLogger('NotificationService', telegramId)

    logger.info(`Sending Telegram notification`, { chatId, parseMode })

    try {
      const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chat_id: chatId,
          text: message,
          parse_mode: parseMode,
        }),
      })

      if (!response.ok) {
        const errorText = await response.text()
        logger.error(`Telegram notification failed`, {
          status: response.status,
          error: errorText,
        })
        throw new Error(`Telegram notification failed: ${response.status}`)
      }

      logger.info(`Telegram notification sent successfully`)
    } catch (error) {
      logger.error(`Failed to send Telegram notification`, { error })
      throw error
    }
  }
}

/**
 * Create notification service instance
 */
export const notifications = new NotificationService()

// ===== CACHE SERVICES =====

/**
 * Simple in-memory cache (for production, use Redis)
 */
export class CacheService {
  private cache = new Map<string, { value: any; expiresAt: number }>()
  private logger = createInngestLogger('CacheService')

  /**
   * Set cache value
   */
  set(key: string, value: any, ttlSeconds: number = 300): void {
    const expiresAt = Date.now() + ttlSeconds * 1000
    this.cache.set(key, { value, expiresAt })
    this.logger.debug(`Cache set`, { key, ttlSeconds })
  }

  /**
   * Get cache value
   */
  get<T = any>(key: string): T | null {
    const entry = this.cache.get(key)

    if (!entry) {
      return null
    }

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key)
      this.logger.debug(`Cache expired`, { key })
      return null
    }

    this.logger.debug(`Cache hit`, { key })
    return entry.value as T
  }

  /**
   * Delete cache value
   */
  delete(key: string): boolean {
    const deleted = this.cache.delete(key)
    if (deleted) {
      this.logger.debug(`Cache deleted`, { key })
    }
    return deleted
  }

  /**
   * Clear all cache
   */
  clear(): void {
    this.cache.clear()
    this.logger.debug(`Cache cleared`)
  }
}

/**
 * Create cache service instance
 */
export const cache = new CacheService()

// ===== EVENT SERVICES =====

/**
 * Event service for sending Inngest events
 */
export class EventService {
  private logger = createInngestLogger('EventService')

  /**
   * Send Inngest event
   */
  async send(
    name: string,
    data: any,
    options: {
      telegramId?: string
    } = {}
  ): Promise<void> {
    const { telegramId } = options
    const logger = createInngestLogger('EventService', telegramId)

    logger.info(`Sending Inngest event`, { eventName: name })

    try {
      // Import Inngest client dynamically to avoid circular dependencies
      const { inngest } = await import('@/core/inngest/clients')

      await inngest.send({
        name,
        data,
      })

      logger.info(`Inngest event sent successfully`, { eventName: name })
    } catch (error) {
      logger.error(`Failed to send Inngest event`, { eventName: name, error })
      throw error
    }
  }
}

/**
 * Create event service instance
 */
export const events = new EventService()
