import { logger } from '@/utils/logger'
import { CACHE_CONFIG, CacheEntry, CacheMetrics } from '@/config/cache'

export class Cache<T> {
  private cache: Map<string, CacheEntry<T>>
  private metrics: CacheMetrics
  private cleanupTimer: NodeJS.Timeout | null

  constructor() {
    this.cache = new Map()
    this.metrics = {
      hits: 0,
      misses: 0,
      size: 0,
      cleanups: 0,
      lastCleanup: null
    }
    this.cleanupTimer = null
    this.startCleanupTimer()

    logger.info('🚀 Кэш инициализирован:', {
      description: 'Cache initialized',
      config: CACHE_CONFIG
    })
  }

  private startCleanupTimer(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer)
    }

    this.cleanupTimer = setInterval(() => {
      this.cleanup()
    }, CACHE_CONFIG.cleanupInterval)

    logger.info('⏰ Таймер очистки кэша запущен:', {
      description: 'Cache cleanup timer started',
      interval: CACHE_CONFIG.cleanupInterval
    })
  }

  public get(key: string): T | null {
    const entry = this.cache.get(key)

    if (!entry) {
      this.metrics.misses++
      logger.debug('🔍 Кэш промах:', {
        description: 'Cache miss',
        key,
        misses: this.metrics.misses
      })
      return null
    }

    const now = Date.now()
    if (now - entry.timestamp > CACHE_CONFIG.ttl) {
      this.cache.delete(key)
      this.metrics.misses++
      this.metrics.size = this.cache.size
      
      logger.debug('⌛ Кэш устарел:', {
        description: 'Cache entry expired',
        key,
        age: now - entry.timestamp
      })
      return null
    }

    entry.lastAccessed = now
    entry.accessCount++
    this.metrics.hits++

    logger.debug('✅ Кэш попадание:', {
      description: 'Cache hit',
      key,
      hits: this.metrics.hits,
      accessCount: entry.accessCount
    })

    return entry.value
  }

  public set(key: string, value: T): void {
    if (this.cache.size >= CACHE_CONFIG.maxSize) {
      this.enforceCleanup()
    }

    const now = Date.now()
    this.cache.set(key, {
      value,
      timestamp: now,
      lastAccessed: now,
      accessCount: 0
    })
    this.metrics.size = this.cache.size

    logger.debug('💾 Значение добавлено в кэш:', {
      description: 'Value added to cache',
      key,
      cacheSize: this.metrics.size
    })
  }

  public delete(key: string): void {
    const deleted = this.cache.delete(key)
    if (deleted) {
      this.metrics.size = this.cache.size
      logger.debug('🗑️ Значение удалено из кэша:', {
        description: 'Value deleted from cache',
        key,
        cacheSize: this.metrics.size
      })
    }
  }

  public clear(): void {
    this.cache.clear()
    this.metrics.size = 0
    this.metrics.cleanups++
    this.metrics.lastCleanup = Date.now()

    logger.info('🧹 Кэш очищен:', {
      description: 'Cache cleared',
      metrics: this.metrics
    })
  }

  private cleanup(): void {
    const now = Date.now()
    let deletedCount = 0

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > CACHE_CONFIG.ttl) {
        this.cache.delete(key)
        deletedCount++
      }
    }

    if (deletedCount > 0) {
      this.metrics.size = this.cache.size
      this.metrics.cleanups++
      this.metrics.lastCleanup = now

      logger.info('🧹 Выполнена очистка устаревших записей:', {
        description: 'Expired entries cleaned up',
        deletedCount,
        newSize: this.metrics.size
      })
    }
  }

  private enforceCleanup(): void {
    if (this.cache.size >= CACHE_CONFIG.maxSize * CACHE_CONFIG.cleanupThreshold) {
      const entries = Array.from(this.cache.entries())
        .sort((a, b) => {
          // Сортируем по последнему доступу и количеству обращений
          const accessScore = (entry: CacheEntry<T>) => 
            entry.lastAccessed + (entry.accessCount * 1000)
          return accessScore(a[1]) - accessScore(b[1])
        })
        .slice(0, CACHE_CONFIG.cleanupBatchSize)

      for (const [key] of entries) {
        this.cache.delete(key)
      }

      this.metrics.size = this.cache.size
      this.metrics.cleanups++
      this.metrics.lastCleanup = Date.now()

      logger.info('🧹 Выполнена принудительная очистка:', {
        description: 'Forced cleanup performed',
        deletedCount: CACHE_CONFIG.cleanupBatchSize,
        newSize: this.metrics.size
      })
    }
  }

  public getMetrics(): CacheMetrics {
    return { ...this.metrics }
  }

  public destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer)
      this.cleanupTimer = null
    }
    this.clear()
    
    logger.info('🛑 Кэш уничтожен:', {
      description: 'Cache destroyed',
      finalMetrics: this.metrics
    })
  }
} 