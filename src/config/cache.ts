import { Logger as logger } from '@/utils/logger'

export const CACHE_CONFIG = {
  // Максимальное количество элементов в кэше
  maxSize: 1000,
  
  // Время жизни кэша в миллисекундах (30 минут)
  ttl: 30 * 60 * 1000,
  
  // Интервал очистки устаревших записей (5 минут)
  cleanupInterval: 5 * 60 * 1000,
  
  // Порог для принудительной очистки кэша (90% от maxSize)
  cleanupThreshold: 0.9,
  
  // Количество элементов для удаления при достижении порога (10% от maxSize)
  cleanupBatchSize: 100,
}

// Проверяем корректность конфигурации
if (CACHE_CONFIG.cleanupThreshold >= 1 || CACHE_CONFIG.cleanupThreshold <= 0) {
  logger.error('❌ Некорректное значение cleanupThreshold:', {
    description: 'Invalid cleanupThreshold value',
    value: CACHE_CONFIG.cleanupThreshold
  })
  throw new Error('cleanupThreshold must be between 0 and 1')
}

if (CACHE_CONFIG.cleanupBatchSize >= CACHE_CONFIG.maxSize) {
  logger.error('❌ Некорректное значение cleanupBatchSize:', {
    description: 'Invalid cleanupBatchSize value',
    value: CACHE_CONFIG.cleanupBatchSize,
    maxSize: CACHE_CONFIG.maxSize
  })
  throw new Error('cleanupBatchSize must be less than maxSize')
}

export interface CacheMetrics {
  hits: number
  misses: number
  size: number
  cleanups: number
  lastCleanup: number | null
}

export interface CacheEntry<T> {
  value: T
  timestamp: number
  lastAccessed: number
  accessCount: number
} 